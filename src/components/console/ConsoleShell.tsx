"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import uri from "../../../data/uri-2021.json";
import uriNeighborhoods from "../../../data/uri-2021-neighborhoods.json";
import { buildReplay, zoneExposures, type ConsoleHome, type ReplayModel } from "@/lib/replay";
import type { WeatherSeries } from "@/lib/weather";
import type { ConsoleZone } from "@/lib/homes";
import { planCity } from "@/lib/planner";
import SidePanel from "./SidePanel";
import Timeline from "./Timeline";
import TopBar, { type Mode } from "./TopBar";
import { useLiveForecast } from "./useLiveForecast";
import { homeName, houstonNowHour } from "./format";
import type { HomeMarker } from "./RiskMap";
import { displayLevel } from "@/lib/steps";

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

function ConsoleBody({ homes, zones, model, startHour }: { homes: ConsoleHome[]; zones: ConsoleZone[]; model: ReplayModel; startHour: number }) {
  const hours = model.hours;
  const last = hours.length - 1;
  const [hour, setHour] = useState(startHour);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedHome, setSelectedHome] = useState<number | null>(null);

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

  // Drip plan for the current hour (deterministic; ~1 ms for 2,000 homes).
  const plan = useMemo(() => planCity(zones, homes, model.vuln, zoneExposures(model, hour)), [zones, homes, model, hour]);
  const selectedHex = useMemo(() => model.hexes.find((h) => h.h3 === selected) ?? null, [model, selected]);
  const markers = useMemo<HomeMarker[]>(
    () =>
      selectedHex
        ? selectedHex.homeIdx.map((i) => ({
            idx: i,
            position: [homes[i].lng, homes[i].lat],
            level: displayLevel(plan.homes[i].level),
            label: homeName(homes[i].label),
          }))
        : [],
    [selectedHex, homes, plan],
  );
  const selectHex = useCallback((h3: string | null) => {
    setSelected(h3);
    setSelectedHome(null);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <main className="relative h-[58svh] min-h-[400px] lg:h-auto lg:flex-1">
        <RiskMap
          hexes={model.hexes}
          hour={hour}
          focusHex={selected}
          markers={markers}
          selectedHome={selectedHome}
          onSelectHex={selectHex}
          onSelectHome={setSelectedHome}
        />
        <div className="absolute inset-x-3 bottom-3 lg:inset-x-4 lg:bottom-4">
          <Timeline hours={hours} hour={hour} playing={isPlaying} onHour={scrub} onTogglePlay={togglePlay} />
        </div>
      </main>
      <SidePanel
        model={model} homes={homes} plan={plan} hour={hour} selectedHex={selectedHex}
        onClearHex={() => selectHex(null)}
        onSelectHome={setSelectedHome}
        selectedHome={selectedHome}
        onCloseHome={() => setSelectedHome(null)}
      />
    </div>
  );
}

export default function ConsoleShell({ homes, zones }: { homes: ConsoleHome[]; zones: ConsoleZone[] }) {
  const [mode, setMode] = useState<Mode>("replay");
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
    <div className="flex min-h-dvh flex-col bg-bg text-text lg:h-dvh lg:overflow-hidden">
      <TopBar mode={mode} onMode={setMode} />
      {mode === "replay" ? (
        <ConsoleBody key="replay" homes={homes} zones={zones} model={replayModel} startHour={0} />
      ) : liveModel ? (
        <ConsoleBody key="live" homes={homes} zones={zones} model={liveModel} startHour={liveStart} />
      ) : live.state.status === "error" ? (
        <ModeMessage title="Couldn't load the live forecast">
          <p>{live.state.message}</p>
          <button type="button" onClick={live.retry} className="mt-4 rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg">
            Try again
          </button>
        </ModeMessage>
      ) : (
        <ModeMessage title="Loading the live forecast…" />
      )}
    </div>
  );
}
