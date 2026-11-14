import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { AgentReport, reportColumns } from "@/lib/voiceCalls";
import { textChecklistAfterCall } from "@/lib/server/callTexts";

// The voice agent (voice/agent.py) posts here after every answer and when the script ends, so a
// call's answers are saved even if the household hangs up halfway. Not behind the console password
// (the agent can't sign in): it must carry the shared secret VOICE_SHARED_SECRET in x-voice-secret.
// Writes with the service role; voice_calls has no anon access.

function secretOk(req: Request): boolean {
  const want = process.env.VOICE_SHARED_SECRET;
  const got = req.headers.get("x-voice-secret");
  if (!want || !got) return false;
  const a = Buffer.from(want), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!process.env.VOICE_SHARED_SECRET) return Response.json({ error: "VOICE_SHARED_SECRET is not set on the server." }, { status: 503 });
  if (!secretOk(req)) return Response.json({ error: "forbidden" }, { status: 403 });

  const parsed = AgentReport.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected a call report with call_id." }, { status: 400 });
  const report = parsed.data;

  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: row, error: readError } = await db
    .from("voice_calls")
    .select("id,status,source,to_phone,lang,mode,finished")
    .eq("id", report.call_id)
    .maybeSingle();
  if (readError) return Response.json({ error: readError.message }, { status: 500 });
  if (!row) return Response.json({ error: "Unknown call_id." }, { status: 404 });

  // While answers arrive the call is live; the final report means the script reached its end.
  const status = row.status === "failed" || row.status === "canceled" ? row.status : report.final ? "completed" : "in_progress";
  const cols = reportColumns(report);
  // Reports can arrive out of order. The update itself only applies if this report has at least as
  // many answers as the saved one, and never over a finished call unless it is the final report.
  // (A condition in the UPDATE, not a read-then-write, so concurrent requests can't race past it.)
  let update = db
    .from("voice_calls")
    .update({ ...cols, status, ...(report.final ? { ended_at: new Date().toISOString() } : {}) })
    .eq("id", report.call_id)
    .lte("questions_answered", cols.questions_answered);
  if (!report.final) update = update.eq("finished", false);
  const { data: changed, error } = await update.select("id");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!changed?.length) return Response.json({ ok: true, ignored: "older report" });
  // The call just reached its end: text the household the checklist the call promised.
  const text = await textChecklistAfterCall(db, row, report);
  return Response.json({ ok: true, text });
}
