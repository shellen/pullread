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
        <kbd>j</kbd> / <kbd>n</kbd> <span>Next article</span>
        <kbd>k</kbd> / <kbd>p</kbd> <span>Previous article</span>
        <kbd>Space</kbd> <span>Page down (next article at bottom)</span>
        <kbd>Shift</kbd>+<kbd>Space</kbd> <span>Page up</span>
        <kbd>&uarr;</kbd> <kbd>&darr;</kbd> <span>Scroll (jumps articles at edges)</span>
        <kbd>s</kbd> <span>Star / unstar article</span>
        <kbd>m</kbd> <span>Toggle read / unread</span>
        <kbd>v</kbd> <span>Open original in new tab</span>
        <kbd>r</kbd> <span>Refresh article list</span>
        <kbd>Shift</kbd>+<kbd>A</kbd> <span>Mark all as read</span>
        <kbd>/</kbd> <span>Search articles</span>
        <kbd>[</kbd> <span>Toggle sidebar</span>
        <kbd>h</kbd> <span>Highlight selected text</span>
        <kbd>Shift</kbd>+<kbd>N</kbd> <span>Toggle article notes</span>
        <kbd>a</kbd> <span>Add article by URL</span>
        <kbd>f</kbd> <span>Toggle focus mode</span>
        <kbd>?</kbd> <span>Show keyboard shortcuts</span>
        <kbd>Esc</kbd> <span>Clear search / close popover</span>
      </div>
      <h3 style="font-size:13px;margin:14px 0 6px;color:var(--muted)">Audio Playback</h3>
      <div class="shortcuts-grid">
        <kbd>&gt;</kbd> <span>Skip to next track</span>
        <kbd>&lt;</kbd> <span>Skip to previous track</span>
        <kbd>Shift</kbd>+<kbd>S</kbd> <span>Cycle playback speed</span>
        <kbd>Shift</kbd>+<kbd>M</kbd> <span>Toggle mini player</span>
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
  var prevActive = activeFile;
  activeFile = null;
  document.getElementById('margin-notes').innerHTML = '';
  updateSidebarActiveState(prevActive);

  content.innerHTML = `
    <div class="article-header">
      <h1>PullRead Guide</h1>
      <div class="article-byline"><span>Last updated ${new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span></div>
    </div>

    <h2>What is PullRead?</h2>
    <p>PullRead syncs your bookmarks and RSS feeds into clean Markdown files you can read, search, highlight, and keep forever. Articles are stored locally on your Mac.</p>

    <h2>Dashboard</h2>
    <p>When you first open PullRead, the dashboard shows a personalized overview of your reading: articles you're in the middle of, recent reviews, favorites, and the latest additions. Click any card to jump straight to that article, or click the PullRead logo to return to the dashboard.</p>

    <h2>How does syncing work?</h2>
    <p>PullRead fetches new items from your configured feeds (Instapaper, Pinboard, Raindrop, RSS, etc.) and extracts the article content into Markdown. You can sync manually from the menu bar, or set an automatic interval in Settings (every 30 min, 1 hour, 4 hours, or 12 hours).</p>

    <h2>What are reviews?</h2>
    <p>Reviews are AI-generated thematic summaries of your recent reading. You can schedule them daily or weekly in Settings. Daily reviews cover the past 24 hours; weekly reviews cover the past 7 days. They require a configured LLM provider (Anthropic, OpenAI, Gemini, OpenRouter, or Apple Intelligence).</p>

    <h2>Search Operators</h2>
    <p>The search bar supports powerful operators to narrow down your article list:</p>
    <table>
      <thead><tr><th>Operator</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><code>is:starred</code></td><td>Starred articles (also <code>is:favorite</code>, <code>is:fav</code>)</td></tr>
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
    <p>Click the Summarize button on any article to generate an AI summary. The summary appears as italic text with a provider attribution below. You can regenerate or dismiss it. Summaries are saved in the article frontmatter so they persist across sessions. Supports Anthropic, OpenAI, Gemini, OpenRouter, and Apple Intelligence.</p>

    <h2>Text-to-Speech</h2>
    <p>Click the <strong>Listen</strong> button on any article to hear it read aloud. Queue multiple articles for continuous playback with speed control (0.5x&ndash;2x).</p>
    <table>
      <thead><tr><th>Provider</th><th>Cost</th><th>Notes</th></tr></thead>
      <tbody>
        <tr><td>Browser</td><td>Free</td><td>Built-in speech synthesis, works offline</td></tr>
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
    <p>Click the gear icon to switch between Light, Dark, Sepia, and High Contrast themes. Choose from fonts including Inter, Lora, Source Serif, Work Sans, and OpenDyslexic. Adjust text size, line height, letter spacing, and content width. Preferences are saved automatically. App chrome (toolbars, menus, sidebar) always uses Work Sans regardless of your reading font choice.</p>

    <h2>Sources &amp; Tags</h2>
    <p>Click <strong>Sources</strong> or <strong>Tags</strong> in the sidebar to browse articles grouped by feed or topic. The Sources drawer includes sort buttons to arrange feeds by <strong>Recent</strong> (most recently bookmarked), <strong>A&ndash;Z</strong> (alphabetical), or <strong>Count</strong> (most articles). Your sort preference is remembered between sessions. Each source shows its favicon; sources without an icon display a neutral placeholder.</p>

    <h2>Machine Tags &amp; Explore</h2>
    <p>PullRead can auto-generate topic, entity, and theme tags using your configured AI provider. Tags power relational mapping — discover connections between articles through the <strong>Explore</strong> page. Use the auto-tagging buttons on the Explore page's Discover tab, or enable auto-tagging after sync in the macOS app settings.</p>

    <h2>Apple News &amp; Social Posts</h2>
    <p>PullRead resolves Apple News links (apple.news) to their original article URLs. Social posts from X/Twitter, Bluesky, Mastodon, Reddit, and Hacker News are extracted with special handling to preserve the post structure.</p>

    <h2>Browser Cookies</h2>
    <p>Enable browser cookies in Settings to access paywalled content from sites like NYTimes or WSJ. PullRead supports <strong>Chrome, Arc, Brave, and Edge</strong>. Cookies stay on your Mac and are never uploaded.</p>

    <h2>Save from Any Browser (Bookmarklet)</h2>
    <p>PullRead includes a bookmarklet you can drag to your browser's bookmarks bar. Click it on any web page to save the article to PullRead for your next sync.</p>
    <p><strong>To install:</strong></p>
    <ol>
      <li>Make sure your bookmarks bar is visible (<kbd>Cmd+Shift+B</kbd> in Chrome/Edge, View &rarr; Show Favorites Bar in Safari).</li>
      <li>Drag this link to your bookmarks bar: <a href="javascript:void(window.location='pullread://save?url='+encodeURIComponent(location.href)+'&amp;title='+encodeURIComponent(document.title))" onclick="event.preventDefault()" style="padding:4px 12px;background:var(--link);color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;cursor:grab">Save to PullRead</a></li>
      <li>Visit any article and click the bookmarklet to save it.</li>
    </ol>
    <p>Alternatively, press <strong>a</strong> in PullRead to add an article by URL, or re-run the <strong>Tour</strong> from Settings to see the installation step again.</p>

    <h2>Importing Bookmarks</h2>
    <p>Import bookmarks.html files exported from Chrome, Safari, Firefox, or Pocket directly from Settings or via the CLI with <code>pullread import &lt;file&gt;</code>.</p>

    <h2>Keyboard Shortcuts</h2>
    <p>Shortcuts follow Google Reader conventions where possible.</p>
    <table>
      <thead><tr><th>Key</th><th>Action</th></tr></thead>
      <tbody>
        <tr><td><kbd>j</kbd> / <kbd>n</kbd></td><td>Next article</td></tr>
        <tr><td><kbd>k</kbd> / <kbd>p</kbd></td><td>Previous article</td></tr>
        <tr><td><kbd>Space</kbd></td><td>Page down (next article at bottom)</td></tr>
        <tr><td><kbd>Shift</kbd>+<kbd>Space</kbd></td><td>Page up</td></tr>
        <tr><td><kbd>&uarr;</kbd> <kbd>&darr;</kbd></td><td>Scroll (jumps articles at edges)</td></tr>
        <tr><td><kbd>s</kbd></td><td>Star / unstar article</td></tr>
        <tr><td><kbd>m</kbd></td><td>Toggle read / unread</td></tr>
        <tr><td><kbd>v</kbd></td><td>Open original in new tab</td></tr>
        <tr><td><kbd>r</kbd></td><td>Refresh article list</td></tr>
        <tr><td><kbd>Shift</kbd>+<kbd>A</kbd></td><td>Mark all as read</td></tr>
        <tr><td><kbd>/</kbd></td><td>Search articles</td></tr>
        <tr><td><kbd>[</kbd></td><td>Toggle sidebar</td></tr>
        <tr><td><kbd>h</kbd></td><td>Highlight selected text</td></tr>
        <tr><td><kbd>Shift</kbd>+<kbd>N</kbd></td><td>Toggle article notes</td></tr>
        <tr><td><kbd>a</kbd></td><td>Add article by URL</td></tr>
        <tr><td><kbd>f</kbd></td><td>Toggle focus mode</td></tr>
        <tr><td><kbd>?</kbd></td><td>Show keyboard shortcuts</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Clear search / close popover</td></tr>
      </tbody>
    </table>

    <h3>Audio Playback (when player is visible)</h3>
    <table>
      <thead><tr><th>Key</th><th>Action</th></tr></thead>
      <tbody>
        <tr><td><kbd>&gt;</kbd></td><td>Skip to next track</td></tr>
        <tr><td><kbd>&lt;</kbd></td><td>Skip to previous track</td></tr>
        <tr><td><kbd>Shift</kbd>+<kbd>S</kbd></td><td>Cycle playback speed</td></tr>
        <tr><td><kbd>Shift</kbd>+<kbd>M</kbd></td><td>Toggle mini player</td></tr>
      </tbody>
    </table>

    <h2>FAQ</h2>

    <h3>Where are my articles stored?</h3>
    <p>Articles are saved as Markdown files in the output folder you configure in Settings (e.g., <code>~/Dropbox/Articles</code>). They're plain text files you can open in any editor. Highlights, notes, and settings are stored in <code>~/.config/pullread/</code>.</p>

    <h3>Do I need an API key?</h3>
    <p>Only for AI features (summaries, auto-tagging, reviews, and paid TTS). Reading, highlighting, searching, and browser TTS are all free with no API key. Apple Intelligence (macOS 26+) works without a key too.</p>

    <h3>Is my data sent anywhere?</h3>
    <p>Articles stay on your Mac. Data is only sent to an API when you explicitly use summaries, auto-tagging, or cloud TTS providers (OpenAI/ElevenLabs). Browser TTS is fully local. API keys are stored locally and never shared between features (your Summaries key is separate from your TTS key).</p>

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

    <h2>Support</h2>
    <p>Need help? Email us at <a href="#" onclick="prOpenExternal('mailto:support@alittledrive.com');return false">support@alittledrive.com</a> and we'll get back to you as soon as we can.</p>

    <h2>Acknowledgements</h2>

    <h3>Open Source Software</h3>
    <p>PullRead uses open-source software including <strong>Mozilla Readability</strong> (Apache 2.0), <strong>Turndown</strong> (MIT), <strong>marked</strong> (MIT), <strong>highlight.js</strong> (BSD 3-Clause), <strong>Mermaid</strong> (MIT), and <strong>DOMPurify</strong> (Apache 2.0 / MPL 2.0).</p>

    <h3>Fonts</h3>
    <p>PullRead bundles the following typefaces for offline reading, all under the <strong>SIL Open Font License 1.1</strong>:</p>
    <ul style="margin:8px 0 8px 20px;line-height:1.8">
      <li><strong>Work Sans</strong> by Wei Huang</li>
      <li><strong>Inter</strong> by Rasmus Andersson</li>
      <li><strong>Lora</strong> by Cyreal</li>
      <li><strong>Literata</strong> by TypeTogether</li>
      <li><strong>Source Serif</strong> by Frank Grie&szlig;hammer / Adobe</li>
      <li><strong>OpenDyslexic</strong> by Abbie Gonzalez</li>
    </ul>
    <p>The SIL Open Font License permits free use, redistribution, and bundling of these fonts with software. Font files are sourced via <a href="https://fontsource.org" target="_blank" rel="noopener">Fontsource</a>.</p>

    <h3>Icons</h3>
    <p>UI icons are based on <strong>Font Awesome Free</strong> (CC BY 4.0 / SIL OFL 1.1) by Fonticons, Inc.</p>

    <p style="margin-top:16px">Full license texts are included in the app bundle at <code>Contents/Resources/Licenses/</code>.</p>
  `;
  document.title = 'PullRead Guide';
  document.getElementById('content-scroll').scrollTop = 0;
  generateToc();
}

function closeModal() {
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) overlay.remove();
  if (_modalReturnFocus) { _modalReturnFocus.focus(); _modalReturnFocus = null; }
}


// ---- Onboarding Wizard ----
let _obStep = 0;
let _obFeeds = {};
let _obOutputPath = '~/Documents/PullRead';
let _obFeedLoading = false;
let _tourMode = false;

function dismissOnboarding() {
  document.getElementById('onboarding').style.display = 'none';
  localStorage.setItem('pr-onboarded', '1');
}

function showTour() {
  _tourMode = true;
  _obStep = 0;
  document.getElementById('onboarding').style.display = 'flex';
  renderOnboardingStep();
}

async function showOnboardingIfNeeded() {
  if (localStorage.getItem('pr-onboarded')) return;
  try {
    var r = await fetch('/api/config');
    var cfg = await r.json();
    if (cfg.configured) {
      localStorage.setItem('pr-onboarded', '1');
      return;
    }
    if (cfg.outputPath) _obOutputPath = cfg.outputPath;
    if (cfg.feeds) _obFeeds = cfg.feeds;
  } catch (e) {}
  _tourMode = false;
  _obStep = 0;
  document.getElementById('onboarding').style.display = 'flex';
  renderOnboardingStep();
}

function getOnboardingSteps() {
  var steps = [
    { id: 'welcome', render: renderStepWelcome },
    { id: 'setup', render: renderStepSetup, setupOnly: true },
    { id: 'bookmarklet', render: renderStepBookmarklet },
    { id: 'reading', render: renderStepReading },
    { id: 'search', render: renderStepSearch },
    { id: 'listening', render: renderStepListening },
    { id: 'ready', render: renderStepReady }
  ];
  if (_tourMode) return steps.filter(function(s) { return !s.setupOnly; });
  return steps;
}

function renderOnboardingStep() {
  var card = document.getElementById('onboarding-card');
  var steps = getOnboardingSteps();
  var total = steps.length;

  var progress = '<div class="ob-progress">';
  for (var i = 0; i < total; i++) {
    progress += '<div class="ob-progress-bar' + (i <= _obStep ? ' active' : '') + '"></div>';
  }
  progress += '</div>';

  var html = progress;
  html += steps[_obStep].render();

  // Navigation
  html += '<div class="ob-nav">';
  if (_obStep > 0) {
    html += '<button onclick="obBack()">Back</button>';
  } else if (_tourMode) {
    html += '<button onclick="dismissOnboarding()" style="color:var(--muted)">Skip</button>';
  } else {
    html += '<span></span>';
  }
  if (_obStep < total - 1) {
    html += '<button class="ob-primary" onclick="obNext()">Next</button>';
  } else {
    html += '<button class="ob-primary" onclick="obFinish()">' + (_tourMode ? 'Done' : 'Get Started') + '</button>';
  }
  html += '</div>';

  card.innerHTML = html;
}

function renderStepWelcome() {
  var title = _tourMode ? "What\u2019s in PullRead" : 'Welcome to PullRead';
  var subtitle = _tourMode
    ? 'A quick look at what you can do with your reading library.'
    : 'Save articles as clean, local Markdown you can read anywhere. Install our bookmarking shortcut or use PullRead with your favorite service.';
  return '<div style="text-align:center;padding:12px 0">'
    + '<div style="margin-bottom:12px"><svg class="icon" style="width:48px;height:48px;color:var(--link)" aria-hidden="true"><use href="#i-book"/></svg></div>'
    + '<h2>' + title + '</h2>'
    + '<p class="ob-subtitle">' + subtitle + '</p>'
    + '<div class="ob-features">'
    + '<span class="ob-feature-pill"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-pin"/></svg> Bookmark sync</span>'
    + '<span class="ob-feature-pill"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-pen"/></svg> Markdown files</span>'
    + '<span class="ob-feature-pill"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-comment"/></svg> Summaries</span>'
    + '<span class="ob-feature-pill"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-headphones"/></svg> Text-to-speech</span>'
    + '<span class="ob-feature-pill"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-focus"/></svg> Focus mode</span>'
    + '</div>'
    + '</div>';
}

function renderStepSetup() {
  var feedNames = Object.keys(_obFeeds);
  var html = '<h2>Setup</h2>'
    + '<p class="ob-subtitle">Choose where to save articles, then add a bookmark feed to start syncing.</p>';

  // Output folder
  html += '<div class="ob-glass-card">'
    + '<label style="font-weight:500;font-size:13px;margin-bottom:6px;display:block">Output folder</label>'
    + '<div style="display:flex;gap:8px;align-items:center">'
    + '<input type="text" id="ob-output-path" value="' + escapeHtml(_obOutputPath) + '" placeholder="~/Documents/PullRead" style="flex:1">'
    + '<button onclick="pickOutputFolder(\'ob-output-path\')" style="white-space:nowrap;padding:7px 14px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;cursor:pointer;font-family:inherit">Choose\u2026</button>'
    + '</div>'
    + '</div>';

  // Feed connection
  html += '<div class="ob-glass-card" style="margin-top:12px">'
    + '<label style="font-weight:500;font-size:13px;margin-bottom:6px;display:block">Bookmark feeds</label>';
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
    + '</div>';

  // Service hints (compact)
  html += '<div class="ob-hint-list" style="margin-top:10px">'
    + '<div style="margin-bottom:6px;color:var(--fg);font-size:12px;font-weight:500">Where to find your feed URL:</div>'
    + '<div><strong>Instapaper</strong> Settings &rarr; Export &rarr; RSS Feed URL</div>'
    + '<div><strong>Pinboard</strong> pinboard.in/feeds/u:USERNAME/</div>'
    + '<div><strong>Raindrop</strong> Collection &rarr; Share &rarr; RSS Feed</div>'
    + '<div><strong>Pocket</strong> getpocket.com/users/USERNAME/feed/all</div>'
    + '<div><strong>Substack / WordPress</strong> Paste any URL &mdash; PullRead finds the feed</div>'
    + '</div>';

  return html;
}

function renderStepBookmarklet() {
  var bookmarkletCode = "javascript:void(window.location='pullread://save?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title))";
  return '<h2>Save from Any Browser</h2>'
    + '<p class="ob-subtitle">Drag this button to your bookmarks bar to save articles with one click.</p>'
    + '<div class="ob-glass-card" style="text-align:center;padding:24px 16px">'
    + '<div style="margin-bottom:16px">'
    + '<a href="' + escapeHtml(bookmarkletCode) + '" onclick="event.preventDefault()" style="display:inline-block;padding:10px 24px;background:var(--link);color:#fff;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;cursor:grab;box-shadow:0 2px 8px rgba(0,0,0,0.15)" title="Drag me to your bookmarks bar"><svg class="icon icon-sm" style="vertical-align:-2px;margin-right:6px;color:#fff" aria-hidden="true"><use href="#i-pin"/></svg>Save to PullRead</a>'
    + '</div>'
    + '<div style="font-size:13px;color:var(--muted);line-height:1.6">'
    + '<strong>How to install:</strong> Drag the button above to your browser\u2019s bookmarks bar.<br>'
    + 'Then click it on any page to save the article to PullRead.'
    + '</div>'
    + '</div>'
    + '<div class="ob-glass-card" style="margin-top:12px">'
    + '<div class="ob-method"><div class="ob-method-icon"><svg class="icon" aria-hidden="true"><use href="#i-pin"/></svg></div><div><div class="ob-method-title">Bookmarks bar not visible?</div><div class="ob-method-desc">In Chrome or Edge: <kbd>Cmd+Shift+B</kbd> &middot; In Safari: View &rarr; Show Favorites Bar &middot; In Firefox: View &rarr; Toolbars &rarr; Bookmarks Toolbar</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon"><svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg></div><div><div class="ob-method-title">Or add by URL</div><div class="ob-method-desc">Press <kbd>a</kbd> in PullRead to save any URL directly, or use the Add Article button in the sidebar.</div></div></div>'
    + '</div>';
}

function renderStepReading() {
  return '<h2>Reading</h2>'
    + '<p class="ob-subtitle">Tools for focused, annotated reading.</p>'
    + '<div class="ob-glass-card">'
    + '<div class="ob-method"><div class="ob-method-icon"><svg class="icon" aria-hidden="true"><use href="#i-focus"/></svg></div><div><div class="ob-method-title">Focus Mode <kbd>f</kbd></div><div class="ob-method-desc">Dims everything except the current paragraph so you can concentrate.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon"><svg class="icon" aria-hidden="true"><use href="#i-pen"/></svg></div><div><div class="ob-method-title">Highlights <kbd>h</kbd></div><div class="ob-method-desc">Select text and choose a color. Highlights appear in the margin with optional notes.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon"><svg class="icon" aria-hidden="true"><use href="#i-bars"/></svg></div><div><div class="ob-method-title">Table of Contents</div><div class="ob-method-desc">Auto-generated navigation for long articles. Appears on wide screens.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon"><svg class="icon" aria-hidden="true"><use href="#i-book"/></svg></div><div><div class="ob-method-title">Reading Progress</div><div class="ob-method-desc">Your position is saved automatically and restored when you return.</div></div></div>'
    + '</div>';
}

function renderStepSearch() {
  return '<h2>Search &amp; Organize</h2>'
    + '<p class="ob-subtitle">Find anything in your library instantly.</p>'
    + '<div class="ob-glass-card">'
    + '<div class="ob-method"><div class="ob-method-icon"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg></div><div><div class="ob-method-title">Search Operators</div><div class="ob-method-desc">Type <code>is:unread</code>, <code>tag:tech</code>, <code>feed:NYT</code>, <code>has:highlights</code> and more in the search bar.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon"><svg class="icon" aria-hidden="true"><use href="#i-pin"/></svg></div><div><div class="ob-method-title">Pinned Filters</div><div class="ob-method-desc">Pin up to 3 frequent searches as quick-access buttons below the search bar.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon"><svg class="icon" aria-hidden="true"><use href="#i-heart"/></svg></div><div><div class="ob-method-title">Favorites</div><div class="ob-method-desc">Heart any article. Find them with <code>is:favorite</code>.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon"><svg class="icon" aria-hidden="true"><use href="#i-tags"/></svg></div><div><div class="ob-method-title">Explore</div><div class="ob-method-desc">Tag cloud and topic connections across your entire library.</div></div></div>'
    + '</div>';
}

function renderStepListening() {
  return '<h2>Listening &amp; Summaries</h2>'
    + '<p class="ob-subtitle">Listen to articles and get concise summaries.</p>'
    + '<div class="ob-glass-card">'
    + '<div class="ob-method"><div class="ob-method-icon"><svg class="icon" aria-hidden="true"><use href="#i-headphones"/></svg></div><div><div class="ob-method-title">Text-to-Speech</div><div class="ob-method-desc">Listen to any article. Free on-device voice included, with premium options available.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon"><svg class="icon" aria-hidden="true"><use href="#i-comment"/></svg></div><div><div class="ob-method-title">Summaries</div><div class="ob-method-desc">One-click summary saved to each article. Works with multiple providers.</div></div></div>'
    + '<div class="ob-method"><div class="ob-method-icon"><svg class="icon" aria-hidden="true"><use href="#i-calendar"/></svg></div><div><div class="ob-method-title">Reviews</div><div class="ob-method-desc">Thematic roundups of your recent reading. Generate daily or weekly from the dashboard.</div></div></div>'
    + '</div>';
}

function renderStepReady() {
  return '<div style="text-align:center;padding:12px 0">'
    + '<div style="margin-bottom:12px"><svg class="icon" style="width:48px;height:48px;color:var(--link)" aria-hidden="true"><use href="#i-play"/></svg></div>'
    + '<h2>' + (_tourMode ? 'That\u2019s the Tour' : 'Ready to Go') + '</h2>'
    + '<p class="ob-subtitle">' + (_tourMode ? 'Here are some keyboard shortcuts to remember:' : 'PullRead will fetch your bookmarked articles and save them as Markdown. Here are some keyboard shortcuts to get started:') + '</p>'
    + '</div>'
    + '<div class="ob-shortcuts">'
    + '<kbd>j</kbd> / <kbd>n</kbd> <span>Next article</span>'
    + '<kbd>k</kbd> / <kbd>p</kbd> <span>Previous article</span>'
    + '<kbd>Space</kbd> <span>Page down</span>'
    + '<kbd>s</kbd> <span>Star article</span>'
    + '<kbd>m</kbd> <span>Toggle read / unread</span>'
    + '<kbd>v</kbd> <span>Open original in new tab</span>'
    + '<kbd>/</kbd> <span>Search articles</span>'
    + '<kbd>?</kbd> <span>All shortcuts</span>'
    + '</div>'
    + '<div style="text-align:center;margin-top:16px">'
    + '<button onclick="showGuideModal()" style="background:none;border:none;color:var(--link);cursor:pointer;font-size:13px;font-family:inherit;text-decoration:underline">Open full Guide for more</button>'
    + '</div>';
}

function obBack() {
  if (_obStep > 0) { _obStep--; renderOnboardingStep(); }
}

function obNext() {
  var steps = getOnboardingSteps();
  // Validate output path on setup step
  if (steps[_obStep].id === 'setup') {
    var pathInput = document.getElementById('ob-output-path');
    if (pathInput) _obOutputPath = pathInput.value.trim();
    if (!_obOutputPath) { pathInput.focus(); return; }
  }
  if (_obStep < steps.length - 1) { _obStep++; renderOnboardingStep(); }
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
  if (!_tourMode) {
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outputPath: _obOutputPath,
          feeds: _obFeeds
        })
      });
    } catch (e) {
      console.error('Failed to save onboarding config:', e);
    }
  }
  dismissOnboarding();
  if (!_tourMode) {
    setTimeout(function() { refreshArticleList(); }, 500);
  }
}

