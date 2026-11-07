"use client";

import type { HomePlan } from "@/lib/planner";
import type { ConsoleHome } from "@/lib/replay";
import { buildPlanCard, type CardWeather } from "@/lib/steps";
import { renderPlan } from "@/lib/pregenerated";
import WhyList from "@/components/plan/WhyList";
import { LEVEL_TEXT } from "@/lib/riskScale";
import HouseDiagram from "@/components/plan/HouseDiagram";
import { BackLink } from "./AreaPanel";
import { homeName } from "./format";


interface Props {
  home: ConsoleHome;
  plan: HomePlan;
  weather: CardWeather;
  onBack: () => void;
  /** Replay time to open the homeowner page at (null = live). */
  replayTime: string | null;
}

/** The homeowner's plan: what to do, in order. Everything else is secondary. */
export default function PlanCard({ home, plan, weather, onBack, replayTime }: Props) {
  const card = buildPlanCard(home, plan, weather);
  const words = renderPlan(card, "en");

  return (
    <article className="flex flex-col gap-8">
      <header>
        <p className="text-sm text-muted">
          {homeName(home.label)} · {home.neighborhood}
        </p>
        <p className="mt-2 text-2xl font-semibold leading-snug tracking-tight">
          <span className={LEVEL_TEXT[card.level]}>{card.level.toUpperCase()}:</span> {words.headline.slice(words.headline.indexOf(":") + 1)}
        </p>
      </header>

      <section aria-labelledby="steps-heading">
        <h3 id="steps-heading" className="text-sm font-medium text-muted">
          Your 3 steps before 8 PM
        </h3>
        <ol className="mt-4 space-y-5">
          {words.steps.map((s, i) => (
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

      <WhyList reasons={card.reasons.map((r, i) => ({ text: words.reasons[i], source: r.source }))} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink onClick={onBack}>Back to map</BackLink>
        <a
          href={`/h/${home.id}${replayTime ? `?t=${replayTime}` : ""}`}
          target="_blank"
          rel="noopener"
          className="rounded-md px-2 py-1 text-sm font-medium text-accent transition hover:bg-accent/10"
        >
          Open homeowner page ↗
        </a>
      </div>
    </article>
  );
}
