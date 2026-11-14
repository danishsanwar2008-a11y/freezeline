import { describe, expect, it } from "vitest";
import { alsoNotified, NOTIFY_TAG, type RunFacts } from "./agentNotify";

const facts: RunFacts = {
  needAction: 8022,
  high: 4290,
  texted: 8022,
  crewsSent: 20,
  crewQueue: 660,
  lowestArea: "Third Ward",
  lowestPsi: 24.6,
  stage2Pending: true,
};

describe("Also notified (simulated)", () => {
  it("names the 4 parties, every line marked simulated", () => {
    const n = alsoNotified(facts);
    expect(n.map((x) => x.party)).toEqual(["Maintenance contractors", "Water utility control room", "City officials (emergency management)", "Mayor’s office"]);
    expect(n.every((x) => x.simulated)).toBe(true);
    expect(NOTIFY_TAG).toMatch(/simulated/);
    expect(NOTIFY_TAG).toMatch(/nothing is sent/);
  });

  it("uses only this run's numbers", () => {
    const text = alsoNotified(facts).map((x) => x.message).join(" | ");
    expect(text).toContain("20 crews sent");
    expect(text).toContain("660 more homes waiting for a crew");
    expect(text).toContain("Third Ward forecast low 24.6 psi");
    expect(text).toContain("Stage 2 alert waiting for supervisor approval");
    expect(text).toContain("8,022 homes need action");
    expect(text).toContain("8,022 texts queued");
  });

  it("says nothing when no home needs action, and gets plurals right", () => {
    expect(alsoNotified({ ...facts, needAction: 0 })).toEqual([]);
    const one = alsoNotified({ ...facts, crewsSent: 1, crewQueue: 0, texted: 0, stage2Pending: false, needAction: 1, high: 1 });
    const text = one.map((x) => x.message).join(" | ");
    expect(text).toContain("1 crew sent");
    expect(text).toContain("1 home needs action");
    expect(text).not.toContain("texts queued");
    expect(text).not.toContain("Stage 2");
  });
});
