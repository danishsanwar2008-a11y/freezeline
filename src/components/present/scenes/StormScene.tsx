"use client";

import { AnimatePresence, motion } from "motion/react";
import Radar from "@/components/react-bits/Radar";
import { quickFade } from "../motion";
import { Show, Simulated } from "../Show";
import type { Beat } from "../timeline";
import type { PresentData } from "../types";

// Scene 1: Houston on the eve of Winter Storm Uri. The map's dots are the 8,034 homes, coloured by
// the risk engine hour by hour; this layer carries the words, the clock and the counts.

/** The title's radar: centred over the homes, which the map frames on the right of the slide. */
const RADAR = { x: 1460, y: 490, size: 900 };

const fmt = (n: number) => n.toLocaleString("en-US");
const when = (iso: string) =>
  new Date(`${iso}:00-06:00`).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric" });

/** Each level's dot, matching the map (PRESENT_LOOK.level). */
function Dot({ tone }: { tone: "Low" | "Watch" | "High" }) {
  const cls = tone === "High" ? "bg-present-amber" : tone === "Watch" ? "bg-present-amber/45" : "bg-[#7892b2]/60";
  return <span aria-hidden className={`inline-block size-4 rounded-full ${cls}`} />;
}

/** One stacked bar for the three levels: every number gets a visual. */
function LevelBar({ counts }: { counts: [number, number, number] }) {
  const total = counts[0] + counts[1] + counts[2] || 1;
  return (
    <div className="flex h-3 w-[560px] gap-[2px] overflow-hidden rounded-full bg-present-line">
      <span className="h-full bg-present-amber transition-[width] duration-200" style={{ width: `${(100 * counts[0]) / total}%` }} />
      <span className="h-full bg-present-amber/45 transition-[width] duration-200" style={{ width: `${(100 * counts[1]) / total}%` }} />
      <span className="h-full bg-[#7892b2]/60 transition-[width] duration-200" style={{ width: `${(100 * counts[2]) / total}%` }} />
    </div>
  );
}

export default function StormScene({ data, beat, hour }: { data: PresentData; beat: Beat; hour: number }) {
  const inScene = beat === "title" || beat === "calm" || beat === "storm" || beat === "peak";
  const h = data.hours[hour];
  const counts = data.counts[hour];
  const peak = data.hours[data.peak];
  const total = data.homes.lat.length;

  return (
    <>
      {/* Title backdrop: a radar sweep over the dimmed city, "scanning" it house by house. Decorative only, so no
          blips or targets that could read as data; mounted only on the title so it costs nothing elsewhere. */}
      <AnimatePresence>
        {beat === "title" && (
          <motion.div
            key="radar"
            aria-hidden
            className="absolute"
            style={{ left: RADAR.x - RADAR.size / 2, top: RADAR.y - RADAR.size / 2, width: RADAR.size, height: RADAR.size }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ ...quickFade, duration: 0.8 }}
          >
            <Radar
              color="#5fd3e6"
              mode="sweep"
              speed={0.6}
              trail={0.45}
              scale={0.88}
              ringCount={6}
              spokeCount={12}
              ticks
              targets={0}
              clutter={0}
              glow={0.8}
              brightness={0.85}
              gridOpacity={0.8}
              lineWidth={1}
              grain={0}
              fade={0.2}
              mouseInteraction={false}
              intro
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Show when={beat === "title"} className="absolute" style={{ left: 128, top: 300, width: 1100 }}>
        <p className="deck-eyebrow">Winter Storm Uri · Houston · February 2021</p>
        <p className="deck-title mt-8">FreezeLine</p>
        <p className="deck-lede mt-8 max-w-[960px]">
          One message for everyone backfires. FreezeLine decides, house by house, who should drip a faucet, which one, and who
          shouldn&rsquo;t.
        </p>
      </Show>

      <Show when={beat === "calm"} className="absolute" style={{ left: 128, top: 260, width: 760 }}>
        <p className="deck-eyebrow">The city</p>
        <p className="deck-figure mt-6">{fmt(total)}</p>
        <p className="deck-lede mt-4">homes in four Houston neighborhoods, each one a real house footprint.</p>
        <ul className="deck-label mt-10 space-y-3">
          <li className="flex items-center gap-4">
            <Dot tone="Low" /> Low risk
          </li>
          <li className="flex items-center gap-4">
            <Dot tone="Watch" /> Watch
          </li>
          <li className="flex items-center gap-4">
            <Dot tone="High" /> High risk
          </li>
        </ul>
      </Show>

      <Show when={beat === "storm"} className="absolute" style={{ left: 128, top: 240, width: 760 }}>
        <p className="deck-eyebrow">The freeze arrives</p>
        <p className="deck-title mt-6 tabular-nums">{when(h.time)}</p>
        <p className="deck-lede mt-4 tabular-nums">
          {Math.round(h.temp)}°F · feels like {Math.round(h.feels)}°F · {h.below20} {h.below20 === 1 ? "hour" : "hours"} below 20°F
        </p>
        <div className="mt-12 space-y-4">
          <LevelBar counts={counts} />
          <p className="deck-label tabular-nums">
            <span className="text-present-amber">{fmt(counts[0])} High</span> · {fmt(counts[1])} Watch · {fmt(counts[2])} Low
          </p>
        </div>
      </Show>

      <Show when={beat === "peak"} className="absolute" style={{ left: 128, top: 230, width: 760 }}>
        <p className="deck-eyebrow">The worst hour · {when(peak.time)}</p>
        <p className="deck-figure mt-6 text-present-amber">{fmt(data.counts[data.peak][0])}</p>
        <p className="deck-lede mt-4">homes at High risk of frozen pipes.</p>
        <p className="deck-label mt-8 tabular-nums">
          {Math.round(peak.temp * 10) / 10}°F · {peak.below20} hours below 20°F so far
        </p>
        <p className="deck-note mt-10 max-w-[680px]">
          Risk = how hard the freeze is hitting that hour × how exposed the home&rsquo;s plumbing is (pier-and-beam crawlspace, pipes in
          outside walls, insulation, outdoor faucets). The same deterministic engine the console runs.
        </p>
      </Show>

      <Show when={inScene && beat !== "title"} className="absolute" style={{ left: 128, bottom: 96 }}>
        <p className="deck-note flex items-center gap-4">
          Real Feb 2021 weather (Open-Meteo) · real house locations (OpenStreetMap) <Simulated>Simulated home details</Simulated>
        </p>
      </Show>
    </>
  );
}
