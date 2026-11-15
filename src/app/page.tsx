import Link from "next/link";
import Topography from "@/components/react-bits/Topography";

// Front door: residents go to the public sign-up page; utility staff go to City Operations
// (password-protected); anyone can open the /present pitch deck. Nothing here reads data.

export const metadata = { title: "FreezeLine" };

function Door({ href, eyebrow, title, body, cta }: { href: string; eyebrow: string; title: string; body: string; cta: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-panel border border-border bg-surface p-6 transition-colors hover:border-accent/60 focus-visible:border-accent"
    >
      <p className="eyebrow">{eyebrow}</p>
      <p className="mt-2 text-xl font-semibold">{title}</p>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{body}</p>
      <p className="mt-5 text-sm font-semibold text-accent">
        {cta} <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
      </p>
    </Link>
  );
}

export default function Home() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-bg px-4 py-12 text-text">
      {/* Background: animated topographic lines (React Bits "Topography"). Clicks pass through to the
          page; the component follows the pointer across the whole window for its hover and click effects. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <Topography
          color="#4f7cff"
          lineCount={22}
          lineWidth={1.2}
          elevation={1}
          foreground={0.2}
          tilt={32}
          speed={0.25}
          direction="forward"
          glow={0.6}
          depthOfField={0.4}
          fog={0.35}
          hoverEffect="lift"
          clickEffect="pulse"
          majorLines
          scale={1}
          detail={0.35}
          morph={0.2}
          brightness={1}
          markers="none"
          glitch={0}
          opacity={1}
          mouseInteraction
          mouseRadius={1}
          mouseStrength={0.6}
          trail={0.3}
          parallax={0.5}
          intro
          lightMode={false}
        />
        {/* Keeps the text readable over the brightest lines. */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(11_16_22/0.78)_0%,rgb(11_16_22/0.35)_70%,transparent_100%)]" />
      </div>
      <div className="relative z-10 w-full max-w-3xl">
        <p className="font-mono text-xs tracking-[0.2em] text-accent">FREEZELINE</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">House-by-house freeze plans for water utilities</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          FreezeLine tells each home whether to drip a faucet during a hard freeze, so pipes at risk are protected and water pressure
          stays above the 20 psi boil-water line.
        </p>
        <div className="freeze-rule mt-6" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Door
            href="/register"
            eyebrow="Residents"
            title="Sign up for freeze alerts"
            body="Get a short plan for your home by text before a hard freeze, and help if you can't do the steps yourself."
            cta="Sign up"
          />
          <Door
            href="/console"
            eyebrow="Utility staff"
            title="City Operations"
            body="The storm console: every home on the map, water pressure, outreach, crews and sign-ups. Password required."
            cta="Open the console"
          />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/present" className="btn btn-primary">
            Watch the presentation <span aria-hidden>→</span>
          </Link>
          <p className="text-sm text-muted">Four scenes on the Uri replay. Arrow keys to step, F for fullscreen.</p>
        </div>
        <p className="mt-6 text-xs text-muted">
          Demo: replays Winter Storm Uri (Feb 2021) over Houston. Home locations are real OpenStreetMap footprints; household details are
          simulated.
        </p>
      </div>
    </main>
  );
}
