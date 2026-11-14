import { describe, expect, it } from "vitest";
import uri from "../../data/uri-2021.json";
import { buildHourContexts, vulnerability } from "./risk";
import { areaOf, generateCrews, generateHomes, generateZones, NEIGHBORHOODS } from "./seed/generate";
import streets from "../../data/osm-streets.json";
import { buildGraph, bufferBox, routeBetween } from "./streetGraph";
import { planCity } from "./planner";
import { assess, crewJobsAt, currentJob, nearestCrew, nearestNeighbors, proposeCrews, simulateOutreach, type AssignmentRow, type Crew } from "./household";
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

  it("exactly 5 crews in every one of the 4 areas, each depot inside its own area's box and no other", () => {
    expect(NEIGHBORHOODS).toHaveLength(4);
    for (const n of NEIGHBORHOODS) {
      const mine = crews.filter((c) => c.zone_id === n.id);
      expect(mine, n.id).toHaveLength(5);
      for (const c of mine) {
        const inBox = (b: number[]) => c.depot_lat >= b[0] && c.depot_lat <= b[2] && c.depot_lng >= b[1] && c.depot_lng <= b[3];
        expect(inBox(n.bbox), `${c.name} depot inside ${n.id}`).toBe(true);
        for (const o of NEIGHBORHOODS) if (o.id !== n.id) expect(inBox(o.bbox), `${c.name} depot not inside ${o.id}`).toBe(false);
      }
    }
  });
});

describe("crews shown per area (the map and the Crews box)", () => {
  const homes = generateHomes();
  const zoneOf = (id: string) => homes.find((h) => h.id === id)?.zone_id;
  const homeIn = (zone: string, k = 0) => homes.filter((h) => h.zone_id === zone)[k].id;
  const at = Date.parse("2021-02-16T06:00:00Z");
  const hour = (h: number) => new Date(at - h * 3_600_000).toISOString();
  const minutesOf = () => 8;
  const realNow = Date.parse("2026-11-14T12:00:00Z");
  const row = (crew_id: number, home_id: string, hoursAgo: number, created = realNow - 60_000): AssignmentRow => ({
    crew_id,
    home_id,
    plan_for: hour(hoursAgo),
    created_at: new Date(created).toISOString(),
  });
  /** Where each crew shows: the area of the home it is helping, else its own area. */
  const shownPerArea = (rows: AssignmentRow[]) => {
    const { active } = crewJobsAt(rows, crews, zoneOf, minutesOf, at, { lookbackHours: 3, realNow });
    const per: Record<string, number> = {};
    for (const c of crews) {
      const j = currentJob(active, c.id);
      const z = j ? zoneOf(j.home_id)! : c.zone_id!;
      per[z] = (per[z] ?? 0) + 1;
    }
    return per;
  };

  it("an old cross-area job (saved before crews stayed in their area) never moves a crew out of its area", () => {
    // Crews 6-10 (Montrose) and 16-20 (Meyerland) each hold an old job in Houston Heights at this hour.
    const rows = [6, 7, 8, 9, 10, 16, 17, 18, 19, 20].map((id, k) => row(id, homeIn("heights", k), 0));
    rows.push(row(1, homeIn("heights", 20), 0)); // a real Heights job
    expect(shownPerArea(rows)).toEqual({ heights: 5, montrose: 5, "third-ward": 5, meyerland: 5 });
    const jobs = crewJobsAt(rows, crews, zoneOf, minutesOf, at, { lookbackHours: 3 });
    expect(jobs.active.map((j) => j.crew_id)).toEqual([1]);
    // Their homes stay helped (no second crew) and those crews are not offered a second job this hour.
    expect(jobs.helpedHomes.size).toBe(11);
    expect([...jobs.heldThisHour].sort((a, b) => a - b)).toEqual([6, 7, 8, 9, 10, 16, 17, 18, 19, 20]);
    // An old cross-area row from an earlier hour holds nobody now.
    expect(crewJobsAt([row(6, homeIn("heights"), 1)], crews, zoneOf, minutesOf, at, { lookbackHours: 3 }).heldThisHour.size).toBe(0);
  });

  it("every area shows exactly 5 crews whatever jobs exist, and a crew shows only its newest job", () => {
    const rows = crews.flatMap((c, k) => [row(c.id, homeIn(c.zone_id!, 2 * k), 1, realNow - 120_000), row(c.id, homeIn(c.zone_id!, 2 * k + 1), 0)]);
    expect(shownPerArea(rows)).toEqual({ heights: 5, montrose: 5, "third-ward": 5, meyerland: 5 });
    const { active } = crewJobsAt(rows, crews, zoneOf, minutesOf, at, { lookbackHours: 3, realNow });
    expect(currentJob(active, 1)!.hoursAgo).toBe(0);
  });

  it("the map keeps a job that is still driving in real time after the replay moved on; the agent's view does not", () => {
    const rows = [row(1, homeIn("heights"), 2)]; // dispatched 1 real minute ago, two replay hours back
    expect(crewJobsAt(rows, crews, zoneOf, minutesOf, at, { lookbackHours: 3, realNow }).active).toHaveLength(1);
    expect(crewJobsAt(rows, crews, zoneOf, minutesOf, at, { lookbackHours: 3 }).active).toHaveLength(0);
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
