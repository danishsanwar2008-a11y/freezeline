// Precomputes everything the console replay needs, once, so scrubbing/playing is just array lookups.
// ~20,000 homes x 168 hours ≈ 3.4M scores, each computed once (one pass per hour feeds counts and hex averages).

import { latLngToCell } from "h3-js";
import {
  buildHourContexts,
  levelFor,
  scoreFrom,
  vulnerability,
  type HomeAttributes,
  type HourContext,
} from "./risk";
import type { WeatherHour } from "./weather";

export const HEX_RESOLUTION = 9; // ~0.1 km² cells: roughly a few blocks

export interface ConsoleHome extends HomeAttributes {
  id: string;
  label: string;
  neighborhood: string;
  zone_id: string;
  lat: number;
  lng: number;
  year_built: number;
  /** Real street name from OpenStreetMap (abbreviated, e.g. "E 27th St"). */
  street: string;
  /** Simulated household details (sample). Officials' view only; never sent to other homeowners. */
  has_faucet_shutoff: boolean;
  elderly: boolean;
  mobility_limited: boolean;
  lives_alone: boolean;
}

export interface HexBin {
  h3: string;
  neighborhood: string;
  zoneId: string;
  homeIdx: number[];
  /** Average home score per hour (index = hour). */
  avg: Float32Array;
}

export interface ReplayModel {
  /** City-wide series (drives the timeline + headline temperature). */
  hours: WeatherHour[];
  contexts: HourContext[];
  /** Per-zone weather contexts; zones without their own series use the city series. */
  zoneContexts: Record<string, HourContext[]>;
  hexes: HexBin[];
  /** [high, watch, low] home counts per hour. */
  counts: [number, number, number][];
  /** Precomputed vulnerability per home (same order as homes). */
  vuln: Float32Array;
}

/** The weather context a home sees at an hour (its zone's series, or the city's). */
export function homeContext(model: ReplayModel, home: { zone_id: string }, hour: number): HourContext {
  return (model.zoneContexts[home.zone_id] ?? model.contexts)[hour];
}

/** Exposure per zone at an hour (for the planner). */
export function zoneExposures(model: ReplayModel, hour: number): Record<string, number> {
  return Object.fromEntries(Object.entries(model.zoneContexts).map(([id, c]) => [id, c[hour].exposure]));
}

export function buildReplay(
  homes: ConsoleHome[],
  hours: WeatherHour[],
  zoneHours: Record<string, WeatherHour[]> = {},
): ReplayModel {
  const contexts = buildHourContexts(hours);
  const zoneContexts: Record<string, HourContext[]> = {};
  for (const h of homes) {
    if (zoneContexts[h.zone_id]) continue;
    const own = zoneHours[h.zone_id];
    zoneContexts[h.zone_id] = own && own.length === hours.length ? buildHourContexts(own) : contexts;
  }
  const vuln = Float32Array.from(homes, (h) => vulnerability(h));
  const homeCtx = homes.map((h) => zoneContexts[h.zone_id]);

  const byCell = new Map<string, number>();
  const hexes: HexBin[] = [];
  const binOf = new Int32Array(homes.length);
  homes.forEach((h, i) => {
    const cell = latLngToCell(h.lat, h.lng, HEX_RESOLUTION);
    let b = byCell.get(cell);
    if (b === undefined) {
      b = hexes.length;
      byCell.set(cell, b);
      hexes.push({ h3: cell, neighborhood: h.neighborhood, zoneId: h.zone_id, homeIdx: [], avg: new Float32Array(hours.length) });
    }
    binOf[i] = b;
    hexes[b].homeIdx.push(i);
  });

  // One pass per hour: each home's score is computed once and feeds both the level counts and its hex average.
  const sums = new Float64Array(hexes.length);
  const counts: [number, number, number][] = contexts.map((_, t) => {
    const c: [number, number, number] = [0, 0, 0];
    sums.fill(0);
    for (let i = 0; i < homes.length; i++) {
      const score = scoreFrom(homeCtx[i][t].exposure, vuln[i]);
      sums[binOf[i]] += score;
      const level = levelFor(score);
      c[level === "High" ? 0 : level === "Medium" ? 1 : 2]++;
    }
    for (let b = 0; b < hexes.length; b++) hexes[b].avg[t] = sums[b] / hexes[b].homeIdx.length;
    return c;
  });

  return { hours, contexts, zoneContexts, hexes, counts, vuln };
}
