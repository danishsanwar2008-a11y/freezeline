import "server-only";
import { z } from "zod";
import {
  assess,
  nearestNeighbors,
  outreachSummary,
  jobActive,
  proposeCrews,
  simulateOutreach,
  type Assessment,
  type CallAnswers,
  type Confidence,
  type Contact,
  type Crew,
  type CrewJob,
  type HomeAssessment,
  type HomeOutreach,
  type ReasonFactor,
} from "@/lib/household";
import { assessmentSentence, needsList } from "@/lib/cityWording";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { routedTrip } from "./crewRoutes";
import { planAt, toTimestamp, type City } from "./cityState";
import { areaOf, generateCrews } from "@/lib/seed/generate";
import type { AgentCtx } from "./agent/tools";
import { chunks, pool, readAllPages } from "./batch";

function withArea(rows: Omit<Crew, "zone_id">[]): Crew[] {
  return rows.map((c) => ({ ...c, zone_id: areaOf(c.depot_lat, c.depot_lng) }));
}

/** Sample crews if the crews table is empty or missing: 20 crews, 5 per area (same rows `npm run seed` writes). */
export const DEFAULT_CREWS: Crew[] = withArea(generateCrews());

/** Assignments look back this many replay hours for jobs still running (a long cross-area drive). */
const JOB_LOOKBACK_HOURS = 3;

/**
 * Crew jobs as of a replay hour: jobs still running (busy crews) and every home already helped
 * (this hour or earlier), which leaves the queue.
 */
export async function loadCrewJobs(
  city: City,
  time: string,
  crews: Crew[],
): Promise<{ active: (CrewJob & { assigned_at: string })[]; helpedHomes: Set<string> }> {
  const d = getSupabaseAdmin();
  if (!d) return { active: [], helpedHomes: new Set() };
  const now = Date.parse(toTimestamp(time));
  const { data, error } = await d
    .from("crew_assignments")
    .select("crew_id,home_id,plan_for,created_at")
    .eq("status", "assigned")
    .lte("plan_for", toTimestamp(time))
    .order("created_at");
  if (error || !data) return { active: [], helpedHomes: new Set() };
  const helpedHomes = new Set(data.map((r) => r.home_id as string));
  const active: (CrewJob & { assigned_at: string })[] = [];
  for (const r of data) {
    const hoursAgo = Math.round((now - Date.parse(r.plan_for as string)) / 3_600_000);
    const crew = crews.find((c) => c.id === r.crew_id);
    const i = city.byId.get(r.home_id as string);
    if (!crew || i === undefined || hoursAgo > JOB_LOOKBACK_HOURS) continue;
    const job = { crew_id: crew.id, home_id: r.home_id as string, hoursAgo, minutes: routedTrip(crew, city.homes[i]).minutes, assigned_at: r.created_at as string };
    if (jobActive(job)) active.push(job);
  }
  return { active, helpedHomes };
}

const neighborCache = new WeakMap<City, (string | null)[]>();
function neighborsOf(city: City) {
  let n = neighborCache.get(city);
  if (!n) neighborCache.set(city, (n = nearestNeighbors(city.homes)));
  return n;
}

/** The deterministic (sample) outreach result for an hour, before anything is saved. */
export function simulateHour(ctx: Pick<AgentCtx, "city" | "hour" | "reserves">, textedIds?: Set<string>) {
  const plan = planAt(ctx.city, ctx.hour, ctx.reserves);
  const homes = ctx.city.homes;
  const outreach = simulateOutreach(homes, plan, neighborsOf(ctx.city), textedIds ? (i) => textedIds.has(homes[i].id) : undefined);
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
  return error || !data?.length ? DEFAULT_CREWS : withArea(data as Crew[]);
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

/** Homes whose text message is actually queued for this hour. */
export async function queuedTextIds(planFor: string): Promise<Set<string>> {
  const d = db();
  const rows = await readAllPages<{ home_id: string }>((from, to, withCount) =>
    d
      .from("outreach")
      .select("home_id", withCount ? { count: "exact" } : undefined)
      .eq("plan_for", planFor)
      .eq("channel", "sms")
      .order("home_id")
      .range(from, to),
  ).catch((e: Error) => {
    throw new Error(`outreach: ${e.message}`);
  });
  return new Set(rows.map((r) => r.home_id));
}

/**
 * Texts -> calls -> door checks (sample), saved as call records + outreach rows.
 * Only homes whose text was actually queued count as contacted (if an official skipped a texting
 * step, those homes stay "not contacted"; the record never claims a text that wasn't sent).
 */
export async function simulateAndSave(ctx: AgentCtx, execute: boolean) {
  if (!execute) {
    const { summary } = simulateHour(ctx);
    return { status: "awaiting_approval", summary: `Run outreach: ${funnelSentence(summary)}.`, funnel: summary };
  }

  const d = db();
  const planFor = toTimestamp(ctx.time);
  const { count } = await d.from("drip_plans").select("*", { count: "exact", head: true }).eq("plan_for", planFor);
  if (!count) throw new Error("No drip plan is published for this hour yet. Publish it first.");
  const texted = await queuedTextIds(planFor);
  if (texted.size === 0) throw new Error("No texts are queued for this hour yet. Queue them first.");
  const { outreach, assessments, summary } = simulateHour(ctx, texted);

  const homes = ctx.city.homes;
  // Homes that were not texted have no call record (clear any stale one from an earlier run).
  const notContacted = homes.filter((_, i) => outreach[i].contact === "none").map((h) => h.id);
  await pool(chunks(notContacted, 200), async (ids) => {
    await d.from("household_calls").delete().eq("plan_for", planFor).in("home_id", ids);
  });
  const calls = outreach
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.contact !== "none")
    .map(({ o, i }) => ({ ...toRecord(homes[i].id, o, assessments[i]), plan_for: planFor, reason_params: {}, simulated: true }));
  await pool(chunks(calls, 500), async (batch) => {
    const { error } = await d.from("household_calls").upsert(batch, { onConflict: "home_id,plan_for" });
    if (error) throw new Error(`household_calls: ${error.message}${tableHint(error.message)}`);
  });
  const contactRows = outreach.flatMap((o, i) => {
    const rows = [];
    if (o.called)
      rows.push({ home_id: homes[i].id, plan_for: planFor, channel: "voice", status: o.answered_call ? "answered" : "no_answer", message: "Sample call (simulated)", simulated: true });
    if (o.door_check)
      rows.push({ home_id: homes[i].id, plan_for: planFor, channel: "door", status: "scheduled", message: "Door check (simulated)", simulated: true });
    return rows;
  });
  await pool(chunks(contactRows, 500), async (batch) => {
    const { error } = await d.from("outreach").upsert(batch, { onConflict: "home_id,plan_for,channel" });
    if (error) throw new Error(`outreach: ${error.message}${tableHint(error.message)}`);
  });
  const s = `Ran outreach: ${funnelSentence(summary)}.`;
  await d.from("events").insert({ type: "outreach_simulated", occurred_at: planFor, payload: { message: s, by: "agent", funnel: summary }, simulated: true });
  return { status: "done", summary: s, funnel: summary };
}

export async function crewStatus(ctx: AgentCtx) {
  const crews = await getCrews();
  const jobs = await loadCrewJobs(ctx.city, ctx.time, crews);
  const { assessments, plan } = simulateHour(ctx);
  const { proposals, queue } = proposeCrews(
    ctx.city.homes,
    plan,
    assessments,
    crews,
    new Set(jobs.active.map((j) => j.crew_id)),
    jobs.helpedHomes,
  );
  const homeLabel = (i: number) => ({
    home_id: ctx.city.homes[i].id,
    street: ctx.city.homes[i].street,
    why: needsList(assessments[i].reasons),
  });
  return {
    crews: crews.map((c) => {
      const a = jobs.active.find((x) => x.crew_id === c.id);
      return { crew_id: c.id, name: c.name, area: c.zone_id, busy: !!a, helping: a ? a.home_id : null };
    }),
    suggested: proposals.map((p) => {
      // The pick is the nearest free crew (straight line); distance and time come from its street route.
      const trip = routedTrip(crews.find((c) => c.id === p.crew_id)!, ctx.city.homes[p.homeIdx]);
      return {
        crew_id: p.crew_id,
        ...homeLabel(p.homeIdx),
        miles: Math.round(trip.miles * 10) / 10,
        minutes: trip.minutes,
      };
    }),
    queue_length: queue.length,
    /** Crews never leave their area: each area has its own queue, highest risk first. */
    queue_by_area: queue.reduce<Record<string, number>>((m, i) => {
      const z = ctx.city.homes[i].zone_id;
      m[z] = (m[z] ?? 0) + 1;
      return m;
    }, {}),
    queue_top: queue.slice(0, 5).map(homeLabel),
  };
}

/** Crew rule: only a confirmed "needs a crew" home, only a free crew. Approve mode previews. */
export async function proposeCrew(ctx: AgentCtx, input: z.output<typeof OutreachInputs.propose_crew>, execute: boolean) {
  const idx = ctx.city.byId.get(input.home_id);
  if (idx === undefined) throw new Error("Unknown home_id");
  const home = ctx.city.homes[idx];
  // When executing, the three reads go out together (they don't depend on each other); the checks below
  // still run in the same order with the same messages.
  const crewsP = getCrews();
  const recordP = execute ? loadHomeRecord(home.id, ctx.time) : null;
  const jobsP = execute ? crewsP.then((cs) => loadCrewJobs(ctx.city, ctx.time, cs)) : null;
  recordP?.catch(() => {});
  jobsP?.catch(() => {});
  const crews = await crewsP;
  const crew = crews.find((c) => c.id === input.crew_id);
  if (!crew) throw new Error(`Unknown crew_id. Valid: ${crews.map((c) => c.id).join(", ")}`);

  // What the call says (saved record when executing; the deterministic simulation when previewing).
  let assessment: Assessment, confidence: Confidence, reasons: ReasonFactor[];
  if (recordP) {
    const { call } = await recordP;
    if (!call) throw new Error("This home has no call record for this hour yet. Run outreach first.");
    ({ assessment, confidence } = call);
    reasons = call.reason_key.split(",") as ReasonFactor[];
  } else {
    const a = simulateHour(ctx).assessments[idx];
    ({ assessment, confidence, reasons } = a);
  }
  if (assessment !== "needs_crew" || confidence !== "confirmed")
    throw new Error(`Crews only go to homes whose call says they can't do the steps. This home is: ${assessmentSentence(assessment, reasons)}.`);

  const trip = routedTrip(crew, home);
  const line = `${crew.name} → home on ${home.street} (${needsList(reasons)}) · ${trip.miles.toFixed(1)} mi · ~${trip.minutes} min`;
  if (!execute) return { status: "awaiting_approval", summary: `Assign ${line}.` };

  const d = db();
  const planFor = toTimestamp(ctx.time);
  const jobs = await jobsP!;
  if (jobs.active.some((j) => j.crew_id === crew.id)) throw new Error(`${crew.name} is still on another job.`);
  if (jobs.helpedHomes.has(home.id)) throw new Error("A crew has already been assigned to this home.");
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
