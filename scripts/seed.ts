// Seeds zones + homes into Supabase. Homes are REAL OpenStreetMap footprints (data/osm-homes.json)
// with SIMULATED details. Safe to re-run: upserts on id, then removes homes no longer in the set
// (their test drip plans, texts, calls and photo results go with them via ON DELETE CASCADE).
// Usage: npm run seed   (reads .env.local; run supabase/003_phase35.sql first)
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { generateHomes, generateZones } from "../src/lib/seed/generate";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // scripts only, never NEXT_PUBLIC_
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function upsert(table: string, rows: object[], batch = 500) {
  for (let i = 0; i < rows.length; i += batch) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + batch), { onConflict: "id" });
    if (error) throw new Error(`${table}: ${error.message}${/column/i.test(error.message) ? " (run supabase/003_phase35.sql first)" : ""}`);
  }
}

async function existingHomeIds(): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("homes").select("id").order("id").range(from, from + 999);
    if (error) throw new Error(`homes: ${error.message}`);
    ids.push(...(data ?? []).map((r) => r.id as string));
    if (!data || data.length < 1000) return ids;
  }
}

async function main() {
  const homes = generateHomes();
  await upsert("zones", generateZones());
  await upsert("homes", homes);

  const keep = new Set(homes.map((h) => h.id));
  const stale = (await existingHomeIds()).filter((id) => !keep.has(id));
  for (let i = 0; i < stale.length; i += 200) {
    const { error } = await supabase.from("homes").delete().in("id", stale.slice(i, i + 200));
    if (error) throw new Error(`removing old homes: ${error.message}`);
  }

  const [zones, total] = await Promise.all([
    supabase.from("zones").select("*", { count: "exact", head: true }),
    supabase.from("homes").select("*", { count: "exact", head: true }),
  ]);
  console.log(`Seeded: ${zones.count} zones, ${total.count} homes (real OpenStreetMap footprints, simulated details).`);
  if (stale.length) console.log(`Removed ${stale.length} homes no longer in the set (old sample homes).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
