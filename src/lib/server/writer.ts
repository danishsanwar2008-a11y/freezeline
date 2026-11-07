import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { PlanCard } from "@/lib/steps";
import { cached, cacheKey } from "./aiCache";
import { getClaude, MODELS } from "./claude";

export type Lang = "en" | "es";
const PROMPT_VERSION = 1;

export interface FriendlyPlan {
  headline: string;
  steps: { text: string; detail: string }[];
  reasons: string[];
  /** "claude" when Claude wrote it, "template" for the deterministic fallback. */
  source: "claude" | "template";
  lang: Lang;
}

const StepSchema = z.object({ text: z.string(), detail: z.string() });
const FriendlySchema = z.object({
  headline: z.string(),
  step1: StepSchema,
  step2: StepSchema,
  step3: StepSchema,
  reason1: z.string(),
  reason2: z.string(),
  reason3: z.string(),
});

const SYSTEM = `You rewrite a homeowner's freeze-protection plan so it is warm, clear and easy to act on.
The plan was produced by a deterministic planner. You change wording only, never facts:
- Keep exactly the same three actions, in the same order, with the same faucet and the same drip / don't-drip instruction.
- Do not add actions, numbers, times, places, promises or advice that are not in the input.
- Keep the level word (HIGH, WATCH or LOW) at the start of the headline.
- Plain language a 12-year-old understands. Step text: a short imperative, under 12 words. Detail: one sentence, under 25 words.
- Reasons: one short sentence each, same facts as the input reason.`;

export function templatePlan(card: PlanCard, lang: Lang = "en"): FriendlyPlan {
  return {
    headline: `${card.level.toUpperCase()}: ${card.headline}`,
    steps: card.steps.map((s) => ({ ...s })),
    reasons: card.reasons.map((r) => r.text),
    source: "template",
    lang,
  };
}

/** Friendly (and optionally Spanish) wording of a plan card. Cached by exact content. */
export async function friendlyPlan(card: PlanCard, lang: Lang): Promise<FriendlyPlan> {
  const claude = getClaude();
  if (!claude) return templatePlan(card, lang);

  const input = {
    level: card.level,
    headline: card.headline,
    steps: card.steps,
    reasons: card.reasons.map((r) => r.text),
  };
  const key = cacheKey("plan", { v: PROMPT_VERSION, lang, input });
  try {
    return await cached(key, MODELS.fast, async () => {
      const res = await claude.messages.parse({
        model: MODELS.fast,
        max_tokens: 2000,
        system: SYSTEM,
        output_config: { effort: "low", format: zodOutputFormat(FriendlySchema) },
        messages: [
          {
            role: "user",
            content: `Write it in ${lang === "es" ? "Spanish (neutral Latin American Spanish, usted)" : "English"}.\n\nPlan:\n${JSON.stringify(input, null, 2)}`,
          },
        ],
      });
      const out = res.parsed_output;
      if (res.stop_reason === "refusal" || !out) throw new Error("no structured output");
      return {
        headline: out.headline,
        steps: [out.step1, out.step2, out.step3],
        reasons: [out.reason1, out.reason2, out.reason3],
        source: "claude",
        lang,
      } satisfies FriendlyPlan;
    });
  } catch (err) {
    console.error("[FreezeLine] friendlyPlan fell back to template:", err instanceof Error ? err.message : err);
    return templatePlan(card, lang);
  }
}
