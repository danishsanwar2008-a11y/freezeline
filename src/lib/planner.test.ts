import { describe, expect, it } from "vitest";
import uri from "../../data/uri-2021.json";
import { buildHourContexts, vulnerability } from "./risk";
import { generateHomes, generateZones } from "./seed/generate";
import { BOIL_WATER_PSI, RESERVE_PSI, chooseFaucet, dripBudget, planCity, zonePressure } from "./planner";
import type { WeatherSeries } from "./weather";

const hours = (uri as WeatherSeries).hours;
const ctx = buildHourContexts(hours);
const homes = generateHomes();
const zones = generateZones();
const vuln = homes.map(vulnerability);
const peak = hours.findIndex((h) => h.time === "2021-02-16T06:00");

describe("pressure model", () => {
  it("loses pressure as more taps drip", () => {
    expect(zonePressure(50, 1, 100, 500)).toBeLessThan(zonePressure(50, 1, 0, 500));
  });

  it("gives no drip budget when there is no headroom", () => {
    expect(dripBudget(25, 1, 500)).toBe(0);
  });
});

describe("drip planner", () => {
  const plan = planCity(zones, homes, vuln, ctx[peak].exposure);

  it("a blanket 'everyone drip' message would push every zone under 20 psi at Uri's peak", () => {
    for (const z of plan.zones) expect(z.pressureBlanket).toBeLessThan(BOIL_WATER_PSI);
  });

  it("the plan keeps every zone at or above 20 psi + reserve, every hour of Uri", () => {
    for (const c of ctx) {
      for (const z of planCity(zones, homes, vuln, c.exposure).zones) {
        expect(z.pressurePlan).toBeGreaterThanOrEqual(BOIL_WATER_PSI + RESERVE_PSI - 1e-9);
      }
    }
  });

  it("only High homes drip, highest risk first, one tap each", () => {
    for (const z of plan.zones) {
      const inZone = homes.map((h, i) => i).filter((i) => homes[i].zone_id === z.zoneId);
      const drippers = inZone.filter((i) => plan.homes[i].action === "drip");
      const skippedHigh = inZone.filter((i) => plan.homes[i].uncovered);
      expect(drippers.every((i) => plan.homes[i].level === "High")).toBe(true);
      expect(drippers.every((i) => plan.homes[i].faucet !== null)).toBe(true);
      if (skippedHigh.length && drippers.length) {
        const minDrip = Math.min(...drippers.map((i) => plan.homes[i].score));
        const maxSkipped = Math.max(...skippedHigh.map((i) => plan.homes[i].score));
        expect(minDrip).toBeGreaterThanOrEqual(maxSkipped);
      }
    }
  });

  it("tells nobody to drip on a warm hour", () => {
    const warm = planCity(zones, homes, vuln, ctx[12].exposure);
    expect(warm.homes.every((h) => h.action === "no_drip")).toBe(true);
  });

  it("is deterministic", () => {
    expect(planCity(zones, homes, vuln, ctx[peak].exposure)).toEqual(plan);
  });

  it("drips the kitchen tap when pipes run through exterior walls", () => {
    expect(
      chooseFaucet({ foundation: "slab", exterior_wall_pipes: true, attic_or_crawlspace_pipes: false, insulation: "good", outdoor_faucets: 1 }),
    ).toBe("kitchen");
  });
});

describe("per-zone exposure", () => {
  it("matches the single-value plan when every zone has the same exposure", () => {
    const e = ctx[peak].exposure;
    const perZone = Object.fromEntries(zones.map((z) => [z.id, e]));
    expect(planCity(zones, homes, vuln, perZone)).toEqual(planCity(zones, homes, vuln, e));
  });
});

describe("stricter drip budget (per-zone reserve)", () => {
  const e = ctx[peak].exposure;
  const base = planCity(zones, homes, vuln, e);

  it("defaults are unchanged when no reserve is given", () => {
    expect(planCity(zones, homes, vuln, e, { reservePsi: {} })).toEqual(base);
    expect(base.zones.every((z) => z.reservePsi === RESERVE_PSI)).toBe(true);
  });

  it("a stricter reserve never adds drippers and keeps at least that much pressure above 20 psi", () => {
    const strict = planCity(zones, homes, vuln, e, { reservePsi: { "third-ward": 8 } });
    const a = base.zones.find((z) => z.zoneId === "third-ward")!;
    const b = strict.zones.find((z) => z.zoneId === "third-ward")!;
    expect(b.reservePsi).toBe(8);
    expect(b.dripping).toBeLessThanOrEqual(a.dripping);
    expect(b.pressurePlan).toBeGreaterThanOrEqual(BOIL_WATER_PSI + 8 - 1e-9);
    // other zones untouched
    expect(strict.zones.filter((z) => z.zoneId !== "third-ward")).toEqual(base.zones.filter((z) => z.zoneId !== "third-ward"));
  });

  it("clamps reserves to the 3–10 psi range", () => {
    const p = planCity(zones, homes, vuln, e, { reservePsi: { heights: 99, montrose: -5 } });
    expect(p.zones.find((z) => z.zoneId === "heights")!.reservePsi).toBe(10);
    expect(p.zones.find((z) => z.zoneId === "montrose")!.reservePsi).toBe(3);
  });
});
