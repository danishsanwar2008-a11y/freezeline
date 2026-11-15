# Saved calls: how it works and how to test it

How FreezeLine saves what a household says on a phone call to Supabase, places a demo call when
**Run agent** runs, and shows the results on the **Calls** page. Last updated Nov 14, 2026.

New to the project? Do `docs/TEAMMATE_SETUP.md` first (install, `.env.local`, running the app).
**No keys or passwords are in this file.**

---

## 1. What it does

```
Run agent (on /console)
  └─ last step: demo call ──► Twilio rings YOUR phone ──► voice agent asks the questions
                                                             │ after every answer
                                                             ▼
                              /api/voice/result  ──►  Supabase  voice_calls
                                                             │
                              /console/calls  ◄──────────────┘  (refreshes itself while a call is live)
```

- **Demo call:** your own phone stands in for the highest-risk home at that storm hour. It's the
  pre-survey call from the research doc: the 7 questions first, then the home's priority (Low /
  Medium / High, from the weighted answers and the forecast), then what happens next (a neighbor or
  the emergency contact, then a crew), then the text for that priority. Off unless you set
  `DEMO_CALL_TO`. From the terminal: `npm run call:me` (`-- --temp 25` for another forecast).
- **Saved after every answer**, so a hang-up keeps what was said. Questions never reached are stored
  as "not answered", not as "No". The outcome (Ready / Needs a reminder / Needs a crew) is only set
  once the call reaches its end.
- **Honesty rule holds:** a household that can't do the steps hears "I'm requesting a crew", never
  "a crew is on the way".
- **Can't reach the water shutoff:** the agent asks "Is there a neighbor who can help you? I can call
  your emergency contact, Sam" (only if your `/register` sign-up has an emergency contact). Yes → right
  after the call it phones Sam ("can you go over and help them?"); Sam says yes → Sam gets your address
  by text. Sam says no, doesn't answer or hangs up, or you said no → the nearest free crew in your area
  is assigned (it shows on the map at Feb 16, 12 PM) and only then does the call or text say it's on
  the way. Needs `supabase/008_call_followup.sql`. On a Twilio trial Sam's phone must be verified too,
  and `EMERGENCY_CALL_FROM` = the trial number Twilio pairs with it.
- **Texts through Photon (free):** `SMS_PROVIDER=photon` sends every text as an iMessage from Photon's shared iMessage line (`src/lib/photonSms.ts`). A shared line can only reply: text the agent's number once from the demo phone first. Needs `PHOTON_PROJECT_ID` and `PHOTON_API_KEY` (project:read + project:write).
- **Text after the call:** a pre-survey call gets the research doc's text for its priority row plus
  one line for who helps next. A storm call (the older script) gets its 3 steps plus one line for how it ended ("before 8 PM", "you're all set", or "we're requesting a
  crew"; never "a crew is on the way"). It goes through `SMS_PROVIDER` (`textbee` = an Android phone's
  SIM, so it comes from that phone's number; `twilio` needs an upgraded account with a registered
  number). Run `supabase/007_call_texts.sql` once so each text is recorded and never sent twice.
  Test without a phone call: `npm run calls:rehearse -- --text` (texts `DEMO_CALL_TO`).
- **Calls page** (`/console/calls`, top bar → **Calls**, password-protected): outcome bar, filter
  (All / Demo calls / Sample), one card per call with the answers as tiles and the full transcript.
- **Sample data:** 36 simulated calls over 3 storm hours (fictional 555-01XX numbers, tagged "sample").

---

## 2. What's already done in Supabase (shared project)

- `supabase/006_voice_calls.sql` has been run: the `voice_calls` table exists. No public access;
  only the server and scripts (with the secret key) read or write it.
- The 60 sample calls are loaded (`npm run seed:calls`).

You don't need to run either again. Only on your **own** Supabase project: run the SQL files
001 → 006 in order, then `npm run seed`, `npm run seed:registrations`, `npm run seed:calls`.

---

## 3. Your `.env.local`

On top of the values from `docs/TEAMMATE_SETUP.md` (Supabase keys, console password):

| Variable | Value | Needed for |
|---|---|---|
| `VOICE_SHARED_SECRET` | Any long random string you make up | Everything below: the agent proves it's the agent when saving |
| `VOICE_RESULT_URL` | `http://localhost:3000/api/voice/result` | The agent saving answers |
| `WHISPER_MODEL` | `base` | The agent |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | From your own Twilio account | Real phone calls only |
| `TWILIO_PHONE_NUMBER` | The number calls come **from**, never your own phone. Older trials: empty. Newer trials pair your phone with one trial number (Console → Voice → Try it out shows it); put that here | Real phone calls only |
| `PUBLIC_HOSTNAME` | Your ngrok domain, no `https://` | Real phone calls only |
| `DEMO_CALL_TO` | Your phone, `+1XXXXXXXXXX` (on a trial: the one you signed up to Twilio with) | Demo call from Run agent |
| `DEMO_CALL_NAME` | Your first name (optional) | The greeting |

Make a random secret in PowerShell:
```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
```

The voice agent reads `.env.local` only when it starts: **restart it after any change.**

---

## 4. Test it: three levels

### Level 1: just look (1 minute, nothing to set up)

`npm run dev` → http://localhost:3000/console → sign in → top bar **Calls**. You'll see the 36 sample
calls (and any demo calls teammates made, since the database is shared).

### Level 2: a full call without a phone (no Twilio, no ngrok)

Tests the whole save path: the agent hears answers, posts them, the web app saves them.

1. One-time voice setup (Python, ~1 GB): `docs/TEAMMATE_SETUP.md` section 6.3.
2. `.env.local`: `VOICE_SHARED_SECRET`, `VOICE_RESULT_URL`, `WHISPER_MODEL=base`.
3. Window 1: `npm run dev`
4. Window 2: `powershell -ExecutionPolicy Bypass -File voice\start.ps1` (wait for "Uvicorn running")
5. Window 3:
   ```powershell
   npm run calls:rehearse                    # full call -> "Needs a reminder"
   npm run calls:rehearse -- --crew          # can't do the steps -> "Needs a crew" (crew *requested*)
   npm run calls:rehearse -- --survey        # the pre-survey call: 7 questions -> High; can't reach the shutoff, no contact on file -> a crew
   npm run calls:rehearse -- --survey --neighbor yes   # ... "call my emergency contact" (none on a 555 number -> a crew instead)
   npm run calls:rehearse -- --survey --neighbor no    # ... no neighbor -> a crew assigned during the call
   npm run calls:rehearse -- --hangup 3      # hangs up after 3 answers -> 3 answers saved, not finished
   npm run calls:rehearse -- --keep          # keep the row so it shows on /console/calls
   ```
   It prints the conversation and then exactly what was saved in Supabase. Without `--keep` it
   deletes its test row afterwards.

### Level 3: a real demo call to your phone (from the website)

1. Everything from Level 2, plus Twilio and ngrok (`docs/TEAMMATE_SETUP.md` 6.1–6.2) and the
   `.env.local` rows marked "Real phone calls" / "Demo call" above.
2. Window 2: the agent. Window 4: `powershell -ExecutionPolicy Bypass -File voice\tunnel.ps1`.
   The agent's window then prints `[agent] tunnel reachable ... -> 200`.
3. http://localhost:3000/console → move the timeline to a cold hour (e.g. **Feb 16**) → **Run agent**.
   The last step in the decision trace says **"Demo call placed: the demo phone stands in for the … home"**.
4. Answer your phone. Twilio plays a short trial notice, then FreezeLine greets you by name and asks
   the questions. Answer naturally.
5. Top bar → **Calls** → **Demo calls**: the call shows "On the call" and fills in each answer as you
   speak; when it ends it shows the outcome and the call length.

Only one demo call can be live at a time (a second Run agent click won't ring you twice).
Without `DEMO_CALL_TO`, the demo step is skipped and nothing else changes.

**macOS/Linux:** use `./voice/serve.sh` instead of windows 2 and 4 (it starts the agent and a
cloudflared tunnel and sets `PUBLIC_HOSTNAME` itself; it reads `.env`, so copy the voice values there).

---

## 5. Where the code is

| Piece | File |
|---|---|
| Table (status, answers, transcript, outcome) | `supabase/006_voice_calls.sql` |
| Report format, Twilio status mapping, wording (pure, tested) | `src/lib/voiceCalls.ts`, `voiceCalls.test.ts` |
| Saves the agent's reports (secret-protected, out-of-order safe) | `src/app/api/voice/result/route.ts` |
| Places the demo call; syncs call status from Twilio | `src/lib/server/demoCall.ts` |
| Demo call as the last step of Run agent | `src/lib/server/agent/run.ts` (`demoCallStep`) |
| Calls page; live refresh | `src/app/console/calls/page.tsx`, `src/components/console/LiveRefresh.tsx` |
| Agent: posts a report after every answer, in order | `voice/agent.py` (`report`, `_report_turn`, `report_queue`) |
| Sample calls; seed; no-phone rehearsal | `src/lib/seed/calls.ts`, `scripts/seed-calls.ts`, `scripts/rehearse-call.ts` |

---

## 6. If something's wrong

| Symptom | Fix |
|---|---|
| Calls page asks you to run a SQL file | `voice_calls` isn't in the database you point at: run `supabase/006_voice_calls.sql` |
| Rehearsal: "Nothing was saved" | Agent missing `VOICE_RESULT_URL` / `VOICE_SHARED_SECRET` (restart it after adding), or `npm run dev` isn't running |
| Agent log: `could not post result: 403` | `VOICE_SHARED_SECRET` differs between the agent and the web app (same `.env.local`, restart both) |
| Decision trace: "Demo call off: set …" | Add the named values to `.env.local`, restart `npm run dev` |
| Decision trace: "voice agent isn't reachable" | Start the agent (window 2) and the tunnel (window 4); check `PUBLIC_HOSTNAME` |
| Decision trace: "No home needs action this hour" | Pick a colder storm hour on the timeline (Feb 15–16) |
| Twilio error **573003** / **573002** ("from number isn't assigned to this verified voice recipient") | Your trial pairs your phone with one trial number: put it in `TWILIO_PHONE_NUMBER` (Console → Voice → Try it out). Your own phone goes in `DEMO_CALL_TO` |
| Twilio error **21219** / **21606** / **20003** | Phone not verified on the trial / `TWILIO_PHONE_NUMBER` not yours (leave empty on a trial) / wrong SID or token |
| Call stays "On the call" after hanging up | It updates from Twilio when the Calls page loads; reload it |
