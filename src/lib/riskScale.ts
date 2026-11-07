// Risk colors. Single source of truth for map + UI; CSS vars --risk-* in globals.css mirror these.
// Low is a quiet slate blue so safe homes recede; ice blue (--accent) is reserved for actions.

import type { DisplayLevel } from "./steps";

type RGB = [number, number, number];

export const LEVEL_RGB: Record<DisplayLevel, RGB> = {
  Low: [111, 147, 184], // #6f93b8
  Watch: [242, 162, 92], // #f2a25c
  High: [229, 56, 59], // #e5383b
};

/** Hex ramp by average home score: slate blue -> frost -> amber -> red. */
export const RISK_STOPS: { at: number; rgb: RGB }[] = [
  { at: 0, rgb: LEVEL_RGB.Low },
  { at: 30, rgb: [201, 220, 230] }, // #c9dce6 frost
  { at: 60, rgb: LEVEL_RGB.Watch },
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
