// Rehearses a whole call WITHOUT a phone or Twilio: plays Twilio's part against your local voice agent
// (http://localhost:8080) with typed answers, then shows what was saved in Supabase (voice_calls) by
// /api/voice/result. Tests the full save path: agent -> web app -> database.
//
// Needs: the agent running (voice\start.ps1, or voice/serve.sh) with VOICE_RESULT_URL and
// VOICE_SHARED_SECRET set, and `npm run dev`. No Twilio account or tunnel needed.
//
//   npm run calls:rehearse                         a full call ("can do the steps")
//   npm run calls:rehearse -- --crew               says it can't do the steps (Needs a crew)
//   npm run calls:rehearse -- --hangup 3           hangs up after 3 answers
//   npm run calls:rehearse -- --keep               keep the row (shows on /console/calls as a demo call)
//   npm run calls:rehearse -- --survey             the pre-survey call (research doc's 7 questions, worst
//                                                  answers on a 19F night -> High, neighbor + emergency contact)
//   npm run calls:rehearse -- --text               use DEMO_CALL_TO as the phone, so the checklist text
//                                                  really goes out (SMS_PROVIDER) when the call finishes.
//                                                  Without it the fictional 555-0100 number gets no text.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { encodeHousehold } from "../src/lib/voiceCalls";

config({ path: ".env.local" });
config(); // .env as a fallback (macOS setups)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const AGENT = process.env.REHEARSE_AGENT_URL ?? "http://localhost:8080";
const args = process.argv.slice(2);
const crew = args.includes("--crew");
const keep = args.includes("--keep");
const hangAt = args.includes("--hangup") ? Number(args[args.indexOf("--hangup") + 1]) : null;
const textMe = args.includes("--text");
const survey = args.includes("--survey");
// Identity, then the research doc's 7 questions: garage, copper, 1965, bare, can't turn the
// shutoff, burst before, nobody home.
// --neighbor yes|no: the household has an emergency contact on file ("Rehearsal Contact"), so after
// "I can't turn it" the agent asks whether a neighbor can help, and this is the answer. Without it,
// nobody is on file: a crew is assigned during the call.
const neighborAt = args.indexOf("--neighbor");
const neighbor = neighborAt >= 0 ? args[neighborAt + 1] : null;
const neighborAnswer = neighbor ? [neighbor === "yes" ? "Yes, please call them" : "No, there's nobody"] : [];
// The demo call asks only the doc's questions 3-6 (voice/survey.py DEMO_QUESTION_KEYS); with
// VOICE_FULL_SURVEY=1 the agent asks all seven, and so does this rehearsal.
const SURVEY_ANSWERS =
  process.env.VOICE_FULL_SURVEY?.trim() === "1"
    ? ["Yes", "They run through the garage", "Copper", "It was built in 1965", "No, they're bare", "I know where it is but I can't turn it", ...neighborAnswer, "Yes, one burst last winter", "Yes, we'll be home"]
    : ["Yes", "It was built in 1965", "No, they're bare", "I know where it is but I can't turn it", ...neighborAnswer, "Yes, one burst last winter"];
const PLAN_FOR = "2021-02-16T12:00:00-06:00"; // Feb 16 noon: crews free (see DEMO_REPLAY_TIME)
const startedAt = new Date().toISOString();
const phone = textMe ? (process.env.DEMO_CALL_TO ?? "").trim() : "+17135550100";
if (textMe && !/^\+1[2-9]\d{9}$/.test(phone)) {
  console.error("--text needs DEMO_CALL_TO=+1XXXXXXXXXX (your phone) in .env.local");
  process.exit(1);
}

// Identity, then the 7 questions (outdoor faucet included).
const ANSWERS = crew
  ? ["Yes", "No, I can't do that", "Yes, my mother is 80", "No", "Yes", "No", "Yes", "No"]
  : ["Yes", "Yes", "No", "No", "Yes, it's in the garage", "Yes", "Yes, we have heat", "No"];

async function main() {
  try {
    await fetch(`${AGENT}/health`, { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new Error(`The voice agent isn't answering at ${AGENT}. Start it (voice\\start.ps1) first.`);
  }
  const { data: row, error } = await db
    .from("voice_calls")
    .insert({ source: "demo", to_phone: phone, status: "in_progress", home_id: "heights-w589054579", mode: survey ? "survey" : "storm", ...(survey ? { plan_for: PLAN_FOR } : { level: "High" }) })
    .select("id")
    .single();
  if (error || !row) throw new Error(`voice_calls: ${error?.message}${/voice_calls/.test(error?.message ?? "") ? " (run supabase/006_voice_calls.sql)" : ""}`);

  const home = encodeHousehold(survey ? {
    call_id: row.id,
    engine: "gather",
    mode: "survey",
    home_id: "heights-w589054579",
    lang: "en",
    temp: 19,
    ...(neighbor ? { emergency_name: "Rehearsal Contact" } : {}),
    first_name: "Rehearsal",
    street: "Harvard St",
  } : {
    call_id: row.id,
    engine: "gather",
    home_id: "heights-w589054579",
    lang: "en",
    level: "High",
    temp: 13,
    hours: 19,
    first_name: "Rehearsal",
    street: "Harvard St",
    faucet: true,
    steps: ["Close your crawlspace vents.", "Open the cabinet under your kitchen sink.", "Drip only your kitchen tap."],
  });
  const sid = `CArehearse${Date.now()}`;
  const post = (path: string, body: Record<string, string>) =>
    fetch(`${AGENT}${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) }).then((r) => r.text());
  const says = (xml: string) => [...xml.matchAll(/<Say[^>]*>([^<]*)<\/Say>/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&#x27;|&apos;/g, "'"));

  for (const line of says(await post(`/voice/start?home=${home}`, { CallSid: sid }))) console.log(`  agent: ${line}`);
  const script = survey ? SURVEY_ANSWERS : ANSWERS;
  const answers = hangAt ? script.slice(0, hangAt) : script;
  for (const said of answers) {
    console.log(`  you:   ${said}`);
    for (const line of says(await post("/voice/step", { CallSid: sid, SpeechResult: said }))) console.log(`  agent: ${line}`);
  }
  if (hangAt) console.log("  (hung up)");

  await new Promise((r) => setTimeout(r, 2500)); // the agent posts its reports in the background
  const { data } = await db.from("voice_calls").select("status,finished,level,assessment,closing,questions_answered,answers").eq("id", row.id).single();
  console.log("\nSaved in Supabase:", JSON.stringify(data, null, 2));
  // The checklist text, when supabase/007_call_texts.sql has added its columns.
  const sms = await db.from("voice_calls").select("sms_status,sms_body,sms_error").eq("id", row.id).single();
  if (!sms.error) console.log("\nChecklist text:", JSON.stringify(sms.data, null, 2));
  else if (textMe) console.log("\nChecklist text: not recorded (run supabase/007_call_texts.sql); check your phone.");
  if (!data?.questions_answered)
    console.log("\nNothing was saved: check VOICE_RESULT_URL and VOICE_SHARED_SECRET in the agent's settings, and that npm run dev is running.");
  if (keep) console.log(`\nKept: it shows on /console/calls as a demo call (id ${row.id}).`);
  else {
    // Remove what the rehearsal made: its call row, any emergency-contact call row it started, and a
    // crew it assigned (shared database: teammates' maps would show it).
    const follow = await db.from("voice_calls").select("followup,crew_name").eq("id", row.id).maybeSingle();
    if (!follow.error) console.log(`\nFollow-up: ${JSON.stringify(follow.data)}`);
    await db.from("voice_calls").delete().eq("parent_call_id", row.id);
    await db.from("voice_calls").delete().eq("id", row.id);
    if (survey) {
      const gone = await db
        .from("crew_assignments")
        .delete()
        .eq("home_id", "heights-w589054579")
        .eq("plan_for", PLAN_FOR)
        .like("reason", "Pre-survey call:%")
        .gte("created_at", startedAt)
        .select("id");
      await db.from("events").delete().eq("home_id", "heights-w589054579").eq("type", "crew_assigned").gte("created_at", startedAt);
      if (gone.data?.length) console.log("Removed the rehearsal's crew assignment.");
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
