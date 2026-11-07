"use client";

export type Mode = "live" | "replay";

const MODES: { id: Mode; label: string; short: string }[] = [
  { id: "live", label: "Live forecast", short: "Live" },
  { id: "replay", label: "Replay: Winter Storm Uri (Feb 2021)", short: "Replay: Uri 2021" },
];

function InfoTip() {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-describedby="data-note"
        className="flex size-7 items-center justify-center rounded-full text-sm text-muted transition hover:bg-border hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span aria-hidden>ⓘ</span>
        <span className="sr-only">About this data</span>
      </button>
      <span
        id="data-note"
        role="tooltip"
        className="pointer-events-none absolute right-0 top-9 z-20 w-64 rounded-panel border border-border bg-surface p-3 text-xs leading-relaxed text-muted opacity-0 shadow-lg transition group-focus-within:opacity-100 group-hover:opacity-100"
      >
        Homes are <span className="text-text">simulated sample data</span>. Weather is real: Open-Meteo&apos;s archive for Feb 2021 in
        Replay, and the current forecast in Live.
      </span>
    </span>
  );
}

export default function TopBar({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
      <p className="hidden font-mono text-xs tracking-[0.2em] text-accent sm:block">FREEZELINE</p>
      <div role="radiogroup" aria-label="Data mode" className="mx-auto flex min-w-0 rounded-full border border-border bg-bg p-1">
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
              className={`truncate rounded-full px-3 py-1.5 text-xs font-medium transition sm:px-4 sm:text-sm ${
                active ? "bg-accent text-bg" : "text-muted hover:text-text"
              }`}
            >
              <span className="sm:hidden">{m.short}</span>
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          );
        })}
      </div>
      <InfoTip />
    </header>
  );
}
