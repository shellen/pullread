# Feed Promotion System Design

## Goal

Help new users subscribe to feeds quickly by offering curated collections organized by mood/intent. Surface discovery in both onboarding and the Explore page so it's useful at first launch and ongoing.

## Feed Catalog Data Model

Single JSON file (`feed-catalog.json`) served from `pullread.com/api/feed-catalog.json` with hardcoded fallback in the viewer.

```json
{
  "version": 1,
  "collections": [
    {
      "id": "stay-informed",
      "name": "Stay Informed",
      "description": "Breaking news and daily briefings",
      "icon": "i-newspaper",
      "feeds": [
        {
          "name": "Ars Technica",
          "url": "https://feeds.arstechnica.com/arstechnica/index",
          "description": "Original tech reporting and analysis",
          "platform": "web",
          "tags": ["tech", "science"]
        }
      ]
    }
  ]
}
```

### Collections (5 mood/intent categories)

| ID | Name | Icon | Description |
|----|------|------|-------------|
| `stay-informed` | Stay Informed | `i-newspaper` | Breaking news and daily briefings |
| `go-deep` | Go Deep | `i-book` | Long reads, essays, and analysis |
| `be-entertained` | Be Entertained | `i-play` | Music, comedy, film, and culture |
| `learn-something` | Learn Something | `i-lightbulb` | Science, history, and how things work |
| `indie-voices` | Indie Voices | `i-globe` | Personal blogs and the open web |

### Feed fields

- **`name`**: Display name
- **`url`**: Feed URL (RSS/Atom/JSON)
- **`description`**: One-line description
- **`platform`**: `"web"`, `"youtube"`, `"reddit"`, `"bluesky"`, `"podcast"` — for platform badges
- **`tags`**: Topic tags for optional filtering within a collection

### Fetch strategy

Same pattern as existing `fetchSuggestedFeeds()`:
- Fetch from `pullread.com/api/feed-catalog.json`, session-cached
- Fall back to hardcoded subset (~30 feeds across all 5 collections)
- Filter out already-subscribed feeds by URL and name

## Onboarding Picker

Two-screen modal shown after tour step 7 ("Ready").

### Screen 1: "What are you into?"

Grid of 5 collection cards. Each shows icon, name, description. Cards are toggleable (tap to select/deselect). User picks 1+ collections, hits "Next". "Skip" closes modal entirely.

### Screen 2: "Pick your feeds"

Feeds from selected collections, grouped by collection name. Each feed is a row with checkbox, name, description, and platform badge. All feeds pre-checked by default. Button text updates dynamically: "Subscribe to N feeds".

After subscribing, modal closes, triggers a sync, user lands on hub.

Picker reuses existing `.onboarding-modal` shell. Also accessible later from Explore → Discover tab (same UI, minus modal wrapper).

## Explore Page — Discover Tab

New tab added to Explore: **Discover**, first in tab bar.

**Tab bar:** `Discover · Sources · Tags · Stats`

### Layout

- URL input at top for manual feed entry
- Each collection renders as a horizontal-scroll row of feed cards
- Feed cards show: name, one-line description, platform badge, "+ Add" button
- "+ Add" calls existing `sourcesAddFeed()` flow, changes to "Added" on success
- Already-subscribed feeds show dimmed with "Subscribed"
- Collections fully subscribed collapse to "All subscribed" line

### Default tab logic

Discover is default tab when user has < 10 articles. After that, Sources becomes default. Discover tab is always available.

## Consolidation

The catalog replaces three existing data sources:

| Current | Replaced by |
|---------|------------|
| `SUGGESTED_FEEDS_FALLBACK` in `14-suggested-feeds.js` | `feed-catalog.json` |
| `FEED_BUNDLES` in `16-manage-sources.js` | `feed-catalog.json` |
| `pullread.com/api/suggested-feeds.json` | `pullread.com/api/feed-catalog.json` |

### Hub dashboard

Replace `loadSuggestedFeedsSection()` banner with simple "Explore feeds" link when user has < 5 feeds.

### Manage Sources

Remove `FEED_BUNDLES` and `renderSourcesDiscover()`. Replace with link to Explore → Discover.

### Dismissal logic

30-day dismissal goes away. Discover is a permanent tab, not a dismissible prompt.

## Files Modified

| File | Change |
|------|--------|
| `viewer/14-suggested-feeds.js` | Replace fallback + fetch with catalog version. Remove dismissal logic. |
| `viewer/10-explore.js` | Add Discover tab with collection rows and feed cards. |
| `viewer/11-modals.js` | Add two-screen feed picker modal after tour. |
| `viewer/16-manage-sources.js` | Remove bundles and discover section, add link to Explore. |
| `viewer/04-article.js` | Simplify hub suggested feeds to "Explore feeds" link. |
| `pullread.com` | New `/api/feed-catalog.json` static endpoint. |

## Not in scope

- Curating the actual 100-150 feeds (separate content task)
- Recommendation engine / personalization
- Community submissions or voting
- i18n / non-English feed catalogs
