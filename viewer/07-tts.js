// ---- TTS Audio Playback ----
let ttsQueue = [];
let ttsCurrentIndex = -1;
let ttsAudio = null;        // HTMLAudioElement for cloud TTS
let ttsSynthUtterance = null; // SpeechSynthesisUtterance for browser TTS
let ttsPlaying = false;
let ttsSpeed = 1.0;
let ttsProvider = 'browser';
let ttsGenerating = false;
let ttsProgressTimer = null;
let _ttsChunkSession = null; // { id, totalChunks, currentChunk, elapsedTime }
var _ttsNextPrefetch = null;  // { filename, sessionId, totalChunks, currentChunk, done }

const TTS_SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0, 1.1, 1.15, 1.2, 1.3, 1.5, 1.75, 2.0];

function playCueSound() {
  try { new Audio('/audio/cue.webm').play(); } catch(e) {}
}

// ---- Listen button loading animation ----
var LISTEN_WORDS = [
  'Reading', 'Processing', 'Generating', 'Preparing', 'Creating',
  'Warming up', 'Clearing throat', 'Rehearsing', 'Caffeinating', 'Inhaling',
  'Summoning', 'Channeling', 'Tuning', 'Vocalizing', 'Manifesting',
  'Contemplating', 'Conjuring', 'Brewing', 'Stretching', 'Composing',
  'Hydrating', 'Buffering', 'Focusing', 'Harmonizing', 'Simmering',
];
var _listenTimer = null;
var _listenWordIdx = 0;
var _listenLoadingFile = null;

function startListenLoading() {
  var btn = document.getElementById('listen-btn');
  if (!btn) return;
  btn.classList.add('listen-loading');
  _listenWordIdx = Math.floor(Math.random() * LISTEN_WORDS.length);
  btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#i-volume"/></svg> ' + LISTEN_WORDS[_listenWordIdx] + '\u2026';
  _listenTimer = setInterval(function() {
    _listenWordIdx = (_listenWordIdx + 1) % LISTEN_WORDS.length;
    if (activeFile !== _listenLoadingFile) return;
    var b = document.getElementById('listen-btn');
    if (!b) { stopListenLoading(); return; }
    b.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#i-volume"/></svg> ' + LISTEN_WORDS[_listenWordIdx] + '\u2026';
  }, 2500);
}

function stopListenLoading() {
  if (_listenTimer) { clearInterval(_listenTimer); _listenTimer = null; }
  _listenLoadingFile = null;
  var btn = document.getElementById('listen-btn');
  if (btn) btn.classList.remove('listen-loading');
  updateListenButtonState();
}

function updateListenButtonState() {
  var btn = document.getElementById('listen-btn');
  if (!btn || (_listenTimer && activeFile === _listenLoadingFile)) return; // Loading animation takes precedence
  var playingFile = ttsPlaying && ttsCurrentIndex >= 0 && ttsCurrentIndex < ttsQueue.length
    ? ttsQueue[ttsCurrentIndex].filename : null;
  // Use "Play" label for podcast articles, "Listen" for TTS
  var file = activeFile && allFiles.find(function(f) { return f.filename === activeFile; });
  var isPodcast = file && file.enclosureUrl && file.enclosureType && file.enclosureType.startsWith('audio/');
  var idleLabel = isPodcast ? 'Play' : 'Listen';
  if (playingFile && playingFile === activeFile) {
    btn.classList.add('listen-playing');
    btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#i-volume"/></svg> Playing';
  } else {
    btn.classList.remove('listen-playing');
    btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#i-volume"/></svg> ' + idleLabel;
  }
  // Show/hide Play Next trigger when queue is active
  var trigger = document.getElementById('play-next-trigger');
  if (trigger) {
    trigger.style.display = ttsQueue.length > 0 ? '' : 'none';
  }
}

function togglePlayNextMenu(e) {
  e.stopPropagation();
  var existing = document.querySelector('.play-next-dropdown');
  if (existing) { existing.remove(); return; }
  var menu = document.getElementById('play-next-menu');
  if (!menu) return;
  var dropdown = document.createElement('div');
  dropdown.className = 'play-next-dropdown';

  var isQueued = ttsQueue.some(function(q) { return q.filename === activeFile; });
  if (!isQueued) {
    dropdown.innerHTML =
      '<button onclick="playNextFromArticle();this.closest(\'.play-next-dropdown\').remove()"><svg class="icon icon-sm" style="width:12px;height:12px;vertical-align:-1px;margin-right:4px"><use href="#i-forward"/></svg> Play next</button>'
      + '<button onclick="addCurrentToTTSQueue();this.closest(\'.play-next-dropdown\').remove()"><svg class="icon icon-sm" style="width:12px;height:12px;vertical-align:-1px;margin-right:4px"><use href="#i-queue"/></svg> Add to queue</button>';
  } else {
    dropdown.innerHTML = '<button onclick="this.closest(\'.play-next-dropdown\').remove()" style="color:var(--muted)">Already in queue</button>';
  }
  menu.appendChild(dropdown);
  // Close on click outside
  setTimeout(function() {
    document.addEventListener('click', function closePlayNext() {
      dropdown.remove();
      document.removeEventListener('click', closePlayNext);
    });
  }, 0);
}

function addCurrentToTTSQueue() {
  if (!activeFile) return;
  _listenLoadingFile = activeFile;
  startListenLoading();
  addToTTSQueue(activeFile);
}

function playNextFromArticle(filename) {
  if (!filename) filename = activeFile;
  if (!filename) return;
  // Insert after current playing item
  var file = allFiles.find(function(f) { return f.filename === filename; });
  if (!file) return;
  // If already in queue, just move it
  var existingIdx = ttsQueue.findIndex(function(q) { return q.filename === filename; });
  if (existingIdx >= 0) {
    var item = ttsQueue.splice(existingIdx, 1)[0];
    if (existingIdx < ttsCurrentIndex) ttsCurrentIndex--;
    var insertAt = ttsCurrentIndex + 1;
    ttsQueue.splice(insertAt, 0, item);
    renderAudioPlayer();
    return;
  }
  var newItem = { filename: filename, title: file.title };
  if (file.enclosureUrl && file.enclosureType && file.enclosureType.startsWith('audio/')) {
    newItem.enclosureUrl = file.enclosureUrl;
  }
  var insertAt = ttsCurrentIndex >= 0 ? ttsCurrentIndex + 1 : 0;
  ttsQueue.splice(insertAt, 0, newItem);
  renderAudioPlayer();
  if (ttsQueue.length === 1) playTTSItem(0);
}

async function addToTTSQueue(filename) {
  const file = allFiles.find(f => f.filename === filename);
  if (!file) return;

  // If already in queue, jump to it
  if (ttsQueue.some(q => q.filename === filename)) {
    stopListenLoading();
    const idx = ttsQueue.findIndex(q => q.filename === filename);
    if (idx >= 0) playTTSItem(idx);
    return;
  }

  // Fetch current provider if not yet known
  if (serverMode && ttsProvider === 'browser') {
    try {
      const res = await fetch('/api/tts-settings');
      if (res.ok) {
        const cfg = await res.json();
        ttsProvider = cfg.provider || 'browser';
      }
    } catch {}
  }

  var item = { filename, title: file.title };
  if (file.enclosureUrl && file.enclosureType && file.enclosureType.startsWith('audio/')) {
    item.enclosureUrl = file.enclosureUrl;
  }
  ttsQueue.push(item);
  renderAudioPlayer();
  // Auto-play if this is the first item in the queue
  if (ttsQueue.length === 1) playTTSItem(0);
}

function renderAudioPlayer() {
  const panel = document.getElementById('audio-player');
  if (!panel) return;

  var app = document.querySelector('.app');

  if (ttsQueue.length === 0) {
    panel.classList.add('hidden');
    if (app) app.classList.remove('has-bottom-bar');
    updateSidebarAudioIndicators();
    updateArticleNowPlaying();
    return;
  }
  panel.classList.remove('hidden');
  if (app) app.classList.add('has-bottom-bar');

  const label = document.getElementById('audio-now-label');
  const status = document.getElementById('audio-now-status');
  const playBtn = document.getElementById('tts-play-btn');

  if (ttsCurrentIndex >= 0 && ttsCurrentIndex < ttsQueue.length) {
    label.textContent = ttsQueue[ttsCurrentIndex].title;
  } else {
    label.textContent = 'No article playing';
  }

  if (ttsGenerating) {
    status.textContent = 'Generating\u2026';
  } else if (ttsPlaying) {
    status.textContent = 'Playing';
  } else if (ttsCurrentIndex >= 0) {
    status.textContent = 'Paused';
  } else {
    status.textContent = '';
  }

  playBtn.innerHTML = ttsPlaying
    ? '<svg><use href="#i-pause"/></svg>'
    : '<svg><use href="#i-play"/></svg>';

  // Render queue
  const queueSection = document.getElementById('audio-queue-section');
  const queueList = document.getElementById('audio-queue-list');
  var queueToggle = document.getElementById('bottom-bar-queue-toggle');
  if (ttsQueue.length > 1) {
    if (queueToggle) queueToggle.classList.add('active');
    queueList.innerHTML = ttsQueue.map((item, i) =>
      '<div class="audio-queue-item' + (i === ttsCurrentIndex ? ' playing' : '') + '" onclick="playTTSItem(' + i + ')">'
      + '<span style="font-size:10px;color:var(--muted);width:14px;text-align:center">' + (i === ttsCurrentIndex ? '&#9654;' : (i + 1)) + '</span>'
      + '<span class="queue-title">' + escapeHtml(item.title) + '</span>'
      + '<button class="queue-remove" onclick="event.stopPropagation();removeTTSQueueItem(' + i + ')" title="Remove">&times;</button>'
      + '</div>'
    ).join('');
  } else {
    if (queueToggle) queueToggle.classList.remove('active');
    queueSection.style.display = 'none';
  }

  updateListenButtonState();
  updateSidebarAudioIndicators();
  updateArticleNowPlaying();
  renderMiniMode();
  saveTTSState();
}

/** Navigate to the currently playing article */
function bottomBarGoToArticle() {
  var fn = ttsCurrentIndex >= 0 && ttsCurrentIndex < ttsQueue.length
    ? ttsQueue[ttsCurrentIndex].filename : null;
  if (!fn) return;
  var idx = displayFiles.findIndex(function(f) { return f.filename === fn; });
  if (idx >= 0) loadFile(idx);
}

/** Toggle queue visibility in bottom bar */
function toggleBottomBarQueue() {
  var qs = document.getElementById('audio-queue-section');
  if (!qs) return;
  if (ttsQueue.length <= 1) { qs.style.display = 'none'; return; }
  qs.style.display = qs.style.display === 'none' ? '' : 'none';
}

/** Show playing/queued indicators on sidebar file items */
function updateSidebarAudioIndicators() {
  // Remove all existing indicators first
  document.querySelectorAll('.file-item-audio').forEach(function(el) { el.remove(); });
  if (ttsQueue.length === 0) return;

  var playingFile = ttsCurrentIndex >= 0 && ttsCurrentIndex < ttsQueue.length
    ? ttsQueue[ttsCurrentIndex].filename : null;

  ttsQueue.forEach(function(item, i) {
    var el = document.querySelector('.file-item[data-filename="' + CSS.escape(item.filename) + '"]');
    if (!el) return;
    var meta = el.querySelector('.file-item-meta');
    if (!meta) return;
    var indicator = document.createElement('span');
    indicator.className = 'file-item-audio';
    if (item.filename === playingFile && ttsPlaying) {
      indicator.innerHTML = '<span class="eq-bars"><span></span><span></span><span></span></span>';
    } else if (item.filename === playingFile) {
      indicator.innerHTML = '<svg><use href="#i-pause"/></svg>';
    } else {
      indicator.innerHTML = '<span class="queue-pos">' + (i + 1) + '</span>';
    }
    meta.appendChild(indicator);
  });
}

/** Clean up any stale inline player elements */
function updateArticleNowPlaying() {
  var existing = document.getElementById('article-now-playing');
  if (existing) existing.remove();
}

async function playTTSItem(index) {
  stopTTS();
  ttsCurrentIndex = index;
  if (index < 0 || index >= ttsQueue.length) return;

  const item = ttsQueue[index];
  ttsPlaying = true;
  renderAudioPlayer();

  // Podcast enclosures play as native audio — no TTS synthesis needed
  if (item.enclosureUrl) {
    await playPodcastAudio(item);
    return;
  }

  // Check TTS provider
  await loadTTSSettings();

  if (ttsProvider === 'browser') {
    await playBrowserTTS(item.filename);
  } else {
    await playCloudTTS(item.filename);
  }
}

async function loadTTSSettings() {
  if (!serverMode) { ttsProvider = 'browser'; return; }
  try {
    const res = await fetch('/api/tts-settings');
    if (res.ok) {
      const data = await res.json();
      ttsProvider = data.provider || 'browser';
    }
  } catch { ttsProvider = 'browser'; }
}

async function playBrowserTTS(filename) {
  const synth = window.speechSynthesis;
  if (!synth) {
    alert('Speech synthesis not available in this browser.');
    ttsPlaying = false;
    renderAudioPlayer();
    return;
  }

  // Fetch article text
  let text = '';
  try {
    const res = await fetch('/api/file?name=' + encodeURIComponent(filename));
    if (res.ok) text = await res.text();
  } catch {}
  if (!text) { ttsPlaying = false; renderAudioPlayer(); return; }

  const { meta, body } = parseFrontmatter(text);
  const ttsText = (meta && meta.title ? meta.title + '\n\n' : '') + body;
  const plainText = stripMarkdownForTTS(ttsText);

  // Cancel any existing
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(plainText);
  utterance.rate = ttsSpeed;
  utterance.lang = navigator.language || 'en-US';
  ttsSynthUtterance = utterance;

  // Estimate total duration (browser TTS doesn't give real progress)
  const estimatedWords = plainText.split(/\s+/).length;
  const estimatedSeconds = estimatedWords / (150 * ttsSpeed); // ~150 wpm base
  let startTime = Date.now();

  utterance.onstart = function() {
    playCueSound();
    stopListenLoading();
    ttsPlaying = true;
    startTime = Date.now();
    renderAudioPlayer();
    document.getElementById('tts-time-total').textContent = formatTime(estimatedSeconds);
    ttsProgressTimer = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const pct = Math.min(100, (elapsed / estimatedSeconds) * 100);
      document.getElementById('tts-progress').style.width = pct + '%';
      document.getElementById('tts-time-current').textContent = formatTime(elapsed);
    }, 200);
  };

  utterance.onend = function() {
    clearInterval(ttsProgressTimer);
    ttsPlaying = false;
    ttsSynthUtterance = null;
    document.getElementById('tts-progress').style.width = '100%';
    renderAudioPlayer();
    // Auto-play next
    if (ttsCurrentIndex + 1 < ttsQueue.length) {
      setTimeout(() => playTTSItem(ttsCurrentIndex + 1), 500);
    }
  };

  utterance.onerror = function() {
    clearInterval(ttsProgressTimer);
    ttsPlaying = false;
    ttsSynthUtterance = null;
    renderAudioPlayer();
  };

  synth.speak(utterance);
}

async function playCloudTTS(filename) {
  ttsGenerating = true;
  renderAudioPlayer();

  try {
    // Start a chunked TTS session
    const startRes = await fetch('/api/tts/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: filename }),
    });

    ttsGenerating = false;

    if (!startRes.ok) {
      const err = await startRes.json().catch(function() { return { error: 'TTS failed' }; });
      if (err.fallback === 'browser') {
        console.warn('Kokoro unavailable, falling back to browser TTS:', err.error);
        await playBrowserTTS(filename);
        return;
      }
      stopListenLoading();
      alert('TTS Error: ' + (err.error || 'Unknown error'));
      ttsPlaying = false;
      renderAudioPlayer();
      return;
    }

    const session = await startRes.json();

    if (session.cached) {
      // Already cached on disk — use the full-file endpoint for instant playback
      await playCloudTTSCached(filename);
      return;
    }

    // Progressive chunk-based playback
    _ttsChunkSession = {
      id: session.id,
      totalChunks: session.totalChunks,
      currentChunk: 0,
      elapsedTime: 0,
      estimatedTotalDuration: 0,
    };

    ttsPlaying = true;
    renderAudioPlayer();
    ttsPlayNextChunk(0);
  } catch (err) {
    ttsGenerating = false;
    ttsPlaying = false;
    _ttsChunkSession = null;
    renderAudioPlayer();
    alert('TTS Error: ' + err.message);
  }
}

/** Play a full cached audio file via HTMLAudioElement (preserves pitch when speed changes) */
async function playCloudTTSCached(filename) {
  try {
    var audio = new Audio('/api/tts/play?name=' + encodeURIComponent(filename));
    audio.playbackRate = ttsSpeed;

    audio.addEventListener('loadedmetadata', function() {
      document.getElementById('tts-time-total').textContent = formatTime(audio.duration);
    });

    audio.addEventListener('playing', function() {
      playCueSound();
      stopListenLoading();
      ttsPlaying = true;
      renderAudioPlayer();
      // Cached playback means Kokoro is idle — pre-generate next queue item
      ttsPrefetchNextQueueItem();
    });

    audio.addEventListener('timeupdate', function() {
      if (!audio.duration) return;
      var pct = Math.min(100, (audio.currentTime / audio.duration) * 100);
      document.getElementById('tts-progress').style.width = pct + '%';
      document.getElementById('tts-time-current').textContent = formatTime(audio.currentTime);
    });

    audio.addEventListener('ended', function() {
      document.getElementById('tts-progress').style.width = '100%';
      ttsPlaying = false;
      _ttsNextPrefetch = null;
      renderAudioPlayer();
      if (ttsCurrentIndex + 1 < ttsQueue.length) {
        setTimeout(function() { playTTSItem(ttsCurrentIndex + 1); }, 500);
      }
    });

    audio.addEventListener('error', function() {
      stopListenLoading();
      ttsPlaying = false;
      renderAudioPlayer();
      alert('TTS Error: Failed to load cached audio');
    });

    audio.play();

    ttsAudio = audio;
    ttsPlaying = true;
    renderAudioPlayer();
  } catch (err) {
    ttsPlaying = false;
    renderAudioPlayer();
    alert('TTS Error: ' + err.message);
  }
}

/** Play a podcast episode via its enclosure URL as native audio */
async function playPodcastAudio(item) {
  try {
    var audio = new Audio(item.enclosureUrl);
    audio.playbackRate = ttsSpeed;
    var resumeTime = item.savedTime || 0;

    audio.addEventListener('loadedmetadata', function() {
      document.getElementById('tts-time-total').textContent = formatTime(audio.duration);
      // Resume from saved position
      if (resumeTime > 0 && resumeTime < audio.duration - 5) {
        audio.currentTime = resumeTime;
        resumeTime = 0;
      }
    });

    audio.addEventListener('playing', function() {
      stopListenLoading();
      ttsPlaying = true;
      renderAudioPlayer();
    });

    var _lastProgressSave = 0;
    audio.addEventListener('timeupdate', function() {
      if (!audio.duration) return;
      var pct = Math.min(100, (audio.currentTime / audio.duration) * 100);
      document.getElementById('tts-progress').style.width = pct + '%';
      document.getElementById('tts-time-current').textContent = formatTime(audio.currentTime);
      // Save progress every 5 seconds
      if (Date.now() - _lastProgressSave > 5000) {
        _lastProgressSave = Date.now();
        saveTTSState();
      }
    });

    audio.addEventListener('ended', function() {
      document.getElementById('tts-progress').style.width = '100%';
      ttsPlaying = false;
      renderAudioPlayer();
      if (ttsCurrentIndex + 1 < ttsQueue.length) {
        setTimeout(function() { playTTSItem(ttsCurrentIndex + 1); }, 500);
      }
    });

    audio.addEventListener('error', function() {
      stopListenLoading();
      ttsPlaying = false;
      renderAudioPlayer();
      alert('Podcast playback error: could not load audio');
    });

    audio.play();
    ttsAudio = audio;
    ttsPlaying = true;
    renderAudioPlayer();
  } catch (err) {
    ttsPlaying = false;
    renderAudioPlayer();
    alert('Podcast playback error: ' + err.message);
  }
}

// Tracks which chunks have been pre-fetched (server-side cache warming)
var _ttsChunkBuffer = new Map();

/** Pre-fetch the next chunk to warm the server cache so HTMLAudioElement loads instantly */
function ttsPrefetchChunk(index) {
  var session = _ttsChunkSession;
  if (!session || index >= session.totalChunks) return;
  if (_ttsChunkBuffer.has(index)) return;

  // Mark as in-flight so we don't double-fetch
  _ttsChunkBuffer.set(index, 'fetching');

  fetch('/api/tts/chunk/' + session.id + '/' + index)
    .then(function(res) {
      if (res.ok && session === _ttsChunkSession) {
        _ttsChunkBuffer.set(index, 'ready');
      }
      // Consume the body to complete the fetch (warms server cache)
      return res.arrayBuffer();
    })
    .catch(function() {
      if (session === _ttsChunkSession) _ttsChunkBuffer.delete(index);
    });
}

/** Pre-generate audio for the next queue item so transition is instant */
function ttsPrefetchNextQueueItem() {
  if (ttsProvider === 'browser') return;
  var nextIndex = ttsCurrentIndex + 1;
  if (nextIndex >= ttsQueue.length) return;
  var nextItem = ttsQueue[nextIndex];
  // Already prefetching this item
  if (_ttsNextPrefetch && _ttsNextPrefetch.filename === nextItem.filename) return;

  fetch('/api/tts/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nextItem.filename }),
  })
  .then(function(res) { return res.json(); })
  .then(function(session) {
    if (session.cached) {
      _ttsNextPrefetch = { filename: nextItem.filename, done: true };
      return;
    }
    _ttsNextPrefetch = {
      filename: nextItem.filename,
      sessionId: session.id,
      totalChunks: session.totalChunks,
      currentChunk: 0,
      done: false,
    };
    ttsPrefetchNextQueueChunk();
  })
  .catch(function() { _ttsNextPrefetch = null; });
}

/** Sequentially generate chunks for the next queue item in the background */
function ttsPrefetchNextQueueChunk() {
  if (!_ttsNextPrefetch || _ttsNextPrefetch.done) return;
  if (_ttsNextPrefetch.currentChunk >= _ttsNextPrefetch.totalChunks) {
    _ttsNextPrefetch.done = true;
    return;
  }
  fetch('/api/tts/chunk/' + _ttsNextPrefetch.sessionId + '/' + _ttsNextPrefetch.currentChunk)
    .then(function(res) { return res.arrayBuffer(); })
    .then(function() {
      if (!_ttsNextPrefetch) return;
      _ttsNextPrefetch.currentChunk++;
      ttsPrefetchNextQueueChunk();
    })
    .catch(function() { /* non-critical */ });
}

/** Play a single TTS chunk via HTMLAudioElement (preserves pitch), then chain to the next */
async function ttsPlayNextChunk(index, seekPct) {
  var session = _ttsChunkSession;
  if (!session || session !== _ttsChunkSession) return;

  if (index >= session.totalChunks) {
    // All chunks played — done
    ttsPlaying = false;
    _ttsChunkSession = null;
    _ttsChunkBuffer.clear();
    _ttsNextPrefetch = null;
    document.getElementById('tts-progress').style.width = '100%';
    renderAudioPlayer();
    if (ttsCurrentIndex + 1 < ttsQueue.length) {
      setTimeout(function() { playTTSItem(ttsCurrentIndex + 1); }, 500);
    }
    return;
  }

  session.currentChunk = index;
  renderAudioPlayer();

  try {
    var chunkUrl = '/api/tts/chunk/' + session.id + '/' + index;
    var audio = new Audio(chunkUrl);
    audio.playbackRate = ttsSpeed;
    // preservesPitch defaults to true — pitch stays constant when speed changes

    audio.addEventListener('loadedmetadata', function() {
      if (session !== _ttsChunkSession) return;
      var chunkDuration = audio.duration;

      if (index === 0 && !seekPct) {
        session.estimatedTotalDuration = chunkDuration * session.totalChunks;
        document.getElementById('tts-time-total').textContent = '~' + formatTime(session.estimatedTotalDuration);
      }

      // Seek within chunk if a seek percentage was given
      if (seekPct && seekPct > 0 && chunkDuration) {
        audio.currentTime = seekPct * chunkDuration;
      }
    });

    audio.addEventListener('playing', function() {
      if (session !== _ttsChunkSession) return;
      if (index === 0) playCueSound();
      stopListenLoading();
      ttsPlaying = true;
      renderAudioPlayer();

      // Pre-fetch next chunk while this one plays
      if (index + 1 < session.totalChunks) {
        ttsPrefetchChunk(index + 1);
      } else {
        // Last chunk playing — Kokoro is idle, pre-generate next queue item
        ttsPrefetchNextQueueItem();
      }
    });

    audio.addEventListener('timeupdate', function() {
      if (session !== _ttsChunkSession) return;
      var chunkDuration = audio.duration || 1;
      var chunkProgress = Math.min(1, audio.currentTime / chunkDuration);
      var overallPct = ((index + chunkProgress) / session.totalChunks) * 100;
      document.getElementById('tts-progress').style.width = overallPct + '%';
      var currentTime = session.elapsedTime + audio.currentTime;
      document.getElementById('tts-time-current').textContent = formatTime(currentTime);
    });

    audio.addEventListener('ended', function() {
      if (session !== _ttsChunkSession) return;
      session.elapsedTime += audio.duration || 0;
      // Show loading words only if next chunk isn't pre-warmed on the server yet
      var nextReady = _ttsChunkBuffer.get(index + 1) === 'ready';
      if (index + 1 < session.totalChunks && !nextReady) startListenLoading();
      ttsPlayNextChunk(index + 1);
    });

    audio.addEventListener('error', function() {
      if (session !== _ttsChunkSession) return;
      stopListenLoading();
      ttsPlaying = false;
      _ttsChunkSession = null;
      _ttsChunkBuffer.clear();
      renderAudioPlayer();
      var statusEl = document.getElementById('audio-now-status');
      if (statusEl) statusEl.textContent = 'Playback error';
    });

    audio.play();

    // Store as plain HTMLAudioElement — existing toggle/speed/stop code handles this
    ttsAudio = audio;
    ttsPlaying = true;
    renderAudioPlayer();
  } catch (err) {
    stopListenLoading();
    ttsPlaying = false;
    _ttsChunkSession = null;
    _ttsChunkBuffer.clear();
    renderAudioPlayer();
    alert('TTS Error: ' + err.message);
  }
}

function stopTTS() {
  clearInterval(ttsProgressTimer);
  _ttsChunkSession = null;
  _ttsChunkBuffer.clear();
  _ttsNextPrefetch = null;
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.src = '';
    ttsAudio = null;
  }
  if (ttsSynthUtterance) {
    window.speechSynthesis.cancel();
    ttsSynthUtterance = null;
  }
  ttsPlaying = false;
  ttsGenerating = false;
  var prog = document.getElementById('tts-progress');
  if (prog) prog.style.width = '0%';
  var cur = document.getElementById('tts-time-current');
  if (cur) cur.textContent = '0:00';
  var tot = document.getElementById('tts-time-total');
  if (tot) tot.textContent = '0:00';
}

function ttsTogglePlay() {
  if (ttsQueue.length === 0) return;

  if (ttsProvider === 'browser') {
    const synth = window.speechSynthesis;
    if (ttsPlaying) {
      synth.pause();
      ttsPlaying = false;
      clearInterval(ttsProgressTimer);
    } else if (synth.paused) {
      synth.resume();
      ttsPlaying = true;
      // Restart progress timer
      ttsProgressTimer = setInterval(() => {
        const timeEl = document.getElementById('tts-time-current');
        const totalEl = document.getElementById('tts-time-total');
        // parse current time and increment
        const parts = timeEl.textContent.split(':');
        let secs = parseInt(parts[0]) * 60 + parseInt(parts[1]) + 0.2;
        timeEl.textContent = formatTime(secs);
      }, 200);
    } else if (ttsCurrentIndex >= 0) {
      playTTSItem(ttsCurrentIndex);
    } else {
      playTTSItem(0);
    }
  } else {
    if (ttsAudio) {
      if (ttsPlaying) {
        ttsAudio.pause();
        ttsPlaying = false;
      } else {
        ttsAudio.play();
        ttsPlaying = true;
      }
    } else if (ttsCurrentIndex >= 0) {
      playTTSItem(ttsCurrentIndex);
    } else {
      playTTSItem(0);
    }
  }
  renderAudioPlayer();
}

function ttsSkipNext() {
  skipTime(15);
}

function ttsSkipPrev() {
  skipTime(-15);
}

function skipTime(seconds) {
  if (_ttsChunkSession) {
    var session = _ttsChunkSession;
    // Can't seek until we have a duration estimate from the first chunk
    if (!session.estimatedTotalDuration) return;
    var currentChunkTime = ttsAudio ? ttsAudio.currentTime : 0;
    var targetTime = session.elapsedTime + currentChunkTime + seconds;
    if (targetTime < 0) targetTime = 0;
    var totalEst = session.estimatedTotalDuration;
    if (targetTime >= totalEst) return;
    var pct = targetTime / totalEst;
    seekToChunkPosition(pct);
    return;
  }
  if (ttsAudio && ttsAudio.duration) {
    var newTime = ttsAudio.currentTime + seconds;
    ttsAudio.currentTime = Math.max(0, Math.min(newTime, ttsAudio.duration));
    return;
  }
  // Browser TTS doesn't support seeking
}

function seekToChunkPosition(pct) {
  var session = _ttsChunkSession;
  // Can't seek until we have a duration estimate from the first chunk
  if (!session || !session.estimatedTotalDuration) return;
  pct = Math.max(0, Math.min(1, pct));
  var targetChunkFloat = pct * session.totalChunks;
  var targetChunk = Math.floor(targetChunkFloat);
  if (targetChunk >= session.totalChunks) targetChunk = session.totalChunks - 1;
  var seekPct = targetChunkFloat - targetChunk;

  // Estimate elapsed time up to target chunk
  var avgChunkDuration = session.estimatedTotalDuration / session.totalChunks;
  session.elapsedTime = targetChunk * avgChunkDuration;

  // Stop current audio and play from target chunk
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.src = '';
    ttsAudio = null;
  }
  ttsPlayNextChunk(targetChunk, seekPct);
}

function ttsSeek(pct) {
  if (_ttsChunkSession) {
    seekToChunkPosition(pct);
    return;
  }
  if (ttsAudio && ttsAudio.duration) {
    ttsAudio.currentTime = pct * ttsAudio.duration;
  }
  // Browser TTS doesn't support seeking
}

function initProgressDrag() {
  var wrap = document.getElementById('audio-progress-wrap');
  if (!wrap) return;

  function seekFromEvent(e) {
    // Don't seek if nothing is playing or generating
    if (!ttsPlaying && ttsCurrentIndex < 0) return;
    var rect = wrap.getBoundingClientRect();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    ttsSeek(pct);
  }

  function onMove(e) { seekFromEvent(e); }
  function onEnd() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
  }

  wrap.addEventListener('mousedown', function(e) {
    e.preventDefault();
    seekFromEvent(e);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  });

  wrap.addEventListener('touchstart', function(e) {
    e.preventDefault();
    seekFromEvent(e);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }, { passive: false });
}

// Initialize drag on the progress bar
initProgressDrag();

let _ttsSpeedPopup = null;

function ttsToggleSpeedSlider() {
  if (_ttsSpeedPopup) { ttsCloseSpeedSlider(); return; }

  var btn = document.getElementById('tts-speed-btn');
  var rect = btn.getBoundingClientRect();
  var count = TTS_SPEEDS.length;

  var popup = document.createElement('div');
  popup.className = 'tts-speed-popup';

  // Build tick labels — show value for major speeds, dot for minor ones
  var majorSpeeds = [0.5, 1.0, 1.5, 2.0];
  var ticksHtml = '';
  for (var i = count - 1; i >= 0; i--) {
    var s = TTS_SPEEDS[i];
    if (majorSpeeds.indexOf(s) >= 0) {
      ticksHtml += '<div class="tts-speed-tick">' + s + 'x</div>';
    } else {
      ticksHtml += '<div class="tts-speed-tick-dot">\u00b7</div>';
    }
  }

  popup.innerHTML =
    '<div class="tts-speed-popup-value" id="tts-speed-popup-val">' + ttsSpeed + 'x</div>' +
    '<div class="tts-speed-track-wrap" id="tts-speed-track-wrap">' +
      '<div class="tts-speed-track" id="tts-speed-track">' +
        '<div class="tts-speed-thumb" id="tts-speed-thumb"></div>' +
      '</div>' +
    '</div>' +
    '<div class="tts-speed-ticks">' + ticksHtml + '</div>';

  document.body.appendChild(popup);

  // Position above the button, centered horizontally
  var popW = popup.offsetWidth;
  var popH = popup.offsetHeight;
  var left = rect.left + rect.width / 2 - popW / 2;
  var top = rect.top - popH - 6;
  // Keep on screen
  if (left < 4) left = 4;
  if (top < 4) { top = rect.bottom + 6; }
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  // Set thumb position for current speed
  ttsPositionThumb();
  _ttsSpeedPopup = popup;

  // Drag handling
  var trackWrap = document.getElementById('tts-speed-track-wrap');

  function onDrag(clientY) {
    var trackRect = trackWrap.getBoundingClientRect();
    var pct = (clientY - trackRect.top) / trackRect.height;
    pct = Math.max(0, Math.min(1, pct));
    // Top = fastest (last index), bottom = slowest (first index)
    var idx = Math.round((1 - pct) * (count - 1));
    idx = Math.max(0, Math.min(count - 1, idx));
    ttsSetSpeed(TTS_SPEEDS[idx]);
    ttsPositionThumb();
  }

  trackWrap.addEventListener('mousedown', function(e) {
    e.preventDefault();
    onDrag(e.clientY);
    function onMove(ev) { onDrag(ev.clientY); }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  trackWrap.addEventListener('touchstart', function(e) {
    e.preventDefault();
    onDrag(e.touches[0].clientY);
    function onTouchMove(ev) { ev.preventDefault(); onDrag(ev.touches[0].clientY); }
    function onTouchEnd() {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }, { passive: false });

  // Close on click outside (delay to avoid catching the opening click)
  setTimeout(function() {
    document.addEventListener('mousedown', ttsSpeedOutsideClick);
    document.addEventListener('touchstart', ttsSpeedOutsideClick);
  }, 0);
}

function ttsSpeedOutsideClick(e) {
  if (_ttsSpeedPopup && !_ttsSpeedPopup.contains(e.target) && e.target.id !== 'tts-speed-btn') {
    ttsCloseSpeedSlider();
  }
}

function ttsCloseSpeedSlider() {
  if (_ttsSpeedPopup) {
    _ttsSpeedPopup.remove();
    _ttsSpeedPopup = null;
  }
  document.removeEventListener('mousedown', ttsSpeedOutsideClick);
  document.removeEventListener('touchstart', ttsSpeedOutsideClick);
}

function ttsPositionThumb() {
  var thumb = document.getElementById('tts-speed-thumb');
  if (!thumb) return;
  var idx = TTS_SPEEDS.indexOf(ttsSpeed);
  if (idx < 0) idx = TTS_SPEEDS.indexOf(1.0);
  // Top = fastest (last index), bottom = slowest (first index)
  var pct = 1 - idx / (TTS_SPEEDS.length - 1);
  thumb.style.top = (pct * 100) + '%';
}

function ttsSetSpeed(speed) {
  ttsSpeed = speed;
  var speedBtn = document.getElementById('tts-speed-btn');
  if (speedBtn) speedBtn.textContent = speed + 'x';
  var popupVal = document.getElementById('tts-speed-popup-val');
  if (popupVal) popupVal.textContent = speed + 'x';
  var miniSpeedBtn = document.getElementById('mini-mode-speed-btn');
  if (miniSpeedBtn) miniSpeedBtn.textContent = speed + 'x';
  // Update article inline speed button
  var anpSpeed = document.querySelector('.article-now-playing .anp-speed');
  if (anpSpeed) anpSpeed.textContent = speed + 'x';

  if (ttsAudio) {
    ttsAudio.playbackRate = speed;
  }
  if (ttsSynthUtterance && window.speechSynthesis.speaking) {
    ttsSynthUtterance.rate = speed;
  }
  saveTTSState();
}

function ttsCycleSpeed() {
  var idx = TTS_SPEEDS.indexOf(ttsSpeed);
  if (idx < 0) idx = TTS_SPEEDS.indexOf(1.0);
  var next = (idx + 1) % TTS_SPEEDS.length;
  ttsSetSpeed(TTS_SPEEDS[next]);
}

function removeTTSQueueItem(index) {
  if (index === ttsCurrentIndex) {
    stopListenLoading();
    stopTTS();
    ttsQueue.splice(index, 1);
    if (ttsQueue.length > 0) {
      ttsCurrentIndex = Math.min(index, ttsQueue.length - 1);
      playTTSItem(ttsCurrentIndex);
    } else {
      ttsCurrentIndex = -1;
    }
  } else {
    ttsQueue.splice(index, 1);
    if (index < ttsCurrentIndex) ttsCurrentIndex--;
  }
  renderAudioPlayer();
}

function ttsClearQueue() {
  stopListenLoading();
  stopTTS();
  ttsQueue = [];
  ttsCurrentIndex = -1;
  localStorage.removeItem('pr-tts-state');
  renderAudioPlayer();
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/** Strip markdown formatting to get clean text for TTS */
function stripMarkdownForTTS(md) {
  let text = md;
  // Remove images
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '');
  // Convert links to just text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Remove header markers
  text = text.replace(/^#{1,6}\s+/gm, '');
  // Remove bold/italic
  text = text.replace(/(\*{1,3}|_{1,3})([^*_]+)\1/g, '$2');
  // Remove strikethrough
  text = text.replace(/~~([^~]+)~~/g, '$1');
  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, '');
  // Remove inline code
  text = text.replace(/`([^`]+)`/g, '$1');
  // Remove blockquote markers
  text = text.replace(/^>\s*/gm, '');
  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');
  // Remove list markers
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  // Collapse whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();
  // Add a sentence-ending period after the title (first line) so TTS engines
  // pause briefly before reading the body
  var firstBreak = text.indexOf('\n\n');
  if (firstBreak > 0) {
    var title = text.slice(0, firstBreak).trimEnd();
    var lastChar = title[title.length - 1];
    if (lastChar !== '.' && lastChar !== '!' && lastChar !== '?') {
      text = title + '.\n\n' + text.slice(firstBreak + 2);
    }
  }
  return text;
}

// ---- TTS Reading Highlight ----
// Highlights the current paragraph in the article as TTS reads aloud.

let _ttsHighlightParaIndex = -1;

function ttsClearHighlight() {
  _ttsHighlightParaIndex = -1;
  document.querySelectorAll('.tts-reading-hl').forEach(function(el) {
    el.classList.remove('tts-reading-hl');
  });
}

function ttsHighlightParagraph(paraIndex) {
  if (paraIndex === _ttsHighlightParaIndex) return;
  _ttsHighlightParaIndex = paraIndex;
  var content = document.getElementById('content');
  if (!content) return;

  // Only highlight if the displayed article is the one being played
  var playingFile = ttsCurrentIndex >= 0 && ttsCurrentIndex < ttsQueue.length
    ? ttsQueue[ttsCurrentIndex].filename : null;
  if (!playingFile || activeFile !== playingFile) return;

  // Remove previous highlight
  content.querySelectorAll('.tts-reading-hl').forEach(function(el) {
    el.classList.remove('tts-reading-hl');
  });
  // Find the Nth paragraph-level element in the article
  var blocks = content.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre');
  if (paraIndex >= 0 && paraIndex < blocks.length) {
    blocks[paraIndex].classList.add('tts-reading-hl');
  }
}

function ttsHighlightAtChar(charIndex, paraOffsets) {
  for (var i = 0; i < paraOffsets.length; i++) {
    if (charIndex >= paraOffsets[i].start && charIndex < paraOffsets[i].end) {
      ttsHighlightParagraph(i);
      return;
    }
  }
}

function ttsHighlightByProgress(progress, paraOffsets) {
  if (!paraOffsets || !paraOffsets.length) return;
  var totalChars = paraOffsets[paraOffsets.length - 1].end;
  var charPos = Math.floor(progress * totalChars);
  ttsHighlightAtChar(charPos, paraOffsets);
}

function showTTSSettings() {
  if (!serverMode) {
    alert('Voice playback settings are only available in server mode.');
    return;
  }

  // Show modal immediately with loading spinner
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML =
    '<div class="modal-card" onclick="event.stopPropagation()" style="max-width:440px">' +
      '<h2>Voice Settings</h2>' +
      '<div style="display:flex;justify-content:center;padding:48px 0">' +
        '<div class="tts-settings-spinner"></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  fetch('/api/tts-settings').then(function(r) { return r.json(); }).then(function(data) {
    var card = overlay.querySelector('.modal-card');
    if (!card) return;

    var providers = [
      { id: 'kokoro', label: 'Kokoro — natural voice, free & private' },
      { id: 'browser', label: 'Built-in Voice (Apple) — free' },
      { id: 'openai', label: 'OpenAI — premium quality' },
      { id: 'elevenlabs', label: 'ElevenLabs — premium quality' },
    ];

    // Store data on overlay so module-scope render helpers can access it
    overlay._ttsData = data;

    var isCloud = data.provider === 'openai' || data.provider === 'elevenlabs';
    var kokoroInstalled = data.kokoro && data.kokoro.installed;

    card.innerHTML =
      '<h2>Voice Settings</h2>' +
      '<div style="margin:12px 0">' +
        '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Provider</label>' +
        '<select id="tts-provider-select" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px" onchange="ttsSettingsProviderChanged()">' +
          providers.map(function(p) { return '<option value="' + p.id + '"' + (data.provider === p.id ? ' selected' : '') + '>' + p.label + '</option>'; }).join('') +
        '</select>' +
      '</div>' +
      '<div id="tts-kokoro-settings" style="display:' + (data.provider === 'kokoro' ? 'block' : 'none') + '">' +
        '<div style="background:var(--code-bg);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin:10px 0;font-size:12px;line-height:1.6">' +
          '<strong style="color:var(--fg)">Kokoro — natural-sounding voice, completely free</strong><br>' +
          '<span style="color:var(--muted)">Runs entirely on your Mac using the Kokoro voice engine — your articles stay private and never leave your machine.</span><br>' +
          '<span style="color:var(--muted)">Sets itself up automatically the first time you listen (~86MB download).</span>' +
          '<div id="kokoro-status" style="margin-top:6px">' +
            (kokoroInstalled
              ? '<span style="color:#22c55e">&#10003; Ready to go</span>'
              : '<span style="color:var(--muted)">Will set up automatically on first listen</span>') +
          '</div>' +
        '</div>' +
        '<div style="margin:12px 0">' +
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Voice</label>' +
          '<select id="tts-kokoro-voice" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px">' +
            renderVoiceOptions('kokoro') +
          '</select>' +
        '</div>' +
        '<div style="margin:12px 0" id="tts-kokoro-quality">' +
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Quality</label>' +
          ((data.model === 'kokoro-v1-q4')
            ? '<div style="font-size:12px;color:#22c55e">&#10003; High quality</div>'
            : '<div style="font-size:12px;color:var(--fg)">Standard quality'
              + '<br><button onclick="ttsUpgradeKokoroQuality()" style="margin-top:6px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--link);font-size:12px;cursor:pointer;font-family:inherit">Upgrade to high quality</button>'
              + '<span style="color:var(--muted);font-size:11px;margin-left:6px">Free &middot; 305MB download</span></div>'
          ) +
          '<input type="hidden" id="tts-kokoro-model" value="' + escapeHtml(data.model || 'kokoro-v1-q8') + '">' +
        '</div>' +
      '</div>' +
      '<div id="tts-cost-info" style="display:' + (isCloud ? 'block' : 'none') + '">' +
        '<div id="tts-cost-estimate" style="background:var(--code-bg);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin:10px 0;font-size:12px;line-height:1.5">' +
          ttsGetCostHtml(data.provider, data.model) +
        '</div>' +
      '</div>' +
      '<div id="tts-cloud-settings" style="display:' + (isCloud ? 'block' : 'none') + '">' +
        '<div style="margin:12px 0">' +
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">API Key</label>' +
          '<input type="password" id="tts-api-key" placeholder="' + (data.hasKey && isCloud ? '••••••••••••••••' : 'Paste your key here') + '" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px" />' +
          (data.hasKey && isCloud
            ? '<div style="font-size:11px;color:#22c55e;margin-top:3px">&#10003; API key saved. Leave blank to keep current key.</div>'
            : '<div style="font-size:11px;color:var(--muted);margin-top:3px">You can get a key from your provider\'s website. This key is only used for reading articles aloud.</div>') +
        '</div>' +
        '<div style="margin:12px 0" id="tts-voice-row">' +
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Voice</label>' +
          '<select id="tts-voice-select" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px" onchange="ttsSettingsModelChanged()">' +
            renderVoiceOptions(data.provider) +
          '</select>' +
        '</div>' +
        '<div style="margin:12px 0" id="tts-model-row">' +
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Model</label>' +
          '<select id="tts-model-select" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px" onchange="ttsSettingsModelChanged()">' +
            renderModelOptions(data.provider) +
          '</select>' +
        '</div>' +
        '<div style="margin:14px 0;padding:10px 12px;background:var(--code-bg);border:1px solid var(--border);border-radius:6px">' +
          '<label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;cursor:pointer;line-height:1.5">' +
            '<input type="checkbox" id="tts-consent" style="margin-top:3px;width:16px;height:16px;accent-color:var(--link);flex-shrink:0" />' +
            '<span>Articles will be sent to this provider to create audio. Your API key will be charged a small amount per article — audio is saved locally so you only pay once per article.</span>' +
          '</label>' +
        '</div>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>' +
        '<button class="btn-primary" onclick="saveTTSSettings()" id="tts-save-btn">Save</button>' +
      '</div>';
  }).catch(function() {
    overlay.remove();
    alert('Could not load voice playback settings.');
  });
}

var _KOKORO_GROUPS = { af: 'American Female', am: 'American Male', bf: 'British Female', bm: 'British Male' };

function renderKokoroVoiceOptions(voices, sel) {
  var groups = {};
  var order = [];
  for (var i = 0; i < voices.length; i++) {
    var prefix = voices[i].id.substring(0, 2);
    if (!groups[prefix]) { groups[prefix] = []; order.push(prefix); }
    groups[prefix].push(voices[i]);
  }
  var html = '';
  for (var g = 0; g < order.length; g++) {
    var key = order[g];
    html += '<optgroup label="' + (_KOKORO_GROUPS[key] || key) + '">';
    for (var j = 0; j < groups[key].length; j++) {
      var v = groups[key][j];
      html += '<option value="' + v.id + '"' + (sel === v.id ? ' selected' : '') + '>' + escapeHtml(v.label) + '</option>';
    }
    html += '</optgroup>';
  }
  return html;
}

function renderVoiceOptions(provider, selectedVoice) {
  var overlay = document.querySelector('.modal-overlay');
  var data = overlay && overlay._ttsData;
  if (!data || !data.voices[provider]) return '';
  var sel = selectedVoice || data.voice;
  var voices = data.voices[provider];
  if (provider === 'kokoro') return renderKokoroVoiceOptions(voices, sel);
  return voices.map(function(v) {
    return '<option value="' + v.id + '"' + (sel === v.id ? ' selected' : '') + '>' + escapeHtml(v.label) + '</option>';
  }).join('');
}

function renderModelOptions(provider) {
  var overlay = document.querySelector('.modal-overlay');
  var data = overlay && overlay._ttsData;
  if (!data || !data.models[provider]) return '';
  return data.models[provider].map(function(m) {
    return '<option value="' + m.id + '"' + (data.model === m.id ? ' selected' : '') + '>' + escapeHtml(m.label) + '</option>';
  }).join('');
}

// Cost estimates per model ($ per 1K characters, based on a ~2000-word / 10K char article)
const TTS_COST_PER_1K = {
  'tts-1': 0.015,
  'tts-1-hd': 0.030,
  'gpt-4o-mini-tts': 0.015,
  'eleven_multilingual_v2': 0.24,
  'eleven_turbo_v2_5': 0.12,
  'eleven_flash_v2_5': 0.12,
};
const TTS_AVG_ARTICLE_CHARS = 10000; // ~2000 words

function ttsGetCostHtml(provider, model) {
  if (provider === 'browser') return '';
  const perK = TTS_COST_PER_1K[model];
  if (!perK) return '<span style="color:var(--muted)">Cost depends on model — typically a few cents per article.</span>';
  const perArticle = (perK * TTS_AVG_ARTICLE_CHARS / 1000);
  let html = '<strong style="color:var(--fg)">What it costs</strong><br>';
  if (perArticle < 0.05) {
    html += '<span style="color:var(--muted)">Just a few cents per article — most people spend less than a dollar a week.</span>';
  } else {
    html += '<span style="color:var(--muted)">About $' + perArticle.toFixed(2) + ' per article.</span>';
  }
  html += '<br><span style="font-size:11px;color:var(--muted)">Audio is saved on your Mac so you only pay once per article, even if you listen again.</span>';
  return html;
}

function ttsSettingsModelChanged() {
  const provider = document.getElementById('tts-provider-select').value;
  const model = document.getElementById('tts-model-select').value;
  const costEl = document.getElementById('tts-cost-estimate');
  if (costEl) costEl.innerHTML = ttsGetCostHtml(provider, model);
}

function ttsSettingsProviderChanged() {
  const provider = document.getElementById('tts-provider-select').value;
  const cloudSettings = document.getElementById('tts-cloud-settings');
  const costInfo = document.getElementById('tts-cost-info');
  const kokoroSettings = document.getElementById('tts-kokoro-settings');
  const isCloud = provider === 'openai' || provider === 'elevenlabs';
  cloudSettings.style.display = isCloud ? 'block' : 'none';
  costInfo.style.display = isCloud ? 'block' : 'none';
  if (kokoroSettings) kokoroSettings.style.display = provider === 'kokoro' ? 'block' : 'none';

  // Reset consent checkbox when changing providers
  const consent = document.getElementById('tts-consent');
  if (consent) consent.checked = false;

  const overlay = document.querySelector('.modal-overlay');
  const data = overlay?._ttsData;
  if (!data) return;

  // Update voice options
  const voiceSelect = document.getElementById('tts-voice-select');
  if (data.voices[provider]) {
    voiceSelect.innerHTML = renderVoiceOptions(provider, '');
  } else {
    voiceSelect.innerHTML = '';
  }
  // Also update Kokoro voice dropdown
  const kokoroVoice = document.getElementById('tts-kokoro-voice');
  if (kokoroVoice && data.voices.kokoro) {
    kokoroVoice.innerHTML = renderVoiceOptions('kokoro', '');
  }

  // Update model options
  const modelSelect = document.getElementById('tts-model-select');
  if (data.models[provider]) {
    modelSelect.innerHTML = data.models[provider].map(m =>
      '<option value="' + m.id + '">' + escapeHtml(m.label) + '</option>'
    ).join('');
  } else {
    modelSelect.innerHTML = '';
  }

  // Update cost estimate
  const model = modelSelect.value;
  const costEl = document.getElementById('tts-cost-estimate');
  if (costEl) costEl.innerHTML = ttsGetCostHtml(provider, model);
}

function ttsUpgradeKokoroQuality() {
  var hidden = document.getElementById('tts-kokoro-model');
  if (hidden) hidden.value = 'kokoro-v1-q4';
  var container = document.getElementById('tts-kokoro-quality');
  if (container) {
    var label = container.querySelector('label');
    container.innerHTML = '';
    if (label) container.appendChild(label);
    container.insertAdjacentHTML('beforeend',
      '<div style="font-size:12px;color:#22c55e">&#10003; High quality — will download on next listen</div>'
      + '<input type="hidden" id="tts-kokoro-model" value="kokoro-v1-q4">');
  }
}

function saveTTSSettings() {
  const provider = document.getElementById('tts-provider-select').value;
  const config = { provider };

  if (provider === 'kokoro') {
    config.voice = document.getElementById('tts-kokoro-voice').value;
    config.model = document.getElementById('tts-kokoro-model').value;
  } else if (provider !== 'browser') {
    const consent = document.getElementById('tts-consent');
    if (!consent || !consent.checked) {
      // Briefly highlight the consent checkbox
      const label = consent?.closest('label');
      if (label) {
        label.style.outline = '2px solid #ef4444';
        label.style.outlineOffset = '2px';
        setTimeout(() => { label.style.outline = ''; label.style.outlineOffset = ''; }, 2000);
      }
      return;
    }
    const apiKeyInput = document.getElementById('tts-api-key').value;
    if (apiKeyInput) {
      config.apiKey = apiKeyInput;
    } else {
      // Preserve existing key on server
      config.preserveKey = true;
    }
    config.voice = document.getElementById('tts-voice-select').value;
    config.model = document.getElementById('tts-model-select').value;
    // If no key entered and no existing key, require one
    const overlay = document.querySelector('.modal-overlay');
    const hasExistingKey = overlay?._ttsData?.hasKey;
    if (!apiKeyInput && !hasExistingKey) {
      alert('Please enter an API key for TTS.');
      return;
    }
  }

  // Close modal immediately for responsive feel
  var settingsOverlay = document.querySelector('.modal-overlay');
  if (settingsOverlay) settingsOverlay.remove();

  var wasPlaying = ttsPlaying && ttsCurrentIndex >= 0 && ttsCurrentIndex < ttsQueue.length;
  var resumeIdx = ttsCurrentIndex;

  fetch('/api/tts-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }).then(function(r) {
    if (r.ok) {
      ttsProvider = provider;
      // Stop current audio but keep the queue
      _ttsChunkSession = null;
      if (ttsAudio) {
        ttsAudio.pause();
        ttsAudio.src = '';
        ttsAudio = null;
      }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      ttsPlaying = false;
      renderAudioPlayer();
      // Restart current article with the new voice
      if (wasPlaying) {
        startListenLoading();
        playTTSItem(resumeIdx);
      }
    } else {
      alert('Failed to save voice playback settings.');
    }
  });
}

// ---- Playback State Persistence ----
function saveTTSState() {
  try {
    // Save position on the current queue item so it persists with the queue
    if (ttsAudio && ttsAudio.duration && ttsCurrentIndex >= 0 && ttsCurrentIndex < ttsQueue.length) {
      ttsQueue[ttsCurrentIndex].savedTime = ttsAudio.currentTime;
      ttsQueue[ttsCurrentIndex].savedDuration = ttsAudio.duration;
    }
    var state = {
      queue: ttsQueue,
      currentIndex: ttsCurrentIndex,
      speed: ttsSpeed,
      timestamp: Date.now(),
    };
    if (ttsAudio && ttsAudio.duration) {
      state.currentTime = ttsAudio.currentTime;
      state.duration = ttsAudio.duration;
    }
    localStorage.setItem('pr-tts-state', JSON.stringify(state));
  } catch(e) {}
}

function restoreTTSState() {
  try {
    var raw = localStorage.getItem('pr-tts-state');
    if (!raw) return;
    var state = JSON.parse(raw);
    // Only restore if saved within last 24 hours
    if (!state || !state.queue || !state.queue.length) return;
    if (Date.now() - state.timestamp > 24 * 60 * 60 * 1000) {
      localStorage.removeItem('pr-tts-state');
      return;
    }
    ttsQueue = state.queue;
    ttsCurrentIndex = state.currentIndex;
    if (state.speed) ttsSpeed = state.speed;
    // Don't auto-play — just show the queue and position
    ttsPlaying = false;
    renderAudioPlayer();
    var speedBtn = document.getElementById('tts-speed-btn');
    if (speedBtn) speedBtn.textContent = ttsSpeed + 'x';
    // Show saved playback position in the progress bar
    if (state.currentTime && state.duration && state.duration > 0) {
      var pct = Math.min(100, (state.currentTime / state.duration) * 100);
      var bar = document.getElementById('tts-progress');
      var timeEl = document.getElementById('tts-time-current');
      var totalEl = document.getElementById('tts-time-total');
      if (bar) bar.style.width = pct + '%';
      if (timeEl) timeEl.textContent = formatTime(state.currentTime);
      if (totalEl) totalEl.textContent = formatTime(state.duration);
    }
  } catch(e) {}
}

// Save state when the page is closing so progress isn't lost
window.addEventListener('beforeunload', function() {
  if (ttsQueue.length > 0) saveTTSState();
});

// Restore on load (called externally after DOM is ready)
if (typeof _ttsStateRestored === 'undefined') {
  var _ttsStateRestored = true;
  setTimeout(restoreTTSState, 500);
}

// ---- Mini Mode ----

var _miniModeSyncTimer = null;
function startMiniModeSync() {
  if (_miniModeSyncTimer) return;
  _miniModeSyncTimer = setInterval(function() {
    if (!miniMode) { stopMiniModeSync(); return; }
    var fill = document.getElementById('mini-mode-progress-fill');
    var cur = document.getElementById('mini-mode-time-current');
    var tot = document.getElementById('mini-mode-time-total');
    var mainFill = document.getElementById('tts-progress');
    var mainCur = document.getElementById('tts-time-current');
    var mainTot = document.getElementById('tts-time-total');
    if (fill && mainFill) fill.style.width = mainFill.style.width;
    if (cur && mainCur) cur.textContent = mainCur.textContent;
    if (tot && mainTot) tot.textContent = mainTot.textContent;
  }, 250);
}
function stopMiniModeSync() {
  if (_miniModeSyncTimer) { clearInterval(_miniModeSyncTimer); _miniModeSyncTimer = null; }
}

function toggleMiniMode() {
  miniMode = !miniMode;
  document.body.classList.toggle('mini-mode', miniMode);
  var container = document.getElementById('mini-mode-container');
  if (container) container.style.display = miniMode ? '' : 'none';
  if (miniMode) {
    renderMiniMode();
    initMiniModeProgressDrag();
    startMiniModeSync();
  } else {
    stopMiniModeSync();
  }
  localStorage.setItem('pr-mini-mode', miniMode ? '1' : '0');
}

function renderMiniMode() {
  var container = document.getElementById('mini-mode-container');
  if (!container || !miniMode) return;

  var titleEl = document.getElementById('mini-mode-title');
  var statusEl = document.getElementById('mini-mode-status');
  var playBtn = document.getElementById('mini-mode-play-btn');
  var speedBtn = document.getElementById('mini-mode-speed-btn');
  var queueEl = document.getElementById('mini-mode-queue');

  if (ttsCurrentIndex >= 0 && ttsCurrentIndex < ttsQueue.length) {
    titleEl.textContent = ttsQueue[ttsCurrentIndex].title;
  } else {
    titleEl.textContent = 'No article playing';
  }

  if (ttsGenerating) {
    statusEl.textContent = 'Generating...';
  } else if (ttsPlaying) {
    statusEl.textContent = 'Playing';
  } else if (ttsCurrentIndex >= 0) {
    statusEl.textContent = 'Paused';
  } else {
    statusEl.textContent = '';
  }

  playBtn.innerHTML = ttsPlaying
    ? '<svg><use href="#i-pause"/></svg>'
    : '<svg><use href="#i-play"/></svg>';

  speedBtn.textContent = ttsSpeed + 'x';

  // Sync progress from main player
  var mainProgress = document.getElementById('tts-progress');
  var mainCurrent = document.getElementById('tts-time-current');
  var mainTotal = document.getElementById('tts-time-total');
  if (mainProgress) document.getElementById('mini-mode-progress-fill').style.width = mainProgress.style.width;
  if (mainCurrent) document.getElementById('mini-mode-time-current').textContent = mainCurrent.textContent;
  if (mainTotal) document.getElementById('mini-mode-time-total').textContent = mainTotal.textContent;

  // Render queue
  if (ttsQueue.length > 1) {
    queueEl.innerHTML = ttsQueue.map(function(item, i) {
      return '<div class="mini-mode-queue-item' + (i === ttsCurrentIndex ? ' playing' : '') + '" onclick="playTTSItem(' + i + ')">'
        + '<span style="font-size:10px;color:var(--muted);width:14px;text-align:center">' + (i === ttsCurrentIndex ? '&#9654;' : (i + 1)) + '</span>'
        + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(item.title) + '</span>'
        + '</div>';
    }).join('');
  } else {
    queueEl.innerHTML = '';
  }

  // Auto-exit mini mode when queue empties
  if (ttsQueue.length === 0) {
    miniMode = false;
    document.body.classList.remove('mini-mode');
    container.style.display = 'none';
    localStorage.setItem('pr-mini-mode', '0');
  }
}

var _miniModeProgressDragInit = false;
function initMiniModeProgressDrag() {
  if (_miniModeProgressDragInit) return;
  _miniModeProgressDragInit = true;

  var wrap = document.getElementById('mini-mode-progress-wrap');
  if (!wrap) return;

  function seekFromEvent(e) {
    if (!ttsPlaying && ttsCurrentIndex < 0) return;
    var rect = wrap.getBoundingClientRect();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    ttsSeek(pct);
  }

  function onMove(e) { seekFromEvent(e); }
  function onEnd() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
  }

  wrap.addEventListener('mousedown', function(e) {
    e.preventDefault();
    seekFromEvent(e);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  });

  wrap.addEventListener('touchstart', function(e) {
    e.preventDefault();
    seekFromEvent(e);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }, { passive: false });
}

