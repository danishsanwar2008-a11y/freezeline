import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { AgentReport, reportColumns } from "@/lib/voiceCalls";
import { textChecklistAfterCall } from "@/lib/server/callTexts";
import { placeContactCall, settleContactCall } from "@/lib/server/callFollowup";
import { voiceSecretError } from "@/lib/server/voiceSecret";

// The voice agent (voice/agent.py) posts here after every answer and when the script ends, so a
// call's answers are saved even if the household hangs up halfway. Not behind the console password
// (the agent can't sign in): it must carry the shared secret VOICE_SHARED_SECRET in x-voice-secret.
// Writes with the service role; voice_calls has no anon access.
//
// When a call first reaches its end: the household gets its text, then
//   - a pre-survey call whose follow-up is "contact" -> the emergency contact is called now;
//   - an emergency-contact call -> its answer settles the household's follow-up (help, or a crew).

export async function POST(req: Request) {
  const denied = voiceSecretError(req);
  if (denied) return denied;

  const parsed = AgentReport.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected a call report with call_id." }, { status: 400 });
  const report = parsed.data;

  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: row, error: readError } = await db
    .from("voice_calls")
    .select("id,status,source,to_phone,lang,mode,finished,home_id,plan_for")
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

  const text = await textChecklistAfterCall(db, row, report);
  let followup: string | undefined;
  if (report.final && !row.finished) {
    if (row.mode === "survey" && report.followup === "contact")
      followup = await placeContactCall(db, row, report.contact_reasons ?? [], report.answers);
    else if (row.mode === "contact") followup = await settleContactCall(db, row.id);
  }
  return Response.json({ ok: true, text, ...(followup ? { followup } : {}) });
}
