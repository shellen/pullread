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

  // Apply magic sort
  if (magicSort) {
    if (displayFiles === filteredFiles) displayFiles = filteredFiles.slice();
    var engagement = computeSourceEngagement();
    displayFiles.sort(function(a, b) {
      return magicScore(b, engagement) - magicScore(a, engagement);
    });
    // Source diversity: max 3 articles per source in top positions, extras pushed down
    var sourceCounts = {};
    var top = [], overflow = [];
    for (var di = 0; di < displayFiles.length; di++) {
      var key = displayFiles[di].feed || displayFiles[di].domain || 'unknown';
      sourceCounts[key] = (sourceCounts[key] || 0) + 1;
      if (sourceCounts[key] <= 3) top.push(displayFiles[di]);
      else overflow.push(displayFiles[di]);
    }
    displayFiles = top.concat(overflow);
  }

  const searchTerm = (document.getElementById('search').value || '').trim().toLowerCase();

  const total = filteredFiles.length;
  const shown = displayFiles.length;
  const isNotebooksTab = _sidebarView === 'notebooks';

  let countStr;
  if (isNotebooksTab) {
    countStr = 'Notebook';
  } else {
    countStr = approxCount(shown) + ' article' + (shown !== 1 ? 's' : '');
    if (hideRead && shown < total) countStr += ' (' + approxCount(total - shown) + ' hidden)';
  }
  countText.textContent = countStr;
  countText.title = !isNotebooksTab && shown >= 100 ? shown.toLocaleString() + ' articles' : '';

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

  // Auto-advance to next source when current feed is empty
  if (_activeDrawerSource && displayFiles.length === 0) {
    setTimeout(advanceToNextSource, 0);
  }
}

var _advanceOrigin = null;
function advanceToNextSource() {
  var items = document.querySelectorAll('#drawer-content .drawer-item[data-source]');
  if (!items.length) return;
  var currentIdx = -1;
  for (var i = 0; i < items.length; i++) {
    if (items[i].dataset.source === _activeDrawerSource) { currentIdx = i; break; }
  }
  var nextIdx = (currentIdx + 1) % items.length;
  var nextSource = items[nextIdx].dataset.source;
  if (_advanceOrigin === null) _advanceOrigin = _activeDrawerSource;
  else if (nextSource === _advanceOrigin) { _advanceOrigin = null; return; }
  filterBySource(nextSource);
  _advanceOrigin = null;
}

function renderFileItem(f, i) {
  const date = f.bookmarked ? timeAgo(f.bookmarked) : '';
  const dateTitle = f.bookmarked ? timeAgoTitle(f.bookmarked) : '';
  const isActive = activeFile === f.filename ? ' active' : '';
  const isRead = readArticles.has(f.filename);
  const { hasHl, hasNote, isFavorite } = hasAnnotations(f.filename);
  const hasSummary = f.hasSummary;
  const isPodcast = !!(f.enclosureUrl && f.enclosureType && f.enclosureType.startsWith('audio/'));
  let indicators = '';
  if (hasHl || hasNote || hasSummary || isFavorite || isPodcast) {
    indicators = '<div class="file-item-indicators">'
      + (isFavorite ? '<span class="dot dot-favorite" aria-label="Starred"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-heart"/></svg></span>' : '')
      + (isPodcast ? '<span class="dot dot-podcast" aria-label="Podcast"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-headphones"/></svg></span>' : '')
      + (hasHl ? '<span class="dot dot-highlight" aria-label="Has highlights"></span>' : '')
      + (hasNote ? '<span class="dot dot-note" aria-label="Has annotations"></span>' : '')
      + (hasSummary ? '<span class="dot dot-summary" aria-label="Has summary"></span>' : '')
      + '</div>';
  }

  // Podcasts with artwork use it instead of the domain favicon
  const podcastArt = isPodcast && f.image;
  const favicon = podcastArt
    ? '<img class="file-item-favicon file-item-artwork" src="' + escapeHtml(f.image) + '" alt="" loading="lazy" onerror="this.src=\'/favicons/' + encodeURIComponent(f.domain || '') + '.png\';this.classList.remove(\'file-item-artwork\');this.onerror=function(){this.src=\'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7\'}" aria-hidden="true">'
    : (f.domain && f.domain !== 'pullread'
      ? '<img class="file-item-favicon" src="/favicons/' + encodeURIComponent(f.domain) + '.png" alt="" loading="lazy" onerror="this.src=\'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7\'" aria-hidden="true">'
      : '');

  const sourceName = (f.feed && f.domain && !feedMatchesDomain(f.feed, f.domain)) ? f.feed : (f.domain || '');

  const metaParts = [];
  if (favicon) metaParts.push(favicon);
  if (sourceName) metaParts.push('<span>' + escapeHtml(sourceName) + '</span>');
  if (date) metaParts.push('<span' + (dateTitle ? ' title="' + escapeHtml(dateTitle) + '"' : '') + '>' + escapeHtml(date) + '</span>');
  const metaHtml = metaParts.join('');

  return '<div class="file-item' + isActive + (isRead && !isActive ? ' read' : '') + '" data-index="' + i + '" data-filename="' + escapeHtml(f.filename) + '" onclick="loadFile(' + i + ')" role="option" aria-selected="' + (activeFile === f.filename) + '" tabindex="0" onkeydown="if(event.key===\'Enter\')loadFile(' + i + ')">'
    + '<div class="file-item-title">' + escapeHtml(f.title) + '</div>'
    + '<div class="file-item-meta">' + metaHtml + indicators + '</div>'
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
      + (isFavorite ? '<span class="dot dot-favorite" aria-label="Starred"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-heart"/></svg></span>' : '')
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

function toggleMagicSort() {
  magicSort = !magicSort;
  localStorage.setItem('pr-magic-sort', magicSort ? '1' : '0');
  document.getElementById('magic-sort-toggle').classList.toggle('active', magicSort);
  renderFileList();
}

function computeSourceEngagement() {
  var stats = {};
  for (var i = 0; i < allFiles.length; i++) {
    var f = allFiles[i];
    var key = f.feed || f.domain || 'unknown';
    if (!stats[key]) stats[key] = { total: 0, read: 0, interact: 0 };
    stats[key].total++;
    if (readArticles.has(f.filename)) stats[key].read++;
    var notes = allNotesIndex[f.filename];
    if (notes && (notes.isFavorite || (notes.annotations && notes.annotations.length) || notes.articleNote)) {
      stats[key].interact++;
    }
    if (allHighlightsIndex[f.filename] && allHighlightsIndex[f.filename].length) {
      stats[key].interact++;
    }
  }
  var engagement = {};
  for (var key in stats) {
    var s = stats[key];
    var readRate = s.total > 0 ? s.read / s.total : 0;
    var interactRate = s.total > 0 ? s.interact / s.total : 0;
    engagement[key] = 0.5 * readRate + 0.5 * Math.min(interactRate * 3, 1);
  }
  return engagement;
}

function magicScore(f, engagement) {
  // Recency: exponential decay (weight 40)
  // Podcasts use 12-hour half-life (decay 1.386), articles use 3-day (decay 0.231)
  var age = f.bookmarked ? (Date.now() - new Date(f.bookmarked).getTime()) / 86400000 : 30;
  var isPodcast = f.enclosureUrl && f.enclosureType && f.enclosureType.startsWith('audio/');
  var decay = isPodcast ? 1.386 : 0.231;
  var recency = Math.exp(-decay * age);

  // Source engagement (weight 35)
  var key = f.feed || f.domain || 'unknown';
  var source = engagement[key] || 0;

  // Unread boost (weight 15)
  var unread = readArticles.has(f.filename) ? 0 : 1;

  // Article signals (weight 10)
  var signals = 0;
  var notes = allNotesIndex[f.filename];
  if (notes && notes.isFavorite) signals += 0.3;
  if (allHighlightsIndex[f.filename] && allHighlightsIndex[f.filename].length) signals += 0.2;
  if (notes && (notes.articleNote || (notes.annotations && notes.annotations.length))) signals += 0.15;

  return 40 * recency + 35 * source + 15 * unread + 10 * Math.min(signals, 1);
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
  scheduleNavCounts();
  refreshDrawerCounts();
}

function markCurrentAsRead() {
  if (!activeFile) return;
  if (_markAsReadDelayTimer) { clearTimeout(_markAsReadDelayTimer); _markAsReadDelayTimer = null; }
  markAsRead(activeFile);
  updateSidebarActiveState(null);
  showToast('Marked as read');
}

function markCurrentAsUnread() {
  if (!activeFile) return;
  readArticles.delete(activeFile);
  clearTimeout(_markAsReadTimer);
  _markAsReadTimer = setTimeout(_flushReadArticles, 2000);
  renderFileList();
  scheduleNavCounts();
  refreshDrawerCounts();
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
  input.value = 'author:"' + authorName + '"';
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
      const terms = group.match(/\S+:"[^"]*"|"[^"]*"|\S+/g) || [];
      return terms.every(term => {
        // Remove surrounding quotes if present
        const t = term.replace(/^"(.*)"$/, '$1');
        const tl = t.toLowerCase();

        // Operator: is:starred / is:favorite / is:fav
        if (tl === 'is:starred' || tl === 'is:favorite' || tl === 'is:fav') return isFavorite;
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
        if (tl === 'has:tags' || tl === 'has:tag') return hasTags || (f.categories && f.categories.length > 0);
        // Operator: tag:value — searches user tags, machine tags, and source categories
        if (tl.startsWith('tag:')) {
          const tagQ = tl.slice(4).replace(/^"(.*)"$/, '$1');
          if (!tagQ) return hasTags || (f.categories && f.categories.length > 0);
          const allTags = [...(notes?.tags || []), ...(notes?.machineTags || []), ...(f.categories || [])];
          return allTags.some(t => t.toLowerCase().includes(tagQ));
        }
        // Operator: feed:value (exact match against feed name or domain fallback)
        if (tl.startsWith('feed:')) {
          const feedQ = tl.slice(5).replace(/^"(.*)"$/, '$1');
          const key = (f.feed || f.domain || 'unknown').toLowerCase();
          return key === feedQ;
        }
        // Operator: domain:value
        if (tl.startsWith('domain:')) {
          const domQ = tl.slice(7).replace(/^"(.*)"$/, '$1');
          return f.domain.toLowerCase().includes(domQ);
        }
        // Operator: author:value (supports author:"First Last")
        if (tl.startsWith('author:')) {
          const authQ = tl.slice(7).replace(/^"(.*)"$/, '$1');
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
var _markAsReadDelayTimer = null;

async function loadFile(index) {
  const file = displayFiles[index];
  if (!file) return;
  if (_breakSessionStart === 0) _breakSessionStart = Date.now();
  _sidebarView = 'home'; syncSidebarTabs();
  var prevActive = activeFile;
  activeFile = file.filename;
  _activeDrawerSource = file.feed || null;
  updateDrawerActiveState();
  if (_markAsReadDelayTimer) { console.debug('[PR] loadFile clearing markAsRead timer (switching to', file.filename + ')'); clearTimeout(_markAsReadDelayTimer); }
  var fileToMark = file.filename;
  _markAsReadDelayTimer = setTimeout(function() {
    console.debug('[PR] markAsRead timer fired for', fileToMark, '(active:', activeFile + ')');
    markAsRead(fileToMark);
    updateSidebarActiveState(null);
  }, 3000);
  updateSidebarActiveState(prevActive);
  removeHlToolbar();

  // Auto-close sidebar on mobile after selecting an article
  if (window.innerWidth <= 750) {
    closeMobileSidebar();
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
    var annotationData = await preloadAnnotations(file.filename, controller.signal);
    if (activeFile !== targetFile) { console.debug('[PR] loadFile bailed: active changed after annotations', targetFile, '->', activeFile); return; }
    applyAnnotationData(annotationData);

    try {
      const res = await fetch('/api/file?name=' + encodeURIComponent(file.filename), { signal: controller.signal });
      if (activeFile !== targetFile) { console.debug('[PR] loadFile bailed: active changed after fetch', targetFile, '->', activeFile); return; }
      if (res.ok) {
        const text = await res.text();
        if (activeFile !== targetFile) { console.debug('[PR] loadFile bailed: active changed after text read', targetFile, '->', activeFile); return; }
        renderArticle(text, file.filename);
        applyHighlights();
        renderNotesPanel();

        // Auto-reprocess articles with suspiciously short bodies
        var parsed = parseFrontmatter(text);
        if (parsed.meta && parsed.meta.url && parsed.meta.source !== 'feed' && parsed.body.trim().length < 200) {
          showToast('Fetching full article\u2026');
          fetch('/api/reprocess', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: file.filename })
          }).then(function(rr) { return rr.json(); }).then(function(data) {
            if (!data.ok || activeFile !== targetFile) return;
            return fetch('/api/file?name=' + encodeURIComponent(targetFile));
          }).then(function(rr) {
            if (!rr || !rr.ok || activeFile !== targetFile) return;
            return rr.text();
          }).then(function(updated) {
            if (!updated || activeFile !== targetFile) return;
            renderArticle(updated, targetFile);
            showToast('Article updated');
          }).catch(function() {});
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') { console.debug('[PR] loadFile aborted:', targetFile); return; }
      throw e;
    }
  }
}

// Navigate to next (+1) or previous (-1) article with wrapping
var _navDebounceTimer = null;
function navigateArticle(direction) {
  if (!displayFiles.length) return;
  // Debounce rapid keypresses to prevent concurrent loadFile storms
  if (_navDebounceTimer) clearTimeout(_navDebounceTimer);

  // Immediately update the visual selection for responsive feel
  const cidx = displayFiles.findIndex(f => f.filename === activeFile);
  let next;
  if (direction > 0) {
    next = cidx < displayFiles.length - 1 ? cidx + 1 : 0;

    // When all items from the current source are read, advance to next source's first unread
    var currentSource = displayFiles[cidx] && (displayFiles[cidx].domain || displayFiles[cidx].feed);
    if (currentSource) {
      var hasUnreadInSource = displayFiles.some(function(f) {
        return (f.domain || f.feed) === currentSource && !readArticles.has(f.filename);
      });
      if (!hasUnreadInSource) {
        for (var si = cidx + 1; si < displayFiles.length; si++) {
          var f = displayFiles[si];
          if ((f.domain || f.feed) !== currentSource && !readArticles.has(f.filename)) {
            next = si;
            break;
          }
        }
      }
    }
  } else {
    next = cidx > 0 ? cidx - 1 : displayFiles.length - 1;
  }
  var prevActive = activeFile;
  activeFile = displayFiles[next].filename;
  updateSidebarActiveState(prevActive);
  const el = document.querySelector('.file-item[data-index="' + next + '"]');
  if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus({ preventScroll: true }); }

  // Debounce the heavy work (fetch + render)
  _navDebounceTimer = setTimeout(function() {
    _navDebounceTimer = null;
    console.debug('[PR] navigateArticle', direction > 0 ? 'next' : 'prev', 'settled on', activeFile);
    var interval = parseInt(localStorage.getItem('pr-break-interval') || '0', 10);
    if (interval > 0 && _breakSessionStart > 0) {
      var elapsed = (Date.now() - _breakSessionStart) / 60000;
      if (elapsed >= interval) {
        _breakPendingDirection = direction;
        _breakPendingIndex = next;
        showBreakReminder();
        return;
      }
    }
    loadFile(next);
  }, 150);
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
var _activeDrawerSource = null;

function switchSidebarView(view) {
  _sidebarView = view;
  syncSidebarTabs();

  if (view === 'notebooks') {
    clearSourceFilter();
    closeDrawer();
    openSingleNotebook();
  }
  else if (view === 'home') goHome();
}

function openSingleNotebook() {
  getOrCreateSingleNotebook().then(function(nb) {
    openNotebookInPane(nb.id);
  });
}

function syncSidebarTabs() {
  document.querySelectorAll('.sidebar-tab[data-tab]').forEach(function(t) {
    t.classList.toggle('active', t.dataset.tab === _sidebarView);
  });

  // File list always visible; sort bar only on articles tab
  var fileCount = document.getElementById('file-count');
  var fileList = document.getElementById('file-list');
  if (fileCount) fileCount.style.display = _sidebarView === 'home' ? '' : 'none';
  if (fileList) fileList.style.display = '';

  // Update search placeholder contextually
  var search = document.getElementById('search');
  if (search) {
    if (_sidebarView === 'notebooks') search.placeholder = 'Search notebooks...';
    else search.placeholder = 'Search... try is:starred or tag:tech';
  }

  // Pinned filters only apply to articles (home view)
  var pinnedContainer = document.getElementById('pinned-filters');
  if (pinnedContainer) pinnedContainer.style.display = _sidebarView === 'home' ? '' : 'none';
  var pinBtn = document.getElementById('search-pin');
  if (pinBtn && _sidebarView !== 'home') pinBtn.style.display = 'none';

  // Sort toggles visibility handled by file-count container above

  // Nav items only visible on home tab
  var navEl = document.getElementById('sidebar-nav');
  if (navEl) navEl.style.display = _sidebarView === 'home' ? '' : 'none';
}

// ---- Sidebar nav filter (All Items / Sources / Tags / Unread / Starred) ----
function sidebarNavFilter(filter) {
  // Update active state on nav items
  document.querySelectorAll('.sidebar-nav-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.nav === filter);
  });

  var search = document.getElementById('search');
  if (filter === 'all') {
    if (search) search.value = '';
    clearSourceFilter();
    filterFiles();
    closeDrawer();
    if (displayFiles.length > 0) loadFile(0);
  } else if (filter === 'unread') {
    if (search) search.value = 'is:unread';
    closeDrawer();
    filterFiles();
    if (displayFiles.length > 0) loadFile(0);
  } else if (filter === 'starred') {
    if (search) search.value = 'is:starred';
    closeDrawer();
    filterFiles();
    if (displayFiles.length > 0) loadFile(0);
  } else if (filter === 'sources') {
    openSourcesDrawer();
  } else if (filter === 'tags') {
    openTagsDrawer();
  }
}

function drawerFaviconFallback(el, name) {
  var letter = (name || '?').replace(/^(the |www\.)/i, '').charAt(0).toUpperCase();
  var colors = ['#b45535','#5b7a5e','#4a6fa5','#8b6b4a','#6b5b8a','#5a8a7a','#8a5a5a','#5a6b8a'];
  var color = colors[letter.charCodeAt(0) % colors.length];
  el.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="' + color + '"/><text x="32" y="32" dominant-baseline="central" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="28" font-weight="600">' + letter + '</text></svg>');
  el.onerror = null;
}

function openSourcesDrawer() {
  var title = document.getElementById('drawer-title');
  var contentEl = document.getElementById('drawer-content');
  var footerEl = document.getElementById('drawer-footer');
  if (title) title.textContent = 'Sources';

  // Group articles by feed/domain
  var domainArticles = {};
  for (var i = 0; i < allFiles.length; i++) {
    var f = allFiles[i];
    var key = f.feed || f.domain || 'unknown';
    if (!domainArticles[key]) domainArticles[key] = [];
    domainArticles[key].push(f);
  }

  var entries = Object.entries(domainArticles);

  // Count podcast items
  var podcastCount = 0;
  for (var j = 0; j < allFiles.length; j++) {
    if (allFiles[j].enclosureUrl && allFiles[j].enclosureType && allFiles[j].enclosureType.startsWith('audio/')) podcastCount++;
  }

  var sortMode = localStorage.getItem('pr-sources-sort') || 'recent';
  var _drawerFilter = '';

  function sortEntries(mode) {
    if (mode === 'az') {
      entries.sort(function(a, b) { return a[0].localeCompare(b[0]); });
    } else if (mode === 'recent') {
      entries.sort(function(a, b) {
        var latestA = '', latestB = '';
        for (var k = 0; k < a[1].length; k++) {
          if (a[1][k].bookmarked > latestA) latestA = a[1][k].bookmarked;
        }
        for (var k = 0; k < b[1].length; k++) {
          if (b[1][k].bookmarked > latestB) latestB = b[1][k].bookmarked;
        }
        return latestB > latestA ? 1 : latestB < latestA ? -1 : 0;
      });
    } else {
      entries.sort(function(a, b) { return b[1].length - a[1].length; });
    }
  }

  function renderSources() {
    var html = '';

    // Search/filter input
    html += '<div class="drawer-search">';
    html += '<input type="text" id="drawer-filter-input" placeholder="Filter sources\u2026" value="' + escapeHtml(_drawerFilter) + '">';
    html += '</div>';

    // Sort bar
    html += '<div class="drawer-sort-bar">';
    html += '<button class="drawer-sort-btn' + (sortMode === 'recent' ? ' active' : '') + '" data-sort="recent" title="Sort by most recent article">Recent</button>';
    html += '<button class="drawer-sort-btn' + (sortMode === 'az' ? ' active' : '') + '" data-sort="az" title="Sort alphabetically by name">A\u2013Z</button>';
    html += '<button class="drawer-sort-btn' + (sortMode === 'count' ? ' active' : '') + '" data-sort="count" title="Sort by number of articles">Count</button>';
    html += '</div>';

    var filterLower = _drawerFilter.toLowerCase();

    // Podcast row
    if (podcastCount > 0 && (!filterLower || 'podcasts'.indexOf(filterLower) !== -1)) {
      var podUnread = 0;
      for (var pj = 0; pj < allFiles.length; pj++) {
        if (allFiles[pj].enclosureUrl && allFiles[pj].enclosureType && allFiles[pj].enclosureType.startsWith('audio/') && !readArticles.has(allFiles[pj].filename)) podUnread++;
      }
      var podActive = _activeDrawerSource === '__podcasts__' ? ' active' : '';
      var podDim = podUnread === 0 ? ' dimmed' : '';
      html += '<div class="drawer-group-label">Media Type</div>';
      html += '<div class="drawer-item' + podActive + podDim + '" data-source="__podcasts__" onclick="filterBySource(\'__podcasts__\')">'
        + '<svg class="drawer-item-icon" aria-hidden="true"><use href="#i-headphones"/></svg>'
        + '<span class="drawer-item-name">Podcasts</span>'
        + '<span class="drawer-item-count">' + podUnread + '</span></div>';
    }

    // Source rows
    sortEntries(sortMode);
    html += '<div class="drawer-group-label">Sources</div>';
    for (var si = 0; si < entries.length; si++) {
      var name = entries[si][0];
      if (filterLower && name.toLowerCase().indexOf(filterLower) === -1) continue;
      var articles = entries[si][1];
      var unread = 0;
      for (var ui = 0; ui < articles.length; ui++) {
        if (!readArticles.has(articles[ui].filename)) unread++;
      }
      var domain = articles[0].domain || '';
      var isActive = _activeDrawerSource === name ? ' active' : '';
      var isDimmed = unread === 0 ? ' dimmed' : '';
      var faviconHtml = domain && domain !== 'pullread'
        ? '<img class="drawer-item-favicon" src="/favicons/' + encodeURIComponent(domain) + '.png" alt="" loading="lazy" onerror="drawerFaviconFallback(this,\'' + escapeJsStr(name) + '\')">'
        : '<svg class="drawer-item-icon" aria-hidden="true"><use href="#i-globe"/></svg>';
      html += '<div class="drawer-item' + isActive + isDimmed + '" data-source="' + escapeHtml(name) + '" onclick="filterBySource(\'' + escapeJsStr(name) + '\')">'
        + faviconHtml
        + '<span class="drawer-item-name">' + escapeHtml(name) + '</span>'
        + '<span class="drawer-item-count">' + unread + '</span></div>';
    }

    if (contentEl) {
      contentEl.innerHTML = html;

      // Wire sort buttons
      var btns = contentEl.querySelectorAll('.drawer-sort-btn');
      for (var b = 0; b < btns.length; b++) {
        btns[b].addEventListener('click', function() {
          sortMode = this.dataset.sort;
          localStorage.setItem('pr-sources-sort', sortMode);
          renderSources();
        });
      }

      // Wire search filter
      var filterInput = document.getElementById('drawer-filter-input');
      if (filterInput) {
        filterInput.addEventListener('input', function() {
          _drawerFilter = this.value;
          var pos = this.selectionStart;
          renderSources();
          var fi = document.getElementById('drawer-filter-input');
          if (fi) { fi.focus(); fi.setSelectionRange(pos, pos); }
        });
      }
    }
  }

  // Show footer with "Manage Sources" button
  if (footerEl) {
    footerEl.style.display = '';
    footerEl.innerHTML = '<button onclick="closeDrawer();showManageSourcesPage()">'
      + '<svg aria-hidden="true"><use href="#i-gear"/></svg>'
      + 'Manage Sources'
      + '</button>';
  }

  renderSources();
  openDrawer();
}

function openTagsDrawer() {
  var title = document.getElementById('drawer-title');
  var content = document.getElementById('drawer-content');
  var footerEl = document.getElementById('drawer-footer');
  if (title) title.textContent = 'Tags';
  if (footerEl) footerEl.style.display = 'none';

  // Collect tags from annotations index
  var tagCounts = {};
  for (var filename in allNotesIndex) {
    var notes = allNotesIndex[filename];
    var allTags = (notes.tags || []).concat(notes.machineTags || []);
    for (var i = 0; i < allTags.length; i++) {
      tagCounts[allTags[i]] = (tagCounts[allTags[i]] || 0) + 1;
    }
  }

  var entries = Object.entries(tagCounts);
  var sortMode = localStorage.getItem('pr-tags-sort') || 'count';
  var _tagFilter = '';

  function sortEntries(mode) {
    if (mode === 'az') {
      entries.sort(function(a, b) { return a[0].localeCompare(b[0]); });
    } else {
      entries.sort(function(a, b) { return b[1] - a[1]; });
    }
  }

  function renderTags() {
    var html = '';

    // Search/filter input
    html += '<div class="drawer-search">';
    html += '<input type="text" id="drawer-tag-filter" placeholder="Filter tags\u2026" value="' + escapeHtml(_tagFilter) + '">';
    html += '</div>';

    // Sort bar
    html += '<div class="drawer-sort-bar">';
    html += '<button class="drawer-sort-btn' + (sortMode === 'count' ? ' active' : '') + '" data-sort="count" title="Sort by frequency">Count</button>';
    html += '<button class="drawer-sort-btn' + (sortMode === 'az' ? ' active' : '') + '" data-sort="az" title="Sort alphabetically">A\u2013Z</button>';
    html += '</div>';

    var filterLower = _tagFilter.toLowerCase();
    sortEntries(sortMode);

    var shown = 0;
    for (var ti = 0; ti < entries.length; ti++) {
      var tag = entries[ti][0];
      var count = entries[ti][1];
      if (filterLower && tag.toLowerCase().indexOf(filterLower) === -1) continue;
      html += '<div class="drawer-item" onclick="filterByTag(\'' + escapeJsStr(tag) + '\')">'
        + '<span class="drawer-item-dot" style="background:var(--link)"></span>'
        + '<span class="drawer-item-name">' + escapeHtml(tag) + '</span>'
        + '<span class="drawer-item-count">' + count + '</span></div>';
      shown++;
    }

    if (!entries.length) {
      html += '<div style="padding:16px 8px;color:var(--muted);font-size:13px;text-align:center">No tags yet. Tags appear when articles are auto-tagged or you add them manually.</div>';
    } else if (!shown) {
      html += '<div style="padding:16px 8px;color:var(--muted);font-size:13px;text-align:center">No tags matching \u201c' + escapeHtml(_tagFilter) + '\u201d</div>';
    }

    if (content) {
      content.innerHTML = html;

      // Wire sort buttons
      var btns = content.querySelectorAll('.drawer-sort-btn');
      for (var b = 0; b < btns.length; b++) {
        btns[b].addEventListener('click', function() {
          sortMode = this.dataset.sort;
          localStorage.setItem('pr-tags-sort', sortMode);
          renderTags();
        });
      }

      // Wire search filter
      var filterInput = document.getElementById('drawer-tag-filter');
      if (filterInput) {
        filterInput.addEventListener('input', function() {
          _tagFilter = this.value;
          var pos = this.selectionStart;
          renderTags();
          var fi = document.getElementById('drawer-tag-filter');
          if (fi) { fi.focus(); fi.setSelectionRange(pos, pos); }
        });
      }
    }
  }

  renderTags();
  openDrawer();
}

function filterBySource(source) {
  var search = document.getElementById('search');
  if (source === '__podcasts__') {
    if (search) search.value = 'is:podcast';
    showSourceFilterBar('Podcasts');
    _activeDrawerSource = '__podcasts__';
  } else {
    if (search) search.value = 'feed:"' + source + '"';
    showSourceFilterBar(source);
    _activeDrawerSource = source;
  }
  filterFiles();
  updateDrawerActiveState();
  // Load the most recent article from this source
  if (displayFiles.length > 0) loadFile(0);
}

function filterByTag(tag) {
  var search = document.getElementById('search');
  if (search) search.value = 'tag:"' + tag + '"';
  showSourceFilterBar(tag);
  _activeDrawerSource = null;
  filterFiles();
  updateDrawerActiveState();
  if (displayFiles.length > 0) loadFile(0);
}

function refreshDrawerCounts() {
  var drawer = document.getElementById('drawer');
  if (!drawer || !drawer.classList.contains('open')) return;
  var title = document.getElementById('drawer-title');
  if (!title) return;

  if (title.textContent === 'Sources') {
    // Update counts in-place to preserve scroll position
    var items = drawer.querySelectorAll('.drawer-item[data-source]');
    for (var i = 0; i < items.length; i++) {
      var src = items[i].dataset.source;
      var countEl = items[i].querySelector('.drawer-item-count');
      if (!countEl) continue;
      var unread = 0;
      if (src === '__podcasts__') {
        for (var j = 0; j < allFiles.length; j++) {
          if (allFiles[j].enclosureUrl && allFiles[j].enclosureType && allFiles[j].enclosureType.startsWith('audio/') && !readArticles.has(allFiles[j].filename)) unread++;
        }
      } else {
        for (var j = 0; j < allFiles.length; j++) {
          var key = allFiles[j].feed || allFiles[j].domain || 'unknown';
          if (key === src && !readArticles.has(allFiles[j].filename)) unread++;
        }
      }
      countEl.textContent = unread;
      items[i].classList.toggle('dimmed', unread === 0);
    }
  } else if (title.textContent === 'Tags') {
    // Tags drawer — just re-render since tag counts change less often
    openTagsDrawer();
  }
}

function updateDrawerActiveState() {
  var items = document.querySelectorAll('#drawer-content .drawer-item[data-source]');
  for (var i = 0; i < items.length; i++) {
    items[i].classList.toggle('active', items[i].dataset.source === _activeDrawerSource);
  }
}

function showSourceFilterBar(name) {
  var bar = document.getElementById('source-filter-bar');
  var nameEl = document.getElementById('source-filter-name');
  if (bar) bar.style.display = '';
  if (nameEl) nameEl.textContent = name;
}

function clearSourceFilter() {
  var bar = document.getElementById('source-filter-bar');
  if (bar) bar.style.display = 'none';
  var search = document.getElementById('search');
  if (search) search.value = '';
  _activeDrawerSource = null;
  // Reset nav to All Items
  document.querySelectorAll('.sidebar-nav-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.nav === 'all');
  });
  filterFiles();
}

// Schedule nav count update (debounced via rAF)
var _navCountsPending = false;
function scheduleNavCounts() {
  if (_navCountsPending) return;
  _navCountsPending = true;
  requestAnimationFrame(function() {
    _navCountsPending = false;
    updateNavCounts();
  });
}

function updateNavCounts() {
  var allCount = document.getElementById('nav-count-all');
  var sourcesCount = document.getElementById('nav-count-sources');
  var tagsCount = document.getElementById('nav-count-tags');
  var unreadCount = document.getElementById('nav-count-unread');
  var starredCount = document.getElementById('nav-count-starred');

  if (allCount) {
    allCount.textContent = '';
    allCount.title = allFiles.length ? allFiles.length.toLocaleString() + ' articles' : '';
  }

  // Count unique sources
  if (sourcesCount) {
    var domains = {};
    for (var i = 0; i < allFiles.length; i++) {
      var key = allFiles[i].feed || allFiles[i].domain || '';
      if (key) domains[key] = true;
    }
    var sc = Object.keys(domains).length;
    sourcesCount.textContent = sc ? approxCount(sc) : '';
    sourcesCount.title = sc ? sc.toLocaleString() + ' sources' : '';
  }

  // Count unique tags
  if (tagsCount) {
    var tags = {};
    for (var fn in allNotesIndex) {
      var n = allNotesIndex[fn];
      (n.tags || []).concat(n.machineTags || []).forEach(function(t) { tags[t] = true; });
    }
    var tc = Object.keys(tags).length;
    tagsCount.textContent = tc ? approxCount(tc) : '';
    tagsCount.title = tc ? tc.toLocaleString() + ' tags' : '';
  }

  // Count unread
  if (unreadCount) {
    var ur = 0;
    for (var j = 0; j < allFiles.length; j++) {
      if (!readArticles.has(allFiles[j].filename)) ur++;
    }
    unreadCount.textContent = ur ? approxCount(ur) : '';
    unreadCount.title = ur ? ur.toLocaleString() + ' unread' : '';
  }

  // Count starred
  if (starredCount) {
    var st = 0;
    for (var fn2 in allNotesIndex) {
      if (allNotesIndex[fn2].isFavorite) st++;
    }
    starredCount.textContent = st ? approxCount(st) : '';
    starredCount.title = st ? st.toLocaleString() + ' starred' : '';
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
      renderHub();
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
    else renderHub();
  } else {
    renderHub();
  }
}

