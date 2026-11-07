import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude, server side only. The key comes from ANTHROPIC_API_KEY in .env.local and never
 * reaches the browser (no NEXT_PUBLIC_ prefix; this module refuses to load client-side).
 */
export const MODELS = {
  /** Bulk writing: SMS text, friendly plan steps, translation, photo check. */
  fast: "claude-haiku-5-5",
  /** The agent's decisions. */
  agent: "claude-opus-5-5",
} as const;

let client: Anthropic | null | undefined;

/** The Claude client, or null when no key is configured (callers fall back to templates). */
export function getClaude(): Anthropic | null {
  if (client === undefined) {
    client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 }) : null;
  }
  return client;
}

export const claudeEnabled = () => getClaude() !== null;
