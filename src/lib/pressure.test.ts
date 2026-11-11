import { describe, expect, it } from "vitest";
import { allowedTaps, extraTapFlags, psiBand, stage2Proposal, stage2Sentence } from "./pressure";
import { zonePressure } from "./planner";
import { EXTRA_TAP_SHARE, STOP_NEW_DRIPS_PSI } from "./pressureConfig";

const zone = { id: "z", name: "Z", neighborhood: "Test Area", base_pressure_psi: 44 };
const N = 1000;
// 600 drippers (indexes 0–599); score = 100 − index/10, so index 0 is highest risk.
const drippers = Array.from({ length: 600 }, (_, i) => i);
const scores = Float32Array.from({ length: N }, (_, i) => 100 - i / 10);

describe("pressure config", () => {
  it("stops new drips at 25 psi", () => expect(STOP_NEW_DRIPS_PSI).toBe(25));
  it("colors: green above 25, amber 20–25, red below 20", () => {
    expect(psiBand(25.1)).toBe("ok");
    expect(psiBand(25)).toBe("warn");
    expect(psiBand(20)).toBe("warn");
    expect(psiBand(19.9)).toBe("bad");
  });
});

describe("extra-tap assumption (simulated)", () => {
  it("is deterministic per home and close to the configured share", () => {
    const homes = Array.from({ length: 5000 }, (_, i) => ({ id: `h-${i}` }));
    const a = extraTapFlags(homes);
    expect(extraTapFlags(homes)).toEqual(a);
    const share = a.reduce((s, x) => s + x, 0) / homes.length;
    expect(Math.abs(share - EXTRA_TAP_SHARE)).toBeLessThan(0.03);
  });
});

describe("Stage 2 proposal", () => {
  it("proposes nothing while the forecast stays at or above 25 psi", () => {
    const extra = new Uint8Array(N).fill(1);
    expect(stage2Proposal({ zone, drippers, scores, extra, homes: N, worstHour: 0, worstExposure: 0.9, forecastPsi: 25 })).toBeNull();
  });

  it("kitchen tap only is enough: no home has to stop", () => {
    // e = 0.5: allowed taps = floor((44 − 5 − 25) / 15 × 1000) = 933 ≥ 600 drippers.
    const extra = Uint8Array.from({ length: N }, (_, i) => (i % 2 === 0 ? 1 : 0)); // 300 run a second tap
    const p = stage2Proposal({ zone, drippers, scores, extra, homes: N, worstHour: 3, worstExposure: 0.5, forecastPsi: 24 })!;
    expect(p.stop).toHaveLength(0);
    expect(p.kitchenOnly).toHaveLength(300);
    expect(p.psiAfter).toBeGreaterThanOrEqual(STOP_NEW_DRIPS_PSI);
  });

  it("stops the lowest-risk drippers first, only as many as needed, and lands at or above 25 psi", () => {
    // e = 0.9: allowed taps = floor((44 − 9 − 25) / 15 × 1000) = 666.
    const extra = new Uint8Array(N).fill(1); // every dripper runs a second tap: 1,200 taps
    const e = 0.9;
    expect(allowedTaps(44, e, N)).toBe(666);
    const big = Array.from({ length: 800 }, (_, i) => i);
    const p = stage2Proposal({ zone, drippers: big, scores, extra, homes: N, worstHour: 5, worstExposure: e, forecastPsi: 18 })!;
    expect(p.stop).toHaveLength(800 - 666);
    // Lowest risk first: the very last (lowest-score) dripper is the first to stop.
    expect(p.stop[0]).toBe(799);
    expect(Math.min(...p.stop)).toBe(666);
    // Everyone who keeps dripping keeps the kitchen tap only.
    expect(p.kitchenOnly).toHaveLength(666);
    expect(p.psiAfter).toBeCloseTo(zonePressure(44, e, 666, N));
    expect(p.psiAfter).toBeGreaterThanOrEqual(STOP_NEW_DRIPS_PSI);
  });
});

describe("Stage 2 wording", () => {
  it("names only the parts that apply, with correct plurals", () => {
    expect(stage2Sentence({ area: "Montrose", stop: Array(140).fill(0), kitchenOnly: Array(60).fill(0), psiAfter: 27.2 })).toBe(
      "Montrose: stop dripping at 140 homes · kitchen tap only at 60 homes → stays at 27 psi",
    );
    expect(stage2Sentence({ area: "Third Ward", stop: [], kitchenOnly: [7], psiAfter: 26.8 })).toBe(
      "Third Ward: kitchen tap only at 1 home → stays at 27 psi",
    );
  });
});
