import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { rulePlan } from "@/lib/agentRules";
import { agentText } from "@/lib/pregenerated";
import { getClaude, MODELS } from "../claude";
import { URI_HOURS, type City } from "../cityState";
import { crewStatus, queuedTextIds } from "../outreachState";
import { stage2Reason, stage2Sentence } from "@/lib/pressure";
import { formatHour } from "@/components/console/format";
import { ZodError } from "zod";
import { placeDemoCall } from "../demoCall";
import type { DemoCaller } from "@/lib/demoCaller";
import { monitorAt, planAt, toTimestamp } from "../cityState";
import { ACTION_TOOLS, TOOL_DEFS, cityStatus, entryId, runTool, type ActionTool, type AgentCtx, type AgentMode, type LogEntry, type TraceEvent } from "./tools";
import { alsoNotified } from "@/lib/agentNotify";
import { plural } from "@/lib/plural";

/** Add an entry to the run's log and stream it to the decision trace. */
function emit(ctx: AgentCtx, e: LogEntry) {
  ctx.entries.push(e);
  ctx.onEvent?.({ type: "entry", entry: e });
}

/** What the trace shows while a tool is running (replaced by its entry when it finishes). */
const RUNNING: Record<string, string> = {
  publish_drip_plan: "Publishing the drip plan",
  queue_outreach: "Queuing texts",
  simulate_outreach: "Calling homes that didn’t reply",
  propose_crew: "Assigning a crew",
  log_event: "Writing the operations log",
  get_city_status: "Reading the storm and risk",
  get_zone_pressure: "Reading an area’s pressure",
  get_homes_needing_action: "Listing homes that need action",
  get_crew_status: "Checking crews",
  draft_homeowner_message: "Drafting a text",
};
const starting = (ctx: AgentCtx, tool: string) => ctx.onEvent?.({ type: "start", label: RUNNING[tool] ?? tool.replace(/_/g, " ") });

/** A read step with its result (what the agent looked at and what it found). */
const readStep = (ctx: AgentCtx, summary: string, result: string) => emit(ctx, { id: entryId(), kind: "step", summary, result, status: "done" });

function readStorm(ctx: AgentCtx) {
  const st = cityStatus(ctx);
  readStep(ctx, "Read the storm and risk", `${Math.round(st.temperature_f)}°F · ${plural(st.homes.High, "High home")}, ${plural(st.homes.Watch, "Watch home")}`);
  const areas = monitorAt(ctx.city, ctx.hour);
  const low = areas.reduce((a, b) => (b.lowest.psi < a.lowest.psi ? b : a), areas[0]);
  if (low) readStep(ctx, `Read pressure in ${plural(areas.length, "area")}`, `lowest ${low.lowest.psi.toFixed(1)} psi · ${low.area}`);
  return st;
}

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
6. Crews (get_crew_status, then propose_crew): crews go ONLY to homes whose call says they can't do the steps themselves, highest risk first, nearest free crew in the home's own area (crews never leave their area). Never more homes than free crews; the rest stay in their area's queue. Never say a crew is coming before propose_crew succeeds.
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
/** Plain-sentence error for the log (never raw validation JSON). */
export function readableError(tool: string, err: unknown): string {
  if (err instanceof ZodError) return `${tool.replace(/_/g, " ")} didn't run: ${err.issues.map((i) => `${i.path.join(".") || "input"} ${i.message.toLowerCase()}`).join("; ")}.`;
  return err instanceof Error ? err.message : String(err);
}

/** "Drip plan published; N High and M Watch homes queued for texts." from the saved rows. */
async function actualQueuedSummary(ctx: AgentCtx): Promise<string> {
  const ids = await queuedTextIds(toTimestamp(ctx.time)).catch(() => new Set<string>());
  const plan = planAt(ctx.city, ctx.hour, ctx.reserves);
  let high = 0, watch = 0;
  ctx.city.homes.forEach((h, i) => {
    if (!ids.has(h.id)) return;
    if (plan.homes[i].level === "High") high++;
    else if (plan.homes[i].level === "Medium") watch++;
  });
  return agentText("log_summary", { high: high.toLocaleString(), watch: watch.toLocaleString() });
}

async function runRules(ctx: AgentCtx): Promise<{ texted: number }> {
  const status = readStorm(ctx);
  const actions = rulePlan(
    status.areas.map((a) => ({ zone_id: a.zone_id, area: a.area, margin_above_20_psi: a.margin_above_20_psi, high_homes: a.high_homes })),
    { High: status.homes.High, Watch: status.homes.Watch },
  );
  if (actions.length === 0) {
    emit(ctx, { id: entryId(), kind: "note", summary: agentText("nothing_to_do"), status: "done" });
    return { texted: 0 };
  }
  // Outreach + crews go before the closing log entry.
  const log = actions.pop()!;
  actions.push({ tool: "simulate_outreach", args: {}, reason: agentText("simulate_outreach") });
  ctx.onEvent?.({ type: "start", label: "Checking crews" });
  const crews = await crewStatus(ctx);
  const free = crews.crews.filter((c) => !c.busy).length;
  readStep(ctx, "Checked crews", `${free} of ${plural(crews.crews.length, "crew")} free · ${plural(crews.suggested.length + crews.queue_length, "home")} need a crew`);
  for (const p of crews.suggested) {
    const crew = crews.crews.find((c) => c.crew_id === p.crew_id)!;
    actions.push({ tool: "propose_crew", args: { home_id: p.home_id, crew_id: p.crew_id }, reason: agentText("propose_crew", { needs: p.why, crew: crew.name }) });
  }
  actions.push(log);
  const stage2 = monitorAt(ctx.city, ctx.hour).filter((a) => a.stage2).length;
  // Steps: 2 reads + the crews check + every action + the replies read (Auto) + any Stage 2 alert.
  // (+1 for the demo call, when this laptop has one set up.)
  const demo = process.env.DEMO_CALL_TO?.trim() ? 1 : 0;
  ctx.onEvent?.({ type: "plan", total: 3 + actions.length + (ctx.mode === "auto" ? 1 : 0) + stage2 + demo });
  let texted = 0;
  for (const a of actions) {
    starting(ctx, a.tool);
    // The log reports what was actually queued (in Auto mode, earlier steps have already run).
    if (a.tool === "log_event" && ctx.mode === "auto") a.args = { ...a.args, message: await actualQueuedSummary(ctx) };
    const args = { ...a.args, ...(a.tool === "log_event" ? {} : { reason: a.reason }) };
    try {
      const out = (await runTool(ctx, a.tool, args)) as {
        status?: string;
        summary?: string;
        funnel?: { texted: number; status: Record<string, number> };
      };
      const e = actionEntry(a.tool, out, args, ctx);
      e.reason = a.reason;
      emit(ctx, e);
      if (a.tool === "simulate_outreach" && out.status === "done" && out.funnel) {
        texted = out.funnel.texted;
        const st = out.funnel.status;
        readStep(
          ctx,
          "Read replies from households",
          `${(st.ready ?? 0).toLocaleString("en-US")} ready · ${(st.needs_help ?? 0).toLocaleString("en-US")} need help · ${(st.no_answer ?? 0).toLocaleString("en-US")} no answer`,
        );
      }
    } catch (err) {
      emit(ctx, { id: entryId(), kind: "error", tool: a.tool, summary: readableError(a.tool, err), status: "failed" });
      if (a.tool === "publish_drip_plan") return { texted }; // nothing else can run without a plan
    }
  }
  if (crews.queue_length > 0)
    emit(ctx, { id: entryId(), kind: "note", summary: agentText("crew_queue", { queue: crews.queue_length.toLocaleString() }), status: "done" });
  emit(ctx, {
    id: entryId(),
    kind: "note",
    summary: agentText("footer"),
    status: "done",
  });
  return { texted };
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
      emit(ctx, { id: entryId(), kind: "error", summary: "The agent declined this request; nothing further was done.", status: "failed" });
      return;
    }
    const toolUses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      const text = res.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      if (text) emit(ctx, { id: entryId(), kind: "note", summary: text, status: "done" });
      return;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const isAction = (ACTION_TOOLS as string[]).includes(tu.name);
      starting(ctx, tu.name);
      try {
        const out = await runTool(ctx, tu.name, tu.input);
        if (tu.name === "get_city_status") readStorm(ctx);
        if (tu.name === "get_crew_status") {
          const c = out as { crews: { busy: boolean }[]; suggested: unknown[]; queue_length: number };
          readStep(ctx, "Checked crews", `${c.crews.filter((x) => !x.busy).length} of ${plural(c.crews.length, "crew")} free · ${plural(c.suggested.length + c.queue_length, "home")} need a crew`);
        }
        if (isAction) {
          const args = tu.input as Record<string, unknown>;
          const e = actionEntry(tu.name as ActionTool, out as { status?: string; summary?: string }, args, ctx);
          if (tu.name === "log_event") e.reason = undefined;
          emit(ctx, e);
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
      } catch (err) {
        const msg = readableError(tu.name, err);
        if (isAction) emit(ctx, { id: entryId(), kind: "error", tool: tu.name as ActionTool, summary: msg, status: "failed" });
        results.push({ type: "tool_result", tool_use_id: tu.id, content: msg, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  emit(ctx, { id: entryId(), kind: "note", summary: `Stopped after ${MAX_STEPS} steps (the per-run cap).`, status: "done" });
}

export async function runAgent(
  city: City,
  hour: number,
  mode: AgentMode,
  origin: string,
  onEvent?: (e: TraceEvent) => void,
  /** Who the demo call rings (the clicker's sign-up; src/lib/server/signupCookie.ts). Unset: the team's DEMO_CALL_TO, if any. */
  caller?: DemoCaller,
): Promise<RunResult> {
  const ctx: AgentCtx = { city, hour, time: URI_HOURS[hour].time, mode, origin, reserves: {}, entries: [], onEvent, caller };
  // The demo call starts the moment Run agent is clicked, alongside the rest of the run (planning
  // and saving outreach for thousands of homes takes ~20 s); its trace step is added at the end.
  const demoCall = startDemoCall(ctx);
  let texted = 0;
  const usage: RunResult["usage"] = { calls: 0, input_tokens: 0, output_tokens: 0, model: null };
  const claude = getClaude();
  if (claude) {
    usage.model = MODELS.agent;
    try {
      await runClaude(ctx, claude, usage);
    } catch (err) {
      emit(ctx, {
        id: entryId(),
        kind: "error",
        summary: `Claude call failed (${err instanceof Error ? err.message : String(err)}). Nothing else was done.`,
        status: "failed",
      });
    }
  } else {
    texted = (await runRules(ctx)).texted;
  }
  proposeStage2(ctx);
  await notifyOthers(ctx, texted);
  await demoCallStep(ctx, demoCall);
  return { time: ctx.time, mode, source: claude ? "claude" : "rules", entries: ctx.entries, usage };
}

/**
 * A real demo call to the person who clicked Run agent (their /register sign-up), or on the team's
 * own machine to DEMO_CALL_TO, standing in for the highest-risk home this hour, placed as soon as
 * the run starts so the phone rings right away. No sign-up on the hosted site: the trace asks for one. Its answers arrive from the
 * voice agent and are saved in Supabase (voice_calls); officials see them on /console/calls. Off
 * (null) unless .env.local configures it. Never throws: a failure becomes the step's outcome.
 */
function startDemoCall(ctx: AgentCtx): Promise<Awaited<ReturnType<typeof placeDemoCall>>> | null {
  const owner = process.env.DEMO_CALL_TO?.trim();
  const caller: DemoCaller | null =
    ctx.caller ?? (owner ? { kind: "owner", to: owner, firstName: process.env.DEMO_CALL_NAME?.trim() ?? "" } : null);
  if (!caller) return null; // no caller and no team phone set up: say nothing
  return placeDemoCall(ctx.city, ctx.hour, ctx.time, caller).catch((err: unknown) => ({
    kind: "failed" as const,
    reason: `Demo call not placed: ${err instanceof Error ? err.message : String(err)}`,
  }));
}

/** Last trace step: how the demo call (started with the run) went. */
async function demoCallStep(ctx: AgentCtx, call: ReturnType<typeof startDemoCall>): Promise<void> {
  if (!call) return;
  ctx.onEvent?.({ type: "start", label: "Placing the demo call" });
  const out = await call;
  if (out.kind === "placed")
    readStep(
      ctx,
      `Demo call placed: ${out.whose === "signup" ? "the signed-up phone" : "the demo phone"} stands in for the ${out.street} home`,
      `${out.phone} · answers on the Calls page`,
    );
  else if (out.kind === "needs_signup")
    emit(ctx, {
      id: entryId(),
      kind: "step",
      summary: "Demo call needs a sign-up: sign up with a phone number, then run the agent again to get the call.",
      result: "no call",
      status: "done",
      href: "/register?next=/console",
      linkText: "Sign up for the demo call",
    });
  else if (out.kind === "skipped") readStep(ctx, out.reason, "skipped");
  else emit(ctx, { id: entryId(), kind: "error", summary: out.reason, status: "failed" });
}

/** Execute one approved action (Approve mode). Inputs are re-validated by runTool. */
export async function executeApproved(city: City, hour: number, origin: string, pending: PendingInput): Promise<LogEntry> {
  const ctx: AgentCtx = { city, hour, time: URI_HOURS[hour].time, mode: "auto", origin, reserves: { ...pending.reserves }, entries: [] };
  const out = (await runTool(ctx, pending.tool, pending.args, true)) as { summary?: string };
  return { id: entryId(), kind: "action", tool: pending.tool, summary: out.summary ?? pending.tool, status: "done" };
}

/**
 * Stage 2 alerts come from the deterministic pressure monitor (the same equation as the console panel).
 * They are ALWAYS pending, in Auto mode too: a supervisor approves every Stage 2 alert.
 */
export function proposeStage2(ctx: AgentCtx): void {
  for (const a of monitorAt(ctx.city, ctx.hour)) {
    if (!a.stage2) continue;
    const args = { zone_id: a.zoneId, reason: stage2Reason(a.stage2, formatHour(URI_HOURS[a.stage2.worstHour].time)) };
    emit(ctx, {
      id: entryId(),
      kind: "action",
      tool: "send_stage2_alert",
      summary: `Stage 2 alert ready · needs supervisor approval. ${stage2Sentence(a.stage2)}.`,
      reason: args.reason,
      status: "pending",
      input: { tool: "send_stage2_alert", args, reserves: {} } satisfies PendingInput,
    });
  }
}

/**
 * "Also notified" (simulated, display only): who else the agent would reach, from this run's numbers.
 * Nothing is sent; the trace tags every line "simulated · nothing is sent".
 */
async function notifyOthers(ctx: AgentCtx, textedThisRun: number): Promise<void> {
  const st = cityStatus(ctx);
  const areas = monitorAt(ctx.city, ctx.hour);
  const low = areas.reduce((a, b) => (b.lowest.psi < a.lowest.psi ? b : a), areas[0]);
  const crewsSent = ctx.entries.filter((e) => e.tool === "propose_crew" && e.status !== "failed").length;
  const queue = await crewStatus(ctx)
    .then((c) => c.queue_length)
    .catch(() => 0);
  const queued = ctx.mode === "auto" && !textedThisRun ? (await queuedTextIds(toTimestamp(ctx.time)).catch(() => new Set<string>())).size : 0;
  const notices = alsoNotified({
    needAction: st.homes.High + st.homes.Watch,
    high: st.homes.High,
    texted: ctx.mode === "auto" ? textedThisRun || queued : 0,
    crewsSent,
    crewQueue: queue,
    lowestArea: low?.area ?? null,
    lowestPsi: low ? low.lowest.psi : null,
    stage2Pending: ctx.entries.some((e) => e.tool === "send_stage2_alert" && e.status === "pending"),
  });
  for (const n of notices) emit(ctx, { id: entryId(), kind: "notify", party: n.party, summary: n.message, status: "done" });
}
