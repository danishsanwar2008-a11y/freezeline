import "server-only";
// The street graph, built once per server from data/osm-streets.json, and each crew's routed trip
// (cached by depot + home, since both are fixed for a job).

import streets from "../../../data/osm-streets.json";
import { buildGraph, bufferBox, routeBetween, type Box, type Route, type StreetGraph } from "@/lib/streetGraph";
import { NEIGHBORHOODS } from "@/lib/seed/generate";

/** Crews drive only on their own area's streets, plus this much where a street briefly leaves the area. */
export const AREA_BUFFER_M = 150;

/** An area's box with the buffer (null for an unknown area: no limit). */
export function areaBox(zoneId: string | null | undefined): Box | undefined {
  const n = NEIGHBORHOODS.find((x) => x.id === zoneId);
  return n ? bufferBox(n.bbox, AREA_BUFFER_M) : undefined;
}

let graph: StreetGraph | null | undefined;
function getGraph(): StreetGraph | null {
  if (graph === undefined) {
    try {
      const s = streets as { nodes: number[]; edges: number[] };
      graph = s.nodes?.length ? buildGraph(s.nodes, s.edges) : null;
    } catch {
      graph = null; // no street file: every trip falls back to the straight-line estimate
    }
  }
  return graph;
}

const cache = new Map<string, Route>();

/** Route + miles + minutes from a crew's depot to a home. */
export function routedTrip(crew: { depot_lat: number; depot_lng: number; zone_id?: string | null }, home: { lat: number; lng: number }): Route {
  const key = `${crew.depot_lat},${crew.depot_lng}|${home.lat},${home.lng}`;
  let r = cache.get(key);
  if (!r) {
    // The box applies to every job under the area rule (home inside the crew's area). Older saved jobs from
    // before the rule (home in another area) are routed without it rather than drawn as a long walk-in.
    const box = areaBox(crew.zone_id);
    const inside = box && home.lat >= box[0] && home.lat <= box[2] && home.lng >= box[1] && home.lng <= box[3];
    r = routeBetween(getGraph(), { lat: crew.depot_lat, lng: crew.depot_lng }, home, inside ? box : undefined);
    if (cache.size > 2_000) cache.clear();
    cache.set(key, r);
  }
  return r;
}
