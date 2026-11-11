// "Why this shade?" for one map cell: how many homes need action and the top 2 reasons in plain words.
// Weather is real (Open-Meteo archive / forecast); home details are simulated and marked that way.

import type { HourContext, HomeAttributes } from "./risk";
import type { RiskLevel } from "./risk";
import { plural } from "./plural";

export interface HexWhy {
  need: number;
  total: number;
  share: number;
  /** Up to 2 plain-word reasons, most important first. */
  reasons: { text: string; simulated: boolean }[];
}

type Factor = { key: string; words: string; weight: (h: HomeAttributes) => number };
// Same factors and weights as the risk engine (risk.ts homeFactors), in plain words.
const FACTORS: Factor[] = [
  { key: "pier", words: "raised pier-and-beam foundations", weight: (h) => (h.foundation === "pier_and_beam" ? 0.25 : 0) },
  { key: "wall", words: "pipes in outside walls", weight: (h) => (h.exterior_wall_pipes ? 0.2 : 0) },
  { key: "attic", words: "pipes in the attic or crawlspace", weight: (h) => (h.attic_or_crawlspace_pipes ? 0.2 : 0) },
  { key: "insulation", words: "poor insulation", weight: (h) => (h.insulation === "poor" ? 0.2 : 0) },
  { key: "faucets", words: "outdoor faucets", weight: (h) => 0.05 * Math.min(h.outdoor_faucets, 3) },
];

/** Weather in plain words for the hour (real data). */
export function weatherWords(ctx: HourContext): string {
  const t = Math.round(ctx.temperature_f);
  const feels = Math.round(ctx.apparent_temperature_f);
  if (ctx.temperature_f >= 32) return ctx.hoursBelow20 > 0 ? `Thawing at ${t}°F after ${plural(ctx.hoursBelow20, "hour")} below 20°F` : `Above freezing (${t}°F)`;
  if (ctx.hoursBelow20 > 0) return `${plural(ctx.hoursBelow20, "hour")} below 20°F so far; ${t}°F now, feels like ${feels}°F`;
  return `${t}°F now, feels like ${feels}°F`;
}

export function explainHex(
  homeIdx: number[],
  homes: HomeAttributes[],
  levels: ArrayLike<RiskLevel> | ((i: number) => RiskLevel),
  weather: HourContext,
): HexWhy {
  const levelOf = typeof levels === "function" ? levels : (i: number) => levels[i];
  const needing = homeIdx.filter((i) => levelOf(i) !== "Low");
  const total = homeIdx.length;
  const reasons: HexWhy["reasons"] = [{ text: weatherWords(weather), simulated: false }];
  if (needing.length) {
    // The plumbing factor that adds the most risk across the homes that need action.
    let best: Factor | null = null, bestSum = 0;
    for (const f of FACTORS) {
      const sum = needing.reduce((s, i) => s + f.weight(homes[i]), 0);
      if (sum > bestSum) [best, bestSum] = [f, sum];
    }
    if (best) {
      const f = best;
      const pct = Math.round((100 * needing.filter((i) => f.weight(homes[i]) > 0).length) / needing.length);
      reasons.push({ text: `${pct}% of them have ${f.words}`, simulated: true });
    }
  }
  return { need: needing.length, total, share: total ? needing.length / total : 0, reasons };
}
