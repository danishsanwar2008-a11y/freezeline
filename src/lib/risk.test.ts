import { describe, expect, it } from "vitest";
import uri from "../../data/uri-2021.json";
import { buildHourContexts, scoreHome, type HomeAttributes, type HourContext } from "./risk";
import type { WeatherSeries } from "./weather";

const exposed: HomeAttributes = {
  foundation: "pier_and_beam",
  exterior_wall_pipes: true,
  attic_or_crawlspace_pipes: true,
  insulation: "poor",
  outdoor_faucets: 3,
};

const protectedHome: HomeAttributes = {
  foundation: "slab",
  exterior_wall_pipes: false,
  attic_or_crawlspace_pipes: false,
  insulation: "good",
  outdoor_faucets: 0,
};

const hour = (temp: number, apparent: number, hours: number[]): HourContext =>
  buildHourContexts(
    [...hours, temp].map((t, i, a) => ({
      time: `h${i}`,
      temperature_f: t,
      apparent_temperature_f: i === a.length - 1 ? apparent : t,
      wind_speed_mph: 10,
    })),
  ).at(-1)!;

describe("risk engine", () => {
  it("scores a warm hour as Low, even for an exposed home", () => {
    const r = scoreHome(exposed, hour(55, 55, []));
    expect(r.level).toBe("Low");
    expect(r.score).toBe(0);
    expect(r.why).toContain("above freezing");
  });

  it("scores an exposed pier-and-beam home after a long hard freeze as High", () => {
    const longFreeze = Array(30).fill(15);
    const r = scoreHome(exposed, hour(14, 2, longFreeze));
    expect(r.level).toBe("High");
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.why).toBe("pier-and-beam + pipes in exterior walls + 31 hours below 20°F");
  });

  it("ranks a well-protected home below an exposed one in the same freeze", () => {
    const ctx = hour(14, 2, Array(30).fill(15));
    const a = scoreHome(exposed, ctx);
    const b = scoreHome(protectedHome, ctx);
    expect(b.score).toBeLessThan(a.score);
    expect(b.level).not.toBe("High");
    expect(b.why).toMatch(/^well-protected plumbing/);
  });

  it("is deterministic and bounded 0–100", () => {
    const ctxs = buildHourContexts((uri as WeatherSeries).hours);
    for (const c of ctxs) {
      const a = scoreHome(exposed, c);
      expect(a).toEqual(scoreHome(exposed, c));
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(100);
    }
  });

  it("peaks during Uri's hard freeze and eases after the thaw", () => {
    const ctxs = buildHourContexts((uri as WeatherSeries).hours);
    const at = (t: string) => scoreHome(exposed, ctxs[(uri as WeatherSeries).hours.findIndex((h) => h.time === t)]);
    expect(at("2021-02-13T12:00").level).toBe("Low");
    expect(at("2021-02-16T06:00").level).toBe("High");
    expect(at("2021-02-19T14:00").level).toBe("Low");
  });
});
