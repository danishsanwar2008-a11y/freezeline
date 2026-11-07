"use client";

import { useState } from "react";

/** Big red emergency button that opens clear shut-off steps. */
export default function BurstHelp({ label, title, steps, close }: { label: string; title: string; steps: readonly string[]; close: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="burst-steps"
        className="w-full rounded-panel bg-danger px-5 py-4 text-lg font-semibold text-white shadow-lg shadow-danger/20 transition active:scale-[0.99]"
      >
        {label}
      </button>
      {open && (
        <div id="burst-steps" className="panel-enter mt-3 rounded-panel border border-danger/40 bg-danger/10 p-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <ol className="mt-4 space-y-4">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-danger text-sm font-semibold text-white" aria-hidden>
                  {i + 1}
                </span>
                <p className="pt-0.5 text-base leading-relaxed">{s}</p>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => setOpen(false)} className="mt-4 text-sm text-muted underline">
            {close}
          </button>
        </div>
      )}
    </section>
  );
}
