import "server-only";
import { getCity, monitorAt, planAt, URI_HOURS, type City } from "./cityState";
import { DEFAULT_CREWS } from "./outreachState";
import { routedTrip } from "./crewRoutes";
import { assess, nearestNeighbors, outreachSummary, proposeCrews, simulateOutreach } from "@/lib/household";
import { STATUS_CODE } from "@/lib/riskScale";
import type { PresentData } from "@/components/present/types";

// Everything the /present deck shows, built once per server from the same functions the console and
// tests use (risk engine, planner, pressure monitor, outreach simulation, crew routing). Nothing is
// recomputed differently or invented here: this only selects and packs results for the browser.
// The browser gets coordinates, each home's area and precomputed vulnerability, and results; it never
// gets household details. Risk levels in the browser come from the same scoreFrom()/levelFor().

const r = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

function build(city: City): PresentData {
  const { homes, zones, model } = city;
  const zoneIndex = new Map(zones.map((z, i) => [z.id, i]));
  const hours = model.hours.length;

  // The storm's worst hour: the most High-risk homes (the replay's own counts).
  let peak = 0;
  model.counts.forEach((c, i) => {
    if (c[0] > model.counts[peak][0]) peak = i;
  });

  // Pressure per area per hour: FreezeLine's plan vs everyone dripping vs no one dripping (planner.ts).
  const plan = zones.map(() => [] as number[]);
  const blanket = zones.map(() => [] as number[]);
  const noDrip = zones.map(() => [] as number[]);
  let planBelow20 = 0, blanketBelow20 = 0;
  for (let h = 0; h < hours; h++) {
    for (const zp of planAt(city, h).zones) {
      const zi = zoneIndex.get(zp.zoneId)!;
      plan[zi].push(r(zp.pressurePlan, 1));
      blanket[zi].push(r(zp.pressureBlanket, 1));
      noDrip[zi].push(r(zp.pressureNoDrip, 1));
      if (zp.pressurePlan < 20) planBelow20++;
      if (zp.pressureBlanket < 20) blanketBelow20++;
    }
  }
  const peakPlan = planAt(city, peak);

  // Stage 2 at the peak (pressure monitor: drips held, some homes running a second tap).
  const monitor = monitorAt(city, peak).map((a) => ({
    zone: zoneIndex.get(a.zoneId)!,
    nowPsi: r(a.nowPsi, 1),
    dripping: a.dripping,
    extraTaps: a.extraTaps,
    stage2: a.stage2 ? { stop: a.stage2.stop.length, kitchenOnly: a.stage2.kitchenOnly.length, psiAfter: r(a.stage2.psiAfter, 1) } : null,
  }));

  // Outreach at the peak (simulated funnel) and the crew proposals it leads to, routed on real streets.
  const outreach = simulateOutreach(homes, peakPlan, nearestNeighbors(homes));
  const assessments = outreach.map(assess);
  const summary = outreachSummary(outreach, assessments);
  const { proposals, queue } = proposeCrews(homes, peakPlan, assessments, DEFAULT_CREWS);
  const crews = proposals.map((p) => {
    const crew = DEFAULT_CREWS.find((c) => c.id === p.crew_id)!;
    const route = routedTrip(crew, homes[p.homeIdx]);
    return {
      name: crew.name,
      zone: zoneIndex.get(crew.zone_id ?? "") ?? 0,
      depot: [r(crew.depot_lng, 6), r(crew.depot_lat, 6)] as [number, number],
      home: p.homeIdx,
      path: route.path.map(([lng, lat]) => [r(lng, 6), r(lat, 6)] as [number, number]),
      minutes: route.minutes,
      miles: r(route.miles, 1),
    };
  });

  return {
    zones: zones.map((z) => ({ id: z.id, name: z.neighborhood, basePsi: z.base_pressure_psi })),
    hours: model.hours.map((h, i) => ({
      time: h.time,
      temp: r(h.temperature_f, 1),
      feels: r(h.apparent_temperature_f, 1),
      below20: model.contexts[i].hoursBelow20,
    })),
    peak,
    homes: {
      lng: homes.map((h) => r(h.lng, 5)),
      lat: homes.map((h) => r(h.lat, 5)),
      zone: homes.map((h) => zoneIndex.get(h.zone_id) ?? 0),
      vuln: Array.from(model.vuln, (v) => r(v, 3)),
    },
    exposure: zones.map((z) => (model.zoneContexts[z.id] ?? model.contexts).map((c) => r(c.exposure, 4))),
    counts: model.counts,
    hexes: model.hexes.map((x) => ({ h3: x.h3, homes: x.homeIdx })),
    pressure: { plan, blanket, noDrip, planBelow20, blanketBelow20, areaHours: zones.length * hours },
    peakZones: peakPlan.zones.map((z) => ({
      zone: zoneIndex.get(z.zoneId)!,
      high: z.high,
      dripping: z.dripping,
      budget: z.dripBudget,
      plan: r(z.pressurePlan, 1),
      blanket: r(z.pressureBlanket, 1),
      noDrip: r(z.pressureNoDrip, 1),
    })),
    monitor,
    outreach: {
      texted: summary.texted,
      called: summary.called,
      doorChecks: summary.doorChecks,
      neighborFlags: summary.neighborFlags,
      status: summary.status,
      needsCrew: assessments.filter((a) => a.assessment === "needs_crew").length,
      crewQueue: queue.length,
      codes: assessments.map((a) => STATUS_CODE[a.status]).join(""),
      contact: outreach.map((o) => (o.door_check ? "d" : o.called ? "c" : o.contact === "texted" ? "t" : "-")).join(""),
    },
    crews,
  };
}

let cached: Promise<PresentData> | null = null;
/** Built once per server instance (the inputs are fixed: the Uri replay and the seeded homes). */
export function getPresentData(): Promise<PresentData> {
  cached ??= getCity()
    .then(build)
    .catch((err) => {
      cached = null;
      throw err;
    });
  return cached;
}

export const PRESENT_HOURS = URI_HOURS.length;
