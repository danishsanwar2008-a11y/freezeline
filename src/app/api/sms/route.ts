import { z } from "zod";
import { requireTeamMachine } from "@/lib/server/teamMachine";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isUsMobile, sendSms, smsConfigured, smsProvider, type SmsResult } from "@/lib/sms";

// Sends one text, or one to every household that signed up and consented on /register.
// Behind the console password: this reaches real phones and spends real money.
export const maxDuration = 60;

/** A ceiling per request. Texts are sent one at a time; Twilio will throttle a burst. */
const MAX_RECIPIENTS = 25;

const Body = z.object({
  body: z.string().trim().min(1).max(320),
  /** Omit to text every consented sign-up. */
  to: z.union([z.string(), z.array(z.string()).max(MAX_RECIPIENTS)]).optional(),
  /** Preview who would get it, without sending. */
  dryRun: z.boolean().optional(),
});

type Recipient = { phone: string; name: string | null };

async function consentedHouseholds(): Promise<Recipient[] | { error: string }> {
  const db = getSupabaseAdmin();
  if (!db) return { error: "Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." };
  const { data, error } = await db
    .from("registrations")
    .select("phone, full_name")
    .eq("consent_texts_calls", true)
    .order("created_at", { ascending: true })
    .limit(MAX_RECIPIENTS);
  if (error) {
    return {
      error:
        error.code === "42P01"
          ? "The registrations table does not exist yet (run supabase/004_registrations.sql)."
          : error.message,
    };
  }
  return (data ?? []).map((r: { phone: string; full_name: string | null }) => ({
    phone: r.phone,
    name: r.full_name,
  }));
}

export async function POST(req: Request) {
  const denied = requireTeamMachine(req); // demo mode: no password, but only the team's machine can text or call people in bulk
  if (denied) return denied;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Expected { body, to?, dryRun? } — body is required." }, { status: 400 });
  }
  const { body, dryRun } = parsed.data;

  let recipients: Recipient[];
  if (parsed.data.to) {
    const list = Array.isArray(parsed.data.to) ? parsed.data.to : [parsed.data.to];
    recipients = list.map((phone) => ({ phone, name: null }));
  } else {
    const found = await consentedHouseholds();
    if ("error" in found) return Response.json({ error: found.error }, { status: 503 });
    recipients = found;
  }

  if (recipients.length === 0) {
    return Response.json({ error: "No consented sign-ups to text yet.", sent: 0, failed: 0, results: [] });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return Response.json(
      { error: `That would text ${recipients.length} numbers. Send at most ${MAX_RECIPIENTS} per request.` },
      { status: 400 },
    );
  }

  const bad = recipients.filter((r) => !isUsMobile(r.phone));
  if (bad.length > 0) {
    return Response.json(
      { error: `Not US mobile numbers: ${bad.map((b) => b.phone).join(", ")}` },
      { status: 400 },
    );
  }

  if (dryRun) {
    return Response.json({
      dryRun: true,
      configured: smsConfigured(),
      provider: smsProvider(),
      wouldSendTo: recipients,
      body,
    });
  }

  const results: SmsResult[] = [];
  for (const r of recipients) {
    results.push(await sendSms(r.phone, body));
    // Twilio counts a queued message against your rate immediately; a small gap keeps a short
    // list from looking like a flood.
    if (recipients.length > 1) await new Promise((done) => setTimeout(done, 250));
  }

  const sent = results.filter((r) => r.ok).length;
  return Response.json({ sent, failed: results.length - sent, results });
}
