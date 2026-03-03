# YouTube Unified Playback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make YouTube a first-class video source with queue integration, player bar controls, inline playback, popout, auto-popout on navigate, and speed control.

**Architecture:** New playback path in the existing router (`07-tts.js`). YouTube IFrame API loaded on demand. Queue items carry a `youtubeVideoId` field. Player bar stays generic — YouTube specifics stay in the TTS module.

**Tech Stack:** YouTube IFrame API (loaded on demand), existing `<pr-player>` web component, existing popout blob-URL pattern.

**Design Doc:** `docs/plans/2026-03-02-unified-video-playback-design.md`

---

### Task 1: Add `extractYouTubeVideoId()` helper

**Files:**
- Modify: `viewer/02-utils.js:1-13` (add after media helpers)
- Test: Manual in-browser console

**Step 1: Write the helper function**

Add after line 13 (after `isHlsSource`) in `viewer/02-utils.js`:

```js
function extractYouTubeVideoId(url) {
  if (!url) return null;
  try {
    var u = new URL(url);
    var host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split(/[/?]/)[0] || null;
    if (host !== 'youtube.com') return null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    var m = u.pathname.match(/^\/(embed|v|shorts)\/([^/?]+)/);
    return m ? m[2] : null;
  } catch { return null; }
}

function isYouTubeDomain(domain) {
  if (!domain) return false;
  return /^(www\.|m\.)?(youtube\.com|youtu\.be)$/.test(domain);
}
```

**Step 2: Write a test script**

Create `test-youtube-ids.js` (temporary, will delete):

```js
// Run with: node test-youtube-ids.js (or paste in browser console)
var tests = [
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://youtube.com/watch?v=abc-123_XY&t=30', 'abc-123_XY'],
  ['https://example.com/page', null],
  ['', null],
  [null, null],
];
var pass = 0, fail = 0;
tests.forEach(function(t) {
  var result = extractYouTubeVideoId(t[0]);
  if (result === t[1]) { pass++; }
  else { fail++; console.error('FAIL:', t[0], '→', result, '(expected', t[1] + ')'); }
});
console.log(pass + ' passed, ' + fail + ' failed');
```

**Step 3: Run the test**

Run: Paste `extractYouTubeVideoId` function + test script in browser console at localhost:7777
Expected: `9 passed, 0 failed`

**Step 4: Commit**

```bash
git add viewer/02-utils.js
git commit -m "feat: add extractYouTubeVideoId() and isYouTubeDomain() helpers"
```

---

### Task 2: Wire YouTube video ID into queue items

**Files:**
- Modify: `viewer/07-tts.js:157-199` (queue item builders)

Three functions build queue items: `playNextFromArticle()` (~line 157), `addToTTSQueue()` (~line 191), and `addCurrentToTTSQueue()` (calls `addToTTSQueue`). Each builds an `item` object from the `allFiles` entry. We need to add `youtubeVideoId` when the article is a YouTube video.

**Step 1: Update `playNextFromArticle()`**

In `viewer/07-tts.js`, find the line (~157):
```js
  var newItem = { filename: filename, title: file.title, image: file.image || '', domain: file.domain || '', feed: file.feed || '' };
```

Replace with:
```js
  var ytId = isYouTubeDomain(file.domain) ? extractYouTubeVideoId(file.url) : null;
  var newItem = { filename: filename, title: file.title, image: ytId ? 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg' : (file.image || ''), domain: file.domain || '', feed: file.feed || '' };
  if (ytId) newItem.youtubeVideoId = ytId;
```

**Step 2: Update `addToTTSQueue()`**

In `viewer/07-tts.js`, find the line (~191):
```js
  var item = { filename, title: file.title, image: file.image || '', domain: file.domain || '', feed: file.feed || '' };
```

Replace with:
```js
  var ytId = isYouTubeDomain(file.domain) ? extractYouTubeVideoId(file.url) : null;
  var item = { filename, title: file.title, image: ytId ? 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg' : (file.image || ''), domain: file.domain || '', feed: file.feed || '' };
  if (ytId) item.youtubeVideoId = ytId;
```

**Step 3: Commit**

```bash
git add viewer/07-tts.js
git commit -m "feat: populate youtubeVideoId on queue items for YouTube articles"
```

---

### Task 3: Add YouTube IFrame API loader

**Files:**
- Modify: `viewer/07-tts.js` (add near top, after globals ~line 25)

**Step 1: Add the API loader and YouTube state globals**

Add after the existing globals block (after `var _ttsChunkBuffer = ...`):

```js
// YouTube IFrame API
var _ytApiLoaded = false;
var _ytApiLoading = false;
var _ytApiCallbacks = [];
var _ytPlayer = null;
var _ytProgressInterval = null;

function loadYouTubeApi(callback) {
  if (_ytApiLoaded && window.YT && window.YT.Player) { callback(); return; }
  _ytApiCallbacks.push(callback);
  if (_ytApiLoading) return;
  _ytApiLoading = true;
  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.onerror = function() {
    _ytApiLoading = false;
    _ytApiCallbacks.forEach(function(cb) { cb(new Error('Failed to load YouTube API')); });
    _ytApiCallbacks = [];
  };
  document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function() {
  _ytApiLoaded = true;
  _ytApiLoading = false;
  _ytApiCallbacks.forEach(function(cb) { cb(); });
  _ytApiCallbacks = [];
};
```

**Step 2: Commit**

```bash
git add viewer/07-tts.js
git commit -m "feat: add on-demand YouTube IFrame API loader"
```

---

### Task 4: Implement `playYouTube()` — inline playback path

**Files:**
- Modify: `viewer/07-tts.js:279-309` (playback router) and add new function

**Step 1: Add YouTube branch to the router**

In `playTTSItem()` (~line 290), change:

```js
  // Media enclosures play natively — no TTS synthesis needed
  if (item.enclosureUrl) {
```

To:

```js
  // YouTube videos use the IFrame API
  if (item.youtubeVideoId) {
    playYouTube(item);
    return;
  }

  // Media enclosures play natively — no TTS synthesis needed
  if (item.enclosureUrl) {
```

**Step 2: Write the `playYouTube()` function**

Add after `playVideoPopout()` (after ~line 837):

```js
var YOUTUBE_SPEEDS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

function playYouTube(item) {
  stopListenLoading();
  var gen = _ttsPlayGeneration;

  // Clean up any previous YouTube player
  _ytCleanup();

  loadYouTubeApi(function(err) {
    if (err || gen !== _ttsPlayGeneration) {
      if (err) showToast('YouTube player controls unavailable.');
      ttsPlaying = false;
      renderAudioPlayer();
      return;
    }

    // Find or create a container in the article body
    var container = document.querySelector('.yt-embed');
    if (!container) {
      // Article not currently displayed or no embed — go straight to popout
      playYouTubePopout(item);
      return;
    }

    // Replace the bare iframe with a YT.Player container div
    container.innerHTML = '<div id="yt-player-target"></div>';
    container.style.paddingBottom = ''; // Will be set after onReady

    _ytPlayer = new YT.Player('yt-player-target', {
      videoId: item.youtubeVideoId,
      playerVars: {
        autoplay: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady: function(e) {
          if (gen !== _ttsPlayGeneration) { e.target.destroy(); return; }
          ttsPlaying = true;
          renderAudioPlayer();
          // Sync speed
          var rate = _ytNearestSpeed(ttsSpeed);
          e.target.setPlaybackRate(rate);
          // Start progress polling
          _ytStartProgressPolling();
        },
        onStateChange: function(e) {
          if (gen !== _ttsPlayGeneration) return;
          if (e.data === YT.PlayerState.PLAYING) {
            ttsPlaying = true;
            renderAudioPlayer();
          } else if (e.data === YT.PlayerState.PAUSED) {
            ttsPlaying = false;
            renderAudioPlayer();
          } else if (e.data === YT.PlayerState.ENDED) {
            _ytCleanup();
            ttsPlaying = false;
            renderAudioPlayer();
            if (ttsCurrentIndex + 1 < ttsQueue.length) {
              setTimeout(function() { playTTSItem(ttsCurrentIndex + 1); }, 500);
            } else {
              autoplayNext(item.filename);
            }
          }
        },
        onPlaybackRateChange: function(e) {
          ttsSpeed = e.data;
          renderAudioPlayer();
        },
        onError: function(e) {
          console.warn('[YT] Player error:', e.data);
          showToast('YouTube playback error');
          _ytCleanup();
          ttsPlaying = false;
          renderAudioPlayer();
        },
      }
    });
  });

  ttsPlaying = true;
  ttsGenerating = true; // Show loading state while API loads
  renderAudioPlayer();
}

function _ytNearestSpeed(speed) {
  var best = 1.0, bestDist = Infinity;
  for (var i = 0; i < YOUTUBE_SPEEDS.length; i++) {
    var d = Math.abs(YOUTUBE_SPEEDS[i] - speed);
    if (d < bestDist) { bestDist = d; best = YOUTUBE_SPEEDS[i]; }
  }
  return best;
}

function _ytStartProgressPolling() {
  _ytStopProgressPolling();
  _ytProgressInterval = setInterval(function() {
    if (!_ytPlayer || !_ytPlayer.getCurrentTime) return;
    var cur = _ytPlayer.getCurrentTime();
    var dur = _ytPlayer.getDuration();
    if (dur > 0) {
      _ttsProgressPct = cur / dur;
      _ttsCurrentTime = cur;
      _ttsDuration = dur;
    }
    renderAudioPlayer();
  }, 250);
}

function _ytStopProgressPolling() {
  if (_ytProgressInterval) { clearInterval(_ytProgressInterval); _ytProgressInterval = null; }
}

function _ytCleanup() {
  _ytStopProgressPolling();
  if (_ytPlayer) {
    try { _ytPlayer.destroy(); } catch {}
    _ytPlayer = null;
  }
  ttsGenerating = false;
}
```

**Step 3: Hook YouTube into transport controls**

Find the existing `ttsTogglePlay()` function and add YouTube handling. Search for `function ttsTogglePlay` and add a YouTube branch at the top of the function body:

```js
  // YouTube player
  if (_ytPlayer && _ytPlayer.getPlayerState) {
    var state = _ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      _ytPlayer.pauseVideo();
    } else {
      _ytPlayer.playVideo();
    }
    return;
  }
```

Find the existing `ttsSeek(pct)` function and add:

```js
  // YouTube
  if (_ytPlayer && _ytPlayer.getDuration) {
    _ytPlayer.seekTo(pct * _ytPlayer.getDuration(), true);
    return;
  }
```

Find `ttsSetSpeed(speed)` and add before the existing `if (ttsAudio)` line:

```js
  // YouTube
  if (_ytPlayer && _ytPlayer.setPlaybackRate) {
    _ytPlayer.setPlaybackRate(_ytNearestSpeed(speed));
  }
```

Find `function skipTime(seconds)` and add:

```js
  if (_ytPlayer && _ytPlayer.getCurrentTime) {
    _ytPlayer.seekTo(_ytPlayer.getCurrentTime() + seconds, true);
    return;
  }
```

**Step 4: Add YouTube cleanup to `stopTTS()`**

Find the `stopTTS()` function. Add at the top of its body:

```js
  _ytCleanup();
```

**Step 5: Verify inline playback manually**

1. Start viewer: `bun run src/index.ts view`
2. Open a YouTube article
3. Click "Listen" — YouTube embed should become a controlled `YT.Player`
4. Player bar should show title, artwork, progress, transport controls

**Step 6: Commit**

```bash
git add viewer/07-tts.js
git commit -m "feat: implement playYouTube() inline playback path with player bar integration"
```

---

### Task 5: YouTube popout and auto-popout on navigate

**Files:**
- Modify: `viewer/07-tts.js` (add `playYouTubePopout()`)
- Modify: `viewer/05-sidebar.js:447-476` (add auto-popout hook in `loadFile()`)

**Step 1: Write `playYouTubePopout()`**

Add after `_ytCleanup()` in `viewer/07-tts.js`:

```js
function playYouTubePopout(item, startTime) {
  _ytCleanup();
  ttsPlaying = true;
  renderAudioPlayer();

  var title = (item.title || 'Video').replace(/</g, '&lt;');
  var start = startTime ? '&start=' + Math.floor(startTime) : '';

  var html = '<!DOCTYPE html><html><head>'
    + '<meta charset="UTF-8"><title>' + title + ' — Pull Read</title>'
    + '<style>'
    + 'body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif;color:#fff}'
    + '#yt-popout{width:100%;height:100%}'
    + '.info{position:fixed;top:12px;left:16px;font-size:13px;opacity:0.7;z-index:10}'
    + '.pop-in{position:fixed;top:12px;right:16px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);border-radius:6px;padding:6px 14px;font-size:13px;cursor:pointer;font-family:inherit;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:background 0.15s;z-index:10}'
    + '.pop-in:hover{background:rgba(255,255,255,0.25)}'
    + '</style></head><body>'
    + '<div class="info">' + title + '</div>'
    + '<button class="pop-in" onclick="popBackIn()">&#8617; Pop back in</button>'
    + '<div id="yt-popout"></div>'
    + '<scr' + 'ipt>'
    + 'function popBackIn(){'
    + '  var t=0;try{t=_p.getCurrentTime();}catch{}'
    + '  if(window.opener&&window.opener._videoPopIn)window.opener._videoPopIn(t);'
    + '  window.close();'
    + '}'
    + 'var tag=document.createElement("script");tag.src="https://www.youtube.com/iframe_api";document.head.appendChild(tag);'
    + 'var _p;'
    + 'window.onYouTubeIframeAPIReady=function(){'
    + '  _p=new YT.Player("yt-popout",{videoId:"' + item.youtubeVideoId + '",playerVars:{autoplay:1,modestbranding:1,rel:0' + (startTime ? ',start:' + Math.floor(startTime) : '') + '},events:{'
    + '    onStateChange:function(e){if(e.data===YT.PlayerState.ENDED)window.close();}'
    + '  }});'
    + '};'
    + '</scr' + 'ipt></body></html>';

  var blob = new Blob([html], { type: 'text/html' });
  var blobUrl = URL.createObjectURL(blob);
  var w = window.open(blobUrl, '_blank', 'width=960,height=640,menubar=no,toolbar=no');
  URL.revokeObjectURL(blobUrl);

  if (w) {
    _videoPopoutWindow = w;
    renderAudioPlayer();
    var check = setInterval(function() {
      if (w.closed) {
        clearInterval(check);
        _videoPopoutWindow = null;
        if (_videoPopbackData) {
          _videoPopbackData = null;
          ttsPlaying = false;
          renderAudioPlayer();
          return;
        }
        ttsPlaying = false;
        renderAudioPlayer();
        if (ttsCurrentIndex + 1 < ttsQueue.length) {
          setTimeout(function() { playTTSItem(ttsCurrentIndex + 1); }, 500);
        } else {
          autoplayNext(item.filename);
        }
      }
    }, 500);
  } else {
    _videoPopoutWindow = null;
    ttsPlaying = false;
    renderAudioPlayer();
    showToast('Pop-up blocked. Opening video in new tab.');
    window.open('https://www.youtube.com/watch?v=' + item.youtubeVideoId, '_blank');
  }
}
```

**Step 2: Add auto-popout hook in `loadFile()`**

In `viewer/05-sidebar.js`, in `loadFile()` right after `var prevActive = activeFile;` (~line 452), add:

```js
  // Auto-popout YouTube if playing inline and navigating away
  if (_ytPlayer && ttsPlaying && ttsQueue[ttsCurrentIndex]) {
    var ytItem = ttsQueue[ttsCurrentIndex];
    var ytTime = 0;
    try { ytTime = _ytPlayer.getCurrentTime(); } catch {}
    _ytCleanup();
    playYouTubePopout(ytItem, ytTime);
  }
```

**Step 3: Add popout button for YouTube articles**

In `viewer/04-article.js`, find the YouTube embed block (~line 653-664). After the `<iframe>` div closes, add a controls row:

Find:
```js
      html += '<div class="yt-embed"><iframe src="https://www.youtube.com/embed/' + encodeURIComponent(ytId)
        + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" title="Embedded video"></iframe></div>';
```

Replace with:
```js
      html += '<div class="yt-embed" data-yt-id="' + escapeHtml(ytId) + '"><iframe src="https://www.youtube.com/embed/' + encodeURIComponent(ytId)
        + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" title="Embedded video"></iframe></div>';
      html += '<div class="video-controls">';
      html += '<button onclick="addCurrentToTTSQueue()" class="video-controls-btn"><svg style="width:14px;height:14px"><use href="#i-play"/></svg> Play</button>';
      html += '<button onclick="popOutCurrentYouTube()" class="video-controls-btn"><svg style="width:14px;height:14px"><use href="#i-external"/></svg> Pop out</button>';
      html += '</div>';
```

Add the `popOutCurrentYouTube()` function near `popOutCurrentVideo()` (~line 1043):

```js
function popOutCurrentYouTube() {
  var file = activeFile && allFiles.find(function(f) { return f.filename === activeFile; });
  if (!file) return;
  var ytId = extractYouTubeVideoId(file.url);
  if (!ytId) return;
  playYouTubePopout({
    title: file.title || 'Video',
    youtubeVideoId: ytId,
    image: 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg',
    filename: activeFile,
  });
}
```

**Step 4: Verify popout and auto-popout**

1. Open YouTube article, click "Pop out" — YouTube opens in controlled window
2. Pop-back-in button works
3. Play YouTube inline, then navigate to different article — auto-popout fires, video continues in popout

**Step 5: Commit**

```bash
git add viewer/07-tts.js viewer/05-sidebar.js viewer/04-article.js
git commit -m "feat: add YouTube popout and auto-popout on navigate"
```

---

### Task 6: Constrain speed slider for YouTube

**Files:**
- Modify: `viewer/07-tts-player.js:213-243` (speed slider)
- Modify: `viewer/07-tts.js:19` (expose `YOUTUBE_SPEEDS`)

**Step 1: Make speed arrays accessible to the player component**

The `YOUTUBE_SPEEDS` array is already defined in Task 4's `playYouTube()` section. Move it to module scope (near `TTS_SPEEDS` at line 19) so both files can see it:

In `viewer/07-tts.js` line 19, change:
```js
const TTS_SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0, 1.1, 1.15, 1.2, 1.3, 1.5, 1.75, 2.0];
```

To:
```js
const TTS_SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0, 1.1, 1.15, 1.2, 1.3, 1.5, 1.75, 2.0];
const YOUTUBE_SPEEDS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
```

(Remove the duplicate `YOUTUBE_SPEEDS` declaration from inside `playYouTube()` if placed there in Task 4.)

**Step 2: Update speed slider to use active speed set**

In `viewer/07-tts-player.js`, in `_toggleSpeedSlider()` (~line 219), change:

```js
    var count = TTS_SPEEDS.length;
```

To:

```js
    var isYT = _ytPlayer != null;
    var speeds = isYT ? YOUTUBE_SPEEDS : TTS_SPEEDS;
    var count = speeds.length;
```

Then in the same function, all references to `TTS_SPEEDS` need to use `speeds` instead:

In the ticks loop (~line 226):
```js
      var s = TTS_SPEEDS[i];
```
Change to:
```js
      var s = speeds[i];
```

In the `onDrag` function (~line 268):
```js
      ttsSetSpeed(TTS_SPEEDS[idx]);
```
Change to:
```js
      ttsSetSpeed(speeds[idx]);
```

Also update `_positionThumb()` — find the function and change `TTS_SPEEDS` references to use the same detection:

```js
  _positionThumb() {
    var thumb = document.getElementById('tts-speed-thumb');
    var valEl = document.getElementById('tts-speed-popup-val');
    if (!thumb) return;
    var isYT = _ytPlayer != null;
    var speeds = isYT ? YOUTUBE_SPEEDS : TTS_SPEEDS;
    var idx = speeds.indexOf(ttsSpeed);
    if (idx < 0) idx = speeds.indexOf(1.0);
    var pct = idx / (speeds.length - 1);
    thumb.style.top = ((1 - pct) * 100) + '%';
    if (valEl) valEl.textContent = ttsSpeed + 'x';
  }
```

And `ttsCycleSpeed()` in `07-tts.js` (~line 1454):
```js
  var idx = TTS_SPEEDS.indexOf(ttsSpeed);
  if (idx < 0) idx = TTS_SPEEDS.indexOf(1.0);
  var next = (idx + 1) % TTS_SPEEDS.length;
  ttsSetSpeed(TTS_SPEEDS[next]);
```

Change to:
```js
  var speeds = _ytPlayer ? YOUTUBE_SPEEDS : TTS_SPEEDS;
  var idx = speeds.indexOf(ttsSpeed);
  if (idx < 0) idx = speeds.indexOf(1.0);
  var next = (idx + 1) % speeds.length;
  ttsSetSpeed(speeds[next]);
```

**Step 3: Verify**

1. Play a YouTube video — speed slider shows 8 YouTube rates
2. Play a TTS article — speed slider shows 15 rates
3. Cycle speed button respects active speed set

**Step 4: Commit**

```bash
git add viewer/07-tts.js viewer/07-tts-player.js
git commit -m "feat: constrain speed slider to YouTube rates when YouTube is active"
```

---

### Task 7: Vertical video / Shorts CSS

**Files:**
- Modify: `viewer.css:3535-3536` (`.yt-embed` styles)

**Step 1: Add vertical video styles**

Find the existing `.yt-embed` styles (~line 3535):

```css
  .yt-embed { position: relative; width: 100%; padding-bottom: 56.25%; height: 0; overflow: hidden; margin: 1em 0; border-radius: 8px; }
  .yt-embed iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; border-radius: 8px; }
```

Replace with:

```css
  .yt-embed { position: relative; width: 100%; padding-bottom: 56.25%; height: 0; overflow: hidden; margin: 1em 0; border-radius: 8px; }
  .yt-embed iframe, .yt-embed > div { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; border-radius: 8px; }
  .yt-embed.yt-vertical { width: 360px; max-width: 100%; padding-bottom: 0; height: 640px; max-height: 80vh; margin-left: auto; margin-right: auto; }
```

The `> div` selector handles the `YT.Player` container div that replaces the iframe.

**Step 2: Commit**

```bash
git add viewer.css
git commit -m "feat: add vertical video / YouTube Shorts CSS"
```

---

### Task 8: Rebuild viewer and full verification

**Files:**
- Run: `bun scripts/embed-viewer.ts`
- Run: `bun test`

**Step 1: Rebuild the viewer**

```bash
bun scripts/embed-viewer.ts
```

Expected: Completes without errors, outputs byte counts.

**Step 2: Run tests**

```bash
bun test
```

Expected: All feed/writer tests pass. The 3 pre-existing keychain test failures are unrelated.

**Step 3: Manual verification checklist**

Start viewer: `bun run src/index.ts view`

- [ ] Open YouTube article — `<iframe>` renders with Play/Pop-out controls below
- [ ] Click "Play" — iframe becomes `YT.Player`, player bar appears with title + thumbnail
- [ ] Play/pause via player bar works
- [ ] Seek via progress bar works
- [ ] Speed slider shows 8 YouTube rates (not 15)
- [ ] Click "Pop out" — YouTube opens in 960x640 window
- [ ] "Pop back in" button in popout works (returns to inline, resumes position)
- [ ] Navigate away while YouTube plays inline — auto-popout fires
- [ ] Queue advance — video ends, next queue item plays
- [ ] Mini player shows YouTube title and thumbnail
- [ ] Non-YouTube articles still work normally (TTS, podcast audio, podcast video)
- [ ] Block YouTube API (DevTools network block) — falls back to bare iframe, toast shown

**Step 4: Commit rebuild**

```bash
git add src/viewer-html.ts
git commit -m "chore: rebuild viewer-html.ts with YouTube playback integration"
```

---

### Task 9: Clean up test script

**Step 1: Delete the temporary test script**

```bash
rm -f test-youtube-ids.js
```

(Only if it was saved to disk in Task 1.)
