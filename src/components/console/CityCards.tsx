"use client";

// City Operations cards. Officials' third-person wording only. One big headline per card,
// every number has a visual, details collapsed underneath.

import { useEffect, useState } from "react";
import type { HomeStatus } from "@/lib/household";
import { CREW_TRIP } from "@/lib/crewTrip";
import { STATUS_LABEL } from "@/lib/cityWording";
import { STATUS_BG, STATUS_RGB } from "@/lib/riskScale";
import type { OpsCrew } from "./useOps";
import { plural, verb } from "@/lib/plural";
import type { AgentEntry } from "./useAgent";
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

// ---------- Homes contacted (outreach + ready check in one box) ----------

/** Status order inside the box: what's settled first, then what still needs a hand. */
const CONTACT_ORDER: HomeStatus[] = ["ready", "waiting", "needs_help", "no_answer", "not_contacted"];

export function HomesContacted({
  counts,
  total,
  funnel,
  ran,
  loading = false,
  live = false,
  lowHomes,
}: {
  /** Homes needing action this hour, by status. */
  counts: Record<HomeStatus, number>;
  /** Homes needing action this hour (Watch or High). */
  total: number;
  funnel: { texted: number; called: number; doorChecks: number; neighborFlags: number };
  ran: boolean;
  /** This hour's outreach is still loading. */
  loading?: boolean;
  /** Live forecast mode: outreach runs on the replay only. */
  live?: boolean;
  lowHomes: number;
}) {
  const steps = [
    { label: "Texted", n: funnel.texted },
    { label: "Called", n: funnel.called },
    { label: "Door check", n: funnel.doorChecks },
  ];
  return (
    <Card title="Homes contacted (sample)" tone="glass">
      <p className="stat">
        {funnel.texted.toLocaleString("en-US")} <span className="stat-unit">{funnel.texted === 1 ? "home" : "homes"} contacted</span>
      </p>
      {/* One bar for the homes that need action this hour, split by status (2px gaps between segments). */}
      <div className="mt-2.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${plural(total, "home")} needing action, by status`}>
        {CONTACT_ORDER.map((s) =>
          counts[s] ? (
            <div
              key={s}
              className={`h-full first:rounded-l-full last:rounded-r-full ${s === "no_answer" ? "ring-1 ring-inset ring-text/40" : ""}`}
              style={{ width: `${(counts[s] / Math.max(1, total)) * 100}%`, background: rgb(s) }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-2.5 space-y-1 text-[13px]">
        {CONTACT_ORDER.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className={`size-2.5 shrink-0 rounded-full ${STATUS_BG[s]}`} aria-hidden />
            <span className="text-text">{STATUS_LABEL[s]}</span>
            <span className="ml-auto font-mono tabular-nums text-text">{counts[s].toLocaleString("en-US")}</span>
          </li>
        ))}
      </ul>
      <ol className="mt-3 grid grid-cols-3 gap-1.5" aria-label="Outreach steps">
        {steps.map((st, k) => (
          <li key={st.label} className="rounded-md bg-bg px-2 py-1.5">
            <p className="text-[11px] text-muted">
              {k > 0 && <span aria-hidden>→ </span>}
              {st.label}
            </p>
            <p className="font-mono text-sm tabular-nums">{st.n.toLocaleString("en-US")}</p>
            <div className="mt-1 h-1 rounded-full bg-border">
              <div className="h-full rounded-full bg-accent" style={{ width: `${funnel.texted ? (st.n / funnel.texted) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ol>
      <p className={`mt-3 text-[13px] ${ran || loading || live ? "text-muted" : "text-text"}`}>
        {loading
          ? "Loading this hour’s outreach…"
          : live
            ? "Outreach runs on the Uri replay in this phase."
            : ran
              ? `${plural(lowHomes, "low-risk home")} ${verb(lowHomes, "needs", "need")} no action.`
              : `Outreach hasn’t run for this hour yet. Run the agent to text the ${plural(total, "home")} that need action.`}
      </p>
      {funnel.neighborFlags > 0 && (
        <p className="mt-1 text-xs text-muted">{plural(funnel.neighborFlags, "home")} flagged by a neighbor moved up the call list.</p>
      )}
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
