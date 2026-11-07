"use client";

import { useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { LineLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { FlyToInterpolator, WebMercatorViewport, type MapViewState, type PickingInfo } from "@deck.gl/core";
import { cellToLatLng } from "h3-js";
import { Map } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ConsoleHome, HexBin } from "@/lib/replay";
import type { HomeStatus } from "@/lib/household";
import { STATUS_RGB, needRgba } from "@/lib/riskScale";

// Worker is copied into /public by `npm install` (scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre-gl-worker.mjs");

// Free CARTO dark basemap: no API key.
const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const TOP_BAR = 52;
const PANEL = 440;
const AREA_ZOOM = 16;

export interface CrewMarker {
  id: number;
  label: string;
  position: [number, number];
  target: [number, number] | null;
}

interface Dot {
  i: number;
  position: [number, number];
}

/** Fit every home on screen, leaving room for the timeline (bottom). */
function cityView(hexes: HexBin[]): MapViewState {
  const desktop = window.innerWidth >= 1024;
  const width = desktop ? window.innerWidth - PANEL : window.innerWidth;
  const height = desktop ? window.innerHeight - TOP_BAR : Math.max(400, window.innerHeight * 0.58); /* matches h-[58svh] */
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const h of hexes) {
    const [lat, lng] = cellToLatLng(h.h3);
    w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
  }
  const { longitude, latitude, zoom } = new WebMercatorViewport({ width, height }).fitBounds(
    [[w, s], [e, n]],
    { padding: { top: 40, bottom: 150, left: 32, right: 32 } },
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
  focusHex: string | null;
  selectedHome: number | null;
  onSelectHex: (h3: string) => void;
  onSelectHome: (idx: number) => void;
}

export default function RiskMap({ hexes, need, homes, statusOf, statusKey, crews, focusHex, selectedHome, onSelectHex, onSelectHome }: Props) {
  // Deck owns the camera (uncontrolled). Changing initialViewState with transition props makes
  // deck fly there itself; feeding interim frames back as a controlled viewState cancels the flight.
  const [initialViewState, setInitialViewState] = useState<MapViewState>(() => (focusHex ? areaView(focusHex) : cityView(hexes)));
  const [prevFocus, setPrevFocus] = useState(focusHex);
  if (focusHex !== prevFocus) {
    setPrevFocus(focusHex);
    setInitialViewState(fly(focusHex ? areaView(focusHex) : cityView(hexes)));
  }

  const dots = useMemo<Dot[]>(() => homes.map((h, i) => ({ i, position: [h.lng, h.lat] })), [homes]);
  const hexIndex = useMemo(() => new globalThis.Map(hexes.map((h, k) => [h.h3, k])), [hexes]);
  const focused = focusHex !== null;

  const hexLayer = new H3HexagonLayer<HexBin>({
    id: "need-hexes",
    data: hexes,
    getHexagon: (d) => d.h3,
    getFillColor: (d) => {
      const c = needRgba(need[hexIndex.get(d.h3)!] ?? 0);
      return d.h3 === focusHex ? [c[0], c[1], c[2], 30] : focused ? [c[0], c[1], c[2], Math.round(c[3] * 0.25)] : c;
    },
    getLineColor: (d) => (d.h3 === focusHex ? [230, 237, 243, 200] : [11, 16, 22, focused ? 40 : 120]),
    getLineWidth: (d) => (d.h3 === focusHex ? 2 : 1),
    lineWidthUnits: "pixels",
    stroked: true,
    filled: true,
    pickable: true,
    autoHighlight: !focused,
    highlightColor: [230, 237, 243, 50],
    updateTriggers: { getFillColor: [need, focusHex], getLineColor: focusHex, getLineWidth: focusHex },
    onClick: (info) => {
      if (info.object) onSelectHex(info.object.h3);
      return true;
    },
  });

  const dotLayer = new ScatterplotLayer<Dot>({
    id: "homes",
    data: dots,
    getPosition: (d) => d.position,
    getFillColor: (d) => STATUS_RGB[statusOf(d.i)],
    getRadius: (d) => (d.i === selectedHome ? 9 : 4),
    getLineColor: (d) =>
      d.i === selectedHome ? [230, 237, 243, 255] : statusOf(d.i) === "no_answer" ? [200, 210, 220, 220] : [11, 16, 22, 160],
    getLineWidth: (d) => (d.i === selectedHome ? 3 : 1),
    radiusUnits: "meters",
    radiusMinPixels: 1.8,
    radiusMaxPixels: 12,
    lineWidthUnits: "pixels",
    lineWidthMinPixels: 0.5,
    stroked: true,
    pickable: true,
    // Same ground plane as the hexes: always draw on top instead of z-fighting with them.
    parameters: { depthCompare: "always" },
    updateTriggers: { getFillColor: statusKey, getLineColor: [statusKey, selectedHome], getRadius: selectedHome, getLineWidth: selectedHome },
    onClick: (info) => {
      if (info.object) onSelectHome(info.object.i);
      return true;
    },
  });

  const crewLines = new LineLayer<CrewMarker>({
    id: "crew-lines",
    data: crews.filter((c) => c.target),
    getSourcePosition: (d) => d.position,
    getTargetPosition: (d) => d.target!,
    getColor: [125, 211, 252, 230],
    getWidth: 2,
    widthUnits: "pixels",
    parameters: { depthCompare: "always" },
  });
  const crewDots = new ScatterplotLayer<CrewMarker>({
    id: "crews",
    data: crews,
    getPosition: (d) => d.position,
    getFillColor: [125, 211, 252, 255],
    getLineColor: [11, 16, 22, 255],
    getRadius: 11,
    radiusUnits: "pixels",
    stroked: true,
    getLineWidth: 2,
    lineWidthUnits: "pixels",
    pickable: true,
    parameters: { depthCompare: "always" },
  });
  const crewLabels = new TextLayer<CrewMarker>({
    id: "crew-labels",
    data: crews,
    getPosition: (d) => d.position,
    getText: (d) => String(d.id),
    getColor: [11, 16, 22, 255],
    getSize: 13,
    fontWeight: 700,
    getTextAnchor: "middle",
    getAlignmentBaseline: "center",
    parameters: { depthCompare: "always" },
  });

  return (
    <DeckGL
      initialViewState={initialViewState}
      controller={{ dragRotate: false }}
      layers={[hexLayer, dotLayer, crewLines, crewDots, crewLabels]}
      onError={(err) => console.error("[FreezeLine map]", err)}
      getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
      getTooltip={({ object, layer }: PickingInfo<HexBin | Dot | CrewMarker>) => {
        if (!object) return null;
        let text: string | null = null;
        if (layer?.id === "homes") text = homes[(object as Dot).i].label;
        else if (layer?.id === "crews") text = (object as CrewMarker).label;
        else if (layer?.id === "need-hexes" && (object as HexBin).h3 !== focusHex) {
          const k = hexIndex.get((object as HexBin).h3)!;
          text = `${(object as HexBin).neighborhood} · ${Math.round((need[k] ?? 0) * 100)}% of ${(object as HexBin).homeIdx.length} homes need action`;
        }
        return text
          ? { text, style: { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "8px", padding: "6px 10px", fontSize: "12px" } }
          : null;
      }}
    >
      <Map mapStyle={BASEMAP} attributionControl={{ compact: true }} />
    </DeckGL>
  );
}
