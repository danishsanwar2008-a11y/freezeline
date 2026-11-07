// Read-only snapshot of Phase 3 data for one replay hour (drip plans, queued texts, events, photo results).
// Usage: npm run db:status -- 2021-02-16T06:00
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const time = process.argv[2] ?? "2021-02-16T06:00";
const ts = `${time}:00-06:00`; // Feb 2021 Houston (CST)

type Q = ReturnType<ReturnType<typeof db.from>["select"]>;
async function count(table: string, filter: (q: Q) => Q = (q) => q) {
  const { count, error } = await filter(db.from(table).select("*", { count: "exact", head: true }));
  return error ? `ERROR: ${error.message}` : count;
}

async function main() {
  console.log(`Phase 3 tables`);
  console.log(`  ai_cache rows:      ${await count("ai_cache")}`);
  console.log(`  photo_checks rows:  ${await count("photo_checks")}`);
  console.log(`At ${time} (Houston)`);
  console.log(`  drip_plans:         ${await count("drip_plans", (q) => q.eq("plan_for", ts))}`);
  console.log(`    drip one tap:     ${await count("drip_plans", (q) => q.eq("plan_for", ts).eq("action", "drip"))}`);
  console.log(`    do not drip:      ${await count("drip_plans", (q) => q.eq("plan_for", ts).eq("action", "do_not_drip"))}`);
  console.log(`  outreach queued:    ${await count("outreach", (q) => q.eq("plan_for", ts).eq("status", "queued"))}`);
  console.log(`    simulated:        ${await count("outreach", (q) => q.eq("plan_for", ts).eq("simulated", true))}`);
  console.log(`  events:             ${await count("events", (q) => q.eq("occurred_at", ts))}`);
  const { data } = await db.from("outreach").select("home_id,message").eq("plan_for", ts).limit(2);
  for (const r of data ?? []) console.log(`  sample SMS ${r.home_id}: ${r.message}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
