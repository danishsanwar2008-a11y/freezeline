import { describe, expect, it } from "vitest";
import streets from "../../data/osm-streets.json";
import { buildGraph, nearestNode, routeBetween, shortestPath } from "./streetGraph";
import { alongPath, driveFraction, minutesLeft, MS_PER_DRIVE_MINUTE } from "./route";
import { CREW_TRIP, milesBetween } from "./crewTrip";
import { areaOf, generateCrews, generateHomes } from "./seed/generate";

// A small test town (lat, lng): a square A-B-C-D with a long detour A-E-C.
//   D ---- C
//   |      |      E is far east
//   A ---- B
const A = [29.7, -95.4], B = [29.7, -95.39], C = [29.71, -95.39], D = [29.71, -95.4], E = [29.705, -95.35];
const nodes = [...A, ...B, ...C, ...D, ...E];
const edges = [0, 1, 1, 2, 2, 3, 3, 0, 0, 4, 4, 2];
const town = buildGraph(nodes, edges);

describe("street graph", () => {
  it("snaps a point to the nearest street point", () => {
    expect(nearestNode(town, 29.7001, -95.3999)).toBe(0);
    expect(nearestNode(town, 29.7099, -95.3901)).toBe(2);
  });

  it("finds the shortest drive, not the detour", () => {
    const sp = shortestPath(town, 0, 2)!;
    expect([0, 1, 2].join() === sp.nodes.join() || [0, 3, 2].join() === sp.nodes.join()).toBe(true);
    expect(sp.nodes).not.toContain(4);
  });

  it("returns null when two points are not connected", () => {
    const split = buildGraph([...A, ...B, ...C, ...D], [0, 1, 2, 3]);
    expect(shortestPath(split, 0, 2)).toBeNull();
  });

  it("route: miles from the streets, minutes at the winter speed, path starts at the depot and ends at the home", () => {
    const from = { lat: 29.7001, lng: -95.4001 }, to = { lat: 29.7099, lng: -95.3899 };
    const r = routeBetween(town, from, to);
    expect(r.routed).toBe(true);
    expect(r.path[0]).toEqual([-95.4001, 29.7001]);
    expect(r.path[r.path.length - 1]).toEqual([-95.3899, 29.7099]);
    // two sides of the square, about 0.62 + 0.69 mi, longer than the straight line
    expect(r.miles).toBeGreaterThan(milesBetween(from.lat, from.lng, to.lat, to.lng));
    expect(r.miles).toBeCloseTo(1.31, 1);
    expect(r.minutes).toBe(Math.round((r.miles / CREW_TRIP.mph) * 60));
  });

  it("falls back to the labeled straight-line estimate when there is no street graph", () => {
    const r = routeBetween(null, { lat: 29.7, lng: -95.4 }, { lat: 29.71, lng: -95.39 });
    expect(r.routed).toBe(false);
    expect(r.path).toHaveLength(2);
    expect(r.miles).toBeCloseTo(milesBetween(29.7, -95.4, 29.71, -95.39) * CREW_TRIP.roadFactor, 6);
  });
});

describe("the cached Houston street network", () => {
  const houston = buildGraph((streets as { nodes: number[] }).nodes, (streets as { edges: number[] }).edges);
  const crews = generateCrews();
  const homes = generateHomes();

  it("routes every crew depot to a home in its own area, along streets, never shorter than a straight line", () => {
    for (const c of crews) {
      const zone = areaOf(c.depot_lat, c.depot_lng);
      const home = homes.find((h) => h.zone_id === zone)!;
      const r = routeBetween(houston, { lat: c.depot_lat, lng: c.depot_lng }, home);
      const straight = milesBetween(c.depot_lat, c.depot_lng, home.lat, home.lng);
      expect(r.routed).toBe(true);
      expect(r.path.length).toBeGreaterThan(2);
      expect(r.miles).toBeGreaterThanOrEqual(straight * 0.999);
      expect(r.miles).toBeLessThan(straight * 3 + 1); // a real road route, not a wild detour
    }
  });

  it("routes across areas (a Meyerland crew to a Heights home)", () => {
    const meyerland = crews.find((c) => areaOf(c.depot_lat, c.depot_lng) === "meyerland")!;
    const heightsHome = homes.find((h) => h.zone_id === "heights")!;
    const r = routeBetween(houston, { lat: meyerland.depot_lat, lng: meyerland.depot_lng }, heightsHome);
    expect(r.routed).toBe(true);
    expect(r.miles).toBeGreaterThan(5);
  });
});

describe("crew drive on the simulated clock", () => {
  const t0 = Date.parse("2026-11-14T12:00:00Z");
  const job = { hoursAgo: 0, assigned_at: new Date(t0).toISOString(), minutes: 6 };

  it("moves at one simulated minute per 2 s and arrives after the drive time", () => {
    expect(driveFraction(job, t0)).toBe(0);
    expect(minutesLeft(job, t0)).toBe(6);
    expect(driveFraction(job, t0 + 3 * MS_PER_DRIVE_MINUTE)).toBeCloseTo(0.5);
    expect(minutesLeft(job, t0 + 3 * MS_PER_DRIVE_MINUTE)).toBe(3);
    expect(driveFraction(job, t0 + 10 * MS_PER_DRIVE_MINUTE)).toBe(1);
    expect(minutesLeft(job, t0 + 10 * MS_PER_DRIVE_MINUTE)).toBe(0);
  });

  it("a job from an earlier replay hour has been driving that long", () => {
    expect(driveFraction({ ...job, hoursAgo: 1 }, t0)).toBe(1);
    expect(minutesLeft({ hoursAgo: 1, assigned_at: job.assigned_at, minutes: 75 }, t0)).toBe(15);
  });

  it("positions the marker along the path by distance and returns the rest of the route", () => {
    const path: [number, number][] = [
      [-95.4, 29.7],
      [-95.39, 29.7],
      [-95.39, 29.71],
    ];
    expect(alongPath(path, 0).position).toEqual(path[0]);
    expect(alongPath(path, 1).position).toEqual(path[2]);
    const mid = alongPath(path, 0.5);
    // the legs are ~0.60 and ~0.69 mi long: halfway (0.65 mi) is just past the corner, on the second leg
    expect(mid.position[0]).toBeCloseTo(-95.39, 6);
    expect(mid.position[1]).toBeGreaterThan(29.7);
    expect(mid.position[1]).toBeLessThan(29.702);
    expect(mid.rest).toHaveLength(2);
    expect(mid.rest[0]).toEqual(mid.position);
    expect(mid.rest[mid.rest.length - 1]).toEqual(path[2]);
  });
});
