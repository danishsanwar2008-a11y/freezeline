import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { loadHomeownerView } from "@/lib/server/homeowner";
import { isLang, type Lang } from "@/lib/i18n";
import TopBar from "@/components/console/TopBar";
import YourHome from "@/components/homeowner/YourHome";
import { LangToggle } from "@/components/homeowner/HomeShell";

export const metadata = { title: "Homeowner · FreezeLine console" };

// Console Homeowner tab: one household's view, exactly as they see it ("you" wording).
async function HomeTab({ params, searchParams }: PageProps<"/console/home/[homeId]">) {
  await connection();
  const { homeId } = await params;
  const q = await searchParams;
  const t = typeof q.t === "string" ? q.t : undefined;
  const lang: Lang = isLang(q.lang) ? q.lang : "en";
  const data = await loadHomeownerView(decodeURIComponent(homeId), t, lang);
  if (!data) notFound();
  const base = `/console/home/${homeId}`;
  const publicHref = `/h/${homeId}${data.isReplay ? `?t=${data.time}` : ""}`;

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <TopBar audience="home" homeHref={`${base}${t ? `?t=${t}` : ""}`} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pb-12 pt-5">
        <div className="flex items-center justify-between gap-3">
          <a href={publicHref} target="_blank" rel="noopener" className="text-sm font-medium text-accent hover:underline">
            Open the household&apos;s page ↗
          </a>
          <LangToggle lang={lang} base={base} query={{ t: data.isReplay ? data.time : undefined }} />
        </div>
        <YourHome view={data} lang={lang} />
      </main>
    </div>
  );
}

export default function HomeTabPage(props: PageProps<"/console/home/[homeId]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <HomeTab {...props} />
    </Suspense>
  );
}
