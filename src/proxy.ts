// Password gate (Next 16 Proxy, Node.js runtime): /console, /status and their APIs need the console
// session cookie. Pages redirect to /login; APIs get 401. Every protected page and route checks again
// itself (see src/lib/server/consoleAuth.ts), so a matcher change can't silently open anything.

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, validSession } from "@/lib/server/consoleAuth";

export function proxy(req: NextRequest) {
  if (validSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in to the console first." }, { status: 401 });
  const login = new URL("/login", req.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/console/:path*", "/status/:path*", "/api/ops/:path*", "/api/agent/:path*"],
};
