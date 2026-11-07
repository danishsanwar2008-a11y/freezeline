// Deterministic fallback agent (used when no Claude key is set). Same tools, fixed priorities:
// publish the plan, text High homes area by area starting with the thinnest pressure margin,
// then Watch homes, then log a summary. Reasons are plain sentences built from tool facts.

export interface AreaFacts {
  zone_id: string;
  area: string;
  margin_above_20_psi: number;
  high_homes: number;
}

export interface PlannedAction {
  tool: "publish_drip_plan" | "queue_outreach" | "log_event";
  args: Record<string, unknown>;
  reason: string;
}

export function rulePlan(areas: AreaFacts[], counts: { High: number; Watch: number }): PlannedAction[] {
  if (counts.High + counts.Watch === 0) return [];
  const lowest = Math.min(...areas.map((a) => a.margin_above_20_psi));
  const actions: PlannedAction[] = [
    {
      tool: "publish_drip_plan",
      args: { zone_reserves: [] },
      reason: `Every area stays at least ${Math.round(lowest)} psi above the 20 psi limit with the standard budget, so no area needs a stricter one.`,
    },
  ];
  const byMargin = areas.filter((a) => a.high_homes > 0).sort((a, b) => a.margin_above_20_psi - b.margin_above_20_psi);
  byMargin.forEach((a, k) =>
    actions.push({
      tool: "queue_outreach",
      args: { zone_id: a.zone_id, level: "High", limit: a.high_homes },
      reason:
        k === 0
          ? `${a.area} has the thinnest pressure margin (${Math.round(a.margin_above_20_psi)} psi above 20), so its High homes hear first.`
          : `Next-thinnest margin: ${a.area} (${Math.round(a.margin_above_20_psi)} psi above 20).`,
    }),
  );
  if (counts.Watch > 0)
    actions.push({
      tool: "queue_outreach",
      args: { zone_id: "all", level: "Watch", limit: counts.Watch },
      reason: "Watch homes get protect-your-pipes steps and are asked not to drip, which keeps pressure up.",
    });
  actions.push({
    tool: "log_event",
    args: { message: `Drip plan published; ${counts.High} High and ${counts.Watch} Watch homes queued for texts.`, zone_id: "all" },
    reason: "Record what was sent for the operations log.",
  });
  return actions;
}
