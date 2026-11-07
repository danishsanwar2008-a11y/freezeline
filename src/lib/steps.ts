// Turns the planner's decision + a home's details into a homeowner plan card:
// one headline, exactly 3 numbered steps, and 3 sourced reasons. Deterministic, no AI.

import type { HomePlan } from "./planner";
import type { HomeAttributes, RiskLevel } from "./risk";

export type DisplayLevel = "High" | "Watch" | "Low";
/** Homeowners see "Watch" instead of "Medium". */
export const displayLevel = (l: RiskLevel): DisplayLevel => (l === "Medium" ? "Watch" : l);

export type ExposedPipe = "crawlspace" | "attic" | "exterior_wall" | "outdoor_faucet";
export type ReasonSource = "Property record" | "Forecast" | "Photo: not sent yet";

export interface PlanStep {
  text: string;
  detail: string;
}

export interface PlanReason {
  text: string;
  source: ReasonSource;
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

/** Protective steps this home's details call for, most important first. */
function protectiveSteps(home: CardHome, level: DisplayLevel): (PlanStep & { order: number })[] {
  const faucets = home.outdoor_faucets;
  const s: (PlanStep & { weight: number; order: number })[] = [];
  if (level !== "Low") {
    if (home.foundation === "pier_and_beam" && home.attic_or_crawlspace_pipes)
      s.push({
        weight: 5, order: 1,
        text: "Close the crawlspace vents.",
        detail: "Block any gaps with cardboard or towels. Cold air under the floor is the biggest risk to your pipes.",
      });
    if (home.exterior_wall_pipes)
      s.push({
        weight: 4, order: 2,
        text: "Open the cabinet under the kitchen sink.",
        detail: "Warm room air keeps the pipes in that outside wall from freezing.",
      });
    if (home.attic_or_crawlspace_pipes && home.foundation === "slab")
      s.push({
        weight: 3, order: 2,
        text: "Open the bathroom cabinet doors.",
        detail: "Some of your pipes run through the attic. Keep the attic hatch shut and let warm air reach the pipes below.",
      });
    if (home.insulation === "poor")
      s.push({
        weight: 3, order: 3,
        text: "Keep the heat at 55°F or higher all night.",
        detail: "Even if you leave. Your walls hold less heat than most.",
      });
    if (faucets > 0)
      s.push({
        weight: 2, order: 0,
        text: faucets === 1 ? "Cover the outdoor faucet." : faucets === 2 ? "Cover both outdoor faucets." : `Cover all ${faucets} outdoor faucets.`,
        detail: "Unhook any garden hose first, then wrap the faucet with a towel or a foam cover.",
      });
  } else if (faucets > 0) {
    s.push({
      weight: 2, order: 0,
      text: "Unhook any garden hoses.",
      detail: "A hose left on traps water that can freeze back into the pipe.",
    });
  }
  s.push({
    weight: 1, order: 4,
    text: "Find your main water shut-off valve.",
    detail: "Just in case. If a pipe bursts, turning it off quickly limits the damage.",
  });
  if (home.insulation !== "poor" || level === "Low")
    s.push({
      weight: 0.5, order: 3,
      text: "Keep the heat on overnight.",
      detail: "At least 55°F, even if you're away.",
    });
  return s.sort((a, b) => b.weight - a.weight);
}

function dripStep(plan: HomePlan, level: DisplayLevel): PlanStep {
  if (plan.action === "drip" && plan.faucet)
    return {
      text: `Drip only the ${TAP[plan.faucet] ?? "tap farthest from your water meter"}.`,
      detail: "A thin, steady drip. Your street is on a drip plan, so please don't drip the others.",
    };
  if (plan.uncovered)
    return {
      text: "Don't drip tonight.",
      detail: "Water pressure on your street is at its limit. The steps above protect your pipes instead.",
    };
  return {
    text: "Don't drip tonight.",
    detail:
      level === "Low"
        ? "Your home is low-risk, and it helps keep your neighbors' water pressure up."
        : "Your home can ride this out without dripping, and it helps keep your neighbors' water pressure up.",
  };
}

function propertyReason(home: CardHome): string {
  const parts: string[] = [];
  if (home.foundation === "pier_and_beam")
    parts.push(`Built in ${home.year_built} on pier-and-beam, so pipes run through an open crawlspace`);
  else parts.push(`Built in ${home.year_built} on a slab`);
  if (home.exterior_wall_pipes) parts.push("some pipes run through outside walls");
  else if (home.attic_or_crawlspace_pipes && home.foundation === "slab") parts.push("some pipes run through the attic");
  if (home.insulation === "poor") parts.push("the walls are lightly insulated");
  if (parts.length === 1 && home.foundation === "slab") parts.push("pipes stay inside heated walls");
  return parts.length === 1 ? `${parts[0]}.` : `${parts[0]}, and ${parts.slice(1).join(" and ")}.`;
}

function forecastReason(w: CardWeather): string {
  const now = `${Math.round(w.temperature_f)}°F now, feels like ${Math.round(w.apparent_temperature_f)}°F`;
  return w.hoursBelow20 > 0 ? `${now}. ${w.hoursBelow20} hours below 20°F so far.` : `${now}.`;
}

function photoReason(home: CardHome): string {
  const subject =
    home.foundation === "pier_and_beam" ? "your crawlspace" : home.outdoor_faucets > 0 ? "your outdoor faucets" : "the pipes under your sink";
  return `We haven't seen a photo of ${subject} yet. One photo would let us fine-tune this plan.`;
}

export function exposedPipes(home: HomeAttributes): ExposedPipe[] {
  const e: ExposedPipe[] = [];
  if (home.attic_or_crawlspace_pipes) e.push(home.foundation === "pier_and_beam" ? "crawlspace" : "attic");
  if (home.exterior_wall_pipes) e.push("exterior_wall");
  if (home.outdoor_faucets > 0) e.push("outdoor_faucet");
  return e;
}

export function buildPlanCard(home: CardHome, plan: HomePlan, weather: CardWeather): PlanCard {
  const level = displayLevel(plan.level);
  const top2 = protectiveSteps(home, level).slice(0, 2).sort((a, b) => a.order - b.order);
  const steps = [...top2.map(({ text, detail }) => ({ text, detail })), dripStep(plan, level)] as PlanCard["steps"];
  return {
    level,
    headline: HEADLINES[level],
    steps,
    reasons: [
      { text: propertyReason(home), source: "Property record" },
      { text: forecastReason(weather), source: "Forecast" },
      { text: photoReason(home), source: "Photo: not sent yet" },
    ],
    exposed: exposedPipes(home),
  };
}

/** Short one-line action summary for lists ("Drip kitchen tap" / "Protect pipes, don't drip"). */
export function actionSummary(plan: HomePlan): string {
  if (plan.action === "drip" && plan.faucet) return `Drip the ${TAP[plan.faucet] ?? "farthest tap"}`;
  return plan.level === "Low" ? "No action needed" : "Protect pipes · don't drip";
}
