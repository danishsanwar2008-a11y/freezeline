"use client";

import { useEffect, useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { TripsLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import { FlyToInterpolator, WebMercatorViewport, type MapViewState } from "@deck.gl/core";
import { Map } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import { motion } from "motion/react";
import "maplibre-gl/dist/maplibre-gl.css";
import { levelFor, scoreFrom } from "@/lib/risk";
import { displayLevel } from "@/lib/steps";
import { MAP_LOOK, PRESENT_LOOK } from "@/lib/riskScale";
import { recolorBasemap, type StyleLike } from "@/lib/basemapStyle";
import { CAMERA_MS } from "./motion";
import { STAGE } from "./Stage";
import type { Beat } from "./timeline";
import type { PresentData } from "./types";

setWorkerUrl("/maplibre-gl-worker.mjs");

// The deck's one map: the console's deck.gl + MapLibre stack on a navy-recoloured Positron basemap.
// It stays mounted across scenes; each beat sets a camera shot, what the dots show, and how bright the
// map is behind the scene's text. It renders at the window's own resolution (outside the scaled stage).

let basemap: Promise<StyleLike | string> | null = null;
function loadBasemap() {
  basemap ??= fetch(MAP_LOOK.basemap)
    .then((r) => (r.ok ? (r.json() as Promise<StyleLike>) : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((s) => recolorBasemap(s, PRESENT_LOOK.ground))
    // A presentation backdrop: street names, POI icons, small labels and boundary lines compete with the homes and the
    // slide text, so only the city name stays.
    .then((s) => ({
      ...s,
      layers: s.layers.filter((l) => !/^boundary/.test(String(l.id)) && (l.type !== "symbol" || /^place_city/.test(String(l.id)))),
    }))
    .catch(() => MAP_LOOK.basemap);
  return basemap;
}

type Mode = "risk" | "outreach";
interface Shot {
  /** 0 = map hidden behind the scene, 1 = full. */
  bright: number;
  mode: Mode;
  /** Where the homes sit on screen (the scene's text takes the other side), and extra zoom on top of that frame. */
  frame: "right" | "left" | "center";
  zoomIn: number;
  pitch: number;
  /** How far the outreach funnel has gone (1 text, 2 call, 3 door, 4 crews). */
  funnel: number;
}

const CITY: Shot = { bright: 1, mode: "risk", frame: "right", zoomIn: 0, pitch: 0, funnel: 0 };
const SHOTS: Record<Beat, Shot> = {
  title: { ...CITY, bright: 0.35 },
  calm: CITY,
  storm: CITY,
  peak: { ...CITY, zoomIn: 0.15, pitch: 35 },
  blanket: { ...CITY, bright: 0.12 },
  targeted: { ...CITY, bright: 0.12 },
  stage2: { ...CITY, bright: 0.12 },
  text: { ...CITY, mode: "outreach", funnel: 1, frame: "left" },
  call: { ...CITY, mode: "outreach", funnel: 2, frame: "left" },
  door: { ...CITY, mode: "outreach", funnel: 3, frame: "left" },
  crews: { ...CITY, mode: "outreach", funnel: 4, frame: "left", zoomIn: 0.2, pitch: 30 },
  data: { ...CITY, bright: 0 },
  engine: { ...CITY, bright: 0 },
  agent: { ...CITY, bright: 0 },
  stack: { ...CITY, bright: 0 },
};

/** The camera that fits every home into the shot's side of the screen, then its extra zoom and tilt. */
function cameraFor(data: PresentData, shot: Shot, size: { w: number; h: number }): MapViewState {
  const { lat, lng } = data.homes;
  let s = 90, w = 180, n = -90, e = -180;
  for (let i = 0; i < lat.length; i++) {
    s = Math.min(s, lat[i]); n = Math.max(n, lat[i]); w = Math.min(w, lng[i]); e = Math.max(e, lng[i]);
  }
  // Frame the homes inside the slide itself (the 16:9 stage, letterboxed on other screen shapes),
  // on the side away from the scene's text column.
  const scale = Math.min(size.w / STAGE.width, size.h / STAGE.height);
  const sw = STAGE.width * scale, sh = STAGE.height * scale;
  const ox = (size.w - sw) / 2, oy = (size.h - sh) / 2;
  const edge = Math.round(sh * 0.08);
  const text = Math.round(sw * 0.44); // the scene's text column
  const padding =
    shot.frame === "right"
      ? { top: oy + edge, bottom: oy + edge * 2.2, left: ox + text, right: ox + edge }
      : shot.frame === "left"
        ? { top: oy + edge, bottom: oy + edge * 2.2, left: ox + edge, right: ox + text }
        : { top: oy + edge, bottom: oy + edge, left: ox + edge, right: ox + edge };
  const fit = new WebMercatorViewport({ width: size.w, height: size.h }).fitBounds([[w, s], [e, n]], { padding });
  if (!shot.zoomIn) return { longitude: fit.longitude, latitude: fit.latitude, zoom: fit.zoom, pitch: shot.pitch, bearing: 0 };
  // Zooming in keeps the homes' centre where the frame put it on screen.
  const cx = (w + e) / 2, cy = (s + n) / 2;
  const at = new WebMercatorViewport({ width: size.w, height: size.h, longitude: fit.longitude, latitude: fit.latitude, zoom: fit.zoom });
  const [sx, sy] = at.project([cx, cy]);
  const zoomed = new WebMercatorViewport({ width: size.w, height: size.h, longitude: cx, latitude: cy, zoom: fit.zoom + shot.zoomIn });
  const [lng0, lat0] = zoomed.unproject([size.w - sx, size.h - sy]);
  return { longitude: lng0, latitude: lat0, zoom: fit.zoom + shot.zoomIn, pitch: shot.pitch, bearing: 0 };
}

/** Cumulative distance along each route, scaled to 0-1000, so every crew arrives at the same moment. */
function timestamps(path: [number, number][]): number[] {
  const d = [0];
  for (let i = 1; i < path.length; i++) d.push(d[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = d.at(-1) || 1;
  return d.map((x) => (x / total) * 1000);
}

export default function PresentMap({ data, beat, hour, reduced }: { data: PresentData; beat: Beat; hour: number; reduced: boolean }) {
  const shot = SHOTS[beat];
  const [style, setStyle] = useState<StyleLike | string | null>(null);
  const [size, setSize] = useState({ w: 1920, h: 1080 });
  useEffect(() => {
    void loadBasemap().then(setStyle);
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const view = useMemo(
    () => ({
      ...cameraFor(data, shot, size),
      transitionDuration: reduced ? 0 : CAMERA_MS,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.1 }),
    }),
    [data, shot, size, reduced],
  );

  // Crews drive their routes once on the "crews" beat (instantly with reduced motion).
  // State changes only inside animation frames; the still values are derived below.
  const [tripAnim, setTripAnim] = useState(0);
  useEffect(() => {
    if (beat !== "crews" || reduced) return;
    const t0 = performance.now();
    let id = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 4200);
      setTripAnim(k * 1400);
      if (k < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [beat, reduced]);
  const trip = beat !== "crews" ? 0 : reduced ? 1400 : tripAnim;

  const index = useMemo(() => Array.from({ length: data.homes.lat.length }, (_, i) => i), [data]);
  const trips = useMemo(() => data.crews.map((c) => ({ ...c, ts: timestamps(c.path) })), [data]);

  const homeColor = (i: number) => {
    if (shot.mode === "outreach") {
      const c = data.outreach.contact[i];
      const f = shot.funnel;
      if (c === "d" && f >= 3) return PRESENT_LOOK.outreach.door;
      if ((c === "c" || c === "d") && f >= 2) return PRESENT_LOOK.outreach.called;
      if (c !== "-" && f >= 1) return PRESENT_LOOK.outreach.texted;
      return PRESENT_LOOK.outreach.quiet;
    }
    // Same engine as the console: weather exposure for the home's area at this hour x its vulnerability.
    const lvl = displayLevel(levelFor(scoreFrom(data.exposure[data.homes.zone[i]][hour], data.homes.vuln[i])));
    return PRESENT_LOOK.level[lvl];
  };

  const layers = [
    new ScatterplotLayer<number>({
      id: "homes",
      data: index,
      getPosition: (i) => [data.homes.lng[i], data.homes.lat[i]],
      getRadius: 16,
      radiusUnits: "meters",
      radiusMinPixels: 1.4,
      radiusMaxPixels: 6,
      getFillColor: homeColor,
      updateTriggers: { getFillColor: [shot.mode, shot.funnel, hour] },
      // Fades only between outreach steps; while the storm sweeps, the hour itself is the animation.
      transitions: reduced || shot.mode === "risk" ? undefined : { getFillColor: 450 },
    }),
    ...(beat === "crews"
      ? [
          new TripsLayer<(typeof trips)[number]>({
            id: "crew-routes",
            data: trips,
            getPath: (d) => d.path,
            getTimestamps: (d) => d.ts,
            getColor: PRESENT_LOOK.crewRoute,
            widthMinPixels: 3,
            capRounded: true,
            jointRounded: true,
            trailLength: 1400,
            currentTime: trip,
            fadeTrail: false,
          }),
          new ScatterplotLayer<(typeof trips)[number]>({
            id: "crew-depots",
            data: trips,
            getPosition: (d) => d.depot,
            getRadius: 5,
            radiusUnits: "pixels",
            getFillColor: PRESENT_LOOK.crewDepot,
          }),
          new ScatterplotLayer<(typeof trips)[number]>({
            id: "crew-homes",
            data: trips,
            getPosition: (d) => d.path.at(-1)!,
            getRadius: 7,
            radiusUnits: "pixels",
            filled: false,
            stroked: true,
            lineWidthMinPixels: 2,
            getLineColor: PRESENT_LOOK.outreach.door,
          }),
        ]
      : []),
  ];

  return (
    <motion.div
      className="fixed inset-0"
      aria-hidden
      initial={false}
      animate={{ opacity: shot.bright }}
      transition={{ duration: reduced ? 0 : 1.2, ease: [0.2, 0, 0, 1] }}
    >
      <DeckGL viewState={view} controller={false} layers={layers} style={{ position: "absolute", inset: "0" }}>
        {style && <Map mapStyle={style as never} attributionControl={false} reuseMaps />}
      </DeckGL>
      <p className="absolute bottom-3 right-4 text-[11px] text-present-muted/70">© OpenStreetMap contributors · © CARTO</p>
    </motion.div>
  );
}
