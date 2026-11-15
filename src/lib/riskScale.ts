// Risk colors. Single source of truth for map + UI; CSS vars --risk-* in globals.css mirror these.
// Green = Low, yellow = Watch, red = High, everywhere. Ice blue (--accent) is reserved for actions.

import type { DisplayLevel } from "./steps";

type RGB = [number, number, number];

export const LEVEL_RGB: Record<DisplayLevel, RGB> = {
  Low: [76, 175, 125], // #4caf7d green
  Watch: [242, 201, 76], // #f2c94c yellow
  High: [229, 72, 77], // #e5484d red
};

/**
 * Hex ramp by average home score, aligned to the level thresholds (Watch at 30, High at 60):
 * green through the Low band, yellow through Watch, red through High, with short blends at the edges.
 */
export const RISK_STOPS: { at: number; rgb: RGB }[] = [
  { at: 0, rgb: LEVEL_RGB.Low },
  { at: 25, rgb: LEVEL_RGB.Low },
  { at: 35, rgb: LEVEL_RGB.Watch },
  { at: 55, rgb: LEVEL_RGB.Watch },
  { at: 65, rgb: LEVEL_RGB.High },
  { at: 100, rgb: LEVEL_RGB.High },
];

export function riskRgb(score: number): RGB {
  const s = Math.min(100, Math.max(0, score));
  for (let i = 1; i < RISK_STOPS.length; i++) {
    const a = RISK_STOPS[i - 1];
    const b = RISK_STOPS[i];
    if (s <= b.at) {
      const t = (s - a.at) / (b.at - a.at);
      return [0, 1, 2].map((k) => Math.round(a.rgb[k] + (b.rgb[k] - a.rgb[k]) * t)) as RGB;
    }
  }
  return RISK_STOPS[RISK_STOPS.length - 1].rgb;
}

export const riskCss = (score: number) => `rgb(${riskRgb(score).join(" ")})`;

export const RISK_GRADIENT = `linear-gradient(90deg, ${RISK_STOPS.map((s) => `rgb(${s.rgb.join(" ")}) ${s.at}%`).join(", ")})`;

/** Tailwind classes for level dots/text (tokens in globals.css). */
export const LEVEL_BG: Record<DisplayLevel, string> = { Low: "bg-risk-low", Watch: "bg-risk-mid", High: "bg-risk-high" };
export const LEVEL_TEXT: Record<DisplayLevel, string> = { Low: "text-risk-low", Watch: "text-risk-mid", High: "text-risk-high" };

// ---------- Home status colors (both tabs; home status only) ----------
import type { HomeStatus } from "./household";

export const STATUS_ORDER: HomeStatus[] = ["ready", "needs_help", "waiting", "no_answer", "not_contacted"];
export const STATUS_RGB: Record<HomeStatus, RGB> = {
  ready: [56, 167, 121], // green  #38a779
  needs_help: [224, 82, 82], // red    #e05252
  waiting: [232, 188, 79], // yellow #e8bc4f
  no_answer: [17, 24, 39], // black  #111827
  not_contacted: [148, 163, 184], // gray #94a3b8
};
export const STATUS_BG: Record<HomeStatus, string> = {
  ready: "bg-status-ready",
  needs_help: "bg-status-help",
  waiting: "bg-status-waiting",
  no_answer: "bg-status-none ring-1 ring-text/60",
  not_contacted: "bg-status-gray",
};
export const STATUS_TEXT: Record<HomeStatus, string> = {
  ready: "text-status-ready",
  needs_help: "text-status-help",
  waiting: "text-status-waiting",
  no_answer: "text-text",
  not_contacted: "text-status-gray",
};
/** One-letter codes for the compact per-home status string sent to the console. */
export const STATUS_CODE: Record<HomeStatus, string> = { ready: "r", needs_help: "h", waiting: "w", no_answer: "n", not_contacted: "c" };
export const STATUS_FROM_CODE: Record<string, HomeStatus> = { r: "ready", h: "needs_help", w: "waiting", n: "no_answer", c: "not_contacted" };

// ---------- Hex "need" scale: % of homes needing action (its own blue ramp, never a status color) ----------
// Four steps on the off-white map, pale → deep navy-blue: the darker the cell, the more homes need action.
// The map draws exactly these classes, so the legend matches every cell. dataviz: one hue, lightness falls
// step by step, every adjacent pair ΔE ≥ 16.5 (≥ 15 = easy to tell apart). The palest step is 1.4:1 against
// the map (under dataviz's 2:1 for a bare fill), so every cell carries an outline: pale cells a mid-blue
// line, dark cells a white hairline that also separates neighbors. Fills are 94% opaque.
export interface NeedStep {
  min: number;
  label: string;
  fill: [number, number, number, number];
  /** What the fill looks like on screen over the map (the legend uses it). */
  swatch: string;
  /** Cell outline. */
  line: [number, number, number, number];
}
const BLUE_LINE: [number, number, number, number] = [42, 100, 173, 210];
const WHITE_LINE: [number, number, number, number] = [255, 255, 255, 175];
export const NEED_STEPS: NeedStep[] = [
  { min: 0, label: "Under 25%", fill: [158, 205, 241, 240], swatch: "#a3cff1", line: BLUE_LINE },
  { min: 0.25, label: "25–49%", fill: [86, 150, 215, 240], swatch: "#5f9bd8", line: BLUE_LINE },
  { min: 0.5, label: "50–74%", fill: [30, 91, 169, 240], swatch: "#2a64ad", line: WHITE_LINE },
  { min: 0.75, label: "75–100%", fill: [0, 41, 104, 240], swatch: "#0e3570", line: WHITE_LINE },
];

/** Step index (0–3) for a share 0–1 of homes needing action. */
export function needStep(share: number): number {
  let k = 0;
  for (let i = 0; i < NEED_STEPS.length; i++) if (share >= NEED_STEPS[i].min) k = i;
  return k;
}

/** share 0–1 -> RGBA of its step. */
export const needRgba = (share: number): [number, number, number, number] => NEED_STEPS[needStep(share)].fill;

// ---------- The map's look (light basemap; everything drawn on it) ----------
type RGBA = [number, number, number, number];
const CLOUD: RGB = [243, 246, 250];
const DARK_RING: RGBA = [11, 18, 32, 225];
export const MAP_LOOK = {
  /** CARTO Positron: free light basemap, no API key. Recoloured by src/lib/basemapStyle.ts with `ground`. */
  basemap: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  /**
   * The base map's own colours: a warm off-white ground, streets drawn as single dark-gray lines
   * (three weights: local, main, highway), light warm-gray building blocks. Labels in the same gray family.
   */
  ground: {
    land: "#f3f0e9",
    park: "rgba(214, 222, 202, 0.55)",
    water: "#c8d3d5",
    building: "#e3e0d8",
    buildingEdge: "#d2cec4",
    roadLocal: "#8d8a83",
    roadMain: "#66635d",
    roadHighway: "#4a4844",
    rail: "#a19d95",
    label: "#5e5a54",
  },
  hexLineFocus: [16, 28, 46, 235] as RGBA,
  highlight: [16, 28, 46, 40] as RGBA,
  /** Every dot: a thin dark ring (reads on the map and pale cells) over a light halo (reads on dark cells). */
  dotRing: DARK_RING,
  halo: {
    ready: [...CLOUD, 215],
    needs_help: [...CLOUD, 215],
    waiting: [...CLOUD, 215],
    no_answer: [...CLOUD, 245],
    not_contacted: [...CLOUD, 215],
  } as Record<HomeStatus, RGBA>,
  selectedLine: [16, 28, 46, 255] as RGBA,
  /** Crews: white vans with a Deep Blue outline (CrewVehicles.tsx); routes in Action Blue. */
  crew: [29, 53, 87] as RGB,
  crewRing: [255, 255, 255] as RGB,
  route: [74, 131, 204] as RGB,
};

// ---------- The /present deck's map (dark navy; cyan = FreezeLine acting, amber = risk) ----------
export const PRESENT_LOOK = {
  /** CARTO Positron recoloured to dark navy by src/lib/basemapStyle.ts (no key). */
  ground: {
    land: "#07111f",
    park: "rgba(18, 38, 52, 0.55)",
    water: "#0b1b30",
    building: "#0c1a2d",
    buildingEdge: "#10213a",
    roadLocal: "#111f33",
    roadMain: "#162740",
    roadHighway: "#1c304e",
    rail: "#111f33",
    label: "#3b4f6b",
  },
  /** Homes by risk level: Low a quiet slate, Watch dim amber, High full amber. */
  level: {
    Low: [120, 146, 178, 120],
    Watch: [242, 180, 65, 120],
    High: [255, 190, 72, 235],
  } as Record<DisplayLevel, RGBA>,
  /** Outreach: reached homes in cyan (brighter the further the funnel went), door checks in amber. */
  outreach: {
    quiet: [70, 92, 122, 90] as RGBA,
    texted: [95, 211, 230, 110] as RGBA,
    called: [95, 211, 230, 220] as RGBA,
    door: [242, 180, 65, 235] as RGBA,
  },
  crewRoute: [95, 211, 230] as RGB,
  crewDepot: [233, 239, 247, 255] as RGBA,
};
