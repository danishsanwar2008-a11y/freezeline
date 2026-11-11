import "server-only";
import uri from "../../../data/uri-2021.json";
import uriNeighborhoods from "../../../data/uri-2021-neighborhoods.json";
import { fetchConsoleHomes, fetchConsoleZones, type ConsoleZone } from "@/lib/homes";
import { buildReplay, homeContext, zoneExposures, type ConsoleHome, type ReplayModel } from "@/lib/replay";
import { planCity, type CityPlan } from "@/lib/planner";
import type { WeatherSeries } from "@/lib/weather";
import { extraTapFlags, pressureMonitor, type AreaPressure } from "@/lib/pressure";

export const URI_HOURS = (uri as WeatherSeries).hours;
const ZONE_HOURS = Object.fromEntries(
  Object.entries((uriNeighborhoods as unknown as { zones: Record<string, WeatherSeries> }).zones).map(([id, s]) => [id, s.hours]),
);

export interface City {
  homes: ConsoleHome[];
  zones: ConsoleZone[];
  model: ReplayModel;
  byId: Map<string, number>;
}

let city: Promise<City> | null = null;
let loadedAt = 0;
const TTL_MS = 10 * 60 * 1000;

/** Homes + zones (simulated) and the Uri replay model, loaded once per server instance. */
export function getCity(): Promise<City> {
  if (!city || Date.now() - loadedAt > TTL_MS) {
    loadedAt = Date.now();
    city = (async () => {
      const [homes, zones] = await Promise.all([fetchConsoleHomes(), fetchConsoleZones()]);
      const model = buildReplay(homes, URI_HOURS, ZONE_HOURS);
      return { homes, zones, model, byId: new Map(homes.map((h, i) => [h.id, i])) };
    })().catch((err) => {
      city = null;
      throw err;
    });
  }
  return city;
}

/** Index of a replay time like "2021-02-16T06:00", or -1. */
export const hourIndex = (time: string) => URI_HOURS.findIndex((h) => h.time === time);

/** Feb 2021 Houston wall-clock time -> timestamptz (CST, UTC-6). */
export const toTimestamp = (time: string) => `${time}:00-06:00`;

export function planAt(c: City, hour: number, reservePsi: Record<string, number> = {}): CityPlan {
  return planCity(c.zones, c.homes, c.model.vuln, zoneExposures(c.model, hour), { reservePsi });
}

export function weatherFor(c: City, homeIdx: number, hour: number) {
  return homeContext(c.model, c.homes[homeIdx], hour);
}

// ---------- pressure monitor (same math as the console's panel) ----------

const extraCache = new WeakMap<City, Uint8Array>();
const planCache = new WeakMap<City, Map<number, CityPlan>>();

/** Pressure monitor + Stage 2 proposals for every area at one replay hour (standard reserves). */
export function monitorAt(c: City, hour: number): AreaPressure[] {
  let extra = extraCache.get(c);
  if (!extra) extraCache.set(c, (extra = extraTapFlags(c.homes)));
  let plans = planCache.get(c);
  if (!plans) planCache.set(c, (plans = new Map()));
  const cached = plans;
  return pressureMonitor({
    zones: c.zones,
    homes: c.homes,
    extra,
    hour,
    hours: c.model.hours.length,
    planAt: (h) => cached.get(h) ?? cached.set(h, planAt(c, h)).get(h)!,
    exposureAt: (h) => zoneExposures(c.model, h),
  });
}
