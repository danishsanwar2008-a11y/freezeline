import { describe, expect, it } from "vitest";
import { roadClass, warmBasemap, ROAD_WIDTH, type StyleLike } from "./basemapStyle";
import { MAP_LOOK } from "./riskScale";

// The Positron layers that matter, as CARTO ships them (ids and the colours being replaced).
const positron: StyleLike = {
  version: 8,
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#fafaf8" } },
    { id: "landuse_residential", type: "fill", paint: { "fill-color": "rgba(237,237,237,0.5)" } },
    { id: "park_national_park", type: "fill", paint: { "fill-color": "rgba(234,241,233,0.5)" } },
    { id: "water", type: "fill", paint: { "fill-color": "#d4dadc" } },
    { id: "road_minor_case", type: "line", paint: { "line-color": "#ddd" } },
    { id: "road_minor_fill", type: "line", paint: { "line-color": "#fdfdfd", "line-width": 3 } },
    { id: "road_pri_fill_noramp", type: "line", paint: { "line-color": "#fff" } },
    { id: "bridge_mot_fill", type: "line", paint: { "line-color": "#fff" } },
    { id: "tunnel_sec_fill", type: "line", paint: { "line-color": "#eee" } },
    { id: "road_path", type: "line", paint: { "line-color": "#d5d5d5" } },
    { id: "rail", type: "line", paint: { "line-color": "#ddd" } },
    { id: "rail_dash", type: "line", paint: { "line-color": "#fff" } },
    { id: "building", type: "fill", paint: { "fill-color": "#dfdfdf" } },
    { id: "roadname_minor", type: "symbol", paint: { "text-color": "#838383" } },
    { id: "boundary_state", type: "line", paint: { "line-color": "#ead5d7" } },
  ],
};
const G = MAP_LOOK.ground;
const layer = (s: StyleLike, id: string) => s.layers.find((l) => l.id === id)!;
const paintOf = (s: StyleLike, id: string) => layer(s, id).paint as Record<string, unknown>;

describe("warm base map (Positron recoloured)", () => {
  const warm = warmBasemap(positron);

  it("puts a warm off-white ground under everything, not near-white", () => {
    expect(paintOf(warm, "background")["background-color"]).toBe(G.land);
    expect(G.land).not.toBe("#fafaf8");
  });

  it("draws every street as one dark-gray line: no white strip, no pale edge", () => {
    expect(paintOf(warm, "road_minor_fill")["line-color"]).toBe(G.roadLocal);
    expect(paintOf(warm, "road_pri_fill_noramp")["line-color"]).toBe(G.roadMain);
    expect(paintOf(warm, "bridge_mot_fill")["line-color"]).toBe(G.roadHighway);
    // The edge is the same line (zoomed out, Positron draws local streets only through it).
    expect(paintOf(warm, "road_minor_case")["line-color"]).toBe(G.roadLocal);
    expect(paintOf(warm, "road_minor_case")["line-width"]).toEqual(paintOf(warm, "road_minor_fill")["line-width"]);
    expect((layer(warm, "road_path").layout as Record<string, unknown>).visibility).toBe("none");
    for (const l of warm.layers) {
      const p = (l.paint ?? {}) as Record<string, unknown>;
      const hiddenLayer = (l.layout as Record<string, unknown> | undefined)?.visibility === "none";
      if (l.type === "line" && !hiddenLayer) expect(String(p["line-color"]), String(l.id)).not.toMatch(/^#(fff|fdfdfd|eee|ffffff)$/i);
    }
  });

  it("makes highways boldest and local streets thinnest at every zoom", () => {
    const at = (w: { stops: number[][] }, z: number) => w.stops.reduce((v, [sz, sw]) => (z >= sz ? sw : v), 0);
    for (const z of [13, 15, 17]) {
      expect(at(ROAD_WIDTH.highway, z)).toBeGreaterThan(at(ROAD_WIDTH.main, z));
      expect(at(ROAD_WIDTH.main, z)).toBeGreaterThan(at(ROAD_WIDTH.local, z));
    }
    expect(paintOf(warm, "tunnel_sec_fill")["line-opacity"]).toBe(0.45);
  });

  it("keys road classes by Positron's layer ids", () => {
    expect(roadClass("road_service_fill")).toBe("local");
    expect(roadClass("road_sec_fill_noramp")).toBe("main");
    expect(roadClass("road_trunk_fill_ramp")).toBe("highway");
    expect(roadClass("road_minor_case")).toBe("local");
    expect(roadClass("bridge_mot_case")).toBe("highway");
    expect(roadClass("road_path")).toBeNull();
    expect(roadClass("building")).toBeNull();
  });

  it("recolours buildings, water, parks and labels, and leaves the rest alone", () => {
    expect(paintOf(warm, "building")["fill-color"]).toBe(G.building);
    expect(paintOf(warm, "water")["fill-color"]).toBe(G.water);
    expect(paintOf(warm, "park_national_park")["fill-color"]).toBe(G.park);
    expect(paintOf(warm, "roadname_minor")["text-color"]).toBe(G.label);
    expect(layer(warm, "boundary_state")).toEqual(layer(positron, "boundary_state"));
  });

  it("never changes the style it was given, and gives the same result twice", () => {
    const before = JSON.stringify(positron);
    warmBasemap(positron);
    expect(JSON.stringify(positron)).toBe(before);
    expect(warmBasemap(warmBasemap(positron))).toEqual(warm);
  });
});
