# Onboarding Tour Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 5-step setup-only onboarding wizard with a unified 6-step flow combining setup + feature discovery, re-launchable from Settings and Dashboard.

**Architecture:** Rewrite `renderOnboardingStep()` in `viewer/11-modals.js` to use a step-definition array instead of chained if/else. A `_tourMode` boolean skips the setup step (step index 1) when re-launched. Add `showTour()` trigger to Settings About section and Dashboard quick actions.

**Tech Stack:** Vanilla JS (viewer modules), HTML string templates, existing `ob-*` CSS classes.

---

### Task 1: Rewrite onboarding step renderer with step definitions

This is the core change. Replace the inline if/else chain in `renderOnboardingStep()` with a data-driven step array and add three new feature-discovery steps.

**Files:**
- Modify: `viewer/11-modals.js:213-424`

**Step 1: Replace the step variables and constants**

Replace lines 213-218 of `viewer/11-modals.js`:

```javascript
let _obStep = 0;
let _obFeeds = {}; // { name: url }
let _obOutputPath = '~/Documents/PullRead';
let _obCookies = false;
let _obFeedLoading = false;
const OB_TOTAL_STEPS = 5;
```

With:

```javascript
let _obStep = 0;
let _obFeeds = {};
let _obOutputPath = '~/Documents/PullRead';
let _obFeedLoading = false;
let _tourMode = false;
```

Note: `_obCookies` is removed (cookies toggle dropped from onboarding per design). `OB_TOTAL_STEPS` is removed (computed dynamically from steps array). `_tourMode` controls whether setup step is shown.

**Step 2: Replace `dismissOnboarding` and `showOnboardingIfNeeded`**

Replace lines 220-242 with:

```javascript
function dismissOnboarding() {
  document.getElementById('onboarding').style.display = 'none';
  localStorage.setItem('pr-onboarded', '1');
}

function showTour() {
  _tourMode = true;
  _obStep = 0;
  document.getElementById('onboarding').style.display = 'flex';
  renderOnboardingStep();
}

async function showOnboardingIfNeeded() {
  if (localStorage.getItem('pr-onboarded')) return;
  try {
    var r = await fetch('/api/config');
    var cfg = await r.json();
    if (cfg.configured) {
      localStorage.setItem('pr-onboarded', '1');
      return;
    }
    if (cfg.outputPath) _obOutputPath = cfg.outputPath;
    if (cfg.feeds) _obFeeds = cfg.feeds;
  } catch (e) {}
  _tourMode = false;
  _obStep = 0;
  document.getElementById('onboarding').style.display = 'flex';
  renderOnboardingStep();
}
```

**Step 3: Replace `renderOnboardingStep` with data-driven renderer**

Replace lines 244-363 (the entire `renderOnboardingStep` function) with:

```javascript
function getOnboardingSteps() {
  var steps = [
    { id: 'welcome', render: renderStepWelcome },
    { id: 'setup', render: renderStepSetup, setupOnly: true },
    { id: 'reading', render: renderStepReading },
    { id: 'search', render: renderStepSearch },
    { id: 'listening', render: renderStepListening },
    { id: 'ready', render: renderStepReady }
  ];
  if (_tourMode) return steps.filter(function(s) { return !s.setupOnly; });
  return steps;
}

function renderOnboardingStep() {
  var card = document.getElementById('onboarding-card');
  var steps = getOnboardingSteps();
  var total = steps.length;

  var progress = '<div class="ob-progress">';
  for (var i = 0; i < total; i++) {
    progress += '<div class="ob-progress-bar' + (i <= _obStep ? ' active' : '') + '"></div>';
  }
  progress += '</div>';

  var html = progress;
  html += steps[_obStep].render();

  // Navigation
  html += '<div class="ob-nav">';
  if (_obStep > 0) {
    html += '<button onclick="obBack()">Back</button>';
  } else {
    html += '<span></span>';
  }
  if (_obStep < total - 1) {
    html += '<button class="ob-primary" onclick="obNext()">Next</button>';
  } else {
    html += '<button class="ob-primary" onclick="obFinish()">' + (_tourMode ? 'Done' : 'Get Started') + '</button>';
  }
  html += '</div>';

  card.innerHTML = html;
}
```

**Step 4: Add the step render functions**

Add these functions after `renderOnboardingStep`:

```javascript
function renderStepWelcome() {
  var title = _tourMode ? "What's in PullRead" : 'Welcome to PullRead';
  var subtitle = _tourMode
    ? 'A quick look at what you can do with your reading library.'
    : 'Save articles as clean, local markdown you can read anywhere. Install our bookmarking shortcut or use PullRead with your favorite service.';
  return '<div style="text-align:center;padding:12px 0">'
    + '<div style="font-size:48px;margin-bottom:12px">&#128218;</div>'
    + '<h2>' + title + '</h2>'
    + '<p class="ob-subtitle">' + subtitle + '</p>'
    + '<div class="ob-features">'
    + '<span class="ob-feature-pill">&#128278; Bookmark sync</span>'
    + '<span class="ob-feature-pill">&#128196; Markdown files</span>'
    + '<span class="ob-feature-pill">&#10024; Summaries</span>'
    + '<span class="ob-feature-pill">&#127911; Text-to-speech</span>'
    + '<span class="ob-feature-pill">&#128270; Smart search</span>'
    + '</div>'
    + '</div>';
}

function renderStepSetup() {
  var feedNames = Object.keys(_obFeeds);
  var html = '<h2>Setup</h2>'
    + '<p class="ob-subtitle">Choose where to save articles, then add a bookmark feed to start syncing.</p>';

  // Output folder
  html += '<div class="ob-glass-card">'
    + '<label style="font-weight:500;font-size:13px;margin-bottom:6px;display:block">Output folder</label>'
    + '<div style="display:flex;gap:8px;align-items:center">'
    + '<input type="text" id="ob-output-path" value="' + escapeHtml(_obOutputPath) + '" placeholder="~/Documents/PullRead" style="flex:1">'
    + '<button onclick="pickOutputFolder(\'ob-output-path\')" style="white-space:nowrap;padding:7px 14px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;cursor:pointer;font-family:inherit">Choose\u2026</button>'
    + '</div>'
    + '</div>';

  // Feed connection
  html += '<div class="ob-glass-card" style="margin-top:12px">'
    + '<label style="font-weight:500;font-size:13px;margin-bottom:6px;display:block">Bookmark feeds</label>';
  if (feedNames.length > 0) {
    html += '<ul class="ob-feed-list">';
    for (var fi = 0; fi < feedNames.length; fi++) {
      var fn = feedNames[fi];
      html += '<li><div><div class="ob-feed-name">' + escapeHtml(fn) + '</div><div class="ob-feed-url">' + escapeHtml(_obFeeds[fn]) + '</div></div>'
        + '<button onclick="obRemoveFeed(\'' + escapeHtml(fn.replace(/'/g, "\\'")) + '\')" title="Remove">&times;</button></li>';
    }
    html += '</ul>';
  }
  html += '<div class="ob-feed-add">'
    + '<input type="text" id="ob-feed-url" placeholder="Paste bookmark feed URL or web address\u2026" onkeydown="if(event.key===\'Enter\')obAddFeed()">'
    + '<button onclick="obAddFeed()" id="ob-add-btn"' + (_obFeedLoading ? ' disabled' : '') + '>' + (_obFeedLoading ? 'Finding feed\u2026' : 'Add') + '</button>'
    + '</div>'
    + '</div>';

  // Service hints (compact)
  html += '<div class="ob-hint-list" style="margin-top:10px">'
    + '<div style="margin-bottom:6px;color:var(--fg);font-size:12px;font-weight:500">Where to find your feed URL:</div>'
    + '<div><strong>Instapaper</strong> Settings &rarr; Export &rarr; RSS Feed URL</div>'
    + '<div><strong>Pinboard</strong> pinboard.in/feeds/u:USERNAME/</div>'
    + '<div><strong>Raindrop</strong> Collection &rarr; Share &rarr; RSS Feed</div>'
    + '<div><strong>Pocket</strong> getpocket.com/users/USERNAME/feed/all</div>'
    + '<div><strong>Substack / WordPress</strong> Paste any URL &mdash; PullRead finds the feed</div>'
    + '</div>';

  return html;
}

function renderStepReading() {
  return '<h2>Reading</h2>'
    + '<p class="ob-subtitle">Tools for focused, annotated reading.</p>'
    + '<div class="ob-glass-card">'
    + '<div class="ob-method"><div class="ob-method-icon">&#128064;</div><div><div class="ob-method-title">Focus Mode <kbd>f</kbd></div><div class="ob-method-desc">Dims everything except the current paragraph so you can concentrate.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon">&#127912;</div><div><div class="ob-method-title">Highlights <kbd>h</kbd></div><div class="ob-method-desc">Select text and choose a color. Highlights appear in the margin with optional notes.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon">&#128209;</div><div><div class="ob-method-title">Table of Contents</div><div class="ob-method-desc">Auto-generated navigation for long articles. Appears on wide screens.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon">&#128215;</div><div><div class="ob-method-title">Reading Progress</div><div class="ob-method-desc">Your position is saved automatically and restored when you return.</div></div></div>'
    + '</div>';
}

function renderStepSearch() {
  return '<h2>Search &amp; Organize</h2>'
    + '<p class="ob-subtitle">Find anything in your library instantly.</p>'
    + '<div class="ob-glass-card">'
    + '<div class="ob-method"><div class="ob-method-icon">&#128269;</div><div><div class="ob-method-title">Search Operators</div><div class="ob-method-desc">Type <code>is:unread</code>, <code>tag:tech</code>, <code>feed:NYT</code>, <code>has:highlights</code> and more in the search bar.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon">&#128204;</div><div><div class="ob-method-title">Pinned Filters</div><div class="ob-method-desc">Pin up to 3 frequent searches as quick-access buttons below the search bar.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon">&#10084;&#65039;</div><div><div class="ob-method-title">Favorites</div><div class="ob-method-desc">Heart any article. Find them with <code>is:favorite</code>.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon">&#127760;</div><div><div class="ob-method-title">Explore</div><div class="ob-method-desc">Tag cloud and topic connections across your entire library.</div></div></div>'
    + '</div>';
}

function renderStepListening() {
  return '<h2>Listening &amp; Summaries</h2>'
    + '<p class="ob-subtitle">Listen to articles and get concise summaries.</p>'
    + '<div class="ob-glass-card">'
    + '<div class="ob-method"><div class="ob-method-icon">&#127911;</div><div><div class="ob-method-title">Text-to-Speech</div><div class="ob-method-desc">Listen to any article. Free on-device voice included, with premium options available.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon">&#10024;</div><div><div class="ob-method-title">Summaries</div><div class="ob-method-desc">One-click summary saved to each article. Works with multiple providers.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon">&#128240;</div><div><div class="ob-method-title">Reviews</div><div class="ob-method-desc">Thematic roundups of your recent reading. Generate daily or weekly from the dashboard.</div></div></div>'
    + '</div>';
}

function renderStepReady() {
  return '<div style="text-align:center;padding:12px 0">'
    + '<div style="font-size:48px;margin-bottom:12px">&#128640;</div>'
    + '<h2>' + (_tourMode ? 'That\u2019s the Tour' : 'Ready to Go') + '</h2>'
    + '<p class="ob-subtitle">' + (_tourMode ? 'Here are some keyboard shortcuts to remember:' : 'PullRead will fetch your bookmarked articles and save them as markdown. Here are some keyboard shortcuts to get started:') + '</p>'
    + '</div>'
    + '<div class="ob-shortcuts">'
    + '<kbd>j</kbd> / <kbd>&rarr;</kbd> <span>Next article</span>'
    + '<kbd>k</kbd> / <kbd>&larr;</kbd> <span>Previous article</span>'
    + '<kbd>/</kbd> <span>Search articles</span>'
    + '<kbd>[</kbd> <span>Toggle sidebar</span>'
    + '<kbd>h</kbd> <span>Highlight selected text</span>'
    + '<kbd>n</kbd> <span>Toggle article notes</span>'
    + '<kbd>f</kbd> <span>Toggle focus mode</span>'
    + '<kbd>Space</kbd> <span>Play / pause audio</span>'
    + '</div>'
    + '<div style="text-align:center;margin-top:16px">'
    + '<button onclick="showGuideModal()" style="background:none;border:none;color:var(--link);cursor:pointer;font-size:13px;font-family:inherit;text-decoration:underline">Open full Guide for more</button>'
    + '</div>';
}
```

**Step 5: Update navigation functions**

Replace the `obBack`, `obNext`, `obAddFeed`, `obRemoveFeed`, and `obFinish` functions (lines 366-423) with:

```javascript
function obBack() {
  if (_obStep > 0) { _obStep--; renderOnboardingStep(); }
}

function obNext() {
  var steps = getOnboardingSteps();
  // Validate output path on setup step
  if (steps[_obStep].id === 'setup') {
    var pathInput = document.getElementById('ob-output-path');
    if (pathInput) _obOutputPath = pathInput.value.trim();
    if (!_obOutputPath) { pathInput.focus(); return; }
  }
  if (_obStep < steps.length - 1) { _obStep++; renderOnboardingStep(); }
}

async function obAddFeed() {
  var input = document.getElementById('ob-feed-url');
  var url = (input.value || '').trim();
  if (!url) return;
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  _obFeedLoading = true;
  renderOnboardingStep();
  try {
    var r = await fetch('/api/feed-discover?url=' + encodeURIComponent(url));
    var result = await r.json();
    var feedUrl = result.feedUrl || url;
    var title = result.title || feedUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    _obFeeds[title] = feedUrl;
  } catch (e) {
    _obFeeds[url] = url;
  }
  _obFeedLoading = false;
  renderOnboardingStep();
}

function obRemoveFeed(name) {
  delete _obFeeds[name];
  renderOnboardingStep();
}

async function obFinish() {
  if (!_tourMode) {
    // Save config via API (first-run only)
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outputPath: _obOutputPath,
          feeds: _obFeeds
        })
      });
    } catch (e) {
      console.error('Failed to save onboarding config:', e);
    }
  }
  dismissOnboarding();
  if (!_tourMode) {
    setTimeout(function() { refreshArticleList(); }, 500);
  }
}
```

**Step 6: Verify**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun test 2>&1 | tail -5`
Expected: All 193 tests pass (no server-side changes).

Run: `bun scripts/embed-viewer.ts`
Expected: Successfully embeds viewer.

**Step 7: Commit**

```bash
git add viewer/11-modals.js src/viewer-html.ts
git commit -m "Redesign onboarding: unified 6-step tour with feature discovery"
```

---

### Task 2: Add tour re-launch triggers

Add a "Show Tour" button to the Settings About section and a "Tour" button to the Dashboard quick actions.

**Files:**
- Modify: `viewer/03-settings.js:277-280`
- Modify: `viewer/04-article.js:104`

**Step 1: Add "Show Tour" button to Settings About section**

In `viewer/03-settings.js`, find line 277 (the row with pullread.com and View Logs links):

```javascript
  html += '<div class="settings-row" style="gap:12px">';
  html += '<a href="https://pullread.com" target="_blank" rel="noopener" style="font-size:13px;color:var(--link)">pullread.com</a>';
  html += '<a href="/api/log" target="_blank" style="font-size:13px;color:var(--link)">View Logs</a>';
  html += '</div>';
```

Replace with:

```javascript
  html += '<div class="settings-row" style="gap:12px">';
  html += '<a href="https://pullread.com" target="_blank" rel="noopener" style="font-size:13px;color:var(--link)">pullread.com</a>';
  html += '<a href="/api/log" target="_blank" style="font-size:13px;color:var(--link)">View Logs</a>';
  html += '<button style="font-size:13px;padding:6px 16px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit" onclick="showTour()">Show Tour</button>';
  html += '</div>';
```

**Step 2: Add "Tour" button to Dashboard quick actions**

In `viewer/04-article.js`, find line 104:

```javascript
  html += '<button onclick="showGuideModal()"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-book"/></svg> Guide</button>';
```

Add after it:

```javascript
  html += '<button onclick="showTour()"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-comment"/></svg> Tour</button>';
```

This uses the `i-comment` (speech bubble) icon which is already in the sprite.

**Step 3: Rebuild viewer**

Run: `bun scripts/embed-viewer.ts`
Expected: Successfully embeds viewer.

**Step 4: Run tests**

Run: `bun test 2>&1 | tail -5`
Expected: All 193 tests pass.

**Step 5: Commit**

```bash
git add viewer/03-settings.js viewer/04-article.js src/viewer-html.ts
git commit -m "Add tour re-launch from Settings and Dashboard"
```

---

### Task 3: Manual verification

Open the app and verify the full flow.

**Verification checklist:**

1. Clear localStorage to simulate first run: open console, run `localStorage.removeItem('pr-onboarded')`, reload
2. Onboarding appears with 6-step progress bar
3. Step 1 (Welcome): Shows "Welcome to PullRead" with 5 feature pills
4. Step 2 (Setup): Shows output folder picker + feed URL input stacked
5. Steps 3-5 (Reading, Search, Listening): Each shows 3-4 feature cards with icons
6. Step 6 (Ready): Shows keyboard shortcuts + "Open full Guide" link
7. Click "Get Started" — onboarding dismisses, `pr-onboarded` is set in localStorage
8. Navigate to Dashboard — "Tour" button appears alongside Guide
9. Click "Tour" — tour opens with 5-step progress bar (skips setup)
10. Step 1 shows "What's in PullRead" (tour variant)
11. Steps proceed through Reading → Search → Listening → Ready
12. "Done" button dismisses tour
13. Navigate to Settings → About section — "Show Tour" button appears
14. Click "Show Tour" — tour launches (same 5-step flow)
15. Reload page — `pr-onboarded` still set, onboarding does not auto-show

**Step 1: Commit final state**

```bash
git add -A && git status
# Only commit if there are meaningful changes from verification fixes
```
