// Who Run agent's demo call rings (src/lib/server/demoCall.ts). Pure and tested.
//
//   1. The person who clicked, if this browser signed up on /register (with consent to calls):
//      their phone, their name, their emergency contact.
//   2. Otherwise, only on the team's own laptop (localhost), the team's demo phone DEMO_CALL_TO.
//   3. Otherwise nobody: the trace asks them to sign up first. A stranger on the hosted site never
//      makes the app ring someone else's phone.
//
// Limits (so a public button can't be used to ring one phone over and over, or run up the bill):
// one call per sign-up per DEMO_CALL_PER_SIGNUP_MINUTES (60), and DEMO_CALL_DAILY_CAP (40) demo calls
// across everyone per 24 hours. The team's own demo phone is exempt from the per-sign-up limit.

export interface SignupForCall {
  id: string;
  phone: string;
  firstName: string;
  consent: boolean;
  emergencyName: string | null;
  emergencyPhone: string | null;
}

export type DemoCaller =
  | { kind: "signup"; registrationId: string; to: string; firstName: string; emergencyName: string | null }
  | { kind: "owner"; to: string; firstName: string }
  | { kind: "needs_signup" };

const US_E164 = /^\+1[2-9]\d{9}$/;

export function chooseCaller(o: { signup: SignupForCall | null; local: boolean; ownerPhone: string; ownerName: string }): DemoCaller {
  const s = o.signup;
  if (s && s.consent && US_E164.test(s.phone))
    return {
      kind: "signup",
      registrationId: s.id,
      to: s.phone,
      firstName: s.firstName,
      emergencyName: s.emergencyName && s.emergencyPhone && US_E164.test(s.emergencyPhone) ? s.emergencyName : null,
    };
  if (o.local && US_E164.test(o.ownerPhone)) return { kind: "owner", to: o.ownerPhone, firstName: o.ownerName };
  return { kind: "needs_signup" };
}

/** Is this request from the team's own machine (the dev server), not the hosted site? */
export function isLocalHost(host: string | null | undefined): boolean {
  const h = (host ?? "").toLowerCase().replace(/:\d+$/, "");
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
}

export const DEFAULT_PER_SIGNUP_MINUTES = 60;
export const DEFAULT_DAILY_CAP = 40;

export function limits(env: Record<string, string | undefined>): { perSignupMinutes: number; dailyCap: number } {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && v?.trim() ? n : d;
  };
  return {
    perSignupMinutes: num(env.DEMO_CALL_PER_SIGNUP_MINUTES, DEFAULT_PER_SIGNUP_MINUTES),
    dailyCap: num(env.DEMO_CALL_DAILY_CAP, DEFAULT_DAILY_CAP),
  };
}

/** Why a call isn't allowed right now, or null when it is. */
export function limitReason(o: {
  caller: DemoCaller;
  lastCallForSignupAt: number | null;
  callsLast24h: number;
  now: number;
  perSignupMinutes: number;
  dailyCap: number;
}): string | null {
  if (o.caller.kind === "needs_signup") return null;
  if (o.callsLast24h >= o.dailyCap) return `Demo calls are paused: the limit of ${o.dailyCap} a day has been reached.`;
  if (o.caller.kind === "signup" && o.lastCallForSignupAt !== null) {
    const waitMin = Math.ceil(o.perSignupMinutes - (o.now - o.lastCallForSignupAt) / 60_000);
    if (waitMin > 0) return `This phone was called recently. The next demo call can go out in ${waitMin} min.`;
  }
  return null;
}

/** Plain words for Twilio's refusals that a new phone hits on a trial account. */
export function twilioReason(code: number | undefined, message: string): string {
  if (code === 21219 || code === 21608 || code === 573002 || code === 573003 || code === 573005)
    return "Twilio can't call this phone yet: the account is a trial, so it can only call phones verified in the Twilio console (or upgrade the account).";
  if (code === 20003) return "Twilio refused the login: check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.";
  return `Twilio refused the call${code ? ` (${code})` : ""}: ${message}`;
}
