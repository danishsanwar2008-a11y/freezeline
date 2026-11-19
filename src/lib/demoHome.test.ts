import { describe, expect, it } from "vitest";
import uri from "../../data/uri-2021.json";
import { demoHomeIndex } from "./demoHome";
import { buildHourContexts, vulnerability } from "./risk";
import { generateHomes, generateZones } from "./seed/generate";
import { planCity } from "./planner";
import type { WeatherSeries } from "./weather";

// The replay's real plans: the first hour (Sat Feb 13, 12 AM, before the storm) and the peak.
const hours = (uri as WeatherSeries).hours;
const ctx = buildHourContexts(hours);
const homes = generateHomes();
const vuln = homes.map(vulnerability);
const planAtHour = (i: number) => planCity(generateZones(), homes, vuln, ctx[i].exposure);

describe("which home the demo call stands in for", () => {
  it("picks the highest-risk home that needs action during the storm", () => {
    const homes = [
      { level: "Low", score: 30 },
      { level: "Medium", score: 55 },
      { level: "High", score: 80 },
      { level: "Medium", score: 60 },
    ] as const;
    expect(demoHomeIndex(homes)).toBe(2);
  });

  it("prefers a Watch home over a higher-scoring Low one", () => {
    expect(demoHomeIndex([{ level: "Low", score: 49 }, { level: "Medium", score: 45 }])).toBe(1);
  });

  it("still calls at a calm hour, when every home is Low: the highest-risk one", () => {
    expect(demoHomeIndex([{ level: "Low", score: 10 }, { level: "Low", score: 22 }, { level: "Low", score: 22 }])).toBe(1);
  });

  it("has nobody to call only when there are no homes", () => {
    expect(demoHomeIndex([])).toBeNull();
  });

  it("calls at the start of the replay (no storm yet) and at the peak", () => {
    const calm = planAtHour(0).homes;
    expect(calm.every((h) => h.level === "Low"), "the first replay hour should need no action").toBe(true);
    expect(demoHomeIndex(calm)).not.toBeNull();
    const peak = planAtHour(hours.findIndex((h) => h.time === "2021-02-16T06:00")).homes;
    const i = demoHomeIndex(peak)!;
    expect(peak[i].level).not.toBe("Low");
  });
});
