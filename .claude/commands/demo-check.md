---
description: Walk the full FreezeLine demo in Chrome, screenshot every step into demo-screens/, and report anything broken, slow, confusing, or showing raw numbers / broken text.
---

# /demo-check

Run the FreezeLine demo end to end like a judge would see it, and report problems. Do not fix anything during the run; collect findings, then report. Read `CLAUDE.md` first.

The console is the only screen (City Operations, officials only). Households are reached only by texts and calls (Phase 4), so there are no homeowner pages to check.

Record timings for every step. Flag anything slower than: page load 5 s, agent run 10 s.

## 0. Setup

1. Read `.env.local` variable **names only** (never print values). Note `LLM_PROVIDER` (default `pregenerated`). `CONSOLE_PASSWORD` must be set: the console is password-protected.
2. Free port 3000 (PowerShell). `TaskStop` alone leaves the node child holding the port:
   ```powershell
   $p = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
   foreach ($id in $p) { Stop-Process -Id $id -Force -Confirm:$false }
   ```
   Confirm the port is free before continuing.
3. Start `npm run dev -- -p 3000` with `run_in_background: true`. Wait until `curl http://localhost:3000/login` answers 200. Signed out, check that `/console` and `/status` redirect (307) to `/login?next=…` and `/api/ops?time=2021-02-16T06:00` returns 401.
   - If a page returns 500 and the server log shows `FATAL ... Turbopack` / `0xc0000142`, the dev cache is corrupted (usually after a low-memory kill). Stop the server, delete `.next/dev`, and start it again. Note this in the report.
4. Run `npm run db:status -- 2021-02-16T06:00` and keep the numbers ("before").
5. **Sign in without ever printing the password.** Either type it into the `/login` form in the browser yourself from `.env.local` (never echo it), or make a session cookie locally with a throwaway script that imports `newSession()` from `src/lib/server/consoleAuth.ts` (after loading `.env.local` with dotenv) and writes it to a file in the scratchpad; set it in the browser as the httpOnly cookie `fl_console` on `localhost`, then delete the file at the end. Screenshot `/login` signed out as `00-login`.
6. Create `demo-screens/` (it is git-ignored). Name screenshots `NN-step.png`, e.g. `01-console-start.png`.

Screenshots: take them with the Chrome tool's `screenshot` action and `save_to_disk: true`, then copy each saved file into `demo-screens/` with its step name. Use a new tab (`tabs_create_mcp`), never the user's existing tabs. Batch browser actions with `browser_batch`.

## 1. City Operations (desktop, 1440 × 900)

- Open `http://localhost:3000/console` and wait about 8 s for hydration. The layout (Phase 3.7, DESIGN.md §5): a Midnight Navy top bar; the light map fills the window; separate navy boxes float over it.
- **Top bar:** FreezeLine · **City Operations**, **Run agent** (always Auto; no mode switch), the **Winter Storm Uri** label (a label, not a toggle; no Live mode), Sign-ups, ⓘ (mentions real OpenStreetMap footprints and streets, simulated household details and crews), Sign out, **Hide panels**.
- **Left (slightly see-through):** **Map key**: 4 blue steps, darker = more homes need action (Under 25% / 25–49% / 50–74% / 75–100%), plus "Help crew" (dot) and "Route to a home" (line); no house dot colors. **Homes contacted (sample)**: headline "N homes contacted", a stacked status bar, the key with counts (Ready, Waiting on reply, Needs help, No answer, Not contacted yet) adding up to the homes, and Texted → Called → Door check tiles.
- **Right (solid):** **Water pressure by area**, **Crews (sample)** with an area picker, **Decision trace**. **Bottom:** the storm replay timeline with this hour's readings (now, feels like, wind, hours below 20°F).
- **Collapse:** each box's chevron folds it to its title and opens it again; **Hide panels** leaves only the map and the timeline; both are remembered on reload in the same tab. Screenshot `01b-panels-hidden`, then show them again.
- Every home is a dot (gray before outreach). Screenshot `01-city-start`.

## 2. Feb 16 peak

- Move the timeline to **Tue, Feb 16 · 6 AM** (click the track just left of "Feb 16", or set the range input to 78 and fire `input`). In **Water pressure by area** check: one compact row per area; the psi number is neutral above 25 and amber 20–25 / red below 20, with a band label; each small chart shows the past 12 hours solid, the next 12 dashed, and the 25 and 20 psi lines (named once in the legend under the list); Third Ward is at about 24.6 psi with the "Run the agent to prepare a Stage 2 alert" note; the "Simplified model ⓘ" tooltip mentions the utility's own sensors; **Model notes · compare if everyone drips** is collapsed and, opened, shows the dripping assumption and areas below 20 psi.
- Hover a map cell between dots: the **Why this shade?** tooltip shows "% need action · n of N homes", a bar, and 2 reasons tagged "real weather" and "simulated". Screenshot `02b-hex-tooltip`.
- Screenshot `02-feb16-peak`.

## 3. Run agent

- Click **Run agent** in the top bar. Time it. The **Decision trace** scrolls into view and fills **live**: a progress strip ("Step 4 of 13"), the running step pulsing ("Publishing the drip plan…"), then a dot per step: Read the storm and risk (°F · High / Watch homes), Read pressure in 4 areas (lowest psi · area), Checked crews, the drip plan, **Queued texts by area** (folded; click "5 steps" to open), Ran outreach, Read replies from households, **Assigned crews** (folded), the log.
- **Stage 2:** the trace ends at **Waiting for supervisor approval** for Third Ward ("kitchen tap only at 281 homes → stays at 27 psi") with **Approve / Not yet**, in Auto too. The Third Ward pressure row shows a **Stage 2 pending** tag. Click **Not yet** in the walkthrough (the tag becomes "Stage 2 not sent"; approving queues simulated texts and is safe and idempotent if you want to test it). Screenshot `03b-stage2`.
- **Also notified:** under the trace, maintenance contractors, the water utility control room, city officials and the mayor's office, each with this run's numbers, the block tagged **simulated · nothing is sent**.
- Check that the dots turn green/red/yellow/black and Homes contacted updates. Screenshot `03-agent-auto`.
- Run `npm run db:status -- 2021-02-16T06:00` and compare.

## 4. Crews on real streets

- In **Crews (sample)**, hover (or click) the area button: a menu of the 4 areas, each "n/5 busy". Pick each area in turn; the list shows that area's 5 crews ("Crew N · ~X min to <street>", "Helping a home on …" or "On standby"). Screenshot `04-crews-menu`.
- On the map, a crew heading to a home drives along **real streets** (a blue route line, not a straight line through houses), moving on the simulated clock (1 min = 2 s). Hover the crew dot: "Crew N · ~X min to <street> (simulated)". If every crew is already on site at 6 AM, use Feb 16 · 4 AM after a run. Screenshot `04b-crew-route`.
- Click a crew dot (or its row): a **quick view** grows out of the crew and stays on it while the map pans: distance, arrives in / on site, from, the household's needs, "route on real streets (simulated timing)". Screenshot `04c-crew-quickview`.

## 5. Cell → house quick view

- Click a cell: the map flies into it and the cells fade so streets and houses show through. Click a **red** dot: a small zoom-in, and a **quick view grows out of the dot** with a tail pointing at it: street and area ("household details simulated"), one line on what's happening (solid when confirmed, dashed when estimated), Status and Level tiles, the assessment ("Needs a crew: …"), and no link to any homeowner page. Escape or × closes it. Screenshot `05-house-quickview`.

## 6. Narrow width (768 × 1024)

- Resize to 768 wide: the map is on top with the timeline along its bottom edge; every box stacks underneath at full width (map key first); nothing is cut off and there is no sideways scroll. Screenshot `06-tablet`.

## 7. Text quality scan (every page visited)

On City Operations (with the house quick view open and after a run), collect `document.body.innerText` and flag:

- **Raw numbers that shouldn't be shown**: risk scores (a number next to "score", or `\b\d{1,3}\b` right after a home label in lists), percentages, or more than 2 decimals (`\d+\.\d{3,}`). Allowed numbers: temperatures (°F), psi, home counts, home IDs, years built, times and dates.
- **Broken text**: `undefined`, `null`, `NaN`, `[object`, leftover `{slot}` braces, doubled punctuation (`..`, `. .`), "Medium" anywhere (it should say "Watch"), and empty headings or steps.
- **Plurals**: never "1 homes", "1 hours", "1 crews" or "1 calls".
- **Honesty**: sample data is labeled "sample" or "simulated"; no "on the way" without an assigned crew.
- **Audience**: no "you"/"your" on City Operations.

Also note anything **confusing** from a first-time viewer's point of view: unclear labels, a primary action that's hard to find, text cut off in a box, a box covering the timeline or another box, overlapping elements, or the Next.js dev badge covering content.

## 8. Report

Reply with:

1. A one-line verdict: **Demo ready** / **Demo ready with issues** / **Not ready**.
2. A table of steps 1–6: ✅/⚠️/❌, time taken, screenshot file.
3. **Broken**, **Slow**, **Confusing**, **Raw numbers / broken text**: each a short list with the page, what was seen, and the screenshot name. Write "None" if empty.
4. DB before → after counts from `db:status`.
5. Leave the dev server running and give the URL. Don't commit `demo-screens/`.

Rules: never print secret values; the agent's Supabase writes are simulated and idempotent, so re-running is safe; do not delete data unless the user asks.
