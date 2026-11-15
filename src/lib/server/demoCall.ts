import "server-only";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { planAt, toTimestamp, weatherFor, type City } from "./cityState";
import { encodeHousehold, fromTwilioStatus, isFinalStatus, maskPhone, type CallHousehold, type CallStatus } from "@/lib/voiceCalls";
import { signupForPhone } from "@/lib/signups";

// The demo call that "Run agent" places: a real phone call, through the voice agent, to a
// teammate's own phone (DEMO_CALL_TO) standing in for the highest-risk household this hour.
// It is the research doc's pre-survey call: 7 questions, then the priority from the answers and
// that home's temperature this hour, then the matching text. Every call gets a voice_calls row
// first, so the agent's answers (posted to /api/voice/result) are saved against it.
//
// Twilio trial: TWILIO_PHONE_NUMBER is the From number. Older trials leave it empty (a shared
// trial number calls the signup phone); newer trials pair the phone with one trial number.

const RECENT_MS = 10 * 60 * 1000;

export interface DemoCallConfig {
  to: string;
  name: string;
  sid: string;
  token: string;
  host: string;
  from: string | null;
}

/** The settings a demo call needs, or the names of the ones missing from .env.local. */
export function demoCallConfig(): DemoCallConfig | { missing: string[] } {
  const env = (k: string) => process.env[k]?.trim() ?? "";
  const need = { DEMO_CALL_TO: env("DEMO_CALL_TO"), TWILIO_ACCOUNT_SID: env("TWILIO_ACCOUNT_SID"), TWILIO_AUTH_TOKEN: env("TWILIO_AUTH_TOKEN"), PUBLIC_HOSTNAME: env("PUBLIC_HOSTNAME") };
  const missing = Object.entries(need).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return { missing };
  if (!/^\+1[2-9]\d{9}$/.test(need.DEMO_CALL_TO)) return { missing: ["DEMO_CALL_TO (as +1XXXXXXXXXX)"] };
  return {
    to: need.DEMO_CALL_TO,
    name: env("DEMO_CALL_NAME"),
    sid: need.TWILIO_ACCOUNT_SID,
    token: need.TWILIO_AUTH_TOKEN,
    host: need.PUBLIC_HOSTNAME.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    from: env("TWILIO_PHONE_NUMBER") || null,
  };
}

const twilioAuth = (c: { sid: string; token: string }) => `Basic ${Buffer.from(`${c.sid}:${c.token}`).toString("base64")}`;

/** Is the voice agent answering on the public tunnel? (Twilio will fetch the call script there.) */
async function agentReachable(host: string): Promise<boolean> {
  try {
    const r = await fetch(`https://${host}/health`, { signal: AbortSignal.timeout(4000), headers: { "ngrok-skip-browser-warning": "1" } });
    return r.ok;
  } catch {
    return false;
  }
}

/** The highest-risk home this hour (ties: input order). */
function topHome(city: City, hour: number): number | null {
  const plan = planAt(city, hour);
  let best = -1;
  plan.homes.forEach((p, i) => {
    if (p.level !== "Low" && (best < 0 || p.score > plan.homes[best].score)) best = i;
  });
  return best >= 0 ? best : null;
}

export type DemoCallOutcome =
  | { kind: "placed"; callId: string; street: string; phone: string }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; reason: string };

export async function placeDemoCall(city: City, hour: number, time: string): Promise<DemoCallOutcome> {
  const cfg = demoCallConfig();
  if ("missing" in cfg) return { kind: "skipped", reason: `Demo call off: set ${cfg.missing.join(", ")} in .env.local.` };
  const db = getSupabaseAdmin();
  if (!db) return { kind: "skipped", reason: "Demo call off: the server has no Supabase service key." };

  const idx = topHome(city, hour);
  if (idx === null) return { kind: "skipped", reason: "No home needs action this hour, so no demo call." };

  // One live demo call at a time: a second click shouldn't ring the phone twice.
  const since = new Date(Date.now() - RECENT_MS).toISOString();
  const { data: active, error: activeError } = await db
    .from("voice_calls")
    .select("id")
    .eq("source", "demo")
    .in("status", ["queued", "ringing", "in_progress"])
    .gte("created_at", since)
    .limit(1);
  if (activeError) {
    const hint = /voice_calls/.test(activeError.message) ? " Run supabase/006_voice_calls.sql." : "";
    return { kind: "failed", reason: `Demo call not placed: ${activeError.message}.${hint}` };
  }
  if (active?.length) return { kind: "skipped", reason: "A demo call is already in progress; no second call placed." };

  if (!(await agentReachable(cfg.host)))
    return { kind: "failed", reason: "Demo call not placed: the voice agent isn't reachable (start voice\\start.ps1 and voice\\tunnel.ps1)." };

  const home = city.homes[idx];
  const weather = weatherFor(city, idx, hour);

  // The pre-survey call from the research doc: the 7 questions first, then the home's priority
  // (its weighted answers + this hour's temperature there) and next steps, then the matching text.
  // The priority is written to `level` by the call's final report, not guessed here.
  const { data: row, error: insertError } = await db
    .from("voice_calls")
    .insert({
      source: "demo",
      simulated: false,
      home_id: home.id,
      plan_for: toTimestamp(time),
      to_phone: cfg.to,
      lang: "en",
      mode: "survey",
      status: "queued",
    })
    .select("id")
    .single();
  if (insertError || !row) return { kind: "failed", reason: `Demo call not placed: ${insertError?.message ?? "no row"}.` };

  // The demo phone's own sign-up (/register): the emergency contact the agent offers to call.
  const signup = await signupForPhone(db, cfg.to);
  const firstName = cfg.name || signup?.firstName || "";
  const household: CallHousehold = {
    call_id: row.id,
    engine: "gather",
    mode: "survey",
    home_id: home.id,
    lang: "en",
    temp: Math.round(weather.temperature_f),
    ...(firstName ? { first_name: firstName } : {}),
    ...(signup?.emergencyName && signup.emergencyPhone ? { emergency_name: signup.emergencyName } : {}),
    street: home.street,
  };
  const form = new URLSearchParams({ To: cfg.to, Url: `https://${cfg.host}/voice/start?home=${encodeHousehold(household)}` });
  // Trial accounts own no number: leave From out and Twilio uses a shared trial number.
  if (cfg.from) form.set("From", cfg.from);

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.sid}/Calls.json`, {
      method: "POST",
      headers: { authorization: twilioAuth(cfg), "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number; message?: string };
    if (!res.ok || !json.sid) {
      const reason = `Twilio refused the call${json.code ? ` (${json.code})` : ""}: ${json.message ?? res.statusText}`;
      await db.from("voice_calls").update({ status: "failed", error: reason, updated_at: new Date().toISOString() }).eq("id", row.id);
      return { kind: "failed", reason: `Demo call not placed. ${reason}` };
    }
    await db
      .from("voice_calls")
      .update({ call_sid: json.sid, status: fromTwilioStatus(json.status) ?? "queued", updated_at: new Date().toISOString() })
      .eq("id", row.id);
    return { kind: "placed", callId: row.id, street: home.street, phone: maskPhone(cfg.to) };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await db.from("voice_calls").update({ status: "failed", error: reason, updated_at: new Date().toISOString() }).eq("id", row.id);
    return { kind: "failed", reason: `Demo call not placed: ${reason}` };
  }
}

/**
 * Refresh live calls' status from Twilio (ringing, answered, ended, no answer) and their length.
 * Called when the Calls page loads; only rows that aren't final yet and are less than a day old.
 */
export async function syncCallStatuses(): Promise<void> {
  const db = getSupabaseAdmin();
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!db || !sid || !token) return;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await db
    .from("voice_calls")
    .select("id,call_sid,status,duration_s")
    .in("source", ["demo", "live"])
    .not("call_sid", "is", null)
    // Still live, or ended (the agent's final report) without its length from Twilio yet.
    .or("status.in.(queued,ringing,in_progress),and(status.eq.completed,duration_s.is.null)")
    .gte("created_at", since)
    .limit(10);
  await Promise.all(
    (data ?? []).map(async (r) => {
      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${r.call_sid}.json`, {
          headers: { authorization: twilioAuth({ sid, token }) },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const c = (await res.json()) as { status?: string; duration?: string | null; end_time?: string | null };
        const status: CallStatus | null = fromTwilioStatus(c.status);
        if (!status || (status === r.status && !(isFinalStatus(status) && r.duration_s === null))) return;
        await db
          .from("voice_calls")
          .update({
            status,
            ...(isFinalStatus(status)
              ? { duration_s: c.duration ? Number(c.duration) : null, ended_at: c.end_time ? new Date(c.end_time).toISOString() : new Date().toISOString() }
              : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.id);
      } catch {
        // A slow or failed status check just leaves the row as it is until the next load.
      }
    }),
  );
}
