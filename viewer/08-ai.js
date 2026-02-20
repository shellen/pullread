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

function providerBadgeColor(provider) {
  const colors = { anthropic: 'amber', openai: 'green', gemini: 'blue', openrouter: 'purple', apple: 'indigo' };
  return colors[provider] || 'gray';
}

function summaryBadgesHtml(provider, model) {
  let html = '<span class="badge badge-gray">Summary</span>';
  if (provider) {
    const color = providerBadgeColor(provider);
    html += ' <span class="badge badge-' + color + '">' + escapeHtml(providerLabel(provider)) + '</span>';
  }
  if (model) {
    html += ' <span class="badge badge-gray">' + escapeHtml(model) + '</span>';
  }
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
    alert('Re-fetch failed: ' + (err.message || err));
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

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'article-summary';
    summaryDiv.innerHTML = '<div class="summary-header"><div class="summary-header-left">'
      + summaryBadgesHtml(lastSummaryProvider, lastSummaryModel)
      + '</div><span class="summary-actions"><button onclick="hideSummary()" title="Hide summary"><svg class="icon icon-sm"><use href="#i-xmark"/></svg></button></span></div>'
      + escapeHtml(data.summary);

    const articleHeader = content.querySelector('.article-header');
    if (articleHeader) {
      articleHeader.after(summaryDiv);
    } else {
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

function hideSummary() {
  const content = document.getElementById('content');
  const summary = content.querySelector('.article-summary');
  if (summary) summary.remove();
  // Reset summarize button
  const btn = document.getElementById('summarize-btn');
  if (btn) {
    btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-wand"/></svg> Summarize';
    btn.title = 'Summarize';
    btn.disabled = false;
    btn.onclick = null;
  }
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
    <button onclick="showExportMarkdownModal()"><svg class="share-icon" viewBox="0 0 640 512"><use href="#i-cloud-download"/></svg> Export Markdown</button>
    <button onclick="startNotebookFromArticle()"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-pen"/></svg> Write About This</button>
    <hr>
    <div class="share-group-label">Share to</div>
    <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}" target="_blank" rel="noopener"><svg class="share-icon" viewBox="0 0 448 512"><use href="#i-linkedin"/></svg> LinkedIn</a>
    <a href="https://bsky.app/intent/compose?text=${encodedText}" target="_blank" rel="noopener"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-bluesky"/></svg> Bluesky</a>
    <a href="https://mastodon.social/share?text=${encodedText}" target="_blank" rel="noopener"><svg class="share-icon" viewBox="0 0 448 512"><use href="#i-mastodon"/></svg> Mastodon</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noopener"><svg class="share-icon" viewBox="0 0 320 512"><use href="#i-facebook"/></svg> Facebook</a>
    <a href="https://www.threads.net/intent/post?text=${encodedText}" target="_blank" rel="noopener"><svg class="share-icon" viewBox="0 0 448 512"><use href="#i-threads"/></svg> Threads</a>
    <hr>
    <div class="share-group-label">Send</div>
    <a href="mailto:?subject=${encodedTitle}&body=${encodedText}" target="_blank"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-envelope"/></svg> Email</a>
    <a href="sms:&body=${encodedText}"><svg class="share-icon" viewBox="0 0 512 512"><use href="#i-comment"/></svg> Messages</a>
  `;

  e.target.closest('.share-dropdown').appendChild(panel);
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

  // Download as file
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = activeFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Close modal
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) overlay.remove();
}

// Close share dropdown when clicking outside
document.addEventListener('click', function(e) {
  const panel = document.querySelector('.share-dropdown-panel');
  if (panel && !panel.contains(e.target) && !e.target.closest('.share-dropdown')) {
    panel.remove();
  }
});

// Batch auto-tag all articles
async function batchAutotagAll(force) {
  if (!serverMode) return;

  // Show warning before proceeding
  var msg = force
    ? 'This will re-tag ALL articles using AI, replacing any existing machine-generated tags. User tags will be preserved. Continue?'
    : 'This will auto-tag all untagged articles using AI. This may take a while for large libraries. Continue?';
  if (!confirm(msg)) return;

  var btn = document.getElementById('batch-tag-btn');
  var origText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true" style="opacity:0.5;vertical-align:-1px"><use href="#i-wand"/></svg> Tagging...';
  }

  try {
    const res = await fetch('/api/autotag-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: !!force })
    });
    const data = await res.json();
    if (data.error) {
      alert('Auto-tag failed: ' + data.error);
    } else {
      if (btn) btn.innerHTML = '<svg class="icon icon-sm" aria-hidden="true" style="opacity:0.5;vertical-align:-1px"><use href="#i-wand"/></svg> Done!';
      // Refresh annotations index to pick up new tags
      await loadAnnotationsIndex();
      renderFileList();
      // Refresh the explore page if open
      setTimeout(function() { var ep = document.querySelector('.explore-tabs'); if (ep) showTagCloud(); }, 2000);
    }
  } catch (err) {
    alert('Auto-tag request failed.');
  }
  if (btn) {
    btn.disabled = false;
    if (btn.innerHTML.includes('Tagging')) btn.innerHTML = origText;
  }
}

// ---- Chrome Translation API (progressive enhancement) ----

let _translatedContent = null;
let _originalContent = null;
let _detectedSourceLang = null;

var TRANSLATE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'ru', label: 'Russian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'tr', label: 'Turkish' },
  { code: 'pl', label: 'Polish' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'sv', label: 'Swedish' },
  { code: 'da', label: 'Danish' },
  { code: 'no', label: 'Norwegian' },
  { code: 'fi', label: 'Finnish' },
];

function translateArticle(btn) {
  if (!btn || typeof Translator === 'undefined') return;

  // Toggle back to original
  if (_translatedContent && btn.classList.contains('active-fav')) {
    var body = document.querySelector('#content .article-body');
    if (body && _originalContent) body.innerHTML = _originalContent;
    btn.classList.remove('active-fav');
    btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-globe"/></svg> Translate';
    btn.title = 'Translate article';
    _translatedContent = null;
    _originalContent = null;
    return;
  }

  // Show language picker dropdown
  var existing = document.getElementById('translate-picker');
  if (existing) { existing.remove(); return; }

  var picker = document.createElement('div');
  picker.id = 'translate-picker';
  picker.className = 'translate-picker';

  // Detect source language in background
  _detectedSourceLang = null;
  var body = document.querySelector('#content .article-body');
  if (body && typeof LanguageDetector !== 'undefined') {
    LanguageDetector.create().then(function(detector) {
      return detector.detect(body.innerText.slice(0, 1000));
    }).then(function(results) {
      if (results && results.length > 0 && results[0].confidence > 0.3) {
        _detectedSourceLang = results[0].detectedLanguage;
        var label = picker.querySelector('.translate-detected');
        if (label) {
          var langName = TRANSLATE_LANGUAGES.find(function(l) { return l.code === _detectedSourceLang; });
          label.textContent = 'Detected: ' + (langName ? langName.label : _detectedSourceLang);
        }
      }
    }).catch(function() {});
  }

  var userLang = (navigator.language || 'en').split('-')[0];
  var html = '<div class="translate-detected" style="font-size:11px;color:var(--muted);padding:6px 10px;border-bottom:1px solid var(--border)">Detecting language\u2026</div>';
  html += '<div style="padding:4px 0;max-height:260px;overflow-y:auto">';
  for (var i = 0; i < TRANSLATE_LANGUAGES.length; i++) {
    var lang = TRANSLATE_LANGUAGES[i];
    var isDefault = lang.code === userLang;
    html += '<button class="translate-lang-btn' + (isDefault ? ' default' : '') + '" onclick="runTranslation(\'' + lang.code + '\')">'
      + lang.label + (isDefault ? ' \u2713' : '') + '</button>';
  }
  html += '</div>';
  picker.innerHTML = html;

  btn.parentNode.style.position = 'relative';
  btn.parentNode.appendChild(picker);

  // Close on outside click
  setTimeout(function() {
    document.addEventListener('click', function closePicker(e) {
      if (!picker.contains(e.target) && e.target !== btn) {
        picker.remove();
        document.removeEventListener('click', closePicker);
      }
    });
  }, 0);
}

async function runTranslation(targetLang) {
  var picker = document.getElementById('translate-picker');
  if (picker) picker.remove();

  var btn = document.getElementById('translate-btn');
  if (!btn) return;

  btn.disabled = true;
  btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-globe"/></svg> Detecting\u2026';

  var body = document.querySelector('#content .article-body');
  if (!body) { btn.disabled = false; btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-globe"/></svg> Translate'; return; }

  try {
    // Use detected language or detect now
    var sourceLang = _detectedSourceLang || 'en';
    if (!_detectedSourceLang && typeof LanguageDetector !== 'undefined') {
      var detector = await LanguageDetector.create();
      var results = await detector.detect(body.innerText.slice(0, 1000));
      if (results && results.length > 0 && results[0].confidence > 0.3) {
        sourceLang = results[0].detectedLanguage;
      }
    }

    if (sourceLang === targetLang) {
      showToast('Article is already in that language');
      btn.disabled = false;
      btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-globe"/></svg> Translate';
      return;
    }

    // Check translation availability
    var avail = await Translator.availability({ sourceLanguage: sourceLang, targetLanguage: targetLang });
    if (avail === 'unavailable') {
      var srcName = TRANSLATE_LANGUAGES.find(function(l) { return l.code === sourceLang; });
      var tgtName = TRANSLATE_LANGUAGES.find(function(l) { return l.code === targetLang; });
      showToast('Translation from ' + (srcName ? srcName.label : sourceLang) + ' to ' + (tgtName ? tgtName.label : targetLang) + ' is not available', true);
      btn.disabled = false;
      btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-globe"/></svg> Translate';
      return;
    }

    btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-globe"/></svg> Translating\u2026';

    if (avail === 'downloadable' || avail === 'downloading') {
      showToast('Downloading language pack\u2026');
    }

    var translator = await Translator.create({ sourceLanguage: sourceLang, targetLanguage: targetLang });

    // Save original and translate paragraph by paragraph
    _originalContent = body.innerHTML;
    var paragraphs = body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption, td, th');

    for (var i = 0; i < paragraphs.length; i++) {
      var el = paragraphs[i];
      var text = el.textContent.trim();
      if (text.length < 3) continue;
      try {
        var translated = await translator.translate(text);
        el.textContent = translated;
      } catch (e) {
        // Skip paragraphs that fail
      }
    }

    _translatedContent = body.innerHTML;
    var tgtLabel = TRANSLATE_LANGUAGES.find(function(l) { return l.code === targetLang; });
    btn.classList.add('active-fav');
    btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-globe"/></svg> Original';
    btn.title = 'Translated to ' + (tgtLabel ? tgtLabel.label : targetLang) + '. Click to show original.';
    btn.disabled = false;
  } catch (err) {
    showToast('Translation failed: ' + err.message, true);
    btn.disabled = false;
    btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-globe"/></svg> Translate';
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

