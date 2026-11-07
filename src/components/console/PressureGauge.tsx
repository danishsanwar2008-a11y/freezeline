"use client";

import { BOIL_WATER_PSI, type CityPlan } from "@/lib/planner";

const MAX_PSI = 60;
const pctOf = (psi: number) => (Math.min(MAX_PSI, Math.max(0, psi)) / MAX_PSI) * 100;
const pct = (psi: number) => `${pctOf(psi)}%`;
const psi = (n: number) => `${Math.round(n)} psi`;

/** "If everyone drips: 2 of 4 areas fall below 20 psi → boil-water notice. With FreezeLine: all 4 stay safe." */
function PressureSummary({ plan }: { plan: CityPlan }) {
  const n = plan.zones.length;
  const blanketFail = plan.zones.filter((z) => z.pressureBlanket < BOIL_WATER_PSI).length;
  const planFail = plan.zones.filter((z) => z.pressurePlan < BOIL_WATER_PSI).length;
  return (
    <p className="text-sm leading-relaxed">
      If everyone drips:{" "}
      {blanketFail > 0 ? (
        <span className="font-medium text-danger">
          {blanketFail === n ? `all ${n}` : `${blanketFail} of ${n}`} areas fall below {BOIL_WATER_PSI} psi → boil-water notice.
        </span>
      ) : (
        <span className="text-muted">all {n} areas stay above {BOIL_WATER_PSI} psi.</span>
      )}{" "}
      With FreezeLine:{" "}
      {planFail === 0 ? (
        <span className="font-medium text-ok">all {n} stay safe.</span>
      ) : (
        <span className="font-medium text-danger">
          {planFail} of {n} fall below {BOIL_WATER_PSI} psi.
        </span>
      )}
    </p>
  );
}

function Outcome({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  const safe = value >= BOIL_WATER_PSI;
  return (
    <span className="whitespace-nowrap">
      <span className={accent ? "text-text" : "text-muted"}>{label}</span>{" "}
      <span className={`font-mono tabular-nums ${accent ? "text-text" : "text-muted"}`}>{psi(value)}</span>{" "}
      {safe ? (
        <span className="text-ok" aria-label="safe">
          ✓
        </span>
      ) : (
        <span className="font-medium text-danger">✗ Boil notice</span>
      )}
    </span>
  );
}

/** Water pressure per area: FreezeLine's plan vs. a blanket "everyone drip" message, against the 20 psi line. */
export default function PressureGauge({ plan }: { plan: CityPlan }) {
  return (
    <section aria-labelledby="pressure-heading" className="space-y-4">
      <h3 id="pressure-heading" className="text-sm font-medium text-muted">
        Water pressure by area
      </h3>
      <PressureSummary plan={plan} />
      <ul className="space-y-5">
        {plan.zones.map((z) => (
          <li key={z.zoneId}>
            <p className="text-sm font-medium">{z.neighborhood}</p>
            <p className="mt-1 flex flex-wrap gap-x-2 text-xs leading-5">
              <Outcome label="FreezeLine" value={z.pressurePlan} accent />
              <span className="text-muted" aria-hidden>
                ·
              </span>
              <Outcome label="Everyone drips" value={z.pressureBlanket} />
            </p>
            {/* bar: FreezeLine fill, 20 psi line, labeled "everyone drips" marker */}
            <div className="relative mt-2 h-2 rounded-full bg-border" aria-hidden>
              <div className="absolute inset-y-0 left-0 rounded-full bg-accent/80 transition-[width] duration-150" style={{ width: pct(z.pressurePlan) }} />
              <div className="absolute -inset-y-1.5 w-px bg-danger" style={{ left: pct(BOIL_WATER_PSI) }} />
              <div className="absolute -inset-y-1.5 w-0.5 -translate-x-1/2 rounded-full bg-danger" style={{ left: pct(z.pressureBlanket) }} />
            </div>
            <div className="relative mt-1 h-4" aria-hidden>
              <span
                className="absolute whitespace-nowrap text-[10px] font-medium text-danger"
                style={{ left: `${Math.min(pctOf(z.pressureBlanket), 62)}%`, transform: "translateX(-3px)" }}
              >
                ↑ Everyone drips
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-2 text-xs text-muted">
        <span className="inline-block h-3 w-px bg-danger" aria-hidden /> {BOIL_WATER_PSI} psi: below this, Texas requires a boil-water notice.
        <span className="ml-1 inline-block h-2 w-4 rounded-full bg-accent/80" aria-hidden /> FreezeLine
      </p>
    </section>
  );
}
