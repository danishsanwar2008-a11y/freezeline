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
    .insert({ source: "demo", to_phone: "+17135550100", status: "in_progress", home_id: "heights-w589054579", mode: "storm", level: "High" })
    .select("id")
    .single();
  if (error || !row) throw new Error(`voice_calls: ${error?.message}${/voice_calls/.test(error?.message ?? "") ? " (run supabase/006_voice_calls.sql)" : ""}`);

  const home = encodeHousehold({
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
  const answers = hangAt ? ANSWERS.slice(0, hangAt) : ANSWERS;
  for (const said of answers) {
    console.log(`  you:   ${said}`);
    for (const line of says(await post("/voice/step", { CallSid: sid, SpeechResult: said }))) console.log(`  agent: ${line}`);
  }
  if (hangAt) console.log("  (hung up)");

  await new Promise((r) => setTimeout(r, 2500)); // the agent posts its reports in the background
  const { data } = await db.from("voice_calls").select("status,finished,assessment,closing,questions_answered,answers").eq("id", row.id).single();
  console.log("\nSaved in Supabase:", JSON.stringify(data, null, 2));
  if (!data?.questions_answered)
    console.log("\nNothing was saved: check VOICE_RESULT_URL and VOICE_SHARED_SECRET in the agent's settings, and that npm run dev is running.");
  if (keep) console.log(`\nKept: it shows on /console/calls as a demo call (id ${row.id}).`);
  else await db.from("voice_calls").delete().eq("id", row.id);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
