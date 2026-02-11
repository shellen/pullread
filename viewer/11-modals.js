// Shortcuts modal
function showShortcutsModal() {
  closeModal();
  _modalReturnFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Keyboard shortcuts');
  overlay.onclick = function(e) { if (e.target === overlay) closeModal(); };
  overlay.innerHTML = `
    <div class="modal-card" onclick="event.stopPropagation()">
      <h2>Keyboard Shortcuts</h2>
      <div class="shortcuts-grid">
        <kbd>j</kbd> / <kbd>&rarr;</kbd> <span>Next article</span>
        <kbd>k</kbd> / <kbd>&larr;</kbd> <span>Previous article</span>
        <kbd>&uarr;</kbd> <kbd>&darr;</kbd> <span>Scroll (jumps articles at edges)</span>
        <kbd>/</kbd> <span>Search articles</span>
        <kbd>[</kbd> <span>Toggle sidebar</span>
        <kbd>h</kbd> <span>Highlight selected text</span>
        <kbd>n</kbd> <span>Toggle article notes</span>
        <kbd>a</kbd> <span>Add article by URL</span>
        <kbd>f</kbd> <span>Toggle focus mode</span>
        <kbd>p</kbd> <span>Print article</span>
        <kbd>Esc</kbd> <span>Clear search / close popover</span>
      </div>
      <h3 style="font-size:13px;margin:14px 0 6px;color:var(--muted)">Audio Playback</h3>
      <div class="shortcuts-grid">
        <kbd>Space</kbd> <span>Play / pause audio</span>
        <kbd>&gt;</kbd> <span>Skip to next track</span>
        <kbd>&lt;</kbd> <span>Skip to previous track</span>
        <kbd>s</kbd> <span>Cycle playback speed</span>
      </div>
      <button class="modal-close" onclick="closeModal()">Done</button>
    </div>
  `;
  document.body.appendChild(overlay);
  trapFocus(overlay);
  overlay.querySelector('.modal-close').focus();
}

// Guide — renders as an inline article in the content pane
function showGuideModal() {
  const content = document.getElementById('content');
  const empty = document.getElementById('empty-state');
  empty.style.display = 'none';
  content.style.display = 'block';

  // Deselect sidebar and clear overlays
  activeFile = null;
  document.getElementById('margin-notes').innerHTML = '';
  renderFileList();

  content.innerHTML = `
    <div class="article-header">
      <h1>PullRead Guide</h1>
      <div class="article-byline"><span>Last updated ${new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span></div>
    </div>

    <h2>What is PullRead?</h2>
    <p>PullRead syncs your bookmarks and RSS feeds into clean markdown files you can read, search, highlight, and keep forever. Articles are stored locally on your Mac.</p>

    <h2>Dashboard</h2>
    <p>When you first open PullRead, the dashboard shows a personalized overview of your reading: articles you're in the middle of, recent reviews, favorites, and the latest additions. Click any card to jump straight to that article, or click the PullRead logo to return to the dashboard.</p>

    <h2>How does syncing work?</h2>
    <p>PullRead fetches new items from your configured feeds (Instapaper, Pinboard, Raindrop, RSS, etc.) and extracts the article content into markdown. You can sync manually from the menu bar, or set an automatic interval in Settings (every 30 min, 1 hour, 4 hours, or 12 hours).</p>

    <h2>What are reviews?</h2>
    <p>Reviews are AI-generated thematic summaries of your recent reading. You can schedule them daily or weekly in Settings. Daily reviews cover the past 24 hours; weekly reviews cover the past 7 days. They require a configured LLM provider (Anthropic, OpenAI, Gemini, OpenRouter, or Apple Intelligence).</p>

    <h2>Search Operators</h2>
    <p>The search bar supports powerful operators to narrow down your article list:</p>
    <table>
      <thead><tr><th>Operator</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><code>is:favorite</code></td><td>Favorited articles (also <code>is:fav</code>)</td></tr>
        <tr><td><code>is:read</code> / <code>is:unread</code></td><td>Filter by read status</td></tr>
        <tr><td><code>has:summary</code></td><td>Articles with AI summaries</td></tr>
        <tr><td><code>has:highlights</code></td><td>Articles with highlights</td></tr>
        <tr><td><code>has:notes</code></td><td>Articles with notes or annotations</td></tr>
        <tr><td><code>has:tags</code></td><td>Articles with any tags</td></tr>
        <tr><td><code>tag:value</code></td><td>Filter by a specific tag</td></tr>
        <tr><td><code>feed:value</code></td><td>Filter by feed name</td></tr>
        <tr><td><code>domain:value</code></td><td>Filter by source domain</td></tr>
        <tr><td><code>author:value</code></td><td>Filter by author name</td></tr>
      </tbody>
    </table>
    <p>Combine operators with spaces for AND logic (<code>is:fav tag:tech</code>), or use <code>OR</code> between groups (<code>tag:ai OR tag:ml</code>). Wrap multi-word searches in quotes (<code>"machine learning"</code>). Plain text searches title, domain, feed, and tags.</p>

    <h2>Highlights &amp; Notes</h2>
    <p>Select any text and press <strong>h</strong> to highlight it, or use the floating toolbar to choose a color. Click a highlight to add a note. Press <strong>n</strong> to open the notes panel for article-level notes, tags, and favorites.</p>

    <h2>Voice Notes</h2>
    <p>Click the microphone icon next to the notes textarea to dictate notes hands-free. Speech is transcribed in real-time using the Web Speech API and automatically saved to your article notes when you stop recording.</p>

    <h2>Summaries</h2>
    <p>Click the Summarize button on any article to generate an AI summary. Summaries display with badges showing which provider and model generated them (e.g., <span class="badge badge-amber">Anthropic</span> <span class="badge badge-gray">claude-haiku-4.5</span>). Summaries are saved in the article frontmatter so they persist across sessions. Supports Anthropic, OpenAI, Gemini, OpenRouter, and Apple Intelligence.</p>

    <h2>Text-to-Speech</h2>
    <p>Click the <strong>Listen</strong> button on any article to hear it read aloud. Queue multiple articles for continuous playback with speed control (0.5x&ndash;2x).</p>
    <table>
      <thead><tr><th>Provider</th><th>Cost</th><th>Notes</th></tr></thead>
      <tbody>
        <tr><td>Browser</td><td>Free</td><td>Built-in speech synthesis, works offline</td></tr>
        <tr><td>Kokoro</td><td>Free</td><td>Local AI voice (~86MB model, auto-downloads)</td></tr>
        <tr><td>OpenAI</td><td>~$0.15/article</td><td>Cloud API, bring your own key</td></tr>
        <tr><td>ElevenLabs</td><td>~$1.20/article</td><td>Cloud API, bring your own key</td></tr>
      </tbody>
    </table>
    <p>Configure in Voice Playback Settings (at the bottom of the audio player). Paid providers require a separate API key — never shared with your Summaries key. Audio is cached locally after first listen.</p>

    <h2>Export &amp; Sharing</h2>
    <p>Click the share icon on any article to send it to Bluesky, Threads, LinkedIn, email, or Messages. Use <strong>Export Markdown</strong> to download or copy the article as a .md file — choose which sections to include (summary, highlights, notes, tags).</p>

    <h2>Notebook</h2>
    <p>Write synthesis notes, reflections, or essays using the built-in Notebook. Click the <strong>Notebook</strong> tab in the sidebar to create and manage notebooks. Insert highlights from articles, tag notebooks, and use <strong>Focus Mode</strong> for a full-screen, distraction-free writing experience inspired by iA Writer. Export notebooks as .md files or open them directly in external editors like Obsidian or Bear.</p>

    <h2>Focus Mode</h2>
    <p>Press <strong>f</strong> or click the half-circle icon in the toolbar to enter Focus Mode. This dims all content except the paragraph you're currently reading, helping you concentrate on one section at a time.</p>

    <h2>Reading Progress</h2>
    <p>A thin progress bar at the top tracks how far you've read. Each article also shows estimated read time and word count in the header. Your reading position is automatically saved so you can pick up where you left off.</p>

    <h2>Table of Contents</h2>
    <p>On wide screens, articles with 3 or more headings show an auto-generated table of contents on the left. Click any heading to jump to that section. The active section is highlighted as you scroll.</p>

    <h2>Themes &amp; Fonts</h2>
    <p>Click the gear icon to switch between Light, Dark, Sepia, and High Contrast themes. Choose from fonts including Inter, Lora, Source Serif, Work Sans, and OpenDyslexic. Adjust text size, line height, letter spacing, and content width. Preferences are saved automatically.</p>

    <h2>Machine Tags &amp; Explore</h2>
    <p>PullRead can auto-generate topic, entity, and theme tags using your configured AI provider. Tags power relational mapping — discover connections between articles through the <strong>Explore</strong> page. Use the auto-tagging buttons on the Explore page's Discover tab, or enable auto-tagging after sync in the macOS app settings.</p>

    <h2>Apple News &amp; Social Posts</h2>
    <p>PullRead resolves Apple News links (apple.news) to their original article URLs. Social posts from X/Twitter, Bluesky, Mastodon, Reddit, and Hacker News are extracted with special handling to preserve the post structure.</p>

    <h2>Browser Cookies</h2>
    <p>Enable browser cookies in Settings to access paywalled content from sites like NYTimes or WSJ. PullRead supports <strong>Chrome, Arc, Brave, and Edge</strong>. Cookies stay on your Mac and are never uploaded.</p>

    <h2>Importing Bookmarks</h2>
    <p>Import bookmarks.html files exported from Chrome, Safari, Firefox, or Pocket directly from Settings or via the CLI with <code>pullread import &lt;file&gt;</code>.</p>

    <h2>Keyboard Shortcuts</h2>
    <table>
      <thead><tr><th>Key</th><th>Action</th></tr></thead>
      <tbody>
        <tr><td><kbd>j</kbd> / <kbd>&rarr;</kbd></td><td>Next article</td></tr>
        <tr><td><kbd>k</kbd> / <kbd>&larr;</kbd></td><td>Previous article</td></tr>
        <tr><td><kbd>&uarr;</kbd> <kbd>&darr;</kbd></td><td>Scroll (jumps articles at edges)</td></tr>
        <tr><td><kbd>/</kbd></td><td>Search articles</td></tr>
        <tr><td><kbd>[</kbd></td><td>Toggle sidebar</td></tr>
        <tr><td><kbd>h</kbd></td><td>Highlight selected text</td></tr>
        <tr><td><kbd>n</kbd></td><td>Toggle article notes</td></tr>
        <tr><td><kbd>f</kbd></td><td>Toggle focus mode</td></tr>
        <tr><td><kbd>p</kbd></td><td>Print article</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Clear search / close popover</td></tr>
      </tbody>
    </table>

    <h3>Audio Playback (when player is visible)</h3>
    <table>
      <thead><tr><th>Key</th><th>Action</th></tr></thead>
      <tbody>
        <tr><td><kbd>Space</kbd></td><td>Play / pause audio</td></tr>
        <tr><td><kbd>&gt;</kbd></td><td>Skip to next track</td></tr>
        <tr><td><kbd>&lt;</kbd></td><td>Skip to previous track</td></tr>
        <tr><td><kbd>s</kbd></td><td>Cycle playback speed</td></tr>
      </tbody>
    </table>

    <h2>FAQ</h2>

    <h3>Where are my articles stored?</h3>
    <p>Articles are saved as markdown files in the output folder you configure in Settings (e.g., <code>~/Dropbox/Articles</code>). They're plain text files you can open in any editor. Highlights, notes, and settings are stored in <code>~/.config/pullread/</code>.</p>

    <h3>Do I need an API key?</h3>
    <p>Only for AI features (summaries, auto-tagging, reviews, and paid TTS). Reading, highlighting, searching, and browser TTS are all free with no API key. Apple Intelligence (macOS 26+) works without a key too.</p>

    <h3>Is my data sent anywhere?</h3>
    <p>Articles stay on your Mac. Data is only sent to an API when you explicitly use summaries, auto-tagging, or cloud TTS providers (OpenAI/ElevenLabs). Kokoro TTS and browser TTS are fully local. API keys are stored locally and never shared between features (your Summaries key is separate from your TTS key).</p>

    <h3>Why can't PullRead extract some articles?</h3>
    <p>Some sites use paywalls, bot detection, or JavaScript-only rendering that blocks extraction. Try enabling browser cookies in Settings to use your existing login sessions. You can also retry failed articles with <code>pullread sync --retry-failed</code>.</p>

    <h3>How do I reset my reading history?</h3>
    <p>Reading history is stored in your browser's localStorage. Clear it by opening developer tools (Cmd+Option+I), going to Application &rarr; Local Storage, and removing the <code>pr-read-articles</code> key.</p>

    <h3>Can I use PullRead without the macOS app?</h3>
    <p>Yes. The CLI works standalone on any platform with Node.js/Bun. Run <code>pullread view</code> to launch the article reader in your browser.</p>

    <h3>Am I allowed to save articles?</h3>
    <p>Pull Read is intended for personal reading and archival. You are responsible for ensuring your use complies with applicable copyright laws and the terms of service of any websites you access. Only sync content you are authorized to copy. Do not use Pull Read to redistribute or commercially exploit content you do not have rights to.</p>

    <h3>What happens when I use AI summaries?</h3>
    <p>When you click Summarize, article text is sent to your selected LLM provider (Anthropic, OpenAI, Gemini, or OpenRouter) using your own API key. Apple Intelligence processes entirely on-device. Summaries are saved locally in the article's frontmatter. The same applies to auto-tagging and weekly reviews.</p>

    <h2>Open Source Licenses</h2>
    <p>PullRead uses open-source software including <strong>Kokoro TTS</strong> (Apache 2.0, by hexgrad), <strong>ONNX Runtime</strong> (MIT, by Microsoft), <strong>Mozilla Readability</strong> (Apache 2.0), <strong>Turndown</strong> (MIT), <strong>marked</strong> (MIT), and <strong>highlight.js</strong> (BSD 3-Clause). Kokoro was trained on audio data including Koniwa (CC BY 3.0) and SIWIS (CC BY 4.0). Full license texts are included in the app bundle at <code>Contents/Resources/Licenses/</code>.</p>
  `;
  document.title = 'PullRead Guide';
  document.getElementById('content-pane').scrollTop = 0;
  generateToc();
}

function closeModal() {
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) overlay.remove();
  if (_modalReturnFocus) { _modalReturnFocus.focus(); _modalReturnFocus = null; }
}


// ---- Onboarding Wizard ----
let _obStep = 0;
let _obFeeds = {}; // { name: url }
let _obOutputPath = '~/Documents/PullRead';
let _obCookies = false;
let _obFeedLoading = false;
const OB_TOTAL_STEPS = 5;

function dismissOnboarding() {
  document.getElementById('onboarding').style.display = 'none';
  localStorage.setItem('pr-onboarded', '1');
}

async function showOnboardingIfNeeded() {
  if (localStorage.getItem('pr-onboarded')) return;
  // Check if already configured
  try {
    var r = await fetch('/api/config');
    var cfg = await r.json();
    if (cfg.configured) {
      localStorage.setItem('pr-onboarded', '1');
      return;
    }
    if (cfg.outputPath) _obOutputPath = cfg.outputPath;
    if (cfg.feeds) _obFeeds = cfg.feeds;
    if (cfg.useBrowserCookies) _obCookies = cfg.useBrowserCookies;
  } catch (e) {}
  _obStep = 0;
  document.getElementById('onboarding').style.display = 'flex';
  renderOnboardingStep();
}

function renderOnboardingStep() {
  var card = document.getElementById('onboarding-card');
  var progress = '<div class="ob-progress">';
  for (var i = 0; i < OB_TOTAL_STEPS; i++) {
    progress += '<div class="ob-progress-bar' + (i <= _obStep ? ' active' : '') + '"></div>';
  }
  progress += '</div>';

  var html = progress;

  if (_obStep === 0) {
    html += '<div style="text-align:center;padding:12px 0">'
      + '<div style="font-size:48px;margin-bottom:12px">&#128218;</div>'
      + '<h2>Welcome to PullRead</h2>'
      + '<p class="ob-subtitle">Install our bookmarking shortcut or use PullRead with your favorite service. Articles are saved as clean, local markdown you can read anywhere.</p>'
      + '<div class="ob-features">'
      + '<span class="ob-feature-pill">&#128278; Bookmark sync</span>'
      + '<span class="ob-feature-pill">&#128196; Markdown files</span>'
      + '<span class="ob-feature-pill">&#10024; AI summaries</span>'
      + '<span class="ob-feature-pill">&#128228; Share Extension</span>'
      + '</div>'
      + '</div>';
  } else if (_obStep === 1) {
    html += '<h2>Choose Output Folder</h2>'
      + '<p class="ob-subtitle">Synced articles are saved as markdown here. A cloud-synced folder like Dropbox or iCloud works great.</p>'
      + '<div class="ob-glass-card">'
      + '<label>Output path</label>'
      + '<div style="display:flex;gap:8px;align-items:center">'
      + '<input type="text" id="ob-output-path" value="' + escapeHtml(_obOutputPath) + '" placeholder="~/Documents/PullRead" style="flex:1">'
      + '<button onclick="pickOutputFolder(\'ob-output-path\')" style="white-space:nowrap;padding:7px 14px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;cursor:pointer;font-family:inherit">Choose\u2026</button>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:6px">Default: ~/Documents/PullRead</div>'
      + '</div>';
  } else if (_obStep === 2) {
    var feedNames = Object.keys(_obFeeds);
    html += '<h2>Connect Your Bookmarks</h2>'
      + '<p class="ob-subtitle">Paste the RSS feed URL from your bookmark service. PullRead syncs your saved articles and converts them to markdown.</p>'
      + '<div class="ob-glass-card">';
    if (feedNames.length > 0) {
      html += '<ul class="ob-feed-list">';
      for (var fi = 0; fi < feedNames.length; fi++) {
        var fn = feedNames[fi];
        html += '<li><div><div class="ob-feed-name">' + escapeHtml(fn) + '</div><div class="ob-feed-url">' + escapeHtml(_obFeeds[fn]) + '</div></div>'
          + '<button onclick="obRemoveFeed(\'' + escapeHtml(fn.replace(/'/g, "\\'")) + '\')" title="Remove">&times;</button></li>';
      }
      html += '</ul>';
    }
    html += '<div class="ob-feed-add">'
      + '<input type="text" id="ob-feed-url" placeholder="Paste bookmark feed URL or web address\u2026" onkeydown="if(event.key===\'Enter\')obAddFeed()">'
      + '<button onclick="obAddFeed()" id="ob-add-btn"' + (_obFeedLoading ? ' disabled' : '') + '>' + (_obFeedLoading ? 'Finding feed\u2026' : 'Add') + '</button>'
      + '</div>'
      + '</div>'
      + '<div class="ob-hint-list">'
      + '<div style="margin-bottom:8px;color:var(--fg);font-size:12px;font-weight:500">Where to find your feed URL:</div>'
      + '<div><strong>Instapaper</strong> Settings &rarr; Export &rarr; RSS Feed URL</div>'
      + '<div><strong>Pinboard</strong> pinboard.in/feeds/u:USERNAME/</div>'
      + '<div><strong>Raindrop</strong> Collection &rarr; Share &rarr; RSS Feed</div>'
      + '<div><strong>Pocket</strong> getpocket.com/users/USERNAME/feed/all</div>'
      + '</div>'
      + '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">'
      + '<div class="ob-hint-list">'
      + '<div style="margin-bottom:6px;color:var(--fg);font-size:12px;font-weight:500">You can also subscribe to newsletters and blogs:</div>'
      + '<div><strong>Substack</strong> Paste the newsletter URL, e.g. example.substack.com</div>'
      + '<div><strong>Ghost</strong> Paste the publication URL</div>'
      + '<div><strong>Buttondown</strong> Paste the newsletter URL</div>'
      + '<div><strong>WordPress</strong> Paste any blog URL \u2014 PullRead finds the feed</div>'
      + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;padding:10px 12px;background:color-mix(in srgb, var(--fg) 4%, transparent);border-radius:8px;font-size:12px;color:var(--muted)">'
      + '<span style="flex-shrink:0;font-size:14px">&#128196;</span>'
      + '<span>Each new post from a feed is saved as a separate file. Bookmark services only sync articles you save; newsletters sync every post.</span>'
      + '</div>';
  } else if (_obStep === 3) {
    html += '<h2>More Ways to Save</h2>'
      + '<p class="ob-subtitle">Beyond bookmark sync, there are other ways to get articles into PullRead.</p>'
      + '<div class="ob-glass-card">'
      + '<div class="ob-method"><div class="ob-method-icon">&#128278;</div><div><div class="ob-method-title">Bookmark Sync</div><div class="ob-method-desc">Your primary source. Bookmarks from Instapaper, Pinboard, Raindrop, and Pocket sync automatically on a schedule.</div></div></div>'
      + '<div class="ob-method"><div class="ob-method-icon">&#128228;</div><div><div class="ob-method-title">Share Extension</div><div class="ob-method-desc">In Safari or any app, tap Share &rarr; Save to PullRead. The article is fetched on next sync.</div></div></div>'
      + '<div class="ob-method"><div class="ob-method-icon">&#128433;</div><div><div class="ob-method-title">Services Menu</div><div class="ob-method-desc">Select any URL, then right-click &rarr; Services &rarr; Save to PullRead.</div></div></div>'
      + '<div class="ob-method"><div class="ob-method-icon">&#128225;</div><div><div class="ob-method-title">Newsletters &amp; Blogs</div><div class="ob-method-desc">Subscribe to any RSS feed \u2014 Substack, Ghost, Buttondown, WordPress, and more.</div></div></div>'
      + '</div>'
      + '<div class="ob-glass-card">'
      + '<div class="ob-toggle-row">'
      + '<label><strong>Use Chrome Cookies</strong><div class="ob-toggle-desc">Access paywalled sites using your Chrome login. Cookies stay local.</div></label>'
      + '<input type="checkbox" id="ob-cookies"' + (_obCookies ? ' checked' : '') + ' onchange="_obCookies=this.checked">'
      + '</div>'
      + '</div>';
  } else if (_obStep === 4) {
    html += '<div style="text-align:center;padding:12px 0">'
      + '<div style="font-size:48px;margin-bottom:12px">&#128640;</div>'
      + '<h2>Ready to Go</h2>'
      + '<p class="ob-subtitle">PullRead will fetch your bookmarked articles and save them as markdown. Sync anytime from the menu bar. Here are some keyboard shortcuts to get started:</p>'
      + '</div>'
      + '<div class="ob-shortcuts">'
      + '<kbd>j</kbd> / <kbd>&rarr;</kbd> <span>Next article</span>'
      + '<kbd>k</kbd> / <kbd>&larr;</kbd> <span>Previous article</span>'
      + '<kbd>/</kbd> <span>Search articles</span>'
      + '<kbd>[</kbd> <span>Toggle sidebar</span>'
      + '<kbd>h</kbd> <span>Highlight selected text</span>'
      + '<kbd>n</kbd> <span>Toggle article notes</span>'
      + '<kbd>f</kbd> <span>Toggle focus mode</span>'
      + '<kbd>Space</kbd> <span>Play / pause audio</span>'
      + '</div>';
  }

  // Navigation
  html += '<div class="ob-nav">';
  if (_obStep > 0) {
    html += '<button onclick="obBack()">Back</button>';
  } else {
    html += '<span></span>';
  }
  if (_obStep < OB_TOTAL_STEPS - 1) {
    html += '<button class="ob-primary" onclick="obNext()">Next</button>';
  } else {
    html += '<button class="ob-primary" onclick="obFinish()">Get Started</button>';
  }
  html += '</div>';

  card.innerHTML = html;
}

function obBack() {
  if (_obStep > 0) { _obStep--; renderOnboardingStep(); }
}

function obNext() {
  // Validate output path on step 1
  if (_obStep === 1) {
    var pathInput = document.getElementById('ob-output-path');
    if (pathInput) _obOutputPath = pathInput.value.trim();
    if (!_obOutputPath) { pathInput.focus(); return; }
  }
  if (_obStep < OB_TOTAL_STEPS - 1) { _obStep++; renderOnboardingStep(); }
}

async function obAddFeed() {
  var input = document.getElementById('ob-feed-url');
  var url = (input.value || '').trim();
  if (!url) return;
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  _obFeedLoading = true;
  renderOnboardingStep();
  try {
    var r = await fetch('/api/feed-discover?url=' + encodeURIComponent(url));
    var result = await r.json();
    var feedUrl = result.feedUrl || url;
    var title = result.title || feedUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    _obFeeds[title] = feedUrl;
  } catch (e) {
    _obFeeds[url] = url;
  }
  _obFeedLoading = false;
  renderOnboardingStep();
}

function obRemoveFeed(name) {
  delete _obFeeds[name];
  renderOnboardingStep();
}

async function obFinish() {
  // Save config via API
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outputPath: _obOutputPath,
        feeds: _obFeeds,
        useBrowserCookies: _obCookies
      })
    });
  } catch (e) {
    console.error('Failed to save onboarding config:', e);
  }
  dismissOnboarding();
  // Refresh article list after config is saved
  setTimeout(function() { refreshArticleList(); }, 500);
}

