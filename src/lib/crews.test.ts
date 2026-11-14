import { describe, expect, it } from "vitest";
import uri from "../../data/uri-2021.json";
import { buildHourContexts, vulnerability } from "./risk";
import { areaOf, generateCrews, generateHomes, generateZones, NEIGHBORHOODS } from "./seed/generate";
import streets from "../../data/osm-streets.json";
import { buildGraph, bufferBox, routeBetween } from "./streetGraph";
import { planCity } from "./planner";
import { assess, nearestCrew, nearestNeighbors, proposeCrews, simulateOutreach, type Crew } from "./household";
import { CREW_TRIP, crewTrip, jobActive, milesBetween } from "./crewTrip";
import type { WeatherSeries } from "./weather";

const crews: Crew[] = generateCrews().map((c) => ({ ...c, zone_id: areaOf(c.depot_lat, c.depot_lng) }));

describe("20 sample crews", () => {
  it("5 per area, each depot inside its own area", () => {
    expect(crews).toHaveLength(20);
    const per = new Map<string, number>();
    for (const c of crews) per.set(c.zone_id!, (per.get(c.zone_id!) ?? 0) + 1);
    expect([...per.values()]).toEqual([5, 5, 5, 5]);
    expect(new Set(crews.map((c) => c.id)).size).toBe(20);
  });
});

describe("trip math (simulated)", () => {
  it("road miles = straight line x 1.3, minutes at 15 mph", () => {
    const depot = { depot_lat: 29.79, depot_lng: -95.4 };
    const home = { lat: 29.79 + 0.0133, lng: -95.4 }; // ~0.92 mi north
    const straight = milesBetween(depot.depot_lat, depot.depot_lng, home.lat, home.lng);
    expect(straight).toBeCloseTo(0.92, 1);
    const t = crewTrip(depot, home);
    expect(t.miles).toBeCloseTo(straight * CREW_TRIP.roadFactor, 5);
    expect(t.minutes).toBe(Math.round((t.miles / CREW_TRIP.mph) * 60)); // 1.2 mi -> ~5 min
  });

  it("a job lasts the drive + 30 min on site, then the crew is back on standby", () => {
    expect(jobActive({ hoursAgo: 0, minutes: 6 })).toBe(true);
    expect(jobActive({ hoursAgo: 1, minutes: 6 })).toBe(false); // finished last hour
    expect(jobActive({ hoursAgo: 1, minutes: 45 })).toBe(true); // long cross-area drive still running
    expect(jobActive({ hoursAgo: 2, minutes: 45 })).toBe(false);
  });
});

describe("nearest crew", () => {
  const heights = crews.filter((c) => c.zone_id === "heights");
  const home = { lat: heights[0].depot_lat + 0.001, lng: heights[0].depot_lng, zone_id: "heights" };

  it("picks the nearest free crew in the home's own area", () => {
    expect(nearestCrew(home, crews)!.id).toBe(heights[0].id);
    // Even when a crew from another area is physically closer, the home's own area goes first.
    const closerOutsider: Crew = { id: 99, name: "Crew 99", depot_lat: home.lat, depot_lng: home.lng, zone_id: "montrose" };
    expect(nearestCrew(home, [closerOutsider, ...heights])!.zone_id).toBe("heights");
  });

  it("never takes a crew from another area: with its own area's crews all busy, the home waits", () => {
    const others = crews.filter((c) => c.zone_id !== "heights");
    expect(nearestCrew(home, others)).toBeNull();
    // Even one free Heights crew far away beats a closer crew from another area.
    const far = heights[heights.length - 1];
    expect(nearestCrew(home, [...others, far])!.id).toBe(far.id);
    expect(milesBetween(far.depot_lat, far.depot_lng, home.lat, home.lng)).toBeGreaterThan(0);
  });

  it("returns null when every crew is busy", () => expect(nearestCrew(home, [])).toBeNull());
});

describe("crew proposals at the Uri peak (sample data)", () => {
  const hours = (uri as WeatherSeries).hours;
  const ctx = buildHourContexts(hours);
  const homes = generateHomes();
  const plan = planCity(generateZones(), homes, homes.map(vulnerability), ctx[hours.findIndex((h) => h.time === "2021-02-16T06:00")].exposure);
  const assessments = simulateOutreach(homes, plan, nearestNeighbors(homes)).map(assess);
  const { proposals, queue } = proposeCrews(homes, plan, assessments, crews);

  it("one home per crew, confirmed 'needs a crew' only, highest risk first within each area", () => {
    expect(new Set(proposals.map((p) => p.crew_id)).size).toBe(proposals.length);
    for (const p of proposals) expect([assessments[p.homeIdx].assessment, assessments[p.homeIdx].confidence]).toEqual(["needs_crew", "confirmed"]);
    for (const z of new Set(crews.map((c) => c.zone_id!))) {
      const got = proposals.filter((p) => homes[p.homeIdx].zone_id === z);
      const waits = queue.filter((i) => homes[i].zone_id === z);
      expect(got.length).toBe(Math.min(5, got.length + waits.length)); // every free crew in the area is used first
      if (!got.length) continue;
      const minProposed = Math.min(...got.map((p) => plan.homes[p.homeIdx].score));
      for (const i of waits) expect(plan.homes[i].score).toBeLessThanOrEqual(minProposed);
    }
  });

  it("every crew works only in its own area, at most 5 jobs per area", () => {
    const perArea = new Map<string, number>();
    for (const p of proposals) {
      const crew = crews.find((c) => c.id === p.crew_id)!;
      expect(crew.zone_id).toBe(homes[p.homeIdx].zone_id);
      perArea.set(crew.zone_id!, (perArea.get(crew.zone_id!) ?? 0) + 1);
    }
    for (const n of perArea.values()) expect(n).toBeLessThanOrEqual(5);
  });

  it("with all 5 of an area's crews busy, its homes wait in that area's queue, highest risk first", () => {
    const busyHeights = new Set(crews.filter((c) => c.zone_id === "heights").map((c) => c.id));
    const again = proposeCrews(homes, plan, assessments, crews, busyHeights);
    expect(again.proposals.some((p) => homes[p.homeIdx].zone_id === "heights")).toBe(false);
    const heightsQueue = again.queue.filter((i) => homes[i].zone_id === "heights");
    const heightsNeeds = assessments.filter((a, i) => homes[i].zone_id === "heights" && a.assessment === "needs_crew" && a.confidence === "confirmed").length;
    expect(heightsQueue.length).toBe(heightsNeeds);
    for (let k = 1; k < heightsQueue.length; k++) expect(plan.homes[heightsQueue[k - 1]].score).toBeGreaterThanOrEqual(plan.homes[heightsQueue[k]].score);
    // The other areas are untouched: still one job per free crew there.
    expect(again.proposals.length).toBe(proposals.filter((p) => homes[p.homeIdx].zone_id !== "heights").length);
  });

  it("homes already helped leave the queue; busy crews are skipped", () => {
    const helped = new Set(proposals.map((p) => p.home_id));
    const busy = new Set(proposals.map((p) => p.crew_id));
    const again = proposeCrews(homes, plan, assessments, crews, busy, helped);
    expect(again.proposals.some((p) => helped.has(p.home_id))).toBe(false);
    expect(again.proposals.some((p) => busy.has(p.crew_id))).toBe(false);
  });
});

describe("routes stay on the crew's own area's streets (real OpenStreetMap data)", () => {
  const g = buildGraph((streets as { nodes: number[]; edges: number[] }).nodes, (streets as { nodes: number[]; edges: number[] }).edges);
  const homes = generateHomes();
  const BUFFER_M = 150;

  it("every depot to 6 homes in its area: routed, and every point inside the area + 150 m", () => {
    let routed = 0, total = 0;
    for (const c of crews) {
      const box = bufferBox(NEIGHBORHOODS.find((n) => n.id === c.zone_id)!.bbox, BUFFER_M);
      const mine = homes.filter((h) => h.zone_id === c.zone_id);
      for (let k = 0; k < 6; k++) {
        const h = mine[Math.floor((k * mine.length) / 6)];
        const r = routeBetween(g, { lat: c.depot_lat, lng: c.depot_lng }, h, box);
        total++;
        if (!r.routed) continue;
        routed++;
        // The street part (every point but the walk-in to the home) stays in the box.
        for (const [lng, lat] of r.path.slice(0, -1)) {
          expect(lat).toBeGreaterThanOrEqual(box[0]);
          expect(lat).toBeLessThanOrEqual(box[2]);
          expect(lng).toBeGreaterThanOrEqual(box[1]);
          expect(lng).toBeLessThanOrEqual(box[3]);
        }
      }
    }
    expect(routed / total).toBeGreaterThanOrEqual(0.95);
  });
});
