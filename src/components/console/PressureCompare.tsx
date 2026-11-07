"use client";

import { BOIL_WATER_PSI, type CityPlan } from "@/lib/planner";
import { compareFutures } from "@/lib/summary";

/** One card, two futures: a blanket "everyone drip" message vs. the FreezeLine plan. */
export function ComparisonCard({ plan }: { plan: CityPlan }) {
  const { n, blanketFail, planFail, lowestPlan } = compareFutures(plan);
  return (
    <section aria-label="Two futures for water pressure" className="grid grid-cols-2 overflow-hidden rounded-panel border border-border">
      <div className="bg-danger/10 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-danger">Everyone drips</p>
        <p className="mt-2 text-lg font-semibold leading-snug">
          {blanketFail > 0 ? (
            <>
              <span className="text-danger">
                {blanketFail} of {n}
              </span>{" "}
              areas: boil-water notice
            </>
          ) : (
            <span className="text-muted">All areas stay above {BOIL_WATER_PSI} psi</span>
          )}
        </p>
      </div>
      <div className="border-l border-border bg-ok/10 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ok">FreezeLine plan</p>
        <p className="mt-2 text-lg font-semibold leading-snug">
          {planFail === 0 ? (
            <>
              <span className="text-ok">All areas safe</span>
              <span className="block text-sm font-normal text-muted">lowest {Math.round(lowestPlan)} psi</span>
            </>
          ) : (
            <span className="text-danger">
              {planFail} of {n} below {BOIL_WATER_PSI} psi
            </span>
          )}
        </p>
      </div>
    </section>
  );
}

/** Per-area pressures, collapsed by default. */
export function AreaBreakdown({ plan }: { plan: CityPlan }) {
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm text-muted hover:text-text [&::-webkit-details-marker]:hidden">
        See by area <span className="transition group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <ul className="mt-3 space-y-2 text-sm">
        {plan.zones.map((z) => (
          <li key={z.zoneId} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span>{z.neighborhood}</span>
            <span className="text-xs text-muted">
              FreezeLine <span className="font-mono text-text">{Math.round(z.pressurePlan)}</span>
              {z.pressurePlan >= BOIL_WATER_PSI ? <span className="text-ok"> ✓</span> : <span className="text-danger"> ✗</span>}
              {" · "}Everyone drips <span className="font-mono">{Math.round(z.pressureBlanket)}</span>
              {z.pressureBlanket >= BOIL_WATER_PSI ? <span className="text-ok"> ✓</span> : <span className="text-danger"> ✗</span>}
              <span> psi</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">Below {BOIL_WATER_PSI} psi, Texas requires a boil-water notice.</p>
    </details>
  );
}
