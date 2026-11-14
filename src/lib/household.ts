// Simulated outreach (SAMPLE until Phase 4 sends real texts and calls): texts -> calls -> door checks,
// the household's answers on the call, the agent's assessment of each home, and crew proposals.
// Pure and deterministic: everything is seeded by home id, so the same hour always gives the same result.

import { hash32, rng } from "./seed/generate";
import type { CityPlan } from "./planner";
import type { ConsoleHome } from "./replay";

// ---------- answers ----------

/** The 7 questions the agent asks on the call. */
export interface CallAnswers {
  /** Can you do the 3 steps yourself? */
  can_do_steps: boolean;
  /** Have you done them yet? */
  did_steps: boolean;
  someone_elderly: boolean;
  someone_disabled: boolean;
  cant_go_outside: boolean;
  lives_alone: boolean;
  knows_shutoff: boolean;
  /** null when the home has no outdoor faucet. */
  faucet_covered: boolean | null;
  /** false = no heat / power out. */
  has_heat: boolean;
  /** A neighbor the household asked us to check on (home id), if any. */
  neighbor_check: string | null;
}

export type Contact = "none" | "texted" | "called" | "door";

export interface HomeOutreach {
  contact: Contact;
  /** Replied to the text with their answers. */
  replied_text: boolean;
  /** A call was placed. */
  called: boolean;
  /** The call was answered. */
  answered_call: boolean;
  /** No answer on a High home: a door check is scheduled. */
  door_check: boolean;
  /** Answers when the household replied (text or call); null otherwise. */
  answers: CallAnswers | null;
  /** Home id of the neighbor who asked us to check on this home. */
  flagged_by: string | null;
}

/** Sample rates for the simulated funnel (documented, so the demo is explainable). */
export const RATES = { textReply: 0.42, callAnswer: 0.72, callsNotYetMade: 0.18, neighborFlag: 0.05, powerOut: 0.08 };

export function sampleAnswers(home: ConsoleHome, neighbor: string | null): CallAnswers {
  const r = rng(hash32(`${home.id}|call`));
  let canDo = 0.97;
  if (home.elderly) canDo -= 0.12;
  if (home.mobility_limited) canDo -= 0.3;
  if (home.elderly && home.lives_alone) canDo -= 0.08;
  const can_do_steps = r() < canDo;
  const did_steps = can_do_steps && r() < 0.55;
  const cant_go_outside = home.mobility_limited || (home.elderly && r() < 0.3);
  const knows_shutoff = r() < (home.year_built >= 1990 ? 0.75 : 0.6);
  const faucet_covered = home.outdoor_faucets > 0 ? r() < 0.3 : null;
  const has_heat = r() >= RATES.powerOut;
  const neighbor_check = neighbor && r() < RATES.neighborFlag ? neighbor : null;
  return {
    can_do_steps,
    did_steps,
    someone_elderly: home.elderly,
    someone_disabled: home.mobility_limited,
    cant_go_outside,
    lives_alone: home.lives_alone,
    knows_shutoff,
    faucet_covered,
    has_heat,
    neighbor_check,
  };
}

/** Nearest other home in the same area (for "is there a neighbor who might need a check?"). */
export function nearestNeighbors(homes: ConsoleHome[]): (string | null)[] {
  const CELL = 0.001; // ~100 m grid
  const grid = new Map<string, number[]>();
  const key = (lat: number, lng: number) => `${Math.floor(lat / CELL)}|${Math.floor(lng / CELL)}`;
  homes.forEach((h, i) => {
    const k = key(h.lat, h.lng);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  });
  return homes.map((h, i) => {
    const gy = Math.floor(h.lat / CELL), gx = Math.floor(h.lng / CELL);
    let best = -1, bestD = Infinity;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const j of grid.get(`${gy + dy}|${gx + dx}`) ?? []) {
          if (j === i || homes[j].zone_id !== h.zone_id) continue;
          const d = (homes[j].lat - h.lat) ** 2 + (homes[j].lng - h.lng) ** 2;
          if (d < bestD || (d === bestD && j < best)) {
            bestD = d;
            best = j;
          }
        }
    return best >= 0 ? homes[best].id : null;
  });
}

/**
 * Run the simulated funnel for one storm hour: text every Watch/High home; call those who didn't
 * reply (a few calls not made yet); door-check High homes that don't answer. A neighbor named on a
 * call moves up the call list (their call is placed now and they are flagged).
 */
export function simulateOutreach(
  homes: ConsoleHome[],
  plan: CityPlan,
  neighbors = nearestNeighbors(homes),
  /** Only homes whose text was actually queued can be "texted". Omit to assume every Watch/High home (preview). */
  texted?: (i: number) => boolean,
): HomeOutreach[] {
  const out: HomeOutreach[] = homes.map(() => ({
    contact: "none",
    replied_text: false,
    called: false,
    answered_call: false,
    door_check: false,
    answers: null,
    flagged_by: null,
  }));
  const index = new Map(homes.map((h, i) => [h.id, i]));
  const targets = homes.map((_, i) => i).filter((i) => plan.homes[i].level !== "Low" && (!texted || texted(i)));

  // Pass 1: texts, then calls.
  for (const i of targets) {
    const h = homes[i];
    const r = rng(hash32(`${h.id}|funnel`));
    const o = out[i];
    o.contact = "texted";
    if (r() < RATES.textReply) {
      o.replied_text = true;
      o.answers = sampleAnswers(h, neighbors[i]);
      continue;
    }
    if (r() < RATES.callsNotYetMade) continue; // still waiting on a reply; call queued
    o.called = true;
    o.contact = "called";
    if (r() < RATES.callAnswer) {
      o.answered_call = true;
      o.answers = sampleAnswers(h, neighbors[i]);
    }
  }
  // Pass 2: neighbors named on calls move up the call list.
  for (const i of targets) {
    const flagged = out[i].answers?.neighbor_check;
    const j = flagged ? index.get(flagged) : undefined;
    if (j === undefined || out[j].answers) continue;
    const o = out[j];
    o.flagged_by = homes[i].id;
    o.called = true;
    o.contact = "called";
    // The neighbor's own answer behaviour is unchanged; we just call them now.
    if (rng(hash32(`${homes[j].id}|flagged`))() < RATES.callAnswer) {
      o.answered_call = true;
      o.answers = sampleAnswers(homes[j], neighbors[j]);
    }
  }
  // Pass 3: door checks for High homes that were called and didn't answer.
  for (const i of targets) {
    const o = out[i];
    if (o.called && !o.answered_call && plan.homes[i].level === "High") {
      o.door_check = true;
      o.contact = "door";
    }
  }
  return out;
}

// ---------- assessment ----------

export type Assessment = "ready" | "needs_reminder" | "needs_crew" | "waiting" | "no_answer" | "not_contacted";
/** The 5 home statuses shown on the map (same colors in both tabs). */
export type HomeStatus = "ready" | "needs_help" | "waiting" | "no_answer" | "not_contacted";
export type Confidence = "confirmed" | "estimated";

export interface HomeAssessment {
  assessment: Assessment;
  status: HomeStatus;
  /** Reason factors (rendered in third person for officials). */
  reasons: ReasonFactor[];
  confidence: Confidence;
}

export type ReasonFactor =
  | "can_do_steps"
  | "did_steps"
  | "not_done_yet"
  | "elderly"
  | "disabled"
  | "cant_go_outside"
  | "lives_alone"
  | "no_heat"
  | "cant_do_steps"
  | "faucet_uncovered"
  | "no_reply_yet"
  | "no_answer"
  | "door_check"
  | "low_risk";

export const STATUS_OF: Record<Assessment, HomeStatus> = {
  ready: "ready",
  needs_crew: "needs_help",
  needs_reminder: "waiting",
  waiting: "waiting",
  no_answer: "no_answer",
  not_contacted: "not_contacted",
};

/** The agent's assessment of one home from its outreach result. */
export function assess(o: HomeOutreach): HomeAssessment {
  const a = o.answers;
  if (!a) {
    if (o.contact === "none") return { assessment: "not_contacted", status: "not_contacted", reasons: ["low_risk"], confidence: "estimated" };
    if (!o.called) return { assessment: "waiting", status: "waiting", reasons: ["no_reply_yet"], confidence: "estimated" };
    const reasons: ReasonFactor[] = o.door_check ? ["no_answer", "door_check"] : ["no_answer"];
    return { assessment: "no_answer", status: "no_answer", reasons, confidence: "estimated" };
  }
  const needs: ReasonFactor[] = [];
  if (a.someone_elderly) needs.push("elderly");
  if (a.someone_disabled) needs.push("disabled");
  if (a.cant_go_outside) needs.push("cant_go_outside");
  if (a.lives_alone) needs.push("lives_alone");
  if (!a.has_heat) needs.push("no_heat");
  const vulnerable = a.someone_elderly || a.someone_disabled || a.cant_go_outside;
  if (!a.can_do_steps || (!a.has_heat && vulnerable)) {
    const reasons: ReasonFactor[] = [...(a.can_do_steps ? [] : (["cant_do_steps"] as ReasonFactor[])), ...needs];
    if (a.faucet_covered === false && a.cant_go_outside) reasons.push("faucet_uncovered");
    return { assessment: "needs_crew", status: "needs_help", reasons, confidence: "confirmed" };
  }
  if (!a.did_steps) return { assessment: "needs_reminder", status: "waiting", reasons: ["can_do_steps", "not_done_yet"], confidence: "confirmed" };
  return { assessment: "ready", status: "ready", reasons: ["can_do_steps", "did_steps"], confidence: "confirmed" };
}

// ---------- crews ----------

export interface Crew {
  id: number;
  name: string;
  depot_lat: number;
  depot_lng: number;
  /** Area the crew's depot is in (derived from the depot location). */
  zone_id?: string;
}

export { CREW_TRIP, crewTrip, jobActive, milesBetween, type CrewJob } from "./crewTrip";
import { crewTrip, milesBetween } from "./crewTrip";

export interface CrewProposal {
  crew_id: number;
  home_id: string;
  homeIdx: number;
  miles: number;
  minutes: number;
}

/** Nearest free crew for a home, from the home's own area only (crews never leave their area). */
export function nearestCrew(home: { lat: number; lng: number; zone_id: string }, free: Crew[]): Crew | null {
  const pool = free.filter((c) => c.zone_id === home.zone_id);
  if (!pool.length) return null;
  let best = pool[0];
  let bestMiles = milesBetween(best.depot_lat, best.depot_lng, home.lat, home.lng);
  for (const c of pool.slice(1)) {
    const m = milesBetween(c.depot_lat, c.depot_lng, home.lat, home.lng);
    if (m < bestMiles || (m === bestMiles && c.id < best.id)) [best, bestMiles] = [c, m];
  }
  return best;
}

/**
 * Crew rule: crews go ONLY to homes whose call (confirmed) says they can't do the steps themselves,
 * highest risk first, each to the nearest free crew in its own area. When all 5 of an area's crews
 * are busy, its homes wait in that area's queue (highest risk first). Homes already helped are skipped.
 */
export function proposeCrews(
  homes: ConsoleHome[],
  plan: CityPlan,
  assessments: HomeAssessment[],
  crews: Crew[],
  busyCrewIds: Set<number> = new Set(),
  alreadyAssignedHomes: Set<string> = new Set(),
): { proposals: CrewProposal[]; queue: number[] } {
  const needs = assessments
    .map((a, i) => ({ a, i }))
    .filter(({ a, i }) => a.assessment === "needs_crew" && a.confidence === "confirmed" && !alreadyAssignedHomes.has(homes[i].id))
    .sort((x, y) => plan.homes[y.i].score - plan.homes[x.i].score || x.i - y.i)
    .map(({ i }) => i);
  const free = crews.filter((c) => !busyCrewIds.has(c.id));
  const proposals: CrewProposal[] = [];
  const queue: number[] = [];
  for (const i of needs) {
    const h = homes[i];
    const crew = nearestCrew(h, free);
    if (!crew) {
      queue.push(i);
      continue;
    }
    const trip = crewTrip(crew, h);
    proposals.push({ crew_id: crew.id, home_id: h.id, homeIdx: i, ...trip });
    free.splice(free.indexOf(crew), 1);
  }
  return { proposals, queue };
}

/** Funnel + status counts for the City Operations cards. */
export function outreachSummary(outreach: HomeOutreach[], assessments: HomeAssessment[]) {
  const status: Record<HomeStatus, number> = { ready: 0, needs_help: 0, waiting: 0, no_answer: 0, not_contacted: 0 };
  for (const a of assessments) status[a.status]++;
  return {
    texted: outreach.filter((o) => o.contact !== "none").length,
    called: outreach.filter((o) => o.called).length,
    doorChecks: outreach.filter((o) => o.door_check).length,
    neighborFlags: outreach.filter((o) => o.flagged_by).length,
    status,
  };
}
