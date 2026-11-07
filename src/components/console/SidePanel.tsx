"use client";

import { homeContext, type ConsoleHome, type HexBin, type ReplayModel } from "@/lib/replay";
import type { RiskLevel } from "@/lib/risk";
import { RISK_GRADIENT } from "@/lib/riskScale";
import { fmtF, formatHour } from "./format";
import PressureGauge from "./PressureGauge";
import AreaPanel from "./AreaPanel";
import PlanCard from "./PlanCard";
import type { CityPlan } from "@/lib/planner";

const LEVELS: { level: RiskLevel; token: string }[] = [
  { level: "High", token: "bg-risk-high" },
  { level: "Medium", token: "bg-risk-mid" },
  { level: "Low", token: "bg-risk-low" },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{children}</p>;
}

function ConditionsReadout({ model, hour }: { model: ReplayModel; hour: number }) {
  const w = model.hours[hour];
  const ctx = model.contexts[hour];
  return (
    <section>
      <p className="font-mono text-sm text-accent tabular-nums">{formatHour(w.time)}</p>
      <div className="mt-3 flex items-end gap-4">
        <p className="font-mono text-5xl font-medium leading-none tabular-nums">{fmtF(w.temperature_f)}</p>
        <div className="pb-0.5 font-mono text-xs leading-5 text-muted tabular-nums">
          <p>feels {fmtF(w.apparent_temperature_f)}</p>
          <p>wind {w.wind_speed_mph.toFixed(0)} mph</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        <span className="font-mono text-text tabular-nums">{ctx.hoursBelow20}</span> hours below 20°F so far
      </p>
    </section>
  );
}

function LevelCounts({ counts, total }: { counts: [number, number, number]; total: number }) {
  return (
    <section>
      <SectionLabel>Homes by risk</SectionLabel>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-border" aria-hidden>
        {LEVELS.map(({ level, token }, i) => (
          <div key={level} className={`${token} transition-[width] duration-150`} style={{ width: `${(counts[i] / total) * 100}%` }} />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {LEVELS.map(({ level, token }, i) => (
          <div key={level} className="rounded-panel border border-border bg-bg/60 px-3 py-2">
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <span className={`size-2 rounded-full ${token}`} aria-hidden />
              {level}
            </dt>
            <dd className="mt-1 font-mono text-xl tabular-nums">{counts[i].toLocaleString()}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RiskLegend() {
  return (
    <section>
      <SectionLabel>Hex color · average home risk</SectionLabel>
      <div className="mt-2 h-2 rounded-full" style={{ background: RISK_GRADIENT }} aria-hidden />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
        <span>0</span>
        <span>30 · Medium</span>
        <span>60 · High</span>
        <span>100</span>
      </div>
    </section>
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
  if (selectedHome !== null)
    return (
      <aside key={`home-${selectedHome}`} className="panel-enter min-h-0 border-border bg-surface p-6 lg:h-full lg:w-[420px] lg:shrink-0 lg:overflow-y-auto lg:border-l">
        <PlanCard home={homes[selectedHome]} plan={plan.homes[selectedHome]} weather={homeContext(model, homes[selectedHome], hour)} onBack={onCloseHome} />
      </aside>
    );
  if (selectedHex)
    return (
      <aside className="flex min-h-0 flex-col border-border bg-surface p-6 lg:h-full lg:w-[420px] lg:shrink-0 lg:border-l">
        <AreaPanel hex={selectedHex} homes={homes} plan={plan} onBack={onClearHex} onSelectHome={onSelectHome} />
      </aside>
    );
  return (
    <aside className="flex min-h-0 flex-col gap-6 border-border bg-surface p-5 lg:h-full lg:w-[420px] lg:shrink-0 lg:overflow-y-auto lg:border-l">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-accent">FREEZELINE</p>
          <h1 className="mt-0.5 text-base font-semibold">Utility console</h1>
        </div>
        <p className="text-right text-[11px] leading-4 text-muted">
          Winter Storm Uri replay
          <br />
          Houston · {homes.length.toLocaleString()} homes
        </p>
      </header>
      <div className="freeze-rule -mt-2" />
      <ConditionsReadout model={model} hour={hour} />
      <LevelCounts counts={model.counts[hour]} total={homes.length} />
      <PressureGauge plan={plan} />
      <RiskLegend />
      <p className="rounded-panel border border-dashed border-border px-4 py-5 text-center text-sm text-muted">
        Click an area on the map to see who needs to act.
      </p>
    </aside>
  );
}
