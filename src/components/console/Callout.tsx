"use client";

import { useEffect } from "react";

// A quick view that belongs to one thing on the map (a house or a crew): a navy box with a small tail
// pointing at it, grown out of that point (scale + fade, 200 ms; still under reduced motion), and kept
// on it while the map pans (RiskMap places it with the live viewport).

export const CALLOUT_W = 288;

export default function Callout({
  x,
  y,
  mapWidth,
  title,
  subtitle,
  onClose,
  children,
}: {
  /** The point it belongs to, in map pixels. */
  x: number;
  y: number;
  mapWidth: number;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  // Escape closes it (it is a small non-modal dialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Above the point unless that would leave the top of the map; kept inside the map horizontally.
  const below = y < 230;
  const half = CALLOUT_W / 2;
  const left = Math.min(Math.max(x, half + 8), Math.max(half + 8, mapWidth - half - 8));
  const tailX = Math.min(Math.max(x - left + half, 18), CALLOUT_W - 18);
  return (
    <div
      className="pointer-events-none absolute z-10"
      style={{ left, top: y, width: CALLOUT_W, transform: `translate(-50%, ${below ? "14px" : "calc(-100% - 14px)"})` }}
    >
      <div
        role="dialog"
        aria-label={title}
        className="callout-enter pointer-events-auto relative rounded-[14px] border border-white/10 bg-surface p-3.5 text-text shadow-[0_6px_20px_rgb(16_28_46/0.35)]"
        style={{ transformOrigin: `${tailX}px ${below ? "0%" : "100%"}` }}
      >
        <span
          aria-hidden
          className="absolute size-3 rotate-45 border-white/10 bg-surface"
          style={{
            left: tailX - 6,
            ...(below ? { top: -6.5, borderTopWidth: 1, borderLeftWidth: 1 } : { bottom: -6.5, borderBottomWidth: 1, borderRightWidth: 1 }),
          }}
        />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug">{title}</p>
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="-mr-1 -mt-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-bg hover:text-text"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
