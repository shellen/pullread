// ABOUTME: Web Component for the TTS audio player panel in the sidebar
// ABOUTME: Encapsulates player UI, progress bar, queue display in Shadow DOM

// Inline SVG paths (extracted from the icon sprite, since Shadow DOM can't access parent SVGs)
var _apIcons = {
  volume: '<svg viewBox="0 0 640 512"><path d="M533.6 32.5C598.5 85.2 640 165.8 640 256s-41.5 170.7-106.4 223.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C557.5 398.2 592 331.2 592 256s-34.5-142.2-88.7-186.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zM473.1 107c43.2 35.2 70.9 88.9 70.9 149s-27.7 113.8-70.9 149c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C475.3 341.3 496 301.1 496 256s-20.7-85.3-53.2-111.8c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zm-60.5 74.5C434.1 199.1 448 225.9 448 256s-13.9 56.9-35.4 74.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C393.1 284.4 400 271 400 256s-6.9-28.4-17.7-37.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zM301.1 34.8C312.6 40 320 51.4 320 64l0 384c0 12.6-7.4 24-18.9 29.2s-25 3.1-34.4-5.3L131.8 352 64 352c-35.3 0-64-28.7-64-64l0-64c0-35.3 28.7-64 64-64l67.8 0L266.7 40.1c9.4-8.4 22.9-10.4 34.4-5.3z"/></svg>',
  play: '<svg viewBox="0 0 384 512"><path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80V432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.8 23-24.2 23-41s-8.7-32.2-23-41L73 39z"/></svg>',
  pause: '<svg viewBox="0 0 320 512"><path d="M48 64C21.5 64 0 85.5 0 112V400c0 26.5 21.5 48 48 48h32c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H48zm192 0c-26.5 0-48 21.5-48 48V400c0 26.5 21.5 48 48 48h32c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H240z"/></svg>',
  backward: '<svg viewBox="0 0 512 512"><path d="M459.5 440.6c9.5 7.9 22.8 9.7 34.1 4.4S512 428.4 512 416V96c0-12.4-7.2-23.7-18.4-29s-24.5-3.6-34.1 4.4L288 214.3V96c0-12.4-7.2-23.7-18.4-29s-24.5-3.6-34.1 4.4l-192 160C36.2 237.5 32 246.5 32 256s4.2 18.5 11.5 24.6l192 160c9.5 7.9 22.8 9.7 34.1 4.4S288 428.4 288 416V297.7L459.5 440.6z"/></svg>',
  forward: '<svg viewBox="0 0 512 512"><path d="M52.5 440.6c-9.5 7.9-22.8 9.7-34.1 4.4S0 428.4 0 416V96C0 83.6 7.2 72.3 18.4 67s24.5-3.6 34.1 4.4L224 214.3V96c0-12.4 7.2-23.7 18.4-29s24.5-3.6 34.1 4.4l192 160c7.3 6.1 11.5 15.1 11.5 24.6s-4.2 18.5-11.5 24.6l-192 160c-9.5 7.9-22.8 9.7-34.1 4.4S224 428.4 224 416V297.7L52.5 440.6z"/></svg>'
};

var _apStyles = ''
  + ':host { display: block; background: color-mix(in srgb, var(--fg) 3%, transparent); margin: 4px 8px; border-radius: 8px; padding: 10px 12px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 12px; }'
  + ':host([hidden]) { display: none; }'
  + '.now-playing { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }'
  + '.now-icon { width: 12px; height: 12px; fill: currentColor; flex-shrink: 0; opacity: 0.5; }'
  + '.now-icon svg { width: 100%; height: 100%; }'
  + '.now-label { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; color: var(--fg); font-size: 11px; }'
  + '.now-status { font-size: 10px; color: var(--muted); flex-shrink: 0; }'
  + '.controls { display: flex; align-items: center; gap: 2px; }'
  + '.controls button { border: none; background: none; color: var(--fg); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; }'
  + '.controls button:hover { background: var(--sidebar-hover); }'
  + '.controls svg { width: 14px; height: 14px; fill: currentColor; }'
  + '.progress-wrap { flex: 1; height: 20px; display: flex; align-items: center; cursor: pointer; padding: 0 4px; }'
  + '.progress { width: 100%; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }'
  + '.progress-fill { height: 100%; background: var(--link); border-radius: 2px; width: 0%; transition: width 0.2s linear; }'
  + '.time { font-size: 10px; color: var(--muted); min-width: 32px; text-align: center; flex-shrink: 0; }'
  + '.speed-btn { font-size: 10px !important; font-weight: 600; padding: 2px 6px !important; border: 1px solid var(--border) !important; border-radius: 4px; min-width: 36px; text-align: center; }'
  + '.queue-section { margin-top: 6px; border-top: 1px solid var(--border); padding-top: 6px; }'
  + '.queue-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }'
  + '.queue-clear { cursor: pointer; font-size: 10px; color: var(--muted); background: none; border: none; text-transform: none; letter-spacing: 0; }'
  + '.queue-clear:hover { color: var(--fg); }'
  + '.queue-item { display: flex; align-items: center; padding: 3px 4px; border-radius: 3px; gap: 6px; font-size: 11px; color: var(--fg); cursor: pointer; }'
  + '.queue-item:hover { background: var(--sidebar-hover); }'
  + '.queue-item.playing { font-weight: 600; color: var(--link); }'
  + '.queue-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }'
  + '.queue-remove { opacity: 0; cursor: pointer; color: var(--muted); font-size: 13px; flex-shrink: 0; background: none; border: none; padding: 0 2px; line-height: 1; }'
  + '.queue-item:hover .queue-remove { opacity: 0.7; }'
  + '.queue-remove:hover { opacity: 1; color: var(--fg); }'
  + '.settings-link { display: block; text-align: center; font-size: 10px; color: var(--muted); cursor: pointer; margin-top: 6px; background: none; border: none; width: 100%; }'
  + '.settings-link:hover { color: var(--link); }';

class PrAudioPlayer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._queue = [];
    this._currentIndex = -1;
    this._playing = false;
    this._generating = false;
    this._speed = 1.0;
  }

  connectedCallback() {
    this._buildDOM();
    this.shadowRoot.addEventListener('click', this._onClick.bind(this));
  }

  // Build the static DOM structure once, then update parts as needed
  _buildDOM() {
    this.shadowRoot.innerHTML = '<style>' + _apStyles + '</style>'
      + '<div class="now-playing">'
      + '  <span class="now-icon">' + _apIcons.volume + '</span>'
      + '  <span class="now-label" id="label">No article queued</span>'
      + '  <span class="now-status" id="status"></span>'
      + '</div>'
      + '<div class="controls">'
      + '  <button data-action="skip-prev" title="Previous">' + _apIcons.backward + '</button>'
      + '  <button data-action="toggle-play" title="Play/Pause" id="play-btn">' + _apIcons.play + '</button>'
      + '  <button data-action="skip-next" title="Next">' + _apIcons.forward + '</button>'
      + '  <span class="time" id="time-current">0:00</span>'
      + '  <div class="progress-wrap" data-action="seek">'
      + '    <div class="progress"><div class="progress-fill" id="progress"></div></div>'
      + '  </div>'
      + '  <span class="time" id="time-total">0:00</span>'
      + '  <button class="speed-btn" data-action="cycle-speed" title="Playback speed" id="speed-btn">1x</button>'
      + '</div>'
      + '<div class="queue-section" id="queue-section" style="display:none">'
      + '  <div class="queue-header"><span>Queue</span><button class="queue-clear" data-action="clear-queue">Clear</button></div>'
      + '  <div id="queue-list"></div>'
      + '</div>'
      + '<button class="settings-link" data-action="show-settings">Voice Playback Settings</button>';

    // Cache references to frequently updated elements
    this._els = {
      label: this.shadowRoot.getElementById('label'),
      status: this.shadowRoot.getElementById('status'),
      playBtn: this.shadowRoot.getElementById('play-btn'),
      progress: this.shadowRoot.getElementById('progress'),
      timeCurrent: this.shadowRoot.getElementById('time-current'),
      timeTotal: this.shadowRoot.getElementById('time-total'),
      speedBtn: this.shadowRoot.getElementById('speed-btn'),
      queueSection: this.shadowRoot.getElementById('queue-section'),
      queueList: this.shadowRoot.getElementById('queue-list')
    };
  }

  // --- Public methods called by TTS code ---

  /** Full state update — call after queue/playback state changes */
  update(state) {
    this._queue = state.queue || [];
    this._currentIndex = state.currentIndex;
    this._playing = state.playing;
    this._generating = state.generating;

    // Visibility
    if (this._queue.length === 0) {
      this.setAttribute('hidden', '');
      return;
    }
    this.removeAttribute('hidden');

    // Now-playing label
    if (this._currentIndex >= 0 && this._currentIndex < this._queue.length) {
      this._els.label.textContent = this._queue[this._currentIndex].title;
    } else {
      this._els.label.textContent = 'No article playing';
    }

    // Status
    if (this._generating) {
      this._els.status.textContent = 'Generating...';
    } else if (this._playing) {
      this._els.status.textContent = 'Playing';
    } else if (this._currentIndex >= 0) {
      this._els.status.textContent = 'Paused';
    } else {
      this._els.status.textContent = '';
    }

    // Play/pause icon
    this._els.playBtn.innerHTML = this._playing ? _apIcons.pause : _apIcons.play;

    // Queue list
    if (this._queue.length > 1) {
      this._els.queueSection.style.display = '';
      var currentIdx = this._currentIndex;
      var items = this._queue.map(function(item, i) {
        var isCurrent = i === currentIdx;
        var indexLabel = isCurrent ? '&#9654;' : (i + 1);
        return '<div class="queue-item' + (isCurrent ? ' playing' : '') + '" data-action="play-item" data-index="' + i + '">'
          + '<span style="font-size:10px;color:var(--muted);width:14px;text-align:center">' + indexLabel + '</span>'
          + '<span class="queue-title"></span>'
          + '<button class="queue-remove" data-action="remove-item" data-index="' + i + '" title="Remove">&times;</button>'
          + '</div>';
      });
      this._els.queueList.innerHTML = items.join('');
      // Set titles via textContent to avoid XSS
      var titleEls = this._els.queueList.querySelectorAll('.queue-title');
      for (var i = 0; i < this._queue.length; i++) {
        titleEls[i].textContent = this._queue[i].title;
      }
    } else {
      this._els.queueSection.style.display = 'none';
    }
  }

  /** Lightweight progress update — called frequently from timers */
  setProgress(percent, currentTimeText, totalTimeText) {
    if (this._els) {
      if (percent !== undefined) this._els.progress.style.width = percent + '%';
      if (currentTimeText !== undefined) this._els.timeCurrent.textContent = currentTimeText;
      if (totalTimeText !== undefined) this._els.timeTotal.textContent = totalTimeText;
    }
  }

  /** Update speed display */
  setSpeed(speed) {
    this._speed = speed;
    if (this._els) this._els.speedBtn.textContent = speed + 'x';
  }

  // --- Event handling ---

  _onClick(e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;
    var action = target.dataset.action;
    var index = target.dataset.index !== undefined ? parseInt(target.dataset.index) : -1;

    switch (action) {
      case 'toggle-play':
        this.dispatchEvent(new CustomEvent('tts-toggle-play', { bubbles: true, composed: true }));
        break;
      case 'skip-prev':
        this.dispatchEvent(new CustomEvent('tts-skip-prev', { bubbles: true, composed: true }));
        break;
      case 'skip-next':
        this.dispatchEvent(new CustomEvent('tts-skip-next', { bubbles: true, composed: true }));
        break;
      case 'seek':
        var wrap = target.closest('.progress-wrap') || target;
        var rect = wrap.getBoundingClientRect();
        var pct = (e.clientX - rect.left) / rect.width;
        this.dispatchEvent(new CustomEvent('tts-seek', { detail: { percent: pct }, bubbles: true, composed: true }));
        break;
      case 'cycle-speed':
        this.dispatchEvent(new CustomEvent('tts-cycle-speed', { bubbles: true, composed: true }));
        break;
      case 'play-item':
        if (index >= 0) this.dispatchEvent(new CustomEvent('tts-play-item', { detail: { index: index }, bubbles: true, composed: true }));
        break;
      case 'remove-item':
        e.stopPropagation();
        if (index >= 0) this.dispatchEvent(new CustomEvent('tts-remove-item', { detail: { index: index }, bubbles: true, composed: true }));
        break;
      case 'clear-queue':
        this.dispatchEvent(new CustomEvent('tts-clear-queue', { bubbles: true, composed: true }));
        break;
      case 'show-settings':
        this.dispatchEvent(new CustomEvent('tts-show-settings', { bubbles: true, composed: true }));
        break;
    }
  }
}

customElements.define('pr-audio-player', PrAudioPlayer);
