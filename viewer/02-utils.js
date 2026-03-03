// ABOUTME: Shared utility functions for the viewer — media detection, time formatting, search, sections
// ABOUTME: Used by sidebar, article, explore, and graph modules via concatenated global scope
// Media enclosure type helpers — shared across article, sidebar, and TTS
function isAudioEnclosure(type) { return !!(type && type.startsWith('audio/')); }
function isVideoEnclosure(type) {
  if (!type) return false;
  var lower = type.toLowerCase();
  return lower.startsWith('video/') || lower === 'application/x-mpegurl' || lower === 'application/vnd.apple.mpegurl';
}
function isMediaEnclosure(type) { return isAudioEnclosure(type) || isVideoEnclosure(type); }
function isHlsSource(url) {
  if (!url) return false;
  var lower = url.toLowerCase();
  return lower.endsWith('.m3u8') || lower.includes('.m3u8?');
}

function extractYouTubeVideoId(url) {
  if (!url) return null;
  try {
    var u = new URL(url);
    var host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split(/[/?]/)[0] || null;
    if (host !== 'youtube.com') return null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    var m = u.pathname.match(/^\/(embed|v|shorts)\/([^/?]+)/);
    return m ? m[2] : null;
  } catch { return null; }
}

function isYouTubeDomain(domain) {
  if (!domain) return false;
  return /^(www\.|m\.)?(youtube\.com|youtu\.be)$/.test(domain);
}

// Abbreviate large numbers: 0-99 exact, 100+ → "100+", 1000+ → "1K+", 13000 → "13K+"
function approxCount(n) {
  if (n < 100) return String(n);
  if (n < 1000) return Math.floor(n / 100) * 100 + '+';
  return Math.floor(n / 1000) + 'K+';
}

// Fold accented characters to ASCII for accent-insensitive search
function foldAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Frontmatter
function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: null, body: text };
  const meta = {};
  match[1].split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"');
      meta[key] = val;
    }
  });
  if (meta.title) meta.title = stripTags(meta.title);
  return { meta, body: match[2] };
}

function stripTags(s) {
  return s ? s.replace(/<[^>]+>/g, '').trim() : s;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Sanitize rendered HTML to prevent XSS from malicious article content
function sanitizeHtml(html) {
  if (typeof DOMPurify !== 'undefined') return DOMPurify.sanitize(html);
  return html;
}

// Escape a string for safe interpolation inside single-quoted JS strings in onclick attributes
function escapeJsStr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

// Clean up broken markdown patterns that marked.js can't handle
function cleanMarkdown(md) {
  // Fix image/link patterns split across lines:
  // [\n![alt](img)\n]\n(url) -> [![alt](img)](url)
  md = md.replace(/\[\s*\n\s*(!\[[^\]]*\]\([^)]*\))\s*\n\s*\]\s*\n\s*(\([^)]*\))/g, '[$1]$2');

  // Fix simpler case: [text\n](url) -> [text](url)
  md = md.replace(/\[([^\]]*?)\s*\n\s*\]\s*\n?\s*(\([^)]*\))/g, '[$1]$2');

  // Fix standalone brackets around images: [\n![alt](url)\n] without a link
  md = md.replace(/\[\s*\n(!\[[^\]]*\]\([^)]*\))\s*\n\]/g, '$1');

  // Fix image syntax broken by newlines: ![\nalt\n]\n(url) -> ![alt](url)
  md = md.replace(/!\[\s*\n?\s*([^\]]*?)\s*\n?\s*\]\s*\n\s*(\([^)]*\))/g, '![$1]$2');

  // Fix standalone brackets wrapping images on same line: [![alt](img)] -> ![alt](img)
  md = md.replace(/\[\s*(!\[[^\]]*\]\([^)]*\))\s*\]/g, '$1');

  // Fix broken link-wrapped images where link part is on next line: [![alt](img)]\n(url)
  md = md.replace(/(!\[[^\]]*\]\([^)]*\))\s*\]\s*\n\s*(\([^)]*\))/g, '$1');

  // Remove orphaned ](...) on its own line after an image (broken link fragment)
  md = md.replace(/(!\[[^\]]*\]\([^)]*\))\s*\n+\s*\]\([^)]*\)/g, '$1');

  // Collapse linked images where link URL = image URL: [![alt](url)](url) → ![alt](url)
  md = md.replace(/\[!\[([^\]]*)\]\(([^)]+)\)\]\(\2\)/g, '![$1]($2)');

  // Fix escaped brackets around links: \[[text](url)\] → &#91;text link&#93;
  // marked.js mishandles \] after a link, swallowing the closing bracket
  md = md.replace(/\\\[(\[[^\]]+\]\([^)]+\))\\\]/g, '&#91;$1&#93;');

  // Simplify Substack CDN proxy URLs in images — these are extremely long and contain
  // commas/colons that break marked.js. Extract the real image URL from inside.
  // e.g. ![alt](https://substackcdn.com/image/fetch/w_1456,c_limit,.../https%3A%2F%2Fsubstack-post-media...)
  // becomes ![alt](https://substack-post-media.s3.amazonaws.com/public/images/abc.png)
  md = md.replace(/!\[([^\]]*)\]\((https:\/\/substackcdn\.com\/image\/fetch\/[^)]+)\)/g, function(m, alt, url) {
    var inner = url.match(/\/image\/fetch\/[^/]*\/(https?[:%].*)/);
    if (inner) {
      try { return '![' + alt + '](' + decodeURIComponent(inner[1]) + ')'; } catch(e) {}
      return '![' + alt + '](' + inner[1] + ')';
    }
    return m;
  });

  // Also catch Substack CDN URLs that leaked out of image syntax as raw text on their own line.
  // These appear when the markdown image syntax broke (e.g. commas terminated the URL).
  // Pattern: line starting with the raw URL (possibly with a leading "(" or broken "![" prefix)
  md = md.replace(/^!?\[?[^\]\n]*\]?\(?(https:\/\/substackcdn\.com\/image\/fetch\/[^\s)]+)\)?$/gm, function(m, url) {
    var inner = url.match(/\/image\/fetch\/[^/]*\/(https?[:%].*)/);
    if (inner) {
      try { return '![]('+decodeURIComponent(inner[1])+')'; } catch(e) {}
      return '![]('+inner[1]+')';
    }
    return m;
  });

  // Remove standalone parenthesized URLs on their own line (leftover link targets)
  // e.g. a line that is just "(https://substackcdn.com/image/fetch/...)"
  md = md.replace(/^\(https?:\/\/[^)]+\)\s*$/gm, '');

  // Remove parenthesized URLs that span multiple lines (long substackcdn URLs wrap)
  md = md.replace(/^\(https?:\/\/[^\n)]*\n[^)]*\)\s*$/gm, '');

  // Remove Wayback Machine parenthesized URLs: (/web/20250908.../https://...)
  md = md.replace(/\(\/web\/\d+\/https?:\/\/[^)]+\)/g, '');

  // Remove lone [ or ] on their own line (broken markdown fragments)
  md = md.replace(/^\s*[\[\]]\s*$/gm, '');

  // Remove common image accessibility boilerplate from Wayback/archive extractions
  md = md.replace(/^\s*Press enter or click to view image in full size\s*$/gm, '');

  // Clean up PDF LaTeX/math artifacts from arxiv and academic papers
  md = md.replace(/start_POSTSUBSCRIPT\b/g, '');
  md = md.replace(/end_POSTSUBSCRIPT\b/g, '');
  md = md.replace(/start_POSTSUPERSCRIPT\b/g, '');
  md = md.replace(/end_POSTSUPERSCRIPT\b/g, '');
  md = md.replace(/\\boldsymbol\{[^}]*\}/g, '');
  md = md.replace(/\\mathbb\{[^}]*\}/g, '');
  md = md.replace(/\\left[\\\[\({|]/g, '');
  md = md.replace(/\\right[\\\]\)}|]/g, '');
  md = md.replace(/\\(?:text|mathrm|mathbf|mathcal|mathit)\{([^}]*)\}/g, '$1');
  md = md.replace(/\\(?:frac|sqrt|sum|prod|int|partial|nabla|infty|approx|neq|leq|geq|in|notin|subset|supset|cup|cap|forall|exists)\b/g, '');
  md = md.replace(/\^\{\\prime\}/g, "'");
  md = md.replace(/\{([^{}]*)\}/g, '$1');

  // Remove leftover empty lines from cleanup
  md = md.replace(/\n{3,}/g, '\n\n');

  return md;
}

// Format a date string as relative time for recent, named date for older
function timeAgo(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  if (isNaN(d)) return dateStr.slice(0, 10);
  var now = new Date();
  var diffMs = now - d;
  var diffMins = Math.floor(diffMs / 60000);
  var diffHours = Math.floor(diffMs / 3600000);
  var diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return diffMins + 'm ago';
  if (diffHours < 24) return diffHours + 'h ago';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return diffDays + 'd ago';
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (d.getFullYear() === now.getFullYear()) {
    return months[d.getMonth()] + ' ' + d.getDate();
  }
  return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

// Full datetime string for tooltip hover
function timeAgoTitle(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  var pad = function(n) { return n < 10 ? '0' + n : n; };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// Check if a feed name roughly matches an article's domain
function feedMatchesDomain(feedName, domain) {
  var f = feedName.toLowerCase().replace(/[^a-z0-9]/g, '');
  var d = domain.toLowerCase().replace(/^www\./, '').replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/g, '');
  return f.includes(d) || d.includes(f);
}

// Show a brief non-blocking toast message (auto-dismisses)
function showToast(message, durationMs) {
  if (!durationMs) durationMs = 4000;
  var el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(function() { el.classList.remove('visible'); }, durationMs);
}

// Shared tag input handler: parses comma/Enter, adds tag, calls callbacks
function handleTagInput(e, getTagsArray, onAdd) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    var tag = e.target.value.trim().replace(/,/g, '');
    if (!tag) return;
    var tags = getTagsArray();
    if (tags && !tags.includes(tag)) {
      tags.push(tag);
      onAdd(tag);
    }
    e.target.value = '';
  }
}

// Block/unblock tags from Explore and Home
function blockTag(tag) {
  blockedTags.add(tag);
  localStorage.setItem('pr-blocked-tags', JSON.stringify([...blockedTags]));
  showToast('Blocked "' + tag + '"');
}
function unblockTag(tag) {
  blockedTags.delete(tag);
  localStorage.setItem('pr-blocked-tags', JSON.stringify([...blockedTags]));
  showToast('Unblocked "' + tag + '"');
}
function isTagBlocked(tag) {
  return blockedTags.has(tag);
}

// Print styled HTML content using the system print dialog (Save as PDF on macOS).
// Uses @media print to hide the Pullread UI and show only the export content.
// In Tauri, invokes native print_webview command since JS window.print() is blocked.
var _prPrintStyles = 'font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.7;color:#222';
function prPrintHtml(bodyContent) {
  var container = document.createElement('div');
  container.id = 'pr-print-content';
  container.innerHTML = bodyContent;
  document.body.appendChild(container);

  var style = document.createElement('style');
  style.id = 'pr-print-style';
  style.textContent =
    '#pr-print-content { display: none; } ' +
    '@media print { ' +
    '  body > *:not(#pr-print-content) { display: none !important; } ' +
    '  #pr-print-content { display: block !important; ' + _prPrintStyles + ' } ' +
    '  #pr-print-content h1 { font-size:28px;margin-bottom:4px } ' +
    '  #pr-print-content h2,#pr-print-content h3 { margin-top:1.5em } ' +
    '  #pr-print-content blockquote { border-left:3px solid #ccc;margin:1em 0;padding:0.5em 1em;color:#555 } ' +
    '  #pr-print-content blockquote.summary { background:#f9f9f4;border-left-color:#b8a940;border-radius:4px } ' +
    '  #pr-print-content code { background:#f5f5f5;padding:2px 4px;border-radius:3px;font-size:0.9em } ' +
    '  #pr-print-content pre { background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto } ' +
    '  #pr-print-content img { max-width:100%;height:auto } ' +
    '  #pr-print-content .meta { font-size:13px;color:#888;margin-bottom:24px } ' +
    '}';
  document.head.appendChild(style);

  function cleanup() {
    if (container.parentNode) container.remove();
    if (style.parentNode) style.remove();
    window.removeEventListener('afterprint', cleanup);
  }
  window.addEventListener('afterprint', cleanup);

  if (window.PR_TAURI && window.__TAURI__) {
    window.__TAURI__.core.invoke('print_webview').then(function() {
      setTimeout(cleanup, 500);
    }).catch(function(err) {
      console.warn('Native print failed, falling back to save:', err);
      cleanup();
      prPrintFallback(bodyContent);
    });
  } else {
    window.print();
    setTimeout(cleanup, 120000);
  }
}

// Editorial section taxonomy — maps machineTags to newspaper-style sections
var SECTIONS = ['tech', 'news', 'science', 'business', 'culture', 'opinion', 'lifestyle'];

var SECTION_MAP = {
  // Tech
  artificialintelligence: 'tech', machinelearning: 'tech', programming: 'tech',
  software: 'tech', cybersecurity: 'tech', startups: 'tech', cloudcomputing: 'tech',
  webdevelopment: 'tech', opensource: 'tech', datascience: 'tech', blockchain: 'tech',
  cryptocurrency: 'tech', hardware: 'tech', robotics: 'tech', apple: 'tech',
  google: 'tech', microsoft: 'tech', amazon: 'tech', meta: 'tech', openai: 'tech',
  semiconductors: 'tech', computing: 'tech', android: 'tech', ios: 'tech',
  linux: 'tech', python: 'tech', javascript: 'tech', rust: 'tech', golang: 'tech',
  // News
  politics: 'news', government: 'news', elections: 'news', law: 'news',
  legislation: 'news', diplomacy: 'news', military: 'news', congress: 'news',
  supremecourt: 'news', whitehouse: 'news', foreignpolicy: 'news',
  immigration: 'news', democracy: 'news', journalism: 'news',
  // Science
  research: 'science', climate: 'science', climatechange: 'science', space: 'science',
  biology: 'science', physics: 'science', medicine: 'science', environment: 'science',
  neuroscience: 'science', genetics: 'science', astronomy: 'science', nasa: 'science',
  health: 'science', publichealth: 'science', mentalhealth: 'science',
  // Business
  finance: 'business', economics: 'business', markets: 'business',
  entrepreneurship: 'business', investing: 'business', management: 'business',
  venturecapital: 'business', wallstreet: 'business', banking: 'business',
  realestate: 'business', advertising: 'business', marketing: 'business',
  // Culture
  arts: 'culture', entertainment: 'culture', music: 'culture', film: 'culture',
  books: 'culture', media: 'culture', gaming: 'culture', television: 'culture',
  literature: 'culture', theater: 'culture', design: 'culture', architecture: 'culture',
  photography: 'culture', animation: 'culture', comics: 'culture', podcasts: 'culture',
  // Opinion (few tags — mostly LLM-classified)
  essay: 'opinion', commentary: 'opinion', editorial: 'opinion', analysis: 'opinion',
  // Lifestyle
  food: 'lifestyle', travel: 'lifestyle', fitness: 'lifestyle', fashion: 'lifestyle',
  parenting: 'lifestyle', cooking: 'lifestyle', wellness: 'lifestyle',
  productivity: 'lifestyle', diy: 'lifestyle',
};

var SECTION_LABELS = {
  tech: 'Tech', news: 'News', science: 'Science', business: 'Business',
  culture: 'Culture', opinion: 'Opinion', lifestyle: 'Lifestyle', other: 'Other'
};

function resolveSection(filename) {
  var notes = allNotesIndex[filename];
  if (!notes) return 'other';
  if (notes.section && SECTION_LABELS[notes.section]) return notes.section;
  var tags = notes.machineTags || [];
  if (tags.length === 0) return 'other';
  var counts = {};
  for (var i = 0; i < tags.length; i++) {
    var s = SECTION_MAP[tags[i]];
    if (s) counts[s] = (counts[s] || 0) + 1;
  }
  var best = 'other';
  var bestCount = 0;
  for (var key in counts) {
    if (counts[key] > bestCount) { best = key; bestCount = counts[key]; }
  }
  return best;
}

// Distribute N display slots across editorial sections proportionally with floor/ceiling guarantees
function allocateSectionSlots(sectionCounts, totalSlots) {
  var sections = [];
  var totalArticles = 0;
  for (var key in sectionCounts) {
    if (sectionCounts[key] > 0) {
      sections.push({ id: key, count: sectionCounts[key], slots: 0 });
      totalArticles += sectionCounts[key];
    }
  }
  var result = {};
  for (var key in sectionCounts) result[key] = 0;

  if (sections.length === 0 || totalSlots === 0) return result;

  var ceiling = sections.length === 1 ? totalSlots : Math.ceil(totalSlots * 0.4);

  // Give each section its proportional share, floored, with min 1
  var allocated = 0;
  for (var i = 0; i < sections.length; i++) {
    var s = sections[i];
    var share = Math.floor(totalSlots * s.count / totalArticles);
    s.slots = Math.max(share, 1);
    if (s.slots > ceiling) s.slots = ceiling;
    if (s.slots > s.count) s.slots = s.count;
    allocated += s.slots;
  }

  // Trim if over-allocated (many small sections all getting floor=1)
  while (allocated > totalSlots) {
    sections.sort(function(a, b) { return b.slots - a.slots; });
    for (var i = 0; i < sections.length && allocated > totalSlots; i++) {
      if (sections[i].slots > 1) {
        sections[i].slots--;
        allocated--;
      }
    }
    if (allocated > totalSlots) {
      for (var i = sections.length - 1; i >= 0 && allocated > totalSlots; i--) {
        if (sections[i].slots > 0) {
          sections[i].slots--;
          allocated--;
        }
      }
    }
  }

  // Distribute remaining slots to sections with most unserved demand
  while (allocated < totalSlots) {
    sections.sort(function(a, b) {
      return (b.count - b.slots) - (a.count - a.slots);
    });
    var added = false;
    for (var i = 0; i < sections.length && allocated < totalSlots; i++) {
      if (sections[i].slots < ceiling && sections[i].slots < sections[i].count) {
        sections[i].slots++;
        allocated++;
        added = true;
      }
    }
    if (!added) break;
  }

  for (var i = 0; i < sections.length; i++) {
    result[sections[i].id] = sections[i].slots;
  }
  return result;
}

// Fallback: save as HTML file when native print is unavailable
function prPrintFallback(bodyContent) {
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Export</title>'
    + '<style>body{' + _prPrintStyles + '}'
    + 'h1{font-size:28px;margin-bottom:4px}h2,h3{margin-top:1.5em}'
    + 'blockquote{border-left:3px solid #ccc;margin:1em 0;padding:0.5em 1em;color:#555}'
    + 'blockquote.summary{background:#f9f9f4;border-left-color:#b8a940;border-radius:4px}'
    + 'code{background:#f5f5f5;padding:2px 4px;border-radius:3px;font-size:0.9em}'
    + 'pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto}'
    + 'img{max-width:100%;height:auto}'
    + '.meta{font-size:13px;color:#888;margin-bottom:24px}'
    + '</style></head><body>' + bodyContent + '</body></html>';
  var filename = (activeFile || 'export').replace(/\.md$/, '') + '.html';
  prSaveFile(html, filename, 'text/html;charset=utf-8').then(function(saved) {
    if (saved) showToast('Saved as HTML — open in browser to print as PDF');
  });
}
