// Match a sign-up's address to a home on the map. Pure (no I/O) so it is tested directly.
//
// 1. The address is looked up with OpenStreetMap's Nominatim search (src/lib/server/geocode.ts), which
//    returns a point. (The house footprints came from OSM's Overpass API, which can't search addresses.)
// 2. That point is matched to the OSM house footprints FreezeLine knows (data/osm-homes.json):
//    - a footprint within MATCH_M      -> "matched"           (confirmed: this is the home)
//    - else the nearest home on the same street within STREET_M -> "nearby_on_street" (estimated:
//      the household gets its street's water plan; the survey answers describe the real house)
//    - else inside a FreezeLine area   -> "no_home_nearby"
//    - else                            -> "outside_area"

import { NEIGHBORHOODS, shortStreet } from "./seed/generate";

export const MATCH_M = 40;
export const STREET_M = 250;

export type MatchStatus =
  | "pending"
  | "matched"
  | "nearby_on_street"
  | "no_home_nearby"
  | "outside_area"
  | "address_not_found"
  | "placeholder";

export interface GeoPoint {
  lat: number;
  lng: number;
  /** Street name OSM found for the address (e.g. "Heights Boulevard"), if any. */
  road: string | null;
}

export interface MatchHome {
  id: string;
  zone_id: string;
  lat: number;
  lng: number;
  street: string | null;
}

export interface MatchResult {
  status: MatchStatus;
  homeId: string | null;
  zoneId: string | null;
  distanceM: number | null;
}

/** Equirectangular distance in meters (accurate to well under 1% at neighborhood scale). */
export function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const x = (lng2 - lng1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.sqrt(x * x + y * y) * 6371000;
}

/** "East 27th Street", "E. 27th St" and "e 27th st" all become "e 27th st". */
export function streetKey(name: string): string {
  return shortStreet(name.replace(/\./g, "").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase()))
    .toLowerCase();
}

/** Which FreezeLine area a point is in (by the area boxes), or null. */
export function areaAt(lat: number, lng: number): string | null {
  const n = NEIGHBORHOODS.find(({ bbox: [s, w, nn, e] }) => lat >= s && lat <= nn && lng >= w && lng <= e);
  return n?.id ?? null;
}

export function matchToHome(p: GeoPoint, homes: MatchHome[]): MatchResult {
  let best: MatchHome | null = null;
  let bestM = Infinity;
  let street: MatchHome | null = null;
  let streetM = Infinity;
  const key = p.road ? streetKey(p.road) : null;
  for (const h of homes) {
    const m = metersBetween(p.lat, p.lng, h.lat, h.lng);
    if (m < bestM || (m === bestM && best && h.id < best.id)) [best, bestM] = [h, m];
    if (key && h.street && m < streetM && streetKey(h.street) === key) [street, streetM] = [h, m];
  }
  if (best && bestM <= MATCH_M) return { status: "matched", homeId: best.id, zoneId: best.zone_id, distanceM: Math.round(bestM) };
  if (street && streetM <= STREET_M)
    return { status: "nearby_on_street", homeId: street.id, zoneId: street.zone_id, distanceM: Math.round(streetM) };
  const area = areaAt(p.lat, p.lng);
  return { status: area ? "no_home_nearby" : "outside_area", homeId: null, zoneId: area, distanceM: best ? Math.round(bestM) : null };
}

// ---------- Nominatim request/response (the fetch itself lives in src/lib/server/geocode.ts) ----------

export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/** Structured US address search: one result, with the street name. */
export function nominatimParams(a: { addressLine1: string; city: string; zip: string }): URLSearchParams {
  return new URLSearchParams({
    street: a.addressLine1,
    city: a.city,
    state: "TX",
    postalcode: a.zip,
    countrycodes: "us",
    format: "jsonv2",
    addressdetails: "1",
    limit: "1",
  });
}

interface NominatimHit {
  lat: string;
  lon: string;
  address?: { road?: string; house_number?: string };
}

/** First hit as a point, or null when OSM found nothing. */
export function parseNominatim(json: unknown): GeoPoint | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const h = json[0] as NominatimHit;
  const lat = Number(h.lat), lng = Number(h.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, road: h.address?.road ?? null };
}

/** Officials' wording for each match status (City Operations, third person). */
export const MATCH_LABEL: Record<MatchStatus, string> = {
  matched: "Matched to home",
  nearby_on_street: "Nearest home on street",
  no_home_nearby: "No mapped home nearby",
  outside_area: "Outside service areas",
  address_not_found: "Address not found",
  pending: "Not looked up yet",
  placeholder: "Sample, linked to home",
};
