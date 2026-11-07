@AGENTS.md

# FreezeLine

FreezeLine is an AI agent for water utilities during hard freezes.

In February 2021, Houston told residents "do NOT drip faucets" because dripping was crashing water pressure, while standard advice says to drip. One message for everyone backfires. FreezeLine scores freeze risk house by house and builds a coordinated drip plan (who drips, which faucet, who shouldn't) so at-risk homes are protected and pressure stays above **20 psi** (below 20 psi triggers a boil-water notice in Texas).

Two views:
- **Utility console** — 3D hex map, pressure gauge, agent actions.
- **Homeowner phone page** — a personal plan for one house.

The demo replays **Winter Storm Uri (Feb 14–18, 2021)** over Houston.

## Stack

- Next.js (App Router) + TypeScript + Tailwind, deployed on Vercel
- Supabase (Postgres + RLS; Realtime later)
- deck.gl + MapLibre with a free dark basemap (no Mapbox key)
- h3-js for hex aggregation
- Open-Meteo (archive API for Uri replay, forecast API for live)
- Vitest for tests
- Dev machine: Windows PowerShell

## 7-phase plan

1. **Setup + core loop** — scaffold, schema, seed homes, Uri weather, deterministic risk engine.
2. **Drip planner + pressure gauge** — choose who drips so risk is covered and pressure stays ≥ 20 psi.
3. **Claude agent + homeowner page** — Claude explains plans and chooses actions; personal plan page.
4. **Twilio SMS + ElevenLabs calls** — outreach to homeowners.
5. **Storm mode** — pipe bursts, repair crews, Supabase Realtime.
6. **3D + house x-ray + polish** — deck.gl 3D hexes, per-house pipe x-ray view.
7. **Deploy + demo** — Vercel production, scripted Uri replay.

Only build the phase (or sub-phase) currently asked for.

## Demo story

Replay Uri hour by hour. Temperatures fall into the teens; the risk engine lights up older pier-and-beam homes with exterior-wall and attic/crawlspace pipes. A blanket "everyone drip" message would drag zone pressure under 20 psi; a blanket "don't drip" leaves vulnerable homes to burst. FreezeLine instead targets drips to the homes that need them, holds every zone above 20 psi on the gauge, and sends each homeowner a plain-language personal plan.

## UX principles

- Lead with actions, not data. One idea per screen: city (who acts tonight + pressure), area (one sentence + homes that need action), home (plan card).
- No numeric risk scores, attribute tables or tabs in the UI (they stay in code and tests). Say "Watch", not "Medium".
- One accent color (ice blue) for actions; Low/Watch/High colors are for status only.

## AI providers (`LLM_PROVIDER` in .env.local, default `pregenerated`)

- **pregenerated** (default, free): homeowner plan wording, SMS text and the agent's explanations all come from `data/messages.json` (hand-written English + Spanish). No API calls. The photo check is hidden.
- **gemini**: the same pre-written text, plus Gemini's free tier (`GEMINI_API_KEY`, optional `GEMINI_MODEL`) for the photo check only.
- **anthropic**: live Claude (`ANTHROPIC_API_KEY`) for plan wording, SMS, the agent's decisions and the photo check. Any failure falls back to the pre-written text.
- All keys are server-only, never `NEXT_PUBLIC_`. No provider ever changes the planner's numbers.
- Editing `data/messages.json`: same facts only, no new numbers, times or promises; every SMS keeps `(simulated)` and `{link}`. Run `npm run messages:check` and `npm test`.

## Rules

- **The risk engine is deterministic.** Same inputs → same scores, in plain code with tests. Claude explains and chooses actions (later phases); it never computes the risk score.
- Risk is computed in code, not stored per hour in the database.
- **All sample data is labeled simulated** (homes, zones, outreach) — in the DB (`simulated` column) and in the UI.
- **Keys are never committed.** Real values live in `.env.local` (git-ignored). `.env.example` holds placeholders only.
- **`SUPABASE_SERVICE_ROLE_KEY` is used only in scripts and server code**, never with a `NEXT_PUBLIC_` prefix and never imported into a client component.
- Frontend reads Supabase with the anon key; anon has SELECT-only access via RLS policies and explicit GRANTs.

## Layout

- `src/app` — routes (`/console` = utility console with Uri replay, `/status` = connection test page)
- `src/lib/risk.ts` — deterministic risk engine (score 0–100, level, plain-English why)
- `src/lib/planner.ts` — deterministic drip planner + zone pressure model (who drips, which tap, ≥ 20 psi + 3 psi reserve)
- `src/lib/replay.ts` — precomputes H3 hex averages + level counts per hour for the console
- `src/lib/server/` — server-only Claude layer (Haiku 5.5 writing/translation/photo, Opus 5.5 agent), content-keyed cache, agent tools + loop; `supabase/002_phase3.sql` adds ai_cache, photo_checks, idempotency indexes
- `/h/[homeId]?t=…&lang=es` — homeowner page; `/api/agent/run`, `/api/agent/execute`, `/api/photo-check`
- `data/messages.json` + `src/lib/pregenerated.ts` — pre-written wording (English + Spanish) keyed by step / reason / SMS / agent keys; `npm run messages:check` proves every fact combination is covered
- `src/lib/server/provider.ts` — `LLM_PROVIDER` switch; `src/lib/server/gemini.ts` — free-tier photo check
- `src/lib/steps.ts` — homeowner plan card: level headline, exactly 3 steps (from the drip plan + home details), 3 sourced reasons; Medium is shown as "Watch"
- `src/components/console` — top bar (Live | Replay), map (deck.gl H3 + home markers over MapLibre), timeline, side panel (city → area → plan card)
- `src/lib` — also supabase client, homes loader, weather fetchers
- `public/maplibre-gl-worker.mjs` — copied from node_modules on `npm install` (git-ignored); MapLibre 6's worker can't be resolved through Turbopack
- `supabase/001_schema.sql` — schema to paste into the Supabase SQL Editor
- `scripts/` — seed + weather download (`npm run seed`, `npm run weather:uri`)
- `data/uri-2021.json` — hourly Houston weather for Feb 13–19, 2021 (timeline + city headline)
- `data/uri-2021-neighborhoods.json` — same window per neighborhood center, one multi-point request (`npm run weather:neighborhoods`)
