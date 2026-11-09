// The agent's conversation with one household, built only from saved facts (sample answers until
// Phase 4) and pre-written lines in data/messages.json. Written to "you" (Homeowner views only).
//
// Honesty rule: the agent says a crew is "on the way" ONLY when a crew is actually assigned.
// Otherwise it says it is requesting one and will text when one is assigned.

import { MESSAGES, fill, type Lang } from "./pregenerated";
import type { Assessment, CallAnswers } from "./household";
import type { DisplayLevel, Params } from "./steps";

export type Speaker = "agent" | "you";
export interface Line {
  who: Speaker;
  text: string;
}
export type ConversationKind = "call" | "text" | "no_answer" | "waiting" | "not_contacted";

export interface Conversation {
  kind: ConversationKind;
  lines: Line[];
  /** Plain status sentence shown above (or instead of) the transcript. */
  note: string | null;
}

export interface ContactFacts {
  replied_text: boolean;
  called: boolean;
  answered_call: boolean;
  door_check: boolean;
}

export interface ConversationInput {
  lang: Lang;
  level: DisplayLevel;
  temp: number;
  hoursBelow20: number;
  /** The household's 3 steps, already worded for them. */
  steps: string[];
  hasOutdoorFaucet: boolean;
  /** Null when there is no saved outreach record for this hour. */
  contact: ContactFacts | null;
  answers: CallAnswers | null;
  assessment: Assessment | null;
  /** Name of the crew ACTUALLY assigned to this home, or null. */
  assignedCrew: string | null;
}

const C = MESSAGES as unknown as { call: Record<string, Record<Lang, string>>; levelWord: Record<DisplayLevel, Record<Lang, string>> };
const say = (key: string, lang: Lang, params?: Params) => {
  const t = C.call[key]?.[lang];
  if (t === undefined) throw new Error(`data/messages.json is missing call "${key}" (${lang})`);
  return fill(t, params);
};

export function buildConversation(i: ConversationInput): Conversation {
  const { lang } = i;
  if (!i.contact) return { kind: "not_contacted", lines: [], note: say("status_not_contacted", lang) };
  const a = i.answers;
  if (!a) {
    if (!i.contact.called) return { kind: "waiting", lines: [], note: say("status_waiting", lang) };
    const note = say("status_no_answer", lang) + (i.contact.door_check ? ` ${say("status_door", lang)}` : "");
    return { kind: "no_answer", lines: [], note };
  }

  const A = (key: string, params?: Params): Line => ({ who: "agent", text: say(key, lang, params) });
  const Y = (key: string, params?: Params): Line => ({ who: "you", text: say(key, lang, params) });
  const level = C.levelWord[i.level][lang];
  const lines: Line[] = [
    A(i.contact.replied_text ? "agent_hello_text" : "agent_hello"),
    i.hoursBelow20 > 0 ? A("agent_storm", { temp: Math.round(i.temp), hours: i.hoursBelow20, level }) : A("agent_storm_mild", { temp: Math.round(i.temp), level }),
    A("agent_steps", { step1: i.steps[0] ?? "", step2: i.steps[1] ?? "", step3: i.steps[2] ?? "" }),
    A("q_can_do"),
    Y(a.can_do_steps ? "a_can_do_yes" : "a_can_do_no"),
    A("q_needs"),
  ];
  const needs = [
    a.someone_elderly && say("need_elderly", lang),
    a.someone_disabled && say("need_disabled", lang),
    a.cant_go_outside && say("need_outside", lang),
  ].filter(Boolean) as string[];
  lines.push(needs.length ? Y("a_needs_yes", { list: needs.join(lang === "es" ? " y " : " and ") }) : Y("a_needs_no"));
  lines.push(A("q_alone"), Y(a.lives_alone ? "a_alone_yes" : "a_alone_no"));
  lines.push(A("q_shutoff"), Y(a.knows_shutoff ? "a_shutoff_yes" : "a_shutoff_no"));
  if (i.hasOutdoorFaucet && a.faucet_covered !== null) lines.push(A("q_faucet"), Y(a.faucet_covered ? "a_faucet_yes" : "a_faucet_no"));
  lines.push(A("q_heat"), Y(a.has_heat ? "a_heat_yes" : "a_heat_no"));
  lines.push(A("q_neighbor"), Y(a.neighbor_check ? "a_neighbor_yes" : "a_neighbor_no"));
  if (a.neighbor_check) lines.push(A("agent_neighbor"));

  if (i.assessment === "needs_crew") lines.push(i.assignedCrew ? A("agent_crew_assigned", { crew: i.assignedCrew }) : A("agent_crew_requested"));
  else if (i.assessment === "needs_reminder") lines.push(A("agent_reminder"));
  else lines.push(A("agent_ready"));

  return { kind: i.contact.replied_text ? "text" : "call", lines, note: i.contact.replied_text ? say("status_text_reply", lang) : null };
}

/** Big answer tiles under the transcript. Null value = not answered yet (estimated). */
export interface AnswerTiles {
  canDo: boolean | null;
  needsHelp: boolean | null;
  shutoffFound: boolean | null;
  faucetCovered: boolean | null;
  hasHeat: boolean | null;
  livesAlone: boolean | null;
}
export function answerTiles(a: CallAnswers | null, assessment: Assessment | null): AnswerTiles {
  if (!a) return { canDo: null, needsHelp: null, shutoffFound: null, faucetCovered: null, hasHeat: null, livesAlone: null };
  return {
    canDo: a.can_do_steps,
    needsHelp: assessment === "needs_crew",
    shutoffFound: a.knows_shutoff,
    faucetCovered: a.faucet_covered,
    hasHeat: a.has_heat,
    livesAlone: a.lives_alone,
  };
}

// ---------- Storm in your area ----------

const S = MESSAGES as unknown as { storm: Record<string, Record<Lang, string>> };
export function stormSentence(kind: "coldest" | "freezing" | "calm", lang: Lang, params: Params): string {
  return fill(S.storm[`day_${kind}`][lang], params);
}
