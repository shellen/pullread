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

const TTS_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

function addCurrentToTTSQueue() {
  if (!activeFile) return;
  addToTTSQueue(activeFile);
}

async function addToTTSQueue(filename) {
  const file = allFiles.find(f => f.filename === filename);
  if (!file) return;
  if (ttsQueue.some(q => q.filename === filename)) {
    // Already queued — just play it
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

  ttsQueue.push({ filename, title: file.title });
  renderAudioPlayer();
  if (ttsQueue.length === 1) playTTSItem(0);
}

function renderAudioPlayer() {
  const panel = document.getElementById('audio-player');
  if (!panel) return;

  if (ttsQueue.length === 0) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');

  const label = document.getElementById('audio-now-label');
  const status = document.getElementById('audio-now-status');
  const playBtn = document.getElementById('tts-play-btn');

  if (ttsCurrentIndex >= 0 && ttsCurrentIndex < ttsQueue.length) {
    label.textContent = ttsQueue[ttsCurrentIndex].title;
  } else {
    label.textContent = 'No article playing';
  }

  if (ttsGenerating) {
    status.textContent = 'Generating...';
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
  if (ttsQueue.length > 1) {
    queueSection.style.display = '';
    queueList.innerHTML = ttsQueue.map((item, i) =>
      '<div class="audio-queue-item' + (i === ttsCurrentIndex ? ' playing' : '') + '" onclick="playTTSItem(' + i + ')">'
      + '<span style="font-size:10px;color:var(--muted);width:14px;text-align:center">' + (i === ttsCurrentIndex ? '&#9654;' : (i + 1)) + '</span>'
      + '<span class="queue-title">' + escapeHtml(item.title) + '</span>'
      + '<button class="queue-remove" onclick="event.stopPropagation();removeTTSQueueItem(' + i + ')" title="Remove">&times;</button>'
      + '</div>'
    ).join('');
  } else {
    queueSection.style.display = 'none';
  }
}

async function playTTSItem(index) {
  stopTTS();
  ttsCurrentIndex = index;
  if (index < 0 || index >= ttsQueue.length) return;

  const item = ttsQueue[index];
  ttsPlaying = true;
  renderAudioPlayer();

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

  const { body } = parseFrontmatter(text);
  const plainText = stripMarkdownForTTS(body);

  // Cancel any existing
  synth.cancel();

  // Build paragraph map for reading highlight
  const paragraphs = plainText.split(/\n\n+/).filter(p => p.trim());
  let charOffset = 0;
  const paraOffsets = paragraphs.map(function(p) {
    var start = charOffset;
    charOffset += p.length + 2; // account for \n\n
    return { start: start, end: start + p.length, text: p };
  });

  const utterance = new SpeechSynthesisUtterance(plainText);
  utterance.rate = ttsSpeed;
  utterance.lang = navigator.language || 'en-US';
  ttsSynthUtterance = utterance;

  // Estimate total duration (browser TTS doesn't give real progress)
  const estimatedWords = plainText.split(/\s+/).length;
  const estimatedSeconds = estimatedWords / (150 * ttsSpeed); // ~150 wpm base
  let startTime = Date.now();

  // Voice reading highlight: track boundary events for paragraph-level highlighting
  utterance.addEventListener('boundary', function(ev) {
    if (ev.charIndex !== undefined) {
      ttsHighlightAtChar(ev.charIndex, paraOffsets);
    }
  });

  utterance.onstart = function() {
    ttsPlaying = true;
    startTime = Date.now();
    ttsHighlightAtChar(0, paraOffsets);
    renderAudioPlayer();
    document.getElementById('tts-time-total').textContent = formatTime(estimatedSeconds);
    ttsProgressTimer = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const pct = Math.min(100, (elapsed / estimatedSeconds) * 100);
      document.getElementById('tts-progress').style.width = pct + '%';
      document.getElementById('tts-time-current').textContent = formatTime(elapsed);
      // Estimate-based highlight fallback (if no boundary events)
      ttsHighlightByProgress(pct / 100, paraOffsets);
    }, 200);
  };

  utterance.onend = function() {
    clearInterval(ttsProgressTimer);
    ttsPlaying = false;
    ttsSynthUtterance = null;
    ttsClearHighlight();
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
    ttsClearHighlight();
    renderAudioPlayer();
  };

  synth.speak(utterance);
}

async function playCloudTTS(filename) {
  ttsGenerating = true;
  renderAudioPlayer();

  // Fetch article text for reading highlight
  let _cloudParaOffsets = [];
  try {
    const textRes = await fetch('/api/file?name=' + encodeURIComponent(filename));
    if (textRes.ok) {
      const rawText = await textRes.text();
      const { body } = parseFrontmatter(rawText);
      const plainText = stripMarkdownForTTS(body);
      var paragraphs = plainText.split(/\n\n+/).filter(function(p) { return p.trim(); });
      var co = 0;
      _cloudParaOffsets = paragraphs.map(function(p) {
        var s = co; co += p.length + 2;
        return { start: s, end: s + p.length, text: p };
      });
    }
  } catch {}

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: filename }),
    });

    ttsGenerating = false;

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'TTS failed' }));
      // If Kokoro native engine failed, fall back to browser TTS silently
      if (err.fallback === 'browser') {
        console.warn('Kokoro unavailable, falling back to browser TTS:', err.error);
        ttsGenerating = false;
        await playBrowserTTS(filename);
        return;
      }
      alert('TTS Error: ' + (err.error || 'Unknown error'));
      ttsPlaying = false;
      renderAudioPlayer();
      return;
    }

    const blob = await res.blob();
    const audioUrl = URL.createObjectURL(blob);

    ttsAudio = new Audio(audioUrl);
    ttsAudio.playbackRate = ttsSpeed;
    // Reset total time immediately; loadedmetadata will set the real value
    document.getElementById('tts-time-total').textContent = '0:00';

    ttsAudio.addEventListener('loadedmetadata', () => {
      document.getElementById('tts-time-total').textContent = formatTime(ttsAudio.duration);
    });

    ttsAudio.addEventListener('timeupdate', () => {
      if (!ttsAudio) return;
      const pct = ttsAudio.duration ? (ttsAudio.currentTime / ttsAudio.duration) * 100 : 0;
      document.getElementById('tts-progress').style.width = pct + '%';
      document.getElementById('tts-time-current').textContent = formatTime(ttsAudio.currentTime);
      // Reading highlight based on playback progress
      ttsHighlightByProgress(pct / 100, _cloudParaOffsets);
    });

    ttsAudio.addEventListener('ended', () => {
      ttsPlaying = false;
      ttsClearHighlight();
      renderAudioPlayer();
      // Auto-play next
      if (ttsCurrentIndex + 1 < ttsQueue.length) {
        setTimeout(() => playTTSItem(ttsCurrentIndex + 1), 500);
      }
    });

    ttsAudio.addEventListener('error', () => {
      ttsPlaying = false;
      ttsClearHighlight();
      renderAudioPlayer();
    });

    ttsAudio.play();
    ttsPlaying = true;
    renderAudioPlayer();
  } catch (err) {
    ttsGenerating = false;
    ttsPlaying = false;
    renderAudioPlayer();
    alert('TTS Error: ' + err.message);
  }
}

function stopTTS() {
  clearInterval(ttsProgressTimer);
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
  ttsClearHighlight();
  document.getElementById('tts-progress').style.width = '0%';
  document.getElementById('tts-time-current').textContent = '0:00';
  document.getElementById('tts-time-total').textContent = '0:00';
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
  if (ttsCurrentIndex + 1 < ttsQueue.length) {
    playTTSItem(ttsCurrentIndex + 1);
  }
}

function ttsSkipPrev() {
  if (ttsCurrentIndex > 0) {
    playTTSItem(ttsCurrentIndex - 1);
  } else if (ttsCurrentIndex === 0) {
    playTTSItem(0); // restart current
  }
}

function ttsSeek(event) {
  const wrap = event.currentTarget;
  const rect = wrap.getBoundingClientRect();
  const pct = (event.clientX - rect.left) / rect.width;

  if (ttsAudio && ttsAudio.duration) {
    ttsAudio.currentTime = pct * ttsAudio.duration;
  }
  // Browser TTS doesn't support seeking
}

function ttsCycleSpeed() {
  const currentIdx = TTS_SPEEDS.indexOf(ttsSpeed);
  const nextIdx = (currentIdx + 1) % TTS_SPEEDS.length;
  ttsSpeed = TTS_SPEEDS[nextIdx];

  document.getElementById('tts-speed-btn').textContent = ttsSpeed + 'x';

  if (ttsAudio) {
    ttsAudio.playbackRate = ttsSpeed;
  }
  if (ttsSynthUtterance && window.speechSynthesis.speaking) {
    // Browser TTS doesn't support live rate change — note for user
    ttsSynthUtterance.rate = ttsSpeed;
  }
}

function removeTTSQueueItem(index) {
  if (index === ttsCurrentIndex) {
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
  stopTTS();
  ttsQueue = [];
  ttsCurrentIndex = -1;
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
  return text.trim();
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
  // Remove previous highlight
  content.querySelectorAll('.tts-reading-hl').forEach(function(el) {
    el.classList.remove('tts-reading-hl');
  });
  // Find the Nth paragraph-level element in the article
  var blocks = content.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre');
  if (paraIndex >= 0 && paraIndex < blocks.length) {
    blocks[paraIndex].classList.add('tts-reading-hl');
    blocks[paraIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  fetch('/api/tts-settings').then(r => r.json()).then(data => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    const providers = [
      { id: 'browser', label: 'Built-in Voice — free' },
      { id: 'kokoro', label: 'Kokoro — natural voice, free & private' },
      { id: 'openai', label: 'OpenAI — premium quality' },
      { id: 'elevenlabs', label: 'ElevenLabs — premium quality' },
    ];

    function renderVoiceOptions(provider) {
      if (!data.voices[provider]) return '';
      return data.voices[provider].map(v =>
        '<option value="' + v.id + '"' + (data.voice === v.id ? ' selected' : '') + '>' + escapeHtml(v.label) + '</option>'
      ).join('');
    }

    function renderModelOptions(provider) {
      if (!data.models[provider]) return '';
      return data.models[provider].map(m =>
        '<option value="' + m.id + '"' + (data.model === m.id ? ' selected' : '') + '>' + escapeHtml(m.label) + '</option>'
      ).join('');
    }

    overlay.innerHTML = `
      <div class="modal-card" onclick="event.stopPropagation()" style="max-width:440px">
        <h2>Listen to Articles</h2>
        <p>Have your articles read aloud while you do other things.</p>
        <div style="margin:12px 0">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Provider</label>
          <select id="tts-provider-select" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px" onchange="ttsSettingsProviderChanged()">
            ${providers.map(p => '<option value="' + p.id + '"' + (data.provider === p.id ? ' selected' : '') + '>' + p.label + '</option>').join('')}
          </select>
        </div>
        <div id="tts-kokoro-settings" style="display:${data.provider === 'kokoro' ? 'block' : 'none'}">
          <div style="background:var(--code-bg);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin:10px 0;font-size:12px;line-height:1.6">
            <strong style="color:var(--fg)">Kokoro — natural-sounding voice, completely free</strong><br>
            <span style="color:var(--muted)">Runs entirely on your Mac using the Kokoro voice engine — your articles stay private and never leave your machine.</span><br>
            <span style="color:var(--muted)">Sets itself up automatically the first time you listen (~86MB download).</span>
            <div id="kokoro-status" style="margin-top:6px">
              ${data.kokoro?.installed
                ? '<span style="color:#22c55e">&#10003; Ready to go</span>'
                : '<span style="color:var(--muted)">Will set up automatically on first listen</span>'}
            </div>
          </div>
          <div style="margin:12px 0">
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Voice</label>
            <select id="tts-kokoro-voice" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px">
              ${renderVoiceOptions('kokoro')}
            </select>
          </div>
          <div style="margin:12px 0">
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Quality</label>
            <select id="tts-kokoro-model" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px">
              ${renderModelOptions('kokoro')}
            </select>
          </div>
        </div>
        <div id="tts-cost-info" style="display:${data.provider === 'openai' || data.provider === 'elevenlabs' ? 'block' : 'none'}">
          <div id="tts-cost-estimate" style="background:var(--code-bg);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin:10px 0;font-size:12px;line-height:1.5">
            ${ttsGetCostHtml(data.provider, data.model)}
          </div>
        </div>
        <div id="tts-cloud-settings" style="display:${data.provider === 'openai' || data.provider === 'elevenlabs' ? 'block' : 'none'}">
          <div style="margin:12px 0">
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">API Key</label>
            <input type="password" id="tts-api-key" placeholder="${data.hasKey && (data.provider === 'openai' || data.provider === 'elevenlabs') ? '••••••••••••••••' : 'Paste your key here'}" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px" />
            ${data.hasKey && (data.provider === 'openai' || data.provider === 'elevenlabs')
              ? '<div style="font-size:11px;color:#22c55e;margin-top:3px">&#10003; API key saved. Leave blank to keep current key.</div>'
              : '<div style="font-size:11px;color:var(--muted);margin-top:3px">You can get a key from your provider\'s website. This key is only used for reading articles aloud.</div>'}
          </div>
          <div style="margin:12px 0" id="tts-voice-row">
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Voice</label>
            <select id="tts-voice-select" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px" onchange="ttsSettingsModelChanged()">
              ${renderVoiceOptions(data.provider)}
            </select>
          </div>
          <div style="margin:12px 0" id="tts-model-row">
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Model</label>
            <select id="tts-model-select" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px" onchange="ttsSettingsModelChanged()">
              ${renderModelOptions(data.provider)}
            </select>
          </div>
          <div style="margin:14px 0;padding:10px 12px;background:var(--code-bg);border:1px solid var(--border);border-radius:6px">
            <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;cursor:pointer;line-height:1.5">
              <input type="checkbox" id="tts-consent" style="margin-top:3px;width:16px;height:16px;accent-color:var(--link);flex-shrink:0" />
              <span>Articles will be sent to this provider to create audio. Your API key will be charged a small amount per article — audio is saved locally so you only pay once per article.</span>
            </label>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn-primary" onclick="saveTTSSettings()" id="tts-save-btn">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Store full settings data for dynamic updates
    overlay._ttsData = data;
  }).catch(() => {
    alert('Could not load voice playback settings.');
  });
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
    voiceSelect.innerHTML = data.voices[provider].map(v =>
      '<option value="' + v.id + '">' + escapeHtml(v.label) + '</option>'
    ).join('');
  } else {
    voiceSelect.innerHTML = '';
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

  fetch('/api/tts-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }).then(r => {
    if (r.ok) {
      ttsProvider = provider;
      // Clear TTS queue so new voice/model takes effect
      ttsQueue = [];
      ttsCurrentIndex = -1;
      if (ttsAudio) { ttsAudio.pause(); ttsAudio.src = ''; ttsAudio = null; }
      renderAudioPlayer();
      const overlay = document.querySelector('.modal-overlay');
      if (overlay) overlay.remove();
    } else {
      alert('Failed to save voice playback settings.');
    }
  });
}

