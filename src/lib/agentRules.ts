// Deterministic fallback agent (used unless LLM_PROVIDER=anthropic). Same tools, fixed priorities:
// publish the plan, text High homes area by area starting with the thinnest pressure margin,
// then Watch homes, then log a summary. Explanations come from data/messages.json.

import { agentText, type Lang } from "./pregenerated";

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

export function rulePlan(areas: AreaFacts[], counts: { High: number; Watch: number }, lang: Lang = "en"): PlannedAction[] {
  if (counts.High + counts.Watch === 0) return [];
  const lowest = Math.min(...areas.map((a) => a.margin_above_20_psi));
  const actions: PlannedAction[] = [
    { tool: "publish_drip_plan", args: { zone_reserves: [] }, reason: agentText("publish_standard", { margin: Math.round(lowest) }, lang) },
  ];
  const byMargin = areas.filter((a) => a.high_homes > 0).sort((a, b) => a.margin_above_20_psi - b.margin_above_20_psi);
  byMargin.forEach((a, k) =>
    actions.push({
      tool: "queue_outreach",
      args: { zone_id: a.zone_id, level: "High", limit: a.high_homes },
      reason: agentText(k === 0 ? "queue_high_first" : "queue_high_next", { area: a.area, margin: Math.round(a.margin_above_20_psi) }, lang),
    }),
  );
  if (counts.Watch > 0)
    actions.push({
      tool: "queue_outreach",
      args: { zone_id: "all", level: "Watch", limit: counts.Watch },
      reason: agentText("queue_watch", {}, lang),
    });
  actions.push({
    tool: "log_event",
    args: { message: agentText("log_summary", { high: counts.High, watch: counts.Watch }, lang), zone_id: "all" },
    reason: agentText("log_reason", {}, lang),
  });
  return actions;
}
