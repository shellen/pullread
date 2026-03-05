// ABOUTME: Ask page — RAG chat over reading collection using configured LLM.
// ABOUTME: Sends questions to /api/ask, renders markdown responses with article citations.

var _askMessages = [];
var _askBusy = false;

function renderAskPage() {
  var prevActive = activeFile;
  activeFile = null;
  _activeNotebook = null;
  var content = document.getElementById('content');
  var empty = document.getElementById('empty-state');
  empty.style.display = 'none';
  content.style.display = 'block';
  content.classList.remove('settings-view');
  content.classList.remove('manage-sources-view');
  content.classList.add('ask-view');
  document.title = 'Ask \u2014 PullRead';
  document.getElementById('margin-notes').innerHTML = '';
  var toc = document.getElementById('toc-container');
  if (toc) toc.innerHTML = '';
  var toolbar = document.getElementById('reader-toolbar');
  if (toolbar) toolbar.style.display = 'none';
  updateSidebarActiveState(prevActive);

  var html = '<div class="article-header ask-header"><h1>Ask Your Library</h1>';
  if (_askMessages.length > 0) {
    html += '<button class="ask-clear-btn" onclick="_askClear()" title="New conversation"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-plus"/></svg></button>';
  }
  html += '</div>';
  html += '<div class="ask-messages" id="ask-messages">';

  if (_askMessages.length === 0) {
    html += _askWelcomeHtml();
  } else {
    for (var i = 0; i < _askMessages.length; i++) {
      html += _askMessageHtml(_askMessages[i]);
    }
    if (!_askBusy) html += _askChipsHtml();
  }

  html += '</div>';
  html += _askInputHtml();

  content.innerHTML = html;

  var msgs = document.getElementById('ask-messages');
  if (msgs && _askMessages.length > 0) {
    msgs.scrollTop = msgs.scrollHeight;
  }

  var ta = document.getElementById('ask-textarea');
  if (ta) {
    ta.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _askSend();
      }
    });
    ta.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    ta.focus();
  }
}

function _askWelcomeHtml() {
  var suggestions = [
    'What are the main themes this week?',
    'Summarize today\'s articles',
    'Find contrasting viewpoints',
    'What should I read next?'
  ];
  var html = '<div class="ask-welcome">';
  html += '<p>Ask questions about your reading collection</p>';
  html += '<div class="ask-cards">';
  for (var i = 0; i < suggestions.length; i++) {
    html += '<button class="ask-card" onclick="_askSendText(\'' + suggestions[i].replace(/'/g, "\\'") + '\')">'
      + suggestions[i] + '</button>';
  }
  html += '</div></div>';
  return html;
}

function _askMessageHtml(msg) {
  if (msg.role === 'user') {
    return '<div class="ask-msg-user">' + escapeHtml(msg.text) + '</div>';
  }
  var rendered = sanitizeHtml(marked.parse(msg.text || ''));
  // Link bold article titles to reader
  if (msg.sources && msg.sources.length) {
    for (var i = 0; i < msg.sources.length; i++) {
      var s = msg.sources[i];
      var boldTitle = '<strong>' + escapeHtml(s.title) + '</strong>';
      var linked = '<a href="#" onclick="event.preventDefault();_askOpenArticle(\'' + escapeHtml(s.filename).replace(/'/g, "\\'") + '\')">' + boldTitle + '</a>';
      rendered = rendered.split(boldTitle).join(linked);
    }
  }
  var html = '<div class="ask-msg-ai">';
  html += '<button class="ask-copy-btn" onclick="_askCopyResponse(this)" title="Copy"><svg width="14" height="14"><use href="#i-clipboard"/></svg></button>';
  html += '<button class="ask-save-btn" onclick="_askSaveToNotebook(this)" title="Save to notebook"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-bookmark"/></svg></button>';
  html += rendered;
  html += '</div>';
  return html;
}

function _askChipsHtml() {
  var chips = ['Tell me more', 'Which article goes deepest?', 'Any contrasting viewpoints?'];
  var html = '<div class="ask-chips">';
  for (var i = 0; i < chips.length; i++) {
    html += '<button class="ask-chip" onclick="_askSendText(\'' + chips[i].replace(/'/g, "\\'") + '\')">' + chips[i] + '</button>';
  }
  html += '</div>';
  return html;
}

function _askInputHtml() {
  var disabled = _askBusy ? ' disabled' : '';
  var html = '<div class="ask-input-area">';
  html += '<textarea id="ask-textarea" placeholder="Message..." rows="1"' + disabled + '></textarea>';
  html += '<button class="ask-send-btn" onclick="_askSend()"' + disabled + '>';
  html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  html += '</button>';
  html += '</div>';
  html += '<div class="ask-hint">';
  if (llmProvider) {
    html += '<span>' + providerLabel(llmProvider) + (llmModel ? ' \u00B7 ' + escapeHtml(llmModel) : '') + '</span>';
  } else {
    html += '<span></span>';
  }
  html += '<span>\u21B5 send \u00B7 \u21E7\u21B5 newline</span>';
  html += '</div>';
  return html;
}

function _askSendText(text) {
  var ta = document.getElementById('ask-textarea');
  if (ta) ta.value = text;
  _askSend();
}

function _askSend() {
  var ta = document.getElementById('ask-textarea');
  if (!ta) return;
  var question = ta.value.trim();
  if (!question || _askBusy) return;

  _askMessages.push({ role: 'user', text: question });
  _askBusy = true;

  // Re-render messages with typing indicator
  var msgs = document.getElementById('ask-messages');
  if (msgs) {
    msgs.innerHTML = '';
    for (var i = 0; i < _askMessages.length; i++) {
      msgs.innerHTML += _askMessageHtml(_askMessages[i]);
    }
    msgs.innerHTML += '<div class="ask-typing"><span></span><span></span><span></span></div>';
    msgs.scrollTop = msgs.scrollHeight;
  }

  // Disable input
  ta.value = '';
  ta.disabled = true;
  ta.style.height = 'auto';
  var btn = ta.parentElement.querySelector('.ask-send-btn');
  if (btn) btn.disabled = true;

  // Gather previous sources so follow-ups reuse the same articles
  var prevSources = [];
  for (var j = _askMessages.length - 1; j >= 0; j--) {
    if (_askMessages[j].sources && _askMessages[j].sources.length) {
      prevSources = _askMessages[j].sources.map(function(s) { return s.filename; });
      break;
    }
  }

  fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: question, previousSources: prevSources })
  }).then(function(res) { return res.json(); }).then(function(data) {
    _askBusy = false;
    if (data.error) {
      _askMessages.push({ role: 'ai', text: 'Error: ' + data.error, sources: [] });
    } else {
      _askMessages.push({ role: 'ai', text: data.answer, sources: data.sources || [] });
    }
    renderAskPage();
  }).catch(function(err) {
    _askBusy = false;
    _askMessages.push({ role: 'ai', text: 'Error: ' + (err.message || 'Request failed'), sources: [] });
    renderAskPage();
  });
}

function _askOpenArticle(filename) {
  var idx = displayFiles.findIndex(function(f) { return f.filename === filename; });
  if (idx >= 0) {
    loadFile(idx);
  } else {
    showToast('Article not found in current view');
  }
}

function _askCopyResponse(btn) {
  var msgEl = btn.closest('.ask-msg-ai');
  if (!msgEl) return;
  var clone = msgEl.cloneNode(true);
  clone.querySelectorAll('button').forEach(function(b) { b.remove(); });
  var text = clone.textContent || '';
  navigator.clipboard.writeText(text.trim()).then(function() {
    showToast('Copied to clipboard');
  });
}

function _askClear() {
  _askMessages = [];
  _askBusy = false;
  renderAskPage();
  showToast('Conversation cleared');
}

function _askSaveToNotebook(btn) {
  var msgEl = btn.closest('.ask-msg-ai');
  if (!msgEl) return;
  var allAi = document.querySelectorAll('.ask-msg-ai');
  var aiIdx = -1;
  for (var i = 0; i < allAi.length; i++) {
    if (allAi[i] === msgEl) { aiIdx = i; break; }
  }
  // AI messages are at indices 1, 3, 5... in _askMessages (user=0, ai=1, user=2, ai=3...)
  var msgIdx = aiIdx * 2 + 1;
  var aiMsg = _askMessages[msgIdx];
  var userMsg = _askMessages[msgIdx - 1];
  if (!aiMsg) return;

  var content = '';
  if (userMsg) content += '## ' + userMsg.text + '\n\n';
  content += aiMsg.text;

  getOrCreateSingleNotebook().then(function(nb) {
    if (!nb.notes) nb.notes = [];
    var now = new Date().toISOString();
    var note = { id: generateNoteId(), content: content.trim(), sourceArticle: '', createdAt: now, updatedAt: now };
    nb.notes.unshift(note);
    nb.updatedAt = now;
    saveNotebook(nb).then(function() {
      showToast('Saved to notebook');
    });
  });
}
