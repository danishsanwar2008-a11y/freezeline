// Officials' wording (City Operations only): third person, short, plain. Never "you".

import type { Assessment, HomeStatus, ReasonFactor } from "./household";

export const STATUS_LABEL: Record<HomeStatus, string> = {
  ready: "Ready",
  needs_help: "Needs help",
  waiting: "Waiting on reply",
  no_answer: "No answer",
  not_contacted: "Not contacted yet",
};

export const ASSESSMENT_LABEL: Record<Assessment, string> = {
  ready: "Ready",
  needs_crew: "Needs a crew",
  needs_reminder: "Needs a reminder",
  waiting: "Waiting on reply",
  no_answer: "No answer",
  not_contacted: "Not contacted yet",
};

const FACTOR: Record<ReasonFactor, string> = {
  can_do_steps: "can do the steps",
  did_steps: "steps done",
  not_done_yet: "steps not done yet",
  elderly: "elderly",
  disabled: "disability",
  cant_go_outside: "can't go outside",
  lives_alone: "lives alone",
  no_heat: "no heat",
  cant_do_steps: "can't do the steps",
  faucet_uncovered: "can't reach the outdoor faucet",
  no_reply_yet: "no reply yet; call queued",
  no_answer: "didn't answer the call",
  door_check: "door check scheduled",
  low_risk: "low risk tonight",
};

/** "Needs a crew: can't do the steps, elderly, lives alone" */
export function assessmentSentence(a: Assessment, reasons: ReasonFactor[]): string {
  return `${ASSESSMENT_LABEL[a]}: ${reasons.map((r) => FACTOR[r]).join(", ")}`;
}

/** Short needs list for crew lines: "(elderly, can't go outside)" */
export function needsList(reasons: ReasonFactor[]): string {
  const needs = reasons.filter((r) => ["elderly", "disabled", "cant_go_outside", "lives_alone", "no_heat"].includes(r));
  return (needs.length ? needs : reasons).map((r) => FACTOR[r]).join(", ");
}
