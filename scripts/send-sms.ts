// Text households through Twilio, using the numbers collected on /register.
//
//   npx tsx scripts/send-sms.ts --all "Pressure is dropping. Drip one faucet tonight."
//   npx tsx scripts/send-sms.ts --all --send "..."            actually sends
//   npx tsx scripts/send-sms.ts --to +18328009082 --send "..."
//
// Nothing is sent without --send: the default prints exactly who would receive what.
// Only households that ticked the consent box are included.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { isUsMobile, sendSms, smsConfig } from "../src/lib/twilioSms";

config({ path: ".env.local" });
config(); // .env as the fallback; dotenv never overwrites a value that is already set

const argv = process.argv.slice(2);
const send = argv.includes("--send");
const all = argv.includes("--all");
const toAt = argv.indexOf("--to");
const single = toAt >= 0 ? argv[toAt + 1] : null;
const skip = toAt >= 0 ? toAt + 1 : -1;
const message = argv
  .filter((a, i) => i !== skip && !a.startsWith("--"))
  .join(" ")
  .trim();

const usage = () =>
  console.error(
    'Usage: npx tsx scripts/send-sms.ts --all "message" [--send]\n' +
      '       npx tsx scripts/send-sms.ts --to +1XXXXXXXXXX "message" [--send]',
  );

type Recipient = { phone: string; name: string | null };

async function consentedHouseholds(): Promise<Recipient[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("registrations")
    .select("phone, full_name")
    .eq("consent_texts_calls", true)
    .order("created_at", { ascending: true });
  if (error) {
    console.error(
      error.code === "42P01"
        ? "The registrations table does not exist yet: run supabase/004_registrations.sql"
        : `Supabase: ${error.message}`,
    );
    process.exit(1);
  }
  return (data ?? []).map((r: { phone: string; full_name: string | null }) => ({
    phone: r.phone,
    name: r.full_name,
  }));
}

async function main() {
  if (!message) return usage();
  if (!all && !single) return usage();

  if (!smsConfig()) {
    console.error("Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in .env.local or .env");
    process.exit(1);
  }

  const recipients: Recipient[] = all ? await consentedHouseholds() : [{ phone: single!.trim(), name: null }];
  if (recipients.length === 0) {
    console.log("No consented sign-ups to text yet.");
    return;
  }

  const bad = recipients.filter((r) => !isUsMobile(r.phone));
  if (bad.length > 0) {
    console.error(`Not US mobile numbers: ${bad.map((b) => b.phone).join(", ")}`);
    process.exit(1);
  }

  console.log(`${recipients.length} recipient(s):`);
  for (const r of recipients) console.log(`  ${r.phone}${r.name ? `  ${r.name}` : ""}`);
  console.log(`\nMessage: ${message}\n`);

  if (!send) {
    console.log("Dry run. Nothing was sent. Add --send to send these.");
    return;
  }

  let failed = 0;
  for (const r of recipients) {
    const out = await sendSms(r.phone, message);
    if (out.ok) console.log(`  sent   ${r.phone}  ${out.sid ?? ""}`);
    else {
      failed += 1;
      console.log(`  failed ${r.phone}  ${out.error ?? "unknown error"}`);
    }
    if (recipients.length > 1) await new Promise((done) => setTimeout(done, 250));
  }
  console.log(`\n${recipients.length - failed} sent, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
