import { cookieOptions, SESSION_COOKIE } from "@/lib/server/consoleAuth";

// Sign out: clear the console cookie and go back to the sign-in page.
export async function POST(req: Request) {
  const res = new Response(null, { status: 303, headers: { location: new URL("/login", req.url).toString() } });
  const o = cookieOptions();
  res.headers.append("set-cookie", `${SESSION_COOKIE}=; Path=${o.path}; Max-Age=0; HttpOnly; SameSite=Lax${o.secure ? "; Secure" : ""}`);
  return res;
}
