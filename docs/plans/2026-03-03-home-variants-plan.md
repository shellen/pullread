# Home Variants Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the monolithic "For You" Home tab with 3 purpose-built variants (Brief, Sections, Spotlight) accessible via a tab bar.

**Architecture:** Each variant is a builder function in `viewer/04-article.js` that returns an HTML string. `renderHub()` is refactored to call all three builders plus the existing Sources/Stats/Tags, wrapping each in a tab panel. Tab state persists in localStorage. All variants consume existing global data (`allFiles`, `allNotesIndex`, `readArticles`, `magicScore()`). New CSS goes in `viewer.css`. Shared section color palette goes in `viewer/02-utils.js`.

**Tech Stack:** Vanilla JS (no frameworks), CSS custom properties, HTML string builders, `localStorage` for tab persistence.

**Build/Test:** After each task, rebuild and verify:
```bash
bun scripts/embed-viewer.ts && bun build src/index.ts --compile --outfile dist/pullread && dist/pullread view --port 7778
```
Open `http://localhost:7778` and visually verify the Home page.

**Reference files:**
- Design doc: `docs/plans/2026-03-03-home-variants-design.md`
- Current Hub: `viewer/04-article.js` lines 4-230 (`renderHub()` and helpers)
- Explore tabs: `viewer/10-explore.js` (`collectExploreData()`, `buildSourcesHtml()`, etc.)
- Section data: `viewer/15-graph.js` (`buildSectionRundown()`, `buildDailyRundown()`)
- Shared utils: `viewer/02-utils.js` (`SECTION_LABELS`, `SECTIONS`, `resolveSection()`, `magicScore()` in `05-sidebar.js`)
- CSS: `viewer.css` (dashboard styles start ~line 1200, explore tabs ~4355, rundown ~4530)
- State: `viewer/01-state.js` (globals: `allFiles`, `allNotesIndex`, `readArticles`, `SOURCE_COLORS`, `sourceColor()`)

---

### Task 1: Section Color Palette

Add a fixed section-to-color mapping in `viewer/02-utils.js` so all three variants share consistent section colors.

**Files:**
- Modify: `viewer/02-utils.js` (after `SECTION_LABELS` around line 404)
- Modify: `viewer.css` (add CSS custom properties)

**Step 1: Add `SECTION_COLORS` map to `viewer/02-utils.js`**

Insert after the `SECTION_LABELS` object (line 404):

```javascript
var SECTION_COLORS = {
  tech: '#3b82f6',
  news: '#ef4444',
  science: '#8b5cf6',
  health: '#22c55e',
  business: '#f59e0b',
  culture: '#ec4899',
  sports: '#f97316',
  food: '#14b8a6',
  lifestyle: '#d946ef',
  environment: '#10b981',
  education: '#06b6d4',
  opinion: '#6366f1',
  other: '#6b7280'
};

function sectionColor(section) {
  return SECTION_COLORS[section] || SECTION_COLORS.other;
}
```

**Step 2: Add CSS custom properties to `viewer.css`**

Insert before the `.section-rundown` rule (~line 1200):

```css
  /* Section color palette — shared across Brief, Sections, Spotlight tabs */
  :root {
    --section-tech: #3b82f6;
    --section-news: #ef4444;
    --section-science: #8b5cf6;
    --section-health: #22c55e;
    --section-business: #f59e0b;
    --section-culture: #ec4899;
    --section-sports: #f97316;
    --section-food: #14b8a6;
    --section-lifestyle: #d946ef;
    --section-environment: #10b981;
    --section-education: #06b6d4;
    --section-opinion: #6366f1;
    --section-other: #6b7280;
  }
```

**Step 3: Rebuild and verify**

Run: `bun scripts/embed-viewer.ts && bun build src/index.ts --compile --outfile dist/pullread`
Expected: Build succeeds, no JS errors in browser console.

**Step 4: Commit**

```bash
git add viewer/02-utils.js viewer.css
git commit -m "feat: add shared section color palette for Home variants"
```

---

### Task 2: Refactor `renderHub()` Tab Bar

Replace the existing 4 tabs (For You, Sources, Stats, Tags) with 6 tabs (Brief, Sections, Spotlight, Sources, Stats, Tags). Keep tab persistence in localStorage. The existing "For You" content moves into a temporary passthrough while we build the variants.

**Files:**
- Modify: `viewer/04-article.js` lines 4-180 (`renderHub()`)

**Step 1: Add tab persistence helpers**

Insert before `renderHub()` (around line 3):

```javascript
function getHomeTab() {
  return localStorage.getItem('pr-home-tab') || 'brief';
}
function setHomeTab(tab) {
  localStorage.setItem('pr-home-tab', tab);
}
```

**Step 2: Replace the tab bar and tab panel wiring in `renderHub()`**

In `renderHub()`, replace the tab bar section (lines 31-37):

```javascript
  html += '<div class="explore-tabs">';
  html += '<button class="explore-tab active" data-tab="for-you">For You</button>';
  html += '<button class="explore-tab" data-tab="sources">Sources</button>';
  html += '<button class="explore-tab" data-tab="stats">Stats</button>';
  html += '<button class="explore-tab" data-tab="tags">Tags</button>';
  html += '</div>';
```

With:

```javascript
  var activeTab = getHomeTab();
  var tabs = [
    { id: 'brief', label: 'Brief' },
    { id: 'sections', label: 'Sections' },
    { id: 'spotlight', label: 'Spotlight' },
    { id: 'sources', label: 'Sources' },
    { id: 'stats', label: 'Stats' },
    { id: 'tags', label: 'Tags' }
  ];
  html += '<div class="explore-tabs">';
  for (var ti = 0; ti < tabs.length; ti++) {
    var isActive = tabs[ti].id === activeTab;
    html += '<button class="explore-tab' + (isActive ? ' active' : '') + '" data-tab="' + tabs[ti].id + '">' + tabs[ti].label + '</button>';
  }
  html += '</div>';
```

**Step 3: Replace the "For You" tab panel with three new panels**

Replace the `forYouHtml` building section and the final tab panel assembly (lines 42-168). Remove the entire `forYouHtml` variable and all the content that goes into `explore-for-you`. Replace with:

```javascript
  // --- Tab content ---
  var data = collectExploreData();
  var engagement = computeSourceEngagement();
  var mc = getMixerConfig();

  // Build Home variant tabs
  var briefHtml = buildBriefTab(engagement, mc);
  var sectionsHtml = buildSectionsTab(engagement, mc);
  var spotlightHtml = buildSpotlightTab(engagement, mc);

  html += '<div id="explore-brief" class="explore-tab-panel' + (activeTab === 'brief' ? ' active' : '') + '">' + briefHtml + '</div>';
  html += '<div id="explore-sections" class="explore-tab-panel' + (activeTab === 'sections' ? ' active' : '') + '">' + sectionsHtml + '</div>';
  html += '<div id="explore-spotlight" class="explore-tab-panel' + (activeTab === 'spotlight' ? ' active' : '') + '">' + spotlightHtml + '</div>';
  html += '<div id="explore-sources" class="explore-tab-panel' + (activeTab === 'sources' ? ' active' : '') + '">' + buildSourcesHtml(data) + '</div>';
  html += '<div id="explore-stats" class="explore-tab-panel' + (activeTab === 'stats' ? ' active' : '') + '">' + buildStatsTabHtml(data) + '</div>';
  html += '<div id="explore-tags" class="explore-tab-panel' + (activeTab === 'tags' ? ' active' : '') + '">' + buildTagsTabHtml(data) + '</div>';
```

**Step 4: Update tab click handler to persist selection**

Replace the tab wiring code (lines 172-180):

```javascript
  dash.querySelectorAll('.explore-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      dash.querySelectorAll('.explore-tab').forEach(function(b) { b.classList.remove('active'); });
      dash.querySelectorAll('.explore-tab-panel').forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('explore-' + btn.dataset.tab).classList.add('active');
    });
  });
```

With:

```javascript
  dash.querySelectorAll('.explore-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      dash.querySelectorAll('.explore-tab').forEach(function(b) { b.classList.remove('active'); });
      dash.querySelectorAll('.explore-tab-panel').forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var tabId = btn.dataset.tab;
      document.getElementById('explore-' + tabId).classList.add('active');
      setHomeTab(tabId);
    });
  });
```

**Step 5: Add stub builder functions**

Add placeholder functions (before `renderHub()`):

```javascript
function buildBriefTab(engagement, mc) {
  return '<div class="brief-tab"><p style="color:var(--muted);padding:20px">Brief tab — coming soon</p></div>';
}

function buildSectionsTab(engagement, mc) {
  return '<div class="sections-tab"><p style="color:var(--muted);padding:20px">Sections tab — coming soon</p></div>';
}

function buildSpotlightTab(engagement, mc) {
  return '<div class="spotlight-tab"><p style="color:var(--muted);padding:20px">Spotlight tab — coming soon</p></div>';
}
```

**Step 6: Remove old For You code**

Delete the following from `renderHub()`:
- The entire `forYouHtml` variable and all sections that build into it (Daily Rundown, Section Rundown, Continue Reading, Suggested Feeds, Reviews, Connections, Recent Unread, Your Topics, Quick Actions)
- The `_missingDaily`, `_missingWeekly`, review generation logic
- The `html += '<div id="explore-for-you"...'` line
- The `loadSuggestedFeedsSection()` call
- The review background generation block

Keep:
- `initDashChevrons` call in `requestAnimationFrame`
- `initRundown` call in `requestAnimationFrame`
- The `ttsQueue` mini player check
- The greeting at the top

**Step 7: Rebuild and verify**

Run: `bun scripts/embed-viewer.ts && bun build src/index.ts --compile --outfile dist/pullread && dist/pullread view --port 7778`
Expected: 6 tabs visible, clicking tabs shows stub content for Brief/Sections/Spotlight, Sources/Stats/Tags work as before. Tab selection persists across page reloads.

**Step 8: Commit**

```bash
git add viewer/04-article.js
git commit -m "refactor: replace For You tab with Brief/Sections/Spotlight stubs"
```

---

### Task 3: Build Brief Tab — Mini Treemap

Implement the mini treemap component that shows sections as colored blocks proportional to unread article count.

**Files:**
- Modify: `viewer/04-article.js` (replace `buildBriefTab()` stub)
- Modify: `viewer.css` (add treemap styles)

**Step 1: Add treemap CSS to `viewer.css`**

Insert after the section color palette custom properties (added in Task 1):

```css
  /* Brief tab — mini treemap */
  .brief-treemap {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 0 4px;
    margin-bottom: 20px;
    min-height: 60px;
    max-height: 150px;
  }
  .brief-treemap-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    padding: 8px 6px;
    cursor: pointer;
    color: #fff;
    text-align: center;
    min-width: 60px;
    transition: opacity 0.15s, transform 0.1s;
    -webkit-tap-highlight-color: transparent;
  }
  .brief-treemap-block:hover { opacity: 0.85; }
  .brief-treemap-block:active { transform: scale(0.97); }
  .brief-treemap-label {
    font-size: 11px;
    font-weight: 600;
    line-height: 1.2;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
  .brief-treemap-count {
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
    margin-top: 2px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
```

**Step 2: Begin building `buildBriefTab()`**

Replace the stub with the start of the real function. For now, just the treemap:

```javascript
function buildBriefTab(engagement, mc) {
  var html = '<div class="brief-tab">';

  // Count unread articles per section
  var sectionUnread = {};
  var totalUnread = 0;
  for (var i = 0; i < allFiles.length; i++) {
    var f = allFiles[i];
    if (readArticles.has(f.filename)) continue;
    if (f.feed === 'weekly-review' || f.feed === 'daily-review' || f.domain === 'pullread') continue;
    var sec = resolveSection(f.filename);
    sectionUnread[sec] = (sectionUnread[sec] || 0) + 1;
    totalUnread++;
  }

  // Sort sections by unread count descending
  var sortedSections = Object.keys(sectionUnread).sort(function(a, b) {
    return sectionUnread[b] - sectionUnread[a];
  });

  // Mini treemap
  if (sortedSections.length > 0 && totalUnread > 0) {
    html += '<div class="brief-treemap">';
    for (var si = 0; si < sortedSections.length; si++) {
      var sec = sortedSections[si];
      var count = sectionUnread[sec];
      // flex-grow proportional to count, min 1
      var grow = Math.max(Math.round(count / totalUnread * 20), 1);
      var color = sectionColor(sec);
      var label = SECTION_LABELS[sec] || sec;
      html += '<div class="brief-treemap-block" style="flex-grow:' + grow + ';background:' + color + '" onclick="document.getElementById(\'search\').value=\'section:' + escapeJsStr(sec) + '\';filterFiles()">';
      html += '<span class="brief-treemap-label">' + escapeHtml(label) + '</span>';
      html += '<span class="brief-treemap-count">' + count + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}
```

**Step 3: Rebuild and verify**

Run: `bun scripts/embed-viewer.ts && bun build src/index.ts --compile --outfile dist/pullread && dist/pullread view --port 7778`
Expected: Brief tab shows colored blocks proportional to unread counts. Clicking a block filters the sidebar.

**Step 4: Commit**

```bash
git add viewer/04-article.js viewer.css
git commit -m "feat: Brief tab — mini treemap showing sections by unread count"
```

---

### Task 4: Build Brief Tab — Lead Story + Section Headlines + Continue Reading

Complete the Brief tab with the lead story card, section headlines, and continue reading.

**Files:**
- Modify: `viewer/04-article.js` (`buildBriefTab()`)
- Modify: `viewer.css` (add brief headline styles)

**Step 1: Add Brief headline CSS to `viewer.css`**

```css
  /* Brief tab — lead story */
  .brief-lead {
    margin: 0 4px 20px;
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    background: var(--code-bg);
    transition: transform 0.1s;
    -webkit-tap-highlight-color: transparent;
  }
  .brief-lead:hover { transform: scale(0.995); }
  .brief-lead:active { transform: scale(0.99); }
  .brief-lead img {
    width: 100%;
    height: 200px;
    object-fit: cover;
    display: block;
  }
  .brief-lead-body {
    padding: 12px 14px;
  }
  .brief-lead-title {
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 400;
    line-height: 1.3;
    margin-bottom: 4px;
  }
  .brief-lead-meta {
    font-size: 12px;
    color: var(--muted);
  }
  .brief-lead-excerpt {
    font-size: 13px;
    color: var(--muted);
    line-height: 1.4;
    margin-top: 6px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Brief tab — section headlines */
  .brief-section-group {
    margin: 0 4px 16px;
  }
  .brief-section-name {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    padding-left: 2px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .brief-section-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .brief-headline-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 5px 2px;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.1s;
    -webkit-tap-highlight-color: transparent;
  }
  .brief-headline-row:hover { background: var(--hover); }
  .brief-headline-title {
    flex: 1;
    font-size: 14px;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .brief-headline-source {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
  }
  .brief-headline-time {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
  }
```

**Step 2: Extend `buildBriefTab()` — add lead story, section headlines, continue reading**

After the treemap closing `</div>` and before the final `html += '</div>'; return html;`, add:

```javascript
  // Score all unread articles
  var unreadArticles = allFiles.filter(function(f) {
    return !readArticles.has(f.filename) && f.feed !== 'weekly-review' && f.feed !== 'daily-review' && f.domain !== 'pullread';
  });
  unreadArticles.sort(function(a, b) {
    return magicScore(b, engagement, mc) - magicScore(a, engagement, mc);
  });

  // Lead story — highest scoring unread article
  if (unreadArticles.length > 0) {
    var lead = unreadArticles[0];
    html += '<div class="brief-lead" onclick="dashLoadArticle(\'' + escapeJsStr(lead.filename) + '\')">';
    if (lead.image) {
      html += '<img src="' + escapeHtml(lead.image) + '" alt="" loading="eager" onerror="this.remove()">';
    }
    html += '<div class="brief-lead-body">';
    html += '<div class="brief-lead-title">' + escapeHtml(lead.title) + '</div>';
    html += '<div class="brief-lead-meta">' + escapeHtml(lead.domain || lead.feed || '') + (lead.bookmarked ? ' &middot; ' + timeAgo(lead.bookmarked) : '') + '</div>';
    if (lead.excerpt) {
      html += '<div class="brief-lead-excerpt">' + escapeHtml(lead.excerpt) + '</div>';
    }
    html += '</div></div>';
  }

  // Section headlines — group unread articles by section, up to 3 per section
  var sectionArticles = {};
  for (var ai = 0; ai < unreadArticles.length; ai++) {
    var a = unreadArticles[ai];
    var sec = resolveSection(a.filename);
    if (!sectionArticles[sec]) sectionArticles[sec] = [];
    if (sectionArticles[sec].length < 3) sectionArticles[sec].push(a);
  }

  for (var si2 = 0; si2 < sortedSections.length; si2++) {
    var sec = sortedSections[si2];
    var articles = sectionArticles[sec];
    if (!articles || articles.length === 0) continue;
    var color = sectionColor(sec);
    var label = SECTION_LABELS[sec] || sec;

    html += '<div class="brief-section-group">';
    html += '<div class="brief-section-name"><span class="brief-section-dot" style="background:' + color + '"></span>' + escapeHtml(label) + '</div>';
    for (var hi = 0; hi < articles.length; hi++) {
      var a = articles[hi];
      html += '<div class="brief-headline-row" onclick="dashLoadArticle(\'' + escapeJsStr(a.filename) + '\')">';
      html += '<span class="brief-headline-title">' + escapeHtml(a.title) + '</span>';
      html += '<span class="brief-headline-source">' + escapeHtml(a.domain || a.feed || '') + '</span>';
      if (a.bookmarked) html += '<span class="brief-headline-time">' + timeAgo(a.bookmarked) + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  // Continue reading
  var positions = JSON.parse(localStorage.getItem('pr-scroll-positions') || '{}');
  var continueReading = allFiles.filter(function(f) {
    var pos = positions[f.filename];
    return pos && pos.pct > 0.05 && pos.pct < 0.9;
  }).sort(function(a, b) {
    return (positions[b.filename].ts || 0) - (positions[a.filename].ts || 0);
  }).slice(0, 3);

  if (continueReading.length > 0) {
    html += '<div class="dash-section">';
    html += '<div class="dash-section-header"><span class="dash-section-title">Continue Reading</span></div>';
    html += '<div class="dash-cards-wrap"><button class="dash-chevron left" onclick="dashScrollLeft(this)" aria-label="Scroll left">&#8249;</button><div class="dash-cards">';
    for (var ci = 0; ci < continueReading.length; ci++) {
      html += dashCardHtml(continueReading[ci], positions[continueReading[ci].filename] ? positions[continueReading[ci].filename].pct : undefined, ci === 0 ? 'featured' : 'standard');
    }
    html += '</div><button class="dash-chevron right" onclick="dashScrollRight(this)" aria-label="Scroll right">&#8250;</button></div></div>';
  }
```

**Step 3: Rebuild and verify**

Run: `bun scripts/embed-viewer.ts && bun build src/index.ts --compile --outfile dist/pullread && dist/pullread view --port 7778`
Expected: Brief tab shows treemap → lead story with image → section headline groups with colored dots → continue reading cards. Clicking headlines opens articles.

**Step 4: Commit**

```bash
git add viewer/04-article.js viewer.css
git commit -m "feat: Brief tab — lead story, section headlines, continue reading"
```

---

### Task 5: Build Sections Tab

Implement the Yahoo-style portal with section blocks in a 2-column grid.

**Files:**
- Modify: `viewer/04-article.js` (replace `buildSectionsTab()` stub)
- Modify: `viewer.css` (add sections grid styles)

**Step 1: Add Sections tab CSS to `viewer.css`**

```css
  /* Sections tab — portal grid */
  .sections-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    padding: 0 4px;
  }
  @media (max-width: 700px) {
    .sections-grid { grid-template-columns: 1fr; }
  }
  .sections-block {
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--code-bg);
  }
  .sections-block-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }
  .sections-block-color {
    width: 4px;
    height: 20px;
    border-radius: 2px;
  }
  .sections-block-name {
    font-size: 14px;
    font-weight: 600;
    flex: 1;
  }
  .sections-block-count {
    font-size: 12px;
    color: var(--muted);
  }
  .sections-featured {
    display: flex;
    gap: 10px;
    padding: 10px 12px;
    cursor: pointer;
    transition: background 0.1s;
    -webkit-tap-highlight-color: transparent;
  }
  .sections-featured:hover { background: var(--hover); }
  .sections-featured img {
    width: 80px;
    height: 60px;
    object-fit: cover;
    border-radius: 6px;
    flex-shrink: 0;
  }
  .sections-featured-body {
    flex: 1;
    min-width: 0;
  }
  .sections-featured-title {
    font-size: 14px;
    font-weight: 500;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 2px;
  }
  .sections-featured-meta {
    font-size: 11px;
    color: var(--muted);
  }
  .sections-headline {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 5px 12px;
    cursor: pointer;
    transition: background 0.1s;
    -webkit-tap-highlight-color: transparent;
  }
  .sections-headline:hover { background: var(--hover); }
  .sections-headline-title {
    flex: 1;
    font-size: 13px;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .sections-headline-time {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
  }
  .sections-more {
    display: block;
    padding: 8px 12px;
    font-size: 12px;
    color: var(--link);
    text-decoration: none;
    cursor: pointer;
    border-top: 1px solid var(--border);
    text-align: center;
    transition: background 0.1s;
  }
  .sections-more:hover { background: var(--hover); }
```

**Step 2: Implement `buildSectionsTab()`**

Replace the stub:

```javascript
function buildSectionsTab(engagement, mc) {
  var html = '<div class="sections-tab">';

  // Get section rundown data (already scored and ranked)
  var sections = buildSectionRundown();
  if (sections.length === 0) {
    html += '<p style="color:var(--muted);padding:20px">No unread articles</p>';
    html += '</div>';
    return html;
  }

  // Sort sections by engagement weight
  sections.sort(function(a, b) {
    // Sum engagement across articles in each section
    var engA = 0, engB = 0;
    for (var i = 0; i < a.articles.length; i++) {
      var key = a.articles[i].feed || a.articles[i].domain || 'unknown';
      engA += engagement[key] || 0;
    }
    for (var i = 0; i < b.articles.length; i++) {
      var key = b.articles[i].feed || b.articles[i].domain || 'unknown';
      engB += engagement[key] || 0;
    }
    return engB - engA;
  });

  html += '<div class="sections-grid">';
  for (var si = 0; si < sections.length; si++) {
    var sec = sections[si];
    var color = sectionColor(sec.section);

    html += '<div class="sections-block">';

    // Header
    html += '<div class="sections-block-header">';
    html += '<div class="sections-block-color" style="background:' + color + '"></div>';
    html += '<span class="sections-block-name">' + escapeHtml(sec.label) + '</span>';
    html += '<span class="sections-block-count">' + sec.totalCount + '</span>';
    html += '</div>';

    // Featured article (first one)
    if (sec.articles.length > 0) {
      var feat = sec.articles[0];
      html += '<div class="sections-featured" onclick="dashLoadArticle(\'' + escapeJsStr(feat.filename) + '\')">';
      if (feat.image) {
        html += '<img src="' + escapeHtml(feat.image) + '" alt="" loading="lazy" onerror="this.remove()">';
      }
      html += '<div class="sections-featured-body">';
      html += '<div class="sections-featured-title">' + escapeHtml(feat.title) + '</div>';
      html += '<div class="sections-featured-meta">' + escapeHtml(feat.domain || feat.feed || '') + (feat.bookmarked ? ' &middot; ' + timeAgo(feat.bookmarked) : '') + '</div>';
      html += '</div></div>';
    }

    // Headline list (remaining articles, up to 4)
    for (var hi = 1; hi < Math.min(sec.articles.length, 5); hi++) {
      var a = sec.articles[hi];
      html += '<div class="sections-headline" onclick="dashLoadArticle(\'' + escapeJsStr(a.filename) + '\')">';
      html += '<span class="sections-headline-title">' + escapeHtml(a.title) + '</span>';
      if (a.bookmarked) html += '<span class="sections-headline-time">' + timeAgo(a.bookmarked) + '</span>';
      html += '</div>';
    }

    // "More in Section" link
    if (sec.totalCount > sec.articles.length) {
      html += '<a class="sections-more" onclick="document.getElementById(\'search\').value=\'section:' + escapeJsStr(sec.section) + '\';filterFiles()">More in ' + escapeHtml(sec.label) + ' (' + sec.totalCount + ') &rsaquo;</a>';
    }

    html += '</div>'; // .sections-block
  }
  html += '</div>'; // .sections-grid

  html += '</div>';
  return html;
}
```

**Step 3: Rebuild and verify**

Run: `bun scripts/embed-viewer.ts && bun build src/index.ts --compile --outfile dist/pullread && dist/pullread view --port 7778`
Expected: Sections tab shows 2-column grid of section blocks. Each block has colored sidebar accent, featured article with thumbnail, headline list, "More in..." link. Mobile (narrow window) shows single column.

**Step 4: Commit**

```bash
git add viewer/04-article.js viewer.css
git commit -m "feat: Sections tab — portal grid with section blocks"
```

---

### Task 6: Build Spotlight Tab — Story Deck

Implement the left-column vertical story deck with auto-rotating slides.

**Files:**
- Modify: `viewer/04-article.js` (replace `buildSpotlightTab()` stub, add deck init)
- Modify: `viewer.css` (add spotlight styles)

**Step 1: Add Spotlight CSS to `viewer.css`**

```css
  /* Spotlight tab — two-area layout */
  .spotlight-layout {
    display: flex;
    gap: 16px;
    padding: 0 4px;
    min-height: 400px;
  }
  @media (max-width: 700px) {
    .spotlight-layout { flex-direction: column; }
  }

  /* Story deck (left column) */
  .spotlight-deck {
    flex: 0 0 40%;
    max-width: 40%;
    border-radius: 14px;
    overflow: hidden;
    position: relative;
    background: #000;
    min-height: 400px;
  }
  @media (max-width: 700px) {
    .spotlight-deck {
      flex: none;
      max-width: 100%;
      min-height: 240px;
      max-height: 300px;
    }
  }
  .spotlight-deck-track {
    display: flex;
    height: 100%;
    transition: transform 0.5s ease;
  }
  .spotlight-slide {
    flex: 0 0 100%;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .spotlight-slide img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .spotlight-slide-body {
    position: relative;
    z-index: 1;
    padding: 24px 16px 16px;
    background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 60%, transparent 100%);
    color: #fff;
  }
  .spotlight-slide-section {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: 3px;
    margin-bottom: 6px;
  }
  .spotlight-slide-title {
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 400;
    line-height: 1.25;
    margin-bottom: 4px;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .spotlight-slide-meta {
    font-size: 12px;
    color: rgba(255,255,255,0.7);
  }
  .spotlight-deck-dots {
    position: absolute;
    top: 8px;
    left: 10px;
    right: 10px;
    display: flex;
    gap: 4px;
    z-index: 2;
  }
  .spotlight-deck-dot {
    flex: 1;
    height: 3px;
    border-radius: 2px;
    background: rgba(255,255,255,0.3);
    background-clip: content-box;
    padding: 8px 0;
    cursor: pointer;
    min-height: 20px;
  }
  .spotlight-deck-dot.active {
    background: #fff;
    background-clip: content-box;
  }
  .spotlight-deck-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0,0,0,0.4);
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    font-size: 18px;
    cursor: pointer;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .spotlight-deck-nav:hover { background: rgba(0,0,0,0.6); }
  .spotlight-deck-nav.prev { left: 8px; }
  .spotlight-deck-nav.next { right: 8px; }
```

**Step 2: Implement `buildSpotlightTab()`**

Replace the stub:

```javascript
function buildSpotlightTab(engagement, mc) {
  var html = '<div class="spotlight-tab">';

  // Get top articles with images for story deck
  var unreadWithImages = allFiles.filter(function(f) {
    return !readArticles.has(f.filename) && f.image && f.feed !== 'weekly-review' && f.feed !== 'daily-review' && f.domain !== 'pullread';
  });
  unreadWithImages.sort(function(a, b) {
    return magicScore(b, engagement, mc) - magicScore(a, engagement, mc);
  });

  var deckArticles = unreadWithImages.slice(0, 7);
  var restArticles = unreadWithImages.slice(7, 25);

  // Also include articles without images in rest
  var unreadNoImages = allFiles.filter(function(f) {
    return !readArticles.has(f.filename) && !f.image && f.feed !== 'weekly-review' && f.feed !== 'daily-review' && f.domain !== 'pullread';
  });
  unreadNoImages.sort(function(a, b) {
    return magicScore(b, engagement, mc) - magicScore(a, engagement, mc);
  });
  restArticles = restArticles.concat(unreadNoImages.slice(0, 10));

  if (deckArticles.length === 0 && restArticles.length === 0) {
    html += '<p style="color:var(--muted);padding:20px">No unread articles</p></div>';
    return html;
  }

  html += '<div class="spotlight-layout">';

  // Story deck (left)
  if (deckArticles.length > 0) {
    html += '<div class="spotlight-deck" id="spotlight-deck">';

    // Dots
    html += '<div class="spotlight-deck-dots">';
    for (var di = 0; di < deckArticles.length; di++) {
      html += '<span class="spotlight-deck-dot' + (di === 0 ? ' active' : '') + '" onclick="spotlightGoTo(' + di + ')"></span>';
    }
    html += '</div>';

    // Nav buttons
    html += '<button class="spotlight-deck-nav prev" onclick="spotlightPrev()" aria-label="Previous">&#8249;</button>';
    html += '<button class="spotlight-deck-nav next" onclick="spotlightNext()" aria-label="Next">&#8250;</button>';

    // Slide track
    html += '<div class="spotlight-deck-track" id="spotlight-deck-track">';
    for (var si = 0; si < deckArticles.length; si++) {
      var a = deckArticles[si];
      var sec = resolveSection(a.filename);
      var color = sectionColor(sec);
      var secLabel = SECTION_LABELS[sec] || sec;

      html += '<div class="spotlight-slide" onclick="dashLoadArticle(\'' + escapeJsStr(a.filename) + '\')">';
      html += '<img src="' + escapeHtml(a.image) + '" alt="" loading="' + (si === 0 ? 'eager' : 'lazy') + '" onerror="this.style.display=\'none\'">';
      html += '<div class="spotlight-slide-body">';
      html += '<span class="spotlight-slide-section" style="background:' + color + '">' + escapeHtml(secLabel) + '</span>';
      html += '<div class="spotlight-slide-title">' + escapeHtml(a.title) + '</div>';
      html += '<div class="spotlight-slide-meta">' + escapeHtml(a.domain || a.feed || '') + (a.bookmarked ? ' &middot; ' + timeAgo(a.bookmarked) : '') + '</div>';
      html += '</div></div>';
    }
    html += '</div>'; // track
    html += '</div>'; // deck
  }

  // Media cards grid (right) — placeholder for Task 7
  html += '<div class="spotlight-cards" id="spotlight-cards">';
  html += '<p style="color:var(--muted);padding:20px">Cards loading...</p>';
  html += '</div>';

  html += '</div>'; // .spotlight-layout
  html += '</div>';
  return html;
}
```

**Step 3: Add deck navigation and auto-advance JS**

Add after `buildSpotlightTab()`:

```javascript
var _spotlightIndex = 0;
var _spotlightTimer = null;

function spotlightGoTo(index) {
  var deck = document.getElementById('spotlight-deck');
  if (!deck) return;
  var track = document.getElementById('spotlight-deck-track');
  var dots = deck.querySelectorAll('.spotlight-deck-dot');
  var count = dots.length;
  if (index < 0) index = count - 1;
  if (index >= count) index = 0;
  _spotlightIndex = index;
  track.style.transform = 'translateX(-' + (index * 100) + '%)';
  for (var i = 0; i < dots.length; i++) {
    dots[i].classList.toggle('active', i === index);
  }
  spotlightResetTimer();
}

function spotlightNext() { spotlightGoTo(_spotlightIndex + 1); }
function spotlightPrev() { spotlightGoTo(_spotlightIndex - 1); }

function spotlightResetTimer() {
  clearInterval(_spotlightTimer);
  // Only auto-advance on wider screens
  if (window.innerWidth > 700) {
    _spotlightTimer = setInterval(function() {
      spotlightGoTo(_spotlightIndex + 1);
    }, 8000);
  }
}

function initSpotlightDeck() {
  var deck = document.getElementById('spotlight-deck');
  if (!deck) return;
  _spotlightIndex = 0;
  spotlightResetTimer();

  // Pause on hover
  deck.addEventListener('mouseenter', function() { clearInterval(_spotlightTimer); });
  deck.addEventListener('mouseleave', function() { spotlightResetTimer(); });

  // Swipe support
  var startX = 0;
  deck.addEventListener('touchstart', function(e) {
    startX = e.touches[0].clientX;
    clearInterval(_spotlightTimer);
  }, { passive: true });
  deck.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) {
      dx > 0 ? spotlightPrev() : spotlightNext();
    } else {
      spotlightResetTimer();
    }
  }, { passive: true });
}
```

**Step 4: Wire up deck init in `renderHub()`**

In `renderHub()`, after the `requestAnimationFrame(initDashChevrons);` line, add:

```javascript
  requestAnimationFrame(initSpotlightDeck);
```

**Step 5: Rebuild and verify**

Run: `bun scripts/embed-viewer.ts && bun build src/index.ts --compile --outfile dist/pullread && dist/pullread view --port 7778`
Expected: Spotlight tab shows a story deck on the left with slides, dot indicators, prev/next buttons. Auto-advances every 8s. Pauses on hover. Swipe works on mobile.

**Step 6: Commit**

```bash
git add viewer/04-article.js viewer.css
git commit -m "feat: Spotlight tab — story deck with auto-rotating slides"
```

---

### Task 7: Build Spotlight Tab — Media Cards Grid

Complete the right side of the Spotlight tab with engagement-weighted media cards.

**Files:**
- Modify: `viewer/04-article.js` (fill in spotlight cards)
- Modify: `viewer.css` (add media card styles)

**Step 1: Add media card CSS to `viewer.css`**

```css
  /* Spotlight tab — media cards grid (right area) */
  .spotlight-cards {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
    align-content: start;
  }
  @media (max-width: 700px) {
    .spotlight-cards {
      grid-template-columns: 1fr;
    }
  }
  .spotlight-card {
    border-radius: 10px;
    overflow: hidden;
    background: var(--code-bg);
    border: 1px solid var(--border);
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .spotlight-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .spotlight-card:active { transform: scale(0.98); }
  .spotlight-card-large {
    grid-column: span 2;
    grid-row: span 2;
  }
  @media (max-width: 700px) {
    .spotlight-card-large { grid-column: span 1; grid-row: span 1; }
  }
  .spotlight-card img {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
    display: block;
  }
  .spotlight-card-large img {
    aspect-ratio: 4/3;
  }
  .spotlight-card-body {
    padding: 8px 10px 10px;
  }
  .spotlight-card-title {
    font-size: 13px;
    font-weight: 500;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 4px;
  }
  .spotlight-card-large .spotlight-card-title {
    font-size: 15px;
    -webkit-line-clamp: 3;
  }
  .spotlight-card-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--muted);
  }
  .spotlight-card-section {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 3px;
    color: #fff;
  }
  .spotlight-card-engagement {
    display: flex;
    gap: 1px;
    align-items: flex-end;
    height: 12px;
  }
  .spotlight-card-bar {
    width: 3px;
    border-radius: 1px;
    background: var(--muted);
    opacity: 0.4;
  }
  .spotlight-card-bar.filled {
    opacity: 1;
  }
```

**Step 2: Replace the spotlight cards placeholder in `buildSpotlightTab()`**

Replace this block:

```javascript
  // Media cards grid (right) — placeholder for Task 7
  html += '<div class="spotlight-cards" id="spotlight-cards">';
  html += '<p style="color:var(--muted);padding:20px">Cards loading...</p>';
  html += '</div>';
```

With:

```javascript
  // Media cards grid (right)
  html += '<div class="spotlight-cards" id="spotlight-cards">';
  if (restArticles.length > 0) {
    for (var ri = 0; ri < restArticles.length; ri++) {
      var a = restArticles[ri];
      var sec = resolveSection(a.filename);
      var color = sectionColor(sec);
      var secLabel = SECTION_LABELS[sec] || sec;
      var score = magicScore(a, engagement, mc);
      // First 2 cards are large if they have images
      var isLarge = ri < 2 && a.image;
      var sizeClass = isLarge ? ' spotlight-card-large' : '';

      html += '<div class="spotlight-card' + sizeClass + '" onclick="dashLoadArticle(\'' + escapeJsStr(a.filename) + '\')">';
      if (a.image) {
        html += '<img src="' + escapeHtml(a.image) + '" alt="" loading="lazy" onerror="this.remove()">';
      }
      html += '<div class="spotlight-card-body">';
      html += '<div class="spotlight-card-title">' + escapeHtml(a.title) + '</div>';
      html += '<div class="spotlight-card-meta">';
      html += '<span class="spotlight-card-section" style="background:' + color + '">' + escapeHtml(secLabel) + '</span>';
      html += '<span>' + escapeHtml(a.domain || a.feed || '') + '</span>';

      // Source engagement mini bar
      var key = a.feed || a.domain || 'unknown';
      var eng = engagement[key] || 0;
      var engLevel = Math.round(eng * 5); // 0-5
      html += '<span class="spotlight-card-engagement">';
      for (var bi = 0; bi < 5; bi++) {
        var h = 3 + bi * 2;
        html += '<span class="spotlight-card-bar' + (bi < engLevel ? ' filled' : '') + '" style="height:' + h + 'px"></span>';
      }
      html += '</span>';

      if (a.bookmarked) html += '<span>' + timeAgo(a.bookmarked) + '</span>';
      html += '</div>'; // meta
      html += '</div>'; // body
      html += '</div>'; // card
    }
  } else {
    html += '<p style="color:var(--muted);padding:20px">No additional articles</p>';
  }
  html += '</div>'; // .spotlight-cards
```

**Step 3: Rebuild and verify**

Run: `bun scripts/embed-viewer.ts && bun build src/index.ts --compile --outfile dist/pullread && dist/pullread view --port 7778`
Expected: Spotlight tab shows story deck on left, media cards grid on right. First 2 cards are larger. Cards show section pill, source engagement bars, timestamps. Mobile shows carousel-style deck on top and single-column cards below.

**Step 4: Commit**

```bash
git add viewer/04-article.js viewer.css
git commit -m "feat: Spotlight tab — media cards grid with engagement indicators"
```

---

### Task 8: Polish and Edge Cases

Handle edge cases, clean up dead code from old For You tab, and ensure all tabs work with zero articles.

**Files:**
- Modify: `viewer/04-article.js`

**Step 1: Verify empty states**

Each builder function should handle zero articles gracefully. Check that:
- `buildBriefTab()` with no unread articles shows a helpful message
- `buildSectionsTab()` with no unread articles shows a helpful message (already handled)
- `buildSpotlightTab()` with no unread articles shows a helpful message (already handled)

If `buildBriefTab()` doesn't have an empty state, add one at the top after counting `totalUnread`:

```javascript
  if (totalUnread === 0) {
    html += '<p style="color:var(--muted);padding:20px;text-align:center">All caught up</p>';
    html += '</div>';
    return html;
  }
```

**Step 2: Clean up dead code**

In `viewer/04-article.js`, delete any leftover functions or code that were only used by the old For You tab and are no longer referenced:
- `buildDailyRundownHtml()` — check if it's still used. If only used in the old For You tab, keep it for now (it's referenced by `initRundown`).
- `buildSectionRundownHtml()` — check if it's still used outside of For You tab. The Sections tab calls `buildSectionRundown()` directly, but `buildSectionRundownHtml()` may be dead code now. If so, remove it.
- `loadSuggestedFeedsSection()` — check if it's still called anywhere. If not, leave it (called from `14-suggested-feeds.js`).

Be conservative — only remove code you're certain is dead.

**Step 3: Verify `initRundown()` and `initDashChevrons()` still work**

The Brief tab uses `dashCardHtml()` and `dash-cards-wrap` (for Continue Reading), so `initDashChevrons()` is still needed. `initRundown()` was for the Daily Rundown carousel — if it's no longer rendered, `initRundown()` will just return early (it checks for `.rundown-track` element).

**Step 4: Rebuild and verify full flow**

Run: `bun scripts/embed-viewer.ts && bun build src/index.ts --compile --outfile dist/pullread && dist/pullread view --port 7778`
Expected:
- All 6 tabs work
- Tab persists across page reload
- Brief: treemap → lead story → headlines → continue reading
- Sections: 2-col grid of section blocks
- Spotlight: story deck + media cards
- Sources/Stats/Tags: unchanged from before
- No JS errors in console
- Empty states display correctly when no articles

**Step 5: Commit**

```bash
git add viewer/04-article.js
git commit -m "chore: clean up dead code and add empty states for Home variants"
```
