# Home/Explore Merger Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge the Home dashboard and Explore page into a single Tabbed Hub landing page with a persistent top section (greeting, continue reading, suggested feeds) and four tabs (For You, Tags, Sources, Top).

**Architecture:** Replace `renderDashboard()` and `showTagCloud()` with a single `renderHub()` function. The persistent top section renders above a tab bar. Each tab reuses existing rendering logic extracted into standalone helper functions. Suggested feeds are fetched from pullread.com with a hardcoded fallback.

**Tech Stack:** Vanilla JS (matching existing codebase), CSS, `fetch()` for suggested feeds API.

---

### Task 1: Extract Explore tab content into reusable builder functions

The current `showTagCloud()` in `viewer/10-explore.js` builds all tab HTML inline. Extract each tab's content generation into standalone functions so the hub renderer can call them.

**Files:**
- Modify: `viewer/10-explore.js` (lines 1-253)

**Step 1: Extract data collection into a shared function**

At the top of `viewer/10-explore.js`, add a function that collects all the tag/domain/feed data both the old Explore and new Hub need:

```js
function collectExploreData() {
  var tagCounts = {};
  var tagArticles = {};
  var domainArticles = {};
  var feedCounts = {};

  for (var i = 0; i < allFiles.length; i++) {
    var f = allFiles[i];
    if (f.domain && f.domain !== 'pullread') {
      if (!domainArticles[f.domain]) domainArticles[f.domain] = [];
      domainArticles[f.domain].push(f);
    }
    if (f.feed) {
      feedCounts[f.feed] = (feedCounts[f.feed] || 0) + 1;
    }
    var notes = allNotesIndex[f.filename];
    var allTags = [];
    if (notes && notes.tags) allTags.push.apply(allTags, notes.tags);
    if (notes && notes.machineTags) allTags.push.apply(allTags, notes.machineTags);
    for (var j = 0; j < allTags.length; j++) {
      var tag = allTags[j];
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      if (!tagArticles[tag]) tagArticles[tag] = [];
      tagArticles[tag].push(f);
    }
  }

  var sortedDomains = Object.entries(domainArticles).sort(function(a, b) { return b[1].length - a[1].length; });
  var sortedTags = Object.entries(tagCounts).sort(function(a, b) { return b[1] - a[1]; });

  return {
    tagCounts: tagCounts,
    tagArticles: tagArticles,
    domainArticles: domainArticles,
    feedCounts: feedCounts,
    sortedDomains: sortedDomains,
    sortedTags: sortedTags
  };
}
```

**Step 2: Extract tab builder functions**

Extract the Discover, Most Viewed, Tags, Sources, and stats HTML builders from `showTagCloud()` into:

- `buildStatsHtml(data)` — returns the stats bar HTML
- `buildDiscoverHtml(data)` — returns the Discover/For You tab content (quick filters, auto-tag, connections)
- `buildMostViewedHtml()` — returns the Most Viewed tab content
- `buildTagsHtml(data)` — returns the Tags tab content
- `buildSourcesHtml(data)` — returns the Sources tab content

Each function takes the `data` object from `collectExploreData()` (where needed) and returns an HTML string.

**Step 3: Refactor `showTagCloud()` to use the extracted functions**

Replace the inline HTML building in `showTagCloud()` with calls to the builder functions. `showTagCloud()` should still work identically — this is a pure refactor.

```js
function showTagCloud() {
  // ... existing setup (lines 2-16) unchanged ...

  var data = collectExploreData();
  var statsHtml = buildStatsHtml(data);
  var discoverHtml = buildDiscoverHtml(data);
  var viewedHtml = buildMostViewedHtml();
  var tagsHtml = buildTagsHtml(data);
  var domainsHtml = buildSourcesHtml(data);

  content.innerHTML =
    '<div class="article-header"><h1>Explore</h1></div>' +
    statsHtml +
    '<div class="explore-tabs">' +
      // ... same tab buttons ...
    '</div>' +
    // ... same tab panels using the builder output ...

  // ... tab switching wiring unchanged ...
}
```

**Step 4: Verify the refactor**

Run: `bun test`
Expected: 365 tests pass, 0 fail

Manually verify: Click Explore in the sidebar footer — page should look identical to before.

**Step 5: Commit**

```bash
git add viewer/10-explore.js
git commit -m "Extract Explore tab builders into reusable functions"
```

---

### Task 2: Add suggested feeds fetch + fallback

**Files:**
- Create: `viewer/13-suggested-feeds.js`
- Modify: `viewer.html` (add script tag)

**Step 1: Create the suggested feeds module**

Create `viewer/13-suggested-feeds.js` with:

```js
// ABOUTME: Fetches suggested feed recommendations from pullread.com.
// ABOUTME: Falls back to a hardcoded list if the fetch fails.

var SUGGESTED_FEEDS_FALLBACK = [
  { name: 'Daring Fireball', url: 'https://daringfireball.net/feeds/main', category: 'Tech' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'Tech' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'Tech' },
  { name: 'Platformer', url: 'https://www.platformer.news/rss/', category: 'Tech' },
  { name: 'Stratechery', url: 'https://stratechery.com/feed/', category: 'Business' },
  { name: 'kottke.org', url: 'https://feeds.kottke.org/main', category: 'Culture' },
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'Tech' },
  { name: 'Seth Godin', url: 'https://feeds.feedblitz.com/sethsblog', category: 'Business' }
];

function fetchSuggestedFeeds(callback) {
  // Check sessionStorage cache first
  var cached = sessionStorage.getItem('pr-suggested-feeds');
  if (cached) {
    try { callback(JSON.parse(cached)); return; } catch (e) {}
  }

  fetch('https://pullread.com/api/suggested-feeds')
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(feeds) {
      if (Array.isArray(feeds) && feeds.length > 0) {
        sessionStorage.setItem('pr-suggested-feeds', JSON.stringify(feeds));
        callback(feeds);
      } else {
        callback(SUGGESTED_FEEDS_FALLBACK);
      }
    })
    .catch(function() {
      callback(SUGGESTED_FEEDS_FALLBACK);
    });
}

function getUserFeedUrls() {
  // Collect URLs of feeds the user already subscribes to.
  // allFiles has a .feedUrl or we can derive from domain/feed.
  // The most reliable source is the config API, but we don't have it cached.
  // Use allFiles feed names as a heuristic for filtering.
  var urls = new Set();
  for (var i = 0; i < allFiles.length; i++) {
    if (allFiles[i].feedUrl) urls.add(allFiles[i].feedUrl);
  }
  return urls;
}

function filterSuggestedFeeds(feeds) {
  var userUrls = getUserFeedUrls();
  // Also check by feed name against allFiles feed names
  var userFeedNames = new Set();
  for (var i = 0; i < allFiles.length; i++) {
    if (allFiles[i].feed) userFeedNames.add(allFiles[i].feed.toLowerCase());
  }
  return feeds.filter(function(f) {
    if (userUrls.has(f.url)) return false;
    if (userFeedNames.has(f.name.toLowerCase())) return false;
    return true;
  });
}

function isFeedsDismissed() {
  var dismissed = localStorage.getItem('pr-feeds-dismissed');
  if (!dismissed) return false;
  var ts = parseInt(dismissed, 10);
  var thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return (Date.now() - ts) < thirtyDays;
}

function dismissSuggestedFeeds() {
  localStorage.setItem('pr-feeds-dismissed', String(Date.now()));
  var el = document.getElementById('hub-suggested-feeds');
  if (el) el.remove();
}
```

**Step 2: Add script tag to viewer.html**

In `viewer.html`, find the existing `<script src="viewer/12-keyboard.js">` tag and add after it:

```html
<script src="viewer/13-suggested-feeds.js"></script>
```

**Step 3: Commit**

```bash
git add viewer/13-suggested-feeds.js viewer.html
git commit -m "Add suggested feeds fetch with pullread.com API and fallback"
```

---

### Task 3: Build the Hub renderer — persistent top section

**Files:**
- Modify: `viewer/04-article.js` (lines 2-145, 214-226)

**Step 1: Create `renderHub()` replacing `renderDashboard()`**

Replace `renderDashboard()` (lines 2-145) with `renderHub()`. Keep `dashCardHtml()`, `dashGenerateReview()`, and scroll helpers untouched.

The hub renderer builds the persistent top section, then delegates to tab builders from Task 1.

```js
function renderHub() {
  var dash = document.getElementById('dashboard');
  if (!dash) return;

  var empty = document.getElementById('empty-state');
  var content = document.getElementById('content');
  empty.style.display = '';
  if (content) content.style.display = 'none';
  var toolbar = document.getElementById('reader-toolbar');
  if (toolbar) toolbar.style.display = 'none';

  if (allFiles.length === 0) {
    dash.innerHTML = '<div class="dash-empty-hint"><p class="hint">No articles yet</p><p class="subhint">Add RSS feeds in the tray app, or drop a .md file here</p></div>';
    return;
  }

  var html = '';

  // --- Persistent top: Greeting + Stats ---
  var hour = new Date().getHours();
  var greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  var totalArticles = allFiles.length;
  var unreadCount = allFiles.filter(function(f) { return !readArticles.has(f.filename); }).length;
  var totalHighlights = Object.values(allHighlightsIndex).reduce(function(s, h) { return s + (h ? h.length : 0); }, 0);
  var totalFavorites = Object.values(allNotesIndex).filter(function(n) { return n && n.isFavorite; }).length;

  html += '<div class="dash-greeting">';
  html += '<h1>' + greeting + '</h1>';
  html += '<p>' + totalArticles + ' articles &middot; ' + unreadCount + ' unread &middot; ' + totalHighlights + ' highlights &middot; ' + totalFavorites + ' starred</p>';
  html += '</div>';

  // --- Persistent top: Continue Reading (compact, max 3) ---
  var positions = JSON.parse(localStorage.getItem('pr-scroll-positions') || '{}');
  var continueReading = allFiles.filter(function(f) {
    var pos = positions[f.filename];
    return pos && pos.pct > 0.05 && pos.pct < 0.9;
  }).sort(function(a, b) { return (positions[b.filename].ts || 0) - (positions[a.filename].ts || 0); }).slice(0, 3);

  if (continueReading.length > 0) {
    html += '<div class="dash-section">';
    html += '<div class="dash-section-header">';
    html += '<span class="dash-section-title"><svg viewBox="0 0 384 512"><use href="#i-book"/></svg> Continue Reading</span>';
    html += '</div>';
    html += '<div class="dash-cards" style="overflow:visible;flex-wrap:wrap">';
    for (var ci = 0; ci < continueReading.length; ci++) {
      html += dashCardHtml(continueReading[ci], positions[continueReading[ci].filename]?.pct);
    }
    html += '</div></div>';
  }

  // --- Persistent top: Suggested Feeds placeholder ---
  html += '<div id="hub-suggested-feeds"></div>';

  // --- Tab bar ---
  html += '<div class="explore-tabs">';
  html += '<button class="explore-tab active" data-tab="for-you">For You</button>';
  html += '<button class="explore-tab" data-tab="tags">Tags</button>';
  html += '<button class="explore-tab" data-tab="sources">Sources</button>';
  html += '<button class="explore-tab" data-tab="top">Top</button>';
  html += '</div>';

  // --- Tab content ---
  var data = collectExploreData();

  // For You tab: Reviews + Quick Filters + Top Tags + Connections + Recent
  var forYouHtml = '';

  // Reviews
  var reviews = allFiles.filter(function(f) { return f.feed === 'weekly-review' || f.feed === 'daily-review' || f.domain === 'pullread'; }).slice(0, 3);
  if (reviews.length > 0) {
    forYouHtml += '<div class="dash-section">';
    forYouHtml += '<div class="dash-section-header"><span class="dash-section-title"><svg viewBox="0 0 512 512"><use href="#i-wand"/></svg> Reviews</span></div>';
    forYouHtml += '<div class="dash-cards" style="overflow:visible;flex-wrap:wrap">';
    for (var ri = 0; ri < reviews.length; ri++) {
      var rf = reviews[ri];
      var isWeekly = rf.feed === 'weekly-review';
      var typeLabel = isWeekly ? 'Weekly' : 'Daily';
      var rdate = rf.bookmarked ? rf.bookmarked.slice(0, 10) : '';
      forYouHtml += '<div class="dash-review-card" onclick="dashLoadArticle(\'' + escapeHtml(rf.filename) + '\')">';
      forYouHtml += '<div class="dash-review-title">' + escapeHtml(rf.title) + '</div>';
      forYouHtml += '<div class="dash-review-meta">' + typeLabel + ' Review' + (rdate ? ' &middot; ' + rdate : '') + '</div>';
      if (rf.excerpt) forYouHtml += '<div class="dash-review-excerpt">' + escapeHtml(rf.excerpt) + '</div>';
      forYouHtml += '</div>';
    }
    forYouHtml += '</div></div>';
  }

  // Quick Filters
  forYouHtml += buildDiscoverHtml(data);

  // Recent Unread
  var recent = allFiles.filter(function(f) { return !readArticles.has(f.filename) && f.feed !== 'weekly-review' && f.feed !== 'daily-review' && f.domain !== 'pullread'; }).slice(0, 20);
  if (recent.length > 0) {
    forYouHtml += '<div class="dash-section">';
    forYouHtml += '<div class="dash-section-header">';
    forYouHtml += '<span class="dash-section-title"><svg viewBox="0 0 448 512"><use href="#i-calendar"/></svg> Recent <span class="dash-section-count">(' + recent.length + ')</span></span>';
    if (unreadCount > recent.length) {
      forYouHtml += '<button class="dash-view-all" onclick="document.getElementById(\'search\').focus()">View all ' + unreadCount + ' &rsaquo;</button>';
    }
    forYouHtml += '</div>';
    forYouHtml += '<div class="dash-cards-wrap"><button class="dash-chevron left" onclick="dashScrollLeft(this)" aria-label="Scroll left">&#8249;</button><div class="dash-cards">';
    for (var rci = 0; rci < recent.length; rci++) {
      forYouHtml += dashCardHtml(recent[rci]);
    }
    forYouHtml += '</div><button class="dash-chevron right" onclick="dashScrollRight(this)" aria-label="Scroll right">&#8250;</button></div></div>';
  }

  html += '<div id="explore-for-you" class="explore-tab-panel active">' + forYouHtml + '</div>';
  html += '<div id="explore-tags" class="explore-tab-panel">' + buildTagsHtml(data) + '</div>';
  html += '<div id="explore-sources" class="explore-tab-panel">' + buildSourcesHtml(data) + '</div>';
  html += '<div id="explore-top" class="explore-tab-panel">' + buildMostViewedHtml() + '</div>';

  // Quick actions
  html += '<div class="dash-actions">';
  html += '<button onclick="dashGenerateReview(1)"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-wand"/></svg> Daily Review</button>';
  html += '<button onclick="dashGenerateReview(7)"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-wand"/></svg> Weekly Review</button>';
  html += '<button onclick="showGuideModal()"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-book"/></svg> Guide</button>';
  html += '<button onclick="showTour()"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-comment"/></svg> Tour</button>';
  html += '</div>';

  dash.innerHTML = html;

  // Wire up tab switching
  dash.querySelectorAll('.explore-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      dash.querySelectorAll('.explore-tab').forEach(function(b) { b.classList.remove('active'); });
      dash.querySelectorAll('.explore-tab-panel').forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('explore-' + btn.dataset.tab).classList.add('active');
    });
  });

  requestAnimationFrame(initDashChevrons);

  // Async: load suggested feeds
  loadSuggestedFeedsSection();
}
```

**Step 2: Update `goHome()` to call `renderHub()`**

In `goHome()` (line 225), replace `requestAnimationFrame(renderDashboard)` with `requestAnimationFrame(renderHub)`.

**Step 3: Commit**

```bash
git add viewer/04-article.js
git commit -m "Replace renderDashboard with merged Hub renderer"
```

---

### Task 4: Build the suggested feeds section renderer

**Files:**
- Modify: `viewer/04-article.js` (add new function after `renderHub`)

**Step 1: Add `loadSuggestedFeedsSection()`**

This function is called at the end of `renderHub()`. It fetches suggested feeds async and populates the `#hub-suggested-feeds` placeholder.

```js
function loadSuggestedFeedsSection() {
  var container = document.getElementById('hub-suggested-feeds');
  if (!container) return;

  fetchSuggestedFeeds(function(allFeeds) {
    var feeds = filterSuggestedFeeds(allFeeds);
    if (feeds.length === 0) return;

    var userFeedCount = new Set(allFiles.map(function(f) { return f.feed; }).filter(Boolean)).size;
    var isNewUser = userFeedCount < 5;
    var dismissed = isFeedsDismissed();

    if (!isNewUser && dismissed) return;

    var html = '<div class="hub-feeds-section' + (isNewUser ? ' hub-feeds-hero' : '') + '">';

    if (isNewUser) {
      html += '<div class="hub-feeds-heading">Build your reading list</div>';
      html += '<p class="hub-feeds-desc">Subscribe to feeds to get articles delivered to Pull Read.</p>';
    } else {
      html += '<div class="hub-feeds-heading" style="display:flex;align-items:center;justify-content:space-between">Discover new feeds';
      html += '<button class="hub-feeds-dismiss" onclick="dismissSuggestedFeeds()" title="Dismiss">&times;</button>';
      html += '</div>';
    }

    html += '<div class="hub-feeds-pills">';
    for (var i = 0; i < feeds.length; i++) {
      var f = feeds[i];
      html += '<button class="tag-pill" onclick="addSuggestedFeed(this,\'' + escapeHtml(f.name.replace(/'/g, "\\'")) + '\',\'' + escapeHtml(f.url.replace(/'/g, "\\'")) + '\')">' + escapeHtml(f.name) + '</button>';
    }
    html += '<button class="tag-pill" onclick="toggleQuickAdd()" style="opacity:0.7">+ Add custom</button>';
    html += '</div></div>';

    container.innerHTML = html;
  });
}

function addSuggestedFeed(btn, name, url) {
  btn.disabled = true;
  btn.textContent = 'Adding\u2026';
  fetch('/api/config').then(function(r) { return r.json(); }).then(function(cfg) {
    var feeds = cfg.feeds || {};
    feeds[name] = url;
    return fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outputPath: cfg.outputPath, feeds: feeds, syncInterval: cfg.syncInterval, useBrowserCookies: cfg.useBrowserCookies, maxAgeDays: cfg.maxAgeDays })
    });
  }).then(function(r) {
    if (r.ok) {
      btn.textContent = '\u2713 Added';
      btn.style.opacity = '0.5';
      showToast('Added ' + name);
    } else {
      btn.textContent = name;
      btn.disabled = false;
    }
  }).catch(function() {
    btn.textContent = name;
    btn.disabled = false;
  });
}
```

**Step 2: Commit**

```bash
git add viewer/04-article.js
git commit -m "Add suggested feeds section to Hub with async fetch"
```

---

### Task 5: CSS for suggested feeds section

**Files:**
- Modify: `viewer.css`

**Step 1: Add suggested feeds styles**

Add after the existing `.dash-actions` styles (around line 1283):

```css
/* Suggested feeds section in Hub */
.hub-feeds-section {
  margin: 12px 0 16px;
  padding: 12px 16px;
  background: color-mix(in srgb, var(--link) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--link) 15%, transparent);
  border-radius: 10px;
}
.hub-feeds-hero {
  padding: 20px 20px;
  background: color-mix(in srgb, var(--link) 10%, transparent);
}
.hub-feeds-heading {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}
.hub-feeds-hero .hub-feeds-heading {
  font-size: 16px;
  margin-bottom: 6px;
}
.hub-feeds-desc {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 12px;
}
.hub-feeds-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.hub-feeds-dismiss {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--muted);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.hub-feeds-dismiss:hover { color: var(--fg); }
```

**Step 2: Commit**

```bash
git add viewer.css
git commit -m "Add CSS for suggested feeds section in Hub"
```

---

### Task 6: Remove Explore button and wire up navigation

**Files:**
- Modify: `viewer.html` (line 133)
- Modify: `viewer/04-article.js` (references to `showTagCloud`)
- Modify: `viewer/08-ai.js` (line 732 — batch autotag refresh)
- Modify: `viewer/10-explore.js` (keep `showTagCloud` as alias to `goHome` for backward compat during transition)

**Step 1: Remove Explore button from sidebar footer**

In `viewer.html` line 133, delete:
```html
<button class="sidebar-footer-btn" onclick="showTagCloud()" aria-label="Explore" title="Explore"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-tags"/></svg> Explore</button>
```

**Step 2: Update `showTagCloud()` references**

In `viewer/10-explore.js`, at the top of the file add after the builder functions:
```js
// Alias — callers of showTagCloud() now go to the Hub
function showTagCloud() { goHome(); }
```

Remove the old `showTagCloud()` function body (the big one that built the Explore page). Keep `buildConnectionsHtml()`, `jumpToArticle()`, and the new builder functions.

**Step 3: Remove Explore button from Quick Actions in `renderHub()`**

In the Quick Actions bar built in Task 3, the Explore button is already removed (not in the `renderHub` code). Verify it's gone.

**Step 4: Update `blockTag`/`unblockTag` onclick handlers**

In `buildTagsHtml()`, the `blockTag` and `unblockTag` onclick handlers currently call `showTagCloud()`. Since `showTagCloud` is now aliased to `goHome()`, these will work but will re-render the entire hub. This is acceptable behavior.

**Step 5: Commit**

```bash
git add viewer.html viewer/04-article.js viewer/08-ai.js viewer/10-explore.js
git commit -m "Remove standalone Explore page, wire showTagCloud to Hub"
```

---

### Task 7: Final verification and cleanup

**Files:**
- All modified files

**Step 1: Run tests**

Run: `bun test`
Expected: 365 tests pass, 0 fail

**Step 2: Manual verification checklist**

Open the app and verify:

- [ ] Landing page shows the Tabbed Hub (greeting, continue reading if applicable, tabs)
- [ ] "For You" tab is active by default, shows Reviews, Quick Filters, Tags, Connections, Recent
- [ ] "Tags" tab shows full tag cloud with block/unblock
- [ ] "Sources" tab shows domain groupings
- [ ] "Top" tab shows most-read articles
- [ ] Suggested feeds section appears (hero for new user, banner for established)
- [ ] Clicking a suggested feed pill adds it and shows "Added" feedback
- [ ] Dismiss button hides the suggested feeds banner
- [ ] Quick actions bar at bottom works (Daily Review, Weekly Review, Guide, Tour)
- [ ] Sidebar footer no longer has Explore button
- [ ] Clicking brand icon returns to Hub
- [ ] Tab switching works correctly
- [ ] All quick filter pills filter the sidebar and close the hub

**Step 3: Commit any final fixes**

```bash
git add -u
git commit -m "Home/Explore merger: final cleanup and verification"
```
