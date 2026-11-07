import { describe, expect, it } from "vitest";
import { fillLink, isValidSms, smsGroupKey, templateSms } from "./messages";

describe("SMS templates", () => {
  it("a dripping home is told which single tap to drip, with its link and the simulated label", () => {
    const t = templateSms({ level: "High", action: "drip", faucet: "kitchen", uncovered: false });
    expect(t).toContain("Drip only your kitchen tap");
    expect(isValidSms(t)).toBe(true);
    expect(fillLink(t, "https://x/h/heights-0001")).toContain("https://x/h/heights-0001");
  });

  it("everyone else is asked not to drip", () => {
    expect(templateSms({ level: "Watch", action: "no_drip", faucet: null, uncovered: false })).toContain("Please don't drip tonight");
    expect(templateSms({ level: "High", action: "no_drip", faucet: null, uncovered: true })).toContain("pressure is at its limit");
  });

  it("rejects rewrites that drop the link or the simulated label", () => {
    expect(isValidSms("Drip your kitchen tap. {link}")).toBe(false);
    expect(isValidSms("FreezeLine (simulated): drip your kitchen tap.")).toBe(false);
  });

  it("homes with the same facts share one group", () => {
    const a = { level: "High" as const, action: "drip" as const, faucet: "kitchen", uncovered: false };
    expect(smsGroupKey(a)).toBe(smsGroupKey({ ...a }));
    expect(smsGroupKey(a)).not.toBe(smsGroupKey({ ...a, faucet: "bathroom" }));
  });
});
