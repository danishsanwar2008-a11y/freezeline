import { describe, expect, it } from "vitest";
import uri from "../../../../data/uri-2021.json";
import uriNeighborhoods from "../../../../data/uri-2021-neighborhoods.json";
import { generateHomes, generateZones } from "@/lib/seed/generate";
import { buildReplay, type ConsoleHome } from "@/lib/replay";
import type { WeatherSeries } from "@/lib/weather";
import type { City } from "../cityState";
import { hourIndex, monitorAt } from "../cityState";
import { proposeStage2 } from "./run";
import { runTool, type AgentCtx } from "./tools";

const homes = generateHomes() as unknown as ConsoleHome[];
const zones = generateZones();
const zoneHours = Object.fromEntries(
  Object.entries((uriNeighborhoods as unknown as { zones: Record<string, WeatherSeries> }).zones).map(([id, s]) => [id, s.hours]),
);
const city: City = {
  homes,
  zones,
  model: buildReplay(homes, (uri as WeatherSeries).hours, zoneHours),
  byId: new Map(homes.map((h, i) => [h.id, i])),
};
const PEAK = "2021-02-16T06:00";
const ctx = (mode: AgentCtx["mode"]): AgentCtx => ({ city, hour: hourIndex(PEAK), time: PEAK, mode, origin: "http://test", reserves: {}, entries: [] });

describe("Stage 2 alert (Uri peak, simulated data)", () => {
  it("the monitor proposes Stage 2 only where the forecast falls below 25 psi, and the change lands at or above 25", () => {
    const areas = monitorAt(city, hourIndex(PEAK));
    const alerted = areas.filter((a) => a.stage2);
    expect(alerted.map((a) => a.zoneId)).toEqual(["third-ward"]);
    for (const a of alerted) {
      expect(a.lowest.psi).toBeLessThan(25);
      expect(a.stage2!.psiAfter).toBeGreaterThanOrEqual(25);
    }
  });

  it("is always pending, even in Auto mode", () => {
    const c = ctx("auto");
    proposeStage2(c);
    expect(c.entries.length).toBeGreaterThan(0);
    for (const e of c.entries) {
      expect(e.tool).toBe("send_stage2_alert");
      expect(e.status).toBe("pending");
      expect(e.summary).toMatch(/^Stage 2 alert ready · needs supervisor approval\./);
    }
  });

  it("runTool in Auto mode only previews it; nothing is written without an explicit approval", async () => {
    const out = (await runTool(ctx("auto"), "send_stage2_alert", { zone_id: "third-ward", reason: "Forecast below 25 psi." })) as { status: string };
    expect(out.status).toBe("awaiting_approval");
  });

  it("refuses an area that doesn't need Stage 2", async () => {
    await expect(runTool(ctx("auto"), "send_stage2_alert", { zone_id: "heights", reason: "Forecast below 25 psi." }, true)).rejects.toThrow(
      /doesn’t need a Stage 2 alert/,
    );
  });
});
