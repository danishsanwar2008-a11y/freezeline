# FreezeLine

**House-by-house freeze plans for water utilities.** FreezeLine decides, for every home in a city, whether
to drip a faucet during a hard freeze, which faucet, and who shouldn't, so the pipes most at risk are
protected **and** water pressure stays above the 20 psi line where Texas requires a boil-water notice.
It then reaches each household by text and phone call, and sends help crews to the people who can't do
the steps themselves.

The demo replays **Winter Storm Uri (Feb 13–19, 2021)** over ten Houston neighborhoods, hour by hour,
with real weather and 18,105 real house footprints.

---

## Why

During Uri, about 1 in 4 Houston water customers had a leak, and Texas insurers projected roughly
$5.8 billion in claims. The usual advice is "drip your faucets", but when a whole city drips, pressure
collapses. On Feb 17, 2021, Houston told residents **"Please do NOT drip faucets."** One message for
everyone fails either way:

- **Everyone drips:** at the storm's coldest hour, all ten areas fall below 20 psi (as low as 2.5 psi).
- **Nobody drips:** the most exposed homes are left to freeze.
- **FreezeLine:** every High-risk home drips one chosen faucet, and every area stays above 25 psi
  (20 psi plus a 5 psi safety margin). Over the whole storm: 0 area-hours below 20 psi, vs 1,278 of 1,680
  if everyone drips.

*(Results from the project's simplified, simulated pressure model; see "Real and simulated data".)*

---

## What's in the app

| Page | Who it's for | What it does |
|---|---|---|
| `/` | Everyone | Front door: sign up, open the console, or watch the presentation |
| `/register` | Residents | Sign-up: name, contact, address, emergency contact, consent to texts and calls. The address is matched to a home on the map |
| `/console` | Utility staff (password) | City Operations: every home on the map, the storm timeline, water pressure by area, outreach, crews, and the agent's live decision trace |
| `/console/registrations` | Utility staff | Every sign-up and its address match |
| `/console/calls` | Utility staff | Every phone call the agent placed, the household's answers, and the outcome, updating live |
| `/present` | Everyone | A four-scene pitch deck on the replay: the storm, pressure, outreach, architecture. Arrow keys to step, F for fullscreen |

Households never see the console. They get texts and calls, and use `/register`.

---

## How it works

```
 Real weather (Open-Meteo)      Homes (OpenStreetMap footprints + simulated details)
            │                                  │
            └──────►  1. Risk engine  ◄────────┘   deterministic score per home, per hour
                            │
                            ▼
                  2. Drip planner   who drips, which faucet; a drip budget per area
                            │
                            ▼
                  3. Pressure model   last 12 h + 12 h forecast per area; Stage 2 alert below 25 psi
                            │
                            ▼
                  4. Agent ("Run agent")   publish the plan → text → call → door check → crews
                            │
                            ▼
                  5. Households   texts and phone calls; answers saved; crews for those who can't
```

1. **Risk engine** (`src/lib/risk.ts`). For each home and hour:
   `score = 100 × exposure × (0.3 + 0.7 × vulnerability)`.
   - *Exposure* comes from the temperature, wind chill, and hours spent below 20°F.
   - *Vulnerability* comes from the plumbing: pier-and-beam crawlspace, pipes in outside walls,
     attic pipes, insulation, outdoor faucets.
   - 60+ is High and 30+ is Watch. Each score comes with a plain-English reason.
2. **Drip planner** (`src/lib/planner.ts`). How many homes an area can afford to have dripping:
   `n = floor((P_base − 10·E − 25) / 15 × homes)`. The highest-risk homes get those drips (with equal
   costs, highest-first is optimal), along with the right faucet for their pipes.
3. **Pressure model** (`src/lib/pressure.ts`). `P = P_base − 10·E − 15 × taps / homes`, shown for the
   last 12 hours plus a 12-hour forecast.
   - If the forecast drops below 25 psi, a **Stage 2 alert** is proposed: "kitchen tap only" first,
     then the lowest-risk drippers stop.
   - A supervisor approves every Stage 2 alert.
4. **Agent** (`src/lib/server/agent/`). It runs the steps with tools: publish the plan, queue texts,
   run outreach, propose crews.
   - It's a rule-based agent by default, or Claude when an API key is set.
   - **It never computes a number:** risk, plans and pressure always come from tested code.
5. **Outreach and crews.** Every Watch/High home gets a text, those who don't reply get a call, and
   High-risk homes that don't answer get a door check.
   - Crews go only to households that said they can't do the steps, highest risk first, each the
     nearest free crew in its area, routed with A\* on the real OpenStreetMap street network.
   - **Honesty rule, enforced in code and tests:** a household hears "a crew is on the way" only after
     a crew is actually assigned.
6. **Voice agent** (`voice/`, Python). It phones a household, reads its plan, asks the check-in
   questions, understands spoken answers, and saves them to Supabase after every answer. No language
   model is used during the call: every line comes from a fixed script.

---

## Real and simulated data

| Real | Simulated (and labeled as such everywhere) |
|---|---|
| Hourly weather for Feb 13–19, 2021 per neighborhood ([Open-Meteo](https://open-meteo.com)) | Each home's details: year built, foundation, pipe locations, insulation, outdoor faucets, household needs |
| 18,105 house footprints and the street network ([OpenStreetMap](https://www.openstreetmap.org)) | Area base pressures and the pressure-model constants (calibrated assumptions, not Houston's pipe network) |
| Sign-ups on `/register`, and demo phone calls to a teammate's phone | Outreach replies, call answers in the replay, the 50 crews (5 per area) |

Simulated values come from a seeded generator, so the demo is repeatable and the tests can check
exact results.

---

## Tech stack

| Layer | Technology |
|---|---|
| Web app | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Map | deck.gl 9 + MapLibre GL 6, CARTO Positron tiles (free, no key), h3-js hexagons |
| Animation | Motion for React (the `/present` deck) |
| Database | Supabase (PostgreSQL with row-level security) |
| Validation | zod |
| AI (optional) | Claude (agent decisions and wording) or Gemini (photo check); off by default, using pre-written English + Spanish text |
| Voice agent | Python 3.12, FastAPI, Pipecat, faster-whisper (speech to text), Kokoro (text to speech) |
| Phone and SMS | Twilio (or a TextBee Android gateway for texts; an ElevenLabs agent as an alternative for calls) |
| Testing | Vitest; a checker that renders every message in both languages |

---

## Getting started

**You need** [Node.js 20+](https://nodejs.org) and [Git](https://git-scm.com). For phone calls you
also need Python 3.12.

```powershell
git clone https://github.com/danishsanwar2008-a11y/freezeline.git
cd freezeline
npm install                          # also copies the MapLibre worker into public/
Copy-Item .env.example .env.local    # then fill in the values below (macOS/Linux: cp)
npm run dev
```

Open http://localhost:3000.

### `.env.local`

Never commit this file (it's git-ignored), and never paste its values into chats or docs.

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Everything (ask the team privately) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server and scripts: saving sign-ups, loading homes, calls |
| `CONSOLE_PASSWORD` | Signing in to `/console` |
| `LLM_PROVIDER` | Keep `pregenerated` (no AI calls, free). `anthropic` or `gemini` need their keys |
| `TWILIO_*`, `PUBLIC_HOSTNAME`, `VOICE_*`, `DEMO_CALL_TO` | Real phone calls only. See `docs/CALLS_SETUP.md` |

### Database

The team's Supabase project is already set up. If you use your own, run `supabase/001_schema.sql`
through `supabase/008_call_followup.sql` in order in the Supabase SQL Editor, then:

```powershell
npm run seed                 # 10 areas, 18,105 homes, 50 crews
npm run seed:registrations   # 400 sample sign-ups
npm run seed:calls           # 60 sample calls
npm run db:status            # check the connection
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Run, build, or serve the app |
| `npm test` | All unit tests (risk, planner, pressure, outreach, honesty rule, wording, routing, sign-ups, calls) |
| `npm run messages:check` | Renders every message combination in English and Spanish and fails on missing text |
| `npm run lint` | ESLint |
| `npm run seed`, `seed:registrations`, `seed:calls` | Load homes, sample sign-ups, and sample calls into Supabase |
| `npm run registrations:match` | Retry address matching for sign-ups |
| `npm run calls:rehearse` | A full call without a phone: plays Twilio's part against the local voice agent and prints what was saved |
| `npm run call:me` | Run the pre-storm survey call to your own phone |
| `npm run sms` | Text signed-up households (preview by default; `--send` to send) |
| `npm run osm:homes`, `osm:streets`, `weather:uri`, `weather:neighborhoods` | Re-fetch the cached map and weather data (already in `data/`) |

---

## Project structure

```
src/app/            pages (/, /register, /console, /console/registrations, /console/calls, /present, /login)
                    and API routes (/api/ops, /api/agent, /api/register, /api/voice/*, /api/sms)
src/components/     console UI, sign-up form, presentation deck
src/lib/            the engine: risk, planner, pressure, outreach, crews, routing, wording (pure, tested)
src/lib/server/     server-only: Supabase, the agent and its tools, demo calls, presentation data
voice/              Python phone agent (call script, pre-storm survey, Twilio and tunnel scripts)
supabase/           SQL to set up the database (run in order)
scripts/            seeding, data fetching, call and text tools
data/               cached OpenStreetMap homes and streets, Uri weather, all household-facing wording
docs/               setup guides and project history
```

---

## Documentation

- [`docs/TEAMMATE_SETUP.md`](docs/TEAMMATE_SETUP.md): set up everything on a new laptop
- [`docs/CALLS_SETUP.md`](docs/CALLS_SETUP.md): saved calls, demo calls, and testing without a phone
- [`voice/DEMO.md`](voice/DEMO.md): a real call to your own phone on Windows
- [`docs/CONTEXT.md`](docs/CONTEXT.md): project history, decisions and research
- [`CLAUDE.md`](CLAUDE.md) and [`DESIGN.md`](DESIGN.md): project rules and visual design

---

## Security and privacy

- `/console`, its pages, and its APIs are behind a shared password. The session cookie is signed and
  expires after 12 hours.
- Homes, sign-ups, calls and crews are readable only on the server; the public database key can see
  only zones, plans, and events.
- Agent-to-app routes require a shared secret.
- Sign-ups require consent to automated texts and calls.
- Keys live only in `.env.local`. Sample data uses fictional 555-01XX numbers and `example.com` emails.

---

## Limitations

- **Simulated home details.** In a real deployment they'd come from parcel records, the sign-up survey,
  and the calls.
- **A simplified pressure model.** It's calibrated, not fitted to Houston's network; in a real
  deployment the utility's own pressure sensors replace it, and the same equation still decides how many
  homes to stop.
- **Expert-set risk weights.** A planned check compares FreezeLine's risk ranking with Houston's
  Feb 2021 leak calls.

---

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL). Basemap tiles ©
[CARTO](https://carto.com/attributions). Weather from [Open-Meteo](https://open-meteo.com). Home-page
background and the presentation's title-slide radar: the "Topography" and "Radar" components from
[React Bits](https://reactbits.dev) (vendored in `src/components/react-bits/`). Built by the FreezeLine team.
