# FreezeLine design system: City Operations

DESIGN.md is the source of truth for how FreezeLine looks. The rules in CLAUDE.md ("UX principles" and "Visual design rules") come first; this file turns them into tokens and components. All tokens live in `src/app/globals.css` (CSS variables + Tailwind `@theme`) and, for map and chart colors, in `src/lib/riskScale.ts`. Never hard-code a color anywhere else.

## 1. Theme

A calm, technical operations console for a water utility during a hard freeze. It should read like an ops room at 3 AM: a dark, quiet frame with a lot of data on it, where the only things that light up are the things that need someone's attention.

- **Dark, map-first.** The map is the protagonist; the sidebar is a column of dense, scannable panels.
- **One accent (ice blue)** for actions, focus and the agent's lines. Everything else is neutral ink, or a color that *means* something (home status, need shading, pressure).
- **Flat.** Hierarchy comes from a short surface ladder and 1px hairlines, not from shadows or gradients.
- **Honest.** Simulated data is always labeled, and confirmed vs estimated always looks different (solid vs dashed).
- **Lead with actions, not data.** Each panel has one headline number with a visual; details are collapsed underneath.

## 2. Color roles

Dark theme only. Every color has exactly one job, and no job borrows another's color.

| Role | Token | Value | Use |
|---|---|---|---|
| Canvas | `--bg` | #0b1016 | Page background, inset tiles inside panels |
| Surface | `--surface` | #121a23 | Top bar, sidebar, map overlays, tooltips |
| Panel | `bg-bg/40` on surface | — | Sidebar cards (one step down from the surface) |
| Hairline | `--border` | #1f2b38 | Every 1px border and divider |
| Ink | `--text` | #e6edf3 | Headlines, numbers, body |
| Muted ink | `--muted` | #8a9bae | Labels, captions, secondary lines |
| Accent (ice) | `--accent` | #7dd3fc | Primary buttons, focus rings, links, crew markers, chart lines. Actions only |
| Danger | `--danger` | #f87171 | Errors and failed agent steps |
| Sample tag | `--warn` | #fbbf24 | The "simulated" tag and the amber pressure band |

**Meaning colors (own scales, never mixed):**

| Scale | Tokens / source | Values |
|---|---|---|
| Home status (dots, Ready check) | `--status-*`, `STATUS_RGB` | ready #4caf7d green · needs help #e5484d red · waiting #f2c94c yellow · no answer #0c0e12 black with a light ring · not contacted #8a9bae gray |
| Hex need (% of homes needing action) | `NEED_STEPS` | 4 steps, faint → deep violet: Under 25% #1f1932 · 25–49% #402d7c · 50–74% #6d47d4 · 75% or more #a985f1 (on-screen swatches over the dark map; validated ΔE ≥ 15) |
| Water pressure | `--psi-ok` / `--psi-warn` / `--psi-bad` | green above 25 psi · amber 20–25 · red below 20 |

Status colors are for home status only. Violet is for hex need only. Pressure uses its own tokens. Color is never the only signal: every colored mark has a label, a count or an icon beside it.

## 3. Typography

- **Families:** Geist Sans for all UI text; Geist Mono for numbers that are compared or read in columns (counts, psi, temperatures, times) and the FREEZELINE wordmark. One family carries the hierarchy through size and weight.
- **Numbers:** always `tabular-nums`, with thousands separators ("8,034"), and they agree with their noun ("1 home", "2 homes"; `plural()`).

| Role | Size / weight | Use |
|---|---|---|
| Headline number | 24–30px / 600, tight tracking | The one big number per panel ("3,046 of 8,022 homes ready", "24.6 psi") |
| Panel title (eyebrow) | 11px / 500, uppercase, 0.12em tracking, muted | "READY CHECK", "WATER PRESSURE BY AREA" |
| Body | 14px / 400, line-height 1.4–1.5 | Crew lines, agent log entries, card text |
| Small | 12px / 400, muted | Explanations under a visual, legend rows |
| Caption | 11px / 400, muted | Assumption labels, "simulated" notes, chart keys |
| Micro | 10px | Chart threshold labels and tags only; never body copy |

Sentence case everywhere except panel eyebrows. No all-caps body, no bold display.

## 4. Components

- **Panel (`Card`)**: `rounded-panel` (12px), 1px hairline, `bg-bg/40`, 16px padding. An eyebrow title, then one headline number with its visual, then details. Long details go in `<details>` collapsed by default ("Compare: if everyone drips ▾").
- **Headline number + visual**: the number sits directly above its visual: a stacked status bar (Ready check), one dot per crew (Crews), funnel bars (Outreach), a line chart (pressure). No bare numbers in a list.
- **Fact tiles**: small `rounded-md` tiles on `--bg` with a muted label over a value ("Wind · 7 mph"). Facts as tiles, not sentences.
- **Buttons**: one primary per context. It is filled ice (`bg-accent text-bg`), `rounded-full`, 12–14px semibold. Secondary actions are text-only muted ("Not yet", "Skip", "Sign out"). Pending/working states change the label ("Sending…") and disable the button.
- **Approval card (Stage 2, crew proposals)**: amber hairline + 10% amber fill, a bold one-line title ("Stage 2 alert ready · needs supervisor approval"), the deterministic sentence, one muted reason line, then Approve / Not yet.
- **Agent log**: a status dot per entry (done green, pending ice, failed red, note gray), one-line summary, muted reason under it. Collapsed by default.
- **Map key (legend)**: top-left overlay, `<details>` open by default, three short sections (area shading, homes, crews), live counts right-aligned in mono.
- **Tooltips**: surface background, hairline, 8px radius, max ~270px wide. "Why this shade?" lists real vs simulated reasons with a small tag on each.
- **Confirmed vs estimated**: solid border for confirmed facts, dashed border + muted ink for estimated ones. Forecast lines are dashed; past lines are solid.
- **Empty / loading states**: a single muted sentence that says what will appear and what makes it appear ("Outreach hasn't run for this hour yet."), never a blank panel or a spinner alone. The map shows a soft pulse while loading.
- **Simulated labels**: the word "(sample)" in panel titles that show sample data, and the "Assumption: …" caption wherever a simulated assumption changes a number.

## 5. Layout

- **Desktop (≥1024px)**: a top bar (52px), the map filling the left, a 440px sidebar on the right that scrolls on its own. The timeline floats over the bottom of the map; the map key floats top-left; the selected home card floats top-right.
- **Below 1024px**: the map on top (58% of the viewport height, min 400px), the sidebar stacks underneath at full width.
- **Spacing**: a 4px base unit. 4 / 8 / 12 / 16 / 24px are the steps in use: 12px between sidebar panels, 16px inside panels, 8px between a number and its visual.
- **Sidebar order** (most urgent first): Ready check → Outreach → Help crews → Water pressure → Freeze readings → Agent.
- **Density**: officials expect to see a lot at once. Prefer one more row of data to more air, but never two headline numbers in one panel.

## 6. Depth

| Level | Treatment | Use |
|---|---|---|
| 0 | Canvas `--bg`, no border | Page, inset tiles |
| 1 | Surface `--surface` + hairline | Top bar, sidebar, map overlays |
| 2 | Panel (`bg-bg/40`) + hairline inside the surface | Sidebar cards |
| Overlay | Surface at 90–95% + `backdrop-blur` + `shadow-lg` | Things floating over the map only (map key, home card, timeline, tooltips) |
| Focus | 2px ice outline, offset 2–4px | Every focusable control |

No gradients on panels. The only shadows are on overlays that float above the map, so they separate from the basemap.

## 7. Do's and don'ts

**Do**
- Keep ice blue for actions, focus and the agent. One filled primary button per context.
- Give every number a visual and a noun that agrees with it.
- Use the 4 violet steps for hex need and the status colors for home status, exactly as the map key shows.
- Label every simulated number and assumption where it's shown.
- Use dashed for estimated/forecast, solid for confirmed/past.
- Collapse secondary detail; keep the headline visible.
- Keep pressure colors on their own tokens, with a text band label next to the psi.

**Don't**
- Don't use a status color for anything that isn't a home's status, or violet for anything but hex need.
- Don't show numeric risk scores, attribute tables or tabs (they stay in code and tests). Say "Watch", not "Medium".
- Don't put a second accent color in the chrome, or gradients and glows on panels.
- Don't round buttons to anything other than full pills (actions) or `rounded-md` (tiles), or panels to anything other than 12px.
- Don't show homeowner instructions, transcripts or "you" wording on City Operations.
- Don't animate layout; motion is limited to opacity fades, the crew drive and the replay, and respects reduced motion.

## 8. Responsive

- **1440px**: full layout; the sidebar shows every panel without horizontal scroll.
- **768px**: map on top, sidebar panels stacked full width; the map key stays top-left and can be collapsed; the mode toggle shows its short labels ("Live", "Replay: Uri 2021").
- **390px**: same stack; touch targets at least 40px tall for buttons and toggles; long crew lines wrap rather than truncate.
- Text never truncates a number. Area names may truncate with an ellipsis only in fixed-width tiles.

## 9. Agent prompt guide

When building or changing City Operations UI:
1. Read CLAUDE.md (Visual design rules) and this file. CLAUDE.md wins any conflict.
2. Use the tokens in `src/app/globals.css` and the scales in `src/lib/riskScale.ts` / `src/lib/pressure.ts`; never a raw hex in a component (SVG fills reference `var(--token)`).
3. Every panel: eyebrow title → one headline number with its visual → details (collapsed if long) → a muted caption for assumptions or "simulated".
4. Officials' third-person wording; plurals through `plural()`.
5. Check at 1440px and 768px with playwright-cli, then run the web-design-guidelines audit on the changed files.

### Influences
- **IBM (Carbon)**: the 4px spacing grid, one chromatic accent reserved for actions/links/focus, hierarchy by size and weight within one family, dense layouts where customers expect to see a lot, and hairlines + surface change instead of shadows.
- **Sentry**: a dark ops-console frame with dense scannable panels, uppercase tracked eyebrows for a console cadence, a strict single-primary-action hierarchy, and status semantics kept separate from accent colors.
- **Linear**: a short surface ladder with 1px hairlines carrying all depth, a 12px panel radius, a focus ring in the accent, tight tracking on large numbers, and mono reserved for data.
No brand marks, fonts or palettes were copied: the palette, scales and wording are FreezeLine's own.
