// Fetches the drivable street network around the FreezeLine areas from OpenStreetMap (Overpass API,
// free, no key), ONCE, and caches it as a compact graph in data/osm-streets.json. Crew routes are
// computed from this file on the server (src/lib/streetGraph.ts); the demo never calls a routing service.
// Usage: npm run osm:streets
// Data © OpenStreetMap contributors, available under the ODbL.

import { writeFileSync } from "node:fs";
import { NEIGHBORHOODS } from "../src/lib/seed/generate";

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const UA = "FreezeLine-dev/0.1 (hackathon prototype; one-time cached fetch)";
const ROADS = "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street";

interface Way {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass(query: string): Promise<Way[]> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
        body: new URLSearchParams({ data: query }),
      });
      if (res.ok) return ((await res.json()) as { elements: Way[] }).elements;
      console.log(`  ${new URL(url).host} ${res.status}, retrying…`);
    } catch (e) {
      console.log(`  ${new URL(url).host} ${(e as Error).message}, retrying…`);
    }
    await sleep(15_000 * (attempt + 1));
  }
  throw new Error("Overpass unavailable after retries; try again later.");
}

async function main() {
  // One box around all the areas plus the roads between them (≈ 1 km margin).
  const s = Math.min(...NEIGHBORHOODS.map((n) => n.bbox[0])) - 0.01;
  const w = Math.min(...NEIGHBORHOODS.map((n) => n.bbox[1])) - 0.01;
  const n = Math.max(...NEIGHBORHOODS.map((x) => x.bbox[2])) + 0.01;
  const e = Math.max(...NEIGHBORHOODS.map((x) => x.bbox[3])) + 0.01;
  const bb = `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
  console.log(`Fetching drivable streets in ${bb} …`);
  const ways = await overpass(`[out:json][timeout:240];way["highway"~"^(${ROADS})$"](${bb});out geom;`);
  console.log(`  ${ways.length} street ways`);

  // Nodes keyed by rounded coordinate: ways that share a node (an intersection) join the graph there.
  const index = new Map<string, number>();
  const coords: number[] = [];
  const adj: Set<number>[] = [];
  const node = (lat: number, lon: number) => {
    const k = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    let i = index.get(k);
    if (i === undefined) {
      i = adj.length;
      index.set(k, i);
      coords.push(Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6);
      adj.push(new Set());
    }
    return i;
  };
  for (const wy of ways) {
    const g = wy.geometry ?? [];
    for (let k = 1; k < g.length; k++) {
      const a = node(g[k - 1].lat, g[k - 1].lon);
      const b = node(g[k].lat, g[k].lon);
      if (a !== b) {
        adj[a].add(b);
        adj[b].add(a);
      }
    }
  }

  // Keep only the largest connected piece, so a crew never snaps onto an isolated stub.
  const comp = new Int32Array(adj.length).fill(-1);
  let best = -1, bestSize = 0;
  for (let i = 0, c = 0; i < adj.length; i++) {
    if (comp[i] >= 0) continue;
    let size = 0;
    const stack = [i];
    comp[i] = c;
    while (stack.length) {
      const u = stack.pop()!;
      size++;
      for (const v of adj[u]) {
        if (comp[v] >= 0) continue;
        comp[v] = c;
        stack.push(v);
      }
    }
    if (size > bestSize) {
      best = c;
      bestSize = size;
    }
    c++;
  }
  const keep = new Int32Array(adj.length).fill(-1);
  const outCoords: number[] = [];
  for (let i = 0; i < adj.length; i++) {
    if (comp[i] !== best) continue;
    keep[i] = outCoords.length / 2;
    outCoords.push(coords[2 * i], coords[2 * i + 1]);
  }
  const edges: number[] = [];
  for (let a = 0; a < adj.length; a++) {
    if (keep[a] < 0) continue;
    for (const b of adj[a]) if (b > a && keep[b] >= 0) edges.push(keep[a], keep[b]);
  }

  const out = {
    attribution: "Street network © OpenStreetMap contributors, ODbL. Fetched once by scripts/fetch-osm-streets.ts.",
    fetched: new Date().toISOString().slice(0, 10),
    bbox: [s, w, n, e],
    /** Flat [lat, lng, lat, lng, …]. */
    nodes: outCoords,
    /** Flat [a, b, a, b, …] node indexes; streets are treated as two-way (simulated routing). */
    edges,
  };
  writeFileSync("data/osm-streets.json", JSON.stringify(out));
  console.log(`Saved data/osm-streets.json: ${outCoords.length / 2} nodes, ${edges.length / 2} segments (largest connected network; ${adj.length - outCoords.length / 2} isolated nodes dropped).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
