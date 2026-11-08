import Link from "next/link";
import { H, T, type Lang } from "@/lib/i18n";

/** Language toggle that keeps the current page and query. */
export function LangToggle({ lang, base, query }: { lang: Lang; base: string; query: Record<string, string | undefined> }) {
  const href = (l: Lang) => {
    const q = new URLSearchParams(Object.entries({ ...query, lang: l === "es" ? "es" : undefined }).filter(([, v]) => v) as [string, string][]);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
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

/** "Your home" | "Storm in your area" tabs for the household's public page. */
export function HomeTabs({ lang, base, query, view }: { lang: Lang; base: string; query: Record<string, string | undefined>; view: "home" | "storm" }) {
  const L = H[lang];
  const href = (v: "home" | "storm") => {
    const q = new URLSearchParams(Object.entries({ ...query, view: v === "storm" ? "storm" : undefined }).filter(([, x]) => x) as [string, string][]);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  return (
    <nav aria-label="Views" className="grid grid-cols-2 gap-1 rounded-panel border border-border p-1">
      {(["home", "storm"] as const).map((v) => (
        <Link
          key={v}
          href={href(v)}
          aria-current={view === v ? "page" : undefined}
          className={`rounded-md px-3 py-2 text-center text-base font-medium transition ${view === v ? "bg-surface text-text" : "text-muted hover:text-text"}`}
        >
          {v === "home" ? L.tabHome : L.tabStorm}
        </Link>
      ))}
    </nav>
  );
}

export function HomeFooter({ lang }: { lang: Lang }) {
  return <p className="text-center text-xs text-muted">{T[lang].footer}</p>;
}
