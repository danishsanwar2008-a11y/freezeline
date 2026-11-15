# FreezeLine: teammate setup

Everything you need to get FreezeLine running on your laptop: the web app (City Operations console
and the public sign-up page), the shared Supabase database, and the voice agent that phones a
household. Last updated Nov 14, 2026.

For the project rules read `CLAUDE.md`; for the history and the "why", `docs/CONTEXT.md`.
Saved calls (Calls page, demo call from Run agent, testing without a phone): `docs/CALLS_SETUP.md`.
**No keys or passwords are in this file.** Ask a teammate for the shared ones privately.

---

## 1. What you'll have when you're done

| Address | What it is | Who it's for |
|---|---|---|
| http://localhost:3000/ | Front door: links to sign-up and the console | Everyone |
| http://localhost:3000/register | Public sign-up (saves to Supabase) | Residents |
| http://localhost:3000/console | City Operations: map, pressure, crews, agent (password) | Utility staff |
| http://localhost:3000/console/registrations | Every sign-up, with its address match (password) | Utility staff |
| http://localhost:3000/console/calls | Every call the agent placed and what the household said (password) | Utility staff |
| http://localhost:8080/health | The voice agent (optional, section 6) | Demo calls |

---

## 2. Install once

- [Node.js 20+](https://nodejs.org) and [Git](https://git-scm.com/download/win)
- For the voice agent only: [Python 3.12](https://www.python.org/downloads/) (3.11+ works; 3.10 does not)

```powershell
git clone https://github.com/danishsanwar2008-a11y/freezeline.git
cd freezeline
npm install            # also copies the MapLibre map worker into public/
```

Already cloned? Get the latest instead: `git pull` (and `npm install` again if `package.json` changed).

---

## 3. `.env.local` (your settings file)

```powershell
Copy-Item .env.example .env.local
```

Then fill it in. It is git-ignored: **never commit it, and never paste its values into chats or docs.**

### Shared values (the same for the whole team, ask for them privately)

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Ends at `.supabase.co` (nothing after it) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The **publishable** key (`sb_publishable_...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | The **secret** key (`sb_secret_...`, the one named for teammates). Needed to save sign-ups and load the console |
| `CONSOLE_PASSWORD` | The shared password for `/console` |
| `LLM_PROVIDER` | Keep `pregenerated` (pre-written text, no AI calls, free) |

If you were invited to the Supabase project you can also copy the keys yourself: Project Settings → API Keys.

### Your own values (only for the voice agent, section 6)

| Variable | Notes |
|---|---|
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Your own Twilio account (Console → Account Info) |
| `TWILIO_PHONE_NUMBER` | **Leave empty on a Twilio trial** (see 6.1). Your Twilio number after upgrading |
| `PUBLIC_HOSTNAME` | Your ngrok domain, no `https://` (e.g. `your-name.ngrok-free.dev`) |
| `VOICE_SHARED_SECRET` | Any long random string you make up. Stops strangers placing calls through your account |
| `DEMO_CALL_TO` | Your own phone, `+1XXXXXXXXXX` (the one you signed up to Twilio with) |
| `DEMO_CALL_NAME` | Optional: the first name the demo call greets |
| `VOICE_RESULT_URL` | `http://localhost:3000/api/voice/result` (where the agent saves each call's answers) |
| `WHISPER_MODEL=base`, `VOICE_IDLE_SECONDS=12`, `VOICE_AMD=0` | Keep these defaults |
| `NOMINATIM_USER_AGENT` | Optional: e.g. `FreezeLine/0.1 (team contact)` for the address lookup |

Make a random secret in PowerShell:
```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
```

---

## 4. The database is already set up (don't redo it)

Everyone uses **one shared Supabase project**. Its setup is done:

- SQL already run in the Supabase SQL Editor: `supabase/001_schema.sql` through `supabase/006_voice_calls.sql`
  (005 = address matching for sign-ups, 006 = call records). Saving a script as "Private" in the SQL Editor only hides
  the saved query; the tables exist for everyone.
- Already seeded: 4 areas, 8,034 homes (real OpenStreetMap footprints, simulated details), 20 crews,
  **400 sample sign-ups** (`npm run seed:registrations`: invented names, `example.com` emails,
  fictional 555-01XX numbers) and **36 sample calls** (`npm run seed:calls`).

Re-running a seed is harmless, but there's no need. Check the connection any time:
```powershell
npm run db:status
```

**It's shared:** sign-ups you submit show up for everyone, and a repeated email gets "already signed up".
Only if you ever use your *own* Supabase project: run the SQL files 001 → 006 in order, then
`npm run seed`, `npm run seed:registrations` and `npm run seed:calls`.

---

## 5. Run the web app

```powershell
npm run dev
```

Open http://localhost:3000. Before you push changes: `npm test` and `npm run messages:check`.

### Sign-ups (`/register`)

- Name, email, phone, address (required); an emergency contact (optional); and a **required**
  consent box for texts and calls. The questions about the home (pipes, shutoff, someone home for
  3 days, ...) are asked on the call, not on the form.
- Saved to the `registrations` table. Only the server can read or write it (no public access).
- **Address matching:** the address is looked up with OpenStreetMap (Nominatim; only the address is
  sent) and matched to a mapped home: within 40 m = *matched*, else the nearest mapped home on the same
  street within 250 m = *nearest home on street* (an estimate, shown dashed). Otherwise: no mapped home
  nearby / outside the 4 areas / address not found. Our map has only part of each neighborhood, so
  real addresses often land on an estimate.
- If the lookup failed or was busy, the sign-up still saves as "not looked up yet"; retry with
  `npm run registrations:match`.
- Staff see everything at `/console/registrations` (top bar → **Sign-ups**): counts, match bar,
  All / Real / Sample filter, search, one card per household.

---

## 6. Voice agent: a real call to your own phone

The agent (`voice/`, Python) phones a household, reads the storm facts and its 3 steps, asks the
7 check-in questions and understands spoken answers. The words come only from
`data/messages.json`, and it never says a crew is on the way unless one is assigned.
Answers are saved in Supabase (`voice_calls`) after every answer, so a hang-up keeps what was said,
and officials see them at `/console/calls`.

**No-setup preview** (type the answers yourself):
```powershell
py -3.12 voice\script.py --demo
```

### 6.1 Twilio (free trial)

- Sign up at twilio.com. The trial has **no dollar balance and no phone number of its own**: it
  comes with free units (about 75 voice minutes, 100 texts, for 30 days).
- Trial calls go out from **shared Twilio trial numbers**, and only to the phone you signed up with
  (verified automatically). So `DEMO_CALL_TO` = that phone, and `TWILIO_PHONE_NUMBER` stays **empty**.
- Trial calls must use the turn-by-turn mode (`engine: "gather"`: Twilio speaks each line and
  transcribes your answer). `voice\call-me.ps1` does this for you. The higher-quality mode (Kokoro
  voice over a live audio stream) is blocked on trials and needs an upgraded account.
- Limits: 10 minutes per call, about 75 minutes total, US numbers only.
- **Texts:** the `npm run sms` script and `/api/sms` need `TWILIO_PHONE_NUMBER`, and a trial can only
  send Twilio's fixed message templates, so custom texts need an upgraded account (or another provider).

### 6.2 ngrok (lets Twilio reach your laptop)

- Sign up at ngrok.com and claim your free fixed domain (dashboard → Domains). Put it in `PUBLIC_HOSTNAME`.
- Install: the Microsoft Store, or the zip from ngrok.com/download (`voice\tunnel.ps1` also looks in
  `%LOCALAPPDATA%\ngrok\ngrok.exe`). Then once: `ngrok config add-authtoken <your token>`.
- Each person needs their **own** ngrok domain and Twilio account; never share tokens.

### 6.3 One-time Python setup (Windows, ~10 minutes, ~1 GB)

```powershell
py -3.12 -m venv voice\.venv
voice\.venv\Scripts\python -m pip install -r voice\requirements.txt
```

Download the two Kokoro voice files into `voice\models\` from the kokoro-onnx GitHub release
`model-files-v1.0`: `kokoro-v1.0.onnx` (~325 MB) and `voices-v1.0.bin` (~28 MB). Then:

```powershell
powershell -ExecutionPolicy Bypass -File voice\start.ps1 -Prerender   # turns the fixed lines into audio
powershell -ExecutionPolicy Bypass -File voice\start.ps1 -Check       # should end "All call lines covered."
```

`voice\.venv`, `voice\models` and `voice\audio` are git-ignored: never commit them. The Whisper
speech model downloads itself the first time it's used.

### 6.4 Every demo (three PowerShell windows, from the `freezeline` folder)

```powershell
# 1. The agent (restart it whenever .env.local changes). Wait for "Uvicorn running on ...:8080".
powershell -ExecutionPolicy Bypass -File voice\start.ps1

# 2. The tunnel. Window 1 then prints "[agent] tunnel reachable: ... -> 200".
powershell -ExecutionPolicy Bypass -File voice\tunnel.ps1

# 3. Call your phone.
powershell -ExecutionPolicy Bypass -File voice\call-me.ps1
```

Options for `call-me.ps1`: `-Lang es` (Spanish), `-Crew "Crew 3"` (crew-assigned ending; also say you
can't do the steps), `-Survey` (the pre-storm survey), `-DryRun` (shows the opening, places no call).

On the call: Twilio may play a short trial notice first. FreezeLine greets you by name, asks if it's
you ("yes"), reads the storm facts and 3 steps, then asks 7 questions. Answer naturally; staying
silent ends the call. Window 1 shows each answer as `[agent] heard: '...'`.

### 6.5 Demo call from the website

With `DEMO_CALL_TO` set, the agent and tunnel running (6.4 windows 1 and 2) and `npm run dev`:
open `/console`, pick a storm hour, click **Run agent**. Its last step places a real call to your
phone, standing in for the highest-risk home that hour (that home's real 3 steps and street).
Answer it, then open **Calls** in the top bar: the call appears and its answers fill in live.
Only one demo call at a time; without `DEMO_CALL_TO` the step is skipped.

**macOS/Linux:** `./voice/serve.sh` starts the agent and a free cloudflared tunnel together
(`brew install cloudflared`; it reads `.env` and makes a new tunnel address each run). Full Windows
walkthrough and troubleshooting: `voice/DEMO.md`.

---

## 7. Working together

- **Pull before you start** (`git pull`) and before you push. Small, frequent commits avoid conflicts.
- Never commit: `.env.local` / `.env`, `voice/.venv`, `voice/models`, `voice/audio` (all git-ignored).
- `.claude/launch.json` is a personal setting for Claude's browser preview; leave it out of commits.
- Before pushing: `npm test` and `npm run messages:check`; for voice changes also
  `voice\.venv\Scripts\python voice\script.py --check`.
- The database is shared: test sign-ups are visible to everyone. Use obviously fake test data
  (e.g. `something@example.com`).

---

## 8. If something's wrong

| Symptom | Fix |
|---|---|
| Console says "Couldn't load homes" | Check the Supabase values in `.env.local`, then `npm run db:status` |
| Sign-up says "We couldn't save your sign-up" | `SUPABASE_SERVICE_ROLE_KEY` missing or wrong |
| Sign-ups page asks you to run a SQL file | That migration isn't in the database you're pointed at (section 4) |
| Port 3000 busy | Another `npm run dev` is running; close it or use the port it prints |
| `localhost:4747` errors in the browser console | Harmless: a development-only feedback tool (Agentation) |
| Call script: "The voice agent isn't running" | Start window 1 (`voice\start.ps1`) |
| Twilio error **21219** | That phone isn't verified on the trial (only your signup phone is) |
| Twilio error **21606** | `TWILIO_PHONE_NUMBER` isn't on your account. On a trial, leave it empty |
| Twilio error **20003** | Wrong Account SID or Auth Token |
| Call says "not available on trial accounts" | The call didn't use `engine: "gather"`. Use `call-me.ps1` |
| Call rings but goes silent / tunnel errors | Window 2 isn't running, or `PUBLIC_HOSTNAME` doesn't match your ngrok domain |
| PowerShell won't run the scripts | Keep the `-ExecutionPolicy Bypass` part of the command |
