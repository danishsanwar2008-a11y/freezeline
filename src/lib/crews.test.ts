import { describe, expect, it } from "vitest";
import uri from "../../data/uri-2021.json";
import { buildHourContexts, vulnerability } from "./risk";
import { areaOf, generateCrews, generateHomes, generateZones } from "./seed/generate";
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

  it("falls back to the nearest free crew from another area when its own area has none free", () => {
    const others = crews.filter((c) => c.zone_id !== "heights");
    const pick = nearestCrew(home, others)!;
    expect(pick.zone_id).not.toBe("heights");
    const best = Math.min(...others.map((c) => milesBetween(c.depot_lat, c.depot_lng, home.lat, home.lng)));
    expect(milesBetween(pick.depot_lat, pick.depot_lng, home.lat, home.lng)).toBe(best);
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

  it("one home per crew, confirmed 'needs a crew' only, highest risk first", () => {
    expect(proposals.length).toBe(Math.min(20, proposals.length + queue.length));
    expect(new Set(proposals.map((p) => p.crew_id)).size).toBe(proposals.length);
    for (const p of proposals) expect([assessments[p.homeIdx].assessment, assessments[p.homeIdx].confidence]).toEqual(["needs_crew", "confirmed"]);
    const minProposed = Math.min(...proposals.map((p) => plan.homes[p.homeIdx].score));
    for (const i of queue) expect(plan.homes[i].score).toBeLessThanOrEqual(minProposed);
  });

  it("uses a same-area crew whenever one is free, and says so when it can't", () => {
    for (const p of proposals) {
      const crew = crews.find((c) => c.id === p.crew_id)!;
      const sameAreaWasFree = !p.fromOtherArea;
      expect(crew.zone_id === homes[p.homeIdx].zone_id).toBe(sameAreaWasFree);
    }
    // With all of an area's crews busy, its homes get crews from other areas.
    const busyHeights = new Set(crews.filter((c) => c.zone_id === "heights").map((c) => c.id));
    const again = proposeCrews(homes, plan, assessments, crews, busyHeights);
    const heightsJobs = again.proposals.filter((p) => homes[p.homeIdx].zone_id === "heights");
    expect(heightsJobs.length).toBeGreaterThan(0);
    for (const p of heightsJobs) expect(p.fromOtherArea).toBe(true);
  });

  it("homes already helped leave the queue; busy crews are skipped", () => {
    const helped = new Set(proposals.map((p) => p.home_id));
    const busy = new Set(proposals.map((p) => p.crew_id));
    const again = proposeCrews(homes, plan, assessments, crews, busy, helped);
    expect(again.proposals.some((p) => helped.has(p.home_id))).toBe(false);
    expect(again.proposals.some((p) => busy.has(p.crew_id))).toBe(false);
  });
});
