// Homes = REAL house footprints from OpenStreetMap (data/osm-homes.json, fetched once by
// `npm run osm:homes`) + SIMULATED details (year built, foundation, pipes, insulation, faucets,
// household needs). Details are deterministic per home id, so re-seeding upserts the same rows.

import osm from "../../../data/osm-homes.json";

export type Foundation = "slab" | "pier_and_beam";
export type Insulation = "poor" | "fair" | "good";

export interface ZoneRow {
  id: string;
  name: string;
  neighborhood: string;
  base_pressure_psi: number;
  min_pressure_psi: number;
  center_lat: number;
  center_lng: number;
  simulated: true;
}

export interface HomeRow {
  id: string;
  zone_id: string;
  neighborhood: string;
  label: string;
  lat: number;
  lng: number;
  osm_id: number;
  street: string;
  area_m2: number;
  year_built: number;
  foundation: Foundation;
  exterior_wall_pipes: boolean;
  outdoor_faucets: number;
  attic_or_crawlspace_pipes: boolean;
  insulation: Insulation;
  /** The outdoor faucet has an indoor shutoff valve (so it can be shut off and drained). */
  has_faucet_shutoff: boolean;
  elderly: boolean;
  mobility_limited: boolean;
  lives_alone: boolean;
  simulated: true;
}

interface Neighborhood {
  id: string;
  name: string;
  /** Box inside the real neighborhood: [south, west, north, east]. */
  bbox: [number, number, number, number];
  basePressure: number;
  /** Year-built range and the share of homes built before ~1965. */
  yearRange: [number, number];
  oldShare: number;
  /** Share of households with someone 65+. */
  elderlyShare: number;
}

export const NEIGHBORHOODS: Neighborhood[] = [
  { id: "heights",    name: "Houston Heights", bbox: [29.778, -95.410, 29.812, -95.388], basePressure: 52, yearRange: [1905, 2022], oldShare: 0.65, elderlyShare: 0.18 },
  { id: "montrose",   name: "Montrose",        bbox: [29.737, -95.405, 29.757, -95.383], basePressure: 48, yearRange: [1915, 2022], oldShare: 0.55, elderlyShare: 0.15 },
  { id: "third-ward", name: "Third Ward",      bbox: [29.715, -95.372, 29.735, -95.350], basePressure: 44, yearRange: [1920, 2020], oldShare: 0.6,  elderlyShare: 0.27 },
  { id: "meyerland",  name: "Meyerland",       bbox: [29.680, -95.472, 29.698, -95.448], basePressure: 50, yearRange: [1955, 2021], oldShare: 0.7,  elderlyShare: 0.3 },
];

export interface OsmHome {
  id: string;
  zone_id: string;
  osm_id: number;
  lat: number;
  lng: number;
  area_m2: number;
  street: string | null;
}
export const OSM_HOMES = (osm as unknown as { homes: OsmHome[] }).homes;
export const OSM_ATTRIBUTION = (osm as unknown as { attribution: string }).attribution;

/** mulberry32: tiny seeded PRNG. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string (FNV-1a), for per-home seeds. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

const ABBREV: [RegExp, string][] = [
  [/\bNorth\b/g, "N"], [/\bSouth\b/g, "S"], [/\bEast\b/g, "E"], [/\bWest\b/g, "W"],
  [/\bStreet\b/g, "St"], [/\bAvenue\b/g, "Ave"], [/\bBoulevard\b/g, "Blvd"], [/\bDrive\b/g, "Dr"],
  [/\bRoad\b/g, "Rd"], [/\bLane\b/g, "Ln"], [/\bCourt\b/g, "Ct"], [/\bPlace\b/g, "Pl"],
  [/\bParkway\b/g, "Pkwy"], [/\bCircle\b/g, "Cir"], [/\bTerrace\b/g, "Ter"],
];
/** "East 27th Street" -> "E 27th St" */
export function shortStreet(name: string): string {
  return ABBREV.reduce((s, [re, r]) => s.replace(re, r), name);
}

export function generateZones(): ZoneRow[] {
  return NEIGHBORHOODS.map((n) => ({
    id: n.id,
    name: `${n.name} Pressure Zone (simulated)`,
    neighborhood: n.name,
    base_pressure_psi: n.basePressure,
    min_pressure_psi: 20,
    center_lat: round((n.bbox[0] + n.bbox[2]) / 2, 6),
    center_lng: round((n.bbox[1] + n.bbox[3]) / 2, 6),
    simulated: true,
  }));
}

/** Simulated details for one real footprint. Deterministic: seeded by the home id. */
export function simulateHome(o: OsmHome): HomeRow {
  const n = NEIGHBORHOODS.find((x) => x.id === o.zone_id)!;
  const r = rng(hash32(o.id));
  const [y0, y1] = n.yearRange;
  const oldCutoff = Math.min(1965, y1);
  // Bigger footprints skew newer (rebuilds and additions).
  const oldShare = Math.max(0.15, n.oldShare - (o.area_m2 > 300 ? 0.35 : o.area_m2 > 220 ? 0.15 : 0));
  const old = r() < oldShare;
  const year_built = old ? Math.floor(y0 + r() * (oldCutoff - y0)) : Math.floor(oldCutoff + r() * (y1 - oldCutoff + 1));

  // Older Houston homes are much more likely to sit on pier-and-beam.
  const pierChance = year_built < 1950 ? 0.8 : year_built < 1970 ? 0.35 : 0.05;
  const foundation: Foundation = r() < pierChance ? "pier_and_beam" : "slab";
  const exterior_wall_pipes = r() < (year_built < 1960 ? 0.7 : year_built < 1990 ? 0.45 : 0.2);
  // Pier-and-beam -> crawlspace pipes; slab homes often run plumbing through the attic.
  const attic_or_crawlspace_pipes = foundation === "pier_and_beam" ? r() < 0.9 : r() < (year_built > 1990 ? 0.4 : 0.25);
  const ins = r() + (year_built - 1960) / 120;
  const insulation: Insulation = ins < 0.45 ? "poor" : ins < 0.85 ? "fair" : "good";
  const outdoor_faucets = 1 + Math.floor(r() * 3) + (r() < 0.15 ? 1 : 0) - (r() < 0.06 ? 1 : 0);
  const has_faucet_shutoff = outdoor_faucets > 0 && r() < (year_built < 1960 ? 0.25 : year_built < 1990 ? 0.4 : 0.6);

  // Household (simulated): who might need help to do the steps.
  const elderly = r() < n.elderlyShare;
  const mobility_limited = r() < (elderly ? 0.25 : 0.03);
  const lives_alone = r() < (elderly ? 0.45 : 0.2);

  const street = shortStreet(o.street ?? "Unnamed St");
  return {
    id: o.id,
    zone_id: o.zone_id,
    neighborhood: n.name,
    label: `${street} · ${String(o.osm_id).slice(-4)}`,
    lat: o.lat,
    lng: o.lng,
    osm_id: o.osm_id,
    street,
    area_m2: o.area_m2,
    year_built,
    foundation,
    exterior_wall_pipes,
    outdoor_faucets,
    attic_or_crawlspace_pipes,
    insulation,
    has_faucet_shutoff,
    elderly,
    mobility_limited,
    lives_alone,
    simulated: true,
  };
}

/** Every home: real OSM footprints with simulated details. */
export function generateHomes(): HomeRow[] {
  return OSM_HOMES.map(simulateHome);
}
