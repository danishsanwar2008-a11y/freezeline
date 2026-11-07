// Risk color ramp: icy blue (safe) -> frost -> amber -> red (high).
// Single source of truth for map + UI colors of risk. CSS vars --risk-* in globals.css mirror these stops.

type RGB = [number, number, number];

export const RISK_STOPS: { at: number; rgb: RGB }[] = [
  { at: 0, rgb: [94, 200, 242] }, // #5ec8f2 ice
  { at: 30, rgb: [201, 220, 230] }, // #c9dce6 frost
  { at: 60, rgb: [242, 162, 92] }, // #f2a25c amber
  { at: 100, rgb: [229, 56, 59] }, // #e5383b red
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
