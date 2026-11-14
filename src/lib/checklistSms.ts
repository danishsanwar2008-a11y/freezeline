// The checklist text a household gets right after a finished call: the same 3 steps the call read
// out, plus one line for how the call ended. It makes the call's last line true ("I'll text you that
// checklist right after this call", messages.json call.agent_text_pending).
//
// Pure and tested (checklistSms.test.ts). The wording lives in data/messages.json `checklist`.
// Honesty rule: no ending here says a crew is on the way. A call that closed with a crew assigned
// gets the steps only, because the report doesn't carry the crew's name and the text never guesses.
import { fill, MESSAGES, type Lang } from "./pregenerated";
import { SIM_LABEL } from "./messages";

type Bi = Record<Lang, string>;
const CHECKLIST = (MESSAGES as unknown as { checklist: Record<string, Bi> }).checklist;

/** Endings with a line of their own. Any other closing (agent_crew_assigned) gets the steps alone. */
export const CHECKLIST_ENDINGS = ["agent_reminder", "agent_ready", "agent_crew_requested"] as const;

export interface ChecklistFacts {
  /** The 3 steps exactly as the call read them. */
  steps: readonly string[];
  /** The call's closing key (voice/script.py closing_key). */
  closing?: string | null;
  lang: Lang;
}

/** The text to send, or null when there is nothing honest to send (missing steps). */
export function checklistText(f: ChecklistFacts): string | null {
  const steps = f.steps.map((s) => s.trim());
  if (steps.length !== 3 || steps.some((s) => !s)) return null;
  const lang: Lang = f.lang === "es" ? "es" : "en";
  const intro = fill(CHECKLIST.intro[lang], { step1: steps[0], step2: steps[1], step3: steps[2] });
  const ending = f.closing && (CHECKLIST_ENDINGS as readonly string[]).includes(f.closing) ? CHECKLIST[f.closing][lang] : "";
  return ending ? `${intro} ${ending}` : intro;
}

/** Every checklist text keeps the simulated label and leaves no {slot} unfilled. */
export function isValidChecklist(text: string): boolean {
  return text.includes(SIM_LABEL) && !/\{\w+\}/.test(text);
}
