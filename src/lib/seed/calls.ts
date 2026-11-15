// SAMPLE calls (simulated model data) for the officials' Calls page, before real calls exist.
// Each one is about a real OpenStreetMap home at a real Uri replay hour: its 3 steps come from that
// hour's drip plan, its answers from the same seeded sample answers the outreach simulation uses
// (src/lib/household.ts), and its transcript from the call script (src/lib/callScript.ts).
// Phones are fictional 555-01XX numbers. Deterministic: same rows every run.

import uri from "../../../data/uri-2021.json";
import uriNeighborhoods from "../../../data/uri-2021-neighborhoods.json";
import { generateHomes, generateZones, hash32, rng } from "./generate";
import { fictionalPhone } from "./registrations";
import { buildReplay, homeContext, zoneExposures, type ConsoleHome } from "../replay";
import { planCity } from "../planner";
import { assess, sampleAnswers, type CallAnswers } from "../household";
import { buildConversation } from "../callScript";
import { buildPlanCard, displayLevel } from "../steps";
import { renderPlan } from "../pregenerated";
import type { WeatherSeries } from "../weather";

export const SAMPLE_CALL_HOURS = ["2021-02-15T02:00", "2021-02-15T18:00", "2021-02-16T06:00"];
/** Two per area (10 areas). */
export const SAMPLE_CALLS_PER_HOUR = 20;

/** Question order on the call, as answer fields (q_needs fills three). */
const ORDER: string[][] = [
  ["can_do_steps"],
  ["someone_elderly", "someone_disabled", "cant_go_outside"],
  ["lives_alone"],
  ["knows_shutoff"],
  ["faucet_covered"],
  ["has_heat"],
  ["neighbor_check"],
];

export interface SampleCall {
  source: "sample";
  simulated: true;
  home_id: string;
  plan_for: string;
  to_phone: string;
  lang: "en" | "es";
  mode: "storm";
  level: "High" | "Medium" | "Low";
  status: "completed" | "no_answer";
  finished: boolean;
  answers: Record<string, boolean | null>;
  questions_answered: number;
  assessment: "ready" | "needs_reminder" | "needs_crew" | null;
  closing: string | null;
  transcript: { who: "agent" | "you"; text: string }[];
  duration_s: number | null;
  created_at: string;
  ended_at: string | null;
}

const ts = (time: string, plusMin = 0) => new Date(Date.parse(`${time}:00-06:00`) + plusMin * 60_000).toISOString();

function asRecord(a: CallAnswers): Record<string, boolean | null> {
  return {
    can_do_steps: a.can_do_steps,
    did_steps: a.did_steps,
    someone_elderly: a.someone_elderly,
    someone_disabled: a.someone_disabled,
    cant_go_outside: a.cant_go_outside,
    lives_alone: a.lives_alone,
    knows_shutoff: a.knows_shutoff,
    faucet_covered: a.faucet_covered,
    has_heat: a.has_heat,
    neighbor_check: a.neighbor_check !== null,
  };
}

export function generateSampleCalls(): SampleCall[] {
  const homes = generateHomes() as unknown as ConsoleHome[];
  const zones = generateZones();
  const hours = (uri as WeatherSeries).hours;
  const zoneHours = Object.fromEntries(
    Object.entries((uriNeighborhoods as unknown as { zones: Record<string, WeatherSeries> }).zones).map(([id, s]) => [id, s.hours]),
  );
  const model = buildReplay(homes, hours, zoneHours);
  const out: SampleCall[] = [];
  let k = 0;

  for (const time of SAMPLE_CALL_HOURS) {
    const hour = hours.findIndex((h) => h.time === time);
    const plan = planCity(zones, homes, model.vuln, zoneExposures(model, hour));
    // The homes that need action this hour, highest risk first, spread over the areas.
    const ranked = homes
      .map((_, i) => i)
      .filter((i) => plan.homes[i].level !== "Low")
      .sort((a, b) => plan.homes[b].score - plan.homes[a].score || a - b);
    const picked: number[] = [];
    for (const zone of zones.map((z) => z.id)) picked.push(...ranked.filter((i) => homes[i].zone_id === zone).slice(0, SAMPLE_CALLS_PER_HOUR / zones.length));

    for (const i of picked) {
      const home = homes[i];
      const hp = plan.homes[i];
      const ctx = homeContext(model, home, hour);
      const r = rng(hash32(`${home.id}|${time}|sample-call`));
      const lang: "en" | "es" = r() < 0.2 ? "es" : "en";
      const roll = r();
      const outcome = roll < 0.14 ? "no_answer" : roll < 0.3 ? "partial" : "complete";
      const phone = fictionalPhone(k++ % 400);
      const startMin = Math.floor(r() * 40);
      const base = {
        source: "sample" as const,
        simulated: true as const,
        home_id: home.id,
        plan_for: ts(time),
        to_phone: `+1${phone.replace(/\D/g, "")}`,
        lang,
        mode: "storm" as const,
        level: hp.level,
        created_at: ts(time, startMin),
      };
      if (outcome === "no_answer") {
        out.push({ ...base, status: "no_answer", finished: false, answers: {}, questions_answered: 0, assessment: null, closing: null, transcript: [], duration_s: null, ended_at: ts(time, startMin + 1) });
        continue;
      }

      const answers = sampleAnswers(home, null);
      const assessment = assess({ contact: "called", replied_text: false, called: true, answered_call: true, door_check: false, answers, flagged_by: null }).assessment as SampleCall["assessment"];
      const words = renderPlan(buildPlanCard(home, hp, ctx), lang);
      const convo = buildConversation({
        lang,
        level: displayLevel(hp.level),
        temp: ctx.temperature_f,
        hoursBelow20: ctx.hoursBelow20,
        steps: words.steps.map((s) => s.text),
        hasOutdoorFaucet: home.outdoor_faucets > 0,
        contact: { replied_text: false, called: true, answered_call: true, door_check: false },
        answers,
        assessment,
        assignedCrew: null,
      });
      const transcript = convo.lines.map((l) => ({ who: l.who, text: l.text }));
      const all = asRecord(answers);
      const asked = ORDER.filter((f) => f[0] !== "faucet_covered" || home.outdoor_faucets > 0);

      if (outcome === "partial") {
        // Hung up after 1-4 answers: keep only what was said up to that point.
        const answeredCount = 1 + Math.floor(r() * 4);
        const fields = asked.slice(0, answeredCount).flat();
        let you = 0;
        const cut = transcript.findIndex((l) => l.who === "you" && ++you === answeredCount);
        out.push({
          ...base,
          status: "completed",
          finished: false,
          answers: Object.fromEntries(fields.map((f) => [f, all[f]])),
          questions_answered: answeredCount,
          assessment: null,
          closing: null,
          transcript: transcript.slice(0, cut + 1),
          duration_s: 40 + answeredCount * 15 + Math.floor(r() * 20),
          ended_at: ts(time, startMin + 2),
        });
        continue;
      }

      const fields = asked.flat();
      out.push({
        ...base,
        status: "completed",
        finished: true,
        answers: Object.fromEntries(fields.map((f) => [f, all[f]])),
        questions_answered: asked.length,
        assessment,
        closing: assessment === "needs_crew" ? "agent_crew_requested" : assessment === "needs_reminder" ? "agent_reminder" : "agent_ready",
        transcript,
        duration_s: 150 + Math.floor(r() * 90),
        ended_at: ts(time, startMin + 4),
      });
    }
  }
  return out;
}
