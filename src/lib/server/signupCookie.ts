import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SIGNUP_COOKIE, SIGNUP_DAYS, signSignup, verifySignup } from "@/lib/signupToken";
import { chooseCaller, isLocalHost, type DemoCaller, type SignupForCall } from "@/lib/demoCaller";

// The browser that signed up on /register gets an httpOnly cookie naming its sign-up, so Run agent
// can call that person (src/lib/demoCaller.ts). Signed with a key derived from the Supabase
// service-role key (server only, set wherever the app saves sign-ups), so no new secret is needed.

function key(): string {
  const root = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return root ? createHash("sha256").update(`freezeline-signup-cookie|${root}`).digest("hex") : "";
}

/** Set-Cookie header value for this sign-up (30 days, httpOnly, same-site). */
export function signupCookie(registrationId: string, req: Request): string | null {
  const k = key();
  if (!k) return null;
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${SIGNUP_COOKIE}=${signSignup(registrationId, k)}; Path=/; Max-Age=${SIGNUP_DAYS * 86_400}; HttpOnly; SameSite=Lax${secure}`;
}

function cookieValue(req: Request): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SIGNUP_COOKIE) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** The sign-up this browser made, if its cookie is valid and the row still exists. */
export async function signupFromRequest(db: SupabaseClient, req: Request): Promise<SignupForCall | null> {
  const id = verifySignup(cookieValue(req), key());
  if (!id) return null;
  const { data } = await db
    .from("registrations")
    .select("id,full_name,phone,consent_texts_calls,emergency_name,emergency_phone")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    phone: String(data.phone ?? ""),
    firstName: String(data.full_name ?? "").trim().split(/\s+/)[0] ?? "",
    consent: data.consent_texts_calls === true,
    emergencyName: data.emergency_name ? String(data.emergency_name).trim() : null,
    emergencyPhone: data.emergency_phone ? String(data.emergency_phone) : null,
  };
}

/** Who this Run agent click should ring: the clicker's sign-up, the team's phone on its own machine, or nobody. */
export async function callerForRequest(db: SupabaseClient | null, req: Request): Promise<DemoCaller> {
  const signup = db ? await signupFromRequest(db, req).catch(() => null) : null;
  // The team's own machine only when the real host AND any forwarded host are local: a visitor can't
  // claim to be "localhost" through a header on the hosted site.
  const forwarded = req.headers.get("x-forwarded-host");
  const local = isLocalHost(req.headers.get("host")) && (!forwarded || isLocalHost(forwarded));
  return chooseCaller({
    signup,
    local,
    ownerPhone: process.env.DEMO_CALL_TO?.trim() ?? "",
    ownerName: process.env.DEMO_CALL_NAME?.trim() ?? "",
  });
}
