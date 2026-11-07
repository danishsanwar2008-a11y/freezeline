import { describe, expect, it } from "vitest";
import { NEIGHBORHOODS, OSM_HOMES, generateHomes, generateZones, shortStreet } from "./generate";

const homes = generateHomes();
const share = (f: (h: (typeof homes)[number]) => boolean, list = homes) => list.filter(f).length / list.length;

describe("seed generator (real OSM footprints + simulated details)", () => {
  it("is deterministic (so re-seeding upserts the same rows)", () => {
    expect(generateHomes()).toEqual(homes);
  });

  it("makes one unique home per cached OSM footprint, inside its neighborhood box", () => {
    expect(homes.length).toBe(OSM_HOMES.length);
    expect(homes.length).toBeGreaterThan(5000);
    expect(new Set(homes.map((h) => h.id)).size).toBe(homes.length);
    for (const h of homes) {
      const [s, w, no, e] = NEIGHBORHOODS.find((x) => x.id === h.zone_id)!.bbox;
      expect(h.lat >= s && h.lat <= no && h.lng >= w && h.lng <= e).toBe(true);
      expect(h.simulated).toBe(true);
      expect(h.street.length).toBeGreaterThan(0);
    }
  });

  it("assigns every home to a seeded zone", () => {
    const zoneIds = new Set(generateZones().map((z) => z.id));
    expect(homes.every((h) => zoneIds.has(h.zone_id))).toBe(true);
  });

  it("has realistic distributions", () => {
    expect(share((h) => h.foundation === "pier_and_beam")).toBeGreaterThan(0.2);
    expect(share((h) => h.foundation === "pier_and_beam")).toBeLessThan(0.6);
    expect(share((h) => h.elderly)).toBeGreaterThan(0.12);
    expect(share((h) => h.elderly)).toBeLessThan(0.32);
    expect(share((h) => h.mobility_limited)).toBeLessThan(0.15);
    expect(share((h) => h.lives_alone)).toBeGreaterThan(0.15);
    expect(share((h) => h.lives_alone)).toBeLessThan(0.4);
    // living alone is more common among elderly households
    expect(share((h) => h.lives_alone, homes.filter((h) => h.elderly))).toBeGreaterThan(share((h) => h.lives_alone, homes.filter((h) => !h.elderly)));
    expect(homes.every((h) => !h.has_faucet_shutoff || h.outdoor_faucets > 0)).toBe(true);
  });

  it("shortens street names the way people write them", () => {
    expect(shortStreet("East 27th Street")).toBe("E 27th St");
    expect(shortStreet("Westheimer Road")).toBe("Westheimer Rd");
  });
});
