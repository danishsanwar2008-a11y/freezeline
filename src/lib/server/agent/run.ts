import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { rulePlan } from "@/lib/agentRules";
import { agentText } from "@/lib/pregenerated";
import { getClaude, MODELS } from "../claude";
import { URI_HOURS, type City } from "../cityState";
import { crewStatus } from "../outreachState";
import { ACTION_TOOLS, TOOL_DEFS, cityStatus, entryId, runTool, type ActionTool, type AgentCtx, type AgentMode, type LogEntry } from "./tools";

/** Max model turns per run (each turn can call several tools). */
export const MAX_STEPS = 10;

export interface PendingInput {
  tool: ActionTool;
  args: unknown;
  /** Stricter reserves chosen earlier in the run, so approval executes exactly what was previewed. */
  reserves: Record<string, number>;
}

export interface RunResult {
  time: string;
  mode: AgentMode;
  source: "claude" | "rules";
  entries: LogEntry[];
  usage: { calls: number; input_tokens: number; output_tokens: number; model: string | null };
}

const SYSTEM = `You are FreezeLine's operations agent for a water utility during a hard freeze. This is a replay of Winter Storm Uri over Houston (Feb 2021); the homes are simulated sample data.

A deterministic engine computes every risk level, drip plan and pressure. You never compute, estimate or change numbers yourself; you decide what to do with them and explain it.

Each run, for the current hour:
1. Read the situation (get_city_status).
2. Decide whether any area needs a stricter drip budget. Only consider it when an area's margin above 20 psi is thin. Check the what-if with get_zone_pressure first, and weigh that a stricter budget leaves some High homes without a drip.
3. Publish the drip plan (publish_drip_plan).
4. Queue text messages in priority order: High homes first, starting with the area with the smallest pressure margin, then Watch homes (queue_outreach).
5. Run the outreach (simulate_outreach): calls to homes that didn't reply and door checks for High homes that don't answer. Answers and calls are SAMPLE data until Phase 4.
6. Crews (get_crew_status, then propose_crew): crews go ONLY to homes whose call says they can't do the steps themselves, highest risk first, nearest free crew. Never more homes than free crews; the rest stay in the queue. Never say a crew is coming before propose_crew succeeds.
7. Log one short summary note (log_event).

Rules:
- Use only facts returned by your tools. Never invent homes, numbers, times or promises.
- Every action's reason is one plain sentence a city official understands in three seconds, citing the deciding number.
- If no home needs action this hour, say so and stop without publishing or queueing.
- Keep the run short: call several tools in one turn when they don't depend on each other.
- Finish with a one or two sentence summary for the official.`;

function actionEntry(tool: ActionTool, out: { status?: string; summary?: string }, args: Record<string, unknown>, ctx: AgentCtx): LogEntry {
  const pending = out.status === "awaiting_approval";
  return {
    id: entryId(),
    kind: "action",
    tool,
    summary: out.summary ?? tool,
    reason: args.reason as string | undefined,
    status: pending ? "pending" : "done",
    input: pending ? ({ tool, args, reserves: { ...ctx.reserves } } satisfies PendingInput) : undefined,
  };
}

/** Deterministic fallback: same tools, fixed priorities (see agentRules.ts). */
async function runRules(ctx: AgentCtx): Promise<void> {
  const status = cityStatus(ctx);
  const actions = rulePlan(
    status.areas.map((a) => ({ zone_id: a.zone_id, area: a.area, margin_above_20_psi: a.margin_above_20_psi, high_homes: a.high_homes })),
    { High: status.homes.High, Watch: status.homes.Watch },
  );
  if (actions.length === 0) {
    ctx.entries.push({ id: entryId(), kind: "note", summary: agentText("nothing_to_do"), status: "done" });
    return;
  }
  // Outreach + crews go before the closing log entry.
  const log = actions.pop()!;
  actions.push({ tool: "simulate_outreach", args: {}, reason: agentText("simulate_outreach") });
  const crews = await crewStatus(ctx);
  for (const p of crews.suggested) {
    const crew = crews.crews.find((c) => c.crew_id === p.crew_id)!;
    actions.push({ tool: "propose_crew", args: { home_id: p.home_id, crew_id: p.crew_id }, reason: agentText("propose_crew", { needs: p.why, crew: crew.name }) });
  }
  actions.push(log);
  for (const a of actions) {
    const args = { ...a.args, ...(a.tool === "log_event" ? {} : { reason: a.reason }) };
    try {
      const out = (await runTool(ctx, a.tool, args)) as { status?: string; summary?: string };
      const e = actionEntry(a.tool, out, args, ctx);
      e.reason = a.reason;
      ctx.entries.push(e);
    } catch (err) {
      ctx.entries.push({ id: entryId(), kind: "error", tool: a.tool, summary: err instanceof Error ? err.message : String(err), status: "failed" });
      if (a.tool === "publish_drip_plan") return; // nothing else can run without a plan
    }
  }
  if (crews.queue_length > 0)
    ctx.entries.push({ id: entryId(), kind: "note", summary: agentText("crew_queue", { queue: crews.queue_length.toLocaleString() }), status: "done" });
  ctx.entries.push({
    id: entryId(),
    kind: "note",
    summary: agentText("footer"),
    status: "done",
  });
}

async function runClaude(ctx: AgentCtx, claude: Anthropic, usage: RunResult["usage"]): Promise<void> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content:
        `The official clicked "Run agent" for ${ctx.time} (Houston time).` +
        (ctx.mode === "approve"
          ? " Approval mode: publish, queue and log calls return previews that the official approves one at a time. Treat them as planned and continue."
          : " Auto mode: your publish, queue and log calls take effect immediately."),
    },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await claude.beta.messages.create({
      model: MODELS.agent,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      tools: TOOL_DEFS,
      messages,
    });
    usage.calls++;
    usage.input_tokens += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
    usage.output_tokens += res.usage.output_tokens;
    messages.push({ role: "assistant", content: res.content }); // full content: thinking blocks must round-trip

    if (res.stop_reason === "refusal") {
      ctx.entries.push({ id: entryId(), kind: "error", summary: "The agent declined this request; nothing further was done.", status: "failed" });
      return;
    }
    const toolUses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      const text = res.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      if (text) ctx.entries.push({ id: entryId(), kind: "note", summary: text, status: "done" });
      return;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const isAction = (ACTION_TOOLS as string[]).includes(tu.name);
      try {
        const out = await runTool(ctx, tu.name, tu.input);
        if (isAction) {
          const args = tu.input as Record<string, unknown>;
          const e = actionEntry(tu.name as ActionTool, out as { status?: string; summary?: string }, args, ctx);
          if (tu.name === "log_event") e.reason = undefined;
          ctx.entries.push(e);
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isAction) ctx.entries.push({ id: entryId(), kind: "error", tool: tu.name as ActionTool, summary: msg, status: "failed" });
        results.push({ type: "tool_result", tool_use_id: tu.id, content: msg, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  ctx.entries.push({ id: entryId(), kind: "note", summary: `Stopped after ${MAX_STEPS} steps (the per-run cap).`, status: "done" });
}

export async function runAgent(city: City, hour: number, mode: AgentMode, origin: string): Promise<RunResult> {
  const ctx: AgentCtx = { city, hour, time: URI_HOURS[hour].time, mode, origin, reserves: {}, entries: [] };
  const usage: RunResult["usage"] = { calls: 0, input_tokens: 0, output_tokens: 0, model: null };
  const claude = getClaude();
  if (claude) {
    usage.model = MODELS.agent;
    try {
      await runClaude(ctx, claude, usage);
    } catch (err) {
      ctx.entries.push({
        id: entryId(),
        kind: "error",
        summary: `Claude call failed (${err instanceof Error ? err.message : String(err)}). Nothing else was done.`,
        status: "failed",
      });
    }
  } else {
    await runRules(ctx);
  }
  return { time: ctx.time, mode, source: claude ? "claude" : "rules", entries: ctx.entries, usage };
}

/** Execute one approved action (Approve mode). Inputs are re-validated by runTool. */
export async function executeApproved(city: City, hour: number, origin: string, pending: PendingInput): Promise<LogEntry> {
  const ctx: AgentCtx = { city, hour, time: URI_HOURS[hour].time, mode: "auto", origin, reserves: { ...pending.reserves }, entries: [] };
  const out = (await runTool(ctx, pending.tool, pending.args, true)) as { summary?: string };
  return { id: entryId(), kind: "action", tool: pending.tool, summary: out.summary ?? pending.tool, status: "done" };
}
