"use client";

import { BOIL_WATER_PSI, type CityPlan } from "@/lib/planner";

const MAX_PSI = 60;
const pct = (psi: number) => `${(Math.min(MAX_PSI, Math.max(0, psi)) / MAX_PSI) * 100}%`;

/** Zone pressure with the targeted drip plan vs. a blanket "everyone drip" message. */
export default function PressureGauge({ plan }: { plan: CityPlan }) {
  const dripping = plan.zones.reduce((s, z) => s + z.dripping, 0);
  const blanketFails = plan.zones.filter((z) => z.pressureBlanket < BOIL_WATER_PSI).length;
  const freezing = dripping > 0;

  return (
    <section aria-label="Water pressure by zone">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Water pressure</p>
      <ul className="mt-3 space-y-3">
        {plan.zones.map((z) => {
          const safe = z.pressurePlan >= BOIL_WATER_PSI;
          return (
            <li key={z.zoneId}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-text">{z.neighborhood}</span>
                <span className={`font-mono tabular-nums ${safe ? "text-text" : "text-danger"}`}>{Math.round(z.pressurePlan)} psi</span>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-border">
                {/* boil-water zone */}
                <div className="absolute inset-y-0 left-0 rounded-l-full bg-danger/25" style={{ width: pct(BOIL_WATER_PSI) }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-150" style={{ width: pct(z.pressurePlan) }} />
                {freezing && (
                  <div
                    className="absolute -inset-y-1 w-0.5 rounded bg-danger"
                    style={{ left: pct(z.pressureBlanket) }}
                    title={`If everyone dripped: ${Math.round(z.pressureBlanket)} psi`}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        {freezing ? (
          <>
            Plan: <span className="text-text">{dripping.toLocaleString()} homes drip one tap</span>. If everyone dripped,{" "}
            <span className="text-danger">
              {blanketFails} of {plan.zones.length} zones
            </span>{" "}
            would drop below {BOIL_WATER_PSI} psi (red tick).
          </>
        ) : (
          <>No drips needed this hour. Pressure is comfortably above {BOIL_WATER_PSI} psi.</>
        )}
      </p>
    </section>
  );
}
