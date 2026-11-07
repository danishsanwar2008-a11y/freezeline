import { afterEach, describe, expect, it, vi } from "vitest";
import { cached, cacheKey } from "./aiCache";
import { friendlyPlan, smsDraft } from "./writer";
import { getProvider, photoCheckAvailable } from "./provider";
import { getClaude } from "./claude";
import { buildPlanCard } from "@/lib/steps";
import { renderPlan } from "@/lib/pregenerated";

const card = buildPlanCard(
  { foundation: "pier_and_beam", exterior_wall_pipes: true, attic_or_crawlspace_pipes: true, insulation: "poor", outdoor_faucets: 1, year_built: 1938 },
  { action: "drip", faucet: "kitchen", score: 95, level: "High", uncovered: false },
  { temperature_f: 13, apparent_temperature_f: 3, hoursBelow20: 19 },
);

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("provider switch", () => {
  it("defaults to pregenerated", () => {
    delete process.env.LLM_PROVIDER;
    expect(getProvider()).toBe("pregenerated");
  });

  it("never creates a Claude client unless LLM_PROVIDER=anthropic, even with a key present", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    for (const p of ["pregenerated", "gemini"]) {
      process.env.LLM_PROVIDER = p;
      expect(getClaude()).toBeNull();
    }
  });

  it("only offers the photo check when the chosen provider has a key", () => {
    process.env.LLM_PROVIDER = "pregenerated";
    process.env.GEMINI_API_KEY = "g";
    expect(photoCheckAvailable()).toBe(false);
    process.env.LLM_PROVIDER = "gemini";
    expect(photoCheckAvailable()).toBe(true);
    delete process.env.GEMINI_API_KEY;
    expect(photoCheckAvailable()).toBe(false);
  });
});

describe("pre-written messages (default, no API)", () => {
  it("plan wording comes from data/messages.json in English and Spanish", async () => {
    delete process.env.LLM_PROVIDER;
    const en = await friendlyPlan(card, "en");
    const es = await friendlyPlan(card, "es");
    expect(en).toEqual(renderPlan(card, "en"));
    expect(en.source).toBe("pregenerated");
    expect(en.headline).toBe("HIGH: Your pipes are likely to freeze tonight unless you act.");
    expect(en.steps[2].text).toBe("Drip only your kitchen tap.");
    expect(en.reasons[0]).toContain("built in 1938");
    expect(es.headline.startsWith("ALTO:")).toBe(true);
    expect(es.steps[2].text).toBe("Deje gotear solo la llave de la cocina.");
  });

  it("SMS text is pre-written, keeps the link slot and the simulated label", async () => {
    delete process.env.LLM_PROVIDER;
    const { text, source } = await smsDraft({ level: "High", action: "drip", faucet: "kitchen", uncovered: false });
    expect(source).toBe("pregenerated");
    expect(text).toContain("{link}");
    expect(text).toContain("(simulated)");
    expect(text).toContain("kitchen tap");
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
