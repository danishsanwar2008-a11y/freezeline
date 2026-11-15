// The texts around a pre-survey call. Right after the call: one of the 4 rows of the research doc's
// text table (FreezeLine Research, "After these questions..."), plus one line for who helps next.
// After the emergency-contact call: "Sam said they can help" (and Sam gets the address), or "we
// couldn't get help from Sam" + the crew line. Wording in data/messages.json `surveyTexts`.
//
// Which row applies is decided once, in the call script (voice/survey.py: the weighted pre-survey
// score + the forecast), and reported as `text_row`; this file only looks it up. Pure and tested.
// Honesty rule: "{crew} is on the way" is written only with the name of a crew that was really
// assigned; otherwise the crew is "requested".
import { fill, MESSAGES, type Lang } from "./pregenerated";
import { SURVEY_ROWS, type SurveyRow } from "./voiceCalls";

export type SurveyLevel = "Low" | "Medium" | "High";
/** Houston: every home in the Uri replay is in Harris County. */
export const COUNTY = "Harris County";

type Bi = Record<Lang, string>;
interface Entry extends Bi { level: SurveyLevel }
const PACK = (MESSAGES as unknown as {
  surveyTexts: {
    messages: Record<SurveyRow, Entry>;
    use_row: Record<string, SurveyRow>;
    drip_medium: Bi;
    drip_high: Bi;
    outdoor_valve: Bi;
    followup_contact: Bi;
    followup_crew_assigned: Bi;
    followup_crew_requested: Bi;
    contact_helping: Bi;
    contact_unavailable: Bi;
    to_contact: Bi;
  };
}).surveyTexts;

export const isSurveyRow = (v: unknown): v is SurveyRow => typeof v === "string" && (SURVEY_ROWS as readonly string[]).includes(v);
const langOf = (l?: string): Lang => (l === "es" ? "es" : "en");

/** temp|survey -> the doc's row (the 2 combinations it has no row for go to the nearest one). */
export function rowFor(temp: "mild" | "cold" | "very_cold", survey: "pass" | "fail"): SurveyRow {
  const key = `${temp}|${survey}`;
  return PACK.use_row[key] ?? (key as SurveyRow);
}

export function rowLevel(row: SurveyRow): SurveyLevel {
  return PACK.messages[row].level;
}

/** Who helps next, as decided on the call. `crew` is a crew really assigned, or null (requested). */
export type Followup = { kind: "contact"; contact: string } | { kind: "crew"; crew: string | null };

/** The one line about who helps next (texts only). */
export function followupLine(f: Followup, lang: Lang = "en"): string {
  if (f.kind === "contact") return fill(PACK.followup_contact[lang], { contact: f.contact });
  return f.crew ? fill(PACK.followup_crew_assigned[lang], { crew: f.crew }) : PACK.followup_crew_requested[lang];
}

export interface SurveyTextFacts {
  row: SurveyRow;
  name: string;
  followup?: Followup | null;
  county?: string;
  lang?: string;
}

/** The text right after the call, or null when the row isn't one of the doc's 4. */
export function surveyText(f: SurveyTextFacts): string | null {
  if (!isSurveyRow(f.row)) return null;
  const lang = langOf(f.lang);
  const entry = PACK.messages[f.row];
  const drip = entry.level === "High" ? PACK.drip_high[lang] : entry.level === "Medium" ? PACK.drip_medium[lang] : "";
  const name = f.name.trim() || (lang === "es" ? "vecino" : "neighbor");
  const body = fill(entry[lang], { name, county: f.county ?? COUNTY, drip, outdoor_valve: PACK.outdoor_valve[lang] });
  return f.followup ? `${body}\n${followupLine(f.followup, lang)}` : body;
}

/** To the household, once their emergency contact said yes. */
export function contactHelpingText(contact: string, lang?: string): string {
  return fill(PACK.contact_helping[langOf(lang)], { contact });
}

/** To the household, when the emergency contact couldn't help (no, no answer, hang-up): what happens instead. */
export function contactUnavailableText(contact: string, crew: string | null, lang?: string): string {
  const l = langOf(lang);
  return `${fill(PACK.contact_unavailable[l], { contact })} ${followupLine({ kind: "crew", crew }, l)}`;
}

/** To the emergency contact who said yes: whom they're helping and where. */
export function toContactText(homeowner: string, address: string, lang?: string): string {
  return fill(PACK.to_contact[langOf(lang)], { homeowner, address });
}
