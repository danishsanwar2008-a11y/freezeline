import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { PlanCard } from "@/lib/steps";
import { isValidSms, templateSms, type SmsFacts } from "@/lib/messages";
import { cached, cacheKey } from "./aiCache";
import { getClaude, MODELS } from "./claude";
import { renderPlan, renderSms, type FriendlyPlan, type Lang } from "@/lib/pregenerated";

export type { FriendlyPlan, Lang };
const PROMPT_VERSION = 1;

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


const SMS_SYSTEM = `You write one SMS from a water utility to a homeowner during a hard freeze.
Rewrite the template so it reads warmly and clearly. Keep every fact and instruction exactly (which tap to drip, or don't drip).
Rules: under 300 characters; keep the literal text "(simulated)" and the literal placeholder "{link}" exactly once each;
no new facts, numbers, times or promises. Return only the SMS text.`;

/** SMS text for a group of homes with the same facts. Claude-written when available, else the template. */
export async function smsDraft(facts: SmsFacts, lang: Lang = "en"): Promise<{ text: string; source: "claude" | "pregenerated" }> {
  const template = templateSms(facts);
  const claude = getClaude();
  if (!claude) return { text: renderSms(facts, lang), source: "pregenerated" };
  const key = cacheKey("sms", { v: PROMPT_VERSION, lang, template });
  try {
    return await cached(key, MODELS.fast, async () => {
      const res = await claude.messages.create({
        model: MODELS.fast,
        max_tokens: 1000,
        system: SMS_SYSTEM,
        output_config: { effort: "low" },
        messages: [{ role: "user", content: `Language: ${lang === "es" ? "Spanish" : "English"}\nTemplate: ${template}` }],
      });
      const text = res.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("")
        .trim();
      if (res.stop_reason === "refusal" || !isValidSms(text)) return { text: renderSms(facts, lang), source: "pregenerated" as const };
      return { text, source: "claude" as const };
    });
  } catch (err) {
    console.error("[FreezeLine] smsDraft fell back to pre-written text:", err instanceof Error ? err.message : err);
    return { text: renderSms(facts, lang), source: "pregenerated" };
  }
}

/** Friendly (and optionally Spanish) wording of a plan card. Cached by exact content. */
export async function friendlyPlan(card: PlanCard, lang: Lang): Promise<FriendlyPlan> {
  const claude = getClaude();
  if (!claude) return renderPlan(card, lang);

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
    console.error("[FreezeLine] friendlyPlan fell back to pre-written text:", err instanceof Error ? err.message : err);
    return renderPlan(card, lang);
  }
}
