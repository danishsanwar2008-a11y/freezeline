"use client";

// "Storm in your area": a friendly replay of the storm for one household. Aggregated only:
// softly shaded areas (calm / watch / severe) and this household's own pin. No other homes.

import { useEffect, useMemo, useState } from "react";
import { Layer, Map, Marker, Source } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Shade, StormDay } from "@/lib/server/homeowner";

setWorkerUrl("/maplibre-gl-worker.mjs");
const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
// Soft violet ramp (the area "need" scale; never a home status color).
const SHADE: Record<Shade, string> = { calm: "#ddd6fe", watch: "#a78bfa", severe: "#7c3aed" };
const SHADE_OPACITY: Record<Shade, number> = { calm: 0.12, watch: 0.35, severe: 0.55 };

function WeatherIcon({ low }: { low: number }) {
  // Snowflake (hard freeze), thermometer-low (freezing), cloud (cold), sun (mild)
  const d =
    low < 20
      ? "M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9"
      : low < 32
        ? "M14 14.76V3.5a2 2 0 1 0-4 0v11.26a4 4 0 1 0 4 0Z"
        : low < 45
          ? "M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 2A3 3 0 0 0 7 18Z"
          : "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z";
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

interface Labels {
  intro: string;
  play: string;
  pause: string;
  shade: Record<Shade, string>;
  yourHome: string;
  privacy: string;
}

export default function StormView({ days, home, labels }: { days: StormDay[]; home: { lat: number; lng: number }; labels: Labels }) {
  const coldest = useMemo(() => days.reduce((b, d, i) => (d.low < days[b].low ? i : b), 0), [days]);
  const [day, setDay] = useState(coldest);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setDay((d) => (d + 1) % days.length), 1800);
    return () => clearInterval(id);
  }, [playing, days.length]);

  const d = days[day];
  const geo = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: d.areas.map((a) => {
        const [s, w, n, e] = a.bbox;
        return {
          type: "Feature" as const,
          properties: { color: SHADE[a.shade], opacity: SHADE_OPACITY[a.shade] },
          geometry: { type: "Polygon" as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
        };
      }),
    }),
    [d],
  );

  return (
    <div className="flex flex-col gap-6">
      <p className="text-base text-muted">{labels.intro}</p>

      <p className="text-2xl font-semibold leading-snug" aria-live="polite">
        {d.sentence}
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-accent px-5 text-base font-semibold text-bg"
        >
          {playing ? labels.pause : labels.play}
        </button>
        <ol className="flex flex-1 gap-1 overflow-x-auto">
          {days.map((x, i) => (
            <li key={x.time} className="flex-1">
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setDay(i);
                }}
                aria-current={i === day ? "true" : undefined}
                className={`flex w-full min-w-14 flex-col items-center rounded-panel px-1 py-2 text-center transition ${
                  i === day ? "bg-accent/20 text-text ring-1 ring-accent" : "text-muted hover:bg-surface"
                }`}
              >
                <span className="text-[11px]">{x.label.split(/,/)[0]}</span>
                <WeatherIcon low={x.low} />
                <span className="font-mono text-xs tabular-nums">{x.low}°</span>
                <span className="font-mono text-[10px] tabular-nums opacity-70">{x.high}°</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="relative h-72 overflow-hidden rounded-panel border border-border">
        <Map
          initialViewState={{ longitude: home.lng, latitude: home.lat, zoom: 11.3 }}
          mapStyle={BASEMAP}
          attributionControl={{ compact: true }}
          dragRotate={false}
        >
          <Source id="areas" type="geojson" data={geo}>
            <Layer id="areas-fill" type="fill" paint={{ "fill-color": ["get", "color"], "fill-opacity": ["get", "opacity"] }} />
            <Layer id="areas-line" type="line" paint={{ "line-color": ["get", "color"], "line-opacity": 0.6, "line-width": 1 }} />
          </Source>
          <Marker longitude={home.lng} latitude={home.lat} anchor="bottom">
            <div className="flex flex-col items-center">
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-bg">{labels.yourHome}</span>
              <span className="mt-0.5 size-3 rounded-full border-2 border-bg bg-accent" />
            </div>
          </Marker>
        </Map>
      </div>
      <ul className="flex gap-4 text-xs text-muted">
        {(["calm", "watch", "severe"] as Shade[]).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ background: SHADE[s], opacity: 0.5 + SHADE_OPACITY[s] }} aria-hidden />
            {labels.shade[s]}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{labels.privacy}</p>
    </div>
  );
}
