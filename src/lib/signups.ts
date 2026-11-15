// The household's own sign-up (/register), looked up by the phone a call goes to: their name,
// address and emergency contact. Server and scripts only (it needs the service-role client);
// no `server-only` import so scripts/call-me.ts can use it too.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Signup {
  fullName: string;
  firstName: string;
  address: string;
  emergencyName: string | null;
  emergencyPhone: string | null;
}

/** The newest real sign-up for this phone (placeholder sign-ups never count), or null. */
export async function signupForPhone(db: SupabaseClient, phone: string): Promise<Signup | null> {
  const { data, error } = await db
    .from("registrations")
    .select("full_name,address_line1,address_line2,emergency_name,emergency_phone,source,created_at")
    .eq("phone", phone)
    .neq("source", "placeholder")
    .order("created_at", { ascending: false })
    .limit(1);
  const r = !error && data?.[0];
  if (!r) return null;
  const fullName = String(r.full_name ?? "").trim();
  return {
    fullName,
    firstName: fullName.split(/\s+/)[0] ?? "",
    address: [r.address_line1, r.address_line2].filter(Boolean).join(", "),
    emergencyName: r.emergency_name ? String(r.emergency_name).trim() : null,
    emergencyPhone: r.emergency_phone && /^\+1[2-9]\d{9}$/.test(r.emergency_phone) ? r.emergency_phone : null,
  };
}
