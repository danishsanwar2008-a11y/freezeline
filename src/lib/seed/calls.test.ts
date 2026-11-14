import { describe, expect, it } from "vitest";
import { generateSampleCalls, SAMPLE_CALL_HOURS, SAMPLE_CALLS_PER_HOUR } from "./calls";
import { callOutcome } from "../voiceCalls";

const calls = generateSampleCalls();

describe("sample calls", () => {
  it("are deterministic, simulated, and one batch per storm hour", () => {
    expect(generateSampleCalls()).toEqual(calls);
    expect(calls).toHaveLength(SAMPLE_CALL_HOURS.length * SAMPLE_CALLS_PER_HOUR);
    expect(calls.every((c) => c.source === "sample" && c.simulated)).toBe(true);
  });

  it("only use fictional 555-01XX numbers", () => {
    for (const c of calls) expect(c.to_phone).toMatch(/^\+1\d{3}55501\d{2}$/);
  });

  it("cover every outcome, and an assessment only on calls that reached the end", () => {
    const outcomes = new Set(calls.map((c) => callOutcome(c)));
    for (const o of ["ready", "partial", "no_answer"]) expect(outcomes.has(o as never)).toBe(true);
    for (const c of calls) {
      if (!c.finished) expect(c.assessment).toBeNull();
      expect(Object.keys(c.answers).length > 0).toBe(c.questions_answered > 0);
    }
  });

  it("never claims a crew is on the way (the honesty rule)", () => {
    for (const c of calls) {
      expect(c.closing).not.toBe("agent_crew_assigned");
      expect(c.transcript.map((l) => l.text).join(" ")).not.toMatch(/on the way|en camino/i);
    }
  });

  it("transcripts end on the last answer for calls that hung up", () => {
    for (const c of calls.filter((x) => callOutcome(x) === "partial")) {
      expect(c.transcript.at(-1)?.who).toBe("you");
      expect(c.transcript.filter((l) => l.who === "you")).toHaveLength(c.questions_answered);
    }
  });
});
