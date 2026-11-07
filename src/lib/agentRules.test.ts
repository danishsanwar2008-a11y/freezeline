import { describe, expect, it } from "vitest";
import { rulePlan } from "./agentRules";

const areas = [
  { zone_id: "heights", area: "Houston Heights", margin_above_20_psi: 14, high_homes: 350 },
  { zone_id: "third-ward", area: "Third Ward", margin_above_20_psi: 7, high_homes: 236 },
  { zone_id: "montrose", area: "Montrose", margin_above_20_psi: 12, high_homes: 0 },
];

describe("fallback agent priorities", () => {
  it("publishes first, then texts High homes by thinnest margin, then Watch, then logs", () => {
    const plan = rulePlan(areas, { High: 586, Watch: 900 });
    expect(plan.map((a) => a.tool)).toEqual(["publish_drip_plan", "queue_outreach", "queue_outreach", "queue_outreach", "log_event"]);
    expect(plan[1].args).toMatchObject({ zone_id: "third-ward", level: "High", limit: 236 });
    expect(plan[1].reason).toContain("thinnest pressure margin (7 psi");
    expect(plan[2].args).toMatchObject({ zone_id: "heights", level: "High" });
    expect(plan[3].args).toMatchObject({ zone_id: "all", level: "Watch", limit: 900 });
  });

  it("skips areas with no High homes", () => {
    expect(rulePlan(areas, { High: 586, Watch: 0 }).some((a) => a.args.zone_id === "montrose")).toBe(false);
  });

  it("does nothing when nobody needs action", () => {
    expect(rulePlan(areas, { High: 0, Watch: 0 })).toEqual([]);
  });
});
