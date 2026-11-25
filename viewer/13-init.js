// ABOUTME: Application initialization, article list refresh, and one-time data migrations.
// ABOUTME: Handles sync status, auto-refresh polling, and restoring user preferences on load.

// ---- Sync Status ----
async function loadSyncStatus() {
  if (!serverMode) return;
  try {
    const res = await fetch('/api/sync-status');
    if (!res.ok) return;
    const data = await res.json();
    var btn = document.getElementById('refresh-btn');
    var parts = [];
    if (data.intervalMinutes) parts.push('Sync every ' + data.intervalMinutes + ' min');
    if (data.lastActivity) {
      var ago = Math.round((Date.now() - new Date(data.lastActivity).getTime()) / 60000);
      parts.push('Last activity: ' + (ago < 1 ? 'just now' : ago + ' min ago'));
    }
    if (data.articleCount) parts.push(data.articleCount + ' articles');
    if (btn && parts.length) btn.title = parts.join('\n');
  } catch {}
}

// The old one-time migration that copied frontmatter `annotation:` into article
// notes was retired: for ordinary feeds that field held the feed's description,
// not a note the reader wrote. The server now clears those copies once at
// startup (src/imported-notes.ts), and new articles store feed text as
// `description:`.

// Refresh article list from server
let _refreshInFlight = false;
let _refreshQueued = false;
async function refreshArticleList(silent) {
  if (!serverMode) return;
  // Re-entrance guard: if a refresh is already running, queue one follow-up
  if (_refreshInFlight) {
    _refreshQueued = true;
    return;
  }
  _refreshInFlight = true;
  const btn = document.getElementById('refresh-btn');
  if (!silent) btn.classList.add('spinning');
  try {
    const res = await fetch('/api/files');
    if (res.ok) {
      const prevCount = allFiles.length;
      const prevFilenames = new Set(allFiles.map(f => f.filename));
      allFiles = await res.json();
      allFiles.forEach(function(f) { if (f.title) f.title = stripTags(f.title); });
      filteredFiles = allFiles;
      await loadAnnotationsIndex();
      filterFiles();
      scheduleNavCounts();
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
        renderHub();
      }
    }
  } catch {}
  if (!silent) btn.classList.remove('spinning');
  _refreshInFlight = false;
  // If another refresh was requested while we were running, do one more
  if (_refreshQueued) {
    _refreshQueued = false;
    refreshArticleList(true);
  }
}

// Auto-refresh: poll lightweight /api/files-changed every 5s, full refresh only when files change
let _autoRefreshTimer = null;
let _lastKnownChangeAt = 0;
let _syncSpinTimeout = null;
let _wasSyncing = false;
function startAutoRefresh() {
  if (_autoRefreshTimer) return;
  _autoRefreshTimer = setInterval(async () => {
    try {
      // Poll sync progress
      var progressRes = await fetch('/api/sync-progress');
      if (progressRes.ok) {
        var progress = await progressRes.json();
        var btn = document.getElementById('refresh-btn');
        var statusEl = document.getElementById('sync-status');
        if (progress.status === 'syncing') {
          _wasSyncing = true;
          if (btn) {
            btn.classList.add('spinning');
            btn.title = 'Syncing ' + progress.feed + '... (' + progress.feedIndex + '/' + progress.totalFeeds + ')';
          }
          if (statusEl) {
            statusEl.textContent = 'Syncing ' + progress.feed + ' (' + progress.feedIndex + '/' + progress.totalFeeds + ')';
            statusEl.classList.add('visible');
          }
        } else if (_wasSyncing) {
          _wasSyncing = false;
          if (btn) btn.classList.remove('spinning');
          if (statusEl) statusEl.classList.remove('visible');
          loadSyncStatus();
          refreshArticleList(true);
        }
      }

      // Poll for file changes
      var res = await fetch('/api/files-changed');
      if (!res.ok) return;
      var data = await res.json();
      if (data.changedAt > _lastKnownChangeAt) {
        _lastKnownChangeAt = data.changedAt;
        if (!_wasSyncing) {
          var btn2 = document.getElementById('refresh-btn');
          if (btn2) btn2.classList.add('spinning');
          clearTimeout(_syncSpinTimeout);
          _syncSpinTimeout = setTimeout(function() {
            if (btn2) btn2.classList.remove('spinning');
            loadSyncStatus();
          }, 8000);
        }
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

  // Apply saved preferences (HTML defaults: light theme, Instrument Serif, medium size)
  if (savedTheme) {
    setTheme(savedTheme);
  }
  if (savedFont) {
    setFont(savedFont);
  }
  if (savedSize) setSize(savedSize);
  if (savedLeading && savedLeading !== 'default') setLineHeight(savedLeading);
  if (savedSpacing && savedSpacing !== 'default') setSpacing(savedSpacing);
  if (savedWidth && savedWidth !== 'default') setWidth(savedWidth);
  if (savedSidebar === '0') {
    document.getElementById('sidebar').classList.add('collapsed');
  }

  // Restore mini player mode
  if (localStorage.getItem('pr-mini-mode') === '1' && ttsQueue.length > 0) {
    setPlayerMode('mini');
  }

  // Restore focus mode
  if (localStorage.getItem('pr-focus') === '1') {
    focusModeActive = true;
    document.body.classList.add('focus-mode');
    document.getElementById('focus-btn').classList.add('active');
  }

  // Show Research nav when beta features enabled
  if (localStorage.getItem('pr-beta-features') === 'true') {
    var researchNav = document.getElementById('nav-research');
    if (researchNav) researchNav.style.display = '';
  }

  // Restore hide-read
  hideRead = localStorage.getItem('pr-hide-read') === '1';
  document.getElementById('hide-read-toggle').classList.toggle('active', hideRead);

  // Restore magic sort
  magicSort = localStorage.getItem('pr-magic-sort') === '1';
  document.getElementById('magic-sort-toggle').classList.toggle('active', magicSort);

  try {
    const res = await fetch('/api/files');
    if (res.ok) {
      allFiles = await res.json();
      allFiles.forEach(function(f) { if (f.title) f.title = stripTags(f.title); });
      serverMode = true;
      filteredFiles = allFiles;

      // Load annotations index, LLM config, and notebooks
      await Promise.all([loadAnnotationsIndex(), checkLLMConfig(), loadNotebooks()]);

      renderFileList();
      scheduleNavCounts();
      renderPinnedFilters();

      // Build bookmark feed names from config
      fetch('/api/config').then(function(r) { return r.ok ? r.json() : null; }).then(function(cfg) {
        if (!cfg || !cfg.feeds) return;
        _bookmarkFeedNames = new Set();
        for (var name in cfg.feeds) {
          if (isBookmarkServiceUrl(cfg.feeds[name])) _bookmarkFeedNames.add(name);
        }
      }).catch(function() {});

      // Load sync status in background
      loadSyncStatus();

      // Load TTS provider setting
      fetch('/api/tts-settings').then(function(r) { return r.ok ? r.json() : null; }).then(function(cfg) {
        if (!cfg) return;
        ttsProvider = cfg.provider || 'browser';
      }).catch(function() {});

      // Show dashboard instead of auto-loading first article. The dashboard
      // IS the Explore view, so keep the nav highlight in sync (#110) — the
      // static HTML default can be overridden by stale DOM state on reopen.
      renderHub();
      document.querySelectorAll('.sidebar-nav-item').forEach(function(item) {
        item.classList.toggle('active', item.dataset.nav === 'explore');
      });
      showOnboardingIfNeeded();
      // Seed the change tracker so first poll doesn't false-trigger
      fetch('/api/files-changed').then(function(r) { return r.ok ? r.json() : null; }).then(function(d) { if (d) _lastKnownChangeAt = d.changedAt; }).catch(function() {});
      startAutoRefresh();
      return;
    }
  } catch {}

  // Standalone mode - show drop hint
  filteredFiles = [];
  renderFileList();
  document.getElementById('file-count').textContent = 'Drop files or use pullread view';
}

// ---- Hash-based navigation (for tray menu and deep links) ----
function handleHashNavigation() {
  var hash = location.hash.slice(1);
  if (!hash) return;

  var params = {};
  hash.split('&').forEach(function(part) {
    var eq = part.indexOf('=');
    if (eq > 0) {
      params[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
    } else {
      params[part] = '';
    }
  });

  if ('tab' in params && params.tab === 'settings') {
    showSettingsPage();
    history.replaceState(null, '', location.pathname);
  } else if ('tab' in params && params.tab === 'ask') {
    renderAskPage();
    history.replaceState(null, '', location.pathname);
  } else if ('file' in params) {
    var idx = displayFiles.findIndex(function(f) { return f.filename === params.file; });
    if (idx >= 0) loadFile(idx);
    history.replaceState(null, '', location.pathname);
  } else if ('url' in params) {
    var idx = displayFiles.findIndex(function(f) { return f.url === params.url; });
    if (idx >= 0) loadFile(idx);
    history.replaceState(null, '', location.pathname);
  } else if ('notebook' in params) {
    var nb = _notebooks.find(function(n) { return n.id === params.notebook; });
    if (nb) openNotebook(nb.id);
    history.replaceState(null, '', location.pathname);
  }
}

window.addEventListener('hashchange', handleHashNavigation);

init().then(function() { handleHashNavigation(); }).catch(function() {});
