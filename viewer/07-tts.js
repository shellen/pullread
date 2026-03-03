// ---- TTS Audio Playback ----
var ttsQueue = [];
var ttsCurrentIndex = -1;
var ttsAudio = null;        // HTMLAudioElement for cloud TTS
var ttsSynthUtterance = null; // SpeechSynthesisUtterance for browser TTS
var ttsPlaying = false;
var ttsSpeed = 1.0;
var ttsProvider = 'browser';
var ttsVoiceLabel = '';
var ttsGenerating = false;
var ttsProgressTimer = null;
var _ttsChunkSession = null; // { id, totalChunks, currentChunk, elapsedTime }
var _ttsPlayGeneration = 0;  // incremented on stop — stale async ops check this to bail out
var _ttsNextPrefetch = null;  // { filename, sessionId, totalChunks, currentChunk, done }
var _browserTTSState = null;  // { text, estimatedSeconds, startTime, seekOffset, voice, lang }
// Migrate old boolean to tri-state; 'off' | 'podcasts' | 'everything'
var autoplayMode = localStorage.getItem('pr-autoplay-mode') || (localStorage.getItem('pr-podcast-autoplay') === '1' ? 'podcasts' : 'off');

const TTS_SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0, 1.1, 1.15, 1.2, 1.3, 1.5, 1.75, 2.0];
const YOUTUBE_SPEEDS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

// YouTube IFrame API state
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

/** Attach hls.js to a <video> element for HLS streaming. Falls back to native for Safari. */
function attachHls(videoEl, url) {
  if (typeof Hls !== 'undefined' && Hls.isSupported()) {
    var hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(videoEl);
    videoEl._hls = hls;
  } else {
    // Safari handles HLS natively
    videoEl.src = url;
  }
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
  var isPodcast = file && file.enclosureUrl && isMediaEnclosure(file.enclosureType);
  var isVideo = file && file.enclosureUrl && isVideoEnclosure(file.enclosureType);
  var idleLabel = isVideo ? 'Watch' : isPodcast ? 'Play' : 'Listen';
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
  var ytId = isYouTubeDomain(file.domain) ? extractYouTubeVideoId(file.url) : null;
  var newItem = { filename: filename, title: file.title, image: ytId ? 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg' : (file.image || ''), domain: file.domain || '', feed: file.feed || '' };
  if (ytId) { newItem.youtubeVideoId = ytId; }
  else if (file.enclosureUrl && isMediaEnclosure(file.enclosureType)) {
    newItem.enclosureUrl = file.enclosureUrl;
    newItem.enclosureType = file.enclosureType;
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

  var ytId = isYouTubeDomain(file.domain) ? extractYouTubeVideoId(file.url) : null;
  var item = { filename, title: file.title, image: ytId ? 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg' : (file.image || ''), domain: file.domain || '', feed: file.feed || '' };
  if (ytId) { item.youtubeVideoId = ytId; }
  else if (file.enclosureUrl && isMediaEnclosure(file.enclosureType)) {
    item.enclosureUrl = file.enclosureUrl;
    item.enclosureType = file.enclosureType;
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
  var gen = _ttsPlayGeneration;
  ttsCurrentIndex = index;
  if (index < 0 || index >= ttsQueue.length) return;

  playCueSound();
  const item = ttsQueue[index];
  ttsPlaying = true;
  renderAudioPlayer();

  // YouTube videos use the IFrame API
  if (item.youtubeVideoId) {
    playYouTube(item);
    return;
  }

  // Media enclosures play natively — no TTS synthesis needed
  if (item.enclosureUrl) {
    if (isVideoEnclosure(item.enclosureType)) {
      playVideoPopout(item);
    } else {
      await playPodcastAudio(item);
    }
    return;
  }

  // Check TTS provider
  await loadTTSSettings();
  if (gen !== _ttsPlayGeneration) return;

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
      ttsVoiceLabel = '';
      if (data.voice && data.voices && data.voices[data.provider]) {
        var v = data.voices[data.provider];
        for (var i = 0; i < v.length; i++) {
          if (v[i].id === data.voice) { ttsVoiceLabel = v[i].label; break; }
        }
      }
    }
  } catch { ttsProvider = 'browser'; }
}

function ttsCurrentVoiceInfo() {
  if (ttsProvider === 'browser') {
    var name = (_browserTTSState && _browserTTSState.voice)
      ? _browserTTSState.voice.name : (localStorage.getItem('pr-tts-browser-voice') || 'Default');
    return { provider: 'Browser', voice: name };
  }
  var labels = { openai: 'OpenAI', elevenlabs: 'ElevenLabs', kokoro: 'Kokoro' };
  return { provider: labels[ttsProvider] || ttsProvider, voice: ttsVoiceLabel || 'Default' };
}

async function playBrowserTTS(filename, domain) {
  var gen = _ttsPlayGeneration;
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
    if (gen !== _ttsPlayGeneration) return;
    if (res.ok) text = await res.text();
    if (gen !== _ttsPlayGeneration) return;
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
  const estimatedSeconds = (estimatedWords / (180 * ttsSpeed)) * 60; // ~180 wpm base → seconds

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
  var gen = _ttsPlayGeneration;
  ttsGenerating = true;
  renderAudioPlayer();

  try {
    // Start a chunked TTS session
    const startRes = await fetch('/api/tts/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: filename }),
    });

    if (gen !== _ttsPlayGeneration) return;
    ttsGenerating = false;

    if (!startRes.ok) {
      const err = await startRes.json().catch(function() { return { error: 'TTS failed' }; });
      if (gen !== _ttsPlayGeneration) return;
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
    if (gen !== _ttsPlayGeneration) return;

    if (session.cached) {
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

var _videoPopoutWindow = null;
var _videoPopbackData = null;

/** Handle pop-back-in from a video popout window */
window._videoPopIn = function(currentTime) {
  _videoPopbackData = { currentTime: currentTime };
  _videoPopoutWindow = null;
  renderAudioPlayer();
  bottomBarGoToArticle();
  // After navigation, seek the inline video to the same position
  setTimeout(function() {
    var v = document.querySelector('.video-inline-player video');
    if (v && currentTime > 0) {
      v.currentTime = currentTime;
      v.play();
    }
  }, 300);
};

/** Open a video podcast in a pop-out player window */
function playVideoPopout(item) {
  stopListenLoading();
  ttsPlaying = true;
  renderAudioPlayer();

  var title = item.title || 'Video';
  var posterAttr = item.image ? ' poster="' + item.image + '"' : '';
  var isHls = isHlsSource(item.enclosureUrl);

  // Build HLS script for the popout (uses parent window's Hls via window.opener)
  var hlsScript = '';
  if (isHls) {
    var safeUrl = item.enclosureUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    hlsScript = 'var H=window.opener&&window.opener.Hls;if(H&&H.isSupported()){var h=new H();h.loadSource("' + safeUrl + '");h.attachMedia(v);}else{v.src="' + safeUrl + '";}';
  }

  var html = '<!DOCTYPE html><html><head>'
    + '<meta charset="UTF-8"><title>' + title.replace(/</g, '&lt;') + ' — Pull Read</title>'
    + '<style>'
    + 'body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif;color:#fff}'
    + 'video{max-width:100%;max-height:100%;border-radius:4px}'
    + '.info{position:fixed;top:12px;left:16px;font-size:13px;opacity:0.7}'
    + '.pop-in{position:fixed;top:12px;right:16px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);border-radius:6px;padding:6px 14px;font-size:13px;cursor:pointer;font-family:inherit;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:background 0.15s}'
    + '.pop-in:hover{background:rgba(255,255,255,0.25)}'
    + '</style></head><body>'
    + '<div class="info">' + title.replace(/</g, '&lt;') + '</div>'
    + '<button class="pop-in" onclick="popBackIn()">&#8617; Pop back in</button>'
    + '<video controls autoplay' + posterAttr + '>'
    + (isHls ? '' : '<source src="' + item.enclosureUrl + '">')
    + '</video>';

  html += '<scr' + 'ipt>'
    + 'function popBackIn(){var v=document.querySelector("video");if(window.opener&&window.opener._videoPopIn){window.opener._videoPopIn(v?v.currentTime:0);}window.close();}'
    + 'var v=document.querySelector("video");'
    + hlsScript
    + 'v.addEventListener("ended",function(){window.close()});'
    + 'v.addEventListener("error",function(){document.body.innerHTML="<p style=\\"text-align:center;padding:40px\\">Could not load video</p>"});'
    + '</scr' + 'ipt>'
    + '</body></html>';

  var blob = new Blob([html], { type: 'text/html' });
  var blobUrl = URL.createObjectURL(blob);
  var w = window.open(blobUrl, '_blank', 'width=960,height=640,menubar=no,toolbar=no');
  URL.revokeObjectURL(blobUrl);

  if (w) {
    _videoPopoutWindow = w;
    renderAudioPlayer();
    // When popout closes, advance queue
    var check = setInterval(function() {
      if (w.closed) {
        clearInterval(check);
        _videoPopoutWindow = null;
        // If pop-back-in was used, skip queue advancement
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
    // Popup blocked — fall back to inline link
    _videoPopoutWindow = null;
    ttsPlaying = false;
    renderAudioPlayer();
    showToast('Pop-up blocked. Opening video in new tab.');
    window.open(item.enclosureUrl, '_blank');
  }
}

function playYouTube(item) {
  stopListenLoading();
  var gen = _ttsPlayGeneration;

  _ytCleanup();

  loadYouTubeApi(function(err) {
    if (err || gen !== _ttsPlayGeneration) {
      if (err) showToast('YouTube player controls unavailable.');
      ttsPlaying = false;
      ttsGenerating = false;
      renderAudioPlayer();
      return;
    }

    // Find the embed container in the article body
    var container = document.querySelector('.yt-embed');
    if (!container) {
      playYouTubePopout(item);
      return;
    }

    // Replace the bare iframe with a YT.Player container div
    container.innerHTML = '<div id="yt-player-target"></div>';

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
          ttsGenerating = false;
          ttsPlaying = true;
          renderAudioPlayer();
          var rate = _ytNearestSpeed(ttsSpeed);
          e.target.setPlaybackRate(rate);
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
  ttsGenerating = true;
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
      var pct = (cur / dur * 100).toFixed(1);
      var prog = document.getElementById('tts-progress');
      if (prog) prog.style.width = pct + '%';
      var curEl = document.getElementById('tts-time-current');
      if (curEl) curEl.textContent = formatTime(cur);
      var totEl = document.getElementById('tts-time-total');
      if (totEl) totEl.textContent = formatTime(dur);
    }
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

function playYouTubePopout(item, startTime) {
  _ytCleanup();
  ttsPlaying = true;
  renderAudioPlayer();

  var title = (item.title || 'Video').replace(/</g, '&lt;');

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
    + '  var t=0;try{t=_p.getCurrentTime();}catch(e){}'
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

var _audioPopoutWindow = null;

/** Close the audio popout and bring playback back to the main window */
function _closeAudioPopout() {
  if (_audioPopoutWindow && !_audioPopoutWindow.closed) {
    _audioPopoutWindow.close();
  }
  _audioPopoutWindow = null;
  renderAudioPlayer();
}

/** Pop out the audio player into a mini player window */
function popOutAudioPlayer() {
  if (_audioPopoutWindow && !_audioPopoutWindow.closed) {
    _audioPopoutWindow.focus();
    return;
  }

  var item = (ttsCurrentIndex >= 0 && ttsCurrentIndex < ttsQueue.length) ? ttsQueue[ttsCurrentIndex] : null;
  var title = item ? item.title : 'PullRead Player';

  var html = '<!DOCTYPE html><html><head>'
    + '<meta charset="UTF-8"><title>' + (title || 'PullRead Player').replace(/</g, '&lt;') + '</title>'
    + '<style>'
    + ':root{--bg:#1a1a1e;--fg:#e4e4e7;--muted:#71717a;--border:#2e2e33;--link:#60a5fa;--accent:#3b82f6}'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,sans-serif;height:100vh;display:flex;flex-direction:column;overflow:hidden;user-select:none;-webkit-user-select:none}'
    + '.top-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border)}'
    + '.top-bar-title{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px}'
    + '.pop-in{background:none;border:1px solid var(--border);color:var(--fg);border-radius:5px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:inherit;transition:background 0.15s}'
    + '.pop-in:hover{background:rgba(255,255,255,0.08)}'
    + '.now-playing{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;gap:12px;overflow:hidden}'
    + '.artwork{width:120px;height:120px;border-radius:8px;background:var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0}'
    + '.artwork img{width:100%;height:100%;object-fit:cover}'
    + '.artwork svg{width:36px;height:36px;color:var(--muted)}'
    + '.track-info{text-align:center;max-width:100%}'
    + '.track-title{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;display:block}'
    + '.track-source{font-size:12px;color:var(--muted);margin-top:2px}'
    + '.progress-section{padding:0 20px 8px}'
    + '.progress-bar-wrap{width:100%;height:20px;display:flex;align-items:center;cursor:pointer}'
    + '.progress-bar{width:100%;height:4px;background:var(--border);border-radius:2px;position:relative}'
    + '.progress-fill{height:100%;background:var(--accent);border-radius:2px;width:0;transition:width 0.2s linear}'
    + '.progress-times{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:2px}'
    + '.controls{display:flex;align-items:center;justify-content:center;gap:16px;padding:8px 20px 16px}'
    + '.ctrl-btn{background:none;border:none;color:var(--fg);cursor:pointer;padding:6px;border-radius:50%;transition:background 0.15s;display:flex;align-items:center;justify-content:center}'
    + '.ctrl-btn:hover{background:rgba(255,255,255,0.08)}'
    + '.ctrl-btn svg{width:20px;height:20px;fill:currentColor}'
    + '.play-btn{width:48px;height:48px;border-radius:50%;background:var(--fg);color:var(--bg);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.1s}'
    + '.play-btn:active{transform:scale(0.95)}'
    + '.play-btn svg{width:22px;height:22px;fill:currentColor}'
    + '.speed-btn{background:none;border:1px solid var(--border);color:var(--fg);border-radius:5px;padding:4px 8px;font-size:12px;cursor:pointer;font-family:inherit;min-width:36px;transition:background 0.15s}'
    + '.speed-btn:hover{background:rgba(255,255,255,0.08)}'
    + '.queue-section{flex:1;border-top:1px solid var(--border);overflow-y:auto;min-height:0}'
    + '.queue-header{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;font-size:12px;color:var(--muted);position:sticky;top:0;background:var(--bg);z-index:1}'
    + '.queue-item{display:flex;align-items:center;gap:8px;padding:6px 16px;cursor:pointer;transition:background 0.1s;font-size:13px}'
    + '.queue-item:hover{background:rgba(255,255,255,0.04)}'
    + '.queue-item.active{background:rgba(59,130,246,0.1)}'
    + '.queue-num{width:16px;text-align:center;font-size:10px;color:var(--muted);flex-shrink:0}'
    + '.queue-info{flex:1;min-width:0}'
    + '.queue-info span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.queue-info .q-source{font-size:11px;color:var(--muted)}'
    + '.queue-remove{background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;font-size:16px;line-height:1;opacity:0;transition:opacity 0.15s}'
    + '.queue-item:hover .queue-remove{opacity:1}'
    + '</style></head><body>'
    + '<div class="top-bar">'
    + '<span class="top-bar-title">PullRead</span>'
    + '<button class="pop-in" onclick="popBackIn()">&#8617; Pop back in</button>'
    + '</div>'
    + '<div class="now-playing">'
    + '<div class="artwork" id="pp-artwork"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.68-.57-1.93-1.42A6.98 6.98 0 012.25 12c0-.65.09-1.28.25-1.88A2.01 2.01 0 014.51 8.7H6.75z"/></svg></div>'
    + '<div class="track-info">'
    + '<span class="track-title" id="pp-title">No track</span>'
    + '<span class="track-source" id="pp-source"></span>'
    + '</div>'
    + '</div>'
    + '<div class="progress-section">'
    + '<div class="progress-bar-wrap" id="pp-progress-wrap"><div class="progress-bar"><div class="progress-fill" id="pp-progress"></div></div></div>'
    + '<div class="progress-times"><span id="pp-time-cur">0:00</span><span id="pp-time-tot">0:00</span></div>'
    + '</div>'
    + '<div class="controls">'
    + '<button class="speed-btn" id="pp-speed" onclick="cycleSpeed()">1x</button>'
    + '<button class="ctrl-btn" onclick="skip(-15)" title="Rewind 15s"><svg viewBox="0 0 24 24"><path d="M9.195 18.44c1.25.714 2.805-.189 2.805-1.629v-2.34l6.945 3.968c1.25.715 2.805-.188 2.805-1.628V7.19c0-1.44-1.555-2.343-2.805-1.628L12 9.53V7.19c0-1.44-1.555-2.343-2.805-1.628l-7.108 4.061c-1.26.72-1.26 2.536 0 3.256l7.108 4.061z"/></svg></button>'
    + '<button class="play-btn" id="pp-play" onclick="toggle()"><svg viewBox="0 0 24 24"><path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/></svg></button>'
    + '<button class="ctrl-btn" onclick="skip(15)" title="Forward 15s"><svg viewBox="0 0 24 24"><path d="M5.055 7.19c0-1.44 1.555-2.343 2.805-1.628L12 9.53V7.19c0-1.44 1.555-2.343 2.805-1.628l7.108 4.062c1.26.72 1.26 2.535 0 3.255l-7.108 4.062c-1.25.714-2.805-.19-2.805-1.629v-2.34l-6.945 3.968C3.805 18.152 2.25 17.249 2.25 15.81V7.19z"/></svg></button>'
    + '<button class="ctrl-btn" style="visibility:hidden;width:36px"></button>'
    + '</div>'
    + '<div class="queue-section" id="pp-queue"></div>'
    + '<scr' + 'ipt>'
    + 'var O=window.opener;'
    + 'function popBackIn(){if(O&&O._closeAudioPopout)O._closeAudioPopout();else window.close();}'
    + 'function toggle(){if(O&&O.ttsTogglePlay)O.ttsTogglePlay();}'
    + 'function skip(s){if(O&&O.skipTime)O.skipTime(s);}'
    + 'function cycleSpeed(){if(O&&O.ttsCycleSpeed)O.ttsCycleSpeed();}'
    + 'function fmtTime(s){if(!s||!isFinite(s))return"0:00";s=Math.floor(s);var m=Math.floor(s/60),sec=s%60;return m+":"+(sec<10?"0":"")+sec;}'
    + 'function updateUI(){'
    + 'if(!O||O.closed){return;}'
    + 'var q=O.ttsQueue||[],ci=O.ttsCurrentIndex,playing=O.ttsPlaying,spd=O.ttsSpeed;'
    + 'var item=(ci>=0&&ci<q.length)?q[ci]:null;'
    + 'var titleEl=document.getElementById("pp-title");'
    + 'var sourceEl=document.getElementById("pp-source");'
    + 'var artEl=document.getElementById("pp-artwork");'
    + 'var progEl=document.getElementById("pp-progress");'
    + 'var curEl=document.getElementById("pp-time-cur");'
    + 'var totEl=document.getElementById("pp-time-tot");'
    + 'var playBtn=document.getElementById("pp-play");'
    + 'var speedBtn=document.getElementById("pp-speed");'
    + 'if(titleEl)titleEl.textContent=item?item.title:"No track";'
    + 'if(sourceEl)sourceEl.textContent=item?(item.feed||item.domain||""):"";'
    + 'document.title=item?(item.title+" — PullRead"):"PullRead Player";'
    // Artwork
    + 'if(artEl&&item){'
    + 'var src=item.image||(item.domain?"/favicons/"+encodeURIComponent(item.domain)+".png":"");'
    + 'if(src&&!artEl.querySelector("img[src=\\""+CSS.escape(src)+"\\"]")){'
    + 'var img=new Image();img.src=src;img.alt="";img.onerror=function(){artEl.innerHTML=\'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.68-.57-1.93-1.42A6.98 6.98 0 012.25 12c0-.65.09-1.28.25-1.88A2.01 2.01 0 014.51 8.7H6.75z"/></svg>\';};'
    + 'artEl.innerHTML="";artEl.appendChild(img);'
    + '}else if(!src){artEl.innerHTML=\'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.68-.57-1.93-1.42A6.98 6.98 0 012.25 12c0-.65.09-1.28.25-1.88A2.01 2.01 0 014.51 8.7H6.75z"/></svg>\';}'
    + '}'
    // Progress
    + 'var audio=O.ttsAudio;'
    + 'if(audio&&audio.duration){'
    + 'var pct=(audio.currentTime/audio.duration)*100;'
    + 'if(progEl)progEl.style.width=pct+"%";'
    + 'if(curEl)curEl.textContent=fmtTime(audio.currentTime);'
    + 'if(totEl)totEl.textContent=fmtTime(audio.duration);'
    + '}else{if(progEl)progEl.style.width="0";if(curEl)curEl.textContent="0:00";if(totEl)totEl.textContent="0:00";}'
    // Play button
    + 'if(playBtn)playBtn.innerHTML=playing?\'<svg viewBox="0 0 24 24"><path d="M6.75 5.25h3v13.5h-3V5.25zm7.5 0h3v13.5h-3V5.25z"/></svg>\':\'<svg viewBox="0 0 24 24"><path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/></svg>\';'
    + 'if(speedBtn)speedBtn.textContent=spd+"x";'
    // Queue
    + 'var qEl=document.getElementById("pp-queue");'
    + 'if(qEl&&q.length>0){'
    + 'var h=\'<div class="queue-header"><span>Queue (\'+(q.length)+\')</span></div>\';'
    + 'for(var i=0;i<q.length;i++){'
    + 'var it=q[i],src2=it.feed||it.domain||"";'
    + 'h+=\'<div class="queue-item\'+(i===ci?" active":"")+\'" onclick="if(O&&O.playTTSItem)O.playTTSItem(\'+i+\')">\';'
    + 'h+=\'<span class="queue-num">\'+(i===ci?"&#9654;":(i+1))+\'</span>\';'
    + 'h+=\'<div class="queue-info"><span>\'+escHtml(it.title)+\'</span>\'+(src2?\'<span class="q-source">\'+escHtml(src2)+\'</span>\':"")+\'</div>\';'
    + 'h+=\'<button class="queue-remove" onclick="event.stopPropagation();if(O&&O.removeTTSQueueItem)O.removeTTSQueueItem(\'+i+\')">&times;</button>\';'
    + 'h+=\'</div>\';'
    + '}'
    + 'qEl.innerHTML=h;'
    + '}'
    + 'requestAnimationFrame(updateUI);'
    + '}'
    + 'function escHtml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}'
    // Progress bar drag-to-seek
    + 'var ppWrap=document.getElementById("pp-progress-wrap");'
    + 'if(ppWrap){'
    + 'function seekFromEvent(e){var r=ppWrap.getBoundingClientRect();var pct=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));if(O&&O.ttsSeek)O.ttsSeek(pct);var fill=document.getElementById("pp-progress");if(fill)fill.style.width=(pct*100)+"%";}'
    + 'ppWrap.addEventListener("mousedown",function(e){e.preventDefault();seekFromEvent(e);function onMove(ev){seekFromEvent(ev);}function onUp(){document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp);}document.addEventListener("mousemove",onMove);document.addEventListener("mouseup",onUp);});'
    + '}'
    + 'requestAnimationFrame(updateUI);'
    + '</scr' + 'ipt></body></html>';

  var blob = new Blob([html], { type: 'text/html' });
  var blobUrl = URL.createObjectURL(blob);
  var w = window.open(blobUrl, '_blank', 'width=340,height=560,menubar=no,toolbar=no');
  URL.revokeObjectURL(blobUrl);

  if (w) {
    _audioPopoutWindow = w;
    renderAudioPlayer();
    var check = setInterval(function() {
      if (w.closed) {
        clearInterval(check);
        _audioPopoutWindow = null;
        renderAudioPlayer();
      }
    }, 500);
  } else {
    showToast('Pop-up blocked by browser.');
  }
}

/** Auto-play the next item based on autoplayMode setting */
function autoplayNext(currentFilename) {
  if (autoplayMode === 'off') return;
  var candidates;
  if (autoplayMode === 'podcasts') {
    candidates = allFiles.filter(function(f) {
      return f.enclosureUrl && isMediaEnclosure(f.enclosureType);
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
  _ttsPlayGeneration++;
  _ytCleanup();
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

  // HTMLAudioElement takes priority — handles cloud TTS, cached, AND podcast audio
  // (podcasts skip loadTTSSettings so ttsProvider may be stale)
  if (ttsAudio) {
    if (ttsPlaying) {
      ttsAudio.pause();
      ttsPlaying = false;
      ttsPrefetchAhead();
    } else {
      ttsAudio.play();
      ttsPlaying = true;
    }
  } else if (_browserTTSState || ttsProvider === 'browser') {
    // Browser speech synthesis — no HTMLAudioElement involved
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
  } else if (ttsPlaying || ttsGenerating) {
    // Audio still loading/generating — cancel rather than restarting
    stopTTS();
  } else if (ttsCurrentIndex >= 0) {
    playTTSItem(ttsCurrentIndex);
  } else {
    playTTSItem(0);
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
  if (_ytPlayer && _ytPlayer.getCurrentTime) {
    _ytPlayer.seekTo(_ytPlayer.getCurrentTime() + seconds, true);
    return;
  }
  if (_ttsChunkSession) {
    var session = _ttsChunkSession;
    // Duration not yet known — skip within current chunk if audio exists
    if (!session.estimatedTotalDuration) {
      if (ttsAudio && ttsAudio.duration) {
        var t = ttsAudio.currentTime + seconds;
        ttsAudio.currentTime = Math.max(0, Math.min(t, ttsAudio.duration));
      }
      return;
    }
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
  // Don't set src='' — it triggers an async error event whose handler
  // would nuke _ttsChunkSession before the new chunk starts playing.
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio = null;
  }
  ttsPlayNextChunk(targetChunk, seekPct);
}

function ttsSeek(pct) {
  if (_ytPlayer && _ytPlayer.getDuration) {
    _ytPlayer.seekTo(pct * _ytPlayer.getDuration(), true);
    return;
  }
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

  if (_ytPlayer && _ytPlayer.setPlaybackRate) {
    _ytPlayer.setPlaybackRate(_ytNearestSpeed(speed));
  }
  if (ttsAudio) {
    ttsAudio.playbackRate = speed;
  }
  if (ttsSynthUtterance && window.speechSynthesis.speaking) {
    ttsSynthUtterance.rate = speed;
  }
  saveTTSState();
}

function ttsCycleSpeed() {
  var speeds = _ytPlayer ? YOUTUBE_SPEEDS : TTS_SPEEDS;
  var idx = speeds.indexOf(ttsSpeed);
  if (idx < 0) idx = speeds.indexOf(1.0);
  var next = (idx + 1) % speeds.length;
  ttsSetSpeed(speeds[next]);
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


