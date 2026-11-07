import { createClient } from "@supabase/supabase-js";

// Browser-safe client: anon key only. Read-only via RLS.
// Never import the service role key here.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabase() {
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.",
    );
  }
  return createClient(url, anonKey, { auth: { persistSession: false } });
}
