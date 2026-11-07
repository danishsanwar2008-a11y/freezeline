import { describe, expect, it } from "vitest";
import { checkCoverage, fill, renderPlan, renderSms, smsKey } from "./pregenerated";
import { buildPlanCard } from "./steps";

describe("pre-written message pack", () => {
  const c = checkCoverage();

  it("covers every fact combination in English and Spanish with no gaps or unfilled slots", () => {
    expect(c.errors).toEqual([]);
    expect(c.planCombinations).toBeGreaterThan(3000);
  });

  it("has no unused entries", () => {
    expect(c.unused).toEqual([]);
  });

  it("fills each home's details", () => {
    expect(fill("Built in {year}, {n} faucets", { year: 1938, n: 3 })).toBe("Built in 1938, 3 faucets");
    const card = buildPlanCard(
      { foundation: "slab", exterior_wall_pipes: false, attic_or_crawlspace_pipes: false, insulation: "good", outdoor_faucets: 3, year_built: 1990 },
      { action: "no_drip", faucet: null, score: 40, level: "Medium", uncovered: false },
      { temperature_f: 21.6, apparent_temperature_f: 9.2, hoursBelow20: 6 },
    );
    const r = renderPlan(card, "en");
    expect(r.headline).toBe("WATCH: Your pipes could freeze if it gets colder tonight.");
    expect(r.steps[0].text).toBe("Cover all 3 outdoor faucets.");
    expect(r.reasons[1]).toBe("It's 22°F now and feels like 9°F, after 6 hours below 20°F.");
    expect(renderPlan(card, "es").steps[0].text).toBe("Cubra sus 3 llaves de agua exteriores.");
  });

  it("Low homes get no text message; High homes not dripping get the pressure-limit text", () => {
    expect(smsKey({ level: "Low", action: "no_drip", faucet: null, uncovered: false })).toBeNull();
    expect(renderSms({ level: "High", action: "no_drip", faucet: null, uncovered: true }, "en")).toContain("pressure on your street is at its limit");
  });
});
