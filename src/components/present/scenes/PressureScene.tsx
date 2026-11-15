"use client";

import { motion } from "motion/react";
import { sceneMove } from "../motion";
import { Show, Simulated } from "../Show";
import type { Beat } from "../timeline";
import type { PresentData } from "../types";

// Scene 2: water pressure at the storm's worst hour, per area. "Everyone drips" (the blanket message)
// vs FreezeLine's targeted plan, against the 20 psi boil-water line. Values come straight from the
// planner (planner.ts) via presentData.ts; nothing is computed here but bar heights.

// Horizontal bars, one row per area (any number of areas): area names on the left, psi along the x-axis.
const CHART = { names: 880, left: 1130, right: 1610, top: 250, bottom: 830, max: 55 };
const x = (psi: number) => CHART.left + (Math.max(0, Math.min(CHART.max, psi)) / CHART.max) * (CHART.right - CHART.left);
const fmt = (n: number) => n.toLocaleString("en-US");

/** Row geometry for n areas: each row holds two bars (everyone drips, FreezeLine plan). */
function rows(n: number) {
  const row = (CHART.bottom - CHART.top) / Math.max(1, n);
  const bar = Math.max(10, Math.min(30, (row - 14) / 2));
  return { row, bar, label: bar >= 22 ? 24 : 18 };
}

function Bar({ top, psi, shown, tone, delay, height, label }: { top: number; psi: number; shown: boolean; tone: "amber" | "cyan"; delay: number; height: number; label: number }) {
  const w = x(psi) - CHART.left;
  return (
    <>
      <motion.div
        className={`absolute rounded-r-[4px] ${tone === "amber" ? "bg-present-chart-amber" : "bg-present-chart-cyan"}`}
        style={{ left: CHART.left, top, height }}
        initial={false}
        animate={{ width: shown ? w : 0, opacity: shown ? 1 : 0 }}
        transition={{ ...sceneMove, duration: 1.4, delay: shown ? delay : 0 }}
      />
      <Show when={shown} delay={delay + 0.6} rise={0} className="absolute" style={{ left: x(psi) + 10, top: top + height / 2 - label * 0.65 }}>
        <p className="font-semibold tabular-nums text-present-ink" style={{ fontSize: label, lineHeight: 1.3 }}>
          {psi.toFixed(1)}
        </p>
      </Show>
    </>
  );
}

/** A threshold down the chart, labelled above or below it (never on top of the bars). */
function Rule({ psi, label, sub, dashed, at }: { psi: number; label: string; sub: string; dashed: string; at: "top" | "bottom" }) {
  return (
    <div className="absolute" style={{ left: x(psi), top: CHART.top - 12, height: CHART.bottom - CHART.top + 24 }}>
      <div className="h-full w-0 border-l-2 border-present-ink/70" style={{ borderStyle: dashed as never }} />
      <p
        className="absolute -translate-x-1/2 whitespace-nowrap text-center text-[22px] font-semibold leading-tight tabular-nums text-present-ink"
        style={at === "top" ? { bottom: "100%", marginBottom: 8 } : { top: "100%", marginTop: 8 }}
      >
        {label}
        <span className="block text-[18px] font-normal text-present-muted">{sub}</span>
      </p>
    </div>
  );
}

export default function PressureScene({ data, beat }: { data: PresentData; beat: Beat }) {
  const inScene = beat === "blanket" || beat === "targeted" || beat === "stage2";
  const blanketShown = inScene;
  const planShown = beat === "targeted" || beat === "stage2";
  const zones = data.peakZones.map((z) => ({ ...z, name: data.zones[z.zone].name }));
  const below = zones.filter((z) => z.blanket < 20).length;
  const p = data.pressure;
  const third = data.monitor.find((m) => m.stage2);
  const thirdZone = third ? data.zones[third.zone].name : "";
  const totalHigh = zones.reduce((a, z) => a + z.high, 0);
  const totalDrip = zones.reduce((a, z) => a + z.dripping, 0);

  return (
    <>
      {/* Words */}
      <Show when={beat === "blanket"} className="absolute" style={{ left: 128, top: 250, width: 700 }}>
        <p className="deck-eyebrow">One message for everyone</p>
        <p className="deck-title mt-6">&ldquo;Everyone drip.&rdquo;</p>
        <p className="deck-lede mt-6">
          At the worst hour, if every home leaves its taps dripping, all {below} areas fall below the 20 psi line where Texas requires a
          boil-water notice.
        </p>
      </Show>
      <Show when={beat === "targeted"} className="absolute" style={{ left: 128, top: 250, width: 700 }}>
        <p className="deck-eyebrow">FreezeLine&rsquo;s plan</p>
        <p className="deck-title mt-6">Drip where it matters.</p>
        <p className="deck-lede mt-6">
          {fmt(totalDrip)} of {fmt(totalHigh)} High-risk homes drip one chosen faucet. Every area stays above 25 psi.
        </p>
        <div className="mt-10 flex gap-14">
          <div>
            <p className="deck-figure text-[96px] text-present-cyan">{p.planBelow20}</p>
            <p className="deck-label mt-2">area-hours below 20 psi
              <br />
              with FreezeLine
            </p>
          </div>
          <div>
            <p className="deck-figure text-[96px] text-present-amber">{fmt(p.blanketBelow20)}</p>
            <p className="deck-label mt-2">
              of {fmt(p.areaHours)} if everyone drips
              <br />
              (whole storm)
            </p>
          </div>
        </div>
      </Show>
      <Show when={beat === "stage2"} className="absolute" style={{ left: 128, top: 230, width: 720 }}>
        <p className="deck-eyebrow">Stage 2: when people drip more than told</p>
        <p className="deck-title mt-6 text-[64px]">{thirdZone}</p>
        {third?.stage2 && (
          <>
            <p className="deck-lede mt-6">
              If {fmt(third.extraTaps)} homes run a second tap, {thirdZone} drops to{" "}
              <span className="text-present-amber">{third.nowPsi.toFixed(1)} psi</span>, under the 25 psi floor.
            </p>
            <p className="deck-lede mt-6">
              FreezeLine proposes: <span className="text-present-cyan">kitchen tap only at {fmt(third.stage2.kitchenOnly)} homes</span>
              {third.stage2.stop ? `, and stop dripping at ${fmt(third.stage2.stop)}` : ", with no one asked to stop"} &rarr;{" "}
              <span className="text-present-cyan">{third.stage2.psiAfter.toFixed(1)} psi</span>.
            </p>
            <p className="deck-label mt-8">A supervisor approves every Stage 2 alert, even in Auto mode.</p>
          </>
        )}
      </Show>

      {/* Chart */}
      <Show when={inScene} rise={0} className="absolute inset-0">
        <div className="absolute flex gap-8" style={{ left: CHART.names, top: CHART.top - 175 }}>
          <span className="deck-label flex items-center gap-3 text-present-ink">
            <span aria-hidden className="inline-block size-4 rounded-sm bg-present-chart-amber" /> Everyone drips
          </span>
          <span className={`deck-label flex items-center gap-3 text-present-ink transition-opacity duration-700 ${planShown ? "opacity-100" : "opacity-0"}`}>
            <span aria-hidden className="inline-block size-4 rounded-sm bg-present-chart-cyan" /> FreezeLine plan
          </span>
        </div>
        <p className="deck-note absolute" style={{ left: CHART.names, top: CHART.top - 130 }}>
          Water pressure at {new Date(`${data.hours[data.peak].time}:00-06:00`).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric" })}, psi
        </p>
        <div className="absolute w-[2px] bg-present-line" style={{ left: CHART.left - 2, top: CHART.top - 12, height: CHART.bottom - CHART.top + 24 }} />
        <Rule psi={20} label="20 psi" sub="boil-water line" dashed="dashed" at="bottom" />
        <div className={`transition-opacity duration-700 ${planShown ? "opacity-100" : "opacity-0"}`}>
          <Rule psi={25} label="25 psi" sub="FreezeLine floor" dashed="dotted" at="top" />
        </div>
        {zones.map((z, i) => {
          const { row, bar, label } = rows(zones.length);
          const top = CHART.top + i * row + (row - (bar * 2 + 4)) / 2;
          const stage2Here = beat === "stage2" && third?.zone === z.zone;
          return (
            <div key={z.zone}>
              <p
                className={`absolute truncate text-right font-medium ${stage2Here ? "text-present-ink" : "text-present-muted"}`}
                style={{ left: CHART.names, width: CHART.left - CHART.names - 20, top: CHART.top + i * row + row / 2 - label * 0.65, fontSize: label, lineHeight: 1.3 }}
              >
                {z.name}
              </p>
              <Bar top={top} height={bar} label={label} psi={z.blanket} shown={blanketShown} tone="amber" delay={0.08 * i} />
              <Bar
                top={top + bar + 4}
                height={bar}
                label={label}
                psi={stage2Here && third ? third.stage2!.psiAfter : planShown ? z.plan : 0}
                shown={planShown}
                tone="cyan"
                delay={0.08 * i}
              />
              {third && third.zone === z.zone && (
                <Show when={beat === "stage2"} delay={0.3} rise={0} className="absolute" style={{ left: x(third.nowPsi) - 1, top: top + bar - 4, height: bar + 16 }}>
                  <div className="h-full w-0 border-l-[3px] border-dashed border-present-amber" role="img" aria-label={`${third.nowPsi.toFixed(1)} psi with extra taps`} />
                </Show>
              )}
            </div>
          );
        })}
        <div className="deck-note absolute" style={{ left: CHART.names, top: CHART.bottom + 90, width: 900 }}>
          <Simulated />
          <p className="mt-3">
            Simplified pressure model: base pressure − freeze demand − drip flow. Calibrated assumptions, not Houston&rsquo;s pipe network;
            in a real deployment the utility&rsquo;s own pressure sensors take its place.
          </p>
        </div>
        <table className="sr-only">
          <caption>Water pressure at the worst hour, psi</caption>
          <thead>
            <tr>
              <th>Area</th>
              <th>Everyone drips</th>
              <th>FreezeLine plan</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.zone}>
                <td>{z.name}</td>
                <td>{z.blanket}</td>
                <td>{z.plan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Show>
    </>
  );
}
