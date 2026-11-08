// "Your home": everything about one household, written to "you". Calm, simple, large text.
// Used by the public page /h/[homeId] and the console's Homeowner tab.

import type { HomeownerView } from "@/lib/server/homeowner";
import { H, T, clockLabel, dayLabel, type Lang } from "@/lib/i18n";
import { LEVEL_TEXT } from "@/lib/riskScale";
import HouseDiagram from "@/components/plan/HouseDiagram";
import WhyList from "@/components/plan/WhyList";
import BurstHelp from "./BurstHelp";
import PhotoCheck from "./PhotoCheck";
import StepIcon from "./StepIcon";

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

function Tile({ label, value, known }: { label: string; value: string; known: boolean }) {
  return (
    <div className={`rounded-panel border-2 px-4 py-3 ${known ? "border-border bg-surface" : "border-dashed border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${known ? "" : "text-muted"}`}>{value}</p>
    </div>
  );
}

function Conversation({ view, lang }: { view: HomeownerView; lang: Lang }) {
  const L = H[lang];
  const { conversation: c, tiles: t } = view;
  const yn = (v: boolean | null) => (v === null ? L.notAnswered : v ? L.yes : L.no);
  const known = c.lines.length > 0;
  return (
    <section aria-labelledby="call-title" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="call-title" className="text-lg font-semibold">
          {c.kind === "text" ? L.textTitle : L.callTitle}
        </h2>
        <span className="rounded-full border border-warn/50 px-2.5 py-0.5 text-xs font-medium text-warn">{L.sample}</span>
      </div>

      {view.crew && <p className="rounded-panel bg-accent px-4 py-3 text-base font-semibold text-bg">{L.crewOnTheWay(view.crew)}</p>}
      {view.crewRequested && <p className="rounded-panel border border-accent/60 px-4 py-3 text-base">{L.crewRequested}</p>}
      {c.note && <p className="text-base text-muted">{c.note}</p>}

      {known && (
        <ol className="max-h-[28rem] space-y-2 overflow-y-auto rounded-panel border border-border bg-surface/50 p-3">
          {c.lines.map((l, k) => (
            <li key={k} className={`flex ${l.who === "you" ? "justify-end" : ""}`}>
              <p
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed ${
                  l.who === "you" ? "rounded-br-sm bg-accent/15" : "rounded-bl-sm bg-bg"
                }`}
              >
                <span className="block text-[11px] font-medium text-muted">{l.who === "you" ? L.you : L.agent}</span>
                {l.text}
              </p>
            </li>
          ))}
        </ol>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Tile label={L.tiles.canDo} value={yn(t.canDo)} known={t.canDo !== null} />
        <Tile label={L.tiles.needsHelp} value={yn(t.needsHelp)} known={t.needsHelp !== null} />
        <Tile label={L.tiles.shutoff} value={yn(t.shutoffFound)} known={t.shutoffFound !== null} />
        <Tile
          label={L.tiles.faucet}
          value={view.home.outdoor_faucets === 0 ? L.noFaucet : t.faucetCovered === null ? L.notAnswered : t.faucetCovered ? L.covered : L.notCovered}
          known={view.home.outdoor_faucets === 0 || t.faucetCovered !== null}
        />
        <Tile label={L.tiles.heat} value={t.hasHeat === null ? L.notAnswered : t.hasHeat ? L.yes : L.powerOut} known={t.hasHeat !== null} />
        <Tile label={L.tiles.alone} value={yn(t.livesAlone)} known={t.livesAlone !== null} />
      </div>
      <p className="text-xs text-muted">{L.confirmedNote}</p>
    </section>
  );
}

export default function YourHome({ view, lang }: { view: HomeownerView; lang: Lang }) {
  const L = T[lang];
  const L2 = H[lang];
  const { home, card, friendly, clock } = view;
  // The coordinated drip instruction is the most prominent step (it's what makes FreezeLine different).
  const drip = { ...friendly.steps[2], key: card.steps[2].key };
  const others = [0, 1].map((k) => ({ ...friendly.steps[k], key: card.steps[k].key }));

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-sm text-muted">
          {home.label} · {home.neighborhood}
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

      <div className="rounded-panel border border-border bg-surface p-4">
        <HouseDiagram
          foundation={home.foundation}
          exposed={card.exposed}
          confirmed={view.confirmedPipes}
          hasShutoff={home.has_faucet_shutoff}
          hasOutdoorFaucet={home.outdoor_faucets > 0}
          level={card.level}
          labels={L.pipes}
          extra={L2.diagram}
        />
      </div>

      <section aria-labelledby="steps-title" className="space-y-4">
        <h2 id="steps-title" className="text-lg font-semibold">
          {L2.stepsNow}
        </h2>
        <div className="rounded-panel border-2 border-accent bg-accent/10 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-accent">{L2.dripTitle}</p>
          <div className="mt-2 flex gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-bg">
              <StepIcon stepKey={drip.key} className="size-7" />
            </span>
            <div>
              <p className="text-2xl font-semibold leading-snug">{drip.text}</p>
              <p className="mt-1 text-base leading-relaxed text-muted">{drip.detail}</p>
            </div>
          </div>
        </div>
        <ol className="space-y-5">
          {others.map((s, k) => (
            <li key={k} className="flex gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-accent text-accent" aria-hidden>
                <StepIcon stepKey={s.key} />
              </span>
              <div className="pt-0.5">
                <p className="text-xl font-semibold leading-snug">{s.text}</p>
                <p className="mt-1 text-base leading-relaxed text-muted">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">{L.stepsTitle}</p>
      </section>

      <section className="rounded-panel border border-border bg-surface p-5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">{L.clockTitle}</h2>
        <p className="mt-2 text-lg font-medium leading-snug">
          {clock.atRisk ? L.clockAtRisk(clockLabel(clock.atRisk, lang)) : L.clockSafe(dayLabel(clock.checkedThrough, lang))}
        </p>
      </section>

      <Conversation view={view} lang={lang} />

      <BurstHelp label={L.burstButton} title={L.burstTitle} steps={L.burstSteps} close={L.burstClose} />

      {home.outdoor_faucets > 0 && view.photoEnabled && (
        <PhotoCheck
          homeId={home.id}
          current={view.photo}
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

      <WhyList title={L.why} reasons={card.reasons.map((r, i) => ({ text: friendly.reasons[i] ?? r.text, source: r.source }))} sourceLabel={(s) => L.sources[s]} />
    </div>
  );
}
