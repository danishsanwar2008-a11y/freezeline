# Taste review: City Operations sidebar (10 changes, not applied)

Read-only review with design-taste-frontend (tasteskill 2.5), applying its app-screen rules ("Taste on app screens" in `~/.claude/CLAUDE.md`). No app code was changed. Project rules (CLAUDE.md, DESIGN.md) win over Taste's house rules; where a change conflicts with DESIGN.md, it waits for a decision.

- **Scope:** the pressure panel, the Ready check and Crews, as requested. The Outreach and Agent panels were not reviewed.
- **State reviewed:** replay hour Tue, Feb 16, 6 AM, using saved data (the agent was not run).
- **Measurements:** sizes and contrast were measured in the browser.
- **Screenshots (git-ignored):** `demo-screens/taste-review-sidebar-1440.png`, `taste-review-sidebar-768.png`, `taste-review-pressure-1440.png`, `taste-review-crews-1440.png`.
- **Rule files:** paths below are relative to `~/.claude/skills/design-taste-frontend/`.

## Summary

| # | Component | Change | Taste rule (file) | DESIGN.md conflict |
|---|---|---|---|---|
| 1 | Crew number discs | Filled ice disc + bold number → hairline disc, muted number at 500 | `references/cards.md` "The fragment on it"; `references/layout-v4.md` §5 | None |
| 2 | Headline numbers, psi, tile values, buttons | Weight 600 → 500, tracking kept | `references/layout-v4.md` §5 | Yes: §3 says 600 |
| 3 | Smallest text | Sentences 12 → 13px, captions 11 → 12px, chart labels 10 → 11px | `references/system.md` Type; `references/cards.md` | Yes: §3 sizes |
| 4 | Sentences officials act on | Muted grey → main text colour | `references/system.md` Type | None |
| 5 | Pressure headline numbers | Main text colour above 25 psi; colour only amber/red | `references/system.md` Colour | None (matches §1) |
| 6 | Chart threshold labels | Remove the repeated in-chart labels | `references/copy.md` "Each fact once"; 11px floor | None |
| 7 | Panel border (glass sidebar) | Border → main text colour at ~10–12% + 1px inner top highlight | `references/cards.md` "The card" | None |
| 8 | "Simplified model ⓘ" pill | Hit area ≥ 32px desktop / 44px touch; fade uses `--m-in` + `--ease` | `SKILL.md` §5 tap-size; `references/motion.md` | None (§8 asks 40px at 390) |
| 9 | Panel titles | 11px uppercase 0.12em → 13px/500 sentence case | `references/system.md` Type | Yes: §3 chose uppercase |
| 10 | Standby crew rows | `truncate` → wrap | `references/layout-v4.md` §4 | None (§8 already agrees: a bug) |

## The 10 changes

### 1. Crew number discs
- **Component:** `src/components/console/CityCards.tsx`, `CrewIcon`.
- **Change:** the 20 filled ice discs with bold numbers become a hairline disc with a muted number at weight 500. Ice stays only on the dot strip and the map markers.
- **Taste rules:**
  - `references/cards.md`, "The fragment on it": the accent once per component; chips as ink tints.
  - `references/layout-v4.md` §5: never weight 700.
- **DESIGN.md conflict:** none.

### 2. Headline weights
- **Components:** the big numbers (`.stat` in `src/app/globals.css`, used by the Ready check and Crews), the psi values (`src/components/console/PressureMonitor.tsx`), the tile values and the buttons (`.btn`).
- **Change:** weight 600 → 500, keeping the tight tracking.
- **Taste rule:** `references/layout-v4.md` §5: text is 400/500 only, never bold and big.
- **DESIGN.md conflict:** yes. §3 (Typography) sets the headline number at 600, so §3 needs updating first.

### 3. Smallest text
- **Components:** the Ready-check footer, the crew-rule note and queue line (`CityCards.tsx`), and the pressure assumption line and chart labels (`PressureMonitor.tsx`).
- **Change:**
  - Sentences: 12px → 13px.
  - Captions: 11px → 12px.
  - Chart labels: 10px → 11px.
- **Measured today:** 48 pieces of text at 12px, 25 at 11px and 8 at 10px in the sidebar.
- **Taste rules:**
  - `references/system.md`, Type: nothing under 13px.
  - `references/cards.md`: dense UI never under 11px.
- **DESIGN.md conflict:** yes. §3 sets Small at 12px, Caption at 11px and Micro at 10px, so §3 needs updating first.

### 4. Ink for sentences officials act on
- **Components:**
  - the Crews queue line ("640 more homes need a crew…", `CityCards.tsx`);
  - the "Run the agent to prepare a Stage 2 alert" line (`PressureMonitor.tsx`);
  - "Homes that need action tonight" (Ready check, `CityCards.tsx`).
- **Change:** muted grey (6.4:1) → the main text colour (`--text`).
- **Taste rule:** `references/system.md`, Type: text people read is in ink at 7:1; muted is only for labels and meta.
- **DESIGN.md conflict:** none.

### 5. Pressure numbers
- **Component:** `PressureMonitor.tsx`, the per-area psi headline.
- **Change:** areas above 25 psi show the number in the main text colour. Only amber (20–25) and red (below 20) areas colour the number. The band label keeps its `--psi-*` colour, as CLAUDE.md requires.
- **Taste rule:** `references/system.md`, Colour: the interface stays 90–95% neutral, and colour marks state.
- **DESIGN.md conflict:** none. It matches §1: only what needs attention lights up.

### 6. Chart threshold labels
- **Component:** `PressureMonitor.tsx`, `PressureChart`.
- **Change:** remove the 10px "Stop new drips" and "Boil-water notice" labels repeated inside all four charts. The legend under the list already names both lines.
- **Taste rules:**
  - `references/copy.md`: each fact once.
  - The 11px floor (`references/cards.md`).
- **DESIGN.md conflict:** none.

### 7. Panel separation for the glass sidebar
- **Components:** `Card` (`CityCards.tsx`) and the pressure panel (`PressureMonitor.tsx`).
- **Change:** the panel border measures 1.22:1 against the sidebar. Move it to the main text colour at about 10–12%, plus a 1px inner top highlight of white at 5–7%. Without this, panels run together once the sidebar's blur arrives (the glass sidebar is allowed by CLAUDE.md in the color-scheme phase).
- **Taste rule:** `references/cards.md`, "The card".
- **DESIGN.md conflict:** none.

### 8. The "Simplified model ⓘ" pill
- **Component:** `PressureMonitor.tsx`, `InfoTip`.
- **Change:**
  - The pill is 23px tall. Give it a hit area of at least 32px on desktop and 44px on touch.
  - Its tooltip fade uses the `--m-in` and `--ease` tokens instead of Tailwind's default curve.
- **Taste rules:**
  - `SKILL.md` §5: tap-size.
  - `references/motion.md`: one ease.
- **DESIGN.md conflict:** none. §8 already asks for at least 40px touch targets at 390px.

### 9. Panel titles
- **Components:** `.eyebrow` (`src/app/globals.css`), used by `Card` and the pressure panel.
- **Change:** 11px uppercase with 0.12em tracking → 13px/500 in sentence case.
- **Taste rule:** `references/system.md`, Type: labels are 13px at 500, never tracked capitals.
- **DESIGN.md conflict:** yes. §3 chose uppercase tracked panel titles on purpose (the "console cadence" influence), so this needs a decision before anything changes.

### 10. Standby crew rows
- **Component:** `CityCards.tsx`, `CrewsPanel`, the standby list.
- **Change:** `truncate` → wrapping text.
- **Taste rule:** `references/layout-v4.md` §4: nothing cut off, no ellipsis.
- **DESIGN.md conflict:** none. §8 already says long crew lines wrap rather than truncate, so this is a straight bug. It doesn't show at 6 AM on Feb 16 because all 20 crews are busy.

## Next steps
- Items 2, 3 and 9 need a DESIGN.md update (design-md-library) in the color-scheme phase before any code changes.
- Items 1, 4, 5, 6, 7, 8 and 10 can be applied directly.
