"use client";

// A boolean the official sets once and that holds for this browser session (a collapsed box, hidden
// panels). Stored in sessionStorage; every read and write is guarded, so a blocked storage just means
// the default each load.

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "fl-session-flag";

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** [value, set] for a session-wide flag named `key` (default until the official changes it). */
export function useSessionFlag(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(`fl:${key}`),
    () => null,
  );
  const value = stored === null ? fallback : stored === "1";
  const set = useCallback(
    (v: boolean) => {
      try {
        window.sessionStorage.setItem(`fl:${key}`, v ? "1" : "0");
      } catch {
        // storage blocked: the change still applies until the next event below re-reads
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
