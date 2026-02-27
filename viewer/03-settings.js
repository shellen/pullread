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

function collapseSidebar() {
  var sidebar = document.getElementById('sidebar');
  sidebar.classList.add('collapsed');
  localStorage.setItem('pr-sidebar', '0');
}

function expandSidebar() {
  var sidebar = document.getElementById('sidebar');
  sidebar.classList.remove('collapsed');
  localStorage.setItem('pr-sidebar', '1');
}

function toggleSidebar() {
  var sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('collapsed')) expandSidebar();
  else collapseSidebar();
}

function toggleMobileSidebar() {
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  var isOpen = sidebar.classList.contains('mobile-open');
  if (isOpen) {
    closeMobileSidebar();
  } else {
    sidebar.classList.add('mobile-open');
    overlay.classList.add('visible');
  }
}

function closeMobileSidebar() {
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.remove('mobile-open');
  overlay.classList.remove('visible');
}

function openDrawer() {
  document.getElementById('drawer').classList.add('open');
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  var footerEl = document.getElementById('drawer-footer');
  if (footerEl) footerEl.style.display = 'none';
}

// Legacy alias
var toggleDrawer = toggleSidebar;

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
  const btn = document.querySelector('.toolbar-aa-btn');
  if (existing) { existing.remove(); if (btn) btn.setAttribute('aria-expanded', 'false'); return; }

  const currentTheme = document.body.getAttribute('data-theme') || 'light';
  const currentFont = localStorage.getItem('pr-font') || 'serif';
  const currentSize = localStorage.getItem('pr-size') || 'medium';
  const currentLeading = localStorage.getItem('pr-leading') || 'default';
  const currentSpacing = localStorage.getItem('pr-spacing') || 'default';
  const currentWidth = localStorage.getItem('pr-width') || 'default';

  var breakStatus = '';
  var breakInterval = parseInt(localStorage.getItem('pr-break-interval') || '0', 10);
  if (breakInterval > 0 && _breakSessionStart > 0) {
    var breakElapsed = (Date.now() - _breakSessionStart) / 60000;
    var breakRemaining = Math.max(0, Math.ceil(breakInterval - breakElapsed));
    breakStatus = '<div style="text-align:center;font-size:11px;color:var(--muted);padding:4px 0">Break in ' + breakRemaining + 'm</div>';
  }

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
    <div class="setting-row" style="position:relative">
      <button onclick="toggleFontPicker()" id="aa-font-picker" style="flex:1;text-align:left;display:flex;justify-content:space-between;align-items:center">${_fontLabels[currentFont]||'Serif'} <span style="opacity:0.5">\u25BE</span></button>
    </div>
    <label>Size</label>
    <div class="setting-row">
      <button data-setting="size" data-val="xsmall" onclick="setSize('xsmall');updateDropdownState()" ${currentSize==='xsmall'?'class="active"':''} style="font-size:9px" aria-label="Extra small text">A</button>
      <button data-setting="size" data-val="small" onclick="setSize('small');updateDropdownState()" ${currentSize==='small'?'class="active"':''} aria-label="Small text">A</button>
      <button data-setting="size" data-val="medium" onclick="setSize('medium');updateDropdownState()" ${currentSize==='medium'?'class="active"':''} style="font-size:14px" aria-label="Medium text">A</button>
      <button data-setting="size" data-val="large" onclick="setSize('large');updateDropdownState()" ${currentSize==='large'?'class="active"':''} style="font-size:17px" aria-label="Large text">A</button>
      <button data-setting="size" data-val="xlarge" onclick="setSize('xlarge');updateDropdownState()" ${currentSize==='xlarge'?'class="active"':''} style="font-size:20px" aria-label="Extra large text">A</button>
      <button data-setting="size" data-val="xxlarge" onclick="setSize('xxlarge');updateDropdownState()" ${currentSize==='xxlarge'?'class="active"':''} style="font-size:23px" aria-label="2X large text">A</button>
      <button data-setting="size" data-val="xxxlarge" onclick="setSize('xxxlarge');updateDropdownState()" ${currentSize==='xxxlarge'?'class="active"':''} style="font-size:26px" aria-label="3X large text">A</button>
    </div>
    <label>Line height</label>
    <div class="setting-row">
      <button data-setting="leading" data-val="default" onclick="setLineHeight('default');updateDropdownState()" ${currentLeading==='default'?'class="active"':''}>Default</button>
      <button data-setting="leading" data-val="compact" onclick="setLineHeight('compact');updateDropdownState()" ${currentLeading==='compact'?'class="active"':''}>Compact</button>
      <button data-setting="leading" data-val="relaxed" onclick="setLineHeight('relaxed');updateDropdownState()" ${currentLeading==='relaxed'?'class="active"':''}>Relaxed</button>
      <button data-setting="leading" data-val="loose" onclick="setLineHeight('loose');updateDropdownState()" ${currentLeading==='loose'?'class="active"':''}>Loose</button>
    </div>
    <label>Letter spacing</label>
    <div class="setting-row">
      <button data-setting="spacing" data-val="default" onclick="setSpacing('default');updateDropdownState()" ${currentSpacing==='default'?'class="active"':''}>Default</button>
      <button data-setting="spacing" data-val="wide" onclick="setSpacing('wide');updateDropdownState()" ${currentSpacing==='wide'?'class="active"':''}>Wide</button>
      <button data-setting="spacing" data-val="wider" onclick="setSpacing('wider');updateDropdownState()" ${currentSpacing==='wider'?'class="active"':''}>Wider</button>
    </div>
    <label>Content width</label>
    <div class="setting-row">
      <button data-setting="width" data-val="narrow" onclick="setWidth('narrow');updateDropdownState()" ${currentWidth==='narrow'?'class="active"':''}>Narrow</button>
      <button data-setting="width" data-val="default" onclick="setWidth('default');updateDropdownState()" ${currentWidth==='default'?'class="active"':''}>Default</button>
      <button data-setting="width" data-val="wide" onclick="setWidth('wide');updateDropdownState()" ${currentWidth==='wide'?'class="active"':''}>Wide</button>
    </div>
    <hr style="border:none;border-top:1px solid var(--border);margin:12px 0 8px">
    <div class="setting-row">
      <button onclick="var p=document.querySelector('.settings-dropdown-panel');if(p)p.remove();var b=document.querySelector('.toolbar-aa-btn');if(b)b.setAttribute('aria-expanded','false');showShortcutsModal()" style="flex:1;text-align:center"><svg class="icon icon-sm" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-keyboard"/></svg> Keyboard Shortcuts</button>
    </div>
    ${breakStatus}
  `;
  document.body.appendChild(panel);
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

var _fontLabels = {serif:'Serif',sans:'Sans-serif',system:'Charter',mono:'Monospace',inter:'Inter',lora:'Lora',literata:'Literata','source-serif':'Source Serif','work-sans':'Work Sans','instrument-serif':'Instrument Serif',opendyslexic:'OpenDyslexic'};
var _fontOptions = [['work-sans','Work Sans'],['instrument-serif','Instrument Serif'],['serif','Serif'],['sans','Sans-serif'],['system','Charter'],['mono','Monospace'],['inter','Inter'],['lora','Lora'],['literata','Literata'],['source-serif','Source Serif'],['opendyslexic','OpenDyslexic']];

var _fontFamilies = {
  'serif': 'Georgia, "Times New Roman", serif',
  'sans': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'system': 'Charter, "Bitstream Charter", serif',
  'mono': '"SF Mono", "Fira Code", monospace',
  'inter': 'Inter, -apple-system, sans-serif',
  'lora': 'Lora, Georgia, serif',
  'literata': 'Literata, Georgia, serif',
  'source-serif': '"Source Serif 4", Georgia, serif',
  'work-sans': '"Work Sans", -apple-system, sans-serif',
  'instrument-serif': '"Instrument Serif", Georgia, serif',
  'opendyslexic': 'OpenDyslexic, sans-serif'
};

function toggleFontPicker() {
  var current = localStorage.getItem('pr-font') || 'serif';
  settingsCustomSelect('aa-font-picker', _fontOptions, current, function(v) {
    setFont(v);
    var btn = document.getElementById('aa-font-picker');
    if (btn) btn.firstChild.textContent = _fontLabels[v] || v;
  });
}

function settingsActivateBtn(container, hiddenId, val) {
  var hidden = document.getElementById(hiddenId);
  if (hidden) hidden.value = val;
  var group = hidden ? hidden.previousElementSibling : null;
  if (group && (group.classList.contains('settings-btn-group') || group.classList.contains('pill-group'))) {
    group.querySelectorAll('button').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-val') === val);
    });
  }
}

function settingsSyncPreset(btn, val) {
  settingsBtnSelect(btn, 'sp-sync-interval', val);
  var custom = document.getElementById('sp-sync-custom');
  if (custom) custom.value = '';
}

function settingsSyncCustom(val) {
  val = normalizeSyncInterval(val.trim());
  var hidden = document.getElementById('sp-sync-interval');
  if (hidden) hidden.value = val || 'manual';
  var presets = document.getElementById('sp-sync-presets');
  if (presets) presets.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
}

function normalizeSyncInterval(s) {
  if (!s) return '';
  s = s.toLowerCase().replace(/\s+/g, '');
  var m = s.match(/^(\d+)\s*(m|min|mins|minutes?)$/);
  if (m) return m[1] + 'm';
  var h = s.match(/^(\d+)\s*(h|hr|hrs|hours?)$/);
  if (h) return h[1] + 'h';
  if (/^\d+$/.test(s)) return s + 'm';
  return s;
}

function settingsBtnSelect(btn, hiddenId, val) {
  var hidden = document.getElementById(hiddenId);
  if (hidden) hidden.value = val;
  btn.parentNode.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
}

function settingsCustomSelect(btnId, options, currentVal, onSelect) {
  var existing = document.getElementById(btnId + '-panel');
  if (existing) { existing.remove(); return; }
  var btn = document.getElementById(btnId);
  if (!btn) return;
  var panel = document.createElement('div');
  panel.id = btnId + '-panel';
  panel.className = 'settings-select-panel';
  panel.style.position = 'absolute';
  panel.style.top = (btn.offsetHeight + 2) + 'px';
  panel.style.left = '0';
  panel.style.right = '0';
  for (var i = 0; i < options.length; i++) {
    var opt = document.createElement('button');
    opt.textContent = options[i][1];
    opt.setAttribute('data-val', options[i][0]);
    if (options[i][0] === currentVal) opt.className = 'active';
    if (btnId === 'aa-font-picker' && _fontFamilies[options[i][0]]) {
      opt.style.fontFamily = _fontFamilies[options[i][0]];
    }
    opt.onclick = (function(val) {
      return function() {
        onSelect(val);
        var p = document.getElementById(btnId + '-panel');
        if (p) p.remove();
      };
    })(options[i][0]);
    panel.appendChild(opt);
  }
  btn.parentNode.appendChild(panel);
  var closeHandler = function(e) {
    if (!panel.contains(e.target) && e.target !== btn) {
      panel.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(function() { document.addEventListener('click', closeHandler); }, 0);
}

function updateDropdownState() {
  const panel = document.querySelector('.settings-dropdown-panel');
  if (!panel) return;
  const currentTheme = document.body.getAttribute('data-theme') || 'light';
  const currentSize = localStorage.getItem('pr-size') || 'medium';
  const currentLeading = localStorage.getItem('pr-leading') || 'default';
  const currentSpacing = localStorage.getItem('pr-spacing') || 'default';
  const currentWidth = localStorage.getItem('pr-width') || 'default';
  var settings = {theme: currentTheme, size: currentSize, leading: currentLeading, spacing: currentSpacing, width: currentWidth};
  for (var key in settings) {
    panel.querySelectorAll('[data-setting="' + key + '"]').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-val') === settings[key]);
    });
  }
}

// Close settings dropdown when clicking outside
document.addEventListener('click', function(e) {
  const panel = document.querySelector('.settings-dropdown-panel');
  if (panel && !panel.contains(e.target) && !e.target.closest('.toolbar-aa-btn')) {
    panel.remove();
    var btn = document.querySelector('.toolbar-aa-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
});

// ---- Full Settings Page ----
var _settingsActiveTab = 'general';
var _settingsTabMap = {
  'settings-sync': 'general',
  'settings-feeds': 'general',
  'settings-viewer-mode': 'general',
  'settings-sharing': 'general',
  'settings-voice': 'reading',
  'settings-ai': 'reading',
  'settings-breaks': 'reading',
  'settings-backup': 'advanced',
  'settings-site-logins': 'advanced',
  'settings-about': 'advanced',
};

function settingsSwitchTab(tabName) {
  _settingsActiveTab = tabName;
  document.querySelectorAll('.settings-view .seg-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
  });
  document.querySelectorAll('.settings-view .tab-panel').forEach(function(p) {
    p.classList.toggle('active', p.getAttribute('data-tab') === tabName);
  });
}

function settingsClearSave(input) {
  var indicator = input.parentNode.querySelector('.save-indicator');
  if (indicator) indicator.classList.remove('visible');
}

function settingsSaveMastodon(input) {
  var val = input.value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (val) localStorage.setItem('pr-mastodon-instance', val);
  else localStorage.removeItem('pr-mastodon-instance');
  var indicator = input.parentNode.querySelector('.save-indicator');
  if (indicator) indicator.classList.add('visible');
}

function settingsSaveBreakActivity(input) {
  localStorage.setItem('pr-break-activity', input.value);
  var indicator = input.parentNode.querySelector('.save-indicator');
  if (indicator) indicator.classList.add('visible');
}

function showSettingsPage(scrollToSection) {
  var prevActive = activeFile;
  activeFile = null;
  _activeNotebook = null;
  const content = document.getElementById('content');
  const empty = document.getElementById('empty-state');
  empty.style.display = 'none';
  content.style.display = 'block';
  content.classList.add('settings-view');
  document.title = 'Settings \u2014 PullRead';
  document.getElementById('margin-notes').innerHTML = '';
  var toc = document.getElementById('toc-container');
  if (toc) toc.innerHTML = '';
  var toolbar = document.getElementById('reader-toolbar');
  if (toolbar) toolbar.style.display = 'none';
  updateSidebarActiveState(prevActive);

  // Resolve deep-link to tab
  var targetTab = _settingsActiveTab;
  if (scrollToSection && _settingsTabMap[scrollToSection]) {
    targetTab = _settingsTabMap[scrollToSection];
  }

  var html = '';

  // Header
  html += '<div class="settings-header"><h1>Settings</h1></div>';

  // Segmented control
  html += '<div class="segmented-control-wrapper">';
  html += '<div class="segmented-control">';
  html += '<button class="seg-btn' + (targetTab === 'general' ? ' active' : '') + '" data-tab="general" onclick="settingsSwitchTab(\'general\')">General</button>';
  html += '<button class="seg-btn' + (targetTab === 'reading' ? ' active' : '') + '" data-tab="reading" onclick="settingsSwitchTab(\'reading\')">Reading</button>';
  html += '<button class="seg-btn' + (targetTab === 'advanced' ? ' active' : '') + '" data-tab="advanced" onclick="settingsSwitchTab(\'advanced\')">Advanced</button>';
  html += '</div></div>';

  html += '<div class="tab-content">';

  // ==== GENERAL TAB ====
  html += '<div class="tab-panel' + (targetTab === 'general' ? ' active' : '') + '" data-tab="general">';

  // -- Sync card (loaded async) --
  html += '<div class="card" id="settings-sync">';
  html += '<div class="card-title">Sync</div>';
  html += '<div class="card-desc">Output folder, sync schedule, and article age limits.</div>';
  html += '<p style="color:var(--muted);font-size:13px">Loading sync settings\u2026</p>';
  html += '</div>';

  // -- Open In card (Tauri/server only) --
  html += '<div class="card" id="settings-viewer-mode" style="display:none">';
  html += '<div class="card-title">Open In</div>';
  html += '<div class="setting-row">';
  html += '<div class="setting-label"><label>Viewer window</label><div class="setting-desc">Where PullRead opens when you click View Articles</div></div>';
  html += '<div class="setting-control"><div class="pill-group">';
  html += '<button class="pill active" data-val="app" onclick="settingsBtnSelect(this,\'sp-viewer-mode\',\'app\');settingsPageSaveViewerMode()">PullRead window</button>';
  html += '<button class="pill" data-val="browser" onclick="settingsBtnSelect(this,\'sp-viewer-mode\',\'browser\');settingsPageSaveViewerMode()">Default browser</button>';
  html += '</div><input type="hidden" id="sp-viewer-mode" value="app"></div>';
  html += '</div>';
  html += '<div class="setting-row">';
  html += '<div class="setting-label"><label>Time format</label><div class="setting-desc">How times appear in the menu bar</div></div>';
  html += '<div class="setting-control"><div class="pill-group">';
  html += '<button class="pill active" data-val="12h" onclick="settingsBtnSelect(this,\'sp-time-format\',\'12h\');settingsPageSaveTimeFormat()">12-hour</button>';
  html += '<button class="pill" data-val="24h" onclick="settingsBtnSelect(this,\'sp-time-format\',\'24h\');settingsPageSaveTimeFormat()">24-hour</button>';
  html += '</div><input type="hidden" id="sp-time-format" value="12h"></div>';
  html += '</div>';
  html += '</div>';

  // -- Notifications card --
  html += '<div class="card">';
  html += '<div class="card-title">Notifications</div>';
  html += '<div class="card-desc">PullRead sends notifications when syncs complete, articles are saved, and reviews are ready.</div>';
  html += '<div class="callout">';
  html += '<span style="flex-shrink:0;font-size:14px">&#9881;</span>';
  html += '<span>To change notification preferences, go to <strong style="color:var(--fg)">System Settings &rarr; Notifications &rarr; PullRead</strong>. You can enable or disable alerts, banners, and sounds there.</span>';
  html += '</div>';
  html += '</div>';

  // -- Sharing card --
  var mastodonInstance = localStorage.getItem('pr-mastodon-instance') || '';
  html += '<div class="card" id="settings-sharing">';
  html += '<div class="card-title">Sharing</div>';
  html += '<div class="setting-row">';
  html += '<div class="setting-label"><label>Mastodon instance</label><div class="setting-desc">Your Mastodon server (e.g., xoxo.zone, mastodon.social)</div></div>';
  html += '<div class="setting-control"><div class="input-wrap">';
  html += '<input type="text" id="sp-mastodon-instance" value="' + escapeHtml(mastodonInstance) + '" placeholder="mastodon.social" class="input-field" onfocus="settingsClearSave(this)" onblur="settingsSaveMastodon(this)">';
  html += '<span class="save-indicator">\u2713</span>';
  html += '</div></div>';
  html += '</div>';
  html += '</div>';

  html += '</div>'; // end general tab

  // ==== READING TAB ====
  html += '<div class="tab-panel' + (targetTab === 'reading' ? ' active' : '') + '" data-tab="reading">';

  // -- Voice Playback card (loaded async) --
  html += '<div class="card" id="settings-voice">';
  html += '<div class="card-title">Voice Playback</div>';
  html += '<div class="card-desc">Choose how articles are read aloud.</div>';
  html += '<p style="color:var(--muted);font-size:13px">Loading voice settings\u2026</p>';
  html += '</div>';

  // -- AI Summaries & Tagging card (loaded async) --
  html += '<div class="card" id="settings-ai">';
  html += '<div class="card-title">AI Summaries &amp; Tagging</div>';
  html += '<div class="card-desc">Choose a provider for article summaries and auto-tagging.</div>';
  html += '<p style="color:var(--muted);font-size:13px">Loading AI settings\u2026</p>';
  html += '</div>';

  // -- Reading Breaks card --
  var breakInterval = localStorage.getItem('pr-break-interval') || '0';
  var breakActivity = localStorage.getItem('pr-break-activity') || '';
  html += '<div class="card" id="settings-breaks">';
  html += '<div class="card-title">Reading Breaks</div>';
  html += '<div class="card-desc">Get a gentle reminder to take a break after reading for a while.</div>';
  var breakOpts = [['0','Off'],['10','10m'],['15','15m'],['20','20m'],['25','25m'],['30','30m']];
  html += '<div class="setting-row">';
  html += '<div class="setting-label"><label>Timer interval</label><div class="setting-desc">How long before suggesting a break</div></div>';
  html += '<div class="setting-control"><div class="pill-group">';
  for (var bi = 0; bi < breakOpts.length; bi++) {
    html += '<button class="pill' + (breakInterval === breakOpts[bi][0] ? ' active' : '') + '" onclick="settingsBtnSelect(this,\'sp-break-interval\',\'' + breakOpts[bi][0] + '\');localStorage.setItem(\'pr-break-interval\',\'' + breakOpts[bi][0] + '\');_breakSessionStart=0">' + breakOpts[bi][1] + '</button>';
  }
  html += '</div><input type="hidden" id="sp-break-interval" value="' + escapeHtml(breakInterval) + '"></div>';
  html += '</div>';
  html += '<div class="setting-row">';
  html += '<div class="setting-label"><label>Activity suggestion</label><div class="setting-desc">Leave blank for random suggestions</div></div>';
  html += '<div class="setting-control"><div class="input-wrap">';
  html += '<input type="text" id="sp-break-activity" value="' + escapeHtml(breakActivity) + '" placeholder="e.g. Take a walk, Play guitar" class="input-field" onfocus="settingsClearSave(this)" onblur="settingsSaveBreakActivity(this)">';
  html += '<span class="save-indicator">\u2713</span>';
  html += '</div></div>';
  html += '</div>';
  html += '<div style="padding:6px 0"><button onclick="showBreakReminder()" style="font-size:12px;padding:4px 12px;background:var(--sidebar-bg);color:var(--link);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit">Preview break reminder</button></div>';
  html += '</div>';

  html += '</div>'; // end reading tab

  // ==== ADVANCED TAB ====
  html += '<div class="tab-panel' + (targetTab === 'advanced' ? ' active' : '') + '" data-tab="advanced">';

  // -- Backup & Restore card --
  html += '<div class="card" id="settings-backup">';
  html += '<div class="card-title">Backup &amp; Restore</div>';
  html += '<div class="card-desc">Export your settings, highlights, notes, notebooks, and feed configuration.</div>';
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap">';
  html += '<button class="btn-primary" onclick="settingsBackup()" style="font-size:13px;padding:6px 16px">Download Backup</button>';
  html += '<button style="font-size:13px;padding:6px 16px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit" onclick="settingsRestore()">Restore from File\u2026</button>';
  html += '</div>';
  html += '<div id="backup-status" style="font-size:12px;color:var(--muted);padding-top:8px"></div>';
  html += '<hr style="border:none;border-top:1px solid var(--border);margin:16px 0 12px">';
  html += '<button id="reimport-all-btn" style="font-size:13px;padding:6px 16px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit" onclick="reimportAllArticles()"><svg class="icon icon-sm" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-cloud-download"/></svg>Reimport All Articles</button>';
  html += '<div id="reimport-status" style="font-size:12px;color:var(--muted);padding-top:8px"></div>';
  html += '</div>';

  // -- Site Logins card (Tauri only) --
  if (window.PR_TAURI) {
    html += '<div class="card" id="settings-site-logins">';
    html += '<div class="card-title">Site Logins</div>';
    html += '<div class="card-desc">Log in to sites for paywalled or authenticated content.</div>';
    html += '<div id="site-logins-list"><p style="color:var(--muted);font-size:12px">Loading\u2026</p></div>';
    html += '<div style="display:flex;gap:8px;margin-top:8px">';
    html += '<input type="text" id="site-login-domain" placeholder="Domain (e.g. medium.com, nytimes.com)" class="input-field" style="flex:1" onkeydown="if(event.key===\'Enter\')addSiteLogin()">';
    html += '<button class="btn-primary" onclick="addSiteLogin()" style="font-size:13px;padding:6px 14px">Log in</button>';
    html += '</div>';
    html += '</div>';
  }

  // -- About card --
  html += '<div class="card" id="settings-about">';
  html += '<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">';
  html += '<img src="/icon-256.png" alt="Pull Read" style="width:64px;height:64px;border-radius:14px">';
  html += '<div><div class="card-title" style="margin-bottom:2px">Pull Read</div>';
  html += '<div style="color:var(--muted);font-size:13px">Sync articles to searchable markdown files.</div></div>';
  html += '</div>';
  html += '<div class="setting-row">';
  html += '<div class="setting-label"><label>Version</label></div>';
  html += '<div class="setting-control"><span id="sp-version" style="color:var(--muted);font-size:13px"></span></div>';
  html += '</div>';
  html += '<div style="display:flex;gap:12px;flex-wrap:wrap;padding:8px 0">';
  html += '<a href="https://pullread.com" target="_blank" rel="noopener" style="font-size:13px;color:var(--link)">pullread.com</a>';
  html += '<a href="#" onclick="prOpenExternal(\'https://pullread.com/releases#v\' + (window._prCurrentVersion || \'0.4.0\'));return false" style="font-size:13px;color:var(--link)">What\'s New</a>';
  html += '<a href="/api/log" target="_blank" style="font-size:13px;color:var(--link)">View Logs</a>';
  html += '<button style="font-size:13px;padding:6px 16px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit" onclick="showTour()">Show Tour</button>';
  html += '</div>';
  html += '<div style="padding:4px 0"><span style="color:var(--muted);font-size:12px">\u00A9 A Little Drive LLC</span> <a href="#" onclick="prOpenExternal(\'mailto:support@alittledrive.com\');return false" style="font-size:12px;color:var(--muted);margin-left:12px">support@alittledrive.com</a></div>';
  html += '</div>';

  html += '</div>'; // end advanced tab
  html += '</div>'; // end tab-content

  // Footer
  html += '<div class="settings-footer" style="font-size:12px;color:var(--muted)">Pull Read \u2014 Read without the feed.</div>';

  content.innerHTML = html;
  _settingsActiveTab = targetTab;
  document.getElementById('content-scroll').scrollTop = 0;

  if (scrollToSection) {
    var target = document.getElementById(scrollToSection);
    if (target) setTimeout(function() { target.scrollIntoView({ behavior: 'smooth' }); }, 50);
  }

  // Load viewer mode setting (show section when running inside Tauri or always for server mode)
  if (serverMode) {
    fetch('/api/settings').then(function(r) { return r.json(); }).then(function(data) {
      var sec = document.getElementById('settings-viewer-mode');
      if (sec) {
        sec.style.display = '';
        settingsActivateBtn(sec, 'sp-viewer-mode', data.viewerMode || 'app');
        settingsActivateBtn(sec, 'sp-time-format', data.timeFormat || '12h');
      }
    }).catch(function() {});
  }

  // Load current version
  if (serverMode) {
    fetch('/api/check-updates').then(function(r) { return r.json(); }).then(function(data) {
      var el = document.getElementById('sp-version');
      if (el) el.textContent = data.currentVersion || 'unknown';
      if (data.currentVersion) window._prCurrentVersion = data.currentVersion;
    }).catch(function() {
      var el = document.getElementById('sp-version');
      if (el) el.textContent = 'unknown';
    });
  }

  // Load Sync config async
  if (serverMode) {
    fetch('/api/config').then(function(r) { return r.json(); }).then(function(cfg) {
      var sec = document.getElementById('settings-sync');
      if (!sec) return;

      var h = '<div class="card-title">Sync</div>';
      h += '<div class="card-desc">Output folder, sync schedule, and article age limits.</div>';

      // Output path
      h += '<div class="setting-row">';
      h += '<div class="setting-label"><label>Output Folder</label><div class="setting-desc">Where articles are saved as markdown</div></div>';
      h += '<div class="setting-control" style="display:flex;gap:8px;align-items:center">';
      h += '<input type="text" id="sp-output-path" value="' + escapeHtml(cfg.outputPath || '') + '" placeholder="~/Documents/PullRead" class="input-field">';
      h += '<button onclick="pickOutputFolder(\'sp-output-path\')" style="white-space:nowrap;padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;cursor:pointer;font-family:inherit">Choose\u2026</button>';
      h += '<button onclick="revealOutputFolder()" style="white-space:nowrap;padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;cursor:pointer;font-family:inherit" title="Open in Finder">Reveal</button>';
      h += '</div></div>';

      // Sync interval
      h += '<div class="setting-row">';
      h += '<div class="setting-label"><label>Auto-sync</label><div class="setting-desc">How often to check for new articles</div></div>';
      var intervals = [['30m','30m'],['1h','1h'],['4h','4h'],['12h','12h'],['manual','Manual']];
      var syncIsPreset = intervals.some(function(p) { return p[0] === cfg.syncInterval; });
      var syncCustom = !syncIsPreset && cfg.syncInterval ? cfg.syncInterval : '';
      h += '<div class="setting-control" style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">';
      h += '<div class="pill-group" id="sp-sync-presets">';
      for (var ii = 0; ii < intervals.length; ii++) {
        h += '<button class="pill' + (cfg.syncInterval === intervals[ii][0] ? ' active' : '') + '" data-val="' + intervals[ii][0] + '" onclick="settingsSyncPreset(this,\'' + intervals[ii][0] + '\')">' + intervals[ii][1] + '</button>';
      }
      h += '</div>';
      h += '<input type="text" id="sp-sync-custom" value="' + escapeHtml(syncCustom) + '" placeholder="e.g. 2h" style="width:52px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:12px;font-family:inherit;text-align:center" oninput="settingsSyncCustom(this.value)">';
      h += '</div><input type="hidden" id="sp-sync-interval" value="' + escapeHtml(cfg.syncInterval || '1h') + '">';
      h += '</div>';

      // Chrome cookies
      h += '<div class="setting-row">';
      h += '<div class="setting-label"><label>Chrome Cookies</label><div class="setting-desc">Use Chrome login cookies for paywalled sites (local only)</div></div>';
      h += '<div class="setting-control"><input type="checkbox" id="sp-cookies"' + (cfg.useBrowserCookies ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--link)"></div>';
      h += '</div>';

      // Max age
      h += '<div class="setting-row">';
      h += '<div class="setting-label"><label>Max article age</label><div class="setting-desc">Skip feed entries older than this (0 = no limit)</div></div>';
      var ages = [[0,'None'],[30,'30d'],[90,'3mo'],[180,'6mo'],[365,'1yr']];
      h += '<div class="setting-control"><div class="pill-group">';
      for (var ai = 0; ai < ages.length; ai++) {
        h += '<button class="pill' + (cfg.maxAgeDays === ages[ai][0] ? ' active' : '') + '" data-val="' + ages[ai][0] + '" onclick="settingsBtnSelect(this,\'sp-max-age\',\'' + ages[ai][0] + '\')">' + ages[ai][1] + '</button>';
      }
      h += '</div><input type="hidden" id="sp-max-age" value="' + (cfg.maxAgeDays || 0) + '"></div>';
      h += '</div>';

      // Save button
      h += '<div style="padding:8px 0 0;text-align:right">';
      h += '<button class="btn-primary" onclick="settingsPageSaveConfig()" style="font-size:13px;padding:6px 18px">Save</button>';
      h += '</div>';

      sec.innerHTML = h;
      sec._configData = cfg;
    }).catch(function() {
      var sec = document.getElementById('settings-sync');
      if (sec) {
        sec.innerHTML = '<div class="card-title">Sync</div><p style="color:var(--muted);font-size:13px">Could not load sync configuration.</p>';
      }
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
      var allVoices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
      var hasGoogle = allVoices.some(function(v) { return v.name.indexOf('Google') === 0; });
      var hasApple = allVoices.some(function(v) { return v.name.indexOf('Google') !== 0; });
      var providers = [
        { id: 'apple', label: 'Apple \u2014 free' },
        { id: 'google', label: 'Google \u2014 free' },
        { id: 'openai', label: 'OpenAI \u2014 premium' },
        { id: 'elevenlabs', label: 'ElevenLabs \u2014 premium' },
      ];
      var ttsShortLabels = {google:'Google',apple:'Apple',openai:'OpenAI',elevenlabs:'ElevenLabs'};
      var activeProv = data.provider || 'google';
      if (activeProv === 'browser') {
        var savedType = localStorage.getItem('pr-tts-browser-type');
        if (savedType === 'apple' || savedType === 'google') {
          activeProv = savedType;
        } else {
          activeProv = hasApple ? 'apple' : 'google';
        }
      }

      var h = '<div class="card-title">Voice Playback</div>';
      h += '<div class="card-desc">Choose how articles are read aloud.</div>';

      // Provider
      h += '<div class="setting-row">';
      h += '<div class="setting-label"><label>Provider</label></div>';
      h += '<div class="setting-control"><div class="pill-group" id="sp-tts-provider-btns">';
      for (var i = 0; i < providers.length; i++) {
        var pid = providers[i].id;
        var isUnavail = (pid === 'google' && !hasGoogle) || (pid === 'apple' && !hasApple);
        var cls = 'pill' + (activeProv === pid ? ' active' : '');
        if (isUnavail) cls += ' unavailable';
        var note = '';
        if (pid === 'google' && !hasGoogle) note = ' <span style="font-size:10px;opacity:0.7">(Chrome)</span>';
        if (pid === 'apple' && !hasApple) note = ' <span style="font-size:10px;opacity:0.7">(Safari/macOS)</span>';
        h += '<button class="' + cls + '" data-val="' + pid + '" onclick="settingsBtnSelect(this,\'sp-tts-provider\',\'' + pid + '\');settingsPageTTSChanged()">' + (ttsShortLabels[pid] || pid) + note + '</button>';
      }
      h += '</div><input type="hidden" id="sp-tts-provider" value="' + escapeHtml(activeProv) + '"></div>';
      h += '</div>';

      // Voice picker
      var prov = activeProv;
      var isBrowserProv = prov === 'google' || prov === 'apple';
      if (isBrowserProv) {
        var browserVoiceLabel = localStorage.getItem('pr-tts-browser-voice') || 'Default';
        h += '<div class="setting-row" id="sp-tts-voice-row" style="position:relative">';
        h += '<div class="setting-label"><label>Voice</label></div>';
        h += '<div class="setting-control">';
        h += '<button onclick="toggleTTSVoicePicker()" id="sp-tts-voice-btn" style="text-align:left;display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;cursor:pointer;font-family:inherit;min-width:160px">' + escapeHtml(browserVoiceLabel) + ' <span style="opacity:0.5">\u25BE</span></button>';
        h += '<input type="hidden" id="sp-tts-voice" value="">';
        h += '</div></div>';
      } else if (data.voices) {
        var voices = data.voices[prov] || [];
        var voiceLabel = data.voice || '';
        for (var vi = 0; vi < voices.length; vi++) { if (voices[vi].id === data.voice) { voiceLabel = voices[vi].label; break; } }
        h += '<div class="setting-row" id="sp-tts-voice-row" style="position:relative">';
        h += '<div class="setting-label"><label>Voice</label></div>';
        h += '<div class="setting-control">';
        h += '<button onclick="toggleTTSVoicePicker()" id="sp-tts-voice-btn" style="text-align:left;display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;cursor:pointer;font-family:inherit;min-width:160px">' + escapeHtml(voiceLabel || 'Select voice') + ' <span style="opacity:0.5">\u25BE</span></button>';
        h += '<input type="hidden" id="sp-tts-voice" value="' + escapeHtml(data.voice || '') + '">';
        h += '</div></div>';
      }

      // Randomize voices
      var randomizeOn = localStorage.getItem('pr-tts-randomize-voices') === '1';
      h += '<div class="setting-row" id="sp-tts-randomize-row" style="display:' + (isBrowserProv ? 'flex' : 'none') + '">';
      h += '<div class="setting-label"><label>Randomize voices</label><div class="setting-desc">Each source gets a consistent random voice</div></div>';
      h += '<div class="setting-control"><input type="checkbox" id="sp-tts-randomize"' + (randomizeOn ? ' checked' : '') + ' onchange="localStorage.setItem(\'pr-tts-randomize-voices\',this.checked?\'1\':\'0\')" style="width:18px;height:18px;accent-color:var(--link)"></div>';
      h += '</div>';

      // Model select (hidden for browser voice providers)
      if (data.models && !isBrowserProv) {
        h += '<div class="setting-row" id="sp-tts-model-row">';
        h += '<div class="setting-label"><label>Model</label></div>';
        var models = data.models[data.provider] || [];
        h += '<div class="setting-control"><div class="pill-group">';
        for (var mi = 0; mi < models.length; mi++) {
          h += '<button class="pill' + (data.model === models[mi].id ? ' active' : '') + '" data-val="' + models[mi].id + '" onclick="settingsBtnSelect(this,\'sp-tts-model\',\'' + models[mi].id + '\')">' + escapeHtml(models[mi].label) + '</button>';
        }
        h += '</div><input type="hidden" id="sp-tts-model" value="' + escapeHtml(data.model || '') + '"></div>';
        h += '</div>';
      }

      // API key for cloud providers
      var isCloud = data.provider === 'openai' || data.provider === 'elevenlabs';
      h += '<div class="setting-row" id="sp-tts-key-row" style="display:' + (isCloud ? 'flex' : 'none') + '">';
      h += '<div class="setting-label"><label>API Key</label>';
      h += '<div class="setting-desc">' + (data.hasKey && isCloud ? '<span class="settings-status ok">Key saved</span>' : 'Required for cloud TTS') + '</div></div>';
      h += '<div class="setting-control"><input type="password" id="sp-tts-key" placeholder="' + (data.hasKey && isCloud ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : 'Paste API key') + '" style="min-width:200px"></div>';
      h += '</div>';

      // Auto-play next
      h += '<div class="setting-row">';
      h += '<div class="setting-label"><label>Auto-play next</label><div class="setting-desc">Automatically play the next item when playback ends</div></div>';
      h += '<div class="setting-control"><div class="pill-group">';
      h += '<button class="pill' + (autoplayMode === 'off' ? ' active' : '') + '" data-val="off" onclick="settingsBtnSelect(this,null,\'off\');autoplayMode=\'off\';localStorage.setItem(\'pr-autoplay-mode\',\'off\')">Off</button>';
      h += '<button class="pill' + (autoplayMode === 'podcasts' ? ' active' : '') + '" data-val="podcasts" onclick="settingsBtnSelect(this,null,\'podcasts\');autoplayMode=\'podcasts\';localStorage.setItem(\'pr-autoplay-mode\',\'podcasts\')">Podcasts</button>';
      h += '<button class="pill' + (autoplayMode === 'everything' ? ' active' : '') + '" data-val="everything" onclick="settingsBtnSelect(this,null,\'everything\');autoplayMode=\'everything\';localStorage.setItem(\'pr-autoplay-mode\',\'everything\')">Everything</button>';
      h += '</div></div>';
      h += '</div>';

      // Voice hint
      var hasQualityVoices = allVoices.some(function(v) { return v.name.indexOf('(Premium)') !== -1 || v.name.indexOf('(Enhanced)') !== -1; });
      var showVoiceHint = isBrowserProv && prov === 'apple' && !hasQualityVoices;
      h += '<div id="sp-voice-hint" style="display:' + (showVoiceHint ? 'block' : 'none') + ';padding:8px 0">';
      h += '<div class="callout">Tip: Install better voices in System Settings &rarr; Accessibility &rarr; Spoken Content &rarr; Manage Voices</div>';
      h += '</div>';

      // Save button
      h += '<div style="padding:8px 0 0;text-align:right">';
      h += '<button class="btn-primary" onclick="settingsPageSaveTTS()" style="font-size:13px;padding:6px 18px">Save</button>';
      h += '</div>';

      sec.innerHTML = h;
      sec._ttsData = data;
      // Chrome loads voices asynchronously
      if (window.speechSynthesis && speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = function() {
          var btns = document.getElementById('sp-tts-provider-btns');
          if (!btns) return;
          var v = speechSynthesis.getVoices();
          var goog = v.some(function(x) { return x.name.indexOf('Google') === 0; });
          var appl = v.some(function(x) { return x.name.indexOf('Google') !== 0; });
          btns.querySelectorAll('button').forEach(function(b) {
            var val = b.getAttribute('data-val');
            if (val === 'google') b.classList.toggle('unavailable', !goog);
            if (val === 'apple') b.classList.toggle('unavailable', !appl);
          });
        };
      }
    }).catch(function() {
      var sec = document.getElementById('settings-voice');
      if (sec) sec.innerHTML = '<div class="card-title">Voice Playback</div><p style="color:var(--muted);font-size:13px">Could not load voice settings.</p>';
    });

    // Load LLM settings and model catalog concurrently
    Promise.all([
      fetch('/api/settings').then(function(r) { return r.json(); }),
      fetch('/api/models').then(function(r) { return r.json(); }).catch(function() { return {}; }),
    ]).then(function(results) {
      var data = results[0];
      var modelCatalog = results[1];
      var sec = document.getElementById('settings-ai');
      if (!sec) return;
      var llm = data.llm || {};
      var defaultProv = llm.defaultProvider || 'apple';
      var provs = llm.providers || {};
      var appleAvailable = llm.appleAvailable || false;

      var providerOrder = ['apple', 'anthropic', 'openai', 'gemini', 'openrouter'];
      var llmShortLabels = {apple:'Apple',anthropic:'Claude',openai:'OpenAI',gemini:'Gemini',openrouter:'OpenRouter'};
      var cloudProviders = [];
      for (var pi = 0; pi < providerOrder.length; pi++) {
        var pid = providerOrder[pi];
        if (pid === 'apple') continue;
        var catEntry = modelCatalog[pid] || {};
        cloudProviders.push({
          id: pid,
          label: catEntry.label || llmShortLabels[pid] || pid,
          placeholder: catEntry.keyPlaceholder || '',
          models: catEntry.models || [],
          defaultModel: catEntry.default || '',
        });
      }

      var h = '<div class="card-title">AI Summaries &amp; Tagging</div>';
      h += '<div class="card-desc">Choose a provider for article summaries and auto-tagging.</div>';

      // Provider selector
      h += '<div class="setting-row">';
      h += '<div class="setting-label"><label>Provider</label><div class="setting-desc">Used for summaries and auto-tagging</div></div>';
      h += '<div class="setting-control"><div class="pill-group">';
      for (var i = 0; i < providerOrder.length; i++) {
        var p = providerOrder[i];
        h += '<button class="pill' + (defaultProv === p ? ' active' : '') + '" data-val="' + p + '" onclick="settingsBtnSelect(this,\'sp-llm-default\',\'' + p + '\');settingsPageLLMProviderChanged()">' + (llmShortLabels[p] || p) + '</button>';
      }
      h += '</div><input type="hidden" id="sp-llm-default" value="' + escapeHtml(defaultProv) + '"></div>';
      h += '</div>';

      // Apple Intelligence
      h += '<div id="sp-llm-apple-info" style="display:' + (defaultProv === 'apple' ? 'block' : 'none') + '">';
      h += '<div class="callout' + (appleAvailable ? ' callout-success' : '') + '">';
      if (appleAvailable) {
        h += '<span class="settings-status ok">Apple Intelligence available</span> Runs on-device, no API key needed.';
      } else {
        h += 'Apple Intelligence requires macOS 26+ with Apple Silicon.';
      }
      h += '</div></div>';

      // Cloud provider sections
      for (var ci = 0; ci < cloudProviders.length; ci++) {
        var cp = cloudProviders[ci];
        var pConfig = provs[cp.id] || {};
        var hasKey = pConfig.hasKey || false;
        var visible = defaultProv === cp.id;
        var savedModel = pConfig.model || '';
        var isCustom = savedModel && cp.models.indexOf(savedModel) === -1;

        h += '<div id="sp-llm-section-' + cp.id + '" style="display:' + (visible ? 'block' : 'none') + ';margin-top:8px">';

        if (hasKey) {
          h += '<div style="font-size:12px;margin-bottom:8px"><span class="settings-status ok">Key saved</span></div>';
        }

        h += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">';
        h += '<label style="font-size:12px;min-width:55px;color:var(--muted)">API Key</label>';
        h += '<input type="password" id="sp-llm-key-' + cp.id + '" placeholder="' + (hasKey ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : cp.placeholder) + '" style="flex:1;min-width:0">';
        h += '</div>';

        h += '<div style="display:flex;gap:8px;align-items:center">';
        h += '<label style="font-size:12px;min-width:55px;color:var(--muted)">Model</label>';
        h += '<select id="sp-llm-model-' + cp.id + '" onchange="settingsPageModelChanged(\'' + cp.id + '\')" style="flex:1;min-width:0;font-size:12px;padding:6px 8px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px">';
        h += '<option value=""' + (!savedModel ? ' selected' : '') + '>' + escapeHtml(cp.defaultModel || 'default') + ' (default)</option>';
        for (var mi = 0; mi < cp.models.length; mi++) {
          var m = cp.models[mi];
          if (m === cp.defaultModel) continue;
          h += '<option value="' + escapeHtml(m) + '"' + (savedModel === m ? ' selected' : '') + '>' + escapeHtml(m) + '</option>';
        }
        h += '<option value="__custom"' + (isCustom ? ' selected' : '') + '>Custom\u2026</option>';
        h += '</select>';
        h += '</div>';

        h += '<div id="sp-llm-custom-' + cp.id + '" style="display:' + (isCustom ? 'flex' : 'none') + ';gap:8px;align-items:center;margin-top:6px">';
        h += '<label style="font-size:12px;min-width:55px;color:var(--muted)"></label>';
        h += '<input type="text" id="sp-llm-custom-input-' + cp.id + '" value="' + escapeHtml(isCustom ? savedModel : '') + '" placeholder="model-id" style="flex:1;min-width:0;font-size:12px">';
        h += '</div>';

        h += '</div>';
      }

      // Save button
      h += '<div style="padding:8px 0 0;text-align:right">';
      h += '<button class="btn-primary" onclick="settingsPageSaveLLM()" style="font-size:13px;padding:6px 18px">Save</button>';
      h += '</div>';

      sec.innerHTML = h;
    }).catch(function() {
      var sec = document.getElementById('settings-ai');
      if (sec) sec.innerHTML = '<div class="card-title">AI Summaries &amp; Tagging</div><p style="color:var(--muted);font-size:13px">Could not load AI settings.</p>';
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

function settingsOpenAa() {
  // Navigate to dashboard/last article so the Aa button is in context, then open the dropdown
  renderHub();
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

function settingsPageModelChanged(providerId) {
  var sel = document.getElementById('sp-llm-model-' + providerId);
  var customDiv = document.getElementById('sp-llm-custom-' + providerId);
  if (!sel || !customDiv) return;
  customDiv.style.display = sel.value === '__custom' ? 'flex' : 'none';
}

function getSystemVoiceOptions(type) {
  var synth = window.speechSynthesis;
  if (!synth) return [];
  var voices = synth.getVoices();
  if (type === 'google') {
    voices = voices.filter(function(v) { return v.name.indexOf('Google') === 0; });
  } else if (type === 'apple') {
    voices = voices.filter(function(v) { return v.name.indexOf('Google') !== 0; });
    var voiceQuality = function(name) {
      if (name.indexOf('(Premium)') !== -1) return 0;
      if (name.indexOf('(Enhanced)') !== -1) return 1;
      if (name.indexOf('Siri') !== -1) return 2;
      if (name === 'Alex') return 3;
      return 4;
    };
    voices.sort(function(a, b) { return voiceQuality(a.name) - voiceQuality(b.name); });
  }
  return voices.map(function(v) {
    var label = v.name;
    if (v.lang) label += ' (' + v.lang + ')';
    return [v.name, label];
  });
}

function toggleTTSVoicePicker() {
  var sec = document.getElementById('settings-voice');
  var data = sec ? sec._ttsData : null;
  var provider = document.getElementById('sp-tts-provider').value;

  var options, current;
  if (provider === 'google' || provider === 'apple') {
    options = getSystemVoiceOptions(provider);
    current = localStorage.getItem('pr-tts-browser-voice') || '';
  } else {
    if (!data || !data.voices) return;
    var voices = data.voices[provider] || [];
    current = document.getElementById('sp-tts-voice').value;
    options = voices.map(function(v) { return [v.id, v.label]; });
  }

  settingsCustomSelect('sp-tts-voice-btn', options, current, function(val) {
    if (provider === 'google' || provider === 'apple') {
      localStorage.setItem('pr-tts-browser-voice', val);
      var btn = document.getElementById('sp-tts-voice-btn');
      if (btn) btn.firstChild.textContent = val;
    } else {
      var hidden = document.getElementById('sp-tts-voice');
      if (hidden) hidden.value = val;
      var btn2 = document.getElementById('sp-tts-voice-btn');
      var label = val;
      var vList = data.voices[provider] || [];
      for (var i = 0; i < vList.length; i++) { if (vList[i].id === val) { label = vList[i].label; break; } }
      if (btn2) btn2.firstChild.textContent = label;
    }
  });
}

function settingsPageTTSChanged() {
  var provider = document.getElementById('sp-tts-provider').value;
  var sec = document.getElementById('settings-voice');
  var data = sec ? sec._ttsData : null;
  var keyRow = document.getElementById('sp-tts-key-row');
  var isCloud = provider === 'openai' || provider === 'elevenlabs';
  if (keyRow) keyRow.style.display = isCloud ? 'flex' : 'none';
  var voiceHint = document.getElementById('sp-voice-hint');
  if (voiceHint) {
    var showHint = provider === 'apple' && window.speechSynthesis &&
      !speechSynthesis.getVoices().some(function(v) { return v.name.indexOf('(Premium)') !== -1 || v.name.indexOf('(Enhanced)') !== -1; });
    voiceHint.style.display = showHint ? 'block' : 'none';
  }

  var randomizeRow = document.getElementById('sp-tts-randomize-row');
  var isBrowser = provider === 'google' || provider === 'apple';
  if (randomizeRow) randomizeRow.style.display = isBrowser ? 'flex' : 'none';

  // Update voice picker button label
  var voiceBtn = document.getElementById('sp-tts-voice-btn');
  if (isBrowser && voiceBtn) {
    var voiceOpts = getSystemVoiceOptions(provider);
    var savedVoice = localStorage.getItem('pr-tts-browser-voice') || '';
    if (voiceOpts.length === 0) {
      voiceBtn.firstChild.textContent = 'No voices available';
    } else {
      voiceBtn.firstChild.textContent = savedVoice || 'Default';
    }
  } else if (data && voiceBtn && data.voices && data.voices[provider]) {
    var voiceHidden = document.getElementById('sp-tts-voice');
    var voices = data.voices[provider];
    var firstVoice = voices.length > 0 ? voices[0] : null;
    if (firstVoice) {
      if (voiceHidden) voiceHidden.value = firstVoice.id;
      voiceBtn.firstChild.textContent = firstVoice.label;
    } else {
      if (voiceHidden) voiceHidden.value = '';
      voiceBtn.firstChild.textContent = 'No voices';
    }
  }

  // Update model row
  var modelRow = document.getElementById('sp-tts-model-row');
  if (modelRow && isBrowser) {
    modelRow.style.display = 'none';
  } else if (modelRow && data && data.models && data.models[provider]) {
    modelRow.style.display = '';
    var models = data.models[provider];
    var grp = '<div class="setting-label"><label>Model</label></div>';
    grp += '<div class="setting-control"><div class="pill-group">';
    for (var mi = 0; mi < models.length; mi++) {
      grp += '<button class="pill' + (mi === 0 ? ' active' : '') + '" data-val="' + models[mi].id + '" onclick="settingsBtnSelect(this,\'sp-tts-model\',\'' + models[mi].id + '\')">' + escapeHtml(models[mi].label) + '</button>';
    }
    grp += '</div><input type="hidden" id="sp-tts-model" value="' + (models.length > 0 ? models[0].id : '') + '"></div>';
    modelRow.innerHTML = grp;
  }
}

function settingsPageSaveTTS(skipRefresh) {
  var provider = document.getElementById('sp-tts-provider').value;
  var isBrowser = provider === 'google' || provider === 'apple';
  // Save google/apple as 'browser' server-side, store sub-type in localStorage
  var config = { provider: isBrowser ? 'browser' : provider };
  if (isBrowser) {
    localStorage.setItem('pr-tts-browser-type', provider);
  }

  if (!isBrowser) {
    var apiKey = document.getElementById('sp-tts-key').value;
    if (apiKey) { config.apiKey = apiKey; } else { config.preserveKey = true; }
    var voice = document.getElementById('sp-tts-voice');
    var model = document.getElementById('sp-tts-model');
    if (voice) config.voice = voice.value;
    if (model) config.model = model.value;
  }

  return fetch('/api/tts-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }).then(function(r) {
    if (r.ok) {
      ttsProvider = isBrowser ? 'browser' : provider;
      ttsQueue = [];
      ttsCurrentIndex = -1;
      if (ttsAudio) { ttsAudio.pause(); ttsAudio.src = ''; ttsAudio = null; }
      renderAudioPlayer();
      if (!skipRefresh) showSettingsPage();
    } else {
      alert('Failed to save voice settings.');
    }
  });
}

function settingsPageSaveLLM(skipRefresh) {
  var defaultProvider = document.getElementById('sp-llm-default').value;
  var cloudProviders = ['anthropic', 'openai', 'gemini', 'openrouter'];
  var providers = {};

  for (var i = 0; i < cloudProviders.length; i++) {
    var p = cloudProviders[i];
    var keyInput = document.getElementById('sp-llm-key-' + p);
    var modelSelect = document.getElementById('sp-llm-model-' + p);
    var customInput = document.getElementById('sp-llm-custom-input-' + p);
    var entry = {};
    if (keyInput && keyInput.value) entry.apiKey = keyInput.value;
    // Read model from dropdown, or from custom input if "Custom" selected
    var modelVal = '';
    if (modelSelect) {
      modelVal = modelSelect.value === '__custom' ? (customInput ? customInput.value.trim() : '') : modelSelect.value;
    }
    if (modelVal) entry.model = modelVal;
    if (Object.keys(entry).length > 0) providers[p] = entry;
  }

  return fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ defaultProvider: defaultProvider, providers: providers }),
  }).then(function(r) {
    if (r.ok) {
      llmProvider = defaultProvider;
      llmConfigured = true;
      if (!skipRefresh) showSettingsPage();
    } else {
      alert('Failed to save AI settings.');
    }
  });
}

function settingsPageSaveAll() {
  var saves = [];
  if (document.getElementById('sp-output-path')) saves.push(settingsPageSaveConfig(true));
  if (document.getElementById('sp-tts-provider')) saves.push(settingsPageSaveTTS(true));
  if (document.getElementById('sp-llm-default')) saves.push(settingsPageSaveLLM(true));
  // Save Mastodon instance (localStorage only, no server round-trip)
  var mastodonInput = document.getElementById('sp-mastodon-instance');
  if (mastodonInput) {
    var val = mastodonInput.value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (val) localStorage.setItem('pr-mastodon-instance', val);
    else localStorage.removeItem('pr-mastodon-instance');
  }
  if (saves.length === 0) { showSettingsPage(); return; }
  Promise.all(saves).then(function() {
    showSettingsPage();
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

function settingsPageSaveConfig(skipRefresh) {
  var outputPath = document.getElementById('sp-output-path').value.trim();
  var syncInterval = document.getElementById('sp-sync-interval').value;
  var cookies = document.getElementById('sp-cookies').checked;
  var maxAge = parseInt(document.getElementById('sp-max-age').value, 10) || 0;
  var sec = document.getElementById('settings-sync');
  var cfg = sec ? sec._configData : {};
  var feeds = cfg.feeds || {};

  return fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outputPath: outputPath, feeds: feeds, syncInterval: syncInterval, useBrowserCookies: cookies, maxAgeDays: maxAge })
  }).then(function(r) {
    if (r.ok) { if (!skipRefresh) showSettingsPage(); }
    else alert('Failed to save feed settings.');
  });
}

function settingsAddRecFeed(name, url) {
  var sec = document.getElementById('settings-feeds');
  if (sec && sec._configData) {
    if (!sec._configData.feeds) sec._configData.feeds = {};
    sec._configData.feeds[name] = url;
  }
  var pane = document.getElementById('content-scroll');
  var scrollPos = pane ? pane.scrollTop : 0;
  settingsPageSaveConfig().then(function() {
    if (pane) pane.scrollTop = scrollPos;
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

function settingsFilterFeeds(query) {
  var q = (query || '').toLowerCase().trim();
  var rows = document.querySelectorAll('.feed-row');
  var toggle = document.getElementById('feed-expand-toggle');
  if (!q) {
    // Restore collapse state
    for (var i = 0; i < rows.length; i++) {
      rows[i].style.display = rows[i].classList.contains('feed-row-hidden') ? 'none' : 'flex';
    }
    if (toggle) { toggle.style.display = ''; toggle.dataset.expanded = '0'; }
    return;
  }
  // Filter: show matching rows, hide expand toggle
  if (toggle) toggle.style.display = 'none';
  for (var j = 0; j < rows.length; j++) {
    var name = rows[j].getAttribute('data-feed-name') || '';
    var url = rows[j].getAttribute('data-feed-url') || '';
    rows[j].style.display = (name.indexOf(q) !== -1 || url.indexOf(q) !== -1) ? 'flex' : 'none';
  }
}

function toggleFeedList() {
  var hidden = document.querySelectorAll('.feed-row-hidden');
  var toggle = document.getElementById('feed-expand-toggle');
  if (!toggle) return;
  var expanded = toggle.dataset.expanded === '1';
  for (var i = 0; i < hidden.length; i++) {
    hidden[i].style.display = expanded ? 'none' : 'flex';
  }
  toggle.dataset.expanded = expanded ? '0' : '1';
  toggle.textContent = expanded ? ('Show ' + hidden.length + ' more feeds') : 'Show fewer';
}

function settingsRemoveFeed(name) {
  // Show inline confirmation
  var rows = document.querySelectorAll('.feed-row');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].getAttribute('data-feed-name') === name.toLowerCase()) {
      var row = rows[i];
      row.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:space-between;gap:8px">'
        + '<span style="font-size:13px">Remove <strong>' + escapeHtml(name) + '</strong>?</span>'
        + '<div style="display:flex;gap:6px">'
        + '<button onclick="settingsConfirmRemoveFeed(\'' + escapeHtml(name.replace(/'/g, "\\'")) + '\')" style="font-size:12px;padding:4px 12px;background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:inherit">Remove</button>'
        + '<button onclick="showSettingsPage(\'settings-feeds\')" style="font-size:12px;padding:4px 12px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit">Cancel</button>'
        + '</div></div>';
      break;
    }
  }
}

function settingsConfirmRemoveFeed(name) {
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

function settingsRetryFeed(name, feedUrl, rowIndex) {
  var row = document.getElementById('feed-row-' + rowIndex);
  var errDiv = row ? row.querySelector('div[style*="color:#dc2626"]') : null;
  if (errDiv) errDiv.innerHTML = '<span style="color:var(--muted)">Retrying\u2026</span>';
  fetch('/api/retry-feed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, url: feedUrl })
  }).then(function(r) { return r.json(); }).then(function(result) {
    if (result.ok) {
      if (errDiv) errDiv.remove();
      showToast(name + ': OK (' + result.entries + ' entries)');
    } else {
      if (errDiv) errDiv.innerHTML = '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(result.error || 'Retry failed') + '</span>';
      showToast(name + ': still failing');
    }
  }).catch(function() {
    if (errDiv) errDiv.innerHTML = '<span>Retry failed</span>';
  });
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

