"use client";

import { useEffect, useRef } from "react";
import { homeContext, type ConsoleHome, type HexBin, type ReplayModel } from "@/lib/replay";
import { BOIL_WATER_PSI, type CityPlan } from "@/lib/planner";
import { LEVEL_BG } from "@/lib/riskScale";
import type { DisplayLevel } from "@/lib/steps";
import { fmtF, formatHour } from "./format";
import PressureGauge from "./PressureGauge";
import AreaPanel from "./AreaPanel";
import PlanCard from "./PlanCard";

const LEGEND: DisplayLevel[] = ["Low", "Watch", "High"];

/** City view: one idea. Who acts tonight, and that the plan keeps the water on. */
function CityPanel({ model, plan, hour }: { model: ReplayModel; plan: CityPlan; hour: number }) {
  const w = model.hours[hour];
  const dripping = plan.zones.reduce((s, z) => s + z.dripping, 0);
  const protectOnly = plan.homes.filter((h) => h.level !== "Low" && h.action === "no_drip").length;
  const safeZones = plan.zones.filter((z) => z.pressurePlan >= BOIL_WATER_PSI).length;
  const allSafe = safeZones === plan.zones.length;

  let headline: React.ReactNode;
  if (dripping > 0)
    headline = (
      <>
        <span className="text-accent">{dripping.toLocaleString()} homes</span> should drip one tap tonight. Everyone else: don&apos;t drip.
      </>
    );
  else if (protectOnly > 0)
    headline = (
      <>
        <span className="text-accent">{protectOnly.toLocaleString()} homes</span> should protect their pipes tonight. Nobody needs to drip.
      </>
    );
  else headline = <>No freeze risk right now. Nobody needs to drip.</>;

  return (
    <div className="flex flex-1 flex-col gap-8">
      <p className="font-mono text-sm text-muted tabular-nums">
        {formatHour(w.time)} · <span className="text-text">{fmtF(w.temperature_f)}</span>
      </p>
      <div>
        <h2 className="text-2xl font-semibold leading-snug tracking-tight">{headline}</h2>
        <p className={`mt-3 text-sm leading-relaxed ${allSafe ? "text-muted" : "text-danger"}`}>
          {allSafe
            ? `That keeps water pressure above ${BOIL_WATER_PSI} psi in all ${plan.zones.length} areas, so nobody has to boil their water.`
            : `${plan.zones.length - safeZones} of ${plan.zones.length} areas would fall below ${BOIL_WATER_PSI} psi.`}
        </p>
      </div>
      <PressureGauge plan={plan} />
      <div className="mt-auto space-y-3 border-t border-border pt-5">
        <p className="text-sm">Click an area on the map to see who needs to act.</p>
        <ul className="flex gap-4 text-xs text-muted" aria-label="Map colors">
          {LEGEND.map((l) => (
            <li key={l} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${LEVEL_BG[l]}`} aria-hidden />
              {l}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface Props {
  model: ReplayModel;
  homes: ConsoleHome[];
  plan: CityPlan;
  hour: number;
  selectedHex: HexBin | null;
  onClearHex: () => void;
  onSelectHome: (idx: number) => void;
  selectedHome: number | null;
  onCloseHome: () => void;
}

export default function SidePanel({ model, homes, plan, hour, selectedHex, onClearHex, onSelectHome, selectedHome, onCloseHome }: Props) {
  const view = selectedHome !== null ? `home-${selectedHome}` : selectedHex ? `area-${selectedHex.h3}` : "city";
  const ref = useRef<HTMLElement>(null);

  // New view: start at the top, and on phones bring the panel into view below the map.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = 0;
    if (view !== "city" && window.innerWidth < 1024) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [view]);

  return (
    <aside
      ref={ref}
      key={view}
      className="panel-enter flex min-h-0 flex-col border-border bg-surface p-6 lg:h-full lg:w-[420px] lg:shrink-0 lg:overflow-y-auto lg:border-l"
    >
      {selectedHome !== null ? (
        <PlanCard home={homes[selectedHome]} plan={plan.homes[selectedHome]} weather={homeContext(model, homes[selectedHome], hour)} onBack={onCloseHome} />
      ) : selectedHex ? (
        <AreaPanel hex={selectedHex} homes={homes} plan={plan} onBack={onClearHex} onSelectHome={onSelectHome} />
      ) : (
        <CityPanel model={model} plan={plan} hour={hour} />
      )}
    </aside>
  );
}
