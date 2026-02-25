// ABOUTME: Custom element <pr-player> that renders the TTS audio player bottom bar.
// ABOUTME: Produces identical DOM to the former static HTML so existing CSS and JS selectors work.

class PrPlayer extends HTMLElement {
  static get observedAttributes() { return ['mode']; }

  constructor() {
    super();
  }

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
  }

  attributeChangedCallback(name, oldVal, newVal) {
    // Stub for future mode switching (expanded, mini, etc.)
  }
}

customElements.define('pr-player', PrPlayer);
