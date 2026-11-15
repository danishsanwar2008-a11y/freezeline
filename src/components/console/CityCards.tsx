"use client";

// City Operations cards. Officials' third-person wording only. One big headline per card,
// every number has a visual, details collapsed underneath.

import { useEffect, useMemo, useState, useRef } from "react";
import type { HomeStatus } from "@/lib/household";
import { CREW_TRIP } from "@/lib/crewTrip";
import { minutesLeft } from "@/lib/route";
import { STATUS_LABEL } from "@/lib/cityWording";
import { STATUS_BG, STATUS_RGB } from "@/lib/riskScale";
import type { OpsCrew } from "./useOps";
import { plural, verb } from "@/lib/plural";
import Panel, { Chevron } from "./Panel";

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

/** A quiet 12px spinner in a box's header while newer numbers load ("Updating" for screen readers; no layout shift). */
function Refreshing({ on }: { on: boolean }) {
  return (
    <span role="status" title={on ? "Updating" : undefined} className={`flex size-4 items-center justify-center text-muted transition-opacity duration-150 ease-[var(--ease)] ${on ? "opacity-100" : "opacity-0"}`}>
      {on && (
        <>
          <svg viewBox="0 0 12 12" className="size-3 animate-spin motion-reduce:animate-none" aria-hidden>
            <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
            <path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Updating</span>
        </>
      )}
    </span>
  );
}

export function HomesContacted({
  counts,
  total,
  funnel,
  ran,
  loading = false,
  refreshing = false,
  lowHomes,
}: {
  /** Homes needing action this hour, by status. */
  counts: Record<HomeStatus, number>;
  /** Homes needing action this hour (Watch or High). */
  total: number;
  funnel: { texted: number; called: number; doorChecks: number; neighborFlags: number };
  ran: boolean;
  /** Nothing to show yet: this hour's outreach is still loading. */
  loading?: boolean;
  /** Numbers are showing and a newer copy is on its way (after an approval): keep them, show a quiet note. */
  refreshing?: boolean;
  lowHomes: number;
}) {
  const steps = [
    { label: "Texted", n: funnel.texted },
    { label: "Called", n: funnel.called },
    { label: "Door check", n: funnel.doorChecks },
  ];
  return (
    <Card title="Homes contacted (sample)" tone="glass" action={<Refreshing on={refreshing} />}>
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
      <p className={`mt-3 text-[13px] ${ran || loading ? "text-muted" : "text-text"}`}>
        {loading
          ? "Loading this hour’s outreach…"
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

/** Still driving: the real-time drive hasn't reached the home yet (src/lib/route.ts). */
export function isHeading(c: OpsCrew, now: number): boolean {
  return !!c.assignment && minutesLeft(c.assignment, now) > 0;
}

/** What a crew is doing, in two short lines (officials' wording). */
export function crewStatus(c: OpsCrew, now: number): { line: string; detail: string } {
  const a = c.assignment;
  if (!a) return { line: "On standby", detail: `At the ${c.area} depot` };
  return isHeading(c, now)
    ? { line: `Heading to ${a.street}`, detail: `${a.miles.toFixed(1)} mi · ~${minutesLeft(a, now)} min left` }
    : { line: `Helping a home on ${a.street}`, detail: a.needs };
}

/** "Crew 7 · Heading to W 11th St · 1.2 mi · ~6 min left" (one line, for logs and labels). */
export function crewLine(c: OpsCrew, now: number): string {
  const st = crewStatus(c, now);
  return `${c.name} · ${st.line} · ${st.detail}`;
}

/** The crew's number in a hairline disc (the accent stays on the dot strip and the map). */
function CrewDisc({ id, active }: { id: number; active: boolean }) {
  return (
    <span
      className={`flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-medium tabular-nums ${active ? "border-accent text-text" : "border-border text-muted"}`}
      aria-hidden
    >
      {id}
    </span>
  );
}

const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/** Area picker: hover or click opens the areas; keyboard works (Enter/Space opens, Escape closes). */
function AreaPicker({
  areas,
  value,
  onChange,
}: {
  areas: { id: string; name: string; busy: number; total: number }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // A mouse opens the menu on hover; the click that follows must not close it again.
  const hoverOpenedAt = useRef(0);
  const current = areas.find((x) => x.id === value);
  return (
    <div
      className="relative"
      onMouseEnter={() => {
        if (window.matchMedia(FINE_POINTER).matches && !open) {
          hoverOpenedAt.current = Date.now();
          setOpen(true);
        }
      }}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => (o && Date.now() - hoverOpenedAt.current < 800 ? true : !o))}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-bg px-3 text-[13px] font-medium text-text transition-colors hover:border-accent"
      >
        {current?.name ?? "Area"}
        <Chevron open={!open} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 w-48 pt-1">
          <ul
            role="menu"
            aria-label="Show crews for"
            className="callout-enter overflow-hidden rounded-lg border border-white/10 bg-bg py-1 shadow-lg"
            style={{ transformOrigin: "top right" }}
          >
            {areas.map((x) => (
              <li key={x.id} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={x.id === value}
                  onClick={() => {
                    onChange(x.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface ${x.id === value ? "text-text" : "text-muted"}`}
                >
                  {x.name}
                  <span className="font-mono text-xs tabular-nums text-muted">{x.busy}/{x.total} busy</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CrewsPanel({
  crews,
  queue,
  queueByArea,
  now,
  selectedCrew,
  onSelectCrew,
}: {
  crews: OpsCrew[];
  /** All areas together. */
  queue: number;
  /** Per area (zone id): each area's crews only take that area's homes. */
  queueByArea: Record<string, number>;
  now: number;
  selectedCrew: number | null;
  onSelectCrew: (id: number) => void;
}) {
  const working = crews.filter((c) => c.assignment);
  const areas = useMemo(() => {
    const by = new Map<string, { id: string; name: string; busy: number; total: number }>();
    for (const c of crews) {
      const id = c.zone_id ?? c.area;
      const x = by.get(id) ?? { id, name: c.area, busy: 0, total: 0 };
      x.total++;
      if (c.assignment) x.busy++;
      by.set(id, x);
    }
    return [...by.values()];
  }, [crews]);
  const [picked, setPicked] = useState<string | null>(null);
  // The selected crew's area wins (clicking a crew on the map shows its area), then the official's pick.
  const selectedArea = crews.find((c) => c.id === selectedCrew)?.zone_id;
  const area = selectedArea ?? picked ?? areas[0]?.id ?? "";
  const shown = crews.filter((c) => (c.zone_id ?? c.area) === area);
  const areaName = areas.find((x) => x.id === area)?.name ?? "this area";
  const areaQueue = queueByArea[area] ?? 0;

  return (
    <Card title="Crews (sample)" action={areas.length > 0 ? <AreaPicker areas={areas} value={area} onChange={setPicked} /> : undefined}>
      <p className="stat">
        {working.length} <span className="stat-unit">of {crews.length} crews helping</span>
      </p>
      {/* One dot per crew: filled = on a job. */}
      <div className="mt-2 flex flex-wrap gap-1" role="img" aria-label={`${working.length} of ${crews.length} crews on a job`}>
        {crews.map((c) => (
          <span key={c.id} className={`size-2 rounded-full ${c.assignment ? "bg-accent" : "border border-border"}`} />
        ))}
      </div>
      {shown.length > 0 && (
        <ul className="mt-3 space-y-1" aria-label={`Crews in ${areaName}`}>
          {shown.map((c) => {
            const st = crewStatus(c, now);
            const sel = c.id === selectedCrew;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelectCrew(c.id)}
                  aria-pressed={sel}
                  className={`flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${sel ? "bg-bg ring-1 ring-accent" : "hover:bg-bg"}`}
                >
                  <CrewDisc id={c.id} active={!!c.assignment} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug text-text">
                      {c.name} · {st.line}
                    </span>
                    <span className="block text-xs leading-snug text-muted">{st.detail}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {crews.length === 0 && <p className="mt-3 text-[13px] text-muted">Crews appear once this hour’s outreach has run.</p>}
      <p className={`mt-3 text-[13px] ${areaQueue > 0 ? "text-text" : "text-muted"}`}>
        {areaQueue > 0
          ? `${plural(areaQueue, "home")} in ${areaName} ${verb(areaQueue, "waits", "wait")} for a crew, highest risk first.`
          : `No homes in ${areaName} waiting for a crew.`}
        {queue > areaQueue && <span className="text-muted"> {plural(queue, "home")} waiting in all areas.</span>}
      </p>
      <p className="mt-1 text-xs text-muted">
        Crews stay in their own area and only go to homes whose call says they can’t do the steps themselves. Routes follow that area’s streets; {CREW_TRIP.mph} mph on icy roads
        and {CREW_TRIP.jobMinutes} min on site are simulated.
      </p>
    </Card>
  );
}

/** The crew's quick view on the map (pointing at the crew). */
export function CrewQuickView({ crew, now }: { crew: OpsCrew; now: number }) {
  const a = crew.assignment;
  const st = crewStatus(crew, now);
  const heading = isHeading(crew, now);
  return (
    <div className="mt-2.5 space-y-2 text-[13px]">
      <p className="leading-snug">{st.line}</p>
      {a ? (
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-md bg-bg px-2 py-1.5">
            <p className="text-[11px] text-muted">Distance</p>
            <p className="font-mono text-sm tabular-nums">{a.miles.toFixed(1)} mi</p>
          </div>
          <div className="rounded-md bg-bg px-2 py-1.5">
            <p className="text-[11px] text-muted">{heading ? "Arrives in" : "Arrived"}</p>
            <p className="font-mono text-sm tabular-nums">{heading ? `~${minutesLeft(a, now)} min` : "On site"}</p>
          </div>
          <div className="rounded-md bg-bg px-2 py-1.5">
            <p className="text-[11px] text-muted">From</p>
            <p className="truncate text-sm">{crew.area}</p>
          </div>
        </div>
      ) : (
        <p className="text-muted">Waiting at the {crew.area} depot for the next home that needs a crew.</p>
      )}
      {a && <p className="text-xs leading-snug text-muted">Household: {a.needs}</p>}
      <p className="text-[11px] text-muted">
        {a && !a.routed ? "Straight-line estimate (no street route found)" : "Route on real streets"} · timing simulated
      </p>
    </div>
  );
}

// ---------- House quick view (pinned to the house on the map) ----------

interface HomeSummary {
  label: string;
  street: string;
  neighborhood: string;
  status: HomeStatus;
  statusLabel: string;
  assessment: string | null;
  confidence: "confirmed" | "estimated" | null;
  flaggedByNeighbor: boolean;
  crew: string | null;
  crewId: number | null;
  assessmentKey: string | null;
  contact: string | null;
  replied: boolean;
  repliedBy: "text" | "call" | null;
  doorCheck: boolean;
}

/** One line on what is happening at this house right now (officials' wording). */
export function happeningLine(s: HomeSummary, crew: OpsCrew | undefined, now: number): string {
  if (crew?.assignment) {
    const left = minutesLeft(crew.assignment, now);
    return left > 0 ? `${crew.name} on the way · ~${left} min` : `${crew.name} is helping on site`;
  }
  switch (s.assessmentKey) {
    case "ready":
      return `Replied by ${s.repliedBy ?? "text"} · steps done`;
    case "needs_reminder":
      return `Replied by ${s.repliedBy ?? "text"} · still doing the steps`;
    case "needs_crew":
      return "Needs a crew · waiting for a free crew";
    case "waiting":
      return "Texted · no reply yet; a call is queued";
    case "no_answer":
      return s.doorCheck ? "No answer to text or call · door check planned" : "No answer to text or call";
    default:
      return s.contact ? "Not contacted yet" : "No outreach for this hour yet";
  }
}

/** The house quick view's body; the Callout around it points at the house. */
export function HomeQuickView({
  homeId,
  time,
  level,
  crews,
  now,
}: {
  homeId: string;
  /** Replay time (null: no outreach to look up). */
  time: string | null;
  level: string;
  crews: OpsCrew[];
  now: number;
}) {
  const [data, setData] = useState<{ key: string; s: HomeSummary | null; error?: string } | null>(null);
  const key = `${homeId}|${time}`;
  useEffect(() => {
    if (!time) return;
    const ctrl = new AbortController();
    fetch(`/api/ops/home?id=${encodeURIComponent(homeId)}&time=${encodeURIComponent(time)}`, { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        setData({ key, s: d as HomeSummary });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setData({ key, s: null, error: e.message });
      });
    return () => ctrl.abort();
  }, [homeId, time, key]);
  const s = data?.key === key ? data.s : null;
  const crew = crews.find((c) => c.assignment?.home_id === homeId);

  if (!time) return <p className="mt-2 text-[13px] text-muted">Outreach runs on the Uri replay in this phase.</p>;
  if (data?.key === key && data.error) return <p className="mt-2 text-[13px] text-danger">Couldn’t load this house: {data.error}</p>;
  if (!s) return <p className="mt-2 text-[13px] text-muted">Loading…</p>;

  const confirmed = s.confidence === "confirmed";
  return (
    <div className="mt-2.5 space-y-2 text-[13px]">
      <p className={`rounded-md border px-2.5 py-2 leading-snug ${confirmed || crew ? "border-white/15 text-text" : "border-dashed border-white/25 text-muted"}`}>
        {happeningLine(s, crew, now)}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-md bg-bg px-2 py-1.5">
          <p className="text-[11px] text-muted">Status</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm">
            <span className={`size-2.5 shrink-0 rounded-full ${STATUS_BG[s.status]}`} aria-hidden />
            {s.statusLabel}
          </p>
        </div>
        <div className="rounded-md bg-bg px-2 py-1.5">
          <p className="text-[11px] text-muted">Level</p>
          <p className="mt-0.5 text-sm">{level}</p>
        </div>
      </div>
      {s.assessment && (
        <p className="text-xs leading-snug text-muted">
          {s.assessment} · {confirmed ? "confirmed on a call (sample)" : "estimated, no answer yet"}
        </p>
      )}
      {s.flaggedByNeighbor && <p className="text-xs text-muted">A neighbor asked for a check on this home.</p>}
    </div>
  );
}
