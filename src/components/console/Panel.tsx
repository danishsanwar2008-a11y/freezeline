"use client";

// One floating box over the map (DESIGN.md §4): a sentence-case title, an optional header control,
// and a chevron that collapses the box to its title and opens it again (remembered for the session).
// tone="solid" for the right column, tone="glass" (slightly see-through) for the left.

import { useId } from "react";
import { useSessionFlag } from "./useSessionFlag";

export function Chevron({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${open ? "" : "-rotate-180"} ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 10l4-4 4 4" />
    </svg>
  );
}

export default function Panel({
  id,
  title,
  tone = "solid",
  action,
  grow = false,
  defaultOpen = true,
  className = "",
  children,
}: {
  /** Stable name, used to remember the collapsed state. */
  id: string;
  title: React.ReactNode;
  tone?: "solid" | "glass";
  /** A control in the header row (area picker, info button). */
  action?: React.ReactNode;
  /** Fill the rest of the column and scroll inside (decision trace). */
  grow?: boolean;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useSessionFlag(`panel:${id}`, defaultOpen);
  const uid = useId();
  const titleId = `${uid}-title`;
  const bodyId = `${uid}-body`;
  const verbId = `${uid}-verb`;
  return (
    <section
      aria-labelledby={titleId}
      className={`${tone === "glass" ? "glass" : "box"} flex flex-col ${grow && open ? "lg:min-h-[60vh] lg:flex-1" : ""} ${className}`}
    >
      <div className="flex items-center gap-2 py-2.5 pl-4 pr-2">
        <h2 id={titleId} className="panel-title min-w-0 flex-1 truncate">
          {title}
        </h2>
        {action}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-labelledby={`${verbId} ${titleId}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-bg hover:text-text"
        >
          <span id={verbId} hidden>
            {open ? "Collapse" : "Expand"}
          </span>
          <Chevron open={open} />
        </button>
      </div>
      <div id={bodyId} hidden={!open} className={`px-4 pb-4 ${grow ? "lg:min-h-0 lg:flex-1 lg:overflow-y-auto" : ""}`}>
        {children}
      </div>
    </section>
  );
}
