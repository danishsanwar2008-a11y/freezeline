// Deterministic freeze-risk engine. Same inputs -> same score. No randomness, no I/O.
// Risk = weather exposure at an hour x how vulnerable a home's plumbing is.

import type { WeatherHour } from "./weather";

export type RiskLevel = "Low" | "Medium" | "High";

export interface HomeAttributes {
  foundation: "slab" | "pier_and_beam";
  exterior_wall_pipes: boolean;
  attic_or_crawlspace_pipes: boolean;
  insulation: "poor" | "fair" | "good";
  outdoor_faucets: number;
}

export interface HourContext {
  temperature_f: number;
  apparent_temperature_f: number;
  /** Hours below 20°F from the start of the series up to and including this hour. */
  hoursBelow20: number;
  /** 0–1 weather exposure for this hour. */
  exposure: number;
}

export interface RiskResult {
  score: number; // 0–100
  level: RiskLevel;
  why: string;
}

/** Score thresholds for levels. */
export const HIGH_AT = 60;
export const MEDIUM_AT = 30;

/** Hours below 20°F at which the duration factor saturates (Uri peaked ~22h in Houston). */
const HARD_FREEZE_HOURS = 18;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Weather exposure 0–1 for one hour, given the hard-freeze hours accumulated so far. */
export function weatherExposure(temperature_f: number, apparent_f: number, hoursBelow20: number): number {
  const duration = clamp01(hoursBelow20 / HARD_FREEZE_HOURS);
  // Above freezing, pipes thaw: only a small residual from the freeze already endured.
  if (temperature_f >= 32) return 0.1 * duration;
  const windChill = clamp01((32 - apparent_f) / 32); // apparent 0°F -> 1
  const belowFreezing = clamp01((32 - temperature_f) / 12); // 20°F -> 1
  const coldNow = 0.5 * windChill + 0.5 * belowFreezing;
  // A long hard freeze amplifies current cold (frozen ground, cold-soaked pipes), but
  // a mild night after the storm is still only as risky as that mild night.
  return clamp01(coldNow * (0.5 + 0.5 * duration));
}

/** Precompute per-hour context once for a whole series (cheap to reuse across all homes). */
export function buildHourContexts(hours: WeatherHour[]): HourContext[] {
  let below = 0;
  return hours.map((h) => {
    if (h.temperature_f < 20) below++;
    return {
      temperature_f: h.temperature_f,
      apparent_temperature_f: h.apparent_temperature_f,
      hoursBelow20: below,
      exposure: weatherExposure(h.temperature_f, h.apparent_temperature_f, below),
    };
  });
}

interface Factor {
  weight: number;
  label: string;
}

/** Plumbing vulnerability factors present in a home, heaviest first. */
export function homeFactors(home: HomeAttributes): Factor[] {
  const f: Factor[] = [];
  if (home.foundation === "pier_and_beam") f.push({ weight: 0.25, label: "pier-and-beam" });
  if (home.exterior_wall_pipes) f.push({ weight: 0.2, label: "pipes in exterior walls" });
  if (home.attic_or_crawlspace_pipes) f.push({ weight: 0.2, label: "attic/crawlspace pipes" });
  if (home.insulation === "poor") f.push({ weight: 0.2, label: "poor insulation" });
  else if (home.insulation === "fair") f.push({ weight: 0.1, label: "fair insulation" });
  const faucets = Math.min(home.outdoor_faucets, 3);
  if (faucets > 0)
    f.push({ weight: 0.05 * faucets, label: `${home.outdoor_faucets} outdoor faucet${home.outdoor_faucets === 1 ? "" : "s"}` });
  return f.sort((a, b) => b.weight - a.weight);
}

/** Plumbing vulnerability 0–1 (all factors present = 1). */
export function vulnerability(home: HomeAttributes): number {
  return clamp01(homeFactors(home).reduce((s, x) => s + x.weight, 0));
}

export function levelFor(score: number): RiskLevel {
  return score >= HIGH_AT ? "High" : score >= MEDIUM_AT ? "Medium" : "Low";
}

/** Fast path for bulk scoring: precomputed exposure x precomputed vulnerability. */
export function scoreFrom(exposure: number, vuln: number): number {
  return Math.round(100 * exposure * (0.3 + 0.7 * vuln));
}

function weatherPhrase(ctx: HourContext): string {
  if (ctx.temperature_f >= 32) {
    return ctx.hoursBelow20 > 0
      ? `thawing at ${Math.round(ctx.temperature_f)}°F after ${ctx.hoursBelow20} hours below 20°F`
      : `above freezing (${Math.round(ctx.temperature_f)}°F)`;
  }
  if (ctx.hoursBelow20 > 0) return `${ctx.hoursBelow20} hours below 20°F`;
  return `wind chill ${Math.round(ctx.apparent_temperature_f)}°F`;
}

/** Score one home at one hour, with a plain-English reason. */
export function scoreHome(home: HomeAttributes, ctx: HourContext): RiskResult {
  const factors = homeFactors(home);
  const score = scoreFrom(ctx.exposure, vulnerability(home));
  const top = factors.slice(0, 2).map((x) => x.label);
  const why = [...(top.length ? top : ["well-protected plumbing"]), weatherPhrase(ctx)].join(" + ");
  return { score, level: levelFor(score), why };
}
