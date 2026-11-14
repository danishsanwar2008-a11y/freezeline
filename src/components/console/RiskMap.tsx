"use client";

import { useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { PathLayer, ScatterplotLayer, SolidPolygonLayer } from "@deck.gl/layers";
import { FlyToInterpolator, WebMercatorViewport, type MapViewState, type PickingInfo } from "@deck.gl/core";
import { cellToLatLng } from "h3-js";
import { Map } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ConsoleHome, HexBin } from "@/lib/replay";
import type { HomeStatus } from "@/lib/household";
import { MAP_LOOK, NEED_STEPS, STATUS_RGB, needStep } from "@/lib/riskScale";
import type { HexWhy } from "@/lib/hexWhy";

// Worker is copied into /public by `npm install` (scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre-gl-worker.mjs");

/** Everything drawn on the light basemap (palette E2; values in src/lib/riskScale.ts). */
const look = {
  basemap: MAP_LOOK.basemap,
  steps: NEED_STEPS,
  hexLineFocus: MAP_LOOK.hexLineFocus,
  highlight: MAP_LOOK.highlight,
  tint: MAP_LOOK.wash,
  status: STATUS_RGB,
  statusLine: MAP_LOOK.dotRing,
  halo: MAP_LOOK.halo,
  selectedLine: MAP_LOOK.selectedLine,
  crew: MAP_LOOK.crew,
  crewRing: MAP_LOOK.crewRing,
  floating: true,
};
const TOP_BAR = 52;
const PANEL = 440;
const AREA_ZOOM = 16;

/** Crew marker + the rest of its street route (no text labels on the map; names and trips are in the boxes). */
export interface CrewMarker {
  id: number;
  name: string;
  position: [number, number];
  /** The route still to drive, [lng, lat] from the marker to the home; null when not driving. */
  rest: [number, number][] | null;
  minutesLeft: number;
  street: string | null;
}

interface Dot {
  i: number;
  position: [number, number];
}

/** Fit every home on screen, leaving room for the timeline (bottom). */
function cityView(hexes: HexBin[], floating = false): MapViewState {
  const desktop = window.innerWidth >= 1024;
  // Floating boxes: the map is full width and the camera leaves room for the left and right columns.
  const over = floating && desktop;
  const width = desktop && !over ? window.innerWidth - PANEL : window.innerWidth;
  const height = desktop ? window.innerHeight - TOP_BAR : Math.max(400, window.innerHeight * 0.58); /* matches h-[58svh] */
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const h of hexes) {
    const [lat, lng] = cellToLatLng(h.h3);
    w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
  }
  const { longitude, latitude, zoom } = new WebMercatorViewport({ width, height }).fitBounds(
    [[w, s], [e, n]],
    { padding: { top: 40, bottom: 150, left: over ? 330 : 32, right: over ? 410 : 32 } },
  );
  return { longitude, latitude, zoom, pitch: 0, bearing: 0 };
}

function areaView(h3: string): MapViewState {
  const [latitude, longitude] = cellToLatLng(h3);
  return { longitude, latitude: latitude - 0.0005, zoom: AREA_ZOOM, pitch: 0, bearing: 0 };
}

const fly = (v: MapViewState): MapViewState => ({
  ...v,
  transitionDuration: 1100,
  transitionInterpolator: new FlyToInterpolator({ speed: 1.6 }),
});

interface Props {
  hexes: HexBin[];
  /** Share (0–1) of homes needing action tonight, per hex (same order as hexes). */
  need: Float32Array;
  homes: ConsoleHome[];
  /** Status per home index; changes trigger a recolor. */
  statusOf: (i: number) => HomeStatus;
  statusKey: string;
  crews: CrewMarker[];
  /** "Why this shade?" for a hex (index into hexes). */
  explain: (hexIdx: number) => HexWhy;
  focusHex: string | null;
  selectedHome: number | null;
  onSelectHex: (h3: string) => void;
  onSelectHome: (idx: number) => void;
}

export default function RiskMap({ hexes, need, homes, statusOf, statusKey, crews, explain, focusHex, selectedHome, onSelectHex, onSelectHome }: Props) {
  // Deck owns the camera (uncontrolled). Changing initialViewState with transition props makes
  // deck fly there itself; feeding interim frames back as a controlled viewState cancels the flight.
  const [initialViewState, setInitialViewState] = useState<MapViewState>(() => (focusHex ? areaView(focusHex) : cityView(hexes, look.floating)));
  const [prevFocus, setPrevFocus] = useState(focusHex);
  if (focusHex !== prevFocus) {
    setPrevFocus(focusHex);
    setInitialViewState(fly(focusHex ? areaView(focusHex) : cityView(hexes, look.floating)));
  }

  const dots = useMemo<Dot[]>(() => homes.map((h, i) => ({ i, position: [h.lng, h.lat] })), [homes]);
  const hexIndex = useMemo(() => new globalThis.Map(hexes.map((h, k) => [h.h3, k])), [hexes]);
  const focused = focusHex !== null;

  const hexLayer = new H3HexagonLayer<HexBin>({
    id: "need-hexes",
    data: hexes,
    getHexagon: (d) => d.h3,
    getFillColor: (d) => {
      const c = look.steps[needStep(need[hexIndex.get(d.h3)!] ?? 0)].fill;
      return d.h3 === focusHex ? [c[0], c[1], c[2], 30] : focused ? [c[0], c[1], c[2], Math.round(c[3] * 0.25)] : c;
    },
    getLineColor: (d) => {
      if (d.h3 === focusHex) return look.hexLineFocus;
      const l = look.steps[needStep(need[hexIndex.get(d.h3)!] ?? 0)].line;
      return [l[0], l[1], l[2], focused ? 60 : l[3]];
    },
    getLineWidth: (d) => (d.h3 === focusHex ? 2 : 1),
    lineWidthUnits: "pixels",
    extruded: false, // flat cells (deck's H3 layer defaults to 3D columns, which hide the home dots)
    // Flat shading under the dots: never occlude them.
    parameters: { depthWriteEnabled: false },
    stroked: true,
    filled: true,
    pickable: true,
    autoHighlight: !focused,
    highlightColor: look.highlight,
    updateTriggers: { getFillColor: [need, focusHex, look], getLineColor: [need, focusHex, look], getLineWidth: focusHex },
    onClick: (info) => {
      if (info.object) onSelectHex(info.object.h3);
      return true;
    },
  });

  const dotLayer = new ScatterplotLayer<Dot>({
    id: "homes",
    data: dots,
    getPosition: (d) => d.position,
    getFillColor: (d) => look.status[statusOf(d.i)],
    getRadius: (d) => (d.i === selectedHome ? 9 : 4),
    getLineColor: (d) => (d.i === selectedHome ? look.selectedLine : look.statusLine),
    getLineWidth: (d) => (d.i === selectedHome ? 3 : 0.7),
    radiusUnits: "meters",
    radiusMinPixels: 1.8,
    radiusMaxPixels: 12,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: 0.35,
    stroked: true,
    pickable: true,
    // Same ground plane as the hexes: always draw on top instead of z-fighting with them.
    parameters: { depthCompare: "always" },
    updateTriggers: { getFillColor: [statusKey, look], getLineColor: [statusKey, selectedHome, look], getRadius: selectedHome, getLineWidth: selectedHome },
    onClick: (info) => {
      if (info.object) onSelectHome(info.object.i);
      return true;
    },
  });

  // White halo under the dots (light map only): keeps every dot readable on the deepest blue cells.
  const haloLayer = new ScatterplotLayer<Dot>({
        id: "home-halos",
        data: dots,
        getPosition: (d) => d.position,
        getFillColor: (d) => look.halo[statusOf(d.i)],
        // 1.4x the dot, with the dot's own pixel floor: at city zoom the halo hides under the dot
        // (no white speckle over the cells); it shows as a thin ring once the map is zoomed in.
        getRadius: (d) => (d.i === selectedHome ? 9 : 4) * 1.4,
        radiusUnits: "meters",
        radiusMinPixels: 1.8,
        radiusMaxPixels: 16.8,
        stroked: false,
        pickable: false,
        parameters: { depthCompare: "always" },
        updateTriggers: { getRadius: selectedHome, getFillColor: statusKey },
      });

  // The route still to drive, along the streets (Action Blue), under the crew dot.
  const crewLines = new PathLayer<CrewMarker>({
    id: "crew-routes",
    data: crews.filter((c) => c.rest && c.rest.length > 1),
    getPath: (d) => d.rest!,
    getColor: [...MAP_LOOK.route, 235],
    getWidth: 3,
    widthUnits: "pixels",
    capRounded: true,
    jointRounded: true,
    parameters: { depthCompare: "always" },
  });
  const crewDots = new ScatterplotLayer<CrewMarker>({
    id: "crews",
    data: crews,
    getPosition: (d) => d.position,
    getFillColor: [...look.crew, 255],
    getLineColor: [...look.crewRing, 255],
    getRadius: 7,
    radiusUnits: "pixels",
    stroked: true,
    getLineWidth: 2,
    lineWidthUnits: "pixels",
    pickable: true,
    parameters: { depthCompare: "always" },
  });

  // Faint gray wash over the basemap: off-white, slightly gray.
  const tintLayer = new SolidPolygonLayer<{ polygon: [number, number][] }>({
        id: "map-tint",
        data: [{ polygon: [[-97, 28.5], [-93.5, 28.5], [-93.5, 31], [-97, 31]] }],
        getPolygon: (d) => d.polygon,
        getFillColor: look.tint,
        pickable: false,
      });

  return (
    <DeckGL
      initialViewState={initialViewState}
      controller={{ dragRotate: false }}
      layers={[tintLayer, hexLayer, haloLayer, dotLayer, crewLines, crewDots]}
      onError={(err) => console.error("[FreezeLine map]", err)}
      getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
      getTooltip={({ object, layer }: PickingInfo<HexBin | Dot | CrewMarker>) => {
        if (!object) return null;
        if (layer?.id === "homes") return { text: homes[(object as Dot).i].label, style: TIP_STYLE };
        if (layer?.id === "crews") {
          const c = object as CrewMarker;
          const text = c.street
            ? c.minutesLeft > 0
              ? `${c.name} · ~${c.minutesLeft} min to ${c.street} (simulated)`
              : `${c.name} · helping a home on ${c.street}`
            : `${c.name} · on standby`;
          return { text, style: TIP_STYLE };
        }
        if (layer?.id === "need-hexes" && (object as HexBin).h3 !== focusHex) {
          const hex = object as HexBin;
          return { html: whyHtml(hex.neighborhood, explain(hexIndex.get(hex.h3)!)), style: TIP_STYLE };
        }
        return null;
      }}
    >
      <Map mapStyle={look.basemap} attributionControl={{ compact: true }} />
    </DeckGL>
  );
}

const TIP_STYLE = {
  background: "var(--surface)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "8px 10px",
  fontSize: "12px",
  maxWidth: "270px",
};

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Hex tooltip: share needing action (bar in its legend color) + the top 2 reasons, real vs simulated marked. */
function whyHtml(area: string, w: HexWhy): string {
  const pct = Math.round(w.share * 100);
  const color = NEED_STEPS[needStep(w.share)].swatch;
  const tag = (simulated: boolean) =>
    `<span style="margin-left:4px;font-size:10px;color:${simulated ? "var(--warn)" : "var(--muted)"}">${simulated ? "simulated" : "real weather"}</span>`;
  const homesWord = w.total === 1 ? "home" : "homes";
  return [
    `<div style="font-weight:600">Why this shade? <span style="font-weight:400;color:var(--muted)">· ${esc(area)}</span></div>`,
    `<div style="margin-top:4px">${pct}% need action · ${w.need.toLocaleString("en-US")} of ${w.total.toLocaleString("en-US")} ${homesWord}</div>`,
    `<div style="margin-top:4px;height:6px;border-radius:3px;background:var(--border);overflow:hidden"><div style="height:100%;width:${pct}%;background:${color}"></div></div>`,
    `<ol style="margin:6px 0 0;padding-left:16px;list-style:decimal;line-height:1.4">${w.reasons
      .map((r) => `<li>${esc(r.text)}${tag(r.simulated)}</li>`)
      .join("")}</ol>`,
  ].join("");
}
