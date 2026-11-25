// Who may see which real person's details on the open Sign-ups and Calls pages (demo mode: no
// password). Pure and tested (privacy.test.ts).
//
// A visitor sees: their own sign-up and their own calls in full (the browser's fl_signup cookie,
// src/lib/server/signupCookie.ts), and sample data (fictional people) in full. Everyone else's
// name, phone, email, address, emergency contact, answers and transcript are hidden. The hiding is
// done on the server: hidden fields are never sent to the browser, only a blurred placeholder.
// The team's own machine (localhost) sees everything.

export interface Viewer {
  /** The viewer's own sign-up (from the signed cookie), or null. */
  registrationId: string | null;
  /** The team's own machine: sees every row. */
  seeAll: boolean;
}

/** Sign-up rows: placeholder rows are fictional (simulated, 555-01XX, example.com). */
export function canSeeSignup(row: { id: string; source?: string | null }, viewer: Viewer): boolean {
  return viewer.seeAll || row.source === "placeholder" || (viewer.registrationId !== null && row.id === viewer.registrationId);
}

/**
 * Call rows: sample calls are simulated; a demo call is the viewer's when it was made for their
 * sign-up, and its emergency-contact call (parent_call_id) goes with it.
 */
export function canSeeCall(
  row: { id: string; source: string; registration_id?: string | null; parent_call_id?: string | null },
  viewer: Viewer,
  ownCallIds: ReadonlySet<string>,
): boolean {
  if (viewer.seeAll || row.source === "sample") return true;
  if (viewer.registrationId !== null && row.registration_id === viewer.registrationId) return true;
  return !!row.parent_call_id && ownCallIds.has(row.parent_call_id);
}

/** PostgREST filter that limits a sign-up search to rows this viewer may see (null = no limit). */
export function visibleSignupsFilter(viewer: Viewer): string | null {
  if (viewer.seeAll) return null;
  return viewer.registrationId ? `source.eq.placeholder,id.eq.${viewer.registrationId}` : "source.eq.placeholder";
}
