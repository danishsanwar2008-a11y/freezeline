"use client";

import { motion, useReducedMotion } from "motion/react";
import { sceneMove } from "../motion";
import { Show } from "../Show";
import type { Beat } from "../timeline";

// Scene 4: how FreezeLine is built, as one flow that draws itself left to right over four beats:
// data in, the deterministic engine, the agent and the ways it reaches people, then the stack.

const ORDER: Beat[] = ["data", "engine", "agent", "stack"];
const W = 330, H = 104;

type Node = { id: string; x: number; y: number; title: string; sub: string; step: number; tone?: "cyan" | "amber" };
const NODES: Node[] = [
  // 1 · data in
  { id: "weather", x: 120, y: 340, title: "Weather", sub: "Open-Meteo · real Feb 2021", step: 0 },
  { id: "homes", x: 120, y: 510, title: "Homes + streets", sub: "OpenStreetMap · 18,105 homes", step: 0 },
  { id: "signups", x: 120, y: 680, title: "Sign-ups", sub: "/register · consent", step: 0 },
  // 2 · deterministic engine
  { id: "risk", x: 560, y: 340, title: "Risk engine", sub: "weather × plumbing → score", step: 1, tone: "cyan" },
  { id: "plan", x: 560, y: 510, title: "Drip planner", sub: "who drips, which faucet", step: 1, tone: "cyan" },
  { id: "pressure", x: 560, y: 680, title: "Pressure model", sub: "stays ≥ 25 psi · Stage 2", step: 1, tone: "cyan" },
  // 3 · agent + reach
  { id: "agent", x: 1000, y: 510, title: "Agent", sub: "rules or Claude · explains, acts", step: 2 },
  { id: "texts", x: 1440, y: 340, title: "Texts", sub: "Twilio · TextBee", step: 2 },
  { id: "calls", x: 1440, y: 510, title: "Calls", sub: "voice agent · Whisper · Kokoro", step: 2 },
  { id: "crews", x: 1440, y: 680, title: "Crews", sub: "A* on real streets", step: 2, tone: "amber" },
  // 4 · stack
  { id: "db", x: 780, y: 870, title: "Supabase", sub: "Postgres · row-level security", step: 3 },
  { id: "console", x: 1220, y: 870, title: "City Operations", sub: "Next.js · deck.gl · MapLibre", step: 3 },
];
const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

/** Connectors: right edge of one node to the left edge of another (or down to the stack row). */
const EDGES: { from: string; to: string; step: number; down?: boolean }[] = [
  { from: "weather", to: "risk", step: 1 },
  { from: "homes", to: "risk", step: 1 },
  { from: "homes", to: "plan", step: 1 },
  { from: "signups", to: "plan", step: 1 },
  { from: "risk", to: "plan", step: 1, down: true },
  { from: "plan", to: "pressure", step: 1, down: true },
  { from: "plan", to: "agent", step: 2 },
  { from: "pressure", to: "agent", step: 2 },
  { from: "agent", to: "texts", step: 2 },
  { from: "agent", to: "calls", step: 2 },
  { from: "agent", to: "crews", step: 2 },
];

function edgePath(e: (typeof EDGES)[number]): string {
  const a = byId[e.from], b = byId[e.to];
  if (e.down) {
    const x = a.x + W / 2;
    return `M ${x} ${a.y + H} L ${x} ${b.y}`;
  }
  const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

const COLUMNS = [
  { x: 120, label: "Data in", step: 0 },
  { x: 560, label: "Deterministic engine", step: 1 },
  { x: 1000, label: "Agent", step: 2 },
  { x: 1440, label: "Reaching people", step: 2 },
];

export default function ArchitectureScene({ beat }: { beat: Beat }) {
  const at = ORDER.indexOf(beat);
  const inScene = at >= 0;
  const reduced = useReducedMotion();

  return (
    <>
      <Show when={inScene} className="absolute" style={{ left: 120, top: 110, width: 1600 }}>
        <p className="deck-eyebrow">How it&rsquo;s built</p>
        <p className="deck-lede mt-4 max-w-[1300px]">
          Numbers come from plain, tested code. The agent decides what to do with them and explains it; it never computes a risk score.
        </p>
      </Show>

      {COLUMNS.map((c) => (
        <Show key={c.label} when={inScene && at >= c.step} className="absolute" style={{ left: c.x, top: 288 }}>
          <p className="text-[18px] font-medium uppercase tracking-[0.16em] text-present-muted">{c.label}</p>
        </Show>
      ))}

      <svg className="absolute inset-0" width={1920} height={1080} aria-hidden>
        {EDGES.map((e, i) => {
          const shown = inScene && at >= e.step;
          return (
            <motion.path
              key={i}
              d={edgePath(e)}
              fill="none"
              stroke="var(--present-cyan)"
              strokeOpacity={0.55}
              strokeWidth={2}
              initial={false}
              animate={{ pathLength: shown ? 1 : 0, opacity: shown ? 1 : 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.9, ease: [0.2, 0, 0, 1], delay: shown ? 0.25 + (i % 4) * 0.08 : 0 }}
            />
          );
        })}
        {/* The stack row: the agent reads and writes the database; officials see it all on the console. */}
        <motion.path
          d={`M ${byId.agent.x + W / 2} ${byId.agent.y + H} C ${byId.agent.x + W / 2} ${byId.db.y - 40}, ${byId.db.x + W / 2} ${byId.agent.y + H + 40}, ${byId.db.x + W / 2} ${byId.db.y}`}
          fill="none"
          stroke="var(--present-cyan)"
          strokeOpacity={0.55}
          strokeWidth={2}
          initial={false}
          animate={{ pathLength: at >= 3 ? 1 : 0, opacity: at >= 3 ? 1 : 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.8, delay: at >= 3 ? 0.35 : 0 }}
        />
        <motion.path
          d={`M ${byId.db.x + W} ${byId.db.y + H / 2} L ${byId.console.x} ${byId.console.y + H / 2}`}
          fill="none"
          stroke="var(--present-cyan)"
          strokeOpacity={0.55}
          strokeWidth={2}
          initial={false}
          animate={{ pathLength: at >= 3 ? 1 : 0, opacity: at >= 3 ? 1 : 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.8, delay: at >= 3 ? 0.5 : 0 }}
        />
      </svg>

      {NODES.map((n) => {
        const shown = inScene && at >= n.step;
        const ring = n.tone === "cyan" ? "border-present-cyan/70" : n.tone === "amber" ? "border-present-amber/70" : "border-present-line";
        return (
          <motion.div
            key={n.id}
            className={`absolute rounded-2xl border-2 bg-present-raised px-6 py-4 ${ring}`}
            style={{ left: n.x, top: n.y, width: W, height: H }}
            initial={false}
            animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 14 }}
            transition={{ ...sceneMove, delay: shown ? 0.1 : 0 }}
            aria-hidden={!shown}
          >
            <p className="text-[28px] font-semibold leading-tight text-present-ink">{n.title}</p>
            <p className="mt-1 text-[19px] leading-snug text-present-muted">{n.sub}</p>
          </motion.div>
        );
      })}

      <Show when={beat === "stack"} delay={0.6} className="absolute" style={{ left: 120, top: 870, width: 600 }}>
        <p className="text-[19px] leading-relaxed text-present-muted">
          TypeScript · React 19 · Tailwind · h3-js
          <br />
          Python voice agent: FastAPI · Pipecat
          <br />
          Automated tests for the math, the wording and the honesty rule
        </p>
      </Show>
    </>
  );
}
