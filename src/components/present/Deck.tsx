"use client";

import { MotionConfig, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { STORM_SWEEP_MS } from "./motion";
import { Stage } from "./Stage";
import { advance, beatAt, last, retreat, scenes, start, toSearch, type Position } from "./timeline";
import { useDeckControls } from "./useDeckControls";
import type { PresentData } from "./types";
import StormScene from "./scenes/StormScene";
import PressureScene from "./scenes/PressureScene";
import OutreachScene from "./scenes/OutreachScene";
import ArchitectureScene from "./scenes/ArchitectureScene";

// WebGL map: browser only.
const PresentMap = dynamic(() => import("./PresentMap"), { ssr: false });

/** The replay hour the story starts from: midnight Feb 14, before the freeze sets in. */
const CALM_TIME = "2021-02-14T00:00";

/** Hour shown on the map for a beat; the "storm" beat sweeps from calm to the worst hour. */
function useStormHour(data: PresentData, position: Position, reduced: boolean): number {
  const calm = Math.max(0, data.hours.findIndex((h) => h.time === CALM_TIME));
  const beat = beatAt(position);
  const sweeping = beat === "storm" && !reduced;
  // State changes only inside animation frames; the still hours are derived below.
  const [swept, setSwept] = useState(calm);
  useEffect(() => {
    if (!sweeping) return;
    const t0 = performance.now();
    let id = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / STORM_SWEEP_MS);
      // Ease out: the freeze arrives fast, then settles at its worst.
      const eased = 1 - (1 - k) ** 2;
      setSwept(Math.round(calm + (data.peak - calm) * eased));
      if (k < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [sweeping, calm, data.peak]);
  if (beat === "title" || beat === "calm") return calm;
  return sweeping ? swept : data.peak;
}

export default function Deck({ data, initial }: { data: PresentData; initial: Position }) {
  const [position, setPosition] = useState(initial);
  const reduced = useReducedMotion() ?? false;
  const beat = beatAt(position);
  const hour = useStormHour(data, position, reduced);

  const commands = useMemo(
    () => ({
      next: () => setPosition(advance),
      previous: () => setPosition(retreat),
      first: () => setPosition(start),
      last: () => setPosition(last()),
    }),
    [],
  );
  useDeckControls(commands);

  const search = toSearch(position);
  useEffect(() => {
    window.history.replaceState(null, "", `${window.location.pathname}${search}`);
  }, [search]);

  return (
    <MotionConfig reducedMotion="user">
      <main className="present-theme fixed inset-0 cursor-default select-none overflow-hidden" onClick={commands.next}>
        <h1 className="sr-only">FreezeLine presentation</h1>
        <p className="sr-only" aria-live="polite">{`Scene ${position.scene + 1} of ${scenes.length}, step ${position.beat + 1}`}</p>
        <PresentMap data={data} beat={beat} hour={hour} reduced={reduced} />
        <Stage>
          <StormScene data={data} beat={beat} hour={hour} />
          <PressureScene data={data} beat={beat} />
          <OutreachScene data={data} beat={beat} />
          <ArchitectureScene beat={beat} />
          <Progress position={position} />
        </Stage>
      </main>
    </MotionConfig>
  );
}

/** A quiet progress rail: one short line per scene, the current one lit. */
function Progress({ position }: { position: Position }) {
  return (
    <div className="absolute bottom-10 left-[128px] flex gap-3" aria-hidden>
      {scenes.map((s, i) => (
        <span key={s.id} className={`h-[3px] w-12 rounded-full transition-colors duration-500 ${i === position.scene ? "bg-present-cyan" : "bg-present-line"}`} />
      ))}
    </div>
  );
}
