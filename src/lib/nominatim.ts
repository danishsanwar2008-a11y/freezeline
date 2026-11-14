// Address lookup with OpenStreetMap's Nominatim search, then matched to a known home footprint.
// Used by /api/register (one lookup per sign-up) and `npm run registrations:match` (retries).
// Nominatim's usage policy: at most 1 request per second, and an identifying User-Agent. Calls are
// spaced at least 1.1 s apart in this process; a sign-up that would have to wait is saved as
// "pending" instead of holding the household's form, and the retry script picks it up.
// No keys involved. The household's address (not their name, email or phone) is sent to OSM.

import { NOMINATIM_URL, matchToHome, nominatimParams, parseNominatim, type MatchHome, type MatchResult } from "./addressMatch";
import { OSM_HOMES } from "./seed/generate";

const MIN_GAP_MS = 1100;
const TIMEOUT_MS = 4000;
let lastCall = 0;

const USER_AGENT = () => process.env.NOMINATIM_USER_AGENT?.trim() || "FreezeLine/0.1 (freeze-alert sign-up prototype)";

let homes: MatchHome[] | null = null;
const knownHomes = () =>
  (homes ??= OSM_HOMES.map((h) => ({ id: h.id, zone_id: h.zone_id, lat: h.lat, lng: h.lng, street: h.street })));

export interface AddressMatch extends MatchResult {
  lat: number | null;
  lng: number | null;
}

const pending = (): AddressMatch => ({ status: "pending", homeId: null, zoneId: null, distanceM: null, lat: null, lng: null });

/**
 * Look up an address and match it to a home. Never throws: a lookup that fails, times out, or would
 * exceed the rate limit (when `wait` is false) comes back as "pending".
 */
export async function lookupAndMatch(a: { addressLine1: string; city: string; zip: string }, opts: { wait?: boolean } = {}): Promise<AddressMatch> {
  const gap = lastCall + MIN_GAP_MS - Date.now();
  if (gap > 0) {
    if (!opts.wait) return pending();
    await new Promise((r) => setTimeout(r, gap));
  }
  lastCall = Date.now();
  try {
    const res = await fetch(`${NOMINATIM_URL}?${nominatimParams(a)}`, {
      headers: { "user-agent": USER_AGENT(), accept: "application/json", "accept-language": "en" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return pending();
    const point = parseNominatim(await res.json());
    if (!point) return { status: "address_not_found", homeId: null, zoneId: null, distanceM: null, lat: null, lng: null };
    return { ...matchToHome(point, knownHomes()), lat: point.lat, lng: point.lng };
  } catch {
    return pending();
  }
}

/** Columns to write for a match result (supabase/005_registration_matching.sql). */
export function matchColumns(m: AddressMatch) {
  return {
    match_status: m.status,
    home_id: m.homeId,
    zone_id: m.zoneId,
    match_distance_m: m.distanceM,
    geocode_lat: m.lat,
    geocode_lng: m.lng,
    matched_at: m.status === "pending" ? null : new Date().toISOString(),
  };
}
