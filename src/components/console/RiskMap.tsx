"use client";

import { useState } from "react";
import DeckGL from "@deck.gl/react";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { WebMercatorViewport, type PickingInfo } from "@deck.gl/core";
import { cellToLatLng } from "h3-js";
import { Map } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Worker is copied into /public by `npm install` (scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre-gl-worker.mjs");
import type { HexBin } from "@/lib/replay";
import { riskRgb } from "@/lib/riskScale";

// Free CARTO dark basemap: no API key.
const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Fit every home on screen, leaving room for the label (top) and the timeline (bottom).
function fitHomes(hexes: HexBin[], width: number, height: number) {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const h of hexes) {
    const [lat, lng] = cellToLatLng(h.h3);
    w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
  }
  const { longitude, latitude, zoom } = new WebMercatorViewport({ width, height }).fitBounds(
    [[w, s], [e, n]],
    { padding: { top: 56, bottom: 150, left: 32, right: 32 } },
  );
  return { longitude, latitude, zoom, pitch: 0, bearing: 0 };
}

interface Props {
  hexes: HexBin[];
  hour: number;
  selected: string | null;
  onSelect: (h3: string | null) => void;
}

export default function RiskMap({ hexes, hour, selected, onSelect }: Props) {
  const [view] = useState(() => {
    const desktop = window.innerWidth >= 1024; // lg: side panel is 380px wide
    return fitHomes(
      hexes,
      desktop ? window.innerWidth - 380 : window.innerWidth,
      desktop ? window.innerHeight : Math.max(420, window.innerHeight * 0.62),
    );
  });

  const layer = new H3HexagonLayer<HexBin>({
    id: "risk-hexes",
    data: hexes,
    getHexagon: (d) => d.h3,
    getFillColor: (d) => [...riskRgb(d.avg[hour]), 205] as [number, number, number, number],
    getLineColor: (d) => (d.h3 === selected ? [230, 237, 243, 255] : [11, 16, 22, 160]),
    getLineWidth: (d) => (d.h3 === selected ? 3 : 1),
    lineWidthUnits: "pixels",
    extruded: false,
    stroked: true,
    filled: true,
    pickable: true,
    autoHighlight: true,
    highlightColor: [230, 237, 243, 60],
    updateTriggers: { getFillColor: hour, getLineColor: selected, getLineWidth: selected },
    transitions: { getFillColor: 140 },
  });

  return (
    <DeckGL
      initialViewState={view}
      controller={{ dragRotate: false }}
      layers={[layer]}
      onClick={(info: PickingInfo<HexBin>) => onSelect(info.object ? info.object.h3 : null)}
      getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
      getTooltip={({ object }: PickingInfo<HexBin>) =>
        object ? {
          html: `<div style="font-family:var(--font-geist-mono);font-size:12px">
            <div style="color:var(--muted)">${object.neighborhood}</div>
            <div>Avg risk <b>${Math.round(object.avg[hour])}</b> · ${object.homeIdx.length} homes</div></div>`,
          style: {
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "8px 10px",
          },
        } : null
      }
    >
      <Map mapStyle={BASEMAP} attributionControl={{ compact: true }} />
    </DeckGL>
  );
}
