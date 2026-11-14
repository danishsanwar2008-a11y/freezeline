import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { consolePassword, safeNext, SESSION_COOKIE, validSession } from "@/lib/server/consoleAuth";

export const metadata = { title: "Sign in · FreezeLine" };

const ERRORS: Record<string, string> = {
  wrong: "That password isn’t right. Try again.",
  wait: "Too many tries. Wait a few minutes, then try again.",
  unset: "The console password isn’t set on this server.",
};

// The request-time part (session cookie, ?next, ?error) streams inside <Suspense>, so the page frame
// can be prerendered (Next 16 blocks a whole route that reads request data outside Suspense).
async function LoginForm({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  await connection(); // checked per request (the session check reads the clock)
  const q = await searchParams;
  const next = safeNext(typeof q.next === "string" ? q.next : undefined);
  if (validSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect(next);
  const configured = consolePassword() !== null;
  const error = typeof q.error === "string" ? ERRORS[q.error] : undefined;

  return configured ? (
    <form method="post" action="/api/login" className="mt-5 space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm">
        <span className="text-muted">Password</span>
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-2 text-base text-text outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      </label>
      {error && (
        <p id="login-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full">
        Sign in
      </button>
    </form>
  ) : (
    <p role="alert" className="mt-5 rounded-md border border-danger/40 px-3 py-2 text-sm text-danger">
      {ERRORS.unset} Add <code className="font-mono text-text">CONSOLE_PASSWORD</code> to <code className="font-mono text-text">.env.local</code>{" "}
      and restart <code className="font-mono text-text">npm run dev</code>.
    </p>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 text-text">
      <div className="w-full max-w-sm">
        <div className="rounded-panel border border-border bg-surface p-6 shadow-xl">
          <p className="font-mono text-xs tracking-[0.2em] text-accent">FREEZELINE</p>
          <h1 className="mt-2 text-lg font-semibold">City Operations</h1>
          <p className="mt-1 text-sm text-muted">For water utility staff. Enter the shared console password.</p>
          <Suspense fallback={<div className="mt-5 h-[124px]" aria-hidden />}>
            <LoginForm searchParams={searchParams} />
          </Suspense>
          <p className="mt-5 text-xs text-muted">Simulated demo: Winter Storm Uri replay over Houston. Households never see this console.</p>
        </div>
        <p className="mt-4 text-center text-sm text-muted">
          Live in Houston?{" "}
          <Link href="/register" className="text-accent underline-offset-2 hover:underline">
            Sign up for freeze alerts
          </Link>
        </p>
      </div>
    </main>
  );
}
