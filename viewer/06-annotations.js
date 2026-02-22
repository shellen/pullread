// ABOUTME: Highlights, inline annotations, and footnote rendering for article content.
// ABOUTME: Manages highlight creation/deletion, footnote numbering, and the notes panel.

async function preloadAnnotations(filename) {
  if (!serverMode) return;
  try {
    const [hlRes, notesRes] = await Promise.all([
      fetch('/api/highlights?name=' + encodeURIComponent(filename)),
      fetch('/api/notes?name=' + encodeURIComponent(filename))
    ]);
    articleHighlights = hlRes.ok ? await hlRes.json() : [];
    const notesData = notesRes.ok ? await notesRes.json() : {};
    articleNotes = { articleNote: '', annotations: [], tags: [], isFavorite: false, ...notesData };
  } catch {
    articleHighlights = [];
    articleNotes = { articleNote: '', annotations: [], tags: [], isFavorite: false };
  }
}

async function loadAnnotations(filename) {
  await preloadAnnotations(filename);
  applyHighlights();
  renderNotesPanel();
}

async function loadAnnotationsIndex() {
  if (!serverMode) return;
  try {
    const [hlRes, notesRes] = await Promise.all([
      fetch('/api/highlights'),
      fetch('/api/notes')
    ]);
    allHighlightsIndex = hlRes.ok ? await hlRes.json() : {};
    allNotesIndex = notesRes.ok ? await notesRes.json() : {};
  } catch {
    allHighlightsIndex = {};
    allNotesIndex = {};
  }
}

function hasAnnotations(filename) {
  const hls = allHighlightsIndex[filename] || [];
  const hasHl = hls.length > 0;
  const hasHlNotes = hls.some(h => h.note);
  const notes = allNotesIndex[filename];
  const hasNote = notes && (notes.articleNote || (notes.annotations && notes.annotations.length > 0) || hasHlNotes);
  const isFavorite = notes && notes.isFavorite;
  const hasTags = notes && ((notes.tags && notes.tags.length > 0) || (notes.machineTags && notes.machineTags.length > 0));
  return { hasHl, hasNote, isFavorite, hasTags };
}

async function saveHighlights() {
  if (!serverMode || !activeFile) return;
  allHighlightsIndex[activeFile] = articleHighlights;
  await fetch('/api/highlights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: activeFile, highlights: articleHighlights })
  });
}

async function saveNotes() {
  if (!serverMode || !activeFile) return;
  allNotesIndex[activeFile] = articleNotes;
  await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: activeFile, ...articleNotes })
  });
}

function generateId() {
  return 'h' + Math.random().toString(36).slice(2, 8);
}

function getTextContext(text, before, after) {
  // Get surrounding context for anchoring
  const content = document.getElementById('content');
  const fullText = content.textContent || '';
  const idx = fullText.indexOf(text);
  if (idx < 0) return { contextBefore: '', contextAfter: '' };
  return {
    contextBefore: fullText.slice(Math.max(0, idx - 30), idx),
    contextAfter: fullText.slice(idx + text.length, idx + text.length + 30)
  };
}

function createHighlight(color) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

  const text = sel.toString();
  const { contextBefore, contextAfter } = getTextContext(text);

  const now = new Date().toISOString();
  const highlight = {
    id: generateId(),
    text: text,
    contextBefore,
    contextAfter,
    color: color,
    note: '',
    createdAt: now,
    updatedAt: now
  };

  articleHighlights.push(highlight);
  saveHighlights();
  applyHighlights();
  removeHlToolbar();
  sel.removeAllRanges();
  updateSidebarItem(activeFile);
}

function deleteHighlight(id) {
  articleHighlights = articleHighlights.filter(h => h.id !== id);
  saveHighlights();
  applyHighlights();
  updateSidebarItem(activeFile);
}

// ---- Footnotes ----
let footnoteEntries = [];

function assignFootnoteNumbers() {
  const content = document.getElementById('content');
  if (!content) return;
  footnoteEntries = [];

  // Collect all anchored elements (highlights and annotation markers)
  const elements = [];
  content.querySelectorAll('mark[data-hl-id]').forEach(el => {
    const hl = articleHighlights.find(h => h.id === el.getAttribute('data-hl-id'));
    if (hl) elements.push({ el, type: 'highlight', data: hl });
  });
  content.querySelectorAll('.annotation-marker[data-ann-id]').forEach(el => {
    const ann = (articleNotes.annotations || []).find(a => a.id === el.getAttribute('data-ann-id'));
    if (ann) elements.push({ el, type: 'annotation', data: ann });
  });

  // Sort by document position
  elements.sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  // Assign numbers and insert superscript markers
  elements.forEach((item, i) => {
    const num = i + 1;
    const sup = document.createElement('sup');
    sup.className = 'footnote-marker';
    sup.id = 'fnref-' + num;
    sup.textContent = num;
    sup.onclick = function(e) { e.stopPropagation(); scrollToFootnote(num); };
    item.el.after(sup);

    const entry = { num, type: item.type, id: item.data.id };
    if (item.type === 'highlight') {
      entry.text = item.data.text;
      entry.note = item.data.note || '';
      entry.color = item.data.color;
    } else {
      entry.text = item.data.anchorText || '';
      entry.note = item.data.note || '';
    }
    footnoteEntries.push(entry);
  });
}

function renderFootnotes() {
  const content = document.getElementById('content');
  if (!content) return;
  const existing = content.querySelector('.footnotes-section');
  if (existing) existing.remove();

  if (footnoteEntries.length === 0) return;

  const section = document.createElement('section');
  section.className = 'footnotes-section';

  let html = '<div class="footnotes-heading">Footnotes</div><ol class="footnotes-list">';
  for (const entry of footnoteEntries) {
    const excerpt = escapeHtml((entry.text || '').slice(0, 80));
    const colorClass = entry.type === 'highlight' && entry.color ? ' hl-' + entry.color : '';
    html += '<li class="footnote-entry" id="fn-' + entry.num + '" onclick="scrollToFootnoteRef(' + entry.num + ')">';
    html += '<span class="footnote-backref">' + entry.num + '.</span>';
    if (excerpt) {
      html += '<span class="footnote-quote' + (colorClass ? ' pr-highlight' + colorClass : '') + '">' + excerpt + (entry.text.length > 80 ? '...' : '') + '</span>';
    }
    if (entry.note) {
      html += '<div class="footnote-note">' + escapeHtml(entry.note) + '</div>';
    }
    html += '</li>';
  }
  html += '</ol>';
  section.innerHTML = html;

  // Insert before notes panel to maintain correct order
  const notesPanel = content.querySelector('.notes-panel');
  if (notesPanel) {
    content.insertBefore(section, notesPanel);
  } else {
    content.appendChild(section);
  }
}

function scrollToFootnote(num) {
  const el = document.getElementById('fn-' + num);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1500);
}

function scrollToFootnoteRef(num) {
  const el = document.getElementById('fnref-' + num);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.style.outline = '2px solid var(--link)';
  setTimeout(() => { el.style.outline = ''; }, 1500);
}

function applyHighlights() {
  const content = document.getElementById('content');
  if (!content) return;

  // Remove existing highlights (re-render from raw HTML)
  content.querySelectorAll('mark.pr-highlight').forEach(mark => {
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });

  // Remove annotation markers, highlight note markers, and footnote markers
  content.querySelectorAll('.annotation-marker').forEach(m => m.remove());
  content.querySelectorAll('.hl-note-marker').forEach(m => m.remove());
  content.querySelectorAll('.footnote-marker').forEach(m => m.remove());

  // Apply each highlight
  for (const hl of articleHighlights) {
    findAndWrap(content, hl);
  }

  // Apply inline annotations
  for (const ann of (articleNotes.annotations || [])) {
    findAndMarkAnnotation(content, ann);
  }

  // Build footnotes from highlights and annotations
  assignFootnoteNumbers();
  renderFootnotes();
}

function renderMarginNotes() {
  // Margin notes replaced by footnotes section at bottom of article
  const marginContainer = document.getElementById('margin-notes');
  if (marginContainer) marginContainer.innerHTML = '';
}

function findAndWrap(container, hl) {
  const searchText = hl.text;
  const fullText = container.textContent || '';

  // Find the best match position using context
  let targetGlobalIdx = -1;
  if (hl.contextBefore || hl.contextAfter) {
    const ctxBefore = (hl.contextBefore || '').slice(-15);
    const ctxAfter = (hl.contextAfter || '').slice(0, 15);
    const needle = ctxBefore + searchText + ctxAfter;
    const pos = fullText.indexOf(needle);
    if (pos >= 0) {
      targetGlobalIdx = pos + ctxBefore.length;
    }
  }
  if (targetGlobalIdx < 0) {
    targetGlobalIdx = fullText.indexOf(searchText);
  }
  if (targetGlobalIdx < 0) return;

  const endGlobalIdx = targetGlobalIdx + searchText.length;

  // Walk text nodes to find start and end positions (handles cross-element spans)
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let startNode = null, startOffset = 0;
  let endNode = null, endOffset = 0;
  let node;

  while (node = walker.nextNode()) {
    const nodeLen = node.textContent.length;
    if (!startNode && charCount + nodeLen > targetGlobalIdx) {
      startNode = node;
      startOffset = targetGlobalIdx - charCount;
    }
    if (startNode && charCount + nodeLen >= endGlobalIdx) {
      endNode = node;
      endOffset = endGlobalIdx - charCount;
      break;
    }
    charCount += nodeLen;
  }

  if (!startNode || !endNode) return;

  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const mark = document.createElement('mark');
    mark.className = 'pr-highlight hl-' + hl.color;
    mark.setAttribute('data-hl-id', hl.id);
    mark.onclick = function(e) {
      e.stopPropagation();
      showHighlightContextMenu(e, hl);
    };

    // extractContents handles cross-element ranges (bold/italic boundaries)
    // where surroundContents would throw
    const fragment = range.extractContents();
    mark.appendChild(fragment);
    range.insertNode(mark);
  } catch {
    return;
  }
}

function findAndMarkAnnotation(container, ann) {
  if (!ann.anchorText) return;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node;
  while (node = walker.nextNode()) {
    const idx = node.textContent.indexOf(ann.anchorText);
    if (idx < 0) continue;
    // Insert a marker after the anchor text
    const marker = document.createElement('span');
    marker.className = 'annotation-marker';
    marker.setAttribute('data-ann-id', ann.id);
    marker.textContent = '';
    marker.title = ann.note;
    marker.onclick = function(e) {
      e.stopPropagation();
      showAnnotationPopover(e, ann);
    };
    const textAfter = node.splitText(idx + ann.anchorText.length);
    textAfter.parentNode.insertBefore(marker, textAfter);
    return;
  }
}

// Floating highlight toolbar on text selection
let hlToolbarEl = null;

function removeHlToolbar() {
  if (hlToolbarEl) {
    hlToolbarEl.remove();
    hlToolbarEl = null;
  }
  // Only remove annotation popover if not actively focused (user is typing)
  const popover = document.querySelector('.annotation-popover');
  if (popover && !popover.contains(document.activeElement)) {
    popover.remove();
  }
}

function removeAnnotationPopover() {
  const existing = document.querySelector('.annotation-popover');
  if (existing) existing.remove();
}

function showHlToolbar(x, y) {
  removeHlToolbar();
  const bar = document.createElement('div');
  bar.className = 'hl-toolbar';
  // Prevent mousedown from clearing the text selection — critical for
  // highlight/note buttons to read the selection when their onclick fires
  bar.addEventListener('mousedown', e => e.preventDefault());
  bar.innerHTML = `
    <button class="hl-yellow-btn" aria-label="Highlight yellow" onclick="createHighlight('yellow')"></button>
    <button class="hl-green-btn" aria-label="Highlight green" onclick="createHighlight('green')"></button>
    <button class="hl-blue-btn" aria-label="Highlight blue" onclick="createHighlight('blue')"></button>
    <button class="hl-pink-btn" aria-label="Highlight pink" onclick="createHighlight('pink')"></button>
    <button class="hl-note-btn" aria-label="Add note" onclick="addInlineNote()">+ Note</button>
  `;
  bar.style.left = x + 'px';
  bar.style.top = y + 'px';
  document.getElementById('content-pane').appendChild(bar);
  hlToolbarEl = bar;
}

function showHighlightContextMenu(e, hl) {
  removeHlToolbar();
  const bar = document.createElement('div');
  bar.className = 'hl-toolbar';
  bar.addEventListener('mousedown', e => e.preventDefault());
  const noteLabel = hl.note ? 'Edit Note' : 'Note';
  bar.innerHTML = `
    <button class="hl-yellow-btn" aria-label="Yellow" onclick="changeHighlightColor('${hl.id}','yellow')"></button>
    <button class="hl-green-btn" aria-label="Green" onclick="changeHighlightColor('${hl.id}','green')"></button>
    <button class="hl-blue-btn" aria-label="Blue" onclick="changeHighlightColor('${hl.id}','blue')"></button>
    <button class="hl-pink-btn" aria-label="Pink" onclick="changeHighlightColor('${hl.id}','pink')"></button>
    <button class="hl-note-btn" aria-label="${noteLabel}" onclick="editHighlightNote('${hl.id}', event)">${noteLabel}</button>
    <button class="hl-note-btn" style="color:red;border-color:red" aria-label="Delete highlight" onclick="deleteHighlight('${hl.id}')">Del</button>
  `;
  const pane = document.getElementById('content-pane');
  bar.style.left = (e.clientX - pane.getBoundingClientRect().left) + 'px';
  bar.style.top = (e.clientY - pane.getBoundingClientRect().top + pane.scrollTop - 40) + 'px';
  pane.appendChild(bar);
  hlToolbarEl = bar;
}

function changeHighlightColor(id, color) {
  const hl = articleHighlights.find(h => h.id === id);
  if (hl) {
    hl.color = color;
    hl.updatedAt = new Date().toISOString();
    saveHighlights();
    applyHighlights();
  }
  removeHlToolbar();
}

function editHighlightNote(id, e) {
  removeHlToolbar();
  const hl = articleHighlights.find(h => h.id === id);
  if (!hl) return;

  const pane = document.getElementById('content-pane');
  const paneRect = pane.getBoundingClientRect();
  const popover = document.createElement('div');
  popover.className = 'annotation-popover';
  popover.style.left = (e.clientX - paneRect.left) + 'px';
  popover.style.top = (e.clientY - paneRect.top + pane.scrollTop + 10) + 'px';
  popover.innerHTML = `
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Note on highlight: "${escapeHtml(hl.text.slice(0, 50))}${hl.text.length > 50 ? '...' : ''}"</div>
    <textarea placeholder="Add a note to this highlight...">${escapeHtml(hl.note || '')}</textarea>
    <div class="btn-row">
      ${hl.note ? '<button style="color:red;border-color:red" onclick="clearHighlightNote(\'' + id + '\')">Remove</button>' : ''}
      <button onclick="removeAnnotationPopover()">Cancel</button>
      <button class="primary" onclick="saveHighlightNote('${id}', this)">Save</button>
    </div>
  `;
  popover.onclick = function(ev) { ev.stopPropagation(); };
  pane.appendChild(popover);
  var ta = popover.querySelector('textarea');
  ta.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey || !ev.shiftKey)) {
      ev.preventDefault();
      saveHighlightNote(id, popover.querySelector('.primary'));
    }
  });
  ta.focus();
}

function saveHighlightNote(id, btn) {
  const popover = btn.closest('.annotation-popover');
  const note = popover.querySelector('textarea').value.trim();
  const hl = articleHighlights.find(h => h.id === id);
  if (hl) {
    hl.note = note;
    hl.updatedAt = new Date().toISOString();
    saveHighlights();
    applyHighlights();
    renderNotesPanel();
    updateSidebarItem(activeFile);
  }
  removeAnnotationPopover();
}

function clearHighlightNote(id) {
  const hl = articleHighlights.find(h => h.id === id);
  if (hl) {
    hl.note = '';
    hl.updatedAt = new Date().toISOString();
    saveHighlights();
    applyHighlights();
    renderNotesPanel();
    updateSidebarItem(activeFile);
  }
  removeAnnotationPopover();
}

// Listen for text selection in content pane
document.addEventListener('mouseup', e => {
  // Don't dismiss anything if clicking inside an annotation popover or margin note
  if (e.target.closest && e.target.closest('.annotation-popover, .margin-note')) return;

  const contentEl = document.getElementById('content');
  if (!contentEl || !contentEl.contains(e.target)) {
    // Don't remove toolbar if clicking on the toolbar itself
    if (hlToolbarEl && hlToolbarEl.contains(e.target)) return;
    removeHlToolbar();
    return;
  }

  const sel = window.getSelection();
  const selText = sel ? sel.toString().trim() : '';
  if (!sel || sel.isCollapsed || selText.length < 3) {
    removeHlToolbar();
    return;
  }

  // Don't show highlight toolbar on Guide or Explore pages
  if (!activeFile) return;

  const pane = document.getElementById('content-pane');
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const paneRect = pane.getBoundingClientRect();

  const x = rect.left - paneRect.left + rect.width / 2 - 70;
  const y = rect.top - paneRect.top + pane.scrollTop - 40;
  showHlToolbar(Math.max(10, x), y);
});

// Inline annotations
function addInlineNote() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
  const anchorText = sel.toString();
  const pane = document.getElementById('content-pane');
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const paneRect = pane.getBoundingClientRect();

  removeHlToolbar();

  const popover = document.createElement('div');
  popover.className = 'annotation-popover';
  popover.style.left = (rect.left - paneRect.left) + 'px';
  popover.style.top = (rect.bottom - paneRect.top + pane.scrollTop + 5) + 'px';
  // Store anchor text as data attribute to avoid escaping issues with
  // newlines/quotes in onclick string literals
  popover.setAttribute('data-anchor', anchorText);
  popover.innerHTML = `
    <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Note on: "${escapeHtml(anchorText.slice(0, 50))}${anchorText.length > 50 ? '...' : ''}"</div>
    <textarea placeholder="Add your note..." autofocus></textarea>
    <div class="btn-row">
      <button onclick="removeAnnotationPopover()">Cancel</button>
      <button class="primary" onclick="saveInlineNote(this)">Save</button>
    </div>
  `;
  popover.onclick = function(e) { e.stopPropagation(); };
  pane.appendChild(popover);
  var ta = popover.querySelector('textarea');
  ta.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey || !ev.shiftKey)) {
      ev.preventDefault();
      saveInlineNote(popover.querySelector('.primary'));
    }
  });
  ta.focus();
  sel.removeAllRanges();
}

function saveInlineNote(btn) {
  const popover = btn.closest('.annotation-popover');
  const anchorText = popover.getAttribute('data-anchor') || '';
  const note = popover.querySelector('textarea').value.trim();
  if (!note) { removeAnnotationPopover(); return; }

  const { contextBefore, contextAfter } = getTextContext(anchorText);
  const now = new Date().toISOString();
  const annotation = {
    id: generateId(),
    anchorText,
    contextBefore,
    contextAfter,
    note,
    createdAt: now,
    updatedAt: now
  };
  if (!articleNotes.annotations) articleNotes.annotations = [];
  articleNotes.annotations.push(annotation);
  saveNotes();
  applyHighlights();
  removeAnnotationPopover();
  updateSidebarItem(activeFile);
}

function showAnnotationPopover(e, ann) {
  removeAnnotationPopover();
  removeHlToolbar();

  const pane = document.getElementById('content-pane');
  const paneRect = pane.getBoundingClientRect();
  const popover = document.createElement('div');
  popover.className = 'annotation-popover';
  popover.style.left = (e.clientX - paneRect.left) + 'px';
  popover.style.top = (e.clientY - paneRect.top + pane.scrollTop + 10) + 'px';
  popover.innerHTML = `
    <textarea>${escapeHtml(ann.note)}</textarea>
    <div class="btn-row">
      <button style="color:red;border-color:red" onclick="deleteAnnotation('${ann.id}')">Delete</button>
      <button onclick="removeAnnotationPopover()">Cancel</button>
      <button class="primary" onclick="updateAnnotation('${ann.id}', this)">Save</button>
    </div>
  `;
  popover.onclick = function(e) { e.stopPropagation(); };
  pane.appendChild(popover);
  var ta = popover.querySelector('textarea');
  if (ta) {
    ta.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey || !ev.shiftKey)) {
        ev.preventDefault();
        updateAnnotation(ann.id, popover.querySelector('.primary'));
      }
    });
  }
}

function deleteAnnotation(id) {
  articleNotes.annotations = (articleNotes.annotations || []).filter(a => a.id !== id);
  saveNotes();
  applyHighlights();
  removeAnnotationPopover();
  updateSidebarItem(activeFile);
}

function updateAnnotation(id, btn) {
  const popover = btn.closest('.annotation-popover');
  const note = popover.querySelector('textarea').value.trim();
  const ann = (articleNotes.annotations || []).find(a => a.id === id);
  if (ann) {
    ann.note = note;
    ann.updatedAt = new Date().toISOString();
    saveNotes();
  }
  removeAnnotationPopover();
}

// Render tags in the article header
function renderNotesPanel() {
  var container = document.getElementById('header-tags');
  if (!container) return;

  var tags = articleNotes.tags || [];
  var machineTags = articleNotes.machineTags || [];
  var tagsHtml = tags.map(function(t) { return '<span class="tag">' + escapeHtml(t) + '<span class="tag-remove" onclick="removeTag(\'' + escapeHtml(t.replace(/'/g, "\\'")) + '\')">&times;</span></span>'; }).join('')
    + machineTags.map(function(t) { return '<span class="tag tag-machine" title="Auto-generated">' + escapeHtml(t) + '</span>'; }).join('');

  container.innerHTML = '<div class="tags-row">'
    + tagsHtml
    + '<input type="text" placeholder="Add tag\u2026" onkeydown="handleTagKey(event)" />'
    + '</div>';
}

function toggleFavorite(btn) {
  articleNotes.isFavorite = !articleNotes.isFavorite;
  saveNotes();
  renderNotesPanel();
  updateSidebarItem(activeFile);
  updateHeaderActions();
}

// Alias for backward compatibility with header button onclick
var toggleFavoriteFromHeader = toggleFavorite;

function toggleNotesFromHeader() {
  var container = document.getElementById('header-tags');
  if (container) {
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var input = container.querySelector('input');
    if (input) input.focus();
  }
}

function scrollToHighlight(id) {
  const mark = document.querySelector('mark[data-hl-id="' + id + '"]');
  if (mark) {
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    mark.style.outline = '2px solid var(--link)';
    setTimeout(() => { mark.style.outline = ''; }, 1500);
  }
}

function updateHeaderActions() {
  const actions = document.querySelector('.article-actions');
  if (!actions) return;
  const favBtn = actions.querySelector('button');
  if (favBtn) {
    favBtn.className = articleNotes.isFavorite ? 'active-fav' : '';
    favBtn.innerHTML = '<svg class="icon icon-sm"><use href="#i-' + (articleNotes.isFavorite ? 'heart' : 'heart-o') + '"/></svg> Favorite';
  }
}

function handleTagKey(e) {
  handleTagInput(e,
    function() { if (!articleNotes.tags) articleNotes.tags = []; return articleNotes.tags; },
    function() { saveNotes(); renderNotesPanel(); updateSidebarItem(activeFile); }
  );
}

function removeTag(tag) {
  if (!articleNotes.tags) return;
  articleNotes.tags = articleNotes.tags.filter(t => t !== tag);
  saveNotes();
  renderNotesPanel();
  updateSidebarItem(activeFile);
}

// ---- Voice Notes (Web Speech API) ----
let voiceRecognition = null;

function toggleVoiceNote(btn) {
  if (voiceRecognition) {
    voiceRecognition.stop();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Speech recognition is not supported in this browser. Try Chrome or Safari.');
    return;
  }

  const textarea = btn.closest('.notes-textarea-wrap').querySelector('textarea');
  if (!textarea) return;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';

  let finalTranscript = '';
  const originalText = textarea.value;

  recognition.onstart = function() {
    voiceRecognition = recognition;
    btn.classList.add('recording');
    btn.innerHTML = '<svg aria-hidden="true"><use href="#i-stop"/></svg>';
    btn.title = 'Stop recording';
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
    textarea.value = originalText + (finalTranscript || interim ? separator : '') + finalTranscript + interim;
    textarea.scrollTop = textarea.scrollHeight;
  };

  recognition.onend = function() {
    voiceRecognition = null;
    btn.classList.remove('recording');
    btn.innerHTML = '<svg aria-hidden="true"><use href="#i-mic"/></svg>';
    btn.title = 'Voice note (requires microphone)';
    // Commit final transcript to notes
    if (finalTranscript.trim()) {
      const existingText = articleNotes.articleNote || '';
      const separator = existingText && !existingText.endsWith('\n') && !existingText.endsWith(' ') ? '\n' : '';
      articleNotes.articleNote = existingText + separator + finalTranscript.trim();
      textarea.value = articleNotes.articleNote;
      saveNotes();
      updateSidebarItem(activeFile);
    }
  };

  recognition.onerror = function(event) {
    if (event.error === 'not-allowed') {
      alert('Microphone access was denied. Please allow microphone access in your browser settings.');
    }
    voiceRecognition = null;
    btn.classList.remove('recording');
    btn.innerHTML = '<svg aria-hidden="true"><use href="#i-mic"/></svg>';
    btn.title = 'Voice note (requires microphone)';
  };

  recognition.start();
}

