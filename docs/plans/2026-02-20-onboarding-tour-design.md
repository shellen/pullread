# Onboarding Tour Redesign

## Goal

Replace the existing 5-step setup-only onboarding wizard with a unified 6-step flow that combines setup (first run) and feature discovery (always). Add a re-launch mechanism so users can revisit the tour anytime.

## Architecture

The tour reuses the existing modal slideshow pattern (`onboarding-overlay` + `onboarding-card`) and extends `renderOnboardingStep()` with feature discovery steps. A `_tourMode` boolean controls whether setup steps are shown. First run shows all 6 steps; re-launch shows 5 steps (skipping setup).

## Steps

### Step 1: Welcome

**First run:** Full intro — "Welcome to PullRead" with updated feature pills: Bookmark sync, Markdown files, Summaries, Focus Mode, Text-to-Speech.

**Re-launch:** Shorter — "What's in PullRead" with the same feature pills. Serves as a quick feature overview.

### Step 2: Setup (first run only, skipped on re-launch)

Combines output folder and feed connection into one step:
- **Top:** Output path input with folder picker button (compact, one row)
- **Bottom:** Feed URL input with discovery, feed list with remove buttons, service hints (Instapaper, Pinboard, Raindrop, Pocket, Substack, WordPress)

The old "More Ways to Save" step (share extension, services menu, cookies toggle) is removed from onboarding — these are available in Settings.

### Step 3: Reading

Four features shown as icon + title + one-liner in `ob-glass-card` layout:
- **Focus Mode** (`f`) — Dims everything except the current paragraph
- **Highlights** (`h`) — Select text, pick a color, view notes in the margin
- **Table of Contents** — Auto-generated navigation for long articles
- **Reading Progress** — Position saved and restored automatically

### Step 4: Search & Organize

- **Search operators** — `is:unread`, `tag:AI`, `feed:NYT`, `has:highlights`, and more
- **Pinned filters** — Save up to 3 frequent searches as quick-access buttons
- **Favorites** — Heart icon on any article, find with `is:favorite`
- **Explore** — Tag cloud and topic connections across your library

### Step 5: Listening & Summaries

- **Listen** — Text-to-speech with free on-device voice or premium options
- **Summaries** — One-click summary saved to each article
- **Reviews** — Thematic roundups of your recent reading

### Step 6: Ready

- 8-key shortcuts grid: `j`/`k` (navigate), `/` (search), `[` (sidebar), `h` (highlight), `n` (notes), `f` (focus), `Space` (play/pause)
- "Open Guide" link to the full built-in documentation
- "Get Started" / "Done" button

## Re-launch

**Triggers:**
- Settings page: "Show Tour" button in the About section
- Dashboard: "Tour" quick action button alongside the existing Guide button

**Behavior:**
- Sets `_tourMode = true` and opens the overlay
- Skips Step 2 (setup) — goes Welcome → Reading → Search → Listening → Ready
- Progress bar shows 5 segments instead of 6
- "Skip" available on every step

## Persistence

- Same `localStorage` key: `pr-onboarded` = `'1'`
- Set when user completes the tour (clicks "Get Started" / "Done")
- Re-launch does NOT clear this key — it just shows the feature steps

## Files to Modify

| File | Change |
|------|--------|
| `viewer/11-modals.js` | Rewrite `renderOnboardingStep()` with 6 steps, add `showTour()`, update `OB_TOTAL_STEPS` logic |
| `viewer/03-settings.js` | Add "Show Tour" button to About section |
| `viewer/04-article.js` | Add "Tour" button to dashboard quick actions |
| `viewer.css` | Minor tweaks if needed (existing `ob-*` classes should cover it) |

## Not in Scope

- Spotlight/pointer-based tours (pointing at real UI elements)
- Animated screenshots or illustrations in tour steps
- Per-feature contextual tooltips
- Localization
