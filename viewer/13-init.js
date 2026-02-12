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
  document.getElementById('hide-read-toggle').classList.toggle('active', hideRead);

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
      fetch('/api/tts-settings').then(function(r) { return r.ok ? r.json() : null; }).then(function(cfg) {
        if (!cfg) return;
        ttsProvider = cfg.provider || 'browser';
        if (cfg.provider === 'kokoro') {
          fetch('/api/kokoro-preload', { method: 'POST' }).catch(function() {});
        }
      }).catch(function() {});

      // Show dashboard instead of auto-loading first article
      renderDashboard();
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

init();
