"use client";

import { useEffect, useState } from "react";
import { STATUS_FROM_CODE } from "@/lib/riskScale";
import type { HomeStatus } from "@/lib/household";

export interface OpsCrew {
  id: number;
  name: string;
  depot_lat: number;
  depot_lng: number;
  /** Area the crew's depot is in. */
  area: string;
  zone_id?: string;
  assignment: {
    home_id: string;
    street: string;
    lat: number;
    lng: number;
    needs: string;
    assigned_at: string;
    /** Road miles from the depot and drive time (simulated). */
    miles: number;
    minutes: number;
    /** The drive along real streets, [lng, lat] from depot to home. */
    route: [number, number][];
    /** false = no street route found; a straight-line estimate is shown. */
    routed: boolean;
    /** Replay hours since the job was assigned (0 = this hour). */
    hoursAgo: number;
  } | null;
}

export interface OpsData {
  available: boolean;
  /** Outreach has run for this hour. */
  ran: boolean;
  /** One letter per home (same order as the console's homes). */
  statuses: string;
  funnel: { texted: number; called: number; doorChecks: number; neighborFlags: number };
  crews: OpsCrew[];
  crewQueue: number;
  /** Homes waiting for a crew, per area (zone id). Crews never leave their area. */
  crewQueueByArea: Record<string, number>;
}

export const statusAt = (ops: OpsData | null, i: number): HomeStatus => STATUS_FROM_CODE[ops?.statuses[i] ?? "c"] ?? "not_contacted";

/** City Operations data for a replay hour. Refetches when the hour or `version` (agent activity) changes. */
export function useOps(time: string | null, version: number) {
  const [state, setState] = useState<{ key: string; data: OpsData | null; error: string | null; at: number }>({ key: "", data: null, error: null, at: 0 });
  const key = `${time}|${version}`;
  useEffect(() => {
    if (!time) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/ops?time=${encodeURIComponent(time)}`, { signal: ctrl.signal })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
          setState({ key, data: d as OpsData, error: null, at: Date.now() });
        })
        .catch((e) => {
          if ((e as Error).name !== "AbortError") setState({ key, data: null, error: (e as Error).message, at: Date.now() });
        });
    }, 150); // debounce while the replay is playing
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [time, key]);
  // Keep showing the last data while the next hour loads, so the map doesn't flash gray.
  return { data: state.data, error: state.error, fresh: state.key === key, at: state.at };
}
