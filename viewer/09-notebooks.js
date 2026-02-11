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
  html += '<button onclick="checkNotebookGrammar()" id="grammar-check-btn"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-wand"/></svg> Grammar</button>';
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

    // Normalize to the shape showGrammarResults expects
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
  var ta = document.querySelector('.notebook-editor textarea');
  if (!ta || !_activeNotebook) return;
  var text = ta.value;
  ta.value = text.substring(0, offset) + replacement + text.substring(offset + length);
  _activeNotebook.content = ta.value;
  notebookDebounceSave();
  // Remove grammar panel (results are stale after edit)
  var panel = document.getElementById('grammar-results');
  if (panel) panel.remove();
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

// Notebook tag handlers (uses shared handleTagInput from utils)
function handleNotebookTagKey(e) {
  if (!_activeNotebook) return;
  handleTagInput(e,
    function() { if (!_activeNotebook.tags) _activeNotebook.tags = []; return _activeNotebook.tags; },
    function() { notebookDebounceSave(); showNotebook(_activeNotebook.id); }
  );
}

function removeNotebookTag(tag) {
  if (!_activeNotebook || !_activeNotebook.tags) return;
  _activeNotebook.tags = _activeNotebook.tags.filter(function(t) { return t !== tag; });
  notebookDebounceSave();
  showNotebook(_activeNotebook.id);
}

