// The "you signed up on this browser" cookie: lets Run agent call the person who clicked it (their own
// /register sign-up) instead of the team's demo phone. Pure and tested; the key comes from
// src/lib/server/signupCookie.ts (server only).
//
// Value: "<registration id>.<issued ms>.<HMAC>". The HMAC covers the id and the time, so the cookie
// can't be edited to point at someone else's sign-up, and it expires after SIGNUP_DAYS.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNUP_COOKIE = "fl_signup";
export const SIGNUP_DAYS = 30;
const MAX_AGE_MS = SIGNUP_DAYS * 24 * 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const mac = (key: string, msg: string) => createHmac("sha256", key).update(`freezeline-signup|${msg}`).digest();

/** A signed cookie value for this sign-up. */
export function signSignup(registrationId: string, key: string, now = Date.now()): string {
  if (!UUID.test(registrationId)) throw new Error("not a registration id");
  if (!key) throw new Error("no signing key");
  return `${registrationId}.${now}.${mac(key, `${registrationId}|${now}`).toString("hex")}`;
}

/** The registration id in a cookie this server signed within SIGNUP_DAYS, else null. */
export function verifySignup(value: string | undefined | null, key: string, now = Date.now()): string | null {
  if (!value || !key) return null;
  const [id, issuedRaw, sig, ...rest] = value.split(".");
  if (rest.length || !id || !issuedRaw || !sig || !UUID.test(id)) return null;
  const issued = Number(issuedRaw);
  if (!Number.isFinite(issued) || issued > now + 60_000 || now - issued > MAX_AGE_MS) return null;
  const given = Buffer.from(sig, "hex");
  const expected = mac(key, `${id}|${issued}`);
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}
