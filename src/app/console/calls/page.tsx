import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, validSession } from "@/lib/server/consoleAuth";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { syncCallStatuses } from "@/lib/server/demoCall";
import { NEIGHBORHOODS } from "@/lib/seed/generate";
import { plural } from "@/lib/plural";
import {
  answerTiles,
  callOutcome,
  isFinalStatus,
  maskPhone,
  OUTCOME_LABEL,
  STATUS_LABEL,
  type CallAssessment,
  type CallOutcome,
  type CallSource,
  type CallStatus,
} from "@/lib/voiceCalls";
import LiveRefresh from "@/components/console/LiveRefresh";

// City Operations: calls the voice agent placed and what each household said (officials only;
// third-person wording). Read on the server with the service role; voice_calls has no anon access.

export const metadata = { title: "Calls · FreezeLine" };

const PAGE_SIZE = 20;
type Filter = "all" | "demo" | "sample";

interface Row {
  id: string;
  source: CallSource;
  home_id: string | null;
  plan_for: string | null;
  to_phone: string;
  lang: "en" | "es";
  level: "High" | "Medium" | "Low" | null;
  status: CallStatus;
  finished: boolean;
  answers: Record<string, unknown>;
  questions_answered: number;
  assessment: CallAssessment | null;
  transcript: { who: "agent" | "you"; text: string }[];
  duration_s: number | null;
  error: string | null;
  created_at: string;
  homes: { street: string | null; zone_id: string | null } | null;
}

/** Outcome colors are home-status colors (green ready, yellow waiting, red needs help, black no answer). */
const OUTCOME_SWATCH: Record<CallOutcome, string> = {
  ready: "bg-status-ready",
  needs_reminder: "bg-status-waiting",
  needs_crew: "bg-status-help",
  partial: "border border-dashed border-status-waiting bg-status-waiting/25",
  in_progress: "bg-accent animate-pulse",
  no_answer: "bg-status-none ring-1 ring-muted",
};
const BAR_ORDER: CallOutcome[] = ["needs_crew", "needs_reminder", "ready", "partial", "in_progress", "no_answer"];

const areaName = (id: string | null | undefined) => NEIGHBORHOODS.find((n) => n.id === id)?.name ?? null;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const replayHour = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric" });
const minutes = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="console-theme min-h-dvh bg-bg text-text">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-2.5">
        <p className="hidden font-mono text-xs tracking-[0.2em] text-accent sm:block">FREEZELINE</p>
        <h1 className="text-sm font-medium">
          <Link href="/console" className="text-muted hover:text-text">
            City Operations
          </Link>
          <span className="px-1.5 text-muted">/</span>Calls
        </h1>
        <span className="flex-1" />
        <Link href="/console/registrations" className="btn btn-quiet btn-sm">
          Sign-ups
        </Link>
        <Link href="/console" className="btn btn-quiet btn-sm">
          ← Map
        </Link>
        <form method="post" action="/api/logout">
          <button type="submit" className="btn btn-quiet btn-sm">
            Sign out
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-5xl space-y-3 px-4 py-6">{children}</main>
    </div>
  );
}

function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-panel border border-border bg-surface p-6">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | null }) {
  // Answered = solid; not asked / not answered = dashed (confirmed vs estimated look different).
  return (
    <div className={`rounded-md border bg-bg px-2.5 py-1.5 ${value === null ? "border-dashed border-border" : "border-border"}`}>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`text-sm ${value === null ? "text-muted" : ""}`}>{value ?? "Not answered"}</p>
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? "bg-btn text-on-btn" : "text-muted hover:text-text"}`}
    >
      {children}
    </Link>
  );
}

function CallCard({ r }: { r: Row }) {
  const outcome = callOutcome(r);
  const street = r.homes?.street;
  const area = areaName(r.homes?.zone_id);
  const said = r.transcript.length;
  return (
    <li className="rounded-panel border border-border bg-bg/40 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-medium">{street ? `${street} home` : "Household"}</p>
        {r.source === "sample" && <span className="rounded-full border border-warn/50 px-2 py-0.5 text-[11px] text-warn">sample</span>}
        {r.source === "demo" && (
          <span className="rounded-full border border-accent/60 px-2 py-0.5 text-[11px] text-accent" title="A real call to a teammate's phone standing in for this household">
            demo call
          </span>
        )}
        <span className="flex-1" />
        <p className="text-xs text-muted">Called {when(r.created_at)}</p>
      </div>
      <p className="mt-1 text-sm text-muted">
        {[area, r.plan_for ? `storm hour ${replayHour(r.plan_for)}` : null, r.lang === "es" ? "Spanish" : "English"].filter(Boolean).join(" · ")}
      </p>
      <p className="mt-1 text-sm">
        <span className="font-mono tabular-nums">{maskPhone(r.to_phone)}</span>
        <span className="text-muted">
          {" "}
          · {STATUS_LABEL[r.status]}
          {r.duration_s !== null ? ` · ${minutes(r.duration_s)}` : ""}
          {` · ${plural(r.questions_answered, "answer")}`}
        </span>
      </p>
      <p className="mt-2 flex items-center gap-2 text-xs">
        <span aria-hidden className={`inline-block size-2.5 rounded-full ${OUTCOME_SWATCH[outcome]}`} />
        <span className="font-medium">{OUTCOME_LABEL[outcome]}</span>
        {r.error && <span className="text-danger">· {r.error}</span>}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {answerTiles(r.answers).map((t) => (
          <Tile key={t.label} label={t.label} value={t.value} />
        ))}
      </div>
      {said > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-muted hover:text-text">What was said ({plural(said, "line")})</summary>
          <ol className="mt-2 space-y-1 border-l border-border pl-3">
            {r.transcript.map((l, k) => (
              <li key={k} className={l.who === "you" ? "text-text" : "text-muted"}>
                <span className="mr-1.5 text-[11px] uppercase tracking-wide">{l.who === "you" ? "Household" : "Agent"}</span>
                {l.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </li>
  );
}

async function Calls({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  // Checked here too, not only in src/proxy.ts (defense in depth).
  if (!validSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/login?next=/console/calls");

  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const filter: Filter = one(q.source) === "demo" || one(q.source) === "sample" ? (one(q.source) as Filter) : "all";
  const page = Math.max(1, Math.floor(Number(one(q.page)) || 1));

  const db = getSupabaseAdmin();
  if (!db) return <Notice title="Calls aren't available">The server is missing its Supabase service key (.env.local).</Notice>;

  const probe = await db.from("voice_calls").select("id").limit(1);
  if (probe.error)
    return (
      <Notice title="Couldn't load calls">
        {/voice_calls/.test(probe.error.message) ? (
          <>
            Run <code className="font-mono text-text">supabase/006_voice_calls.sql</code> in the Supabase SQL Editor, then reload.
          </>
        ) : (
          <span className="font-mono text-text">{probe.error.message}</span>
        )}
      </Notice>
    );

  await syncCallStatuses(); // live calls: ringing / answered / ended, from Twilio

  // Headline counts over every call (small table: a few hundred rows at most in the demo).
  const { data: all } = await db.from("voice_calls").select("source,status,finished,assessment,questions_answered").limit(5000);
  const everything = (all ?? []) as Pick<Row, "source" | "status" | "finished" | "assessment" | "questions_answered">[];
  const total = everything.length;
  const demoCount = everything.filter((c) => c.source !== "sample").length;
  const byOutcome = BAR_ORDER.map((o) => ({ o, n: everything.filter((c) => callOutcome(c) === o).length })).filter((x) => x.n > 0);
  const live = everything.some((c) => c.source !== "sample" && !isFinalStatus(c.status));

  let list = db
    .from("voice_calls")
    .select(
      "id,source,home_id,plan_for,to_phone,lang,level,status,finished,answers,questions_answered,assessment,transcript,duration_s,error,created_at,homes(street,zone_id)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (filter === "demo") list = list.in("source", ["demo", "live"]);
  if (filter === "sample") list = list.eq("source", "sample");
  const { data, count, error } = await list;
  if (error && error.code !== "PGRST103") return <Notice title="Couldn't load calls">{error.message}</Notice>;
  const rows = (data ?? []) as unknown as Row[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const href = (o: { filter?: Filter; page?: number }) => {
    const p = new URLSearchParams();
    const f = o.filter ?? filter;
    if (f !== "all") p.set("source", f);
    if ((o.page ?? 1) > 1) p.set("page", String(o.page));
    const qs = p.toString();
    return `/console/calls${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <section className="rounded-panel border border-border bg-surface p-4">
        <p className="eyebrow">Calls</p>
        <p className="stat mt-2">
          {total.toLocaleString("en-US")} <span className="stat-unit">{total === 1 ? "household called" : "households called"}</span>
        </p>
        <p className="mt-1 text-xs text-muted">
          {plural(demoCount, "demo call")} (a teammate&rsquo;s phone standing in for the household) · {plural(total - demoCount, "sample call")} (simulated)
        </p>
        {total > 0 && (
          <>
            <div className="mt-3 flex h-3 w-full gap-px overflow-hidden rounded-sm" role="img" aria-label="Calls by outcome">
              {byOutcome.map(({ o, n }) => (
                <span key={o} className={`h-full ${OUTCOME_SWATCH[o].replace("animate-pulse", "")}`} style={{ width: `${(100 * n) / total}%` }} />
              ))}
            </div>
            <ul className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              {byOutcome.map(({ o, n }) => (
                <li key={o} className="flex items-center gap-2">
                  <span aria-hidden className={`inline-block size-2.5 rounded-full ${OUTCOME_SWATCH[o].replace("animate-pulse", "")}`} />
                  <span className="text-muted">{OUTCOME_LABEL[o]}</span>
                  <span className="flex-1" />
                  <span className="font-mono tabular-nums">{n.toLocaleString("en-US")}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Run agent places a demo call to a teammate&rsquo;s phone for the highest-risk home that hour; the agent saves each answer as it is
          given. Answers are the household&rsquo;s own words, scored by the call script; questions not reached are shown dashed.
        </p>
      </section>

      <LiveRefresh active={live} />

      <div className="flex rounded-full border border-border bg-surface p-1 self-start w-fit">
        <FilterLink href={href({ filter: "all", page: 1 })} active={filter === "all"}>
          All
        </FilterLink>
        <FilterLink href={href({ filter: "demo", page: 1 })} active={filter === "demo"}>
          Demo calls
        </FilterLink>
        <FilterLink href={href({ filter: "sample", page: 1 })} active={filter === "sample"}>
          Sample
        </FilterLink>
      </div>

      {rows.length === 0 ? (
        page > 1 ? (
          <Notice title={`No calls on page ${page}.`}>
            <Link href={href({ page: 1 })} className="text-accent underline-offset-2 hover:underline">
              Go to the first page
            </Link>
          </Notice>
        ) : (
          <Notice title="No calls yet.">
            {filter === "sample" ? "Run npm run seed:calls to add sample calls." : "Click Run agent on the map to place a demo call (DEMO_CALL_TO in .env.local)."}
          </Notice>
        )
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map((r) => (
              <CallCard key={r.id} r={r} />
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-between pt-2 text-sm">
              {page > 1 ? (
                <Link className="btn btn-quiet btn-sm" href={href({ page: page - 1 })}>
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-muted">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Link className="btn btn-quiet btn-sm" href={href({ page: page + 1 })}>
                  Next →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}

export default function CallsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Shell>
      <Suspense fallback={<Notice title="Loading calls…" />}>
        <Calls searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}
