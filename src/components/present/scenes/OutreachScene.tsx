"use client";

import { motion } from "motion/react";
import { sceneMove } from "../motion";
import { Show, Simulated } from "../Show";
import type { Beat } from "../timeline";
import type { PresentData } from "../types";

// Scene 3: coordinated outreach at the worst hour. Text every home that needs action, call those who
// don't reply, check on High-risk homes that don't answer, then send crews only to households that
// said they can't do the steps. The map lights each step's homes; crews drive real street routes.
// Every count comes from simulateOutreach()/assess()/proposeCrews() via presentData.ts.

const COL = { left: 1180, width: 620 };
const fmt = (n: number) => n.toLocaleString("en-US");

const STEPS: { beat: Beat; key: "texted" | "called" | "doorChecks"; label: string; tone: string }[] = [
  { beat: "text", key: "texted", label: "texted", tone: "bg-present-chart-cyan/55" },
  { beat: "call", key: "called", label: "called (no reply to the text)", tone: "bg-present-chart-cyan" },
  { beat: "door", key: "doorChecks", label: "door checks (High risk, no answer)", tone: "bg-present-chart-amber" },
];
const ORDER: Beat[] = ["text", "call", "door", "crews"];

/** The funnel: one bar per step, widths to scale, each step appearing on its beat. */
function Funnel({ data, beat }: { data: PresentData; beat: Beat }) {
  const at = ORDER.indexOf(beat);
  const max = data.outreach.texted || 1;
  return (
    <div className="mt-12 space-y-6">
      {STEPS.map((s, i) => {
        const shown = at >= i;
        const n = data.outreach[s.key];
        return (
          <div key={s.key} className={`transition-opacity duration-700 ${shown ? "opacity-100" : "opacity-0"}`} aria-hidden={!shown}>
            <p className="deck-label">
              <span className="font-semibold tabular-nums text-present-ink">{fmt(n)}</span> {s.label}
            </p>
            <div className="mt-2 h-4 w-full rounded-full bg-present-line">
              <motion.div
                className={`h-full rounded-full ${s.tone}`}
                initial={false}
                animate={{ width: shown ? `${(100 * n) / max}%` : "0%" }}
                transition={{ ...sceneMove, duration: 1.2 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function OutreachScene({ data, beat }: { data: PresentData; beat: Beat }) {
  const inScene = ORDER.includes(beat);
  const o = data.outreach;
  const crews = data.crews;
  const minutes = crews.map((c) => c.minutes).sort((a, b) => a - b);
  const median = minutes.length ? minutes[Math.floor(minutes.length / 2)] : 0;
  const routed = crews.length;

  return (
    <>
      <Show when={inScene} className="absolute" style={{ left: COL.left, top: 150, width: COL.width }}>
        <p className="deck-eyebrow">Outreach · the worst hour</p>
      </Show>

      <Show when={beat === "text"} className="absolute" style={{ left: COL.left, top: 220, width: COL.width }}>
        <p className="deck-title text-[72px]">Text first.</p>
        <p className="deck-lede mt-6">Every Watch and High home gets its own plan by text: which tap to drip, or why not to.</p>
      </Show>
      <Show when={beat === "call"} className="absolute" style={{ left: COL.left, top: 220, width: COL.width }}>
        <p className="deck-title text-[72px]">Then call.</p>
        <p className="deck-lede mt-6">Homes that don&rsquo;t reply get a phone call that asks whether they can do the steps themselves.</p>
      </Show>
      <Show when={beat === "door"} className="absolute" style={{ left: COL.left, top: 220, width: COL.width }}>
        <p className="deck-title text-[72px]">Then knock.</p>
        <p className="deck-lede mt-6">High-risk homes that don&rsquo;t answer get a door check.</p>
      </Show>
      <Show when={beat === "crews"} className="absolute" style={{ left: COL.left, top: 220, width: COL.width }}>
        <p className="deck-title text-[72px]">Crews where needed.</p>
        <p className="deck-lede mt-6">
          {fmt(o.needsCrew)} households said they can&rsquo;t do the steps. The {routed} crews go first to the highest-risk ones, each the
          nearest free crew in its area, on real streets (median drive {median} min).
        </p>
        <p className="deck-label mt-6">
          {fmt(o.crewQueue)} wait in the crew queue. A household only hears &ldquo;a crew is on the way&rdquo; once one is assigned.
        </p>
      </Show>

      <Show when={inScene && beat !== "crews"} className="absolute" style={{ left: COL.left, top: 470, width: COL.width }}>
        <Funnel data={data} beat={beat} />
      </Show>

      <Show when={inScene} className="absolute" style={{ left: COL.left, bottom: 96, width: COL.width }}>
        <div className="deck-note">
          <Simulated>Simulated replies, answers and crews</Simulated>
          <p className="mt-3">Street routes are real OpenStreetMap roads; drive times assume 15 mph on icy roads.</p>
        </div>
      </Show>
    </>
  );
}
