import { describe, expect, it } from "vitest";
import { canSeeCall, canSeeSignup, visibleSignupsFilter, type Viewer } from "./privacy";

const ME = "3f2b8c1e-9a4d-4e6f-8b21-0c5d7e9fa123";
const OTHER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const visitor: Viewer = { registrationId: null, seeAll: false };
const signedUp: Viewer = { registrationId: ME, seeAll: false };
const team: Viewer = { registrationId: null, seeAll: true };

describe("open Sign-ups page: who sees whose details", () => {
  it("shows a visitor their own sign-up and the sample ones, nobody else's", () => {
    expect(canSeeSignup({ id: ME, source: "web" }, signedUp)).toBe(true);
    expect(canSeeSignup({ id: OTHER, source: "web" }, signedUp)).toBe(false);
    expect(canSeeSignup({ id: OTHER, source: "placeholder" }, signedUp)).toBe(true);
  });

  it("hides every real sign-up from a visitor who hasn't signed up", () => {
    expect(canSeeSignup({ id: ME, source: "web" }, visitor)).toBe(false);
    expect(canSeeSignup({ id: OTHER, source: null }, visitor)).toBe(false);
  });

  it("shows the team's own machine everything", () => {
    expect(canSeeSignup({ id: OTHER, source: "web" }, team)).toBe(true);
  });

  it("limits search to rows the viewer may see, so a search can't reveal who signed up", () => {
    expect(visibleSignupsFilter(visitor)).toBe("source.eq.placeholder");
    expect(visibleSignupsFilter(signedUp)).toBe(`source.eq.placeholder,id.eq.${ME}`);
    expect(visibleSignupsFilter(team)).toBeNull();
  });
});

describe("open Calls page: who sees whose calls", () => {
  const mine = new Set(["call-1"]);

  it("shows the viewer's own calls and the emergency-contact call that followed one", () => {
    expect(canSeeCall({ id: "call-1", source: "demo", registration_id: ME }, signedUp, mine)).toBe(true);
    expect(canSeeCall({ id: "call-2", source: "demo", registration_id: null, parent_call_id: "call-1" }, signedUp, mine)).toBe(true);
  });

  it("hides other people's demo calls, including the team's own phone", () => {
    expect(canSeeCall({ id: "call-3", source: "demo", registration_id: OTHER }, signedUp, mine)).toBe(false);
    expect(canSeeCall({ id: "call-4", source: "demo", registration_id: null }, signedUp, mine)).toBe(false);
    expect(canSeeCall({ id: "call-5", source: "demo", registration_id: null, parent_call_id: "call-9" }, signedUp, mine)).toBe(false);
  });

  it("shows sample calls (fictional) to everyone, and everything to the team's machine", () => {
    expect(canSeeCall({ id: "s", source: "sample" }, visitor, new Set())).toBe(true);
    expect(canSeeCall({ id: "call-4", source: "demo", registration_id: null }, team, new Set())).toBe(true);
  });
});
