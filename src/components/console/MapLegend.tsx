"use client";

// The map key (top left, see-through): the 4 cell steps (darker = more homes need action) and the crew
// marker + route. Home dot colors live only in the Homes contacted box, so no key is shown twice.

import { NEED_STEPS } from "@/lib/riskScale";
import Panel from "./Panel";

export default function MapLegend() {
  return (
    <Panel id="map-key" title="Map key" tone="glass">
      <p className="text-[13px] text-text">Darker cells: more homes need action</p>
      <ul className="mt-2 grid grid-cols-4 gap-1.5" aria-label="Cell shading, share of homes needing action">
        {NEED_STEPS.map((s) => (
          <li key={s.label} className="flex flex-col gap-1">
            <span className="h-3 rounded-sm ring-1 ring-text/30" style={{ background: s.swatch }} aria-hidden />
            <span className="text-[11px] leading-tight text-muted">{s.label}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-text">
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-full border-2 border-white bg-crew" aria-hidden />
          Help crew
        </li>
        <li className="flex items-center gap-2">
          <span className="h-0.5 w-5 rounded-full bg-accent" aria-hidden />
          Route to a home
        </li>
      </ul>
    </Panel>
  );
}
