---
description: Walk the full FreezeLine demo in Chrome, screenshot every step into demo-screens/, and report anything broken, slow, confusing, or showing raw numbers / broken text.
---

# /demo-check

Run the FreezeLine demo end to end like a judge would see it, and report problems. Do not fix anything during the run; collect findings, then report. Read `CLAUDE.md` first.

The console is the only screen (City Operations, officials only). Households are reached only by texts and calls (Phase 4), so there are no homeowner pages to check.

Record timings for every step. Flag anything slower than: page load 5 s, agent run 10 s.

## 0. Setup

1. Read `.env.local` variable **names only** (never print values). Note `LLM_PROVIDER` (default `pregenerated`).
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

## 1. City Operations tab (desktop)

- Open `http://localhost:3000/console` and wait about 8 s for hydration. Check that the top bar shows **City Operations** (no other tabs), the Live/Replay toggle (Replay selected), and an ⓘ tooltip mentioning real OpenStreetMap footprints and simulated household details.
- Check that every home is a dot (gray before outreach), hexes are shaded on the violet need scale with a legend, and the cards read: Ready check, Outreach, Help crews, Water pressure: two futures, Freeze readings, Agent.
- Screenshot `01-city-start`.

## 2. Feb 16 peak

- Move the timeline to **Tue, Feb 16 · 6 AM** (click the track just left of "Feb 16", or call the slider's React `onChange` with 78). Check that the two-futures tiles show red under "Everyone drips" and green under "FreezeLine".
- Screenshot `02-feb16-peak`.

## 3. Run agent (Approve first)

- In the Agent card, pick **Approve first** and click **Run agent**. Approve steps in order (Agent card or Crews panel) until the crew proposals are reached; approve **one** crew from the Crews panel. Time each approval.
- Check that the dots turn green/red/yellow/black, the Ready check headline and stacked bar update, and the funnel shows Texted > Called > Door check. The approved crew appears on the map (numbered marker with a line while heading) and in the Crews panel ("Crew N · Heading to …", then "Helping a home on …").
- Screenshots `03-agent-approve`, `04-city-after-outreach`. Run `npm run db:status -- 2021-02-16T06:00` and compare.

## 4. Red dot → summary card

- Zoom into an area (click a hex) and click a **red** dot. Check that the summary card shows the status tile, level, crew (if any), a third-person assessment ("Needs a crew: …", solid when confirmed), and no link to any homeowner page. Screenshot `05-dot-card`.

## 5. Text quality scan (every page visited)

On City Operations (with the dot card open), collect `document.body.innerText` (for the iframe, use its document) and flag:

- **Raw numbers that shouldn't be shown**: risk scores (a number next to "score", or `\b\d{1,3}\b` right after a home label in lists), percentages, or more than 2 decimals (`\d+\.\d{3,}`). Allowed numbers: temperatures (°F), psi, home counts, home IDs, years built, times and dates.
- **Broken text**: `undefined`, `null`, `NaN`, `[object`, leftover `{slot}` braces, doubled punctuation (`..`, `. .`), "Medium" anywhere (it should say "Watch"), and empty headings or steps.
- **Plurals**: never "1 homes", "1 hours", "1 crews" or "1 calls".
- **Honesty**: sample data is labeled "sample" or "simulated"; no "on the way" without an assigned crew.
- **Audience**: no "you"/"your" on City Operations.

Also note anything **confusing** from a first-time viewer's point of view: unclear labels, a primary action that's hard to find, text cut off at the top of the side panel, overlapping elements, or the Next.js dev badge covering content.

## 6. Report

Reply with:

1. A one-line verdict: **Demo ready** / **Demo ready with issues** / **Not ready**.
2. A table of steps 1–4: ✅/⚠️/❌, time taken, screenshot file.
3. **Broken**, **Slow**, **Confusing**, **Raw numbers / broken text**: each a short list with the page, what was seen, and the screenshot name. Write "None" if empty.
4. DB before → after counts from `db:status`.
5. Leave the dev server running and give the URL. Don't commit `demo-screens/`.

Rules: never print secret values; the agent's Supabase writes are simulated and idempotent, so re-running is safe; do not delete data unless the user asks.
