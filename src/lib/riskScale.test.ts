import { describe, expect, it } from "vitest";
import { NEED_STEPS, needRgba, needStep } from "./riskScale";

describe("hex need steps (map + legend share one scale)", () => {
  it("puts each share in exactly one labeled step", () => {
    expect(needStep(0)).toBe(0);
    expect(needStep(0.249)).toBe(0);
    expect(needStep(0.25)).toBe(1);
    expect(needStep(0.5)).toBe(2);
    expect(needStep(0.749)).toBe(2);
    expect(needStep(0.75)).toBe(3);
    expect(needStep(1)).toBe(3);
  });

  it("draws the step's own color, darker to brighter violet as need rises", () => {
    expect(needRgba(0.9)).toEqual(NEED_STEPS[3].fill);
    const alpha = NEED_STEPS.map((s) => s.fill[3]);
    expect([...alpha].sort((a, b) => a - b)).toEqual(alpha);
    expect(NEED_STEPS.map((s) => s.label)).toEqual(["Under 25%", "25–49%", "50–74%", "75–100%"]);
  });
});
