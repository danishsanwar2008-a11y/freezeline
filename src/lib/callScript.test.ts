import { describe, expect, it } from "vitest";
import { answerTiles, buildConversation, stormSentence, type ConversationInput } from "./callScript";
import type { CallAnswers } from "./household";

const answers: CallAnswers = {
  can_do_steps: false,
  did_steps: false,
  someone_elderly: true,
  someone_disabled: false,
  cant_go_outside: true,
  lives_alone: true,
  knows_shutoff: false,
  faucet_covered: false,
  has_heat: true,
  neighbor_check: null,
};
const base: ConversationInput = {
  lang: "en",
  level: "High",
  temp: 13.4,
  hoursBelow20: 19,
  steps: ["Drip only your kitchen tap.", "Close your crawlspace vents.", "Cover your outdoor faucet."],
  hasOutdoorFaucet: true,
  contact: { replied_text: false, called: true, answered_call: true, door_check: false },
  answers,
  assessment: "needs_crew",
  assignedCrew: null,
};
const all = (c: ReturnType<typeof buildConversation>) => c.lines.map((l) => l.text).join(" ");

describe("agent conversation (sample)", () => {
  it("explains the storm and the 3 steps, then asks every question", () => {
    const c = buildConversation(base);
    expect(c.kind).toBe("call");
    const text = all(c);
    expect(text).toContain("13°F right now, after 19 hours below 20°F");
    expect(text).toContain("Drip only your kitchen tap.");
    for (const q of ["Can you do these steps yourself?", "elderly, disabled, or unable to go outside", "live alone", "main water shutoff", "outdoor faucet covered", "heat right now", "neighbor"])
      expect(text).toContain(q);
    expect(text).toContain("Yes: someone here is elderly and we can't go outside.");
  });

  it("honesty: says it is REQUESTING a crew until one is actually assigned", () => {
    const text = all(buildConversation(base));
    expect(text).toContain("I'm requesting a crew");
    expect(text).not.toMatch(/on the way/i);
  });

  it("says the crew is on the way only once a crew is assigned", () => {
    const text = all(buildConversation({ ...base, assignedCrew: "Crew 2" }));
    expect(text).toContain("Crew 2 is on the way");
    expect(text).not.toContain("requesting a crew");
  });

  it("never mentions a crew to a household that can do the steps", () => {
    const text = all(buildConversation({ ...base, answers: { ...answers, can_do_steps: true, did_steps: true }, assessment: "ready", assignedCrew: "Crew 1" }));
    expect(text).not.toMatch(/crew/i);
    expect(text).toContain("you're all set");
  });

  it("no answer / waiting / not contacted show a plain note instead of a transcript", () => {
    expect(buildConversation({ ...base, answers: null, contact: { replied_text: false, called: true, answered_call: false, door_check: true } }).note).toBe(
      "We called but couldn't reach you. Someone will knock on your door to check on you.",
    );
    expect(buildConversation({ ...base, answers: null, contact: { replied_text: false, called: false, answered_call: false, door_check: false } }).kind).toBe("waiting");
    expect(buildConversation({ ...base, contact: null, answers: null }).kind).toBe("not_contacted");
  });

  it("works in Spanish with no English left in the agent's lines", () => {
    const steps = ["Deje gotear solo la llave de la cocina.", "Cierre las rejillas del espacio bajo el piso.", "Cubra su llave de agua exterior."];
    const text = all(buildConversation({ ...base, lang: "es", steps, assignedCrew: "Equipo 2" }));
    expect(text).toContain("Equipo 2 va en camino");
    expect(text).not.toMatch(/\b(the|your|crew)\b/i);
  });

  it("answer tiles reflect the call; unanswered means unknown", () => {
    expect(answerTiles(answers, "needs_crew")).toEqual({ canDo: false, needsHelp: true, shutoffFound: false, faucetCovered: false, hasHeat: true, livesAlone: true });
    expect(answerTiles(null, null).canDo).toBeNull();
  });

  it("storm day sentences fill every slot", () => {
    expect(stormSentence("coldest", "en", { day: "Monday", temp: 14, n: 338 })).toBe("Monday night: 14°F, the coldest night. 338 homes in your area need to act.");
    expect(stormSentence("calm", "es", { day: "sábado", temp: 41 })).not.toMatch(/\{/);
  });
});
