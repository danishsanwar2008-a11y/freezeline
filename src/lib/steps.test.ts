import { describe, expect, it } from "vitest";
import type { HomePlan } from "./planner";
import { buildPlanCard, displayLevel, type CardHome } from "./steps";

const exposedHome: CardHome = {
  foundation: "pier_and_beam",
  exterior_wall_pipes: true,
  attic_or_crawlspace_pipes: true,
  insulation: "poor",
  outdoor_faucets: 1,
  year_built: 1938,
};
const snugHome: CardHome = {
  foundation: "slab",
  exterior_wall_pipes: false,
  attic_or_crawlspace_pipes: false,
  insulation: "good",
  outdoor_faucets: 0,
  year_built: 2015,
};
const cold = { temperature_f: 13.4, apparent_temperature_f: 3.1, hoursBelow20: 19 };

const plan = (p: Partial<HomePlan>): HomePlan => ({ action: "no_drip", faucet: null, score: 0, level: "Low", uncovered: false, ...p });

describe("plan card", () => {
  it("shows Medium as Watch", () => {
    expect(displayLevel("Medium")).toBe("Watch");
  });

  it("a dripping High home gets a High headline, exactly 3 steps, and the drip step last", () => {
    const card = buildPlanCard(exposedHome, plan({ action: "drip", faucet: "kitchen", level: "High", score: 95 }), cold);
    expect(card.level).toBe("High");
    expect(card.headline).toBe("Likely to freeze tonight if nothing changes.");
    expect(card.steps).toHaveLength(3);
    expect(card.steps[2].text).toBe("Drip only the kitchen tap.");
    expect(card.steps[2].detail).toContain("don't drip the others");
    expect(card.steps.map((s) => s.text)).toContain("Close the crawlspace vents.");
  });

  it("a low-risk home is told not to drip, to protect neighbors' pressure", () => {
    const card = buildPlanCard(snugHome, plan({ level: "Low" }), cold);
    expect(card.level).toBe("Low");
    expect(card.steps).toHaveLength(3);
    expect(card.steps[2].text).toBe("Don't drip tonight.");
    expect(card.steps[2].detail).toContain("neighbors' water pressure");
  });

  it("an uncovered High home is told why it isn't dripping", () => {
    const card = buildPlanCard(exposedHome, plan({ level: "High", uncovered: true, score: 80 }), cold);
    expect(card.steps[2].detail).toContain("pressure on your street is at its limit");
  });

  it("gives 3 reasons with the three source tags, in order", () => {
    const card = buildPlanCard(exposedHome, plan({ level: "High" }), cold);
    expect(card.reasons.map((r) => r.source)).toEqual(["Property record", "Forecast", "Photo: not sent yet"]);
    expect(card.reasons[0].text).toContain("pier-and-beam");
    expect(card.reasons[1].text).toContain("19 hours below 20°F");
  });

  it("never shows a numeric risk score", () => {
    const card = buildPlanCard(exposedHome, plan({ action: "drip", faucet: "kitchen", level: "High", score: 95 }), cold);
    expect(JSON.stringify(card)).not.toContain("95");
  });

  it("highlights the exposed pipe runs for the diagram", () => {
    expect(buildPlanCard(exposedHome, plan({ level: "High" }), cold).exposed).toEqual(["crawlspace", "exterior_wall", "outdoor_faucet"]);
    expect(buildPlanCard(snugHome, plan({}), cold).exposed).toEqual([]);
  });
});

describe("photo check updates the plan", () => {
  const withFaucet = { ...snugHome, outdoor_faucets: 1 };
  const watch = plan({ level: "Medium" });

  it("a covered faucet drops the cover step and says it was confirmed", () => {
    const before = buildPlanCard(withFaucet, watch, cold);
    const after = buildPlanCard(withFaucet, watch, cold, "covered");
    expect(before.steps.map((s) => s.text)).toContain("Cover the outdoor faucet.");
    expect(after.steps.map((s) => s.text)).not.toContain("Cover the outdoor faucet.");
    expect(after.steps).toHaveLength(3);
    expect(after.reasons[2]).toEqual({ text: "Confirmed from your photo: your outdoor faucet is covered.", source: "Photo: confirmed" });
    expect(after.exposed).not.toContain("outdoor_faucet");
  });

  it("a bare faucet makes covering it step 1", () => {
    const card = buildPlanCard(exposedHome, plan({ action: "drip", faucet: "kitchen", level: "High" }), cold, "bare");
    expect(card.steps[0].text).toBe("Cover the outdoor faucet.");
    expect(card.steps[2].text).toBe("Drip only the kitchen tap.");
    expect(card.reasons[2].source).toBe("Photo: confirmed");
  });

  it("an unclear photo keeps the plan and asks for another photo", () => {
    const card = buildPlanCard(withFaucet, watch, cold, "unclear");
    expect(card.steps.map((s) => s.text)).toContain("Cover the outdoor faucet.");
    expect(card.reasons[2].source).toBe("Photo: unclear");
  });
});
