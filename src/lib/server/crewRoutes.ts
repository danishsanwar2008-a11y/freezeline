import "server-only";
// The street graph, built once per server from data/osm-streets.json, and each crew's routed trip
// (cached by depot + home, since both are fixed for a job).

import streets from "../../../data/osm-streets.json";
import { buildGraph, routeBetween, type Route, type StreetGraph } from "@/lib/streetGraph";

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
export function routedTrip(crew: { depot_lat: number; depot_lng: number }, home: { lat: number; lng: number }): Route {
  const key = `${crew.depot_lat},${crew.depot_lng}|${home.lat},${home.lng}`;
  let r = cache.get(key);
  if (!r) {
    r = routeBetween(getGraph(), { lat: crew.depot_lat, lng: crew.depot_lng }, home);
    if (cache.size > 2_000) cache.clear();
    cache.set(key, r);
  }
  return r;
}
