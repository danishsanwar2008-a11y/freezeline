// Crew routing on the real street network (OpenStreetMap, cached in data/osm-streets.json by
// `npm run osm:streets`). Pure and deterministic: snap both ends to the nearest street point, then the
// shortest drive with A*. Streets are treated as two-way and every road at the same winter speed:
// the route is real, the timing is a simulated estimate.

import { CREW_TRIP, milesBetween } from "./crewTrip";

export interface StreetGraph {
  /** Flat [lat, lng, lat, lng, …]. */
  coords: Float64Array;
  /** CSR adjacency: neighbors of node i are adj[offsets[i] .. offsets[i + 1]). */
  offsets: Int32Array;
  adj: Int32Array;
  /** Segment length in meters, parallel to adj. */
  meters: Float32Array;
  /** Grid index for snapping: cell key -> node indexes. */
  grid: Map<number, number[]>;
}

/** Grid cell for snapping, ~220 m. */
const CELL = 0.002;
const cellKey = (lat: number, lng: number) => Math.floor(lat / CELL) * 100_000 + Math.floor(lng / CELL);
const METERS_PER_MILE = 1609.344;

/** Build the graph from the cached file's flat node and edge lists. */
export function buildGraph(nodes: ArrayLike<number>, edges: ArrayLike<number>): StreetGraph {
  const n = nodes.length / 2;
  const coords = Float64Array.from(nodes);
  const degree = new Int32Array(n);
  for (let k = 0; k < edges.length; k++) degree[edges[k]]++;
  const offsets = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + degree[i];
  const adj = new Int32Array(offsets[n]);
  const meters = new Float32Array(offsets[n]);
  const fill = offsets.slice(0, n);
  for (let k = 0; k < edges.length; k += 2) {
    const a = edges[k], b = edges[k + 1];
    const m = milesBetween(coords[2 * a], coords[2 * a + 1], coords[2 * b], coords[2 * b + 1]) * METERS_PER_MILE;
    adj[fill[a]] = b;
    meters[fill[a]++] = m;
    adj[fill[b]] = a;
    meters[fill[b]++] = m;
  }
  const grid = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const key = cellKey(coords[2 * i], coords[2 * i + 1]);
    const list = grid.get(key);
    if (list) list.push(i);
    else grid.set(key, [i]);
  }
  return { coords, offsets, adj, meters, grid };
}

/** Nearest street point to a location (searches outward ring by ring), or -1 when none within ~1.5 km. */
/** [south, west, north, east] in degrees. */
export type Box = [number, number, number, number];

/** An area's box grown by a small buffer (meters), so a street that briefly leaves the area still counts. */
export function bufferBox([s, w, n, e]: Box, meters: number): Box {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  return [s - dLat, w - dLng, n + dLat, e + dLng];
}

const inBox = (g: StreetGraph, i: number, [s, w, n, e]: Box) => {
  const lat = g.coords[2 * i], lng = g.coords[2 * i + 1];
  return lat >= s && lat <= n && lng >= w && lng <= e;
};

export function nearestNode(g: StreetGraph, lat: number, lng: number, box?: Box): number {
  const cy = Math.floor(lat / CELL), cx = Math.floor(lng / CELL);
  let best = -1, bestD = Infinity;
  for (let r = 0; r <= 7; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dy), Math.abs(dx)) !== r) continue; // only the ring's edge
        for (const i of g.grid.get((cy + dy) * 100_000 + (cx + dx)) ?? []) {
          if (box && !inBox(g, i, box)) continue;
          const d = (g.coords[2 * i] - lat) ** 2 + ((g.coords[2 * i + 1] - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
          if (d < bestD) [best, bestD] = [i, d];
        }
      }
    // Anything in ring r + 1 is at least r cells away (east-west cells shrink by cos(lat) in this metric).
    if (best >= 0 && Math.sqrt(bestD) <= r * CELL * Math.cos((lat * Math.PI) / 180)) break;
  }
  return best;
}

/** Binary min-heap of node ids keyed by a priority array. */
class Heap {
  private items: number[] = [];
  constructor(private key: Float64Array) {}
  get size() {
    return this.items.length;
  }
  push(v: number) {
    const a = this.items;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.key[a[p]] <= this.key[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.key[a[l]] < this.key[a[m]]) m = l;
        if (r < a.length && this.key[a[r]] < this.key[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Shortest path between two nodes (A*, straight-line heuristic). Node ids in order, or null if unreachable. */
export function shortestPath(g: StreetGraph, from: number, to: number, box?: Box): { nodes: number[]; meters: number } | null {
  const n = g.offsets.length - 1;
  const dist = new Float64Array(n).fill(Infinity);
  const score = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const tLat = g.coords[2 * to], tLng = g.coords[2 * to + 1];
  const h = (i: number) => milesBetween(g.coords[2 * i], g.coords[2 * i + 1], tLat, tLng) * METERS_PER_MILE;
  const heap = new Heap(score);
  dist[from] = 0;
  score[from] = h(from);
  heap.push(from);
  while (heap.size) {
    const u = heap.pop();
    if (done[u]) continue;
    if (u === to) break;
    done[u] = 1;
    for (let k = g.offsets[u]; k < g.offsets[u + 1]; k++) {
      const v = g.adj[k];
      if (box && !inBox(g, v, box)) continue; // stay on the area streets
      const d = dist[u] + g.meters[k];
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
        score[v] = d + h(v);
        heap.push(v);
      }
    }
  }
  if (!Number.isFinite(dist[to])) return null;
  const nodes: number[] = [];
  for (let v = to; v !== -1; v = prev[v]) nodes.push(v);
  return { nodes: nodes.reverse(), meters: dist[to] };
}

export interface Route {
  /** [lng, lat] points from the depot to the home, along the streets. */
  path: [number, number][];
  miles: number;
  /** Drive time at the simulated winter speed. */
  minutes: number;
  /** false = no street route was found; the straight-line estimate (× road factor) is used instead. */
  routed: boolean;
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** The crew's drive from its depot to a home: street route when one exists, else the straight-line estimate. */
export function routeBetween(
  g: StreetGraph | null,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  /** Keep the route inside this box (the crew's area plus a small buffer). */
  box?: Box,
): Route {
  const straight = milesBetween(from.lat, from.lng, to.lat, to.lng);
  const minutesFor = (miles: number) => Math.max(1, Math.round((miles / CREW_TRIP.mph) * 60));
  const fallback: Route = {
    path: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
    miles: straight * CREW_TRIP.roadFactor,
    minutes: minutesFor(straight * CREW_TRIP.roadFactor),
    routed: false,
  };
  if (!g) return fallback;
  const a = nearestNode(g, from.lat, from.lng, box);
  const b = nearestNode(g, to.lat, to.lng, box);
  if (a < 0 || b < 0) return fallback;
  const sp = a === b ? { nodes: [a], meters: 0 } : shortestPath(g, a, b, box);
  if (!sp) return fallback;
  // Depot -> first street point -> … -> last street point -> the home (short walk-ins at each end).
  const path: [number, number][] = [[r6(from.lng), r6(from.lat)]];
  for (const i of sp.nodes) path.push([r6(g.coords[2 * i + 1]), r6(g.coords[2 * i])]);
  path.push([r6(to.lng), r6(to.lat)]);
  const ends =
    milesBetween(from.lat, from.lng, g.coords[2 * a], g.coords[2 * a + 1]) + milesBetween(to.lat, to.lng, g.coords[2 * b], g.coords[2 * b + 1]);
  const miles = sp.meters / METERS_PER_MILE + ends;
  return { path, miles, minutes: minutesFor(miles), routed: true };
}
