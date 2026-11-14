import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, validSession } from "@/lib/server/consoleAuth";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { formatPhone, PIPE_LABEL, type PipeLocation } from "@/lib/registration";
import { MATCH_LABEL, type MatchStatus } from "@/lib/addressMatch";
import { NEIGHBORHOODS } from "@/lib/seed/generate";
import { plural } from "@/lib/plural";

// City Operations: household sign-ups (officials only; third-person wording). Read on the server with
// the service role; the registrations table has no anon access.

export const metadata = { title: "Sign-ups · FreezeLine" };

const PAGE_SIZE = 25;
type Source = "all" | "signup" | "placeholder";

interface Row {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  preferred_language: "en" | "es";
  address_line1: string;
  address_line2: string | null;
  city: string;
  zip: string;
  dwelling_type: "house" | "apartment" | null;
  pipe_locations: PipeLocation[] | null;
  knows_shutoff: boolean | null;
  has_generator: boolean | null;
  someone_home_3_days: "yes" | "no" | "not_sure" | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  source: "signup" | "placeholder";
  created_at: string;
  match_status: MatchStatus;
  match_distance_m: number | null;
  zone_id: string | null;
}

/** Bar order and look. Confirmed = solid, estimated = dashed (CLAUDE.md honesty rule). */
const BAR: { status: MatchStatus; cls: string }[] = [
  { status: "matched", cls: "bg-accent" },
  { status: "placeholder", cls: "bg-accent/60" },
  { status: "nearby_on_street", cls: "border border-dashed border-accent bg-accent/15" },
  { status: "no_home_nearby", cls: "bg-muted/60" },
  { status: "outside_area", cls: "bg-muted/35" },
  { status: "address_not_found", cls: "bg-danger/70" },
  { status: "pending", cls: "border border-dashed border-muted bg-transparent" },
];
const SWATCH = Object.fromEntries(BAR.map((b) => [b.status, b.cls])) as Record<MatchStatus, string>;

const areaName = (id: string | null) => NEIGHBORHOODS.find((n) => n.id === id)?.name ?? null;
const yesNo = (v: boolean | null) => (v === null ? null : v ? "Yes" : "No");
const HOME_3_DAYS = { yes: "Yes", no: "No", not_sure: "Not sure" } as const;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** PostgREST `or` filters break on these characters; strip them from the search text. */
const cleanSearch = (q: string) => q.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="console-theme min-h-dvh bg-bg text-text">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-2.5">
        <p className="hidden font-mono text-xs tracking-[0.2em] text-accent sm:block">FREEZELINE</p>
        <h1 className="text-sm font-medium">
          <Link href="/console" className="text-muted hover:text-text">
            City Operations
          </Link>
          <span className="px-1.5 text-muted">/</span>Sign-ups
        </h1>
        <span className="flex-1" />
        <a href="/register" target="_blank" rel="noopener" className="btn btn-quiet btn-sm">
          Public sign-up page ↗
        </a>
        <Link href="/console/calls" className="btn btn-quiet btn-sm">
          Calls
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

function Tile({ label, value, estimated }: { label: string; value: string | null; estimated?: boolean }) {
  return (
    <div className={`rounded-md border bg-bg px-2.5 py-1.5 ${estimated ? "border-dashed border-border" : "border-border"}`}>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`text-sm ${value === null ? "text-muted" : ""}`}>{value ?? "No answer"}</p>
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? "bg-accent text-bg" : "text-muted hover:text-text"}`}
    >
      {children}
    </Link>
  );
}

function SignupCard({ r }: { r: Row }) {
  const area = areaName(r.zone_id);
  const estimated = r.match_status === "nearby_on_street";
  const matchLine =
    r.match_status === "nearby_on_street" && r.match_distance_m !== null
      ? `${MATCH_LABEL[r.match_status]} · ${r.match_distance_m} m away`
      : MATCH_LABEL[r.match_status];
  const pipes = r.pipe_locations?.map((p) => PIPE_LABEL[p].replace(" (under the house)", "")).join(", ") ?? null;
  return (
    <li className="rounded-panel border border-border bg-bg/40 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-medium">{r.full_name}</p>
        {r.source === "placeholder" && <span className="rounded-full border border-warn/50 px-2 py-0.5 text-[11px] text-warn">sample</span>}
        <span className="flex-1" />
        <p className="text-xs text-muted">Signed up {when(r.created_at)}</p>
      </div>
      <p className="mt-1 text-sm text-muted">
        {r.address_line1}
        {r.address_line2 ? `, ${r.address_line2}` : ""}, {r.city} {r.zip}
        {area ? ` · ${area}` : ""}
      </p>
      <p className="mt-1 text-sm">
        <span className="font-mono tabular-nums">{formatPhone(r.phone)}</span>
        <span className="text-muted"> · {r.email} · {r.preferred_language === "es" ? "Spanish" : "English"}</span>
      </p>
      <p className="mt-2 flex items-center gap-2 text-xs text-muted">
        <span aria-hidden className={`inline-block size-2.5 rounded-sm ${SWATCH[r.match_status]}`} />
        {matchLine}
        {estimated && <span>(estimated)</span>}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Lives in" value={r.dwelling_type === null ? null : r.dwelling_type === "house" ? "House" : "Apartment"} />
        <Tile label="Pipes run through" value={pipes} />
        <Tile label="Knows shutoff" value={yesNo(r.knows_shutoff)} />
        <Tile label="Generator" value={yesNo(r.has_generator)} />
        <Tile label="Home next 3 days" value={r.someone_home_3_days ? HOME_3_DAYS[r.someone_home_3_days] : null} />
        <Tile label="Emergency contact" value={r.emergency_name ? `${r.emergency_name} · ${formatPhone(r.emergency_phone!)}` : null} />
      </div>
    </li>
  );
}

async function Signups({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  // Checked here too, not only in src/proxy.ts (defense in depth).
  if (!validSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/login?next=/console/registrations");

  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const source: Source = one(q.source) === "signup" || one(q.source) === "placeholder" ? (one(q.source) as Source) : "all";
  const search = cleanSearch(one(q.q));
  const page = Math.max(1, Math.floor(Number(one(q.page)) || 1));

  const db = getSupabaseAdmin();
  if (!db) return <Notice title="Sign-ups aren't available">The server is missing its Supabase service key (.env.local).</Notice>;

  // Count-only (HEAD) requests carry no error text, so check the table and columns with one small read first.
  const probe = await db.from("registrations").select("match_status").limit(1);
  const base = () => db.from("registrations").select("*", { count: "exact", head: true });
  const [total, real, ...byStatus] = probe.error
    ? []
    : await Promise.all([base(), base().eq("source", "signup"), ...BAR.map((b) => base().eq("match_status", b.status))]);
  const err = probe.error ?? total?.error ?? byStatus.find((r) => r.error)?.error;
  if (err || !total || !real) {
    const msg = err?.message ?? "";
    const missing = /match_status/.test(msg) ? "supabase/005_registration_matching.sql" : /registrations/.test(msg) ? "supabase/004_registrations.sql" : null;
    return (
      <Notice title="Couldn't load sign-ups">
        {missing ? (
          <>
            Run <code className="font-mono text-text">{missing}</code> in the Supabase SQL Editor, then reload.
          </>
        ) : (
          <span className="font-mono text-text">{msg || "The database didn't answer. Try reloading."}</span>
        )}
      </Notice>
    );
  }

  const all = total.count ?? 0;
  const realCount = real.count ?? 0;
  const counts = BAR.map((b, i) => ({ ...b, n: byStatus[i].count ?? 0 })).filter((b) => b.n > 0);

  let list = db
    .from("registrations")
    .select(
      "id,full_name,email,phone,preferred_language,address_line1,address_line2,city,zip,dwelling_type,pipe_locations,knows_shutoff,has_generator,someone_home_3_days,emergency_name,emergency_phone,source,created_at,match_status,match_distance_m,zone_id",
      { count: "exact" },
    )
    .order("source", { ascending: false }) // real sign-ups ("signup") before samples ("placeholder")
    .order("created_at", { ascending: false })
    .order("email")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (source !== "all") list = list.eq("source", source);
  if (search) list = list.or(`full_name.ilike.%${search}%,address_line1.ilike.%${search}%,email.ilike.%${search}%,zip.ilike.%${search}%`);
  const { data, count: shown, error } = await list;
  // A page past the end (e.g. page 2 of a short search) comes back as "range not satisfiable": show it as empty.
  if (error && error.code !== "PGRST103") return <Notice title="Couldn't load sign-ups">{error.message}</Notice>;
  const rows = (data ?? []) as Row[];
  const pages = Math.max(1, Math.ceil((shown ?? 0) / PAGE_SIZE));

  const href = (o: { source?: Source; page?: number }) => {
    const p = new URLSearchParams();
    const s = o.source ?? source;
    if (s !== "all") p.set("source", s);
    if (search) p.set("q", search);
    if ((o.page ?? 1) > 1) p.set("page", String(o.page));
    const qs = p.toString();
    return `/console/registrations${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <section className="rounded-panel border border-border bg-surface p-4">
        <p className="eyebrow">Sign-ups</p>
        <p className="stat mt-2">
          {all.toLocaleString("en-US")} <span className="stat-unit">{all === 1 ? "household signed up" : "households signed up"}</span>
        </p>
        <p className="mt-1 text-xs text-muted">
          {plural(realCount, "real sign-up")} · {plural(all - realCount, "sample sign-up")} (simulated)
        </p>
        {all > 0 && (
          <>
            <div className="mt-3 flex h-3 w-full gap-px overflow-hidden rounded-sm" role="img" aria-label="Sign-ups by address match">
              {counts.map((c) => (
                <span key={c.status} className={`h-full ${c.cls}`} style={{ width: `${(100 * c.n) / all}%` }} />
              ))}
            </div>
            <ul className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              {counts.map((c) => (
                <li key={c.status} className="flex items-center gap-2">
                  <span aria-hidden className={`inline-block size-2.5 rounded-sm ${c.cls}`} />
                  <span className="text-muted">{MATCH_LABEL[c.status]}</span>
                  <span className="flex-1" />
                  <span className="font-mono tabular-nums">{c.n.toLocaleString("en-US")}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Addresses are looked up with OpenStreetMap and matched to the nearest mapped home. Solid = on a mapped home; dashed = the
              nearest mapped home on the same street (estimated).
            </p>
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-border bg-surface p-1">
          <FilterLink href={href({ source: "all" })} active={source === "all"}>
            All
          </FilterLink>
          <FilterLink href={href({ source: "signup" })} active={source === "signup"}>
            Real
          </FilterLink>
          <FilterLink href={href({ source: "placeholder" })} active={source === "placeholder"}>
            Sample
          </FilterLink>
        </div>
        <form method="get" action="/console/registrations" className="flex flex-1 items-center gap-2">
          {source !== "all" && <input type="hidden" name="source" value={source} />}
          <label className="sr-only" htmlFor="signup-search">
            Search sign-ups
          </label>
          <input
            id="signup-search"
            name="q"
            defaultValue={search}
            placeholder="Search name, street, email or ZIP"
            className="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm text-text outline-none placeholder:text-muted/70 focus-visible:border-accent"
          />
          <button type="submit" className="btn btn-quiet btn-sm">
            Search
          </button>
        </form>
      </div>

      {rows.length === 0 && page > 1 ? (
        <Notice title={`No sign-ups on page ${page}.`}>
          <Link href={href({ page: 1 })} className="text-accent underline-offset-2 hover:underline">
            Go to the first page
          </Link>
        </Notice>
      ) : rows.length === 0 ? (
        <Notice title={search ? "No sign-ups match that search." : "No sign-ups yet."}>
          {!search && source !== "placeholder" && "Sign-ups appear here as households fill in the public sign-up page."}
        </Notice>
      ) : (
        <>
          <p className="text-xs text-muted">
            Showing {((page - 1) * PAGE_SIZE + 1).toLocaleString("en-US")}–{((page - 1) * PAGE_SIZE + rows.length).toLocaleString("en-US")} of{" "}
            {plural(shown ?? 0, "sign-up")}
          </p>
          <ul className="space-y-2">
            {rows.map((r) => (
              <SignupCard key={r.id} r={r} />
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

export default function RegistrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Shell>
      <Suspense fallback={<Notice title="Loading sign-ups…" />}>
        <Signups searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}
