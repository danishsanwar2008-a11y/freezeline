import { describe, expect, it } from "vitest";
import { NEIGHBORHOODS, generateHomes, generateZones } from "./generate";

describe("seed generator", () => {
  it("is deterministic (so re-seeding upserts the same rows)", () => {
    expect(generateHomes()).toEqual(generateHomes());
  });

  it("makes 2,000 unique simulated homes inside their neighborhood boxes", () => {
    const homes = generateHomes();
    expect(homes.length).toBe(2000);
    expect(new Set(homes.map((h) => h.id)).size).toBe(homes.length);
    for (const h of homes) {
      const n = NEIGHBORHOODS.find((x) => x.id === h.zone_id)!;
      const [s, w, no, e] = n.bbox;
      expect(h.lat).toBeGreaterThanOrEqual(s);
      expect(h.lat).toBeLessThanOrEqual(no);
      expect(h.lng).toBeGreaterThanOrEqual(w);
      expect(h.lng).toBeLessThanOrEqual(e);
      expect(h.simulated).toBe(true);
    }
  });

  it("assigns every home to a seeded zone", () => {
    const zoneIds = new Set(generateZones().map((z) => z.id));
    expect(generateHomes().every((h) => zoneIds.has(h.zone_id))).toBe(true);
  });
});
