import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { crewForCall } from "@/lib/server/callFollowup";
import { voiceSecretError } from "@/lib/server/voiceSecret";

// The voice agent asks here, mid-call, for a crew: the household can't reach their water shutoff and
// has no neighbor to help. Assigns the nearest free crew in the home's own area (a real
// crew_assignments row) and answers with its name, so the call may say "Crew 3 is on the way";
// { crew: null } when all of that area's crews are busy (the call then says "requested").
// Public route (the agent can't sign in): requires x-voice-secret = VOICE_SHARED_SECRET.

// reasons: why the house needs someone ("shutoff", "away"), straight from the call (its last answers
// may not be saved yet when the agent asks).
const Body = z.object({ call_id: z.string().uuid(), reasons: z.array(z.string().max(16)).max(4).optional() });

export async function POST(req: Request) {
  const denied = voiceSecretError(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected { call_id }." }, { status: 400 });
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const out = await crewForCall(db, parsed.data.call_id, parsed.data.reasons);
  return "error" in out ? Response.json({ error: out.error }, { status: out.status }) : Response.json(out);
}
