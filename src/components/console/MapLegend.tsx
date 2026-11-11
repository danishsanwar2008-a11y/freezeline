"use client";

// The one map key (top left): hex shading steps, home dot colors with live counts, and the crew marker.

import { useState, useSyncExternalStore } from "react";
import type { HomeStatus } from "@/lib/household";
import { NEED_STEPS, STATUS_BG, STATUS_ORDER } from "@/lib/riskScale";
import { STATUS_LABEL } from "@/lib/cityWording";

const DESKTOP = "(min-width: 1024px)";
const isDesktop = () => window.matchMedia(DESKTOP).matches;
function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{children}</p>;
}

export default function MapLegend({ counts }: { counts: Record<HomeStatus, number> }) {
  // Open on desktop; folded on tablets and phones so the map stays visible (one tap opens it).
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => true);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? desktop;
  return (
    <details
      open={open}
      onToggle={(e) => {
        const now = e.currentTarget.open;
        if (now !== open) setUserOpen(now);
      }}
      className="group w-56 rounded-panel border border-border bg-surface/90 text-xs shadow-lg backdrop-blur">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 font-medium text-text marker:hidden">
        Map key
        <span className="text-muted transition group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="space-y-3 border-t border-border px-3 pb-3 pt-2.5">
        <section aria-label="Area shading">
          <Heading>Area shading · % of homes needing action</Heading>
          <ul className="space-y-1">
            {NEED_STEPS.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                <span className="h-3 w-5 rounded-sm ring-1 ring-white/10" style={{ background: s.swatch }} aria-hidden />
                <span className="text-text">{s.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Home dots">
          <Heading>Homes · one dot each</Heading>
          <ul className="space-y-1">
            {STATUS_ORDER.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <span className={`size-2.5 shrink-0 rounded-full ${STATUS_BG[s]}`} aria-hidden />
                <span className="text-text">{STATUS_LABEL[s]}</span>
                <span className="ml-auto font-mono tabular-nums text-muted">{counts[s].toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Crews">
          <Heading>Crews</Heading>
          <ul className="space-y-1">
            <li className="flex items-center gap-2">
              <span className="flex w-5 justify-center" aria-hidden>
                <span className="size-3 rounded-full border-2 border-bg bg-accent" />
              </span>
              <span className="text-text">Help crew</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-0.5 w-5 rounded-full bg-accent" aria-hidden />
              <span className="text-text">Heading to a home</span>
            </li>
          </ul>
        </section>
      </div>
    </details>
  );
}
