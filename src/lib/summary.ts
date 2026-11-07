// Deterministic one-glance summary of a city plan (console card + agent tools).
import { BOIL_WATER_PSI, type CityPlan } from "./planner";

export function compareFutures(plan: CityPlan) {
  const n = plan.zones.length;
  const blanketFail = plan.zones.filter((z) => z.pressureBlanket < BOIL_WATER_PSI).length;
  const planFail = plan.zones.filter((z) => z.pressurePlan < BOIL_WATER_PSI).length;
  const lowestPlan = n ? Math.min(...plan.zones.map((z) => z.pressurePlan)) : 0;
  /** Homes that should get a message: everyone at Watch or High. */
  const needMessage = plan.homes.filter((h) => h.level !== "Low").length;
  return { n, blanketFail, planFail, lowestPlan, needMessage };
}
