// "If the heat goes out, your pipes are at risk around 3 AM."
// A deliberately simple, deterministic estimate: once heat is lost, a home's pipes lose
// protection as cold accumulates. We add up degree-hours below 32°F from the forecast and
// report the first hour the total passes a threshold that depends on how exposed the home is.

import type { DisplayLevel } from "./steps";

/** Degree-hours below 32°F (outdoor) after which unheated pipes are at risk. */
export const COLD_DOSE_THRESHOLD: Record<DisplayLevel, number> = { High: 30, Watch: 60, Low: 120 };
/** How far ahead we look. */
export const HORIZON_HOURS = 36;

export interface ClockHour {
  time: string; // "2021-02-16T06:00"
  temperature_f: number;
}

export interface FreezeClock {
  /** Hour at which pipes would be at risk without heat, or null if not within the horizon. */
  atRisk: string | null;
  /** Last hour checked (for "safe through …" wording). */
  checkedThrough: string;
}

export function freezeClock(hours: ClockHour[], from: number, level: DisplayLevel): FreezeClock {
  const threshold = COLD_DOSE_THRESHOLD[level];
  let dose = 0;
  const end = Math.min(hours.length - 1, from + HORIZON_HOURS);
  for (let t = from; t <= end; t++) {
    dose += Math.max(0, 32 - hours[t].temperature_f);
    if (dose >= threshold) return { atRisk: hours[t].time, checkedThrough: hours[end].time };
  }
  return { atRisk: null, checkedThrough: hours[end]?.time ?? hours[from].time };
}
