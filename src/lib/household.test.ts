import { describe, expect, it } from "vitest";
import uri from "../../data/uri-2021.json";
import { buildHourContexts, vulnerability } from "./risk";
import { generateHomes, generateZones } from "./seed/generate";
import { planCity } from "./planner";
import { assess, nearestNeighbors, outreachSummary, proposeCrews, sampleAnswers, simulateOutreach, type Crew } from "./household";
import type { WeatherSeries } from "./weather";

const hours = (uri as WeatherSeries).hours;
const ctx = buildHourContexts(hours);
const homes = generateHomes();
const zones = generateZones();
const vuln = homes.map(vulnerability);
const peak = hours.findIndex((h) => h.time === "2021-02-16T06:00");
const plan = planCity(zones, homes, vuln, ctx[peak].exposure);
const neighbors = nearestNeighbors(homes);
const outreach = simulateOutreach(homes, plan, neighbors);
const assessments = outreach.map(assess);
const crews: Crew[] = [
  { id: 1, name: "Crew 1", depot_lat: 29.7925, depot_lng: -95.4005 },
  { id: 2, name: "Crew 2", depot_lat: 29.738, depot_lng: -95.379 },
  { id: 3, name: "Crew 3", depot_lat: 29.702, depot_lng: -95.44 },
];

describe("simulated outreach (sample)", () => {
  it("is deterministic per home", () => {
    expect(simulateOutreach(homes, plan, neighbors)).toEqual(outreach);
    expect(sampleAnswers(homes[0], null)).toEqual(sampleAnswers(homes[0], null));
  });

  it("texts every Watch/High home and never contacts Low homes", () => {
    outreach.forEach((o, i) => expect(o.contact === "none").toBe(plan.homes[i].level === "Low"));
  });

  it("calls only homes that didn't reply to the text, and door-checks only unanswered High homes", () => {
    outreach.forEach((o, i) => {
      if (o.replied_text) expect(o.called).toBe(false);
      if (o.door_check) {
        expect(o.called && !o.answered_call).toBe(true);
        expect(plan.homes[i].level).toBe("High");
      }
    });
  });

  it("a neighbor named on a call moves up the call list", () => {
    const flagged = outreach.filter((o) => o.flagged_by);
    expect(flagged.length).toBeGreaterThan(0);
    flagged.forEach((o) => expect(o.called).toBe(true));
  });

  it("gives every status a realistic share at the Feb 16 peak", () => {
    const s = outreachSummary(outreach, assessments);
    const total = homes.length;
    expect(s.status.ready / total).toBeGreaterThan(0.15);
    expect(s.status.needs_help).toBeGreaterThan(20);
    expect(s.status.needs_help / total).toBeLessThan(0.1);
    expect(s.status.waiting).toBeGreaterThan(0);
    expect(s.status.no_answer).toBeGreaterThan(0);
    expect(s.texted).toBeGreaterThan(s.called);
    expect(s.called).toBeGreaterThan(s.doorChecks);
  });
});

describe("assessment", () => {
  it("only answered calls are confirmed; everything else is estimated", () => {
    outreach.forEach((o, i) => expect(assessments[i].confidence).toBe(o.answers ? "confirmed" : "estimated"));
  });

  it("needs a crew when the household can't do the steps, with a reason", () => {
    const a = assess({
      contact: "called", replied_text: false, called: true, answered_call: true, door_check: false, flagged_by: null,
      answers: { can_do_steps: false, did_steps: false, someone_elderly: true, someone_disabled: false, cant_go_outside: true, lives_alone: true, knows_shutoff: false, faucet_covered: false, has_heat: true, neighbor_check: null },
    });
    expect(a.assessment).toBe("needs_crew");
    expect(a.status).toBe("needs_help");
    expect(a.reasons).toEqual(["cant_do_steps", "elderly", "cant_go_outside", "lives_alone", "faucet_uncovered"]);
  });

  it("can do the steps but hasn't yet -> needs a reminder (shown as waiting)", () => {
    const a = assess({
      contact: "texted", replied_text: true, called: false, answered_call: false, door_check: false, flagged_by: null,
      answers: { can_do_steps: true, did_steps: false, someone_elderly: false, someone_disabled: false, cant_go_outside: false, lives_alone: false, knows_shutoff: true, faucet_covered: null, has_heat: true, neighbor_check: null },
    });
    expect([a.assessment, a.status]).toEqual(["needs_reminder", "waiting"]);
  });
});

describe("crew rule", () => {
  const { proposals, queue } = proposeCrews(homes, plan, assessments, crews);

  it("proposes crews only for confirmed 'needs a crew' homes, one per free crew", () => {
    expect(proposals.length).toBe(3);
    expect(new Set(proposals.map((p) => p.crew_id)).size).toBe(3);
    for (const p of proposals) {
      expect(assessments[p.homeIdx].assessment).toBe("needs_crew");
      expect(assessments[p.homeIdx].confidence).toBe("confirmed");
    }
    expect(queue.length).toBeGreaterThan(0);
  });

  it("highest risk first: no queued home outranks a home that got a crew", () => {
    const minProposed = Math.min(...proposals.map((p) => plan.homes[p.homeIdx].score));
    expect(Math.max(...queue.map((i) => plan.homes[i].score))).toBeLessThanOrEqual(minProposed);
  });

  it("busy crews and already-helped homes are skipped", () => {
    const again = proposeCrews(homes, plan, assessments, crews, new Set([1, 2]), new Set(proposals.map((p) => p.home_id)));
    expect(again.proposals.map((p) => p.crew_id)).toEqual([3]);
    expect(again.proposals.some((p) => proposals.some((q) => q.home_id === p.home_id))).toBe(false);
  });
});

describe("outreach only counts texts that were actually queued", () => {
  it("homes without a queued text stay not contacted (never claimed as texted)", () => {
    const highOnly = (i: number) => plan.homes[i].level === "High";
    const o = simulateOutreach(homes, plan, neighbors, highOnly);
    o.forEach((x, i) => {
      // Not texted: untouched, unless a neighbor asked us to check on them (then a call is placed, never a text).
      if (!highOnly(i)) {
        if (x.flagged_by) expect([x.contact, x.replied_text]).toEqual(["called", false]);
        else expect(x.contact).toBe("none");
      }
    });
  });
});
