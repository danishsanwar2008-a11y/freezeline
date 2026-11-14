// Seeds SAMPLE calls (simulated model data) into voice_calls for the officials' Calls page.
// Replaces the previous sample rows only; demo calls (real calls to a teammate's phone) are never touched.
// Usage: npm run seed:calls   (reads .env.local; run supabase/006_voice_calls.sql and npm run seed first)
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { generateSampleCalls } from "../src/lib/seed/calls";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // scripts only, never NEXT_PUBLIC_
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  const rows = generateSampleCalls();
  const del = await supabase.from("voice_calls").delete().eq("source", "sample");
  if (del.error) {
    const hint = /voice_calls|schema cache/i.test(del.error.message) ? " (run supabase/006_voice_calls.sql first)" : "";
    throw new Error(`voice_calls: ${del.error.message}${hint}`);
  }
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from("voice_calls").insert(rows.slice(i, i + 100));
    if (error) throw new Error(`voice_calls: ${error.message}${/home_id|foreign key/i.test(error.message) ? " (run npm run seed first)" : ""}`);
  }
  const [all, demo] = await Promise.all([
    supabase.from("voice_calls").select("*", { count: "exact", head: true }),
    supabase.from("voice_calls").select("*", { count: "exact", head: true }).neq("source", "sample"),
  ]);
  console.log(`Seeded ${rows.length} sample calls (simulated). Table now holds ${all.count} calls: ${demo.count} demo, ${(all.count ?? 0) - (demo.count ?? 0)} sample.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
