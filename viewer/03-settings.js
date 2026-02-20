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
  const btn = document.getElementById('aa-settings-btn');
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
      <button data-setting="size" data-val="xsmall" onclick="setSize('xsmall');updateDropdownState()" ${currentSize==='xsmall'?'class="active"':''} style="font-size:9px" aria-label="Extra small text">A</button>
      <button data-setting="size" data-val="small" onclick="setSize('small');updateDropdownState()" ${currentSize==='small'?'class="active"':''} aria-label="Small text">A</button>
      <button data-setting="size" data-val="medium" onclick="setSize('medium');updateDropdownState()" ${currentSize==='medium'?'class="active"':''} style="font-size:14px" aria-label="Medium text">A</button>
      <button data-setting="size" data-val="large" onclick="setSize('large');updateDropdownState()" ${currentSize==='large'?'class="active"':''} style="font-size:17px" aria-label="Large text">A</button>
      <button data-setting="size" data-val="xlarge" onclick="setSize('xlarge');updateDropdownState()" ${currentSize==='xlarge'?'class="active"':''} style="font-size:20px" aria-label="Extra large text">A</button>
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
    <hr style="border:none;border-top:1px solid var(--border);margin:12px 0 8px">
    <div class="setting-row">
      <button onclick="var p=document.querySelector('.settings-dropdown-panel');if(p)p.remove();var b=document.getElementById('aa-settings-btn');if(b)b.setAttribute('aria-expanded','false');showShortcutsModal()" style="flex:1;text-align:center"><svg class="icon icon-sm" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-keyboard"/></svg> Keyboard Shortcuts</button>
    </div>
  `;
  document.body.appendChild(panel);
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
  if (panel && !panel.contains(e.target) && !e.target.closest('#aa-settings-btn')) {
    panel.remove();
    var btn = document.getElementById('aa-settings-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
});

// ---- Full Settings Page ----
function showSettingsPage(scrollToSection) {
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
  function themeBtn(val, label) {
    return '<button class="' + (currentTheme === val ? 'active' : '') + '" onclick="setTheme(\'' + val + '\');showSettingsPage()">' + label + '</button>';
  }

  var html = '<div class="article-header"><h1>Settings</h1></div>';

  // ---- Display section ----
  html += '<div class="settings-section">';
  html += '<h2>Display</h2>';
  html += '<div class="settings-row"><label>Theme</label><div class="settings-btn-group">'
    + themeBtn('light', 'Light') + themeBtn('dark', 'Dark') + themeBtn('sepia', 'Sepia') + themeBtn('high-contrast', 'Hi-Con')
    + '</div></div>';
  html += '<div class="settings-row"><div><label>Article font &amp; layout</label><div class="settings-desc">Font, text size, line height, spacing, and content width</div></div>';
  html += '<button onclick="settingsOpenAa()" style="font-size:13px;padding:6px 14px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit;white-space:nowrap">Open Aa reader settings</button>';
  html += '</div>';
  html += '</div>';

  // ---- Open In section (Tauri only) ----
  html += '<div class="settings-section" id="settings-viewer-mode" style="display:none">';
  html += '<h2>Open In</h2>';
  html += '<div class="settings-row"><div><label>Viewer window</label><div class="settings-desc">Where PullRead opens when you click View Articles</div></div>';
  html += '<select id="sp-viewer-mode" onchange="settingsPageSaveViewerMode()">';
  html += '<option value="app">PullRead window</option>';
  html += '<option value="browser">Default browser</option>';
  html += '</select></div>';
  html += '<div class="settings-row"><div><label>Time format</label><div class="settings-desc">How times appear in the menu bar</div></div>';
  html += '<select id="sp-time-format" onchange="settingsPageSaveTimeFormat()">';
  html += '<option value="12h">12-hour (2:30 PM)</option>';
  html += '<option value="24h">24-hour (14:30)</option>';
  html += '</select></div>';
  html += '</div>';

  // ---- Feeds & Sync section (placeholder, loaded async) ----
  html += '<div class="settings-section" id="settings-feeds">';
  html += '<h2>Bookmarks &amp; Sync</h2>';
  html += '<p style="color:var(--muted);font-size:13px">Loading feed configuration...</p>';
  html += '</div>';

  // ---- Site Logins section (Tauri only) ----
  if (window.PR_TAURI) {
    html += '<div class="settings-section" id="settings-site-logins">';
    html += '<h2>Site Logins</h2>';
    html += '<p style="color:var(--muted);font-size:13px;margin-bottom:12px">Log in to sites for paywalled or authenticated content.</p>';
    html += '<div id="site-logins-list"><p style="color:var(--muted);font-size:12px">Loading\u2026</p></div>';
    html += '<div style="display:flex;gap:8px;margin-top:8px">';
    html += '<input type="text" id="site-login-domain" placeholder="Domain (e.g. medium.com, nytimes.com)" style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;font-family:inherit" onkeydown="if(event.key===\'Enter\')addSiteLogin()">';
    html += '<button class="btn-primary" onclick="addSiteLogin()" style="font-size:13px;padding:6px 14px">Log in</button>';
    html += '</div>';
    html += '</div>';
  }

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
  html += '<hr style="border:none;border-top:1px solid var(--border);margin:16px 0 12px">';
  html += '<div class="settings-row" style="gap:12px">';
  html += '<button id="reimport-all-btn" style="font-size:13px;padding:6px 16px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer" onclick="reimportAllArticles()"><svg class="icon icon-sm" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-cloud-download"/></svg>Reimport All Articles</button>';
  html += '</div>';
  html += '<div id="reimport-status" style="font-size:12px;color:var(--muted);padding-top:8px"></div>';
  html += '</div>';

  // ---- About section ----
  html += '<div class="settings-section" id="settings-about">';
  html += '<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">';
  html += '<img src="/icon-256.png" alt="Pull Read" style="width:64px;height:64px;border-radius:14px">';
  html += '<div><h2 style="margin:0">Pull Read</h2>';
  html += '<div style="color:var(--muted);font-size:13px;margin-top:2px">Sync articles to searchable markdown files.</div></div>';
  html += '</div>';
  html += '<div class="settings-row"><label>Version</label><span id="sp-version" style="color:var(--muted);font-size:13px">Checking\u2026</span></div>';
  html += '<div class="settings-row" style="gap:12px">';
  html += '<button id="sp-check-updates-btn" style="font-size:13px;padding:6px 16px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer" onclick="settingsCheckForUpdates()">Check for Updates</button>';
  html += '<span id="sp-update-status" style="font-size:12px;color:var(--muted);align-self:center"></span>';
  html += '</div>';
  html += '<div class="settings-row" style="gap:12px">';
  html += '<a href="https://pullread.com" target="_blank" rel="noopener" style="font-size:13px;color:var(--link)">pullread.com</a>';
  html += '<a href="/api/log" target="_blank" style="font-size:13px;color:var(--link)">View Logs</a>';
  html += '</div>';
  html += '<div class="settings-row"><span style="color:var(--muted);font-size:12px">\u00A9 A Little Drive LLC</span></div>';
  html += '</div>';

  content.innerHTML = html;
  document.getElementById('content-pane').scrollTop = 0;

  if (scrollToSection) {
    var target = document.getElementById(scrollToSection);
    if (target) setTimeout(function() { target.scrollIntoView({ behavior: 'smooth' }); }, 50);
  }

  // Load viewer mode setting (show section when running inside Tauri or always for server mode)
  if (serverMode) {
    fetch('/api/settings').then(function(r) { return r.json(); }).then(function(data) {
      var sec = document.getElementById('settings-viewer-mode');
      var sel = document.getElementById('sp-viewer-mode');
      if (sec && sel) {
        sel.value = data.viewerMode || 'app';
        sec.style.display = '';
      }
      var timeSel = document.getElementById('sp-time-format');
      if (timeSel) timeSel.value = data.timeFormat || '12h';
    }).catch(function() {});
  }

  // Load current version
  if (serverMode) {
    fetch('/api/check-updates').then(function(r) { return r.json(); }).then(function(data) {
      var el = document.getElementById('sp-version');
      if (el) el.textContent = data.currentVersion || 'unknown';
    }).catch(function() {
      var el = document.getElementById('sp-version');
      if (el) el.textContent = 'unknown';
    });
  }

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
      h += '<button onclick="revealOutputFolder()" style="white-space:nowrap;padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;cursor:pointer;font-family:inherit" title="Open in Finder">Reveal</button>';
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

      // Max age for feed entries
      h += '<div class="settings-row"><div><label>Max article age</label><div class="settings-desc">Skip feed entries older than this (0 = no limit)</div></div>';
      h += '<select id="sp-max-age">';
      var ages = [[0,'No limit'],[30,'30 days'],[90,'3 months'],[180,'6 months'],[365,'1 year']];
      for (var ai = 0; ai < ages.length; ai++) {
        h += '<option value="' + ages[ai][0] + '"' + (cfg.maxAgeDays === ages[ai][0] ? ' selected' : '') + '>' + ages[ai][1] + '</option>';
      }
      h += '</select></div>';

      // Feed list
      h += '<div style="margin-top:16px"><label style="font-size:13px;font-weight:500;margin-bottom:8px;display:block">Feeds (' + feedNames.length + ')</label>';
      if (feedNames.length > 0) {
        h += '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">';
        for (var fi = 0; fi < feedNames.length; fi++) {
          var fn = feedNames[fi];
          h += '<div id="feed-row-' + fi + '" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:' + (fi < feedNames.length - 1 ? '1px solid var(--border)' : 'none') + ';font-size:13px">'
            + '<div style="cursor:pointer;flex:1;min-width:0" onclick="settingsEditFeed(' + fi + ')" title="Click to edit"><div style="font-weight:500">' + escapeHtml(fn) + '</div><div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px">' + escapeHtml(feeds[fn]) + '</div></div>'
            + '<button onclick="settingsRemoveFeed(\'' + escapeHtml(fn.replace(/'/g, "\\'")) + '\')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:2px 6px" title="Remove">&times;</button>'
            + '</div>';
        }
        h += '</div>';
      }
      h += '<div style="display:flex;gap:8px;margin-top:10px">'
        + '<input type="text" id="sp-new-feed" placeholder="Paste bookmark feed URL or web address\u2026" style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;font-family:inherit" onkeydown="if(event.key===\'Enter\')settingsAddFeed()">'
        + '<button class="btn-primary" onclick="settingsAddFeed()" id="sp-add-feed-btn" style="font-size:13px;padding:6px 14px">Add</button>'
        + '<button onclick="settingsImportOPML()" style="font-size:13px;padding:6px 14px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit;white-space:nowrap">Import OPML\u2026</button>'
        + '</div>';
      h += '<div style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.6">'
        + 'Paste a bookmark feed URL from Instapaper, Pinboard, Raindrop, or Pocket. '
        + 'You can also subscribe to newsletters (Substack, Ghost, Buttondown) and blogs \u2014 just paste the web address.'
        + '</div>';
      h += '<div style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;padding:8px 10px;background:color-mix(in srgb, var(--fg) 4%, transparent);border-radius:6px;font-size:11px;color:var(--muted)">'
        + '<span style="flex-shrink:0">&#128196;</span>'
        + '<span>Bookmark services only sync articles you save. Newsletter and blog feeds save every post as a separate file, which can use significant disk space over time.</span>'
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

  // Load Site Logins
  if (window.PR_TAURI) {
    loadSiteLogins();
  }

  // Load TTS settings async
  if (serverMode) {
    fetch('/api/tts-settings').then(function(r) { return r.json(); }).then(function(data) {
      var sec = document.getElementById('settings-voice');
      if (!sec) return;
      var providers = [
        { id: 'kokoro', label: 'Kokoro — free, on-device' },
        { id: 'browser', label: 'Built-in Voice (Apple) — free' },
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
        h += settingsRenderVoiceOptions(prov, voices, data.voice);
        h += '</select></div>';
      }

      // Model / quality select
      if (data.models) {
        if (data.provider === 'kokoro') {
          h += '<div class="settings-row" id="sp-tts-model-row"><label>Quality</label>';
          if (data.model === 'kokoro-v1-q4') {
            h += '<span style="font-size:12px;color:#22c55e">&#10003; High quality</span>';
          } else {
            h += '<span style="font-size:12px">Standard <button onclick="spUpgradeKokoroQuality()" style="margin-left:8px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--link);font-size:11px;cursor:pointer;font-family:inherit">Upgrade</button> <span style="color:var(--muted);font-size:11px">Free &middot; 305MB</span></span>';
          }
          h += '<input type="hidden" id="sp-tts-model" value="' + escapeHtml(data.model || 'kokoro-v1-q8') + '">';
          h += '</div>';
        } else {
          h += '<div class="settings-row" id="sp-tts-model-row"><label>Model</label>';
          h += '<select id="sp-tts-model">';
          var models = data.models[data.provider] || [];
          for (var mi = 0; mi < models.length; mi++) {
            h += '<option value="' + models[mi].id + '"' + (data.model === models[mi].id ? ' selected' : '') + '>' + escapeHtml(models[mi].label) + '</option>';
          }
          h += '</select></div>';
        }
      }

      // API key for cloud providers
      var isCloud = data.provider === 'openai' || data.provider === 'elevenlabs';
      h += '<div class="settings-row" id="sp-tts-key-row" style="display:' + (isCloud ? 'flex' : 'none') + '"><div><label>API Key</label>';
      h += '<div class="settings-desc">' + (data.hasKey && isCloud ? '<span class="settings-status ok">Key saved</span>' : 'Required for cloud TTS') + '</div></div>';
      h += '<input type="password" id="sp-tts-key" placeholder="' + (data.hasKey && isCloud ? '••••••••' : 'Paste API key') + '" style="min-width:200px">';
      h += '</div>';

      // Kokoro status
      // Auto-play next podcast toggle
      h += '<div class="settings-row"><div><label>Auto-play next podcast</label><div class="settings-desc">When a podcast ends, automatically play the next one</div></div>';
      h += '<input type="checkbox" id="sp-podcast-autoplay"' + (podcastAutoplay ? ' checked' : '') + ' onchange="podcastAutoplay=this.checked;localStorage.setItem(\'pr-podcast-autoplay\',this.checked?\'1\':\'0\')">';
      h += '</div>';

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

    // Load LLM settings async (multi-provider)
    fetch('/api/settings').then(function(r) { return r.json(); }).then(function(data) {
      var sec = document.getElementById('settings-ai');
      if (!sec) return;
      var llm = data.llm || {};
      var defaultProv = llm.defaultProvider || 'apple';
      var provs = llm.providers || {};
      var appleAvailable = llm.appleAvailable || false;

      var providerList = [
        { id: 'apple', label: 'Apple Intelligence (on-device)' },
        { id: 'anthropic', label: 'Anthropic (Claude)' },
        { id: 'openai', label: 'OpenAI' },
        { id: 'gemini', label: 'Google Gemini' },
        { id: 'openrouter', label: 'OpenRouter' },
      ];
      var cloudProviders = [
        { id: 'anthropic', label: 'Anthropic (Claude)', placeholder: 'sk-ant-...' },
        { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
        { id: 'gemini', label: 'Google Gemini', placeholder: 'AIza...' },
        { id: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-...' },
      ];

      var h = '<h2>AI Summaries &amp; Tagging</h2>';
      h += '<p style="font-size:13px;color:var(--muted);margin-bottom:16px">Choose a provider for article summaries and auto-tagging.</p>';

      // Default provider selector
      h += '<div class="settings-row"><div><label>Provider</label>';
      h += '<div class="settings-desc">Used for summaries and auto-tagging</div></div>';
      h += '<select id="sp-llm-default" onchange="settingsPageLLMProviderChanged()">';
      for (var i = 0; i < providerList.length; i++) {
        var p = providerList[i];
        h += '<option value="' + p.id + '"' + (defaultProv === p.id ? ' selected' : '') + '>' + p.label + '</option>';
      }
      h += '</select></div>';

      // Apple Intelligence section
      h += '<div id="sp-llm-apple-info" style="display:' + (defaultProv === 'apple' ? 'block' : 'none') + ';padding:10px 12px;margin-top:8px;background:color-mix(in srgb, var(--fg) 4%, transparent);border-radius:8px;font-size:12px;color:var(--muted);line-height:1.6">';
      if (appleAvailable) {
        h += '<span class="settings-status ok">Apple Intelligence available</span> Runs on-device, no API key needed.';
      } else {
        h += 'Apple Intelligence requires macOS 26+ with Apple Silicon.';
      }
      h += '</div>';

      // One section per cloud provider — only the selected one is visible
      for (var ci = 0; ci < cloudProviders.length; ci++) {
        var cp = cloudProviders[ci];
        var pConfig = provs[cp.id] || {};
        var hasKey = pConfig.hasKey || false;
        var visible = defaultProv === cp.id;

        h += '<div id="sp-llm-section-' + cp.id + '" style="display:' + (visible ? 'block' : 'none') + ';margin-top:8px">';

        if (hasKey) {
          h += '<div style="font-size:12px;margin-bottom:8px"><span class="settings-status ok">Key saved</span></div>';
        }

        h += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">';
        h += '<label style="font-size:12px;min-width:55px;color:var(--muted)">API Key</label>';
        h += '<input type="password" id="sp-llm-key-' + cp.id + '" placeholder="' + (hasKey ? '••••••••' : cp.placeholder) + '" style="flex:1;min-width:0">';
        h += '</div>';

        h += '<div style="display:flex;gap:8px;align-items:center">';
        h += '<label style="font-size:12px;min-width:55px;color:var(--muted)">Model</label>';
        h += '<input type="text" id="sp-llm-model-' + cp.id + '" value="' + escapeHtml(pConfig.model || '') + '" placeholder="default" style="flex:1;min-width:0;font-size:12px">';
        h += '</div>';

        h += '</div>';
      }

      h += '<div class="settings-row" style="justify-content:flex-end;padding-top:12px">';
      h += '<button class="btn-primary" onclick="settingsPageSaveLLM()" style="font-size:13px;padding:6px 16px">Save</button>';
      h += '</div>';

      sec.innerHTML = h;
    }).catch(function() {
      var sec = document.getElementById('settings-ai');
      if (sec) sec.innerHTML = '<h2>AI Summaries &amp; Tagging</h2><p style="color:var(--muted);font-size:13px">Could not load AI settings. Configure in the menu bar app.</p>';
    });
  }
}

function settingsPageSaveViewerMode() {
  var mode = document.getElementById('sp-viewer-mode').value;
  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ viewerMode: mode }),
  });
}

function settingsPageSaveTimeFormat() {
  var fmt = document.getElementById('sp-time-format').value;
  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeFormat: fmt }),
  });
}

function settingsCheckForUpdates() {
  var btn = document.getElementById('sp-check-updates-btn');
  var status = document.getElementById('sp-update-status');
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Checking\u2026';
  fetch('/api/check-updates').then(function(r) { return r.json(); }).then(function(data) {
    if (btn) btn.disabled = false;
    if (!status) return;
    if (data.error) {
      status.textContent = data.error;
    } else if (data.updateAvailable) {
      status.innerHTML = 'v' + escapeHtml(data.latestVersion) + ' available \u2014 <a href="' + escapeHtml(data.releaseUrl) + '" target="_blank" style="color:var(--link)">View release</a>';
    } else {
      status.textContent = 'You\u2019re up to date.';
    }
  }).catch(function() {
    if (btn) btn.disabled = false;
    if (status) status.textContent = 'Could not check for updates.';
  });
}

function settingsOpenAa() {
  // Navigate to dashboard/last article so the Aa button is in context, then open the dropdown
  renderDashboard();
  setTimeout(function() { toggleSettingsDropdown(); }, 100);
}

function settingsPageLLMProviderChanged() {
  var selected = document.getElementById('sp-llm-default').value;
  var cloudProviders = ['anthropic', 'openai', 'gemini', 'openrouter'];
  var appleInfo = document.getElementById('sp-llm-apple-info');
  if (appleInfo) appleInfo.style.display = selected === 'apple' ? 'block' : 'none';
  for (var i = 0; i < cloudProviders.length; i++) {
    var sec = document.getElementById('sp-llm-section-' + cloudProviders[i]);
    if (sec) sec.style.display = cloudProviders[i] === selected ? 'block' : 'none';
  }
}

var KOKORO_VOICE_GROUPS = { af: 'American Female', am: 'American Male', bf: 'British Female', bm: 'British Male' };
function settingsRenderVoiceOptions(provider, voices, selectedVoice) {
  if (provider !== 'kokoro') {
    return voices.map(function(v) {
      return '<option value="' + v.id + '"' + (selectedVoice === v.id ? ' selected' : '') + '>' + escapeHtml(v.label) + '</option>';
    }).join('');
  }
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
    html += '<optgroup label="' + (KOKORO_VOICE_GROUPS[key] || key) + '">';
    for (var j = 0; j < groups[key].length; j++) {
      var v = groups[key][j];
      html += '<option value="' + v.id + '"' + (selectedVoice === v.id ? ' selected' : '') + '>' + escapeHtml(v.label) + '</option>';
    }
    html += '</optgroup>';
  }
  return html;
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
      voiceSelect.innerHTML = settingsRenderVoiceOptions(provider, data.voices[provider], '');
    } else if (voiceSelect) { voiceSelect.innerHTML = ''; }
    var modelRow = document.getElementById('sp-tts-model-row');
    if (modelRow && provider === 'kokoro') {
      var label = modelRow.querySelector('label');
      modelRow.innerHTML = '';
      if (label) modelRow.appendChild(label);
      modelRow.insertAdjacentHTML('beforeend',
        '<span style="font-size:12px">Standard <button onclick="spUpgradeKokoroQuality()" style="margin-left:8px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--link);font-size:11px;cursor:pointer;font-family:inherit">Upgrade</button> <span style="color:var(--muted);font-size:11px">Free &middot; 305MB</span></span>'
        + '<input type="hidden" id="sp-tts-model" value="kokoro-v1-q8">');
    } else if (modelSelect && data.models && data.models[provider]) {
      modelSelect.innerHTML = data.models[provider].map(function(m) {
        return '<option value="' + m.id + '">' + escapeHtml(m.label) + '</option>';
      }).join('');
    } else if (modelSelect) { modelSelect.innerHTML = ''; }
  }
}

function spUpgradeKokoroQuality() {
  var hidden = document.getElementById('sp-tts-model');
  if (hidden) hidden.value = 'kokoro-v1-q4';
  var row = document.getElementById('sp-tts-model-row');
  if (row) {
    var label = row.querySelector('label');
    row.innerHTML = '';
    if (label) row.appendChild(label);
    row.insertAdjacentHTML('beforeend',
      '<span style="font-size:12px;color:#22c55e">&#10003; High quality — save to apply</span>'
      + '<input type="hidden" id="sp-tts-model" value="kokoro-v1-q4">');
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

function settingsPageSaveLLM() {
  var defaultProvider = document.getElementById('sp-llm-default').value;
  var cloudProviders = ['anthropic', 'openai', 'gemini', 'openrouter'];
  var providers = {};

  for (var i = 0; i < cloudProviders.length; i++) {
    var p = cloudProviders[i];
    var keyInput = document.getElementById('sp-llm-key-' + p);
    var modelInput = document.getElementById('sp-llm-model-' + p);
    var entry = {};
    if (keyInput && keyInput.value) entry.apiKey = keyInput.value;
    if (modelInput && modelInput.value) entry.model = modelInput.value;
    if (Object.keys(entry).length > 0) providers[p] = entry;
  }

  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ defaultProvider: defaultProvider, providers: providers }),
  }).then(function(r) {
    if (r.ok) {
      llmProvider = defaultProvider;
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

function revealOutputFolder() {
  fetch('/api/reveal-folder', { method: 'POST' }).catch(function() {});
}

function settingsPageSaveConfig() {
  var outputPath = document.getElementById('sp-output-path').value.trim();
  var syncInterval = document.getElementById('sp-sync-interval').value;
  var cookies = document.getElementById('sp-cookies').checked;
  var maxAge = parseInt(document.getElementById('sp-max-age').value, 10) || 0;
  var sec = document.getElementById('settings-feeds');
  var cfg = sec ? sec._configData : {};
  var feeds = cfg.feeds || {};

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outputPath: outputPath, feeds: feeds, syncInterval: syncInterval, useBrowserCookies: cookies, maxAgeDays: maxAge })
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
  settingsPageSaveConfig();
}

function settingsRemoveFeed(name) {
  var sec = document.getElementById('settings-feeds');
  if (sec && sec._configData && sec._configData.feeds) {
    delete sec._configData.feeds[name];
  }
  settingsPageSaveConfig();
}

function settingsEditFeed(rowIndex) {
  var sec = document.getElementById('settings-feeds');
  if (!sec || !sec._configData) return;
  var feeds = sec._configData.feeds || {};
  var names = Object.keys(feeds);
  var name = names[rowIndex];
  if (name === undefined) return;
  var url = feeds[name];
  var row = document.getElementById('feed-row-' + rowIndex);
  if (!row) return;
  row.innerHTML = '<div style="flex:1;display:flex;flex-direction:column;gap:6px">'
    + '<input type="text" id="feed-edit-name-' + rowIndex + '" value="' + escapeHtml(name) + '" placeholder="Feed name" style="padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--fg);font-size:13px;font-family:inherit">'
    + '<input type="text" id="feed-edit-url-' + rowIndex + '" value="' + escapeHtml(url) + '" placeholder="Feed URL" style="padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--fg);font-size:12px;font-family:inherit">'
    + '<div style="display:flex;gap:6px">'
    + '<button class="btn-primary" onclick="settingsSaveEditFeed(' + rowIndex + ',\'' + escapeHtml(name.replace(/'/g, "\\'")) + '\')" style="font-size:12px;padding:4px 12px">Save</button>'
    + '<button onclick="showSettingsPage(\'settings-feeds\')" style="font-size:12px;padding:4px 12px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit">Cancel</button>'
    + '</div></div>';
  document.getElementById('feed-edit-name-' + rowIndex).focus();
}

function settingsSaveEditFeed(rowIndex, oldName) {
  var sec = document.getElementById('settings-feeds');
  if (!sec || !sec._configData) return;
  var newName = (document.getElementById('feed-edit-name-' + rowIndex).value || '').trim();
  var newUrl = (document.getElementById('feed-edit-url-' + rowIndex).value || '').trim();
  if (!newName || !newUrl) return;
  if (newName !== oldName) delete sec._configData.feeds[oldName];
  sec._configData.feeds[newName] = newUrl;
  settingsPageSaveConfig();
}

function settingsImportOPML() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.opml,.xml';
  input.onchange = function() {
    if (!input.files || !input.files[0]) return;
    var reader = new FileReader();
    reader.onload = function() {
      var doc = new DOMParser().parseFromString(reader.result, 'text/xml');
      var outlines = doc.querySelectorAll('outline[xmlUrl]');
      if (!outlines.length) { alert('No feeds found in this file.'); return; }
      var sec = document.getElementById('settings-feeds');
      if (!sec || !sec._configData) return;
      if (!sec._configData.feeds) sec._configData.feeds = {};
      var added = 0;
      for (var i = 0; i < outlines.length; i++) {
        var el = outlines[i];
        var url = el.getAttribute('xmlUrl');
        var name = el.getAttribute('text') || el.getAttribute('title') || url;
        if (!sec._configData.feeds[name]) {
          sec._configData.feeds[name] = url;
          added++;
        }
      }
      if (added === 0) { alert('All feeds already exist.'); return; }
      settingsPageSaveConfig();
    };
    reader.readAsText(input.files[0]);
  };
  input.click();
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

function reimportAllArticles() {
  var btn = document.getElementById('reimport-all-btn');
  var status = document.getElementById('reimport-status');

  // Fetch article count for confirmation
  fetch('/api/files').then(function(r) { return r.json(); }).then(function(files) {
    var count = files.length;
    if (!confirm('This will re-fetch all ' + count + ' articles from their original URLs. Continue?')) return;

    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
    if (status) status.textContent = 'Reimporting... 0/' + count;

    fetch('/api/reimport-all', { method: 'POST' }).then(function(response) {
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function read() {
        reader.read().then(function(result) {
          if (result.done) return;
          buffer += decoder.decode(result.value, { stream: true });

          var lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (!line.startsWith('data: ')) continue;
            try {
              var evt = JSON.parse(line.slice(6));
              if (evt.complete) {
                if (status) status.textContent = 'Done! ' + evt.succeeded + ' succeeded, ' + evt.failed + ' failed.';
                if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
                return;
              }
              if (status) status.textContent = 'Reimporting... ' + evt.done + '/' + evt.total + (evt.ok ? '' : ' (failed: ' + evt.current + ')');
            } catch(e) {}
          }
          read();
        });
      }
      read();
    }).catch(function(e) {
      if (status) status.textContent = 'Reimport failed: ' + e.message;
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    });
  });
}

// ---- Site Logins ----
async function loadSiteLogins() {
  var container = document.getElementById('site-logins-list');
  if (!container) return;
  try {
    var res = await fetch('/api/site-logins');
    var data = await res.json();
    if (!data.domains || data.domains.length === 0) {
      container.innerHTML = '<p style="color:var(--muted);font-size:12px">No site logins yet.</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < data.domains.length; i++) {
      var d = data.domains[i];
      html += '<div class="settings-row" style="padding:6px 0"><span style="font-size:13px">' + escapeHtml(d) + '</span>';
      html += '<button style="font-size:11px;padding:3px 10px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit" onclick="removeSiteLoginUI(\'' + escapeJsStr(d) + '\')">Log out</button></div>';
    }
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p style="color:var(--muted);font-size:12px">Could not load site logins.</p>';
  }
}

async function addSiteLogin() {
  var input = document.getElementById('site-login-domain');
  var domain = (input ? input.value : '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  if (!domain) { showToast('Enter a domain first'); return; }
  if (!domain || !domain.includes('.')) {
    showToast('Please enter a valid domain like medium.com');
    return;
  }
  try {
    await window.__TAURI__.core.invoke('open_site_login', { domain: domain });
    if (input) input.value = '';
    showToast('Log in, then click "Done \u2014 Save Login" when finished');
    // Poll for the login to complete (check if domain appears in list)
    var poll = setInterval(async function() {
      try {
        var res = await fetch('/api/site-logins');
        var data = await res.json();
        if (data.domains && data.domains.includes(domain)) {
          clearInterval(poll);
          loadSiteLogins();
          showToast('Logged in to ' + domain);
        }
      } catch(e) {}
    }, 2000);
    // Stop polling after 5 minutes
    setTimeout(function() { clearInterval(poll); }, 300000);
  } catch (e) {
    showToast('Failed to open login window: ' + e);
  }
}

async function removeSiteLoginUI(domain) {
  try {
    await fetch('/api/site-logins', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: domain })
    });
    loadSiteLogins();
    showToast('Logged out of ' + domain);
  } catch (e) {
    showToast('Failed to remove login: ' + e);
  }
}

