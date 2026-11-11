import { cookieOptions, consolePassword, newSession, passwordMatches, safeNext, SESSION_COOKIE } from "@/lib/server/consoleAuth";

// Shared-password sign-in for the console (form POST from /login). Checked on the server only.
// A few wrong tries from one address in a short time are slowed down (simple in-memory limit).
const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRIES = 8;
const tries = new Map<string, { n: number; since: number }>();

function tooMany(ip: string): boolean {
  const now = Date.now();
  const t = tries.get(ip);
  if (!t || now - t.since > WINDOW_MS) return false;
  return t.n >= MAX_TRIES;
}
function fail(ip: string) {
  const now = Date.now();
  const t = tries.get(ip);
  tries.set(ip, !t || now - t.since > WINDOW_MS ? { n: 1, since: now } : { n: t.n + 1, since: t.since });
}

const back = (req: Request, next: string, error: string) => {
  const url = new URL("/login", req.url);
  url.searchParams.set("error", error);
  url.searchParams.set("next", next);
  return Response.redirect(url, 303);
};

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const next = safeNext(form?.get("next")?.toString());
  const password = form?.get("password")?.toString() ?? "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

  if (!consolePassword()) return back(req, next, "unset");
  if (tooMany(ip)) return back(req, next, "wait");
  if (!passwordMatches(password)) {
    fail(ip);
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    return back(req, next, "wrong");
  }
  tries.delete(ip);
  const res = new Response(null, { status: 303, headers: { location: new URL(next, req.url).toString() } });
  const o = cookieOptions();
  res.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(newSession())}; Path=${o.path}; Max-Age=${o.maxAge}; HttpOnly; SameSite=Lax${o.secure ? "; Secure" : ""}`,
  );
  return res;
}
