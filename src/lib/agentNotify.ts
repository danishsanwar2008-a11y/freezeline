// "Also notified" on a run of the agent: who else the agent would reach (maintenance contractors, the
// utility's control room, city officials, the mayor's office). DISPLAY ONLY: nothing is sent, and every
// line says so. Each line is built from this run's real numbers (no invented facts).

import { plural, verb } from "./plural";

export const NOTIFY_TAG = "simulated · nothing is sent";

export interface RunFacts {
  /** Homes needing action this hour (Watch + High). */
  needAction: number;
  high: number;
  /** Texts actually queued by this run (0 in Approve-first mode until approved). */
  texted: number;
  /** Crews the run assigned or proposed. */
  crewsSent: number;
  /** Confirmed "needs a crew" homes still waiting for a crew. */
  crewQueue: number;
  /** The area with the lowest forecast pressure, and that pressure. */
  lowestArea: string | null;
  lowestPsi: number | null;
  /** A Stage 2 alert is waiting for the supervisor. */
  stage2Pending: boolean;
}

export interface Notice {
  party: string;
  message: string;
  simulated: true;
}

/** One line per party, from this run's numbers. Empty when nothing needs action. */
export function alsoNotified(f: RunFacts): Notice[] {
  if (f.needAction === 0) return [];
  const psi = f.lowestArea && f.lowestPsi !== null ? `${f.lowestArea} forecast low ${f.lowestPsi.toFixed(1)} psi` : null;
  const lines: Notice[] = [
    {
      party: "Maintenance contractors",
      message:
        f.crewsSent > 0
          ? `${plural(f.crewsSent, "crew")} sent${f.crewQueue > 0 ? `; ${plural(f.crewQueue, "more home")} waiting for a crew` : ""}`
          : f.crewQueue > 0
            ? `${plural(f.crewQueue, "home")} waiting for a crew`
            : "On standby; no home needs a crew yet",
      simulated: true,
    },
    {
      party: "Water utility control room",
      message: `${psi ?? "Pressure in every area"}${f.stage2Pending ? "; Stage 2 alert waiting for supervisor approval" : ""}`,
      simulated: true,
    },
    {
      party: "City officials (emergency management)",
      message: `${plural(f.needAction, "home")} ${verb(f.needAction, "needs", "need")} action, ${plural(f.high, "High home")}${f.texted > 0 ? `; ${plural(f.texted, "text")} queued` : ""}`,
      simulated: true,
    },
    {
      party: "Mayor’s office",
      message: `Briefing: ${plural(f.needAction, "home")} at freeze risk${f.crewsSent > 0 ? `, ${plural(f.crewsSent, "crew")} out` : ""}`,
      simulated: true,
    },
  ];
  return lines;
}
