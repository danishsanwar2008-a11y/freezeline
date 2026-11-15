// The whole demo from the terminal: the agent calls a teammate's phone (DEMO_CALL_TO) and runs the
// pre-survey from the research doc: the 7 questions first, then the home's priority (weighted answers
// + the forecast) and its next steps, all saved to Supabase (shows on /console/calls); when the call
// ends the app texts that phone the doc's text for its priority (SMS_PROVIDER, e.g. TextBee).
//
//   npm run call:me                    call DEMO_CALL_TO, forecast 19F (very cold)
//   npm run call:me -- --temp 25       another forecast: >= 32 mild, 20-31 cold, < 20 very cold
//   npm run call:me -- --hour 2021-02-15T12:00   the storm hour a crew is assigned at (default Feb 16 noon)
//   npm run call:me -- --dry-run       check everything, place no call (makes and deletes a test row)
//
// Needs running: the agent (voice\start.ps1), the tunnel (voice\tunnel.ps1) and `npm run dev`
// (it saves the answers and sends the text). Reads .env.local.
// Trial Twilio accounts can only call verified phones (Twilio console -> Verified Caller IDs; free).
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { encodeHousehold, type CallHousehold } from "../src/lib/voiceCalls";
import { signupForPhone } from "../src/lib/signups";

// The replay hour a crew (if one is needed) is assigned at: Feb 16, noon by default (2 AM-10 AM
// already has every crew busy from earlier Run agent passes). `-- --hour 2021-02-15T12:00` picks another.
// It shows driving on the console map at that hour. Same default as DEMO_REPLAY_TIME in callFollowup.ts.
const hourAt = process.argv.indexOf("--hour");
const HOUR = hourAt >= 0 ? process.argv[hourAt + 1] : "2021-02-16T12:00";
const PLAN_FOR = `${HOUR}:00-06:00`;

config({ path: ".env.local" });
config();

const env = (k: string) => (process.env[k] ?? "").trim();
const dryRun = process.argv.includes("--dry-run");
const tempAt = process.argv.indexOf("--temp");
const TEMP_F = tempAt >= 0 ? Number(process.argv[tempAt + 1]) : 19;
const HOME_ID = "heights-w589054579";

function fail(msg: string): never {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

async function reachable(url: string, init?: RequestInit): Promise<number | null> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(6000), headers: { "ngrok-skip-browser-warning": "1", ...(init?.headers ?? {}) } });
    return r.status;
  } catch {
    return null;
  }
}

async function main() {
  const to = env("DEMO_CALL_TO");
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const host = env("PUBLIC_HOSTNAME").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const resultUrl = env("VOICE_RESULT_URL");
  if (!/^\+1[2-9]\d{9}$/.test(to)) fail("Set DEMO_CALL_TO=+1XXXXXXXXXX (your phone) in .env.local.");
  if (!Number.isFinite(TEMP_F) || TEMP_F < -40 || TEMP_F > 110) fail("--temp needs a forecast in °F, e.g. --temp 25.");
  const missing = Object.entries({ TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, PUBLIC_HOSTNAME: host, VOICE_RESULT_URL: resultUrl, VOICE_SHARED_SECRET: env("VOICE_SHARED_SECRET") })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) fail(`Set ${missing.join(", ")} in .env.local.`);
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");

  // Everything the call needs, checked before the phone rings.
  if ((await reachable(`https://${host}/health`)) !== 200)
    fail(`The agent isn't reachable at https://${host}. Start voice\\start.ps1 and voice\\tunnel.ps1 first.`);
  const appStatus = await reachable(resultUrl, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (appStatus === null) fail(`The web app isn't answering at ${resultUrl}. Start it: npm run dev (it saves the answers and sends the text).`);
  const band = TEMP_F >= 32 ? "mild" : TEMP_F >= 20 ? "cold" : "very cold";
  console.log(`  agent + tunnel: ok   web app: ok   texts: ${env("SMS_PROVIDER") || "twilio"}   forecast: ${TEMP_F}°F (${band})`);

  const db = createClient(url, key, { auth: { persistSession: false } });
  // Your sign-up on /register: the greeting name, and the emergency contact the agent offers to call
  // when you can't reach your water shutoff (or nobody will be home).
  const signup = await signupForPhone(db, to);
  const firstName = env("DEMO_CALL_NAME") || signup?.firstName || "";
  const emergency = signup?.emergencyName && signup.emergencyPhone ? signup.emergencyName : "";
  console.log(
    signup
      ? `  sign-up: found   emergency contact: ${emergency ? `${emergency} (${signup.emergencyPhone!.slice(0, 5)}...${signup.emergencyPhone!.slice(-4)})` : "none on file -> a crew instead"}`
      : "  sign-up: none for this phone (sign up at /register to add an emergency contact) -> a crew instead",
  );
  const { data: row, error } = await db
    .from("voice_calls")
    .insert({ source: "demo", simulated: false, home_id: HOME_ID, plan_for: PLAN_FOR, to_phone: to, lang: "en", mode: "survey", status: "queued" })
    .select("id")
    .single();
  if (error || !row) fail(`Couldn't create the call record: ${error?.message}`);

  const household: CallHousehold = {
    call_id: row.id,
    engine: "gather",
    mode: "survey",
    home_id: HOME_ID,
    lang: "en",
    temp: TEMP_F,
    ...(firstName ? { first_name: firstName } : {}),
    ...(emergency ? { emergency_name: emergency } : {}),
    street: "Harvard St",
  };

  if (dryRun) {
    await db.from("voice_calls").delete().eq("id", row.id);
    console.log(`  Dry run: everything is ready. No call placed (would call ${to.slice(0, 5)}...${to.slice(-4)}).`);
    return;
  }

  const form = new URLSearchParams({ To: to, Url: `https://${host}/voice/start?home=${encodeHousehold(household)}` });
  if (env("TWILIO_PHONE_NUMBER")) form.set("From", env("TWILIO_PHONE_NUMBER")); // trial: no From, Twilio's shared number
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number; message?: string };
  if (!res.ok || !json.sid) {
    const reason = `Twilio refused the call${json.code ? ` (${json.code})` : ""}: ${json.message ?? res.statusText}`;
    await db.from("voice_calls").update({ status: "failed", error: reason, updated_at: new Date().toISOString() }).eq("id", row.id);
    const hint =
      json.code === 21219 || json.code === 21608
        ? "\n  This phone isn't verified on the Twilio trial. Twilio console -> Phone Numbers -> Verified Caller IDs -> add it (free)."
        : json.code === 20003
          ? "\n  The Twilio Account SID or Auth Token is wrong."
          : "";
    fail(reason + hint);
  }
  await db.from("voice_calls").update({ call_sid: json.sid, updated_at: new Date().toISOString() }).eq("id", row.id);
  console.log(`  Calling ${to.slice(0, 5)}...${to.slice(-4)} (call ${json.sid}). Answer your phone.`);
  console.log("  7 questions, then your priority. Answers show on /console/calls as you speak; the text arrives when the call ends.");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
