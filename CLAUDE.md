@AGENTS.md

# FreezeLine

FreezeLine is an AI agent for water utilities during hard freezes.

In February 2021, Houston told residents "do NOT drip faucets" because dripping was crashing water pressure, while standard advice says to drip. One message for everyone backfires. FreezeLine scores freeze risk house by house and builds a coordinated drip plan (who drips, which faucet, who shouldn't) so at-risk homes are protected and pressure stays above **20 psi** (below 20 psi triggers a boil-water notice in Texas).

Who sees what (see "City Operations" below):
- **City Operations** (officials, password-protected) is the only screen: map of every home, cells, metrics, pressure, crews, agent log.
- **Homeowners** never see the console. They get texts and calls only (Phase 4), plus a separate sign-up and home survey page (later).

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

## City Operations (the only screen)

- **/console** (officials, third-person wording: "Blair St home needs help; Crew 2 assigned"): every home as a status dot, hexes by % of homes needing action, crews on the map, Ready check, outreach funnel (Texted → Called → Door check), Crews panel, pressure monitor, freeze readings, collapsed agent log. No transcripts or homeowner instructions.
- The Homeowner tab, `/console/home/[homeId]` and the household page `/h/[homeId]` (house diagram, "Storm in your area", photo check) were removed in Phase 3.6. Restore them from commit `f8994d6` if ever needed. Queued sample texts still carry `/h` links until Phase 4 replaces them.
- Household details (sample) are server-only: homes, household_calls, crews and crew_assignments are not readable with the anon key.

## Outreach and the crew rule

- Outreach (SAMPLE until Phase 4): text every Watch/High home → call those who don't reply → door check High homes that don't answer. The call asks 7 questions; answers are deterministic per home id (`src/lib/household.ts`) and saved in `household_calls`. A neighbor named on a call moves up the call list.
- Assessment per home: Ready / Needs a reminder / Needs a crew, with a one-line reason and a confidence (confirmed = answered; estimated = not yet).
- **Crew rule**: crews go only to homes whose call (confirmed) says they can't do the steps themselves, highest risk first, nearest free crew in the same area (else the nearest free crew from another area). 20 sample crews, 5 per area, each starting at a depot in its area (`npm run seed`). A job is the drive (road miles = straight line × 1.3 at 15 mph) plus 30 min on site, then the crew is back on standby; homes already helped leave the queue. The agent proposes; an official approves (Approve first) or Auto assigns. The rest wait in the crew queue.
- **Honesty rule**: a household hears "a crew is on the way" only after a crew is actually assigned (a `crew_assignments` row with status `assigned`). Before that: "I'm requesting a crew… we'll text you as soon as one is assigned." Enforced in `src/lib/callScript.ts` and checked by tests and `npm run messages:check`.

## UX principles

- Lead with actions, not data. One idea per screen.
- No numeric risk scores, attribute tables or tabs in the UI (they stay in code and tests). Say "Watch", not "Medium".
- One accent color (ice blue) for actions.

## Visual design rules

- Every number gets a visual: dot/unit grids (one dot per home), stacked color bars, color tiles or simple icons. No bare numbers in a list.
- One big headline number per panel, with details collapsed underneath.
- Facts as short tiles, not sentences (e.g. "Can do steps: No", "Lives alone: Yes").
- Status colors (home status only): green = ready, red = needs help, yellow = waiting, black = no answer, gray = not contacted (`STATUS_*` in `src/lib/riskScale.ts`).
- The hex "need" scale uses its own faint → deep violet ramp in 4 labeled steps (`NEED_STEPS` / `needRgba`; the map and the legend share them), never a status color.
- Water pressure uses its own tokens (`--psi-ok` / `--psi-warn` / `--psi-bad`: green above 25 psi, amber 20–25, red below 20), never the home status colors.
- Two-audience wording: officials' third-person wording only on City Operations; "you" wording only in texts and calls to households (tested in `src/lib/audience.test.ts`).
- Anything a household reads (texts, calls, the future sign-up page) is friendlier and less technical: plain sentences, nothing that needs explaining.
- Counts always agree with their noun: use `plural()` from `src/lib/plural.ts` ("1 home", "2 homes"), never "1 homes".
- Honesty in the UI: sample or simulated data is always marked, and confirmed vs estimated looks different (solid vs dashed).

## AI providers (`LLM_PROVIDER` in .env.local, default `pregenerated`)

- **pregenerated** (default, free): homeowner plan wording, SMS text and the agent's explanations all come from `data/messages.json` (hand-written English + Spanish). No API calls. The photo check is hidden.
- **gemini**: the same pre-written text, plus Gemini's free tier (`GEMINI_API_KEY`, optional `GEMINI_MODEL`; default tries gemini-3.8-flash then gemini-3.5-flash-lite) for the photo check only.
- **anthropic**: live Claude (`ANTHROPIC_API_KEY`) for plan wording, SMS, the agent's decisions and the photo check. Any failure falls back to the pre-written text.
- All keys are server-only, never `NEXT_PUBLIC_`. No provider ever changes the planner's numbers.
- Editing `data/messages.json`: same facts only, no new numbers, times or promises; every SMS keeps `(simulated)` and `{link}`. Run `npm run messages:check` and `npm test`.

## Rules

- Push GitHub after each phase committed.
- Full history, decisions and every prompt: docs/CONTEXT.md. Read it when you need the why.
- **The risk engine is deterministic.** Same inputs → same scores, in plain code with tests. Claude explains and chooses actions (later phases); it never computes the risk score.
- Risk is computed in code, not stored per hour in the database.
- **All sample data is labeled simulated** (homes, zones, outreach, calls, crews) — in the DB (`simulated` column) and in the UI. Home locations are real OpenStreetMap footprints (© OpenStreetMap contributors, ODbL); everything about each household is simulated.
- **Keys are never committed.** Real values live in `.env.local` (git-ignored). `.env.example` holds placeholders only.
- **`SUPABASE_SERVICE_ROLE_KEY` is used only in scripts and server code**, never with a `NEXT_PUBLIC_` prefix and never imported into a client component.
- Supabase access: the anon key may read only zones, drip_plans and events. Homes, household calls, crews and outreach are read on the server with the service role.

## Layout

- `src/app` — routes (`/console` City Operations, `/status` connection test); APIs `/api/ops`, `/api/ops/home`, `/api/agent/*`
- `data/osm-homes.json` — 8,034 real house footprints from OpenStreetMap (`npm run osm:homes`, fetched once); `src/lib/seed/generate.ts` adds simulated details (incl. elderly / mobility / lives alone / indoor faucet valve)
- `src/lib/household.ts` — simulated outreach funnel, call answers, assessments, crew proposals (pure, tested); `src/lib/crewTrip.ts` crew distance, drive time and job length (simulated); `src/lib/server/outreachState.ts` saves them; `src/lib/cityWording.ts` officials' wording
- `src/lib/callScript.ts` — the agent's conversation with a household (pre-written lines, honesty rule)
- `supabase/003_phase35.sql` — home columns, household_calls, crews, crew_assignments, outreach channels; removes anon access to homes
- `src/lib/risk.ts` — deterministic risk engine (score 0–100, level, plain-English why)
- `src/lib/planner.ts` — deterministic drip planner + zone pressure model (who drips, which tap; new drips stop at 25 psi = 20 + 5 psi reserve)
- `src/lib/pressureConfig.ts` — the one pressure config file: every pressure constant and the "some homes drip more than told" assumption (simulated; label it wherever it affects what's shown)
- `src/lib/pressure.ts` — pressure monitor (past + next 12 hours per area) and the Stage 2 proposal (kitchen tap only first, then stop lowest-risk drippers until ≥ 25 psi). Stage 2 always needs a supervisor's approval, even in Auto mode (`send_stage2_alert`, tested in `src/lib/server/agent/stage2.test.ts`)
- `src/lib/replay.ts` — precomputes H3 hex averages + level counts per hour for the console
- `src/lib/server/` — server-only Claude layer (Haiku 5.5 writing/translation/photo, Opus 5.5 agent), content-keyed cache, agent tools + loop; `supabase/002_phase3.sql` adds ai_cache, photo_checks, idempotency indexes
- `data/messages.json` + `src/lib/pregenerated.ts` — pre-written wording (English + Spanish) keyed by step / reason / SMS / agent keys; `npm run messages:check` proves every fact combination is covered
- `src/lib/server/provider.ts` — `LLM_PROVIDER` switch; `src/lib/server/gemini.ts` + `photoCheck.ts` — free-tier photo check (no UI since Phase 3.6; kept for Phase 4)
- `src/lib/steps.ts` — a household's plan (level, exactly 3 steps from the drip plan + home details, 3 sourced reasons) used by texts and calls; Medium is shown as "Watch"
- `src/components/console` — top bar (City Operations, Live | Replay), map (status dots, need hexes, crews), City cards, agent panel
- `src/lib` — also supabase client, homes loader, weather fetchers
- `public/maplibre-gl-worker.mjs` — copied from node_modules on `npm install` (git-ignored); MapLibre 6's worker can't be resolved through Turbopack
- `supabase/001_schema.sql` — schema to paste into the Supabase SQL Editor
- `scripts/` — `npm run osm:homes`, `npm run seed` (safe to re-run; removes homes no longer in the set), `npm run weather:uri`, `npm run messages:check`, `npm run db:status`
- `data/uri-2021.json` — hourly Houston weather for Feb 13–19, 2021 (timeline + city headline)
- `data/uri-2021-neighborhoods.json` — same window per neighborhood center, one multi-point request (`npm run weather:neighborhoods`)
