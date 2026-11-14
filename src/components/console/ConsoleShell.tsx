"use client";

// City Operations: officials only. The map, the cells and the metrics, in third-person wording.
// No transcripts or homeowner instructions: households are reached only by texts and calls.

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import uri from "../../../data/uri-2021.json";
import uriNeighborhoods from "../../../data/uri-2021-neighborhoods.json";
import { buildReplay, homeContext, zoneExposures, type ConsoleHome, type ReplayModel } from "@/lib/replay";
import { explainHex } from "@/lib/hexWhy";
import type { WeatherSeries } from "@/lib/weather";
import type { ConsoleZone } from "@/lib/homes";
import { planCity, type CityPlan } from "@/lib/planner";
import { extraTapFlags, pressureMonitor } from "@/lib/pressure";
import PressureMonitor from "./PressureMonitor";
import { displayLevel } from "@/lib/steps";
import type { HomeStatus } from "@/lib/household";
import MapLegend from "./MapLegend";
import Timeline from "./Timeline";
import TopBar, { type AgentControls, type Mode } from "./TopBar";
import { useSessionFlag } from "./useSessionFlag";
import AgentPanel from "./AgentPanel";
import { useAgent } from "./useAgent";
import { statusAt, useOps } from "./useOps";
import { useLiveForecast } from "./useLiveForecast";
import { houstonNowHour } from "./format";
import { CrewsPanel, HomeSummaryCard, OutreachFunnel, ReadyCheck, headingMs, isHeading } from "./CityCards";
import type { CrewMarker } from "./RiskMap";

// WebGL map is browser-only.
const RiskMap = dynamic(() => import("./RiskMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-surface/40" />,
});

const URI_HOURS = (uri as WeatherSeries).hours;
const ZONE_HOURS = Object.fromEntries(
  Object.entries((uriNeighborhoods as unknown as { zones: Record<string, WeatherSeries> }).zones).map(([id, s]) => [id, s.hours]),
);
const MS_PER_HOUR = 140; // full 168-hour replay ≈ 24 s

/** Plan per replay hour, computed once per hour and reused (map + pressure monitor). */
function cachedPlanner(zones: ConsoleZone[], homes: ConsoleHome[], model: ReplayModel): (h: number) => CityPlan {
  const cache = new Map<number, CityPlan>();
  return (h) => {
    let p = cache.get(h);
    if (!p) cache.set(h, (p = planCity(zones, homes, model.vuln, zoneExposures(model, h))));
    return p;
  };
}

function ModeMessage({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-base font-medium">{title}</p>
        {children && <div className="mt-2 text-sm text-muted">{children}</div>}
      </div>
    </div>
  );
}

function ConsoleBody({
  homes,
  zones,
  model,
  startHour,
  agent,
  mode,
  onMode,
}: {
  homes: ConsoleHome[];
  zones: ConsoleZone[];
  model: ReplayModel;
  startHour: number;
  /** Present in Replay mode only (the agent runs on the Uri replay). */
  agent?: ReturnType<typeof useAgent>;
  mode: Mode;
  onMode: (m: Mode) => void;
}) {
  const [panelsHidden, setPanelsHidden] = useSessionFlag("panels-hidden", false);
  const hours = model.hours;
  const last = hours.length - 1;
  const [hour, setHour] = useState(startHour);
  const [playing, setPlaying] = useState(false);
  const [focusHex, setFocusHex] = useState<string | null>(null);
  const [selectedHome, setSelectedHome] = useState<number | null>(null);
  const time = hours[hour].time;

  const atEnd = hour >= last;
  useEffect(() => {
    if (!playing || atEnd) return;
    const id = setInterval(() => setHour((h) => Math.min(last, h + 1)), MS_PER_HOUR);
    return () => clearInterval(id);
  }, [playing, atEnd, last]);

  const isPlaying = playing && !atEnd;
  const togglePlay = useCallback(() => {
    if (isPlaying) return setPlaying(false);
    if (atEnd) setHour(0);
    setPlaying(true);
  }, [isPlaying, atEnd]);

  const scrub = useCallback((h: number) => {
    setPlaying(false);
    setHour(h);
  }, []);

  // Space = play/pause, arrows = step one hour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement && t.type !== "range") return;
      if (e.code === "Space" && !(t instanceof HTMLButtonElement)) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight" && !(t instanceof HTMLInputElement)) {
        scrub(Math.min(last, hour + 1));
      } else if (e.key === "ArrowLeft" && !(t instanceof HTMLInputElement)) {
        scrub(Math.max(0, hour - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, scrub, hour, last]);

  // Deterministic drip plan per hour (cached: the pressure monitor also reads the past 12 hours).
  const planFor = useMemo(() => cachedPlanner(zones, homes, model), [zones, homes, model]);
  const plan = useMemo(() => planFor(hour), [planFor, hour]);

  // Pressure monitor: past + next 12 hours per area, and Stage 2 proposals (same math as the agent).
  const extraTaps = useMemo(() => extraTapFlags(homes), [homes]);
  const pressure = useMemo(
    () =>
      pressureMonitor({
        zones,
        homes,
        extra: extraTaps,
        hour,
        hours: hours.length,
        planAt: planFor,
        exposureAt: (h) => zoneExposures(model, h),
      }),
    [zones, homes, extraTaps, hour, hours.length, planFor, model],
  );
  const times = useMemo(() => hours.map((h) => h.time), [hours]);

  // Hex shading: share of homes that need action tonight (Watch or High).
  const need = useMemo(
    () => Float32Array.from(model.hexes, (hx) => hx.homeIdx.filter((i) => plan.homes[i].level !== "Low").length / hx.homeIdx.length),
    [model, plan],
  );
  // "Why this shade?": the cell's share + top 2 reasons (real weather, simulated home details).
  const explain = useCallback(
    (k: number) => {
      const hx = model.hexes[k];
      return explainHex(hx.homeIdx, homes, (i) => plan.homes[i].level, homeContext(model, { zone_id: hx.zoneId }, hour));
    },
    [model, homes, plan, hour],
  );

  // Outreach statuses + crews for this hour (saved by the agent; gray until it runs).
  const ops = useOps(agent ? time : null, agent?.version ?? 0);
  const data = agent ? ops.data : null;
  const statusOf = useCallback((i: number): HomeStatus => statusAt(data, i), [data]);

  const counts = useMemo(() => {
    const c: Record<HomeStatus, number> = { ready: 0, needs_help: 0, waiting: 0, no_answer: 0, not_contacted: 0 };
    let total = 0;
    plan.homes.forEach((p, i) => {
      if (p.level === "Low") return;
      total++;
      c[statusAt(data, i)]++;
    });
    return { c, total };
  }, [plan, data]);

  // Live counts for the map key: every dot on the map, by status.
  const dotCounts = useMemo(() => {
    const c: Record<HomeStatus, number> = { ready: 0, needs_help: 0, waiting: 0, no_answer: 0, not_contacted: 0 };
    for (let i = 0; i < homes.length; i++) c[statusAt(data, i)]++;
    return c;
  }, [homes, data]);

  // Crew positions: driving from the depot for the trip's drive time (scaled on screen), then at the home.
  // Jobs from an earlier replay hour are already on site.
  const [tick, setNow] = useState(() => Date.now());
  const now = Math.max(tick, ops.at); // advance to the moment fresh data arrived
  const crewsData = useMemo(() => data?.crews ?? [], [data]);
  const anyHeading = crewsData.some((c) => isHeading(c, now));
  useEffect(() => {
    if (!anyHeading) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyHeading]);
  const crewMarkers = useMemo<CrewMarker[]>(
    () =>
      crewsData.map((c) => {
        const depot: [number, number] = [c.depot_lng, c.depot_lat];
        if (!c.assignment) return { id: c.id, position: depot, target: null };
        const a = c.assignment;
        const home: [number, number] = [a.lng, a.lat];
        const t = a.hoursAgo > 0 ? 1 : Math.min(1, (now - Date.parse(a.assigned_at)) / headingMs(a.minutes));
        const pos: [number, number] = [depot[0] + (home[0] - depot[0]) * t, depot[1] + (home[1] - depot[1]) * t];
        return { id: c.id, position: pos, target: t < 1 ? home : null };
      }),
    [crewsData, now],
  );

  // Pending crew proposals from the agent (Approve-first mode) are approved from the Crews panel.
  const run = agent?.runs[time];
  const entries = run?.entries ?? [];
  const firstPending = entries.find((e) => e.status === "pending")?.id;
  const crewProposals = entries.filter((e) => e.tool === "propose_crew" && e.status === "pending");

  const selectHex = useCallback((h3: string | null) => {
    setFocusHex(h3);
    setSelectedHome(null);
  }, []);

  const agentControls: AgentControls = {
    enabled: !!agent,
    running: run?.status === "running",
    mode: agent?.mode ?? "auto",
    onMode: (m) => agent?.setMode(m),
    onRun: () => agent?.run(time),
  };

  return (
    <>
      <TopBar mode={mode} onMode={onMode} agent={agentControls} panelsHidden={panelsHidden} onTogglePanels={() => setPanelsHidden(!panelsHidden)} />
      <div className="relative flex min-h-0 flex-1 flex-col lg:block">
        <main className="relative h-[58svh] min-h-[400px] lg:absolute lg:inset-0 lg:h-auto">
          <RiskMap
            hexes={model.hexes}
            need={need}
            homes={homes}
            statusOf={statusOf}
            statusKey={data?.statuses ?? ""}
            crews={crewMarkers}
            explain={explain}
            focusHex={focusHex}
            selectedHome={selectedHome}
            onSelectHex={selectHex}
            onSelectHome={setSelectedHome}
          />
          {focusHex && (
            <button
              type="button"
              onClick={() => selectHex(null)}
              className="glass absolute left-1/2 top-3 -translate-x-1/2 px-4 py-1.5 text-sm font-medium text-accent-ink"
            >
              ← All areas
            </button>
          )}
          {selectedHome !== null && (
            <div className="absolute left-1/2 top-14 -translate-x-1/2">
              <HomeSummaryCard
                homeId={homes[selectedHome].id}
                time={agent ? time : null}
                level={displayLevel(plan.homes[selectedHome].level)}
                onClose={() => setSelectedHome(null)}
              />
            </div>
          )}
          <div
            className={`absolute inset-x-3 bottom-3 ${panelsHidden ? "lg:inset-x-3" : "lg:left-[304px] lg:right-[364px] xl:left-[324px] xl:right-[404px]"}`}
          >
            <Timeline
              hours={hours}
              hour={hour}
              playing={isPlaying}
              onHour={scrub}
              onTogglePlay={togglePlay}
              hoursBelow20={model.contexts[hour].hoursBelow20}
            />
          </div>
        </main>

        {/* Left column (see-through boxes): map key, homes contacted. */}
        <div
          className={`${panelsHidden ? "hidden" : "flex"} no-scrollbar flex-col gap-3 p-3 lg:absolute lg:left-3 lg:top-3 lg:max-h-[calc(100%-1.5rem)] lg:w-[280px] lg:overflow-y-auto lg:p-0 xl:w-[300px]`}
        >
          <MapLegend counts={dotCounts} />
          <ReadyCheck counts={counts.c} total={counts.total} ran={!!data?.ran} loading={!!agent && !ops.fresh && !ops.error} live={!agent} lowHomes={homes.length - counts.total} />
          <OutreachFunnel {...(data?.funnel ?? { texted: 0, called: 0, doorChecks: 0, neighborFlags: 0 })} live={!agent} />
        </div>

        {/* Right column (solid boxes): pressure, crews, decision trace (fills the rest). */}
        <div
          className={`${panelsHidden ? "hidden" : "flex"} no-scrollbar flex-col gap-3 p-3 lg:absolute lg:bottom-3 lg:right-3 lg:top-3 lg:w-[340px] lg:overflow-y-auto lg:p-0 xl:w-[380px]`}
        >
          <PressureMonitor
            areas={pressure}
            hour={hour}
            times={times}
            stage2Entries={entries.filter((e) => e.tool === "send_stage2_alert")}
            canApprove={(e) => e.id === firstPending}
            approving={agent?.approving ?? null}
            onApprove={(e) => agent?.approve(time, e)}
            onSkip={(e) => agent?.skip(time, e)}
            agentReady={!!agent}
          />
          <CrewsPanel
            crews={crewsData}
            queue={data?.crewQueue ?? 0}
            now={now}
            proposals={crewProposals}
            canApprove={(e) => e.id === firstPending}
            approving={agent?.approving ?? null}
            onApprove={(e) => agent?.approve(time, e)}
          />
          <AgentPanel
            time={time}
            enabled={!!agent}
            run={run}
            mode={agent?.mode ?? "auto"}
            onApprove={(e) => agent?.approve(time, e)}
            onSkip={(e) => agent?.skip(time, e)}
            approving={agent?.approving ?? null}
          />
          {ops.error && (
            <p role="alert" className="box px-3 py-2 text-xs text-danger">
              Couldn’t load this hour’s outreach: {ops.error}. Move the timeline or reload to try again.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/** Top bar while the live forecast loads (no map yet, so the agent is off). */
function IdleTopBar({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  const [panelsHidden, setPanelsHidden] = useSessionFlag("panels-hidden", false);
  const idle: AgentControls = { enabled: false, running: false, mode: "auto", onMode: () => {}, onRun: () => {} };
  return <TopBar mode={mode} onMode={onMode} agent={idle} panelsHidden={panelsHidden} onTogglePanels={() => setPanelsHidden(!panelsHidden)} />;
}

export default function ConsoleShell({ homes, zones }: { homes: ConsoleHome[]; zones: ConsoleZone[] }) {
  const [mode, setMode] = useState<Mode>("replay");
  const agent = useAgent();
  const replayModel = useMemo(() => buildReplay(homes, URI_HOURS, ZONE_HOURS), [homes]);
  const live = useLiveForecast(mode === "live");
  const liveSeries = live.state.status === "ready" ? live.state.series : null;
  const liveModel = useMemo(() => (liveSeries ? buildReplay(homes, liveSeries.hours) : null), [homes, liveSeries]);
  const liveStart = useMemo(() => {
    if (!liveSeries) return 0;
    const now = houstonNowHour();
    return Math.max(0, liveSeries.hours.findIndex((h) => h.time >= now));
  }, [liveSeries]);

  return (
    <div className="console-theme flex min-h-dvh flex-col bg-bg text-text lg:h-dvh lg:overflow-hidden">
      {mode === "replay" ? (
        <ConsoleBody key="replay" homes={homes} zones={zones} model={replayModel} startHour={0} agent={agent} mode={mode} onMode={setMode} />
      ) : liveModel ? (
        <ConsoleBody key="live" homes={homes} zones={zones} model={liveModel} startHour={liveStart} mode={mode} onMode={setMode} />
      ) : (
        <>
          <IdleTopBar mode={mode} onMode={setMode} />
          {live.state.status === "error" ? (
            <ModeMessage title="Couldn’t load the live forecast">
              <p>{live.state.message}</p>
              <button type="button" onClick={live.retry} className="btn btn-primary mt-4">
                Try again
              </button>
            </ModeMessage>
          ) : (
            <ModeMessage title="Loading the live forecast…" />
          )}
        </>
      )}
    </div>
  );
}
