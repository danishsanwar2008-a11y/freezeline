"use client";

import { useCallback, useState } from "react";

export type AgentMode = "auto" | "approve";

export interface AgentEntry {
  id: string;
  /** step = something the agent read or checked; notify = a simulated notification (nothing is sent). */
  kind: "action" | "note" | "error" | "step" | "notify";
  tool?: string;
  summary: string;
  reason?: string;
  status: "done" | "pending" | "failed";
  input?: unknown;
  /** Step entries: the short result on the right. */
  result?: string;
  /** Notify entries: who was notified. */
  party?: string;
  /** The area an approved or skipped action was for (its input is cleared once decided). */
  zoneId?: string;
}

const zoneIdOf = (e: AgentEntry) => (e.input as { args?: { zone_id?: string } } | undefined)?.args?.zone_id;

export interface AgentRun {
  status: "running" | "done" | "error";
  entries: AgentEntry[];
  /** While running: what the agent is doing right now (from the live stream). */
  working?: string | null;
  /** Steps this run will take, when known up front (the rules agent). */
  total?: number;
  source?: "claude" | "rules";
  usage?: { calls: number; input_tokens: number; output_tokens: number; model: string | null };
  error?: string;
}

/** Agent runs per replay time. Runs only when the official clicks; approvals execute one at a time. */
export function useAgent() {
  const [runs, setRuns] = useState<Record<string, AgentRun>>({});
  // The agent always runs in Auto. Stage 2 alerts still wait for a supervisor's Approve in the trace.
  const mode: AgentMode = "auto";
  const [approving, setApproving] = useState<string | null>(null);
  /** Bumps after every agent run or approval, so City Operations data refetches. */
  const [version, setVersion] = useState(0);

  const update = (time: string, fn: (r: AgentRun) => AgentRun) =>
    setRuns((all) => ({ ...all, [time]: fn(all[time] ?? { status: "done", entries: [] }) }));

  const run = useCallback(
    async (time: string) => {
      // A new run replaces the last one for this hour; its steps stream in as they happen.
      setRuns((all) => ({ ...all, [time]: { status: "running", entries: [], working: "Starting the agent" } }));
      try {
        const res = await fetch("/api/agent/run?stream=1", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ time, mode }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let finished = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const ev = JSON.parse(line);
            if (ev.type === "plan") update(time, (r) => ({ ...r, total: ev.total }));
            else if (ev.type === "start") update(time, (r) => ({ ...r, working: ev.label }));
            else if (ev.type === "entry") update(time, (r) => ({ ...r, working: null, entries: [...r.entries, ev.entry] }));
            else if (ev.type === "error") throw new Error(ev.error);
            else if (ev.type === "done") {
              finished = true;
              update(time, (r) => ({ ...r, status: "done", working: null, source: ev.result.source, usage: ev.result.usage }));
            }
          }
        }
        if (!finished) throw new Error("The run stopped before it finished.");
      } catch (err) {
        update(time, (r) => ({ ...r, status: "error", working: null, error: err instanceof Error ? err.message : String(err) }));
      } finally {
        setVersion((v) => v + 1);
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
              ? { ...e, status: "done", summary: data.entry.summary, zoneId: zoneIdOf(e), input: undefined }
              : { ...e, status: "failed", summary: `${e.summary} Failed: ${data.error}` }
            : e,
        ),
      }));
    } finally {
      setApproving(null);
      setVersion((v) => v + 1);
    }
  }, []);

  const skip = useCallback((time: string, entry: AgentEntry) => {
    update(time, (r) => ({ ...r, entries: r.entries.map((e) => (e.id === entry.id ? { ...e, status: "failed", summary: `Skipped: ${e.summary}`, zoneId: zoneIdOf(e), input: undefined } : e)) }));
  }, []);

  return { runs, run, approve, skip, approving, version };
}
