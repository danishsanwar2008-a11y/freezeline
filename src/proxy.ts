// Demo mode: no password anywhere. City Operations, Sign-ups, Calls and /status are open; the Sign-ups
// and Calls pages show a visitor only their own details and sample data, everyone else's hidden on the
// server (src/lib/privacy.ts). The console password (CONSOLE_PASSWORD, src/lib/server/consoleAuth.ts)
// is kept for later, when a water utility gets a real sign-in.
//
// The two routes that text or call real people in bulk (/api/sms, /api/voice/call) are not pages and
// nothing in the interface uses them. Open, they would let anyone text or call people from the team's
// accounts, so they answer only on the team's own machine (localhost). Each route checks again itself.

import { NextResponse, type NextRequest } from "next/server";
import { isTeamMachine } from "@/lib/server/teamMachine";

export function proxy(req: NextRequest) {
  if (isTeamMachine(req.headers.get("host"), req.headers.get("x-forwarded-host"))) return NextResponse.next();
  return NextResponse.json({ error: "This route only works on the team's own machine." }, { status: 403 });
}

export const config = {
  matcher: ["/api/sms/:path*", "/api/voice/call/:path*"],
};
