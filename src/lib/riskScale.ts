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
