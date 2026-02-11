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

