import { getSupabase } from "./supabase";
import type { ConsoleHome } from "./replay";
import type { PlannerZone } from "./planner";

export interface ConsoleZone extends PlannerZone {
  center_lat: number;
  center_lng: number;
}

/** Pressure zones (simulated) with base pressure and center point. */
export async function fetchConsoleZones(): Promise<ConsoleZone[]> {
  const { data, error } = await getSupabase()
    .from("zones")
    .select("id,name,neighborhood,base_pressure_psi,center_lat,center_lng")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((z) => ({ ...z, base_pressure_psi: Number(z.base_pressure_psi) })) as ConsoleZone[];
}

const COLUMNS =
  "id,label,neighborhood,zone_id,lat,lng,year_built,foundation,exterior_wall_pipes,attic_or_crawlspace_pipes,insulation,outdoor_faucets";
const PAGE = 1000; // Supabase returns at most 1,000 rows per request by default

/** All homes for the console, read with the anon key (read-only via RLS). */
export async function fetchConsoleHomes(): Promise<ConsoleHome[]> {
  const supabase = getSupabase();
  const all: ConsoleHome[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("homes")
      .select(COLUMNS)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as ConsoleHome[]));
    if (!data || data.length < PAGE) return all;
  }
}
