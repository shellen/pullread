# Magic Mixer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give users interactive control over Magic sort ranking via presets, algorithm weight sliders, tag boost sliders, and a diversity cap — all applying to the sidebar in realtime.

**Architecture:** A new "Magic Mixer" card in the Settings Reading tab stores config in `pr-magic-mixer` localStorage as JSON. The existing `magicScore()` and diversity-cap logic in `05-sidebar.js` read from this config instead of hardcoded values. Slider changes debounce at 300ms and call `scheduleRenderFileList()` for live sidebar re-sort.

**Tech Stack:** Vanilla JS (viewer modules), CSS range inputs, localStorage JSON.

**Design doc:** `docs/plans/2026-03-02-magic-mixer-design.md`

---

### Task 1: Config reader and defaults

Add a function to read mixer config from localStorage, with Balanced defaults when no config exists. This is the foundation — sidebar scoring and settings UI both depend on it.

**Files:**
- Modify: `viewer/05-sidebar.js:274-297` (magicScore function)
- Test: manual verification via browser console

**Step 1: Add `getMixerConfig()` function**

Add at `viewer/05-sidebar.js` right above `computeSourceEngagement()` (before line 248):

```js
// Magic Mixer configuration
var MIXER_PRESETS = {
  balanced:    { recency: 40, source: 35, unread: 15, signals: 10, diversity: 3 },
  whats_new:   { recency: 60, source: 15, unread: 20, signals: 5,  diversity: 2 },
  deep_reading: { recency: 15, source: 50, unread: 10, signals: 25, diversity: 4 },
  discovery:   { recency: 25, source: 20, unread: 30, signals: 25, diversity: 2 }
};

function getMixerConfig() {
  try {
    var raw = localStorage.getItem('pr-magic-mixer');
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return { preset: 'balanced', weights: { recency: 40, source: 35, unread: 15, signals: 10 }, diversity: 3, tagBoosts: {} };
}
```

**Step 2: Update `magicScore()` to use mixer config**

Replace the hardcoded weights in `magicScore()` (lines 274-297) with config-driven weights:

```js
function magicScore(f, engagement) {
  var config = getMixerConfig();
  var w = config.weights;
  // Normalize weights (all-zero fallback to equal)
  var sum = w.recency + w.source + w.unread + w.signals;
  if (sum === 0) { w = { recency: 25, source: 25, unread: 25, signals: 25 }; sum = 100; }
  var wR = w.recency / sum, wS = w.source / sum, wU = w.unread / sum, wSig = w.signals / sum;

  // Recency: exponential decay
  var age = f.bookmarked ? (Date.now() - new Date(f.bookmarked).getTime()) / 86400000 : 30;
  var isPodcast = f.enclosureUrl && isMediaEnclosure(f.enclosureType);
  var decay = isPodcast ? 1.386 : 0.231;
  var recency = Math.exp(-decay * age);

  // Source engagement
  var key = f.feed || f.domain || 'unknown';
  var source = engagement[key] || 0;

  // Unread boost
  var unread = readArticles.has(f.filename) ? 0 : 1;

  // Article signals
  var signals = 0;
  var notes = allNotesIndex[f.filename];
  if (notes && notes.isFavorite) signals += 0.3;
  if (allHighlightsIndex[f.filename] && allHighlightsIndex[f.filename].length) signals += 0.2;
  if (notes && (notes.articleNote || (notes.annotations && notes.annotations.length))) signals += 0.15;

  var rawScore = 100 * (wR * recency + wS * source + wU * unread + wSig * Math.min(signals, 1));

  // Tag boost multiplier
  var boosts = config.tagBoosts;
  if (boosts && Object.keys(boosts).length > 0) {
    var cats = f.categories || [];
    var maxBoost = 0;
    for (var ci = 0; ci < cats.length; ci++) {
      var b = boosts[cats[ci]];
      if (b !== undefined && b > maxBoost) maxBoost = b;
      if (b !== undefined && b < maxBoost && maxBoost === 0) maxBoost = b;
    }
    // Highest absolute-value boost wins; convert -2..+2 to multiplier
    var bestBoost = 0;
    for (var ci = 0; ci < cats.length; ci++) {
      var b = boosts[cats[ci]];
      if (b !== undefined && Math.abs(b) > Math.abs(bestBoost)) bestBoost = b;
    }
    var multipliers = { '-2': 0.25, '-1': 0.5, '0': 1, '1': 1.5, '2': 2 };
    var mult = multipliers[String(bestBoost)] || 1;
    rawScore *= mult;
  }

  return rawScore;
}
```

**Step 3: Update diversity cap to use config**

In `renderFileList()` (line 26), replace the hardcoded `3` with `getMixerConfig().diversity`:

```js
// Change:
//   if (sourceCounts[key] <= 3) top.push(displayFiles[di]);
// To:
      var mixerDiversity = getMixerConfig().diversity;
```

And use `mixerDiversity` in the comparison:

```js
      if (sourceCounts[key] <= mixerDiversity) top.push(displayFiles[di]);
```

Note: Move `getMixerConfig()` call above the loop so it's only called once, not per-item.

**Step 4: Run tests and commit**

Run: `bun test`
Expected: All 450 tests pass (3 pre-existing keychain failures).

```bash
git add viewer/05-sidebar.js
git commit -m "feat: add getMixerConfig() and wire magicScore + diversity cap to config"
```

---

### Task 2: Magic Mixer settings card — presets and enable prompt

Add the Magic Mixer card to the Reading tab with preset pills. When Magic sort is off, show a muted prompt with an enable button.

**Files:**
- Modify: `viewer/03-settings.js:552-554` (between Reading Breaks card and end of reading tab)

**Step 1: Add the Magic Mixer card HTML**

Insert after line 552 (after the Reading Breaks card closing `</div>`) and before line 554 (`</div>` end reading tab):

```js
  // -- Magic Mixer card --
  html += '<div class="card" id="settings-magic-mixer">';
  html += '<div class="card-title">Magic Mixer</div>';
  html += '<div class="card-desc">Control how Magic sort ranks your sidebar.</div>';
  if (!magicSort) {
    html += '<p style="color:var(--muted);font-size:13px">Magic sort is off. <a href="#" onclick="toggleMagicSort();openSettings(\'reading\');return false" style="color:var(--link)">Enable it</a> to use the mixer.</p>';
  } else {
    var mc = getMixerConfig();
    // Preset pills
    var presets = [
      ['balanced', 'Balanced'],
      ['whats_new', "What\u2019s New"],
      ['deep_reading', 'Deep Reading'],
      ['discovery', 'Discovery'],
      ['custom', 'Custom']
    ];
    html += '<div class="setting-row"><div class="setting-label"><label>Preset</label><div class="setting-desc">Quick configurations for common reading styles</div></div>';
    html += '<div class="setting-control"><div class="pill-group" id="mixer-preset-pills">';
    for (var pi = 0; pi < presets.length; pi++) {
      var pKey = presets[pi][0], pLabel = presets[pi][1];
      var isActive = mc.preset === pKey || (!mc.preset && pKey === 'balanced');
      html += '<button class="pill' + (isActive ? ' active' : '') + '" data-val="' + pKey + '" onclick="mixerSelectPreset(\'' + pKey + '\')">' + pLabel + '</button>';
    }
    html += '</div></div></div>';

    // Advanced toggle
    html += '<div style="margin:8px 0"><a href="#" id="mixer-advanced-toggle" onclick="mixerToggleAdvanced();return false" style="font-size:12px;color:var(--link);text-decoration:none">Show advanced \u25BC</a></div>';

    // Advanced section (hidden by default)
    html += '<div id="mixer-advanced" style="display:none">';

    // Algorithm weight sliders
    var sliders = [
      ['recency', 'Freshness', 'How much newer articles are prioritized'],
      ['source', 'Sources I read', 'Boost feeds you interact with more'],
      ['unread', 'Unread boost', 'How much unread articles float up'],
      ['signals', 'My activity', 'Boost starred, highlighted, or annotated articles']
    ];
    for (var si = 0; si < sliders.length; si++) {
      var sKey = sliders[si][0], sLabel = sliders[si][1], sDesc = sliders[si][2];
      var sVal = mc.weights[sKey];
      html += '<div class="mixer-slider-row">';
      html += '<div class="mixer-slider-label"><span>' + sLabel + '</span><span class="mixer-slider-value" id="mixer-val-' + sKey + '">' + sVal + '</span></div>';
      html += '<input type="range" min="0" max="100" value="' + sVal + '" class="mixer-range" id="mixer-' + sKey + '" oninput="mixerSliderChanged(\'' + sKey + '\',this.value)">';
      html += '<div class="mixer-slider-desc">' + sDesc + '</div>';
      html += '</div>';
    }

    // Diversity cap slider
    html += '<div class="mixer-slider-row">';
    html += '<div class="mixer-slider-label"><span>Max per source</span><span class="mixer-slider-value" id="mixer-val-diversity">' + mc.diversity + '</span></div>';
    html += '<input type="range" min="1" max="5" value="' + mc.diversity + '" class="mixer-range" id="mixer-diversity" oninput="mixerDiversityChanged(this.value)">';
    html += '<div class="mixer-slider-desc">Maximum articles from one feed before mixing in others</div>';
    html += '</div>';

    // Tag boosts (Content Mix)
    var allTags = {};
    for (var ti = 0; ti < allFiles.length; ti++) {
      var cats = allFiles[ti].categories || [];
      for (var tj = 0; tj < cats.length; tj++) {
        allTags[cats[tj]] = (allTags[cats[tj]] || 0) + 1;
      }
    }
    var tagEntries = Object.keys(allTags).map(function(t) { return { tag: t, count: allTags[t] }; });
    tagEntries.sort(function(a, b) { return b.count - a.count; });

    if (tagEntries.length > 0) {
      html += '<div class="mixer-section-label">Content Mix</div>';
      var boostLabels = ['Reduce', 'Less', 'Neutral', 'More', 'Boost'];
      var showAll = tagEntries.length <= 8;
      var visibleTags = showAll ? tagEntries : tagEntries.slice(0, 8);
      html += '<div id="mixer-tags-visible">';
      for (var tvi = 0; tvi < visibleTags.length; tvi++) {
        var tag = visibleTags[tvi].tag;
        var bVal = (mc.tagBoosts && mc.tagBoosts[tag]) || 0;
        html += mixerTagRow(tag, bVal, boostLabels);
      }
      html += '</div>';
      if (!showAll) {
        html += '<div id="mixer-tags-hidden" style="display:none">';
        for (var thi = 8; thi < tagEntries.length; thi++) {
          var tag = tagEntries[thi].tag;
          var bVal = (mc.tagBoosts && mc.tagBoosts[tag]) || 0;
          html += mixerTagRow(tag, bVal, boostLabels);
        }
        html += '</div>';
        html += '<a href="#" id="mixer-tags-showall" onclick="document.getElementById(\'mixer-tags-hidden\').style.display=\'\';this.style.display=\'none\';return false" style="font-size:12px;color:var(--link);text-decoration:none">Show all ' + tagEntries.length + ' tags</a>';
      }
    }

    // Reset button
    html += '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">';
    html += '<button onclick="mixerReset()" style="font-size:12px;padding:4px 12px;background:var(--sidebar-bg);color:var(--muted);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit">Reset to defaults</button>';
    html += '</div>';

    html += '</div>'; // end advanced section
  }
  html += '</div>'; // end magic mixer card
```

**Step 2: Add the `mixerTagRow()` helper**

Add this helper function near the other settings helpers (around line 236, after `settingsBtnSelect`):

```js
function mixerTagRow(tag, val, labels) {
  var h = '<div class="mixer-tag-row">';
  h += '<span class="mixer-tag-name">' + escapeHtml(tag) + '</span>';
  h += '<input type="range" min="-2" max="2" value="' + val + '" class="mixer-range mixer-tag-range" data-tag="' + escapeHtml(tag) + '" oninput="mixerTagChanged(\'' + escapeJsStr(tag) + '\',this.value)">';
  h += '<span class="mixer-tag-label" id="mixer-tag-label-' + tag.replace(/[^a-zA-Z0-9]/g, '_') + '">' + labels[val + 2] + '</span>';
  h += '</div>';
  return h;
}
```

**Step 3: Run tests and commit**

Run: `bun test`
Expected: All 450 tests pass.

```bash
git add viewer/03-settings.js
git commit -m "feat: add Magic Mixer settings card with presets, sliders, and tag boosts"
```

---

### Task 3: Magic Mixer event handlers

Add the JavaScript functions that respond to user interactions: preset selection, slider changes, tag boost changes, advanced toggle, and reset.

**Files:**
- Modify: `viewer/03-settings.js` (add near other settings functions)

**Step 1: Add mixer event handlers**

Add these functions after the `mixerTagRow()` helper:

```js
var _mixerDebounce = null;

function _mixerSave(config) {
  localStorage.setItem('pr-magic-mixer', JSON.stringify(config));
  clearTimeout(_mixerDebounce);
  _mixerDebounce = setTimeout(function() { scheduleRenderFileList(); }, 300);
}

function mixerSelectPreset(key) {
  if (key === 'custom') return; // Can't select custom directly
  var preset = MIXER_PRESETS[key];
  if (!preset) return;
  var config = getMixerConfig();
  config.preset = key;
  config.weights = { recency: preset.recency, source: preset.source, unread: preset.unread, signals: preset.signals };
  config.diversity = preset.diversity;
  _mixerSave(config);
  // Update UI
  document.querySelectorAll('#mixer-preset-pills .pill').forEach(function(b) { b.classList.remove('active'); });
  var active = document.querySelector('#mixer-preset-pills .pill[data-val="' + key + '"]');
  if (active) active.classList.add('active');
  // Update sliders if visible
  var adv = document.getElementById('mixer-advanced');
  if (adv && adv.style.display !== 'none') {
    ['recency', 'source', 'unread', 'signals'].forEach(function(k) {
      var el = document.getElementById('mixer-' + k);
      var lbl = document.getElementById('mixer-val-' + k);
      if (el) el.value = config.weights[k];
      if (lbl) lbl.textContent = config.weights[k];
    });
    var divEl = document.getElementById('mixer-diversity');
    var divLbl = document.getElementById('mixer-val-diversity');
    if (divEl) divEl.value = config.diversity;
    if (divLbl) divLbl.textContent = config.diversity;
  }
}

function mixerSliderChanged(key, val) {
  val = parseInt(val, 10);
  var config = getMixerConfig();
  config.weights[key] = val;
  config.preset = 'custom';
  _mixerSave(config);
  var lbl = document.getElementById('mixer-val-' + key);
  if (lbl) lbl.textContent = val;
  // Switch preset pill to Custom
  _mixerHighlightPreset('custom');
}

function mixerDiversityChanged(val) {
  val = parseInt(val, 10);
  var config = getMixerConfig();
  config.diversity = val;
  // Check if still matches a preset
  _mixerDetectPreset(config);
  _mixerSave(config);
  var lbl = document.getElementById('mixer-val-diversity');
  if (lbl) lbl.textContent = val;
}

function mixerTagChanged(tag, val) {
  val = parseInt(val, 10);
  var config = getMixerConfig();
  if (!config.tagBoosts) config.tagBoosts = {};
  if (val === 0) delete config.tagBoosts[tag];
  else config.tagBoosts[tag] = val;
  _mixerSave(config);
  var boostLabels = ['Reduce', 'Less', 'Neutral', 'More', 'Boost'];
  var lblId = 'mixer-tag-label-' + tag.replace(/[^a-zA-Z0-9]/g, '_');
  var lbl = document.getElementById(lblId);
  if (lbl) lbl.textContent = boostLabels[val + 2];
}

function mixerToggleAdvanced() {
  var adv = document.getElementById('mixer-advanced');
  var toggle = document.getElementById('mixer-advanced-toggle');
  if (!adv) return;
  var show = adv.style.display === 'none';
  adv.style.display = show ? '' : 'none';
  if (toggle) toggle.textContent = show ? 'Hide advanced \u25B2' : 'Show advanced \u25BC';
}

function mixerReset() {
  localStorage.removeItem('pr-magic-mixer');
  scheduleRenderFileList();
  openSettings('reading');
}

function _mixerHighlightPreset(key) {
  document.querySelectorAll('#mixer-preset-pills .pill').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-val') === key);
  });
}

function _mixerDetectPreset(config) {
  var w = config.weights;
  for (var key in MIXER_PRESETS) {
    var p = MIXER_PRESETS[key];
    if (w.recency === p.recency && w.source === p.source && w.unread === p.unread && w.signals === p.signals && config.diversity === p.diversity) {
      config.preset = key;
      _mixerHighlightPreset(key);
      return;
    }
  }
  config.preset = 'custom';
  _mixerHighlightPreset('custom');
}
```

**Step 2: Run tests and commit**

Run: `bun test`
Expected: All 450 tests pass.

```bash
git add viewer/03-settings.js
git commit -m "feat: add Magic Mixer event handlers for presets, sliders, and tag boosts"
```

---

### Task 4: Magic Mixer CSS styles

Add styles for the range sliders, tag boost rows, section labels, and the advanced toggle.

**Files:**
- Modify: `viewer.css` (add after the `.pill-group` styles around line 4936)

**Step 1: Add mixer styles**

Insert after line 4936 (after `.pill-group .pill.unavailable`):

```css
  /* Magic Mixer */
  .mixer-slider-row {
    margin: 10px 0;
  }
  .mixer-slider-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    color: var(--fg);
    margin-bottom: 4px;
  }
  .mixer-slider-value {
    font-size: 12px;
    color: var(--muted);
    min-width: 24px;
    text-align: right;
  }
  .mixer-slider-desc {
    font-size: 11px;
    color: var(--muted);
    margin-top: 2px;
  }
  .mixer-range {
    width: 100%;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: color-mix(in srgb, var(--fg) 12%, transparent);
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }
  .mixer-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--link);
    cursor: pointer;
    border: 2px solid var(--bg);
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }
  .mixer-range::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--link);
    cursor: pointer;
    border: 2px solid var(--bg);
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }
  .mixer-section-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 16px 0 8px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .mixer-tag-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 6px 0;
  }
  .mixer-tag-name {
    font-size: 13px;
    color: var(--fg);
    min-width: 100px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mixer-tag-range {
    flex: 1;
  }
  .mixer-tag-label {
    font-size: 11px;
    color: var(--muted);
    min-width: 52px;
    text-align: right;
  }
```

**Step 2: Run tests and commit**

Run: `bun test`
Expected: All 450 tests pass.

```bash
git add viewer.css
git commit -m "feat: add Magic Mixer slider and tag boost CSS styles"
```

---

### Task 5: Rebuild and verify

Rebuild the embedded viewer and verify everything works.

**Files:**
- Modify: `src/viewer-html.ts` (auto-generated rebuild)

**Step 1: Rebuild viewer**

Run: `bun scripts/embed-viewer.ts`
Expected: Builds without errors, outputs byte counts for all JS modules.

**Step 2: Run full test suite**

Run: `bun test`
Expected: All 450 tests pass (3 pre-existing keychain failures).

**Step 3: Commit rebuilt viewer**

```bash
git add src/viewer-html.ts
git commit -m "chore: rebuild viewer-html.ts with Magic Mixer"
```

---

## Verification Checklist

After implementation, verify in the browser:

1. Open Settings > Reading tab — Magic Mixer card appears after Reading Breaks
2. With Magic sort OFF: card shows muted text with "Enable it" link; clicking enables Magic sort and reloads settings
3. With Magic sort ON: 5 preset pills visible, "Balanced" active by default
4. Click "What's New" preset — sidebar re-sorts within 300ms
5. Click "Show advanced" — sliders appear with correct values for active preset
6. Drag "Freshness" slider — value updates, preset switches to "Custom", sidebar re-sorts
7. Drag "Max per source" to 1 — sidebar shows max 1 article per feed
8. If tags exist: Content Mix section visible with per-tag boost sliders; drag one to "Boost" — label updates, sidebar re-sorts
9. If 10+ tags: only 8 shown initially, "Show all" link reveals the rest
10. Click "Reset to defaults" — all sliders return to Balanced, sidebar re-sorts
11. Reload page — settings persist from localStorage
12. Set all weight sliders to 0 — sidebar still sorts (fallback to equal weights)
