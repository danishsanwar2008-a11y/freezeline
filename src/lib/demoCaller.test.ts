import { describe, expect, it } from "vitest";
import { chooseCaller, isLocalHost, limitReason, limits, twilioReason, type DemoCaller, type SignupForCall } from "./demoCaller";
import { signSignup, verifySignup } from "./signupToken";

const ID = "3f2b8c1e-9a4d-4e6f-8b21-0c5d7e9fa123";
const signup: SignupForCall = { id: ID, phone: "+17135550142", firstName: "Maria", consent: true, emergencyName: "Sam Lee", emergencyPhone: "+17135550143" };
const owner = { ownerPhone: "+18325550100", ownerName: "Danish" };

describe("who Run agent's demo call rings", () => {
  it("calls the person who signed up on this browser, with their name and emergency contact", () => {
    expect(chooseCaller({ signup, local: false, ...owner })).toEqual({
      kind: "signup",
      registrationId: ID,
      to: "+17135550142",
      firstName: "Maria",
      emergencyName: "Sam Lee",
    });
  });

  it("prefers the sign-up over the team's phone even on the team's laptop", () => {
    expect(chooseCaller({ signup, local: true, ...owner }).kind).toBe("signup");
  });

  it("uses the team's demo phone only on the team's own machine", () => {
    expect(chooseCaller({ signup: null, local: true, ...owner })).toEqual({ kind: "owner", to: "+18325550100", firstName: "Danish" });
  });

  it("never rings anyone for a stranger on the hosted site who hasn't signed up", () => {
    expect(chooseCaller({ signup: null, local: false, ...owner })).toEqual({ kind: "needs_signup" });
  });

  it("never calls a sign-up without consent, or with a phone that isn't a US number", () => {
    expect(chooseCaller({ signup: { ...signup, consent: false }, local: false, ...owner }).kind).toBe("needs_signup");
    expect(chooseCaller({ signup: { ...signup, phone: "12345" }, local: false, ...owner }).kind).toBe("needs_signup");
  });

  it("offers the emergency contact only when it has a usable phone", () => {
    const c = chooseCaller({ signup: { ...signup, emergencyPhone: null }, local: false, ...owner });
    expect(c.kind === "signup" && c.emergencyName).toBeNull();
  });

  it("tells the team's machine from the hosted site", () => {
    expect(isLocalHost("localhost:3000")).toBe(true);
    expect(isLocalHost("127.0.0.1:3000")).toBe(true);
    expect(isLocalHost("freezeline.vercel.app")).toBe(false);
    expect(isLocalHost("localhost.evil.com")).toBe(false);
    expect(isLocalHost(null)).toBe(false);
  });
});

describe("demo call limits", () => {
  const now = Date.parse("2026-11-24T12:00:00Z");
  const base = { now, perSignupMinutes: 60, dailyCap: 40, lastCallForSignupAt: null, callsLast24h: 0 };
  const signupCaller: DemoCaller = { kind: "signup", registrationId: ID, to: "+17135550142", firstName: "Maria", emergencyName: null };
  const ownerCaller: DemoCaller = { kind: "owner", to: "+18325550100", firstName: "Danish" };

  it("lets the first call through", () => {
    expect(limitReason({ ...base, caller: signupCaller })).toBeNull();
  });

  it("allows one call per sign-up per hour, and says when the next one can go out", () => {
    expect(limitReason({ ...base, caller: signupCaller, lastCallForSignupAt: now - 20 * 60_000 })).toBe(
      "This phone was called recently. The next demo call can go out in 40 min.",
    );
    expect(limitReason({ ...base, caller: signupCaller, lastCallForSignupAt: now - 61 * 60_000 })).toBeNull();
  });

  it("stops every demo call once the daily cap is reached", () => {
    expect(limitReason({ ...base, caller: signupCaller, callsLast24h: 40 })).toMatch(/limit of 40 a day/);
    expect(limitReason({ ...base, caller: ownerCaller, callsLast24h: 40 })).toMatch(/limit of 40 a day/);
  });

  it("doesn't hold the team's own phone to the per-sign-up limit", () => {
    expect(limitReason({ ...base, caller: ownerCaller, lastCallForSignupAt: now - 60_000 })).toBeNull();
  });

  it("reads the limits from the environment, with safe defaults", () => {
    expect(limits({})).toEqual({ perSignupMinutes: 60, dailyCap: 40 });
    expect(limits({ DEMO_CALL_PER_SIGNUP_MINUTES: "5", DEMO_CALL_DAILY_CAP: "10" })).toEqual({ perSignupMinutes: 5, dailyCap: 10 });
    expect(limits({ DEMO_CALL_DAILY_CAP: "lots" })).toEqual({ perSignupMinutes: 60, dailyCap: 40 });
  });

  it("explains a trial account's refusal in plain words", () => {
    expect(twilioReason(21219, "x")).toMatch(/trial, so it can only call phones verified/);
    expect(twilioReason(573003, "x")).toMatch(/trial/);
    expect(twilioReason(13224, "Invalid number")).toBe("Twilio refused the call (13224): Invalid number");
  });
});

describe("the signed-up-on-this-browser cookie", () => {
  const key = "server-only-key";
  const now = Date.parse("2026-11-24T12:00:00Z");

  it("round-trips the sign-up id", () => {
    expect(verifySignup(signSignup(ID, key, now), key, now + 1000)).toBe(ID);
  });

  it("can't be edited to point at someone else's sign-up", () => {
    const v = signSignup(ID, key, now);
    const other = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    expect(verifySignup(other + v.slice(ID.length), key, now)).toBeNull();
    expect(verifySignup(v, "another-key", now)).toBeNull();
    expect(verifySignup(v.slice(0, -2) + "00", key, now)).toBeNull();
  });

  it("expires after 30 days, and rejects junk", () => {
    const v = signSignup(ID, key, now);
    expect(verifySignup(v, key, now + 31 * 24 * 3_600_000)).toBeNull();
    for (const junk of ["", "abc", `${ID}.x.y`, `${ID}.${now}`, "not-a-uuid.1.ab"]) expect(verifySignup(junk, key, now)).toBeNull();
  });
});
