import { describe, expect, it } from "vitest";
import { AgentReport, answeredOnly, answerTiles, callOutcome, encodeHousehold, fromTwilioStatus, maskPhone, reportColumns } from "./voiceCalls";

const id = "7f1c2a7e-2a9e-4c55-9a43-1c7a1f6f0b11";
const fullAnswers = {
  can_do_steps: true,
  did_steps: false,
  someone_elderly: false,
  someone_disabled: false,
  cant_go_outside: false,
  lives_alone: false,
  knows_shutoff: true,
  faucet_covered: true,
  has_heat: true,
  neighbor_check: false,
};

describe("agent reports", () => {
  it("keeps only the questions that were actually answered (a hang-up leaves defaults behind)", () => {
    expect(answeredOnly(fullAnswers, ["is_household", "can_do_steps"])).toEqual({ can_do_steps: true });
    expect(Object.keys(answeredOnly(fullAnswers, ["needs_help"])).sort()).toEqual(["cant_go_outside", "someone_disabled", "someone_elderly"]);
  });

  it("records the assessment only once the script finished", () => {
    const partial = reportColumns(AgentReport.parse({ call_id: id, final: false, assessment: "ready", answers: fullAnswers, answered: ["can_do_steps"] }));
    expect(partial).toMatchObject({ finished: false, assessment: null, questions_answered: 1, answers: { can_do_steps: true } });
    const done = reportColumns(
      AgentReport.parse({
        call_id: id,
        call_sid: "CA123",
        final: true,
        assessment: "needs_reminder",
        closing: "agent_reminder",
        answers: fullAnswers,
        answered: ["is_household", "can_do_steps", "needs_help", "lives_alone", "knows_shutoff", "faucet_covered", "has_heat", "neighbor_check"],
        transcript: [{ who: "agent", text: "Hi" }, { who: "you", text: "Yes." }],
      }),
    );
    expect(done).toMatchObject({ call_sid: "CA123", finished: true, assessment: "needs_reminder", closing: "agent_reminder", questions_answered: 8 });
    expect(done.transcript).toHaveLength(2);
  });

  it("rejects a report without our call id", () => {
    expect(AgentReport.safeParse({ final: true }).success).toBe(false);
    expect(AgentReport.safeParse({ call_id: "not-a-uuid" }).success).toBe(false);
  });
});

describe("statuses and outcomes", () => {
  it("maps Twilio's statuses", () => {
    expect(fromTwilioStatus("in-progress")).toBe("in_progress");
    expect(fromTwilioStatus("no-answer")).toBe("no_answer");
    expect(fromTwilioStatus("initiated")).toBe("queued");
    expect(fromTwilioStatus("something-new")).toBeNull();
  });

  it("names one outcome per call", () => {
    expect(callOutcome({ status: "completed", finished: true, assessment: "needs_crew", questions_answered: 8 })).toBe("needs_crew");
    expect(callOutcome({ status: "completed", finished: false, assessment: null, questions_answered: 3 })).toBe("partial");
    expect(callOutcome({ status: "no_answer", finished: false, assessment: null, questions_answered: 0 })).toBe("no_answer");
    expect(callOutcome({ status: "in_progress", finished: false, assessment: null, questions_answered: 2 })).toBe("in_progress");
  });
});

describe("display helpers", () => {
  it("shows unanswered questions as no answer, not as No", () => {
    const tiles = answerTiles({ can_do_steps: false });
    expect(tiles[0]).toEqual({ label: "Can do the steps", value: "No" });
    expect(tiles.slice(1).every((t) => t.value === null)).toBe(true);
  });

  it("masks phone numbers", () => {
    expect(maskPhone("+17135550123")).toBe("(713) •••-0123");
  });

  it("encodes the household the way the agent decodes it (base64 JSON, URL-encoded)", () => {
    const enc = encodeHousehold({ call_id: id, engine: "gather", lang: "es", first_name: "María" });
    const json = JSON.parse(Buffer.from(decodeURIComponent(enc), "base64").toString("utf8"));
    expect(json).toEqual({ call_id: id, engine: "gather", lang: "es", first_name: "María" });
    expect(enc).not.toMatch(/[+/=]/);
  });
});
