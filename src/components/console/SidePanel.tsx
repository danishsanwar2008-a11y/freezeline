"use client";

import { useMemo } from "react";
import type { ConsoleHome, HexBin, ReplayModel } from "@/lib/replay";
import { scoreHome, type RiskLevel } from "@/lib/risk";
import { RISK_GRADIENT, riskCss } from "@/lib/riskScale";
import { fmtF, formatHour } from "./format";
import PressureGauge from "./PressureGauge";
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

function HexHomesList({ hex, homes, model, hour, onClose }: { hex: HexBin; homes: ConsoleHome[]; model: ReplayModel; hour: number; onClose: () => void }) {
  const rows = useMemo(
    () =>
      hex.homeIdx
        .map((i) => ({ home: homes[i], risk: scoreHome(homes[i], model.contexts[hour]) }))
        .sort((a, b) => b.risk.score - a.risk.score),
    [hex, homes, model, hour],
  );
  return (
    <section className="flex min-h-[300px] flex-1 flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <SectionLabel>Selected hex</SectionLabel>
          <p className="mt-1 text-sm">
            {hex.neighborhood} · {rows.length} homes · avg{" "}
            <span className="font-mono tabular-nums">{Math.round(hex.avg[hour])}</span>
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-muted hover:bg-border hover:text-text">
          Clear
        </button>
      </div>
      <ul className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {rows.map(({ home, risk }) => (
          <li key={home.id} className="rounded-panel border border-border bg-bg/60 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-mono text-xs text-text">{home.label.replace("Simulated Home ", "")}</p>
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums">
                <span className="size-2 rounded-full" style={{ background: riskCss(risk.score) }} aria-hidden />
                {risk.score} · {risk.level}
              </span>
            </div>
            <p className="mt-1 text-xs leading-snug text-muted">
              {risk.why} <span className="text-muted/70">· built {home.year_built}</span>
            </p>
          </li>
        ))}
      </ul>
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
}

export default function SidePanel({ model, homes, plan, hour, selectedHex, onClearHex }: Props) {
  return (
    <aside className="flex min-h-0 flex-col gap-6 border-border bg-surface p-5 lg:h-dvh lg:w-[380px] lg:shrink-0 lg:overflow-y-auto lg:border-l">
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
      {selectedHex ? (
        <HexHomesList hex={selectedHex} homes={homes} model={model} hour={hour} onClose={onClearHex} />
      ) : (
        <p className="rounded-panel border border-dashed border-border px-4 py-5 text-center text-sm text-muted">
          Click a hex on the map to list its homes, scores and why.
        </p>
      )}
    </aside>
  );
}
