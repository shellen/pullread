# Home Variants Design

## Problem

The Home page ("For You" tab) is a grab-bag of sections — daily rundown, section rundown, continue reading, reviews, connections, recent unread, topics, quick actions — piled vertically with no clear hierarchy. It tries to do everything at once and doesn't do any one thing well.

## Solution

Replace the current "For You" tab with 3 purpose-built Home variants, each accessible via a tab. Keep the current Sources/Stats/Tags tabs untouched.

### Tab Bar

```
Brief | Sections | Spotlight | Sources | Stats | Tags
```

The first three are the new Home variants. The last three are existing Explore tabs, unchanged.

Default tab: **Brief** (the quick morning-briefing experience).

---

## Variant 1: Brief

**Goal:** Apple News / Google News morning briefing. Just enough information to get a handle on what's happening before diving in.

### Layout

1. **Mini Treemap** — Sections as colored blocks, proportional to unread article count. Each block shows the section label and count. Tappable to filter by section. Compact (120-150px tall). Uses `SECTION_LABELS` from `02-utils.js` for display names and a fixed color palette per section key.

2. **Lead Story** — Single featured card: hero image (full-width), headline, source, excerpt (2 lines). Chosen as the highest-scoring unread article via `magicScore()`.

3. **Section Headlines** — One group per section (only sections with unread articles). Each group: section name header, then up to 3 headline rows (title + source + relative time). Sorted by Magic score within each section. Sections ordered by total unread count descending.

4. **Continue Reading** — Same as current: partially-read articles with progress indicator. Max 3 cards.

### Mobile

Single column. Mini treemap wraps to 2 rows if needed. Everything stacks vertically.

---

## Variant 2: Sections

**Goal:** Yahoo-style portal. Section blocks with featured article + headline list, organized in a scannable grid.

### Layout

**Section Blocks** arranged in a 2-column grid (desktop), single column (mobile). Each block:

- **Section header** with section icon/color and article count
- **Featured article** — top-scoring unread article in that section: image thumbnail, headline, source, excerpt
- **Headline list** — 3-5 additional articles as compact rows (title + source + time)
- **"More in [Section]" link** — filters article list to that section

Sections ordered by user engagement (sources the user reads most, weighted by Magic Mixer config). Only sections with unread articles appear.

### Mobile

Single column. Featured article image becomes smaller. Headline list stays compact.

---

## Variant 3: Spotlight

**Goal:** Rich media experience. Surfaces where you spend time and what you care about through visual, engagement-weighted presentation.

### Layout (Desktop)

Two-area layout:

**Left Column (~40%) — Story Deck**
- Vertical auto-rotating slide deck (MARP-style presentation feel)
- Each slide: full-bleed hero image with headline overlay, source badge, section tag
- Auto-advances every 8 seconds, manual navigation via arrow buttons and dot indicators
- Content: top 5-7 articles by Magic score, must have a hero image
- Click opens article

**Right Area (~60%) — Media Cards Grid**
- Engagement-weighted cards in a masonry/grid layout
- Each card: image (16:9 or square crop), headline, source, section pill, reading time
- Cards sized by engagement weight (higher-scored articles get larger cards)
- Sparkline or mini bar showing source reading frequency
- Section color accent on card border/tag

### Layout (Mobile)

- Story deck becomes horizontal carousel at top (swipe-able, 200px tall)
- Media cards below as single-column full-width cards
- Auto-advance paused on mobile (swipe only)

---

## Shared Infrastructure

### Tab Persistence

Active Home tab stored in `localStorage` key `pr-home-tab`. Defaults to `brief`.

### Rendering

Each variant gets its own builder function in `04-article.js`:
- `buildBriefTab()`
- `buildSectionsTab()`
- `buildSpotlightTab()`

`renderHub()` calls all three and wraps them in tab panels, same pattern as existing Sources/Stats/Tags tabs.

### Data

All variants use the same data already available:
- `allFiles` — article list
- `allNotesIndex` — annotations with `section`, `machineTags`, summaries
- `readArticles` — read/unread tracking
- `magicScore()` — scoring function (already incorporates section boosts)
- `SECTION_LABELS` — section display names
- `localStorage pr-scroll-positions` — reading progress

### Section Colors

Fixed palette mapped by section key. Defined once in CSS as custom properties:
```
--section-tech, --section-news, --section-science, etc.
```

Used by mini treemap (Brief), section headers (Sections), and card accents (Spotlight).

## What Doesn't Change

- Sources, Stats, Tags tabs — untouched
- `magicScore()` algorithm — no changes
- Article data, annotation sidecars — no changes
- Sidebar, article reader, settings — no changes
- `collectExploreData()` — still used for Sources/Stats/Tags
- Continue Reading logic — reused in Brief tab

## Files Changed

| File | Change |
|------|--------|
| `viewer/04-article.js` | Add `buildBriefTab()`, `buildSectionsTab()`, `buildSpotlightTab()`; refactor `renderHub()` tab bar and tab panels |
| `viewer/viewer.css` | Styles for treemap, section blocks, story deck, media cards, section color palette |
| `viewer/02-utils.js` | Section color map if needed as shared data |
