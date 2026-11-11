import { Suspense } from "react";
import { connection } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, validSession } from "@/lib/server/consoleAuth";

export const metadata = { title: "Connection status · FreezeLine" };

type Result =
  | { kind: "ok"; homes: number; zones: number }
  | { kind: "missing-env" }
  | { kind: "error"; message: string };

async function loadCounts(): Promise<Result> {
  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return { kind: "missing-env" };
  }
  // Zones: anon key (tests the public connection). Homes hold household details (sample), so they
  // are counted on the server with the service role.
  const admin = getSupabaseAdmin();
  const [homes, zones] = await Promise.all([
    (admin ?? supabase).from("homes").select("*", { count: "exact", head: true }),
    supabase.from("zones").select("*", { count: "exact", head: true }),
  ]);
  const err = homes.error ?? zones.error;
  if (err) return { kind: "error", message: err.message || "Query failed (check SQL, RLS policies and grants)" };
  return { kind: "ok", homes: homes.count ?? 0, zones: zones.count ?? 0 };
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-panel border border-border bg-surface p-5">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 font-mono text-4xl tabular-nums text-text">{value.toLocaleString("en-US")}</p>
    </div>
  );
}

function Notice({ tone, title, children }: { tone: "danger" | "warn"; title: string; children: React.ReactNode }) {
  const color = tone === "danger" ? "border-danger/40 text-danger" : "border-warn/40 text-warn";
  return (
    <div className={`rounded-panel border bg-surface p-5 ${color}`}>
      <p className="font-medium">{title}</p>
      <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}

async function ConnectionPanel() {
  await connection(); // always query live, at request time
  // Officials only: checked here too, not only in src/proxy.ts.
  if (!validSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/login?next=/status");
  const r = await loadCounts();

  if (r.kind === "missing-env") {
    return (
      <Notice tone="danger" title="Not connected: Supabase keys missing">
        Copy <code className="font-mono text-text">.env.example</code> to{" "}
        <code className="font-mono text-text">.env.local</code>, fill in your project URL and anon key, then restart{" "}
        <code className="font-mono text-text">npm run dev</code>.
      </Notice>
    );
  }
  if (r.kind === "error") {
    return (
      <Notice tone="danger" title="Connected, but the query failed">
        <p className="font-mono text-text">{r.message}</p>
        <p className="mt-2">
          Run <code className="font-mono text-text">supabase/001_schema.sql</code> in the Supabase SQL Editor (it creates
          the tables, RLS policies and anon grants).
        </p>
      </Notice>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-ok">
        <span className="size-2 rounded-full bg-ok" aria-hidden />
        Connected to Supabase (anon, read-only)
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CountTile label="Homes" value={r.homes} />
        <CountTile label="Pressure zones" value={r.zones} />
      </div>
      {r.homes === 0 && (
        <Notice tone="warn" title="Tables are empty">
          Run <code className="font-mono text-text">npm run seed</code> to load the simulated homes and zones.
        </Notice>
      )}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-busy>
      {[0, 1].map((i) => (
        <div key={i} className="h-[106px] animate-pulse rounded-panel border border-border bg-surface" />
      ))}
    </div>
  );
}

export default function StatusPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-accent">FREEZELINE</p>
          <h1 className="mt-1 text-2xl font-semibold">Connection status</h1>
        </div>
        <span className="rounded-full border border-warn/40 px-3 py-1 text-xs font-medium text-warn">
          Simulated data
        </span>
      </header>
      <div className="freeze-rule my-6" />
      <Suspense fallback={<PanelSkeleton />}>
        <ConnectionPanel />
      </Suspense>
      <p className="mt-8 text-xs text-muted">
        All homes and zones are simulated for the Winter Storm Uri (Feb 2021) replay. Not real addresses.
      </p>
    </main>
  );
}
