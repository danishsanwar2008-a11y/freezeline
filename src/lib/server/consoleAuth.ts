// Shared-password gate for the City Operations console (not an account system).
// The password lives only in .env.local as CONSOLE_PASSWORD (server-only, never NEXT_PUBLIC_).
// A correct password sets an httpOnly cookie holding "<issued-at>.<HMAC>": the HMAC is keyed by the
// password, so the cookie never contains the password, stops working when the password changes,
// and expires after 12 hours (checked on the server, not just by the browser).
// Used by src/proxy.ts AND inside every protected page and API route (defense in depth).

import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "fl_console";
export const SESSION_HOURS = 12;
const SESSION_MS = SESSION_HOURS * 3_600_000;

/** The configured password, or null when it isn't set (then the gate stays closed). */
export function consolePassword(): string | null {
  const p = process.env.CONSOLE_PASSWORD;
  return p && p.length > 0 ? p : null;
}

const mac = (key: string, msg: string) => createHmac("sha256", key).update(msg).digest();

/** Constant-time password check (both sides hashed first, so lengths never leak). */
export function passwordMatches(input: string): boolean {
  const password = consolePassword();
  if (!password) return false;
  return timingSafeEqual(mac("freezeline-login", input), mac("freezeline-login", password));
}

/** Cookie value for a new session. */
export function newSession(now = Date.now()): string {
  const password = consolePassword();
  if (!password) throw new Error("CONSOLE_PASSWORD is not set");
  return `${now}.${mac(password, `freezeline-console|${now}`).toString("hex")}`;
}

/** True for a cookie value this server issued with the current password within the last 12 hours. */
export function validSession(value: string | undefined, now = Date.now()): boolean {
  const password = consolePassword();
  if (!password || !value) return false;
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const issued = Number(value.slice(0, dot));
  if (!Number.isFinite(issued) || issued > now + 60_000 || now - issued > SESSION_MS) return false;
  const given = Buffer.from(value.slice(dot + 1), "hex");
  const expected = mac(password, `freezeline-console|${issued}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Read the session cookie from a request's Cookie header. */
export function sessionFromRequest(req: Request): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** For API routes: null when signed in, otherwise a 401 response to return. */
export function requireConsole(req: Request): Response | null {
  return validSession(sessionFromRequest(req)) ? null : Response.json({ error: "Sign in to the console first." }, { status: 401 });
}

/**
 * Only same-site paths are allowed as the post-login destination. The value is resolved the way the
 * browser will resolve it (the URL parser drops tabs/newlines and treats "\" as "/"), and must stay
 * on this origin; the normalized path is returned.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/console";
  const base = "http://console.invalid";
  try {
    const u = new URL(next, base);
    return u.origin === base ? u.pathname + u.search + u.hash : "/console";
  } catch {
    return "/console";
  }
}

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_HOURS * 3600,
});
