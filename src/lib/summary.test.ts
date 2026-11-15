import { describe, expect, it } from "vitest";
import uri from "../../data/uri-2021.json";
import { buildHourContexts, vulnerability } from "./risk";
import { generateHomes, generateZones } from "./seed/generate";
import { planCity } from "./planner";
import { compareFutures } from "./summary";
import type { WeatherSeries } from "./weather";

const hours = (uri as WeatherSeries).hours;
const ctx = buildHourContexts(hours);
const homes = generateHomes();
const zones = generateZones();
const vuln = homes.map(vulnerability);

describe("comparison card numbers", () => {
  it("at Uri's peak: everyone dripping breaks all 10 areas, the plan keeps all safe", () => {
    const t = hours.findIndex((h) => h.time === "2021-02-16T06:00");
    const s = compareFutures(planCity(zones, homes, vuln, ctx[t].exposure));
    expect(s.blanketFail).toBe(zones.length);
    expect(zones).toHaveLength(10);
    expect(s.planFail).toBe(0);
    expect(s.lowestPlan).toBeGreaterThanOrEqual(23);
    expect(s.needMessage).toBeGreaterThan(0);
  });

  it("on a warm hour nobody needs a message", () => {
    expect(compareFutures(planCity(zones, homes, vuln, ctx[12].exposure)).needMessage).toBe(0);
  });
});
