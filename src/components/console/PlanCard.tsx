"use client";

import type { HomePlan } from "@/lib/planner";
import type { ConsoleHome } from "@/lib/replay";
import { buildPlanCard, type CardWeather, type ReasonSource } from "@/lib/steps";
import { LEVEL_TEXT } from "@/lib/riskScale";
import HouseDiagram from "./HouseDiagram";
import { BackLink } from "./AreaPanel";
import { homeName } from "./format";

const SOURCE_STYLE: Record<ReasonSource, string> = {
  "Property record": "border-border text-muted",
  Forecast: "border-border text-muted",
  "Photo: not sent yet": "border-dashed border-border text-muted/80",
};

interface Props {
  home: ConsoleHome;
  plan: HomePlan;
  weather: CardWeather;
  onBack: () => void;
}

/** The homeowner's plan: what to do, in order. Everything else is secondary. */
export default function PlanCard({ home, plan, weather, onBack }: Props) {
  const card = buildPlanCard(home, plan, weather);

  return (
    <article className="flex flex-col gap-8">
      <header>
        <p className="text-sm text-muted">
          {homeName(home.label)} · {home.neighborhood}
        </p>
        <p className="mt-2 text-2xl font-semibold leading-snug tracking-tight">
          <span className={LEVEL_TEXT[card.level]}>{card.level.toUpperCase()}:</span> {card.headline}
        </p>
      </header>

      <section aria-labelledby="steps-heading">
        <h3 id="steps-heading" className="text-sm font-medium text-muted">
          Your 3 steps before 8 PM
        </h3>
        <ol className="mt-4 space-y-5">
          {card.steps.map((s, i) => (
            <li key={i} className="flex gap-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold text-bg" aria-hidden>
                {i + 1}
              </span>
              <div className="pt-1">
                <p className="text-lg font-semibold leading-snug">{s.text}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="rounded-panel border border-border bg-bg/60 p-4">
        <HouseDiagram foundation={home.foundation} exposed={card.exposed} level={card.level} />
      </div>

      <details className="group rounded-panel border border-border px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
          Why?
          <span className="text-muted transition group-open:rotate-90" aria-hidden>
            ›
          </span>
        </summary>
        <ul className="mt-3 space-y-3">
          {card.reasons.map((r) => (
            <li key={r.source} className="text-sm leading-relaxed">
              <p>{r.text}</p>
              <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] ${SOURCE_STYLE[r.source]}`}>{r.source}</span>
            </li>
          ))}
        </ul>
      </details>

      <BackLink onClick={onBack}>Back to map</BackLink>
    </article>
  );
}
