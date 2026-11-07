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
const NEED_LOW: RGB = [221, 214, 254]; // #ddd6fe pale violet
const NEED_HIGH: RGB = [124, 58, 237]; // #7c3aed deep violet
/** share 0–1 -> RGBA; low shares stay faint so hot spots stand out. */
export function needRgba(share: number): [number, number, number, number] {
  const t = Math.min(1, Math.max(0, share));
  const c = [0, 1, 2].map((k) => Math.round(NEED_LOW[k] + (NEED_HIGH[k] - NEED_LOW[k]) * t)) as RGB;
  return [...c, Math.round(25 + 190 * t)];
}
export const NEED_GRADIENT = `linear-gradient(90deg, rgb(${NEED_LOW.join(" ")} / 0.15), rgb(${NEED_HIGH.join(" ")}))`;
