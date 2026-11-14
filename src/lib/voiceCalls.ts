// Phone calls placed by the voice agent and what the household said (supabase/006_voice_calls.sql).
// Pure (no I/O): the agent's report format, Twilio status mapping, and officials' wording for the
// Calls page. Tested in voiceCalls.test.ts.

import { z } from "zod";

export type CallSource = "demo" | "sample" | "live";
export type CallStatus = "queued" | "ringing" | "in_progress" | "completed" | "no_answer" | "busy" | "failed" | "canceled";
export type CallAssessment = "ready" | "needs_reminder" | "needs_crew";

/** Statuses that will not change again. */
export const FINAL_STATUSES: CallStatus[] = ["completed", "no_answer", "busy", "failed", "canceled"];
export const isFinalStatus = (s: CallStatus) => FINAL_STATUSES.includes(s);

/** Twilio's call status (Calls resource) -> ours. Unknown values map to null (leave the row as it is). */
export function fromTwilioStatus(s: string | null | undefined): CallStatus | null {
  switch (s) {
    case "queued":
    case "initiated":
      return "queued";
    case "ringing":
      return "ringing";
    case "in-progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "busy":
      return "busy";
    case "no-answer":
      return "no_answer";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    default:
      return null;
  }
}

// ---------- the agent's report (voice/agent.py posts one after every answer, and at the end) ----------

const Line = z.object({ who: z.enum(["agent", "you"]), text: z.string().max(2000) });

export const AgentReport = z.object({
  /** Our row id, sent to the agent inside the household payload when the call was placed. */
  call_id: z.string().uuid(),
  call_sid: z.string().max(64).optional(),
  /** True when the script reached its end (every question asked). */
  final: z.boolean().default(false),
  mode: z.enum(["storm", "survey"]).optional(),
  assessment: z.enum(["ready", "needs_reminder", "needs_crew"]).optional(),
  closing: z.string().max(64).optional(),
  /** Answer fields, as voice/script.py Answers.as_dict() (storm) or the survey's answers. */
  answers: z.record(z.string(), z.unknown()).default({}),
  /** Which answer fields were actually asked and answered (the rest are defaults, not answers). */
  answered: z.array(z.string().max(64)).max(32).default([]),
  transcript: z.array(Line).max(200).default([]),
});
export type AgentReport = z.output<typeof AgentReport>;

/** Only the fields the household actually answered: unasked defaults are not answers. */
export function answeredOnly(answers: Record<string, unknown>, answered: string[]): Record<string, unknown> {
  const keep = new Set(answered);
  // The combined "anyone elderly, disabled or unable to go outside" question fills three fields.
  if (keep.has("needs_help")) ["someone_elderly", "someone_disabled", "cant_go_outside"].forEach((f) => keep.add(f));
  return Object.fromEntries(Object.entries(answers).filter(([k]) => keep.has(k)));
}

/** Columns to write for one report. The assessment counts only once the script finished. */
export function reportColumns(r: AgentReport) {
  return {
    ...(r.call_sid ? { call_sid: r.call_sid } : {}),
    answers: answeredOnly(r.answers, r.answered),
    questions_answered: new Set(r.answered).size,
    transcript: r.transcript,
    finished: r.final,
    assessment: r.final && r.mode !== "survey" ? (r.assessment ?? null) : null,
    closing: r.final ? (r.closing ?? null) : null,
    updated_at: new Date().toISOString(),
  };
}

// ---------- the household payload the agent reads (voice/agent.py home_from_parameter) ----------

export interface CallHousehold {
  call_id: string;
  engine: "gather";
  mode?: "storm" | "survey";
  home_id?: string;
  lang: "en" | "es";
  level?: "High" | "Watch" | "Low";
  temp?: number;
  hours?: number;
  steps?: string[];
  faucet?: boolean;
  first_name?: string;
  street?: string;
  crew?: string;
}

/** Base64 JSON, URL-encoded: what goes after `?home=` on the agent's /voice/start URL. */
export function encodeHousehold(h: CallHousehold): string {
  return encodeURIComponent(Buffer.from(JSON.stringify(h), "utf8").toString("base64"));
}

// ---------- officials' wording (third person) ----------

export const STATUS_LABEL: Record<CallStatus, string> = {
  queued: "Dialing",
  ringing: "Ringing",
  in_progress: "On the call",
  completed: "Call ended",
  no_answer: "No answer",
  busy: "Line busy",
  failed: "Call failed",
  canceled: "Canceled",
};

export const ASSESSMENT_LABEL: Record<CallAssessment, string> = {
  ready: "Ready",
  needs_reminder: "Needs a reminder",
  needs_crew: "Needs a crew",
};

/** The one outcome shown per call (and its home-status color): what the household's answers mean. */
export type CallOutcome = "ready" | "needs_reminder" | "needs_crew" | "partial" | "in_progress" | "no_answer";

export function callOutcome(c: { status: CallStatus; finished: boolean; assessment: CallAssessment | null; questions_answered: number }): CallOutcome {
  if (c.finished && c.assessment) return c.assessment;
  if (!isFinalStatus(c.status)) return "in_progress";
  if (c.questions_answered > 0) return "partial";
  return "no_answer";
}

export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  ready: "Ready",
  needs_reminder: "Needs a reminder",
  needs_crew: "Needs a crew",
  partial: "Hung up before the end",
  in_progress: "In progress",
  no_answer: "No answer",
};

/** Answer tiles: label + the answer field(s). `null` value = not asked / not answered. */
export function answerTiles(a: Record<string, unknown>): { label: string; value: string | null }[] {
  const yn = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : null);
  const needs =
    "someone_elderly" in a || "someone_disabled" in a || "cant_go_outside" in a
      ? yn(Boolean(a.someone_elderly || a.someone_disabled || a.cant_go_outside))
      : null;
  return [
    { label: "Can do the steps", value: yn(a.can_do_steps) },
    { label: "Elderly, disabled or can't go out", value: needs },
    { label: "Lives alone", value: yn(a.lives_alone) },
    { label: "Knows the shutoff", value: yn(a.knows_shutoff) },
    { label: "Outdoor faucet covered", value: yn(a.faucet_covered) },
    { label: "Has heat", value: yn(a.has_heat) },
    { label: "Neighbor needs a check", value: yn(a.neighbor_check) },
  ];
}

/** "+17135550123" -> "(713) •••-0123": enough to recognize a number, not to copy it. */
export function maskPhone(e164: string): string {
  const d = e164.replace(/^\+1/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) •••-${d.slice(6)}` : "•••";
}
