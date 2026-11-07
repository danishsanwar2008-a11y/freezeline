"use client";

import type { ExposedPipe, DisplayLevel } from "@/lib/steps";

const LEVEL_STROKE: Record<DisplayLevel, string> = {
  High: "var(--risk-high)",
  Watch: "var(--risk-mid)",
  Low: "var(--risk-low)",
};

const LABELS: Record<ExposedPipe, string> = {
  crawlspace: "Crawlspace",
  attic: "Attic",
  exterior_wall: "Outside wall",
  outdoor_faucet: "Outdoor faucet",
};

interface Props {
  foundation: "slab" | "pier_and_beam";
  exposed: ExposedPipe[];
  level: DisplayLevel;
  /** Translated pipe labels and caption (default English). */
  labels?: Record<ExposedPipe, string>;
  caption?: { exposed: string; safe: string };
}

/** Simple cross-section of the house; exposed pipe runs are highlighted, everything else stays quiet. */
export default function HouseDiagram({ foundation, exposed, level, labels = LABELS, caption }: Props) {
  const pier = foundation === "pier_and_beam";
  const hot = (p: ExposedPipe) => exposed.includes(p);
  const pipe = (p: ExposedPipe | null) =>
    p && hot(p)
      ? { stroke: LEVEL_STROKE[level], strokeWidth: 4, opacity: 1 }
      : { stroke: "var(--muted)", strokeWidth: 2.5, opacity: 0.45 };

  // Geometry: pier-and-beam floors sit above a crawlspace; slab floors sit on the ground.
  const ground = 158;
  const floor = pier ? 124 : 146;
  const ceiling = pier ? 64 : 80;
  const roofPeak = ceiling - 42;
  const underFloor = pier ? 138 : ground + 10; // supply line runs through crawlspace or under slab
  const atticLine = ceiling - 12;

  const label = (p: ExposedPipe, x: number, y: number, anchor: "start" | "end" | "middle" = "start") =>
    hot(p) ? (
      <text x={x} y={y} textAnchor={anchor} className="fill-text text-[11px] font-medium">
        {labels[p]}
      </text>
    ) : null;

  return (
    <figure>
      <svg viewBox="0 0 320 182" className="w-full" role="img" aria-label={`Cross-section of a ${pier ? "pier-and-beam" : "slab"} house. Exposed pipes: ${exposed.length ? exposed.map((e) => labels[e].toLowerCase()).join(", ") : "none"}.`}>
        {/* ground */}
        <line x1="0" x2="320" y1={ground} y2={ground} stroke="var(--border)" strokeWidth="2" />
        {pier ? (
          [78, 160, 242].map((x) => <rect key={x} x={x - 5} y={floor} width="10" height={ground - floor} fill="var(--border)" />)
        ) : (
          <rect x="62" y={floor} width="196" height={ground - floor} fill="var(--border)" />
        )}

        {/* house */}
        <rect x="66" y={ceiling} width="188" height={floor - ceiling} fill="var(--bg)" stroke="var(--muted)" strokeOpacity="0.5" strokeWidth="2" />
        <path d={`M56 ${ceiling} L160 ${roofPeak} L264 ${ceiling} Z`} fill="var(--bg)" stroke="var(--muted)" strokeOpacity="0.5" strokeWidth="2" strokeLinejoin="round" />
        <line x1="66" x2="254" y1={ceiling} y2={ceiling} stroke="var(--muted)" strokeOpacity="0.5" strokeWidth="2" />

        {/* sink + tap inside, next to the outside wall */}
        <rect x="80" y={floor - 30} width="34" height="6" rx="2" fill="var(--muted)" opacity="0.5" />

        {/* water main from the street */}
        <path d={`M0 ${underFloor} H74`} fill="none" strokeLinecap="round" {...pipe(pier ? "crawlspace" : null)} />
        {/* crawlspace run (pier) or under-slab run */}
        <path d={`M74 ${underFloor} H210`} fill="none" strokeLinecap="round" {...pipe(pier ? "crawlspace" : null)} />
        {/* riser in the outside wall up to the sink */}
        <path d={`M74 ${underFloor} V${floor - 27} H86`} fill="none" strokeLinecap="round" strokeLinejoin="round" {...pipe("exterior_wall")} />
        {/* interior riser */}
        <path d={`M210 ${underFloor} V${pier ? floor - 26 : atticLine}`} fill="none" strokeLinecap="round" {...pipe(!pier ? "attic" : null)} />
        {/* attic run (slab homes) */}
        {!pier && <path d={`M210 ${atticLine} H120 V${ceiling + 18}`} fill="none" strokeLinecap="round" strokeLinejoin="round" {...pipe("attic")} />}
        {/* outdoor faucet on the outside wall */}
        <path d={`M74 ${floor - 10} H36 V${floor - 4}`} fill="none" strokeLinecap="round" strokeLinejoin="round" {...pipe("outdoor_faucet")} />
        <circle cx="36" cy={floor - 12} r="4" fill="none" {...pipe("outdoor_faucet")} />

        {label("crawlspace", 150, floor + 10, "middle")}
        {label("attic", 160, atticLine - 6, "middle")}
        {label("exterior_wall", 92, ceiling + 22)}
        {label("outdoor_faucet", 4, ground + 18)}
      </svg>
      <figcaption className="mt-2 text-xs text-muted">
        {exposed.length ? (caption?.exposed ?? "Highlighted: the pipes most exposed to cold.") : (caption?.safe ?? "Your pipes run through heated space.")}
      </figcaption>
    </figure>
  );
}
