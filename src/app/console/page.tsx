import { Suspense } from "react";
import { connection } from "next/server";
import { getCity } from "@/lib/server/cityState";
import ConsoleShell from "@/components/console/ConsoleShell";

export const metadata = { title: "Utility console · FreezeLine" };

function FullScreenMessage({ title, children, tone = "muted" }: { title: string; children?: React.ReactNode; tone?: "muted" | "danger" }) {
  return (
    <div className="console-theme flex h-dvh items-center justify-center bg-bg px-4">
      <div className="max-w-md rounded-panel border border-border bg-surface p-6">
        <p className="font-mono text-xs tracking-[0.2em] text-accent">FREEZELINE</p>
        <p className={`mt-2 font-medium ${tone === "danger" ? "text-danger" : "text-text"}`}>{title}</p>
        {children && <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>}
      </div>
    </div>
  );
}

async function ConsoleData() {
  await connection(); // read homes at request time
  // No sign-in for City Operations itself (it shows only simulated households); the sign-ups and
  // calls pages, which show real people, keep the password (src/proxy.ts).
  let homes, zones;
  try {
    ({ homes, zones } = await getCity()); // cached on the server; same home order as /api/ops
  } catch (err) {
    return (
      <FullScreenMessage title="Couldn't load homes" tone="danger">
        <p className="font-mono text-text">{err instanceof Error ? err.message : String(err)}</p>
        <p className="mt-2">
          Check <code className="font-mono text-text">.env.local</code> and that{" "}
          <code className="font-mono text-text">supabase/003_phase35.sql</code> has been run and <code className="font-mono text-text">npm run seed</code> done. See{" "}
          <a className="text-accent underline" href="/status">/status</a>.
        </p>
      </FullScreenMessage>
    );
  }
  if (homes.length === 0) {
    return (
      <FullScreenMessage title="No homes yet">
        Run <code className="font-mono text-text">npm run seed</code> to load the simulated homes.
      </FullScreenMessage>
    );
  }
  return <ConsoleShell homes={homes} zones={zones} />;
}

export default function ConsolePage() {
  return (
    <Suspense fallback={<FullScreenMessage title="Loading simulated homes…" />}>
      <ConsoleData />
    </Suspense>
  );
}
