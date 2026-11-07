// Pre-written wording (data/messages.json) rendered for one home: no API, no network.
// Pure and client-safe. `checkCoverage()` proves every fact combination renders in both languages.

import pack from "../../data/messages.json";
import { buildPlanCard, type CardHome, type DisplayLevel, type FaucetPhoto, type Params, type PlanCard } from "./steps";
import { isValidSms, smsGroupKey, type SmsFacts } from "./messages";
import type { HomePlan } from "./planner";
import type { RiskLevel } from "./risk";

export type Lang = "en" | "es";
export const LANGS: Lang[] = ["en", "es"];

type Bi<T> = Record<Lang, T>;
type StepText = { text: string; detail: string };
interface Pack {
  version: number;
  levelWord: Record<DisplayLevel, Bi<string>>;
  headline: Record<DisplayLevel, Bi<string>>;
  steps: Record<string, Bi<StepText>>;
  drip: Record<string, Bi<StepText>>;
  reasons: Record<string, Bi<string>>;
  sms: Record<string, Bi<string>>;
  agent: Record<string, Bi<string>>;
}
export const MESSAGES = pack as unknown as Pack;

export interface FriendlyPlan {
  headline: string;
  steps: StepText[];
  reasons: string[];
  /** Who wrote the wording. */
  source: "pregenerated" | "claude" | "template";
  lang: Lang;
}

const SLOT = /\{(\w+)\}/g;

/** Fill {slots}. Unknown slots are left as-is (the coverage check catches them). */
export function fill(template: string, params: Params = {}): string {
  return template.replace(SLOT, (m, k: string) => (k in params ? String(params[k]) : m));
}

export class MissingMessage extends Error {}
function need<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new MissingMessage(`data/messages.json is missing ${what}`);
  return v;
}

export function renderPlan(card: PlanCard, lang: Lang): FriendlyPlan {
  const P = MESSAGES;
  const steps = card.steps.map((s) => {
    const t = need((P.steps[s.key] ?? P.drip[s.key])?.[lang], `steps/drip "${s.key}" (${lang})`);
    return { text: fill(t.text, s.params), detail: fill(t.detail, s.params) };
  });
  const reasons = card.reasons.map((r) => r.parts.map((p) => fill(need(P.reasons[p.key]?.[lang], `reasons "${p.key}" (${lang})`), p.params)).join(" "));
  return {
    headline: `${need(P.levelWord[card.level]?.[lang], `levelWord ${card.level}`)}: ${need(P.headline[card.level]?.[lang], `headline ${card.level}`)}`,
    steps,
    reasons,
    source: "pregenerated",
    lang,
  };
}

/** Which pre-written SMS a home gets. High homes not dripping share the "pressure at its limit" text. */
export function smsKey(f: SmsFacts): string | null {
  if (f.level === "Low") return null;
  if (f.level === "Watch") return "Watch|no_drip";
  if (f.action === "drip" && f.faucet) return smsGroupKey(f).split("|").slice(0, 3).join("|");
  return "High|no_drip|uncovered";
}

/** SMS text with the {link} slot still in place. */
export function renderSms(f: SmsFacts, lang: Lang = "en"): string {
  const key = smsKey(f);
  if (!key) throw new MissingMessage("Low-risk homes get no SMS");
  return need(MESSAGES.sms[key]?.[lang], `sms "${key}" (${lang})`);
}

/** One of the agent's pre-written decision explanations. */
export function agentText(key: string, params: Params = {}, lang: Lang = "en"): string {
  return fill(need(MESSAGES.agent[key]?.[lang], `agent "${key}" (${lang})`), params);
}

// ---------- coverage ----------

const LEVEL_ACTIONS: { level: RiskLevel; plan: Partial<HomePlan> }[] = [
  { level: "High", plan: { action: "drip", faucet: "kitchen" } },
  { level: "High", plan: { action: "drip", faucet: "bathroom" } },
  { level: "High", plan: { action: "drip", faucet: "farthest" } },
  { level: "High", plan: { action: "no_drip", uncovered: true } },
  { level: "Medium", plan: { action: "no_drip" } },
  { level: "Low", plan: { action: "no_drip" } },
];
export const AGENT_KEYS = ["publish_standard", "queue_high_first", "queue_high_next", "queue_watch", "simulate_outreach", "propose_crew", "crew_queue", "log_summary", "log_reason", "nothing_to_do", "footer"];

export interface Coverage {
  planCombinations: number;
  smsCombinations: number;
  renders: number;
  variants: number;
  errors: string[];
  unused: string[];
}

/**
 * Enumerate every combination of facts that produces homeowner text (level x drip action x faucet x
 * foundation x crawlspace/attic pipes x exterior-wall pipes x insulation x outdoor-faucet count x
 * photo result x hours-below-20 x language), render each, and report gaps or unfilled slots.
 */
export function checkCoverage(): Coverage {
  const errors: string[] = [];
  const used = new Set<string>();
  let planCombinations = 0;
  let renders = 0;
  const check = (where: string, text: string) => {
    if (!text.trim()) errors.push(`${where}: empty`);
    const left = text.match(SLOT);
    if (left) errors.push(`${where}: unfilled ${left.join(", ")}`);
  };

  for (const la of LEVEL_ACTIONS)
    for (const foundation of ["slab", "pier_and_beam"] as const)
      for (const pipes of [false, true])
        for (const ext of [false, true])
          for (const insulation of ["poor", "fair", "good"] as const)
            for (const faucets of [0, 1, 2, 3])
              for (const photo of (faucets > 0 ? [undefined, "covered", "bare", "unclear"] : [undefined]) as (FaucetPhoto | undefined)[])
                for (const hours of [0, 12]) {
                  planCombinations++;
                  const home: CardHome = { foundation, attic_or_crawlspace_pipes: pipes, exterior_wall_pipes: ext, insulation, outdoor_faucets: faucets, year_built: 1950 };
                  const plan: HomePlan = { action: "no_drip", faucet: null, score: 0, uncovered: false, ...la.plan, level: la.level };
                  const card = buildPlanCard(home, plan, { temperature_f: 14, apparent_temperature_f: 3, hoursBelow20: hours }, photo);
                  card.steps.forEach((s) => used.add(`step:${s.key}`));
                  card.reasons.forEach((r) => r.parts.forEach((p) => used.add(`reason:${p.key}`)));
                  for (const lang of LANGS) {
                    const where = `${la.level}/${la.plan.action}/${la.plan.faucet ?? (la.plan.uncovered ? "uncovered" : "-")}/${foundation}/pipes=${pipes}/ext=${ext}/${insulation}/faucets=${faucets}/photo=${photo ?? "none"}/hours=${hours}/${lang}`;
                    try {
                      const r = renderPlan(card, lang);
                      renders++;
                      if (r.steps.length !== 3 || r.reasons.length !== 3) errors.push(`${where}: expected 3 steps and 3 reasons`);
                      [r.headline, ...r.steps.flatMap((s) => [s.text, s.detail]), ...r.reasons].forEach((t) => check(where, t));
                    } catch (e) {
                      errors.push(`${where}: ${(e as Error).message}`);
                    }
                  }
                }

  let smsCombinations = 0;
  for (const level of ["High", "Watch", "Low"] as DisplayLevel[])
    for (const action of ["drip", "no_drip"] as const)
      for (const faucet of ["kitchen", "bathroom", "farthest", null])
        for (const uncovered of [false, true]) {
          if (level === "Low") continue; // Low homes get no text message
          if (action === "drip" && (level !== "High" || !faucet || uncovered)) continue;
          if (action === "no_drip" && faucet) continue;
          smsCombinations++;
          const facts: SmsFacts = { level, action, faucet, uncovered };
          used.add(`sms:${smsKey(facts)}`);
          for (const lang of LANGS) {
            const where = `sms ${level}/${action}/${faucet ?? "-"}/${uncovered ? "uncovered" : "covered"}/${lang}`;
            try {
              const t = renderSms(facts, lang);
              renders++;
              if (!isValidSms(t)) errors.push(`${where}: must keep "(simulated)" and "{link}" and stay under 320 characters`);
            } catch (e) {
              errors.push(`${where}: ${(e as Error).message}`);
            }
          }
        }

  for (const key of AGENT_KEYS)
    for (const lang of LANGS) {
      used.add(`agent:${key}`);
      try {
        check(`agent ${key}/${lang}`, agentText(key, { area: "Third Ward", margin: 7, high: 10, watch: 20, needs: "elderly", crew: "Crew 2", queue: 12 }, lang));
        renders++;
      } catch (e) {
        errors.push(`agent ${key}/${lang}: ${(e as Error).message}`);
      }
    }

  const all = [
    ...Object.keys(MESSAGES.steps).map((k) => `step:${k}`),
    ...Object.keys(MESSAGES.drip).map((k) => `step:${k}`),
    ...Object.keys(MESSAGES.reasons).map((k) => `reason:${k}`),
    ...Object.keys(MESSAGES.sms).map((k) => `sms:${k}`),
    ...Object.keys(MESSAGES.agent).map((k) => `agent:${k}`),
  ];
  const unused = all.filter((k) => !used.has(k));
  const units =
    Object.keys(MESSAGES.levelWord).length +
    Object.keys(MESSAGES.headline).length +
    Object.keys(MESSAGES.steps).length +
    Object.keys(MESSAGES.drip).length +
    Object.keys(MESSAGES.reasons).length +
    Object.keys(MESSAGES.sms).length +
    Object.keys(MESSAGES.agent).length;
  return { planCombinations, smsCombinations, renders, variants: units * LANGS.length, errors, unused };
}
