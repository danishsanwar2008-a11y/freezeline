"use client";

// The agent's decision trace for this hour: every step it actually ran, in order, as it happens
// (streamed from /api/agent/run). Read steps show what the agent found; actions show what it did.
// A Stage 2 alert always stops at "Waiting for supervisor approval" (Auto mode too).
// Below: who else was notified, display only (simulated · nothing is sent).

import { useEffect, useRef, useState } from "react";
import type { AgentEntry, AgentMode, AgentRun } from "./useAgent";
import { NOTIFY_TAG } from "@/lib/agentNotify";
import { plural } from "@/lib/plural";
import Panel from "./Panel";
import { formatHour } from "./format";

/** Repeated actions fold into one row (opened on click): texts queued per area, crews assigned. */
const FOLD: Record<string, { label: string; unit: string }> = {
  queue_outreach: { label: "Queued texts by area", unit: "step" },
  propose_crew: { label: "Assigned crews", unit: "crew" },
};

/** Rows the trace draws: one entry, or a run of the same repeated action folded into one row. */
type Row = { kind: "entry"; e: AgentEntry } | { kind: "fold"; tool: string; items: AgentEntry[] };

function toRows(entries: AgentEntry[]): Row[] {
  const rows: Row[] = [];
  for (const e of entries) {
    if (e.kind === "notify") continue;
    const last = rows[rows.length - 1];
    if (e.tool && FOLD[e.tool] && e.status === "done") {
      if (last?.kind === "fold" && last.tool === e.tool) last.items.push(e);
      else rows.push({ kind: "fold", tool: e.tool, items: [e] });
    } else rows.push({ kind: "entry", e });
  }
  return rows;
}

function Dot({ tone }: { tone: "done" | "pending" | "failed" | "note" | "running" }) {
  const cls = {
    done: "bg-accent",
    pending: "border-2 border-psi-warn bg-transparent",
    failed: "bg-danger",
    note: "bg-muted/60",
    running: "bg-accent-ink animate-pulse motion-reduce:animate-none",
  }[tone];
  return <span className={`relative z-10 mt-1 size-2.5 shrink-0 rounded-full ring-4 ring-surface ${cls}`} aria-hidden />;
}

function Approval({
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
  const stage2 = e.tool === "send_stage2_alert";
  const sentence = stage2 ? e.summary.replace(/^Stage 2 alert ready · needs supervisor approval\.\s*/, "") : e.summary;
  return (
    <div className="mt-1.5 rounded-lg border border-psi-warn/60 bg-psi-warn/10 p-3">
      {stage2 && <p className="text-xs font-medium text-psi-warn">Stage 2 alert ready · needs supervisor approval</p>}
      <p className="mt-0.5 text-[13px] font-medium leading-snug text-text">{sentence}</p>
      {e.reason && <p className="mt-1 text-xs leading-relaxed text-muted">{e.reason}</p>}
      {stage2 && <p className="mt-1 text-[11px] text-muted">Uses the existing pre-written texts (simulated). Approval is always required, even in Auto mode.</p>}
      <div className="mt-2 flex items-center gap-2">
        {canApprove ? (
          <>
            <button type="button" onClick={onApprove} disabled={busy} className="btn btn-primary btn-sm">
              {busy ? "Working…" : "Approve"}
            </button>
            <button type="button" onClick={onSkip} disabled={busy} className="btn btn-quiet btn-sm">
              {stage2 ? "Not yet" : "Skip"}
            </button>
          </>
        ) : (
          <span className="text-xs text-muted">Waiting for the step above</span>
        )}
      </div>
    </div>
  );
}

export default function DecisionTrace({
  time,
  enabled,
  run,
  mode,
  onApprove,
  onSkip,
  approving,
}: {
  time: string;
  /** The agent runs on the Uri replay only. */
  enabled: boolean;
  run?: AgentRun;
  mode: AgentMode;
  onApprove: (e: AgentEntry) => void;
  onSkip: (e: AgentEntry) => void;
  approving: string | null;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const top = useRef<HTMLDivElement>(null);
  const status = run?.status;
  // When a run starts, bring the trace into view (it sits under Crews in the right column).
  useEffect(() => {
    if (status !== "running") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    top.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [status]);
  const entries = run?.entries ?? [];
  const rows = toRows(entries);
  const notices = entries.filter((e) => e.kind === "notify");
  const firstPending = entries.find((e) => e.status === "pending")?.id;
  const running = run?.status === "running";
  // Steps = things the agent read or did (notes and notifications are not steps).
  const done = entries.filter((e) => e.kind === "step" || e.kind === "action" || e.kind === "error").length;
  const total = Math.max(run?.total ?? 0, done + (running ? 1 : 0));
  const waiting = entries.some((e) => e.status === "pending");

  return (
    <Panel id="trace" title="Decision trace" grow action={<span className="font-mono text-xs tabular-nums text-muted">{formatHour(time)}</span>}>
      <div ref={top} className="scroll-mt-16" aria-hidden />
      {!enabled && <p className="text-[13px] text-muted">The agent runs on the Uri replay in this phase. Switch to Replay to try it.</p>}
      {enabled && !run && (
        <p className="text-[13px] text-text">
          Run the agent from the top bar. Each step it takes for this hour shows here as it happens
          {mode === "approve" ? ", and every action waits for your Approve." : "."}
        </p>
      )}
      {run?.status === "error" && <p className="mb-2 text-[13px] text-danger">The agent couldn’t finish: {run.error}</p>}

      {run && total > 0 && (
        <div className="mb-3">
          <div className="flex gap-0.5" role="img" aria-label={`Step ${done} of ${total}`}>
            {Array.from({ length: total }, (_, k) => (
              <span key={k} className={`h-1 flex-1 rounded-full ${k < done ? "bg-accent" : k === done && running ? "animate-pulse bg-accent/50 motion-reduce:animate-none" : "bg-border"}`} />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {running ? `Step ${Math.min(done + 1, total)} of ${total}` : waiting ? `${plural(done, "step")} · waiting for approval` : `Done · ${plural(done, "step")}`}
          </p>
        </div>
      )}

      {rows.length > 0 || running ? (
        <ol className="relative space-y-2.5 before:absolute before:bottom-1 before:left-[4.5px] before:top-1.5 before:w-px before:bg-border" aria-live="polite">
          {rows.map((row, k) => {
            if (row.kind === "fold") {
              const key = `${row.tool}-${k}`;
              const isOpen = !!open[key];
              const fold = FOLD[row.tool];
              return (
                <li key={key} className="flex gap-3">
                  <Dot tone="done" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[13px] text-text">{fold.label}</p>
                      <button
                        type="button"
                        onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Hide" : "Show"} ${plural(row.items.length, fold.unit)}: ${fold.label.toLowerCase()}`}
                        className="shrink-0 text-xs text-accent-ink hover:underline"
                      >
                        {plural(row.items.length, fold.unit)} <span aria-hidden>{isOpen ? "▴" : "▾"}</span>
                      </button>
                    </div>
                    {isOpen && (
                      <ul className="mt-1 space-y-1 text-xs leading-snug text-muted">
                        {row.items.map((e) => (
                          <li key={e.id}>{e.summary.replace(/^Assigned /, "").replace(/\.$/, "")}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            }
            const e = row.e;
            const tone = e.status === "pending" ? "pending" : e.status === "failed" ? "failed" : e.kind === "note" ? "note" : "done";
            return (
              <li key={e.id} className="flex gap-3">
                <Dot tone={tone} />
                <div className="min-w-0 flex-1">
                  {e.kind === "step" ? (
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-[13px] text-text">{e.summary}</p>
                      <p className="ml-auto text-right font-mono text-xs tabular-nums text-muted">{e.result}</p>
                    </div>
                  ) : e.status === "pending" ? (
                    <>
                      <p className="text-[13px] text-psi-warn">Waiting for supervisor approval</p>
                      <Approval
                        e={e}
                        canApprove={e.id === firstPending}
                        busy={approving === e.id}
                        onApprove={() => onApprove(e)}
                        onSkip={() => onSkip(e)}
                      />
                    </>
                  ) : (
                    <>
                      <p className={`text-[13px] leading-snug ${e.status === "failed" ? "text-danger" : e.kind === "note" ? "text-muted" : "text-text"}`}>{e.summary}</p>
                      {e.reason && e.kind === "action" && <p className="mt-0.5 text-xs leading-relaxed text-muted">{e.reason}</p>}
                    </>
                  )}
                </div>
              </li>
            );
          })}
          {running && (
            <li className="flex gap-3">
              <Dot tone="running" />
              <p className="text-[13px] text-accent-ink">{run?.working ?? "Working"}…</p>
            </li>
          )}
        </ol>
      ) : null}

      {notices.length > 0 && (
        <section aria-label="Also notified" className="mt-4 rounded-lg bg-bg p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-medium text-text">Also notified</h3>
            <span className="text-[11px] text-psi-warn">{NOTIFY_TAG}</span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {notices.map((n) => (
              <li key={n.id} className="text-xs leading-snug">
                <span className="text-text">{n.party}</span>
                <span className="text-muted"> · {n.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {run?.status === "done" && (
        <p className="mt-3 text-[11px] text-muted">
          {run.source === "claude" && run.usage ? `Claude Opus 5.5 · ${plural(run.usage.calls, "call")}` : "Pre-written explanations (no AI calls)"} · household data
          simulated
        </p>
      )}
    </Panel>
  );
}
