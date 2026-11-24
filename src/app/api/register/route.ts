import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { parseRegistration, toRow } from "@/lib/registration";
import { lookupAndMatch, matchColumns } from "@/lib/nominatim";
import { signupCookie } from "@/lib/server/signupCookie";

// Public household sign-up (POST JSON from /register). Not behind the console password: anyone can
// sign up. Validated with the same rules as the form, written with the service role only
// (the registrations table has no anon access). A few sign-ups per address per window, in memory.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, { n: number; since: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  const t = recent.get(ip);
  if (!t || now - t.since > WINDOW_MS) {
    recent.set(ip, { n: 1, since: now });
    return false;
  }
  t.n++;
  return t.n > MAX_PER_WINDOW;
}

const fail = (status: number, message: string) => Response.json({ ok: false, message }, { status });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return fail(400, "Something went wrong sending the form. Please try again.");

  const parsed = parseRegistration(body);
  if (!parsed.ok) return Response.json({ ok: false, errors: parsed.errors }, { status: 422 });
  const { data } = parsed;
  // Honeypot filled in: a bot. Answer like a success and store nothing.
  if (data.website) return Response.json({ ok: true, firstName: data.fullName.split(" ")[0] });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return fail(429, "Too many sign-ups from this connection. Please wait a few minutes and try again.");

  const db = getSupabaseAdmin();
  if (!db) return fail(503, "Sign-up isn't available right now. Please try again later.");

  // Match the address to a home on the map (OpenStreetMap lookup). Never blocks the sign-up:
  // if the lookup is busy or fails, the row is saved as "pending" and `npm run registrations:match` retries.
  const match = await lookupAndMatch(data);
  let { data: row, error } = await db.from("registrations").insert({ ...toRow(data), ...matchColumns(match) }).select("id").single();
  if (error?.code === "PGRST204") {
    // Match columns missing (supabase/005_registration_matching.sql not run yet): save the sign-up anyway.
    console.error("[register] match columns missing; run supabase/005_registration_matching.sql");
    ({ data: row, error } = await db.from("registrations").insert(toRow(data)).select("id").single());
  }
  const firstName = data.fullName.split(" ")[0];
  if (error) {
    if (error.code === "23505") {
      // Signed up before (same email). With the same phone too, this browser is theirs again: it gets
      // the cookie, so Run agent calls them. A different phone stays an error (no taking over a sign-up).
      const { data: existing } = await db.from("registrations").select("id,phone").eq("email", data.email).maybeSingle();
      if (existing && existing.phone === data.phone) return withSignup({ ok: true, firstName, returning: true }, 200, existing.id, req);
      return Response.json(
        { ok: false, errors: { email: "This email is already signed up. If something changed, reply to one of our texts and we'll update it." } },
        { status: 409 },
      );
    }
    console.error("[register]", error.code, error.message, /registrations/.test(error.message) ? "(run supabase/004_registrations.sql)" : "");
    return fail(500, "We couldn't save your sign-up. Please try again in a minute.");
  }
  return withSignup({ ok: true, firstName }, 201, row?.id ?? null, req);
}

/** The JSON reply, plus the "signed up on this browser" cookie (src/lib/server/signupCookie.ts). */
function withSignup(body: Record<string, unknown>, status: number, registrationId: string | null, req: Request): Response {
  const res = Response.json(body, { status });
  const cookie = registrationId ? signupCookie(registrationId, req) : null;
  if (cookie) res.headers.append("set-cookie", cookie);
  return res;
}
