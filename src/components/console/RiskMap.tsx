"use client";

import { useState } from "react";
import DeckGL from "@deck.gl/react";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import { FlyToInterpolator, WebMercatorViewport, type MapViewState, type PickingInfo } from "@deck.gl/core";
import { cellToLatLng } from "h3-js";
import { Map } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { HexBin } from "@/lib/replay";
import type { DisplayLevel } from "@/lib/steps";
import { LEVEL_RGB, riskRgb } from "@/lib/riskScale";

// Worker is copied into /public by `npm install` (scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre-gl-worker.mjs");

// Free CARTO dark basemap: no API key.
const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const TOP_BAR = 52;
const PANEL = 420;
const AREA_ZOOM = 15.6;

export interface HomeMarker {
  idx: number;
  position: [number, number];
  level: DisplayLevel;
  label: string;
}

/** Fit every home on screen, leaving room for the timeline (bottom). */
function cityView(hexes: HexBin[]): MapViewState {
  const desktop = window.innerWidth >= 1024;
  const width = desktop ? window.innerWidth - PANEL : window.innerWidth;
  const height = desktop ? window.innerHeight - TOP_BAR : Math.max(400, window.innerHeight * 0.58);
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
  // Nudge the center south a little so markers sit above the timeline.
  return { longitude, latitude: latitude - 0.0006, zoom: AREA_ZOOM, pitch: 0, bearing: 0 };
}

const fly = (v: MapViewState): MapViewState => ({
  ...v,
  transitionDuration: 1100,
  transitionInterpolator: new FlyToInterpolator({ speed: 1.6 }),
});

interface Props {
  hexes: HexBin[];
  hour: number;
  focusHex: string | null;
  markers: HomeMarker[];
  selectedHome: number | null;
  onSelectHex: (h3: string) => void;
  onSelectHome: (idx: number) => void;
}

export default function RiskMap({ hexes, hour, focusHex, markers, selectedHome, onSelectHex, onSelectHome }: Props) {
  // Deck owns the camera (uncontrolled). Changing initialViewState with transition props makes
  // deck fly there itself; feeding interim frames back as a controlled viewState cancels the flight.
  const [initialViewState, setInitialViewState] = useState<MapViewState>(() =>
    focusHex ? areaView(focusHex) : cityView(hexes),
  );
  const [prevFocus, setPrevFocus] = useState(focusHex);
  if (focusHex !== prevFocus) {
    // Fly when the focused area changes (from the map or the side panel).
    setPrevFocus(focusHex);
    setInitialViewState(fly(focusHex ? areaView(focusHex) : cityView(hexes)));
  }

  const focused = focusHex !== null;
  const hexLayer = new H3HexagonLayer<HexBin>({
    id: "risk-hexes",
    data: hexes,
    getHexagon: (d) => d.h3,
    // Zoomed into an area: neighbors fade to a whisper so the home markers carry the story.
    getFillColor: (d) =>
      d.h3 === focusHex
        ? [230, 237, 243, 14]
        : ([...riskRgb(d.avg[hour]), focused ? 22 : 205] as [number, number, number, number]),
    getLineColor: (d) => (d.h3 === focusHex ? [230, 237, 243, 200] : focused ? [138, 155, 174, 40] : [11, 16, 22, 160]),
    getLineWidth: (d) => (d.h3 === focusHex ? 2 : 1),
    lineWidthUnits: "pixels",
    stroked: true,
    filled: true,
    pickable: true,
    parameters: { depthWriteEnabled: false },
    autoHighlight: !focused,
    highlightColor: [230, 237, 243, 60],
    updateTriggers: { getFillColor: [hour, focusHex], getLineColor: focusHex, getLineWidth: focusHex },
    onClick: (info) => {
      if (info.object) onSelectHex(info.object.h3);
      return true;
    },
  });

  const homeLayer = new ScatterplotLayer<HomeMarker>({
    id: "homes",
    data: markers,
    getPosition: (d) => d.position,
    getFillColor: (d) => LEVEL_RGB[d.level],
    getRadius: (d) => (d.idx === selectedHome ? 11 : 7),
    getLineColor: (d) => (d.idx === selectedHome ? [230, 237, 243, 255] : [11, 16, 22, 255]),
    getLineWidth: (d) => (d.idx === selectedHome ? 3 : 2),
    radiusUnits: "pixels",
    lineWidthUnits: "pixels",
    stroked: true,
    pickable: true,
    // Same ground plane as the hexes: always draw on top instead of z-fighting with them.
    parameters: { depthCompare: "always" },
    updateTriggers: { getFillColor: markers, getRadius: selectedHome, getLineColor: selectedHome, getLineWidth: selectedHome },
    transitions: { getRadius: 150 },
    onClick: (info) => {
      if (info.object) onSelectHome(info.object.idx);
      return true;
    },
  });

  return (
    <DeckGL
      initialViewState={initialViewState}
      controller={{ dragRotate: false }}
      layers={[hexLayer, homeLayer]}
      onError={(err) => console.error("[FreezeLine map]", err)}
      getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
      getTooltip={({ object, layer }: PickingInfo<HexBin | HomeMarker>) => {
        if (!object) return null;
        const text =
          layer?.id === "homes"
            ? `${(object as HomeMarker).label} · ${(object as HomeMarker).level}`
            : (object as HexBin).h3 === focusHex
              ? null
              : `${(object as HexBin).neighborhood} · ${(object as HexBin).homeIdx.length} homes`;
        return text
          ? {
              text,
              style: {
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "6px 10px",
                fontSize: "12px",
              },
            }
          : null;
      }}
    >
      <Map mapStyle={BASEMAP} attributionControl={{ compact: true }} />
    </DeckGL>
  );
}
