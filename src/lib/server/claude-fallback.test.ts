import { beforeEach, describe, expect, it, vi } from "vitest";
import { cached, cacheKey } from "./aiCache";
import { friendlyPlan, templatePlan } from "./writer";
import { buildPlanCard } from "@/lib/steps";

const card = buildPlanCard(
  { foundation: "pier_and_beam", exterior_wall_pipes: true, attic_or_crawlspace_pipes: true, insulation: "poor", outdoor_faucets: 1, year_built: 1938 },
  { action: "drip", faucet: "kitchen", score: 95, level: "High", uncovered: false },
  { temperature_f: 13, apparent_temperature_f: 3, hoursBelow20: 19 },
);

describe("Claude layer without an API key", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("falls back to the deterministic template text", async () => {
    const plan = await friendlyPlan(card, "en");
    expect(plan.source).toBe("template");
    expect(plan).toEqual(templatePlan(card, "en"));
    expect(plan.steps[2].text).toBe("Drip only the kitchen tap.");
  });
});

describe("result cache", () => {
  it("keys are stable for the same input and differ for different input", () => {
    expect(cacheKey("plan", { a: 1 })).toBe(cacheKey("plan", { a: 1 }));
    expect(cacheKey("plan", { a: 1 })).not.toBe(cacheKey("plan", { a: 2 }));
  });

  it("computes once, even for concurrent callers", async () => {
    const compute = vi.fn(async () => "value");
    const key = cacheKey("test", { n: Math.random() });
    const results = await Promise.all([cached(key, "m", compute), cached(key, "m", compute), cached(key, "m", compute)]);
    expect(results).toEqual(["value", "value", "value"]);
    expect(await cached(key, "m", compute)).toBe("value");
    expect(compute).toHaveBeenCalledTimes(1);
  });
});
