import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { loadHomeownerView } from "@/lib/server/homeowner";
import { H, T, isLang, type Lang } from "@/lib/i18n";
import YourHome from "@/components/homeowner/YourHome";
import StormViewLazy from "@/components/homeowner/StormViewLazy";
import { HomeFooter, HomeTabs, LangToggle } from "@/components/homeowner/HomeShell";

export const metadata = { title: "Your freeze plan · FreezeLine" };

// The household's own page (the link in their text). Only this home's data plus area totals:
// never other homes' status, needs, transcripts or crews.
async function Homeowner({ params, searchParams }: PageProps<"/h/[homeId]">) {
  await connection(); // personal, per-request page
  const { homeId } = await params;
  const q = await searchParams;
  const t = typeof q.t === "string" ? q.t : undefined;
  const lang: Lang = isLang(q.lang) ? q.lang : "en";
  const view = q.view === "storm" ? "storm" : "home";

  const data = await loadHomeownerView(homeId, t, lang);
  if (!data) notFound();
  const base = `/h/${homeId}`;
  const query = { t: data.isReplay ? data.time : undefined, lang: lang === "es" ? "es" : undefined, view: view === "storm" ? "storm" : undefined };
  const L = H[lang];

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pb-12 pt-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-accent">FREEZELINE</p>
          <p className="mt-0.5 text-[11px] text-warn">{T[lang].simulated}</p>
        </div>
        <LangToggle lang={lang} base={base} query={query} />
      </header>
      <HomeTabs lang={lang} base={base} query={query} view={view} />
      {view === "home" ? (
        <YourHome view={data} lang={lang} />
      ) : (
        <StormViewLazy
          days={data.storm}
          home={{ lat: data.home.lat, lng: data.home.lng }}
          labels={{ intro: L.stormIntro, play: L.play, pause: L.pause, shade: L.shade, yourHome: L.yourHome, privacy: L.stormPrivacy }}
        />
      )}
      <HomeFooter lang={lang} />
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
