"use client";

// City Operations cards. Officials' third-person wording only. One big headline per card,
// every number has a visual, details collapsed underneath.

import { useEffect, useState } from "react";
import type { HomeStatus } from "@/lib/household";
import { STATUS_LABEL } from "@/lib/cityWording";
import { STATUS_BG, STATUS_ORDER, STATUS_RGB } from "@/lib/riskScale";
import { BOIL_WATER_PSI, type CityPlan } from "@/lib/planner";
import type { WeatherHour } from "@/lib/weather";
import type { OpsCrew } from "./useOps";
import type { AgentEntry } from "./useAgent";
import { fmtF, formatHour } from "./format";

export function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-panel border border-border bg-bg/40 p-4 ${className}`}>
      <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const rgb = (s: HomeStatus) => `rgb(${STATUS_RGB[s].join(" ")})`;

// ---------- Ready check ----------

export function ReadyCheck({ counts, total, ran, lowHomes }: { counts: Record<HomeStatus, number>; total: number; ran: boolean; lowHomes: number }) {
  return (
    <Card title="Ready check">
      <p className="text-3xl font-semibold tracking-tight tabular-nums">
        {counts.ready.toLocaleString()} <span className="text-lg font-normal text-muted">of {total.toLocaleString()} homes ready</span>
      </p>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-border" role="img" aria-label="Homes by status">
        {STATUS_ORDER.map((s) =>
          counts[s] ? (
            <div
              key={s}
              className={`h-full ${s === "no_answer" ? "border-y border-text/40" : ""}`}
              style={{ width: `${(counts[s] / Math.max(1, total)) * 100}%`, background: rgb(s) }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {STATUS_ORDER.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className={`size-2.5 shrink-0 rounded-full ${STATUS_BG[s]}`} aria-hidden />
            <span className="text-muted">{STATUS_LABEL[s]}</span>
            <span className="ml-auto font-mono tabular-nums">{counts[s].toLocaleString()}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        {ran ? "Homes that need action tonight. " : "Outreach hasn't run for this hour yet. "}
        {lowHomes.toLocaleString()} low-risk homes need no action.
      </p>
    </Card>
  );
}

// ---------- Outreach funnel ----------

export function OutreachFunnel({ texted, called, doorChecks, neighborFlags }: { texted: number; called: number; doorChecks: number; neighborFlags: number }) {
  const rows = [
    { label: "Texted", n: texted },
    { label: "Called", n: called },
    { label: "Door check", n: doorChecks },
  ];
  return (
    <Card title="Outreach (sample)">
      <ol className="space-y-2.5">
        {rows.map((r, k) => (
          <li key={r.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span>
                {k > 0 && <span className="mr-1 text-muted" aria-hidden>→</span>}
                {r.label}
              </span>
              <span className="font-mono tabular-nums">{r.n.toLocaleString()}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-border">
              <div className="h-full rounded-full bg-accent/70" style={{ width: `${texted ? (r.n / texted) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ol>
      {neighborFlags > 0 && <p className="mt-3 text-xs text-muted">{neighborFlags.toLocaleString()} homes flagged by a neighbor moved up the call list.</p>}
    </Card>
  );
}

// ---------- Crews ----------

/** A crew is "heading" for the first 90 s after assignment, then "helping". */
export const HEADING_MS = 90_000;

export function crewLine(c: OpsCrew, now: number): string {
  if (!c.assignment) return `${c.name} · On standby`;
  const heading = now - Date.parse(c.assignment.assigned_at) < HEADING_MS;
  return heading ? `${c.name} · Heading to ${c.assignment.street}` : `${c.name} · Helping a home on ${c.assignment.street} (${c.assignment.needs})`;
}

function CrewIcon({ id, active }: { id: number; active: boolean }) {
  return (
    <span
      className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? "bg-accent text-bg" : "border border-border text-muted"}`}
      aria-hidden
    >
      {id}
    </span>
  );
}

export function CrewsPanel({
  crews,
  queue,
  now,
  proposals,
  canApprove,
  approving,
  onApprove,
}: {
  crews: OpsCrew[];
  queue: number;
  now: number;
  proposals: AgentEntry[];
  canApprove: (e: AgentEntry) => boolean;
  approving: string | null;
  onApprove: (e: AgentEntry) => void;
}) {
  const busy = crews.filter((c) => c.assignment).length;
  return (
    <Card title="Help crews (sample)">
      <p className="text-2xl font-semibold tracking-tight">
        {busy} of {crews.length} <span className="text-base font-normal text-muted">crews helping</span>
      </p>
      <ul className="mt-3 space-y-2">
        {crews.map((c) => (
          <li key={c.id} className="flex items-start gap-3 text-sm">
            <CrewIcon id={c.id} active={!!c.assignment} />
            <span className="pt-1 leading-snug">{crewLine(c, now)}</span>
          </li>
        ))}
      </ul>
      {proposals.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {proposals.map((p) => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 leading-snug">
                <span className="text-muted">Proposed: </span>
                {p.summary.replace(/^Assign /, "").replace(/\.$/, "")}
              </span>
              {canApprove(p) ? (
                <button
                  type="button"
                  onClick={() => onApprove(p)}
                  disabled={approving === p.id}
                  className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-medium text-bg disabled:opacity-60"
                >
                  {approving === p.id ? "Assigning…" : "Approve"}
                </button>
              ) : (
                <span className="shrink-0 text-xs text-muted">After earlier steps</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">
        {queue > 0 ? `${queue.toLocaleString()} more homes need a crew and wait in the queue, highest risk first.` : "No homes waiting for a crew."} Crews only go to homes whose
        call says they can&apos;t do the steps themselves.
      </p>
    </Card>
  );
}

// ---------- Two futures ----------

export function TwoFutures({ plan }: { plan: CityPlan }) {
  const Tile = ({ psi, good, area }: { psi: number; good: boolean; area: string }) => (
    <div className={`rounded-md px-2.5 py-2 ${good ? "bg-ok/15" : "bg-danger/15"}`}>
      <p className="truncate text-[11px] text-muted">{area}</p>
      <p className={`font-mono text-base font-semibold tabular-nums ${good ? "text-ok" : "text-danger"}`}>
        {Math.round(psi)} psi {good ? "✓" : "✗"}
      </p>
    </div>
  );
  return (
    <Card title="Water pressure: two futures">
      <div className="grid grid-cols-2 gap-2">
        <p className="text-xs font-medium text-danger">Everyone drips</p>
        <p className="text-xs font-medium text-ok">FreezeLine</p>
        {plan.zones.map((z) => (
          <div key={z.zoneId} className="contents">
            <Tile psi={z.pressureBlanket} good={z.pressureBlanket >= BOIL_WATER_PSI} area={z.neighborhood} />
            <Tile psi={z.pressurePlan} good={z.pressurePlan >= BOIL_WATER_PSI} area={z.neighborhood} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Below {BOIL_WATER_PSI} psi, Texas requires a boil-water notice.</p>
    </Card>
  );
}

// ---------- Freeze readings ----------

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
const THERMO = "M14 14.76V3.5a2 2 0 1 0-4 0v11.26a4 4 0 1 0 4 0Z";
const WIND = "M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7";
const CLOCK = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2";

export function FreezeReadings({ w, hoursBelow20 }: { w: WeatherHour; hoursBelow20: number }) {
  const tiles = [
    { icon: THERMO, label: "Now", value: fmtF(w.temperature_f) },
    { icon: THERMO, label: "Feels like", value: fmtF(w.apparent_temperature_f) },
    { icon: WIND, label: "Wind", value: `${Math.round(w.wind_speed_mph)} mph` },
    { icon: CLOCK, label: "Below 20°F", value: `${hoursBelow20} h` },
  ];
  return (
    <Card title={`Freeze readings · ${formatHour(w.time)}`}>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="flex items-center gap-2.5 rounded-md bg-surface px-3 py-2">
            <Icon d={t.icon} />
            <div>
              <p className="text-[11px] text-muted">{t.label}</p>
              <p className="font-mono text-sm font-semibold tabular-nums">{t.value}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------- Home summary (map overlay) ----------

interface HomeSummary {
  label: string;
  neighborhood: string;
  status: HomeStatus;
  statusLabel: string;
  assessment: string | null;
  confidence: "confirmed" | "estimated" | null;
  flaggedByNeighbor: boolean;
  crew: string | null;
}

export function HomeSummaryCard({ homeId, time, level, onClose }: { homeId: string; time: string | null; level: string; onClose: () => void }) {
  const [data, setData] = useState<{ id: string; s: HomeSummary } | null>(null);
  useEffect(() => {
    if (!time) return;
    const ctrl = new AbortController();
    fetch(`/api/ops/home?id=${encodeURIComponent(homeId)}&time=${encodeURIComponent(time)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((s) => setData({ id: homeId, s }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [homeId, time]);
  const s = data?.id === homeId ? data.s : null;

  return (
    <div className="panel-enter w-72 rounded-panel border border-border bg-surface/95 p-4 shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{s?.label ?? "…"}</p>
          <p className="text-xs text-muted">{s?.neighborhood}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md px-1.5 text-muted hover:text-text" aria-label="Close">
          ×
        </button>
      </div>
      {s && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-bg px-2.5 py-2">
              <p className="text-muted">Status</p>
              <p className="mt-0.5 flex items-center gap-1.5 font-medium">
                <span className={`size-2.5 rounded-full ${STATUS_BG[s.status]}`} aria-hidden />
                {s.statusLabel}
              </p>
            </div>
            <div className="rounded-md bg-bg px-2.5 py-2">
              <p className="text-muted">Level</p>
              <p className="mt-0.5 font-medium">{level}</p>
            </div>
            <div className="col-span-2 rounded-md bg-bg px-2.5 py-2">
              <p className="text-muted">Crew</p>
              <p className="mt-0.5 font-medium">{s.crew ? `${s.crew} assigned` : "None assigned"}</p>
            </div>
          </div>
          {s.assessment && (
            <p className={`mt-2 rounded-md border px-2.5 py-2 text-xs leading-snug ${s.confidence === "confirmed" ? "border-border" : "border-dashed border-border text-muted"}`}>
              {s.assessment}
              <span className="block text-[11px] text-muted">{s.confidence === "confirmed" ? "Confirmed on a call (sample)" : "Estimated, no answer yet"}</span>
            </p>
          )}
          {s.flaggedByNeighbor && <p className="mt-2 text-xs text-muted">A neighbor asked for a check on this home.</p>}
          <a
            href={`/console/home/${encodeURIComponent(homeId)}${time ? `?t=${time}` : ""}`}
            className="mt-3 block rounded-full bg-accent px-3 py-2 text-center text-sm font-semibold text-bg transition hover:brightness-110"
          >
            Open in Homeowner tab →
          </a>
        </>
      )}
    </div>
  );
}
