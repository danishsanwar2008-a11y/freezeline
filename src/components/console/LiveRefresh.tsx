"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the page every few seconds while something on it is still live (a call in progress). */
export default function LiveRefresh({ active, everyMs = 4000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs, router]);
  return active ? (
    <p className="flex items-center gap-2 text-xs text-muted" role="status">
      <span aria-hidden className="inline-block size-2 animate-pulse rounded-full bg-accent" />
      A call is live: answers appear here as the household gives them.
    </p>
  ) : null;
}
