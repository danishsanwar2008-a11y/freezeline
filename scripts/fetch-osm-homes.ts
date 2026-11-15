// Fetches real house footprints from OpenStreetMap (Overpass API) for the FreezeLine
// neighborhoods, ONCE, and caches them in data/osm-homes.json.
// Usage: npm run osm:homes            (fetches only areas not in the file yet; existing areas are kept as they are)
//        npm run osm:homes -- --all   (re-fetches every area)
//
// Kept as homes:
//  - buildings tagged as houses (house|residential|detached|semidetached_house|bungalow|terrace), 40–600 m²
//  - untagged `building=yes` whose centroid lies inside a landuse=residential area and is 70–450 m²
//    (drops garages, sheds, and large commercial buildings)
// Street: addr:street, else the nearest named street within 150 m.
// Data © OpenStreetMap contributors, available under the ODbL.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { NEIGHBORHOODS } from "../src/lib/seed/generate";

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const UA = "FreezeLine-dev/0.1 (hackathon prototype; one-time cached fetch)";
const HOUSE_TAGS = /^(house|residential|detached|semidetached_house|bungalow|terrace)$/;
const NON_HOME_KEYS = ["shop", "amenity", "office", "leisure", "religion", "craft", "tourism", "healthcare"];

type LatLng = { lat: number; lon: number };
interface Way {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry?: LatLng[];
}
interface Rel {
  type: "relation";
  id: number;
  tags?: Record<string, string>;
  members?: { type: string; role: string; geometry?: LatLng[] }[];
}
type El = Way | Rel;

export interface OsmHome {
  id: string;
  zone_id: string;
  osm_id: number;
  lat: number;
  lng: number;
  area_m2: number;
  street: string | null;
  tagged: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass(query: string): Promise<El[]> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
        body: new URLSearchParams({ data: query }),
      });
      if (res.ok) return ((await res.json()) as { elements: El[] }).elements;
      console.log(`  ${new URL(url).host} ${res.status}, retrying…`);
    } catch (e) {
      console.log(`  ${new URL(url).host} ${(e as Error).message}, retrying…`);
    }
    await sleep(10_000 * (attempt + 1));
  }
  throw new Error("Overpass unavailable after retries; try again later.");
}

// Local equirectangular projection in meters around a reference point.
function projector(lat0: number, lon0: number) {
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_540;
  return (p: LatLng): [number, number] => [(p.lon - lon0) * kx, (p.lat - lat0) * ky];
}

function areaAndCentroid(pts: [number, number][]) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    a += f;
    cx += (pts[j][0] + pts[i][0]) * f;
    cy += (pts[j][1] + pts[i][1]) * f;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) return null;
  return { area: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) };
}

function inPolygon(x: number, y: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segDist(px: number, py: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

async function fetchZone(z: (typeof NEIGHBORHOODS)[number]): Promise<{ homes: OsmHome[]; stats: Record<string, number> }> {
  const [s, w, n, e] = z.bbox;
  const bb = `${s},${w},${n},${e}`;
  const query = `[out:json][timeout:180];
(
  way["building"](${bb});
  way["landuse"="residential"](${bb});
  relation["landuse"="residential"](${bb});
  way["highway"~"^(residential|living_street|unclassified|tertiary|secondary|primary)$"]["name"](${bb});
);
out geom;`;
  const els = await overpass(query);
  const project = projector((s + n) / 2, (w + e) / 2);
  const unproject = (x: number, y: number) => ({
    lat: (s + n) / 2 + y / 110_540,
    lng: (w + e) / 2 + x / (111_320 * Math.cos((((s + n) / 2) * Math.PI) / 180)),
  });

  // Residential land-use polygons (closed ways + closed outer rings of relations).
  const residential: [number, number][][] = [];
  const streets: { name: string; pts: [number, number][] }[] = [];
  const buildings: Way[] = [];
  for (const el of els) {
    if (el.type === "way" && el.tags?.landuse === "residential" && el.geometry) {
      residential.push(el.geometry.map(project));
    } else if (el.type === "relation" && el.tags?.landuse === "residential") {
      for (const m of el.members ?? []) {
        if (m.role === "outer" && m.geometry && m.geometry.length > 3) residential.push(m.geometry.map(project));
      }
    } else if (el.type === "way" && el.tags?.highway && el.tags.name && el.geometry) {
      streets.push({ name: el.tags.name, pts: el.geometry.map(project) });
    } else if (el.type === "way" && el.tags?.building && el.geometry && el.geometry.length >= 4) {
      buildings.push(el);
    }
  }
  // Bounding boxes for fast point-in-polygon rejection.
  const resBoxes = residential.map((p) => {
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  const inResidential = (x: number, y: number) =>
    residential.some((p, i) => x >= resBoxes[i][0] && x <= resBoxes[i][2] && y >= resBoxes[i][1] && y <= resBoxes[i][3] && inPolygon(x, y, p));

  const stats = { buildings: buildings.length, residentialAreas: residential.length, streets: streets.length, tagged: 0, untagged: 0 };
  const homes: OsmHome[] = [];
  for (const b of buildings) {
    const t = b.tags!;
    if (NON_HOME_KEYS.some((k) => k in t)) continue;
    const geom = areaAndCentroid(b.geometry!.map(project));
    if (!geom) continue;
    // Buildings straddling the box edge: keep only those whose center is inside the box.
    const c = unproject(geom.cx, geom.cy);
    if (c.lat < s || c.lat > n || c.lng < w || c.lng > e) continue;
    const tagged = HOUSE_TAGS.test(t.building);
    const keep = tagged
      ? geom.area >= 40 && geom.area <= 600
      : t.building === "yes" && geom.area >= 70 && geom.area <= 450 && inResidential(geom.cx, geom.cy);
    if (!keep) continue;
    if (tagged) stats.tagged++;
    else stats.untagged++;

    let street = t["addr:street"] ?? null;
    if (!street) {
      let best = 150;
      for (const st of streets)
        for (let i = 1; i < st.pts.length; i++) {
          const d = segDist(geom.cx, geom.cy, st.pts[i - 1], st.pts[i]);
          if (d < best) {
            best = d;
            street = st.name;
          }
        }
    }
    const { lat, lng } = unproject(geom.cx, geom.cy);
    homes.push({
      id: `${z.id}-w${b.id}`,
      zone_id: z.id,
      osm_id: b.id,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      area_m2: Math.round(geom.area),
      street,
      tagged,
    });
  }
  homes.sort((a, b) => a.osm_id - b.osm_id);
  return { homes, stats };
}

async function main() {
  const FILE = "data/osm-homes.json";
  const prev = existsSync(FILE) && !process.argv.includes("--all")
    ? (JSON.parse(readFileSync(FILE, "utf8")) as { homes: OsmHome[]; perZone: Record<string, unknown>; fetchedAt?: string })
    : { homes: [] as OsmHome[], perZone: {} as Record<string, unknown> };
  const have = new Set(prev.homes.map((h) => h.zone_id));
  // Keep cached areas exactly as fetched (same footprints, same ids), and only for areas still in the list.
  const all: OsmHome[] = prev.homes.filter((h) => NEIGHBORHOODS.some((z) => z.id === h.zone_id));
  const perZone: Record<string, unknown> = Object.fromEntries(Object.entries(prev.perZone).filter(([id]) => have.has(id)));
  for (const z of NEIGHBORHOODS) {
    if (have.has(z.id)) {
      console.log(`${z.name}: cached (${all.filter((h) => h.zone_id === z.id).length} homes)`);
      continue;
    }
    console.log(`${z.name}: querying Overpass…`);
    const { homes, stats } = await fetchZone(z);
    console.log(`  ${homes.length} homes (tagged ${stats.tagged}, residential-area ${stats.untagged}) from ${stats.buildings} buildings, ${stats.residentialAreas} residential areas, ${stats.streets} streets; ${homes.filter((h) => !h.street).length} without a street name`);
    perZone[z.id] = { homes: homes.length, fetchedAt: new Date().toISOString(), ...stats };
    all.push(...homes);
    await sleep(5_000); // be polite to the shared server
  }
  mkdirSync("data", { recursive: true });
  writeFileSync(
    FILE,
    JSON.stringify({
      attribution: "© OpenStreetMap contributors, available under the Open Database License (ODbL)",
      source: "Overpass API",
      fetchedAt: new Date().toISOString(),
      filter:
        "building in (house|residential|detached|semidetached_house|bungalow|terrace) 40–600 m², or building=yes inside landuse=residential 70–450 m²; no shop/amenity/office/leisure/religion tags",
      perZone,
      homes: all,
    }) + "\n",
  );
  console.log(`Saved ${all.length} homes to ${FILE}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
