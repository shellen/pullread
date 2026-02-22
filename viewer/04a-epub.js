// ABOUTME: EPUB rendering using epub.js library
// ABOUTME: Handles loading, displaying, and navigating EPUB books in the viewer

var _currentEpubBook = null;
var _currentEpubRendition = null;

function destroyEpub() {
  if (_currentEpubRendition) {
    try { _currentEpubRendition.destroy(); } catch {}
    _currentEpubRendition = null;
  }
  if (_currentEpubBook) {
    try { _currentEpubBook.destroy(); } catch {}
    _currentEpubBook = null;
  }
  var viewer = document.getElementById('epub-viewer');
  if (viewer) {
    viewer.style.display = 'none';
    viewer.innerHTML = '';
  }
}

function renderEpub(filename, fileMeta) {
  // Clean up any previous EPUB
  destroyEpub();

  var content = document.getElementById('content');
  var empty = document.getElementById('empty-state');
  var epubViewer = document.getElementById('epub-viewer');
  var contentPane = document.getElementById('content-pane');

  // Hide the markdown content, show EPUB viewer
  empty.style.display = 'none';
  content.style.display = 'none';
  epubViewer.style.display = 'block';

  // Build the EPUB viewer UI
  var html = '';

  // Header with title and navigation
  html += '<div class="article-header">';
  html += '<h1>' + escapeHtml(fileMeta.title || filename) + '</h1>';
  html += '<div class="article-byline">';
  var parts = [];
  if (fileMeta.author) parts.push('<span class="author">' + escapeHtml(fileMeta.author) + '</span>');
  parts.push('<span>EPUB</span>');
  html += parts.join('<span class="sep">&middot;</span>');
  html += '</div>';

  // Action buttons
  html += '<div class="article-actions">';
  var isFav = articleNotes.isFavorite;
  html += '<button onclick="toggleFavoriteFromHeader(this)" class="' + (isFav ? 'active-fav' : '') + '" aria-label="' + (isFav ? 'Remove from favorites' : 'Add to favorites') + '" aria-pressed="' + isFav + '"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-' + (isFav ? 'heart' : 'heart-o') + '"/></svg> Favorite</button>';
  html += '</div>';
  // Tags row
  html += '<div id="header-tags"></div>';
  html += '</div>';

  // EPUB navigation controls
  html += '<div class="epub-controls">';
  html += '<button class="epub-nav-btn" id="epub-prev" onclick="epubPrev()" aria-label="Previous page">';
  html += '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor"/></svg>';
  html += '</button>';
  html += '<div class="epub-area" id="epub-area"></div>';
  html += '<button class="epub-nav-btn" id="epub-next" onclick="epubNext()" aria-label="Next page">';
  html += '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/></svg>';
  html += '</button>';
  html += '</div>';

  // Chapter/location info
  html += '<div class="epub-info" id="epub-info"></div>';

  // TOC panel
  html += '<details class="epub-toc-details" id="epub-toc-details">';
  html += '<summary>Table of Contents</summary>';
  html += '<ul class="epub-toc-list" id="epub-toc-list"></ul>';
  html += '</details>';

  epubViewer.innerHTML = html;

  // Scroll to top
  contentPane.scrollTop = 0;
  document.title = (fileMeta.title || filename) + ' — PullRead';

  // Initialize epub.js
  if (typeof ePub === 'undefined') {
    document.getElementById('epub-area').innerHTML = '<p style="padding:40px;color:var(--muted)">epub.js library not loaded. Check your internet connection.</p>';
    return;
  }

  var book = ePub('/api/epub?name=' + encodeURIComponent(filename));
  _currentEpubBook = book;

  var area = document.getElementById('epub-area');
  var rendition = book.renderTo(area, {
    width: '100%',
    height: '100%',
    spread: 'none',
    flow: 'paginated',
  });
  _currentEpubRendition = rendition;

  // Apply theme to match current PullRead theme
  applyEpubTheme(rendition);

  // Restore saved location or display from start
  var savedLoc = localStorage.getItem('pr-epub-loc-' + filename);
  if (savedLoc) {
    rendition.display(savedLoc);
  } else {
    rendition.display();
  }

  // Save location on page turns
  rendition.on('relocated', function(location) {
    if (location && location.start && location.start.cfi) {
      localStorage.setItem('pr-epub-loc-' + filename, location.start.cfi);
    }
    updateEpubInfo(book, location);
  });

  // Build TOC when book is ready
  book.loaded.navigation.then(function(nav) {
    renderEpubToc(nav.toc, rendition);
  });

  // Handle keyboard navigation within the EPUB iframe
  rendition.on('keydown', function(e) {
    if (e.key === 'ArrowLeft') { epubPrev(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { epubNext(); e.preventDefault(); }
  });
}

function epubPrev() {
  if (_currentEpubRendition) _currentEpubRendition.prev();
}

function epubNext() {
  if (_currentEpubRendition) _currentEpubRendition.next();
}

function applyEpubTheme(rendition) {
  var theme = document.body.getAttribute('data-theme');
  var isDark = theme === 'dark' || theme === 'high-contrast';

  rendition.themes.default({
    'body': {
      'font-family': 'var(--content-font, Georgia, serif)',
      'font-size': 'var(--content-size, 18px)',
      'line-height': '1.7',
      'color': isDark ? '#d4d4d4' : '#1a1a1a',
      'background': isDark ? '#1e1e1e' : '#ffffff',
      'padding': '20px 40px',
    },
    'a': {
      'color': isDark ? '#6db3f2' : '#1a6daa',
    },
    'img': {
      'max-width': '100%',
      'height': 'auto',
    },
  });
}

function updateEpubInfo(book, location) {
  var info = document.getElementById('epub-info');
  if (!info || !location) return;

  var parts = [];
  if (location.start && location.start.displayed) {
    parts.push('Page ' + location.start.displayed.page + ' of ' + location.start.displayed.total);
  }
  // Show percentage progress
  if (book.locations && book.locations.length()) {
    var pct = book.locations.percentageFromCfi(location.start.cfi);
    if (!isNaN(pct)) {
      parts.push(Math.round(pct * 100) + '%');
    }
  }
  info.textContent = parts.join(' — ');
}

function renderEpubToc(toc, rendition) {
  var list = document.getElementById('epub-toc-list');
  if (!list) return;

  function renderItems(items, depth) {
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var indent = depth > 0 ? ' style="padding-left:' + (depth * 16) + 'px"' : '';
      html += '<li' + indent + '><a href="#" data-epub-href="' + escapeHtml(item.href) + '" onclick="epubGoToChapter(this, event)">' + escapeHtml(item.label.trim()) + '</a></li>';
      if (item.subitems && item.subitems.length > 0) {
        html += renderItems(item.subitems, depth + 1);
      }
    }
    return html;
  }

  list.innerHTML = renderItems(toc, 0);
}

function epubGoToChapter(el, event) {
  event.preventDefault();
  var href = el.getAttribute('data-epub-href');
  if (_currentEpubRendition && href) {
    _currentEpubRendition.display(href);
  }
}

// When navigating away from an EPUB article, clean up
var _origGoHome = typeof goHome === 'function' ? goHome : null;
