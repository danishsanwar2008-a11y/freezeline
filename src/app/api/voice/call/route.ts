import { z } from "zod";
import { requireConsole } from "@/lib/server/consoleAuth";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { elevenLabsConfig, placeAgentCall, type AgentCallResult } from "@/lib/elevenlabsCall";

// "Run agent" -> call the households that signed up, by name, through the ElevenLabs agent.
// Behind the console password: this dials real phones.
//
// Calls go out one at a time. ElevenLabs Starter allows 6 at once, but a demo does not need to
// hammer five hundred numbers in the same second, and a queue that is obviously sequential is
// easier to watch (and to stop).
export const maxDuration = 120;

const MAX_CALLS = 10;

const Body = z.object({
  /** One number, for testing. */
  to: z.string().optional(),
  /** Every consented sign-up with a phone number. */
  all: z.boolean().optional(),
  /** Show who would be called, dial nobody. */
  dryRun: z.boolean().optional(),
});

type Target = { phone: string; first_name: string; street: string; lang: string };

async function consentedHouseholds(): Promise<Target[] | { error: string }> {
  const db = getSupabaseAdmin();
  if (!db) return { error: "Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." };
  const { data, error } = await db
    .from("registrations")
    .select("phone, full_name, address_line1, preferred_language")
    .eq("consent_texts_calls", true)
    .order("created_at", { ascending: true })
    .limit(MAX_CALLS);
  if (error) {
    return {
      error:
        error.code === "42P01"
          ? "The registrations table does not exist yet (run supabase/004_registrations.sql)."
          : error.message,
    };
  }
  return (data ?? []).map(
    (r: { phone: string; full_name: string | null; address_line1: string | null; preferred_language: string | null }) => ({
      phone: r.phone,
      first_name: (r.full_name ?? "").trim().split(/\s+/)[0] || "there",
      street: (r.address_line1 ?? "").trim(),
      lang: r.preferred_language === "es" ? "es" : "en",
    }),
  );
}

export async function POST(req: Request) {
  const denied = requireConsole(req);
  if (denied) return denied;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Expected { to?, all?, dryRun? }" }, { status: 400 });
  }
  const { to, all, dryRun } = parsed.data;

  let targets: Target[];
  if (to) {
    targets = [{ phone: to, first_name: "there", street: "", lang: "en" }];
  } else if (all) {
    const found = await consentedHouseholds();
    if ("error" in found) return Response.json({ error: found.error }, { status: 503 });
    targets = found;
  } else {
    return Response.json({ error: "Send { to } for one number, or { all: true }." }, { status: 400 });
  }

  if (targets.length === 0) {
    return Response.json({ error: "No consented sign-ups to call yet.", called: 0, failed: 0, results: [] });
  }

  if (dryRun) {
    return Response.json({ dryRun: true, configured: Boolean(elevenLabsConfig()), wouldCall: targets });
  }

  if (!elevenLabsConfig()) {
    return Response.json(
      {
        error: "ElevenLabs is not configured.",
        fix: "Set ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID and ELEVENLABS_PHONE_NUMBER_ID in .env.",
      },
      { status: 503 },
    );
  }

  const results: AgentCallResult[] = [];
  for (const t of targets) {
    results.push(
      await placeAgentCall({
        to: t.phone,
        variables: { first_name: t.first_name, street: t.street, lang: t.lang },
      }),
    );
    if (targets.length > 1) await new Promise((done) => setTimeout(done, 500));
  }

  const called = results.filter((r) => r.ok).length;
  return Response.json({ called, failed: results.length - called, results });
}
