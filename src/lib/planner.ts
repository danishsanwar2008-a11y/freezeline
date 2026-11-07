// Deterministic drip planner + zone pressure model (Phase 2).
// Goal: protect the highest-risk homes with targeted drips while every zone stays above
// the 20 psi boil-water threshold. Same inputs -> same plan.

import { HIGH_AT, levelFor, scoreFrom, type HomeAttributes, type RiskLevel } from "./risk";

/** Below this, Texas requires a boil-water notice. */
export const BOIL_WATER_PSI = 20;
/** Safety reserve the planner keeps above the boil-water line. */
export const RESERVE_PSI = 3;
/** Extra system demand (heating, leaks, plant strain) at full freeze exposure. */
export const FREEZE_DEMAND_PSI = 10;
/** Pressure lost if every home in a zone drips one tap. */
export const PSI_PER_TAP_SHARE = 15;
/** The blanket "everyone drip" message: households typically leave about two taps running. */
export const BLANKET_TAPS_PER_HOME = 2;

export interface PlannerZone {
  id: string;
  name: string;
  neighborhood: string;
  base_pressure_psi: number;
}

export interface PlannerHome extends HomeAttributes {
  zone_id: string;
}

export type DripAction = "drip" | "no_drip";

export interface HomePlan {
  action: DripAction;
  /** Which tap to drip (only when action = "drip"). */
  faucet: string | null;
  score: number;
  level: RiskLevel;
  /** High-risk home the zone's pressure budget couldn't cover with a drip. */
  uncovered: boolean;
}

export interface ZonePlan {
  zoneId: string;
  neighborhood: string;
  homes: number;
  basePsi: number;
  /** Max homes that can drip one tap while staying >= 20 psi + reserve. */
  dripBudget: number;
  dripping: number;
  high: number;
  uncoveredHigh: number;
  pressurePlan: number;
  pressureNoDrip: number;
  pressureBlanket: number;
}

export interface CityPlan {
  zones: ZonePlan[];
  /** Same order as the homes passed in. */
  homes: HomePlan[];
}

/** Zone pressure given weather exposure (0–1) and how many taps are dripping. */
export function zonePressure(basePsi: number, exposure: number, drippingTaps: number, homes: number): number {
  const dripDrop = homes > 0 ? PSI_PER_TAP_SHARE * (drippingTaps / homes) : 0;
  return basePsi - FREEZE_DEMAND_PSI * exposure - dripDrop;
}

/** How many homes may drip one tap while the zone stays at or above 20 psi + reserve. */
export function dripBudget(basePsi: number, exposure: number, homes: number): number {
  const headroom = basePsi - FREEZE_DEMAND_PSI * exposure - (BOIL_WATER_PSI + RESERVE_PSI);
  if (headroom <= 0) return 0;
  return Math.min(homes, Math.floor((headroom / PSI_PER_TAP_SHARE) * homes));
}

/** The single tap that best protects this home's most exposed pipes. */
export function chooseFaucet(home: HomeAttributes): string {
  if (home.exterior_wall_pipes) return "kitchen";
  if (home.attic_or_crawlspace_pipes) return "bathroom";
  return "farthest"; // the tap farthest from where water enters the house
}

/** Plan every zone for one hour. `vuln` is precomputed vulnerability per home (same order). */
export function planCity(
  zones: PlannerZone[],
  homes: PlannerHome[],
  vuln: ArrayLike<number>,
  exposure: number,
): CityPlan {
  const plans: HomePlan[] = homes.map((h, i) => {
    const score = scoreFrom(exposure, vuln[i]);
    return { action: "no_drip", faucet: null, score, level: levelFor(score), uncovered: false };
  });

  const byZone = new Map<string, number[]>();
  homes.forEach((h, i) => {
    const list = byZone.get(h.zone_id);
    if (list) list.push(i);
    else byZone.set(h.zone_id, [i]);
  });

  const zonePlans = zones.map((z) => {
    const idx = byZone.get(z.id) ?? [];
    const n = idx.length;
    const budget = dripBudget(z.base_pressure_psi, exposure, n);
    // Highest risk first; ties broken by input order for determinism.
    const high = idx.filter((i) => plans[i].score >= HIGH_AT).sort((a, b) => plans[b].score - plans[a].score || a - b);
    const drippers = high.slice(0, budget);
    for (const i of drippers) {
      plans[i].action = "drip";
      plans[i].faucet = chooseFaucet(homes[i]);
    }
    for (const i of high.slice(budget)) plans[i].uncovered = true;

    return {
      zoneId: z.id,
      neighborhood: z.neighborhood,
      homes: n,
      basePsi: z.base_pressure_psi,
      dripBudget: budget,
      dripping: drippers.length,
      high: high.length,
      uncoveredHigh: high.length - drippers.length,
      pressurePlan: zonePressure(z.base_pressure_psi, exposure, drippers.length, n),
      pressureNoDrip: zonePressure(z.base_pressure_psi, exposure, 0, n),
      pressureBlanket: zonePressure(z.base_pressure_psi, exposure, n * BLANKET_TAPS_PER_HOME, n),
    } satisfies ZonePlan;
  });

  return { zones: zonePlans, homes: plans };
}
