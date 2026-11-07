// Precomputes everything the console replay needs, once, so scrubbing/playing is just array lookups.
// 2,000 homes x 168 hours = 336k multiply-adds: a few ms in the browser.

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
}

export interface HexBin {
  h3: string;
  neighborhood: string;
  homeIdx: number[];
  /** Average home score per hour (index = hour). */
  avg: Float32Array;
}

export interface ReplayModel {
  hours: WeatherHour[];
  contexts: HourContext[];
  hexes: HexBin[];
  /** [high, medium, low] home counts per hour. */
  counts: [number, number, number][];
  /** Precomputed vulnerability per home (same order as homes). */
  vuln: Float32Array;
}

export function buildReplay(homes: ConsoleHome[], hours: WeatherHour[]): ReplayModel {
  const contexts = buildHourContexts(hours);
  const vuln = Float32Array.from(homes, (h) => vulnerability(h));

  const byCell = new Map<string, HexBin>();
  homes.forEach((h, i) => {
    const cell = latLngToCell(h.lat, h.lng, HEX_RESOLUTION);
    let bin = byCell.get(cell);
    if (!bin) {
      bin = { h3: cell, neighborhood: h.neighborhood, homeIdx: [], avg: new Float32Array(hours.length) };
      byCell.set(cell, bin);
    }
    bin.homeIdx.push(i);
  });
  const hexes = [...byCell.values()];

  const counts: [number, number, number][] = contexts.map((ctx) => {
    const c: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < homes.length; i++) {
      const level = levelFor(scoreFrom(ctx.exposure, vuln[i]));
      c[level === "High" ? 0 : level === "Medium" ? 1 : 2]++;
    }
    return c;
  });

  for (const bin of hexes) {
    for (let t = 0; t < contexts.length; t++) {
      let sum = 0;
      for (const i of bin.homeIdx) sum += scoreFrom(contexts[t].exposure, vuln[i]);
      bin.avg[t] = sum / bin.homeIdx.length;
    }
  }

  return { hours, contexts, hexes, counts, vuln };
}
