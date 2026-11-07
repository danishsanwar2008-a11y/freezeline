---
description: Walk the full FreezeLine demo in Chrome, screenshot every step into demo-screens/, and report anything broken, slow, confusing, or showing raw numbers / broken text.
argument-hint: "[home-id]  (default third-ward-0251; photo test always uses third-ward-0110)"
---

# /demo-check

Run the FreezeLine demo end to end like a judge would see it, and report problems. Do not fix anything during the run; collect findings, then report. Read `CLAUDE.md` first.

Demo home: `$ARGUMENTS` if given, else `third-ward-0251` (High, drips the kitchen tap at the peak). Photo test home: always `third-ward-0110` (a Watch home with outdoor faucets), so the demo home's plan is never changed by test photos.

Record timings for every step. Flag anything slower than: page load 5 s, agent run 10 s, photo check 25 s.

## 0. Setup

1. Read `.env.local` variable **names only** (never print values). Note `LLM_PROVIDER` (default `pregenerated`). The photo check only runs when `LLM_PROVIDER` is `gemini` (with `GEMINI_API_KEY`) or `anthropic`. Otherwise mark step 9 as "skipped (provider)".
2. Free port 3000 (PowerShell). `TaskStop` alone leaves the node child holding the port:
   ```powershell
   $p = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
   foreach ($id in $p) { Stop-Process -Id $id -Force -Confirm:$false }
   ```
   Confirm the port is free before continuing.
3. Start `npm run dev -- -p 3000` with `run_in_background: true`. Wait until `curl http://localhost:3000/status` answers, then check `/console` returns 200.
   - If a page returns 500 and the server log shows `FATAL ... Turbopack` / `0xc0000142`, the dev cache is corrupted (usually after a low-memory kill). Stop the server, delete `.next/dev`, and start it again. Note this in the report.
4. Run `npm run db:status -- 2021-02-16T06:00` and keep the numbers ("before").
5. Create `demo-screens/` (it is git-ignored). Name screenshots `NN-step.png`, e.g. `01-console-start.png`.

Screenshots: take them with the Chrome tool's `screenshot` action and `save_to_disk: true`, then copy each saved file into `demo-screens/` with its step name. Use a new tab (`tabs_create_mcp`), never the user's existing tabs. Batch browser actions with `browser_batch`.

## 1. Console, Replay (desktop)

- Open `http://localhost:3000/console`. Wait about 8 s for hydration. If you script the slider, check that the range input has `__reactProps*` keys first.
- Check that the top bar shows **Live forecast | Replay: Winter Storm Uri (Feb 2021)**, with Replay selected, and that the ⓘ tooltip mentions simulated homes.
- Screenshot `01-console-start`.

## 2. Feb 16 peak

- Move the timeline to **Tue, Feb 16 · 6 AM**. Prefer a real click on the timeline just left of the "Feb 16" label. Fall back to calling the slider's React `onChange` with value `78`.
- Check that the side panel shows the comparison card, **Everyone drips: 4 of 4 areas: boil-water notice** (red) vs **FreezeLine plan: All areas safe · lowest 27 psi** (green), then "Send the drip plan to 2,000 homes." and a collapsed "See by area ▾".
- Screenshot `02-feb16-peak`.

## 3. Run agent (Auto)

- In the Agent box, select **Auto** and click **Run agent**. Time it.
- Check: 7 action entries and a footer note; the latest 3 visible and "Show all (N)" works. Every entry is a plain sentence plus a one-sentence reason, and no entry is red or failed.
- Screenshot `03-agent-log`. Click **Show all**, then screenshot `04-agent-log-all`.
- Run `npm run db:status -- 2021-02-16T06:00` and compare with "before". Expected: 2,000 drip plans (1,036 drip), 2,000 queued texts, all simulated, with no duplicates on re-runs. The sample SMS has a `/h/<id>?t=...` link.

## 4. Approve-first (spot check)

- Switch to **Approve first** and click **Run agent**. Check that the first step shows **Approve / Skip** and the next ones say "Waiting for the step above". Approve the first step only.
- Screenshot `05-approve-first`. Switch back to **Auto**.

## 5. Click an area

- Click a hex in the top patch (Houston Heights) or another area. The map should fly in, homes appear as green/yellow/red dots, and the panel shows "N homes · M need action tonight" plus a list with no scores.
- Watch for: the fly-in stopping halfway, missing dots (a depth-test regression), or a list that doesn't scroll.
- Screenshot `06-area`.

## 6. Click a home → plan card

- Click the first home in the list (or a red dot). Check the order: level + one sentence, then "Your 3 steps before 8 PM" with 3 numbered steps, then the house diagram, then "Why?" (collapsed), then "← Back to map" and "Open homeowner page ↗".
- Screenshot `07-plan-card`. Open "Why?" and screenshot `08-plan-why`.

## 7. Homeowner page (phone width)

- The browser window can't be resized here. Load the page inside an iframe at phone width on a same-origin page:
  ```js
  document.body.innerHTML = '<iframe id=f src="/h/<home>?t=2021-02-16T06:00" style="width:390px;height:570px;border:0;display:block;margin:auto"></iframe>'
  ```
  Run this from `http://localhost:3000/status`. Read content through `document.getElementById('f').contentDocument`.
- Check: the headline starts with **HIGH:**, the 3 steps match the console plan card (same tap), the freeze clock reads "...at risk around <time>.", and "A pipe burst" opens 5 shut-off steps. The photo card appears only if the provider supports it.
- Screenshot `09-homeowner-en` (top), then scroll and screenshot `10-homeowner-en-bottom` (clock, burst steps, diagram).
- Also confirm the console's "Open homeowner page ↗" link points to the same home and hour.

## 8. Spanish

- Click **Español** (or load `&lang=es`). Check that the headline starts **ALTO:** and that the steps, freeze clock, burst steps, labels, date line ("Repetición ... a. m.") and "Casa NNNN" are all Spanish.
- Screenshot `11-homeowner-es`.

## 9. Photo check (if the provider allows)

- Use home `third-ward-0110`. Free-tier Gemini can take far longer than the browser tool's 45 s script limit. **Never `await` the photo call inside one `javascript_exec`.** Start it in the page, then poll:
  ```js
  window.photoResults = {}; (async () => { for (const k of ['covered','dark']) { const t0 = performance.now(); const r = await fetch('/api/photo-check', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ homeId:'third-ward-0110', image: drawFaucet(k) }) }); window.photoResults[k] = { http: r.status, ms: Math.round(performance.now()-t0), ...(await r.json()) }; } window.photoResults.done = true; })();
  ```
  Here `drawFaucet(kind)` draws on an 800×600 canvas and returns JPEG base64 (strip the `data:` prefix):
  - `covered`: a brick wall with a large off-white foam dome over a faucet.
  - `dark`: a solid black image.
- Poll `window.photoResults.done` with short `javascript_exec` calls, or watch the dev-server log for `POST /api/photo-check`.
- Expected: `dark` gives `unclear`. `covered` should give `covered`, though `unclear` for a drawing is acceptable. Record the times.
- Reload `/h/third-ward-0110?t=2021-02-16T06:00`. Check that the photo status line and the "Why?" photo reason match the latest result (covered drops the cover-faucet step; unclear keeps it).
- Screenshot `12-photo-result`.
- Note in the report that a real phone photo is still the true test.

## 10. Text quality scan (every page visited)

On each page (console city / area / plan card, homeowner EN and ES), collect `document.body.innerText` (for the iframe, use its document) and flag:

- **Raw numbers that shouldn't be shown**: risk scores (a number next to "score", or `\b\d{1,3}\b` right after a home label in lists), percentages, or more than 2 decimals (`\d+\.\d{3,}`). Allowed numbers: temperatures (°F), psi, home counts, home IDs, years built, times and dates.
- **Broken text**: `undefined`, `null`, `NaN`, `[object`, leftover `{slot}` braces, doubled punctuation (`..`, `. .`), "Medium" anywhere (it should say "Watch"), and empty headings or steps.
- **Wrong language**: obvious English words on the Spanish page (Your, Steps, Drip, Home, Replay, AM/PM), and Spanish on the English page.
- **Honesty**: every SMS and the homeowner page say "simulated"/"Simulated demo"; there are no invented promises (e.g. "we will send a plumber").

Also note anything **confusing** from a first-time viewer's point of view: unclear labels, a primary action that's hard to find, text cut off at the top of the side panel, overlapping elements, or the Next.js dev badge covering content.

## 11. Report

Reply with:

1. A one-line verdict: **Demo ready** / **Demo ready with issues** / **Not ready**.
2. A table of steps 1–9: ✅/⚠️/❌, time taken, screenshot file.
3. **Broken**, **Slow**, **Confusing**, **Raw numbers / broken text**: each a short list with the page, what was seen, and the screenshot name. Write "None" if empty.
4. DB before → after counts from `db:status`.
5. Leave the dev server running and give the URL. Don't commit `demo-screens/`.

Rules: never print secret values; the agent's Supabase writes are simulated and idempotent, so re-running is safe; do not delete data unless the user asks.
