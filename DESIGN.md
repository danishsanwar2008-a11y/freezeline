# FreezeLine design system: City Operations

DESIGN.md is the source of truth for how FreezeLine looks. The rules in CLAUDE.md ("UX principles" and "Visual design rules") come first; this file turns them into tokens and components. Tokens live in `src/app/globals.css` (CSS variables under `.console-theme` + Tailwind `@theme`); map and chart colors live in `src/lib/riskScale.ts` (`NEED_STEPS`, `STATUS_RGB`, `MAP_LOOK`). Never hard-code a color anywhere else.

## 1. Theme

Professional emergency-management software for a water utility during a hard freeze. The map is the protagonist: an off-white city with blue cells where homes need action and one dot per home. Around it float a few dark Midnight Navy boxes, each holding one idea, like instrument panels laid over a paper map.

- **Light map, dark boxes.** The basemap is off-white and quiet; the boxes are Midnight Navy with Cloud White text. The map shows *where*; the boxes say *how much* and *what next*.
- **One accent: Action Blue** for buttons, active states, selections, routes and chart lines. Everything else is neutral, or a color that *means* something (home status, need shading, pressure).
- **Separate boxes, not a sidebar.** Each metric is its own rounded box with space around it, so the map shows between them. Left boxes are slightly see-through; right boxes are solid.
- **Honest.** Simulated data is always labeled, confirmed vs estimated always looks different (solid vs dashed), and the agent's trace shows only steps it actually ran.
- **Lead with actions, not data.** One headline number per box with its visual; details collapse.
- **Signature detail:** quick views grow out of the house or crew they describe, with a small tail pointing at it; crews drive real streets.

## 2. Color roles

| Role | Token | Value | Use |
|---|---|---|---|
| Top bar | `.console-topbar` `--surface` | Midnight Navy #101c2e | The bar across the top |
| Box | `--surface` | #1a2a40 | Every metric box (a step lighter than the top bar) |
| Inset | `--bg` | Midnight Navy #101c2e | Tiles, bar tracks and rows inside a box |
| Hairline | `--border` | #2d3f5a | 1px borders and dividers inside boxes |
| Ink | `--text` | Cloud White #f3f6fa | Headlines, numbers, body (13.4:1 on a box) |
| Muted ink | `--muted` | #a9b8cc light gray-blue | Labels, captions (7.2:1 solid, 5.7:1 see-through) |
| Action Blue | `--accent` | #4a83cc | Marks, chart lines, bars, selected pills, crew routes |
| Button fill | `--btn` | #3c75be | Filled primary buttons (white label 4.7:1) |
| Link ink | `--accent-ink` | Ice Blue #a9d9f5 | Small blue text and links on the navy boxes (9.6:1) |
| Deep Blue | — | #1d3557 | Top-bar insets, crew van outline and number badge |
| Map | `MAP_LOOK` | CARTO Positron + gray wash → #eaecec | The basemap |
| Danger / warn / ok | `--danger` `--warn` `--ok` | #f87171 / #fbbf24 / #4ade80 | Errors, the amber pressure band, the green band (light shades read on navy) |

**Meaning colors (own scales, never mixed):**

| Scale | Source | Values |
|---|---|---|
| Home status (dots, Homes contacted box) | `STATUS_RGB`, `--status-*` | ready #38a779 green · needs help #e05252 red · waiting #e8bc4f yellow · no answer #111827 black · not contacted #94a3b8 gray. On the map every dot has a thin dark ring over a light halo, so it reads on the off-white map and on the darkest cells |
| Cell need (% of homes needing action) | `NEED_STEPS` | 4 steps, **darker = more homes need action**: Under 25% #a3cff1 · 25–49% #5f9bd8 · 50–74% #2a64ad · 75–100% #0e3570. 94% opaque; pale cells have a mid-blue outline, dark cells a white hairline. dataviz: every adjacent pair ΔE ≥ 16.5 |
| Water pressure | `--psi-ok` / `--psi-warn` / `--psi-bad` | green above 25 psi · amber 20–25 · red below 20 |

Status colors are for home status only; blue cells are for need only; pressure uses its own tokens. Color is never the only signal: every colored mark has a label, a count or an icon beside it.

## 3. Typography

- **Families:** Geist Sans for all UI text; Geist Mono for numbers read in columns (counts, psi, minutes, times) and the FREEZELINE wordmark.
- **Weights:** 400 and 500 only. Big numbers get size and tight tracking, never bold.
- **Numbers:** `tabular-nums`, thousands separators, and they agree with their noun (`plural()`).

| Role | Size / weight | Use |
|---|---|---|
| Headline number | 26–28px / 500, tracking −0.02em | The one big number per box ("8,022 homes contacted", "24.6 psi") |
| Box title | 13px / 500, sentence case, muted | "Water pressure by area", "Crews", "Decision trace" |
| Body | 14px / 400 | Crew rows, trace steps, quick-view lines |
| Small | 13px / 400 | Explanations under a visual, legend rows |
| Caption | 12px / 400, muted | "Simulated" notes, assumption lines, chart keys |
| Micro | 11px | Chart axis/threshold labels and tags only |

Sentence case everywhere. No all-caps titles, no text under 11px.

## 4. Components

- **Box (`Panel`)**: 14px radius, 1px hairline at Cloud White 10%, restrained shadow (`0 2px 10px` navy 22%), 16px padding. Header row: the title, an optional control (area picker), and a chevron that collapses the box to its header and opens it again. Solid on the right (`tone="solid"`); 92% opaque with a light blur on the left (`tone="glass"`).
- **Hide panels**: one chevron button in the top bar collapses every box so only the map, the home dots and the timeline remain; pressed again, the boxes come back as they were.
- **Headline number + visual**: the number sits directly above its visual: a stacked status bar (Homes contacted), one dot per crew (Crews), a line per area (pressure). No bare numbers in a list.
- **Homes contacted**: headline "8,022 homes contacted"; under it the stacked status bar and the one status key with counts (ready, waiting, needs help, no answer, not contacted); then Texted → Called → Door check as three small tiles. "(sample)" in the title.
- **Crews**: headline "N of 20 crews helping" + dot strip; an area picker (hover or click opens Heights, Montrose, Third Ward, Meyerland); the 5 crews of the picked area as rows: crew number disc, where it's headed, arrival time. Clicking a row opens that crew's quick view on the map.
- **Quick view (`Callout`)**: a navy box with a small tail that points at the house or crew it belongs to, grows out of it (scale + fade, 200ms) and follows the map as it pans. House: address, area, status with its dot, level, one line on what is happening (replied / doing the steps / Crew 7 on the way · 4 min / no answer, door check planned), solid when confirmed, dashed when estimated. Crew: where it's headed, miles, minutes left, the household's needs.
- **Decision trace**: the agent's steps for this hour, in the order they ran, from the real run (never a canned animation): a dot per step (done filled, running pulsing, waiting outlined in amber), the step name on the left and its result on the right, a progress strip ("Step 5 of 9"). The final action sits in a box. A Stage 2 alert always shows "Waiting for supervisor approval" with Approve / Not yet.
- **Also notified (simulated)**: a short list under the trace when the agent runs: maintenance contractors, the utility control room, city officials, the mayor's office, each tagged "simulated · nothing is sent".
- **Buttons**: one filled Action Blue primary per context (Run agent, Approve); secondary actions are quiet text buttons ("Not yet", "Sign out"). Working states change the label ("Running…") and disable the button.
- **Map key**: top-left, collapsible: the 4 cell steps ("Cells · darker = more homes need action") and the crew van ("blinks on the way") + route line. Home dot colors live only in the Homes contacted box.
- **Tooltips**: navy box, hairline, 8px radius, max ~270px. "Why this shade?" lists real vs simulated reasons with a tag on each.
- **Confirmed vs estimated**: solid border for confirmed facts, dashed border + muted ink for estimated ones. Forecast lines are dashed; past lines are solid.
- **Empty / loading states**: one muted sentence that says what will appear and what makes it appear ("Outreach hasn't run for this hour yet. Run the agent to text these homes."), never a blank box or a spinner alone.

## 5. Layout

- **Desktop (≥1024px)**: a 52px Midnight Navy top bar with the name, **Run agent** on the left (always Auto; only a Stage 2 alert waits for approval, in the trace), a quiet **Winter Storm Uri** label (hairline chip, not a control; there is no Live mode), Sign-ups, ⓘ, Sign out and Hide panels on the right. Below it the map fills the whole window. Boxes float over it in two columns with 12px gaps:
  - Left (300px, see-through): Map key, Homes contacted.
  - Right (380px, solid): Water pressure by area, Crews, Decision trace (fills the remaining height and scrolls inside itself).
  - Bottom left, under the left column: the storm replay timeline with this hour's readings (now, feels like, wind, hours below 20°F), 702px wide and 91px tall from 1280px (the left column stops 12px above it and scrolls); from 1024 to 1279px it runs from the left edge to the right column and drops the wind reading so it stays one line.
- **Below 1024px**: the map on top (58% of the viewport, min 400px) with the timeline along its bottom edge; every box, the map key included, stacks underneath at full width in the same order (map key, Homes contacted, pressure, crews, decision trace). Nothing floats over the map at this width.
- **Spacing**: a 4px base unit; 12px between boxes and from the window edge, 16px inside boxes, 8px between a number and its visual.
- **Fit**: at 1440×900 every box is visible without scrolling the page; only the decision trace scrolls inside itself.

## 6. Depth

| Level | Treatment | Use |
|---|---|---|
| Map | Off-white basemap, blue cells, dots | The ground |
| Box | `--surface` + hairline + restrained shadow | Every floating box, the timeline, quick views |
| Inset | `--bg` inside a box | Tiles, rows, bar tracks |
| Focus | 2px Action Blue outline, 2px off | Every focusable control |

No gradients on boxes. Shadows only on things floating over the map.

## 7. Do's and don'ts

**Do**
- Keep Action Blue for actions, selections, routes and chart lines; one filled primary per context.
- Give every number a visual and a noun that agrees with it.
- Use the 4 blue steps for need and the status colors for home status, exactly as the boxes show.
- Label every simulated number, route and notification where it's shown.
- Let a quick view point at the thing it describes.
- Let any box collapse to its title; keep the headline visible when open.

**Don't**
- Don't use a status color for anything that isn't a home's status, or the blue cell steps for anything but need.
- Don't show numeric risk scores, attribute tables or tabs. Say "Watch", not "Medium".
- Don't add a second accent, gradients or glows; don't use bold weights.
- Don't show homeowner instructions, transcripts or "you" wording on City Operations.
- Don't animate layout: motion is limited to fades, the quick view growing from its dot, the crew driving its route and the replay, and all of it respects reduced motion.

## 8. Responsive

- **1440×900**: full layout, every box visible, timeline at the bottom left under the left column.
- **1024–1279px**: columns narrow to 280px / 340px; the timeline spans from the left edge to the right column (648px at 1024).
- **768px**: map on top, boxes stacked full width; the map key starts collapsed; the top bar wraps Run agent onto its own row if needed.
- **390px**: same stack; touch targets at least 44px; crew rows wrap rather than truncate.
- Text never truncates a number.

## 9. Agent prompt guide

When building or changing City Operations UI:
1. Read CLAUDE.md (Visual design rules) and this file. CLAUDE.md wins any conflict.
2. Use the tokens in `src/app/globals.css` and the scales in `src/lib/riskScale.ts`; never a raw hex in a component (SVG strokes reference `var(--token)`).
3. Every box: `Panel` with a sentence-case title and a collapse chevron → one headline number with its visual → details → a muted caption for assumptions or "simulated".
4. Officials' third-person wording; plurals through `plural()`.
5. Check at 1440px and 768px with playwright-cli, then run the web-design-guidelines audit on the changed files.

### Influences
- **IBM (Carbon)**: the 4px spacing grid, one chromatic accent reserved for actions and selection, hierarchy by size and weight within one family, dense boxes for people who need to see a lot.
- **Sentry**: an ops-console frame with dense scannable boxes, a strict single-primary-action hierarchy, status semantics kept apart from the accent.
- **Linear**: dark surfaces carried by 1px hairlines, a 12–14px radius, a focus ring in the accent, tight tracking on large numbers, mono reserved for data.
- **The user's earthquake reference**: separate floating boxes over the map, see-through on the left and solid on the right, a step-by-step decision trace.
No brand marks, fonts or palettes were copied: the palette (Midnight Navy, Action Blue, Ice Blue, Cloud White), scales and wording are FreezeLine's own.
