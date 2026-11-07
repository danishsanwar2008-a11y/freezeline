import "server-only";

/**
 * Which AI provider FreezeLine uses (LLM_PROVIDER in .env.local, server-side only):
 * - "pregenerated" (default): every message comes from data/messages.json. Zero API calls, zero cost.
 * - "gemini": pre-written messages, plus Gemini's free tier for the photo check only (GEMINI_API_KEY).
 * - "anthropic": live Claude for plan wording, SMS, the agent's decisions and the photo check (ANTHROPIC_API_KEY).
 */
export type Provider = "pregenerated" | "gemini" | "anthropic";
const PROVIDERS: Provider[] = ["pregenerated", "gemini", "anthropic"];

export function getProvider(): Provider {
  const v = (process.env.LLM_PROVIDER ?? "pregenerated").trim().toLowerCase();
  if ((PROVIDERS as string[]).includes(v)) return v as Provider;
  console.warn(`[FreezeLine] Unknown LLM_PROVIDER "${v}", using "pregenerated".`);
  return "pregenerated";
}

/** Whether the photo check can run with the current provider and keys. */
export function photoCheckAvailable(): boolean {
  const p = getProvider();
  if (p === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  if (p === "gemini") return !!process.env.GEMINI_API_KEY;
  return false;
}
