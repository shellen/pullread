// ---- Notebook ---- (synthesis writing surface)
let _notebooks = {};
let _activeNotebook = null;
let _notebookSaveTimeout = null;
let _notebookPreviewMode = false;
let _activeNoteId = null;
const SINGLE_NOTEBOOK_ID = 'nb-shared';
var _notebooksLoaded = false;

// Get or create the single shared notebook
async function getOrCreateSingleNotebook() {
  if (_notebooksLoaded && _notebooks[SINGLE_NOTEBOOK_ID]) {
    return _notebooks[SINGLE_NOTEBOOK_ID];
  }
  await loadNotebooks();
  if (_notebooks[SINGLE_NOTEBOOK_ID]) {
    let found = _notebooks[SINGLE_NOTEBOOK_ID];
    // Migrate legacy content blob into discrete notes
    if (found.content && (!found.notes || !found.notes.length)) {
      found.notes = migrateContentToNotes(found.content, found.createdAt || new Date().toISOString());
      found.content = '';
      await saveNotebook(found);
    }
    if (!found.notes) found.notes = [];
    return found;
  }
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
  const now = new Date().toISOString();
  const nbCreated = existing.length ? existing[0].createdAt : now;
  const nb = {
    id: SINGLE_NOTEBOOK_ID,
    title: 'Notebook',
    content: '',
    notes: migrateContentToNotes(content, nbCreated),
    sources: [...new Set(sources)],
    tags: [...new Set(tags)],
    createdAt: nbCreated,
    updatedAt: now
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
    if (res.ok) {
      _notebooks = await res.json();
      _notebooksLoaded = true;
    }
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

function generateNoteId() {
  return 'note-' + Math.random().toString(36).slice(2, 10);
}

// Split a legacy content string on --- separators into note objects
function migrateContentToNotes(content, timestamp) {
  if (!content || !content.trim()) return [];
  var parts = content.split('\n\n---\n\n');
  var ts = timestamp || new Date().toISOString();
  return parts.filter(function(p) { return p.trim(); }).map(function(text) {
    return { id: generateNoteId(), content: text.trim(), sourceArticle: '', createdAt: ts, updatedAt: ts };
  });
}

async function createNote(sourceArticle, initialContent) {
  if (!_activeNotebook) {
    _activeNotebook = await getOrCreateSingleNotebook();
  }
  if (!_activeNotebook.notes) _activeNotebook.notes = [];
  var now = new Date().toISOString();
  var note = { id: generateNoteId(), content: initialContent || '', sourceArticle: sourceArticle || '', createdAt: now, updatedAt: now };
  _activeNotebook.notes.unshift(note);
  _activeNotebook.updatedAt = now;
  saveNotebook(_activeNotebook);
  openNoteInPane(note.id);
  renderFileList();
  return note;
}

function deleteNote(noteId) {
  if (!_activeNotebook || !_activeNotebook.notes) return;
  _activeNotebook.notes = _activeNotebook.notes.filter(function(n) { return n.id !== noteId; });
  _activeNotebook.updatedAt = new Date().toISOString();
  saveNotebook(_activeNotebook);
  if (_activeNoteId === noteId) {
    var next = _activeNotebook.notes.length ? _activeNotebook.notes[0] : null;
    if (next) {
      openNoteInPane(next.id);
    } else {
      _activeNoteId = null;
      openNotebookInPane(_activeNotebook.id);
    }
  }
  renderFileList();
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

// Initialize notebook and show first note (or empty state) in content pane
function openNotebookInPane(id) {
  const nb = _notebooks[id];
  if (!nb) return;
  activeFile = null;
  var toc = document.getElementById('toc-container');
  if (toc) toc.innerHTML = '';
  var toolbar = document.getElementById('reader-toolbar');
  if (toolbar) toolbar.style.display = 'none';
  _activeNotebook = nb;
  if (!nb.notes) nb.notes = [];

  // Always render the sidebar so New Note button and notes list appear
  renderFileList();

  if (nb.notes.length && !_activeNoteId) {
    openNoteInPane(nb.notes[0].id);
  } else if (_activeNoteId) {
    openNoteInPane(_activeNoteId);
  } else {
    var content = document.getElementById('content');
    var empty = document.getElementById('empty-state');
    empty.style.display = 'none';
    content.style.display = 'block';
    document.title = 'Notebook — PullRead';
    document.getElementById('margin-notes').innerHTML = '';
    content.innerHTML = '<div class="notebook-empty"><p>No notes yet.</p>'
      + '<p><button class="new-note-btn" onclick="createNote()"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-plus"/></svg> New Note</button></p></div>';
  }
}

// Render a single note as a full-page editor in the content pane
function openNoteInPane(noteId) {
  if (!_activeNotebook) {
    // Re-initialize notebook (e.g. after Settings cleared it)
    getOrCreateSingleNotebook().then(function(nb) {
      _activeNotebook = nb;
      _sidebarView = 'notebooks'; syncSidebarTabs();
      renderFileList();
      openNoteInPane(noteId);
    });
    return;
  }
  var note = (_activeNotebook.notes || []).find(function(n) { return n.id === noteId; });
  if (!note) return;

  // Save previous note before switching
  if (_activeNoteId && _activeNoteId !== noteId) saveActiveNoteContent();

  activeFile = null;
  _activeNoteId = noteId;

  var content = document.getElementById('content');
  var empty = document.getElementById('empty-state');
  empty.style.display = 'none';
  content.style.display = 'block';
  document.getElementById('margin-notes').innerHTML = '';
  var toc = document.getElementById('toc-container');
  if (toc) toc.innerHTML = '';

  var nb = _activeNotebook;
  var firstLine = (note.content || '').split('\n')[0].replace(/^#+\s*/, '').trim() || 'Untitled Note';
  document.title = firstLine + ' — PullRead';

  updateSidebarActiveState(null);

  var html = '<div class="note-page" data-note-id="' + escapeHtml(note.id) + '">';

  // Article-style header
  html += '<div class="article-header">';
  html += '<input type="text" class="note-title-input" value="' + escapeHtml(firstLine === 'Untitled Note' ? '' : firstLine) + '" placeholder="Untitled Note" oninput="updateNoteTitle(this.value)">';
  html += '<div class="article-byline">';
  var bylineParts = ['<span>Note</span>'];
  if (note.updatedAt) bylineParts.push('<span>' + new Date(note.updatedAt).toLocaleDateString() + '</span>');
  if (note.sourceArticle) {
    var srcFile = allFiles.find(function(f) { return f.filename === note.sourceArticle; });
    var srcTitle = srcFile ? srcFile.title : note.sourceArticle;
    bylineParts.push('<a href="#" onclick="jumpToArticle(\'' + escapeHtml(note.sourceArticle) + '\');return false">' + escapeHtml(srcTitle) + '</a>');
  }
  html += bylineParts.join('<span class="sep">&middot;</span>');
  html += '</div>';

  // Action buttons
  html += '<div class="article-actions">';
  var previewLabel = _notebookPreviewMode ? 'Edit' : 'Preview';
  html += '<button onclick="toggleNotebookPreview()" class="' + (_notebookPreviewMode ? 'active-fav' : '') + '"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-pen"/></svg> ' + previewLabel + '</button>';
  html += '<button onclick="toggleWritingFocus()" class="' + (_writingFocusActive ? 'active-fav' : '') + '"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-focus"/></svg> Focus</button>';
  html += '<button onclick="showHighlightPicker()"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-pen"/></svg> Insert Highlights</button>';
  html += '<button onclick="toggleNotebookVoice(this)" id="nb-voice-btn" title="Dictate note"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-mic"/></svg> Dictate</button>';
  html += '<button onclick="checkNotebookGrammar()" id="grammar-check-btn"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-wand"/></svg> Grammar</button>';
  html += '<div class="share-dropdown" style="display:inline-block"><button onclick="toggleNotebookExportDropdown(event)"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-share"/></svg> Export\u2026</button></div>';
  html += '<button class="note-delete-btn" onclick="confirmDeleteNote(\'' + escapeHtml(note.id) + '\')" title="Delete note"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-xmark"/></svg> Delete</button>';
  html += '<span class="save-hint" id="notebook-save-hint" style="font-size:11px;color:var(--muted);margin-left:auto">Saved</span>';
  html += '</div>';
  html += '</div>';

  // Full-page editor or preview
  if (_notebookPreviewMode) {
    html += '<div class="notebook-preview">' + sanitizeHtml(marked.parse(note.content || '*Start writing...*')) + '</div>';
  } else {
    html += '<div class="notebook-editor-wrap"><div class="notebook-editor">'
      + '<textarea placeholder="Start writing... Use Markdown for formatting.">' + escapeHtml(note.content || '') + '</textarea>'
      + '</div></div>';
  }

  // Tags row (notebook-level)
  var nbTags = (nb.tags || []);
  html += '<div class="tags-row" style="margin-top:12px">';
  for (var ti = 0; ti < nbTags.length; ti++) {
    var t = nbTags[ti];
    html += '<span class="tag">' + escapeHtml(t) + '<span class="tag-remove" onclick="removeNotebookTag(\'' + escapeHtml(t.replace(/'/g, "\\'")) + '\')">&times;</span></span>';
  }
  html += '<input type="text" placeholder="Add tag..." onkeydown="handleNotebookTagKey(event)" style="flex:1;min-width:80px">';
  html += '</div>';
  html += '<div id="nb-tag-suggestions" class="nb-tag-suggestions" style="display:none"></div>';

  html += '</div>';
  content.innerHTML = html;

  document.getElementById('content-scroll').scrollTop = 0;

  // Render diagrams in preview mode
  if (_notebookPreviewMode) {
    renderDiagrams();
    applySyntaxHighlighting();
  }

  // Set up auto-grow, auto-save, focus tracking, and grammar mirror for textarea
  var ta = content.querySelector('.note-page .notebook-editor textarea');
  if (ta) {
    setupGrammarMirror(ta);
    autoGrowTextarea(ta);
    ta.addEventListener('input', function() {
      autoGrowTextarea(ta);
      notebookDebounceSave();
      updateWritingFocusLine();
      scheduleNotebookTagSuggestion();
      // Sync title input from first line of content
      var firstLine = (ta.value || '').split('\n')[0].replace(/^#+\s*/, '').trim();
      var titleInput = document.querySelector('.note-title-input');
      if (titleInput) titleInput.value = firstLine;
      var sidebarItem = document.querySelector('.note-item[data-note-id="' + _activeNoteId + '"] .file-item-title');
      if (sidebarItem) sidebarItem.textContent = firstLine || 'Empty note';
    });
    ta.addEventListener('click', updateWritingFocusLine);
    ta.addEventListener('keyup', updateWritingFocusLine);
    ta.addEventListener('scroll', updateWritingFocusLine);
    ta.focus();
  }
}

// Sync title input changes into the first line of the note content
function updateNoteTitle(value) {
  if (!_activeNotebook || !_activeNoteId) return;
  var note = _activeNotebook.notes.find(function(n) { return n.id === _activeNoteId; });
  if (!note) return;
  var lines = (note.content || '').split('\n');
  if (value.trim()) {
    var heading = '# ' + value.trim();
    if (lines.length && /^#+\s/.test(lines[0])) {
      lines[0] = heading;
    } else {
      lines.unshift(heading);
    }
  } else if (lines.length && /^#+\s/.test(lines[0])) {
    lines.shift();
  }
  note.content = lines.join('\n');
  note.updatedAt = new Date().toISOString();
  // Sync textarea if visible
  var ta = document.querySelector('.note-page .notebook-editor textarea');
  if (ta) ta.value = note.content;
  document.title = (value.trim() || 'Untitled Note') + ' — PullRead';
  // Update sidebar item title
  var sidebarItem = document.querySelector('.note-item[data-note-id="' + _activeNoteId + '"] .file-item-title');
  if (sidebarItem) sidebarItem.textContent = value.trim() || 'Empty note';
  notebookDebounceSave();
}

function confirmDeleteNote(noteId) {
  if (confirm('Delete this note?')) deleteNote(noteId);
}

// Save textarea content back to the active note's slot in the array
function saveActiveNoteContent() {
  if (!_activeNotebook || !_activeNoteId) return;
  var ta = document.querySelector('.note-page .notebook-editor textarea');
  if (!ta) return;
  var note = _activeNotebook.notes.find(function(n) { return n.id === _activeNoteId; });
  if (note) {
    note.content = ta.value;
    note.updatedAt = new Date().toISOString();
  }
}

function autoGrowTextarea(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.max(400, ta.scrollHeight) + 'px';
  // Keep grammar mirror height in sync
  var wrap = ta.closest('.notebook-editor-wrap');
  var mirror = wrap ? wrap.querySelector('.grammar-mirror') : null;
  if (mirror) mirror.style.height = ta.offsetHeight + 'px';
}

function notebookDebounceSave() {
  const hint = document.getElementById('notebook-save-hint');
  if (hint) hint.textContent = 'Saving...';
  clearTimeout(_notebookSaveTimeout);
  _notebookSaveTimeout = setTimeout(() => {
    if (!_activeNotebook) return;
    // Save active note content from textarea
    if (_activeNoteId) {
      var wfTa = document.getElementById('wf-textarea');
      var ta = wfTa || document.querySelector('.note-page .notebook-editor textarea');
      if (ta) {
        var note = _activeNotebook.notes.find(function(n) { return n.id === _activeNoteId; });
        if (note) {
          note.content = ta.value;
          note.updatedAt = new Date().toISOString();
        }
      }
    }
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
  const ta = document.querySelector('.note-page .notebook-editor textarea');
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
    if (_activeNoteId) openNoteInPane(_activeNoteId);
  }
}

// ---- Grammar Checking (macOS NSSpellChecker — fully on-device) ----

var _grammarDebounceTimeout = null;
var _grammarMirrorMatches = [];

// Set up a grammar mirror div behind the textarea for inline underlines
function setupGrammarMirror(textarea) {
  var wrap = textarea.closest('.notebook-editor-wrap');
  if (!wrap || wrap.querySelector('.grammar-mirror')) return;

  var mirror = document.createElement('div');
  mirror.className = 'grammar-mirror';
  // Insert before .notebook-editor so it renders behind the transparent textarea
  wrap.insertBefore(mirror, wrap.firstChild);

  // Sync scroll position
  textarea.addEventListener('scroll', function() {
    mirror.scrollTop = textarea.scrollTop;
  });

  // Run grammar on text changes (debounced)
  textarea.addEventListener('input', function() {
    clearTimeout(_grammarDebounceTimeout);
    _grammarDebounceTimeout = setTimeout(function() {
      runInlineGrammar(textarea);
    }, 1500);
  });
}

// Fetch grammar results and render underlines in the mirror div
async function runInlineGrammar(textarea) {
  if (!textarea || !textarea.value.trim()) {
    updateGrammarMirror(textarea, []);
    return;
  }
  var text = textarea.value;
  try {
    var res = await fetch('/api/grammar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    });
    if (!res.ok) return;
    var data = await res.json();
    var matches = (data.matches || []).map(function(m) {
      return {
        offset: m.offset,
        length: m.length,
        message: m.message || '',
        replacements: m.replacements || []
      };
    });
    _grammarMirrorMatches = matches;
    updateGrammarMirror(textarea, matches);
  } catch {}
}

// Render grammar errors as underlined spans in the mirror div
function updateGrammarMirror(textarea, matches) {
  var wrap = textarea ? textarea.closest('.notebook-editor-wrap') : null;
  var mirror = wrap ? wrap.querySelector('.grammar-mirror') : null;
  if (!mirror || !textarea) return;

  // Sync mirror sizing from textarea computed styles
  var cs = getComputedStyle(textarea);
  mirror.style.font = cs.font;
  mirror.style.lineHeight = cs.lineHeight;
  mirror.style.letterSpacing = cs.letterSpacing;
  mirror.style.padding = cs.padding;
  mirror.style.tabSize = cs.tabSize;
  mirror.style.width = textarea.offsetWidth + 'px';
  mirror.style.height = textarea.offsetHeight + 'px';

  var text = textarea.value;
  if (!matches || !matches.length) {
    mirror.textContent = text;
    return;
  }

  // Sort matches by offset, build HTML with <mark> spans around errors
  var sorted = matches.slice().sort(function(a, b) { return a.offset - b.offset; });
  var html = '';
  var pos = 0;
  for (var i = 0; i < sorted.length; i++) {
    var m = sorted[i];
    if (m.offset < pos) continue; // skip overlapping
    if (m.offset > pos) {
      html += escapeHtml(text.substring(pos, m.offset));
    }
    var errorText = text.substring(m.offset, m.offset + m.length);
    var fixes = (m.replacements || []).slice(0, 3).join('|');
    html += '<mark class="grammar-underline" data-offset="' + m.offset + '" data-length="' + m.length
      + '" data-msg="' + escapeHtml(m.message) + '" data-fixes="' + escapeHtml(fixes)
      + '">' + escapeHtml(errorText) + '</mark>';
    pos = m.offset + m.length;
  }
  if (pos < text.length) {
    html += escapeHtml(text.substring(pos));
  }
  mirror.innerHTML = html;
  mirror.scrollTop = textarea.scrollTop;
}

// Show tooltip when clicking a grammar underline
function showGrammarTooltip(mark) {
  // Remove any existing tooltip
  var old = document.querySelector('.grammar-tooltip');
  if (old) old.remove();

  var msg = mark.getAttribute('data-msg');
  var fixes = mark.getAttribute('data-fixes');
  var offset = parseInt(mark.getAttribute('data-offset'), 10);
  var length = parseInt(mark.getAttribute('data-length'), 10);

  var tip = document.createElement('div');
  tip.className = 'grammar-tooltip';
  var html = '<div class="grammar-tooltip-msg">' + escapeHtml(msg) + '</div>';
  if (fixes) {
    html += '<div class="grammar-tooltip-fixes">';
    var parts = fixes.split('|');
    for (var i = 0; i < parts.length; i++) {
      html += '<button class="grammar-fix-btn" data-offset="' + offset + '" data-length="' + length
        + '" data-fix="' + escapeHtml(parts[i]) + '">' + escapeHtml(parts[i]) + '</button>';
    }
    html += '</div>';
  }
  tip.innerHTML = html;

  // Position relative to the mark
  var rect = mark.getBoundingClientRect();
  tip.style.position = 'fixed';
  tip.style.left = rect.left + 'px';
  tip.style.top = (rect.bottom + 4) + 'px';
  document.body.appendChild(tip);

  // Handle fix button clicks
  tip.addEventListener('click', function(e) {
    var btn = e.target.closest('.grammar-fix-btn');
    if (!btn) return;
    var fixOffset = parseInt(btn.getAttribute('data-offset'), 10);
    var fixLength = parseInt(btn.getAttribute('data-length'), 10);
    var fixValue = btn.getAttribute('data-fix');
    applyGrammarFix(fixOffset, fixLength, fixValue);
    tip.remove();
    // Re-run inline grammar after fix
    var ta = document.querySelector('.note-page .notebook-editor textarea');
    if (ta) {
      clearTimeout(_grammarDebounceTimeout);
      _grammarDebounceTimeout = setTimeout(function() { runInlineGrammar(ta); }, 300);
    }
  });

  // Close on click outside
  setTimeout(function() {
    document.addEventListener('click', function close(e) {
      if (!tip.contains(e.target)) { tip.remove(); document.removeEventListener('click', close); }
    });
  }, 0);
}

// Delegate click on grammar-underline marks
document.addEventListener('click', function(e) {
  var mark = e.target.closest('.grammar-underline');
  if (mark) {
    e.stopPropagation();
    showGrammarTooltip(mark);
  }
});

async function checkNotebookGrammar() {
  var ta = document.querySelector('.note-page .notebook-editor textarea');
  if (!ta || !ta.value.trim()) return;
  var btn = document.getElementById('grammar-check-btn');
  if (btn) btn.textContent = 'Checking\u2026';

  var text = ta.value;
  try {
    var res = await fetch('/api/grammar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    });
    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      throw new Error(err.error || 'Grammar check unavailable');
    }
    var data = await res.json();
    var raw = data.matches || [];

    var normalizedForMirror = raw.map(function(m) {
      return { offset: m.offset, length: m.length, message: m.message || '', replacements: m.replacements || [] };
    });
    _grammarMirrorMatches = normalizedForMirror;
    updateGrammarMirror(ta, normalizedForMirror);

    // Also show the panel below
    var matches = raw.map(function(m) {
      return {
        offset: m.offset,
        length: m.length,
        message: m.message || '',
        context: { text: text, offset: m.offset, length: m.length },
        replacements: (m.replacements || []).map(function(r) { return { value: r }; })
      };
    });
    showGrammarResults(matches, ta);
  } catch (err) {
    alert('Grammar check failed: ' + err.message);
  }
  if (btn) btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#i-wand"/></svg> Grammar';
}

function showGrammarResults(matches, textarea) {
  // Remove any existing grammar panel
  var existing = document.getElementById('grammar-results');
  if (existing) existing.remove();

  if (!matches.length) {
    var hint = document.createElement('div');
    hint.id = 'grammar-results';
    hint.className = 'grammar-results';
    hint.innerHTML = '<span style="color:var(--muted)">No issues found.</span>';
    textarea.parentElement.after(hint);
    setTimeout(function() { hint.remove(); }, 3000);
    return;
  }

  var panel = document.createElement('div');
  panel.id = 'grammar-results';
  panel.className = 'grammar-results';
  var html = '<div class="grammar-header"><span>' + matches.length + ' suggestion' + (matches.length !== 1 ? 's' : '') + '</span>'
    + '<button onclick="this.parentElement.parentElement.remove()" class="nb-suggest-dismiss">&times;</button></div>';

  for (var i = 0; i < Math.min(matches.length, 10); i++) {
    var m = matches[i];
    var context = m.context || {};
    var before = escapeHtml((context.text || '').substring(Math.max(0, context.offset - 10), context.offset));
    var errorText = escapeHtml((context.text || '').substring(context.offset, context.offset + context.length));
    var after = escapeHtml((context.text || '').substring(context.offset + context.length, context.offset + context.length + 10));
    var replacements = (m.replacements || []).slice(0, 3).map(function(r) { return escapeHtml(r.value); });

    html += '<div class="grammar-item">'
      + '<div class="grammar-context">' + before + '<span class="grammar-error">' + errorText + '</span>' + after + '</div>'
      + '<div class="grammar-message">' + escapeHtml(m.message || '') + '</div>';
    if (replacements.length) {
      html += '<div class="grammar-fixes">';
      for (var j = 0; j < replacements.length; j++) {
        html += '<button class="grammar-fix-btn" onclick="applyGrammarFix(' + m.offset + ',' + m.length + ',\'' + escapeJsStr(replacements[j]) + '\')">' + replacements[j] + '</button>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  panel.innerHTML = html;
  textarea.parentElement.after(panel);
}

function applyGrammarFix(offset, length, replacement) {
  var ta = document.querySelector('.note-page .notebook-editor textarea');
  if (!ta || !_activeNotebook) return;
  var text = ta.value;
  ta.value = text.substring(0, offset) + replacement + text.substring(offset + length);
  notebookDebounceSave();
  // Remove grammar panel (results are stale after edit)
  var panel = document.getElementById('grammar-results');
  if (panel) panel.remove();
  // Clear inline underlines (stale after edit), re-check after short delay
  _grammarMirrorMatches = [];
  updateGrammarMirror(ta, []);
  clearTimeout(_grammarDebounceTimeout);
  _grammarDebounceTimeout = setTimeout(function() { runInlineGrammar(ta); }, 500);
}

// ---- Voice Dictation for Notebook Notes ----
let _nbVoiceRecognition = null;

function toggleNotebookVoice(btn) {
  if (_nbVoiceRecognition) {
    _nbVoiceRecognition.stop();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Speech recognition is not supported in this browser. Try Chrome or Safari.');
    return;
  }

  const ta = document.querySelector('.note-page .notebook-editor textarea');
  if (!ta) return;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';

  let finalTranscript = '';
  const originalText = ta.value;

  recognition.onstart = function() {
    _nbVoiceRecognition = recognition;
    btn.classList.add('recording');
    btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#i-stop"/></svg> Stop';
  };

  recognition.onresult = function(event) {
    finalTranscript = '';
    let interim = '';
    for (let i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    const separator = originalText && !originalText.endsWith('\n') && !originalText.endsWith(' ') ? '\n' : '';
    ta.value = originalText + (finalTranscript || interim ? separator : '') + finalTranscript + interim;
    ta.scrollTop = ta.scrollHeight;
    autoGrowTextarea(ta);
  };

  recognition.onend = function() {
    _nbVoiceRecognition = null;
    btn.classList.remove('recording');
    btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#i-mic"/></svg> Dictate';
    if (finalTranscript.trim()) {
      notebookDebounceSave();
    }
  };

  recognition.onerror = function(event) {
    if (event.error === 'not-allowed') {
      alert('Microphone access was denied. Please allow microphone access in your browser settings.');
    }
    _nbVoiceRecognition = null;
    btn.classList.remove('recording');
    btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#i-mic"/></svg> Dictate';
  };

  recognition.start();
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
  saveActiveNoteContent();
  _notebookPreviewMode = !_notebookPreviewMode;
  if (_activeNoteId) {
    openNoteInPane(_activeNoteId);
  }
}

// Concatenate all notes with --- separators for export
function getAllNotesContent(nb) {
  if (!nb.notes || !nb.notes.length) return '';
  return nb.notes.map(function(n) { return n.content || ''; }).filter(function(c) { return c.trim(); }).join('\n\n---\n\n');
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
  md += getAllNotesContent(nb) + '\n';

  var filename = (nb.title || 'notebook').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.md';
  prSaveFile(md, filename, 'text/markdown;charset=utf-8').then(function(saved) {
    if (saved) showToast('Notebook exported');
  });
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
  var bodyHtml = sanitizeHtml(marked.parse(getAllNotesContent(nb) || ''));
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
  var content = '<h1>' + escapeHtml(nb.title || 'Untitled') + '</h1>'
    + '<div class="meta">Notebook' + (nb.updatedAt ? ' &middot; Updated ' + new Date(nb.updatedAt).toLocaleDateString() : '') + '</div>'
    + bodyHtml + sourcesHtml + tagsHtml;

  prPrintHtml(content);
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
          groupsHtml += '<div class="hl-picker-item" data-filename="' + escapeHtml(hl.filename) + '" data-text="' + escapeHtml(hl.text) + '" onclick="this.classList.toggle(\'selected\')">'
            + colorDot
            + '<span class="hl-picker-item-text">' + escapeHtml(hl.text.slice(0, 200)) + '</span>'
            + '</div>';
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
  const selected = overlay.querySelectorAll('.hl-picker-item.selected');
  if (!selected.length) { overlay.remove(); return; }

  let insertText = '';
  const newSources = new Set(_activeNotebook.sources || []);
  for (const item of selected) {
    const text = item.dataset.text;
    const filename = item.dataset.filename;
    insertText += '\n> ' + text + '\n';
    newSources.add(filename);
  }

  _activeNotebook.sources = Array.from(newSources);

  const ta = document.querySelector('.note-page .notebook-editor textarea');
  if (ta) {
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const after = ta.value.slice(pos);
    ta.value = before + insertText + '\n' + after;
    autoGrowTextarea(ta);
  }

  overlay.remove();
  notebookDebounceSave();
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

  // Add as a new note in the shared notebook
  getOrCreateSingleNotebook().then(function(nb) {
    if (!nb.notes) nb.notes = [];
    var now = new Date().toISOString();
    var note = { id: generateNoteId(), content: snippet.trim(), sourceArticle: activeFile, createdAt: now, updatedAt: now };
    nb.notes.unshift(note);
    if (!nb.sources) nb.sources = [];
    if (nb.sources.indexOf(activeFile) < 0) nb.sources.push(activeFile);
    nb.updatedAt = now;
    saveNotebook(nb).then(function() {
      _activeNotebook = nb;
      _notebookPreviewMode = false;
      _sidebarView = 'notebooks';
      syncSidebarTabs();
      openNoteInPane(note.id);
      renderFileList();
    });
  });
}

// Notebook tag handlers (uses shared handleTagInput from utils)
function handleNotebookTagKey(e) {
  if (!_activeNotebook) return;
  handleTagInput(e,
    function() { if (!_activeNotebook.tags) _activeNotebook.tags = []; return _activeNotebook.tags; },
    function() { saveNotebook(_activeNotebook); if (_activeNoteId) openNoteInPane(_activeNoteId); }
  );
}

function removeNotebookTag(tag) {
  if (!_activeNotebook || !_activeNotebook.tags) return;
  _activeNotebook.tags = _activeNotebook.tags.filter(function(t) { return t !== tag; });
  saveNotebook(_activeNotebook);
  if (_activeNoteId) openNoteInPane(_activeNoteId);
}

