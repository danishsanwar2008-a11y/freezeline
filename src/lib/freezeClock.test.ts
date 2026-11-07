import { describe, expect, it } from "vitest";
import uri from "../../data/uri-2021.json";
import { freezeClock } from "./freezeClock";
import type { WeatherSeries } from "./weather";

const hours = (uri as WeatherSeries).hours;
const at = (t: string) => hours.findIndex((h) => h.time === t);

describe("freeze clock", () => {
  it("an exposed home is at risk sooner than a protected one in the same cold", () => {
    const from = at("2021-02-15T18:00");
    const high = freezeClock(hours, from, "High").atRisk!;
    const watch = freezeClock(hours, from, "Watch").atRisk!;
    expect(high < watch).toBe(true);
  });

  it("during Uri's hard freeze a High home is at risk within a few hours", () => {
    const from = at("2021-02-16T00:00");
    const { atRisk } = freezeClock(hours, from, "High");
    expect(atRisk).not.toBeNull();
    expect(at(atRisk!) - from).toBeLessThanOrEqual(3);
  });

  it("warm weather never puts pipes at risk", () => {
    const warm = Array.from({ length: 48 }, (_, i) => ({ time: `t${i}`, temperature_f: 45 }));
    expect(freezeClock(warm, 0, "High").atRisk).toBeNull();
  });

  it("is deterministic", () => {
    expect(freezeClock(hours, 50, "Watch")).toEqual(freezeClock(hours, 50, "Watch"));
  });
});
