# FreezeLine: full project context

Last updated: Nov 10, 2026. For teammates and for Claude Code.

- **CLAUDE.md** holds the rules Claude Code follows every session. Keep it short.
- **This file** holds the history: what FreezeLine is, every decision and why, every Claude Code prompt we ran (verbatim), the math, setup problems and fixes, research, and what's next. Read it when you need the "why."
- **No keys or passwords are ever written here.** They live only in each person's `.env.local`.

---

## 0. Where we are right now

- **Built and committed:** Phases 1A, 1B, 2, 2B, the polish pass, 3, the "no paid API" change, and 3.5 (with walkthrough fixes). 93 tests pass.
- **Data:** 8,034 real house footprints from OpenStreetMap (Heights 2,310 · Montrose 2,275 · Third Ward 1,898 · Meyerland 1,551). Everything about each household is simulated and labeled that way.
- **Repo:** private GitHub repo `danishsanwar2008-a11y/freezeline`, branch `master`. Rule: push to GitHub after each phase is committed.
- **Next:** Phase 3.6 (City Operations only, prompt in §7). Then Phase 4 is **rewritten** around SMS + calls and the three-stage alerts (§4), plus a separate sign-up and home survey page. Then Phases 5–7.

---

## 1. The product

**Problem.** Winter Storm Uri, Feb 2021. On Feb 17 Houston told residents: "Please do NOT drip faucets, this will cause lower water pressure to our City." The standard advice everywhere else is to drip. One message for everyone backfires. About 1 in 4 Houston water customers had a leak.

**Differentiator.** A coordinated, house-by-house drip plan: who drips, which faucet, and who must NOT drip, so at-risk homes are protected **and** water pressure stays above 20 psi. (TCEQ lists pressure below 20 psi as a condition that can require a boil-water notice.) Plus proactive outreach before the freeze, and help crews for people who can't do the steps themselves.

**vs ChatGPT (judges will ask).** ChatGPT gives the same advice to everyone, and when everyone follows it, that is the problem.
> 10-second answer: "ChatGPT tells everyone to drip. When everyone drips, the city loses water pressure — that's what happened in Houston in 2021. FreezeLine tells each house whether to drip, calls the people who'd never ask, and sends help to the ones who can't do it themselves."

**Honesty rule (enforced in code).** Never say a crew is on the way until one is actually assigned. Never say "your pipes will be fine/safe." Never say dripping or open cabinets *prevent* freezing; say they *lower the risk*. Crew sentences come only from fixed templates picked by real state. Until a crew is assigned: "I've requested a crew. I'll text you as soon as one is assigned."

**Why neighbors can get different instructions.** Water pressure is shared, so an area can only afford a limited number of dripping homes. FreezeLine gives those drips to the homes where dripping helps most: homes whose pipes are most exposed to cold air (for example pier-and-beam homes with pipes in an open crawlspace, vs slab homes whose pipes are inside or under concrete). Today these home details are **simulated**; the planned home survey replaces the guesses with homeowners' own answers ("the survey turns an estimate into a fact"). The hex shading is only a map summary; instructions are decided per house.

---

## 2. Who uses it

| Who | Role | How they use FreezeLine |
|---|---|---|
| Water utility supervisor | Operator | The console: map, pressure, crews, approves every Stage 2 alert |
| Mayor / city | Buyer | Sends the city-wide "sign up for FreezeLine" alert before a storm; sees the console |
| Homeowners and residents | Reached by the agent | Sign-up page + home survey; then only texts and calls. They never see the console |
| Insurers (open question) | Discussed, not decided | Area-level alerts only (pressure, % at risk, losses avoided). **Never individual household data** |

Contact and consent (from the Nov 7 council review): automated texts and AI-voice calls need prior consent, so the sign-up page with a consent checkbox is required. Phone numbers don't map to houses, so sign-up needs an address **or** the water-bill account number (the utility already knows the address). Utility account holders include renters.

---

## 3. Structure

### After Phase 3.6 (planned)
- **`/console` → City Operations is the only screen** (officials only, password-protected). Map with every home as a status dot, hexes shaded violet by % of homes needing action tonight, one legend (top left) for hex shading + dot colors + crew marker, Ready check, outreach funnel (Texted → Called → Door check), pressure monitor with Stage 2 alert card, 20 crews (5 per area) with distance and arrival time in the sidebar, freeze readings, Run agent, Auto / Approve-first, agent log.
- **Removed:** the Homeowner tab and the `/h/[homeId]` pages (house diagram, "Storm in your area," call transcript view). Shared logic for Phase 4 (planner output, message and call-script libraries, honesty guard) stays.
- **Later:** a separate homeowner sign-up + home survey page.

### Phase 3.5 (built, for history)
`/console` had two tabs, City Operations and Homeowner; `/h/[homeId]` was the household's own page (Your home + Storm in your area). The agent asked 7 household questions with seeded sample answers: Can you do the 3 steps yourself? Is anyone elderly, disabled, or unable to go outside? Does anyone live alone? Do you know where your main water shutoff is? Is your outdoor faucet covered? Do you have heat right now, or is the power out? Is there a neighbor who might need a check? → assessment Ready / Needs reminder / Needs a crew, with reason and confirmed vs estimated. Crews only for confirmed "needs a crew" homes, highest risk first; official approves (Auto / Approve-first); no-answer homes → door check; named neighbors move up the call list.

Phase 3.5 walkthrough result (Feb 16, 6 AM, Auto): 3,046 of 8,022 homes ready, 680 need help, 1,028 no answer, 3,268 not replied; exactly 8,022 queued texts, no duplicates. Bugs found at real-city size and fixed (commit `266eb97`): outreach marked homes "texted" when no text was queued; the Watch texting step hit a 2,000 cap with raw error text; the log claimed texts were queued when that step failed.

---

## 4. Homeowner journey (planned: Phase 4 and the sign-up page)

**Before the storm:** the city sends a wide alert asking residents to sign up. Sign-up asks for first and last name, phone number, address or water-bill account number, and consent to texts/calls. A short home survey (where pipes run, sink on an outside wall, outdoor faucets, etc.) comes after; questions not written yet.

**Channel:** SMS via Twilio (iMessage has no API) and voice calls via ElevenLabs over Twilio. Text first; call people who don't reply or who are flagged vulnerable (calls use limited ElevenLabs minutes).

### Three-stage alerts
**Stage 1 — before the freeze (the most important text)**
> FreezeLine (Houston Water): Hard freeze tonight. 1) Find your main water shutoff now (garage, near water heater, or where the pipe enters the house). 2) Cover your outdoor faucet. 3) Drip ONLY your kitchen tap. Your street is on a drip plan. Reply DONE or HELP.

Homes told not to drip get, instead of step 3, wording like:
> Please don't drip tonight. There's only enough water pressure for some homes on your street to drip, and we're saving it for homes with pipes under the house. If your heat goes out, reply HELP.

**Stage 2 — during the freeze (pressure-driven; the supervisor must approve every Stage 2 alert, even in Auto mode)**
> FreezeLine: Water pressure is dropping in your area. STOP dripping now. This keeps water on for homes with pipes under the house.

> FreezeLine: Keep dripping your kitchen tap only. Don't add more faucets. Pressure in your area is holding.

**Stage 3 — a pipe bursts (reply BURST)**
> FreezeLine: Shut off water at your home's main valve right away. Do NOT open the meter box or turn water off at the street meter. We've logged it and requested a crew. Crews can shut water off at the curb; repairs need a plumber.

Only after a crew is actually assigned: "Crew 3 is assigned and on the way, about 12 minutes."

### Call script (from the team whiteboard, with fact-check fixes)

| Step | Agent says | Reply → next |
|---|---|---|
| Open | "Hi, is this (Name)?" | Yes → Stage 1 |
| Stage 1 | "A hard freeze / winter storm is coming. I've texted you a set of instructions. Can you see them?" | No → agent resends: "I've just resent the message. Can you see it now?" · Yes → next |
| Ability | "Is someone in your house able to go outside and do this, or have you already done it?" | Yes → done · No → crew branch |
| Crew branch (no crew free yet) | "No problem. I've requested a crew from your area. I'll text you as soon as one is assigned." | — |
| Crew branch (crew assigned) | "Crew 3 is assigned and on the way, about 12 minutes." | — |
| Stage 2 call (yellow / less-affected areas, after supervisor approval) | "Water pressure in your area has dropped. I've just sent another alert with new instructions. You don't need to go outside." | Low-priority homes: stop dripping everything · Others: stop all faucets except the kitchen tap |
| BURST (text) | Stage 3 text above | Logged → crew requested |

**Fixes applied vs the whiteboard:** "They should be there in X minutes" and "Sending a crew car over now" broke the honesty rule (no promise before assignment); BURST must start with "shut off your main valve"; iMessage → SMS.

### When every crew is busy: neighbor help
Trigger: all crews in the area are busy and a home needs immediate help (e.g., "Our pipes are making weird noises and we can't go outside").
1. Ask the person in need first: "Can I ask a neighbor to help? I'd share your address with them." Only continue on yes.
2. Call a neighbor who opted in: "Your neighbor at [address] can't reach their main water shutoff. Are you able to help them turn it off? I'll send you the steps."
3. If both agree, connect the call and text both of them the steps.
Notes: shutoffs are a round handle or a lever, often inside the garage (not a "ratchet"); the neighbor may need to enter the home, so consent on both sides matters. The demo shows this as a separate conversation.

### Burst and prep guidance (source caveat)
A WKRN (Nashville) news segment quoting Nashville Metro Water Services says: even with dripping and open cabinets, pipes can still freeze and burst in extreme cold; if a pipe bursts, shut off water at the home's main valve right away (often in a crawl space, basement or garage near the water heater); do **not** shut off at the meter or open the meter box, because lifting the lid in extreme cold can break the meter. It is Nashville guidance, so cite it as "other utilities say the same," pair it with Houston's own Feb 2021 notice, and confirm the wording against Houston Public Works. Houston homes are mostly slab, so say "garage, near the water heater, or where the line enters the house," not basement.

---

## 5. The math

### Risk and hex shade (current code; Phase 3.6 step 1 prints the exact formulas)
- Risk score per home (`src/lib/risk.ts`): deterministic 0–100 from cumulative hours below 20°F and wind chill (**real** Feb 2021 weather, Open-Meteo, one point per neighborhood = 4 points) plus foundation, exposed pipes, insulation and outdoor faucets (**simulated**). → Low / Watch / High.
- Hex shade = % of homes in the cell needing action tonight.
- Caveat: within one neighborhood every hex shares the same weather, so hex-to-hex differences come from simulated home attributes. Real house ages from the Harris Central Appraisal District, and the home survey, would make it real.

### Pressure and the drip budget
```
P_z(t)      = P_base,z − k_z × ( D_z(t) + q × H × (n_z + u_z) )

n_max,z(t)  = floor( (P_base,z − 25 − k_z × D_z(t)) / (k_z × q × H) ) − u_z
```
- P_base: area pressure with no demand · k: psi lost per gpm of demand · D: normal hourly demand · q: flow of one drip (gpm) · H: real households per simulated home · n: homes told to drip · u: homes dripping anyway.
- 25 psi = the 20 psi boil-water line + a 5 psi safety margin.
- Who drips: the n_max highest-risk homes. Everyone else gets other protection (open the cabinet, cover/drain the outdoor faucet, crew if they can't).
- Closed loop (Phase 4+): recompute hourly, estimate u from replies, and if pressure falls below 25 psi, ask the lowest-risk drippers to stop first.
- **Stage 2 trigger:** when an area's forecast crosses 25 psi, the agent proposes "stop dripping at N homes · kitchen tap only at M homes → stays at X psi," and the supervisor approves.
- **Not theoretical:** in the demo the panel uses this model; in a real deployment it reads the utility's own pressure sensors, and the same calculation decides how many and which homes to stop. Sensors can't tell you that.
- Constants are calibrated assumptions in a simplified model, not Houston's pipe network. Say so.

### Calibration (backtest, don't "train")
Fit the risk weights against Houston's Feb 2021 leak calls (city layer: 8,409 geocoded calls Feb 14–28, 2021, 4,343 leaks), then test on a storm the model never saw. Winter Storm Elliott (Dec 2022) is a candidate, **but whether Houston leak data exists for it is unverified.** Report one number, e.g. "areas FreezeLine ranked highest had X× more leak calls." Note: 311 calls record who called, not whose pipe burst.

### Money (demo video only, labeled as an estimate)
```
Losses avoided = bursts prevented × average claim
Average claim ≈ $5.8B projected payouts ÷ ~456,000 Texas claims ≈ $12,700
```
"Bursts prevented" must come from the backtest, not be invented.

---

## 6. Design decisions and feedback (chronological)

- Fully build FreezeLine to hit roadblocks early; "anything but the quality should not go down."
- Rejected hiding the "2021 weather" label (misleading) → **Live forecast | Replay: Winter Storm Uri** toggle; simulated note in an ⓘ tooltip.
- Console was confusing → simplify: "An intelligent design is able to convey something complex simply."
- Don't copy mockups exactly; make it better. The house x-ray is supporting evidence, not the product.
- 3D + freeze sweep moved to Phase 6, later **scaled down** (subtle tilt, smooth zoom): FreezeLine is informative, not a rescue mission.
- Pressure gauge too subtle → numbers in words → one comparison card, per-area collapsed.
- Colors: status dots green ready / red needs help / yellow waiting / black no answer / gray not contacted; hex need scale violet (separate from status colors).
- "Every number gets a visual" (from Standard Response: "5 of 46 homes answered," dot grid, funnel, tiles).
- ~12 homes per hex looked fake → real OSM residential footprints (70–450 m²) → 8,034 homes. Hexes colored by % needing action.
- Transcripts on the Homeowner side only; City side is map + cells + metrics.
- Crews = standby helpers for people who can't do the steps (elderly, mobility, no heat, lives alone).
- No paid AI API → pre-written Claude-authored messages + Gemini free tier for the photo check only.
- **Nov 9–10:**
  - The pressure panel should show live psi per area and whether the agent is about to send a Stage 2 alert, instead of the "two futures" pitch tiles.
  - Crews: more of them (5 per area), nearest crew goes; distance and arrival time in the sidebar Crews section.
  - One legend in the top left (hex shading + dot colors + crew marker). Open question: the whiteboard legend reads red = high priority / yellow = mid / green = great condition, while dots currently show status; current plan keeps dots as status because hex shading already shows priority.
  - Homeowners get SMS/calls only; the Homeowner tab and `/h` pages are removed; the house diagram is dropped (it would need blueprints nobody has). Many people don't know where their main shutoff is, which is why Stage 1 asks them to find it.
  - Use the drip equation for real (pressure display + Stage 2 number), not just in the video.
  - Keep it to Houston; other cities are "next" lines in the video.

### Visual design rules (in CLAUDE.md)
1. Every number gets a visual: dot/unit grids, stacked color bars, color tiles or simple icons. No bare numbers in a list.
2. One big headline number per panel, details collapsed underneath.
3. Facts as short tiles, not sentences.
4. Status colors (home status only): green = ready, red = needs help, yellow = waiting, black = no answer, gray = not contacted.
5. The hex "need" scale uses its own ramp (violet), distinct from status colors.
6. Officials' third-person wording on City Operations.
7. Homeowner-facing text is friendlier: larger text, icons, plain sentences.
8. Honesty in the UI: simulated data is marked; confirmed vs estimated look different (solid vs dashed).

---

## 7. Every Claude Code prompt (verbatim, in order)

### Prompt 1A — setup + data
> We're building **FreezeLine**. This is **Phase 1A only**. Don't build anything beyond these tasks. Use the ui-studio skill for any UI.
>
> **The product (for CLAUDE.md):** FreezeLine is an AI agent for water utilities during hard freezes. In February 2021, Houston told residents "do NOT drip faucets" because dripping was crashing water pressure, while standard advice says to drip. One message for everyone backfires. FreezeLine scores freeze risk house by house and builds a coordinated drip plan (who drips, which faucet, who shouldn't) so at-risk homes are protected and pressure stays above 20 psi (below 20 psi triggers a boil-water notice in Texas). Two views: a utility console (3D hex map, pressure gauge, agent actions) and a homeowner phone page (a personal plan). The demo replays Winter Storm Uri (Feb 14–18, 2021) over Houston.
>
> **Stack:** Next.js (App Router) + TypeScript + Tailwind, Vercel, Supabase, deck.gl + MapLibre with a free dark basemap (no Mapbox key), h3-js, Open-Meteo, Vitest for tests. I'm on Windows PowerShell.
>
> **Tasks:**
> 1. Scaffold the project, git init, .gitignore (node_modules, .env*, .claude/worktrees/), .worktreeinclude (.env, .env.local), and .env.example. Add Agentation in development mode only, as a client component (`'use client'`), rendered only when process.env.NODE_ENV === 'development', with endpoint "http://localhost:4747".
> 2. CLAUDE.md: the product above, the stack, the 7-phase plan (1 setup + core loop, 2 drip planner + pressure gauge, 3 Claude agent + homeowner page, 4 Twilio SMS + ElevenLabs calls, 5 storm mode with bursts, crews, Realtime, 6 3D + house x-ray + polish, 7 deploy + demo), the demo story, and rules: the risk engine is deterministic (Claude explains and chooses actions in later phases), all sample data is labeled simulated, keys are never committed, and SUPABASE_SERVICE_ROLE_KEY is used only in scripts and server code, never with a NEXT_PUBLIC_ prefix.
> 3. Supabase: write supabase/001_schema.sql with tables zones, homes, drip_plans, events, outreach. **No per-hour risk table**, since risk is computed in code. Enable RLS on every table, add read-only SELECT policies for anon, and **GRANT SELECT to anon** on the tables the frontend reads (automatic table exposure is off in my project). Show me the SQL to paste into the SQL Editor. Connect the app with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
> 4. Seed script: about 2,000 simulated homes inside the bounds of 3–4 real Houston neighborhoods, each with year built, foundation (slab or pier-and-beam), pipes in exterior walls, outdoor faucet count, attic or crawlspace pipes, insulation level and pressure zone, plus 3–4 zones with a base pressure. It uses SUPABASE_SERVICE_ROLE_KEY from .env.local, runs with one npm command, and is safe to re-run without duplicating rows.
> 5. Weather: fetch hourly Houston temperature_2m, apparent_temperature and wind_speed_10m for Feb 13–19, 2021 from https://archive-api.open-meteo.com/v1/archive with temperature_unit=fahrenheit and timezone=America/Chicago. Save it as data/uri-2021.json in the repo. Add a matching live-forecast function for later.
>
> Commit after each task and explain each simply. At the end, list exactly what I need to do by hand: create the Supabase project keys in .env.local, run the SQL, run the seed command. Then confirm the app connects by showing the count of homes and zones on a simple test page.

### Prompt 1B — risk engine + map
> FreezeLine **Phase 1B only**. Read CLAUDE.md first.
> 1. Risk engine in src/lib/risk.ts: a deterministic 0–100 score plus Low, Medium or High per home at a given hour, computed on the fly from data/uri-2021.json and the home's attributes (cumulative hours below 20°F, wind chill, foundation, exterior-wall or attic pipes, insulation, outdoor faucets). Return a plain-English "why" (for example, "pier-and-beam + 31 hours below 20°F"). Add Vitest tests covering obvious cases (a warm hour = Low; an exposed pier-and-beam home after a long hard freeze = High).
> 2. Console page (/console): a dark full-screen deck.gl map over MapLibre of Houston, with H3 hexes colored by average home risk on an icy-blue-to-red scale. A time slider and Play button replay Feb 13–19, 2021 hour by hour. A side panel shows the current time, temperature, and High, Medium and Low counts. Clicking a hex lists its homes with their score and "why". Show a small "Simulated homes · Real Feb 2021 weather" label. Keep it a serious utility-ops look.
> 3. Make sure the replay stays smooth with 2,000 homes. Precompute per-hour hex averages in the browser if needed.
>
> Commit after each step. At the end, start the dev server in the background, give me the localhost link, and say what's ready for Phase 2 (drip planner + pressure gauge).

### Prompt 2 — drip planner + pressure gauge
> FreezeLine **Phase 2 only**. Read CLAUDE.md first. Don't add the Claude API, Twilio, ElevenLabs or bursts yet; those are later phases.
>
> **Goal:** Show FreezeLine's core idea: one message for everyone crashes water pressure, while a coordinated drip plan protects at-risk homes **and** keeps pressure above 20 psi.
>
> 1. **Pressure model** (src/lib/pressure.ts): a simple, deterministic per-zone model. Pressure = the zone's base pressure minus a drop proportional to total demand (normal hourly demand + drip flow). Each simulated home stands in for many real households, so pick a scale factor and state it. Calibrate the constants so that during the Feb 15–16 peak, "everyone drips" pushes at least one zone below 20 psi, and the FreezeLine plan keeps every zone above 20 psi. Put every assumption (households per simulated home, drip rate in gpm, demand curve) in one config file, and label it "simplified model" in the UI. Add Vitest tests.
> 2. **Drip planner** (src/lib/planner.ts): for each zone and hour, decide per home: **drip** (which faucet, chosen from its risk factors, e.g. "kitchen (exterior wall)"), **do not drip**, or **shut off and cover outdoor faucets**. Protect the highest-risk homes first, within a drip budget that keeps the zone at or above 25 psi (a 5 psi safety margin above 20). Give each decision a plain-English reason. Deterministic and tested.
> 3. **Compare two futures** for the whole replay: **Everyone drips** (the standard advice) and **FreezeLine plan**. For each one compute, per zone and hour: pressure, number of homes dripping, and % of High-risk homes protected.
> 4. **Console updates** (/console, keep the current look): a **pressure gauge panel**: a line chart per zone (or the selected zone) showing both futures over the replay timeline, with a red 20 psi boil-notice line and a marker at the current replay hour; below the chart, the current pressure for each future, and "Boil-water notice" when a future drops below 20. A toggle **Everyone drips / FreezeLine plan** that recolors the map to show who's dripping. Clicking a hex also shows each home's planned action, faucet and reason. A summary line, e.g. "FreezeLine: 94% of High homes protected · lowest pressure 27 psi vs. everyone drips: 16 psi → boil notice."
> 5. **Save the plan:** a script/button that writes the FreezeLine plan for the peak freeze night into the drip_plans table (one row per home, created_by='engine'), safe to re-run without duplicates. Use the service-role key only on the server or in scripts.
>
> Commit after each step and explain each simply. At the end, start the dev server in the background (free the port first), confirm the page loads, and tell me the exact numbers for both futures at the peak hour, plus what's ready for Phase 3 (Claude agent + homeowner phone page).
>
> *(Add-on line:)* Also update the Phase 6 description in CLAUDE.md: "3D tilted map with building heights; an animated cold front sweeps in from the north, then H3 hex columns rise; clicking a hex flies the camera in and homes appear as green/yellow/red dots; clicking a dot opens the plan card."

### Prompt 2B — simplify the console (UX pass)
> FreezeLine **UX pass**. Read CLAUDE.md first, and use the ui-studio skill. Don't change the risk engine, planner or pressure logic; this is about clarity. Principle: **convey something complex simply.** One idea per screen, and no tabs or raw numbers unless they earn their place.
>
> **Our differentiator:** FreezeLine tells each household exactly what to do, including whether to drip and which faucet, coordinated so the city keeps its water pressure. The UI should lead with **actions**, not data.
>
> 1. **Mode switch:** replace the "Simulated homes · Real Feb 2021 weather" label with a clean top-bar toggle: **Live forecast** | **Replay: Winter Storm Uri (Feb 2021)**, defaulting to Replay. Live uses the existing live-forecast function. Move "homes are simulated sample data" into a small ⓘ tooltip.
> 2. **Real differences across the city:** fetch Open-Meteo archive data for each neighborhood's center (multiple coordinates, one request) so areas freeze differently. Cache it in data/.
> 3. **Click a hex:** the map flies smoothly into that area and the homes appear as markers colored by level (green Low, yellow Watch, red High). The side panel shows only one sentence ("38 homes · 12 need action tonight") plus the homes that need action, highest risk first. No tabs, no attribute tables, no scores.
> 4. **Click a home: the plan card.** Level + one sentence; **Your 3 steps before 8 PM** as large numbered actions from the Phase 2 planner (e.g. "Cover the outdoor faucet on the east side." / "Open the cabinet under the kitchen sink." / "Drip **only** the kitchen tap. Your street is on a drip plan, so please don't drip the others." or "Don't drip tonight. Your home is low-risk, and it helps keep your neighbors' pressure up."); **a small house diagram** below the steps (cross-section, exposed pipe section highlighted); **"Why?"** collapsed (3 reasons with source tags: Property record / Forecast / Photo: not sent yet); "← Back to map."
> 5. **Clean up:** remove raw attribute lists, numeric scores and extra tabs from the UI (keep them in code and tests). Show "Medium" as **"Watch."** Calm, confident, readable: generous spacing, one accent color for action, no clutter.
>
> Commit after each step. At the end, start the dev server in the background, confirm it loads, and tell me exactly what to click to see map → area → home → 3-step plan.

### Polish prompt (after Phase 2)
> Small polish, no logic changes:
> 1. In "Water pressure by area," show both futures as numbers for each area, e.g. "**FreezeLine 28 psi** ✓ · Everyone drips **14 psi** ✗ Boil notice," with the boil-notice part in red. Keep the bars, but make the "everyone drips" marker clearly labeled, not just a dot.
> 2. Add one clear summary line above the bars at the current hour: "If everyone drips: 2 of 4 areas fall below 20 psi → boil-water notice. With FreezeLine: all 4 stay safe." (use the real computed numbers).
> 3. Fix the side-panel headline being cut off at the top. The panel should scroll from the top, with the headline fully visible.
> 4. Use green = Low, yellow = Watch, red = High everywhere (legend, hexes, dots, plan card).
>
> Commit, refresh the dev server if needed, and tell me the "everyone drips" and FreezeLine numbers at the Feb 16 peak.

Result seen: FreezeLine 35/35/33/28 psi vs everyone drips 13/11/9/… → all 4 areas boil notice vs all safe.

### Prompt 3 — agent + homeowner page
> FreezeLine **Phase 3 only**. Read CLAUDE.md first. Keep the risk engine, planner and pressure model deterministic: Claude explains, writes and decides **actions**, but never changes the numbers. Design principle: **convey something complex simply.** Use the ui-studio skill for UI.
>
> **0. Simplify the console first** (no logic changes): Replace the per-area bars with **one comparison card** at the top of the side panel. Left, red: **"Everyone drips"** → "[N] of 4 areas: boil-water notice." Right, green: **"FreezeLine plan"** → "All areas safe · lowest [X] psi." Live computed numbers for the current hour. Under it: "Send the drip plan to [N] homes." Per-area pressures behind "See by area ▾", collapsed. Remove bars and red tick marks from the default view. Goal: an official understands the side panel in 3 seconds.
>
> **1. Claude API setup:** server-side only, ANTHROPIC_API_KEY from .env.local, never NEXT_PUBLIC_. Fast model for bulk writing, stronger model for decisions. Cache per home and hour. If the key is missing, fall back to template text.
>
> **2. The agent** (server route, run when the official clicks **"Run agent"** for the current replay hour, never every frame). Tools: get_city_status, get_zone_pressure, get_homes_needing_action, publish_drip_plan, draft_homeowner_message, queue_outreach (outreach table, status 'queued', simulated; Phase 4 sends), log_event. It decides who gets messaged first and which zones need a stricter drip budget, explaining each decision in one plain sentence. Only facts from its tools — no invented homes, numbers or promises. Cap steps per run.
>
> **3. Agent log in the console:** short readable feed ("Messaged 120 High homes in the Heights first: lowest pressure margin"). **Auto / Approve first** toggle. Collapsed to latest 3 with "Show all".
>
> **4. Homeowner page** (/h/[homeId], mobile-first): level sentence; **3 steps before 8 PM** in friendly language from the planner output (incl. drip/don't drip and which faucet); freeze clock ("If the heat goes out, your pipes are at risk around 3 AM"); big **"A pipe burst"** button with main-valve shutoff steps; **English / Español**; small house diagram and collapsed "Why?"; in the console plan card, "Open homeowner page ↗".
>
> **5. Photo check** (optional): "Send a photo of your outdoor faucet." Vision says covered, bare or unclear, updates the plan and reason ("Confirmed from your photo"). Don't store the photo; store only the result.
>
> Commit after each step, tests where deterministic. At the end, start the dev server (free the port first), confirm both pages load, and tell me exactly what to click to: see the simplified console, run the agent, read its log, open a homeowner page, switch to Spanish, and try the photo check. Also roughly how many Claude API calls one demo run makes, and the approximate cost.

### "No paid API" prompt (ran after Phase 3)
> I don't want to pay for any AI API right now, and I don't want quality to drop. Change how FreezeLine's AI text works:
> 1. Find every distinct combination of facts that produces a message (risk level, drip action, faucet, foundation, outdoor faucet status, language, and so on). Using your own writing, without calling any API, pre-write the friendly 3-step plan text, the SMS text, and the agent's decision explanations for every combination in English and Spanish, following the honesty rules. Save them to data/messages.json with a script that checks every combination is covered.
> 2. Make the app use these pre-written messages by default (no API needed), filling in each home's details and link.
> 3. Make the provider swappable with LLM_PROVIDER=pregenerated | gemini | anthropic in .env.local, default pregenerated. Use Gemini's free tier (GEMINI_API_KEY, server-side only) only for the photo check, and keep the Anthropic path intact so I can switch to live Claude at the hackathon with sponsor credits.
> 4. Update CLAUDE.md, add tests, commit, and tell me how many message variants you wrote and how to get a free Gemini key.

Result: 98 variants (49 pieces × EN/ES) in `data/messages.json`; `npm run messages:check` (7,518 renders, no gaps).

### Phase 3 check (with Gemini)
> LLM_PROVIDER is now gemini and the Gemini key is in .env.local. Start the dev server in the background (free port 3000 first) and run the Phase 3 check: run the agent at the Feb 16 peak in Auto and Approve-first modes, confirm drip plans and queued texts land in Supabase, open a homeowner page in English and Spanish, and test the photo check with Gemini.

### Visual design rules (sent as the Phase 3.5 design-rules answer)
> Use the existing UX principles + new rules, and add a "Visual design rules" section to CLAUDE.md with:
> 1. Every number gets a visual: dot/unit grids (one dot per home), stacked color bars, color tiles or simple icons. No bare numbers in a list.
> 2. One big headline number per panel, with details collapsed underneath.
> 3. Facts as short tiles, not sentences (e.g. "Can do steps: No," "Lives alone: Yes").
> 4. Status colors (home status only): green = ready, red = needs help, yellow = waiting, black = no answer, gray = not contacted.
> 5. The hex "need" scale uses its own color ramp, distinct from the status colors (e.g. pale → deep ice-blue or purple), so a colored area is never confused with a home's status.
> 6. Two-audience wording: officials' third-person wording only on /console City Operations; "you" wording only on the Homeowner tab and /h pages.
> 7. The Homeowner pages are friendlier and less technical: larger text, icons, plain sentences, weather icons instead of charts, nothing that needs explaining.
> 8. Honesty in the UI: sample or simulated data is always marked, and confirmed vs estimated answers look different (solid vs dashed).

### /demo-check command (created once; updated in 3.5, to be updated in 3.6)
> Create a project slash command /demo-check (in .claude/commands/demo-check.md) that: starts the dev server in the background (freeing port 3000 first), opens the console and a homeowner page in the browser, walks the full demo path (replay → Feb 16 peak → run agent → click an area → click a home → homeowner page → Spanish → photo check), takes screenshots of each step into demo-screens/, lists anything broken, slow or confusing, and checks that nothing shows raw numbers or broken text.

### Prompt 3.5 — two audiences (run in plan mode)
> FreezeLine **Phase 3.5: split into two audiences**. Read CLAUDE.md first and follow its Visual design rules. Plan first and show me the plan before building. Keep the risk engine, planner, pressure model, pre-generated messages and honesty rules unchanged.
>
> **Two tabs in the top bar, each for one audience, never mixed:** **City Operations** (dispatchers and city officials — only the big map, the cells and the metrics) and **Homeowner** (one household — everything about that home, including the agent talking to them).
>
> **1. Realistic density:** replace the 2,000 random sample homes with **real house footprints from OpenStreetMap** for our 4 neighborhoods, fetched once with Overpass and cached in data/. Each footprint becomes a home with **simulated** attributes (foundation, year built, pipes, insulation, outdoor faucets, and whether the household may need help: elderly, mobility limits, lives alone). Re-seed Supabase (safe to re-run). Keep the "simulated details" note in the ⓘ tooltip. Smooth at full count.
>
> **2. Tab 1: City Operations** (third-person wording). No transcripts or homeowner instructions. Map: every home as a status dot (green ready, red needs help, yellow waiting, black no answer, gray not contacted); hexes colored by % of homes needing action tonight; click hex → zoom; click dot → summary card with "Open in Homeowner tab →". Ready check card (big "X of Y", stacked bar, legend). Outreach funnel Texted → Called → Door check. Help crews 1–3 (sample) on the map with lines to the home they're helping; Crews panel in plain words ("Crew 1 · On standby," "Crew 2 · Helping a home on Blair St (elderly, can't go outside)," "Crew 3 · Heading to W 11th St"); crews only for homes whose call says they can't do the steps. Two-futures pressure tiles. Freeze readings and collapsed agent log.
>
> **3. Tab 2: Homeowner** ("you" wording; from "Open in Homeowner tab →" or /h/[homeId]): level sentence; house diagram with at-risk pipes red (dashed likely / solid photo-confirmed); "What to do right now" 3 steps with icons; **the agent conversation** — the agent explains the storm and steps, then asks: Can you do these steps yourself? Is anyone elderly, disabled, or unable to go outside? Do you need help? If they need help it says it's **requesting** a crew, and only says **on the way** after a crew is actually assigned (which then appears on the City tab); answers as big tiles (Can do steps · Needs help · Shutoff found · Outdoor faucet); simulated and labeled "sample" until Phase 4. Freeze clock, pipe-burst button, photo check, English/Español.
>
> **4. Consistency:** same status colors in both tabs; no raw scores; officials' wording only on Tab 1, "you" wording only on Tab 2.
>
> Commit after each step. Update CLAUDE.md with the two-audience structure and the crew rule. At the end, start the dev server (free port 3000 first), confirm both tabs load, tell me how many real homes are on the map, and walk me through: City map → click a red dot → Open in Homeowner tab → read the conversation → see the crew request appear on the City tab.

Plan-mode answers given: (1) OSM homes → Residential footprints. (2) Routes → two routes: /console (City Operations + Homeowner) and /h/[homeId] (Your home + "Storm in your area" aggregated only; coordinated drip step most prominent; individual data only on /console). (3) Simulation → agent asks the 7 questions (seeded sample answers) → assessment Ready / Needs reminder / Needs a crew with reason + confirmed/estimated → agent proposes crews, official approves (Auto/Approve-first), Crews 1–3 then queue, honesty rule, neighbor flagging. (4) Design rules → the 8 rules above.

### Phase 3.5 continuation (after running supabase/003_phase35.sql)
> 003_phase35.sql ran successfully. Re-seed the real homes, free port 3000, start the dev server in the background, confirm both tabs load, and do the walkthrough with screenshots.

### Claude Code skill setup (user-level; each teammate can run it once in their own Claude Code)
Install first (PowerShell): `npx skills add rebelytics/one-skill-to-rule-them-all --skill task-observer -g`, `npx skills add vercel-labs/agent-skills --skill web-design-guidelines -g`, `npx skills add Leonxlnx/taste-skill -g` (select **Claude Code** in each agent list, choose Copy), `npm install -g @playwright/cli@latest` then `cd $HOME; playwright-cli install --skills`, design-md-library (clone `https://github.com/VoltAgent/awesome-design-md` into `~/.claude/skills/design-md-library/library` plus a SKILL.md), and the Claude Code Setup plugin via `/plugin` (user scope). Optional: Headroom (`uv tool install --python 3.13 "headroom-ai[all]"`, start with `headroom wrap claude`, telemetry off with `setx HEADROOM_TELEMETRY off`) plus a headroom-compression skill. Then:
> Set up automatic skill selection for me, at user level so it works in every project. I should never have to name a skill; choosing them is your job.
>
> 1. Add the "Skills" and "Design workflow" sections below to my user-level CLAUDE.md (~/.claude/CLAUDE.md). Keep everything already there and don't duplicate anything that already exists.
> 2. Find task-observer's references/environments.md in ~/.claude/skills/task-observer and add its activation instruction to the same CLAUDE.md.
> 3. Add a UserPromptSubmit hook in my user-level settings.json that adds this reminder to every prompt: "Before acting, check the available skills and the Skill map in ~/.claude/CLAUDE.md, choose every skill that fits this task without waiting to be asked, and list them (in the plan's 'Skills I'll use' section in plan mode, or one 'Using skills:' line otherwise)." I'm on Windows PowerShell, so make the hook command work there and test that it runs without errors. Don't add it twice if a similar hook exists.
> 4. List every skill and plugin you can currently see, and confirm each one in the Skill map exists. Tell me about any that are missing, and add any installed skill that isn't on the map, with a one-line "use when".
> 5. Show me the exact changes, then tell me to restart Claude Code and what ordinary request to type to check that the skill list appears.
>
> ## Skills
> I never name skills. Before every task, check the full list of available skills and the Skill map below, and choose every skill that fits, including several when several apply.
> - In plan mode (my default): start every plan with a "Skills I'll use" section listing each skill, the step it's for, and one short reason. I approve them by approving the plan.
> - Outside plan mode: before the first action, write one line: "Using skills: X (reason), Y (reason)."
> - Then actually load and follow each skill listed. If a skill turns out not to fit, say so and drop it.
> - If a new skill appears that isn't on the map, read its description and use it when it fits.
> - If no installed skill fits a recurring kind of task, use find-skills to suggest one, but don't install anything without asking me.
> - Always use self-check on substantive work, and task-observer on every session.
>
> ## Skill map
> | Task | Skills |
> |---|---|
> | Any UI, interface, page or frontend work | follow the Design workflow below |
> | Testing a page, clicking through a flow, screenshots, demo checks | playwright-cli |
> | Sessions started with headroom wrap | headroom-compression |
> | Setting up a new project or asking what automations to add | claude-code-setup |
> | Starting a hackathon project | hackathon-kickoff |
> | Judging or comparing hackathon ideas | hackathon-idea-evaluator |
> | Anything that depends on my own notes, projects, plans or past decisions | obsidian-brain |
> | Before delivering any substantive answer, code, plan or file | self-check |
> | Every session | task-observer |
> | No skill fits a recurring task | find-skills |
>
> ## Design workflow (any UI, interface or frontend work)
> The project's own rules (CLAUDE.md Visual design rules and DESIGN.md) always win over any skill's house rules. Use the design skills in stages:
> 1. design-md-library: only when creating or updating DESIGN.md.
> 2. ui-studio: build or change the UI from DESIGN.md.
> 3. design-taste-frontend: for redesigns, polish passes or design reviews; use --app mode for dashboards and app screens and --keep palette,type so project colors stay.
> 4. web-design-guidelines: audit changed UI files before I review them.
> 5. playwright-cli: screenshots at desktop and phone width, and click through the changed flow.
> For a small UI fix, use stages 2, 4 and 5 only.

Skills that don't exist on a teammate's machine (ui-studio, self-check, obsidian-brain, hackathon-* are Danish's own) will just be reported as missing; that's fine.

### GitHub backup (ran Nov 10)
> Back up FreezeLine to GitHub as a **private** repo named freezeline under my account. This is the one shared home for the project that my teammates will clone, not a second copy.
> 1. Run git status. If anything is uncommitted, show me the list and commit it with a clear message.
> 2. Before pushing, confirm .env.local and every other .env file are in .gitignore, were never committed (check the whole git history, not just current files), and that no key values appear in any tracked file. If you find any secret in history, stop and tell me; don't push.
> 3. Make sure .env.example lists every variable name with no values, so teammates know what to fill in.
> 4. Add a short README.md for teammates: what FreezeLine is (2 sentences), how to install and run it on Windows, which .env.local values they need to get from me, and that CLAUDE.md holds the rules.
> 5. Use the GitHub CLI (gh). If it isn't installed or I'm not logged in, give me the exact PowerShell commands to install it and run `gh auth login`, then wait for me.
> 6. Create the repo as private, push, and show me the repo URL and the last commit pushed.
> 7. Add one line to CLAUDE.md: "Push to GitHub after each phase is committed." Commit and push that too.

Result: full-history secret scan clean; pushed `master` up to `c408efa`.

### Prompt 3.6 — City Operations only (NEXT; run in plan mode)
> FreezeLine **Phase 3.6: City Operations only**. Read CLAUDE.md first and follow its Visual design rules. Plan first and show me the plan before building. This phase is UI on the officials' console only: no Twilio, ElevenLabs, call scripts or message rewrites. Keep the risk engine, planner and pressure model unchanged unless a step below says otherwise.
>
> **Skills:** start the plan with "Skills I'll use," listing each skill and the step it's for. I expect at least: engineering:debug (step 2), dataviz and ui-studio (steps 3–4), engineering:testing-strategy (step 5), security-review (step 7), design-md-library, design-taste-frontend, web-design-guidelines and playwright-cli (step 8 and screenshots), and headroom-compression, self-check and task-observer throughout. If any of these isn't available or fails to load, say so in the plan before building.
>
> **1. Explain before changing:** Show me the exact formula from code for (a) a home's risk score and level, (b) what counts as "needing action tonight," (c) a hex's violet shade, and (d) the pressure model written as an equation with the real constants from the config: pressure per area = base − k × (normal demand + drip flow × households per simulated home × homes dripping), plus the maximum number of homes that can drip while the area stays at or above 25 psi. List which inputs are real (weather) and which are simulated, and how many weather points the map uses.
>
> **2. Remove the Homeowner tab.** City Operations becomes the only screen. Remove the Homeowner tab, the /h/[homeId] pages (including the house diagram and the "Storm in your area" view) and the "Open in Homeowner tab →" link on the dot card. Homeowners will only get texts and calls (Phase 4) plus a separate sign-up and home survey page we'll build later. Keep the shared logic Phase 4 will reuse (planner output, message and call-script libraries, honesty guard) and their tests. Name the commit that still has the old pages so they can be restored. Before deleting the storm view, find out why it said "Mon night: 1 homes in your area need to act" on the coldest night; if the same count feeds the hexes, sidebar or Ready check, fix it. Fix "1 homes" plurals everywhere. Update CLAUDE.md, README and /demo-check for the console-only structure.
>
> **3. Legend (top left of the map).** One legend for everything on the map: the hex shading scale (pale to deep violet = % of homes needing action tonight, with 3–4 labeled steps), the home dot colors with their meaning and live counts, and the crew marker. Remove any other keys that repeat it.
>
> **4. Pressure monitor (replaces the two-futures tiles).** For each area: current pressure in psi as the headline number, colored green above 25, amber 20–25, red below 20; a small line chart of the past and next 12 replay hours with a dashed 25 psi line labeled "Stop new drips" and a red 20 psi line labeled "Boil-water notice." **Stage 2 alert:** when an area's forecast crosses 25 psi, the agent proposes a Stage 2 alert using the equation from step 1(d): how many lower-priority homes must stop dripping, lowest risk first, and how many higher-risk homes keep only the kitchen tap, with the forecast psi after the change (e.g. "Montrose: stop dripping at 140 homes · kitchen tap only at 60 homes → stays at 27 psi"). Show it as a card, "Stage 2 alert ready · needs supervisor approval," with Approve and Not yet. **Stage 2 always needs approval, even in Auto mode.** On approval, queue simulated texts using the existing "don't drip" message (new Stage 2 wording comes in Phase 4) and log it. Keep "everyone drips" behind a collapsed "Compare: if everyone drips ▾". Keep the "simplified model" label, and add to its tooltip: "In a real deployment this panel reads the utility's own pressure sensors; the same calculation decides how many homes to stop." Use "areas," not counties.
>
> **5. Crews.** Replace the 3 sample crews with **20 (5 per area)**, each starting at a depot inside its area. When a home is confirmed "needs a crew," assign the nearest available crew by distance, preferring the same area; if none is free there, use the nearest free crew from another area. Show distance and estimated arrival **in the sidebar's Crews section** next to each busy crew (e.g. "Crew 7 · Heading to W 11th St · 1.2 mi · ~6 min"); standby crews show "On standby · [area]". The map keeps the crew marker and line without text labels. Crews return to standby when a job finishes; the queue is highest risk first. Keep the honesty rule: "on the way" only after assignment. Clear the test-script assignment of Crew 1 so the demo starts clean. Add tests for nearest-crew assignment and the fallback.
>
> **6. Hex explanation.** A "Why this shade?" tooltip on each hex: % needing action plus the top 2 reasons in plain words, with simulated factors marked as simulated.
>
> **7. Login for /console:** a simple shared-password gate, not an account system or auth provider. The password comes from .env.local (never NEXT_PUBLIC_), is checked on the server, and sets an httpOnly cookie. Protect /console and its /api routes. Add the variable name to .env.example and the README.
>
> **8. Polish pass (last, after steps 1–7 pass all checks).** (a) design-md-library: write FreezeLine's DESIGN.md for City Operations, borrowing from ibm, sentry and linear.app; keep our status colors, the violet hex scale and the Visual design rules; add to CLAUDE.md "DESIGN.md is the source of truth for how FreezeLine looks." (b) design-taste-frontend in --app mode with --keep palette,type: a restyle of City Operations (type, spacing, panels, empty/loading states), not a redesign. Keep the layout, every feature and every number. Where its house rules conflict with CLAUDE.md (for example the purple palette rule), CLAUDE.md wins: list those conflicts in the report instead of changing them. If Node is below 22, say so and use its lint script plus playwright-cli screenshots instead of its inspector. (c) web-design-guidelines: audit every changed UI file and fix the findings. (d) playwright-cli: screenshots at 1440 px and 768 px.
>
> Commit after each step. Run npm test, the type check, lint and messages:check. Push to GitHub at the end. Save screenshots into demo-screens/: full City Operations, the legend, the pressure panel with a Stage 2 card, the Crews section, a hex tooltip and the login screen. In the report, list what changed, any Taste conflicts, anything you couldn't verify, and exactly what to click to see each screenshot.

### Prompt 4 — real texts and calls (DRAFT: will be rewritten after 3.6)
This was written before the Nov 9–10 decisions. The rewrite will: drop `/h/[homeId]` links (homeowners get the instruction in the text itself), use the three-stage alerts and call script from §4, add the sign-up page with consent, make Stage 2 supervisor-approved, and add the burst/prep wording. Keep from the draft: the demo allowlist, the code-enforced honesty guard, Twilio signature checks, the follow-up ladder, "claim a house," and the cloudflared tunnel.

**Add at the top:** "Use the LLM_PROVIDER setting for any AI step in this phase (reading free-text SMS replies, the post-call summary), never the paid Anthropic API unless LLM_PROVIDER=anthropic."

**Pre-steps:** Twilio trial (number; add your + teammates' phones as Verified Caller IDs; copy SID, Auth Token, number). ElevenLabs (Conversational AI → Phone Numbers → connect the Twilio number; copy API key). Add keys to .env.local yourself (no NEXT_PUBLIC_), plus `DEMO_ALLOWED_NUMBERS=+1…,+1…`. Webhooks need a public URL (cloudflared tunnel).

> FreezeLine **Phase 4 only**. Read CLAUDE.md first and follow its Visual design rules. Keep the risk engine, planner and pressure model unchanged.
>
> **Goal:** the agent actually reaches homeowners by text and voice, follows up with people who don't answer, records what they say, and the console shows it visually, without ever making a false promise.
>
> **1. Safety first: demo allowlist** (enforced in code). Real texts and calls go **only** to numbers in DEMO_ALLOWED_NUMBERS. All other homes are "simulated sends" recorded with simulated outcomes. Add a **"Claim a house"** flow: a demo phone (from the allowlist) can claim a home, and that home's messages go to that real phone. Every key stays server-side.
>
> **2. The honesty rule** (code, not prompt). Never promise a crew before one is dispatched, never "your pipes will be fine/safe," never guarantee anything. Crew sentences only from fixed templates picked by real state. A guard checks every outgoing text and spoken reply for banned promise patterns and blocks/rewrites them, with tests ("help is on the way," "you'll be fine," "a crew will be there soon").
>
> **3. Texts (Twilio SMS):** on queue_outreach, send level + short 3 steps + /h/[homeId] link. Replies: "DONE" → done/green; "HELP" → needs help/red + triggers a call; anything else → read by the configured provider to update the record. Delivery status and inbound replies via webhooks, verifying Twilio's signature.
>
> **4. Voice calls (ElevenLabs agent over Twilio):** create an ElevenLabs Conversational AI agent via API (ID in .env.local) that calls a claimed home, explains the level and 3 steps, and asks: Can you drip the tap we named? Do you know where your main water shutoff is? Is your outdoor faucet covered? Is anyone on your street elderly or alone who might need a check? (plus the Phase 3.5 situation questions). English and Spanish. Pass each home's details/steps as call variables. Record answers as structured fields (post-call data/webhook) and save a transcript summary. Honesty rule in the agent's instructions and checked after the call.
>
> **5. Follow-up ladder:** text → no reply within a set time (≈30 s in replay) → call → no answer → door check list. Show where every home is on the ladder.
>
> **6. Outreach panel** (Visual design rules): headline "**312 of 889** homes reached"; dot grid (green done, yellow waiting, red needs help, gray not reached) filling live; funnel Texted → Called → Door check with icons; home card with big answer tiles (Can drip: Yes · Shutoff: Found · Outdoor faucet: Covered · Neighbor to check: Mr. Alvarez) and a short transcript; a "📞 Real phones: 2 claimed" chip.
>
> **7. Public URL for webhooks:** free cloudflared quick tunnel for local testing, webhooks pointed at it, PUBLIC_BASE_URL in .env.local. Give exact Windows PowerShell commands and what to change once deployed to Vercel.
>
> Commit after each step. Tests for the allowlist, honesty guard and follow-up ladder. At the end, start the dev server and tunnel, then walk me through: claim a house with my phone, run the agent, receive the text, reply "HELP," get the call, and watch my dot and tiles update on the console. Estimate Twilio and ElevenLabs usage of one demo run.

Heads-ups: if texts don't arrive but calls work → likely US carrier registration (A2P/toll-free); ElevenLabs free tier has limited minutes — keep test calls short.

Burst and prep wording to include in the Phase 4 rewrite:
> **Burst and prep guidance:** Update the pre-generated messages (EN and ES) and the agent's questions: (1) the pre-freeze text asks the household to find their main shutoff now (garage, near the water heater, or where the line enters the house; Houston homes are mostly slab, so don't say basement); (2) burst instructions say to shut off at the home's main valve and never to open the meter box or turn off water at the street meter; (3) no message says dripping or open cabinets will prevent freezing; use "lowers the risk." Search every message and template for "meter" and fix any that conflict. Re-run messages:check and the honesty-guard tests.

### Phase 6 spec (saved; scaled down to subtle tilt + smooth zoom)
> FreezeLine **3D map pass**. Read CLAUDE.md first. Don't change the risk engine, planner or pressure logic, and keep the simplified plan card. Use the ui-studio skill.
> 1. **3D city:** tilt the camera (pitch ~50–60°, slight bearing) using a free, no-key vector basemap with building heights (e.g. OpenFreeMap), buildings as dark extruded shapes; orbit/tilt control + reset view.
> 2. **The freeze rolls in:** on replay start, an icy cold front sweeps from the north timed to the real temperature drop; hexes stay hidden until the front passes, then rise as 3D columns (height/color = homes needing action). Note "visualization" in the ⓘ tooltip.
> 3. **Click a hex → zoom to homes:** camera flies down (some tilt), columns fade, homes appear as green/yellow/red dots with a quick stagger; click a dot → plan card; "← Back to map" flies back out.
> 4. **Performance:** ~60 fps; precompute; H3HexagonLayer with extrusion, ScatterplotLayer, smooth transitions.
> Commit after each step and tell me exactly what to click to see: replay → freeze sweeps in → hexes rise → click a hex → homes appear → click a home → plan card.

### Phases 5 and 7 (not yet written)
- Phase 5, storm mode: bursts appear during replay, the agent dispatches crews to curb valves, pressure recovers, Supabase Realtime.
- Phase 7: deploy to Vercel (env vars there), update webhooks to the Vercel URL, demo script + video (OBS/Loom + CapCut on Windows), backtest number vs Houston 2021 leak calls, money estimate (video only).

---

## 8. Stack, environment variables, data

- Next.js (App Router) + TypeScript + Tailwind, deck.gl + MapLibre (free basemap, no key), h3-js, Vitest, Supabase, Vercel (later), Agentation (dev only, endpoint http://localhost:4747).
- **Real data:** OpenStreetMap footprints (© OpenStreetMap contributors, ODbL); Open-Meteo archive for Feb 13–19, 2021 per neighborhood + live forecast.
- **Simulated (labeled):** home attributes (foundation, year built, pipes, insulation, outdoor faucets, indoor shutoff, elderly, mobility, lives alone), call answers, crews, pressure model constants (one config file).
- **Real-world path:** Harris Central Appraisal District parcels (year built; foundation type to verify), utility pressure sensors, the home survey, photos/calls for confirmation.
- `.env.local` variable **names** (values never in the repo): `NEXT_PUBLIC_SUPABASE_URL` (ends at `.supabase.co`, no `/rest/v1/`), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secret; server and scripts only), `LLM_PROVIDER` (`pregenerated` | `gemini` | `anthropic`), `GEMINI_API_KEY`, `GEMINI_MODEL`, `ANTHROPIC_API_KEY` (unused). Phase 3.6 adds the console password variable. Phase 4 adds `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `DEMO_ALLOWED_NUMBERS`, `PUBLIC_BASE_URL`.
- Supabase project `freezeline`: Data API on, auto-expose new tables OFF, automatic RLS ON. Free plan: 2 active projects, 500 MB, pauses after 1 week idle. SQL run: `001_schema.sql`, `002_phase3.sql`, `003_phase35.sql`.
- Pre-generated messages: 98 variants in `data/messages.json`; `npm run messages:check`.

---

## 9. New teammate setup

1. Accept the GitHub invite, then `git clone https://github.com/danishsanwar2008-a11y/freezeline.git`, `cd freezeline`, `npm install`.
2. Accept the Supabase invite (organization member, Developer role). From the `freezeline` project dashboard you can browse tables and copy the keys yourself (Project Settings → API Keys). Developer has full access to project data, so be careful with deletes and re-seeds.
3. `Copy-Item .env.example .env.local` and fill it in. Get your own free Gemini key in Google AI Studio if you need the photo check. Never commit `.env.local` or paste keys into chats.
4. `npm run dev`, open http://localhost:3000/console.
5. Optional: the Claude Code skill setup in §7.

---

## 10. Setup problems and fixes (Windows)

- PowerShell blocked scripts → `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.
- `claude mcp add … -- …` failed because PowerShell eats `--` for .ps1 → use `claude.cmd`. Windows MCP needs `cmd /c npx`.
- Seed failed "Invalid path specified in request URL" → Supabase URL must end at `.supabase.co`.
- Supabase "destructive operations" warning on SQL with drop/revoke → safe after confirming the project is freezeline.
- Never copy long SQL from terminal output (it truncates); read the file.
- Port 3000 held by an old Node process → free the port before restarting. Dev server stopped by low memory → close heavy apps. Exiting Claude Code with "Exit and stop tasks" also stops the dev server.
- Usage limits pause work; keep the laptop awake and plugged in for auto-continue.
- MapLibre 6 worker is copied into public/ on postinstall.
- New CLI tools installed by uv aren't found until PATH is updated → `uv tool update-shell`, then open a new tab (or `$env:PATH = "C:\Users\<you>\.local\bin;$env:PATH"` for one tab).
- `gh` not found inside an already-running Claude Code session after installing it → restart the session or use `C:\Program Files\GitHub CLI\gh.exe`.
- In PowerShell, write skill files with `[IO.File]::WriteAllText(...)`, not `Set-Content` (Windows PowerShell adds a byte-order mark that can break the skill header).
- `npx skills add`: Claude Code is not in the "always included" list; type `claude`, press Space on Claude Code, choose Copy (symlinks can need admin rights on Windows).
- Taste skill's browser checker needs Node 22+.

---

## 11. Usage and cost strategy

- Plan in chat, send finished prompts; `/clear` between phases or `/compact` mid-phase; plan mode for big phases.
- Headroom compresses tool output to save tokens; the headroom-compression skill makes Claude fetch originals for exact details (errors, SQL, counts). If wrapping breaks, `headroom unwrap claude` and use plain `claude`.
- At the hackathon: split work across teammates' Claude accounts, check sponsor credits, or a capped pay-as-you-go plan.
- Free services: Vercel, Supabase, MapLibre/OpenFreeMap, Open-Meteo, Gemini free tier, Twilio trial credit, ElevenLabs free minutes.
- ⚠️ Check HackPrinceton (and TreeHacks) rules on code written before the event; this run may need to be rebuilt on site. It gives the prompts, CLAUDE.md and lessons.

---

## 12. Lessons from Standard Response and the idea council

- Standard Response (HackPrinceton-style winner, evacuation coordination for people with disabilities): big "5 of 46 homes answered," one-dot-per-home grid, funnel, call floor with live transcript and field tiles; residents never saw the console; at the table, a judge claims a house and gets a call; honesty rule in code; one hard proof number; real-world validation quote.
- For FreezeLine: copy the clarity, not the scale. Get a backtest number vs Houston 2021 leak calls and one quote from a Houston water-utility worker or plumber.
- Council review (Nov 7): test on Uri, don't train on one storm; match the opening statistic to what FreezeLine fixes (the 246 Uri deaths were mostly hypothermia from outages, not burst pipes; lead with "1 in 4 Houston water customers had a leak" and $5.8B in claims); answer "where did you get my number?" with opt-in sign-up through the utility or city; renters can't change the house, so lead with dripping, opening cabinets and the shutoff location.

---

## 13. Research facts and sources

- Houston "do NOT drip" notice, Feb 17, 2021 (City of Houston weather update); AP: Southern cities faced a new crisis, no water, partly from dripping.
- 1 in 4 Houston water customers had a leak (City of Houston, Mar 2021); Houston Public Works received ~11,000 water-issue calls; ~456K Texas claims; $5.8B projected payouts (TDI).
- TCEQ: low pressure below 20 psi can require a boil-water notice — https://www.tceq.texas.gov/drinkingwater/notices/bwn/understanding-bwns
- Open-Meteo archive API — https://open-meteo.com/en/docs/historical-weather-api
- Supabase free plan — https://supabase.com/pricing · Access control and roles — https://supabase.com/docs/guides/platform/access-control
- WKRN News 2 (Nashville), "What to do if your pipes burst" (Nashville Metro Water Services guidance; see §4 caveat).
- Twilio trial: only verified numbers. ElevenLabs Conversational AI can call through a connected Twilio number. iMessage has no official API.

---

## 14. Open questions

1. Dot colors: status (current) or priority (whiteboard legend)?
2. Insurers: in scope as a third audience (area-level only) or dropped?
3. Sign-up: address or water-bill account number (or both)? Home survey questions.
4. Is Houston leak/311 data available for Winter Storm Elliott (Dec 2022) as a test storm?
5. HackPrinceton/TreeHacks rules on pre-written code.
6. Confirm the burst/meter wording with Houston Public Works guidance.
