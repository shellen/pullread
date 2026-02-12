// ---- Highlights & Notes ----

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
  renderFileList(); // update indicator dots
}

function deleteHighlight(id) {
  articleHighlights = articleHighlights.filter(h => h.id !== id);
  saveHighlights();
  applyHighlights();
  renderFileList();
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

  // Remove annotation markers and highlight note markers
  content.querySelectorAll('.annotation-marker').forEach(m => m.remove());
  content.querySelectorAll('.hl-note-marker').forEach(m => m.remove());

  // Apply each highlight
  for (const hl of articleHighlights) {
    findAndWrap(content, hl);
  }

  // Apply inline annotations
  for (const ann of (articleNotes.annotations || [])) {
    findAndMarkAnnotation(content, ann);
  }

  // Render margin notes for highlights with notes and inline annotations
  renderMarginNotes();
}

function renderMarginNotes() {
  const marginContainer = document.getElementById('margin-notes');
  if (!marginContainer) return;
  marginContainer.innerHTML = '';

  const pane = document.getElementById('content-pane');
  if (!pane) return;
  const paneRect = pane.getBoundingClientRect();

  const notes = [];

  // Collect highlight notes
  for (const hl of articleHighlights) {
    if (!hl.note) continue;
    const mark = document.querySelector('mark[data-hl-id="' + hl.id + '"]');
    if (!mark) continue;
    const rect = mark.getBoundingClientRect();
    notes.push({
      top: rect.top - paneRect.top + pane.scrollTop,
      anchorText: hl.text.slice(0, 40),
      body: hl.note,
      id: hl.id,
      type: 'highlight'
    });
  }

  // Collect inline annotation notes
  for (const ann of (articleNotes.annotations || [])) {
    const matchedMarker = document.querySelector('.annotation-marker[data-ann-id="' + ann.id + '"]');
    if (!matchedMarker) continue;
    const rect = matchedMarker.getBoundingClientRect();
    notes.push({
      top: rect.top - paneRect.top + pane.scrollTop,
      anchorText: (ann.anchorText || '').slice(0, 40),
      body: ann.note,
      id: ann.id,
      type: 'annotation'
    });
  }

  // Sort by position and spread out overlapping notes
  notes.sort((a, b) => a.top - b.top);
  let lastBottom = 0;
  for (const n of notes) {
    if (n.top < lastBottom + 8) n.top = lastBottom + 8;
    const div = document.createElement('div');
    div.className = 'margin-note';
    div.style.top = n.top + 'px';
    div.innerHTML = '<div class="mn-text">' + escapeHtml(n.anchorText) + (n.anchorText.length >= 40 ? '...' : '') + '</div>'
      + '<div class="mn-body">' + escapeHtml(n.body) + '</div>';
    div.onclick = function() {
      if (n.type === 'highlight') {
        editHighlightNote(n.id, { clientX: window.innerWidth / 2, clientY: 200 });
      } else {
        const ann = (articleNotes.annotations || []).find(a => a.id === n.id);
        if (ann) showAnnotationPopover({ clientX: window.innerWidth / 2, clientY: 200 }, ann);
      }
    };
    marginContainer.appendChild(div);
    lastBottom = n.top + div.offsetHeight;
  }
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
    marker.textContent = 'n';
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
  const bar = document.createElement('pr-highlight-toolbar');
  bar.setAttribute('mode', 'create');
  bar.style.left = x + 'px';
  bar.style.top = y + 'px';
  bar.addEventListener('hl-create', function(e) { createHighlight(e.detail.color); });
  bar.addEventListener('hl-add-note', function() { addInlineNote(); });
  document.getElementById('content-pane').appendChild(bar);
  hlToolbarEl = bar;
}

function showHighlightContextMenu(e, hl) {
  removeHlToolbar();
  const bar = document.createElement('pr-highlight-toolbar');
  bar.setAttribute('mode', 'edit');
  bar.setAttribute('highlight-id', hl.id);
  bar.setAttribute('note-label', hl.note ? 'Edit Note' : 'Note');
  bar.addEventListener('hl-change-color', function(ev) { changeHighlightColor(ev.detail.id, ev.detail.color); });
  bar.addEventListener('hl-edit-note', function(ev) { editHighlightNote(ev.detail.id, e); });
  bar.addEventListener('hl-delete', function(ev) { deleteHighlight(ev.detail.id); });
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
  popover.querySelector('textarea').focus();
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
    renderFileList();
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
    renderFileList();
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
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

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
  popover.querySelector('textarea').focus();
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
  renderFileList();
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
}

function deleteAnnotation(id) {
  articleNotes.annotations = (articleNotes.annotations || []).filter(a => a.id !== id);
  saveNotes();
  applyHighlights();
  removeAnnotationPopover();
  renderFileList();
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

// Article-level notes panel
function renderNotesPanel() {
  // Remove existing panel
  const existing = document.querySelector('.notes-panel');
  if (existing) existing.remove();

  const content = document.getElementById('content');
  if (!content || content.style.display === 'none') return;

  const panel = document.createElement('details');
  panel.className = 'notes-panel';
  const noteText = articleNotes.articleNote || '';
  const annCount = (articleNotes.annotations || []).length;
  const hlCount = articleHighlights.length;
  const hlNoteCount = articleHighlights.filter(h => h.note).length;

  let summaryText = 'Notes';
  const badges = [];
  if (hlCount) badges.push(hlCount + ' highlight' + (hlCount !== 1 ? 's' : '') + (hlNoteCount ? ' (' + hlNoteCount + ' with notes)' : ''));
  if (annCount) badges.push(annCount + ' annotation' + (annCount !== 1 ? 's' : ''));
  if (badges.length) summaryText += ' (' + badges.join(', ') + ')';

  const tags = articleNotes.tags || [];
  const machineTags = articleNotes.machineTags || [];
  const isFav = articleNotes.isFavorite || false;
  const tagsHtml = tags.map(t => '<span class="tag">' + escapeHtml(t) + '<span class="tag-remove" onclick="removeTag(\'' + escapeHtml(t.replace(/'/g, "\\'")) + '\')">&times;</span></span>').join('')
    + machineTags.map(t => '<span class="tag tag-machine" title="Auto-generated tag">' + escapeHtml(t) + '</span>').join('');

  // Build list of highlight notes and inline annotations for display
  let hlNotesHtml = '';
  const hlsWithNotes = articleHighlights.filter(h => h.note);
  const annotations = articleNotes.annotations || [];

  if (hlsWithNotes.length || annotations.length) {
    hlNotesHtml += '<div style="margin-top:12px;font-size:12px">';

    for (const hl of hlsWithNotes) {
      const preview = hl.text.length > 60 ? hl.text.slice(0, 60) + '...' : hl.text;
      hlNotesHtml += '<div style="padding:6px 0">'
        + '<div style="color:var(--muted);font-size:11px;margin-bottom:3px">'
        + '<span class="pr-highlight hl-' + hl.color + '" style="padding:1px 4px;border-radius:2px;cursor:pointer" onclick="scrollToHighlight(\'' + hl.id + '\')">' + escapeHtml(preview) + '</span>'
        + '</div>'
        + '<div style="white-space:pre-wrap;word-break:break-word">' + escapeHtml(hl.note) + '</div>'
        + '</div>';
    }

    for (const ann of annotations) {
      const preview = (ann.anchorText || '').slice(0, 60);
      hlNotesHtml += '<div style="padding:6px 0">'
        + '<div style="color:var(--muted);font-size:11px;margin-bottom:3px">'
        + '<span style="color:var(--link);cursor:pointer">' + escapeHtml(preview) + (ann.anchorText && ann.anchorText.length > 60 ? '...' : '') + '</span>'
        + '</div>'
        + '<div style="white-space:pre-wrap;word-break:break-word">' + escapeHtml(ann.note) + '</div>'
        + '</div>';
    }

    hlNotesHtml += '</div>';
  }

  panel.innerHTML = `
    <summary>${summaryText}</summary>
    <div class="favorite-row">
      <button class="favorite-btn${isFav ? ' active' : ''}" onclick="toggleFavorite(this)" title="Mark as favorite"><svg class="icon"><use href="#i-${isFav ? 'heart' : 'heart-o'}"/></svg></button>
      <span style="color:var(--muted);font-size:12px">${isFav ? 'Favorited' : 'Mark favorite'}</span>
    </div>
    <div class="tags-row">
      ${tagsHtml}
      <input type="text" placeholder="Add tag..." onkeydown="handleTagKey(event)" />
    </div>
    <div class="notes-textarea-wrap">
      <textarea placeholder="Add notes about this article...">${escapeHtml(noteText)}</textarea>
      <button class="voice-note-btn" onclick="toggleVoiceNote(this)" title="Voice note (requires microphone)"><svg aria-hidden="true"><use href="#i-mic"/></svg></button>
    </div>
    <div class="notes-save-hint">Auto-saved</div>
    ${hlNotesHtml}
  `;

  if (noteText || isFav || tags.length || machineTags.length || hlsWithNotes.length || annotations.length) panel.setAttribute('open', '');

  content.appendChild(panel);

  const textarea = panel.querySelector('textarea');
  let saveTimeout;
  textarea.addEventListener('input', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      articleNotes.articleNote = textarea.value;
      saveNotes();
      renderFileList();
    }, 800);
  });
  textarea.addEventListener('blur', () => {
    articleNotes.articleNote = textarea.value;
    saveNotes();
    renderFileList();
  });
}

function toggleFavorite(btn) {
  articleNotes.isFavorite = !articleNotes.isFavorite;
  saveNotes();
  renderNotesPanel();
  renderFileList();
  updateHeaderActions();
}

// Alias for backward compatibility with header button onclick
var toggleFavoriteFromHeader = toggleFavorite;

function toggleNotesFromHeader() {
  const panel = document.querySelector('.notes-panel');
  if (panel) {
    panel.toggleAttribute('open');
    if (panel.hasAttribute('open')) {
      panel.querySelector('textarea').focus();
    }
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
    function() { saveNotes(); renderNotesPanel(); renderFileList(); }
  );
}

function removeTag(tag) {
  if (!articleNotes.tags) return;
  articleNotes.tags = articleNotes.tags.filter(t => t !== tag);
  saveNotes();
  renderNotesPanel();
  renderFileList();
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

  recognition.onstart = function() {
    voiceRecognition = recognition;
    btn.classList.add('recording');
    btn.innerHTML = '<svg aria-hidden="true"><use href="#i-stop"/></svg>';
    btn.title = 'Stop recording';
  };

  recognition.onresult = function(event) {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    // Show live preview: existing text + final transcript + interim (dimmed)
    const existingText = textarea.value;
    const separator = existingText && !existingText.endsWith('\n') && !existingText.endsWith(' ') ? '\n' : '';
    const preview = existingText + separator + finalTranscript + interim;
    textarea.value = preview;
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
      renderFileList();
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

