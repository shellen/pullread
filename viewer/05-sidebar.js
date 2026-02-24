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

  const searchTerm = (document.getElementById('search').value || '').trim().toLowerCase();

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
    // Notebook tab: + New Note button, individual notes, annotated articles
    html += '<div class="sidebar-new-note"><button class="new-note-btn" onclick="createNote()"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-plus"/></svg> New Note</button></div>';
    var nbObj = _notebooks[SINGLE_NOTEBOOK_ID];
    var notes = nbObj ? (nbObj.notes || []) : [];
    // Filter notes by search term
    if (searchTerm) {
      notes = notes.filter(function(n) {
        var text = (n.content || '').toLowerCase();
        return text.includes(searchTerm);
      });
    }
    for (var ni = 0; ni < notes.length; ni++) {
      html += renderNoteItem(notes[ni], ni);
    }
    // Annotated articles below notes
    const annotatedFiles = displayFiles.filter(f => {
      const { hasHl, hasNote } = hasAnnotations(f.filename);
      return hasHl || hasNote;
    });
    if (annotatedFiles.length) {
      html += '<div class="sidebar-section-label">Annotated Articles</div>';
      displayedCount = Math.min(annotatedFiles.length, PAGE_SIZE);
      html += annotatedFiles.slice(0, displayedCount).map(f => renderFileItem(f, displayFiles.indexOf(f))).join('');
    }
    var totalNotes = nbObj ? (nbObj.notes || []).length : 0;
    countStr = totalNotes + ' note' + (totalNotes !== 1 ? 's' : '');
    countText.textContent = countStr;
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
  const isPodcast = !!(f.enclosureUrl && f.enclosureType && f.enclosureType.startsWith('audio/'));
  let indicators = '';
  if (hasHl || hasNote || hasSummary || isFavorite || isPodcast) {
    indicators = '<div class="file-item-indicators">'
      + (isFavorite ? '<span class="dot dot-favorite" aria-label="Favorite"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-heart"/></svg></span>' : '')
      + (isPodcast ? '<span class="dot dot-podcast" aria-label="Podcast"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-headphones"/></svg></span>' : '')
      + (hasHl ? '<span class="dot dot-highlight" aria-label="Has highlights"></span>' : '')
      + (hasNote ? '<span class="dot dot-note" aria-label="Has annotations"></span>' : '')
      + (hasSummary ? '<span class="dot dot-summary" aria-label="Has summary"></span>' : '')
      + '</div>';
  }

  const favicon = f.domain && f.domain !== 'pullread'
    ? '<img class="file-item-favicon" src="/favicons/' + encodeURIComponent(f.domain) + '.png" alt="" loading="lazy" onerror="this.style.display=\'none\'" aria-hidden="true">'
    : '';

  const metaParts = [];
  if (date) metaParts.push('<span>' + date + '</span>');
  if (f.domain) metaParts.push('<span>' + escapeHtml(f.domain) + '</span>');
  if (f.feed && f.domain && !feedMatchesDomain(f.feed, f.domain)) {
    metaParts.push('<span class="feed-via">via ' + escapeHtml(f.feed) + '</span>');
  }
  const metaHtml = metaParts.join('<span class="meta-sep"></span>');

  const srcColor = sourceColor(f.feed || f.domain);

  return '<div class="file-item' + isActive + (isRead && !isActive ? ' read' : '') + '" data-index="' + i + '" data-filename="' + escapeHtml(f.filename) + '" onclick="loadFile(' + i + ')" role="option" aria-selected="' + (activeFile === f.filename) + '" tabindex="0" onkeydown="if(event.key===\'Enter\')loadFile(' + i + ')" style="border-left-color:' + srcColor + '">'
    + '<div class="file-item-title">' + escapeHtml(f.title) + '</div>'
    + '<div class="file-item-meta">' + metaHtml + favicon + '</div>'
    + indicators
    + '</div>';
}

function renderNoteItem(note, index) {
  var isActive = _activeNoteId === note.id ? ' active' : '';
  var firstLine = (note.content || '').split('\n')[0].replace(/^#+\s*/, '').trim() || 'Empty note';
  var dateStr = note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : '';
  var metaParts = [];
  if (dateStr) metaParts.push('<span>' + dateStr + '</span>');
  if (note.sourceArticle) {
    var srcFile = allFiles.find(function(f) { return f.filename === note.sourceArticle; });
    var domain = srcFile ? srcFile.domain : '';
    if (domain) metaParts.push('<span>' + escapeHtml(domain) + '</span>');
  }
  var metaHtml = metaParts.join('<span class="meta-sep"></span>');
  return '<div class="file-item note-item' + isActive + '" data-note-id="' + escapeHtml(note.id) + '" onclick="openNoteInPane(\'' + escapeHtml(note.id) + '\')" role="option" tabindex="0" onkeydown="if(event.key===\'Enter\')openNoteInPane(\'' + escapeHtml(note.id) + '\')">'
    + '<div class="file-item-title">' + escapeHtml(firstLine.slice(0, 120)) + '</div>'
    + '<div class="file-item-meta">' + metaHtml + '</div>'
    + '</div>';
}

// Toggle active/read classes on old and new sidebar items without rebuilding the list
function updateSidebarActiveState(prevFilename) {
  if (prevFilename) {
    var prevEl = document.querySelector('.file-item[data-filename="' + CSS.escape(prevFilename) + '"]');
    if (prevEl) {
      prevEl.classList.remove('active');
      prevEl.setAttribute('aria-selected', 'false');
      if (readArticles.has(prevFilename)) prevEl.classList.add('read');
    }
  }
  if (activeFile) {
    var nextEl = document.querySelector('.file-item[data-filename="' + CSS.escape(activeFile) + '"]');
    if (nextEl) {
      nextEl.classList.add('active');
      nextEl.classList.remove('read');
      nextEl.setAttribute('aria-selected', 'true');
    }
  }
  // Also handle note items
  document.querySelectorAll('.note-item.active').forEach(function(el) { el.classList.remove('active'); });
  if (_activeNoteId) {
    var noteEl = document.querySelector('.note-item[data-note-id="' + CSS.escape(_activeNoteId) + '"]');
    if (noteEl) noteEl.classList.add('active');
  }
}

// Rebuild only the indicator dots for a single sidebar item
function updateSidebarItem(filename) {
  if (!filename) return;
  var el = document.querySelector('.file-item[data-filename="' + CSS.escape(filename) + '"]');
  if (!el) return;
  var f = allFiles.find(function(af) { return af.filename === filename; });
  if (!f) return;
  var { hasHl, hasNote, isFavorite } = hasAnnotations(filename);
  var hasSummary = f.hasSummary;
  var isPodcast = !!(f.enclosureUrl && f.enclosureType && f.enclosureType.startsWith('audio/'));
  var existing = el.querySelector('.file-item-indicators');
  if (hasHl || hasNote || hasSummary || isFavorite || isPodcast) {
    var html = '<div class="file-item-indicators">'
      + (isFavorite ? '<span class="dot dot-favorite" aria-label="Favorite"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-heart"/></svg></span>' : '')
      + (isPodcast ? '<span class="dot dot-podcast" aria-label="Podcast"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-headphones"/></svg></span>' : '')
      + (hasHl ? '<span class="dot dot-highlight" aria-label="Has highlights"></span>' : '')
      + (hasNote ? '<span class="dot dot-note" aria-label="Has annotations"></span>' : '')
      + (hasSummary ? '<span class="dot dot-summary" aria-label="Has summary"></span>' : '')
      + '</div>';
    if (existing) {
      existing.outerHTML = html;
    } else {
      el.insertAdjacentHTML('beforeend', html);
    }
  } else if (existing) {
    existing.remove();
  }
}

// Debounced renderFileList for background triggers (sync polls, etc.)
var _renderPending = false;
function scheduleRenderFileList() {
  if (_renderPending) return;
  _renderPending = true;
  requestAnimationFrame(function() {
    _renderPending = false;
    renderFileList();
  });
}

function toggleHideRead() {
  hideRead = !hideRead;
  localStorage.setItem('pr-hide-read', hideRead ? '1' : '0');
  document.getElementById('hide-read-toggle').classList.toggle('active', hideRead);
  renderFileList();
}

// Debounced localStorage write for read articles
var _markAsReadTimer = null;
function _flushReadArticles() {
  localStorage.setItem('pr-read-articles', JSON.stringify(Array.from(readArticles)));
}

function markAsRead(filename) {
  readArticles.add(filename);
  if (readArticles.size > 5000) {
    var arr = Array.from(readArticles);
    readArticles = new Set(arr.slice(arr.length - 5000));
  }
  clearTimeout(_markAsReadTimer);
  _markAsReadTimer = setTimeout(_flushReadArticles, 2000);
}

function markCurrentAsUnread() {
  if (!activeFile) return;
  readArticles.delete(activeFile);
  clearTimeout(_markAsReadTimer);
  _markAsReadTimer = setTimeout(_flushReadArticles, 2000);
  renderFileList();
}

window.addEventListener('beforeunload', function() {
  if (_markAsReadTimer) _flushReadArticles();
});

function clearSearch() {
  var input = document.getElementById('search');
  if (input) { input.value = ''; input.focus(); }
  filterFiles();
}

function searchByAuthor(authorName) {
  var input = document.getElementById('search');
  if (!input) return;
  input.value = 'author:' + authorName;
  filterFiles();
  // Switch to articles tab if not already there
  var articlesTab = document.querySelector('.sidebar-tab[data-tab="articles"]');
  if (articlesTab) articlesTab.click();
}

function filterFiles() {
  const raw = document.getElementById('search').value.trim();
  var clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.style.display = raw ? 'block' : 'none';
  var pinBtn = document.getElementById('search-pin');
  if (pinBtn) pinBtn.style.display = raw ? 'block' : 'none';
  updatePinnedFilterActive();
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
        // Operator: is:podcast / has:audio
        if (tl === 'is:podcast' || tl === 'has:audio') return !!(f.enclosureUrl && f.enclosureType && f.enclosureType.startsWith('audio/'));
        // Operator: is:epub / is:book
        if (tl === 'is:epub' || tl === 'is:book') return f.domain === 'epub';
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
        // Use accent-folded comparison so "cafe" matches "café" etc.
        var folded = foldAccents(t);
        return foldAccents(f.title).includes(folded) ||
          foldAccents(f.domain).includes(folded) ||
          foldAccents(f.feed).includes(folded) ||
          (notes?.tags || []).some(tg => foldAccents(tg).includes(folded)) ||
          (notes?.machineTags || []).some(tg => foldAccents(tg).includes(folded));
      });
    });
  });

  renderFileList();
}

var _loadFileAbort = null;

async function loadFile(index) {
  const file = displayFiles[index];
  if (!file) return;
  if (_breakSessionStart === 0) _breakSessionStart = Date.now();
  _sidebarView = 'home'; syncSidebarTabs();
  var prevActive = activeFile;
  activeFile = file.filename;
  markAsRead(file.filename);
  updateSidebarActiveState(prevActive);
  removeHlToolbar();

  // Auto-close drawer on mobile after selecting an article
  if (window.innerWidth <= 768) {
    const drawer = document.getElementById('drawer');
    if (!drawer.classList.contains('collapsed')) drawer.classList.add('collapsed');
  }

  // Dropped files store content in memory — render directly without a server fetch
  if (file._content) {
    renderArticle(file._content, file.filename);
    return;
  }

  if (serverMode) {
    // Abort any in-flight article fetch so stale responses don't overwrite
    if (_loadFileAbort) _loadFileAbort.abort();
    var controller = new AbortController();
    _loadFileAbort = controller;
    var targetFile = file.filename;

    // Load annotations first so favorite state is available for header render
    await preloadAnnotations(file.filename);
    if (activeFile !== targetFile) return;

    try {
      const res = await fetch('/api/file?name=' + encodeURIComponent(file.filename), { signal: controller.signal });
      if (activeFile !== targetFile) return;
      if (res.ok) {
        const text = await res.text();
        if (activeFile !== targetFile) return;
        renderArticle(text, file.filename);
        applyHighlights();
        renderNotesPanel();
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      throw e;
    }
  }
}

// Navigate to next (+1) or previous (-1) article with wrapping
function navigateArticle(direction) {
  if (!displayFiles.length) return;
  var interval = parseInt(localStorage.getItem('pr-break-interval') || '0', 10);
  if (interval > 0 && _breakSessionStart > 0) {
    var elapsed = (Date.now() - _breakSessionStart) / 60000;
    if (elapsed >= interval) {
      var currentIdx = displayFiles.findIndex(f => f.filename === activeFile);
      _breakPendingDirection = direction;
      if (direction > 0) {
        _breakPendingIndex = currentIdx < displayFiles.length - 1 ? currentIdx + 1 : 0;
      } else {
        _breakPendingIndex = currentIdx > 0 ? currentIdx - 1 : displayFiles.length - 1;
      }
      showBreakReminder();
      return;
    }
  }
  const cidx = displayFiles.findIndex(f => f.filename === activeFile);
  let next;
  if (direction > 0) {
    next = cidx < displayFiles.length - 1 ? cidx + 1 : 0;
  } else {
    next = cidx > 0 ? cidx - 1 : displayFiles.length - 1;
  }
  loadFile(next);
  const el = document.querySelector('.file-item[data-index="' + next + '"]');
  if (el) el.scrollIntoView({ block: 'nearest' });
}


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


// ---- Quick-add URL ----
function toggleQuickAdd() {
  var row = document.getElementById('quick-add-row');
  if (!row) return;
  var visible = row.style.display !== 'none';
  row.style.display = visible ? 'none' : 'flex';
  if (!visible) {
    var input = document.getElementById('quick-add-input');
    if (input) { input.value = ''; input.focus(); }
  }
}

function quickAddUrl() {
  var input = document.getElementById('quick-add-input');
  var url = (input.value || '').trim();
  if (!url) return;
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  var btn = document.getElementById('quick-add-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }
  fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url })
  }).then(function(r) {
    if (r.ok) {
      input.value = '';
      document.getElementById('quick-add-row').style.display = 'none';
      refreshArticleList();
    } else {
      alert('Failed to save URL.');
    }
  }).catch(function() {
    alert('Could not connect to server.');
  }).finally(function() {
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  });
}

// ---- Sidebar nav view switching ----
let _sidebarView = 'home';

function switchSidebarView(view) {
  _sidebarView = view;
  syncSidebarTabs();

  if (view === 'notebooks') { openSingleNotebook(); }
  else if (view === 'home') goHome();
}

function openSingleNotebook() {
  getOrCreateSingleNotebook().then(function(nb) {
    openNotebookInPane(nb.id);
  });
}

function syncSidebarTabs() {
  document.querySelectorAll('.nav-rail-btn[data-view]').forEach(function(t) {
    t.classList.toggle('active', t.dataset.view === _sidebarView);
  });
  // Update drawer title to reflect current view
  var drawerTitle = document.getElementById('drawer-title');
  if (drawerTitle) drawerTitle.textContent = _sidebarView === 'notebooks' ? 'Notebook' : 'Articles';

  // Always show file list and count — articles + notebooks visible on all tabs
  var fileCount = document.getElementById('file-count');
  var fileList = document.getElementById('file-list');
  if (fileCount) fileCount.style.display = '';
  if (fileList) fileList.style.display = '';

  // Update search placeholder contextually
  var search = document.getElementById('search');
  if (search) {
    if (_sidebarView === 'notebooks') search.placeholder = 'Search notebooks...';
    else search.placeholder = 'Search... try is:favorite or tag:tech';
  }

  // Pinned filters only apply to articles (home view)
  var pinnedContainer = document.getElementById('pinned-filters');
  if (pinnedContainer) pinnedContainer.style.display = _sidebarView === 'home' ? '' : 'none';
  var pinBtn = document.getElementById('search-pin');
  if (pinBtn && _sidebarView !== 'home') pinBtn.style.display = 'none';

  // Hide read toggle only applies to articles
  var hideReadBtn = document.getElementById('hide-read-toggle');
  if (hideReadBtn) hideReadBtn.style.display = _sidebarView === 'home' ? '' : 'none';
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

  if (!_activeNoteId) return;
  var note = (_activeNotebook.notes || []).find(function(n) { return n.id === _activeNoteId; });
  if (!note) return;
  var title = (note.content || '').split('\n')[0].replace(/^#+\s*/, '').trim() || 'Untitled Note';
  var content = note.content || '';
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
  // Move cursor to end and scroll so cursor line is vertically centered
  ta.selectionStart = ta.selectionEnd = ta.value.length;
  wfScrollCursorToCenter(ta);

  var _wfRafPending = false;
  function wfScheduleUpdate() {
    if (_wfRafPending) return;
    _wfRafPending = true;
    requestAnimationFrame(function() {
      _wfRafPending = false;
      wfScrollCursorToCenter(ta);
      updateWritingFocusLine();
    });
  }
  ta.addEventListener('input', function() {
    notebookDebounceSave();
    wfScheduleUpdate();
    var wc = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
    var wcEl = document.getElementById('wf-word-count');
    if (wcEl) wcEl.textContent = wc + ' words';
  });
  ta.addEventListener('click', wfScheduleUpdate);
  ta.addEventListener('keyup', function(e) {
    // Only update on arrow keys / home / end (cursor movement without input)
    if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') wfScheduleUpdate();
  });
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

  // Sync content back from overlay textarea to the expanded note
  var ta = document.getElementById('wf-textarea');
  if (ta && _activeNotebook && _activeNoteId) {
    var note = (_activeNotebook.notes || []).find(function(n) { return n.id === _activeNoteId; });
    if (note) {
      note.content = ta.value;
      note.updatedAt = new Date().toISOString();
    }
    notebookDebounceSave();
  }

  var overlay = document.getElementById('writing-focus-overlay');
  if (overlay) overlay.remove();
  var mirror = document.getElementById('wf-mirror');
  if (mirror) mirror.remove();

  // Refresh the note editor to show updated content
  if (_activeNotebook && _activeNoteId) {
    openNoteInPane(_activeNoteId);
  }
}

// Keep the cursor line vertically centered in the textarea (iA Writer style)
function wfScrollCursorToCenter(ta) {
  var lh = parseFloat(getComputedStyle(ta).lineHeight) || 28.8;
  var cursorY = measureCharY(ta, ta.selectionStart);
  var visibleHeight = ta.parentElement ? ta.parentElement.clientHeight : ta.clientHeight;
  var targetScroll = cursorY - visibleHeight / 2 + lh / 2;
  ta.scrollTop = targetScroll;
}

// Find the start of the sentence containing the character at pos
function findSentenceStart(text, pos) {
  var i = pos - 1;
  while (i >= 0) {
    // Sentence-ending punctuation followed by whitespace
    if (/[.!?]/.test(text[i]) && i + 1 < text.length && /\s/.test(text[i + 1])) {
      // Skip whitespace after punctuation to find sentence start
      var j = i + 1;
      while (j < pos && /\s/.test(text[j])) j++;
      return j;
    }
    // Paragraph break (double newline)
    if (text[i] === '\n' && i > 0 && text[i - 1] === '\n') {
      var j = i + 1;
      while (j < pos && /[ \t]/.test(text[j])) j++;
      return j;
    }
    i--;
  }
  // Skip leading whitespace from start of text
  var j = 0;
  while (j < pos && /\s/.test(text[j])) j++;
  return j;
}

// Find the end of the sentence containing the character at pos
function findSentenceEnd(text, pos) {
  var i = pos;
  while (i < text.length) {
    // Sentence-ending punctuation followed by whitespace or end
    if (/[.!?]/.test(text[i])) {
      // Include trailing quotes/parens that are part of the sentence
      var end = i + 1;
      while (end < text.length && /["'\u201D\u2019)]/.test(text[end])) end++;
      if (end >= text.length || /\s/.test(text[end])) return end;
    }
    // Paragraph break
    if (text[i] === '\n' && i + 1 < text.length && text[i + 1] === '\n') return i;
    i++;
  }
  return text.length;
}

// Measure the visual Y position of a character in a textarea, accounting for word wrap
function measureCharY(ta, charIndex) {
  var mirror = document.getElementById('wf-mirror');
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.id = 'wf-mirror';
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.wordBreak = 'break-word';
    document.body.appendChild(mirror);
  }
  var cs = getComputedStyle(ta);
  mirror.style.font = cs.font;
  mirror.style.lineHeight = cs.lineHeight;
  mirror.style.letterSpacing = cs.letterSpacing;
  mirror.style.tabSize = cs.tabSize;
  mirror.style.padding = cs.padding;
  mirror.style.border = cs.border;
  mirror.style.boxSizing = cs.boxSizing;
  mirror.style.width = ta.offsetWidth + 'px';

  var textBefore = ta.value.substring(0, charIndex);
  mirror.textContent = '';
  var beforeNode = document.createTextNode(textBefore);
  var marker = document.createElement('span');
  marker.textContent = '\u200b'; // zero-width space
  mirror.appendChild(beforeNode);
  mirror.appendChild(marker);
  return marker.offsetTop;
}

function updateWritingFocusLine() {
  if (!_writingFocusActive) return;
  var ta = document.getElementById('wf-textarea');
  var line = document.getElementById('wf-focus-line');
  if (!ta || !line) {
    ta = document.querySelector('.note-page .notebook-editor textarea');
    line = document.querySelector('.notebook-focus-line');
  }
  if (!ta || !line) return;
  var text = ta.value;
  var pos = ta.selectionStart;
  var lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 28.8;

  // Find sentence boundaries around cursor
  var sentStart = findSentenceStart(text, pos);
  var sentEnd = findSentenceEnd(text, pos);

  // Measure visual positions using mirror div (accounts for word wrap)
  var startY = measureCharY(ta, sentStart);
  var endY = measureCharY(ta, sentEnd > 0 ? sentEnd - 1 : 0);

  var top = startY - ta.scrollTop;
  var height = endY - startY + lineHeight;
  line.style.top = top + 'px';
  line.style.height = height + 'px';
}

// ---- Pinned filters ----
var MAX_PINNED = 3;

function getPinnedFilters() {
  try { return JSON.parse(localStorage.getItem('pr-pinned-filters') || '[]'); }
  catch { return []; }
}

function savePinnedFilters(pins) {
  localStorage.setItem('pr-pinned-filters', JSON.stringify(pins));
}

function renderPinnedFilters() {
  var container = document.getElementById('pinned-filters');
  if (!container) return;
  var pins = getPinnedFilters();
  if (!pins.length) { container.innerHTML = ''; return; }
  var currentQuery = (document.getElementById('search').value || '').trim();
  container.innerHTML = pins.map(function(q, i) {
    var isActive = currentQuery === q ? ' active' : '';
    return '<button class="pinned-filter' + isActive + '" onclick="applyPinnedFilter(' + i + ')" title="' + escapeHtml(q) + '">'
      + '<span class="pinned-filter-label">' + escapeHtml(q) + '</span>'
      + '<span class="pinned-filter-unpin" onclick="event.stopPropagation();unpinFilter(' + i + ')" title="Unpin">&times;</span>'
      + '</button>';
  }).join('');
}

function updatePinnedFilterActive() {
  var container = document.getElementById('pinned-filters');
  if (!container) return;
  var currentQuery = (document.getElementById('search').value || '').trim();
  var buttons = container.querySelectorAll('.pinned-filter');
  var pins = getPinnedFilters();
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('active', pins[i] === currentQuery);
  }
}

function pinCurrentSearch() {
  var input = document.getElementById('search');
  var query = (input.value || '').trim();
  if (!query) { showToast('Type a search query first'); return; }
  var pins = getPinnedFilters();
  if (pins.indexOf(query) !== -1) { showToast('Already pinned'); return; }
  pins.push(query);
  if (pins.length > MAX_PINNED) pins.shift();
  savePinnedFilters(pins);
  renderPinnedFilters();
}

function unpinFilter(index) {
  var pins = getPinnedFilters();
  pins.splice(index, 1);
  savePinnedFilters(pins);
  renderPinnedFilters();
}

function applyPinnedFilter(index) {
  var pins = getPinnedFilters();
  var query = pins[index];
  if (!query) return;
  var input = document.getElementById('search');
  if (input.value.trim() === query) {
    input.value = '';
  } else {
    input.value = query;
  }
  filterFiles();
  renderPinnedFilters();
}

// ---- Reading break reminder ----
var COVER_COLORS = [
  '#8B4513', '#2F4F4F', '#4A3728', '#1B3A4B', '#5B3256',
  '#6B4423', '#2D4A22', '#3C3C5A', '#7A3B2E', '#2E5F5F'
];

var DEFAULT_ACTIVITIES = [
  'Take a walk outside',
  'Call a friend',
  'Play guitar',
  'Stretch for a few minutes',
  'Make a cup of tea',
  'Look out the window',
  'Do some pushups',
  'Water a plant',
  'Doodle something'
];

var CLASSIC_BOOKS = [
  { title: 'The Metamorphosis', author: 'Franz Kafka', filename: 'the-metamorphosis.md' },
  { title: 'The Call of the Wild', author: 'Jack London', filename: 'the-call-of-the-wild.md' },
  { title: 'The Yellow Wallpaper', author: 'Charlotte Perkins Gilman', filename: 'the-yellow-wallpaper.md' },
  { title: 'The Strange Case of Dr Jekyll and Mr Hyde', author: 'Robert Louis Stevenson', filename: 'dr-jekyll-and-mr-hyde.md' },
  { title: 'Meditations', author: 'Marcus Aurelius', filename: 'meditations.md' },
];

function hashString(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function openBreakBook(filename) {
  _breakSessionStart = Date.now();
  var idx = displayFiles.findIndex(function(f) { return f.filename === filename; });
  if (idx >= 0) {
    loadFile(idx);
  } else {
    // Book may be filtered out — look in the full file list
    var allIdx = filteredFiles.findIndex(function(f) { return f.filename === filename; });
    if (allIdx >= 0) {
      displayFiles.push(filteredFiles[allIdx]);
      loadFile(displayFiles.length - 1);
    } else {
      renderDashboard();
    }
  }
}

function showBreakReminder() {
  var content = document.getElementById('content');
  var empty = document.getElementById('empty-state');
  if (empty) empty.style.display = 'none';
  if (!content) return;
  content.style.display = 'block';

  var activity = (localStorage.getItem('pr-break-activity') || '').trim();
  var showBook = !activity || Math.random() < 0.5;

  var html = '<div class="break-reminder">';
  html += '<a class="break-adjust" href="#" onclick="event.preventDefault();showSettingsPage(\'settings-breaks\')">Adjust timer</a>';
  html += '<div class="break-reminder-icon">';
  html += '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  html += '</div>';
  html += '<h2 class="break-reminder-title">Time for a break</h2>';
  html += '<p class="break-reminder-subtitle">You\u2019ve been reading a while. Maybe\u2026</p>';

  if (showBook) {
    var book = CLASSIC_BOOKS[Math.floor(Math.random() * CLASSIC_BOOKS.length)];
    var color = COVER_COLORS[hashString(book.title) % COVER_COLORS.length];
    html += '<div class="break-suggestion">';
    html += '<div class="break-book-cover" style="background:' + color + '">';
    html += '<div class="break-book-title">' + escapeHtml(book.title) + '</div>';
    html += '<hr class="break-book-rule">';
    html += '<div class="break-book-author">' + escapeHtml(book.author) + '</div>';
    html += '</div>';
    html += '<div class="break-actions">';
    html += '<button class="btn-primary break-link" onclick="openBreakBook(\'' + book.filename + '\')">Read now</button>';
    html += '</div>';
    html += '</div>';
  } else {
    var suggestion = activity || DEFAULT_ACTIVITIES[Math.floor(Math.random() * DEFAULT_ACTIVITIES.length)];
    html += '<div class="break-suggestion">';
    html += '<div class="break-activity-card">';
    html += '<svg class="break-activity-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
    html += '<div class="break-activity-text">' + escapeHtml(suggestion) + '</div>';
    html += '</div>';
    html += '</div>';
  }

  html += '<div class="break-continue">';
  html += '<button class="btn-primary break-continue-btn" onclick="dismissBreakReminder()">Continue Reading</button>';
  html += '</div>';
  html += '</div>';

  content.innerHTML = html;
  document.getElementById('content-scroll').scrollTop = 0;
}

function dismissBreakReminder() {
  _breakSessionStart = Date.now();
  if (_breakPendingIndex >= 0) {
    loadFile(_breakPendingIndex);
    _breakPendingIndex = -1;
  } else if (activeFile) {
    var idx = displayFiles.findIndex(function(f) { return f.filename === activeFile; });
    if (idx >= 0) loadFile(idx);
    else renderDashboard();
  } else {
    renderDashboard();
  }
}

