// Deterministic generator for SIMULATED Houston homes and pressure zones.
// Same seed -> same rows, so re-running the seed upserts instead of duplicating.

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
  year_built: number;
  foundation: Foundation;
  exterior_wall_pipes: boolean;
  outdoor_faucets: number;
  attic_or_crawlspace_pipes: boolean;
  insulation: Insulation;
  simulated: true;
}

interface Neighborhood {
  id: string;
  name: string;
  /** Approximate box inside the real neighborhood: [south, west, north, east]. */
  bbox: [number, number, number, number];
  homes: number;
  basePressure: number;
  /** Year-built range and the share of homes built before ~1965. */
  yearRange: [number, number];
  oldShare: number;
}

export const NEIGHBORHOODS: Neighborhood[] = [
  { id: "heights",    name: "Houston Heights", bbox: [29.778, -95.410, 29.812, -95.388], homes: 600, basePressure: 52, yearRange: [1905, 2022], oldShare: 0.65 },
  { id: "montrose",   name: "Montrose",        bbox: [29.737, -95.405, 29.757, -95.383], homes: 450, basePressure: 48, yearRange: [1915, 2022], oldShare: 0.55 },
  { id: "third-ward", name: "Third Ward",      bbox: [29.715, -95.372, 29.735, -95.350], homes: 450, basePressure: 44, yearRange: [1920, 2020], oldShare: 0.6 },
  { id: "meyerland",  name: "Meyerland",       bbox: [29.680, -95.472, 29.698, -95.448], homes: 500, basePressure: 50, yearRange: [1955, 2021], oldShare: 0.7 },
];

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

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

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

export function generateHomes(seed = 2021): HomeRow[] {
  const homes: HomeRow[] = [];
  NEIGHBORHOODS.forEach((n, ni) => {
    const r = rng(seed * 100 + ni);
    const [s, w, no, e] = n.bbox;
    const [y0, y1] = n.yearRange;
    const oldCutoff = Math.min(1965, y1);
    for (let i = 1; i <= n.homes; i++) {
      const old = r() < n.oldShare;
      const year_built = old
        ? Math.floor(y0 + r() * (oldCutoff - y0))
        : Math.floor(oldCutoff + r() * (y1 - oldCutoff + 1));

      // Older Houston homes are much more likely to sit on pier-and-beam.
      const pierChance = year_built < 1950 ? 0.8 : year_built < 1970 ? 0.35 : 0.05;
      const foundation: Foundation = r() < pierChance ? "pier_and_beam" : "slab";

      const exterior_wall_pipes = r() < (year_built < 1960 ? 0.7 : year_built < 1990 ? 0.45 : 0.2);
      // Pier-and-beam -> crawlspace pipes; slab homes often run plumbing through the attic.
      const attic_or_crawlspace_pipes =
        foundation === "pier_and_beam" ? r() < 0.9 : r() < (year_built > 1990 ? 0.4 : 0.25);

      const ins = r() + (year_built - 1960) / 120;
      const insulation: Insulation = ins < 0.45 ? "poor" : ins < 0.85 ? "fair" : "good";

      const outdoor_faucets = 1 + Math.floor(r() * 3) + (r() < 0.15 ? 1 : 0);

      const num = String(i).padStart(4, "0");
      homes.push({
        id: `${n.id}-${num}`,
        zone_id: n.id,
        neighborhood: n.name,
        label: `Simulated Home ${n.id.toUpperCase()}-${num}`,
        lat: round(s + r() * (no - s), 6),
        lng: round(w + r() * (e - w), 6),
        year_built,
        foundation,
        exterior_wall_pipes,
        outdoor_faucets,
        attic_or_crawlspace_pipes,
        insulation,
        simulated: true,
      });
    }
  });
  return homes;
}
