// ---- Notebook ---- (synthesis writing surface — per-note model)
let _notebooks = {};
let _activeNotebook = null;
let _activeNote = null;
let _notebookSaveTimeout = null;
let _notebookPreviewMode = false;
const SINGLE_NOTEBOOK_ID = 'nb-shared';

// Generate a unique note ID
function generateNoteId() {
  return 'note-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

// Extract title from first # heading in markdown content
function extractTitleFromContent(content) {
  if (!content) return '';
  var match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

// Get or create the single shared notebook, with migration support
async function getOrCreateSingleNotebook() {
  await loadNotebooks();
  var nb = _notebooks[SINGLE_NOTEBOOK_ID];

  // If it exists and already has notes array, return as-is
  if (nb && Array.isArray(nb.notes)) return nb;

  // Migrate: collect all existing notebooks
  var existing = Object.values(_notebooks).sort(function(a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
  var notes = [];
  var sources = [];
  var tags = [];

  for (var i = 0; i < existing.length; i++) {
    var old = existing[i];
    if (old.sources) sources = sources.concat(old.sources);
    if (old.tags) tags = tags.concat(old.tags);

    // If old notebook already has notes array, merge them in
    if (Array.isArray(old.notes) && old.notes.length) {
      notes = notes.concat(old.notes);
    }
    // If old notebook has content blob, split on --- into discrete notes
    else if (old.content && old.content.trim()) {
      var sections = old.content.split(/\n---\n/).filter(function(s) { return s.trim(); });
      for (var si = 0; si < sections.length; si++) {
        var sectionContent = sections[si].trim();
        var title = extractTitleFromContent(sectionContent) || 'Untitled';
        // Try to find a sourceArticle from the "Notes on:" pattern
        var sourceMatch = sectionContent.match(/^##?\s+Notes on:\s*(.+)$/m);
        var sourceArticle = null;
        if (sourceMatch) {
          var artTitle = sourceMatch[1].trim();
          var f = (typeof allFiles !== 'undefined' ? allFiles : []).find(function(ff) { return ff.title === artTitle; });
          if (f) sourceArticle = f.filename;
        }
        notes.push({
          id: generateNoteId(),
          content: sectionContent,
          sourceArticle: sourceArticle,
          createdAt: old.createdAt || new Date().toISOString(),
          updatedAt: old.updatedAt || new Date().toISOString()
        });
      }
    }
  }

  nb = {
    id: SINGLE_NOTEBOOK_ID,
    title: 'Notebook',
    notes: notes,
    sources: [].concat(new Set(sources)),
    tags: [].concat(new Set(tags)),
    createdAt: existing.length ? existing[0].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  // Deduplicate sources and tags
  nb.sources = nb.sources.filter(function(v, i, a) { return a.indexOf(v) === i; });
  nb.tags = nb.tags.filter(function(v, i, a) { return a.indexOf(v) === i; });

  await saveNotebook(nb);
  // Clean up old notebooks
  for (var ci = 0; ci < existing.length; ci++) {
    if (existing[ci].id && existing[ci].id !== SINGLE_NOTEBOOK_ID) {
      try { await fetch('/api/notebooks?id=' + encodeURIComponent(existing[ci].id), { method: 'DELETE' }); } catch(e) {}
      delete _notebooks[existing[ci].id];
    }
  }
  return nb;
}

async function loadNotebooks() {
  try {
    var res = await fetch('/api/notebooks');
    if (res.ok) _notebooks = await res.json();
  } catch(e) {}
}

async function saveNotebook(nb) {
  try {
    var res = await fetch('/api/notebooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nb)
    });
    if (res.ok) {
      var data = await res.json();
      if (!nb.id) nb.id = data.id;
      _notebooks[nb.id] = nb;
    }
  } catch(e) {}
}

async function deleteNotebook(id) {
  try {
    await fetch('/api/notebooks?id=' + encodeURIComponent(id), { method: 'DELETE' });
    delete _notebooks[id];
    _activeNotebook = null;
    _activeNote = null;
    renderFileList();
    goHome();
  } catch(e) {}
}

// ---- Note CRUD ----

function createNewNote(sourceArticle) {
  getOrCreateSingleNotebook().then(function(nb) {
    var note = {
      id: generateNoteId(),
      content: '',
      sourceArticle: sourceArticle || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    nb.notes.push(note);
    nb.updatedAt = new Date().toISOString();
    saveNotebook(nb).then(function() {
      _activeNotebook = nb;
      _activeNote = note;
      _notebookPreviewMode = false;
      _sidebarView = 'notebooks';
      syncSidebarTabs();
      renderFileList();
      openNoteInPane(note.id);
    });
  });
}

function deleteNote(noteId) {
  if (!_activeNotebook) return;
  var nb = _activeNotebook;
  var idx = nb.notes.findIndex(function(n) { return n.id === noteId; });
  if (idx < 0) return;
  nb.notes.splice(idx, 1);
  nb.updatedAt = new Date().toISOString();
  saveNotebook(nb).then(function() {
    // Open the next note, or previous, or empty state
    if (nb.notes.length > 0) {
      var nextIdx = Math.min(idx, nb.notes.length - 1);
      _activeNote = nb.notes[nextIdx];
      openNoteInPane(_activeNote.id);
    } else {
      _activeNote = null;
      renderFileList();
      goHome();
    }
  });
}

// Find a note by ID in the active notebook
function findNote(noteId) {
  if (!_activeNotebook || !_activeNotebook.notes) return null;
  return _activeNotebook.notes.find(function(n) { return n.id === noteId; });
}

// ---- Open notebook (shows notes list or opens first note) ----

function showNotebook(openId) {
  getOrCreateSingleNotebook().then(function(nb) {
    _activeNotebook = nb;
    renderFileList();
    // Open the first note if there are any
    if (nb.notes && nb.notes.length > 0) {
      // If _activeNote is set and still valid, keep it; otherwise open the most recent
      var valid = _activeNote && nb.notes.find(function(n) { return n.id === _activeNote.id; });
      if (!valid) {
        var sorted = nb.notes.slice().sort(function(a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
        _activeNote = sorted[0];
      }
      openNoteInPane(_activeNote.id);
    } else {
      showNotebookEmpty();
    }
  });
}

function showNotebookEmpty() {
  activeFile = null;
  var content = document.getElementById('content');
  var empty = document.getElementById('empty-state');
  empty.style.display = 'none';
  content.style.display = 'block';
  content.innerHTML = '<div class="notebook-empty">'
    + '<svg class="icon" style="width:48px;height:48px;color:var(--muted);margin-bottom:12px" aria-hidden="true"><use href="#i-book"/></svg>'
    + '<p style="font-size:16px;font-weight:600">No notes yet</p>'
    + '<p>Create a note to start writing, or use "Write About This" from an article.</p>'
    + '<button onclick="createNewNote()" style="margin-top:12px;padding:8px 20px;border:none;border-radius:8px;background:var(--link);color:#fff;font-size:13px;cursor:pointer;font-family:inherit">+ New Note</button>'
    + '</div>';
}

// ---- Render a single note in the content pane ----

function openNoteInPane(noteId) {
  var note = findNote(noteId);
  if (!note) return;
  activeFile = null;
  _activeNote = note;

  var content = document.getElementById('content');
  var empty = document.getElementById('empty-state');
  empty.style.display = 'none';
  content.style.display = 'block';

  // Derive title from first # heading in content
  var noteTitle = extractTitleFromContent(note.content) || 'Untitled';
  document.title = noteTitle + ' — PullRead';
  document.getElementById('margin-notes').innerHTML = '';
  renderFileList();

  var nb = _activeNotebook;
  var html = '';

  // Article-style header
  html += '<div class="article-header">';
  html += '<input class="notebook-title-input" value="' + escapeHtml(noteTitle) + '" placeholder="Untitled" oninput="syncNoteTitleFromInput(this)">';
  html += '<div class="article-byline">';
  var bylineParts = [];
  bylineParts.push('<span>Note</span>');
  if (note.updatedAt) bylineParts.push('<span>Updated ' + new Date(note.updatedAt).toLocaleDateString() + '</span>');
  if (note.sourceArticle) {
    var srcFile = allFiles.find(function(f) { return f.filename === note.sourceArticle; });
    if (srcFile) bylineParts.push('<span class="notebook-source-chip" onclick="jumpToArticle(\'' + escapeHtml(note.sourceArticle) + '\')">' + escapeHtml(srcFile.domain || srcFile.title) + '</span>');
  }
  html += bylineParts.join('<span class="sep">&middot;</span>');
  html += '</div>';

  // Action buttons
  html += '<div class="article-actions">';
  var previewLabel = _notebookPreviewMode ? 'Edit' : 'Preview';
  html += '<button onclick="toggleNotebookPreview()" class="' + (_notebookPreviewMode ? 'active-fav' : '') + '"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-pen"/></svg> ' + previewLabel + '</button>';
  html += '<button onclick="toggleWritingFocus()" class="' + (_writingFocusActive ? 'active-fav' : '') + '"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-focus"/></svg> Focus</button>';
  html += '<button onclick="showHighlightPicker()"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-pen"/></svg> Insert Highlights</button>';
  html += '<button onclick="checkNotebookGrammar()" id="grammar-check-btn"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-wand"/></svg> Grammar</button>';
  html += '<div class="share-dropdown" style="display:inline-block"><button onclick="toggleNotebookExportDropdown(event)"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-share"/></svg> Export\u2026</button></div>';
  html += '<button onclick="deleteNote(\'' + escapeHtml(note.id) + '\')" style="color:var(--muted)" title="Delete this note"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-xmark"/></svg> Delete</button>';
  html += '<span class="save-hint" id="notebook-save-hint" style="font-size:11px;color:var(--muted);margin-left:auto">Saved</span>';
  html += '</div>';
  html += '</div>';

  // Content body
  if (_notebookPreviewMode) {
    html += '<div class="notebook-preview">' + marked.parse(note.content || '*Start writing...*') + '</div>';
  } else {
    html += '<div class="notebook-editor-wrap"><div class="notebook-editor">'
      + '<textarea placeholder="Start writing... Use markdown for formatting.">' + escapeHtml(note.content || '') + '</textarea>'
      + '</div></div>';
  }

  // Tags (notebook-level)
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

  // Render diagrams in preview mode
  if (_notebookPreviewMode) {
    renderDiagrams();
    applySyntaxHighlighting();
  }

  // Set up textarea events
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

// Sync note title from the input field — updates first # heading in content
function syncNoteTitleFromInput(input) {
  if (!_activeNote) return;
  var newTitle = input.value.trim();
  var ta = document.querySelector('.notebook-editor textarea');
  if (ta) {
    var content = ta.value;
    // Replace or insert first # heading
    var headingMatch = content.match(/^(#\s+)(.*)$/m);
    if (headingMatch) {
      ta.value = content.replace(/^#\s+.*$/m, '# ' + newTitle);
    } else {
      ta.value = '# ' + newTitle + '\n\n' + content;
    }
    _activeNote.content = ta.value;
    autoGrowTextarea(ta);
  }
  notebookDebounceSave();
  renderFileList();
}

function autoGrowTextarea(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.max(400, ta.scrollHeight) + 'px';
}

// ---- Auto-save (debounced 800ms) ----

function notebookDebounceSave() {
  var hint = document.getElementById('notebook-save-hint');
  if (hint) hint.textContent = 'Saving\u2026';
  clearTimeout(_notebookSaveTimeout);
  _notebookSaveTimeout = setTimeout(function() {
    if (!_activeNotebook || !_activeNote) return;
    // Read content from full-screen focus textarea if active, else inline editor
    var wfTa = document.getElementById('wf-textarea');
    var ta = wfTa || document.querySelector('.notebook-editor textarea');
    if (ta) {
      _activeNote.content = ta.value;
      // Sync title in sidebar from first heading
      var extracted = extractTitleFromContent(ta.value);
      if (extracted) {
        var titleInput = document.querySelector('.notebook-title-input');
        if (titleInput && titleInput.value !== extracted) titleInput.value = extracted;
      }
    }
    _activeNote.updatedAt = new Date().toISOString();
    _activeNotebook.updatedAt = new Date().toISOString();
    saveNotebook(_activeNotebook).then(function() {
      if (hint) hint.textContent = 'Saved';
      renderFileList();
    });
  }, 800);
}

// ---- AI tag suggestions ----

var _nbTagSuggestTimeout = null;
var _nbLastSuggestedContent = '';

function scheduleNotebookTagSuggestion() {
  clearTimeout(_nbTagSuggestTimeout);
  if (!_activeNotebook || !_activeNote || !serverMode) return;
  var ta = document.querySelector('.notebook-editor textarea');
  if (!ta) return;
  var text = ta.value || '';
  var paragraphs = text.split(/\n\s*\n/).filter(function(p) { return p.trim().length > 20; });
  if (paragraphs.length < 2) return;
  if (text === _nbLastSuggestedContent) return;
  _nbTagSuggestTimeout = setTimeout(function() {
    _nbLastSuggestedContent = text;
    fetchNotebookTagSuggestions(text);
  }, 10000);
}

async function fetchNotebookTagSuggestions(text) {
  var container = document.getElementById('nb-tag-suggestions');
  if (!container || !_activeNotebook) return;
  try {
    var res = await fetch('/api/autotag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    });
    if (!res.ok) return;
    var data = await res.json();
    var suggestions = (data.machineTags || []).slice(0, 3);
    if (!suggestions.length) { container.style.display = 'none'; return; }
    var existing = new Set((_activeNotebook.tags || []).map(function(t) { return t.toLowerCase(); }));
    var filtered = suggestions.filter(function(t) { return !existing.has(t.toLowerCase()); });
    if (!filtered.length) { container.style.display = 'none'; return; }
    var html = '<span class="nb-suggest-label">Suggested tags:</span> ';
    for (var i = 0; i < filtered.length; i++) {
      html += '<button class="nb-suggest-pill" onclick="acceptNotebookTagSuggestion(\'' + escapeHtml(filtered[i].replace(/'/g, "\\'")) + '\',this)">'
        + escapeHtml(filtered[i]) + ' <span class="nb-suggest-accept">+</span></button> ';
    }
    html += '<button class="nb-suggest-dismiss" onclick="this.parentElement.style.display=\'none\'" title="Dismiss">&times;</button>';
    container.innerHTML = html;
    container.style.display = '';
  } catch(e) {}
}

function acceptNotebookTagSuggestion(tag, btn) {
  if (!_activeNotebook) return;
  if (!_activeNotebook.tags) _activeNotebook.tags = [];
  if (!_activeNotebook.tags.includes(tag)) {
    _activeNotebook.tags.push(tag);
    saveNotebook(_activeNotebook);
    if (_activeNote) openNoteInPane(_activeNote.id);
  }
}

// ---- Grammar Checking (macOS NSSpellChecker — fully on-device) ----

async function checkNotebookGrammar() {
  var ta = document.querySelector('.notebook-editor textarea');
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
  } catch(err) {
    alert('Grammar check failed: ' + err.message);
  }
  if (btn) btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#i-wand"/></svg> Grammar';
}

function showGrammarResults(matches, textarea) {
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
  var ta = document.querySelector('.notebook-editor textarea');
  if (!ta || !_activeNote) return;
  var text = ta.value;
  ta.value = text.substring(0, offset) + replacement + text.substring(offset + length);
  _activeNote.content = ta.value;
  notebookDebounceSave();
  var panel = document.getElementById('grammar-results');
  if (panel) panel.remove();
}

function openNotebookEditor(id) {
  _notebookPreviewMode = false;
  showNotebook(id);
}

function createNewNotebook() {
  openSingleNotebook();
}

function toggleNotebookPreview() {
  var ta = document.querySelector('.notebook-editor textarea');
  if (ta && _activeNote) _activeNote.content = ta.value;
  _notebookPreviewMode = !_notebookPreviewMode;
  if (_activeNote) openNoteInPane(_activeNote.id);
  else showNotebook();
}

// ---- Export ----

function exportNotebook() {
  if (!_activeNotebook) return;
  var nb = _activeNotebook;

  var fm = '---\n';
  fm += 'title: "' + (nb.title || 'Untitled').replace(/"/g, '\\"') + '"\n';
  fm += 'type: notebook\n';
  if (nb.createdAt) fm += 'created: ' + nb.createdAt.slice(0, 10) + '\n';
  if (nb.updatedAt) fm += 'updated: ' + nb.updatedAt.slice(0, 10) + '\n';
  if (nb.tags && nb.tags.length) {
    fm += 'tags:\n';
    for (var i = 0; i < nb.tags.length; i++) fm += '  - ' + nb.tags[i] + '\n';
  }
  if (nb.sources && nb.sources.length) {
    fm += 'sources:\n';
    for (var i = 0; i < nb.sources.length; i++) {
      var f = allFiles.find(function(ff) { return ff.filename === nb.sources[i]; });
      var title = f ? f.title : nb.sources[i];
      fm += '  - "' + title.replace(/"/g, '\\"') + '"\n';
    }
  }
  fm += '---\n\n';

  var md = fm;
  // Concatenate all notes with --- separators
  var notes = nb.notes || [];
  for (var ni = 0; ni < notes.length; ni++) {
    if (ni > 0) md += '\n\n---\n\n';
    md += (notes[ni].content || '');
  }
  md += '\n';

  var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (nb.title || 'notebook').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportSingleNote() {
  if (!_activeNote) return;
  var note = _activeNote;
  var title = extractTitleFromContent(note.content) || 'Untitled';

  var fm = '---\n';
  fm += 'title: "' + title.replace(/"/g, '\\"') + '"\n';
  fm += 'type: note\n';
  if (note.createdAt) fm += 'created: ' + note.createdAt.slice(0, 10) + '\n';
  if (note.updatedAt) fm += 'updated: ' + note.updatedAt.slice(0, 10) + '\n';
  if (note.sourceArticle) {
    var f = allFiles.find(function(ff) { return ff.filename === note.sourceArticle; });
    fm += 'source: "' + ((f ? f.title : note.sourceArticle) || '').replace(/"/g, '\\"') + '"\n';
  }
  fm += '---\n\n';

  var md = fm + (note.content || '') + '\n';

  var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.md';
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
  items += '<button onclick="exportSingleNote();this.closest(\'.nb-export-panel\').remove()">Export Note .md</button>';
  items += '<button onclick="exportNotebook();this.closest(\'.nb-export-panel\').remove()">Export All Notes .md</button>';
  items += '<button onclick="exportNotebookPdf();this.closest(\'.nb-export-panel\').remove()">Export Note .pdf</button>';
  panel.innerHTML = items;
  btn.closest('.share-dropdown').appendChild(panel);
  setTimeout(function() {
    document.addEventListener('click', function close() {
      panel.remove();
      document.removeEventListener('click', close);
    }, { once: true });
  }, 0);
}

function exportNotebookPdf() {
  if (!_activeNote) return;
  var note = _activeNote;
  var title = extractTitleFromContent(note.content) || 'Untitled';
  var win = window.open('', '_blank');
  if (!win) { alert('Please allow popups to export as PDF.'); return; }
  var bodyHtml = marked.parse(note.content || '');
  var sourceHtml = '';
  if (note.sourceArticle) {
    var f = allFiles.find(function(ff) { return ff.filename === note.sourceArticle; });
    if (f) sourceHtml = '<hr><p><strong>Source:</strong> ' + escapeHtml(f.title) + '</p>';
  }
  win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title>'
    + '<style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.7;color:#222}'
    + 'h1{font-size:28px;margin-bottom:4px}h2,h3{margin-top:1.5em}'
    + 'blockquote{border-left:3px solid #ccc;margin:1em 0;padding:0.5em 1em;color:#555}'
    + 'code{background:#f5f5f5;padding:2px 4px;border-radius:3px;font-size:0.9em}'
    + 'pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto}'
    + '.meta{font-size:13px;color:#888;margin-bottom:24px}'
    + '@media print{body{margin:0;max-width:none}}</style></head><body>'
    + '<h1>' + escapeHtml(title) + '</h1>'
    + '<div class="meta">Note' + (note.updatedAt ? ' &middot; Updated ' + new Date(note.updatedAt).toLocaleDateString() : '') + '</div>'
    + bodyHtml + sourceHtml
    + '<script>window.onload=function(){window.print();}<\/script>'
    + '</body></html>');
  win.document.close();
}

// ---- Highlight Picker ----

function showHighlightPicker() {
  if (!_activeNote) return;

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var entries = Object.entries(allHighlightsIndex).filter(function(e) { return e[1] && e[1].length > 0; });
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
  allHlItems.sort(function(a, b) { return b.date.localeCompare(a.date); });

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
    + '<p style="color:var(--muted);font-size:13px;margin-bottom:12px">Select highlights to insert as blockquotes into your note.</p>'
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
  var groups = document.querySelectorAll('.hl-picker-group');
  for (var g = 0; g < groups.length; g++) {
    var visible = groups[g].querySelectorAll('.hl-picker-item:not([style*="display: none"])');
    groups[g].style.display = visible.length ? '' : 'none';
  }
  var dateGroupEls = document.querySelectorAll('.hl-picker-date-group');
  for (var d = 0; d < dateGroupEls.length; d++) {
    var visibleGroups = dateGroupEls[d].querySelectorAll('.hl-picker-group:not([style*="display: none"])');
    dateGroupEls[d].style.display = visibleGroups.length ? '' : 'none';
  }
}

function insertSelectedHighlights() {
  var overlay = document.querySelector('.modal-overlay');
  if (!overlay) return;
  var checked = overlay.querySelectorAll('input[type=checkbox]:checked');
  if (!checked.length) { overlay.remove(); return; }

  var insertText = '';
  var newSources = new Set(_activeNotebook.sources || []);
  for (var ci = 0; ci < checked.length; ci++) {
    var text = checked[ci].dataset.text;
    var filename = checked[ci].dataset.filename;
    insertText += '\n> ' + text + '\n';
    newSources.add(filename);
    // Also link the source article to this note if not already set
    if (!_activeNote.sourceArticle) _activeNote.sourceArticle = filename;
  }

  _activeNotebook.sources = Array.from(newSources);

  var ta = document.querySelector('.notebook-editor textarea');
  if (ta) {
    var pos = ta.selectionStart;
    var before = ta.value.slice(0, pos);
    var after = ta.value.slice(pos);
    ta.value = before + insertText + '\n' + after;
    _activeNote.content = ta.value;
    autoGrowTextarea(ta);
  }

  overlay.remove();
  notebookDebounceSave();
  setTimeout(function() { if (_activeNote) openNoteInPane(_activeNote.id); }, 900);
}

// ---- Article → Notebook pipeline ----

function startNotebookFromArticle() {
  var panel = document.querySelector('.share-dropdown-panel');
  if (panel) panel.remove();

  if (!activeFile) return;

  var file = allFiles.find(function(f) { return f.filename === activeFile; });
  var title = file ? file.title : activeFile;

  var snippet = '## Notes on: ' + title + '\n\n';
  if (articleHighlights.length) {
    for (var i = 0; i < articleHighlights.length; i++) {
      snippet += '> ' + articleHighlights[i].text + '\n\n';
      if (articleHighlights[i].note) snippet += '*' + articleHighlights[i].note + '*\n\n';
    }
  }
  if (articleNotes.articleNote) {
    snippet += articleNotes.articleNote + '\n\n';
  }

  var sourceFilename = activeFile;

  getOrCreateSingleNotebook().then(function(nb) {
    // Create a new note for this article
    var note = {
      id: generateNoteId(),
      content: snippet,
      sourceArticle: sourceFilename,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    nb.notes.push(note);
    if (!nb.sources) nb.sources = [];
    if (nb.sources.indexOf(sourceFilename) < 0) nb.sources.push(sourceFilename);
    nb.updatedAt = new Date().toISOString();
    saveNotebook(nb).then(function() {
      _activeNotebook = nb;
      _activeNote = note;
      _notebookPreviewMode = false;
      _sidebarView = 'notebooks';
      syncSidebarTabs();
      renderFileList();
      openNoteInPane(note.id);
    });
  });
}

// ---- Tag handlers ----

function handleNotebookTagKey(e) {
  if (!_activeNotebook) return;
  handleTagInput(e,
    function() { if (!_activeNotebook.tags) _activeNotebook.tags = []; return _activeNotebook.tags; },
    function() { notebookDebounceSave(); if (_activeNote) openNoteInPane(_activeNote.id); else showNotebook(); }
  );
}

function removeNotebookTag(tag) {
  if (!_activeNotebook || !_activeNotebook.tags) return;
  _activeNotebook.tags = _activeNotebook.tags.filter(function(t) { return t !== tag; });
  notebookDebounceSave();
  if (_activeNote) openNoteInPane(_activeNote.id);
  else showNotebook();
}
