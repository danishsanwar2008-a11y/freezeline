// Seeds PLACEHOLDER sign-ups (simulated) into the registrations table: 100 per area, each linked to a
// real OpenStreetMap home, with invented names, example.com emails and fictional 555-01XX numbers.
// Every row passes the same validation as the /register form. Safe to re-run: upserts on email.
// Real sign-ups (source = 'signup') are never touched.
// Usage: npm run seed:registrations   (reads .env.local; run supabase/004_registrations.sql and npm run seed first)
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { parseRegistration, toRow } from "../src/lib/registration";
import { generatePlaceholderRegistrations } from "../src/lib/seed/registrations";
import { generateHomes } from "../src/lib/seed/generate";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // scripts only, never NEXT_PUBLIC_
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  const homes = new Map(generateHomes().map((h) => [h.id, h]));
  const now = new Date().toISOString();
  let rows = generatePlaceholderRegistrations().map(({ homeId, input }) => {
    const r = parseRegistration(input);
    if (!r.ok) throw new Error(`placeholder for ${homeId} is invalid: ${JSON.stringify(r.errors)}`);
    return { ...toRow(r.data, { homeId, source: "placeholder", simulated: true }), updated_at: now };
  });

  // Never overwrite a real sign-up that happens to use a placeholder's email.
  const real = await supabase.from("registrations").select("email").eq("source", "signup").in("email", rows.map((r) => r.email));
  if (real.error && !/registrations|schema cache/i.test(real.error.message)) throw new Error(`registrations: ${real.error.message}`);
  const taken = new Set((real.data ?? []).map((r) => r.email as string));
  rows = rows.filter((r) => !taken.has(r.email));

  // Match columns (supabase/005_registration_matching.sql): placeholders are linked to their home directly.
  const withMatch = rows.map((r) => ({
    ...r,
    match_status: "placeholder",
    zone_id: homes.get(r.home_id!)?.zone_id ?? null,
    match_distance_m: 0,
    matched_at: now,
  }));
  let batch: object[] = withMatch;
  const probe = await supabase.from("registrations").select("match_status").limit(1);
  if (probe.error?.code === "42703") {
    console.warn("Match columns missing: run supabase/005_registration_matching.sql, then seed again to fill them.");
    batch = rows;
  }

  for (let i = 0; i < batch.length; i += 200) {
    const { error } = await supabase.from("registrations").upsert(batch.slice(i, i + 200), { onConflict: "email" });
    if (error) {
      const hint = /registrations|relation|schema cache/i.test(error.message) ? " (run supabase/004_registrations.sql first)" : "";
      const homes = /home_id|foreign key/i.test(error.message) ? " (run npm run seed first)" : "";
      throw new Error(`registrations: ${error.message}${hint}${homes}`);
    }
  }

  const [all, placeholders] = await Promise.all([
    supabase.from("registrations").select("*", { count: "exact", head: true }),
    supabase.from("registrations").select("*", { count: "exact", head: true }).eq("source", "placeholder"),
  ]);
  console.log(
    `Seeded ${rows.length} placeholder sign-ups (simulated)${taken.size ? `; skipped ${taken.size} whose email a real sign-up uses` : ""}. Table now holds ${all.count} sign-ups: ` +
      `${placeholders.count} placeholder, ${(all.count ?? 0) - (placeholders.count ?? 0)} real.`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
