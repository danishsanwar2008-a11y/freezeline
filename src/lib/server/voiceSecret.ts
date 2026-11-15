import "server-only";
import { timingSafeEqual } from "node:crypto";

// The voice agent's routes (/api/voice/result, /crew, /status) are public (the agent can't sign in
// to the console), so each one requires the shared secret VOICE_SHARED_SECRET in x-voice-secret.

/** null when the request may go on; otherwise the response to send. */
export function voiceSecretError(req: Request): Response | null {
  const want = process.env.VOICE_SHARED_SECRET;
  if (!want) return Response.json({ error: "VOICE_SHARED_SECRET is not set on the server." }, { status: 503 });
  const got = req.headers.get("x-voice-secret");
  if (!got) return Response.json({ error: "forbidden" }, { status: 403 });
  const a = Buffer.from(want), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b) ? null : Response.json({ error: "forbidden" }, { status: 403 });
}
