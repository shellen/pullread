# Home/Explore Merger — Tabbed Hub Design

**Date**: 2026-02-25
**Status**: Design

## Problem

Three related issues with the current Home + Explore split:

1. **Home feels thin** — Users land on a dashboard that doesn't surface enough discovery content, then have to navigate separately to Explore.
2. **Too many views** — Having both Home and Explore as distinct destinations is confusing. Users don't know which to check.
3. **Explore is buried** — The Explore button lives in the sidebar footer. Most users probably never find it.
4. **No feed discovery** — There's no mechanism to suggest new feeds to users, whether they're brand new or established.

## Approach: Tabbed Hub

Merge Home and Explore into a single landing page with a persistent top section and tabbed content below. This reuses the existing Explore tab infrastructure while promoting its content to the primary landing experience.

### Layout Structure

```
┌─────────────────────────────────────┐
│ PERSISTENT TOP SECTION              │
│                                     │
│ Greeting + Stats bar (one line)     │
│ Continue Reading (compact, 3 cards) │
│ Suggested Feeds (contextual)        │
╞═════════════════════════════════════╡
│ [For You]  [Tags]  [Sources]  [Top] │
├─────────────────────────────────────┤
│                                     │
│ TAB CONTENT (scrollable)            │
│                                     │
├─────────────────────────────────────┤
│ Quick Actions bar (bottom)          │
└─────────────────────────────────────┘
```

### Persistent Top Section

Always visible regardless of active tab. Contains:

**1. Greeting + Stats Bar**
- Time-based greeting with total/unread counts (existing)
- Compact single line

**2. Continue Reading**
- Up to 3 partially-read article cards (inline, not full horizontal scroll)
- Shows progress bar on each card
- Hidden when no articles are in progress

**3. Suggested Feeds (Contextual)**

Two modes based on user state:

- **New users (< 5 feeds)**: Hero card with heading like "Build your reading list", showing 6-8 curated feed suggestions as pills plus a "+ Add custom URL" button. Each pill adds the feed with one click (calls existing `settingsAddRecFeed`).
- **Established users (5+ feeds)**: Collapsed one-line banner: "Discover new feeds →" that expands on click to show suggestions. Can be dismissed (stores dismissal in localStorage).

Suggested feeds are a curated list maintained in the app (not dynamic). Categories might include: Tech news, Design, Indie/personal, Business. The exact list is configurable but ships with sensible defaults.

### Tab: For You (default)

The "smart" tab combining the best of current Home and Explore Discover:

1. **Latest Review** — Most recent daily/weekly AI review with date and excerpt. Click to read full review.
2. **Quick Filters** — Pill buttons: Unread, Starred, Has Notes, Has Highlights, Has Tags, Podcasts, Books. Clicking filters the sidebar article list and closes the hub view.
3. **Top Tags** — Up to 12 tags as clickable pills. Click filters sidebar by that tag.
4. **Connections** — Ontological tag clusters (2-8 articles sharing a tag). Horizontal scroll with up to 12 clusters.
5. **Recent Unread** — Latest unread articles as cards. "View all" link.

### Tab: Tags

Full tag cloud with counts (existing Explore Tags tab). Includes block/unblock per tag. Blocked tags section at bottom.

### Tab: Sources

Domain groupings with article counts (existing Explore Sources tab). Collapsible groups, up to 10 articles shown per domain.

### Tab: Top

Most-read articles ranked by scroll depth + timestamp (existing Explore Most Viewed tab). Shows reading progress percentage.

### Quick Actions Bar

Pinned at bottom of the page:
- Daily Review, Weekly Review, Guide, Tour (existing)

## Navigation Changes

- **Remove**: Separate Explore page. The sidebar footer "Explore" button is removed.
- **Home tab** in sidebar now opens this merged Tabbed Hub view.
- `goHome()` calls the merged renderer instead of `renderDashboard()`.
- `showTagCloud()` is retired — its content moves into the tabs.

## What Gets Removed

- `renderDashboard()` function in `04-article.js` — replaced by the merged renderer
- `showTagCloud()` function in `10-explore.js` — tab content rendered inline
- Starred articles section from dashboard (accessible via Quick Filter pill instead)
- Explore button from sidebar footer

## What Gets Kept

- All tab rendering logic from `10-explore.js` (reused)
- `dashCardHtml()` for article cards
- `buildConnectionsHtml()` for tag clusters
- Review rendering logic
- Quick actions bar

## Files to Modify

- `viewer/04-article.js` — Replace `renderDashboard()` with merged hub renderer
- `viewer/10-explore.js` — Refactor tab content into reusable functions, remove standalone `showTagCloud()`
- `viewer/05-sidebar.js` — Remove Explore button from footer, update `goHome()`
- `viewer.html` — Remove Explore button from sidebar footer markup
- `viewer.css` — Styles for suggested feeds hero/banner, tab bar in hub context

## Suggested Feeds Data

Fetched from `https://pullread.com/api/suggested-feeds` (or a static JSON file on the site). This lets the feed list be updated without app releases.

**Endpoint contract** (JSON):
```json
[
  { "name": "Daring Fireball", "url": "https://daringfireball.net/feeds/main", "category": "Tech" },
  { "name": "Stratechery", "url": "https://stratechery.com/feed/", "category": "Business" }
]
```

**Client behavior**:
- Fetch on hub render, cache in sessionStorage (avoids re-fetching per tab switch)
- Fallback: if fetch fails, show a hardcoded minimal list baked into the app
- Feeds the user already subscribes to are excluded from suggestions

## Suggested Feeds Dismiss Behavior

Periodic dismiss — when established users dismiss the feed suggestions banner, store the dismiss timestamp in localStorage (`pr-feeds-dismissed`). Re-show after 30 days.

## Decisions

1. **Suggested feeds**: Fetched from pullread.com (updatable without app release), with hardcoded fallback
2. **Top tab time range**: No filter — keep it simple
3. **Banner dismiss**: Periodic (30-day re-show cycle)
