// Deterministic SMS templates. Homes with the same facts share one message; {link} is
// replaced per home with that home's page. All outreach is labeled simulated.

import type { DripAction } from "./planner";
import type { DisplayLevel } from "./steps";

export interface SmsFacts {
  level: DisplayLevel;
  action: DripAction;
  /** "kitchen" | "bathroom" | "farthest" | null */
  faucet: string | null;
  uncovered: boolean;
}

export const LINK_TOKEN = "{link}";
export const SIM_LABEL = "(simulated)";

const TAP: Record<string, string> = {
  kitchen: "kitchen tap",
  bathroom: "bathroom tap",
  farthest: "tap farthest from your water meter",
};

export function smsGroupKey(f: SmsFacts): string {
  return [f.level, f.action, f.faucet ?? "-", f.uncovered ? "u" : "c"].join("|");
}

export function templateSms(f: SmsFacts): string {
  const head = `FreezeLine ${SIM_LABEL}: ${f.level.toUpperCase()} freeze risk tonight.`;
  let body: string;
  if (f.action === "drip" && f.faucet)
    body = `Drip only your ${TAP[f.faucet] ?? "farthest tap"}. Your street is on a drip plan, so please don't drip the others.`;
  else if (f.level === "High" && f.uncovered)
    body = "Please don't drip: street pressure is at its limit. Protect your pipes with the steps below.";
  else body = "Please don't drip tonight. Protect your pipes and help keep your neighbors' water pressure up.";
  return `${head} ${body} Your 3 steps: ${LINK_TOKEN}`;
}

/** A Claude rewrite is only accepted if it keeps the link, the simulated label, and SMS length. */
export function isValidSms(text: string): boolean {
  return text.includes(LINK_TOKEN) && text.includes(SIM_LABEL) && text.length <= 320;
}

export const fillLink = (text: string, url: string) => text.replace(LINK_TOKEN, url);
