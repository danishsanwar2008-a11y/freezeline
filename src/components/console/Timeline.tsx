"use client";

import { useMemo } from "react";
import type { WeatherHour } from "@/lib/weather";
import { fmtF, formatDay, formatHour } from "./format";
import { plural } from "@/lib/plural";

const H = 56;

interface Props {
  hours: WeatherHour[];
  hour: number;
  playing: boolean;
  onHour: (h: number) => void;
  onTogglePlay: () => void;
  /** Hours below 20°F so far at this hour (the freeze readings line). */
  hoursBelow20: number;
}

/** Play button + scrubber drawn over the real Uri temperature curve, with the freeze lines marked. */
export default function Timeline({ hours, hour, playing, onHour, onTogglePlay, hoursBelow20 }: Props) {
  const n = hours.length;
  // Fit the curve, but always keep the 20°F and 32°F lines in view.
  const temps = hours.map((h) => h.temperature_f);
  const T_MIN = Math.min(5, Math.floor(Math.min(...temps) - 5));
  const T_MAX = Math.max(50, Math.ceil(Math.max(...temps) + 5));
  const y = (t: number) => H - ((t - T_MIN) / (T_MAX - T_MIN)) * H;

  const { path, area, days, labels } = useMemo(() => {
    const pts = hours.map((h, i) => `${i},${y(h.temperature_f).toFixed(2)}`);
    const indexed = hours.map((h, i) => ({ i, h }));
    return {
      path: `M${pts.join(" L")}`,
      area: `M0,${H} L${pts.join(" L")} L${n - 1},${H} Z`,
      days: indexed.filter(({ h, i }) => i > 0 && h.time.endsWith("T00:00")), // midnight dividers
      labels: indexed.filter(({ h }) => h.time.endsWith("T12:00")), // day names centered at noon
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours]);

  return (
    <div className="glass flex items-center gap-3 px-3 py-2">
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={playing ? "Pause replay" : "Play replay"}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-btn text-on-btn transition hover:brightness-110"
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 1.5v11l9.5-5.5z" fill="currentColor" /></svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <Readings w={hours[hour]} hoursBelow20={hoursBelow20} />
        <div className="relative h-[37px]">
          <svg viewBox={`0 0 ${n - 1} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <path d={area} fill="var(--accent)" opacity="0.08" />
            <line x1="0" x2={n - 1} y1={y(32)} y2={y(32)} stroke="var(--accent)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.7" />
            <line x1="0" x2={n - 1} y1={y(20)} y2={y(20)} stroke="var(--risk-high)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.7" />
            <path d={path} fill="none" stroke="var(--text)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity="0.85" />
            {days.map(({ i }) => (
              <line key={i} x1={i} x2={i} y1="0" y2={H} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            <line x1={hour} x2={hour} y1="0" y2={H} stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* The chart is short (91px box): 32°F sits above its line, 20°F below its own, both haloed so the curve never cuts the text. */}
          <span className="pointer-events-none absolute right-1 font-mono text-[11px] leading-none text-accent [text-shadow:0_0_3px_var(--surface),0_0_3px_var(--surface)]" style={{ top: `${(y(32) / H) * 100}%`, transform: "translateY(-120%)" }}>
            32°F freeze line
          </span>
          <span className="pointer-events-none absolute right-1 font-mono text-[11px] leading-none text-risk-high [text-shadow:0_0_3px_var(--surface),0_0_3px_var(--surface)]" style={{ top: `${(y(20) / H) * 100}%`, transform: "translateY(20%)" }}>
            20°F
          </span>
          <input
            type="range"
            min={0}
            max={n - 1}
            step={1}
            value={hour}
            onChange={(e) => onHour(Number(e.target.value))}
            aria-label="Replay hour"
            aria-valuetext={formatHour(hours[hour].time)}
            className="timeline-range absolute inset-0 size-full cursor-ew-resize"
          />
        </div>
        <div className="relative mt-0.5 h-4 font-mono text-[11px] text-muted">
          {labels.map(({ i, h }) => (
            <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap max-sm:[&:nth-child(even)]:hidden lg:max-xl:[&:nth-child(even)]:hidden" style={{ left: `${(i / (n - 1)) * 100}%` }}>
              {formatDay(h.time)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const ICON = {
  thermo: "M14 14.76V3.5a2 2 0 1 0-4 0v11.26a4 4 0 1 0 4 0Z",
  wind: "M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2",
};

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 text-accent-ink" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** This hour's freeze readings in one line (real weather). */
function Readings({ w, hoursBelow20 }: { w: WeatherHour; hoursBelow20: number }) {
  const items = [
    { d: ICON.thermo, text: `${fmtF(w.temperature_f)} now` },
    { d: ICON.thermo, text: `feels like ${fmtF(w.apparent_temperature_f)}` },
    // Wind is folded into "feels like"; dropped at 1024-1279px so the timeline stays one line (91px) tall.
    { d: ICON.wind, text: `wind ${Math.round(w.wind_speed_mph)} mph`, cls: "lg:max-xl:hidden" },
    { d: ICON.clock, text: `${plural(hoursBelow20, "hour")} below 20°F` },
  ];
  return (
    <p className="mb-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
      <span className="font-medium text-text">{formatHour(w.time)}</span>
      {items.map((it) => (
        <span key={it.text} className={`flex items-center gap-1 text-muted ${"cls" in it ? it.cls : ""}`}>
          <Glyph d={it.d} />
          <span className="font-mono tabular-nums">{it.text}</span>
        </span>
      ))}
    </p>
  );
}
