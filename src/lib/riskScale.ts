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
  ready: [76, 175, 125], // green  #4caf7d
  needs_help: [229, 72, 77], // red    #e5484d
  waiting: [242, 201, 76], // yellow #f2c94c
  no_answer: [12, 14, 18], // black  #0c0e12 (drawn with a light outline on the dark map)
  not_contacted: [138, 155, 174], // gray #8a9bae
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

// ---------- Hex "need" scale: % of homes needing action tonight (its own violet ramp, never a status color) ----------
// Four steps, faint -> deep violet. The map draws exactly these classes, so the legend matches every cell.
// `fill` is drawn over the dark basemap; `swatch` is what that looks like on screen (the legend uses it).
// Checked with the dataviz validator over the dark map: adjacent steps ΔE ≥ 15.5 (normal vision), ≥ 14.9 (CVD).
export interface NeedStep {
  min: number;
  label: string;
  fill: [number, number, number, number];
  swatch: string;
}
export const NEED_STEPS: NeedStep[] = [
  { min: 0, label: "Under 25%", fill: [42, 32, 74, 153], swatch: "#1f1932" },
  { min: 0.25, label: "25–49%", fill: [78, 54, 155, 199], swatch: "#402d7c" },
  { min: 0.5, label: "50–74%", fill: [122, 79, 239, 224], swatch: "#6d47d4" },
  { min: 0.75, label: "75% or more", fill: [179, 141, 255, 240], swatch: "#a985f1" },
];

/** Step index (0–3) for a share 0–1 of homes needing action. */
export function needStep(share: number): number {
  let k = 0;
  for (let i = 0; i < NEED_STEPS.length; i++) if (share >= NEED_STEPS[i].min) k = i;
  return k;
}

/** share 0–1 -> RGBA of its step. */
export const needRgba = (share: number): [number, number, number, number] => NEED_STEPS[needStep(share)].fill;
