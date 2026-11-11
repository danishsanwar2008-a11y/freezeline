import { describe, expect, it } from "vitest";
import { explainHex, weatherWords } from "./hexWhy";
import type { HomeAttributes, RiskLevel } from "./risk";

const pier: HomeAttributes = { foundation: "pier_and_beam", exterior_wall_pipes: false, attic_or_crawlspace_pipes: true, insulation: "fair", outdoor_faucets: 1 };
const slab: HomeAttributes = { foundation: "slab", exterior_wall_pipes: false, attic_or_crawlspace_pipes: false, insulation: "good", outdoor_faucets: 1 };
const cold = { temperature_f: 13, apparent_temperature_f: 3, hoursBelow20: 14, exposure: 0.9 };

describe("Why this shade?", () => {
  it("counts homes needing action and names weather (real) + the top plumbing factor (simulated)", () => {
    const homes = [pier, pier, pier, slab];
    const levels: RiskLevel[] = ["High", "High", "Medium", "Low"];
    const w = explainHex([0, 1, 2, 3], homes, levels, cold);
    expect([w.need, w.total, w.share]).toEqual([3, 4, 0.75]);
    expect(w.reasons).toEqual([
      { text: "14 hours below 20°F so far; 13°F now, feels like 3°F", simulated: false },
      { text: "100% of them have raised pier-and-beam foundations", simulated: true },
    ]);
  });

  it("with no home needing action, only the weather is given", () => {
    const w = explainHex([0], [slab], ["Low"], { temperature_f: 40, apparent_temperature_f: 38, hoursBelow20: 0, exposure: 0 });
    expect(w.need).toBe(0);
    expect(w.reasons).toEqual([{ text: "Above freezing (40°F)", simulated: false }]);
  });

  it("says '1 hour', never '1 hours'", () => {
    expect(weatherWords({ temperature_f: 18, apparent_temperature_f: 9, hoursBelow20: 1, exposure: 0.6 })).toMatch(/^1 hour below/);
  });
});
