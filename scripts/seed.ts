// Seeds SIMULATED zones + homes into Supabase. Safe to re-run (upserts on id).
// Usage: npm run seed   (reads .env.local)
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
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + batch), { onConflict: "id" });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function main() {
  await upsert("zones", generateZones());
  await upsert("homes", generateHomes());

  const [zones, homes] = await Promise.all([
    supabase.from("zones").select("*", { count: "exact", head: true }),
    supabase.from("homes").select("*", { count: "exact", head: true }),
  ]);
  console.log(`Seeded (simulated): ${zones.count} zones, ${homes.count} homes.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
