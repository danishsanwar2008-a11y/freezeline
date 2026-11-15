import { Suspense } from "react";
import { connection } from "next/server";
import { getPresentData } from "@/lib/server/presentData";
import { parsePosition } from "@/components/present/timeline";
import Deck from "@/components/present/Deck";

// The pitch deck: four fullscreen scenes on the Uri replay, separate from the operational console.
// Arrow keys / clicker / space to step, F for fullscreen. Read-only: it shows derived results only
// (no household details), all built from the same engine the console runs.

export const metadata = { title: "FreezeLine · Presentation" };

function Loading({ text }: { text: string }) {
  return (
    <main className="present-theme flex h-dvh items-center justify-center">
      <p className="deck-label">{text}</p>
    </main>
  );
}

async function Loaded({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const result = await getPresentData().then(
    (data) => ({ data, error: null }),
    (err: unknown) => ({ data: null, error: err instanceof Error ? err.message : String(err) }),
  );
  if (!result.data) return <Loading text={`Couldn't load the replay: ${result.error}`} />;
  return <Deck data={result.data} initial={parsePosition(one(q.scene), one(q.beat))} />;
}

export default function PresentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<Loading text="Loading the Uri replay…" />}>
      <Loaded searchParams={searchParams} />
    </Suspense>
  );
}
