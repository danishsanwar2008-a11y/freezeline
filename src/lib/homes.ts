import "server-only";
import { getSupabaseAdmin } from "./server/supabaseAdmin";
import { getSupabase } from "./supabase";
import type { ConsoleHome } from "./replay";
import type { PlannerZone } from "./planner";

export interface ConsoleZone extends PlannerZone {
  center_lat: number;
  center_lng: number;
}

/** Pressure zones (simulated) with base pressure and center point. */
export async function fetchConsoleZones(): Promise<ConsoleZone[]> {
  const { data, error } = await (getSupabaseAdmin() ?? getSupabase())
    .from("zones")
    .select("id,name,neighborhood,base_pressure_psi,center_lat,center_lng")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((z) => ({ ...z, base_pressure_psi: Number(z.base_pressure_psi) })) as ConsoleZone[];
}

const COLUMNS =
  "id,label,neighborhood,zone_id,lat,lng,street,year_built,foundation,exterior_wall_pipes,attic_or_crawlspace_pipes,insulation,outdoor_faucets,has_faucet_shutoff,elderly,mobility_limited,lives_alone";
const PAGE = 1000; // Supabase returns at most 1,000 rows per request by default

/**
 * All homes, read on the server with the service role. Homes carry household details
 * (sample), so 003_phase35.sql removes anon access to this table.
 */
export async function fetchConsoleHomes(): Promise<ConsoleHome[]> {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing on the server.");
  const all: ConsoleHome[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("homes").select(COLUMNS).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`${error.message}${/column/i.test(error.message) ? " (run supabase/003_phase35.sql, then npm run seed)" : ""}`);
    all.push(...((data ?? []) as unknown as ConsoleHome[]));
    if (!data || data.length < PAGE) return all;
  }
}
