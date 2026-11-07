"use client";

import { BOIL_WATER_PSI, type CityPlan } from "@/lib/planner";

const MAX_PSI = 60;
const pct = (psi: number) => `${(Math.min(MAX_PSI, Math.max(0, psi)) / MAX_PSI) * 100}%`;

/** Water pressure per area with the plan, the 20 psi line, and (during a freeze) where a blanket "everyone drip" would land. */
export default function PressureGauge({ plan }: { plan: CityPlan }) {
  const freezing = plan.zones.some((z) => z.dripping > 0);

  return (
    <section aria-labelledby="pressure-heading">
      <h3 id="pressure-heading" className="text-sm font-medium text-muted">
        Water pressure by area
      </h3>
      <ul className="mt-4 space-y-4">
        {plan.zones.map((z) => {
          const safe = z.pressurePlan >= BOIL_WATER_PSI;
          return (
            <li key={z.zoneId}>
              <div className="flex items-baseline justify-between text-sm">
                <span>{z.neighborhood}</span>
                <span className={`font-mono tabular-nums ${safe ? "text-text" : "text-danger"}`}>{Math.round(z.pressurePlan)} psi</span>
              </div>
              <div className="relative mt-2 h-1.5 rounded-full bg-border">
                <div className="absolute inset-y-0 left-0 rounded-full bg-text/70 transition-[width] duration-150" style={{ width: pct(z.pressurePlan) }} />
                {/* 20 psi boil-water line */}
                <div className="absolute -inset-y-1.5 w-px bg-danger/70" style={{ left: pct(BOIL_WATER_PSI) }} aria-hidden />
                {freezing && (
                  <div
                    className="absolute -inset-y-1 w-1 -translate-x-1/2 rounded-full bg-danger"
                    style={{ left: pct(z.pressureBlanket) }}
                    title={`If everyone dripped: ${Math.round(z.pressureBlanket)} psi`}
                    aria-hidden
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Thin red line: {BOIL_WATER_PSI} psi, the boil-water limit.
        {freezing && " Red dot: where pressure would fall if everyone dripped."}
      </p>
    </section>
  );
}
