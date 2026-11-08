// Turns the planner's decision + a home's details into a homeowner plan card:
// one headline, exactly 3 numbered steps, and 3 sourced reasons. Deterministic, no AI.
//
// Every step and reason carries a stable `key` (+ `params` for numbers), so the friendly
// pre-written wording in data/messages.json (English + Spanish) can render it. The `text`
// fields below are the plain English baseline used by tests and as a last-resort fallback.

import type { HomePlan } from "./planner";
import type { HomeAttributes, RiskLevel } from "./risk";

export type DisplayLevel = "High" | "Watch" | "Low";
/** Homeowners see "Watch" instead of "Medium". */
export const displayLevel = (l: RiskLevel): DisplayLevel => (l === "Medium" ? "Watch" : l);

export type ExposedPipe = "crawlspace" | "attic" | "exterior_wall" | "outdoor_faucet";
export type ReasonSource = "Property record" | "Forecast" | "Photo: not sent yet" | "Photo: confirmed" | "Photo: unclear";

/** Result of the homeowner's photo check of their outdoor faucet (the photo itself is never stored). */
export type FaucetPhoto = "covered" | "bare" | "unclear";

export type Params = Record<string, string | number>;

/** Protective step keys (data/messages.json -> steps). */
export type StepKey =
  | "crawlspace_vents"
  | "kitchen_cabinet"
  | "bathroom_cabinets"
  | "heat_55"
  | "cover_faucet_one"
  | "cover_faucet_two"
  | "cover_faucet_many"
  | "shutoff_drain_faucet"
  | "unhook_hoses"
  | "shutoff_valve"
  | "heat_on";
/** Drip step keys (data/messages.json -> drip). */
export type DripKey = "drip_kitchen" | "drip_bathroom" | "drip_farthest" | "no_drip_uncovered" | "no_drip_watch" | "no_drip_low";
/** Reason sentence keys (data/messages.json -> reasons). */
export type ReasonKey =
  | "property_pier"
  | "property_slab"
  | "property_ext_wall"
  | "property_attic"
  | "property_poor_insulation"
  | "property_heated_walls"
  | "forecast_now"
  | "forecast_hours"
  | "photo_none_crawlspace"
  | "photo_none_faucets"
  | "photo_none_sink"
  | "photo_covered"
  | "photo_bare"
  | "photo_unclear";

export interface PlanStep {
  text: string;
  detail: string;
  key: StepKey | DripKey;
  params?: Params;
}

export interface PlanReason {
  text: string;
  source: ReasonSource;
  /** Sentences that make up this reason, in order. */
  parts: { key: ReasonKey; params?: Params }[];
}

export interface PlanCard {
  level: DisplayLevel;
  headline: string;
  steps: [PlanStep, PlanStep, PlanStep];
  reasons: [PlanReason, PlanReason, PlanReason];
  /** Pipe runs to highlight in the house diagram. */
  exposed: ExposedPipe[];
}

export interface CardHome extends HomeAttributes {
  year_built: number;
  /** The outdoor faucet has an indoor shutoff valve, so it can be shut off and drained. */
  has_faucet_shutoff?: boolean;
}

export interface CardWeather {
  temperature_f: number;
  apparent_temperature_f: number;
  hoursBelow20: number;
}

const HEADLINES: Record<DisplayLevel, string> = {
  High: "Likely to freeze tonight if nothing changes.",
  Watch: "Could freeze if it gets colder tonight.",
  Low: "Your pipes should be fine tonight.",
};

const TAP: Record<string, string> = {
  kitchen: "kitchen tap",
  bathroom: "bathroom tap",
  farthest: "tap farthest from your water meter",
};

type Candidate = PlanStep & { weight: number; order: number };

/** Protective steps this home's details call for, most important first. */
function protectiveSteps(home: CardHome, level: DisplayLevel, photo?: FaucetPhoto): Candidate[] {
  const faucets = home.outdoor_faucets;
  const s: Candidate[] = [];
  if (level !== "Low") {
    if (home.foundation === "pier_and_beam" && home.attic_or_crawlspace_pipes)
      s.push({
        key: "crawlspace_vents", weight: 5, order: 1,
        text: "Close the crawlspace vents.",
        detail: "Block any gaps with cardboard or towels. Cold air under the floor is the biggest risk to your pipes.",
      });
    if (home.exterior_wall_pipes)
      s.push({
        key: "kitchen_cabinet", weight: 4, order: 2,
        text: "Open the cabinet under the kitchen sink.",
        detail: "Warm room air keeps the pipes in that outside wall from freezing.",
      });
    if (home.attic_or_crawlspace_pipes && home.foundation === "slab")
      s.push({
        key: "bathroom_cabinets", weight: 3, order: 2,
        text: "Open the bathroom cabinet doors.",
        detail: "Some of your pipes run through the attic. Keep the attic hatch shut and let warm air reach the pipes below.",
      });
    if (home.insulation === "poor")
      s.push({
        key: "heat_55", weight: 3, order: 3,
        text: "Keep the heat at 55°F or higher all night.",
        detail: "Even if you leave. Your walls hold less heat than most.",
      });
    // A photo showing the faucet already covered removes this step; a bare one makes it urgent.
    // With an indoor valve, shutting off and draining the faucet protects it better than a cover.
    if (faucets > 0 && photo !== "covered" && home.has_faucet_shutoff)
      s.push({
        key: "shutoff_drain_faucet", weight: photo === "bare" ? 6 : 2.5, order: 0,
        text: "Shut off and drain your outdoor faucet.",
        detail: "Close its valve inside the house, then open the outdoor faucet until it stops dripping. Leave it open tonight.",
      });
    else if (faucets > 0 && photo !== "covered")
      s.push({
        key: faucets === 1 ? "cover_faucet_one" : faucets === 2 ? "cover_faucet_two" : "cover_faucet_many",
        params: faucets > 2 ? { n: faucets } : undefined,
        weight: photo === "bare" ? 6 : 2, order: 0,
        text: faucets === 1 ? "Cover the outdoor faucet." : faucets === 2 ? "Cover both outdoor faucets." : `Cover all ${faucets} outdoor faucets.`,
        detail: "Unhook any garden hose first, then wrap the faucet with a towel or a foam cover.",
      });
  } else if (faucets > 0) {
    s.push({
      key: "unhook_hoses", weight: 2, order: 0,
      text: "Unhook any garden hoses.",
      detail: "A hose left on traps water that can freeze back into the pipe.",
    });
  }
  s.push({
    key: "shutoff_valve", weight: 1, order: 4,
    text: "Find your main water shut-off valve.",
    detail: "Just in case. If a pipe bursts, turning it off quickly limits the damage.",
  });
  if (home.insulation !== "poor" || level === "Low")
    s.push({
      key: "heat_on", weight: 0.5, order: 3,
      text: "Keep the heat on overnight.",
      detail: "At least 55°F, even if you're away.",
    });
  return s.sort((a, b) => b.weight - a.weight);
}

function dripStep(plan: HomePlan, level: DisplayLevel): PlanStep {
  if (plan.action === "drip" && plan.faucet) {
    const key: DripKey = plan.faucet === "kitchen" ? "drip_kitchen" : plan.faucet === "bathroom" ? "drip_bathroom" : "drip_farthest";
    return {
      key,
      text: `Drip only the ${TAP[plan.faucet] ?? "tap farthest from your water meter"}.`,
      detail: "A thin, steady drip. Your street is on a drip plan, so please don't drip the others.",
    };
  }
  if (plan.uncovered)
    return {
      key: "no_drip_uncovered",
      text: "Don't drip tonight.",
      detail: "Water pressure on your street is at its limit. The steps above protect your pipes instead.",
    };
  return {
    key: level === "Low" ? "no_drip_low" : "no_drip_watch",
    text: "Don't drip tonight.",
    detail:
      level === "Low"
        ? "Your home is low-risk, and it helps keep your neighbors' water pressure up."
        : "Your home can ride this out without dripping, and it helps keep your neighbors' water pressure up.",
  };
}

/** Short sentences: foundation first, then at most two more facts. */
function propertyReason(home: CardHome): PlanReason {
  const parts: PlanReason["parts"] = [{ key: home.foundation === "pier_and_beam" ? "property_pier" : "property_slab", params: { year: home.year_built } }];
  const s: string[] = [
    home.foundation === "pier_and_beam"
      ? `Built in ${home.year_built} on pier-and-beam, so pipes run through an open crawlspace.`
      : `Built in ${home.year_built} on a slab.`,
  ];
  if (home.exterior_wall_pipes) {
    s.push("Some pipes run through outside walls.");
    parts.push({ key: "property_ext_wall" });
  } else if (home.attic_or_crawlspace_pipes && home.foundation === "slab") {
    s.push("Some pipes run through the attic.");
    parts.push({ key: "property_attic" });
  }
  if (home.insulation === "poor") {
    s.push("The walls are lightly insulated.");
    parts.push({ key: "property_poor_insulation" });
  }
  if (s.length === 1 && home.foundation === "slab") {
    s.push("Pipes stay inside heated walls.");
    parts.push({ key: "property_heated_walls" });
  }
  return { text: s.join(" "), source: "Property record", parts };
}

function forecastReason(w: CardWeather): PlanReason {
  const params = { temp: Math.round(w.temperature_f), feels: Math.round(w.apparent_temperature_f), hours: w.hoursBelow20 };
  const now = `${params.temp}°F now, feels like ${params.feels}°F`;
  return w.hoursBelow20 > 0
    ? { text: `${now}. ${w.hoursBelow20} hours below 20°F so far.`, source: "Forecast", parts: [{ key: "forecast_hours", params }] }
    : { text: `${now}.`, source: "Forecast", parts: [{ key: "forecast_now", params }] };
}

function photoReason(home: CardHome, photo?: FaucetPhoto): PlanReason {
  if (photo === "covered")
    return { text: "Confirmed from your photo: your outdoor faucet is covered.", source: "Photo: confirmed", parts: [{ key: "photo_covered" }] };
  if (photo === "bare")
    return {
      text: "Confirmed from your photo: your outdoor faucet is uncovered, so covering it comes first.",
      source: "Photo: confirmed",
      parts: [{ key: "photo_bare" }],
    };
  if (photo === "unclear")
    return { text: "We couldn't tell from your photo. Try again close up, in good light.", source: "Photo: unclear", parts: [{ key: "photo_unclear" }] };
  const [key, subject]: [ReasonKey, string] =
    home.foundation === "pier_and_beam"
      ? ["photo_none_crawlspace", "your crawlspace"]
      : home.outdoor_faucets > 0
        ? ["photo_none_faucets", "your outdoor faucets"]
        : ["photo_none_sink", "the pipes under your sink"];
  return { text: `We haven't seen a photo of ${subject} yet. One photo would let us fine-tune this plan.`, source: "Photo: not sent yet", parts: [{ key }] };
}

export function exposedPipes(home: HomeAttributes, photo?: FaucetPhoto): ExposedPipe[] {
  const e: ExposedPipe[] = [];
  if (home.attic_or_crawlspace_pipes) e.push(home.foundation === "pier_and_beam" ? "crawlspace" : "attic");
  if (home.exterior_wall_pipes) e.push("exterior_wall");
  if (home.outdoor_faucets > 0 && photo !== "covered") e.push("outdoor_faucet");
  return e;
}

export function buildPlanCard(home: CardHome, plan: HomePlan, weather: CardWeather, photo?: FaucetPhoto): PlanCard {
  const level = displayLevel(plan.level);
  const top2 = protectiveSteps(home, level, photo).slice(0, 2).sort((a, b) => a.order - b.order);
  const steps = [...top2.map(({ text, detail, key, params }) => ({ text, detail, key, params })), dripStep(plan, level)] as PlanCard["steps"];
  return {
    level,
    headline: HEADLINES[level],
    steps,
    reasons: [propertyReason(home), forecastReason(weather), photoReason(home, photo)],
    exposed: exposedPipes(home, photo),
  };
}

/** Short one-line action summary for lists ("Drip kitchen tap" / "Protect pipes, don't drip"). */
export function actionSummary(plan: HomePlan): string {
  if (plan.action === "drip" && plan.faucet) return `Drip the ${TAP[plan.faucet] ?? "farthest tap"}`;
  return plan.level === "Low" ? "No action needed" : "Protect pipes · don't drip";
}
