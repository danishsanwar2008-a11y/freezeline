import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null | undefined;

/**
 * Service-role Supabase client for server code only (writes drip plans, outreach, events,
 * cache rows, photo results). Null if the key is missing.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (admin === undefined) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    admin = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }
  return admin;
}
