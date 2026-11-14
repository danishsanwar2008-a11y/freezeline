import { describe, expect, it } from "vitest";
import { areaAt, matchToHome, metersBetween, nominatimParams, parseNominatim, streetKey, type MatchHome } from "./addressMatch";
import { OSM_HOMES } from "./seed/generate";

// A real footprint from the data set, and points offset from it by a known distance.
const home = OSM_HOMES.find((h) => h.zone_id === "heights" && h.street)!;
const homes: MatchHome[] = OSM_HOMES.map((h) => ({ id: h.id, zone_id: h.zone_id, lat: h.lat, lng: h.lng, street: h.street }));
const northOf = (lat: number, m: number) => lat + m / 111_195;

describe("streetKey", () => {
  it("treats spelled-out and short street names the same", () => {
    expect(streetKey("East 27th Street")).toBe("e 27th st");
    expect(streetKey("E. 27th St")).toBe("e 27th st");
    expect(streetKey("heights boulevard")).toBe(streetKey("Heights Blvd"));
  });
});

describe("matchToHome", () => {
  it("a point on a known footprint is a confirmed match", () => {
    const r = matchToHome({ lat: home.lat, lng: home.lng, road: null }, homes);
    expect(r).toMatchObject({ status: "matched", homeId: home.id, zoneId: "heights", distanceM: 0 });
  });

  it("a point within 40 m of a footprint still matches it", () => {
    const r = matchToHome({ lat: northOf(home.lat, 10), lng: home.lng, road: home.street }, homes);
    expect(r.status).toBe("matched");
    expect(r.distanceM).toBeLessThanOrEqual(40);
  });

  it("farther away on the same street links to the nearest home on that street (estimated)", () => {
    // Find a point in the area that is > 40 m from every home but < 250 m from one on its street.
    const lonely = OSM_HOMES.filter((h) => h.zone_id === "heights" && h.street).find((h) => {
      const p = { lat: northOf(h.lat, 120), lng: h.lng };
      return OSM_HOMES.every((o) => metersBetween(p.lat, p.lng, o.lat, o.lng) > 40);
    });
    expect(lonely).toBeTruthy();
    const r = matchToHome({ lat: northOf(lonely!.lat, 120), lng: lonely!.lng, road: lonely!.street }, homes);
    expect(r.status).toBe("nearby_on_street");
    expect(homes.find((h) => h.id === r.homeId)!.street).toBe(lonely!.street);
    expect(r.distanceM).toBeGreaterThan(40);
    expect(r.distanceM).toBeLessThanOrEqual(250);
  });

  it("downtown Houston is outside the FreezeLine areas", () => {
    const r = matchToHome({ lat: 29.7604, lng: -95.3698, road: "Main Street" }, homes);
    expect(r).toMatchObject({ status: "outside_area", homeId: null, zoneId: null });
    expect(areaAt(29.7604, -95.3698)).toBeNull();
  });
});

describe("Nominatim", () => {
  it("asks for one structured US address in Texas", () => {
    const p = nominatimParams({ addressLine1: "1001 Heights Blvd", city: "Houston", zip: "77008" });
    expect(Object.fromEntries(p)).toMatchObject({ street: "1001 Heights Blvd", city: "Houston", state: "TX", postalcode: "77008", countrycodes: "us", limit: "1" });
  });

  it("reads the point and street from a hit, and null when nothing is found", () => {
    const hit = [{ lat: "29.7889770", lon: "-95.3977510", address: { road: "Heights Boulevard", house_number: "1001" } }];
    expect(parseNominatim(hit)).toEqual({ lat: 29.788977, lng: -95.397751, road: "Heights Boulevard" });
    expect(parseNominatim([])).toBeNull();
    expect(parseNominatim({ error: "x" })).toBeNull();
  });
});
