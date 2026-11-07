import type { ReasonSource } from "@/lib/steps";

const SOURCE_STYLE: Record<ReasonSource, string> = {
  "Property record": "border-border text-muted",
  Forecast: "border-border text-muted",
  "Photo: not sent yet": "border-dashed border-border text-muted/80",
  "Photo: confirmed": "border-ok/50 text-ok",
  "Photo: unclear": "border-dashed border-warn/50 text-warn",
};

interface Props {
  reasons: { text: string; source: ReasonSource }[];
  /** Translated "Why?" label and source tags (defaults to English). */
  title?: string;
  sourceLabel?: (s: ReasonSource) => string;
  className?: string;
}

/** "Why?" collapsed by default: three plain reasons, each with where it came from. */
export default function WhyList({ reasons, title = "Why?", sourceLabel = (s) => s, className = "" }: Props) {
  return (
    <details className={`group rounded-panel border border-border px-4 py-3 [&_summary::-webkit-details-marker]:hidden ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
        {title}
        <span className="text-muted transition group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <ul className="mt-3 space-y-3">
        {reasons.map((r, i) => (
          <li key={i} className="text-sm leading-relaxed">
            <p>{r.text}</p>
            <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] ${SOURCE_STYLE[r.source]}`}>{sourceLabel(r.source)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
