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

/** The research doc's 4 text-table rows (data/messages.json surveyTexts.messages). */
export const SURVEY_ROWS = ["mild|pass", "mild|fail", "very_cold|fail", "cold|pass"] as const;
export type SurveyRow = (typeof SURVEY_ROWS)[number];
/** Who helps next after a pre-survey call (voice/survey.py followup()). */
export const SURVEY_FOLLOWUPS = ["contact", "crew"] as const;
export type SurveyFollowup = (typeof SURVEY_FOLLOWUPS)[number];

export const AgentReport = z.object({
  /** Our row id, sent to the agent inside the household payload when the call was placed. */
  call_id: z.string().uuid(),
  call_sid: z.string().max(64).optional(),
  /** True when the script reached its end (every question asked). */
  final: z.boolean().default(false),
  mode: z.enum(["storm", "survey", "contact"]).optional(),
  assessment: z.enum(["ready", "needs_reminder", "needs_crew"]).optional(),
  closing: z.string().max(64).optional(),
  /** Answer fields, as voice/script.py Answers.as_dict() (storm) or the survey's answers. */
  answers: z.record(z.string(), z.unknown()).default({}),
  /** Which answer fields were actually asked and answered (the rest are defaults, not answers). */
  answered: z.array(z.string().max(64)).max(32).default([]),
  transcript: z.array(Line).max(200).default([]),
  /** The 3 steps the call read out (storm calls only); texted back as the checklist when it finishes. */
  steps: z.array(z.string().max(300)).max(3).optional(),
  // ---- pre-survey calls (voice/survey.py): the verdict the call reached, decided in Python only ----
  /** The home's priority: its row's category in the research doc's text table. */
  level: z.enum(["Low", "Medium", "High"]).optional(),
  /** The text table row whose text goes out, e.g. "very_cold|fail" (checked when the text is built,
   *  not here: an unknown row must not throw away the answers this report carries). */
  text_row: z.string().max(32).optional(),
  /** Who helps next: "contact" (the emergency contact is called right after) or "crew". */
  followup: z.string().max(16).nullish(),
  /** Why someone is needed at the house: "shutoff" (can't reach it), "away" (nobody home 3 days). */
  contact_reasons: z.array(z.string().max(16)).max(4).optional(),
  emergency_name: z.string().max(120).optional(),
  /** The crew the web app assigned during the call (via /api/voice/crew), if any. */
  crew: z.string().max(80).nullish(),
  /** Weighted pre-survey risk, 0-1 (fails at 0.5). */
  score: z.number().min(0).max(1).optional(),
  first_name: z.string().max(80).optional(),
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
    assessment: r.final ? (r.assessment ?? null) : null,
    closing: r.final ? (r.closing ?? (r.text_row ? `survey ${r.text_row}` : null)) : null,
    // A pre-survey call's priority replaces the planner's level once the call has reached it.
    ...(r.final && r.mode === "survey" && r.level ? { level: r.level } : {}),
    updated_at: new Date().toISOString(),
  };
}

// ---------- the household payload the agent reads (voice/agent.py home_from_parameter) ----------

export interface CallHousehold {
  call_id: string;
  engine: "gather";
  mode?: "storm" | "survey" | "contact";
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
  /** Pre-survey: the emergency contact on the household's sign-up (the agent offers to call them). */
  emergency_name?: string;
  /** Emergency-contact call: who is being called, for whom, and why ("shutoff" / "away"). */
  contact_name?: string;
  homeowner?: string;
  reasons?: string[];
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
export function answerTiles(a: Record<string, unknown>, level?: string | null): { label: string; value: string | null }[] {
  const yn = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : null);
  if (SURVEY_FIELDS.some((f) => f in a)) return surveyTiles(a, level ?? null);
  if ("can_help" in a) return [{ label: "Can go help", value: yn(a.can_help) }];
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

/** The pre-survey call's 7 answers (voice/survey.py FIELDS). */
export const SURVEY_FIELDS = ["pipe_runs", "pipe_material", "home_age", "insulated", "shutoff_access", "frozen_before", "someone_home"] as const;

/** What the call decided happens next, from its answers (officials' wording). */
export function surveyNextSteps(a: Record<string, unknown>, followup?: string | null): string | null {
  // The saved outcome ("Crew 3 assigned", "Emergency contact Sam is helping") wins over the plan.
  if (followup) return followup;
  if (a.shutoff_access !== "cannot" && a.someone_home !== false) return null;
  if (a.neighbor_help === true) return "Calling the emergency contact, then a crew";
  if (a.shutoff_access === "cannot") return "Crew needed";
  return "Calling the emergency contact, then a crew";
}

/** Officials' wording for each follow-up outcome (saved in voice_calls.followup). */
export const followupWording = {
  callingContact: (name: string) => `Calling emergency contact ${name}`,
  contactHelping: (name: string | null) => (name ? `Emergency contact ${name} is going to help` : "The emergency contact is going to help"),
  crewAssigned: (crew: string, why: string) => `${crew} assigned (${why})`,
  crewRequested: (why: string) => `Crew requested, all of this area's crews busy (${why})`,
};

function surveyTiles(a: Record<string, unknown>, level: string | null): { label: string; value: string | null }[] {
  const yn = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : null);
  const pick = (v: unknown, names: Record<string, string>) => (typeof v === "string" ? (names[v] ?? null) : null);
  const age = typeof a.home_age === "number" ? `${a.home_age} yr` : null;
  return [
    { label: "Priority", value: level },
    { label: "Pipes run", value: pick(a.pipe_runs, { interior: "Inside, heated", slab: "Under the slab", outside: "Garage / outside" }) },
    { label: "Pipe material", value: pick(a.pipe_material, { pex: "PEX", pvc: "PVC / CPVC", copper: "Copper" }) },
    { label: "Home age", value: age },
    { label: "Pipes insulated", value: pick(a.insulated, { yes: "Yes", mostly: "Mostly", no: "No" }) },
    { label: "Can reach shutoff", value: pick(a.shutoff_access, { ok: "Yes", cannot: "No" }) },
    { label: "Frozen before", value: yn(a.frozen_before) },
    { label: "Home next 3 days", value: yn(a.someone_home) },
  ];
}

/** "+17135550123" -> "(713) •••-0123": enough to recognize a number, not to copy it. */
export function maskPhone(e164: string): string {
  const d = e164.replace(/^\+1/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) •••-${d.slice(6)}` : "•••";
}
