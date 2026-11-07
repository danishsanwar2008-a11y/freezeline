import "server-only";
import uri from "../../../data/uri-2021.json";
import uriNeighborhoods from "../../../data/uri-2021-neighborhoods.json";
import { fetchConsoleHomes, fetchConsoleZones, type ConsoleZone } from "@/lib/homes";
import { buildReplay, homeContext, zoneExposures, type ConsoleHome, type ReplayModel } from "@/lib/replay";
import { planCity, type CityPlan } from "@/lib/planner";
import type { WeatherSeries } from "@/lib/weather";

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
