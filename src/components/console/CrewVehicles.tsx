"use client";

// Crew vehicles on the map: a flat top-down utility van per crew (white body, light-blue windshield, Deep Blue
// outline), turned to face along the street it drives. It moves in real time from the moment it was dispatched
// (CREW_TIME_SCALE, src/lib/crewTrip.ts), blinks a soft beacon once a second until it reaches the house, then
// stays parked there. Standby crews park at their depot and don't blink. Drawn as HTML over the deck.gl map so
// the motion is frame-smooth and every crew is a real button (click, keyboard, hover label).

import { useEffect, useState } from "react";
import { alongPath, driveFraction } from "@/lib/route";
import Callout from "./Callout";
import type { CrewMarker, PinnedCallout } from "./RiskMap";

type LngLat = [number, number];

/** The van seen from above, nose up (viewBox 20 × 44). Real size ~2 m × 5.5 m. */
export function CrewVan({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 20 44" className={className} style={style} aria-hidden>
      {/* mirrors */}
      <rect x="0.3" y="10" width="2.4" height="3" rx="0.8" fill="var(--crew)" />
      <rect x="17.3" y="10" width="2.4" height="3" rx="0.8" fill="var(--crew)" />
      {/* body: rounder at the nose */}
      <path d="M5.5 1.2h9q3.8 0 3.8 4.2v34.4q0 3-3 3H4.7q-3 0-3-3V5.4q0-4.2 3.8-4.2Z" fill="#f3f6fa" stroke="var(--crew)" strokeWidth="1.3" />
      {/* windshield */}
      <path d="M4 9.2q6-2.4 12 0l-0.7 4.6q-5.3-1.6-10.6 0Z" fill="#a3cff1" stroke="var(--crew)" strokeWidth="0.6" />
      {/* roof ribs */}
      <path d="M7 17v22M10 17v22M13 17v22" stroke="#b9c7d8" strokeWidth="0.9" strokeLinecap="round" />
      {/* marker lights */}
      <rect x="3.2" y="2.3" width="2.2" height="1.1" rx="0.5" fill="#f2a43a" />
      <rect x="14.6" y="2.3" width="2.2" height="1.1" rx="0.5" fill="#f2a43a" />
      <rect x="3.2" y="40.7" width="2.2" height="1" rx="0.5" fill="#f2a43a" />
      <rect x="14.6" y="40.7" width="2.2" height="1" rx="0.5" fill="#f2a43a" />
    </svg>
  );
}

/** The basemap's residential street fill width in px (CARTO Positron road_minor_fill stops; constant from z18). */
const ROAD_FILL: [number, number][] = [[15, 3], [16, 4], [17, 8], [18, 12]];
function roadFill(zoom: number): number {
  if (zoom <= ROAD_FILL[0][0]) return ROAD_FILL[0][1];
  for (let k = 1; k < ROAD_FILL.length; k++) {
    const [z1, w1] = ROAD_FILL[k];
    const [z0, w0] = ROAD_FILL[k - 1];
    if (zoom <= z1) return w0 + ((zoom - z0) / (z1 - z0)) * (w1 - w0);
  }
  return ROAD_FILL[ROAD_FILL.length - 1][1];
}

/**
 * Vehicle size on screen for a map zoom: 90% of the street's drawn width, so zoomed into a street it fits inside
 * the road, and never under 8.5 px wide, so it stays visible at city zoom. Length = 2.2 × width (a van's shape).
 */
export function vanSize(zoom: number): { w: number; l: number } {
  const w = Math.max(8.5, roadFill(zoom) * 0.9);
  return { w, l: w * 2.2 };
}

interface Live {
  position: LngLat;
  segment: [LngLat, LngLat] | null;
  driving: boolean;
}

function liveState(c: CrewMarker, now: number): Live {
  if (!c.job) return { position: c.depot, segment: null, driving: false };
  const t = driveFraction(c.job, now);
  const { position, segment } = alongPath(c.job.route, t);
  return { position, segment, driving: t < 1 };
}

/**
 * Frame clock: runs only while some crew is driving, so a quiet map costs nothing. A job that arrives after the
 * clock stopped reads as not yet arrived against the last frame's time, which starts the clock again.
 */
function useFrameClock(crews: CrewMarker[]): number {
  const [now, setNow] = useState(() => Date.now());
  const driving = crews.some((c) => c.job && driveFraction(c.job, now) < 1);
  useEffect(() => {
    if (!driving) return;
    let id = requestAnimationFrame(function frame() {
      setNow(Date.now());
      id = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(id);
  }, [driving]);
  return now;
}

interface Viewport {
  project: (p: LngLat) => number[];
  zoom: number;
}

export function CrewOverlay({
  viewport,
  width,
  crews,
  selectedCrew,
  onSelectCrew,
  callout,
}: {
  viewport: Viewport;
  width: number;
  crews: CrewMarker[];
  selectedCrew: number | null;
  onSelectCrew: (id: number) => void;
  callout: PinnedCallout | null;
}) {
  const now = useFrameClock(crews);
  const { w: W, l: L } = vanSize(viewport.zoom);
  const beacon = Math.max(44, L * 2.8);
  const live = new Map(crews.map((c) => [c.id, liveState(c, now)]));

  // Screen angle of the street segment (0 = nose up, clockwise); parked at a depot: nose up.
  const angleOf = (seg: [LngLat, LngLat] | null): number => {
    if (!seg) return 0;
    const [x0, y0] = viewport.project(seg[0]);
    const [x1, y1] = viewport.project(seg[1]);
    return (Math.atan2(x1 - x0, -(y1 - y0)) * 180) / Math.PI;
  };

  const followed = callout?.crewId !== undefined ? live.get(callout.crewId) : undefined;
  const calloutAt = callout ? viewport.project(followed ? followed.position : callout.lngLat) : null;

  return (
    <>
      <div role="group" className="pointer-events-none absolute inset-0 overflow-hidden" aria-label="Crew vehicles (sample)">
        {crews.map((c) => {
          const s = live.get(c.id)!;
          const [x, y] = viewport.project(s.position);
          const angle = angleOf(s.segment);
          const selected = c.id === selectedCrew;
          const hit = Math.max(28, L + 4);
          const label = c.job
            ? s.driving
              ? `${c.name} · ~${c.minutesLeft} min to ${c.job.street} (simulated)`
              : `${c.name} · helping a home on ${c.job.street}`
            : `${c.name} · on standby`;
          return (
            <div key={c.id} className="group absolute left-0 top-0" style={{ transform: `translate(${x}px, ${y}px)`, zIndex: s.driving || selected ? 2 : 1 }}>
              {s.driving && <span className="crew-beacon" style={{ width: beacon, height: beacon }} />}
              {selected && (
                <span
                  className="pointer-events-none absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-white/40"
                  style={{ width: L + 12, height: L + 12 }}
                />
              )}
              <button
                type="button"
                onClick={() => onSelectCrew(c.id)}
                aria-label={label}
                aria-pressed={selected}
                className="pointer-events-auto absolute left-0 top-0 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                style={{ width: hit, height: hit }}
              >
                <CrewVan className="drop-shadow-[0_1px_1.5px_rgb(16_28_46/0.45)]" style={{ width: W, height: L, transform: `rotate(${angle}deg)` }} />
              </button>
              {/* The crew number, upright beside the van (never rotated). */}
              <span
                className="pointer-events-none absolute left-0 top-0 flex h-4 min-w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-crew px-1 font-mono text-[11px] font-medium leading-none tabular-nums text-white"
                style={{ marginLeft: (L / 2 + 6) * 0.72, marginTop: -(L / 2 + 6) * 0.72 }}
                aria-hidden
              >
                {c.id}
              </span>
              <span
                className="pointer-events-none absolute left-0 top-0 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                style={{ marginTop: -(L / 2 + 40) }}
                aria-hidden
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
      {callout && calloutAt && (
        <Callout key={callout.key} x={calloutAt[0]} y={calloutAt[1]} mapWidth={width} title={callout.title} subtitle={callout.subtitle} onClose={callout.onClose}>
          {callout.body}
        </Callout>
      )}
    </>
  );
}
