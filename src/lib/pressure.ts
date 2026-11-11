// Pressure monitor + Stage 2 alert math (pure, deterministic; constants in ./pressureConfig).
//
//   P_area(t) = P_base − FREEZE_DEMAND_PSI × E_area(t) − PSI_PER_TAP_SHARE × taps(t) / homes
//
// taps = homes told to drip (one tap each) + homes that drip more than told (simulated assumption).
// Past hours use each hour's own plan. The forecast holds this hour's drips fixed ("if today's drips
// continue") while the freeze changes, because households keep following the last text they got.

import { zonePressure, type CityPlan, type PlannerZone } from "./planner";
import { BOIL_WATER_PSI, EXTRA_TAP_SHARE, FREEZE_DEMAND_PSI, PSI_PER_TAP_SHARE, STOP_NEW_DRIPS_PSI } from "./pressureConfig";

export const WINDOW_HOURS = 12;

/** FNV-1a: small, stable string hash (kept local so this module stays light in the browser). */
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

/** 1 = this home runs a second tap when told to drip (simulated assumption, deterministic per home). */
export function extraTapFlags(homes: { id: string }[], share = EXTRA_TAP_SHARE): Uint8Array {
  return Uint8Array.from(homes, (h) => (hash01(`${h.id}|extra-tap`) < share ? 1 : 0));
}

export type PsiBand = "ok" | "warn" | "bad";
/** Green above 25, amber 20–25, red below 20. */
export const psiBand = (psi: number): PsiBand => (psi > STOP_NEW_DRIPS_PSI ? "ok" : psi >= BOIL_WATER_PSI ? "warn" : "bad");

export interface PressurePoint {
  hour: number;
  psi: number;
  forecast: boolean;
}

export interface Stage2Proposal {
  zoneId: string;
  area: string;
  /** Hour the forecast is lowest (the proposal is sized for it). */
  worstHour: number;
  forecastPsi: number;
  /** Home indexes told to stop dripping (lowest risk first). */
  stop: number[];
  /** Home indexes that keep dripping the kitchen tap only (they were running a second tap). */
  kitchenOnly: number[];
  psiAfter: number;
}

export interface AreaPressure {
  zoneId: string;
  area: string;
  homes: number;
  nowPsi: number;
  band: PsiBand;
  /** Past 12 hours (own plans) + next 12 hours (this hour's drips held fixed). */
  series: PressurePoint[];
  /** Lowest forecast point in the next 12 hours (including now). */
  lowest: { hour: number; psi: number };
  dripping: number;
  extraTaps: number;
  blanketPsi: number;
  stage2: Stage2Proposal | null;
}

export interface MonitorInput {
  zones: PlannerZone[];
  homes: { id: string; zone_id: string }[];
  extra: Uint8Array;
  hour: number;
  hours: number;
  /** Plan for an hour (callers cache it). */
  planAt: (hour: number) => CityPlan;
  /** Exposure per zone id at an hour. */
  exposureAt: (hour: number) => Record<string, number>;
}

/** Taps actually running in one area under a plan: drippers + the simulated extra taps among them. */
function tapsIn(plan: CityPlan, idx: number[], extra: Uint8Array): { drippers: number[]; taps: number; extraTaps: number } {
  const drippers = idx.filter((i) => plan.homes[i].action === "drip");
  const extraTaps = drippers.reduce((a, i) => a + extra[i], 0);
  return { drippers, taps: drippers.length + extraTaps, extraTaps };
}

/** Max taps an area can run and stay at or above 25 psi at exposure e. */
export function allowedTaps(basePsi: number, exposure: number, homes: number): number {
  const headroom = basePsi - FREEZE_DEMAND_PSI * exposure - STOP_NEW_DRIPS_PSI;
  return Math.max(0, Math.floor((headroom / PSI_PER_TAP_SHARE) * homes));
}

/**
 * Stage 2: if an area's forecast falls below 25 psi, first ask homes running a second tap to keep the
 * kitchen tap only, then (only if still needed) ask the lowest-risk drippers to stop.
 */
export function stage2Proposal(args: {
  zone: PlannerZone;
  drippers: number[];
  scores: ArrayLike<number>;
  extra: Uint8Array;
  homes: number;
  worstHour: number;
  worstExposure: number;
  forecastPsi: number;
}): Stage2Proposal | null {
  const { zone, drippers, scores, extra, homes, worstExposure } = args;
  if (args.forecastPsi >= STOP_NEW_DRIPS_PSI) return null;
  const allowed = allowedTaps(zone.base_pressure_psi, worstExposure, homes);
  // Highest risk first (ties by index for determinism); keep as many as the budget allows.
  const ranked = [...drippers].sort((a, b) => scores[b] - scores[a] || a - b);
  const keep = ranked.slice(0, allowed);
  const stop = ranked.slice(allowed).reverse(); // lowest risk first
  const kitchenOnly = keep.filter((i) => extra[i] === 1);
  if (stop.length === 0 && kitchenOnly.length === 0) return null; // nothing a text can change
  return {
    zoneId: zone.id,
    area: zone.neighborhood,
    worstHour: args.worstHour,
    forecastPsi: args.forecastPsi,
    stop,
    kitchenOnly,
    psiAfter: zonePressure(zone.base_pressure_psi, worstExposure, keep.length, homes),
  };
}

/** Pressure monitor for every area at one hour. */
export function pressureMonitor(input: MonitorInput): AreaPressure[] {
  const { zones, homes, extra, hour, hours, planAt, exposureAt } = input;
  const byZone = new Map<string, number[]>();
  homes.forEach((h, i) => (byZone.get(h.zone_id) ?? byZone.set(h.zone_id, []).get(h.zone_id)!).push(i));
  const now = planAt(hour);
  const from = Math.max(0, hour - WINDOW_HOURS);
  const to = Math.min(hours - 1, hour + WINDOW_HOURS);

  return zones.map((z) => {
    const idx = byZone.get(z.id) ?? [];
    const n = idx.length;
    const psiAt = (t: number, plan: CityPlan) => zonePressure(z.base_pressure_psi, exposureAt(t)[z.id] ?? 0, tapsIn(plan, idx, extra).taps, n);

    const series: PressurePoint[] = [];
    for (let t = from; t < hour; t++) series.push({ hour: t, psi: psiAt(t, planAt(t)), forecast: false });
    const held = tapsIn(now, idx, extra);
    let lowest = { hour, psi: Infinity };
    for (let t = hour; t <= to; t++) {
      const psi = zonePressure(z.base_pressure_psi, exposureAt(t)[z.id] ?? 0, held.taps, n);
      series.push({ hour: t, psi, forecast: t > hour });
      if (psi < lowest.psi) lowest = { hour: t, psi };
    }
    const nowPsi = series.find((p) => p.hour === hour)!.psi;
    const zp = now.zones.find((x) => x.zoneId === z.id);

    return {
      zoneId: z.id,
      area: z.neighborhood,
      homes: n,
      nowPsi,
      band: psiBand(nowPsi),
      series,
      lowest,
      dripping: held.drippers.length,
      extraTaps: held.extraTaps,
      blanketPsi: zp?.pressureBlanket ?? nowPsi,
      stage2: stage2Proposal({
        zone: z,
        drippers: held.drippers,
        scores: now.homes.map((p) => p.score),
        extra,
        homes: n,
        worstHour: lowest.hour,
        worstExposure: exposureAt(lowest.hour)[z.id] ?? 0,
        forecastPsi: lowest.psi,
      }),
    };
  });
}

// ---------- wording (officials, third person) ----------

/** "Third Ward: stop dripping at 140 homes · kitchen tap only at 60 homes → stays at 27 psi" (zero parts omitted). */
export function stage2Sentence(p: Pick<Stage2Proposal, "area" | "stop" | "kitchenOnly" | "psiAfter">): string {
  const parts: string[] = [];
  if (p.stop.length) parts.push(`stop dripping at ${p.stop.length.toLocaleString("en-US")} ${p.stop.length === 1 ? "home" : "homes"}`);
  if (p.kitchenOnly.length)
    parts.push(`kitchen tap only at ${p.kitchenOnly.length.toLocaleString("en-US")} ${p.kitchenOnly.length === 1 ? "home" : "homes"}`);
  return `${p.area}: ${parts.join(" · ")} → stays at ${Math.round(p.psiAfter)} psi`;
}

/** Why the agent proposes it: the forecast low, using only computed numbers. */
export function stage2Reason(p: Pick<Stage2Proposal, "area" | "forecastPsi">, when: string): string {
  return `If today’s drips continue, ${p.area} pressure falls to ${p.forecastPsi.toFixed(1)} psi (${when}), below the ${STOP_NEW_DRIPS_PSI} psi stop-new-drips line.`;
}
