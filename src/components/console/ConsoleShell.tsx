"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import uri from "../../../data/uri-2021.json";
import uriNeighborhoods from "../../../data/uri-2021-neighborhoods.json";
import { buildReplay, zoneExposures, type ConsoleHome } from "@/lib/replay";
import type { WeatherSeries } from "@/lib/weather";
import type { ConsoleZone } from "@/lib/homes";
import { planCity } from "@/lib/planner";
import SidePanel from "./SidePanel";
import Timeline from "./Timeline";

// WebGL map is browser-only.
const RiskMap = dynamic(() => import("./RiskMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-surface/40" />,
});

const HOURS = (uri as WeatherSeries).hours;
const ZONE_HOURS = Object.fromEntries(
  Object.entries((uriNeighborhoods as unknown as { zones: Record<string, WeatherSeries> }).zones).map(([id, s]) => [id, s.hours]),
);
const MS_PER_HOUR = 140; // full 168-hour replay ≈ 24 s

export default function ConsoleShell({ homes, zones }: { homes: ConsoleHome[]; zones: ConsoleZone[] }) {
  // Everything heavy is computed once; the replay itself is just index lookups.
  const model = useMemo(() => buildReplay(homes, HOURS, ZONE_HOURS), [homes]);
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const last = HOURS.length - 1;

  const atEnd = hour >= last;
  useEffect(() => {
    if (!playing || atEnd) return;
    const id = setInterval(() => setHour((h) => Math.min(last, h + 1)), MS_PER_HOUR);
    return () => clearInterval(id);
  }, [playing, atEnd, last]);

  const isPlaying = playing && !atEnd;
  const togglePlay = useCallback(() => {
    if (isPlaying) return setPlaying(false);
    if (atEnd) setHour(0); // replay from the start
    setPlaying(true);
  }, [isPlaying, atEnd]);

  const scrub = useCallback((h: number) => {
    setPlaying(false);
    setHour(h);
  }, []);

  // Space = play/pause, arrows = step one hour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight" && !(e.target instanceof HTMLInputElement)) {
        scrub(Math.min(last, hour + 1));
      } else if (e.key === "ArrowLeft" && !(e.target instanceof HTMLInputElement)) {
        scrub(Math.max(0, hour - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, scrub, hour, last]);

  // Drip plan for the current hour (deterministic; ~1 ms for 2,000 homes).
  const plan = useMemo(() => planCity(zones, homes, model.vuln, zoneExposures(model, hour)), [zones, homes, model, hour]);

  const selectedHex = useMemo(() => model.hexes.find((h) => h.h3 === selected) ?? null, [model, selected]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text lg:h-dvh lg:flex-row lg:overflow-hidden">
      <main className="relative h-[62dvh] min-h-[420px] lg:h-auto lg:flex-1">
        <RiskMap hexes={model.hexes} hour={hour} selected={selected} onSelect={setSelected} />
        <p className="pointer-events-none absolute left-3 top-3 rounded-full border border-warn/40 bg-bg/80 px-3 py-1 text-[11px] font-medium text-warn backdrop-blur">
          Simulated homes · Real Feb 2021 weather
        </p>
        <div className="absolute inset-x-3 bottom-3 lg:inset-x-4 lg:bottom-4">
          <Timeline hours={HOURS} hour={hour} playing={isPlaying} onHour={scrub} onTogglePlay={togglePlay} />
        </div>
      </main>
      <SidePanel model={model} homes={homes} plan={plan} hour={hour} selectedHex={selectedHex} onClearHex={() => setSelected(null)} />
    </div>
  );
}
