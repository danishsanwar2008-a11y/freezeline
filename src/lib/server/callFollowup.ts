import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nearestCrew } from "@/lib/household";
import { signupForPhone } from "@/lib/signups";
import { sendSms } from "@/lib/sms";
import { contactHelpingText, contactUnavailableText, toContactText } from "@/lib/surveyTexts";
import { encodeHousehold, followupWording, fromTwilioStatus, type CallHousehold } from "@/lib/voiceCalls";
import { getCity, toTimestamp } from "./cityState";
import { getCrews, loadCrewJobs } from "./outreachState";

// What happens after a pre-survey call that needs someone at the house (voice/survey.py followup()):
//
//   can't reach the shutoff --"is there a neighbor who can help? I can call {contact}"--> yes: call
//   the emergency contact (placeContactCall) -> they say yes: they get the address by text
//                                             -> no / no answer / hang-up: a crew (settleContactCall)
//                            --> no, or no contact on file: a crew now, during the call (assignCrewForCall)
//   nobody home for 3 days --> the emergency contact, else a crew.
//
// A crew is "on the way" only once a crew_assignments row says `assigned` (the honesty rule): the
// nearest free crew in the home's own area, the same rule the console agent uses. All of an area's
// crews busy -> a `proposed` row puts the home in that area's queue, and the household hears
// "requested". Followed up in voice_calls.followup / followup_status / crew_name (008_call_followup.sql).

/** The replay hour a call belongs to when it has none: Feb 16, noon, still deep in the freeze, and
 *  (unlike 2 AM-10 AM, where earlier Run agent passes have every crew busy) with crews free. */
export const DEMO_REPLAY_TIME = "2021-02-16T12:00";

/** voice_calls.plan_for (timestamptz) -> the replay time "2021-02-16T06:00" (Houston, UTC-6). */
export function replayTime(planFor: string | null | undefined): string {
  const ms = planFor ? Date.parse(planFor) : NaN;
  return Number.isFinite(ms) ? new Date(ms - 6 * 3600 * 1000).toISOString().slice(0, 16) : DEMO_REPLAY_TIME;
}

interface CallRow {
  id: string;
  home_id: string | null;
  plan_for: string | null;
  to_phone: string;
  lang: string;
  source: string;
}

const FICTIONAL = /^\+1\d{3}55501\d{2}$/;
async function text(to: string, body: string, what: string): Promise<void> {
  if (FICTIONAL.test(to)) return; // the project's 555-01XX numbers never get a real text
  const r = await sendSms(to, body).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  if (!r.ok) console.warn(`[call follow-up] ${what} text not sent: ${"error" in r ? r.error : ""}`);
}

/** Why the house needs someone, in officials' words, from the call's answers. */
export function whyHelp(answers: Record<string, unknown>): string {
  const why = [
    answers.shutoff_access === "cannot" ? "can't reach the water shutoff" : null,
    answers.someone_home === false ? "nobody home for 3 days" : null,
  ].filter(Boolean);
  return why.join(", ") || "needs hands-on help";
}

/**
 * Assign the nearest free crew in the home's own area to this call's home, for the call's replay
 * hour. Returns the crew's name, or null when all of that area's crews are busy (the home then waits
 * in the area's queue). Calling it again for the same home and hour returns the same crew.
 */
export async function assignCrewForCall(db: SupabaseClient, row: Pick<CallRow, "home_id" | "plan_for">, why: string): Promise<string | null> {
  if (!row.home_id) return null;
  const city = await getCity();
  const idx = city.byId.get(row.home_id);
  if (idx === undefined) return null;
  const home = city.homes[idx];
  const time = replayTime(row.plan_for);
  const planFor = toTimestamp(time);
  const crews = await getCrews();

  const { data: existing } = await db
    .from("crew_assignments")
    .select("crew_id,status")
    .eq("home_id", home.id)
    .eq("plan_for", planFor)
    .maybeSingle();
  if (existing?.status === "assigned" && existing.crew_id !== null) return crews.find((c) => c.id === existing.crew_id)?.name ?? null;

  const jobs = await loadCrewJobs(city, time, crews);
  const free = crews.filter((c) => !jobs.active.some((j) => j.crew_id === c.id) && !jobs.heldThisHour.has(c.id));
  const crew = nearestCrew(home, free);
  const reason = `Pre-survey call: ${why}`;
  const { error } = await db.from("crew_assignments").upsert(
    { crew_id: crew?.id ?? null, home_id: home.id, plan_for: planFor, status: crew ? "assigned" : "proposed", reason, simulated: true, updated_at: new Date().toISOString() },
    { onConflict: "home_id,plan_for" },
  );
  if (error) {
    // Another home took this crew in the same instant (one home per crew per hour): no crew claimed.
    console.warn(`[call follow-up] crew not assigned: ${error.message}`);
    return null;
  }
  if (crew)
    await db.from("events").insert({
      type: "crew_assigned",
      home_id: home.id,
      occurred_at: planFor,
      payload: { message: `Assigned ${crew.name} → home on ${home.street} (${why}).`, by: "voice call", crew_id: crew.id },
      simulated: true,
    });
  return crew?.name ?? null;
}

/** Record a crew outcome on the household's call row. */
async function saveCrew(db: SupabaseClient, callId: string, crew: string | null, why: string): Promise<void> {
  await db
    .from("voice_calls")
    .update({
      followup_status: crew ? "crew_assigned" : "crew_requested",
      crew_name: crew,
      followup: crew ? followupWording.crewAssigned(crew, why) : followupWording.crewRequested(why),
      updated_at: new Date().toISOString(),
    })
    .eq("id", callId);
}

/** Mid-call (POST /api/voice/crew): assign a crew for this household's call, once. */
export async function crewForCall(db: SupabaseClient, callId: string, reasons?: string[]): Promise<{ crew: string | null } | { error: string; status: number }> {
  const { data: row, error } = await db.from("voice_calls").select("id,home_id,plan_for,mode,source,crew_name,answers").eq("id", callId).maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!row) return { error: "Unknown call_id.", status: 404 };
  if (row.mode !== "survey" || row.source === "sample") return { error: "Crews are assigned only for pre-survey demo or live calls.", status: 400 };
  if (row.crew_name) return { crew: row.crew_name };
  const saved = (row.answers ?? {}) as Record<string, unknown>;
  const why = whyHelp({
    ...saved,
    ...(reasons?.includes("shutoff") ? { shutoff_access: "cannot" } : {}),
    ...(reasons?.includes("away") ? { someone_home: false } : {}),
  });
  const crew = await assignCrewForCall(db, row, why);
  await saveCrew(db, row.id, crew, why);
  return { crew };
}

/** The Twilio settings for a call, or what's missing. */
function twilio(): { sid: string; token: string; host: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const host = process.env.PUBLIC_HOSTNAME?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return sid && token && host ? { sid, token, host } : null;
}

/**
 * Right after the household's call (its final report said followup "contact"): call the emergency
 * contact from their sign-up. Nobody on file, or Twilio refuses the call: a crew instead, right away.
 */
export async function placeContactCall(db: SupabaseClient, parent: CallRow, reasons: string[], answers: Record<string, unknown>): Promise<string> {
  const why = whyHelp(answers);
  const signup = await signupForPhone(db, parent.to_phone);
  const fallback = async (reason: string) => {
    const crew = await assignCrewForCall(db, parent, why);
    await saveCrew(db, parent.id, crew, why);
    await text(parent.to_phone, contactUnavailableText(signup?.emergencyName ?? "your emergency contact", crew, parent.lang), "crew fallback");
    return `${reason}; ${crew ? `${crew} assigned` : "crew requested"}`;
  };
  if (!signup?.emergencyName || !signup.emergencyPhone) return fallback("no emergency contact on the sign-up");
  const tw = twilio();
  if (!tw) return fallback("Twilio isn't set up for the contact call");

  const { data: row, error } = await db
    .from("voice_calls")
    .insert({
      source: parent.source === "live" ? "live" : "demo",
      simulated: false,
      home_id: parent.home_id,
      plan_for: parent.plan_for,
      to_phone: signup.emergencyPhone,
      lang: parent.lang === "es" ? "es" : "en",
      mode: "contact",
      parent_call_id: parent.id,
      status: "queued",
    })
    .select("id")
    .single();
  if (error || !row) return fallback(`couldn't record the contact call (${error?.message ?? "no row"}; run supabase/008_call_followup.sql)`);

  const household: CallHousehold = {
    call_id: row.id,
    engine: "gather",
    mode: "contact",
    lang: parent.lang === "es" ? "es" : "en",
    contact_name: signup.emergencyName,
    homeowner: signup.firstName || process.env.DEMO_CALL_NAME?.trim() || "",
    reasons,
  };
  const form = new URLSearchParams({
    To: signup.emergencyPhone,
    Url: `https://${tw.host}/voice/start?home=${encodeHousehold(household)}`,
    StatusCallback: `https://${tw.host}/voice/status?call_id=${row.id}`,
  });
  // A Twilio trial pairs each verified phone with its own trial number: EMERGENCY_CALL_FROM is the
  // one paired with the emergency contact's phone (else the household's From number is tried).
  const from = process.env.EMERGENCY_CALL_FROM?.trim() || process.env.TWILIO_PHONE_NUMBER?.trim();
  if (from) form.set("From", from);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${tw.sid}/Calls.json`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${tw.sid}:${tw.token}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number; message?: string };
    if (!res.ok || !json.sid) {
      const reason = `Twilio refused the contact call${json.code ? ` (${json.code})` : ""}: ${json.message ?? res.statusText}`;
      await db.from("voice_calls").update({ status: "failed", error: reason, updated_at: new Date().toISOString() }).eq("id", row.id);
      return fallback(reason);
    }
    await db.from("voice_calls").update({ call_sid: json.sid, status: fromTwilioStatus(json.status) ?? "queued", updated_at: new Date().toISOString() }).eq("id", row.id);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await db.from("voice_calls").update({ status: "failed", error: reason, updated_at: new Date().toISOString() }).eq("id", row.id);
    return fallback(reason);
  }
  await db
    .from("voice_calls")
    .update({ followup_status: "calling_contact", followup: followupWording.callingContact(signup.emergencyName), updated_at: new Date().toISOString() })
    .eq("id", parent.id);
  return `calling emergency contact ${signup.emergencyName}`;
}

/**
 * The emergency-contact call is over (its final answer, or Twilio's "ended" notice: no answer, busy,
 * a hang-up). Yes -> the contact gets the address, the household hears they're helping. Anything
 * else -> a crew. Runs once per household call, whichever signal arrives first.
 */
export async function settleContactCall(db: SupabaseClient, contactCallId: string, twilioStatus?: string): Promise<string> {
  const { data: c } = await db.from("voice_calls").select("id,parent_call_id,answers,finished,to_phone,lang,status").eq("id", contactCallId).maybeSingle();
  if (!c?.parent_call_id) return "not an emergency-contact call";
  const final = fromTwilioStatus(twilioStatus);
  if (final && final !== c.status) await db.from("voice_calls").update({ status: final, updated_at: new Date().toISOString() }).eq("id", c.id);

  const helping = (c.answers as Record<string, unknown> | null)?.can_help === true;
  // Claim the household's follow-up: only the first signal moves it on from "calling_contact".
  const { data: claimed } = await db
    .from("voice_calls")
    .update({ followup_status: helping ? "contact_helping" : "crew_requested", updated_at: new Date().toISOString() })
    .eq("id", c.parent_call_id)
    .eq("followup_status", "calling_contact")
    .select("id,home_id,plan_for,to_phone,lang,source,answers");
  const parent = claimed?.[0];
  if (!parent) return "already settled";

  const signup = await signupForPhone(db, parent.to_phone);
  const contact = signup?.emergencyName ?? "your emergency contact";
  if (helping) {
    await db.from("voice_calls").update({ followup: followupWording.contactHelping(signup?.emergencyName ?? null) }).eq("id", parent.id);
    await text(parent.to_phone, contactHelpingText(contact, parent.lang), "household (contact helping)");
    await text(c.to_phone, toContactText(signup?.firstName || "your neighbor", signup?.address || "the address on their sign-up", c.lang), "emergency contact");
    return `${contact} is helping`;
  }
  const why = whyHelp((parent.answers ?? {}) as Record<string, unknown>);
  const crew = await assignCrewForCall(db, parent, why);
  await saveCrew(db, parent.id, crew, why);
  await text(parent.to_phone, contactUnavailableText(contact, crew, parent.lang), "household (crew instead)");
  return crew ? `${crew} assigned` : "crew requested";
}
