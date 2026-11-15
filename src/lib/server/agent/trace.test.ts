import { describe, expect, it, vi } from "vitest";
import uri from "../../../../data/uri-2021.json";
import uriNeighborhoods from "../../../../data/uri-2021-neighborhoods.json";
import { generateHomes, generateZones } from "@/lib/seed/generate";
import { buildReplay, type ConsoleHome } from "@/lib/replay";
import type { WeatherSeries } from "@/lib/weather";
import type { City } from "../cityState";
import { hourIndex } from "../cityState";
import { runAgent } from "./run";
import type { TraceEvent } from "./tools";

// No keys in the test environment: the rules agent runs, Approve-first mode only previews (no writes).
vi.stubEnv("ANTHROPIC_API_KEY", "");
vi.stubEnv("LLM_PROVIDER", "pregenerated");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

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

describe("decision trace (real run state, Uri peak)", async () => {
  const events: TraceEvent[] = [];
  const result = await runAgent(city, hourIndex(PEAK), "approve", "http://test", (e) => events.push(e));
  const entries = result.entries;

  it("streams every log entry, in the order the run made them", () => {
    const streamed = events.filter((e) => e.type === "entry").map((e) => (e as { entry: { id: string } }).entry.id);
    expect(streamed).toEqual(entries.map((e) => e.id));
  });

  it("starts by reading the storm and the pressure, with real results", () => {
    expect(entries[0]).toMatchObject({ kind: "step", summary: "Read the storm and risk" });
    expect(entries[0].result).toMatch(/°F · [\d,]+ High homes, [\d,]+ Watch homes/);
    expect(entries[1]).toMatchObject({ kind: "step", summary: "Read pressure in 10 areas" });
    expect(entries[1].result).toBe("lowest 22.8 psi · Near Northside");
  });

  it("announces the plan size and each action before it runs", () => {
    expect(events.find((e) => e.type === "plan")).toBeDefined();
    const starts = events.filter((e) => e.type === "start").map((e) => (e as { label: string }).label);
    expect(starts).toContain("Publishing the drip plan");
    expect(starts).toContain("Queuing texts");
  });

  it("Stage 2 waits for the supervisor and is never skipped", () => {
    const s2 = entries.filter((e) => e.tool === "send_stage2_alert");
    // Third Ward and Near Northside both fall below 25 psi at the peak: one pending alert each.
    expect(s2).toHaveLength(2);
    for (const e of s2) expect(e.status).toBe("pending");
  });

  it("ends with who else was notified, all simulated, after the Stage 2 step", () => {
    const notices = entries.filter((e) => e.kind === "notify");
    expect(notices.map((n) => n.party)).toEqual([
      "Maintenance contractors",
      "Water utility control room",
      "City officials (emergency management)",
      "Mayor’s office",
    ]);
    const lastS2 = entries.findIndex((e) => e.tool === "send_stage2_alert");
    expect(entries.findIndex((e) => e.kind === "notify")).toBeGreaterThan(lastS2);
    expect(notices.find((n) => n.party === "Water utility control room")!.summary).toContain("Stage 2 alert waiting for supervisor approval");
  });
});
