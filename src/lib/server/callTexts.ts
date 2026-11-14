import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checklistText } from "@/lib/checklistSms";
import { sendSms, smsConfigured, smsProvider } from "@/lib/sms";
import type { AgentReport } from "@/lib/voiceCalls";

// Texts the checklist to the phone that was just called, once the call reaches the end of its script.
// Called by /api/voice/result after it saved the final report. Sends through SMS_PROVIDER (TextBee or
// Twilio). Never twice for one call: with supabase/007_call_texts.sql the row is claimed first
// (sms_status null -> 'sending'); without it, only the report that first marked the call finished sends.

export interface CallRow {
  id: string;
  source: string;
  to_phone: string;
  lang: string;
  mode: string;
  finished: boolean;
}

export type CallTextOutcome = { sent: boolean; reason: string };

const missingColumns = (msg: string | undefined) => !!msg && /sms_(status|body|id|error|at)/.test(msg);

export async function textChecklistAfterCall(db: SupabaseClient, row: CallRow, report: AgentReport): Promise<CallTextOutcome> {
  if (!report.final || row.finished) return { sent: false, reason: "call not newly finished" };
  if (row.mode === "survey" || report.mode === "survey") return { sent: false, reason: "survey calls get no checklist" };
  if (row.source !== "demo" && row.source !== "live") return { sent: false, reason: `no texts for ${row.source} calls` };
  // The project's fictional numbers (555-0100 to 555-0199) never get a real text.
  if (/^\+1\d{3}55501\d{2}$/.test(row.to_phone)) return { sent: false, reason: "fictional 555-01XX number" };
  const body = checklistText({ steps: report.steps ?? [], closing: report.closing, lang: row.lang === "es" ? "es" : "en" });
  if (!body) return { sent: false, reason: "the report carried no steps" };
  if (!smsConfigured()) {
    console.warn(`[call text] not sent: SMS_PROVIDER=${smsProvider()} is not set up in .env.local`);
    return { sent: false, reason: "texting is not set up" };
  }

  // Claim the row so a repeated final report can't send a second text.
  const claim = await db
    .from("voice_calls")
    .update({ sms_status: "sending", sms_body: body, sms_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("sms_status", null)
    .select("id");
  const recorded = !missingColumns(claim.error?.message);
  if (claim.error && recorded) return { sent: false, reason: `could not claim the text: ${claim.error.message}` };
  if (recorded && !claim.data?.length) return { sent: false, reason: "already texted" };
  if (!recorded) console.warn("[call text] voice_calls has no sms_* columns; run supabase/007_call_texts.sql to record texts");

  const result = await sendSms(row.to_phone, body).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e), sid: undefined }));
  if (recorded)
    await db
      .from("voice_calls")
      .update({ sms_status: result.ok ? "sent" : "failed", sms_id: result.sid ?? null, sms_error: result.ok ? null : (result.error ?? "unknown error"), sms_at: new Date().toISOString() })
      .eq("id", row.id);
  if (!result.ok) console.warn(`[call text] ${smsProvider()} refused the text: ${result.error}`);
  return result.ok ? { sent: true, reason: `sent via ${smsProvider()}` } : { sent: false, reason: result.error ?? "send failed" };
}
