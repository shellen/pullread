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
var _browserTTSState = null;  // { text, estimatedSeconds, startTime, seekOffset, voice, lang }
// Migrate old boolean to tri-state; 'off' | 'podcasts' | 'everything'
var autoplayMode = localStorage.getItem('pr-autoplay-mode') || (localStorage.getItem('pr-podcast-autoplay') === '1' ? 'podcasts' : 'off');

const TTS_SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0, 1.1, 1.15, 1.2, 1.3, 1.5, 1.75, 2.0];

/** Deterministic hash of a string to an index in [0, max). djb2 algorithm. */
function hashStringToIndex(str, max) {
  var hash = 5381;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % max;
}

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
  var newItem = { filename: filename, title: file.title, image: file.image || '', domain: file.domain || '' };
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

  var item = { filename, title: file.title, image: file.image || '', domain: file.domain || '' };
  if (file.enclosureUrl && file.enclosureType && file.enclosureType.startsWith('audio/')) {
    item.enclosureUrl = file.enclosureUrl;
  }
  ttsQueue.push(item);
  renderAudioPlayer();
  // Auto-play if nothing is currently playing
  if (!ttsPlaying && !ttsGenerating) playTTSItem(ttsQueue.length - 1);
}

function renderAudioPlayer() {
  var player = document.querySelector('pr-player');
  if (player) {
    player.update({
      queue: ttsQueue,
      currentIndex: ttsCurrentIndex,
      playing: ttsPlaying,
      generating: ttsGenerating,
      speed: ttsSpeed,
    });
  }
  updateListenButtonState();
  updateSidebarAudioIndicators();
  updateArticleNowPlaying();
  saveTTSState();
}

/** Navigate to the currently playing article */
function bottomBarGoToArticle() {
  var fn = ttsCurrentIndex >= 0 && ttsCurrentIndex < ttsQueue.length
    ? ttsQueue[ttsCurrentIndex].filename : null;
  if (!fn) return;
  var idx = displayFiles.findIndex(function(f) { return f.filename === fn; });
  if (idx >= 0) {
    loadFile(idx);
    return;
  }
  // Article not in current filtered view — clear search and switch to articles tab
  var input = document.getElementById('search');
  if (input && input.value) { input.value = ''; filterFiles(); }
  var articlesTab = document.querySelector('.sidebar-tab[data-tab="articles"]');
  if (articlesTab) articlesTab.click();
  idx = displayFiles.findIndex(function(f) { return f.filename === fn; });
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

  playCueSound();
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
    await playBrowserTTS(item.filename, item.domain);
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

async function playBrowserTTS(filename, domain) {
  const synth = window.speechSynthesis;
  if (!synth) {
    showToast('Speech synthesis not available in this browser.');
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

  // Detach old utterance handlers before cancel to prevent stale onend/onerror
  if (ttsSynthUtterance) {
    ttsSynthUtterance.onend = null;
    ttsSynthUtterance.onerror = null;
  }
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(plainText);
  utterance.rate = ttsSpeed;
  // Use article's language if available (from html lang attribute extracted during content fetch),
  // fall back to browser locale
  var articleLang = document.querySelector('.content-wrap')?.getAttribute('lang');
  utterance.lang = articleLang || navigator.language || 'en-US';
  var savedVoice = localStorage.getItem('pr-tts-browser-voice') || '';
  var browserType = localStorage.getItem('pr-tts-browser-type') || 'google';
  var sysVoices = synth.getVoices();

  // Filter to platform type
  var platformVoices = sysVoices.filter(function(v) {
    return browserType === 'google' ? v.name.indexOf('Google') === 0 : v.name.indexOf('Google') !== 0;
  });

  // Try saved voice first
  var match = savedVoice ? platformVoices.find(function(v) { return v.name === savedVoice; }) : null;

  // If saved voice doesn't match article language, find a better one
  var langPrefix = (articleLang || '').split('-')[0];
  if (match && langPrefix && langPrefix !== 'en') {
    var langMatch = platformVoices.find(function(v) { return v.lang.indexOf(langPrefix) === 0; });
    if (langMatch) match = langMatch;
  }

  // If no saved voice, pick first voice matching article language
  if (!match && langPrefix) {
    match = platformVoices.find(function(v) { return v.lang.indexOf(langPrefix) === 0; });
  }

  // Final fallback: first platform voice, then any voice
  if (!match && platformVoices.length > 0) match = platformVoices[0];
  if (!match && sysVoices.length > 0) match = sysVoices[0];

  // Randomize voice per source domain if enabled
  var randomize = localStorage.getItem('pr-tts-randomize-voices') === '1';
  var isEnglish = !langPrefix || langPrefix === 'en';
  if (randomize && isEnglish && domain) {
    // Prefer Premium/Enhanced voices for higher quality
    var qualityVoices = platformVoices.filter(function(v) {
      return v.lang.indexOf('en') === 0 &&
        (v.name.indexOf('(Premium)') !== -1 || v.name.indexOf('(Enhanced)') !== -1);
    });
    if (qualityVoices.length === 0) {
      qualityVoices = platformVoices.filter(function(v) { return v.lang.indexOf('en') === 0; });
    }
    if (qualityVoices.length > 0) {
      match = qualityVoices[hashStringToIndex(domain, qualityVoices.length)];
    }
  }

  if (match) utterance.voice = match;

  // Estimate total duration (browser TTS doesn't give real progress)
  const estimatedWords = plainText.split(/\s+/).length;
  const estimatedSeconds = estimatedWords / (180 * ttsSpeed); // ~180 wpm base

  _browserTTSState = {
    text: plainText,
    estimatedSeconds: estimatedSeconds,
    startTime: null,
    seekOffset: 0,
    voice: match,
    lang: utterance.lang,
  };

  _startBrowserUtterance(plainText, 0);
}

function _startBrowserProgressTimer() {
  clearInterval(ttsProgressTimer);
  ttsProgressTimer = setInterval(function() {
    var state = _browserTTSState;
    if (!state || !state.startTime) return;
    var player = document.querySelector('pr-player');
    if (player && player._dragging) return;

    var elapsed = (Date.now() - state.startTime) / 1000;
    var overallPct, totalEst;

    if (state.lastBoundaryPct > 0) {
      overallPct = (state.seekOffset + state.lastBoundaryPct * (1 - state.seekOffset)) * 100;
      totalEst = elapsed / state.lastBoundaryPct;
      // Blend with WPM estimate until enough boundary data accumulates
      if (state.lastBoundaryPct < 0.05) {
        totalEst = state.estimatedSeconds;
      }
    } else {
      var baseTime = state.seekOffset * state.estimatedSeconds;
      overallPct = Math.min(100, ((baseTime + elapsed) / state.estimatedSeconds) * 100);
      totalEst = state.estimatedSeconds;
    }

    var currentTime = state.seekOffset * totalEst + elapsed;
    document.getElementById('tts-progress').style.width = Math.min(100, overallPct) + '%';
    document.getElementById('tts-time-current').textContent = formatTime(currentTime);
    document.getElementById('tts-time-total').textContent = formatTime(totalEst);
  }, 200);
}

function _startBrowserUtterance(text, seekOffset) {
  var synth = window.speechSynthesis;
  var state = _browserTTSState;
  if (!state) return;

  clearInterval(ttsProgressTimer);
  // Detach old utterance handlers before cancel to prevent stale onend/onerror
  if (ttsSynthUtterance) {
    ttsSynthUtterance.onend = null;
    ttsSynthUtterance.onerror = null;
  }
  synth.cancel();

  var utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = ttsSpeed;
  utterance.lang = state.lang;
  if (state.voice) utterance.voice = state.voice;
  ttsSynthUtterance = utterance;
  state.seekOffset = seekOffset;

  utterance.onstart = function() {
    clearTimeout(state._watchdog);
    stopListenLoading();
    ttsPlaying = true;
    state.startTime = Date.now();
    renderAudioPlayer();
    document.getElementById('tts-time-total').textContent = '~' + formatTime(state.estimatedSeconds);
    _startBrowserProgressTimer();
  };

  state.lastBoundaryPct = 0;
  state.currentTextLen = text.length;
  utterance.onboundary = function(e) {
    if (e.name === 'word') {
      state.lastBoundaryPct = e.charIndex / state.currentTextLen;
    }
  };

  utterance.onend = function() {
    clearTimeout(state._watchdog);
    clearInterval(ttsProgressTimer);
    ttsPlaying = false;
    ttsSynthUtterance = null;
    _browserTTSState = null;
    document.getElementById('tts-progress').style.width = '100%';
    renderAudioPlayer();
    if (ttsCurrentIndex + 1 < ttsQueue.length) {
      setTimeout(function() { playTTSItem(ttsCurrentIndex + 1); }, 500);
    } else {
      autoplayNext(ttsQueue[ttsCurrentIndex] ? ttsQueue[ttsCurrentIndex].filename : '');
    }
  };

  utterance.onerror = function() {
    clearTimeout(state._watchdog);
    clearInterval(ttsProgressTimer);
    ttsPlaying = false;
    ttsSynthUtterance = null;
    _browserTTSState = null;
    renderAudioPlayer();
  };

  synth.speak(utterance);

  // Watchdog: retry if onstart never fires (browser speech can silently fail)
  state._watchdog = setTimeout(function() {
    if (state === _browserTTSState && !state.startTime) {
      synth.cancel();
      synth.speak(utterance);
    }
  }, 2000);
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
        console.warn('Server TTS unavailable, falling back to browser TTS:', err.error);
        var fallbackItem = ttsQueue[ttsCurrentIndex];
        await playBrowserTTS(filename, fallbackItem ? fallbackItem.domain : '');
        return;
      }
      stopListenLoading();
      showToast('TTS Error: ' + (err.error || 'Unknown error'));
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
      chunkDurations: [],
    };

    ttsPlaying = true;
    renderAudioPlayer();
    ttsPlayNextChunk(0);
  } catch (err) {
    ttsGenerating = false;
    ttsPlaying = false;
    _ttsChunkSession = null;
    renderAudioPlayer();
    showToast('TTS Error: ' + err.message);
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
      stopListenLoading();
      if (!ttsPlaying) {
        audio.pause();
        return;
      }
      renderAudioPlayer();
      // Cached playback — pre-generate next queue item
      ttsPrefetchNextQueueItem();
    });

    audio.addEventListener('timeupdate', function() {
      if (!audio.duration) return;
      var player = document.querySelector('pr-player');
      if (player && player._dragging) return;
      var pct = Math.min(100, (audio.currentTime / audio.duration) * 100);
      document.getElementById('tts-progress').style.width = pct + '%';
      document.getElementById('tts-time-current').textContent = formatTime(audio.currentTime);
    });

    audio.addEventListener('ended', function() {
      if (ttsAudio !== audio) return;
      document.getElementById('tts-progress').style.width = '100%';
      ttsPlaying = false;
      _ttsNextPrefetch = null;
      renderAudioPlayer();
      if (ttsCurrentIndex + 1 < ttsQueue.length) {
        setTimeout(function() { playTTSItem(ttsCurrentIndex + 1); }, 500);
      } else {
        autoplayNext(ttsQueue[ttsCurrentIndex] ? ttsQueue[ttsCurrentIndex].filename : '');
      }
    });

    audio.addEventListener('error', function() {
      if (ttsAudio !== audio) return;
      stopListenLoading();
      ttsPlaying = false;
      renderAudioPlayer();
      showToast('Could not load cached audio');
    });

    ttsAudio = audio;
    ttsPlaying = true;
    audio.play();
    renderAudioPlayer();
  } catch (err) {
    ttsPlaying = false;
    renderAudioPlayer();
    showToast('TTS Error: ' + err.message);
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
      if (ttsAudio !== audio) return;
      stopListenLoading();
      if (!ttsPlaying) {
        audio.pause();
        return;
      }
      renderAudioPlayer();
    });

    var _lastProgressSave = 0;
    audio.addEventListener('timeupdate', function() {
      if (ttsAudio !== audio) return;
      if (!audio.duration) return;
      var player = document.querySelector('pr-player');
      if (player && player._dragging) return;
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
      if (ttsAudio !== audio) return;
      document.getElementById('tts-progress').style.width = '100%';
      ttsPlaying = false;
      renderAudioPlayer();
      if (ttsCurrentIndex + 1 < ttsQueue.length) {
        setTimeout(function() { playTTSItem(ttsCurrentIndex + 1); }, 500);
      } else {
        autoplayNext(item.filename);
      }
    });

    audio.addEventListener('error', function() {
      if (ttsAudio !== audio) return;
      stopListenLoading();
      ttsPlaying = false;
      renderAudioPlayer();
      showToast('Could not load podcast audio');
    });

    ttsAudio = audio;
    ttsPlaying = true;
    audio.play();
    renderAudioPlayer();
  } catch (err) {
    ttsPlaying = false;
    renderAudioPlayer();
    showToast('Podcast error: ' + err.message);
  }
}

/** Auto-play the next item based on autoplayMode setting */
function autoplayNext(currentFilename) {
  if (autoplayMode === 'off') return;
  var candidates;
  if (autoplayMode === 'podcasts') {
    candidates = allFiles.filter(function(f) {
      return f.enclosureUrl && f.enclosureType && f.enclosureType.startsWith('audio/');
    });
  } else {
    candidates = allFiles;
  }
  var currentIdx = candidates.findIndex(function(f) { return f.filename === currentFilename; });
  var next = currentIdx >= 0 && currentIdx + 1 < candidates.length ? candidates[currentIdx + 1] : null;
  if (!next) return;
  setTimeout(function() { addToTTSQueue(next.filename); }, 500);
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

/** Pre-fetch several upcoming chunks while paused so resume has no lag */
function ttsPrefetchAhead() {
  var session = _ttsChunkSession;
  if (!session) {
    // Not chunked playback — try pre-generating next queue item instead
    ttsPrefetchNextQueueItem();
    return;
  }
  var start = session.currentChunk + 1;
  var end = Math.min(session.totalChunks, start + 5);
  for (var i = start; i < end; i++) {
    ttsPrefetchChunk(i);
  }
  // If all remaining chunks are covered, also pre-generate next queue item
  if (end >= session.totalChunks) ttsPrefetchNextQueueItem();
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
    } else {
      autoplayNext(ttsQueue[ttsCurrentIndex] ? ttsQueue[ttsCurrentIndex].filename : '');
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

      // Refine total duration estimate using actual chunk durations
      if (!seekPct) {
        if (session.chunkDurations.length > 0) {
          var actualAvg = session.elapsedTime / session.chunkDurations.length;
          var remaining = session.totalChunks - session.chunkDurations.length;
          session.estimatedTotalDuration = session.elapsedTime + (actualAvg * remaining);
        } else {
          session.estimatedTotalDuration = chunkDuration * session.totalChunks;
        }
        document.getElementById('tts-time-total').textContent = '~' + formatTime(session.estimatedTotalDuration);
      }

      // Seek within chunk if a seek percentage was given
      if (seekPct && seekPct > 0 && chunkDuration) {
        audio.currentTime = seekPct * chunkDuration;
      }
    });

    audio.addEventListener('playing', function() {
      if (session !== _ttsChunkSession) return;
      stopListenLoading();
      // If user paused while we were buffering, pause immediately
      if (!ttsPlaying) {
        audio.pause();
        return;
      }
      renderAudioPlayer();

      // Pre-fetch next chunk while this one plays
      if (index + 1 < session.totalChunks) {
        ttsPrefetchChunk(index + 1);
      } else {
        // Last chunk playing — pre-generate next queue item
        ttsPrefetchNextQueueItem();
      }
    });

    audio.addEventListener('timeupdate', function() {
      if (session !== _ttsChunkSession) return;
      var player = document.querySelector('pr-player');
      if (player && player._dragging) return;
      var chunkDuration = audio.duration || 1;
      var chunkProgress = Math.min(1, audio.currentTime / chunkDuration);
      var overallPct = ((index + chunkProgress) / session.totalChunks) * 100;
      document.getElementById('tts-progress').style.width = overallPct + '%';
      var currentTime = session.elapsedTime + audio.currentTime;
      document.getElementById('tts-time-current').textContent = formatTime(currentTime);
    });

    audio.addEventListener('ended', function() {
      if (session !== _ttsChunkSession) return;
      session.chunkDurations.push(audio.duration || 0);
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

    // Assign before play so pause always targets the current element
    ttsAudio = audio;

    // If user paused during chunk transition, don't start the new chunk
    if (!ttsPlaying && session.currentChunk > 0) {
      renderAudioPlayer();
      return;
    }

    ttsPlaying = true;
    audio.play();
    renderAudioPlayer();
  } catch (err) {
    stopListenLoading();
    ttsPlaying = false;
    _ttsChunkSession = null;
    _ttsChunkBuffer.clear();
    renderAudioPlayer();
    showToast('TTS Error: ' + err.message);
  }
}

function stopTTS() {
  clearInterval(ttsProgressTimer);
  _ttsChunkSession = null;
  _ttsChunkBuffer.clear();
  _ttsNextPrefetch = null;
  _browserTTSState = null;
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.src = '';
    ttsAudio = null;
  }
  if (ttsSynthUtterance) {
    ttsSynthUtterance.onend = null;
    ttsSynthUtterance.onerror = null;
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
      if (_browserTTSState) _browserTTSState.pausedAt = Date.now();
    } else if (synth.paused) {
      synth.resume();
      ttsPlaying = true;
      if (_browserTTSState && _browserTTSState.pausedAt) {
        _browserTTSState.startTime += (Date.now() - _browserTTSState.pausedAt);
        _browserTTSState.pausedAt = null;
      }
      _startBrowserProgressTimer();
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
        // Pre-buffer upcoming chunks while paused so resume is instant
        ttsPrefetchAhead();
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

var _skipHoldTimer = null;
var _skipHoldInterval = null;

function ttsStartHoldSkip(seconds) {
  skipTime(seconds);
  _skipHoldTimer = setTimeout(function() {
    _skipHoldInterval = setInterval(function() {
      skipTime(seconds);
    }, 200);
  }, 300);
}

function ttsStopHoldSkip() {
  clearTimeout(_skipHoldTimer);
  clearInterval(_skipHoldInterval);
  _skipHoldTimer = null;
  _skipHoldInterval = null;
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
  if (_browserTTSState && _browserTTSState.startTime) {
    var elapsed = (Date.now() - _browserTTSState.startTime) / 1000;
    var baseOffset = _browserTTSState.seekOffset || 0;
    var currentPct = baseOffset + (elapsed / _browserTTSState.estimatedSeconds) * (1 - baseOffset);
    var deltaPct = seconds / _browserTTSState.estimatedSeconds;
    ttsSeek(Math.max(0, Math.min(1, currentPct + deltaPct)));
    return;
  }
  if (ttsAudio && ttsAudio.duration) {
    var newTime = ttsAudio.currentTime + seconds;
    ttsAudio.currentTime = Math.max(0, Math.min(newTime, ttsAudio.duration));
    return;
  }
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

  // Estimate elapsed time up to target chunk using actual durations where available
  var elapsed = 0;
  for (var i = 0; i < targetChunk; i++) {
    elapsed += session.chunkDurations[i] || (session.estimatedTotalDuration / session.totalChunks);
  }
  session.elapsedTime = elapsed;

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
  if (_browserTTSState) {
    var text = _browserTTSState.text;
    var charOffset = Math.floor(pct * text.length);
    // Snap to nearest word boundary
    while (charOffset > 0 && text[charOffset] !== ' ') charOffset--;
    if (charOffset > 0) charOffset++; // skip past the space
    _startBrowserUtterance(text.slice(charOffset), pct);
    return;
  }
  if (ttsAudio && ttsAudio.duration) {
    ttsAudio.currentTime = pct * ttsAudio.duration;
  }
}

function ttsToggleSpeedSlider() {
  var player = document.querySelector('pr-player');
  if (player) player._toggleSpeedSlider();
}

function ttsSetSpeed(speed) {
  ttsSpeed = speed;
  var speedBtn = document.getElementById('tts-speed-btn');
  if (speedBtn) speedBtn.textContent = speed + 'x';
  var popupVal = document.getElementById('tts-speed-popup-val');
  if (popupVal) popupVal.textContent = speed + 'x';
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

function ttsDismissPlayer() {
  ttsClearQueue();
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
    showToast('Voice settings are only available in server mode.');
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
      { id: 'browser', label: 'Built-in Voice — free' },
      { id: 'openai', label: 'OpenAI — premium quality' },
      { id: 'elevenlabs', label: 'ElevenLabs — premium quality' },
    ];

    // Store data on overlay so module-scope render helpers can access it
    overlay._ttsData = data;

    var isCloud = data.provider === 'openai' || data.provider === 'elevenlabs';

    var ttsModalLabels = {browser:'Browser',openai:'OpenAI',elevenlabs:'ElevenLabs'};
    card.innerHTML =
      '<h2>Voice Settings</h2>' +
      '<div style="margin:12px 0">' +
        '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Provider</label>' +
        '<div class="settings-btn-group">' +
          providers.map(function(p) { return '<button data-val="' + p.id + '" class="' + (data.provider === p.id ? 'active' : '') + '" onclick="settingsBtnSelect(this,\'tts-provider-select\',\'' + p.id + '\');ttsSettingsProviderChanged()">' + (ttsModalLabels[p.id] || p.id) + '</button>'; }).join('') +
        '</div>' +
        '<input type="hidden" id="tts-provider-select" value="' + escapeHtml(data.provider || 'browser') + '">' +
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
        '<div style="margin:12px 0;position:relative" id="tts-voice-row">' +
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Voice</label>' +
          '<button onclick="toggleTTSModalVoicePicker(\'tts-voice-btn\',\'tts-voice-select\',null)" id="tts-voice-btn" style="width:100%;text-align:left;display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;cursor:pointer;font-family:inherit">' + escapeHtml(ttsModalGetVoiceLabel(data.provider, data.voice)) + ' <span style="opacity:0.5">\u25BE</span></button>' +
          '<input type="hidden" id="tts-voice-select" value="' + escapeHtml(data.voice || '') + '">' +
        '</div>' +
        '<div style="margin:12px 0" id="tts-model-row">' +
          '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Model</label>' +
          ttsModalRenderModelBtnGroup(data.provider, data.model) +
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
    showToast('Could not load voice settings.');
  });
}

function ttsModalGetVoiceLabel(provider, voiceId) {
  var overlay = document.querySelector('.modal-overlay');
  var data = overlay && overlay._ttsData;
  if (!data || !data.voices || !data.voices[provider]) return voiceId || 'Select voice';
  var voices = data.voices[provider];
  for (var i = 0; i < voices.length; i++) {
    if (voices[i].id === voiceId) return voices[i].label;
  }
  return voices.length > 0 ? voices[0].label : 'Select voice';
}

function toggleTTSModalVoicePicker(btnId, hiddenId, forcedProvider) {
  var overlay = document.querySelector('.modal-overlay');
  var data = overlay && overlay._ttsData;
  if (!data || !data.voices) return;
  var provider = forcedProvider || document.getElementById('tts-provider-select').value;
  var voices = data.voices[provider] || [];
  var current = document.getElementById(hiddenId).value;
  var options = voices.map(function(v) { return [v.id, v.label]; });
  settingsCustomSelect(btnId, options, current, function(val) {
    var hidden = document.getElementById(hiddenId);
    if (hidden) hidden.value = val;
    var btn = document.getElementById(btnId);
    var label = val;
    for (var i = 0; i < voices.length; i++) { if (voices[i].id === val) { label = voices[i].label; break; } }
    if (btn) btn.firstChild.textContent = label;
  });
}

function ttsModalRenderModelBtnGroup(provider, selectedModel) {
  var overlay = document.querySelector('.modal-overlay');
  var data = overlay && overlay._ttsData;
  if (!data || !data.models || !data.models[provider]) return '';
  var models = data.models[provider];
  var html = '<div class="settings-btn-group">';
  for (var i = 0; i < models.length; i++) {
    html += '<button data-val="' + models[i].id + '" class="' + (selectedModel === models[i].id ? 'active' : '') + '" onclick="settingsBtnSelect(this,\'tts-model-select\',\'' + models[i].id + '\');ttsSettingsModelChanged()">' + escapeHtml(models[i].label) + '</button>';
  }
  html += '</div><input type="hidden" id="tts-model-select" value="' + escapeHtml(selectedModel || (models.length > 0 ? models[0].id : '')) + '">';
  return html;
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
  const isCloud = provider === 'openai' || provider === 'elevenlabs';
  cloudSettings.style.display = isCloud ? 'block' : 'none';
  costInfo.style.display = isCloud ? 'block' : 'none';

  // Reset consent checkbox when changing providers
  const consent = document.getElementById('tts-consent');
  if (consent) consent.checked = false;

  const overlay = document.querySelector('.modal-overlay');
  const data = overlay?._ttsData;
  if (!data) return;

  // Update cloud voice picker button
  var voiceBtn = document.getElementById('tts-voice-btn');
  var voiceHidden = document.getElementById('tts-voice-select');
  if (voiceBtn && data.voices && data.voices[provider]) {
    var firstVoice = data.voices[provider][0];
    if (voiceHidden) voiceHidden.value = firstVoice ? firstVoice.id : '';
    voiceBtn.firstChild.textContent = firstVoice ? firstVoice.label : 'No voices';
  }

  // Rebuild model button group
  var modelRow = document.getElementById('tts-model-row');
  if (modelRow) {
    var label = modelRow.querySelector('label');
    modelRow.innerHTML = '';
    if (label) modelRow.appendChild(label);
    if (data.models && data.models[provider]) {
      var firstModel = data.models[provider][0];
      modelRow.insertAdjacentHTML('beforeend', ttsModalRenderModelBtnGroup(provider, firstModel ? firstModel.id : ''));
    }
  }

  // Update cost estimate
  var modelHidden = document.getElementById('tts-model-select');
  var costEl = document.getElementById('tts-cost-estimate');
  if (costEl) costEl.innerHTML = ttsGetCostHtml(provider, modelHidden ? modelHidden.value : '');
}

function saveTTSSettings() {
  const provider = document.getElementById('tts-provider-select').value;
  const config = { provider };

  if (provider !== 'browser') {
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
      showToast('Please enter an API key for TTS.');
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
      showToast('Failed to save voice settings.');
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


