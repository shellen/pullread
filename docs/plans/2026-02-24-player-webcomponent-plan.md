# Player WebComponent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the podcast/TTS player into a `<pr-player>` WebComponent with expanded (reading-pane-width) and mini (sidebar-bottom) modes.

**Architecture:** Custom element `<pr-player>` encapsulates all player DOM, styles, and playback state. No Shadow DOM — uses light DOM so CSS variables flow through. The component communicates with the app via custom events and public methods. Mobile behavior unchanged (fixed bottom bar).

**Tech Stack:** Vanilla JS custom elements (`customElements.define`), existing CSS variables, existing TTS server API.

**Design doc:** `docs/plans/2026-02-24-player-webcomponent-design.md`

---

## Overview of 07-tts.js (1816 lines)

The file has these logical sections:

| Lines | Section | WebComponent? |
|-------|---------|---------------|
| 1-16 | State variables (queue, speed, provider, etc.) | Move INTO component |
| 17-105 | Listen button loading animation, play-next menu | Keep OUTSIDE (article UI) |
| 106-170 | `addCurrentToTTSQueue()`, `addToTTSQueue()`, `playNextFromArticle()` | Keep OUTSIDE (thin wrappers) |
| 172-252 | `renderAudioPlayer()`, artwork, status, queue list render | Move INTO component |
| 253-313 | `bottomBarGoToArticle()`, `toggleBottomBarQueue()`, sidebar indicators | Split — indicators outside, navigation inside |
| 315-536 | `playTTSItem()`, `playPodcastAudio()`, `playCloudTTS*()`, `playBrowserTTS()` | Move INTO component |
| 537-813 | Chunk session management, pre-fetching, `ttsPlayNextChunk()` | Move INTO component |
| 815-966 | `stopTTS()`, `ttsTogglePlay()`, skip/seek controls | Move INTO component |
| 968-1005 | Progress bar drag handling | Move INTO component |
| 1007-1153 | Speed slider popup, speed control | Move INTO component |
| 1155-1191 | Queue item removal, clear queue, `formatTime()` | Move INTO component |
| 1193-1233 | `stripMarkdownForTTS()` | Keep OUTSIDE (text processing) |
| 1235-1283 | TTS reading highlight (paragraph tracking) | Keep OUTSIDE (article DOM) |
| 1285-1620 | TTS settings modal (voice picker, provider config) | Keep OUTSIDE (modal UI) |
| 1621-1816 | State persistence, mini mode, podcast settings, pre-gen | Split — persistence inside, settings modal outside |

---

### Task 1: Create `<pr-player>` element with DOM template

**Files:**
- Create: `viewer/07-tts-player.js` (loaded before `07-tts.js` in embed order)
- Modify: `scripts/embed-viewer.ts` (add new file to embed list)

**Step 1:** Create `viewer/07-tts-player.js` with the custom element class. Start with just the DOM template — the same HTML currently in `viewer.html` lines 147-182 (`<div class="bottom-bar" id="audio-player">...`), built programmatically in `connectedCallback()`.

```javascript
// ABOUTME: WebComponent for the audio player with expanded and mini modes.
// ABOUTME: Encapsulates player DOM, controls, and playback state.

class PrPlayer extends HTMLElement {
  constructor() {
    super();
    // State (will be populated from 07-tts.js migration in later tasks)
    this._queue = [];
    this._currentIndex = -1;
    this._playing = false;
    this._speed = 1.0;
    this._mode = 'expanded'; // 'expanded' | 'mini'
  }

  connectedCallback() {
    this._render();
  }

  static get observedAttributes() { return ['mode']; }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'mode' && oldVal !== newVal) {
      this._mode = newVal;
      this._updateMode();
    }
  }

  _render() {
    // Build the same DOM as current #audio-player bottom-bar
    this.className = 'bottom-bar hidden';
    this.id = 'audio-player';
    this.innerHTML =
      '<div class="bottom-bar-inner">' +
        '<div class="bottom-bar-now" id="bottom-bar-now">' +
          '<div class="bottom-bar-artwork" id="bottom-bar-artwork">' +
            '<svg class="bottom-bar-icon" aria-hidden="true"><use href="#i-volume"/></svg>' +
          '</div>' +
          '<div class="bottom-bar-info">' +
            '<span class="bottom-bar-title" id="audio-now-label">Not playing</span>' +
            '<span class="bottom-bar-status" id="audio-now-status"></span>' +
          '</div>' +
        '</div>' +
        '<div class="bottom-bar-controls">' +
          '<button class="skip-btn" id="tts-prev-btn" onmousedown="ttsStartHoldSkip(-15)" onmouseup="ttsStopHoldSkip()" onmouseleave="ttsStopHoldSkip()" ontouchstart="ttsStartHoldSkip(-15)" ontouchend="ttsStopHoldSkip()" aria-label="Skip back 15 seconds">' +
            '<svg class="icon icon-sm"><use href="#i-skip-back"/></svg>' +
          '</button>' +
          '<button class="bottom-bar-play" id="tts-play-btn" onclick="ttsTogglePlay()" aria-label="Play or pause">' +
            '<svg><use href="#i-play"/></svg>' +
          '</button>' +
          '<button class="skip-btn" id="tts-next-btn" onmousedown="ttsStartHoldSkip(15)" onmouseup="ttsStopHoldSkip()" onmouseleave="ttsStopHoldSkip()" ontouchstart="ttsStartHoldSkip(15)" ontouchend="ttsStopHoldSkip()" aria-label="Skip forward 15 seconds">' +
            '<svg class="icon icon-sm"><use href="#i-skip-fwd"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="bottom-bar-progress-row">' +
          '<span class="audio-time" id="tts-time-current">0:00</span>' +
          '<div class="audio-progress-wrap" id="audio-progress-wrap">' +
            '<div class="audio-progress"><div class="audio-progress-fill" id="tts-progress"></div></div>' +
          '</div>' +
          '<span class="audio-time" id="tts-time-total">0:00</span>' +
        '</div>' +
        '<div class="bottom-bar-right">' +
          '<button class="audio-speed-btn" id="tts-speed-btn" onclick="ttsToggleSpeedSlider()" aria-label="Playback speed">1x</button>' +
          '<button class="bottom-bar-queue-btn" id="bottom-bar-queue-toggle" onclick="toggleBottomBarQueue()" aria-label="Toggle queue">&#128279;</button>' +
          '<button class="bottom-bar-settings-btn" onclick="showTTSSettings()" aria-label="Voice settings">&#9881;</button>' +
          '<button class="bottom-bar-close-btn" onclick="ttsDismissPlayer()" aria-label="Close player">&times;</button>' +
        '</div>' +
      '</div>' +
      '<div class="bottom-bar-queue" id="audio-queue-section" style="display:none">' +
        '<div class="audio-queue-header">' +
          '<span>Up Next</span>' +
          '<button onclick="ttsClearQueue()" class="queue-clear-btn">Clear queue</button>' +
        '</div>' +
        '<div id="audio-queue-list"></div>' +
      '</div>';
  }

  _updateMode() {
    // Will handle expanded/mini transition in Task 5
  }
}

customElements.define('pr-player', PrPlayer);
```

**Step 2:** Add `07-tts-player.js` to the embed script's file list, ordered BEFORE `07-tts.js`.

In `scripts/embed-viewer.ts`, find the JS modules array and add `'07-tts-player.js'` before `'07-tts.js'`.

**Step 3:** Replace the static `<div class="bottom-bar" id="audio-player">` block in `viewer.html` (lines 147-182) with:
```html
<pr-player></pr-player>
```

**Step 4:** Build and test.
```bash
bun run scripts/embed-viewer.ts && bun test
```
Expected: Build succeeds, all tests pass. The player should render identically to before since the DOM structure is the same.

**Step 5:** Commit.
```bash
git add viewer/07-tts-player.js scripts/embed-viewer.ts viewer.html
git commit -m "Add pr-player WebComponent shell with same DOM as static bottom bar"
```

---

### Task 2: Move `renderAudioPlayer()` into the component

**Files:**
- Modify: `viewer/07-tts-player.js` (add `update()` method)
- Modify: `viewer/07-tts.js` (replace `renderAudioPlayer()` with delegation)

**Step 1:** Add a public `update(state)` method to `PrPlayer` that accepts the current playback state and updates all DOM elements. This is the same logic as the current `renderAudioPlayer()` (lines 172-252 of `07-tts.js`) but operating on `this` instead of `document.getElementById`.

**Step 2:** Replace `renderAudioPlayer()` in `07-tts.js` with a thin wrapper:
```javascript
function renderAudioPlayer() {
  var player = document.querySelector('pr-player');
  if (!player) return;
  player.update({
    queue: ttsQueue,
    currentIndex: ttsCurrentIndex,
    playing: ttsPlaying,
    generating: ttsGenerating,
    speed: ttsSpeed,
  });
  updateListenButtonState();
  updateSidebarAudioIndicators();
  updateArticleNowPlaying();
  renderMiniMode();
  saveTTSState();
}
```

**Step 3:** Build and test.

**Step 4:** Commit.

---

### Task 3: Move progress bar drag and speed slider into the component

**Files:**
- Modify: `viewer/07-tts-player.js` (add `_initProgressDrag()`, `_initSpeedSlider()`)
- Modify: `viewer/07-tts.js` (remove `initProgressDrag()`, speed slider functions)

**Step 1:** Move `initProgressDrag()` (lines 968-1005) into `PrPlayer._initProgressDrag()`, called from `connectedCallback()`. It still calls global `ttsSeek()` — that's fine, we're migrating incrementally.

**Step 2:** Move speed slider functions (`ttsToggleSpeedSlider`, `ttsCloseSpeedSlider`, `ttsPositionThumb`, `ttsSetSpeed`, `ttsCycleSpeed`, speed popup event handlers) into the component. These still reference global `ttsSpeed` and `ttsAudio` — they'll be fully internalized in Task 4.

**Step 3:** Build and test.

**Step 4:** Commit.

---

### Task 4: Move playback state and audio control into the component

**Files:**
- Modify: `viewer/07-tts-player.js` (internalize state variables, playback methods)
- Modify: `viewer/07-tts.js` (thin wrappers calling component methods)

This is the big migration task. Move these into `PrPlayer`:

**State variables:**
- `ttsQueue`, `ttsCurrentIndex`, `ttsPlaying`, `ttsSpeed`, `ttsProvider`
- `ttsAudio`, `ttsSynthUtterance`, `ttsGenerating`, `ttsProgressTimer`
- `_ttsChunkSession`, `_ttsNextPrefetch`, `_ttsChunkBuffer`
- `podcastAutoplay`

**Playback methods:**
- `playTTSItem()`, `playPodcastAudio()`, `playCloudTTS()`, `playCloudTTSCached()`, `playBrowserTTS()`
- `ttsPlayNextChunk()`, chunk pre-fetching
- `stopTTS()`, `ttsTogglePlay()`, skip/seek
- Queue management: `removeTTSQueueItem()`, `ttsClearQueue()`, `ttsDismissPlayer()`
- `formatTime()`

**Public API on the component:**
- `player.enqueue(item)` — add item to queue, auto-play if first
- `player.playNext(item)` — insert after current
- `player.stop()` — stop all playback
- `player.togglePlay()` — play/pause
- `player.skip(seconds)` — skip forward/back
- `player.queue` (getter) — current queue array
- `player.currentItem` (getter) — currently playing item
- `player.playing` (getter) — boolean

**Custom events fired:**
- `pr-player:queue-change` — after any queue modification
- `pr-player:now-playing` — when track changes (detail: `{ filename, title }`)
- `pr-player:progress` — periodic progress update (detail: `{ progress, charIndex }`)

**What stays in 07-tts.js as thin wrappers:**
```javascript
function addCurrentToTTSQueue() {
  var player = document.querySelector('pr-player');
  if (!activeFile || !player) return;
  _listenLoadingFile = activeFile;
  startListenLoading();
  var file = allFiles.find(f => f.filename === activeFile);
  if (!file) return;
  player.enqueue({
    filename: file.filename, title: file.title,
    image: file.image || '', domain: file.domain || '',
    enclosureUrl: (file.enclosureUrl && file.enclosureType && file.enclosureType.startsWith('audio/')) ? file.enclosureUrl : null
  });
}
```

**Step 1:** Move state variables into constructor.

**Step 2:** Move playback methods as component methods.

**Step 3:** Add public API methods and custom event dispatching.

**Step 4:** Rewrite `07-tts.js` functions as thin wrappers.

**Step 5:** Wire up `updateSidebarAudioIndicators()` to listen for `pr-player:queue-change`.

**Step 6:** Wire up TTS reading highlight to listen for `pr-player:progress`.

**Step 7:** Build and test.

**Step 8:** Commit.

---

### Task 5: Add expanded/mini mode switching

**Files:**
- Modify: `viewer/07-tts-player.js` (implement `_updateMode()`, mini template)
- Modify: `viewer.html` (add mini mount point in sidebar)
- Modify: `viewer.css` (mini mode styles, expanded positioning)

**Step 1:** Add a mini mount point at the bottom of the sidebar in `viewer.html`:
```html
<div id="player-mini-mount" class="player-mini-mount"></div>
```

**Step 2:** Implement `_updateMode()` in `PrPlayer`:
- When `mode="expanded"`: Full DOM template (current), positioned as flex child at bottom of `#content-pane`
- When `mode="mini"`: Compact template (play/pause + title + thin progress), positioned sticky at sidebar bottom
- Add minimize/expand buttons to each mode's template
- Moving between mount points: `document.getElementById('player-mini-mount').appendChild(this)` vs `document.getElementById('content-pane').appendChild(this)`
- Audio element continues playing uninterrupted — only the DOM shell changes

**Step 3:** Add mini mode CSS:
```css
pr-player[mode="mini"] {
  position: sticky;
  bottom: 0;
  background: var(--sidebar-bg);
  border-top: 1px solid var(--border);
  padding: 8px 12px;
}
pr-player[mode="mini"] .mini-title {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
pr-player[mode="mini"] .mini-progress {
  height: 2px;
  background: var(--border);
  margin-top: 4px;
}
```

**Step 4:** Update expanded mode CSS — remove `position: fixed; left: 0; right: 0;`. Instead position as a flex child in the content pane.

**Step 5:** Add mobile media query to force fixed positioning regardless of mode:
```css
@media (max-width: 750px) {
  pr-player { position: fixed !important; left: 0; right: 0; bottom: 0; }
  pr-player .mini-toggle { display: none; }
}
```

**Step 6:** Build and test.

**Step 7:** Commit.

---

### Task 6: Remove old mini mode and static player HTML

**Files:**
- Modify: `viewer.html` (remove old `#mini-mode-container` block, lines 184-209)
- Modify: `viewer/07-tts.js` (remove `renderMiniMode()`, `toggleMiniMode()`, mini-mode sync timer, `mini-mode-container` references)
- Modify: `viewer.css` (remove old `.mini-mode-*` styles)

**Step 1:** Remove the `#mini-mode-container` div and all its contents from `viewer.html`.

**Step 2:** Remove `renderMiniMode()`, `toggleMiniMode()`, the mini-mode sync interval, and all `mini-mode-container` DOM references from `07-tts.js`.

**Step 3:** Remove `.mini-mode-*` CSS rules from `viewer.css`.

**Step 4:** Build and test.

**Step 5:** Commit.

---

### Task 7: Add tests and verify

**Files:**
- Modify: `src/viewer.test.ts` (structural tests for WebComponent)

**Step 1:** Add structural tests:
```typescript
describe('pr-player WebComponent', () => {
  const rootDir = join(__dirname, '..');

  test('07-tts-player.js defines PrPlayer custom element', () => {
    const player = readFileSync(join(rootDir, 'viewer', '07-tts-player.js'), 'utf-8');
    expect(player).toMatch(/class\s+PrPlayer\s+extends\s+HTMLElement/);
    expect(player).toContain("customElements.define('pr-player'");
  });

  test('viewer.html uses <pr-player> element', () => {
    const html = readFileSync(join(rootDir, 'viewer.html'), 'utf-8');
    expect(html).toContain('<pr-player>');
    expect(html).not.toContain('id="audio-player"'); // old static div removed
  });

  test('PrPlayer exposes public API methods', () => {
    const player = readFileSync(join(rootDir, 'viewer', '07-tts-player.js'), 'utf-8');
    expect(player).toMatch(/\benqueue\s*\(/);
    expect(player).toMatch(/\bplayNext\s*\(/);
    expect(player).toMatch(/\bstop\s*\(/);
    expect(player).toMatch(/\btogglePlay\s*\(/);
  });

  test('PrPlayer fires custom events', () => {
    const player = readFileSync(join(rootDir, 'viewer', '07-tts-player.js'), 'utf-8');
    expect(player).toContain('pr-player:queue-change');
    expect(player).toContain('pr-player:now-playing');
  });

  test('PrPlayer supports mode attribute', () => {
    const player = readFileSync(join(rootDir, 'viewer', '07-tts-player.js'), 'utf-8');
    expect(player).toContain("observedAttributes");
    expect(player).toContain("'mode'");
  });

  test('old mini-mode-container removed from viewer.html', () => {
    const html = readFileSync(join(rootDir, 'viewer.html'), 'utf-8');
    expect(html).not.toContain('mini-mode-container');
  });
});
```

**Step 2:** Build and run all tests.
```bash
bun run scripts/embed-viewer.ts && bun test
```

**Step 3:** Commit.

---

## Summary

| Task | What | Complexity |
|------|------|------------|
| 1 | WebComponent shell with DOM template | Simple |
| 2 | Move renderAudioPlayer into component | Simple |
| 3 | Move progress drag and speed slider | Moderate |
| 4 | Move playback state and audio control | Complex |
| 5 | Add expanded/mini mode switching | Moderate |
| 6 | Remove old mini mode and static HTML | Simple |
| 7 | Add tests and verify | Simple |
