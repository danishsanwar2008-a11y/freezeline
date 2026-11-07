"use client";

import { useEffect, useRef, useState } from "react";
import { fetchLiveForecast, type WeatherSeries } from "@/lib/weather";

export type LiveState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; series: WeatherSeries };

/** Loads the live 7-day Houston forecast the first time Live mode is opened. */
export function useLiveForecast(enabled: boolean) {
  const [state, setState] = useState<LiveState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const loaded = state.status === "ready";

  useEffect(() => {
    if (!enabled || loaded || inFlight.current) return;
    inFlight.current = true;
    fetchLiveForecast(7)
      .then((series) => setState({ status: "ready", series }))
      .catch((err) => setState({ status: "error", message: err instanceof Error ? err.message : String(err) }))
      .finally(() => {
        inFlight.current = false;
      });
  }, [enabled, loaded, attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((a) => a + 1);
  };
  return { state, retry };
}
