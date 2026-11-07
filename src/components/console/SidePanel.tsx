"use client";

import { useEffect, useRef } from "react";
import { homeContext, type ConsoleHome, type HexBin, type ReplayModel } from "@/lib/replay";
import type { CityPlan } from "@/lib/planner";
import { LEVEL_BG } from "@/lib/riskScale";
import type { DisplayLevel } from "@/lib/steps";
import { fmtF, formatHour } from "./format";
import { AreaBreakdown, ComparisonCard } from "./PressureCompare";
import { compareFutures } from "@/lib/summary";
import AreaPanel from "./AreaPanel";
import PlanCard from "./PlanCard";

const LEGEND: DisplayLevel[] = ["Low", "Watch", "High"];

/** City view, readable in 3 seconds: two futures, then the one action. */
function CityPanel({ model, plan, hour, agent }: { model: ReplayModel; plan: CityPlan; hour: number; agent?: React.ReactNode }) {
  const w = model.hours[hour];
  const { needMessage } = compareFutures(plan);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <p className="font-mono text-sm text-muted tabular-nums">
        {formatHour(w.time)} · <span className="text-text">{fmtF(w.temperature_f)}</span>
      </p>
      <ComparisonCard plan={plan} />
      <p className="text-lg font-medium">
        {needMessage > 0 ? (
          <>
            Send the drip plan to <span className="text-accent">{needMessage.toLocaleString()} homes</span>.
          </>
        ) : (
          <span className="text-muted">No homes need a message right now.</span>
        )}
      </p>
      {agent}
      <AreaBreakdown plan={plan} />
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
  /** Agent controls for the city view. */
  agent?: React.ReactNode;
  /** Replay time for homeowner-page links (null in Live mode). */
  replayTime: string | null;
}

export default function SidePanel({ model, homes, plan, hour, selectedHex, onClearHex, onSelectHome, selectedHome, onCloseHome, agent, replayTime }: Props) {
  const view = selectedHome !== null ? `home-${selectedHome}` : selectedHex ? `area-${selectedHex.h3}` : "city";
  const ref = useRef<HTMLElement>(null);

  // New view: start at the top, and on phones bring the panel into view below the map.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = 0;
    if (view === "city" || window.innerWidth >= 1024) return;
    // Phones: bring the panel top (headline included) into view below the map.
    // scroll-margin-top (scroll-mt-2) keeps an 8px gap so the headline is never clipped.
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [view]);

  return (
    <aside
      ref={ref}
      key={view}
      className="panel-enter flex min-h-0 scroll-mt-2 flex-col border-border bg-surface p-6 lg:h-full lg:w-[420px] lg:shrink-0 lg:overflow-y-auto lg:border-l"
    >
      {selectedHome !== null ? (
        <PlanCard home={homes[selectedHome]} plan={plan.homes[selectedHome]} weather={homeContext(model, homes[selectedHome], hour)} onBack={onCloseHome} replayTime={replayTime} />
      ) : selectedHex ? (
        <AreaPanel hex={selectedHex} homes={homes} plan={plan} onBack={onClearHex} onSelectHome={onSelectHome} />
      ) : (
        <CityPanel model={model} plan={plan} hour={hour} agent={agent} />
      )}
    </aside>
  );
}
