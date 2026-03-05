# Feed Promotion System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Help new users subscribe to feeds via mood/intent-based collections, surfaced in both onboarding and a new Explore Discover tab.

**Architecture:** A single curated JSON catalog (`feed-catalog.json`) replaces the existing `SUGGESTED_FEEDS_FALLBACK`, `FEED_BUNDLES`, and suggested-feeds API. The catalog is consumed by three surfaces: an onboarding feed picker modal, the Explore page's new Discover tab, and a simplified hub prompt. All existing bundle/suggestion code is consolidated into the catalog.

**Tech Stack:** Vanilla JS (viewer module pattern), JSON catalog, existing `/api/config` and `/api/feed-discover` endpoints.

**Design doc:** `docs/plans/2026-03-04-feed-promotion-design.md`

---

## Task 1: Create Feed Catalog Data & Fetch Function

Replace `SUGGESTED_FEEDS_FALLBACK` and `fetchSuggestedFeeds()` in `14-suggested-feeds.js` with catalog equivalents.

**Files:**
- Modify: `viewer/14-suggested-feeds.js` (full rewrite)
- Test: `src/viewer.test.ts`

**Step 1: Write failing tests**

Add to `src/viewer.test.ts`:

```typescript
describe('Feed catalog', () => {
  const rootDir = join(__dirname, '..');

  test('14-suggested-feeds.js defines FEED_CATALOG_FALLBACK with collections', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    expect(js).toContain('FEED_CATALOG_FALLBACK');
    expect(js).toContain('collections');
  });

  test('each catalog collection has id, name, description, icon, and feeds array', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    // Extract the fallback JSON
    expect(js).toMatch(/id:\s*'/);
    expect(js).toMatch(/icon:\s*'/);
    expect(js).toContain('.feeds');
  });

  test('each catalog feed has name, url, description, platform', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    expect(js).toMatch(/platform:\s*'/);
  });

  test('fetchFeedCatalog function exists', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    expect(js).toMatch(/function\s+fetchFeedCatalog/);
  });

  test('fetches from pullread.com/api/feed-catalog.json', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    expect(js).toContain('pullread.com/api/feed-catalog.json');
  });

  test('filterCatalogFeeds function removes already-subscribed feeds', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    expect(js).toMatch(/function\s+filterCatalogFeeds/);
  });

  test('no longer contains SUGGESTED_FEEDS_FALLBACK or isFeedsDismissed', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    expect(js).not.toContain('SUGGESTED_FEEDS_FALLBACK');
    expect(js).not.toContain('isFeedsDismissed');
    expect(js).not.toContain('dismissSuggestedFeeds');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun run test -- --testPathPattern viewer.test`
Expected: All new `Feed catalog` tests fail.

**Step 3: Implement the catalog module**

Rewrite `viewer/14-suggested-feeds.js`. The file should:

1. Define `FEED_CATALOG_FALLBACK` — a hardcoded fallback with the catalog structure:
   - `version: 1`
   - `collections` array with 5 collections: `stay-informed`, `go-deep`, `be-entertained`, `learn-something`, `indie-voices`
   - Each collection: `{ id, name, description, icon, feeds: [...] }`
   - Each feed: `{ name, url, description, platform, tags }`
   - Include ~6 feeds per collection as fallback (~30 total). Curate from the best of the existing `SUGGESTED_FEEDS_FALLBACK` and `FEED_BUNDLES` plus new picks. Ensure cross-section of platforms: web, youtube, reddit, bluesky, podcast.

2. `fetchFeedCatalog(callback)` — same pattern as old `fetchSuggestedFeeds`:
   - Check `sessionStorage` cache key `pr-feed-catalog`
   - Fetch from `https://pullread.com/api/feed-catalog.json`
   - Validate response has `.collections` array
   - Fall back to `FEED_CATALOG_FALLBACK`

3. `getUserFeedUrls()` — keep as-is (reads from `allFiles`).

4. `filterCatalogFeeds(catalog)` — returns a new catalog object with already-subscribed feeds removed from each collection's `.feeds` array. Uses URL and name matching (same logic as old `filterSuggestedFeeds`).

5. Remove: `SUGGESTED_FEEDS_FALLBACK`, `fetchSuggestedFeeds`, `filterSuggestedFeeds`, `isFeedsDismissed`, `dismissSuggestedFeeds`.

6. Keep ABOUTME comments updated.

**Collections to curate:**

| Collection | Icon | Example feeds (expand to ~6 each) |
|------------|------|-----|
| Stay Informed | `i-newspaper` | Ars Technica, The Verge, NPR, BBC, Reuters, r/worldnews |
| Go Deep | `i-book` | Longreads, kottke.org, Astral Codex Ten, Platformer, The Atlantic (Ideas) |
| Be Entertained | `i-play` | Pitchfork, Stereogum, Conan O'Brien podcast, A24 Films YT, Brooklyn Vegan |
| Learn Something | `i-lightbulb` | Quanta Magazine, Kurzgesagt YT, 99% Invisible, Radiolab, Nautilus |
| Indie Voices | `i-globe` | Waxy.org, Daring Fireball, Anil Dash, Pluralistic, Seth Godin, On my Om |

**Step 4: Run tests to verify they pass**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun run test -- --testPathPattern viewer.test`
Expected: All `Feed catalog` tests pass, no regressions.

**Step 5: Commit**

```bash
git add viewer/14-suggested-feeds.js src/viewer.test.ts
git commit -m "Replace suggested feeds with mood/intent feed catalog"
```

---

## Task 2: Add Discover Tab to Explore Page

Add a "Discover" tab to the Explore page that renders catalog collections as horizontal-scroll rows of feed cards.

**Files:**
- Modify: `viewer/10-explore.js:428-466` (showTagCloud and tab rendering)
- Test: `src/viewer.test.ts`

**Step 1: Write failing tests**

```typescript
describe('Explore Discover tab', () => {
  const rootDir = join(__dirname, '..');

  test('showTagCloud renders a Discover tab', () => {
    const js = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(js).toContain("data-tab=\"discover\"");
    expect(js).toContain('Discover');
  });

  test('buildDiscoverCatalogHtml function exists', () => {
    const js = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(js).toMatch(/function\s+buildDiscoverCatalogHtml/);
  });

  test('Discover tab renders catalog collection rows', () => {
    const js = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(js).toContain('catalog-collection-row');
    expect(js).toContain('catalog-feed-card');
  });

  test('feed cards show platform badge', () => {
    const js = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(js).toContain('platform-badge');
  });

  test('Discover tab is first when article count is low', () => {
    const js = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    // The discover tab should be added before sources when allFiles.length < 10
    expect(js).toContain('allFiles.length');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun run test -- --testPathPattern viewer.test`
Expected: All new `Explore Discover tab` tests fail.

**Step 3: Implement Discover tab**

Modify `viewer/10-explore.js`:

1. Add `buildDiscoverCatalogHtml()` function that:
   - Calls `fetchFeedCatalog()` (async, rendered after tab loads like existing patterns)
   - For each collection: renders a `.catalog-collection-row` with heading (icon + name + description)
   - Within each row: horizontal-scroll `.catalog-feed-cards` container
   - Each feed card (`.catalog-feed-card`): name, description, `.platform-badge` span, and an "Add" button calling `addBundleFeed()`
   - Already-subscribed feeds show dimmed with "Subscribed"
   - Include a URL input at top for manual feed entry (reuse the `sourcesAddFeed` pattern)

2. Modify `showTagCloud()` (line 428):
   - Add `discover` tab to the tab array
   - When `allFiles.length < 10`, make Discover the first tab and active by default
   - When `allFiles.length >= 10`, make Discover the last tab, Sources remains default
   - Add `explore-discover` panel div (content loaded async by `fetchFeedCatalog`)

3. Add a helper `renderCatalogIntoPanel(panelId)` that `fetchFeedCatalog` calls to populate the panel after data loads (avoids blocking the initial render).

**Step 4: Run tests to verify they pass**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun run test -- --testPathPattern viewer.test`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add viewer/10-explore.js src/viewer.test.ts
git commit -m "Add Discover tab to Explore page with catalog collections"
```

---

## Task 3: Add CSS for Catalog UI

Add styles for catalog collection rows, feed cards, platform badges, and the onboarding picker.

**Files:**
- Modify: `viewer.css`

**Step 1: Write failing test**

```typescript
describe('Catalog CSS', () => {
  const rootDir = join(__dirname, '..');

  test('viewer.css has catalog collection styles', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    expect(css).toContain('.catalog-collection-row');
    expect(css).toContain('.catalog-feed-card');
    expect(css).toContain('.platform-badge');
  });

  test('viewer.css has feed picker modal styles', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    expect(css).toContain('.feed-picker');
    expect(css).toContain('.collection-card');
  });
});
```

**Step 2: Run tests to verify they fail**

**Step 3: Implement CSS**

Add to `viewer.css`:

- `.catalog-collection-row` — section with heading, horizontal scroll container
- `.catalog-feed-cards` — flex row, `overflow-x: auto`, gap, scroll-snap
- `.catalog-feed-card` — min-width ~200px, border, rounded-md (6px), padding, name/desc/badge layout
- `.catalog-feed-card .platform-badge` — small pill with platform label, muted color
- `.catalog-feed-card button` — "Add" button, primary style
- `.catalog-feed-card.subscribed` — dimmed opacity, "Subscribed" state
- `.feed-picker` — modal body styles for the onboarding picker
- `.collection-card` — selectable card with active state highlight (border color change)
- `.feed-picker-list` — checkbox list styling for screen 2
- Match existing design language: `border-radius: 6px`, `var(--border)`, `var(--link)`, `var(--muted)`, `var(--bg)` tokens

**Step 4: Run tests to verify they pass**

**Step 5: Commit**

```bash
git add viewer.css src/viewer.test.ts
git commit -m "Add CSS for catalog feed cards and onboarding picker"
```

---

## Task 4: Build Onboarding Feed Picker Modal

Add two-screen feed picker shown after the tour's "Ready" step.

**Files:**
- Modify: `viewer/11-modals.js:474-554` (after renderStepReady, before obBack)
- Test: `src/viewer.test.ts`

**Step 1: Write failing tests**

```typescript
describe('Onboarding feed picker', () => {
  const rootDir = join(__dirname, '..');

  test('showFeedPicker function exists in modals', () => {
    const js = readFileSync(join(rootDir, 'viewer', '11-modals.js'), 'utf-8');
    expect(js).toMatch(/function\s+showFeedPicker/);
  });

  test('feed picker has collection selection screen', () => {
    const js = readFileSync(join(rootDir, 'viewer', '11-modals.js'), 'utf-8');
    expect(js).toContain('What are you into');
    expect(js).toContain('collection-card');
  });

  test('feed picker has feed cherry-pick screen', () => {
    const js = readFileSync(join(rootDir, 'viewer', '11-modals.js'), 'utf-8');
    expect(js).toContain('Pick your feeds');
    expect(js).toContain('feed-picker-list');
  });

  test('obFinish triggers feed picker for new users', () => {
    const js = readFileSync(join(rootDir, 'viewer', '11-modals.js'), 'utf-8');
    expect(js).toContain('showFeedPicker');
  });

  test('feed picker subscribe button calls /api/config', () => {
    const js = readFileSync(join(rootDir, 'viewer', '11-modals.js'), 'utf-8');
    // The picker must save selected feeds
    expect(js).toContain('feedPickerSubscribe');
  });
});
```

**Step 2: Run tests to verify they fail**

**Step 3: Implement feed picker**

Add to `viewer/11-modals.js`:

1. **State variables:**
   - `var _pickerSelectedCollections = []` — selected collection IDs
   - `var _pickerScreen = 1` — which screen (1=collections, 2=feeds)
   - `var _pickerFeedSelections = {}` — `{ url: true/false }` for cherry-picking

2. **`showFeedPicker()`:**
   - Creates modal overlay (reuse `.modal-overlay` pattern from `showFeedbackModal`)
   - Calls `fetchFeedCatalog()` to get collections
   - Renders screen 1 by default via `renderPickerScreen(catalog)`

3. **Screen 1 — `renderPickerCollections(catalog)`:**
   - Heading: "What are you into?" / "Pick a few to get started."
   - Grid of `.collection-card` elements, each with icon, name, description
   - Tap toggles selection (add/remove collection ID from `_pickerSelectedCollections`)
   - "Next" button (disabled until 1+ selected) → switches `_pickerScreen = 2`
   - "Skip" button → closes modal entirely

4. **Screen 2 — `renderPickerFeeds(catalog)`:**
   - Heading: "Pick your feeds" / "Uncheck any you don't want."
   - For each selected collection: section heading + checkbox list of feeds
   - All feeds pre-checked by default in `_pickerFeedSelections`
   - Each row: checkbox, feed name, description, platform badge
   - "Back" button → `_pickerScreen = 1`
   - "Subscribe to N feeds" button → calls `feedPickerSubscribe()`
   - Button text dynamically counts checked feeds

5. **`feedPickerSubscribe()`:**
   - Collects all checked feed URLs/names from `_pickerFeedSelections`
   - Fetches `/api/config`, merges feeds, POSTs back (same pattern as `addBundle`)
   - On success: closes modal, shows toast "Added N feeds", calls `refreshArticleList()`

6. **Wire into `obFinish()` (line 535):**
   - After `dismissOnboarding()`, if `!_tourMode`, call `showFeedPicker()` instead of immediately refreshing
   - Feed picker close → triggers `refreshArticleList()`

**Step 4: Run tests to verify they pass**

**Step 5: Commit**

```bash
git add viewer/11-modals.js src/viewer.test.ts
git commit -m "Add onboarding feed picker with collection and feed selection"
```

---

## Task 5: Simplify Hub & Manage Sources

Remove old bundle/suggestion UI, point to Explore → Discover.

**Files:**
- Modify: `viewer/04-article.js:463-498` (loadSuggestedFeedsSection)
- Modify: `viewer/16-manage-sources.js:1-206` (FEED_BUNDLES, renderSourcesDiscover)
- Test: `src/viewer.test.ts`

**Step 1: Write failing tests**

```typescript
describe('Hub and Manage Sources consolidation', () => {
  const rootDir = join(__dirname, '..');

  test('manage-sources no longer contains FEED_BUNDLES', () => {
    const js = readFileSync(join(rootDir, 'viewer', '16-manage-sources.js'), 'utf-8');
    expect(js).not.toContain('FEED_BUNDLES');
  });

  test('manage-sources no longer contains renderSourcesDiscover', () => {
    const js = readFileSync(join(rootDir, 'viewer', '16-manage-sources.js'), 'utf-8');
    expect(js).not.toMatch(/function\s+renderSourcesDiscover/);
  });

  test('manage-sources links to Explore Discover', () => {
    const js = readFileSync(join(rootDir, 'viewer', '16-manage-sources.js'), 'utf-8');
    expect(js).toContain('showTagCloud');
  });

  test('hub no longer contains loadSuggestedFeedsSection', () => {
    const js = readFileSync(join(rootDir, 'viewer', '04-article.js'), 'utf-8');
    expect(js).not.toMatch(/function\s+loadSuggestedFeedsSection/);
  });
});
```

**Step 2: Run tests to verify they fail**

**Step 3: Implement consolidation**

1. **`viewer/16-manage-sources.js`:**
   - Remove `FEED_BUNDLES` array (lines 4-23)
   - Remove `renderSourcesDiscover()` function (lines 151-206)
   - Remove `addBundle()` function (lines 361-393) — no longer needed
   - Keep `addBundleFeed()` (used by Explore Discover tab feed cards)
   - In `showManageSourcesPage()`: remove the `#sources-discover` container div
   - After the feed list, add a simple link: `<a href="#" onclick="showTagCloud();return false">Browse more feeds in Explore</a>`
   - Update ABOUTME comments

2. **`viewer/04-article.js`:**
   - Remove `loadSuggestedFeedsSection()` (lines 463-498) and `addSuggestedFeed()` (lines 500+)
   - Where it was called, add a simpler prompt for new users (`userFeedCount < 5`): a small text link "Explore feeds to subscribe to →" that calls `showTagCloud()`
   - Remove `hub-suggested-feeds` container references

**Step 4: Run tests to verify they pass**

Verify no regressions in existing viewer tests.

**Step 5: Commit**

```bash
git add viewer/04-article.js viewer/16-manage-sources.js src/viewer.test.ts
git commit -m "Consolidate hub and manage sources to use Explore Discover"
```

---

## Task 6: Rebuild & Integration Test

Rebuild the embedded viewer and verify everything works together.

**Files:**
- Rebuild: `src/viewer-html.ts` (via embed script)

**Step 1: Rebuild viewer**

```bash
cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun scripts/embed-viewer.ts
```

**Step 2: Run full test suite**

```bash
cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun run test
```

Expected: All viewer tests pass (feed.test.ts too). Pre-existing failures in shell-open, models, playwright, worker, extractor are known and unrelated.

**Step 3: Manual verification checklist**

In the running app:
- [ ] Explore page shows Discover tab (first tab if < 10 articles)
- [ ] Discover tab shows 5 collection rows with feed cards
- [ ] "+ Add" button on feed card subscribes the feed
- [ ] Already-subscribed feeds show as "Subscribed" (dimmed)
- [ ] Manage Sources page shows feeds list + "Browse more feeds in Explore" link
- [ ] Manage Sources no longer shows bundles or individual picks sections
- [ ] Hub shows "Explore feeds" link for new users (< 5 feeds)
- [ ] Onboarding tour → "Get Started" → feed picker modal appears
- [ ] Feed picker screen 1: select collections, "Next" enables
- [ ] Feed picker screen 2: feeds pre-checked, uncheck to exclude, subscribe button works
- [ ] After subscribing from picker: modal closes, toast shows, articles refresh

**Step 4: Commit rebuild**

```bash
git add src/viewer-html.ts viewer.html
git commit -m "Rebuild viewer with feed promotion system"
```
