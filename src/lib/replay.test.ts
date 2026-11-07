import { describe, expect, it } from "vitest";
import uri from "../../data/uri-2021.json";
import { buildReplay } from "./replay";
import { generateHomes } from "./seed/generate";
import { scoreHome } from "./risk";
import type { WeatherSeries } from "./weather";

const hours = (uri as WeatherSeries).hours;
const homes = generateHomes();
const model = buildReplay(homes, hours);

describe("replay precompute", () => {
  it("bins every home into exactly one hex", () => {
    const total = model.hexes.reduce((s, h) => s + h.homeIdx.length, 0);
    expect(total).toBe(homes.length);
  });

  it("level counts add up to all homes every hour", () => {
    expect(model.counts).toHaveLength(hours.length);
    for (const [h, m, l] of model.counts) expect(h + m + l).toBe(homes.length);
  });

  it("hex averages match the risk engine", () => {
    const hex = model.hexes[0];
    const t = hours.findIndex((h) => h.time === "2021-02-16T06:00");
    const expected =
      hex.homeIdx.reduce((s, i) => s + scoreHome(homes[i], model.contexts[t]).score, 0) / hex.homeIdx.length;
    expect(hex.avg[t]).toBeCloseTo(expected, 3);
  });

  it("builds fast enough for the browser", () => {
    const start = performance.now();
    buildReplay(homes, hours);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
