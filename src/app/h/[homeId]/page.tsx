import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { loadHomeownerView } from "@/lib/server/homeowner";
import { T, clockLabel, dayLabel, isLang, type Lang } from "@/lib/i18n";
import { LEVEL_TEXT } from "@/lib/riskScale";
import { homeName } from "@/components/console/format";
import HouseDiagram from "@/components/plan/HouseDiagram";
import WhyList from "@/components/plan/WhyList";
import BurstHelp from "@/components/homeowner/BurstHelp";
import PhotoCheck from "@/components/homeowner/PhotoCheck";

export const metadata = { title: "Your freeze plan · FreezeLine" };

function LangToggle({ lang, homeId, t }: { lang: Lang; homeId: string; t?: string }) {
  const href = (l: Lang) => `/h/${homeId}?${new URLSearchParams({ ...(t ? { t } : {}), ...(l === "es" ? { lang: "es" } : {}) })}`;
  return (
    <nav aria-label="Language" className="flex rounded-full border border-border p-0.5 text-sm">
      {(["en", "es"] as const).map((l) => (
        <Link
          key={l}
          href={href(l)}
          aria-current={lang === l ? "true" : undefined}
          className={`rounded-full px-3 py-1 font-medium transition ${lang === l ? "bg-accent text-bg" : "text-muted hover:text-text"}`}
        >
          {l === "en" ? "English" : "Español"}
        </Link>
      ))}
    </nav>
  );
}

/** "HIGH: Likely to freeze…" -> colored level word + sentence. */
function Headline({ text, level }: { text: string; level: "High" | "Watch" | "Low" }) {
  const i = text.indexOf(":");
  const [word, rest] = i > 0 && i < 20 ? [text.slice(0, i + 1), text.slice(i + 1)] : ["", text];
  return (
    <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">
      {word && <span className={LEVEL_TEXT[level]}>{word}</span>}
      {rest}
    </h1>
  );
}

async function Homeowner({ params, searchParams }: PageProps<"/h/[homeId]">) {
  await connection(); // personal, per-request page
  const { homeId } = await params;
  const q = await searchParams;
  const t = typeof q.t === "string" ? q.t : undefined;
  const lang: Lang = isLang(q.lang) ? q.lang : "en";
  const L = T[lang];

  const view = await loadHomeownerView(homeId, t, lang);
  if (!view) notFound();
  const { home, card, friendly, clock, photo } = view;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-8 px-5 pb-12 pt-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-accent">FREEZELINE</p>
          <p className="mt-0.5 text-[11px] text-warn">{L.simulated}</p>
        </div>
        <LangToggle lang={lang} homeId={homeId} t={view.isReplay ? view.time : undefined} />
      </header>

      <section>
        <p className="text-sm text-muted">
          {lang === "es" ? homeName(home.label).replace("Home", "Casa") : homeName(home.label)} · {home.neighborhood}
          {view.isReplay && (
            <>
              {" · "}
              {L.replayAt} {dayLabel(view.time, lang)} · {clockLabel(view.time, lang)}
            </>
          )}
        </p>
        <div className="mt-2">
          <Headline text={friendly.headline} level={card.level} />
        </div>
        {lang === "es" && friendly.source === "template" && <p className="mt-2 text-xs text-muted">{L.noTranslation}</p>}
      </section>

      <section aria-labelledby="steps-title">
        <h2 id="steps-title" className="text-sm font-medium text-muted">
          {L.stepsTitle}
        </h2>
        <ol className="mt-4 space-y-6">
          {friendly.steps.map((s, i) => (
            <li key={i} className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-semibold text-bg" aria-hidden>
                {i + 1}
              </span>
              <div className="pt-1">
                <p className="text-xl font-semibold leading-snug">{s.text}</p>
                <p className="mt-1 text-base leading-relaxed text-muted">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-panel border border-border bg-surface p-5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">{L.clockTitle}</h2>
        <p className="mt-2 text-lg font-medium leading-snug">
          {clock.atRisk ? L.clockAtRisk(clockLabel(clock.atRisk, lang)) : L.clockSafe(dayLabel(clock.checkedThrough, lang))}
        </p>
      </section>

      <BurstHelp label={L.burstButton} title={L.burstTitle} steps={L.burstSteps} close={L.burstClose} />

      {home.outdoor_faucets > 0 && view.photoEnabled && (
        <PhotoCheck
          homeId={home.id}
          current={photo}
          labels={{
            title: L.photoTitle,
            prompt: L.photoPrompt,
            button: L.photoButton,
            checking: L.photoChecking,
            result: L.photoResult,
            privacy: L.photoPrivacy,
            unavailable: L.photoUnavailable,
          }}
        />
      )}

      <div className="rounded-panel border border-border bg-surface p-4">
        <HouseDiagram foundation={home.foundation} exposed={card.exposed} level={card.level} labels={L.pipes} caption={{ exposed: L.diagramExposed, safe: L.diagramSafe }} />
      </div>

      <WhyList
        title={L.why}
        reasons={card.reasons.map((r, i) => ({ text: friendly.reasons[i] ?? r.text, source: r.source }))}
        sourceLabel={(s) => L.sources[s]}
      />

      <p className="text-center text-xs text-muted">{L.footer}</p>
    </main>
  );
}

function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pt-5" aria-busy>
      <p className="font-mono text-xs tracking-[0.2em] text-accent">FREEZELINE</p>
      <div className="h-24 animate-pulse rounded-panel bg-surface" />
      <div className="h-64 animate-pulse rounded-panel bg-surface" />
    </main>
  );
}

export default function HomeownerPage(props: PageProps<"/h/[homeId]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Homeowner {...props} />
    </Suspense>
  );
}
