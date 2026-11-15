// The console's base map: CARTO Positron's free vector tiles (no key), recoloured so streets read.
// Positron draws roads as white strips with a faint #ddd edge on a near-white ground, which vanish
// under the cells. This turns it into a warm off-white ground with every street as one dark-gray
// line (local, main and highway weights), light warm-gray building blocks and gray labels.
// Pure: same style in, same style out; colours from MAP_LOOK.ground (src/lib/riskScale.ts).
import { MAP_LOOK } from "./riskScale";

type Json = Record<string, unknown>;
export interface StyleLike {
  layers: Json[];
  [k: string]: unknown;
}

const G = MAP_LOOK.ground;

/** Line widths by zoom (px): thin local streets, bolder main roads, the boldest highways. */
export const ROAD_WIDTH = {
  local: { stops: [[11, 0.3], [13, 0.8], [15, 1.6], [17, 3], [19, 5]] },
  main: { stops: [[9, 0.6], [12, 1.4], [14, 2.2], [16, 3.4], [18, 6]] },
  highway: { stops: [[7, 0.8], [10, 1.6], [13, 2.6], [15, 4], [17, 7]] },
  rail: { stops: [[12, 0.4], [15, 1], [18, 2]] },
};

/**
 * Which road class a Positron road layer draws (its white fill or its pale edge), or null. Both get
 * the same single dark line: zoomed out, Positron draws local streets only through their edge layers.
 */
export function roadClass(id: string): "local" | "main" | "highway" | null {
  if (!/_(fill|case)/.test(id) || !/^(road|bridge|tunnel)_/.test(id)) return null;
  if (/_(service|minor)_(fill|case)/.test(id)) return "local";
  if (/_(sec|pri)_(fill|case)/.test(id)) return "main";
  if (/_(trunk|mot)_(fill|case)/.test(id)) return "highway";
  return null;
}

const ROAD_COLOR = { local: G.roadLocal, main: G.roadMain, highway: G.roadHighway } as const;
const hidden = (l: Json): Json => ({ ...l, layout: { ...((l.layout as Json) ?? {}), visibility: "none" } });
const paint = (l: Json, p: Json): Json => ({ ...l, paint: { ...((l.paint as Json) ?? {}), ...p } });

function restyle(l: Json): Json {
  const id = String(l.id);
  if (id === "background") return paint(l, { "background-color": G.land });
  if (id === "landuse_residential") return paint(l, { "fill-color": "rgba(0, 0, 0, 0)" });
  if (/^(landcover|landuse|park_)/.test(id)) return paint(l, { "fill-color": G.park });
  if (id === "water") return paint(l, { "fill-color": G.water });
  if (id === "waterway") return paint(l, { "line-color": G.water });
  if (id === "building") return paint(l, { "fill-color": G.building, "fill-outline-color": G.buildingEdge });
  if (id === "building-top") return paint(l, { "fill-color": G.building, "fill-outline-color": G.buildingEdge });
  if (/^aeroway/.test(id)) return paint(l, { "line-color": G.building });
  // One line per street: the white strip and its pale edge both become the same dark-gray stroke
  // (drawn on top of each other, so it reads as one line). Footpaths and rail dashes go.
  if (/path/.test(id) || /rail_dash/.test(id)) return hidden(l);
  const cls = roadClass(id);
  if (cls)
    return paint(l, {
      "line-color": ROAD_COLOR[cls],
      "line-width": ROAD_WIDTH[cls],
      // Tunnels run under the ground: the same line, fainter.
      ...(id.startsWith("tunnel_") ? { "line-opacity": 0.45 } : {}),
    });
  if (/^(tunnel_)?rail$/.test(id)) return paint(l, { "line-color": G.rail, "line-width": ROAD_WIDTH.rail });
  if (l.type === "symbol" && /^(roadname|place)_/.test(id)) return paint(l, { "text-color": G.label });
  return l;
}

/** Positron, recoloured. Leaves the input untouched; running it twice gives the same result. */
export function warmBasemap<T extends StyleLike>(style: T): T {
  return { ...style, layers: style.layers.map(restyle) };
}
