"use client";

import { motion } from "motion/react";
import { sceneMove } from "../motion";
import { Show, Simulated } from "../Show";
import type { Beat } from "../timeline";
import type { PresentData } from "../types";

// Scene 2: water pressure at the storm's worst hour, per area. "Everyone drips" (the blanket message)
// vs FreezeLine's targeted plan, against the 20 psi boil-water line. Values come straight from the
// planner (planner.ts) via presentData.ts; nothing is computed here but bar heights.

const CHART = { left: 940, right: 1620, top: 250, baseline: 830, max: 55 };
const H = CHART.baseline - CHART.top;
const y = (psi: number) => CHART.baseline - (Math.max(0, psi) / CHART.max) * H;
const GROUP = (CHART.right - CHART.left) / 4;
const BAR = 68;
const fmt = (n: number) => n.toLocaleString("en-US");

function Bar({ x, psi, shown, tone, delay }: { x: number; psi: number; shown: boolean; tone: "amber" | "cyan"; delay: number }) {
  const h = (Math.max(0, psi) / CHART.max) * H;
  return (
    <>
      <motion.div
        className={`absolute rounded-t-[4px] ${tone === "amber" ? "bg-present-chart-amber" : "bg-present-chart-cyan"}`}
        style={{ left: x, width: BAR, bottom: 1080 - CHART.baseline }}
        initial={false}
        animate={{ height: shown ? h : 0, opacity: shown ? 1 : 0 }}
        transition={{ ...sceneMove, duration: 1.4, delay: shown ? delay : 0 }}
      />
      <Show when={shown} delay={delay + 0.6} rise={8} className="absolute text-center" style={{ left: x - 20, width: BAR + 40, top: y(psi) - 46 }}>
        <p className="text-[28px] font-semibold tabular-nums text-present-ink">{psi.toFixed(1)}</p>
      </Show>
    </>
  );
}

/** A threshold across the chart, labelled in the margin to the right of the bars (never on top of them). */
function Rule({ psi, label, sub, dashed }: { psi: number; label: string; sub: string; dashed: string }) {
  return (
    <div className="absolute" style={{ left: CHART.left - 20, width: CHART.right - CHART.left + 40, top: y(psi) }}>
      <div className="h-0 border-t-2 border-present-ink/70" style={{ borderStyle: dashed as never }} />
      <p className="absolute left-full top-[-14px] ml-4 w-[230px] text-[22px] font-semibold leading-tight tabular-nums text-present-ink">
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
        <div className="absolute flex gap-8" style={{ left: CHART.left, top: CHART.top - 120 }}>
          <span className="deck-label flex items-center gap-3 text-present-ink">
            <span aria-hidden className="inline-block size-4 rounded-sm bg-present-chart-amber" /> Everyone drips
          </span>
          <span className={`deck-label flex items-center gap-3 text-present-ink transition-opacity duration-700 ${planShown ? "opacity-100" : "opacity-0"}`}>
            <span aria-hidden className="inline-block size-4 rounded-sm bg-present-chart-cyan" /> FreezeLine plan
          </span>
        </div>
        <p className="deck-note absolute" style={{ left: CHART.left, top: CHART.top - 70 }}>
          Water pressure at {new Date(`${data.hours[data.peak].time}:00-06:00`).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric" })}, psi
        </p>
        <div className="absolute h-[2px] bg-present-line" style={{ left: CHART.left - 20, width: CHART.right - CHART.left + 40, top: CHART.baseline }} />
        <Rule psi={20} label="20 psi" sub="boil-water line" dashed="dashed" />
        <div className={`transition-opacity duration-700 ${planShown ? "opacity-100" : "opacity-0"}`}>
          <Rule psi={25} label="25 psi" sub="FreezeLine floor" dashed="dotted" />
        </div>
        {zones.map((z, i) => {
          const gx = CHART.left + i * GROUP + (GROUP - (BAR * 2 + 10)) / 2;
          const stage2Here = beat === "stage2" && third?.zone === z.zone;
          return (
            <div key={z.zone}>
              <Bar x={gx} psi={z.blanket} shown={blanketShown} tone="amber" delay={0.15 * i} />
              <Bar x={gx + BAR + 10} psi={stage2Here && third ? third.stage2!.psiAfter : planShown ? z.plan : 0} shown={planShown} tone="cyan" delay={0.15 * i} />
              {third && third.zone === z.zone && (
                <Show when={beat === "stage2"} delay={0.3} rise={0} className="absolute" style={{ left: gx + BAR + 10 - 14, top: y(third.nowPsi) - 1, width: BAR + 28 }}>
                  <div className="h-0 border-t-[3px] border-dashed border-present-amber" role="img" aria-label={`${third.nowPsi.toFixed(1)} psi with extra taps`} />
                </Show>
              )}
              <p
                className={`deck-label absolute text-center ${stage2Here ? "text-present-ink" : ""}`}
                style={{ left: CHART.left + i * GROUP, width: GROUP, top: CHART.baseline + 18 }}
              >
                {z.name}
              </p>
            </div>
          );
        })}
        <div className="deck-note absolute" style={{ left: CHART.left - 20, top: CHART.baseline + 90, width: 900 }}>
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
