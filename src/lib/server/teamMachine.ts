// "Is this the team's own machine?" for routes that must never answer the public (texting or calling
// real people in bulk). The real host AND any forwarded host must be local, so a visitor on the hosted
// site can't claim to be localhost through a header.
import { isLocalHost } from "@/lib/demoCaller";

export function isTeamMachine(host: string | null, forwarded: string | null): boolean {
  return isLocalHost(host) && (!forwarded || isLocalHost(forwarded));
}

/** For API routes: null on the team's machine, otherwise a 403 response to return. */
export function requireTeamMachine(req: Request): Response | null {
  return isTeamMachine(req.headers.get("host"), req.headers.get("x-forwarded-host"))
    ? null
    : Response.json({ error: "This route only works on the team's own machine." }, { status: 403 });
}
