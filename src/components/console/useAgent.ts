"use client";

import { useCallback, useState } from "react";

export type AgentMode = "auto" | "approve";

export interface AgentEntry {
  id: string;
  kind: "action" | "note" | "error";
  tool?: string;
  summary: string;
  reason?: string;
  status: "done" | "pending" | "failed";
  input?: unknown;
}

export interface AgentRun {
  status: "running" | "done" | "error";
  entries: AgentEntry[];
  source?: "claude" | "rules";
  usage?: { calls: number; input_tokens: number; output_tokens: number; model: string | null };
  error?: string;
}

/** Agent runs per replay time. Runs only when the official clicks; approvals execute one at a time. */
export function useAgent() {
  const [runs, setRuns] = useState<Record<string, AgentRun>>({});
  const [mode, setMode] = useState<AgentMode>("auto");
  const [approving, setApproving] = useState<string | null>(null);

  const update = (time: string, fn: (r: AgentRun) => AgentRun) =>
    setRuns((all) => ({ ...all, [time]: fn(all[time] ?? { status: "done", entries: [] }) }));

  const run = useCallback(
    async (time: string) => {
      setRuns((all) => ({ ...all, [time]: { status: "running", entries: all[time]?.entries ?? [] } }));
      try {
        const res = await fetch("/api/agent/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ time, mode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setRuns((all) => ({
          ...all,
          [time]: { status: "done", entries: [...(all[time]?.entries ?? []), ...data.entries], source: data.source, usage: data.usage },
        }));
      } catch (err) {
        update(time, (r) => ({ ...r, status: "error", error: err instanceof Error ? err.message : String(err) }));
      }
    },
    [mode],
  );

  const approve = useCallback(async (time: string, entry: AgentEntry) => {
    setApproving(entry.id);
    try {
      const res = await fetch("/api/agent/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ time, pending: entry.input }),
      });
      const data = await res.json();
      update(time, (r) => ({
        ...r,
        entries: r.entries.map((e) =>
          e.id === entry.id
            ? res.ok
              ? { ...e, status: "done", summary: data.entry.summary, input: undefined }
              : { ...e, status: "failed", summary: `${e.summary} Failed: ${data.error}` }
            : e,
        ),
      }));
    } finally {
      setApproving(null);
    }
  }, []);

  const skip = useCallback((time: string, entry: AgentEntry) => {
    update(time, (r) => ({ ...r, entries: r.entries.map((e) => (e.id === entry.id ? { ...e, status: "failed", summary: `Skipped: ${e.summary}`, input: undefined } : e)) }));
  }, []);

  return { runs, mode, setMode, run, approve, skip, approving };
}
