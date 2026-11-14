"use client";

import { useState } from "react";
import type { AgentEntry, AgentMode, AgentRun } from "./useAgent";
import { plural } from "@/lib/plural";
import Panel from "./Panel";

const DOT: Record<AgentEntry["status"], string> = {
  done: "bg-ok",
  pending: "bg-accent",
  failed: "bg-danger",
};

function EntryRow({
  e,
  canApprove,
  busy,
  onApprove,
  onSkip,
}: {
  e: AgentEntry;
  canApprove: boolean;
  busy: boolean;
  onApprove: () => void;
  onSkip: () => void;
}) {
  return (
    <li className="flex gap-3">
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${e.kind === "note" ? "bg-muted" : DOT[e.status]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${e.status === "failed" ? "text-danger" : ""}`}>{e.summary}</p>
        {e.reason && <p className="mt-0.5 text-xs leading-relaxed text-muted">{e.reason}</p>}
        {e.status === "pending" && (
          <div className="mt-2 flex gap-2">
            {canApprove ? (
              <>
                <button
                  type="button"
                  onClick={onApprove}
                  disabled={busy}
                  className="btn btn-primary btn-sm"
                >
                  {busy ? "Working…" : "Approve"}
                </button>
                <button type="button" onClick={onSkip} disabled={busy} className="btn btn-quiet btn-sm">
                  Skip
                </button>
              </>
            ) : (
              <span className="text-xs text-muted">Waiting for the step above</span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

interface Props {
  time: string;
  enabled: boolean;
  run?: AgentRun;
  mode: AgentMode;
  onApprove: (e: AgentEntry) => void;
  onSkip: (e: AgentEntry) => void;
  approving: string | null;
}

/** Run the agent for this hour and read, in plain sentences, what it did and why. */
export default function AgentPanel({ enabled, run, mode, onApprove, onSkip, approving }: Props) {
  const [showAll, setShowAll] = useState(false);
  const entries = run?.entries ?? [];
  const pendingIdx = entries.findIndex((e) => e.status === "pending");
  const firstPending = pendingIdx >= 0 ? entries[pendingIdx].id : undefined;
  // Collapsed: the latest 3, or (while approving) the step just handled, the one waiting for a click, and the next.
  const start = Math.max(0, pendingIdx - 1);
  const visible = showAll ? entries : pendingIdx >= 0 ? entries.slice(start, start + 3) : entries.slice(-3);
  const running = run?.status === "running";

  return (
    <Panel id="trace" title="Decision trace" grow>
      {!enabled && <p className="text-sm text-muted">The agent runs on the Uri replay in this phase. Switch to Replay to try it.</p>}
      {run?.status === "error" && <p className="text-sm text-danger">The agent couldn’t run: {run.error}</p>}

      {entries.length > 0 && (
        <>
          <ul className="space-y-3" aria-live="polite">
            {visible.map((e) => (
              <EntryRow
                key={e.id}
                e={e}
                canApprove={e.id === firstPending}
                busy={approving === e.id}
                onApprove={() => onApprove(e)}
                onSkip={() => onSkip(e)}
              />
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between text-xs text-muted">
            {entries.length > 3 ? (
              <button type="button" onClick={() => setShowAll((s) => !s)} className="text-accent hover:underline">
                {showAll ? "Show latest 3" : `Show all (${entries.length})`}
              </button>
            ) : (
              <span />
            )}
            <span>
              {run?.source === "claude" && run.usage ? `Claude Opus 5.5 · ${plural(run.usage.calls, "call")}` : run?.source === "rules" ? "Pre-written explanations" : ""}
            </span>
          </div>
        </>
      )}
      {enabled && entries.length === 0 && !running && (
        <p className="text-xs text-muted">
          {mode === "auto" ? "The agent publishes the plan and queues texts (simulated), explaining each step." : "Each step waits for your Approve click."}
        </p>
      )}
    </Panel>
  );
}
