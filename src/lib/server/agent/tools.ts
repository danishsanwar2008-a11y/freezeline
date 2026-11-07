import "server-only";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { BOIL_WATER_PSI, MAX_RESERVE_PSI, MIN_RESERVE_PSI, clampReserve, type CityPlan } from "@/lib/planner";
import { compareFutures } from "@/lib/summary";
import { displayLevel } from "@/lib/steps";
import { fillLink, smsGroupKey, type SmsFacts } from "@/lib/messages";
import { getSupabaseAdmin } from "../supabaseAdmin";
import { smsDraft } from "../writer";
import { planAt, toTimestamp, URI_HOURS, type City } from "../cityState";

// ---------- shared types ----------

export type AgentMode = "auto" | "approve";
export type ActionTool = "publish_drip_plan" | "queue_outreach" | "log_event";
export const ACTION_TOOLS: ActionTool[] = ["publish_drip_plan", "queue_outreach", "log_event"];

export interface LogEntry {
  id: string;
  kind: "action" | "note" | "error";
  tool?: ActionTool;
  /** Deterministic, from tool results: what happened. */
  summary: string;
  /** The agent's one plain sentence: why. */
  reason?: string;
  status: "done" | "pending" | "failed";
  /** For pending actions: the validated input to execute on approval. */
  input?: unknown;
}

export interface AgentCtx {
  city: City;
  hour: number;
  time: string;
  mode: AgentMode;
  origin: string;
  /** Stricter reserves chosen this run (zone id -> psi). */
  reserves: Record<string, number>;
  entries: LogEntry[];
}

let seq = 0;
export const entryId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

const r1 = (n: number) => Math.round(n * 10) / 10;
const areaName = (c: City, zoneId: string) => c.zones.find((z) => z.id === zoneId)?.neighborhood ?? zoneId;
const zoneIds = (c: City) => c.zones.map((z) => z.id);

// ---------- input schemas (validated before any tool runs) ----------

const Reason = z.string().min(3).max(300);
/** "all" (or empty) means every area; mapped to null. */
const ZoneOrAll = z.string().transform((v) => (v === "all" || v === "" ? null : v));
export const Inputs = {
  get_city_status: z.object({}),
  get_zone_pressure: z.object({ zone_id: z.string(), reserve_psi: z.number().transform((v) => (v > 0 ? v : null)) }),
  get_homes_needing_action: z.object({
    zone_id: ZoneOrAll,
    level: z.enum(["High", "Watch", "any"]).transform((v) => (v === "any" ? null : v)),
    limit: z.number().int().min(1).max(50),
  }),
  publish_drip_plan: z.object({
    zone_reserves: z.array(z.object({ zone_id: z.string(), reserve_psi: z.number() })).max(10),
    reason: Reason,
  }),
  draft_homeowner_message: z.object({ home_id: z.string(), language: z.enum(["en", "es"]) }),
  queue_outreach: z.object({
    zone_id: ZoneOrAll,
    level: z.enum(["High", "Watch"]),
    limit: z.number().int().min(1).max(2000),
    reason: Reason,
  }),
  log_event: z.object({ message: z.string().min(3).max(300), zone_id: ZoneOrAll }),
} as const;
export type ToolName = keyof typeof Inputs;

// ---------- tool definitions for Claude (strict JSON schema) ----------

const obj = (properties: Record<string, unknown>) => ({
  type: "object" as const,
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const zoneOrAll = { type: "string", description: 'An area zone_id, or "all" for every area.' };
const reasonProp = { type: "string", description: "One plain sentence for a city official explaining why, using only numbers from tool results." };

export const TOOL_DEFS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_city_status",
    description:
      "Current replay hour: temperature, homes by level, and per area the FreezeLine plan pressure, the 'everyone drips' pressure, the margin above 20 psi, the drip budget and how many High homes it covers.",
    strict: true,
    input_schema: obj({}),
  },
  {
    name: "get_zone_pressure",
    description: `What-if for one area: pressures and drip budget if its reserve above 20 psi were reserve_psi (${MIN_RESERVE_PSI}-${MAX_RESERVE_PSI}). Pass 0 to see the current setting. Read-only.`,
    strict: true,
    input_schema: obj({ zone_id: { type: "string" }, reserve_psi: { type: "number", description: "Reserve to test, or 0 for the current setting." } }),
  },
  {
    name: "get_homes_needing_action",
    description: "Homes at Watch or High, highest risk first, with their planned action (drip which tap, or don't drip). Filter by area and level. Read-only.",
    strict: true,
    input_schema: obj({ zone_id: zoneOrAll, level: { type: "string", enum: ["High", "Watch", "any"] }, limit: { type: "integer", description: "1-50" } }),
  },
  {
    name: "publish_drip_plan",
    description: `Publish this hour's drip plan to the database. Optionally make some areas' drip budgets stricter by raising their reserve above 20 psi (${MIN_RESERVE_PSI}-${MAX_RESERVE_PSI}; default ${MIN_RESERVE_PSI}). Must run before queue_outreach.`,
    strict: true,
    input_schema: obj({
      zone_reserves: { type: "array", items: obj({ zone_id: { type: "string" }, reserve_psi: { type: "number" } }) },
      reason: reasonProp,
    }),
  },
  {
    name: "draft_homeowner_message",
    description: "Preview the text message one home would receive (written from its plan). Read-only; does not send.",
    strict: true,
    input_schema: obj({ home_id: { type: "string" }, language: { type: "string", enum: ["en", "es"] } }),
  },
  {
    name: "queue_outreach",
    description:
      "Queue text messages (status 'queued', simulated; not sent in this phase) to homes of one level, optionally in one area, highest risk first, up to limit. Homes already queued this hour are skipped. Call in priority order.",
    strict: true,
    input_schema: obj({ zone_id: zoneOrAll, level: { type: "string", enum: ["High", "Watch"] }, limit: { type: "integer", description: "1-2000" }, reason: reasonProp }),
  },
  {
    name: "log_event",
    description: "Write one short note to the event log for the operations team.",
    strict: true,
    input_schema: obj({ message: { type: "string" }, zone_id: zoneOrAll }),
  },
];

// ---------- read tools ----------

export function cityStatus(ctx: AgentCtx) {
  const { city, hour, reserves } = ctx;
  const plan = planAt(city, hour, reserves);
  const w = URI_HOURS[hour];
  const s = compareFutures(plan);
  const levels = { High: 0, Watch: 0, Low: 0 };
  for (const h of plan.homes) levels[displayLevel(h.level)]++;
  return {
    time: w.time,
    temperature_f: w.temperature_f,
    homes: { total: plan.homes.length, ...levels },
    homes_dripping_one_tap: plan.zones.reduce((a, z) => a + z.dripping, 0),
    everyone_drips: { areas_below_20_psi: s.blanketFail, of: s.n },
    freezeline_plan: { areas_below_20_psi: s.planFail, lowest_psi: r1(s.lowestPlan) },
    areas: plan.zones.map((z) => zoneFacts(z)),
  };
}

function zoneFacts(z: CityPlan["zones"][number]) {
  return {
    zone_id: z.zoneId,
    area: z.neighborhood,
    plan_psi: r1(z.pressurePlan),
    everyone_drips_psi: r1(z.pressureBlanket),
    margin_above_20_psi: r1(z.pressurePlan - BOIL_WATER_PSI),
    reserve_psi: z.reservePsi,
    drip_budget_homes: z.dripBudget,
    high_homes: z.high,
    high_homes_dripping: z.dripping,
    high_homes_without_drip: z.uncoveredHigh,
  };
}

export function zonePressure(ctx: AgentCtx, input: z.output<typeof Inputs.get_zone_pressure>) {
  if (!zoneIds(ctx.city).includes(input.zone_id)) throw new Error(`Unknown zone_id. Valid: ${zoneIds(ctx.city).join(", ")}`);
  const reserves = { ...ctx.reserves };
  if (input.reserve_psi !== null) reserves[input.zone_id] = clampReserve(input.reserve_psi);
  const z = planAt(ctx.city, ctx.hour, reserves).zones.find((x) => x.zoneId === input.zone_id)!;
  return { what_if: input.reserve_psi !== null, ...zoneFacts(z) };
}

function candidates(ctx: AgentCtx, plan: CityPlan, zoneId: string | null, level: "High" | "Watch" | null) {
  const { city } = ctx;
  return plan.homes
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => p.level !== "Low" && (!zoneId || city.homes[i].zone_id === zoneId) && (!level || displayLevel(p.level) === level))
    .sort((a, b) => b.p.score - a.p.score || a.i - b.i);
}

export function homesNeedingAction(ctx: AgentCtx, input: z.output<typeof Inputs.get_homes_needing_action>) {
  if (input.zone_id && !zoneIds(ctx.city).includes(input.zone_id)) throw new Error("Unknown zone_id");
  const plan = planAt(ctx.city, ctx.hour, ctx.reserves);
  const list = candidates(ctx, plan, input.zone_id, input.level);
  return {
    total_matching: list.length,
    homes: list.slice(0, input.limit).map(({ p, i }, rank) => ({
      home_id: ctx.city.homes[i].id,
      area: ctx.city.homes[i].neighborhood,
      level: displayLevel(p.level),
      action: p.action === "drip" ? `drip ${p.faucet} tap` : "don't drip",
      high_without_drip: p.uncovered,
      priority: rank + 1,
    })),
  };
}

const homeUrl = (ctx: Pick<AgentCtx, "origin" | "time">, homeId: string) => `${ctx.origin}/h/${homeId}?t=${ctx.time}`;

function factsFor(plan: CityPlan, i: number): SmsFacts {
  const p = plan.homes[i];
  return { level: displayLevel(p.level), action: p.action, faucet: p.faucet, uncovered: p.uncovered };
}

export async function draftMessage(ctx: AgentCtx, input: z.output<typeof Inputs.draft_homeowner_message>) {
  const i = ctx.city.byId.get(input.home_id);
  if (i === undefined) throw new Error("Unknown home_id");
  const plan = planAt(ctx.city, ctx.hour, ctx.reserves);
  if (plan.homes[i].level === "Low") return { home_id: input.home_id, note: "This home is Low risk and gets no message." };
  const { text, source } = await smsDraft(factsFor(plan, i), input.language);
  return { home_id: input.home_id, sms: fillLink(text, homeUrl(ctx, input.home_id)), written_by: source };
}

// ---------- action tools (preview in Approve mode, execute in Auto / on approval) ----------

function requireDb() {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing on the server, so nothing can be written.");
  return db;
}

function reservesFrom(ctx: AgentCtx, list: { zone_id: string; reserve_psi: number }[]) {
  const reserves: Record<string, number> = {};
  for (const r of list) {
    if (!zoneIds(ctx.city).includes(r.zone_id)) throw new Error(`Unknown zone_id ${r.zone_id}`);
    reserves[r.zone_id] = clampReserve(r.reserve_psi);
  }
  return reserves;
}

function publishSummary(ctx: AgentCtx, plan: CityPlan, reserves: Record<string, number>, done: boolean) {
  const s = compareFutures(plan);
  const dripping = plan.zones.reduce((a, z) => a + z.dripping, 0);
  const stricter = Object.entries(reserves)
    .filter(([, psi]) => psi > MIN_RESERVE_PSI)
    .map(([id, psi]) => `${areaName(ctx.city, id)} reserve raised to ${psi} psi`);
  return (
    `${done ? "Published" : "Publish"} the drip plan: ${dripping.toLocaleString()} homes drip one tap, ` +
    (s.planFail === 0 ? `all ${s.n} areas stay safe (lowest ${Math.round(s.lowestPlan)} psi)` : `${s.planFail} of ${s.n} areas below 20 psi`) +
    (stricter.length ? `; ${stricter.join(", ")}` : "") +
    "."
  );
}

export async function publishDripPlan(ctx: AgentCtx, input: z.output<typeof Inputs.publish_drip_plan>, execute: boolean) {
  const reserves = { ...ctx.reserves, ...reservesFrom(ctx, input.zone_reserves) };
  const plan = planAt(ctx.city, ctx.hour, reserves);
  ctx.reserves = reserves; // later tools in this run see the published budgets
  if (!execute) return { status: "awaiting_approval", summary: publishSummary(ctx, plan, reserves, false) };
  const summary = publishSummary(ctx, plan, reserves, true);

  const db = requireDb();
  const planFor = toTimestamp(ctx.time);
  const rows = plan.homes
    .map((p, i) => ({ p, h: ctx.city.homes[i] }))
    .filter(({ p }) => p.level !== "Low")
    .map(({ p, h }) => ({
      home_id: h.id,
      zone_id: h.zone_id,
      plan_for: planFor,
      action: p.action === "drip" ? "drip" : "do_not_drip",
      faucet: p.faucet,
      reason: `${displayLevel(p.level)} risk${p.uncovered ? "; area drip budget reached" : ""}`,
      created_by: "agent",
      simulated: true,
    }));
  for (let k = 0; k < rows.length; k += 500) {
    const { error } = await db.from("drip_plans").upsert(rows.slice(k, k + 500), { onConflict: "home_id,plan_for" });
    if (error) throw new Error(`drip_plans: ${error.message}${/unique|constraint/i.test(error.message) ? " (run supabase/002_phase3.sql)" : ""}`);
  }
  await logRow(ctx, "plan_published", summary, null, { reserves });
  return { status: "done", summary, rows_written: rows.length };
}

async function loadPublished(ctx: AgentCtx) {
  const db = requireDb();
  const planFor = toTimestamp(ctx.time);
  const out = new Map<string, { id: string; action: string; faucet: string | null }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("drip_plans").select("id,home_id,action,faucet").eq("plan_for", planFor).order("home_id").range(from, from + 999);
    if (error) throw new Error(`drip_plans: ${error.message}`);
    for (const r of data ?? []) out.set(r.home_id, { id: r.id, action: r.action, faucet: r.faucet });
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function queueOutreach(ctx: AgentCtx, input: z.output<typeof Inputs.queue_outreach>, execute: boolean) {
  if (input.zone_id && !zoneIds(ctx.city).includes(input.zone_id)) throw new Error("Unknown zone_id");
  const plan = planAt(ctx.city, ctx.hour, ctx.reserves);
  const where = input.zone_id ? ` in ${areaName(ctx.city, input.zone_id)}` : "";
  const picked = candidates(ctx, plan, input.zone_id, input.level).slice(0, input.limit);

  if (!execute) {
    return { status: "awaiting_approval", summary: `Text ${picked.length.toLocaleString()} ${input.level} homes${where} (simulated, queued).` };
  }

  const published = await loadPublished(ctx);
  if (published.size === 0) throw new Error("No drip plan is published for this hour yet. Publish it first.");
  const db = requireDb();
  const planFor = toTimestamp(ctx.time);

  // Draft once per group of homes with the same facts, then fill each home's link.
  const drafts = new Map<string, string>();
  const rows = [];
  for (const { i } of picked) {
    const h = ctx.city.homes[i];
    const pub = published.get(h.id);
    if (!pub) continue;
    const facts: SmsFacts = {
      level: displayLevel(plan.homes[i].level),
      action: pub.action === "drip" ? "drip" : "no_drip",
      faucet: pub.faucet,
      uncovered: plan.homes[i].uncovered,
    };
    const key = smsGroupKey(facts);
    if (!drafts.has(key)) drafts.set(key, (await smsDraft(facts)).text);
    rows.push({
      home_id: h.id,
      drip_plan_id: pub.id,
      plan_for: planFor,
      channel: "sms",
      to_number: null,
      message: fillLink(drafts.get(key)!, homeUrl(ctx, h.id)),
      status: "queued",
      simulated: true,
    });
  }

  let queued = 0;
  for (let k = 0; k < rows.length; k += 500) {
    const { data, error } = await db
      .from("outreach")
      .upsert(rows.slice(k, k + 500), { onConflict: "home_id,plan_for,channel", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`outreach: ${error.message}${/plan_for|constraint/i.test(error.message) ? " (run supabase/002_phase3.sql)" : ""}`);
    queued += data?.length ?? 0;
  }
  const skipped = rows.length - queued;
  const summary = `Queued texts to ${queued.toLocaleString()} ${input.level} homes${where} (simulated)${skipped ? `; ${skipped} already queued` : ""}.`;
  await logRow(ctx, "outreach_queued", summary, input.zone_id, { level: input.level, queued, skipped });
  return { status: "done", summary, queued, already_queued: skipped, message_groups: drafts.size };
}

async function logRow(ctx: AgentCtx, type: string, message: string, zoneId: string | null, extra: Record<string, unknown> = {}) {
  const db = getSupabaseAdmin();
  if (!db) return;
  await db.from("events").insert({
    type,
    zone_id: zoneId,
    occurred_at: toTimestamp(ctx.time),
    payload: { message, by: "agent", ...extra },
    simulated: true,
  });
}

export async function logEvent(ctx: AgentCtx, input: z.output<typeof Inputs.log_event>, execute: boolean) {
  if (input.zone_id && !zoneIds(ctx.city).includes(input.zone_id)) throw new Error("Unknown zone_id");
  if (!execute) return { status: "awaiting_approval", summary: `Log: ${input.message}` };
  requireDb();
  await logRow(ctx, "agent_note", input.message, input.zone_id);
  return { status: "done", summary: `Logged: ${input.message}` };
}

// ---------- dispatcher ----------

/** Run one tool. Action tools execute in Auto mode and only preview in Approve mode. */
export async function runTool(ctx: AgentCtx, name: string, raw: unknown, forceExecute = false) {
  if (!(name in Inputs)) throw new Error(`Unknown tool ${name}`);
  const input = Inputs[name as ToolName].parse(raw);
  const execute = forceExecute || ctx.mode === "auto";
  switch (name as ToolName) {
    case "get_city_status":
      return cityStatus(ctx);
    case "get_zone_pressure":
      return zonePressure(ctx, input as z.output<typeof Inputs.get_zone_pressure>);
    case "get_homes_needing_action":
      return homesNeedingAction(ctx, input as z.output<typeof Inputs.get_homes_needing_action>);
    case "draft_homeowner_message":
      return draftMessage(ctx, input as z.output<typeof Inputs.draft_homeowner_message>);
    case "publish_drip_plan":
      return publishDripPlan(ctx, input as z.output<typeof Inputs.publish_drip_plan>, execute);
    case "queue_outreach":
      return queueOutreach(ctx, input as z.output<typeof Inputs.queue_outreach>, execute);
    case "log_event":
      return logEvent(ctx, input as z.output<typeof Inputs.log_event>, execute);
  }
}
