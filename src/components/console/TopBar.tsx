"use client";

import Link from "next/link";
import type { AgentMode } from "./useAgent";
import { Chevron } from "./Panel";

export type Mode = "live" | "replay";

const MODES: { id: Mode; label: string; short: string }[] = [
  { id: "live", label: "Live forecast", short: "Live" },
  { id: "replay", label: "Replay: Winter Storm Uri (Feb 2021)", short: "Replay: Uri 2021" },
];

const AGENT_MODES: { id: AgentMode; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "approve", label: "Approve first" },
];

function InfoTip() {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-describedby="data-note"
        className="flex size-8 items-center justify-center rounded-full text-sm text-muted transition-colors duration-150 ease-[var(--ease)] hover:bg-bg hover:text-text"
      >
        <span aria-hidden>ⓘ</span>
        <span className="sr-only">About this data</span>
      </button>
      <span
        id="data-note"
        role="tooltip"
        className="pointer-events-none absolute right-0 top-10 z-30 w-64 rounded-lg border border-border bg-surface p-3 text-xs leading-relaxed text-muted opacity-0 shadow-lg transition-opacity duration-150 ease-[var(--ease)] group-focus-within:opacity-100 group-hover:opacity-100"
      >
        Home locations and streets are real OpenStreetMap data (© OpenStreetMap contributors, ODbL). Everything about each
        household, every crew and route is <span className="text-text">simulated sample data</span>. Weather is real: Open-Meteo’s
        archive for Feb 2021 in Replay, and the current forecast in Live.
      </span>
    </span>
  );
}

export interface AgentControls {
  /** The agent runs on the Uri replay only. */
  enabled: boolean;
  running: boolean;
  mode: AgentMode;
  onMode: (m: AgentMode) => void;
  onRun: () => void;
}

interface Props {
  mode: Mode;
  onMode: (m: Mode) => void;
  agent: AgentControls;
  panelsHidden: boolean;
  onTogglePanels: () => void;
}

/** City Operations is the only screen (officials only). Run agent lives here, always in view. */
export default function TopBar({ mode, onMode, agent, panelsHidden, onTogglePanels }: Props) {
  return (
    <header className="console-topbar relative z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2">
      <p className="hidden font-mono text-xs tracking-[0.2em] text-accent sm:block">FREEZELINE</p>
      <h1 className="text-sm font-medium">City Operations</h1>

      <div className="flex items-center gap-2 lg:ml-3">
        <button
          type="button"
          onClick={agent.onRun}
          disabled={!agent.enabled || agent.running}
          title={agent.enabled ? undefined : "The agent runs on the Uri replay in this phase"}
          className="btn btn-primary btn-sm"
        >
          {agent.running ? "Agent running…" : "Run agent"}
        </button>
        <div role="radiogroup" aria-label="Agent mode" className="flex rounded-full border border-border bg-bg p-0.5 text-xs">
          {AGENT_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={agent.mode === m.id}
              onClick={() => agent.onMode(m.id)}
              disabled={!agent.enabled}
              className={`rounded-full px-2.5 py-1 font-medium transition ${agent.mode === m.id ? "bg-btn text-on-btn" : "text-muted hover:text-text"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <span className="flex-1" />
      <ModeToggle mode={mode} onMode={onMode} />
      <Link href="/console/registrations" className="btn btn-quiet btn-sm">
        Sign-ups
      </Link>
      <InfoTip />
      <form method="post" action="/api/logout">
        <button type="submit" className="btn btn-quiet btn-sm">
          Sign out
        </button>
      </form>
      <button type="button" onClick={onTogglePanels} className="btn btn-quiet btn-sm gap-1.5">
        <Chevron open={!panelsHidden} />
        {panelsHidden ? "Show panels" : "Hide panels"}
      </button>
    </header>
  );
}

function ModeToggle({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  return (
    <div role="radiogroup" aria-label="Data mode" className="flex min-w-0 rounded-full border border-border bg-bg p-1">
      {MODES.map((m) => {
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={m.label}
            onClick={() => onMode(m.id)}
            className={`truncate rounded-full px-3 py-1.5 text-xs font-medium transition xl:px-4 xl:text-sm ${
              active ? "bg-btn text-on-btn" : "text-muted hover:text-text"
            }`}
          >
            <span className="xl:hidden">{m.short}</span>
            <span className="hidden xl:inline">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
