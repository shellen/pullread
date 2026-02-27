// ---- LLM Summarization ----

let llmConfigured = false;
let llmProvider = '';
let llmModel = '';
let lastSummaryProvider = '';
let lastSummaryModel = '';

async function checkLLMConfig() {
  if (!serverMode) return;
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      var llm = data.llm || {};
      var defProv = llm.defaultProvider || 'apple';
      var provConfig = (llm.providers || {})[defProv] || {};
      llmConfigured = defProv === 'apple' || !!provConfig.hasKey;
      llmProvider = defProv;
      llmModel = provConfig.model || '';
    }
  } catch {}
}

function providerLabel(provider) {
  const labels = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini', openrouter: 'OpenRouter', apple: 'Apple Intelligence' };
  return labels[provider] || provider;
}

function summaryBlockHtml(provider, model, text) {
  var label = provider ? providerLabel(provider) : '';
  var sparkle = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none">'
    + '<path d="M8 1C8 1 9 5.5 11 7C12.5 8.2 15 8 15 8C15 8 12.5 8.2 11 9.5C9 11 8 15 8 15C8 15 7 11 5 9.5C3.5 8.2 1 8 1 8C1 8 3.5 8.2 5 7C7 5.5 8 1 8 1Z" fill="currentColor"/>'
    + '</svg>';
  var html = '<div class="summary-border">'
    + '<div class="summary-label">Summary</div>'
    + '<p class="summary-text" id="summary-text">' + escapeHtml(text) + '</p>'
    + '<div class="summary-footer"><div class="summary-footer-left">'
    + '<div class="attribution">' + sparkle + '<span>' + escapeHtml(label) + '</span></div>'
    + '</div><div class="summary-actions">'
    + '<button class="summary-icon-btn" onclick="regenerateSummary(this)" title="Regenerate">'
    + '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13.5 8A5.5 5.5 0 1 1 8 2.5M8 2.5V5.5M8 2.5L10.5 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    + '</button>'
    + '<button class="summary-icon-btn" onclick="dismissSummary()" title="Remove">'
    + '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'
    + '</button>'
    + '</div></div></div>';
  return html;
}

async function reprocessCurrentArticle(btn) {
  if (!serverMode || !activeFile) return;
  var origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<svg class="icon icon-sm spin" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-cloud-download"/></svg> Re-fetching\u2026';
  try {
    var res = await fetch('/api/reprocess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: activeFile })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Reprocess failed');
    btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-cloud-download"/></svg> Done!';
    // Reload the article content
    setTimeout(async function() {
      btn.innerHTML = origText;
      btn.disabled = false;
      // Re-fetch and render the updated article
      try {
        var r = await fetch('/api/file?name=' + encodeURIComponent(activeFile));
        if (r.ok) { var text = await r.text(); renderArticle(text, activeFile); await loadAnnotations(activeFile); }
      } catch(e) {}
    }, 800);
  } catch (err) {
    btn.innerHTML = origText;
    btn.disabled = false;
    showToast('Re-fetch failed: ' + (err.message || err), 5000);
  }
}

async function reprocessFromMenu() {
  if (!serverMode || !activeFile) return;
  showToast('Re-fetching article\u2026');
  try {
    var res = await fetch('/api/reprocess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: activeFile })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Reprocess failed');
    var r = await fetch('/api/file?name=' + encodeURIComponent(activeFile));
    if (r.ok) { var text = await r.text(); renderArticle(text, activeFile); await loadAnnotations(activeFile); }
    showToast('Article updated');
  } catch (err) {
    showToast('Re-fetch failed: ' + (err.message || err));
  }
}

async function summarizeArticle() {
  if (!serverMode || !activeFile) return;
  const btn = document.getElementById('summarize-btn');
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-wand"/></svg> Summarizing...';
  btn.title = 'Summarizing with ' + providerLabel(llmProvider) + '...';

  try {
    const res = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: activeFile })
    });
    const data = await res.json();
    if (data.error) {
      btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-wand"/></svg> Retry';
      btn.disabled = false;
      btn.title = data.error;
      // Show error inline under the header
      const content = document.getElementById('content');
      const existingError = content.querySelector('.summary-error');
      if (existingError) existingError.remove();
      const errDiv = document.createElement('div');
      errDiv.className = 'summary-error';
      errDiv.style.cssText = 'padding:8px 12px;margin:8px 0;background:var(--border);border-radius:6px;font-size:12px;color:var(--muted)';
      errDiv.textContent = data.error;
      const articleHeader = content.querySelector('.article-header');
      if (articleHeader) articleHeader.after(errDiv);
      return;
    }

    lastSummaryProvider = data.provider || llmProvider;
    lastSummaryModel = data.model || llmModel;

    // Remove any previous error
    const content = document.getElementById('content');
    const existingError = content.querySelector('.summary-error');
    if (existingError) existingError.remove();

    // Insert summary into the DOM
    const existingSummary = content.querySelector('.article-summary');
    if (existingSummary) existingSummary.remove();
    const existingDismissed = content.querySelector('.summary-dismissed');
    if (existingDismissed) existingDismissed.remove();

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'article-summary';
    summaryDiv.innerHTML = summaryBlockHtml(lastSummaryProvider, lastSummaryModel, data.summary);

    const dismissedBar = document.createElement('div');
    dismissedBar.className = 'summary-dismissed';
    dismissedBar.innerHTML = '<span>Summary removed</span><button onclick="undismissSummary()">Undo</button>';

    const articleHeader = content.querySelector('.article-header');
    if (articleHeader) {
      articleHeader.after(summaryDiv);
      summaryDiv.after(dismissedBar);
    } else {
      content.prepend(dismissedBar);
      content.prepend(summaryDiv);
    }

    btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-wand"/></svg> Summarized';
    btn.title = 'Summarized by ' + providerLabel(lastSummaryProvider) + ' (' + lastSummaryModel + '). Click to re-run.';
    btn.disabled = false;
    btn.onclick = function() { btn.onclick = null; summarizeArticle(); };
  } catch (err) {
    btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-wand"/></svg> Retry';
    btn.title = 'Summarization failed. Click to retry.';
    btn.disabled = false;
  }
}

function dismissSummary() {
  var block = document.querySelector('.article-summary');
  var bar = document.querySelector('.summary-dismissed');
  if (block) block.style.display = 'none';
  if (bar) bar.style.display = 'flex';
  var btn = document.getElementById('summarize-btn');
  if (btn) {
    btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-wand"/></svg> Summarize';
    btn.title = 'Summarize';
    btn.disabled = false;
    btn.onclick = null;
  }
}

function undismissSummary() {
  var block = document.querySelector('.article-summary');
  var bar = document.querySelector('.summary-dismissed');
  if (block) block.style.display = '';
  if (bar) bar.style.display = 'none';
}

function regenerateSummary(btn) {
  btn.classList.add('summary-spinning');
  var textEl = document.getElementById('summary-text');
  if (textEl) textEl.classList.add('regenerating');
  summarizeArticle();
}

// Modal focus management
// ---- Sharing ----

function getShareData() {
  if (!activeFile) return null;
  const file = allFiles.find(f => f.filename === activeFile);
  if (!file || !file.url) return null;
  return { title: file.title || '', url: file.url };
}

function toggleShareDropdown(e) {
  e.stopPropagation();
  // Close any existing share dropdown
  const existing = document.querySelector('.share-dropdown-panel');
  if (existing) { existing.remove(); return; }

  const data = getShareData();
  if (!data) return;

  const panel = document.createElement('div');
  panel.className = 'share-dropdown-panel';
  panel.onclick = function(ev) { ev.stopPropagation(); };

  const encodedUrl = encodeURIComponent(data.url);
  const encodedTitle = encodeURIComponent(data.title);
  const encodedText = encodeURIComponent(data.title + ' ' + data.url);

  panel.innerHTML = `
    <div class="share-group-label">Actions</div>
    <button onclick="copyArticleLink()"><svg class="share-icon" viewBox="0 0 640 512"><use href="#i-link"/></svg> Copy Link</button>
    <button onclick="copyPullReadLink()"><svg class="share-icon" viewBox="0 0 640 512"><use href="#i-link"/></svg> Copy Pull Read Link</button>
    <button onclick="showExportMarkdownModal()"><svg class="share-icon" viewBox="0 0 640 512"><use href="#i-cloud-download"/></svg> Export Markdown</button>
    <button onclick="exportArticlePdf()"><svg class="share-icon" viewBox="0 0 640 512"><use href="#i-cloud-download"/></svg> Export PDF</button>
    <button onclick="startNotebookFromArticle()"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-pen"/></svg> Write About This</button>
    <hr>
    <div class="share-group-label">Share to</div>
    <button onclick="prOpenExternal('https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}')"><svg class="share-icon" viewBox="0 0 448 512"><use href="#i-linkedin"/></svg> LinkedIn</button>
    <button onclick="prOpenExternal('https://bsky.app/intent/compose?text=${encodedText}')"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-bluesky"/></svg> Bluesky</button>
    <button onclick="shareMastodon('${encodedText}')"><svg class="share-icon" viewBox="0 0 448 512"><use href="#i-mastodon"/></svg> Mastodon</button>
    <button onclick="prOpenExternal('https://www.threads.net/intent/post?text=${encodedText}')"><svg class="share-icon" viewBox="0 0 448 512"><use href="#i-threads"/></svg> Threads</button>
    <hr>
    <div class="share-group-label">Send</div>
    <button onclick="prOpenExternal('mailto:?subject=${encodedTitle}&body=${encodedText}')"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-envelope"/></svg> Email</button>
    <button onclick="prOpenExternal('sms:&body=${encodedText}')"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-comment"/></svg> Messages</button>
  `;

  e.target.closest('.share-dropdown').appendChild(panel);
}

function toggleMoreMenu(e) {
  e.stopPropagation();
  var existing = document.querySelector('.more-dropdown-panel');
  if (existing) { existing.remove(); return; }
  // Close any share dropdown too
  var sharePanel = document.querySelector('.share-dropdown-panel');
  if (sharePanel) sharePanel.remove();

  var panel = document.createElement('div');
  panel.className = 'more-dropdown-panel';
  panel.onclick = function(ev) { ev.stopPropagation(); };

  var items = '';
  items += '<button onclick="toggleNotesFromHeader(); closeMoreMenu()"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-pen"/></svg> Tags</button>';
  items += '<button onclick="markCurrentAsUnread(); closeMoreMenu()"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-eye-slash"/></svg> Mark Unread</button>';
  if (serverMode) {
    items += '<button onclick="closeMoreMenu(); reprocessFromMenu()" title="Re-fetch this article from the original URL"><svg class="share-icon" viewBox="0 0 24 24"><use href="#i-cloud-download"/></svg> Re-fetch from source</button>';
  }
  panel.innerHTML = items;

  // Walk up from target to find .more-dropdown (avoids SVG closest() issues in WebKit)
  var host = e.target;
  while (host && (!host.classList || !host.classList.contains('more-dropdown'))) {
    host = host.parentNode;
  }
  if (host) host.appendChild(panel);
}

function closeMoreMenu() {
  var panel = document.querySelector('.more-dropdown-panel');
  if (panel) panel.remove();
}

function copyArticleLink() {
  const data = getShareData();
  if (!data) return;
  navigator.clipboard.writeText(data.url).then(() => {
    // Brief feedback
    const existing = document.querySelector('.share-dropdown-panel');
    if (existing) {
      const btn = existing.querySelector('button');
      if (btn) { const orig = btn.innerHTML; btn.innerHTML = '<span class="share-icon">&#10003;</span> Copied!'; setTimeout(() => { btn.innerHTML = orig; }, 1200); }
    }
  });
}

function copyPullReadLink() {
  const data = getShareData();
  if (!data) return;
  const prUrl = `https://pullread.com/link?url=${encodeURIComponent(data.url)}&title=${encodeURIComponent(data.title)}`;
  navigator.clipboard.writeText(prUrl).then(() => {
    const existing = document.querySelector('.share-dropdown-panel');
    if (existing) {
      const btns = existing.querySelectorAll('button');
      const btn = btns[1];
      if (btn) { const orig = btn.innerHTML; btn.innerHTML = '<span class="share-icon">&#10003;</span> Copied!'; setTimeout(() => { btn.innerHTML = orig; }, 1200); }
    }
  });
}

function saveArticleLink() {
  const data = getShareData();
  if (!data) return;
  // Use the Web Share API if available (for Safari reading list), otherwise just copy
  if (navigator.share) {
    navigator.share({ title: data.title, url: data.url }).catch(() => {});
  } else {
    // Fallback: open a bookmarklet-style URL for adding to reading list
    copyArticleLink();
  }
  const existing = document.querySelector('.share-dropdown-panel');
  if (existing) existing.remove();
}

// Export Markdown modal — lets user choose what to include
function showExportMarkdownModal() {
  // Close share dropdown
  const panel = document.querySelector('.share-dropdown-panel');
  if (panel) panel.remove();

  if (!activeFile) return;

  const hasHighlights = articleHighlights.length > 0;
  const hasNotes = articleNotes.articleNote || (articleNotes.annotations && articleNotes.annotations.length > 0);
  const file = allFiles.find(f => f.filename === activeFile);
  const hasSummary = file && file.hasSummary;
  const hasTags = (articleNotes.tags && articleNotes.tags.length > 0) || (articleNotes.machineTags && articleNotes.machineTags.length > 0);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Export Markdown');
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  let optionsHtml = '';
  optionsHtml += '<div class="export-option"><input type="checkbox" id="exp-summary" checked ' + (hasSummary ? '' : 'disabled') + '><label for="exp-summary">Include summary</label>' + (hasSummary ? '' : '<span class="export-hint">none available</span>') + '</div>';
  optionsHtml += '<div class="export-option"><input type="checkbox" id="exp-highlights" checked ' + (hasHighlights ? '' : 'disabled') + '><label for="exp-highlights">Include highlights</label>' + (hasHighlights ? '<span class="export-hint">' + articleHighlights.length + '</span>' : '<span class="export-hint">none</span>') + '</div>';
  optionsHtml += '<div class="export-option"><input type="checkbox" id="exp-notes" checked ' + (hasNotes ? '' : 'disabled') + '><label for="exp-notes">Include notes</label>' + (hasNotes ? '' : '<span class="export-hint">none</span>') + '</div>';
  optionsHtml += '<div class="export-option"><input type="checkbox" id="exp-tags" checked ' + (hasTags ? '' : 'disabled') + '><label for="exp-tags">Include tags</label>' + (hasTags ? '<span class="export-hint">' + [...(articleNotes.tags || []), ...(articleNotes.machineTags || [])].length + '</span>' : '<span class="export-hint">none</span>') + '</div>';

  overlay.innerHTML = `
    <div class="modal-card" onclick="event.stopPropagation()" style="max-width:400px">
      <h2>Export Markdown</h2>
      <p>Choose what to include in the exported file:</p>
      ${optionsHtml}
      <div class="modal-actions">
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn-primary" onclick="doExportMarkdown()">Download .md</button>
        <button class="btn-secondary" onclick="doExportMarkdown(true)">Copy</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function doExportMarkdown(copyOnly) {
  if (!activeFile) return;

  const inclSummary = document.getElementById('exp-summary')?.checked;
  const inclHighlights = document.getElementById('exp-highlights')?.checked;
  const inclNotes = document.getElementById('exp-notes')?.checked;
  const inclTags = document.getElementById('exp-tags')?.checked;

  // Fetch the raw markdown
  let rawText = '';
  if (serverMode) {
    const res = await fetch('/api/file?name=' + encodeURIComponent(activeFile));
    if (res.ok) rawText = await res.text();
  }
  if (!rawText) return;

  const { meta, body } = parseFrontmatter(rawText);

  // Build export markdown
  let md = '';

  // Title
  if (meta && meta.title) md += '# ' + meta.title + '\n\n';

  // Source info
  const infoParts = [];
  if (meta && meta.author) infoParts.push('**Author:** ' + meta.author);
  if (meta && meta.url) infoParts.push('**Source:** ' + meta.url);
  if (meta && meta.bookmarked) infoParts.push('**Saved:** ' + meta.bookmarked.slice(0, 10));
  if (infoParts.length) md += infoParts.join('  \n') + '\n\n';

  // Tags
  if (inclTags) {
    const allTags = [...(articleNotes.tags || []), ...(articleNotes.machineTags || [])];
    if (allTags.length) md += '**Tags:** ' + allTags.join(', ') + '\n\n';
  }

  // Summary
  if (inclSummary && meta && meta.summary) {
    md += '> **Summary:** ' + meta.summary + '\n\n';
  }

  md += '---\n\n';

  // Article body
  md += cleanMarkdown(body).trim() + '\n';

  // Highlights section
  if (inclHighlights && articleHighlights.length > 0) {
    md += '\n---\n\n## Highlights\n\n';
    for (const hl of articleHighlights) {
      const colorLabel = hl.color ? ' (' + hl.color + ')' : '';
      md += '- > ' + hl.text + colorLabel + '\n';
      if (hl.note) md += '  - **Note:** ' + hl.note + '\n';
    }
  }

  // Notes section
  if (inclNotes) {
    const hasArticleNote = articleNotes.articleNote && articleNotes.articleNote.trim();
    const hasAnnotations = articleNotes.annotations && articleNotes.annotations.length > 0;
    if (hasArticleNote || hasAnnotations) {
      md += '\n---\n\n## Notes\n\n';
      if (hasArticleNote) {
        md += articleNotes.articleNote.trim() + '\n\n';
      }
      if (hasAnnotations) {
        for (const ann of articleNotes.annotations) {
          md += '- **"' + ann.text + '"** — ' + ann.note + '\n';
        }
      }
    }
  }

  if (copyOnly) {
    await navigator.clipboard.writeText(md);
    // Flash feedback
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) {
      const btn = overlay.querySelector('.btn-secondary:last-child');
      if (btn) { const orig = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = orig; }, 1200); }
    }
    return;
  }

  // Download as file using native save dialog when in Tauri
  const saved = await prSaveFile(md, activeFile, 'text/markdown;charset=utf-8');

  // Close modal
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) overlay.remove();
  if (saved) showToast('Markdown exported');
}

function exportArticlePdf() {
  // Close share dropdown
  var panel = document.querySelector('.share-dropdown-panel');
  if (panel) panel.remove();

  if (!activeFile) return;

  var hasHighlights = articleHighlights.length > 0;
  var hasNotes = articleNotes.articleNote || (articleNotes.annotations && articleNotes.annotations.length > 0);
  var file = allFiles.find(function(f) { return f.filename === activeFile; });
  var hasSummary = file && file.hasSummary;
  var hasTags = (articleNotes.tags && articleNotes.tags.length > 0) || (articleNotes.machineTags && articleNotes.machineTags.length > 0);

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Export PDF');
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var optionsHtml = '';
  optionsHtml += '<div class="export-option"><input type="checkbox" id="pdf-summary" checked ' + (hasSummary ? '' : 'disabled') + '><label for="pdf-summary">Include summary</label>' + (hasSummary ? '' : '<span class="export-hint">none available</span>') + '</div>';
  optionsHtml += '<div class="export-option"><input type="checkbox" id="pdf-highlights" checked ' + (hasHighlights ? '' : 'disabled') + '><label for="pdf-highlights">Include highlights</label>' + (hasHighlights ? '<span class="export-hint">' + articleHighlights.length + '</span>' : '<span class="export-hint">none</span>') + '</div>';
  optionsHtml += '<div class="export-option"><input type="checkbox" id="pdf-notes" checked ' + (hasNotes ? '' : 'disabled') + '><label for="pdf-notes">Include notes</label>' + (hasNotes ? '' : '<span class="export-hint">none</span>') + '</div>';
  optionsHtml += '<div class="export-option"><input type="checkbox" id="pdf-tags" checked ' + (hasTags ? '' : 'disabled') + '><label for="pdf-tags">Include tags</label>' + (hasTags ? '<span class="export-hint">' + [...(articleNotes.tags || []), ...(articleNotes.machineTags || [])].length + '</span>' : '<span class="export-hint">none</span>') + '</div>';

  overlay.innerHTML = '\
    <div class="modal-card" onclick="event.stopPropagation()" style="max-width:400px">\
      <h2>Export PDF</h2>\
      <p>Choose what to include in the exported PDF:</p>\
      ' + optionsHtml + '\
      <div class="modal-actions">\
        <button class="btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>\
        <button class="btn-primary" onclick="doExportArticlePdf()">Export PDF</button>\
      </div>\
    </div>\
  ';
  document.body.appendChild(overlay);
}

async function doExportArticlePdf() {
  if (!activeFile) return;

  var inclSummary = document.getElementById('pdf-summary')?.checked;
  var inclHighlights = document.getElementById('pdf-highlights')?.checked;
  var inclNotes = document.getElementById('pdf-notes')?.checked;
  var inclTags = document.getElementById('pdf-tags')?.checked;

  // Close modal
  var overlay = document.querySelector('.modal-overlay');
  if (overlay) overlay.remove();

  var file = allFiles.find(function(f) { return f.filename === activeFile; });
  var title = (file && file.title) || activeFile;
  var author = file && file.author;
  var domain = file && file.domain;
  var bookmarked = file && file.bookmarked;
  var sourceUrl = file && file.url;

  // Fetch raw markdown and render to HTML
  var rawText = '';
  if (serverMode) {
    var res = await fetch('/api/file?name=' + encodeURIComponent(activeFile));
    if (res.ok) rawText = await res.text();
  }
  if (!rawText) return;

  var parsed = parseFrontmatter(rawText);
  var bodyHtml = sanitizeHtml(marked.parse(cleanMarkdown(parsed.body)));

  // Build metadata line
  var metaParts = [];
  if (author) metaParts.push(escapeHtml(author));
  if (domain) metaParts.push(escapeHtml(domain));
  if (bookmarked) metaParts.push('Saved ' + escapeHtml(bookmarked.slice(0, 10)));
  var metaHtml = metaParts.length ? '<div class="meta">' + metaParts.join(' &middot; ') + '</div>' : '';

  // Tags
  var tagsHtml = '';
  if (inclTags) {
    var allTags = [...(articleNotes.tags || []), ...(articleNotes.machineTags || [])];
    if (allTags.length) {
      tagsHtml = '<div class="meta"><strong>Tags:</strong> ' + allTags.map(function(t) { return escapeHtml(t); }).join(', ') + '</div>';
    }
  }

  // Summary
  var summaryHtml = '';
  if (inclSummary && parsed.meta && parsed.meta.summary) {
    summaryHtml = '<blockquote class="summary"><strong>Summary:</strong> ' + escapeHtml(parsed.meta.summary) + '</blockquote>';
  }

  // Highlights
  var highlightsHtml = '';
  if (inclHighlights && articleHighlights.length > 0) {
    highlightsHtml = '<hr><h2>Highlights</h2><ul>';
    for (var i = 0; i < articleHighlights.length; i++) {
      var hl = articleHighlights[i];
      highlightsHtml += '<li><blockquote>' + escapeHtml(hl.text) + '</blockquote>';
      if (hl.note) highlightsHtml += '<p><em>' + escapeHtml(hl.note) + '</em></p>';
      highlightsHtml += '</li>';
    }
    highlightsHtml += '</ul>';
  }

  // Notes
  var notesHtml = '';
  if (inclNotes) {
    var hasArticleNote = articleNotes.articleNote && articleNotes.articleNote.trim();
    var hasAnnotations = articleNotes.annotations && articleNotes.annotations.length > 0;
    if (hasArticleNote || hasAnnotations) {
      notesHtml = '<hr><h2>Notes</h2>';
      if (hasArticleNote) {
        notesHtml += '<p>' + escapeHtml(articleNotes.articleNote.trim()) + '</p>';
      }
      if (hasAnnotations) {
        notesHtml += '<ul>';
        for (var j = 0; j < articleNotes.annotations.length; j++) {
          var ann = articleNotes.annotations[j];
          notesHtml += '<li><blockquote>' + escapeHtml(ann.text) + '</blockquote>';
          notesHtml += '<p><em>' + escapeHtml(ann.note) + '</em></p></li>';
        }
        notesHtml += '</ul>';
      }
    }
  }

  // Source link
  var sourceHtml = sourceUrl ? '<hr><p class="meta">Source: ' + escapeHtml(sourceUrl) + '</p>' : '';

  var content = '<h1>' + escapeHtml(title) + '</h1>'
    + metaHtml + tagsHtml + summaryHtml + bodyHtml
    + highlightsHtml + notesHtml + sourceHtml;

  prPrintHtml(content);
}

function shareMastodon(encodedText) {
  var server = localStorage.getItem('pr-mastodon-instance');
  if (server) {
    prOpenExternal('https://' + server + '/share?text=' + encodedText);
  } else {
    promptMastodonSetup(encodedText);
  }
}

function promptMastodonSetup(encodedText) {
  // Close any share dropdown
  var panel = document.querySelector('.share-dropdown-panel');
  if (panel) panel.remove();

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Mastodon Setup');
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = '\
    <div class="modal-card" onclick="event.stopPropagation()" style="max-width:400px">\
      <h2>Mastodon Instance</h2>\
      <p style="color:var(--muted);font-size:13px;margin-bottom:12px">Enter your Mastodon server to share articles there.</p>\
      <input type="text" id="mastodon-setup-input" placeholder="e.g., xoxo.zone, mastodon.social" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:14px;font-family:inherit;box-sizing:border-box" autofocus>\
      <div class="modal-actions">\
        <button class="btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button>\
        <button class="btn-primary" onclick="saveMastodonAndShare(\'' + encodedText + '\')">Save &amp; Share</button>\
      </div>\
    </div>\
  ';
  document.body.appendChild(overlay);
  var input = overlay.querySelector('#mastodon-setup-input');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') saveMastodonAndShare(encodedText);
    });
    input.focus();
  }
}

function saveMastodonAndShare(encodedText) {
  var input = document.getElementById('mastodon-setup-input');
  var val = (input ? input.value : '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!val) return;
  localStorage.setItem('pr-mastodon-instance', val);
  var overlay = input.closest('.modal-overlay');
  if (overlay) overlay.remove();
  prOpenExternal('https://' + val + '/share?text=' + encodedText);
}

function showQuoteSharePanel(quote, title, url) {
  // Close any existing share panel
  var existing = document.querySelector('.share-dropdown-panel');
  if (existing) existing.remove();

  var attribution = title ? ('\n\n\u2014 ' + title + (url ? ' ' + url : '')) : (url ? '\n\n' + url : '');
  var shareText = '\u201c' + quote + '\u201d' + attribution;
  var encodedText = encodeURIComponent(shareText);
  var clipboardText = '\u201c' + quote + '\u201d' + (title ? ' \u2014 ' + title : '') + (url ? ' ' + url : '');

  var panel = document.createElement('div');
  panel.className = 'share-dropdown-panel quote-share-panel';
  panel.onclick = function(ev) { ev.stopPropagation(); };

  var html = '';
  html += '<div class="share-group-label">Quote</div>';
  html += '<div class="quote-share-preview">\u201c' + escapeHtml(quote.length > 140 ? quote.slice(0, 140) + '\u2026' : quote) + '\u201d</div>';
  html += '<button onclick="copyQuoteToClipboard(this)"><svg class="share-icon" viewBox="0 0 640 512"><use href="#i-link"/></svg> Copy Quote</button>';
  html += '<hr>';
  html += '<div class="share-group-label">Share to</div>';
  html += '<button onclick="prOpenExternal(\'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(url) + '\')"><svg class="share-icon" viewBox="0 0 448 512"><use href="#i-linkedin"/></svg> LinkedIn</button>';
  html += '<button onclick="prOpenExternal(\'https://bsky.app/intent/compose?text=' + encodedText + '\')"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-bluesky"/></svg> Bluesky</button>';
  html += '<button onclick="shareMastodon(\'' + encodedText + '\')"><svg class="share-icon" viewBox="0 0 448 512"><use href="#i-mastodon"/></svg> Mastodon</button>';
  html += '<button onclick="prOpenExternal(\'https://www.threads.net/intent/post?text=' + encodedText + '\')"><svg class="share-icon" viewBox="0 0 448 512"><use href="#i-threads"/></svg> Threads</button>';
  html += '<hr>';
  html += '<div class="share-group-label">Send</div>';
  html += '<button onclick="prOpenExternal(\'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodedText + '\')"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-envelope"/></svg> Email</button>';
  html += '<button onclick="prOpenExternal(\'sms:&body=' + encodedText + '\')"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-comment"/></svg> Messages</button>';

  panel.innerHTML = html;
  panel.setAttribute('data-clipboard-text', clipboardText);

  // Position near the selection
  var sel = window.getSelection();
  var pane = document.getElementById('content-scroll');
  if (sel && sel.rangeCount > 0 && pane) {
    var range = sel.getRangeAt(0);
    var rect = range.getBoundingClientRect();
    var paneRect = pane.getBoundingClientRect();
    panel.style.position = 'absolute';
    panel.style.left = Math.max(10, rect.left - paneRect.left) + 'px';
    panel.style.top = (rect.bottom - paneRect.top + pane.scrollTop + 8) + 'px';
    pane.appendChild(panel);
  } else {
    document.body.appendChild(panel);
  }
}

function copyQuoteToClipboard(btn) {
  var panel = btn.closest('.quote-share-panel');
  var text = panel ? panel.getAttribute('data-clipboard-text') : '';
  if (!text) return;
  navigator.clipboard.writeText(text).then(function() {
    var orig = btn.innerHTML;
    btn.innerHTML = '<span class="share-icon">&#10003;</span> Copied!';
    setTimeout(function() { btn.innerHTML = orig; }, 1200);
  });
}

// Close share dropdown when clicking outside
document.addEventListener('click', function(e) {
  const panel = document.querySelector('.share-dropdown-panel');
  if (panel && !panel.contains(e.target) && !e.target.closest('.share-dropdown')) {
    panel.remove();
  }
  var morePanel = document.querySelector('.more-dropdown-panel');
  if (morePanel && !morePanel.contains(e.target) && !e.target.closest('.more-dropdown')) {
    morePanel.remove();
  }
});

// Batch auto-tag all articles
async function batchAutotagAll(force) {
  if (!serverMode) return;

  var btn = document.getElementById('batch-tag-btn');
  var origText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true" style="opacity:0.5;vertical-align:-1px"><use href="#i-wand"/></svg> Tagging...';
  }
  showToast(force ? 'Re-tagging all articles...' : 'Tagging untagged articles...', 3000);

  try {
    const res = await fetch('/api/autotag-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: !!force })
    });
    const data = await res.json();
    if (data.error) {
      showToast('Auto-tag failed: ' + data.error, 5000);
    } else {
      showToast('Tagged ' + (data.tagged || 0) + ' articles', 4000);
      if (btn) btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true" style="opacity:0.5;vertical-align:-1px"><use href="#i-wand"/></svg> Done!';
      await loadAnnotationsIndex();
      renderFileList();
      setTimeout(function() { var ep = document.querySelector('.explore-tabs'); if (ep) goHome(); }, 2000);
    }
  } catch (err) {
    showToast('Auto-tag request failed.', 5000);
  }
  if (btn) {
    btn.disabled = false;
    if (btn.innerHTML.includes('Tagging')) btn.innerHTML = origText;
  }
}

let _modalReturnFocus = null;

function trapFocus(overlay) {
  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key !== 'Tab') return;
    const focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

