// Matches real sign-ups' addresses to homes on the map (OpenStreetMap Nominatim lookup, 1 per second).
// By default only sign-ups still "pending" (the lookup was busy or failed at sign-up time).
// Usage: npm run registrations:match            pending sign-ups only
//        npm run registrations:match -- --all   look up every real sign-up again
// Placeholder (sample) sign-ups are never looked up: they were linked to their home when generated.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { lookupAndMatch, matchColumns } from "../src/lib/nominatim";
import { MATCH_LABEL, type MatchStatus } from "../src/lib/addressMatch";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // scripts only, never NEXT_PUBLIC_
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const all = process.argv.includes("--all");

async function main() {
  let q = supabase.from("registrations").select("id,address_line1,city,zip").eq("source", "signup").order("created_at");
  if (!all) q = q.eq("match_status", "pending");
  const { data, error } = await q;
  if (error) throw new Error(`registrations: ${error.message}${/match_status/.test(error.message) ? " (run supabase/005_registration_matching.sql first)" : ""}`);
  if (!data?.length) return console.log(all ? "No real sign-ups yet." : "No pending sign-ups: every real sign-up has been looked up.");

  const tally: Partial<Record<MatchStatus, number>> = {};
  for (const [i, r] of data.entries()) {
    const m = await lookupAndMatch({ addressLine1: r.address_line1, city: r.city, zip: r.zip }, { wait: true });
    const { error: e } = await supabase.from("registrations").update({ ...matchColumns(m), updated_at: new Date().toISOString() }).eq("id", r.id);
    if (e) throw new Error(`updating sign-up: ${e.message}`);
    tally[m.status] = (tally[m.status] ?? 0) + 1;
    process.stdout.write(`\r${i + 1} of ${data.length} looked up`);
  }
  console.log(`\n${Object.entries(tally).map(([s, n]) => `${MATCH_LABEL[s as MatchStatus]}: ${n}`).join(" · ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
