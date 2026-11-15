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
import TopBar, { type AgentControls } from "./TopBar";
import { useSessionFlag } from "./useSessionFlag";
import DecisionTrace from "./DecisionTrace";
import { useAgent } from "./useAgent";
import { statusAt, useOps } from "./useOps";
import { CrewQuickView, CrewsPanel, HomeQuickView, HomesContacted } from "./CityCards";
import { alongPath, driveFraction, minutesLeft, onJob } from "@/lib/route";
import type { CrewMarker, PinnedCallout } from "./RiskMap";

// WebGL map is browser-only.
const RiskMap = dynamic(() => import("./RiskMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-surface/40" />,
});

const URI_HOURS = (uri as WeatherSeries).hours;
const ZONE_HOURS = Object.fromEntries(
  Object.entries((uriNeighborhoods as unknown as { zones: Record<string, WeatherSeries> }).zones).map(([id, s]) => [id, s.hours]),
);
// 0.2× the old pace (Agentation note): 700 ms per replay hour, the full 168 hours ≈ 2 min.
const MS_PER_HOUR = 700;

/** Plan per replay hour, computed once per hour and reused (map + pressure monitor). */
function cachedPlanner(zones: ConsoleZone[], homes: ConsoleHome[], model: ReplayModel): (h: number) => CityPlan {
  const cache = new Map<number, CityPlan>();
  return (h) => {
    let p = cache.get(h);
    if (!p) cache.set(h, (p = planCity(zones, homes, model.vuln, zoneExposures(model, h))));
    return p;
  };
}

function ConsoleBody({
  homes,
  zones,
  model,
  startHour,
  agent,
}: {
  homes: ConsoleHome[];
  zones: ConsoleZone[];
  model: ReplayModel;
  startHour: number;
  agent: ReturnType<typeof useAgent>;
}) {
  const [panelsHidden, setPanelsHidden] = useSessionFlag("panels-hidden", false);
  const hours = model.hours;
  const last = hours.length - 1;
  const [hour, setHour] = useState(startHour);
  const [playing, setPlaying] = useState(false);
  const [focusHex, setFocusHex] = useState<string | null>(null);
  const [selectedHome, setSelectedHome] = useState<number | null>(null);
  const [selectedCrew, setSelectedCrew] = useState<number | null>(null);
  const selectHome = useCallback((i: number | null) => {
    setSelectedCrew(null);
    setSelectedHome(i);
  }, []);
  const selectCrew = useCallback((id: number | null) => {
    setSelectedHome(null);
    setSelectedCrew(id);
  }, []);
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

  // The timeline only replays the storm (weather, cells, pressure). Outreach (home colours, Homes
  // contacted, crews driving) comes alive only once Run agent is clicked on this page: until then every
  // home stays "not contacted", even for hours an earlier session already ran. A reload starts over.
  // After Run agent, the outreach view stays on the hour it ran (runHour): moving the timeline then
  // replays only the weather, cells and pressure, and never swaps in results an older session saved
  // for another hour. Run agent again at another hour to move the outreach view there.
  const [runHour, setRunHour] = useState<number | null>(null);
  const runTime = runHour === null ? null : hours[runHour].time;
  // Outreach statuses + crews for the run's hour (saved by the agent; gray until it runs).
  const live = !!agent && runTime !== null;
  const ops = useOps(live ? runTime : null, agent?.version ?? 0);
  const data = live ? ops.data : null;
  const statusOf = useCallback((i: number): HomeStatus => statusAt(data, i), [data]);
  // Homes contacted counts the homes that needed action at the run's hour (its plan), not the needle's.
  const runPlan = useMemo(() => (runHour === null ? plan : planFor(runHour)), [runHour, plan, planFor]);

  const counts = useMemo(() => {
    const c: Record<HomeStatus, number> = { ready: 0, needs_help: 0, waiting: 0, no_answer: 0, not_contacted: 0 };
    let total = 0;
    runPlan.homes.forEach((p, i) => {
      if (p.level === "Low") return;
      total++;
      c[statusAt(data, i)]++;
    });
    return { c, total };
  }, [runPlan, data]);


  // Crews drive in real time from the moment they were dispatched (CREW_TIME_SCALE in src/lib/crewTrip.ts), so they
  // keep moving whether the replay plays or pauses and never jump when the hour changes. The vehicles themselves
  // move frame by frame (CrewVehicles.tsx); this one-second clock counts the minutes down, trims the route line and
  // puts a crew back on standby once its real-time drive and visit are over.
  const [tick, setNow] = useState(() => Date.now());
  const now = Math.max(tick, ops.at); // advance to the moment fresh data arrived
  const crewsData = useMemo(
    () => (data?.crews ?? []).map((c) => (c.assignment && !onJob(c.assignment, now) ? { ...c, assignment: null } : c)),
    [data, now],
  );
  const anyOnJob = crewsData.some((c) => c.assignment);
  useEffect(() => {
    if (!anyOnJob) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyOnJob]);
  const crewMarkers = useMemo<CrewMarker[]>(
    () =>
      crewsData.map((c) => {
        const depot: [number, number] = [c.depot_lng, c.depot_lat];
        const base = { id: c.id, name: c.name, depot };
        if (!c.assignment) return { ...base, position: depot, rest: null, minutesLeft: 0, job: null };
        const a = c.assignment;
        const t = driveFraction(a, now);
        const route = a.route?.length ? a.route : [depot, [a.lng, a.lat] as [number, number]];
        const { position, rest } = alongPath(route, t);
        return {
          ...base,
          position,
          rest: t < 1 ? rest : null,
          minutesLeft: minutesLeft(a, now),
          job: { route, assigned_at: a.assigned_at, minutes: a.minutes, street: a.street },
        };
      }),
    [crewsData, now],
  );

  // Anything that waits for approval (always a Stage 2 alert) is approved in the decision trace.
  const traceTime = runTime ?? time;
  const run = runTime ? agent?.runs[runTime] : undefined;
  const entries = run?.entries ?? [];

  const selectHex = useCallback((h3: string | null) => {
    setFocusHex(h3);
    setSelectedHome(null);
    setSelectedCrew(null);
  }, []);

  // The selected house's quick view, pinned to the house on the map.
  const homeCallout = useMemo<PinnedCallout | null>(() => {
    if (selectedHome === null) return null;
    const h = homes[selectedHome];
    return {
      key: `home-${h.id}`,
      lngLat: [h.lng, h.lat],
      title: h.label,
      subtitle: `${h.neighborhood} · household details simulated`,
      body: <HomeQuickView homeId={h.id} time={traceTime} level={displayLevel(runPlan.homes[selectedHome].level)} crews={crewsData} now={now} />,
      onClose: () => setSelectedHome(null),
    };
  }, [selectedHome, homes, traceTime, runPlan, crewsData, now]);

  // The selected crew's quick view, pinned to the crew on the map.
  const crewCallout = useMemo<PinnedCallout | null>(() => {
    const c = crewsData.find((x) => x.id === selectedCrew);
    const m = crewMarkers.find((x) => x.id === selectedCrew);
    if (!c || !m) return null;
    return {
      key: `crew-${c.id}`,
      lngLat: m.position,
      crewId: c.id,
      title: c.name,
      subtitle: `${c.area} crew (sample)`,
      body: <CrewQuickView crew={c} now={now} />,
      onClose: () => setSelectedCrew(null),
    };
  }, [crewsData, crewMarkers, selectedCrew, now]);

  const agentControls: AgentControls = {
    running: run?.status === "running",
    onRun: () => {
      setRunHour(hour);
      agent?.run(time);
    },
  };

  return (
    <>
      <TopBar agent={agentControls} panelsHidden={panelsHidden} onTogglePanels={() => setPanelsHidden(!panelsHidden)} />
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
            onSelectHome={selectHome}
            selectedCrew={selectedCrew}
            onSelectCrew={selectCrew}
            callout={crewCallout ?? homeCallout}
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
          <div
            // Bottom left under the left column (Agentation note: 702 × ~91 px), never under the right column.
            className={`absolute inset-x-3 bottom-3 ${panelsHidden ? "" : "lg:right-[364px] xl:right-auto xl:w-[702px] xl:max-w-[calc(100%-416px)]"}`}
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

        {/* Left column (see-through boxes): map key, homes contacted. It stops 12px above the timeline (91px). */}
        <div
          className={`${panelsHidden ? "hidden" : "flex"} no-scrollbar flex-col gap-3 p-3 lg:absolute lg:left-3 lg:top-3 lg:max-h-[calc(100%-1.5rem-103px)] lg:w-[280px] lg:overflow-y-auto lg:p-0 xl:w-[300px]`}
        >
          <MapLegend />
          <HomesContacted
            counts={counts.c}
            total={counts.total}
            funnel={data?.funnel ?? { texted: 0, called: 0, doorChecks: 0, neighborFlags: 0 }}
            ran={!!data?.ran}
            loading={live && !data && !ops.error}
            refreshing={live && !!data && !ops.fresh && !ops.error}
            lowHomes={homes.length - counts.total}
          />
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
            agentReady={!!agent}
          />
          <CrewsPanel
            crews={crewsData}
            queue={data?.crewQueue ?? 0}
            queueByArea={data?.crewQueueByArea ?? {}}
            now={now}
            selectedCrew={selectedCrew}
            onSelectCrew={selectCrew}
          />
          <DecisionTrace
            time={traceTime}
            run={run}
            onApprove={(e) => agent?.approve(traceTime, e)}
            onSkip={(e) => agent?.skip(traceTime, e)}
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

export default function ConsoleShell({ homes, zones }: { homes: ConsoleHome[]; zones: ConsoleZone[] }) {
  // The console replays Winter Storm Uri only (the Live forecast mode was removed).
  const agent = useAgent();
  const replayModel = useMemo(() => buildReplay(homes, URI_HOURS, ZONE_HOURS), [homes]);

  return (
    <div className="console-theme flex min-h-dvh flex-col bg-bg text-text lg:h-dvh lg:overflow-hidden">
      <ConsoleBody homes={homes} zones={zones} model={replayModel} startHour={0} agent={agent} />
    </div>
  );
}
