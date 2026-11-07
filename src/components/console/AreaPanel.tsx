"use client";

import type { ConsoleHome, HexBin } from "@/lib/replay";
import type { CityPlan } from "@/lib/planner";
import { actionSummary, displayLevel } from "@/lib/steps";
import { LEVEL_BG, LEVEL_TEXT } from "@/lib/riskScale";
import { homeName } from "./format";

interface Props {
  hex: HexBin;
  homes: ConsoleHome[];
  plan: CityPlan;
  onBack: () => void;
  onSelectHome: (idx: number) => void;
}

export function BackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 self-start rounded-md px-2 py-1 text-sm font-medium text-accent transition hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
    >
      ← {children}
    </button>
  );
}

/** One area: a single sentence, then only the homes that need action, highest risk first. */
export default function AreaPanel({ hex, homes, plan, onBack, onSelectHome }: Props) {
  const needAction = hex.homeIdx
    .filter((i) => plan.homes[i].level !== "Low")
    .sort((a, b) => plan.homes[b].score - plan.homes[a].score || a - b);
  const n = hex.homeIdx.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <BackLink onClick={onBack}>All areas</BackLink>
      <div>
        <p className="text-sm text-muted">{hex.neighborhood}</p>
        <h2 className="mt-1 text-2xl font-semibold leading-snug tracking-tight">
          {n} {n === 1 ? "home" : "homes"} ·{" "}
          {needAction.length === 0 ? (
            <span className="text-muted">nobody needs to act</span>
          ) : (
            <>
              {needAction.length} need{needAction.length === 1 ? "s" : ""} action tonight
            </>
          )}
        </h2>
      </div>

      {needAction.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted">
          Every home here can ride out tonight without dripping. Fewer drips keep the water pressure up for everyone.
        </p>
      ) : (
        <ul className="-mx-2 min-h-0 space-y-1 overflow-y-auto">
          {needAction.map((i) => {
            const level = displayLevel(plan.homes[i].level);
            return (
              <li key={homes[i].id}>
                <button
                  type="button"
                  onClick={() => onSelectHome(i)}
                  className="flex w-full items-center gap-3 rounded-panel px-2 py-3 text-left transition hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className={`size-2.5 shrink-0 rounded-full ${LEVEL_BG[level]}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{homeName(homes[i].label)}</span>
                    <span className="block truncate text-sm text-muted">{actionSummary(plan.homes[i])}</span>
                  </span>
                  <span className={`text-xs font-medium ${LEVEL_TEXT[level]}`}>{level}</span>
                  <span className="text-muted" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
