import "server-only";
import { z } from "zod";
import {
  assess,
  nearestNeighbors,
  outreachSummary,
  proposeCrews,
  simulateOutreach,
  type Assessment,
  type CallAnswers,
  type Confidence,
  type Contact,
  type Crew,
  type HomeAssessment,
  type HomeOutreach,
  type ReasonFactor,
} from "@/lib/household";
import { assessmentSentence, needsList } from "@/lib/cityWording";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { planAt, toTimestamp, type City } from "./cityState";
import type { AgentCtx } from "./agent/tools";

/** Sample crews if the crews table isn't there yet (same rows as 003_phase35.sql). */
export const DEFAULT_CREWS: Crew[] = [
  { id: 1, name: "Crew 1", depot_lat: 29.7925, depot_lng: -95.4005 },
  { id: 2, name: "Crew 2", depot_lat: 29.738, depot_lng: -95.379 },
  { id: 3, name: "Crew 3", depot_lat: 29.702, depot_lng: -95.44 },
];

const neighborCache = new WeakMap<City, (string | null)[]>();
function neighborsOf(city: City) {
  let n = neighborCache.get(city);
  if (!n) neighborCache.set(city, (n = nearestNeighbors(city.homes)));
  return n;
}

/** The deterministic (sample) outreach result for an hour, before anything is saved. */
export function simulateHour(ctx: Pick<AgentCtx, "city" | "hour" | "reserves">) {
  const plan = planAt(ctx.city, ctx.hour, ctx.reserves);
  const outreach = simulateOutreach(ctx.city.homes, plan, neighborsOf(ctx.city));
  const assessments = outreach.map(assess);
  return { plan, outreach, assessments, summary: outreachSummary(outreach, assessments) };
}

function db() {
  const d = getSupabaseAdmin();
  if (!d) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing on the server, so nothing can be written.");
  return d;
}
const tableHint = (msg: string) => (/household_calls|crew|relation|constraint|column/i.test(msg) ? " (run supabase/003_phase35.sql)" : "");

// ---------- records saved per hour ----------

export interface CallRecord {
  home_id: string;
  contact: Contact;
  answers: Partial<CallAnswers> & { replied_text?: boolean; answered_call?: boolean; door_check?: boolean };
  assessment: Assessment;
  reason_key: string;
  confidence: Confidence;
  flagged_by: string | null;
}

export interface CrewAssignment {
  crew_id: number | null;
  home_id: string;
  status: "proposed" | "assigned";
  reason: string;
  created_at: string;
}

export async function getCrews(): Promise<Crew[]> {
  const d = getSupabaseAdmin();
  if (!d) return DEFAULT_CREWS;
  const { data, error } = await d.from("crews").select("id,name,depot_lat,depot_lng").order("id");
  return error || !data?.length ? DEFAULT_CREWS : (data as Crew[]);
}

/** Saved call records and crew assignments for one storm hour (empty until the agent runs outreach). */
export async function loadHourRecords(time: string): Promise<{ calls: Map<string, CallRecord>; assignments: CrewAssignment[]; available: boolean }> {
  const d = getSupabaseAdmin();
  const calls = new Map<string, CallRecord>();
  if (!d) return { calls, assignments: [], available: false };
  const planFor = toTimestamp(time);
  for (let from = 0; ; from += 1000) {
    const { data, error } = await d
      .from("household_calls")
      .select("home_id,contact,answers,assessment,reason_key,confidence,flagged_by")
      .eq("plan_for", planFor)
      .order("home_id")
      .range(from, from + 999);
    if (error) return { calls, assignments: [], available: false };
    for (const r of data ?? []) calls.set(r.home_id, r as CallRecord);
    if (!data || data.length < 1000) break;
  }
  const { data: a } = await d.from("crew_assignments").select("crew_id,home_id,status,reason,created_at").eq("plan_for", planFor).order("created_at");
  return { calls, assignments: (a ?? []) as CrewAssignment[], available: true };
}

/** One home's saved call record + crew assignment (homeowner page reads only this). */
export async function loadHomeRecord(homeId: string, time: string): Promise<{ call: CallRecord | null; assignment: CrewAssignment | null; crewName: string | null }> {
  const d = getSupabaseAdmin();
  if (!d) return { call: null, assignment: null, crewName: null };
  const planFor = toTimestamp(time);
  const [{ data: call }, { data: asg }] = await Promise.all([
    d.from("household_calls").select("home_id,contact,answers,assessment,reason_key,confidence,flagged_by").eq("home_id", homeId).eq("plan_for", planFor).maybeSingle(),
    d.from("crew_assignments").select("crew_id,home_id,status,reason,created_at").eq("home_id", homeId).eq("plan_for", planFor).maybeSingle(),
  ]);
  const crewName = asg?.crew_id ? ((await getCrews()).find((c) => c.id === asg.crew_id)?.name ?? null) : null;
  return { call: (call as CallRecord) ?? null, assignment: (asg as CrewAssignment) ?? null, crewName };
}

// ---------- agent tools ----------

export const OutreachInputs = {
  simulate_outreach: z.object({ reason: z.string().min(3).max(300) }),
  get_crew_status: z.object({}),
  propose_crew: z.object({ home_id: z.string(), crew_id: z.number().int(), reason: z.string().min(3).max(300) }),
};

function toRecord(homeId: string, o: HomeOutreach, a: HomeAssessment): CallRecord {
  return {
    home_id: homeId,
    contact: o.contact,
    answers: { ...(o.answers ?? {}), replied_text: o.replied_text, answered_call: o.answered_call, door_check: o.door_check },
    assessment: a.assessment,
    reason_key: a.reasons.join(","),
    confidence: a.confidence,
    flagged_by: o.flagged_by,
  };
}

function funnelSentence(s: ReturnType<typeof outreachSummary>) {
  return `${s.texted.toLocaleString()} texted, ${s.called.toLocaleString()} called, ${s.doorChecks.toLocaleString()} door checks; ${s.status.ready.toLocaleString()} ready, ${s.status.needs_help.toLocaleString()} need help (sample)`;
}

/** Texts -> calls -> door checks (sample), saved as call records + outreach rows. */
export async function simulateAndSave(ctx: AgentCtx, execute: boolean) {
  const { outreach, assessments, summary } = simulateHour(ctx);
  if (!execute) return { status: "awaiting_approval", summary: `Run outreach: ${funnelSentence(summary)}.`, funnel: summary };

  const d = db();
  const planFor = toTimestamp(ctx.time);
  const { count } = await d.from("drip_plans").select("*", { count: "exact", head: true }).eq("plan_for", planFor);
  if (!count) throw new Error("No drip plan is published for this hour yet. Publish it first.");

  const homes = ctx.city.homes;
  const calls = outreach
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.contact !== "none")
    .map(({ o, i }) => ({ ...toRecord(homes[i].id, o, assessments[i]), plan_for: planFor, reason_params: {}, simulated: true }));
  for (let k = 0; k < calls.length; k += 500) {
    const { error } = await d.from("household_calls").upsert(calls.slice(k, k + 500), { onConflict: "home_id,plan_for" });
    if (error) throw new Error(`household_calls: ${error.message}${tableHint(error.message)}`);
  }
  const contactRows = outreach.flatMap((o, i) => {
    const rows = [];
    if (o.called)
      rows.push({ home_id: homes[i].id, plan_for: planFor, channel: "voice", status: o.answered_call ? "answered" : "no_answer", message: "Sample call (simulated)", simulated: true });
    if (o.door_check)
      rows.push({ home_id: homes[i].id, plan_for: planFor, channel: "door", status: "scheduled", message: "Door check (simulated)", simulated: true });
    return rows;
  });
  for (let k = 0; k < contactRows.length; k += 500) {
    const { error } = await d.from("outreach").upsert(contactRows.slice(k, k + 500), { onConflict: "home_id,plan_for,channel" });
    if (error) throw new Error(`outreach: ${error.message}${tableHint(error.message)}`);
  }
  const s = `Ran outreach: ${funnelSentence(summary)}.`;
  await d.from("events").insert({ type: "outreach_simulated", occurred_at: planFor, payload: { message: s, by: "agent", funnel: summary }, simulated: true });
  return { status: "done", summary: s, funnel: summary };
}

export async function crewStatus(ctx: AgentCtx) {
  const [crews, records] = await Promise.all([getCrews(), loadHourRecords(ctx.time)]);
  const assigned = records.assignments.filter((a) => a.status === "assigned");
  const { assessments, plan } = simulateHour(ctx);
  const { proposals, queue } = proposeCrews(
    ctx.city.homes,
    plan,
    assessments,
    crews,
    new Set(assigned.map((a) => a.crew_id!).filter(Boolean)),
    new Set(assigned.map((a) => a.home_id)),
  );
  const homeLabel = (i: number) => ({
    home_id: ctx.city.homes[i].id,
    street: ctx.city.homes[i].street,
    why: needsList(assessments[i].reasons),
  });
  return {
    crews: crews.map((c) => {
      const a = assigned.find((x) => x.crew_id === c.id);
      return { crew_id: c.id, name: c.name, busy: !!a, helping: a ? a.home_id : null };
    }),
    suggested: proposals.map((p) => ({ crew_id: p.crew_id, ...homeLabel(p.homeIdx) })),
    queue_length: queue.length,
    queue_top: queue.slice(0, 5).map(homeLabel),
  };
}

/** Crew rule: only a confirmed "needs a crew" home, only a free crew. Approve mode previews. */
export async function proposeCrew(ctx: AgentCtx, input: z.output<typeof OutreachInputs.propose_crew>, execute: boolean) {
  const idx = ctx.city.byId.get(input.home_id);
  if (idx === undefined) throw new Error("Unknown home_id");
  const crews = await getCrews();
  const crew = crews.find((c) => c.id === input.crew_id);
  if (!crew) throw new Error(`Unknown crew_id. Valid: ${crews.map((c) => c.id).join(", ")}`);
  const home = ctx.city.homes[idx];

  // What the call says (saved record when executing; the deterministic simulation when previewing).
  let assessment: Assessment, confidence: Confidence, reasons: ReasonFactor[];
  if (execute) {
    const { call } = await loadHomeRecord(home.id, ctx.time);
    if (!call) throw new Error("This home has no call record for this hour yet. Run outreach first.");
    ({ assessment, confidence } = call);
    reasons = call.reason_key.split(",") as ReasonFactor[];
  } else {
    const a = simulateHour(ctx).assessments[idx];
    ({ assessment, confidence, reasons } = a);
  }
  if (assessment !== "needs_crew" || confidence !== "confirmed")
    throw new Error(`Crews only go to homes whose call says they can't do the steps. This home is: ${assessmentSentence(assessment, reasons)}.`);

  const line = `${crew.name} → home on ${home.street} (${needsList(reasons)})`;
  if (!execute) return { status: "awaiting_approval", summary: `Assign ${line}.` };

  const d = db();
  const planFor = toTimestamp(ctx.time);
  const { data: busy } = await d.from("crew_assignments").select("home_id").eq("plan_for", planFor).eq("crew_id", crew.id).eq("status", "assigned");
  if (busy?.length) throw new Error(`${crew.name} is already helping another home this hour.`);
  const { error } = await d
    .from("crew_assignments")
    .upsert(
      { crew_id: crew.id, home_id: home.id, plan_for: planFor, status: "assigned", reason: assessmentSentence(assessment, reasons), simulated: true, updated_at: new Date().toISOString() },
      { onConflict: "home_id,plan_for" },
    );
  if (error) throw new Error(`crew_assignments: ${error.message}${tableHint(error.message)}`);
  const s = `Assigned ${line}.`;
  await d.from("events").insert({ type: "crew_assigned", home_id: home.id, occurred_at: planFor, payload: { message: s, by: "agent", crew_id: crew.id }, simulated: true });
  return { status: "done", summary: s };
}
