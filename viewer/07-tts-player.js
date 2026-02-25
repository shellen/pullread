// ABOUTME: Custom element <pr-player> that renders the TTS audio player bottom bar.
// ABOUTME: Exposes public API for playback control, state getters, and custom events.

class PrPlayer extends HTMLElement {
  static get observedAttributes() { return ['mode']; }

  constructor() {
    super();
    this._lastQueueLen = 0;
    this._lastIndex = -1;
  }

  // ---- State getters (read from playback engine in 07-tts.js) ----
  get queue() { return ttsQueue; }
  get currentIndex() { return ttsCurrentIndex; }
  get playing() { return ttsPlaying; }
  get speed() { return ttsSpeed; }
  get generating() { return ttsGenerating; }
  get provider() { return ttsProvider; }
  get currentItem() {
    return (ttsCurrentIndex >= 0 && ttsCurrentIndex < ttsQueue.length)
      ? ttsQueue[ttsCurrentIndex] : null;
  }

  // ---- Public API ----
  enqueue(item) { addToTTSQueue(item.filename); }
  playItem(index) { playTTSItem(index); }
  stop() { stopTTS(); }
  togglePlay() { ttsTogglePlay(); }
  skip(seconds) { skipTime(seconds); }
  seek(pct) { ttsSeek(pct); }
  setSpeed(speed) { ttsSetSpeed(speed); }
  cycleSpeed() { ttsCycleSpeed(); }
  removeItem(index) { removeTTSQueueItem(index); }
  clearQueue() { ttsClearQueue(); }
  dismiss() { ttsDismissPlayer(); }

  connectedCallback() {
    this.className = 'bottom-bar hidden';
    this.id = 'audio-player';
    this.innerHTML =
      '<div class="bottom-bar-inner">' +
        '<div class="bottom-bar-now" id="bottom-bar-now" onclick="bottomBarGoToArticle()">' +
          '<div class="bottom-bar-artwork" id="bottom-bar-artwork"><svg class="bottom-bar-icon" aria-hidden="true"><use href="#i-volume"/></svg></div>' +
          '<div class="bottom-bar-info">' +
            '<span class="bottom-bar-title" id="audio-now-label">No article queued</span>' +
            '<span class="bottom-bar-status" id="audio-now-status"></span>' +
          '</div>' +
        '</div>' +
        '<div class="bottom-bar-controls">' +
          '<button class="skip-btn" onpointerdown="ttsStartHoldSkip(-15)" onpointerup="ttsStopHoldSkip()" onpointerleave="ttsStopHoldSkip()" title="Rewind 15s (hold to scan)" id="tts-prev-btn"><svg><use href="#i-backward"/></svg><span class="skip-label">15</span></button>' +
          '<button class="bottom-bar-play" onclick="ttsTogglePlay()" title="Play/Pause" id="tts-play-btn"><svg><use href="#i-play"/></svg></button>' +
          '<button class="skip-btn" onpointerdown="ttsStartHoldSkip(15)" onpointerup="ttsStopHoldSkip()" onpointerleave="ttsStopHoldSkip()" title="Forward 15s (hold to scan)" id="tts-next-btn"><svg><use href="#i-forward"/></svg><span class="skip-label">15</span></button>' +
        '</div>' +
        '<div class="bottom-bar-progress-row">' +
          '<span class="audio-time" id="tts-time-current">0:00</span>' +
          '<div class="audio-progress-wrap" id="audio-progress-wrap">' +
            '<div class="audio-progress"><div class="audio-progress-fill" id="tts-progress"></div></div>' +
          '</div>' +
          '<span class="audio-time" id="tts-time-total">0:00</span>' +
        '</div>' +
        '<div class="bottom-bar-right">' +
          '<button class="audio-speed-btn" onclick="ttsToggleSpeedSlider()" title="Playback speed" id="tts-speed-btn">1x</button>' +
          '<button class="bottom-bar-queue-btn" onclick="toggleBottomBarQueue()" title="Queue" id="bottom-bar-queue-toggle"><svg><use href="#i-queue"/></svg></button>' +
          '<button class="bottom-bar-settings-btn" onclick="showSettingsPage(\'settings-voice\')" title="Voice settings"><svg><use href="#i-sliders"/></svg></button>' +
          '<button class="bottom-bar-close-btn" onclick="ttsDismissPlayer()" title="Close player"><svg><use href="#i-xmark"/></svg></button>' +
        '</div>' +
      '</div>' +
      '<div class="bottom-bar-queue" id="audio-queue-section" style="display:none">' +
        '<div class="audio-queue-header">' +
          '<span>Queue</span>' +
          '<button class="audio-queue-clear" onclick="ttsClearQueue()">Clear</button>' +
        '</div>' +
        '<div id="audio-queue-list"></div>' +
      '</div>';

    this._initProgressDrag();
  }

  /** Set up mouse/touch drag on the progress bar for seeking */
  _initProgressDrag() {
    var wrap = this.querySelector('#audio-progress-wrap');
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

  /** Toggle the speed slider popup open/closed */
  _toggleSpeedSlider() {
    if (this._speedPopup) { this._closeSpeedSlider(); return; }

    var btn = this.querySelector('#tts-speed-btn');
    var rect = btn.getBoundingClientRect();
    var count = TTS_SPEEDS.length;

    var popup = document.createElement('div');
    popup.className = 'tts-speed-popup';

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

    var popW = popup.offsetWidth;
    var popH = popup.offsetHeight;
    var left = rect.left + rect.width / 2 - popW / 2;
    var top = rect.top - popH - 6;
    if (left < 4) left = 4;
    if (top < 4) { top = rect.bottom + 6; }
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    this._positionThumb();
    this._speedPopup = popup;

    // Drag handling
    var trackWrap = document.getElementById('tts-speed-track-wrap');
    var self = this;

    function onDrag(clientY) {
      var trackRect = trackWrap.getBoundingClientRect();
      var pct = (clientY - trackRect.top) / trackRect.height;
      pct = Math.max(0, Math.min(1, pct));
      var idx = Math.round((1 - pct) * (count - 1));
      idx = Math.max(0, Math.min(count - 1, idx));
      ttsSetSpeed(TTS_SPEEDS[idx]);
      self._positionThumb();
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
    this._speedOutsideClick = function(e) {
      if (self._speedPopup && !self._speedPopup.contains(e.target) && e.target.id !== 'tts-speed-btn') {
        self._closeSpeedSlider();
      }
    };
    setTimeout(function() {
      document.addEventListener('mousedown', self._speedOutsideClick);
      document.addEventListener('touchstart', self._speedOutsideClick);
    }, 0);
  }

  /** Close the speed slider popup */
  _closeSpeedSlider() {
    if (this._speedPopup) {
      this._speedPopup.remove();
      this._speedPopup = null;
    }
    if (this._speedOutsideClick) {
      document.removeEventListener('mousedown', this._speedOutsideClick);
      document.removeEventListener('touchstart', this._speedOutsideClick);
      this._speedOutsideClick = null;
    }
  }

  /** Position the speed slider thumb to match current ttsSpeed */
  _positionThumb() {
    var thumb = document.getElementById('tts-speed-thumb');
    if (!thumb) return;
    var idx = TTS_SPEEDS.indexOf(ttsSpeed);
    if (idx < 0) idx = TTS_SPEEDS.indexOf(1.0);
    var pct = 1 - idx / (TTS_SPEEDS.length - 1);
    thumb.style.top = (pct * 100) + '%';
  }

  /** Update all player DOM elements from TTS state */
  update(state) {
    var queue = state.queue || [];
    var currentIndex = state.currentIndex;
    var playing = state.playing;
    var generating = state.generating;

    // Fire custom events when state changes
    if (queue.length !== this._lastQueueLen) {
      this._lastQueueLen = queue.length;
      this.dispatchEvent(new CustomEvent('pr-player:queue-change', {
        bubbles: true, detail: { length: queue.length }
      }));
    }
    if (currentIndex !== this._lastIndex) {
      this._lastIndex = currentIndex;
      var item = (currentIndex >= 0 && currentIndex < queue.length) ? queue[currentIndex] : null;
      this.dispatchEvent(new CustomEvent('pr-player:now-playing', {
        bubbles: true, detail: item ? { filename: item.filename, title: item.title } : null
      }));
    }

    var app = document.querySelector('.app');

    if (queue.length === 0) {
      this.classList.add('hidden');
      if (app) app.classList.remove('has-bottom-bar');
      return;
    }
    this.classList.remove('hidden');
    if (app) app.classList.add('has-bottom-bar');

    var label = this.querySelector('#audio-now-label');
    var status = this.querySelector('#audio-now-status');
    var playBtn = this.querySelector('#tts-play-btn');

    var currentItem = (currentIndex >= 0 && currentIndex < queue.length) ? queue[currentIndex] : null;
    if (label) label.textContent = currentItem ? currentItem.title : 'No article playing';

    // Update artwork: article image > favicon > volume icon
    var artworkEl = this.querySelector('#bottom-bar-artwork');
    if (artworkEl) {
      var artSrc = '';
      if (currentItem) {
        if (currentItem.image) artSrc = currentItem.image;
        else if (currentItem.domain) artSrc = '/favicons/' + encodeURIComponent(currentItem.domain) + '.png';
      }
      var fallbackIcon = '<svg class="bottom-bar-icon" aria-hidden="true"><use href="#i-volume"/></svg>';
      if (artSrc) {
        var img = new Image();
        img.src = artSrc;
        img.alt = '';
        img.onerror = function() { artworkEl.innerHTML = fallbackIcon; };
        artworkEl.innerHTML = '';
        artworkEl.appendChild(img);
      } else {
        artworkEl.innerHTML = fallbackIcon;
      }
    }

    if (status) {
      if (generating) {
        status.textContent = 'Generating\u2026';
      } else if (playing) {
        status.textContent = 'Playing';
      } else if (currentIndex >= 0) {
        status.textContent = 'Paused';
      } else {
        status.textContent = '';
      }
    }

    if (playBtn) {
      playBtn.innerHTML = playing
        ? '<svg><use href="#i-pause"/></svg>'
        : '<svg><use href="#i-play"/></svg>';
    }

    // Render queue
    var queueSection = this.querySelector('#audio-queue-section');
    var queueList = this.querySelector('#audio-queue-list');
    var queueToggle = this.querySelector('#bottom-bar-queue-toggle');
    if (queue.length > 1) {
      if (queueToggle) queueToggle.classList.add('active');
      if (queueList) {
        queueList.innerHTML = queue.map(function(item, i) {
          return '<div class="audio-queue-item' + (i === currentIndex ? ' playing' : '') + '" onclick="playTTSItem(' + i + ')">'
            + '<span style="font-size:10px;color:var(--muted);width:14px;text-align:center">' + (i === currentIndex ? '&#9654;' : (i + 1)) + '</span>'
            + '<span class="queue-title">' + escapeHtml(item.title) + '</span>'
            + '<button class="queue-remove" onclick="event.stopPropagation();removeTTSQueueItem(' + i + ')" title="Remove">&times;</button>'
            + '</div>';
        }).join('');
      }
    } else {
      if (queueToggle) queueToggle.classList.remove('active');
      if (queueSection) queueSection.style.display = 'none';
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    // Stub for future mode switching (expanded, mini, etc.)
  }
}

customElements.define('pr-player', PrPlayer);
