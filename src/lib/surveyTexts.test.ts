import { describe, expect, it } from "vitest";
import { contactHelpingText, contactUnavailableText, followupLine, rowFor, rowLevel, surveyText, toContactText, type Followup } from "./surveyTexts";
import { LANGS } from "./pregenerated";
import { SURVEY_ROWS, answerTiles, surveyNextSteps } from "./voiceCalls";

// Help already on its way (a storm "coming" is fine; a crew, help or someone coming is not).
const ON_THE_WAY = /on (the|their) way|va en camino|van en camino|dispatched|(help|crew|someone|neighbor|they) (is |are )?coming/i;

// The research doc's text table: its 4 rows, and where the 2 combinations it has no row for go.
const TABLE = [
  { temp: "mild", survey: "pass", row: "mild|pass", level: "Low" },
  { temp: "mild", survey: "fail", row: "mild|fail", level: "Medium" },
  { temp: "very_cold", survey: "fail", row: "very_cold|fail", level: "High" },
  { temp: "cold", survey: "pass", row: "cold|pass", level: "Medium" },
  { temp: "very_cold", survey: "pass", row: "cold|pass", level: "Medium" },
  { temp: "cold", survey: "fail", row: "very_cold|fail", level: "High" },
] as const;

// Every way a call can end, for who helps next.
const FOLLOWUPS: (Followup | null)[] = [
  null,
  { kind: "contact", contact: "Sam Lee" },
  { kind: "crew", crew: "Crew 3" },
  { kind: "crew", crew: null },
];

describe("pre-survey text table (research doc)", () => {
  it("has exactly the doc's 4 rows, and sends the 2 missing combinations to the nearest row", () => {
    expect([...SURVEY_ROWS].sort()).toEqual(["cold|pass", "mild|fail", "mild|pass", "very_cold|fail"]);
    for (const t of TABLE) {
      expect(rowFor(t.temp, t.survey), `${t.temp}|${t.survey}`).toBe(t.row);
      expect(rowLevel(rowFor(t.temp, t.survey))).toBe(t.level);
    }
  });

  it("renders every row and follow-up in both languages, labeled simulated, with no unfilled slot", () => {
    for (const row of SURVEY_ROWS)
      for (const lang of LANGS)
        for (const followup of FOLLOWUPS) {
          const t = surveyText({ row, name: "Maria", lang, followup })!;
          expect(t, `${row}/${lang}`).toContain("FreezeLine (simulated)");
          expect(t, `${row}/${lang}`).not.toMatch(/\{\w+\}|undefined|null/);
          expect(t).toContain("Maria");
        }
    // The doc's "winter storm in forecast for [county]" rows name the county.
    expect(surveyText({ row: "mild|pass", name: "Maria" })).toContain("forecast for Harris County");
    expect(surveyText({ row: "mild|fail", name: "Maria" })).toContain("forecast for Harris County");
  });

  it("Low doesn't drip; Medium drips one faucet; High drips 2-3 and closes the outdoor valve", () => {
    const text = (row: (typeof SURVEY_ROWS)[number]) => surveyText({ row, name: "Maria" })!;
    expect(text("mild|pass")).toContain("No need to drip");
    for (const row of ["mild|fail", "cold|pass"] as const) {
      expect(text(row)).toContain("Drip one faucet slowly");
      expect(text(row)).not.toContain("outdoor water pipe");
    }
    expect(text("very_cold|fail")).toContain("Drip 2 or 3 faucets slowly");
    expect(text("very_cold|fail")).toContain("close the valve on your outdoor water pipe");
    expect(text("very_cold|fail")).toContain("Don't shut off your main water valve");
  });

  it("adds one line for who helps next, and nothing when no one is needed", () => {
    const none = surveyText({ row: "cold|pass", name: "Maria" })!;
    expect(none).not.toMatch(/emergency contact|crew to help|on the way/);
    expect(surveyText({ row: "cold|pass", name: "Maria", followup: FOLLOWUPS[1] })).toContain(
      "We're calling Sam Lee, your emergency contact, now to ask them to help. If we can't reach them, we'll request a crew.",
    );
    expect(surveyText({ row: "cold|pass", name: "Maria", followup: FOLLOWUPS[2] })).toContain("Crew 3 is on the way to help you.");
    expect(surveyText({ row: "cold|pass", name: "Maria", followup: FOLLOWUPS[3] })).toContain("We're requesting a crew to help you.");
  });

  it("says help is on its way only with the name of a crew that was really assigned", () => {
    for (const row of SURVEY_ROWS)
      for (const lang of LANGS)
        for (const followup of FOLLOWUPS) {
          const assigned = followup?.kind === "crew" && followup.crew !== null;
          expect(ON_THE_WAY.test(surveyText({ row, name: "Maria", lang, followup })!), `${row}/${lang}/${JSON.stringify(followup)}`).toBe(assigned);
        }
  });

  it("refuses a row that isn't in the doc", () => {
    expect(surveyText({ row: "cold|fail" as never, name: "Maria" })).toBeNull();
  });
});

describe("texts after the emergency-contact call", () => {
  it("tells the household their contact is helping, and gives the contact the address", () => {
    expect(contactHelpingText("Sam Lee")).toBe("FreezeLine (simulated): Sam Lee said they can help you. We've texted them your address and the steps.");
    const toSam = toContactText("Danish", "123 Harvard St");
    expect(toSam).toContain("Thank you for helping Danish. Their address: 123 Harvard St.");
    expect(toSam).toContain("If a pipe bursts, shut off their main water valve");
  });

  it("when the contact can't help, names the crew only if one was assigned", () => {
    expect(contactUnavailableText("Sam Lee", "Crew 3")).toBe("FreezeLine (simulated): We couldn't get help from Sam Lee. Crew 3 is on the way to help you.");
    const requested = contactUnavailableText("Sam Lee", null);
    expect(requested).toContain("We're requesting a crew to help you. We'll text you as soon as one is assigned.");
    expect(requested).not.toMatch(ON_THE_WAY);
  });

  it("has every follow-up text in both languages with no unfilled slot", () => {
    for (const lang of LANGS)
      for (const t of [
        contactHelpingText("Sam", lang),
        contactUnavailableText("Sam", "Crew 3", lang),
        contactUnavailableText("Sam", null, lang),
        toContactText("Danish", "123 Harvard St", lang),
        followupLine({ kind: "contact", contact: "Sam" }, lang),
      ]) {
        expect(t, lang).not.toMatch(/\{\w+\}|undefined|null/);
        expect(t.length).toBeGreaterThan(10);
      }
  });
});

describe("officials' tiles for a pre-survey call", () => {
  const answers = { pipe_runs: "outside", pipe_material: "copper", home_age: 60, insulated: "no", shutoff_access: "cannot", frozen_before: true, someone_home: false };

  it("shows the priority and the 7 answers as 8 tiles (two full rows)", () => {
    const list = answerTiles(answers, "High");
    expect(list).toHaveLength(8);
    expect(Object.fromEntries(list.map((t) => [t.label, t.value]))).toMatchObject({
      Priority: "High",
      "Pipe material": "Copper",
      "Home age": "60 yr",
      "Can reach shutoff": "No",
      "Home next 3 days": "No",
    });
  });

  it("shows the saved outcome as the next step, or the plan while it's still open", () => {
    expect(surveyNextSteps(answers, "Crew 3 assigned (can't reach the water shutoff)")).toBe("Crew 3 assigned (can't reach the water shutoff)");
    expect(surveyNextSteps({ ...answers, neighbor_help: true })).toBe("Calling the emergency contact, then a crew");
    expect(surveyNextSteps({ ...answers, someone_home: true })).toBe("Crew needed");
    expect(surveyNextSteps({ ...answers, shutoff_access: "ok", someone_home: true })).toBeNull();
  });

  it("shows an emergency-contact call's one answer", () => {
    expect(answerTiles({ can_help: true })).toEqual([{ label: "Can go help", value: "Yes" }]);
  });

  it("still shows storm-call tiles for storm calls", () => {
    expect(answerTiles({ can_do_steps: true }).map((t) => t.label)).toContain("Can do the steps");
  });
});
