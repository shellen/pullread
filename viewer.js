// State
let allFiles = [];
let filteredFiles = [];
let displayFiles = []; // after hide-read filter
let activeFile = null;
let serverMode = false;
let hideRead = false;
let readArticles = new Set(JSON.parse(localStorage.getItem('pr-read-articles') || '[]'));
const PAGE_SIZE = 200; // pagination chunk
let displayedCount = 0;

// Highlights & Notes state
let articleHighlights = []; // highlights for current article
let articleNotes = { articleNote: '', annotations: [], tags: [], isFavorite: false }; // notes for current article
let allHighlightsIndex = {}; // { filename: [...] } for sidebar indicators
let allNotesIndex = {}; // { filename: { articleNote, annotations } } for sidebar indicators

// Preferences
function setTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  document.querySelectorAll('[data-theme-btn]').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-theme-btn') === theme)
  );
  localStorage.setItem('pr-theme', theme);
  updateHljsTheme();
}

function setFont(font) {
  document.body.className = document.body.className.replace(/font-[\w-]+/, 'font-' + font);
  localStorage.setItem('pr-font', font);
}

function setSize(size) {
  document.body.className = document.body.className.replace(/size-\w+/, 'size-' + size);
  document.querySelectorAll('[data-size-btn]').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-size-btn') === size)
  );
  localStorage.setItem('pr-size', size);
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  const isCollapsed = sidebar.classList.contains('collapsed');
  localStorage.setItem('pr-sidebar', isCollapsed ? '0' : '1');
  document.getElementById('sidebar-toggle-btn').setAttribute('aria-expanded', !isCollapsed);
}

function setLineHeight(val) {
  document.body.className = document.body.className.replace(/leading-\w+/g, '');
  if (val !== 'default') document.body.classList.add('leading-' + val);
  localStorage.setItem('pr-leading', val);
}

function setSpacing(val) {
  document.body.className = document.body.className.replace(/spacing-\w+/g, '');
  if (val !== 'default') document.body.classList.add('spacing-' + val);
  localStorage.setItem('pr-spacing', val);
}

function setWidth(val) {
  document.body.className = document.body.className.replace(/width-\w+/g, '');
  if (val !== 'default') document.body.classList.add('width-' + val);
  localStorage.setItem('pr-width', val);
}


function toggleSettingsDropdown() {
  const existing = document.querySelector('.settings-dropdown-panel');
  const btn = document.getElementById('settings-toggle-btn');
  if (existing) { existing.remove(); btn.setAttribute('aria-expanded', 'false'); return; }

  const currentTheme = document.body.getAttribute('data-theme') || 'light';
  const currentFont = localStorage.getItem('pr-font') || 'serif';
  const currentSize = localStorage.getItem('pr-size') || 'medium';
  const currentLeading = localStorage.getItem('pr-leading') || 'default';
  const currentSpacing = localStorage.getItem('pr-spacing') || 'default';
  const currentWidth = localStorage.getItem('pr-width') || 'default';

  const panel = document.createElement('div');
  panel.className = 'settings-dropdown-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Reader settings');
  panel.onclick = function(e) { e.stopPropagation(); };
  panel.innerHTML = `
    <label>Theme</label>
    <div class="setting-row">
      <button data-setting="theme" data-val="light" onclick="setTheme('light');updateDropdownState()" ${currentTheme==='light'?'class="active"':''}>Light</button>
      <button data-setting="theme" data-val="dark" onclick="setTheme('dark');updateDropdownState()" ${currentTheme==='dark'?'class="active"':''}>Dark</button>
      <button data-setting="theme" data-val="sepia" onclick="setTheme('sepia');updateDropdownState()" ${currentTheme==='sepia'?'class="active"':''}>Sepia</button>
      <button data-setting="theme" data-val="high-contrast" onclick="setTheme('high-contrast');updateDropdownState()" ${currentTheme==='high-contrast'?'class="active"':''} title="High contrast">Hi-Con</button>
    </div>
    <label>Font</label>
    <div class="setting-row">
      <select onchange="setFont(this.value)" id="font-select" aria-label="Font family">
        <option value="serif" ${currentFont==='serif'?'selected':''}>Serif</option>
        <option value="sans" ${currentFont==='sans'?'selected':''}>Sans-serif</option>
        <option value="system" ${currentFont==='system'?'selected':''}>Charter</option>
        <option value="mono" ${currentFont==='mono'?'selected':''}>Monospace</option>
        <option value="inter" ${currentFont==='inter'?'selected':''}>Inter</option>
        <option value="lora" ${currentFont==='lora'?'selected':''}>Lora</option>
        <option value="literata" ${currentFont==='literata'?'selected':''}>Literata</option>
        <option value="source-serif" ${currentFont==='source-serif'?'selected':''}>Source Serif</option>
        <option value="work-sans" ${currentFont==='work-sans'?'selected':''}>Work Sans</option>
        <option value="opendyslexic" ${currentFont==='opendyslexic'?'selected':''}>OpenDyslexic</option>
      </select>
    </div>
    <label>Size</label>
    <div class="setting-row">
      <button data-setting="size" data-val="small" onclick="setSize('small');updateDropdownState()" ${currentSize==='small'?'class="active"':''} aria-label="Small text">A</button>
      <button data-setting="size" data-val="medium" onclick="setSize('medium');updateDropdownState()" ${currentSize==='medium'?'class="active"':''} style="font-size:14px" aria-label="Medium text">A</button>
      <button data-setting="size" data-val="large" onclick="setSize('large');updateDropdownState()" ${currentSize==='large'?'class="active"':''} style="font-size:17px" aria-label="Large text">A</button>
    </div>
    <label>Line height</label>
    <div class="setting-row">
      <select onchange="setLineHeight(this.value)" aria-label="Line height">
        <option value="default" ${currentLeading==='default'?'selected':''}>Default</option>
        <option value="compact" ${currentLeading==='compact'?'selected':''}>Compact</option>
        <option value="relaxed" ${currentLeading==='relaxed'?'selected':''}>Relaxed</option>
        <option value="loose" ${currentLeading==='loose'?'selected':''}>Loose</option>
      </select>
    </div>
    <label>Letter spacing</label>
    <div class="setting-row">
      <select onchange="setSpacing(this.value)" aria-label="Letter spacing">
        <option value="default" ${currentSpacing==='default'?'selected':''}>Default</option>
        <option value="wide" ${currentSpacing==='wide'?'selected':''}>Wide</option>
        <option value="wider" ${currentSpacing==='wider'?'selected':''}>Wider</option>
      </select>
    </div>
    <label>Content width</label>
    <div class="setting-row">
      <select onchange="setWidth(this.value)" aria-label="Content width">
        <option value="narrow" ${currentWidth==='narrow'?'selected':''}>Narrow</option>
        <option value="default" ${currentWidth==='default'?'selected':''}>Default</option>
        <option value="wide" ${currentWidth==='wide'?'selected':''}>Wide</option>
      </select>
    </div>
    <hr style="border:none;border-top:1px solid var(--border);margin:12px 0 8px">
    <label>Article</label>
    <div class="setting-row">
      <button onclick="reprocessCurrentArticle(this)" id="reprocess-btn" style="flex:1;text-align:center" title="Re-fetch this article from the original URL"><svg class="icon icon-sm" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-cloud-download"/></svg> Re-fetch from source</button>
    </div>
  `;
  document.querySelector('.settings-dropdown').appendChild(panel);
  btn.setAttribute('aria-expanded', 'true');
}

function updateDropdownState() {
  const panel = document.querySelector('.settings-dropdown-panel');
  if (!panel) return;
  const currentTheme = document.body.getAttribute('data-theme') || 'light';
  const currentSize = localStorage.getItem('pr-size') || 'medium';
  // Update theme buttons
  panel.querySelectorAll('[data-setting="theme"]').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-val') === currentTheme)
  );
  // Update size buttons
  panel.querySelectorAll('[data-setting="size"]').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-val') === currentSize)
  );
}

// Close settings dropdown when clicking outside
document.addEventListener('click', function(e) {
  const panel = document.querySelector('.settings-dropdown-panel');
  if (panel && !panel.contains(e.target) && !e.target.closest('.settings-dropdown')) {
    panel.remove();
  }
});

// ---- Full Settings Page ----
function showSettingsPage() {
  activeFile = null;
  _activeNotebook = null;
  const content = document.getElementById('content');
  const empty = document.getElementById('empty-state');
  empty.style.display = 'none';
  content.style.display = 'block';
  document.title = 'Settings — PullRead';
  document.getElementById('margin-notes').innerHTML = '';
  renderFileList();

  var currentTheme = document.body.getAttribute('data-theme') || 'light';
  var currentFont = localStorage.getItem('pr-font') || 'serif';
  var currentSize = localStorage.getItem('pr-size') || 'medium';
  var currentLeading = localStorage.getItem('pr-leading') || 'default';
  var currentSpacing = localStorage.getItem('pr-spacing') || 'default';
  var currentWidth = localStorage.getItem('pr-width') || 'default';
  function themeBtn(val, label) {
    return '<button class="' + (currentTheme === val ? 'active' : '') + '" onclick="setTheme(\'' + val + '\');showSettingsPage()">' + label + '</button>';
  }
  function sizeBtn(val, label, style) {
    return '<button class="' + (currentSize === val ? 'active' : '') + '" onclick="setSize(\'' + val + '\');showSettingsPage()"' + (style ? ' style="' + style + '"' : '') + '>' + label + '</button>';
  }
  function opt(val, label, current) {
    return '<option value="' + val + '"' + (current === val ? ' selected' : '') + '>' + label + '</option>';
  }

  var html = '<div class="article-header"><h1>Settings</h1></div>';

  // ---- Display section ----
  html += '<div class="settings-section">';
  html += '<h2>Display</h2>';
  html += '<div class="settings-row"><label>Theme</label><div class="settings-btn-group">'
    + themeBtn('light', 'Light') + themeBtn('dark', 'Dark') + themeBtn('sepia', 'Sepia') + themeBtn('high-contrast', 'Hi-Con')
    + '</div></div>';
  html += '<div class="settings-row"><label>Font</label><select onchange="setFont(this.value);showSettingsPage()">'
    + opt('serif','Serif',currentFont) + opt('sans','Sans-serif',currentFont) + opt('system','Charter',currentFont)
    + opt('mono','Monospace',currentFont) + opt('inter','Inter',currentFont) + opt('lora','Lora',currentFont)
    + opt('literata','Literata',currentFont) + opt('source-serif','Source Serif',currentFont)
    + opt('work-sans','Work Sans',currentFont) + opt('opendyslexic','OpenDyslexic',currentFont)
    + '</select></div>';
  html += '<div class="settings-row"><label>Text size</label><div class="settings-btn-group">'
    + sizeBtn('small','A','font-size:12px') + sizeBtn('medium','A','font-size:14px') + sizeBtn('large','A','font-size:17px')
    + '</div></div>';
  html += '<div class="settings-row"><label>Line height</label><select onchange="setLineHeight(this.value)">'
    + opt('default','Default',currentLeading) + opt('compact','Compact',currentLeading)
    + opt('relaxed','Relaxed',currentLeading) + opt('loose','Loose',currentLeading)
    + '</select></div>';
  html += '<div class="settings-row"><label>Letter spacing</label><select onchange="setSpacing(this.value)">'
    + opt('default','Default',currentSpacing) + opt('wide','Wide',currentSpacing) + opt('wider','Wider',currentSpacing)
    + '</select></div>';
  html += '<div class="settings-row"><label>Content width</label><select onchange="setWidth(this.value)">'
    + opt('narrow','Narrow',currentWidth) + opt('default','Default',currentWidth) + opt('wide','Wide',currentWidth)
    + '</select></div>';
  html += '</div>';

  // ---- Feeds & Sync section (placeholder, loaded async) ----
  html += '<div class="settings-section" id="settings-feeds">';
  html += '<h2>Bookmarks &amp; Sync</h2>';
  html += '<p style="color:var(--muted);font-size:13px">Loading feed configuration...</p>';
  html += '</div>';

  // ---- Voice Playback section (placeholder, loaded async) ----
  html += '<div class="settings-section" id="settings-voice">';
  html += '<h2>Voice Playback</h2>';
  html += '<p style="color:var(--muted);font-size:13px">Loading voice settings...</p>';
  html += '</div>';

  // ---- AI Summaries section (placeholder, loaded async) ----
  html += '<div class="settings-section" id="settings-ai">';
  html += '<h2>AI Summaries &amp; Tagging</h2>';
  html += '<p style="color:var(--muted);font-size:13px">Loading AI settings...</p>';
  html += '</div>';

  // ---- Notifications section ----
  html += '<div class="settings-section">';
  html += '<h2>Notifications</h2>';
  html += '<p style="font-size:13px;color:var(--muted);margin-bottom:12px">PullRead sends notifications when syncs complete, articles are saved, and reviews are ready. Notification sounds are off by default.</p>';
  html += '<div style="display:flex;gap:8px;align-items:flex-start;padding:10px 12px;background:color-mix(in srgb, var(--fg) 4%, transparent);border-radius:8px;font-size:12px;color:var(--muted)">'
    + '<span style="flex-shrink:0;font-size:14px">&#9881;</span>'
    + '<span>To change notification preferences, go to <strong style="color:var(--fg)">System Settings &rarr; Notifications &rarr; PullRead</strong>. You can enable or disable alerts, banners, and sounds there.</span>'
    + '</div>';
  html += '</div>';

  // ---- Backup & Restore section ----
  html += '<div class="settings-section">';
  html += '<h2>Backup &amp; Restore</h2>';
  html += '<p style="font-size:13px;color:var(--muted);margin-bottom:16px">Export your settings, highlights, notes, notebooks, and feed configuration to a single file. Use Restore to import a previous backup.</p>';
  html += '<div class="settings-row" style="gap:12px">';
  html += '<button class="btn-primary" onclick="settingsBackup()" style="font-size:13px;padding:6px 16px">Download Backup</button>';
  html += '<button style="font-size:13px;padding:6px 16px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer" onclick="settingsRestore()">Restore from File\u2026</button>';
  html += '</div>';
  html += '<div id="backup-status" style="font-size:12px;color:var(--muted);padding-top:8px"></div>';
  html += '</div>';

  content.innerHTML = html;
  document.getElementById('content-pane').scrollTop = 0;

  // Load Feeds & Sync config async
  if (serverMode) {
    fetch('/api/config').then(function(r) { return r.json(); }).then(function(cfg) {
      var sec = document.getElementById('settings-feeds');
      if (!sec) return;
      var feeds = cfg.feeds || {};
      var feedNames = Object.keys(feeds);

      var h = '<h2>Bookmarks &amp; Sync</h2>';
      h += '<p style="font-size:13px;color:var(--muted);margin-bottom:16px">Manage your bookmark feeds, newsletter subscriptions, output folder, and sync options.</p>';

      // Output path
      h += '<div class="settings-row"><div><label>Output Folder</label><div class="settings-desc">Where articles are saved as markdown</div></div>';
      h += '<div style="display:flex;gap:8px;align-items:center">';
      h += '<input type="text" id="sp-output-path" value="' + escapeHtml(cfg.outputPath || '') + '" placeholder="~/Documents/PullRead" style="min-width:200px">';
      h += '<button onclick="pickOutputFolder(\'sp-output-path\')" style="white-space:nowrap;padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;cursor:pointer;font-family:inherit">Choose\u2026</button>';
      h += '</div></div>';

      // Sync interval
      h += '<div class="settings-row"><div><label>Auto-sync</label><div class="settings-desc">How often to check for new articles</div></div>';
      h += '<select id="sp-sync-interval">';
      var intervals = [['30m','Every 30 min'],['1h','Every hour'],['4h','Every 4 hours'],['12h','Every 12 hours'],['manual','Manual only']];
      for (var ii = 0; ii < intervals.length; ii++) {
        h += '<option value="' + intervals[ii][0] + '"' + (cfg.syncInterval === intervals[ii][0] ? ' selected' : '') + '>' + intervals[ii][1] + '</option>';
      }
      h += '</select></div>';

      // Browser cookies
      h += '<div class="settings-row"><div><label>Chrome Cookies</label><div class="settings-desc">Use Chrome login cookies for paywalled sites (local only)</div></div>';
      h += '<input type="checkbox" id="sp-cookies"' + (cfg.useBrowserCookies ? ' checked' : '') + '>';
      h += '</div>';

      // Feed list
      h += '<div style="margin-top:16px"><label style="font-size:13px;font-weight:500;margin-bottom:8px;display:block">Feeds (' + feedNames.length + ')</label>';
      if (feedNames.length > 0) {
        h += '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">';
        for (var fi = 0; fi < feedNames.length; fi++) {
          var fn = feedNames[fi];
          h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:' + (fi < feedNames.length - 1 ? '1px solid var(--border)' : 'none') + ';font-size:13px">'
            + '<div><div style="font-weight:500">' + escapeHtml(fn) + '</div><div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px">' + escapeHtml(feeds[fn]) + '</div></div>'
            + '<button onclick="settingsRemoveFeed(\'' + escapeHtml(fn.replace(/'/g, "\\'")) + '\')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:2px 6px" title="Remove">&times;</button>'
            + '</div>';
        }
        h += '</div>';
      }
      h += '<div style="display:flex;gap:8px;margin-top:10px">'
        + '<input type="text" id="sp-new-feed" placeholder="Paste bookmark feed URL or web address\u2026" style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;font-family:inherit" onkeydown="if(event.key===\'Enter\')settingsAddFeed()">'
        + '<button class="btn-primary" onclick="settingsAddFeed()" id="sp-add-feed-btn" style="font-size:13px;padding:6px 14px">Add</button>'
        + '</div>';
      h += '<div style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.6">'
        + 'Paste a bookmark feed URL from Instapaper, Pinboard, Raindrop, or Pocket. '
        + 'You can also subscribe to newsletters (Substack, Ghost, Buttondown) and blogs \u2014 just paste the web address.'
        + '</div>';
      h += '<div style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;padding:8px 10px;background:color-mix(in srgb, var(--fg) 4%, transparent);border-radius:6px;font-size:11px;color:var(--muted)">'
        + '<span style="flex-shrink:0">&#128196;</span>'
        + '<span>Bookmark services only sync articles you save. Newsletter feeds save every post as a separate file.</span>'
        + '</div>';
      h += '</div>';

      h += '<div class="settings-row" style="justify-content:flex-end;padding-top:12px">';
      h += '<button class="btn-primary" onclick="settingsPageSaveConfig()" style="font-size:13px;padding:6px 16px">Save Bookmark Settings</button>';
      h += '</div>';

      sec.innerHTML = h;
      sec._configData = cfg;
    }).catch(function() {
      var sec = document.getElementById('settings-feeds');
      if (sec) sec.innerHTML = '<h2>Bookmarks &amp; Sync</h2><p style="color:var(--muted);font-size:13px">Could not load feed configuration.</p>';
    });
  }

  // Load TTS settings async
  if (serverMode) {
    fetch('/api/tts-settings').then(function(r) { return r.json(); }).then(function(data) {
      var sec = document.getElementById('settings-voice');
      if (!sec) return;
      var providers = [
        { id: 'browser', label: 'Built-in Voice — free' },
        { id: 'kokoro', label: 'Kokoro — free, on-device' },
        { id: 'openai', label: 'OpenAI — premium' },
        { id: 'elevenlabs', label: 'ElevenLabs — premium' },
      ];
      var h = '<h2>Voice Playback</h2>';
      h += '<div class="settings-row"><div><label>Provider</label><div class="settings-desc">Choose how articles are read aloud</div></div>';
      h += '<select id="sp-tts-provider" onchange="settingsPageTTSChanged()">';
      for (var i = 0; i < providers.length; i++) {
        h += '<option value="' + providers[i].id + '"' + (data.provider === providers[i].id ? ' selected' : '') + '>' + providers[i].label + '</option>';
      }
      h += '</select></div>';

      // Voice select
      if (data.voices) {
        h += '<div class="settings-row" id="sp-tts-voice-row"><label>Voice</label>';
        h += '<select id="sp-tts-voice">';
        var prov = data.provider || 'browser';
        var voices = data.voices[prov] || [];
        for (var vi = 0; vi < voices.length; vi++) {
          h += '<option value="' + voices[vi].id + '"' + (data.voice === voices[vi].id ? ' selected' : '') + '>' + escapeHtml(voices[vi].label) + '</option>';
        }
        h += '</select></div>';
      }

      // Model select
      if (data.models) {
        h += '<div class="settings-row" id="sp-tts-model-row"><label>Model</label>';
        h += '<select id="sp-tts-model">';
        var models = data.models[data.provider] || [];
        for (var mi = 0; mi < models.length; mi++) {
          h += '<option value="' + models[mi].id + '"' + (data.model === models[mi].id ? ' selected' : '') + '>' + escapeHtml(models[mi].label) + '</option>';
        }
        h += '</select></div>';
      }

      // API key for cloud providers
      var isCloud = data.provider === 'openai' || data.provider === 'elevenlabs';
      h += '<div class="settings-row" id="sp-tts-key-row" style="display:' + (isCloud ? 'flex' : 'none') + '"><div><label>API Key</label>';
      h += '<div class="settings-desc">' + (data.hasKey && isCloud ? '<span class="settings-status ok">Key saved</span>' : 'Required for cloud TTS') + '</div></div>';
      h += '<input type="password" id="sp-tts-key" placeholder="' + (data.hasKey && isCloud ? '••••••••' : 'Paste API key') + '" style="min-width:200px">';
      h += '</div>';

      // Kokoro status
      h += '<div id="sp-kokoro-status" style="display:' + (data.provider === 'kokoro' ? 'block' : 'none') + ';padding:8px 0">';
      if (data.kokoro && data.kokoro.bundled) {
        h += '<div style="font-size:12px;color:var(--muted)"><span class="settings-status ok">Kokoro bundled</span> Runs on-device, no API key or download needed</div>';
      } else if (data.kokoro && data.kokoro.installed) {
        h += '<div style="font-size:12px;color:var(--muted)"><span class="settings-status ok">Kokoro ready</span> Runs on-device, no API key needed</div>';
      } else {
        h += '<div style="font-size:12px;color:var(--muted)">Will download on first listen (~86MB). Runs on-device after that.</div>';
      }
      h += '</div>';

      h += '<div class="settings-row" style="justify-content:flex-end;padding-top:8px">';
      h += '<button class="btn-primary" onclick="settingsPageSaveTTS()" style="font-size:13px;padding:6px 16px">Save Voice Settings</button>';
      h += '</div>';

      sec.innerHTML = h;
      sec._ttsData = data;
    }).catch(function() {
      var sec = document.getElementById('settings-voice');
      if (sec) sec.innerHTML = '<h2>Voice Playback</h2><p style="color:var(--muted);font-size:13px">Could not load voice settings.</p>';
    });

    // Load LLM settings async
    fetch('/api/settings').then(function(r) { return r.json(); }).then(function(data) {
      var sec = document.getElementById('settings-ai');
      if (!sec) return;
      var llm = data.llm || {};
      var providers = [
        { id: 'apple', label: 'Apple Intelligence (on-device)' },
        { id: 'anthropic', label: 'Anthropic (Claude)' },
        { id: 'openai', label: 'OpenAI' },
        { id: 'gemini', label: 'Google Gemini' },
        { id: 'openrouter', label: 'OpenRouter' },
      ];
      var h = '<h2>AI Summaries &amp; Tagging</h2>';
      h += '<p style="font-size:13px;color:var(--muted);margin-bottom:16px">Used for article summarization and auto-tagging. Configure your provider and API key.</p>';
      h += '<div class="settings-row"><div><label>Provider</label><div class="settings-desc">LLM provider for summaries and tags</div></div>';
      h += '<select id="sp-llm-provider" onchange="settingsPageLLMProviderChanged()">';
      for (var i = 0; i < providers.length; i++) {
        h += '<option value="' + providers[i].id + '"' + (llm.provider === providers[i].id ? ' selected' : '') + '>' + providers[i].label + '</option>';
      }
      h += '</select></div>';

      // Model
      h += '<div class="settings-row"><label>Model</label>';
      h += '<input type="text" id="sp-llm-model" value="' + escapeHtml(llm.model || '') + '" placeholder="e.g. claude-haiku-4-5-20251001" style="min-width:240px">';
      h += '</div>';

      // API key
      var needsKey = llm.provider !== 'apple';
      h += '<div class="settings-row" id="sp-llm-key-row" style="display:' + (needsKey ? 'flex' : 'none') + '"><div><label>API Key</label>';
      h += '<div class="settings-desc">' + (llm.hasKey ? '<span class="settings-status ok">Key saved</span>' : 'Required for this provider') + '</div></div>';
      h += '<input type="password" id="sp-llm-key" placeholder="' + (llm.hasKey ? '••••••••' : 'Paste API key') + '" style="min-width:200px">';
      h += '</div>';

      // Apple Intelligence note
      h += '<div id="sp-apple-note" style="display:' + (llm.provider === 'apple' ? 'block' : 'none') + ';padding:8px 0">';
      h += '<div style="font-size:12px;color:var(--muted)">Apple Intelligence runs on-device. No API key or cloud service needed.</div>';
      h += '</div>';

      h += '<div class="settings-row" style="justify-content:flex-end;padding-top:8px">';
      h += '<button class="btn-primary" onclick="settingsPageSaveLLM()" style="font-size:13px;padding:6px 16px">Save AI Settings</button>';
      h += '</div>';

      sec.innerHTML = h;
    }).catch(function() {
      var sec = document.getElementById('settings-ai');
      if (sec) sec.innerHTML = '<h2>AI Summaries &amp; Tagging</h2><p style="color:var(--muted);font-size:13px">Could not load AI settings. Configure in the menu bar app.</p>';
    });
  }
}

function settingsPageTTSChanged() {
  var provider = document.getElementById('sp-tts-provider').value;
  var sec = document.getElementById('settings-voice');
  var data = sec ? sec._ttsData : null;
  var keyRow = document.getElementById('sp-tts-key-row');
  var kokoroStatus = document.getElementById('sp-kokoro-status');
  var isCloud = provider === 'openai' || provider === 'elevenlabs';
  if (keyRow) keyRow.style.display = isCloud ? 'flex' : 'none';
  if (kokoroStatus) kokoroStatus.style.display = provider === 'kokoro' ? 'block' : 'none';

  // Update voice/model dropdowns
  if (data) {
    var voiceSelect = document.getElementById('sp-tts-voice');
    var modelSelect = document.getElementById('sp-tts-model');
    if (voiceSelect && data.voices && data.voices[provider]) {
      voiceSelect.innerHTML = data.voices[provider].map(function(v) {
        return '<option value="' + v.id + '">' + escapeHtml(v.label) + '</option>';
      }).join('');
    } else if (voiceSelect) { voiceSelect.innerHTML = ''; }
    if (modelSelect && data.models && data.models[provider]) {
      modelSelect.innerHTML = data.models[provider].map(function(m) {
        return '<option value="' + m.id + '">' + escapeHtml(m.label) + '</option>';
      }).join('');
    } else if (modelSelect) { modelSelect.innerHTML = ''; }
  }
}

function settingsPageSaveTTS() {
  var provider = document.getElementById('sp-tts-provider').value;
  var config = { provider: provider };

  if (provider === 'kokoro') {
    var kVoice = document.getElementById('sp-tts-voice');
    var kModel = document.getElementById('sp-tts-model');
    if (kVoice) config.voice = kVoice.value;
    if (kModel) config.model = kModel.value;
  } else if (provider !== 'browser') {
    var apiKey = document.getElementById('sp-tts-key').value;
    if (apiKey) { config.apiKey = apiKey; } else { config.preserveKey = true; }
    var voice = document.getElementById('sp-tts-voice');
    var model = document.getElementById('sp-tts-model');
    if (voice) config.voice = voice.value;
    if (model) config.model = model.value;
  }

  fetch('/api/tts-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }).then(function(r) {
    if (r.ok) {
      ttsProvider = provider;
      ttsQueue = [];
      ttsCurrentIndex = -1;
      if (ttsAudio) { ttsAudio.pause(); ttsAudio.src = ''; ttsAudio = null; }
      renderAudioPlayer();
      showSettingsPage(); // Refresh to show updated state
    } else {
      alert('Failed to save voice settings.');
    }
  });
}

function settingsPageLLMProviderChanged() {
  var provider = document.getElementById('sp-llm-provider').value;
  var keyRow = document.getElementById('sp-llm-key-row');
  var appleNote = document.getElementById('sp-apple-note');
  var modelInput = document.getElementById('sp-llm-model');
  if (keyRow) keyRow.style.display = provider === 'apple' ? 'none' : 'flex';
  if (appleNote) appleNote.style.display = provider === 'apple' ? 'block' : 'none';
  // Update model field to match the selected provider
  if (modelInput) {
    if (provider === 'apple') {
      modelInput.value = 'on-device';
      modelInput.disabled = true;
    } else {
      var defaults = { anthropic: 'claude-haiku-4-5-20251001', openai: 'gpt-4.1-nano', gemini: 'gemini-2.5-flash-lite-preview', openrouter: 'anthropic/claude-haiku-4.5' };
      modelInput.value = defaults[provider] || '';
      modelInput.disabled = false;
    }
  }
}

function settingsPageSaveLLM() {
  var provider = document.getElementById('sp-llm-provider').value;
  var model = document.getElementById('sp-llm-model').value;
  var apiKey = document.getElementById('sp-llm-key').value;

  var body = { provider: provider, model: provider === 'apple' ? 'on-device' : model };
  if (provider === 'apple') body.apiKey = '';
  else if (apiKey) body.apiKey = apiKey;

  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(function(r) {
    if (r.ok) {
      llmProvider = provider;
      llmModel = model;
      llmConfigured = true;
      showSettingsPage(); // Refresh to show updated state
    } else {
      alert('Failed to save AI settings.');
    }
  });
}

// ---- Feeds & Sync settings ----
function pickOutputFolder(inputId) {
  fetch('/api/pick-folder', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.path) {
        document.getElementById(inputId).value = data.path;
      }
    })
    .catch(function() { /* osascript not available — user can type manually */ });
}

function settingsPageSaveConfig() {
  var outputPath = document.getElementById('sp-output-path').value.trim();
  var syncInterval = document.getElementById('sp-sync-interval').value;
  var cookies = document.getElementById('sp-cookies').checked;
  var sec = document.getElementById('settings-feeds');
  var cfg = sec ? sec._configData : {};
  var feeds = cfg.feeds || {};

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outputPath: outputPath, feeds: feeds, syncInterval: syncInterval, useBrowserCookies: cookies })
  }).then(function(r) {
    if (r.ok) showSettingsPage();
    else alert('Failed to save feed settings.');
  });
}

async function settingsAddFeed() {
  var input = document.getElementById('sp-new-feed');
  var url = (input.value || '').trim();
  if (!url) return;
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  var btn = document.getElementById('sp-add-feed-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Finding feed\u2026'; }
  try {
    var r = await fetch('/api/feed-discover?url=' + encodeURIComponent(url));
    var result = await r.json();
    var feedUrl = result.feedUrl || url;
    var title = result.title || feedUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    var sec = document.getElementById('settings-feeds');
    if (sec && sec._configData) {
      if (!sec._configData.feeds) sec._configData.feeds = {};
      sec._configData.feeds[title] = feedUrl;
    }
  } catch (e) {
    var sec2 = document.getElementById('settings-feeds');
    if (sec2 && sec2._configData) {
      if (!sec2._configData.feeds) sec2._configData.feeds = {};
      sec2._configData.feeds[url] = url;
    }
  }
  showSettingsPage();
}

function settingsRemoveFeed(name) {
  var sec = document.getElementById('settings-feeds');
  if (sec && sec._configData && sec._configData.feeds) {
    delete sec._configData.feeds[name];
  }
  showSettingsPage();
}

function settingsBackup() {
  var status = document.getElementById('backup-status');
  if (status) status.textContent = 'Preparing backup...';
  fetch('/api/backup').then(function(r) {
    if (!r.ok) throw new Error('Backup failed');
    var disp = r.headers.get('Content-Disposition') || '';
    var match = disp.match(/filename="([^"]+)"/);
    var filename = match ? match[1] : 'pullread-backup.json';
    return r.blob().then(function(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      if (status) status.textContent = 'Backup downloaded: ' + filename;
    });
  }).catch(function(e) {
    if (status) status.textContent = 'Backup failed: ' + e.message;
  });
}

function settingsRestore() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function() {
    if (!input.files || !input.files[0]) return;
    var status = document.getElementById('backup-status');
    if (status) status.textContent = 'Restoring...';
    var reader = new FileReader();
    reader.onload = function() {
      try {
        var data = JSON.parse(reader.result);
        if (!data._pullread_backup) {
          if (status) status.textContent = 'Not a valid PullRead backup file.';
          return;
        }
      } catch(e) {
        if (status) status.textContent = 'Could not read file: ' + e.message;
        return;
      }
      fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reader.result,
      }).then(function(r) { return r.json(); }).then(function(result) {
        if (result.ok) {
          if (status) status.textContent = 'Restored ' + result.restored + ' data files. Reload to see changes.';
        } else {
          if (status) status.textContent = 'Restore failed: ' + (result.error || 'unknown error');
        }
      }).catch(function(e) {
        if (status) status.textContent = 'Restore failed: ' + e.message;
      });
    };
    reader.readAsText(input.files[0]);
  };
  input.click();
}

// Frontmatter
function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: null, body: text };
  const meta = {};
  match[1].split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"');
      meta[key] = val;
    }
  });
  return { meta, body: match[2] };
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Clean up broken markdown patterns that marked.js can't handle
function cleanMarkdown(md) {
  // Fix image/link patterns split across lines:
  // [\n![alt](img)\n]\n(url) -> [![alt](img)](url)
  md = md.replace(/\[\s*\n\s*(!\[[^\]]*\]\([^)]*\))\s*\n\s*\]\s*\n\s*(\([^)]*\))/g, '[$1]$2');

  // Fix simpler case: [text\n](url) -> [text](url)
  md = md.replace(/\[([^\]]*?)\s*\n\s*\]\s*\n?\s*(\([^)]*\))/g, '[$1]$2');

  // Fix standalone brackets around images: [\n![alt](url)\n] without a link
  md = md.replace(/\[\s*\n(!\[[^\]]*\]\([^)]*\))\s*\n\]/g, '$1');

  // Fix image syntax broken by newlines: ![\nalt\n]\n(url) -> ![alt](url)
  md = md.replace(/!\[\s*\n?\s*([^\]]*?)\s*\n?\s*\]\s*\n\s*(\([^)]*\))/g, '![$1]$2');

  // Fix standalone brackets wrapping images on same line: [![alt](img)] -> ![alt](img)
  md = md.replace(/\[\s*(!\[[^\]]*\]\([^)]*\))\s*\]/g, '$1');

  // Fix broken link-wrapped images where link part is on next line: [![alt](img)]\n(url)
  md = md.replace(/(!\[[^\]]*\]\([^)]*\))\s*\]\s*\n\s*(\([^)]*\))/g, '$1');

  // Remove orphaned ](...) on its own line after an image (broken link fragment)
  md = md.replace(/(!\[[^\]]*\]\([^)]*\))\s*\n+\s*\]\([^)]*\)/g, '$1');

  // Collapse linked images where link URL = image URL: [![alt](url)](url) → ![alt](url)
  md = md.replace(/\[!\[([^\]]*)\]\(([^)]+)\)\]\(\2\)/g, '![$1]($2)');

  // Simplify Substack CDN proxy URLs in images — these are extremely long and contain
  // commas/colons that break marked.js. Extract the real image URL from inside.
  // e.g. ![alt](https://substackcdn.com/image/fetch/w_1456,c_limit,.../https%3A%2F%2Fsubstack-post-media...)
  // becomes ![alt](https://substack-post-media.s3.amazonaws.com/public/images/abc.png)
  md = md.replace(/!\[([^\]]*)\]\((https:\/\/substackcdn\.com\/image\/fetch\/[^)]+)\)/g, function(m, alt, url) {
    var inner = url.match(/\/image\/fetch\/[^/]*\/(https?[:%].*)/);
    if (inner) {
      try { return '![' + alt + '](' + decodeURIComponent(inner[1]) + ')'; } catch(e) {}
      return '![' + alt + '](' + inner[1] + ')';
    }
    return m;
  });

  // Also catch Substack CDN URLs that leaked out of image syntax as raw text on their own line.
  // These appear when the markdown image syntax broke (e.g. commas terminated the URL).
  // Pattern: line starting with the raw URL (possibly with a leading "(" or broken "![" prefix)
  md = md.replace(/^!?\[?[^\]\n]*\]?\(?(https:\/\/substackcdn\.com\/image\/fetch\/[^\s)]+)\)?$/gm, function(m, url) {
    var inner = url.match(/\/image\/fetch\/[^/]*\/(https?[:%].*)/);
    if (inner) {
      try { return '![]('+decodeURIComponent(inner[1])+')'; } catch(e) {}
      return '![]('+inner[1]+')';
    }
    return m;
  });

  // Remove standalone parenthesized URLs on their own line (leftover link targets)
  // e.g. a line that is just "(https://substackcdn.com/image/fetch/...)"
  md = md.replace(/^\(https?:\/\/[^)]+\)\s*$/gm, '');

  // Remove parenthesized URLs that span multiple lines (long substackcdn URLs wrap)
  md = md.replace(/^\(https?:\/\/[^\n)]*\n[^)]*\)\s*$/gm, '');

  // Remove Wayback Machine parenthesized URLs: (/web/20250908.../https://...)
  md = md.replace(/\(\/web\/\d+\/https?:\/\/[^)]+\)/g, '');

  // Remove lone [ or ] on their own line (broken markdown fragments)
  md = md.replace(/^\s*[\[\]]\s*$/gm, '');

  // Remove common image accessibility boilerplate from Wayback/archive extractions
  md = md.replace(/^\s*Press enter or click to view image in full size\s*$/gm, '');

  // Clean up PDF LaTeX/math artifacts from arxiv and academic papers
  md = md.replace(/start_POSTSUBSCRIPT\b/g, '');
  md = md.replace(/end_POSTSUBSCRIPT\b/g, '');
  md = md.replace(/start_POSTSUPERSCRIPT\b/g, '');
  md = md.replace(/end_POSTSUPERSCRIPT\b/g, '');
  md = md.replace(/\\boldsymbol\{[^}]*\}/g, '');
  md = md.replace(/\\mathbb\{[^}]*\}/g, '');
  md = md.replace(/\\left[\\\[\({|]/g, '');
  md = md.replace(/\\right[\\\]\)}|]/g, '');
  md = md.replace(/\\(?:text|mathrm|mathbf|mathcal|mathit)\{([^}]*)\}/g, '$1');
  md = md.replace(/\\(?:frac|sqrt|sum|prod|int|partial|nabla|infty|approx|neq|leq|geq|in|notin|subset|supset|cup|cap|forall|exists)\b/g, '');
  md = md.replace(/\^\{\\prime\}/g, "'");
  md = md.replace(/\{([^{}]*)\}/g, '$1');

  // Remove leftover empty lines from cleanup
  md = md.replace(/\n{3,}/g, '\n\n');

  return md;
}

// Rendering
function renderDashboard() {
  const dash = document.getElementById('dashboard');
  if (!dash) return;

  const empty = document.getElementById('empty-state');
  const content = document.getElementById('content');
  empty.style.display = '';
  if (content) content.style.display = 'none';

  if (allFiles.length === 0) {
    dash.innerHTML = '<div class="dash-empty-hint"><p class="hint">No articles yet</p><p class="subhint">Add RSS feeds in the tray app, or drop a .md file here</p></div>';
    return;
  }

  let html = '';

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const totalArticles = allFiles.length;
  const unreadCount = allFiles.filter(f => !readArticles.has(f.filename)).length;
  html += '<div class="dash-greeting">';
  html += '<h1>' + greeting + '</h1>';
  html += '<p>' + totalArticles + ' articles' + (unreadCount > 0 ? ' &middot; ' + unreadCount + ' unread' : '') + '</p>';
  html += '</div>';

  // Continue Reading — articles with saved scroll position (partially read)
  const positions = JSON.parse(localStorage.getItem('pr-scroll-positions') || '{}');
  const continueReading = allFiles.filter(f => {
    const pos = positions[f.filename];
    return pos && pos.pct > 0.05 && pos.pct < 0.9; // partially read
  }).sort((a, b) => (positions[b.filename].ts || 0) - (positions[a.filename].ts || 0)).slice(0, 10);

  if (continueReading.length > 0) {
    html += '<div class="dash-section">';
    html += '<div class="dash-section-header">';
    html += '<span class="dash-section-title"><svg viewBox="0 0 384 512"><use href="#i-book"/></svg> Continue Reading <span class="dash-section-count">(' + continueReading.length + ')</span></span>';
    html += '</div>';
    html += '<div class="dash-cards-wrap"><button class="dash-chevron left" onclick="dashScrollLeft(this)" aria-label="Scroll left">&#8249;</button><div class="dash-cards">';
    for (const f of continueReading) {
      html += dashCardHtml(f, positions[f.filename]?.pct);
    }
    html += '</div><button class="dash-chevron right" onclick="dashScrollRight(this)" aria-label="Scroll right">&#8250;</button></div></div>';
  }

  // Latest Reviews
  const reviews = allFiles.filter(f => f.feed === 'weekly-review' || f.feed === 'daily-review' || f.domain === 'pullread').slice(0, 5);
  if (reviews.length > 0) {
    html += '<div class="dash-section">';
    html += '<div class="dash-section-header">';
    html += '<span class="dash-section-title"><svg viewBox="0 0 512 512"><use href="#i-wand"/></svg> Reviews</span>';
    html += '</div>';
    html += '<div class="dash-cards-wrap"><button class="dash-chevron left" onclick="dashScrollLeft(this)" aria-label="Scroll left">&#8249;</button><div class="dash-cards">';
    for (const f of reviews) {
      const isWeekly = f.feed === 'weekly-review';
      const typeLabel = isWeekly ? 'Weekly' : 'Daily';
      const date = f.bookmarked ? f.bookmarked.slice(0, 10) : '';
      html += '<div class="dash-review-card" onclick="dashLoadArticle(\'' + escapeHtml(f.filename) + '\')">';
      html += '<div class="dash-review-title">' + escapeHtml(f.title) + '</div>';
      html += '<div class="dash-review-meta">' + typeLabel + ' Review' + (date ? ' &middot; ' + date : '') + '</div>';
      if (f.excerpt) html += '<div class="dash-review-excerpt">' + escapeHtml(f.excerpt) + '</div>';
      html += '</div>';
    }
    html += '</div><button class="dash-chevron right" onclick="dashScrollRight(this)" aria-label="Scroll right">&#8250;</button></div></div>';
  }

  // Favorites
  const favorites = allFiles.filter(f => allNotesIndex[f.filename]?.isFavorite);
  if (favorites.length > 0) {
    html += '<div class="dash-section">';
    html += '<div class="dash-section-header">';
    html += '<span class="dash-section-title"><svg viewBox="0 0 512 512"><use href="#i-heart"/></svg> Favorites <span class="dash-section-count">(' + favorites.length + ')</span></span>';
    html += '</div>';
    html += '<div class="dash-cards-wrap"><button class="dash-chevron left" onclick="dashScrollLeft(this)" aria-label="Scroll left">&#8249;</button><div class="dash-cards">';
    for (const f of favorites.slice(0, 10)) {
      html += dashCardHtml(f);
    }
    html += '</div><button class="dash-chevron right" onclick="dashScrollRight(this)" aria-label="Scroll right">&#8250;</button></div></div>';
  }

  // Recent — latest unread articles
  const recent = allFiles.filter(f => !readArticles.has(f.filename) && f.feed !== 'weekly-review' && f.feed !== 'daily-review' && f.domain !== 'pullread').slice(0, 20);
  if (recent.length > 0) {
    html += '<div class="dash-section">';
    html += '<div class="dash-section-header">';
    html += '<span class="dash-section-title"><svg viewBox="0 0 448 512"><use href="#i-calendar"/></svg> Recent <span class="dash-section-count">(' + recent.length + ')</span></span>';
    if (unreadCount > recent.length) {
      html += '<button class="dash-view-all" onclick="document.getElementById(\'search\').focus()">View all ' + unreadCount + ' &rsaquo;</button>';
    }
    html += '</div>';
    html += '<div class="dash-cards-wrap"><button class="dash-chevron left" onclick="dashScrollLeft(this)" aria-label="Scroll left">&#8249;</button><div class="dash-cards">';
    for (const f of recent) {
      html += dashCardHtml(f);
    }
    html += '</div><button class="dash-chevron right" onclick="dashScrollRight(this)" aria-label="Scroll right">&#8250;</button></div></div>';
  }

  dash.innerHTML = html;
  // Initialize chevron visibility after DOM is populated
  requestAnimationFrame(initDashChevrons);
}

function dashCardHtml(f, progressPct) {
  const idx = displayFiles.findIndex(d => d.filename === f.filename);
  const onclick = idx >= 0 ? 'loadFile(' + idx + ')' : 'dashLoadArticle(\'' + escapeHtml(f.filename) + '\')';
  const domain = f.domain || '';
  const favicon = domain ? 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=32' : '';
  const date = f.bookmarked ? f.bookmarked.slice(0, 10) : '';

  let html = '<div class="dash-card" onclick="' + onclick + '">';

  // Image or placeholder
  if (f.image) {
    html += '<img class="dash-card-img" src="' + escapeHtml(f.image) + '" alt="" loading="lazy" onerror="this.outerHTML=\'<div class=dash-card-img-placeholder><svg style=width:32px;height:32px;fill:currentColor viewBox=&quot;0 0 448 512&quot;><use href=&quot;#i-book&quot;/></svg></div>\'">';
  } else {
    html += '<div class="dash-card-img-placeholder"><svg style="width:32px;height:32px;fill:currentColor" viewBox="0 0 448 512"><use href="#i-book"/></svg></div>';
  }

  html += '<div class="dash-card-body">';

  // Meta row: favicon, domain, feed badge
  html += '<div class="dash-card-meta">';
  if (favicon) html += '<img src="' + escapeHtml(favicon) + '" alt="" loading="lazy">';
  if (domain) html += '<span>' + escapeHtml(domain) + '</span>';
  if (f.feed && f.feed !== domain) html += '<span class="dash-card-badge">' + escapeHtml(f.feed) + '</span>';
  html += '</div>';

  // Title
  html += '<div class="dash-card-title">' + escapeHtml(f.title) + '</div>';

  // Excerpt
  if (f.excerpt) {
    html += '<div class="dash-card-excerpt">' + escapeHtml(f.excerpt) + '</div>';
  }

  // Progress bar for continue reading
  if (progressPct !== undefined && progressPct > 0) {
    html += '<div class="dash-card-progress"><div class="dash-card-progress-fill" style="width:' + Math.round(progressPct * 100) + '%"></div></div>';
  }

  html += '</div></div>';
  return html;
}

function goHome() {
  _sidebarView = 'library'; syncSidebarTabs();
  activeFile = null;
  document.title = 'PullRead';
  renderDashboard();
}

function dashScrollLeft(btn) {
  const cards = btn.closest('.dash-cards-wrap').querySelector('.dash-cards');
  cards.scrollBy({ left: -300, behavior: 'smooth' });
}

function dashScrollRight(btn) {
  const cards = btn.closest('.dash-cards-wrap').querySelector('.dash-cards');
  cards.scrollBy({ left: 300, behavior: 'smooth' });
}

function initDashChevrons() {
  document.querySelectorAll('.dash-cards').forEach(cards => {
    const wrap = cards.closest('.dash-cards-wrap');
    if (!wrap) return;
    const leftBtn = wrap.querySelector('.dash-chevron.left');
    const rightBtn = wrap.querySelector('.dash-chevron.right');

    function updateChevrons() {
      const hasOverflow = cards.scrollWidth > cards.clientWidth + 8;
      if (leftBtn) leftBtn.classList.toggle('visible', hasOverflow && cards.scrollLeft > 8);
      if (rightBtn) rightBtn.classList.toggle('visible', hasOverflow && cards.scrollLeft < cards.scrollWidth - cards.clientWidth - 8);
    }
    cards.addEventListener('scroll', updateChevrons);
    updateChevrons();
    // Recheck after images load
    setTimeout(updateChevrons, 500);
  });
}

function dashLoadArticle(filename) {
  const idx = displayFiles.findIndex(f => f.filename === filename);
  if (idx >= 0) {
    loadFile(idx);
  } else {
    // File might be filtered out — search all files
    const allIdx = allFiles.findIndex(f => f.filename === filename);
    if (allIdx >= 0) {
      // Clear search and reload
      document.getElementById('search').value = '';
      filterFiles();
      const newIdx = displayFiles.findIndex(f => f.filename === filename);
      if (newIdx >= 0) loadFile(newIdx);
    }
  }
}

function renderArticle(text, filename) {
  const { meta, body } = parseFrontmatter(text);
  const content = document.getElementById('content');
  const empty = document.getElementById('empty-state');

  empty.style.display = 'none';
  content.style.display = 'block';

  let html = '';

  // Article header: title, author, date, domain, actions
  html += '<div class="article-header">';
  if (meta && meta.title) {
    html += '<h1>' + escapeHtml(meta.title) + '</h1>';
  }
  html += '<div class="article-byline">';
  const bylineParts = [];
  if (meta && meta.author) {
    // Truncate overly long bylines (e.g. full author bios from PDFs/arxiv)
    var authorText = meta.author;
    if (authorText.length > 80) {
      // Try to cut at first sentence boundary or period
      var cutoff = authorText.indexOf('. ');
      if (cutoff > 10 && cutoff < 80) authorText = authorText.slice(0, cutoff);
      else authorText = authorText.slice(0, 80).replace(/\s+\S*$/, '') + '\u2026';
    }
    bylineParts.push('<span class="author">' + escapeHtml(authorText) + '</span>');
  }
  if (meta && meta.domain) bylineParts.push('<a href="' + escapeHtml(meta.url || '') + '" target="_blank">' + escapeHtml(meta.domain) + '</a>');
  if (meta && meta.bookmarked) bylineParts.push(escapeHtml(meta.bookmarked.slice(0, 10)));
  html += bylineParts.join('<span class="sep">&middot;</span>');
  // Read time will be inserted after rendering
  html += '</div>';

  // Detect review/summary articles where Summarize doesn't make sense
  const isReviewArticle = meta && (meta.feed === 'weekly-review' || meta.feed === 'daily-review' || meta.domain === 'pullread');

  // Action buttons row
  html += '<div class="article-actions">';
  const isFav = articleNotes.isFavorite;
  html += '<button onclick="toggleFavoriteFromHeader(this)" class="' + (isFav ? 'active-fav' : '') + '" aria-label="' + (isFav ? 'Remove from favorites' : 'Add to favorites') + '" aria-pressed="' + isFav + '"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-' + (isFav ? 'heart' : 'heart-o') + '"/></svg> Favorite</button>';
  html += '<button onclick="toggleNotesFromHeader()" aria-label="Toggle notes panel"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-pen"/></svg> Notes</button>';
  if (!isReviewArticle) {
    html += '<button onclick="summarizeArticle()" id="summarize-btn" aria-label="Summarize article"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-wand"/></svg> Summarize</button>';
  }
  html += '<button onclick="addCurrentToTTSQueue()" aria-label="Listen to article"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-volume"/></svg> Listen</button>';
  if (meta && meta.url) {
    html += '<div class="share-dropdown"><button onclick="toggleShareDropdown(event)" aria-label="Share article"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-share"/></svg> Share</button></div>';
  }
  html += '<button onclick="markCurrentAsUnread()" aria-label="Mark as unread"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-eye-slash"/></svg> Unread</button>';
  html += '</div>';
  // Show notebook back-references
  var nbRefs = Object.values(_notebooks || {}).filter(function(nb) { return nb.sources && nb.sources.indexOf(filename) >= 0; });
  if (nbRefs.length) {
    html += '<div style="margin-top:6px">';
    for (var nbi = 0; nbi < nbRefs.length; nbi++) {
      html += '<span class="notebook-ref" onclick="openNotebookEditor(\'' + nbRefs[nbi].id + '\')"><svg class="icon icon-sm" style="vertical-align:-1px"><use href="#i-pen"/></svg> ' + escapeHtml(nbRefs[nbi].title || 'Untitled notebook') + '</span>';
    }
    html += '</div>';
  }
  html += '</div>';

  // Show existing summary if present in frontmatter
  if (meta && meta.summary) {
    const sp = meta.summaryProvider || '';
    const sm = meta.summaryModel || '';
    html += '<div class="article-summary"><div class="summary-header"><div class="summary-header-left">'
      + summaryBadgesHtml(sp, sm)
      + '</div><span class="summary-actions"><button onclick="hideSummary()" title="Hide summary"><svg class="icon icon-sm"><use href="#i-xmark"/></svg></button></span></div>'
      + escapeHtml(meta.summary) + '</div>';
  }

  // YouTube embed: detect from frontmatter and inject responsive iframe
  const isYouTube = meta && meta.domain && /youtube\.com|youtu\.be|m\.youtube\.com/.test(meta.domain);
  if (isYouTube && meta.url) {
    var ytId = null;
    try {
      var ytUrl = new URL(meta.url);
      if (ytUrl.hostname === 'youtu.be') ytId = ytUrl.pathname.slice(1).split('/')[0];
      else if (ytUrl.searchParams.get('v')) ytId = ytUrl.searchParams.get('v');
      else { var em = ytUrl.pathname.match(/\/(embed|v)\/([^/?]+)/); if (em) ytId = em[2]; }
    } catch {}
    if (ytId) {
      html += '<div class="yt-embed"><iframe src="https://www.youtube.com/embed/' + encodeURIComponent(ytId)
        + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" title="Embedded video"></iframe></div>';
    }
  }

  // Strip the leading H1 from markdown body if it matches the title (avoid duplication)
  let articleBody = cleanMarkdown(body);
  if (meta && meta.title) {
    var h1Match = articleBody.match(/^\s*#\s+(.+)\s*\n/);
    if (h1Match) {
      var normalize = function(s) { return s.toLowerCase().replace(/[\u2018\u2019\u201C\u201D]/g, "'").replace(/[^a-z0-9]/g, ''); };
      // Strip if title matches, or if it's a review (title always duplicated in body)
      if (normalize(h1Match[1]) === normalize(meta.title) || isReviewArticle) {
        articleBody = articleBody.slice(h1Match[0].length);
      }
    }
  }

  // Strip the YouTube thumbnail link from body when we already injected an embed
  if (isYouTube) {
    articleBody = articleBody.replace(/\[!\[.*?\]\(https:\/\/img\.youtube\.com\/vi\/[^)]*\)\]\([^)]*\)\s*/g, '');
  }

  html += marked.parse(articleBody);

  // Deduplicate images: remove consecutive/nearby img tags with the same src
  html = (function dedupeImages(h) {
    const div = document.createElement('div');
    div.innerHTML = h;
    const imgs = Array.from(div.querySelectorAll('img'));
    const seen = new Set();
    for (const img of imgs) {
      const src = img.getAttribute('src');
      if (!src) continue;
      // Normalize: strip query params for dedup comparison
      let key;
      try { key = new URL(src).origin + new URL(src).pathname; } catch { key = src; }
      if (seen.has(key)) {
        // Remove the duplicate image (and its wrapping <p> or <a> if it's the only child)
        const parent = img.parentElement;
        if (parent && (parent.tagName === 'P' || parent.tagName === 'A') && parent.children.length === 1 && parent.textContent.trim() === '') {
          parent.remove();
        } else {
          img.remove();
        }
      } else {
        seen.add(key);
      }
    }
    return div.innerHTML;
  })(html);

  // Convert YouTube thumbnail links into embedded video iframes (fallback for inline links)
  html = html.replace(
    /<a[^>]*href="(https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?v=([^"&]+)[^"]*|https?:\/\/youtu\.be\/([^"/?]+)[^"]*)"[^>]*>\s*<img[^>]*src="https:\/\/img\.youtube\.com\/vi\/[^"]*"[^>]*\/?>\s*<\/a>/gi,
    function(match, url, id1, id2) {
      var videoId = id1 || id2;
      if (!videoId) return match;
      return '<div class="yt-embed"><iframe src="https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" title="Embedded video"></iframe></div>';
    }
  );

  content.innerHTML = html;
  document.title = (meta && meta.title) || filename || 'PullRead';

  // Apply review-content class for link-blog styling on review articles
  if (isReviewArticle) {
    content.classList.add('review-content');
  } else {
    content.classList.remove('review-content');
  }

  // Post-process for accessibility
  content.querySelectorAll('img:not([alt])').forEach(function(img) { img.setAttribute('alt', ''); });
  content.querySelectorAll('img[alt=""]').forEach(function(img) { img.setAttribute('role', 'presentation'); });
  content.querySelectorAll('table').forEach(function(table) {
    if (!table.querySelector('thead')) {
      var firstRow = table.querySelector('tr');
      if (firstRow && firstRow.querySelectorAll('th').length > 0) {
        firstRow.querySelectorAll('th').forEach(function(th) { th.setAttribute('scope', 'col'); });
      }
    }
    table.setAttribute('role', 'table');
  });
  // Open article content links in new window
  content.querySelectorAll('a[href]').forEach(function(a) {
    var href = a.getAttribute('href');
    if (href && !href.startsWith('#')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });
  // Wrap standalone images in links to their full-size source
  content.querySelectorAll('img[src]').forEach(function(img) {
    var parent = img.parentElement;
    // Skip images already wrapped in a link
    if (parent && parent.tagName === 'A') return;
    var src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) return;
    var a = document.createElement('a');
    a.href = src;
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    img.parentNode.insertBefore(a, img);
    a.appendChild(img);
  });
  // Clean up leftover broken markdown artifacts (stray brackets, parenthesized URLs)
  (function cleanBrokenFragments(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var removals = [];
    while (walker.nextNode()) {
      var node = walker.currentNode;
      var text = node.textContent;
      // Remove text nodes that are just lone brackets
      if (/^\s*[\[\]]\s*$/.test(text)) { removals.push(node); continue; }
      // Remove text nodes that are just a parenthesized URL
      if (/^\s*\(https?:\/\/[^)]+\)\s*$/.test(text)) { removals.push(node); continue; }
      // Remove leading/trailing lone brackets in mixed text
      var cleaned = text.replace(/^\s*\[\s*/, '').replace(/\s*\]\s*$/, '');
      if (cleaned !== text) node.textContent = cleaned;
    }
    removals.forEach(function(n) {
      var p = n.parentElement;
      n.remove();
      // Remove empty <p> tags left behind
      if (p && p.tagName === 'P' && !p.textContent.trim() && !p.querySelector('img,a,iframe')) p.remove();
    });
  })(content);

  // Add read time & word count to byline
  const articleBodyText = content.textContent || '';
  const { words, minutes } = calculateReadStats(articleBodyText);
  const bylineEl = content.querySelector('.article-byline');
  if (bylineEl && words > 50) {
    const statsSpan = document.createElement('span');
    statsSpan.className = 'read-stats';
    if (bylineEl.children.length > 0) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.innerHTML = '&middot;';
      bylineEl.appendChild(sep);
    }
    statsSpan.innerHTML = minutes + ' min read<span class="stat-divider">&middot;</span>' + (words >= 1000 ? (words / 1000).toFixed(1) + 'k' : words) + ' words';
    bylineEl.appendChild(statsSpan);
  }

  // Render diagrams (mermaid, d2) before highlighting
  renderDiagrams();

  // Apply syntax highlighting to code blocks
  applySyntaxHighlighting();

  // Generate table of contents
  generateToc();

  // Scroll to top
  document.getElementById('content-pane').scrollTop = 0;

  // Reset reading progress
  updateReadingProgress();

  // Clear margin notes
  document.getElementById('margin-notes').innerHTML = '';

  // Restore scroll position (after a tick so DOM is settled)
  setTimeout(() => restoreScrollPosition(filename), 100);

  // Update focus mode if active
  if (focusModeActive) {
    setTimeout(updateFocusMode, 200);
  }
}

// File list
function renderFileList() {
  const list = document.getElementById('file-list');
  const countText = document.getElementById('file-count-text');

  // Apply hide-read filter
  if (hideRead) {
    displayFiles = filteredFiles.filter(f => !readArticles.has(f.filename) || f.filename === activeFile);
  } else {
    displayFiles = filteredFiles;
  }

  // Build notebook items from loaded notebooks, filtered by search
  const nbs = Object.values(_notebooks).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const searchTerm = (document.getElementById('search').value || '').trim().toLowerCase();
  const nbItems = nbs.filter(function(nb) {
    if (!searchTerm) return true;
    const title = (nb.title || '').toLowerCase();
    const tags = (nb.tags || []).join(' ').toLowerCase();
    return title.includes(searchTerm) || tags.includes(searchTerm);
  });

  const total = filteredFiles.length;
  const shown = displayFiles.length;
  const isNotebooksTab = _sidebarView === 'notebooks';

  let countStr;
  if (isNotebooksTab) {
    countStr = 'Notebook';
  } else {
    countStr = shown + ' article' + (shown !== 1 ? 's' : '');
    if (hideRead && shown < total) countStr += ' (' + (total - shown) + ' hidden)';
  }
  countText.textContent = countStr;

  let html = '';
  if (isNotebooksTab) {
    // Single notebook — show just the shared notebook item
    if (_notebooks[SINGLE_NOTEBOOK_ID]) {
      html += renderNotebookItem(_notebooks[SINGLE_NOTEBOOK_ID]);
    }
  } else {
    // Library / Explore: show articles only
    displayedCount = Math.min(displayFiles.length, PAGE_SIZE);
    html += displayFiles.slice(0, displayedCount).map((f, i) => renderFileItem(f, i)).join('');
  }

  list.innerHTML = html;
}

function renderFileItem(f, i) {
  const date = f.bookmarked ? f.bookmarked.slice(0, 10) : '';
  const isActive = activeFile === f.filename ? ' active' : '';
  const isRead = readArticles.has(f.filename);
  const { hasHl, hasNote, isFavorite } = hasAnnotations(f.filename);
  const hasSummary = f.hasSummary;
  let indicators = '';
  if (hasHl || hasNote || hasSummary || isFavorite) {
    indicators = '<div class="file-item-indicators">'
      + (isFavorite ? '<span class="dot dot-favorite" aria-label="Favorite"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-heart"/></svg></span>' : '')
      + (hasHl ? '<span class="dot dot-highlight" aria-label="Has highlights"></span>' : '')
      + (hasNote ? '<span class="dot dot-note" aria-label="Has notes"></span>' : '')
      + (hasSummary ? '<span class="dot dot-summary" aria-label="Has summary"></span>' : '')
      + '</div>';
  }

  // Favicon from Google service
  const favicon = f.domain && f.domain !== 'pullread'
    ? '<img class="file-item-favicon" src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(f.domain) + '&sz=32" alt="" loading="lazy" onerror="this.style.display=\'none\'" aria-hidden="true">'
    : '';

  const metaParts = [];
  if (date) metaParts.push('<span>' + date + '</span>');
  if (f.domain) metaParts.push('<span>' + escapeHtml(f.domain) + '</span>');
  const metaHtml = metaParts.join('<span class="meta-sep"></span>');

  return '<div class="file-item' + isActive + (isRead && !isActive ? ' read' : '') + '" data-index="' + i + '" data-filename="' + escapeHtml(f.filename) + '" onclick="loadFile(' + i + ')" role="option" aria-selected="' + (activeFile === f.filename) + '" tabindex="0" onkeydown="if(event.key===\'Enter\')loadFile(' + i + ')">'
    + '<div class="file-item-title">' + escapeHtml(f.title) + '</div>'
    + '<div class="file-item-meta">' + metaHtml + favicon + '</div>'
    + indicators
    + '</div>';
}

function renderNotebookItem(nb) {
  const isActive = _activeNotebook && _activeNotebook.id === nb.id && !activeFile ? ' active' : '';
  const date = nb.updatedAt ? new Date(nb.updatedAt).toLocaleDateString() : '';
  return '<div class="file-item notebook-item' + isActive + '" data-notebook-id="' + escapeHtml(nb.id) + '" onclick="openNotebookInPane(\'' + escapeHtml(nb.id) + '\')" role="option" tabindex="0" onkeydown="if(event.key===\'Enter\')openNotebookInPane(\'' + escapeHtml(nb.id) + '\')">'
    + '<div class="file-item-title"><svg class="nb-icon" aria-hidden="true"><use href="#i-book"/></svg>' + escapeHtml(nb.title || 'Untitled') + '</div>'
    + '<div class="file-item-meta"><span>' + date + '</span><span class="meta-sep"></span><span>notebook</span></div>'
    + '</div>';
}

function toggleHideRead() {
  hideRead = document.getElementById('hide-read-toggle').checked;
  localStorage.setItem('pr-hide-read', hideRead ? '1' : '0');
  renderFileList();
}

function markAsRead(filename) {
  readArticles.add(filename);
  // Keep only last 5000 entries
  if (readArticles.size > 5000) {
    const arr = Array.from(readArticles);
    readArticles = new Set(arr.slice(arr.length - 5000));
  }
  localStorage.setItem('pr-read-articles', JSON.stringify(Array.from(readArticles)));
}

function markCurrentAsUnread() {
  if (!activeFile) return;
  readArticles.delete(activeFile);
  localStorage.setItem('pr-read-articles', JSON.stringify(Array.from(readArticles)));
  renderFileList();
}

function filterFiles() {
  const raw = document.getElementById('search').value.trim();
  if (!raw) {
    filteredFiles = allFiles;
    renderFileList();
    return;
  }

  // Parse search query into groups separated by OR
  // Each group is an array of terms that must ALL match (AND)
  // Groups are combined with OR
  const orGroups = raw.split(/\bOR\b/i).map(g => g.trim()).filter(Boolean);

  filteredFiles = allFiles.filter(f => {
    const notes = allNotesIndex[f.filename];
    const { hasHl, hasNote, isFavorite, hasTags } = hasAnnotations(f.filename);

    return orGroups.some(group => {
      // Split group into individual terms (AND logic)
      const terms = group.match(/"[^"]*"|\S+/g) || [];
      return terms.every(term => {
        // Remove surrounding quotes if present
        const t = term.replace(/^"(.*)"$/, '$1');
        const tl = t.toLowerCase();

        // Operator: is:favorite / is:fav
        if (tl === 'is:favorite' || tl === 'is:fav') return isFavorite;
        // Operator: is:read
        if (tl === 'is:read') return readArticles.has(f.filename);
        // Operator: is:unread
        if (tl === 'is:unread') return !readArticles.has(f.filename);
        // Operator: has:summary
        if (tl === 'has:summary') return f.hasSummary;
        // Operator: has:highlights
        if (tl === 'has:highlights' || tl === 'has:highlight') return hasHl;
        // Operator: has:notes
        if (tl === 'has:notes' || tl === 'has:note') return hasNote;
        // Operator: has:tags
        if (tl === 'has:tags' || tl === 'has:tag') return hasTags;
        // Operator: tag:value
        if (tl.startsWith('tag:')) {
          const tagQ = tl.slice(4);
          if (!tagQ) return hasTags;
          const allTags = [...(notes?.tags || []), ...(notes?.machineTags || [])];
          return allTags.some(t => t.toLowerCase().includes(tagQ));
        }
        // Operator: feed:value
        if (tl.startsWith('feed:')) {
          const feedQ = tl.slice(5);
          return f.feed.toLowerCase().includes(feedQ);
        }
        // Operator: domain:value
        if (tl.startsWith('domain:')) {
          const domQ = tl.slice(7);
          return f.domain.toLowerCase().includes(domQ);
        }
        // Operator: author:value
        if (tl.startsWith('author:')) {
          const authQ = tl.slice(7);
          return (f.author || '').toLowerCase().includes(authQ);
        }

        // Plain text search — match against title, domain, feed, tags
        return f.title.toLowerCase().includes(tl) ||
          f.domain.toLowerCase().includes(tl) ||
          f.feed.toLowerCase().includes(tl) ||
          (notes?.tags || []).some(t => t.toLowerCase().includes(tl)) ||
          (notes?.machineTags || []).some(t => t.toLowerCase().includes(tl));
      });
    });
  });

  renderFileList();
}

async function loadFile(index) {
  const file = displayFiles[index];
  if (!file) return;
  _sidebarView = 'library'; syncSidebarTabs();
  activeFile = file.filename;
  markAsRead(file.filename);
  renderFileList();
  removeHlToolbar();

  // Auto-close sidebar on mobile after selecting an article
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar.classList.contains('collapsed')) sidebar.classList.add('collapsed');
  }

  if (serverMode) {
    // Load annotations first so favorite state is available for header render
    await preloadAnnotations(file.filename);
    const res = await fetch('/api/file?name=' + encodeURIComponent(file.filename));
    if (res.ok) {
      const text = await res.text();
      renderArticle(text, file.filename);
      applyHighlights();
      renderNotesPanel();
    }
  }
}

// Navigate to next (+1) or previous (-1) article with wrapping
function navigateArticle(direction) {
  if (!displayFiles.length) return;
  const currentIdx = displayFiles.findIndex(f => f.filename === activeFile);
  let next;
  if (direction > 0) {
    next = currentIdx < displayFiles.length - 1 ? currentIdx + 1 : 0;
  } else {
    next = currentIdx > 0 ? currentIdx - 1 : displayFiles.length - 1;
  }
  loadFile(next);
  const el = document.querySelector('.file-item[data-index="' + next + '"]');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

// ---- Highlights & Notes ----

async function preloadAnnotations(filename) {
  if (!serverMode) return;
  try {
    const [hlRes, notesRes] = await Promise.all([
      fetch('/api/highlights?name=' + encodeURIComponent(filename)),
      fetch('/api/notes?name=' + encodeURIComponent(filename))
    ]);
    articleHighlights = hlRes.ok ? await hlRes.json() : [];
    const notesData = notesRes.ok ? await notesRes.json() : {};
    articleNotes = { articleNote: '', annotations: [], tags: [], isFavorite: false, ...notesData };
  } catch {
    articleHighlights = [];
    articleNotes = { articleNote: '', annotations: [], tags: [], isFavorite: false };
  }
}

async function loadAnnotations(filename) {
  await preloadAnnotations(filename);
  applyHighlights();
  renderNotesPanel();
}

async function loadAnnotationsIndex() {
  if (!serverMode) return;
  try {
    const [hlRes, notesRes] = await Promise.all([
      fetch('/api/highlights'),
      fetch('/api/notes')
    ]);
    allHighlightsIndex = hlRes.ok ? await hlRes.json() : {};
    allNotesIndex = notesRes.ok ? await notesRes.json() : {};
  } catch {
    allHighlightsIndex = {};
    allNotesIndex = {};
  }
}

function hasAnnotations(filename) {
  const hls = allHighlightsIndex[filename] || [];
  const hasHl = hls.length > 0;
  const hasHlNotes = hls.some(h => h.note);
  const notes = allNotesIndex[filename];
  const hasNote = notes && (notes.articleNote || (notes.annotations && notes.annotations.length > 0) || hasHlNotes);
  const isFavorite = notes && notes.isFavorite;
  const hasTags = notes && ((notes.tags && notes.tags.length > 0) || (notes.machineTags && notes.machineTags.length > 0));
  return { hasHl, hasNote, isFavorite, hasTags };
}

async function saveHighlights() {
  if (!serverMode || !activeFile) return;
  allHighlightsIndex[activeFile] = articleHighlights;
  await fetch('/api/highlights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: activeFile, highlights: articleHighlights })
  });
}

async function saveNotes() {
  if (!serverMode || !activeFile) return;
  allNotesIndex[activeFile] = articleNotes;
  await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: activeFile, ...articleNotes })
  });
}

function generateId() {
  return 'h' + Math.random().toString(36).slice(2, 8);
}

function getTextContext(text, before, after) {
  // Get surrounding context for anchoring
  const content = document.getElementById('content');
  const fullText = content.textContent || '';
  const idx = fullText.indexOf(text);
  if (idx < 0) return { contextBefore: '', contextAfter: '' };
  return {
    contextBefore: fullText.slice(Math.max(0, idx - 30), idx),
    contextAfter: fullText.slice(idx + text.length, idx + text.length + 30)
  };
}

function createHighlight(color) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

  const text = sel.toString();
  const { contextBefore, contextAfter } = getTextContext(text);

  const now = new Date().toISOString();
  const highlight = {
    id: generateId(),
    text: text,
    contextBefore,
    contextAfter,
    color: color,
    note: '',
    createdAt: now,
    updatedAt: now
  };

  articleHighlights.push(highlight);
  saveHighlights();
  applyHighlights();
  removeHlToolbar();
  sel.removeAllRanges();
  renderFileList(); // update indicator dots
}

function deleteHighlight(id) {
  articleHighlights = articleHighlights.filter(h => h.id !== id);
  saveHighlights();
  applyHighlights();
  renderFileList();
}

function applyHighlights() {
  const content = document.getElementById('content');
  if (!content) return;

  // Remove existing highlights (re-render from raw HTML)
  content.querySelectorAll('mark.pr-highlight').forEach(mark => {
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });

  // Remove annotation markers and highlight note markers
  content.querySelectorAll('.annotation-marker').forEach(m => m.remove());
  content.querySelectorAll('.hl-note-marker').forEach(m => m.remove());

  // Apply each highlight
  for (const hl of articleHighlights) {
    findAndWrap(content, hl);
  }

  // Apply inline annotations
  for (const ann of (articleNotes.annotations || [])) {
    findAndMarkAnnotation(content, ann);
  }

  // Render margin notes for highlights with notes and inline annotations
  renderMarginNotes();
}

function renderMarginNotes() {
  const marginContainer = document.getElementById('margin-notes');
  if (!marginContainer) return;
  marginContainer.innerHTML = '';

  const pane = document.getElementById('content-pane');
  if (!pane) return;
  const paneRect = pane.getBoundingClientRect();

  const notes = [];

  // Collect highlight notes
  for (const hl of articleHighlights) {
    if (!hl.note) continue;
    const mark = document.querySelector('mark[data-hl-id="' + hl.id + '"]');
    if (!mark) continue;
    const rect = mark.getBoundingClientRect();
    notes.push({
      top: rect.top - paneRect.top + pane.scrollTop,
      anchorText: hl.text.slice(0, 40),
      body: hl.note,
      id: hl.id,
      type: 'highlight'
    });
  }

  // Collect inline annotation notes
  for (const ann of (articleNotes.annotations || [])) {
    const matchedMarker = document.querySelector('.annotation-marker[data-ann-id="' + ann.id + '"]');
    if (!matchedMarker) continue;
    const rect = matchedMarker.getBoundingClientRect();
    notes.push({
      top: rect.top - paneRect.top + pane.scrollTop,
      anchorText: (ann.anchorText || '').slice(0, 40),
      body: ann.note,
      id: ann.id,
      type: 'annotation'
    });
  }

  // Sort by position and spread out overlapping notes
  notes.sort((a, b) => a.top - b.top);
  let lastBottom = 0;
  for (const n of notes) {
    if (n.top < lastBottom + 8) n.top = lastBottom + 8;
    const div = document.createElement('div');
    div.className = 'margin-note';
    div.style.top = n.top + 'px';
    div.innerHTML = '<div class="mn-text">' + escapeHtml(n.anchorText) + (n.anchorText.length >= 40 ? '...' : '') + '</div>'
      + '<div class="mn-body">' + escapeHtml(n.body) + '</div>';
    div.onclick = function() {
      if (n.type === 'highlight') {
        editHighlightNote(n.id, { clientX: window.innerWidth / 2, clientY: 200 });
      } else {
        const ann = (articleNotes.annotations || []).find(a => a.id === n.id);
        if (ann) showAnnotationPopover({ clientX: window.innerWidth / 2, clientY: 200 }, ann);
      }
    };
    marginContainer.appendChild(div);
    lastBottom = n.top + div.offsetHeight;
  }
}

function findAndWrap(container, hl) {
  const searchText = hl.text;
  const fullText = container.textContent || '';

  // Find the best match position using context
  let targetGlobalIdx = -1;
  if (hl.contextBefore || hl.contextAfter) {
    const ctxBefore = (hl.contextBefore || '').slice(-15);
    const ctxAfter = (hl.contextAfter || '').slice(0, 15);
    const needle = ctxBefore + searchText + ctxAfter;
    const pos = fullText.indexOf(needle);
    if (pos >= 0) {
      targetGlobalIdx = pos + ctxBefore.length;
    }
  }
  if (targetGlobalIdx < 0) {
    targetGlobalIdx = fullText.indexOf(searchText);
  }
  if (targetGlobalIdx < 0) return;

  const endGlobalIdx = targetGlobalIdx + searchText.length;

  // Walk text nodes to find start and end positions (handles cross-element spans)
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let startNode = null, startOffset = 0;
  let endNode = null, endOffset = 0;
  let node;

  while (node = walker.nextNode()) {
    const nodeLen = node.textContent.length;
    if (!startNode && charCount + nodeLen > targetGlobalIdx) {
      startNode = node;
      startOffset = targetGlobalIdx - charCount;
    }
    if (startNode && charCount + nodeLen >= endGlobalIdx) {
      endNode = node;
      endOffset = endGlobalIdx - charCount;
      break;
    }
    charCount += nodeLen;
  }

  if (!startNode || !endNode) return;

  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const mark = document.createElement('mark');
    mark.className = 'pr-highlight hl-' + hl.color;
    mark.setAttribute('data-hl-id', hl.id);
    mark.onclick = function(e) {
      e.stopPropagation();
      showHighlightContextMenu(e, hl);
    };

    // extractContents handles cross-element ranges (bold/italic boundaries)
    // where surroundContents would throw
    const fragment = range.extractContents();
    mark.appendChild(fragment);
    range.insertNode(mark);
  } catch {
    return;
  }
}

function findAndMarkAnnotation(container, ann) {
  if (!ann.anchorText) return;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node;
  while (node = walker.nextNode()) {
    const idx = node.textContent.indexOf(ann.anchorText);
    if (idx < 0) continue;
    // Insert a marker after the anchor text
    const marker = document.createElement('span');
    marker.className = 'annotation-marker';
    marker.setAttribute('data-ann-id', ann.id);
    marker.textContent = 'n';
    marker.title = ann.note;
    marker.onclick = function(e) {
      e.stopPropagation();
      showAnnotationPopover(e, ann);
    };
    const textAfter = node.splitText(idx + ann.anchorText.length);
    textAfter.parentNode.insertBefore(marker, textAfter);
    return;
  }
}

// Floating highlight toolbar on text selection
let hlToolbarEl = null;

function removeHlToolbar() {
  if (hlToolbarEl) {
    hlToolbarEl.remove();
    hlToolbarEl = null;
  }
  // Only remove annotation popover if not actively focused (user is typing)
  const popover = document.querySelector('.annotation-popover');
  if (popover && !popover.contains(document.activeElement)) {
    popover.remove();
  }
}

function removeAnnotationPopover() {
  const existing = document.querySelector('.annotation-popover');
  if (existing) existing.remove();
}

function showHlToolbar(x, y) {
  removeHlToolbar();
  const bar = document.createElement('div');
  bar.className = 'hl-toolbar';
  // Prevent mousedown from clearing the text selection — critical for
  // highlight/note buttons to read the selection when their onclick fires
  bar.addEventListener('mousedown', e => e.preventDefault());
  bar.innerHTML = `
    <button class="hl-yellow-btn" aria-label="Highlight yellow" onclick="createHighlight('yellow')"></button>
    <button class="hl-green-btn" aria-label="Highlight green" onclick="createHighlight('green')"></button>
    <button class="hl-blue-btn" aria-label="Highlight blue" onclick="createHighlight('blue')"></button>
    <button class="hl-pink-btn" aria-label="Highlight pink" onclick="createHighlight('pink')"></button>
    <button class="hl-note-btn" aria-label="Add note" onclick="addInlineNote()">+ Note</button>
  `;
  bar.style.left = x + 'px';
  bar.style.top = y + 'px';
  document.getElementById('content-pane').appendChild(bar);
  hlToolbarEl = bar;
}

function showHighlightContextMenu(e, hl) {
  removeHlToolbar();
  const bar = document.createElement('div');
  bar.className = 'hl-toolbar';
  bar.addEventListener('mousedown', e => e.preventDefault());
  const noteLabel = hl.note ? 'Edit Note' : 'Note';
  bar.innerHTML = `
    <button class="hl-yellow-btn" aria-label="Yellow" onclick="changeHighlightColor('${hl.id}','yellow')"></button>
    <button class="hl-green-btn" aria-label="Green" onclick="changeHighlightColor('${hl.id}','green')"></button>
    <button class="hl-blue-btn" aria-label="Blue" onclick="changeHighlightColor('${hl.id}','blue')"></button>
    <button class="hl-pink-btn" aria-label="Pink" onclick="changeHighlightColor('${hl.id}','pink')"></button>
    <button class="hl-note-btn" aria-label="${noteLabel}" onclick="editHighlightNote('${hl.id}', event)">${noteLabel}</button>
    <button class="hl-note-btn" style="color:red;border-color:red" aria-label="Delete highlight" onclick="deleteHighlight('${hl.id}')">Del</button>
  `;
  const pane = document.getElementById('content-pane');
  bar.style.left = (e.clientX - pane.getBoundingClientRect().left) + 'px';
  bar.style.top = (e.clientY - pane.getBoundingClientRect().top + pane.scrollTop - 40) + 'px';
  pane.appendChild(bar);
  hlToolbarEl = bar;
}

function changeHighlightColor(id, color) {
  const hl = articleHighlights.find(h => h.id === id);
  if (hl) {
    hl.color = color;
    hl.updatedAt = new Date().toISOString();
    saveHighlights();
    applyHighlights();
  }
  removeHlToolbar();
}

function editHighlightNote(id, e) {
  removeHlToolbar();
  const hl = articleHighlights.find(h => h.id === id);
  if (!hl) return;

  const pane = document.getElementById('content-pane');
  const paneRect = pane.getBoundingClientRect();
  const popover = document.createElement('div');
  popover.className = 'annotation-popover';
  popover.style.left = (e.clientX - paneRect.left) + 'px';
  popover.style.top = (e.clientY - paneRect.top + pane.scrollTop + 10) + 'px';
  popover.innerHTML = `
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Note on highlight: "${escapeHtml(hl.text.slice(0, 50))}${hl.text.length > 50 ? '...' : ''}"</div>
    <textarea placeholder="Add a note to this highlight...">${escapeHtml(hl.note || '')}</textarea>
    <div class="btn-row">
      ${hl.note ? '<button style="color:red;border-color:red" onclick="clearHighlightNote(\'' + id + '\')">Remove</button>' : ''}
      <button onclick="removeAnnotationPopover()">Cancel</button>
      <button class="primary" onclick="saveHighlightNote('${id}', this)">Save</button>
    </div>
  `;
  popover.onclick = function(ev) { ev.stopPropagation(); };
  pane.appendChild(popover);
  popover.querySelector('textarea').focus();
}

function saveHighlightNote(id, btn) {
  const popover = btn.closest('.annotation-popover');
  const note = popover.querySelector('textarea').value.trim();
  const hl = articleHighlights.find(h => h.id === id);
  if (hl) {
    hl.note = note;
    hl.updatedAt = new Date().toISOString();
    saveHighlights();
    applyHighlights();
    renderNotesPanel();
    renderFileList();
  }
  removeAnnotationPopover();
}

function clearHighlightNote(id) {
  const hl = articleHighlights.find(h => h.id === id);
  if (hl) {
    hl.note = '';
    hl.updatedAt = new Date().toISOString();
    saveHighlights();
    applyHighlights();
    renderNotesPanel();
    renderFileList();
  }
  removeAnnotationPopover();
}

// Listen for text selection in content pane
document.addEventListener('mouseup', e => {
  // Don't dismiss anything if clicking inside an annotation popover or margin note
  if (e.target.closest && e.target.closest('.annotation-popover, .margin-note')) return;

  const contentEl = document.getElementById('content');
  if (!contentEl || !contentEl.contains(e.target)) {
    // Don't remove toolbar if clicking on the toolbar itself
    if (hlToolbarEl && hlToolbarEl.contains(e.target)) return;
    removeHlToolbar();
    return;
  }

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

  // Don't show highlight toolbar on Guide or Explore pages
  if (!activeFile) return;

  const pane = document.getElementById('content-pane');
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const paneRect = pane.getBoundingClientRect();

  const x = rect.left - paneRect.left + rect.width / 2 - 70;
  const y = rect.top - paneRect.top + pane.scrollTop - 40;
  showHlToolbar(Math.max(10, x), y);
});

// Inline annotations
function addInlineNote() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
  const anchorText = sel.toString();
  const pane = document.getElementById('content-pane');
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const paneRect = pane.getBoundingClientRect();

  removeHlToolbar();

  const popover = document.createElement('div');
  popover.className = 'annotation-popover';
  popover.style.left = (rect.left - paneRect.left) + 'px';
  popover.style.top = (rect.bottom - paneRect.top + pane.scrollTop + 5) + 'px';
  // Store anchor text as data attribute to avoid escaping issues with
  // newlines/quotes in onclick string literals
  popover.setAttribute('data-anchor', anchorText);
  popover.innerHTML = `
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Note on: "${escapeHtml(anchorText.slice(0, 50))}${anchorText.length > 50 ? '...' : ''}"</div>
    <textarea placeholder="Add your note..." autofocus></textarea>
    <div class="btn-row">
      <button onclick="removeAnnotationPopover()">Cancel</button>
      <button class="primary" onclick="saveInlineNote(this)">Save</button>
    </div>
  `;
  popover.onclick = function(e) { e.stopPropagation(); };
  pane.appendChild(popover);
  popover.querySelector('textarea').focus();
  sel.removeAllRanges();
}

function saveInlineNote(btn) {
  const popover = btn.closest('.annotation-popover');
  const anchorText = popover.getAttribute('data-anchor') || '';
  const note = popover.querySelector('textarea').value.trim();
  if (!note) { removeAnnotationPopover(); return; }

  const { contextBefore, contextAfter } = getTextContext(anchorText);
  const now = new Date().toISOString();
  const annotation = {
    id: generateId(),
    anchorText,
    contextBefore,
    contextAfter,
    note,
    createdAt: now,
    updatedAt: now
  };
  if (!articleNotes.annotations) articleNotes.annotations = [];
  articleNotes.annotations.push(annotation);
  saveNotes();
  applyHighlights();
  removeAnnotationPopover();
  renderFileList();
}

function showAnnotationPopover(e, ann) {
  removeAnnotationPopover();
  removeHlToolbar();

  const pane = document.getElementById('content-pane');
  const paneRect = pane.getBoundingClientRect();
  const popover = document.createElement('div');
  popover.className = 'annotation-popover';
  popover.style.left = (e.clientX - paneRect.left) + 'px';
  popover.style.top = (e.clientY - paneRect.top + pane.scrollTop + 10) + 'px';
  popover.innerHTML = `
    <textarea>${escapeHtml(ann.note)}</textarea>
    <div class="btn-row">
      <button style="color:red;border-color:red" onclick="deleteAnnotation('${ann.id}')">Delete</button>
      <button onclick="removeAnnotationPopover()">Cancel</button>
      <button class="primary" onclick="updateAnnotation('${ann.id}', this)">Save</button>
    </div>
  `;
  popover.onclick = function(e) { e.stopPropagation(); };
  pane.appendChild(popover);
}

function deleteAnnotation(id) {
  articleNotes.annotations = (articleNotes.annotations || []).filter(a => a.id !== id);
  saveNotes();
  applyHighlights();
  removeAnnotationPopover();
  renderFileList();
}

function updateAnnotation(id, btn) {
  const popover = btn.closest('.annotation-popover');
  const note = popover.querySelector('textarea').value.trim();
  const ann = (articleNotes.annotations || []).find(a => a.id === id);
  if (ann) {
    ann.note = note;
    ann.updatedAt = new Date().toISOString();
    saveNotes();
  }
  removeAnnotationPopover();
}

// Article-level notes panel
function renderNotesPanel() {
  // Remove existing panel
  const existing = document.querySelector('.notes-panel');
  if (existing) existing.remove();

  const content = document.getElementById('content');
  if (!content || content.style.display === 'none') return;

  const panel = document.createElement('details');
  panel.className = 'notes-panel';
  const noteText = articleNotes.articleNote || '';
  const annCount = (articleNotes.annotations || []).length;
  const hlCount = articleHighlights.length;
  const hlNoteCount = articleHighlights.filter(h => h.note).length;

  let summaryText = 'Notes';
  const badges = [];
  if (hlCount) badges.push(hlCount + ' highlight' + (hlCount !== 1 ? 's' : '') + (hlNoteCount ? ' (' + hlNoteCount + ' with notes)' : ''));
  if (annCount) badges.push(annCount + ' annotation' + (annCount !== 1 ? 's' : ''));
  if (badges.length) summaryText += ' (' + badges.join(', ') + ')';

  const tags = articleNotes.tags || [];
  const machineTags = articleNotes.machineTags || [];
  const isFav = articleNotes.isFavorite || false;
  const tagsHtml = tags.map(t => '<span class="tag">' + escapeHtml(t) + '<span class="tag-remove" onclick="removeTag(\'' + escapeHtml(t.replace(/'/g, "\\'")) + '\')">&times;</span></span>').join('')
    + machineTags.map(t => '<span class="tag tag-machine" title="Auto-generated tag">' + escapeHtml(t) + '</span>').join('');

  // Build list of highlight notes and inline annotations for display
  let hlNotesHtml = '';
  const hlsWithNotes = articleHighlights.filter(h => h.note);
  const annotations = articleNotes.annotations || [];

  if (hlsWithNotes.length || annotations.length) {
    hlNotesHtml += '<div style="margin-top:12px;font-size:12px">';

    for (const hl of hlsWithNotes) {
      const preview = hl.text.length > 60 ? hl.text.slice(0, 60) + '...' : hl.text;
      hlNotesHtml += '<div style="padding:6px 0">'
        + '<div style="color:var(--muted);font-size:11px;margin-bottom:3px">'
        + '<span class="pr-highlight hl-' + hl.color + '" style="padding:1px 4px;border-radius:2px;cursor:pointer" onclick="scrollToHighlight(\'' + hl.id + '\')">' + escapeHtml(preview) + '</span>'
        + '</div>'
        + '<div style="white-space:pre-wrap;word-break:break-word">' + escapeHtml(hl.note) + '</div>'
        + '</div>';
    }

    for (const ann of annotations) {
      const preview = (ann.anchorText || '').slice(0, 60);
      hlNotesHtml += '<div style="padding:6px 0">'
        + '<div style="color:var(--muted);font-size:11px;margin-bottom:3px">'
        + '<span style="color:var(--link);cursor:pointer">' + escapeHtml(preview) + (ann.anchorText && ann.anchorText.length > 60 ? '...' : '') + '</span>'
        + '</div>'
        + '<div style="white-space:pre-wrap;word-break:break-word">' + escapeHtml(ann.note) + '</div>'
        + '</div>';
    }

    hlNotesHtml += '</div>';
  }

  panel.innerHTML = `
    <summary>${summaryText}</summary>
    <div class="favorite-row">
      <button class="favorite-btn${isFav ? ' active' : ''}" onclick="toggleFavorite(this)" title="Mark as favorite"><svg class="icon"><use href="#i-${isFav ? 'heart' : 'heart-o'}"/></svg></button>
      <span style="color:var(--muted);font-size:12px">${isFav ? 'Favorited' : 'Mark favorite'}</span>
    </div>
    <div class="tags-row">
      ${tagsHtml}
      <input type="text" placeholder="Add tag..." onkeydown="handleTagKey(event)" />
    </div>
    <div class="notes-textarea-wrap">
      <textarea placeholder="Add notes about this article...">${escapeHtml(noteText)}</textarea>
      <button class="voice-note-btn" onclick="toggleVoiceNote(this)" title="Voice note (requires microphone)"><svg aria-hidden="true"><use href="#i-mic"/></svg></button>
    </div>
    <div class="notes-save-hint">Auto-saved</div>
    ${hlNotesHtml}
  `;

  if (noteText || isFav || tags.length || machineTags.length || hlsWithNotes.length || annotations.length) panel.setAttribute('open', '');

  content.appendChild(panel);

  const textarea = panel.querySelector('textarea');
  let saveTimeout;
  textarea.addEventListener('input', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      articleNotes.articleNote = textarea.value;
      saveNotes();
      renderFileList();
    }, 800);
  });
  textarea.addEventListener('blur', () => {
    articleNotes.articleNote = textarea.value;
    saveNotes();
    renderFileList();
  });
}

function toggleFavorite(btn) {
  articleNotes.isFavorite = !articleNotes.isFavorite;
  saveNotes();
  renderNotesPanel();
  renderFileList();
  updateHeaderActions();
}

function toggleFavoriteFromHeader(btn) {
  articleNotes.isFavorite = !articleNotes.isFavorite;
  saveNotes();
  renderNotesPanel();
  renderFileList();
  updateHeaderActions();
}

function toggleNotesFromHeader() {
  const panel = document.querySelector('.notes-panel');
  if (panel) {
    panel.toggleAttribute('open');
    if (panel.hasAttribute('open')) {
      panel.querySelector('textarea').focus();
    }
  }
}

function scrollToHighlight(id) {
  const mark = document.querySelector('mark[data-hl-id="' + id + '"]');
  if (mark) {
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    mark.style.outline = '2px solid var(--link)';
    setTimeout(() => { mark.style.outline = ''; }, 1500);
  }
}

function updateHeaderActions() {
  const actions = document.querySelector('.article-actions');
  if (!actions) return;
  const favBtn = actions.querySelector('button');
  if (favBtn) {
    favBtn.className = articleNotes.isFavorite ? 'active-fav' : '';
    favBtn.innerHTML = '<svg class="icon icon-sm"><use href="#i-' + (articleNotes.isFavorite ? 'heart' : 'heart-o') + '"/></svg> Favorite';
  }
}

function handleTagKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const tag = e.target.value.trim().replace(/,/g, '');
    if (!tag) return;
    if (!articleNotes.tags) articleNotes.tags = [];
    if (!articleNotes.tags.includes(tag)) {
      articleNotes.tags.push(tag);
      saveNotes();
      renderNotesPanel();
      renderFileList();
    }
    e.target.value = '';
  }
}

function removeTag(tag) {
  if (!articleNotes.tags) return;
  articleNotes.tags = articleNotes.tags.filter(t => t !== tag);
  saveNotes();
  renderNotesPanel();
  renderFileList();
}

// ---- Voice Notes (Web Speech API) ----
let voiceRecognition = null;

function toggleVoiceNote(btn) {
  if (voiceRecognition) {
    voiceRecognition.stop();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Speech recognition is not supported in this browser. Try Chrome or Safari.');
    return;
  }

  const textarea = btn.closest('.notes-textarea-wrap').querySelector('textarea');
  if (!textarea) return;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';

  let finalTranscript = '';

  recognition.onstart = function() {
    voiceRecognition = recognition;
    btn.classList.add('recording');
    btn.innerHTML = '<svg aria-hidden="true"><use href="#i-stop"/></svg>';
    btn.title = 'Stop recording';
  };

  recognition.onresult = function(event) {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    // Show live preview: existing text + final transcript + interim (dimmed)
    const existingText = textarea.value;
    const separator = existingText && !existingText.endsWith('\n') && !existingText.endsWith(' ') ? '\n' : '';
    const preview = existingText + separator + finalTranscript + interim;
    textarea.value = preview;
    textarea.scrollTop = textarea.scrollHeight;
  };

  recognition.onend = function() {
    voiceRecognition = null;
    btn.classList.remove('recording');
    btn.innerHTML = '<svg aria-hidden="true"><use href="#i-mic"/></svg>';
    btn.title = 'Voice note (requires microphone)';
    // Commit final transcript to notes
    if (finalTranscript.trim()) {
      const existingText = articleNotes.articleNote || '';
      const separator = existingText && !existingText.endsWith('\n') && !existingText.endsWith(' ') ? '\n' : '';
      articleNotes.articleNote = existingText + separator + finalTranscript.trim();
      textarea.value = articleNotes.articleNote;
      saveNotes();
      renderFileList();
    }
  };

  recognition.onerror = function(event) {
    if (event.error === 'not-allowed') {
      alert('Microphone access was denied. Please allow microphone access in your browser settings.');
    }
    voiceRecognition = null;
    btn.classList.remove('recording');
    btn.innerHTML = '<svg aria-hidden="true"><use href="#i-mic"/></svg>';
    btn.title = 'Voice note (requires microphone)';
  };

  recognition.start();
}

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

  const utterance = new SpeechSynthesisUtterance(plainText);
  utterance.rate = ttsSpeed;
  utterance.lang = navigator.language || 'en-US';
  ttsSynthUtterance = utterance;

  // Estimate total duration (browser TTS doesn't give real progress)
  const estimatedWords = plainText.split(/\s+/).length;
  const estimatedSeconds = estimatedWords / (150 * ttsSpeed); // ~150 wpm base
  let startTime = Date.now();

  utterance.onstart = function() {
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
    });

    ttsAudio.addEventListener('ended', () => {
      ttsPlaying = false;
      renderAudioPlayer();
      // Auto-play next
      if (ttsCurrentIndex + 1 < ttsQueue.length) {
        setTimeout(() => playTTSItem(ttsCurrentIndex + 1), 500);
      }
    });

    ttsAudio.addEventListener('error', () => {
      ttsPlaying = false;
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

// ---- LLM Summarization ----

let llmConfigured = false;
let llmProvider = '';
let llmModel = '';
let lastSummaryProvider = '';
let lastSummaryModel = '';

async function checkLLMConfig() {
  if (!serverMode) return;
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      llmConfigured = !!(data.llm && data.llm.hasKey);
      llmProvider = data.llm?.provider || '';
      llmModel = data.llm?.model || '';
    }
  } catch {}
}

function providerLabel(provider) {
  const labels = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini', openrouter: 'OpenRouter', apple: 'Apple Intelligence' };
  return labels[provider] || provider;
}

function providerBadgeColor(provider) {
  const colors = { anthropic: 'amber', openai: 'green', gemini: 'blue', openrouter: 'purple', apple: 'indigo' };
  return colors[provider] || 'gray';
}

function summaryBadgesHtml(provider, model) {
  let html = '<span class="badge badge-gray">Summary</span>';
  if (provider) {
    const color = providerBadgeColor(provider);
    html += ' <span class="badge badge-' + color + '">' + escapeHtml(providerLabel(provider)) + '</span>';
  }
  if (model) {
    html += ' <span class="badge badge-gray">' + escapeHtml(model) + '</span>';
  }
  return html;
}

async function reprocessCurrentArticle(btn) {
  if (!serverMode || !activeFile) return;
  var origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<svg class="icon icon-sm spin" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-cloud-download"/></svg> Re-fetching\u2026';
  try {
    var res = await fetch('/api/reprocess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: activeFile })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Reprocess failed');
    btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-cloud-download"/></svg> Done!';
    // Reload the article content
    setTimeout(async function() {
      btn.innerHTML = origText;
      btn.disabled = false;
      // Re-fetch and render the updated article
      try {
        var r = await fetch('/api/file?name=' + encodeURIComponent(activeFile));
        if (r.ok) { var text = await r.text(); renderArticle(text, activeFile); await loadAnnotations(activeFile); }
      } catch(e) {}
    }, 800);
  } catch (err) {
    btn.innerHTML = origText;
    btn.disabled = false;
    alert('Re-fetch failed: ' + (err.message || err));
  }
}

async function summarizeArticle() {
  if (!serverMode || !activeFile) return;
  const btn = document.getElementById('summarize-btn');
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-wand"/></svg> Summarizing...';
  btn.title = 'Summarizing with ' + providerLabel(llmProvider) + '...';

  try {
    const res = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: activeFile })
    });
    const data = await res.json();
    if (data.error) {
      btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-wand"/></svg> Retry';
      btn.disabled = false;
      btn.title = data.error;
      // Show error inline under the header
      const content = document.getElementById('content');
      const existingError = content.querySelector('.summary-error');
      if (existingError) existingError.remove();
      const errDiv = document.createElement('div');
      errDiv.className = 'summary-error';
      errDiv.style.cssText = 'padding:8px 12px;margin:8px 0;background:var(--border);border-radius:6px;font-size:12px;color:var(--muted)';
      errDiv.textContent = data.error;
      const articleHeader = content.querySelector('.article-header');
      if (articleHeader) articleHeader.after(errDiv);
      return;
    }

    lastSummaryProvider = data.provider || llmProvider;
    lastSummaryModel = data.model || llmModel;

    // Remove any previous error
    const content = document.getElementById('content');
    const existingError = content.querySelector('.summary-error');
    if (existingError) existingError.remove();

    // Insert summary into the DOM
    const existingSummary = content.querySelector('.article-summary');
    if (existingSummary) existingSummary.remove();

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'article-summary';
    summaryDiv.innerHTML = '<div class="summary-header"><div class="summary-header-left">'
      + summaryBadgesHtml(lastSummaryProvider, lastSummaryModel)
      + '</div><span class="summary-actions"><button onclick="hideSummary()" title="Hide summary"><svg class="icon icon-sm"><use href="#i-xmark"/></svg></button></span></div>'
      + escapeHtml(data.summary);

    const articleHeader = content.querySelector('.article-header');
    if (articleHeader) {
      articleHeader.after(summaryDiv);
    } else {
      content.prepend(summaryDiv);
    }

    btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-wand"/></svg> Summarized';
    btn.title = 'Summarized by ' + providerLabel(lastSummaryProvider) + ' (' + lastSummaryModel + '). Click to re-run.';
    btn.disabled = false;
    btn.onclick = function() { btn.onclick = null; summarizeArticle(); };
  } catch (err) {
    btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-wand"/></svg> Retry';
    btn.title = 'Summarization failed. Click to retry.';
    btn.disabled = false;
  }
}

function hideSummary() {
  const content = document.getElementById('content');
  const summary = content.querySelector('.article-summary');
  if (summary) summary.remove();
  // Reset summarize button
  const btn = document.getElementById('summarize-btn');
  if (btn) {
    btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-wand"/></svg> Summarize';
    btn.title = 'Summarize';
    btn.disabled = false;
    btn.onclick = null;
  }
}

// Modal focus management
// ---- Sharing ----

function getShareData() {
  if (!activeFile) return null;
  const file = allFiles.find(f => f.filename === activeFile);
  if (!file || !file.url) return null;
  return { title: file.title || '', url: file.url };
}

function toggleShareDropdown(e) {
  e.stopPropagation();
  // Close any existing share dropdown
  const existing = document.querySelector('.share-dropdown-panel');
  if (existing) { existing.remove(); return; }

  const data = getShareData();
  if (!data) return;

  const panel = document.createElement('div');
  panel.className = 'share-dropdown-panel';
  panel.onclick = function(ev) { ev.stopPropagation(); };

  const encodedUrl = encodeURIComponent(data.url);
  const encodedTitle = encodeURIComponent(data.title);
  const encodedText = encodeURIComponent(data.title + ' ' + data.url);

  panel.innerHTML = `
    <div class="share-group-label">Actions</div>
    <button onclick="copyArticleLink()"><svg class="share-icon" viewBox="0 0 640 512"><use href="#i-link"/></svg> Copy Link</button>
    <button onclick="showExportMarkdownModal()"><svg class="share-icon" viewBox="0 0 640 512"><use href="#i-cloud-download"/></svg> Export Markdown</button>
    <button onclick="startNotebookFromArticle()"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-pen"/></svg> Write About This</button>
    <hr>
    <div class="share-group-label">Share to</div>
    <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}" target="_blank" rel="noopener"><svg class="share-icon" viewBox="0 0 448 512"><use href="#i-linkedin"/></svg> LinkedIn</a>
    <a href="https://bsky.app/intent/compose?text=${encodedText}" target="_blank" rel="noopener"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-bluesky"/></svg> Bluesky</a>
    <a href="https://mastodon.social/share?text=${encodedText}" target="_blank" rel="noopener"><svg class="share-icon" viewBox="0 0 448 512"><use href="#i-mastodon"/></svg> Mastodon</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noopener"><svg class="share-icon" viewBox="0 0 320 512"><use href="#i-facebook"/></svg> Facebook</a>
    <a href="https://www.threads.net/intent/post?text=${encodedText}" target="_blank" rel="noopener"><svg class="share-icon" viewBox="0 0 448 512"><use href="#i-threads"/></svg> Threads</a>
    <hr>
    <div class="share-group-label">Send</div>
    <a href="mailto:?subject=${encodedTitle}&body=${encodedText}" target="_blank"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-envelope"/></svg> Email</a>
    <a href="sms:&body=${encodedText}"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-comment"/></svg> Messages</a>
  `;

  e.target.closest('.share-dropdown').appendChild(panel);
}

function copyArticleLink() {
  const data = getShareData();
  if (!data) return;
  navigator.clipboard.writeText(data.url).then(() => {
    // Brief feedback
    const existing = document.querySelector('.share-dropdown-panel');
    if (existing) {
      const btn = existing.querySelector('button');
      if (btn) { const orig = btn.innerHTML; btn.innerHTML = '<span class="share-icon">&#10003;</span> Copied!'; setTimeout(() => { btn.innerHTML = orig; }, 1200); }
    }
  });
}

function saveArticleLink() {
  const data = getShareData();
  if (!data) return;
  // Use the Web Share API if available (for Safari reading list), otherwise just copy
  if (navigator.share) {
    navigator.share({ title: data.title, url: data.url }).catch(() => {});
  } else {
    // Fallback: open a bookmarklet-style URL for adding to reading list
    copyArticleLink();
  }
  const existing = document.querySelector('.share-dropdown-panel');
  if (existing) existing.remove();
}

// Export Markdown modal — lets user choose what to include
function showExportMarkdownModal() {
  // Close share dropdown
  const panel = document.querySelector('.share-dropdown-panel');
  if (panel) panel.remove();

  if (!activeFile) return;

  const hasHighlights = articleHighlights.length > 0;
  const hasNotes = articleNotes.articleNote || (articleNotes.annotations && articleNotes.annotations.length > 0);
  const file = allFiles.find(f => f.filename === activeFile);
  const hasSummary = file && file.hasSummary;
  const hasTags = (articleNotes.tags && articleNotes.tags.length > 0) || (articleNotes.machineTags && articleNotes.machineTags.length > 0);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Export Markdown');
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  let optionsHtml = '';
  optionsHtml += '<div class="export-option"><input type="checkbox" id="exp-summary" checked ' + (hasSummary ? '' : 'disabled') + '><label for="exp-summary">Include summary</label>' + (hasSummary ? '' : '<span class="export-hint">none available</span>') + '</div>';
  optionsHtml += '<div class="export-option"><input type="checkbox" id="exp-highlights" checked ' + (hasHighlights ? '' : 'disabled') + '><label for="exp-highlights">Include highlights</label>' + (hasHighlights ? '<span class="export-hint">' + articleHighlights.length + '</span>' : '<span class="export-hint">none</span>') + '</div>';
  optionsHtml += '<div class="export-option"><input type="checkbox" id="exp-notes" checked ' + (hasNotes ? '' : 'disabled') + '><label for="exp-notes">Include notes</label>' + (hasNotes ? '' : '<span class="export-hint">none</span>') + '</div>';
  optionsHtml += '<div class="export-option"><input type="checkbox" id="exp-tags" checked ' + (hasTags ? '' : 'disabled') + '><label for="exp-tags">Include tags</label>' + (hasTags ? '<span class="export-hint">' + [...(articleNotes.tags || []), ...(articleNotes.machineTags || [])].length + '</span>' : '<span class="export-hint">none</span>') + '</div>';

  overlay.innerHTML = `
    <div class="modal-card" onclick="event.stopPropagation()" style="max-width:400px">
      <h2>Export Markdown</h2>
      <p>Choose what to include in the exported file:</p>
      ${optionsHtml}
      <div class="modal-actions">
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn-primary" onclick="doExportMarkdown()">Download .md</button>
        <button class="btn-secondary" onclick="doExportMarkdown(true)">Copy</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function doExportMarkdown(copyOnly) {
  if (!activeFile) return;

  const inclSummary = document.getElementById('exp-summary')?.checked;
  const inclHighlights = document.getElementById('exp-highlights')?.checked;
  const inclNotes = document.getElementById('exp-notes')?.checked;
  const inclTags = document.getElementById('exp-tags')?.checked;

  // Fetch the raw markdown
  let rawText = '';
  if (serverMode) {
    const res = await fetch('/api/file?name=' + encodeURIComponent(activeFile));
    if (res.ok) rawText = await res.text();
  }
  if (!rawText) return;

  const { meta, body } = parseFrontmatter(rawText);

  // Build export markdown
  let md = '';

  // Title
  if (meta && meta.title) md += '# ' + meta.title + '\n\n';

  // Source info
  const infoParts = [];
  if (meta && meta.author) infoParts.push('**Author:** ' + meta.author);
  if (meta && meta.url) infoParts.push('**Source:** ' + meta.url);
  if (meta && meta.bookmarked) infoParts.push('**Saved:** ' + meta.bookmarked.slice(0, 10));
  if (infoParts.length) md += infoParts.join('  \n') + '\n\n';

  // Tags
  if (inclTags) {
    const allTags = [...(articleNotes.tags || []), ...(articleNotes.machineTags || [])];
    if (allTags.length) md += '**Tags:** ' + allTags.join(', ') + '\n\n';
  }

  // Summary
  if (inclSummary && meta && meta.summary) {
    md += '> **Summary:** ' + meta.summary + '\n\n';
  }

  md += '---\n\n';

  // Article body
  md += cleanMarkdown(body).trim() + '\n';

  // Highlights section
  if (inclHighlights && articleHighlights.length > 0) {
    md += '\n---\n\n## Highlights\n\n';
    for (const hl of articleHighlights) {
      const colorLabel = hl.color ? ' (' + hl.color + ')' : '';
      md += '- > ' + hl.text + colorLabel + '\n';
      if (hl.note) md += '  - **Note:** ' + hl.note + '\n';
    }
  }

  // Notes section
  if (inclNotes) {
    const hasArticleNote = articleNotes.articleNote && articleNotes.articleNote.trim();
    const hasAnnotations = articleNotes.annotations && articleNotes.annotations.length > 0;
    if (hasArticleNote || hasAnnotations) {
      md += '\n---\n\n## Notes\n\n';
      if (hasArticleNote) {
        md += articleNotes.articleNote.trim() + '\n\n';
      }
      if (hasAnnotations) {
        for (const ann of articleNotes.annotations) {
          md += '- **"' + ann.text + '"** — ' + ann.note + '\n';
        }
      }
    }
  }

  if (copyOnly) {
    await navigator.clipboard.writeText(md);
    // Flash feedback
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) {
      const btn = overlay.querySelector('.btn-secondary:last-child');
      if (btn) { const orig = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = orig; }, 1200); }
    }
    return;
  }

  // Download as file
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = activeFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Close modal
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) overlay.remove();
}

// Close share dropdown when clicking outside
document.addEventListener('click', function(e) {
  const panel = document.querySelector('.share-dropdown-panel');
  if (panel && !panel.contains(e.target) && !e.target.closest('.share-dropdown')) {
    panel.remove();
  }
});

// Batch auto-tag all articles
async function batchAutotagAll(force) {
  if (!serverMode) return;

  // Show warning before proceeding
  var msg = force
    ? 'This will re-tag ALL articles using AI, replacing any existing machine-generated tags. User tags will be preserved. Continue?'
    : 'This will auto-tag all untagged articles using AI. This may take a while for large libraries. Continue?';
  if (!confirm(msg)) return;

  var btn = document.getElementById('batch-tag-btn');
  var origText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true" style="opacity:0.5;vertical-align:-1px"><use href="#i-wand"/></svg> Tagging...';
  }

  try {
    const res = await fetch('/api/autotag-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: !!force })
    });
    const data = await res.json();
    if (data.error) {
      alert('Auto-tag failed: ' + data.error);
    } else {
      if (btn) btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true" style="opacity:0.5;vertical-align:-1px"><use href="#i-wand"/></svg> Done!';
      // Refresh annotations index to pick up new tags
      await loadAnnotationsIndex();
      renderFileList();
      // Refresh the explore page to show updated tag counts
      setTimeout(function() { if (_sidebarView === 'explore') showTagCloud(); }, 2000);
    }
  } catch (err) {
    alert('Auto-tag request failed.');
  }
  if (btn) {
    btn.disabled = false;
    if (btn.innerHTML.includes('Tagging')) btn.innerHTML = origText;
  }
}

let _modalReturnFocus = null;

function trapFocus(overlay) {
  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key !== 'Tab') return;
    const focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

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

// Keyboard navigation
document.addEventListener('keydown', e => {
  // "/" focuses search
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('collapsed')) toggleSidebar();
    document.getElementById('search').focus();
    return;
  }

  // "[" toggles sidebar
  if (e.key === '[' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    toggleSidebar();
    return;
  }

  // Escape clears search or dismisses popovers
  if (e.key === 'Escape') {
    // Close modal overlays (shortcuts, guide)
    const modal = document.querySelector('.modal-overlay');
    if (modal) { modal.remove(); return; }
    // Close settings dropdown
    const dropdown = document.querySelector('.settings-dropdown-panel');
    if (dropdown) { dropdown.remove(); return; }
    // Close highlight toolbar / annotation popover
    if (hlToolbarEl || document.querySelector('.annotation-popover')) {
      removeHlToolbar();
      return;
    }
    // Clear and blur search
    const search = document.getElementById('search');
    if (document.activeElement === search) {
      search.value = '';
      filterFiles();
      search.blur();
      return;
    }
    // Blur any focused textarea/input
    if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') {
      document.activeElement.blur();
      return;
    }
  }

  // h to highlight selection (yellow) — not on Guide/Explore pages
  if (e.key === 'h' && activeFile && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) {
      e.preventDefault();
      createHighlight('yellow');
      return;
    }
  }

  // f to toggle focus mode
  if (e.key === 'f' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    toggleFocusMode();
    return;
  }

  // p to print article
  if (e.key === 'p' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    if (activeFile) {
      e.preventDefault();
      window.print();
      return;
    }
  }

  // n to toggle notes panel — not on Guide/Explore pages
  if (e.key === 'n' && activeFile && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    const panel = document.querySelector('.notes-panel');
    if (panel) {
      e.preventDefault();
      panel.toggleAttribute('open');
      if (panel.hasAttribute('open')) {
        panel.querySelector('textarea').focus();
      }
      return;
    }
  }

  // j/k navigate file list (next/prev)
  if ((e.key === 'j' || e.key === 'k') && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    navigateArticle(e.key === 'j' ? 1 : -1);
    return;
  }

  // Left/Right arrow navigate prev/next article
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    navigateArticle(e.key === 'ArrowRight' ? 1 : -1);
    return;
  }

  // Up/Down scroll the content pane; navigate articles at boundaries
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    const pane = document.getElementById('content-pane');
    const scrollAmount = 80;
    const atTop = pane.scrollTop <= 0;
    const atBottom = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2;

    if (e.key === 'ArrowDown' && atBottom) {
      e.preventDefault();
      navigateArticle(1);
    } else if (e.key === 'ArrowUp' && atTop) {
      e.preventDefault();
      navigateArticle(-1);
    } else if (e.key === 'ArrowDown') {
      pane.scrollTop += scrollAmount;
    } else {
      pane.scrollTop -= scrollAmount;
    }
    return;
  }

  // Enter loads current selection (when not in search)
  if (e.key === 'Enter' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    const currentIdx = displayFiles.findIndex(f => f.filename === activeFile);
    if (currentIdx >= 0) loadFile(currentIdx);
  }

  // Audio playback shortcuts (only when audio player is visible)
  const audioPanel = document.getElementById('audio-player');
  const audioVisible = audioPanel && !audioPanel.classList.contains('hidden');
  if (audioVisible && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    // Space = play/pause
    if (e.key === ' ' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      ttsTogglePlay();
      return;
    }
    // Shift+. (>) = skip next
    if (e.key === '>' || (e.key === '.' && e.shiftKey)) {
      e.preventDefault();
      ttsSkipNext();
      return;
    }
    // Shift+, (<) = skip prev
    if (e.key === '<' || (e.key === ',' && e.shiftKey)) {
      e.preventDefault();
      ttsSkipPrev();
      return;
    }
    // s to cycle playback speed
    if (e.key === 's') {
      e.preventDefault();
      ttsCycleSpeed();
      return;
    }
  }
});

// Drag and drop (for standalone use)
document.addEventListener('dragover', e => {
  e.preventDefault();
  document.body.classList.add('drop-highlight');
});
document.addEventListener('dragleave', e => {
  if (!e.relatedTarget || !document.contains(e.relatedTarget)) {
    document.body.classList.remove('drop-highlight');
  }
});
document.addEventListener('drop', e => {
  e.preventDefault();
  document.body.classList.remove('drop-highlight');
  const files = Array.from(e.dataTransfer.files).filter(f =>
    f.name.endsWith('.md') || f.name.endsWith('.markdown') || f.name.endsWith('.txt')
  );
  if (files.length) {
    // Add dropped files to the sidebar list
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      const { meta } = parseFrontmatter(text);
      const file = files[0];
      // Create a virtual entry
      const entry = {
        filename: file.name,
        title: (meta && meta.title) || file.name.replace(/\.md$/, ''),
        url: (meta && meta.url) || '',
        domain: (meta && meta.domain) || '',
        bookmarked: (meta && meta.bookmarked) || '',
        feed: (meta && meta.feed) || '',
        _content: text
      };
      allFiles.unshift(entry);
      filterFiles();
      activeFile = entry.filename;
      renderFileList();
      renderArticle(text, file.name);
    };
    reader.readAsText(files[0]);
  }
});

// Infinite scroll for file list pagination
document.getElementById('file-list').addEventListener('scroll', function() {
  const list = this;
  if (list.scrollTop + list.clientHeight >= list.scrollHeight - 100) {
    if (displayedCount < displayFiles.length) {
      const nextBatch = displayFiles.slice(displayedCount, displayedCount + PAGE_SIZE);
      displayedCount += nextBatch.length;
      list.insertAdjacentHTML('beforeend', nextBatch.map((f, i) => renderFileItem(f, displayedCount - nextBatch.length + i)).join(''));
    }
  }
});

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

// ---- Notebook ---- (synthesis writing surface)
let _notebooks = {};
let _activeNotebook = null;
let _notebookSaveTimeout = null;
let _notebookPreviewMode = false;
const SINGLE_NOTEBOOK_ID = 'nb-shared';

// Get or create the single shared notebook
async function getOrCreateSingleNotebook() {
  await loadNotebooks();
  if (_notebooks[SINGLE_NOTEBOOK_ID]) return _notebooks[SINGLE_NOTEBOOK_ID];
  // Migrate: if there are existing notebooks, merge them into the single notebook
  const existing = Object.values(_notebooks).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  let content = '';
  let sources = [];
  let tags = [];
  for (const nb of existing) {
    if (nb.content) content += (content ? '\n\n---\n\n' : '') + nb.content;
    if (nb.sources) sources = sources.concat(nb.sources);
    if (nb.tags) tags = tags.concat(nb.tags);
  }
  const nb = {
    id: SINGLE_NOTEBOOK_ID,
    title: 'Notebook',
    content: content,
    sources: [...new Set(sources)],
    tags: [...new Set(tags)],
    createdAt: existing.length ? existing[0].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await saveNotebook(nb);
  // Clean up old notebooks
  for (const old of existing) {
    if (old.id && old.id !== SINGLE_NOTEBOOK_ID) {
      try { await fetch('/api/notebooks?id=' + encodeURIComponent(old.id), { method: 'DELETE' }); } catch {}
      delete _notebooks[old.id];
    }
  }
  return nb;
}

async function loadNotebooks() {
  try {
    const res = await fetch('/api/notebooks');
    if (res.ok) _notebooks = await res.json();
  } catch {}
}

async function saveNotebook(nb) {
  try {
    const res = await fetch('/api/notebooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nb)
    });
    if (res.ok) {
      const data = await res.json();
      if (!nb.id) nb.id = data.id;
      _notebooks[nb.id] = nb;
    }
  } catch {}
}

async function deleteNotebook(id) {
  try {
    await fetch('/api/notebooks?id=' + encodeURIComponent(id), { method: 'DELETE' });
    delete _notebooks[id];
    _activeNotebook = null;
    renderFileList();
    goHome();
  } catch {}
}

// Thin wrapper — kept for backward compatibility with callers
function showNotebook(openId) {
  getOrCreateSingleNotebook().then(function(nb) {
    openNotebookInPane(nb.id);
  });
}

// Render a notebook in the content pane using article-like layout
function openNotebookInPane(id) {
  const nb = _notebooks[id];
  if (!nb) return;
  activeFile = null;
  _activeNotebook = nb;

  const content = document.getElementById('content');
  const empty = document.getElementById('empty-state');
  empty.style.display = 'none';
  content.style.display = 'block';
  document.title = (nb.title || 'Untitled') + ' — PullRead';
  document.getElementById('margin-notes').innerHTML = '';
  renderFileList();

  let html = '';

  // Article-style header
  html += '<div class="article-header">';
  html += '<input class="notebook-title-input" value="' + escapeHtml(nb.title || '') + '" placeholder="Untitled notebook" oninput="notebookDebounceSave()">';
  html += '<div class="article-byline">';
  var bylineParts = [];
  bylineParts.push('<span>Notebook</span>');
  if (nb.updatedAt) bylineParts.push('<span>Updated ' + new Date(nb.updatedAt).toLocaleDateString() + '</span>');
  if (nb.createdAt) bylineParts.push('<span>Created ' + new Date(nb.createdAt).toLocaleDateString() + '</span>');
  html += bylineParts.join('<span class="sep">&middot;</span>');
  html += '</div>';

  // Action buttons — same row style as articles
  html += '<div class="article-actions">';
  var previewLabel = _notebookPreviewMode ? 'Edit' : 'Preview';
  html += '<button onclick="toggleNotebookPreview()" class="' + (_notebookPreviewMode ? 'active-fav' : '') + '"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-pen"/></svg> ' + previewLabel + '</button>';
  html += '<button onclick="toggleWritingFocus()" class="' + (_writingFocusActive ? 'active-fav' : '') + '"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-focus"/></svg> Focus</button>';
  html += '<button onclick="showHighlightPicker()"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-pen"/></svg> Insert Highlights</button>';
  html += '<div class="share-dropdown" style="display:inline-block"><button onclick="toggleNotebookExportDropdown(event)"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-share"/></svg> Export\u2026</button></div>';
  html += '<span class="save-hint" id="notebook-save-hint" style="font-size:11px;color:var(--muted);margin-left:auto">Saved</span>';
  html += '</div>';
  html += '</div>';

  // Content body
  if (_notebookPreviewMode) {
    html += '<div class="notebook-preview">' + marked.parse(nb.content || '*Start writing...*') + '</div>';
  } else {
    html += '<div class="notebook-editor-wrap"><div class="notebook-editor">'
      + '<textarea placeholder="Start writing... Use markdown for formatting.">' + escapeHtml(nb.content || '') + '</textarea>'
      + '</div></div>';
  }

  // Sources chips
  var sources = (nb.sources || []);
  if (sources.length) {
    html += '<div class="notebook-sources"><span class="notebook-sources-label">Sources</span>';
    for (var si = 0; si < sources.length; si++) {
      var s = sources[si];
      var display = s.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '').replace(/-/g, ' ');
      html += '<span class="notebook-source-chip" onclick="jumpToArticle(\'' + escapeHtml(s) + '\')">' + escapeHtml(display) + '</span>';
    }
    html += '</div>';
  }

  // Tags
  var nbTags = (nb.tags || []);
  html += '<div class="tags-row" style="margin-top:12px">';
  for (var ti = 0; ti < nbTags.length; ti++) {
    var t = nbTags[ti];
    html += '<span class="tag">' + escapeHtml(t) + '<span class="tag-remove" onclick="removeNotebookTag(\'' + escapeHtml(t.replace(/'/g, "\\'")) + '\')">&times;</span></span>';
  }
  html += '<input type="text" placeholder="Add tag..." onkeydown="handleNotebookTagKey(event)" style="flex:1;min-width:80px">';
  html += '</div>';
  html += '<div id="nb-tag-suggestions" class="nb-tag-suggestions" style="display:none"></div>';

  content.innerHTML = html;
  document.getElementById('content-pane').scrollTop = 0;

  // Render diagrams in notebook preview
  if (_notebookPreviewMode) {
    renderDiagrams();
    applySyntaxHighlighting();
  }

  // Set up auto-grow, auto-save, and focus tracking for textarea
  var ta = content.querySelector('.notebook-editor textarea');
  if (ta) {
    autoGrowTextarea(ta);
    ta.addEventListener('input', function() {
      autoGrowTextarea(ta);
      notebookDebounceSave();
      updateWritingFocusLine();
      scheduleNotebookTagSuggestion();
    });
    ta.addEventListener('click', updateWritingFocusLine);
    ta.addEventListener('keyup', updateWritingFocusLine);
    ta.addEventListener('scroll', updateWritingFocusLine);
    ta.focus();
  }
}

function autoGrowTextarea(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.max(400, ta.scrollHeight) + 'px';
}

function notebookDebounceSave() {
  const hint = document.getElementById('notebook-save-hint');
  if (hint) hint.textContent = 'Saving...';
  clearTimeout(_notebookSaveTimeout);
  _notebookSaveTimeout = setTimeout(() => {
    if (!_activeNotebook) return;
    const titleInput = document.querySelector('.notebook-title-input');
    // Read from full-screen focus textarea if active, else inline editor
    const wfTa = document.getElementById('wf-textarea');
    const ta = wfTa || document.querySelector('.notebook-editor textarea');
    if (titleInput) _activeNotebook.title = titleInput.value;
    if (ta) _activeNotebook.content = ta.value;
    _activeNotebook.updatedAt = new Date().toISOString();
    saveNotebook(_activeNotebook).then(() => {
      if (hint) hint.textContent = 'Saved';
    });
  }, 800);
}

// AI tag suggestions for notebook content
let _nbTagSuggestTimeout = null;
let _nbLastSuggestedContent = '';

function scheduleNotebookTagSuggestion() {
  clearTimeout(_nbTagSuggestTimeout);
  if (!_activeNotebook || !serverMode) return;
  const ta = document.querySelector('.notebook-editor textarea');
  if (!ta) return;
  const text = ta.value || '';
  // Require 2+ paragraphs (split by double newline)
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  if (paragraphs.length < 2) return;
  // Don't re-suggest if content hasn't changed substantially
  if (text === _nbLastSuggestedContent) return;
  _nbTagSuggestTimeout = setTimeout(function() {
    _nbLastSuggestedContent = text;
    fetchNotebookTagSuggestions(text);
  }, 10000);
}

async function fetchNotebookTagSuggestions(text) {
  const container = document.getElementById('nb-tag-suggestions');
  if (!container || !_activeNotebook) return;
  try {
    const res = await fetch('/api/autotag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    });
    if (!res.ok) return;
    const data = await res.json();
    const suggestions = (data.machineTags || []).slice(0, 3);
    if (!suggestions.length) { container.style.display = 'none'; return; }
    // Filter out tags already on the notebook
    const existing = new Set((_activeNotebook.tags || []).map(t => t.toLowerCase()));
    const filtered = suggestions.filter(t => !existing.has(t.toLowerCase()));
    if (!filtered.length) { container.style.display = 'none'; return; }
    let html = '<span class="nb-suggest-label">Suggested tags:</span> ';
    for (const tag of filtered) {
      html += '<button class="nb-suggest-pill" onclick="acceptNotebookTagSuggestion(\'' + escapeHtml(tag.replace(/'/g, "\\'")) + '\',this)">'
        + escapeHtml(tag) + ' <span class="nb-suggest-accept">+</span></button> ';
    }
    html += '<button class="nb-suggest-dismiss" onclick="this.parentElement.style.display=\'none\'" title="Dismiss">&times;</button>';
    container.innerHTML = html;
    container.style.display = '';
  } catch {}
}

function acceptNotebookTagSuggestion(tag, btn) {
  if (!_activeNotebook) return;
  if (!_activeNotebook.tags) _activeNotebook.tags = [];
  if (!_activeNotebook.tags.includes(tag)) {
    _activeNotebook.tags.push(tag);
    saveNotebook(_activeNotebook);
    openNotebookInPane(_activeNotebook.id);
  }
}

function openNotebookEditor(id) {
  _notebookPreviewMode = false;
  showNotebook(id);
}

function createNewNotebook() {
  // Single-notebook model: just open the shared notebook
  openSingleNotebook();
}

function toggleNotebookPreview() {
  // Save current content before toggling
  const ta = document.querySelector('.notebook-editor textarea');
  if (ta && _activeNotebook) _activeNotebook.content = ta.value;
  const titleInput = document.querySelector('.notebook-title-input');
  if (titleInput && _activeNotebook) _activeNotebook.title = titleInput.value;

  _notebookPreviewMode = !_notebookPreviewMode;
  showNotebook(_activeNotebook ? _activeNotebook.id : null);
}

function exportNotebook() {
  if (!_activeNotebook) return;
  const nb = _activeNotebook;

  // Build YAML frontmatter matching article format
  let fm = '---\n';
  fm += 'title: "' + (nb.title || 'Untitled').replace(/"/g, '\\"') + '"\n';
  fm += 'type: notebook\n';
  if (nb.createdAt) fm += 'created: ' + nb.createdAt.slice(0, 10) + '\n';
  if (nb.updatedAt) fm += 'updated: ' + nb.updatedAt.slice(0, 10) + '\n';
  if (nb.tags && nb.tags.length) {
    fm += 'tags:\n';
    for (const t of nb.tags) fm += '  - ' + t + '\n';
  }
  if (nb.sources && nb.sources.length) {
    fm += 'sources:\n';
    for (const s of nb.sources) {
      const f = allFiles.find(function(f) { return f.filename === s; });
      const title = f ? f.title : s;
      fm += '  - "' + title.replace(/"/g, '\\"') + '"\n';
    }
  }
  fm += '---\n\n';

  let md = fm;
  if (nb.title) md += '# ' + nb.title + '\n\n';
  md += (nb.content || '') + '\n';

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (nb.title || 'notebook').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toggleNotebookExportDropdown(e) {
  e.stopPropagation();
  var existing = document.querySelector('.nb-export-panel');
  if (existing) { existing.remove(); return; }
  var btn = e.currentTarget;
  var panel = document.createElement('div');
  panel.className = 'share-dropdown-panel nb-export-panel';
  panel.onclick = function(ev) { ev.stopPropagation(); };
  var items = '';
  items += '<button onclick="exportNotebook();this.closest(\'.nb-export-panel\').remove()">Export .md</button>';
  items += '<button onclick="exportNotebookPdf();this.closest(\'.nb-export-panel\').remove()">Export .pdf</button>';
  panel.innerHTML = items;
  btn.closest('.share-dropdown').appendChild(panel);
  // Close when clicking elsewhere
  setTimeout(function() {
    document.addEventListener('click', function close() {
      panel.remove();
      document.removeEventListener('click', close);
    }, { once: true });
  }, 0);
}

function exportNotebookPdf() {
  if (!_activeNotebook) return;
  var nb = _activeNotebook;
  // Render the notebook as a clean printable page and trigger print-to-PDF
  var win = window.open('', '_blank');
  if (!win) { alert('Please allow popups to export as PDF.'); return; }
  var bodyHtml = marked.parse(nb.content || '');
  var sources = (nb.sources || []);
  var sourcesHtml = '';
  if (sources.length) {
    sourcesHtml = '<hr><p><strong>Sources:</strong></p><ul>';
    for (var i = 0; i < sources.length; i++) {
      var f = allFiles.find(function(ff) { return ff.filename === sources[i]; });
      var title = f ? f.title : sources[i];
      sourcesHtml += '<li>' + escapeHtml(title) + '</li>';
    }
    sourcesHtml += '</ul>';
  }
  var tags = (nb.tags || []);
  var tagsHtml = tags.length ? '<p><strong>Tags:</strong> ' + tags.map(function(t) { return escapeHtml(t); }).join(', ') + '</p>' : '';
  win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escapeHtml(nb.title || 'Notebook') + '</title>'
    + '<style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.7;color:#222}'
    + 'h1{font-size:28px;margin-bottom:4px}h2,h3{margin-top:1.5em}'
    + 'blockquote{border-left:3px solid #ccc;margin:1em 0;padding:0.5em 1em;color:#555}'
    + 'code{background:#f5f5f5;padding:2px 4px;border-radius:3px;font-size:0.9em}'
    + 'pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto}'
    + '.meta{font-size:13px;color:#888;margin-bottom:24px}'
    + '@media print{body{margin:0;max-width:none}}</style></head><body>'
    + '<h1>' + escapeHtml(nb.title || 'Untitled') + '</h1>'
    + '<div class="meta">Notebook' + (nb.updatedAt ? ' &middot; Updated ' + new Date(nb.updatedAt).toLocaleDateString() : '') + '</div>'
    + bodyHtml + sourcesHtml + tagsHtml
    + '<script>window.onload=function(){window.print();}<\/script>'
    + '</body></html>');
  win.document.close();
}

function showHighlightPicker() {
  if (!_activeNotebook) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  // Collect all highlights with article metadata, sorted recent-first
  const entries = Object.entries(allHighlightsIndex).filter(function(e) { return e[1] && e[1].length > 0; });
  var allHlItems = [];
  for (var ei = 0; ei < entries.length; ei++) {
    var filename = entries[ei][0];
    var hls = entries[ei][1];
    var f = allFiles.find(function(ff) { return ff.filename === filename; });
    var title = f ? f.title : filename;
    var dateStr = f && f.bookmarked ? f.bookmarked.slice(0, 10) : '';
    for (var hi = 0; hi < hls.length; hi++) {
      allHlItems.push({ filename: filename, title: title, date: dateStr, color: hls[hi].color || '', text: hls[hi].text });
    }
  }
  // Sort by date descending (recent first)
  allHlItems.sort(function(a, b) { return b.date.localeCompare(a.date); });

  // Group by date then article
  var dateGroups = {};
  var dateOrder = [];
  for (var di = 0; di < allHlItems.length; di++) {
    var item = allHlItems[di];
    var dk = item.date || 'Undated';
    if (!dateGroups[dk]) { dateGroups[dk] = {}; dateOrder.push(dk); }
    if (!dateGroups[dk][item.filename]) dateGroups[dk][item.filename] = { title: item.title, items: [] };
    dateGroups[dk][item.filename].items.push(item);
  }

  var groupsHtml = '';
  if (!allHlItems.length) {
    groupsHtml = '<p style="color:var(--muted);text-align:center;padding:20px">No highlights yet. Select text in an article and press <kbd>h</kbd> to highlight.</p>';
  } else {
    for (var gi = 0; gi < dateOrder.length; gi++) {
      var dateKey = dateOrder[gi];
      var articles = dateGroups[dateKey];
      groupsHtml += '<div class="hl-picker-date-group">';
      groupsHtml += '<div class="hl-picker-date-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\';this.querySelector(\'.hl-caret\').classList.toggle(\'collapsed\')">';
      groupsHtml += '<span class="hl-caret">&#9662;</span> ' + escapeHtml(dateKey);
      groupsHtml += '</div>';
      groupsHtml += '<div class="hl-picker-date-content">';
      var fns = Object.keys(articles);
      for (var fi = 0; fi < fns.length; fi++) {
        var art = articles[fns[fi]];
        groupsHtml += '<div class="hl-picker-group">';
        groupsHtml += '<div class="hl-picker-group-title">' + escapeHtml(art.title) + '</div>';
        for (var ii = 0; ii < art.items.length; ii++) {
          var hl = art.items[ii];
          var colorDot = hl.color ? '<span class="hl-color-dot" style="background:' + escapeHtml(hl.color) + '"></span>' : '';
          groupsHtml += '<label class="hl-picker-item">'
            + '<input type="checkbox" data-filename="' + escapeHtml(hl.filename) + '" data-text="' + escapeHtml(hl.text) + '">'
            + colorDot
            + '<span class="hl-picker-item-text">' + escapeHtml(hl.text.slice(0, 200)) + '</span>'
            + '</label>';
        }
        groupsHtml += '</div>';
      }
      groupsHtml += '</div></div>';
    }
  }

  overlay.innerHTML = '<div class="modal-card" onclick="event.stopPropagation()" style="max-width:580px;max-height:80vh;display:flex;flex-direction:column">'
    + '<h2>Insert Highlights</h2>'
    + '<p style="color:var(--muted);font-size:13px;margin-bottom:12px">Select highlights to insert as blockquotes into your notebook.</p>'
    + '<input type="text" id="hl-picker-search" placeholder="Search highlights..." oninput="filterHighlightPicker(this.value)" style="width:100%;padding:6px 10px;font-size:13px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);margin-bottom:12px;font-family:inherit">'
    + '<div id="hl-picker-groups" style="overflow-y:auto;flex:1">' + groupsHtml + '</div>'
    + '<div class="modal-actions">'
    + '<button class="btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>'
    + '<button class="btn-primary" onclick="insertSelectedHighlights()">Insert Selected</button>'
    + '</div></div>';
  document.body.appendChild(overlay);
  overlay.querySelector('#hl-picker-search').focus();
}

function filterHighlightPicker(query) {
  var q = query.toLowerCase();
  var items = document.querySelectorAll('.hl-picker-item');
  for (var i = 0; i < items.length; i++) {
    var text = items[i].textContent.toLowerCase();
    items[i].style.display = !q || text.includes(q) ? '' : 'none';
  }
  // Show/hide groups based on visible items
  var groups = document.querySelectorAll('.hl-picker-group');
  for (var g = 0; g < groups.length; g++) {
    var visible = groups[g].querySelectorAll('.hl-picker-item:not([style*="display: none"])');
    groups[g].style.display = visible.length ? '' : 'none';
  }
  // Show/hide date groups
  var dateGroups = document.querySelectorAll('.hl-picker-date-group');
  for (var d = 0; d < dateGroups.length; d++) {
    var visibleGroups = dateGroups[d].querySelectorAll('.hl-picker-group:not([style*="display: none"])');
    dateGroups[d].style.display = visibleGroups.length ? '' : 'none';
  }
}

function insertSelectedHighlights() {
  const overlay = document.querySelector('.modal-overlay');
  if (!overlay) return;
  const checked = overlay.querySelectorAll('input[type=checkbox]:checked');
  if (!checked.length) { overlay.remove(); return; }

  let insertText = '';
  const newSources = new Set(_activeNotebook.sources || []);
  for (const cb of checked) {
    const text = cb.dataset.text;
    const filename = cb.dataset.filename;
    insertText += '\n> ' + text + '\n';
    newSources.add(filename);
  }

  _activeNotebook.sources = Array.from(newSources);

  const ta = document.querySelector('.notebook-editor textarea');
  if (ta) {
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const after = ta.value.slice(pos);
    ta.value = before + insertText + '\n' + after;
    _activeNotebook.content = ta.value;
    autoGrowTextarea(ta);
  }

  overlay.remove();
  notebookDebounceSave();
  // Refresh to show updated sources
  setTimeout(() => showNotebook(_activeNotebook.id), 900);
}

function startNotebookFromArticle() {
  // Close share dropdown
  const panel = document.querySelector('.share-dropdown-panel');
  if (panel) panel.remove();

  if (!activeFile) return;

  const file = allFiles.find(f => f.filename === activeFile);
  const title = file ? file.title : activeFile;

  let snippet = '## Notes on: ' + title + '\n\n';
  if (articleHighlights.length) {
    for (const hl of articleHighlights) {
      snippet += '> ' + hl.text + '\n\n';
      if (hl.note) snippet += '*' + hl.note + '*\n\n';
    }
  }
  if (articleNotes.articleNote) {
    snippet += articleNotes.articleNote + '\n\n';
  }

  // Append to the single shared notebook
  getOrCreateSingleNotebook().then(function(nb) {
    nb.content = (nb.content ? nb.content + '\n\n---\n\n' : '') + snippet;
    if (!nb.sources) nb.sources = [];
    if (nb.sources.indexOf(activeFile) < 0) nb.sources.push(activeFile);
    nb.updatedAt = new Date().toISOString();
    saveNotebook(nb).then(function() {
      _activeNotebook = nb;
      _notebookPreviewMode = false;
      _sidebarView = 'notebooks';
      syncSidebarTabs();
      openNotebookInPane(nb.id);
    });
  });
}

// Notebook tag handlers (mirrors article notes tag pattern)
function handleNotebookTagKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    var tag = e.target.value.trim().replace(/,/g, '');
    if (!tag || !_activeNotebook) return;
    if (!_activeNotebook.tags) _activeNotebook.tags = [];
    if (!_activeNotebook.tags.includes(tag)) {
      _activeNotebook.tags.push(tag);
      notebookDebounceSave();
      showNotebook(_activeNotebook.id);
    }
    e.target.value = '';
  }
}

function removeNotebookTag(tag) {
  if (!_activeNotebook || !_activeNotebook.tags) return;
  _activeNotebook.tags = _activeNotebook.tags.filter(function(t) { return t !== tag; });
  notebookDebounceSave();
  showNotebook(_activeNotebook.id);
}

// ---- Writing Focus Mode ----
// ---- Sidebar nav view switching ----
let _sidebarView = 'library';

function switchSidebarView(view) {
  _sidebarView = view;
  syncSidebarTabs();

  // Trigger the appropriate view in the content area
  if (view === 'explore') showTagCloud();
  else if (view === 'notebooks') { openSingleNotebook(); }
  else if (view === 'library') goHome();
}

function openSingleNotebook() {
  getOrCreateSingleNotebook().then(function(nb) {
    openNotebookInPane(nb.id);
  });
}

function syncSidebarTabs() {
  document.querySelectorAll('.sidebar-nav-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.view === _sidebarView);
  });
  // Always show file list and count — articles + notebooks visible on all tabs
  var fileCount = document.getElementById('file-count');
  var fileList = document.getElementById('file-list');
  if (fileCount) fileCount.style.display = '';
  if (fileList) fileList.style.display = '';

  // Update search placeholder contextually
  var search = document.getElementById('search');
  if (search) {
    if (_sidebarView === 'explore') search.placeholder = 'Search articles, tags, sources...';
    else if (_sidebarView === 'notebooks') search.placeholder = 'Search notebooks...';
    else search.placeholder = 'Search... try is:favorite or tag:tech';
  }
}

let _writingFocusActive = false;

function toggleWritingFocus() {
  if (_writingFocusActive) {
    exitWritingFocus();
    return;
  }
  if (!_activeNotebook) return;
  _writingFocusActive = true;

  // Create full-screen distraction-free overlay
  var overlay = document.createElement('div');
  overlay.className = 'writing-focus-overlay';
  overlay.id = 'writing-focus-overlay';

  var title = _activeNotebook.title || 'Untitled';
  var content = _activeNotebook.content || '';
  var wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  overlay.innerHTML = '<div class="wf-toolbar">'
    + '<button onclick="exitWritingFocus()" title="Exit focus mode (Esc)">Exit Focus</button>'
    + '<span class="wf-title">' + escapeHtml(title) + '</span>'
    + '<span class="wf-word-count" id="wf-word-count">' + wordCount + ' words</span>'
    + '</div>'
    + '<div class="wf-body">'
    + '<div class="wf-focus-line" id="wf-focus-line"></div>'
    + '<textarea id="wf-textarea">' + escapeHtml(content) + '</textarea>'
    + '</div>';

  document.body.appendChild(overlay);

  var ta = document.getElementById('wf-textarea');
  ta.focus();
  // Move cursor to end
  ta.selectionStart = ta.selectionEnd = ta.value.length;

  ta.addEventListener('input', function() {
    notebookDebounceSave();
    updateWritingFocusLine();
    var wc = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
    var wcEl = document.getElementById('wf-word-count');
    if (wcEl) wcEl.textContent = wc + ' words';
  });
  ta.addEventListener('click', updateWritingFocusLine);
  ta.addEventListener('keyup', updateWritingFocusLine);
  ta.addEventListener('scroll', updateWritingFocusLine);

  // Escape key to exit
  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { exitWritingFocus(); }
  });

  updateWritingFocusLine();

  // Update the inline Focus button state
  var btn = document.querySelector('.notebook-toolbar button[onclick="toggleWritingFocus()"]');
  if (btn) btn.classList.add('active');
}

function exitWritingFocus() {
  _writingFocusActive = false;

  // Sync content back from overlay textarea
  var ta = document.getElementById('wf-textarea');
  if (ta && _activeNotebook) {
    _activeNotebook.content = ta.value;
    notebookDebounceSave();
  }

  var overlay = document.getElementById('writing-focus-overlay');
  if (overlay) overlay.remove();

  // Refresh the notebook editor to show updated content
  if (_activeNotebook) {
    showNotebook(_activeNotebook.id);
  }
}

function updateWritingFocusLine() {
  if (!_writingFocusActive) return;
  // Check full-screen overlay first
  var ta = document.getElementById('wf-textarea');
  var line = document.getElementById('wf-focus-line');
  if (!ta || !line) {
    // Fallback to inline mode
    ta = document.querySelector('.notebook-editor textarea');
    line = document.querySelector('.notebook-focus-line');
  }
  if (!ta || !line) return;
  var text = ta.value.substring(0, ta.selectionStart);
  var lineNum = text.split('\n').length - 1;
  var lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 28.8;
  var padding = 0;
  line.style.top = (padding + lineNum * lineHeight - ta.scrollTop) + 'px';
}

// ---- Tag Cloud / Explore ---- (renders as inline page like Guide)
function showTagCloud() {
  _sidebarView = 'explore'; syncSidebarTabs();
  const content = document.getElementById('content');
  const empty = document.getElementById('empty-state');
  empty.style.display = 'none';
  content.style.display = 'block';

  // Deselect sidebar — disables highlights/notes on this page
  activeFile = null;
  document.getElementById('margin-notes').innerHTML = '';
  renderFileList();

  // Collect all tags (user + machine), domain groupings, feed counts
  const tagCounts = {};
  const tagArticles = {};  // tag -> [articles]
  const domainArticles = {};
  const feedCounts = {};

  for (const f of allFiles) {
    if (f.domain && f.domain !== 'pullread') {
      if (!domainArticles[f.domain]) domainArticles[f.domain] = [];
      domainArticles[f.domain].push(f);
    }
    if (f.feed) {
      feedCounts[f.feed] = (feedCounts[f.feed] || 0) + 1;
    }
    const notes = allNotesIndex[f.filename];
    const allTags = [];
    if (notes && notes.tags) allTags.push(...notes.tags);
    if (notes && notes.machineTags) allTags.push(...notes.machineTags);
    for (const tag of allTags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      if (!tagArticles[tag]) tagArticles[tag] = [];
      tagArticles[tag].push(f);
    }
  }

  const sortedDomains = Object.entries(domainArticles)
    .sort((a, b) => b[1].length - a[1].length);
  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1]);

  // Stats bar
  const totalArticles = allFiles.length;
  const totalHighlights = Object.values(allHighlightsIndex).reduce((s, h) => s + (h ? h.length : 0), 0);
  const totalFavorites = Object.values(allNotesIndex).filter(n => n && n.isFavorite).length;
  const totalSummaries = allFiles.filter(f => f.hasSummary).length;
  const totalUnread = allFiles.filter(f => !readArticles.has(f.filename)).length;

  let statsHtml = '<div class="explore-stats">';
  statsHtml += '<span><strong>' + totalArticles + '</strong> articles</span>';
  statsHtml += '<span><strong>' + totalUnread + '</strong> unread</span>';
  statsHtml += '<span><strong>' + totalHighlights + '</strong> highlights</span>';
  statsHtml += '<span><strong>' + totalFavorites + '</strong> favorites</span>';
  statsHtml += '<span><strong>' + totalSummaries + '</strong> summaries</span>';
  statsHtml += '<span><strong>' + Object.keys(domainArticles).length + '</strong> sources</span>';
  statsHtml += '</div>';

  // --- Tab: Discover (quick filters + ontological connections) ---
  const makeQf = function(label, query, variant) {
    return '<button class="tag-pill' + (variant ? ' tag-pill-' + variant : '') + '" onclick="document.getElementById(\'search\').value=\'' + query + '\';filterFiles()">' + label + '</button>';
  };
  let discoverHtml = '<div class="tag-cloud">';
  discoverHtml += makeQf('Favorites', 'is:favorite', 'pink');
  discoverHtml += makeQf('Unread', 'is:unread', 'blue');
  discoverHtml += makeQf('Has Summary', 'has:summary', 'green');
  discoverHtml += makeQf('Has Highlights', 'has:highlights', 'amber');
  discoverHtml += makeQf('Has Notes', 'has:notes', '');
  discoverHtml += makeQf('Has Tags', 'has:tags', '');
  const sortedFeeds = Object.entries(feedCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [feed] of sortedFeeds) {
    discoverHtml += makeQf(escapeHtml(feed), 'feed:' + feed, '');
  }
  discoverHtml += '</div>';

  // Auto-tag actions
  const taggedCount = allFiles.filter(function(f) { const n = allNotesIndex[f.filename]; return n && ((n.tags && n.tags.length) || (n.machineTags && n.machineTags.length)); }).length;
  const untaggedCount = totalArticles - taggedCount;
  discoverHtml += '<h3 style="font-size:14px;font-weight:600;margin:24px 0 12px">Auto-Tagging</h3>';
  discoverHtml += '<p style="font-size:13px;color:var(--muted);margin:0 0 10px">' + taggedCount + ' of ' + totalArticles + ' articles tagged. ';
  if (untaggedCount > 0) discoverHtml += untaggedCount + ' remaining.';
  else discoverHtml += 'All articles tagged!';
  discoverHtml += '</p>';
  discoverHtml += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
  discoverHtml += '<button class="tag-pill" id="batch-tag-btn" onclick="batchAutotagAll(false)" title="Tag untagged articles using AI"><svg class="icon icon-sm" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-wand"/></svg> Tag Untagged</button>';
  discoverHtml += '<button class="tag-pill" onclick="batchAutotagAll(true)" title="Re-tag all articles, replacing existing AI tags"><svg class="icon icon-sm" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-refresh"/></svg> Retag All</button>';
  discoverHtml += '</div>';

  // Ontological connections: find tags shared by 2+ articles and show the clusters
  const connectionsHtml = buildConnectionsHtml(tagArticles, sortedTags);
  if (connectionsHtml) {
    discoverHtml += '<h3 style="font-size:14px;font-weight:600;margin:24px 0 12px">Connections</h3>';
    discoverHtml += connectionsHtml;
  }

  // --- Tab: Most Viewed ---
  const positions = JSON.parse(localStorage.getItem('pr-scroll-positions') || '{}');
  const viewedArticles = allFiles
    .filter(f => positions[f.filename] || readArticles.has(f.filename))
    .sort((a, b) => {
      const pctA = positions[a.filename]?.pct || 0;
      const pctB = positions[b.filename]?.pct || 0;
      const tsA = positions[a.filename]?.ts || 0;
      const tsB = positions[b.filename]?.ts || 0;
      if (Math.abs(pctB - pctA) > 0.1) return pctB - pctA;
      return tsB - tsA;
    })
    .slice(0, 30);

  let viewedHtml = '';
  if (viewedArticles.length > 0) {
    viewedArticles.forEach(function(f, i) {
      const pct = positions[f.filename]?.pct;
      const pctStr = pct ? Math.round(pct * 100) + '%' : 'Opened';
      const domain = f.domain || '';
      const favicon = domain ? 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=32' : '';
      viewedHtml += '<div class="most-viewed-item" onclick="jumpToArticle(\'' + escapeHtml(f.filename.replace(/'/g, "\\'")) + '\')">';
      viewedHtml += '<div class="most-viewed-rank">' + (i + 1) + '</div>';
      viewedHtml += '<div class="most-viewed-info">';
      viewedHtml += '<div class="most-viewed-title">' + escapeHtml(f.title) + '</div>';
      viewedHtml += '<div class="most-viewed-meta">';
      if (favicon) viewedHtml += '<img src="' + escapeHtml(favicon) + '" alt="" loading="lazy">';
      if (domain) viewedHtml += '<span>' + escapeHtml(domain) + '</span>';
      viewedHtml += '</div></div>';
      viewedHtml += '<div class="most-viewed-pct">' + pctStr + '</div>';
      viewedHtml += '</div>';
    });
  } else {
    viewedHtml = '<p style="color:var(--muted);font-size:13px;padding:12px 0">No reading history yet. Articles you read will appear here.</p>';
  }

  // --- Tab: Tags ---
  let tagsHtml = '';
  if (sortedTags.length > 0) {
    tagsHtml = '<div class="tag-cloud">';
    for (const [tag, count] of sortedTags) {
      tagsHtml += '<button class="tag-pill" onclick="document.getElementById(\'search\').value=\'' + escapeHtml(tag) + '\';filterFiles()">' + escapeHtml(tag) + '<span class="tag-count">' + count + '</span></button>';
    }
    tagsHtml += '</div>';
  } else {
    tagsHtml = '<p style="color:var(--muted);font-size:13px;padding:12px 0">No tags yet. Tag articles from the notes panel, or use auto-tagging to generate topic tags.</p>';
  }

  // --- Tab: Sources ---
  let domainsHtml = '';
  for (const [domain, articles] of sortedDomains.slice(0, 40)) {
    domainsHtml += '<div class="domain-group">';
    domainsHtml += '<div class="domain-group-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">';
    domainsHtml += '<img class="file-item-favicon" src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=32" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
    domainsHtml += '<span>' + escapeHtml(domain) + '</span><span class="domain-group-count">' + articles.length + ' article' + (articles.length !== 1 ? 's' : '') + '</span></div>';
    domainsHtml += '<div class="domain-group-articles" style="display:none">';
    for (const a of articles.slice(0, 10)) {
      domainsHtml += '<a href="#" onclick="event.preventDefault();jumpToArticle(\'' + escapeHtml(a.filename.replace(/'/g, "\\'")) + '\')">' + escapeHtml(a.title) + '</a>';
    }
    if (articles.length > 10) {
      domainsHtml += '<a href="#" onclick="event.preventDefault();document.getElementById(\'search\').value=\'domain:' + escapeHtml(domain) + '\';filterFiles()" style="color:var(--link)">+ ' + (articles.length - 10) + ' more</a>';
    }
    domainsHtml += '</div></div>';
  }

  content.innerHTML =
    '<div class="article-header"><h1>Explore</h1></div>' +
    statsHtml +
    '<div class="explore-tabs">' +
      '<button class="explore-tab active" data-tab="discover">Discover</button>' +
      '<button class="explore-tab" data-tab="most-viewed">Most Viewed</button>' +
      '<button class="explore-tab" data-tab="tags">Tags</button>' +
      '<button class="explore-tab" data-tab="sources">Sources</button>' +
    '</div>' +
    '<div id="explore-discover" class="explore-tab-panel active">' + discoverHtml + '</div>' +
    '<div id="explore-most-viewed" class="explore-tab-panel">' + viewedHtml + '</div>' +
    '<div id="explore-tags" class="explore-tab-panel">' + tagsHtml + '</div>' +
    '<div id="explore-sources" class="explore-tab-panel">' + domainsHtml + '</div>';

  // Wire up tab switching
  content.querySelectorAll('.explore-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      content.querySelectorAll('.explore-tab').forEach(function(b) { b.classList.remove('active'); });
      content.querySelectorAll('.explore-tab-panel').forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('explore-' + btn.dataset.tab).classList.add('active');
    });
  });

  document.title = 'Explore Your Library';
  document.getElementById('content-pane').scrollTop = 0;
}

// Build ontological connections: clusters of articles sharing the same tags
function buildConnectionsHtml(tagArticles, sortedTags) {
  // Pick tags with 2-8 articles (meaningful clusters, not too noisy)
  const clusters = sortedTags
    .filter(function(entry) { return entry[1] >= 2 && entry[1] <= 8; })
    .slice(0, 12);
  if (clusters.length === 0) return '';

  let html = '';
  for (const [tag, count] of clusters) {
    const articles = tagArticles[tag].slice(0, 5);
    html += '<div class="connection-group">';
    html += '<div class="connection-group-title"><span class="conn-tag">' + escapeHtml(tag) + '</span> <span style="font-size:11px;color:var(--muted);font-weight:400">' + count + ' articles</span></div>';
    html += '<div class="connection-group-articles">';
    for (const f of articles) {
      const domain = f.domain || '';
      const favicon = domain ? 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=32' : '';
      html += '<div class="connection-article" onclick="jumpToArticle(\'' + escapeHtml(f.filename.replace(/'/g, "\\'")) + '\')">';
      if (favicon) html += '<img src="' + escapeHtml(favicon) + '" alt="" loading="lazy">';
      html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(f.title) + '</span>';
      if (domain) html += '<span class="conn-domain">' + escapeHtml(domain) + '</span>';
      html += '</div>';
    }
    if (tagArticles[tag].length > 5) {
      html += '<div style="padding:4px 8px;font-size:11px"><a href="#" style="color:var(--link);text-decoration:none" onclick="event.preventDefault();document.getElementById(\'search\').value=\'' + escapeHtml(tag) + '\';filterFiles()">View all ' + count + ' &rsaquo;</a></div>';
    }
    html += '</div><button class="dash-chevron right" onclick="dashScrollRight(this)" aria-label="Scroll right">&#8250;</button></div></div>';
  }
  return html;
}

function jumpToArticle(filename) {
  const idx = displayFiles.findIndex(f => f.filename === filename);
  if (idx >= 0) {
    loadFile(idx);
  } else {
    // File might be hidden - clear filters
    document.getElementById('search').value = '';
    hideRead = false;
    document.getElementById('hide-read-toggle').checked = false;
    filterFiles();
    const newIdx = displayFiles.findIndex(f => f.filename === filename);
    if (newIdx >= 0) loadFile(newIdx);
  }
}

// ---- Reading Progress Bar ----
function updateReadingProgress() {
  const pane = document.getElementById('content-pane');
  const bar = document.getElementById('reading-progress-bar');
  if (!pane || !bar) return;
  const scrollTop = pane.scrollTop;
  const scrollHeight = pane.scrollHeight - pane.clientHeight;
  const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
  bar.style.width = Math.min(100, Math.max(0, progress)) + '%';
}

document.getElementById('content-pane').addEventListener('scroll', function() {
  updateReadingProgress();
  updateFocusMode();
  updateTocActive();
  saveScrollPosition();
});

// ---- Read Time & Word Count ----
function calculateReadStats(text) {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const wpm = 238; // average adult reading speed
  const minutes = Math.ceil(words / wpm);
  return { words, minutes };
}

function formatReadStats(words, minutes) {
  const wordStr = words >= 1000 ? (words / 1000).toFixed(1) + 'k' : words.toString();
  return '<span class="read-stats">' + minutes + ' min read<span class="stat-divider">&middot;</span>' + wordStr + ' words</span>';
}

// ---- Focus Mode ----
let focusModeActive = false;
let focusObserver = null;

function toggleFocusMode() {
  focusModeActive = !focusModeActive;
  document.body.classList.toggle('focus-mode', focusModeActive);
  document.getElementById('focus-btn').classList.toggle('active', focusModeActive);
  localStorage.setItem('pr-focus', focusModeActive ? '1' : '0');
  if (focusModeActive) {
    updateFocusMode();
  } else {
    clearFocusClasses();
  }
}

function clearFocusClasses() {
  document.querySelectorAll('.focus-active, .focus-adjacent').forEach(el => {
    el.classList.remove('focus-active', 'focus-adjacent');
  });
}

function updateFocusMode() {
  if (!focusModeActive) return;
  const content = document.getElementById('content');
  if (!content || content.style.display === 'none') return;

  const pane = document.getElementById('content-pane');
  const paneRect = pane.getBoundingClientRect();
  // Shift the focus point near the top/bottom of the scroll so edge
  // paragraphs still get highlighted instead of being permanently dimmed.
  const scrollTop = pane.scrollTop;
  const scrollBottom = pane.scrollHeight - pane.clientHeight - scrollTop;
  let focusRatio = 0.4;
  if (scrollTop < 200) focusRatio = 0.15;
  else if (scrollBottom < 200) focusRatio = 0.7;
  const centerY = paneRect.top + paneRect.height * focusRatio;

  const blocks = content.querySelectorAll(':scope > p, :scope > blockquote, :scope > ul, :scope > ol, :scope > pre, :scope > h2, :scope > h3, :scope > h4, :scope > table');

  clearFocusClasses();

  let closest = null;
  let closestDist = Infinity;

  blocks.forEach(block => {
    const rect = block.getBoundingClientRect();
    const blockCenter = rect.top + rect.height / 2;
    const dist = Math.abs(blockCenter - centerY);
    if (dist < closestDist) {
      closestDist = dist;
      closest = block;
    }
  });

  if (closest) {
    closest.classList.add('focus-active');
    // Also highlight immediate siblings for context
    if (closest.previousElementSibling && !closest.previousElementSibling.classList.contains('article-header')) {
      closest.previousElementSibling.classList.add('focus-adjacent');
    }
    if (closest.nextElementSibling && !closest.nextElementSibling.classList.contains('notes-panel')) {
      closest.nextElementSibling.classList.add('focus-adjacent');
    }
  }
}

// ---- Code Syntax Highlighting ----
const DIAGRAM_LANGUAGES = new Set(['mermaid', 'd2']);

function applySyntaxHighlighting() {
  if (typeof hljs === 'undefined') return;
  const content = document.getElementById('content');
  if (!content) return;

  // Update highlight.js theme based on current app theme
  updateHljsTheme();

  content.querySelectorAll('pre code').forEach(block => {
    // Skip if already highlighted
    if (block.classList.contains('hljs')) return;
    // Skip diagram languages — they get rendered by renderDiagrams()
    const langMatch = block.className.match(/language-(\w+)/);
    if (langMatch && DIAGRAM_LANGUAGES.has(langMatch[1])) return;

    hljs.highlightElement(block);

    // Add language label if detected
    const detected = block.result && block.result.language;
    const langName = (langMatch && langMatch[1]) || detected;
    if (langName && langName !== 'undefined') {
      const label = document.createElement('span');
      label.className = 'code-lang-label';
      label.textContent = langName;
      block.closest('pre').appendChild(label);
    }
  });
}

// ---- Diagram Rendering (Mermaid + D2) ----
function renderDiagrams() {
  const content = document.getElementById('content');
  if (!content) return;

  // Mermaid: client-side rendering
  const mermaidBlocks = content.querySelectorAll('pre code.language-mermaid');
  if (mermaidBlocks.length > 0 && typeof mermaid !== 'undefined') {
    mermaidBlocks.forEach((block, i) => {
      const source = block.textContent;
      const pre = block.closest('pre');
      const container = document.createElement('div');
      container.className = 'diagram-container mermaid';
      container.id = 'mermaid-diagram-' + Date.now() + '-' + i;
      container.textContent = source;
      pre.replaceWith(container);
    });
    const theme = document.body.getAttribute('data-theme');
    const isDark = theme === 'dark' || theme === 'high-contrast';
    mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });
    mermaid.run();
  }

  // D2: server-side via kroki.io (no client-side renderer exists)
  content.querySelectorAll('pre code.language-d2').forEach(block => {
    const source = block.textContent;
    const pre = block.closest('pre');
    const container = document.createElement('div');
    container.className = 'diagram-container diagram-d2';
    container.innerHTML = '<span class="diagram-loading">Rendering d2 diagram\u2026</span>';
    pre.replaceWith(container);

    fetch('https://kroki.io/d2/svg', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: source
    })
    .then(function(r) { return r.ok ? r.text() : Promise.reject(r.status + ' ' + r.statusText); })
    .then(function(svg) { container.innerHTML = svg; })
    .catch(function(err) {
      container.innerHTML = '<pre style="text-align:left"><code>' + escapeHtml(source) + '</code></pre>'
        + '<p class="diagram-error-msg">D2 rendering unavailable: ' + escapeHtml(String(err)) + '</p>';
    });
  });
}

function updateHljsTheme() {
  const theme = document.body.getAttribute('data-theme');
  const lightSheet = document.getElementById('hljs-light');
  const darkSheet = document.getElementById('hljs-dark');
  if (!lightSheet || !darkSheet) return;

  if (theme === 'dark' || theme === 'high-contrast') {
    lightSheet.media = 'not all';
    darkSheet.media = 'all';
  } else {
    lightSheet.media = 'all';
    darkSheet.media = 'not all';
  }
}

// ---- Reading Position Memory ----
let scrollSaveTimeout = null;

function saveScrollPosition() {
  if (!activeFile) return;
  clearTimeout(scrollSaveTimeout);
  scrollSaveTimeout = setTimeout(() => {
    const pane = document.getElementById('content-pane');
    if (!pane) return;
    const scrollHeight = pane.scrollHeight - pane.clientHeight;
    if (scrollHeight <= 0) return;
    const pct = pane.scrollTop / scrollHeight;
    const positions = JSON.parse(localStorage.getItem('pr-scroll-positions') || '{}');
    positions[activeFile] = { pct, ts: Date.now() };
    // Keep only last 100 positions
    const keys = Object.keys(positions);
    if (keys.length > 100) {
      const sorted = keys.sort((a, b) => positions[a].ts - positions[b].ts);
      sorted.slice(0, keys.length - 100).forEach(k => delete positions[k]);
    }
    localStorage.setItem('pr-scroll-positions', JSON.stringify(positions));
  }, 500);
}

function restoreScrollPosition(filename) {
  const positions = JSON.parse(localStorage.getItem('pr-scroll-positions') || '{}');
  const saved = positions[filename];
  if (!saved || saved.pct < 0.02) return; // Don't restore if near the top

  const pane = document.getElementById('content-pane');
  if (!pane) return;

  // Show a "resume" indicator
  const indicator = document.createElement('div');
  indicator.className = 'resume-indicator';
  indicator.textContent = 'Resume reading \u2193';
  indicator.setAttribute('role', 'button');
  indicator.setAttribute('aria-label', 'Resume reading from where you left off');
  indicator.onclick = function() {
    const scrollHeight = pane.scrollHeight - pane.clientHeight;
    pane.scrollTo({ top: saved.pct * scrollHeight, behavior: 'smooth' });
    indicator.remove();
  };
  document.body.appendChild(indicator);

  // Auto-dismiss after 5 seconds
  setTimeout(() => { if (indicator.parentNode) indicator.remove(); }, 5000);
}

// ---- Table of Contents ----
function generateToc() {
  const content = document.getElementById('content');
  const tocContainer = document.getElementById('toc-container');
  if (!content || !tocContainer) return;

  const headings = content.querySelectorAll('h2, h3');
  tocContainer.innerHTML = '';

  if (headings.length < 3) return; // Only show TOC for articles with 3+ headings

  const panel = document.createElement('div');
  panel.className = 'toc-panel';

  const label = document.createElement('div');
  label.className = 'toc-label';
  label.textContent = 'Contents';
  panel.appendChild(label);

  const list = document.createElement('ul');
  list.className = 'toc-list';

  headings.forEach((heading, i) => {
    // Skip headings inside article-header
    if (heading.closest('.article-header')) return;

    const id = 'toc-heading-' + i;
    heading.id = id;

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + id;
    a.textContent = heading.textContent;
    a.setAttribute('data-toc-target', id);
    if (heading.tagName === 'H3') a.classList.add('toc-h3');

    a.onclick = function(e) {
      e.preventDefault();
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    li.appendChild(a);
    list.appendChild(li);
  });

  panel.appendChild(list);
  tocContainer.appendChild(panel);
}

function updateTocActive() {
  const tocLinks = document.querySelectorAll('.toc-list a');
  if (!tocLinks.length) return;

  const pane = document.getElementById('content-pane');
  const paneRect = pane.getBoundingClientRect();
  const threshold = paneRect.top + 80;

  let activeId = null;
  const headings = document.querySelectorAll('#content h2[id], #content h3[id]');

  headings.forEach(heading => {
    if (heading.getBoundingClientRect().top <= threshold) {
      activeId = heading.id;
    }
  });

  tocLinks.forEach(link => {
    link.classList.toggle('toc-active', link.getAttribute('data-toc-target') === activeId);
  });
}

// ---- Sync Status ----
async function loadSyncStatus() {
  if (!serverMode) return;
  try {
    const res = await fetch('/api/sync-status');
    if (!res.ok) return;
    const data = await res.json();
    const countEl = document.getElementById('file-count-text');
    if (countEl && data.intervalMinutes) {
      const nextSync = data.intervalMinutes + ' min';
      countEl.title = 'Sync every ' + nextSync;
    }
  } catch {}
}

// ---- One-Time Migration: frontmatter annotations to JSON ----
async function migrateAnnotationsIfNeeded() {
  if (!serverMode) return;
  if (localStorage.getItem('pr-migration-v1-done')) return;

  // Check each article's frontmatter for old-style annotation field
  let migrated = 0;
  for (const file of allFiles) {
    try {
      const res = await fetch('/api/file?name=' + encodeURIComponent(file.filename));
      if (!res.ok) continue;
      const text = await res.text();
      const match = text.match(/^---\n([\s\S]*?)\n---/);
      if (!match) continue;

      const frontmatter = match[1];
      const annotationMatch = frontmatter.match(/^annotation:\s*"?(.*?)"?\s*$/m);
      if (!annotationMatch || !annotationMatch[1]) continue;

      // Found old-style annotation - migrate to JSON notes
      const existingNotes = allNotesIndex[file.filename] || {};
      if (existingNotes.articleNote) continue; // Already has notes, skip

      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.filename,
          articleNote: annotationMatch[1],
          annotations: existingNotes.annotations || [],
          tags: existingNotes.tags || [],
          isFavorite: existingNotes.isFavorite || false
        })
      });
      migrated++;
    } catch { continue; }
  }

  localStorage.setItem('pr-migration-v1-done', '1');
  if (migrated > 0) {
    console.log('Migrated ' + migrated + ' article annotations from frontmatter to JSON');
    await loadAnnotationsIndex(); // Refresh
    renderFileList();
  }
}

// Refresh article list from server
async function refreshArticleList(silent) {
  if (!serverMode) return;
  const btn = document.getElementById('refresh-btn');
  if (!silent) btn.classList.add('spinning');
  try {
    const res = await fetch('/api/files');
    if (res.ok) {
      const prevCount = allFiles.length;
      const prevFilenames = new Set(allFiles.map(f => f.filename));
      allFiles = await res.json();
      filteredFiles = allFiles;
      await Promise.all([loadAnnotationsIndex(), loadNotebooks()]);
      filterFiles();
      // Highlight new articles with a fade-in effect
      if (silent && allFiles.length > prevCount) {
        requestAnimationFrame(() => {
          document.querySelectorAll('.file-item').forEach(el => {
            const fn = el.getAttribute('data-filename');
            if (fn && !prevFilenames.has(fn)) {
              el.classList.add('file-item-new');
              setTimeout(() => el.classList.remove('file-item-new'), 3000);
            }
          });
        });
      }
      // Reload current article if still in list, or refresh dashboard
      if (activeFile) {
        const idx = displayFiles.findIndex(f => f.filename === activeFile);
        if (idx >= 0 && !silent) loadFile(idx);
      } else if (!silent) {
        renderDashboard();
      }
    }
  } catch {}
  if (!silent) btn.classList.remove('spinning');
}

// Auto-refresh: poll lightweight /api/files-changed every 5s, full refresh only when files change
let _autoRefreshTimer = null;
let _lastKnownChangeAt = 0;
function startAutoRefresh() {
  if (_autoRefreshTimer) return;
  _autoRefreshTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/files-changed');
      if (!res.ok) return;
      const data = await res.json();
      if (data.changedAt > _lastKnownChangeAt) {
        _lastKnownChangeAt = data.changedAt;
        refreshArticleList(true);
      }
    } catch {}
  }, 5000);
}
function stopAutoRefresh() {
  if (_autoRefreshTimer) { clearInterval(_autoRefreshTimer); _autoRefreshTimer = null; }
}

// Init: try to load from server, fall back to standalone mode
async function init() {
  // Restore preferences
  const savedTheme = localStorage.getItem('pr-theme');
  const savedFont = localStorage.getItem('pr-font');
  const savedSize = localStorage.getItem('pr-size');
  const savedSidebar = localStorage.getItem('pr-sidebar');
  const savedLeading = localStorage.getItem('pr-leading');
  const savedSpacing = localStorage.getItem('pr-spacing');
  const savedWidth = localStorage.getItem('pr-width');

  // Auto-detect OS dark mode on first visit
  if (savedTheme) {
    setTheme(savedTheme);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    setTheme('dark');
  }
  if (savedFont) {
    setFont(savedFont);
  }
  if (savedSize) setSize(savedSize);
  if (savedLeading && savedLeading !== 'default') setLineHeight(savedLeading);
  if (savedSpacing && savedSpacing !== 'default') setSpacing(savedSpacing);
  if (savedWidth && savedWidth !== 'default') setWidth(savedWidth);
  if (savedSidebar === '0' || window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.add('collapsed');
    document.getElementById('sidebar-toggle-btn').setAttribute('aria-expanded', 'false');
  }

  // Restore focus mode
  if (localStorage.getItem('pr-focus') === '1') {
    focusModeActive = true;
    document.body.classList.add('focus-mode');
    document.getElementById('focus-btn').classList.add('active');
  }

  // Restore hide-read
  hideRead = localStorage.getItem('pr-hide-read') === '1';
  document.getElementById('hide-read-toggle').checked = hideRead;

  try {
    const res = await fetch('/api/files');
    if (res.ok) {
      allFiles = await res.json();
      serverMode = true;
      filteredFiles = allFiles;

      // Load annotations index, LLM config, and notebooks
      await Promise.all([loadAnnotationsIndex(), checkLLMConfig(), loadNotebooks()]);

      renderFileList();

      // Run one-time migration and load sync status in background
      migrateAnnotationsIfNeeded();
      loadSyncStatus();

      // Preload Kokoro TTS model if it's the selected provider
      fetch('/api/tts-settings').then(r => r.json()).then(cfg => {
        ttsProvider = cfg.provider || 'browser';
        if (cfg.provider === 'kokoro') {
          fetch('/api/kokoro-preload', { method: 'POST' }).catch(() => {});
        }
      }).catch(() => {});

      // Show dashboard instead of auto-loading first article
      renderDashboard();
      showOnboardingIfNeeded();
      // Seed the change tracker so first poll doesn't false-trigger
      fetch('/api/files-changed').then(r => r.json()).then(d => { _lastKnownChangeAt = d.changedAt; }).catch(() => {});
      startAutoRefresh();
      return;
    }
  } catch {}

  // Standalone mode - show drop hint
  filteredFiles = [];
  renderFileList();
  document.getElementById('file-count').textContent = 'Drop files or use pullread view';
}

init();
