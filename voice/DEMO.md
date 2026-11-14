# Demo a FreezeLine call (Windows)

Two ways to try it. Run every command from the repo root (the `freezeline` folder).
On macOS/Linux, `./voice/serve.sh` starts the agent and a cloudflared tunnel in one command instead.
Calls placed by the web app (Run agent, section C) save their answers in Supabase (`voice_calls`) and
show on `/console/calls`; `call-me.ps1` test calls only print in the agent's window.

## A. Typed call, no setup (1 minute)

Plays the whole conversation in the terminal; you type the household's answers.

```powershell
py -3.12 voice\script.py --demo
py -3.12 voice\script.py --demo --lang es --level High --temp 19 --hours 6
```

## B. A real phone call to your own phone

### One-time setup

```powershell
py -3.12 -m venv voice\.venv
voice\.venv\Scripts\python -m pip install -r voice\requirements.txt
# Kokoro voice files -> voice\models\ (github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0):
#   kokoro-v1.0.onnx, voices-v1.0.bin
powershell -ExecutionPolicy Bypass -File voice\start.ps1 -Prerender   # turn the fixed lines into audio
```

- **Twilio** (twilio.com, free trial): Console → Account Info has the Account SID and Auth Token.
  A trial comes with free units (about 75 voice minutes) instead of a dollar balance and **no phone
  number of its own**: calls go out from shared Twilio trial numbers, and only to the phone you
  signed up with (it is verified automatically). Leave `TWILIO_PHONE_NUMBER` empty on a trial.
  After upgrading, buy a number and put it in `TWILIO_PHONE_NUMBER`.
- **ngrok** (ngrok.com): install it (ngrok.com/download), then once:
  `ngrok config add-authtoken <your token>`. Your dashboard (Domains) shows your free fixed
  domain, e.g. `your-name.ngrok-free.dev`.
- **`.env.local`** (never committed):
  ```
  TWILIO_ACCOUNT_SID=AC...
  TWILIO_AUTH_TOKEN=...
  TWILIO_PHONE_NUMBER=                 # empty on a trial; your own Twilio number after upgrading
  PUBLIC_HOSTNAME=your-name.ngrok-free.dev   # no https://
  DEMO_CALL_TO=+1...                   # your own phone (the one you signed up to Twilio with)
  DEMO_CALL_NAME=YourFirstName         # optional: the greeting name
  VOICE_SHARED_SECRET=<long random string>   # stops strangers placing calls through your account
  WHISPER_MODEL=base
  VOICE_IDLE_SECONDS=12
  VOICE_AMD=0
  ```

### Every demo: three terminals

**Terminal 1, the agent** (restart it whenever `.env.local` changes):
```powershell
powershell -ExecutionPolicy Bypass -File voice\start.ps1
```
Wait for `Uvicorn running on http://0.0.0.0:8080`.

**Terminal 2, the tunnel:**
```powershell
powershell -ExecutionPolicy Bypass -File voice\tunnel.ps1
```
Terminal 1 then prints `[agent] tunnel reachable: ... -> 200` (or check https://your-name.ngrok-free.dev/health).

**Terminal 3, place the call:**
```powershell
powershell -ExecutionPolicy Bypass -File voice\call-me.ps1            # add -Lang es, -Crew "Crew 3", -Survey, or -DryRun (no call)
```
With `TWILIO_PHONE_NUMBER` empty it asks Twilio directly (trial mode); with a number set it goes
through the agent's `/make-call`. Each call uses trial minutes (10 min max per call).

Or by hand through the agent (upgraded accounts only, since it needs `TWILIO_PHONE_NUMBER`):
```powershell
$secret = (Select-String -Path .env.local -Pattern '^VOICE_SHARED_SECRET=(.+)$').Matches[0].Groups[1].Value
$body = @{
  to   = "+1YOURNUMBER"
  home = @{
    engine = "gather"     # required on a Twilio trial (the media-stream path needs a paid account)
    home_id = "heights-w589054579"; lang = "en"; level = "High"; temp = 19; hours = 6; faucet = $true
    first_name = "Maria"; street = "Harvard St"
    steps = @("Find your main water shutoff.", "Cover your outdoor faucet.", "Drip only your kitchen tap.")
  }
} | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Post -Uri http://localhost:8080/make-call -Headers @{ "x-voice-secret" = $secret } -ContentType "application/json" -Body $body
```
It answers with a call `sid` and `status: queued`. Your phone rings within a few seconds.

### On the call

1. A trial call starts with Twilio's own short notice; press any key if it asks.
2. FreezeLine greets you by name about your street and asks whether it's you. Say "yes".
3. It reads the storm facts and 3 steps, then asks 7 questions one at a time. Answer naturally
   ("yes, it's in the garage", "no, I live with my family"). Staying silent ends the call.
4. Terminal 1 prints each answer as `[agent] heard: '...'` and, at the end, `[agent] call finished: {...}`.

Things to try: `lang = "es"` (Spanish), `crew = "Crew 3"` plus saying you can't do the steps
(the "crew assigned" ending), or `mode = "survey"` (the pre-storm survey instead of the storm call).

## C. Demo call from the website (answers saved to Supabase)

1. `.env.local` also needs `DEMO_CALL_TO`, `VOICE_SHARED_SECRET` and
   `VOICE_RESULT_URL=http://localhost:3000/api/voice/result`; restart window 1 after adding them.
2. Windows 1 and 2 running, plus `npm run dev`.
3. `/console` → pick a storm hour → **Run agent**. The last step in the decision trace says
   "Demo call placed". Answer your phone.
4. Top bar → **Calls**: the call shows its status and fills in each answer as you give it.

### If it doesn't work

- Twilio error codes: **21219** = that phone isn't verified on the trial (only your signup phone is);
  **21606** = `TWILIO_PHONE_NUMBER` isn't a number on your account (on a trial, leave it empty);
  **20003** = wrong SID or token.
- Hanging up early: the agent's window shows the answers heard so far, with no `call finished` line.
- The call connects and says "not available on trial accounts": `engine = "gather"` is missing.
- Changed `.env.local`? Stop terminal 1 (Ctrl+C) and start it again.
