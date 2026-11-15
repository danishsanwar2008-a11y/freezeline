import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { settleContactCall } from "@/lib/server/callFollowup";
import { voiceSecretError } from "@/lib/server/voiceSecret";

// An emergency-contact call has ended (Twilio's status callback, passed on by the voice agent):
// completed, no-answer, busy, failed or canceled. Settles the household's follow-up: the contact
// said yes -> they're helping; anything else -> a crew. Safe to receive twice.
// Public route (the agent can't sign in): requires x-voice-secret = VOICE_SHARED_SECRET.

const Body = z.object({ call_id: z.string().uuid(), call_status: z.string().max(32).optional() });

export async function POST(req: Request) {
  const denied = voiceSecretError(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected { call_id, call_status }." }, { status: 400 });
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const outcome = await settleContactCall(db, parsed.data.call_id, parsed.data.call_status);
  return Response.json({ ok: true, outcome });
}
