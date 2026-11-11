"use client";

// Water pressure per area (simplified model): headline psi, past + next 12 replay hours,
// and the Stage 2 alert card when an area's forecast falls below 25 psi. Officials' wording.

import { useState } from "react";
import { stage2Sentence, type AreaPressure, type PsiBand } from "@/lib/pressure";
import { BOIL_WATER_PSI, EXTRA_TAP_LABEL, MODEL_NOTE, STOP_NEW_DRIPS_PSI } from "@/lib/pressureConfig";
import type { AgentEntry } from "./useAgent";
import { formatHour } from "./format";

const BAND_TEXT: Record<PsiBand, string> = { ok: "text-psi-ok", warn: "text-psi-warn", bad: "text-psi-bad" };
const BAND_LABEL: Record<PsiBand, string> = {
  ok: "Above 25 psi",
  warn: "20–25 psi · no new drips",
  bad: "Below 20 psi · boil-water",
};

// One y-scale for every area, so the charts compare at a glance.
const Y_MIN = 12;
const Y_MAX = 52;
const W = 280;
const H = 84;
const PAD = { l: 2, r: 2, t: 4, b: 4 };

function InfoTip({ text, label }: { text: string; label: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted transition hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
        aria-describedby="model-note"
      >
        {label} <span aria-hidden>ⓘ</span>
      </button>
      <span
        id="model-note"
        role="tooltip"
        className="pointer-events-none absolute right-0 top-7 z-20 w-72 rounded-panel border border-border bg-surface p-3 text-xs leading-relaxed text-muted opacity-0 shadow-lg transition group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

function PressureChart({ a, hour, times }: { a: AreaPressure; hour: number; times: string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const first = a.series[0].hour;
  const last = a.series[a.series.length - 1].hour;
  const span = Math.max(1, last - first);
  const x = (h: number) => PAD.l + ((h - first) / span) * (W - PAD.l - PAD.r);
  const y = (psi: number) => PAD.t + (1 - (Math.min(Y_MAX, Math.max(Y_MIN, psi)) - Y_MIN) / (Y_MAX - Y_MIN)) * (H - PAD.t - PAD.b);
  const past = a.series.filter((p) => !p.forecast);
  const ahead = a.series.filter((p) => p.forecast || p.hour === hour);
  const path = (pts: typeof a.series) => pts.map((p, k) => `${k ? "L" : "M"}${x(p.hour).toFixed(1)},${y(p.psi).toFixed(1)}`).join("");
  const hovered = hover === null ? null : a.series.find((p) => p.hour === hover);

  return (
    <div className="relative min-w-0 flex-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[84px] w-full overflow-visible"
        role="img"
        aria-label={`${a.area}: ${Math.round(a.nowPsi)} psi now; lowest in the next 12 hours ${Math.round(a.lowest.psi)} psi.`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const h = Math.round(first + ((e.clientX - r.left) / r.width) * span);
          setHover(Math.min(last, Math.max(first, h)));
        }}
      >
        {/* thresholds */}
        <line x1={0} x2={W} y1={y(STOP_NEW_DRIPS_PSI)} y2={y(STOP_NEW_DRIPS_PSI)} stroke="var(--psi-warn)" strokeWidth={1} strokeDasharray="4 3" opacity={0.8} />
        <line x1={0} x2={W} y1={y(BOIL_WATER_PSI)} y2={y(BOIL_WATER_PSI)} stroke="var(--psi-bad)" strokeWidth={1} opacity={0.9} />
        <text x={4} y={y(STOP_NEW_DRIPS_PSI) - 3} textAnchor="start" fontSize={9} fill="var(--psi-warn)">
          Stop new drips
        </text>
        <text x={4} y={y(BOIL_WATER_PSI) + 10} textAnchor="start" fontSize={9} fill="var(--psi-bad)">
          Boil-water notice
        </text>
        {/* now */}
        <line x1={x(hour)} x2={x(hour)} y1={0} y2={H} stroke="var(--muted)" strokeWidth={1} opacity={0.5} />
        {/* past (own plans, solid) and forecast (today's drips held, dashed) */}
        <path d={path(past.concat(a.series.filter((p) => p.hour === hour)))} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        <path d={path(ahead)} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 3" strokeLinejoin="round" opacity={0.85} />
        <circle cx={x(hour)} cy={y(a.nowPsi)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        {hovered && (
          <>
            <line x1={x(hovered.hour)} x2={x(hovered.hour)} y1={0} y2={H} stroke="var(--text)" strokeWidth={1} opacity={0.35} />
            <circle cx={x(hovered.hour)} cy={y(hovered.psi)} r={4} fill="var(--text)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute -top-9 z-10 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-[11px] shadow-lg"
          style={{ left: `${(x(hovered.hour) / W) * 100}%`, transform: "translateX(-50%)" }}
        >
          <span className="text-muted">{formatHour(times[hovered.hour])}</span>{" "}
          <span className="font-mono tabular-nums">{hovered.psi.toFixed(1)} psi</span>
          <span className="text-muted">{hovered.forecast ? " · forecast" : ""}</span>
        </div>
      )}
    </div>
  );
}

function Stage2Card({
  a,
  entry,
  canApprove,
  busy,
  onApprove,
  onSkip,
}: {
  a: AreaPressure;
  entry: AgentEntry;
  canApprove: boolean;
  busy: boolean;
  onApprove: () => void;
  onSkip: () => void;
}) {
  const p = a.stage2!;
  return (
    <div className="rounded-md border border-psi-warn/60 bg-psi-warn/10 p-3" role="group" aria-label={`Stage 2 alert for ${a.area}`}>
      <p className="text-xs font-semibold text-psi-warn">Stage 2 alert ready · needs supervisor approval</p>
      <p className="mt-1 text-sm font-medium leading-snug">{stage2Sentence(p)}</p>
      {entry.reason && <p className="mt-1 text-xs leading-relaxed text-muted">{entry.reason}</p>}
      <p className="mt-1 text-[11px] text-muted">Uses the existing pre-written texts (simulated). Approval is always required, even in Auto mode.</p>
      <p className="mt-1 text-[11px] text-muted">{EXTRA_TAP_LABEL}</p>
      <div className="mt-2 flex items-center gap-2">
        {canApprove ? (
          <>
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-bg transition hover:brightness-110 disabled:opacity-60"
            >
              {busy ? "Sending…" : "Approve"}
            </button>
            <button type="button" onClick={onSkip} disabled={busy} className="rounded-full px-3 py-1 text-xs text-muted hover:text-text">
              Not yet
            </button>
          </>
        ) : (
          <span className="text-xs text-muted">Approve the agent&apos;s earlier steps first</span>
        )}
      </div>
    </div>
  );
}

export default function PressureMonitor({
  areas,
  hour,
  times,
  stage2Entries,
  canApprove,
  approving,
  onApprove,
  onSkip,
  agentReady,
}: {
  areas: AreaPressure[];
  hour: number;
  times: string[];
  /** Agent log entries for Stage 2 at this hour (pending, done or skipped). */
  stage2Entries: AgentEntry[];
  canApprove: (e: AgentEntry) => boolean;
  approving: string | null;
  onApprove: (e: AgentEntry) => void;
  onSkip: (e: AgentEntry) => void;
  /** Replay mode (the agent runs on the replay only). */
  agentReady: boolean;
}) {
  const zoneOf = (e: AgentEntry) => ((e.input as { args?: { zone_id?: string } } | undefined)?.args?.zone_id ?? null);
  const needsRun = agentReady && areas.some((a) => a.stage2) && stage2Entries.length === 0;

  return (
    <section className="rounded-panel border border-border bg-bg/40 p-4" aria-labelledby="pressure-title">
      <div className="flex items-start justify-between gap-2">
        <h3 id="pressure-title" className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          Water pressure by area
        </h3>
        <InfoTip label="Simplified model" text={MODEL_NOTE} />
      </div>

      <div className="mt-3 space-y-2">
        {stage2Entries.map((e) => {
          const a = areas.find((x) => x.zoneId === zoneOf(e));
          if (e.status === "pending" && a?.stage2)
            return (
              <Stage2Card
                key={e.id}
                a={a}
                entry={e}
                canApprove={canApprove(e)}
                busy={approving === e.id}
                onApprove={() => onApprove(e)}
                onSkip={() => onSkip(e)}
              />
            );
          return (
            <p key={e.id} className={`rounded-md border px-3 py-2 text-xs ${e.status === "done" ? "border-border" : "border-dashed border-border text-muted"}`}>
              {e.status === "done" ? e.summary : `Not sent yet. ${e.summary.replace(/^Skipped: /, "")}`}
            </p>
          );
        })}
        {needsRun && (
          <p className="rounded-md border border-dashed border-psi-warn/60 px-3 py-2 text-xs text-muted">
            The forecast falls below {STOP_NEW_DRIPS_PSI} psi in {areas.filter((a) => a.stage2).map((a) => a.area).join(", ")}. Run the agent to prepare a Stage 2
            alert for supervisor approval.
          </p>
        )}
      </div>

      <ul className="mt-3 divide-y divide-border">
        {areas.map((a) => (
          <li key={a.zoneId} className="flex items-center gap-3 py-2.5">
            <div className="w-28 shrink-0">
              <p className="truncate text-xs text-muted">{a.area}</p>
              <p className={`font-mono text-2xl font-semibold tabular-nums leading-tight ${BAND_TEXT[a.band]}`}>
                {a.nowPsi.toFixed(1)}
                <span className="ml-1 text-xs font-normal text-muted">psi</span>
              </p>
              <p className={`text-[11px] leading-tight ${BAND_TEXT[a.band]}`}>{BAND_LABEL[a.band]}</p>
            </div>
            <PressureChart a={a} hour={hour} times={times} />
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" x2="18" y1="3" y2="3" stroke="var(--psi-warn)" strokeDasharray="4 3" />
          </svg>
          {STOP_NEW_DRIPS_PSI} psi · Stop new drips
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" x2="18" y1="3" y2="3" stroke="var(--psi-bad)" />
          </svg>
          {BOIL_WATER_PSI} psi · Boil-water notice
        </span>
        <span>Past 12 h · solid · next 12 h · dashed (if today&apos;s drips continue)</span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">{EXTRA_TAP_LABEL}</p>

      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-xs font-medium text-accent marker:hidden">
          Compare: if everyone drips <span className="inline-block transition group-open:rotate-180">▾</span>
        </summary>
        <ul className="mt-2 grid grid-cols-2 gap-2">
          {areas.map((a) => {
            const band = a.blanketPsi > STOP_NEW_DRIPS_PSI ? "ok" : a.blanketPsi >= BOIL_WATER_PSI ? "warn" : "bad";
            return (
              <li key={a.zoneId} className="rounded-md bg-bg px-2.5 py-2">
                <p className="truncate text-[11px] text-muted">{a.area}</p>
                <p className={`font-mono text-base font-semibold tabular-nums ${BAND_TEXT[band]}`}>
                  {Math.round(a.blanketPsi)} psi {band === "bad" ? "✗" : "✓"}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-muted">If every home dripped two taps (the blanket message), at this hour.</p>
      </details>
    </section>
  );
}
