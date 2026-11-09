"use client";

import type { ExposedPipe, DisplayLevel } from "@/lib/steps";

const LABELS: Record<ExposedPipe, string> = {
  crawlspace: "Crawlspace",
  attic: "Attic",
  exterior_wall: "Outside wall",
  outdoor_faucet: "Outdoor faucet",
};

interface Props {
  foundation: "slab" | "pier_and_beam";
  /** At-risk pipe sections (red). */
  exposed: ExposedPipe[];
  /** Sections confirmed by the photo check (solid red); the rest are likely (dashed). */
  confirmed?: ExposedPipe[];
  /** The outdoor faucet has an indoor shutoff valve. */
  hasShutoff?: boolean;
  hasOutdoorFaucet?: boolean;
  level: DisplayLevel;
  labels?: Record<ExposedPipe, string>;
  extra?: { kitchen: string; bath: string; valve: string; likely: string; confirmedLabel: string; safe: string };
}

const EXTRA_EN = { kitchen: "Kitchen", bath: "Bath", valve: "Indoor valve", likely: "Likely (property record)", confirmedLabel: "Confirmed (photo)", safe: "Your pipes run through heated space." };

/**
 * Clear cross-section of the house: crawlspace (pier-and-beam) or slab, interior kitchen and bath
 * pipes, the outdoor faucet (and its indoor valve), and the attic. At-risk sections are red:
 * dashed = likely (property record), solid = confirmed by the photo check.
 */
export default function HouseDiagram({ foundation, exposed, confirmed = [], hasShutoff = false, hasOutdoorFaucet = true, labels = LABELS, extra = EXTRA_EN }: Props) {
  const pier = foundation === "pier_and_beam";
  const ground = 186;
  const floor = pier ? 146 : 166;
  const ceiling = floor - 74;
  const peak = ceiling - 44;
  const under = pier ? 164 : 176; // supply line: through the crawlspace, or inside the slab
  const attic = ceiling - 13;
  const L = 74, R = 296; // outer walls

  const risk = (p: ExposedPipe) => exposed.includes(p);
  const pipe = (p: ExposedPipe | null) =>
    p && risk(p)
      ? { stroke: "var(--risk-high)", strokeWidth: 4.5, strokeDasharray: confirmed.includes(p) ? undefined : "7 5", opacity: 1 }
      : { stroke: "var(--muted)", strokeWidth: 3, opacity: 0.55 };
  const label = (p: ExposedPipe, x: number, y: number, anchor: "start" | "end" | "middle" = "start") =>
    risk(p) ? (
      <text x={x} y={y} textAnchor={anchor} className="fill-text text-[12px] font-semibold">
        {labels[p]}
      </text>
    ) : null;
  const small = (x: number, y: number, t: string, anchor: "start" | "middle" | "end" = "middle") => (
    <text x={x} y={y} textAnchor={anchor} className="fill-muted text-[11px]">
      {t}
    </text>
  );

  return (
    <figure>
      <svg
        viewBox="0 0 360 214"
        className="w-full"
        role="img"
        aria-label={`Cross-section of a ${pier ? "pier-and-beam" : "slab"} house. At-risk pipes: ${exposed.length ? exposed.map((e) => labels[e].toLowerCase()).join(", ") : "none"}.`}
      >
        {/* ground + foundation */}
        <line x1="0" x2="360" y1={ground} y2={ground} stroke="var(--border)" strokeWidth="2" />
        {pier ? (
          <>
            {[96, 185, 274].map((x) => (
              <rect key={x} x={x - 6} y={floor} width="12" height={ground - floor} fill="var(--border)" />
            ))}
          </>
        ) : (
          <rect x={L - 4} y={floor} width={R - L + 8} height={ground - floor} fill="var(--border)" />
        )}

        {/* house shell */}
        <rect x={L} y={ceiling} width={R - L} height={floor - ceiling} fill="var(--bg)" stroke="var(--muted)" strokeOpacity="0.55" strokeWidth="2" />
        <path d={`M${L - 12} ${ceiling} L185 ${peak} L${R + 12} ${ceiling} Z`} fill="var(--bg)" stroke="var(--muted)" strokeOpacity="0.55" strokeWidth="2" strokeLinejoin="round" />

        {/* kitchen sink (left, on the outside wall) and bathroom sink (right, inside) */}
        <rect x={L + 16} y={floor - 34} width="40" height="7" rx="2" fill="var(--muted)" opacity="0.6" />
        {small(L + 36, floor - 40, extra.kitchen)}
        <rect x={232} y={floor - 34} width="34" height="7" rx="2" fill="var(--muted)" opacity="0.6" />
        {small(249, floor - 40, extra.bath)}

        {/* water main from the street */}
        <path d={`M0 ${under} H${L + 8}`} fill="none" strokeLinecap="round" {...pipe(pier ? "crawlspace" : null)} />
        {/* run under the floor (crawlspace) or inside the slab */}
        <path d={`M${L + 8} ${under} H245`} fill="none" strokeLinecap="round" {...pipe(pier ? "crawlspace" : null)} />
        {/* riser in the outside wall up to the kitchen sink */}
        <path d={`M${L + 8} ${under} V${floor - 30} H${L + 20}`} fill="none" strokeLinecap="round" strokeLinejoin="round" {...pipe("exterior_wall")} />
        {/* interior riser up to the bathroom (and on to the attic run on slab homes) */}
        <path d={`M245 ${under} V${pier ? floor - 30 : attic}`} fill="none" strokeLinecap="round" {...pipe(!pier ? "attic" : null)} />
        {!pier && <path d={`M245 ${attic} H150 V${ceiling + 20}`} fill="none" strokeLinecap="round" strokeLinejoin="round" {...pipe("attic")} />}

        {/* outdoor faucet through the outside wall, with its indoor valve */}
        {hasOutdoorFaucet && (
          <>
            <path d={`M${L + 8} ${floor - 12} H${L - 30} V${floor - 5}`} fill="none" strokeLinecap="round" strokeLinejoin="round" {...pipe("outdoor_faucet")} />
            <circle cx={L - 30} cy={floor - 15} r="5" fill="none" {...pipe("outdoor_faucet")} />
            {hasShutoff && (
              <>
                <path d={`M${L + 1} ${floor - 17} l8 10 v-10 l-8 10 Z`} fill="var(--accent)" stroke="var(--accent)" strokeWidth="1" />
                {small(L + 14, floor - 3, extra.valve, "start")}
              </>
            )}
          </>
        )}

        {label("crawlspace", 185, under + 16, "middle")}
        {label("attic", 198, attic - 7, "middle")}
        {label("exterior_wall", L + 14, ceiling + 18)}
        {label("outdoor_faucet", 4, ground + 16)}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {exposed.length ? (
          <>
            <span className="flex items-center gap-1.5">
              <svg width="26" height="6" aria-hidden>
                <line x1="1" x2="25" y1="3" y2="3" stroke="var(--risk-high)" strokeWidth="3" strokeDasharray="6 4" />
              </svg>
              {extra.likely}
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="26" height="6" aria-hidden>
                <line x1="1" x2="25" y1="3" y2="3" stroke="var(--risk-high)" strokeWidth="3" />
              </svg>
              {extra.confirmedLabel}
            </span>
          </>
        ) : (
          extra.safe
        )}
      </figcaption>
    </figure>
  );
}
