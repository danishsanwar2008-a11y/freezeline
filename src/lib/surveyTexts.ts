// The pre-storm text each home gets, from the team's table: forecast temperature x pre-survey result
// -> Low / Medium / High (call first) -> one text. Wording lives in data/messages.json `surveyTexts`
// (texts only; call lines are in `call`). Pure and tested (surveyTexts.test.ts).
//
// Medium homes drip 1 faucet (farthest from the main shutoff); High homes drip 2-3 (that one plus any
// on an outside wall or unheated area) and close the valve on the outdoor pipe.
// Not wired to sending yet: nothing handles the YES / BURST replies these texts ask for.
import { fill, MESSAGES, type Lang } from "./pregenerated";

export type ForecastTemp = "mild" | "cold" | "very_cold";
export type SurveyResult = "pass" | "fail";
export type SurveyLevel = "Low" | "Medium" | "High";

type Bi = Record<Lang, string>;
interface Entry extends Bi { level: SurveyLevel; call_first: boolean }
const PACK = (MESSAGES as unknown as {
  surveyTexts: { messages: Record<string, Entry>; drip_medium: Bi; drip_high: Bi; outdoor_valve: Bi };
}).surveyTexts;

export const FORECASTS: ForecastTemp[] = ["mild", "cold", "very_cold"];
export const SURVEY_RESULTS: SurveyResult[] = ["pass", "fail"];

export interface SurveyText {
  level: SurveyLevel;
  /** "High (call first)" in the table: call this home before texting it. */
  callFirst: boolean;
  text: string;
}

export function surveyText(temp: ForecastTemp, survey: SurveyResult, who: { name: string; county: string }, lang: Lang = "en"): SurveyText {
  const entry = PACK.messages[`${temp}|${survey}`];
  if (!entry) throw new Error(`data/messages.json surveyTexts has no ${temp}|${survey}`);
  const drip = entry.level === "High" ? PACK.drip_high[lang] : entry.level === "Medium" ? PACK.drip_medium[lang] : "";
  const text = fill(entry[lang], { name: who.name, county: who.county, drip, outdoor_valve: PACK.outdoor_valve[lang] });
  return { level: entry.level, callFirst: entry.call_first, text };
}
