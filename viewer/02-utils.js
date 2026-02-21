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
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
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
