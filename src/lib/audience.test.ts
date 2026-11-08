import { describe, expect, it } from "vitest";
import uri from "../../data/uri-2021.json";
import { buildHourContexts, vulnerability } from "./risk";
import { generateHomes, generateZones } from "./seed/generate";
import { planCity } from "./planner";
import { assess, simulateOutreach } from "./household";
import { assessmentSentence, needsList, STATUS_LABEL, ASSESSMENT_LABEL } from "./cityWording";
import { buildConversation } from "./callScript";
import { buildPlanCard, displayLevel } from "./steps";
import { renderPlan, LANGS } from "./pregenerated";
import { H } from "./i18n";
import type { WeatherSeries } from "./weather";

const hours = (uri as WeatherSeries).hours;
const ctx = buildHourContexts(hours);
const homes = generateHomes();
const vuln = homes.map(vulnerability);
const peak = hours.findIndex((h) => h.time === "2021-02-16T06:00");
const plan = planCity(generateZones(), homes, vuln, ctx[peak].exposure);
const outreach = simulateOutreach(homes, plan);
const assessments = outreach.map(assess);

const YOU = /\b(you|your|you're|yourself)\b/i;
const DISPATCH = /\b(dispatch|household needs a crew|the home on|crew queue|assigned to home)\b/i;
const BROKEN = /\{\w+\}|undefined|NaN|\[object|null\b/;

// A sample of real homes, each kind of outcome.
const sample = assessments
  .map((a, i) => ({ a, i }))
  .filter((_, k) => k % 97 === 0)
  .slice(0, 60);

describe("two audiences, never mixed", () => {
  it("City Operations wording is third person (never 'you') and has no broken text", () => {
    const city = [
      ...Object.values(STATUS_LABEL),
      ...Object.values(ASSESSMENT_LABEL),
      ...sample.map(({ a }) => assessmentSentence(a.assessment, a.reasons)),
      ...sample.map(({ a }) => needsList(a.reasons)),
    ];
    for (const s of city) {
      expect(s).not.toMatch(YOU);
      expect(s).not.toMatch(BROKEN);
    }
  });

  it("Homeowner wording speaks to 'you' and never uses dispatch / third-person wording", () => {
    for (const { a, i } of sample) {
      const card = buildPlanCard(homes[i], plan.homes[i], ctx[peak]);
      for (const lang of LANGS) {
        const words = renderPlan(card, lang);
        const c = buildConversation({
          lang,
          level: displayLevel(plan.homes[i].level),
          temp: 13,
          hoursBelow20: 19,
          steps: words.steps.map((s) => s.text),
          hasOutdoorFaucet: homes[i].outdoor_faucets > 0,
          contact: { replied_text: outreach[i].replied_text, called: outreach[i].called, answered_call: outreach[i].answered_call, door_check: outreach[i].door_check },
          answers: outreach[i].answers,
          assessment: a.assessment,
          assignedCrew: null,
        });
        const all = [words.headline, ...words.steps.flatMap((s) => [s.text, s.detail]), ...words.reasons, ...c.lines.map((l) => l.text), c.note ?? ""];
        for (const s of all) {
          expect(s).not.toMatch(DISPATCH);
          expect(s).not.toMatch(BROKEN);
        }
        if (lang === "en" && c.lines.length) expect(c.lines.map((l) => l.text).join(" ")).toMatch(YOU);
      }
    }
  });

  it("no raw risk score ever reaches homeowner text", () => {
    for (const { i } of sample) {
      const score = String(plan.homes[i].score);
      if (Number(score) < 10) continue; // single digits collide with temperatures and step counts
      const words = renderPlan(buildPlanCard(homes[i], plan.homes[i], ctx[peak]), "en");
      expect([words.headline, ...words.steps.map((s) => s.text)].join(" ")).not.toContain(` ${score} `);
    }
  });

  it("homeowner labels exist in both languages", () => {
    expect(Object.keys(H.en).sort()).toEqual(Object.keys(H.es).sort());
  });
});
