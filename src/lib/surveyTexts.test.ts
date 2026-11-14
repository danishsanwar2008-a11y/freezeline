import { describe, expect, it } from "vitest";
import { FORECASTS, SURVEY_RESULTS, surveyText } from "./surveyTexts";
import { LANGS } from "./pregenerated";

const who = { name: "Maria", county: "Harris County" };
const ON_THE_WAY = /on the way|va en camino|is coming to|dispatched|en camino/i;

// The team's table (row 4 dropped: same conditions as row 2).
const TABLE = [
  { temp: "mild", survey: "pass", level: "Low", callFirst: false },
  { temp: "mild", survey: "fail", level: "Medium", callFirst: false },
  { temp: "very_cold", survey: "pass", level: "Medium", callFirst: false },
  { temp: "very_cold", survey: "fail", level: "High", callFirst: false },
  { temp: "cold", survey: "pass", level: "Medium", callFirst: false },
  { temp: "cold", survey: "fail", level: "High", callFirst: true },
] as const;

describe("pre-storm texts from the team's table", () => {
  it("has exactly one text per temperature x survey result, at the table's level", () => {
    for (const row of TABLE) {
      const t = surveyText(row.temp, row.survey, who);
      expect(t.level, `${row.temp}|${row.survey}`).toBe(row.level);
      expect(t.callFirst, `${row.temp}|${row.survey}`).toBe(row.callFirst);
    }
    expect(FORECASTS.length * SURVEY_RESULTS.length).toBe(TABLE.length);
  });

  it("renders in both languages, labeled simulated, with no unfilled slot", () => {
    for (const row of TABLE)
      for (const lang of LANGS) {
        const { text } = surveyText(row.temp, row.survey, who, lang);
        expect(text, `${row.temp}|${row.survey}/${lang}`).toContain("FreezeLine (simulated)");
        expect(text, `${row.temp}|${row.survey}/${lang}`).not.toMatch(/\{\w+\}|undefined/);
        expect(text).toContain("Maria");
      }
  });

  it("Low homes don't drip; Medium homes drip one faucet; High homes drip 2-3 and close the outdoor valve", () => {
    for (const row of TABLE) {
      const { text } = surveyText(row.temp, row.survey, who);
      if (row.level === "Low") {
        expect(text).toContain("No need to drip");
        expect(text).not.toContain("outdoor water pipe");
      }
      if (row.level === "Medium") {
        expect(text).toContain("Drip one faucet slowly");
        expect(text).not.toContain("outdoor water pipe");
      }
      if (row.level === "High") {
        expect(text).toContain("Drip 2 or 3 faucets slowly");
        expect(text).toContain("close the valve on your outdoor water pipe");
        expect(text).toContain("Don't shut off your main water valve");
      }
    }
  });

  it("never says a crew is on the way: a burst flags the home for crew assistance", () => {
    for (const row of TABLE)
      for (const lang of LANGS) expect(surveyText(row.temp, row.survey, who, lang).text).not.toMatch(ON_THE_WAY);
  });
});
