"use client";

// City Operations cards. Officials' third-person wording only. One big headline per card,
// every number has a visual, details collapsed underneath.

import { useEffect, useState } from "react";
import type { HomeStatus } from "@/lib/household";
import { CREW_TRIP } from "@/lib/crewTrip";
import { STATUS_LABEL } from "@/lib/cityWording";
import { STATUS_BG, STATUS_ORDER, STATUS_RGB } from "@/lib/riskScale";
import type { WeatherHour } from "@/lib/weather";
import type { OpsCrew } from "./useOps";
import { plural, verb } from "@/lib/plural";
import type { AgentEntry } from "./useAgent";
import { fmtF, formatHour } from "./format";
import Panel from "./Panel";

/** A floating box (see Panel.tsx). The id remembers its collapsed state for the session. */
export function Card({
  title,
  tone = "solid",
  action,
  children,
  className = "",
}: {
  title: string;
  tone?: "solid" | "glass";
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <Panel id={id} title={title} tone={tone} action={action} className={className}>
      {children}
    </Panel>
  );
}

const rgb = (s: HomeStatus) => `rgb(${STATUS_RGB[s].join(" ")})`;

// ---------- Ready check ----------

export function ReadyCheck({
  counts,
  total,
  ran,
  loading = false,
  live = false,
  lowHomes,
}: {
  counts: Record<HomeStatus, number>;
  total: number;
  ran: boolean;
  /** This hour's outreach is still loading. */
  loading?: boolean;
  /** Live forecast mode: outreach runs on the replay only. */
  live?: boolean;
  lowHomes: number;
}) {
  return (
    <Card title="Ready check">
      <p className="stat">
        {counts.ready.toLocaleString("en-US")} <span className="stat-unit">of {plural(total, "home")} ready</span>
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
            <span className="ml-auto font-mono tabular-nums">{counts[s].toLocaleString("en-US")}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        {loading
          ? "Loading this hour’s outreach… "
          : live
            ? "Outreach runs on the Uri replay in this phase. "
            : ran
              ? "Homes that need action tonight. "
              : "Outreach hasn’t run for this hour yet. Run the agent below to text these homes. "}
        {plural(lowHomes, "low-risk home")} {verb(lowHomes, "needs", "need")} no action.
      </p>
    </Card>
  );
}

// ---------- Outreach funnel ----------

export function OutreachFunnel({
  texted,
  called,
  doorChecks,
  neighborFlags,
  live = false,
}: {
  texted: number;
  called: number;
  doorChecks: number;
  neighborFlags: number;
  live?: boolean;
}) {
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
              <span className="font-mono tabular-nums">{r.n.toLocaleString("en-US")}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-border">
              <div className="h-full rounded-full bg-accent/70" style={{ width: `${texted ? (r.n / texted) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ol>
      {texted === 0 && (
        <p className="mt-3 text-xs text-muted">
          {live ? "Outreach runs on the Uri replay in this phase." : "No texts yet for this hour. The agent texts Watch and High homes first."}
        </p>
      )}
      {neighborFlags > 0 && <p className="mt-3 text-xs text-muted">{plural(neighborFlags, "home")} flagged by a neighbor moved up the call list.</p>}
    </Card>
  );
}

// ---------- Crews ----------

/** On screen, one simulated minute of driving takes this long, so a 6-minute drive animates for 30 s. */
export const MS_PER_DRIVE_MINUTE = 5_000;
export const headingMs = (minutes: number) => minutes * MS_PER_DRIVE_MINUTE;

/** Still driving: assigned this replay hour and the on-screen drive hasn't finished. */
export function isHeading(c: OpsCrew, now: number): boolean {
  const a = c.assignment;
  return !!a && a.hoursAgo === 0 && now - Date.parse(a.assigned_at) < headingMs(a.minutes);
}

/** "Crew 7 · Heading to W 11th St · 1.2 mi · ~6 min" / "Crew 3 · On standby · Heights". */
export function crewLine(c: OpsCrew, now: number): string {
  const a = c.assignment;
  if (!a) return `${c.name} · On standby · ${c.area}`;
  const from = a.otherArea ? ` · from ${c.area}` : "";
  return isHeading(c, now)
    ? `${c.name} · Heading to ${a.street} · ${a.miles.toFixed(1)} mi · ~${a.minutes} min${from}`
    : `${c.name} · Helping a home on ${a.street} (${a.needs}) · ${a.miles.toFixed(1)} mi${from}`;
}

function CrewIcon({ id, active }: { id: number; active: boolean }) {
  return (
    <span
      className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? "bg-btn text-on-btn" : "border border-border text-muted"}`}
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
  const working = crews.filter((c) => c.assignment);
  const standby = crews.filter((c) => !c.assignment);
  return (
    <Card title="Help crews (sample)">
      <p className="stat">
        {working.length} <span className="stat-unit">of {crews.length} crews helping</span>
      </p>
      {/* One dot per crew: filled = on a job. */}
      <div className="mt-2 flex flex-wrap gap-1" role="img" aria-label={`${working.length} of ${crews.length} crews on a job`}>
        {crews.map((c) => (
          <span key={c.id} className={`size-2.5 rounded-full ${c.assignment ? "bg-accent" : "border border-border"}`} />
        ))}
      </div>
      {working.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Crews on a job">
          {working.map((c) => (
            <li key={c.id} className="flex items-start gap-3 text-sm">
              <CrewIcon id={c.id} active />
              <span className="pt-1 leading-snug">{crewLine(c, now)}</span>
            </li>
          ))}
        </ul>
      )}
      {standby.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-x-3 gap-y-1 text-xs text-muted sm:grid-cols-2" aria-label="Crews on standby">
          {standby.map((c) => (
            <li key={c.id} className="truncate">
              {crewLine(c, now)}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Distance by road (straight line × {CREW_TRIP.roadFactor}) at {CREW_TRIP.mph} mph, {CREW_TRIP.jobMinutes} min on site (simulated). Nearest free crew in
        the same area goes first; if none is free there, the nearest crew from another area.
      </p>
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
                  className="btn btn-primary btn-sm shrink-0"
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
        {queue > 0 ? `${plural(queue, "more home")} ${verb(queue, "needs a crew and waits", "need a crew and wait")} in the queue, highest risk first.` : "No homes waiting for a crew."} Crews only go to homes whose
        call says they can’t do the steps themselves.
      </p>
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
          <div key={t.label} className="flex items-center gap-2.5 rounded-md bg-bg px-3 py-2">
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
        </>
      )}
    </div>
  );
}
