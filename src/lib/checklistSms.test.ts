import { describe, expect, it } from "vitest";
import { checklistText, isValidChecklist, CHECKLIST_ENDINGS } from "./checklistSms";
import { LANGS } from "./pregenerated";

const steps = ["Close your crawlspace vents.", "Open the cabinet under your kitchen sink.", "Drip only your kitchen tap."];
const CLOSINGS = [...CHECKLIST_ENDINGS, "agent_crew_assigned", null, undefined];
const ON_THE_WAY = /on the way|va en camino|is coming|dispatched|en camino/i;

describe("checklist text after a finished call", () => {
  it("carries the 3 steps exactly as the call read them, labeled simulated", () => {
    const t = checklistText({ steps, closing: "agent_reminder", lang: "en" })!;
    expect(t).toContain("FreezeLine (simulated)");
    steps.forEach((s) => expect(t).toContain(s));
    expect(t).toContain("before 8 PM");
  });

  it("renders every ending in both languages with no unfilled slot", () => {
    for (const lang of LANGS)
      for (const closing of CLOSINGS) {
        const t = checklistText({ steps, closing, lang });
        expect(t, `${closing}/${lang}`).not.toBeNull();
        expect(isValidChecklist(t!), `${closing}/${lang}: ${t}`).toBe(true);
      }
  });

  it("never says a crew is on the way, whatever the call's ending", () => {
    for (const lang of LANGS)
      for (const closing of CLOSINGS) expect(checklistText({ steps, closing, lang })).not.toMatch(ON_THE_WAY);
  });

  it("a crew request says the crew is requested, not coming", () => {
    expect(checklistText({ steps, closing: "agent_crew_requested", lang: "en" })).toContain("We're requesting a crew");
  });

  it("sends nothing without all 3 steps", () => {
    expect(checklistText({ steps: [], closing: "agent_ready", lang: "en" })).toBeNull();
    expect(checklistText({ steps: ["a", "", "c"], closing: "agent_ready", lang: "en" })).toBeNull();
  });

  it("speaks to the household as you", () => {
    expect(checklistText({ steps, closing: "agent_ready", lang: "en" })).toMatch(/\byour?\b/i);
  });
});
