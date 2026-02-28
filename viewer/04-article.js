// ABOUTME: Hub landing page (merged Home + Explore) and article rendering.
// ABOUTME: renderHub() builds the tabbed hub; loadFile() renders individual articles.
function renderHub() {
  var dash = document.getElementById('dashboard');
  if (!dash) return;

  var empty = document.getElementById('empty-state');
  var content = document.getElementById('content');
  empty.style.display = '';
  if (content) { content.style.display = 'none'; content.classList.remove('settings-view'); }
  var toolbar = document.getElementById('reader-toolbar');
  if (toolbar) toolbar.style.display = 'none';

  if (allFiles.length === 0) {
    dash.innerHTML = '<div class="dash-empty-hint"><p class="hint">No articles yet</p><p class="subhint">Add RSS feeds in the tray app, or drop a .md file here</p></div>';
    return;
  }

  var html = '';

  // --- Greeting ---
  var hour = new Date().getHours();
  var greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  var unreadCount = allFiles.filter(function(f) { return !readArticles.has(f.filename); }).length;

  html += '<div class="dash-greeting">';
  html += '<h1>' + greeting + '</h1>';
  html += '</div>';

  // --- Tab bar ---
  html += '<div class="explore-tabs">';
  html += '<button class="explore-tab active" data-tab="for-you">For You</button>';
  html += '<button class="explore-tab" data-tab="sources">Sources</button>';
  html += '<button class="explore-tab" data-tab="stats">Stats</button>';
  html += '<button class="explore-tab" data-tab="tags">Tags</button>';
  html += '</div>';

  // --- Tab content ---
  var data = collectExploreData();

  // For You tab
  var forYouHtml = '';

  // Daily Rundown — topic briefing cards
  forYouHtml += buildDailyRundownHtml();

  // Continue Reading
  var positions = JSON.parse(localStorage.getItem('pr-scroll-positions') || '{}');
  var continueReading = allFiles.filter(function(f) {
    var pos = positions[f.filename];
    return pos && pos.pct > 0.05 && pos.pct < 0.9;
  }).sort(function(a, b) { return (positions[b.filename].ts || 0) - (positions[a.filename].ts || 0); }).slice(0, 3);

  if (continueReading.length > 0) {
    forYouHtml += '<div class="dash-section">';
    forYouHtml += '<div class="dash-section-header">';
    forYouHtml += '<span class="dash-section-title"><svg viewBox="0 0 384 512"><use href="#i-book"/></svg> Continue Reading</span>';
    forYouHtml += '</div>';
    forYouHtml += '<div class="dash-cards-wrap"><button class="dash-chevron left" onclick="dashScrollLeft(this)" aria-label="Scroll left">&#8249;</button><div class="dash-cards">';
    for (var ci = 0; ci < continueReading.length; ci++) {
      forYouHtml += dashCardHtml(continueReading[ci], positions[continueReading[ci].filename] ? positions[continueReading[ci].filename].pct : undefined);
    }
    forYouHtml += '</div><button class="dash-chevron right" onclick="dashScrollRight(this)" aria-label="Scroll right">&#8250;</button></div></div>';
  }

  // Suggested Feeds
  forYouHtml += '<div id="hub-suggested-feeds"></div>';

  // Reviews
  var reviews = allFiles.filter(function(f) { return f.feed === 'weekly-review' || f.feed === 'daily-review' || f.domain === 'pullread'; }).slice(0, 3);
  if (reviews.length > 0) {
    forYouHtml += '<div class="dash-section">';
    forYouHtml += '<div class="dash-section-header"><span class="dash-section-title"><svg viewBox="0 0 512 512"><use href="#i-wand"/></svg> Reviews</span></div>';
    forYouHtml += '<div class="dash-cards" style="overflow:visible;flex-wrap:wrap">';
    for (var ri = 0; ri < reviews.length; ri++) {
      var rf = reviews[ri];
      var isWeekly = rf.feed === 'weekly-review';
      var typeLabel = isWeekly ? 'Weekly' : 'Daily';
      var rdate = rf.bookmarked ? rf.bookmarked.slice(0, 10) : '';
      forYouHtml += '<div class="dash-review-card" onclick="dashLoadArticle(\'' + escapeHtml(rf.filename) + '\')">';
      forYouHtml += '<div class="dash-review-title">' + escapeHtml(rf.title) + '</div>';
      forYouHtml += '<div class="dash-review-meta">' + typeLabel + ' Review' + (rdate ? ' &middot; ' + rdate : '') + '</div>';
      if (rf.excerpt) forYouHtml += '<div class="dash-review-excerpt">' + escapeHtml(rf.excerpt) + '</div>';
      forYouHtml += '</div>';
    }
    forYouHtml += '</div></div>';
  }

  // Connections between articles via shared tags
  var connectionsHtml = buildConnectionsHtml(data.tagArticles, data.sortedTags);
  if (connectionsHtml) {
    forYouHtml += '<div class="dash-section">';
    forYouHtml += '<div class="dash-section-header"><span class="dash-section-title">Connections</span></div>';
    forYouHtml += connectionsHtml;
    forYouHtml += '</div>';
  }

  // Recent Unread
  var recent = allFiles.filter(function(f) { return !readArticles.has(f.filename) && f.feed !== 'weekly-review' && f.feed !== 'daily-review' && f.domain !== 'pullread'; }).slice(0, 20);
  if (recent.length > 0) {
    forYouHtml += '<div class="dash-section">';
    forYouHtml += '<div class="dash-section-header">';
    forYouHtml += '<span class="dash-section-title"><svg viewBox="0 0 448 512"><use href="#i-calendar"/></svg> Recent <span class="dash-section-count">(' + recent.length + ')</span></span>';
    if (unreadCount > recent.length) {
      forYouHtml += '<button class="dash-view-all" onclick="document.getElementById(\'search\').focus()">View all ' + unreadCount + ' &rsaquo;</button>';
    }
    forYouHtml += '</div>';
    forYouHtml += '<div class="dash-cards-wrap"><button class="dash-chevron left" onclick="dashScrollLeft(this)" aria-label="Scroll left">&#8249;</button><div class="dash-cards">';
    for (var rci = 0; rci < recent.length; rci++) {
      forYouHtml += dashCardHtml(recent[rci]);
    }
    forYouHtml += '</div><button class="dash-chevron right" onclick="dashScrollRight(this)" aria-label="Scroll right">&#8250;</button></div></div>';
  }

  // Your Topics — top machine tags by frequency
  var topTopics = data.sortedTags.filter(function(t) { return !blockedTags.has(t[0]); }).slice(0, 15);
  if (topTopics.length > 0) {
    forYouHtml += '<div class="dash-section">';
    forYouHtml += '<div class="dash-section-header">';
    forYouHtml += '<span class="dash-section-title"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-tag"/></svg> Your Topics</span>';
    forYouHtml += '</div>';
    forYouHtml += '<div class="your-topics">';
    for (var ti = 0; ti < topTopics.length; ti++) {
      var tagName = topTopics[ti][0];
      var tagCount = topTopics[ti][1];
      forYouHtml += '<button class="tag-pill" onclick="document.getElementById(\'search\').value=\'tag:\\x22' + escapeJsStr(tagName) + '\\x22\';filterFiles()">' + escapeHtml(tagName) + ' <span class="tag-count">' + tagCount + '</span></button>';
    }
    forYouHtml += '</div></div>';
  }

  // Quick actions at bottom of For You
  forYouHtml += '<div class="dash-actions">';
  forYouHtml += '<button onclick="dashGenerateReview(1)"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-wand"/></svg> Daily Review</button>';
  forYouHtml += '<button onclick="dashGenerateReview(7)"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-wand"/></svg> Weekly Review</button>';
  forYouHtml += '<button onclick="showGuideModal()"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-book"/></svg> Guide</button>';
  forYouHtml += '<button onclick="showTour()"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-comment"/></svg> Tour</button>';
  forYouHtml += '</div>';

  html += '<div id="explore-for-you" class="explore-tab-panel active">' + forYouHtml + '</div>';
  html += '<div id="explore-sources" class="explore-tab-panel">' + buildSourcesHtml(data) + '</div>';
  html += '<div id="explore-stats" class="explore-tab-panel">' + buildStatsTabHtml(data) + '</div>';
  html += '<div id="explore-tags" class="explore-tab-panel">' + buildTagsTabHtml(data) + '</div>';

  dash.innerHTML = html;

  // Wire up tab switching
  dash.querySelectorAll('.explore-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      dash.querySelectorAll('.explore-tab').forEach(function(b) { b.classList.remove('active'); });
      dash.querySelectorAll('.explore-tab-panel').forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('explore-' + btn.dataset.tab).classList.add('active');
    });
  });

  requestAnimationFrame(initDashChevrons);
  requestAnimationFrame(initRundown);

  // If audio is queued, switch to mini player so controls stay visible in sidebar
  if (typeof ttsQueue !== 'undefined' && ttsQueue.length > 0) {
    setPlayerMode('mini');
  }

  // Async: load suggested feeds
  loadSuggestedFeedsSection();
}

function loadSuggestedFeedsSection() {
  var container = document.getElementById('hub-suggested-feeds');
  if (!container) return;

  fetchSuggestedFeeds(function(allFeeds) {
    var feeds = filterSuggestedFeeds(allFeeds);
    if (feeds.length === 0) return;

    var userFeedCount = new Set(allFiles.map(function(f) { return f.feed; }).filter(Boolean)).size;
    var isNewUser = userFeedCount < 5;
    var dismissed = isFeedsDismissed();

    if (!isNewUser && dismissed) return;

    var html = '<div class="hub-feeds-section' + (isNewUser ? ' hub-feeds-hero' : '') + '">';

    if (isNewUser) {
      html += '<div class="hub-feeds-heading">Build your reading list</div>';
      html += '<p class="hub-feeds-desc">Subscribe to feeds to get articles delivered to Pull Read.</p>';
    } else {
      html += '<div class="hub-feeds-heading" style="display:flex;align-items:center;justify-content:space-between">Discover new feeds';
      html += '<button class="hub-feeds-dismiss" onclick="dismissSuggestedFeeds()" title="Dismiss">&times;</button>';
      html += '</div>';
    }

    html += '<div class="hub-feeds-pills">';
    for (var i = 0; i < feeds.length; i++) {
      var f = feeds[i];
      html += '<button class="tag-pill" onclick="addSuggestedFeed(this,\'' + escapeHtml(f.name.replace(/'/g, "\\'")) + '\',\'' + escapeHtml(f.url.replace(/'/g, "\\'")) + '\')">' + escapeHtml(f.name) + '</button>';
    }
    html += '<button class="tag-pill" onclick="toggleQuickAdd()" style="opacity:0.7">+ Add custom</button>';
    html += '</div></div>';

    container.innerHTML = html;
  });
}

function addSuggestedFeed(btn, name, url) {
  btn.disabled = true;
  btn.textContent = 'Adding\u2026';
  fetch('/api/config').then(function(r) { return r.json(); }).then(function(cfg) {
    var feeds = cfg.feeds || {};
    feeds[name] = url;
    return fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outputPath: cfg.outputPath, feeds: feeds, syncInterval: cfg.syncInterval, useBrowserCookies: cfg.useBrowserCookies, maxAgeDays: cfg.maxAgeDays })
    });
  }).then(function(r) {
    if (r.ok) {
      btn.textContent = '\u2713 Added';
      btn.style.opacity = '0.5';
      showToast('Added ' + name);
    } else {
      btn.textContent = name;
      btn.disabled = false;
    }
  }).catch(function() {
    btn.textContent = name;
    btn.disabled = false;
  });
}

function buildDailyRundownHtml() {
  var clusters = buildDailyRundown(7);
  if (clusters.length === 0) return '';

  var html = '<div class="rundown">';

  // Progress dots (clickable for desktop nav)
  html += '<div class="rundown-dots">';
  for (var di = 0; di < clusters.length; di++) {
    html += '<span class="rundown-dot' + (di === 0 ? ' active' : '') + '" onclick="rundownGoTo(' + di + ')"></span>';
  }
  html += '</div>';

  // Scrollable card track
  html += '<div class="rundown-track">';
  for (var ci = 0; ci < clusters.length; ci++) {
    var c = clusters[ci];
    // Pick the first article with an OG image for the card background
    var heroImage = '';
    for (var ii = 0; ii < c.articles.length; ii++) {
      if (c.articles[ii].image) { heroImage = c.articles[ii].image; break; }
    }

    html += '<div class="rundown-card">';

    if (heroImage) {
      html += '<img class="rundown-card-img" src="' + escapeHtml(heroImage) + '" alt="" loading="lazy" onerror="this.outerHTML=\'<div class=rundown-card-noimg></div>\'">';
    } else {
      html += '<div class="rundown-card-noimg"></div>';
    }

    html += '<div class="rundown-card-body">';
    html += '<div class="rundown-card-label">' + escapeHtml(c.label) + '</div>';
    html += '<div class="rundown-card-count">' + c.articles.length + ' article' + (c.articles.length !== 1 ? 's' : '') + '</div>';

    // Up to 3 headlines
    html += '<div class="rundown-card-headlines">';
    var headlineCount = Math.min(c.articles.length, 3);
    for (var hi = 0; hi < headlineCount; hi++) {
      var a = c.articles[hi];
      html += '<a onclick="dashLoadArticle(\'' + escapeJsStr(a.filename) + '\')">' + escapeHtml(a.title) + '</a>';
    }
    html += '</div>';

    // Tag pills (limit to 5)
    var maxTags = Math.min(c.tags.length, 5);
    html += '<div class="rundown-card-tags">';
    for (var ti = 0; ti < maxTags; ti++) {
      html += '<span class="tag-pill tag-pill-sm">' + escapeHtml(c.tags[ti]) + '</span>';
    }
    html += '</div>';
    html += '</div>'; // .rundown-card-body
    html += '</div>'; // .rundown-card
  }
  html += '</div>';
  html += '</div>';

  return html;
}

function dashCardHtml(f, progressPct) {
  const onclick = 'dashLoadArticle(\'' + escapeHtml(f.filename) + '\')';
  const domain = f.domain || '';
  const favicon = domain ? '/favicons/' + encodeURIComponent(domain) + '.png' : '';
  const date = f.bookmarked ? f.bookmarked.slice(0, 10) : '';

  let html = '<div class="dash-card" onclick="' + onclick + '">';

  // Image or placeholder
  if (f.image) {
    html += '<img class="dash-card-img" src="' + escapeHtml(f.image) + '" alt="" loading="lazy" onerror="this.outerHTML=\'<div class=dash-card-img-placeholder><svg style=width:32px;height:32px;fill:currentColor viewBox=&quot;0 0 448 512&quot;><use href=&quot;#i-book&quot;/></svg></div>\'">';
  } else {
    html += '<div class="dash-card-img-placeholder"><svg style="width:32px;height:32px;fill:currentColor" viewBox="0 0 448 512"><use href="#i-book"/></svg></div>';
  }

  html += '<div class="dash-card-body">';

  // Meta row: favicon, domain, feed badge
  html += '<div class="dash-card-meta">';
  if (favicon) html += '<img src="' + escapeHtml(favicon) + '" alt="" loading="lazy">';
  if (domain) html += '<span>' + escapeHtml(domain) + '</span>';
  if (f.feed && f.feed !== domain) html += '<span class="dash-card-badge">' + escapeHtml(f.feed) + '</span>';
  html += '</div>';

  // Title
  html += '<div class="dash-card-title">' + escapeHtml(f.title) + '</div>';

  // Excerpt
  if (f.excerpt) {
    html += '<div class="dash-card-excerpt">' + escapeHtml(f.excerpt) + '</div>';
  }

  // Progress bar for continue reading
  if (progressPct !== undefined && progressPct > 0) {
    html += '<div class="dash-card-progress"><div class="dash-card-progress-fill" style="width:' + Math.round(progressPct * 100) + '%"></div></div>';
  }

  html += '</div></div>';
  return html;
}

function dashGenerateReview(days) {
  if (!serverMode) return;
  var label = days === 1 ? 'Daily' : 'Weekly';
  showToast('Generating ' + label + ' Review\u2026');
  fetch('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days: days })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.error) {
      showToast(data.error, true);
      return;
    }
    showToast(label + ' Review ready');
    refreshArticleList(false);
    if (data.filename) {
      setTimeout(function() {
        var idx = displayFiles.findIndex(function(f) { return f.filename === data.filename; });
        if (idx >= 0) loadFile(idx);
      }, 500);
    }
  }).catch(function(err) {
    showToast('Review failed: ' + err.message, true);
  });
}

function goHome() {
  if (_markAsReadDelayTimer) { console.debug('[PR] goHome clearing markAsRead timer'); clearTimeout(_markAsReadDelayTimer); _markAsReadDelayTimer = null; }
  _sidebarView = 'home'; syncSidebarTabs();
  activeFile = null;
  _activeDrawerSource = null;
  updateDrawerActiveState();
  document.title = 'PullRead';
  renderFileList();
  var toc = document.getElementById('toc-container');
  if (toc) toc.innerHTML = '';
  var toolbar = document.getElementById('reader-toolbar');
  if (toolbar) toolbar.style.display = 'none';
  // Defer hub render so sidebar becomes interactive first
  requestAnimationFrame(renderHub);
}

function dashScrollLeft(btn) {
  const cards = btn.closest('.dash-cards-wrap').querySelector('.dash-cards');
  cards.scrollBy({ left: -300, behavior: 'smooth' });
}

function dashScrollRight(btn) {
  const cards = btn.closest('.dash-cards-wrap').querySelector('.dash-cards');
  cards.scrollBy({ left: 300, behavior: 'smooth' });
}

function initDashChevrons() {
  document.querySelectorAll('.dash-cards').forEach(cards => {
    const wrap = cards.closest('.dash-cards-wrap');
    if (!wrap) return;
    const leftBtn = wrap.querySelector('.dash-chevron.left');
    const rightBtn = wrap.querySelector('.dash-chevron.right');

    function updateChevrons() {
      const hasOverflow = cards.scrollWidth > cards.clientWidth + 8;
      if (leftBtn) leftBtn.classList.toggle('visible', hasOverflow && cards.scrollLeft > 8);
      if (rightBtn) rightBtn.classList.toggle('visible', hasOverflow && cards.scrollLeft < cards.scrollWidth - cards.clientWidth - 8);
    }
    cards.addEventListener('scroll', updateChevrons);
    updateChevrons();
    // Recheck after images load
    setTimeout(updateChevrons, 500);
  });
}

function dashLoadArticle(filename) {
  var idx = displayFiles.findIndex(f => f.filename === filename);
  if (idx >= 0) {
    loadFile(idx);
    return;
  }
  // Article not in current view — set activeFile so filterFiles includes it
  // even when hide-read is on (filterFiles preserves activeFile)
  activeFile = filename;
  document.getElementById('search').value = '';
  filterFiles();
  idx = displayFiles.findIndex(f => f.filename === filename);
  if (idx >= 0) loadFile(idx);
}

function renderArticle(text, filename) {
  // Guard against corrupt/binary files that would freeze the UI
  var MAX_ARTICLE_SIZE = 2 * 1024 * 1024; // 2 MB
  if (text.length > MAX_ARTICLE_SIZE) {
    var el = document.getElementById('content');
    var emptyEl = document.getElementById('empty-state');
    if (emptyEl) emptyEl.style.display = 'none';
    if (el) {
      el.style.display = '';
      el.innerHTML = '<div class="content-wrap"><h1>File too large</h1>'
        + '<p>This file is ' + (text.length / 1024 / 1024).toFixed(1) + ' MB, which likely indicates corrupt content. '
        + 'Expected article files are under 2 MB.</p></div>';
    }
    return;
  }

  const { meta, body: rawBodyText } = parseFrontmatter(text);
  let body = rawBodyText;
  const content = document.getElementById('content');
  const empty = document.getElementById('empty-state');

  empty.style.display = 'none';
  content.style.display = 'block';
  content.classList.remove('settings-view');

  let html = '';

  // Article header: pub bar, title, author, date
  html += '<div class="article-header">';

  // Publication bar: source identity on left, tags on right
  if (meta && meta.domain && meta.domain !== 'pullread') {
    var srcColor = sourceColor(meta.feed || meta.domain);
    var pubName = '';
    var pubDomain = meta.domain;

    // Determine publication name from feed
    if (meta.feed) {
      pubName = meta.feed;
      // If pub name IS the domain exactly, show only once as the name
      if (pubName.toLowerCase() === meta.domain.toLowerCase()) {
        pubDomain = '';
      }
    }

    var sourceHref = 'https://' + encodeURI(meta.domain);

    // Favicon: for podcasts with artwork, show artwork; otherwise show domain favicon
    var initials = (pubName || meta.domain).replace(/^(the |www\.)/i, '').slice(0, 2).toUpperCase();
    var hasPodcastArt = meta.thumbnail && meta.enclosure_type && meta.enclosure_type.startsWith('audio/');
    var faviconHtml;
    if (hasPodcastArt) {
      faviconHtml = '<div class="pub-favicon pub-favicon-art">'
        + '<img src="' + escapeHtml(meta.thumbnail) + '" alt="" loading="lazy" onerror="this.src=\'/favicons/' + encodeURIComponent(meta.domain) + '.png\';this.parentElement.classList.remove(\'pub-favicon-art\')">'
        + '<span class="pub-favicon-fallback">' + escapeHtml(initials) + '</span></div>';
    } else {
      faviconHtml = '<div class="pub-favicon">'
        + '<img src="/favicons/' + encodeURIComponent(meta.domain) + '.png" alt="" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';this.parentElement.style.background=\'' + srcColor + '\'">'
        + '<span class="pub-favicon-fallback">' + escapeHtml(initials) + '</span></div>';
    }

    html += '<div class="pub-bar">';
    html += '<a class="pub-identity" href="' + escapeHtml(sourceHref) + '" target="_blank" rel="noopener" title="Visit ' + escapeHtml(meta.domain) + '">';
    html += faviconHtml;
    html += '<div>';
    if (pubName && pubDomain) {
      html += '<span class="pub-name">' + escapeHtml(pubDomain) + '</span>';
      html += '<span class="pub-domain">via ' + escapeHtml(pubName) + '</span>';
    } else if (pubName) {
      html += '<span class="pub-name">' + escapeHtml(pubName) + '</span>';
    } else {
      html += '<span class="pub-domain">' + escapeHtml(pubDomain || meta.domain) + '</span>';
    }
    html += '</div></a>';
    html += '<div class="pub-tags" id="header-tags"></div>';
    html += '</div>';
  } else {
    // No domain or pullread internal — just an empty tags container
    html += '<div id="header-tags"></div>';
  }

  // Title
  if (meta && meta.title) {
    if (meta.url) {
      html += '<h1><a href="' + escapeHtml(meta.url) + '" target="_blank" rel="noopener" class="title-link">' + escapeHtml(meta.title) + '<svg class="icon icon-external" aria-hidden="true"><use href="#i-external"/></svg></a></h1>';
    } else {
      html += '<h1>' + escapeHtml(meta.title) + '</h1>';
    }
  }

  // Metadata line: author, date, read time (appended later)
  var metaLineParts = [];
  if (meta && meta.author) {
    var authorText = meta.author;
    if (authorText.length > 80) {
      var cutoff = authorText.indexOf('. ');
      if (cutoff > 10 && cutoff < 80) authorText = authorText.slice(0, cutoff);
      else authorText = authorText.slice(0, 80).replace(/\s+\S*$/, '') + '\u2026';
    }
    metaLineParts.push('<span class="author" onclick="searchByAuthor(\'' + escapeHtml(authorText).replace(/'/g, "\\'") + '\')" title="Search for articles by this author">' + escapeHtml(authorText) + '</span>');
  }
  if (meta && meta.bookmarked) metaLineParts.push('<span title="' + escapeHtml(timeAgoTitle(meta.bookmarked)) + '">' + escapeHtml(timeAgo(meta.bookmarked)) + '</span>');
  if (metaLineParts.length) {
    html += '<div class="article-meta">' + metaLineParts.join('<span class="sep">&middot;</span>') + '</div>';
  }

  // Hero image from frontmatter thumbnail (feed media:content or og:image)
  if (meta && meta.thumbnail) {
    html += '<div class="article-hero"><img src="' + escapeHtml(meta.thumbnail) + '" alt="" loading="lazy" onerror="this.parentElement.style.display=\'none\'"></div>';
  }

  // Detect review/summary articles where Summarize doesn't make sense
  const isReviewArticle = meta && (meta.feed === 'weekly-review' || meta.feed === 'daily-review' || meta.domain === 'pullread');

  // Populate reader toolbar with action buttons (left side)
  var toolbarActions = '';
  const isFav = articleNotes.isFavorite;
  toolbarActions += '<button onclick="toggleFavoriteFromHeader(this)" class="toolbar-action-btn' + (isFav ? ' active-fav' : '') + '" aria-label="' + (isFav ? 'Remove star' : 'Star article') + '" aria-pressed="' + isFav + '"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-' + (isFav ? 'heart' : 'heart-o') + '"/></svg><span class="toolbar-action-label"> Star</span></button>';
  toolbarActions += '<button onclick="markCurrentAsRead()" class="toolbar-action-btn" aria-label="Mark read"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-eye-slash"/></svg><span class="toolbar-action-label"> Mark read</span></button>';
  var isPodcast = meta && meta.enclosure_url && meta.enclosure_type && meta.enclosure_type.startsWith('audio/');
  var listenLabel = isPodcast ? 'Play' : 'Listen';
  toolbarActions += '<div class="play-next-menu" id="play-next-menu">';
  toolbarActions += '<button id="listen-btn" onclick="addCurrentToTTSQueue()" class="toolbar-action-btn" aria-label="' + listenLabel + ' article"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-volume"/></svg><span class="toolbar-action-label"> ' + listenLabel + '</span></button>';
  toolbarActions += '<button class="play-next-trigger" id="play-next-trigger" onclick="togglePlayNextMenu(event)" aria-label="Queue options" style="display:none"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>';
  toolbarActions += '</div>';
  if (!isReviewArticle) {
    toolbarActions += '<button onclick="summarizeArticle()" id="summarize-btn" class="toolbar-action-btn" aria-label="Summarize article"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-wand"/></svg><span class="toolbar-action-label"> Summarize</span></button>';
  }
  if (meta && meta.url) {
    toolbarActions += '<div class="share-dropdown"><button onclick="toggleShareDropdown(event)" class="toolbar-action-btn" aria-label="Share article"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-share"/></svg><span class="toolbar-action-label"> Share</span></button></div>';
  }

  var toolbarEl = document.getElementById('reader-toolbar-actions');
  if (toolbarEl) toolbarEl.innerHTML = toolbarActions;
  var toolbar = document.getElementById('reader-toolbar');
  if (toolbar) toolbar.style.display = '';
  // Show notebook back-references
  var nbRefs = Object.values(_notebooks || {}).filter(function(nb) { return nb.sources && nb.sources.indexOf(filename) >= 0; });
  if (nbRefs.length) {
    html += '<div style="margin-top:6px">';
    for (var nbi = 0; nbi < nbRefs.length; nbi++) {
      html += '<span class="notebook-ref" onclick="openNotebookEditor(\'' + nbRefs[nbi].id + '\')"><svg class="icon icon-sm" style="vertical-align:-1px"><use href="#i-pen"/></svg> ' + escapeHtml(nbRefs[nbi].title || 'Untitled notebook') + '</span>';
    }
    html += '</div>';
  }
  html += '</div>';

  // Show existing summary if present in frontmatter
  if (meta && meta.summary) {
    const sp = meta.summaryProvider || '';
    const sm = meta.summaryModel || '';
    html += '<div class="article-summary">' + summaryBlockHtml(sp, sm, meta.summary) + '</div>';
    html += '<div class="summary-dismissed"><span>Summary removed</span><button onclick="undismissSummary()">Undo</button></div>';
  }

  // YouTube embed: detect from frontmatter and inject responsive iframe
  const isYouTube = meta && meta.domain && /youtube\.com|youtu\.be|m\.youtube\.com/.test(meta.domain);
  if (isYouTube && meta.url) {
    var ytId = null;
    try {
      var ytUrl = new URL(meta.url);
      if (ytUrl.hostname === 'youtu.be') ytId = ytUrl.pathname.slice(1).split('/')[0];
      else if (ytUrl.searchParams.get('v')) ytId = ytUrl.searchParams.get('v');
      else { var em = ytUrl.pathname.match(/\/(embed|v)\/([^/?]+)/); if (em) ytId = em[2]; }
    } catch {}
    if (ytId) {
      html += '<div class="yt-embed"><iframe src="https://www.youtube.com/embed/' + encodeURIComponent(ytId)
        + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" title="Embedded video"></iframe></div>';
    }
  }

  // Podcast: show podcast info banner (audio plays through unified bottom bar)
  if (isPodcast) {
    html += '<div class="podcast-player">';
    html += '<svg style="width:16px;height:16px;fill:var(--muted);flex-shrink:0"><use href="#i-mic"/></svg>';
    html += '<span style="font-size:13px;color:var(--fg)">Podcast episode</span>';
    if (meta.enclosure_duration) {
      html += '<span class="podcast-duration">' + escapeHtml(meta.enclosure_duration) + '</span>';
    }
    html += '<button onclick="addCurrentToTTSQueue()" style="margin-left:auto;padding:4px 12px;border:1px solid var(--border);border-radius:6px;background:none;color:var(--link);font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap">Play in player</button>';
    html += '</div>';
    // Show podcast description in a collapsible section instead of as article body
    if (body && body.trim()) {
      html += '<details class="podcast-description" open><summary>Episode description</summary>';
      html += '<div>' + sanitizeHtml(marked.parse(cleanMarkdown(body))) + '</div>';
      html += '</details>';
    }
  }

  // Podcast body is already rendered in the collapsible description above
  if (isPodcast) body = '';

  // Strip YouTube thumbnail link BEFORE cleanMarkdown (which mangles the link-wrapped image)
  var rawBody = body;
  if (isYouTube) {
    rawBody = rawBody.replace(/\[?!\[.*?\]\(https:\/\/img\.youtube\.com\/vi\/[^)]*\)\]?\(?[^)\n]*\)?\s*/g, '');
    // Strip standalone YouTube image that lost its link wrapper
    rawBody = rawBody.replace(/!\[.*?\]\(https:\/\/img\.youtube\.com\/vi\/[^)]*\)\s*/g, '');
    // Strip channel name line (already in byline)
    if (meta && meta.author) rawBody = rawBody.replace(new RegExp('^\\s*\\*' + meta.author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\*\\s*$', 'm'), '');
    // Strip description that duplicates the excerpt
    if (meta && meta.excerpt) {
      var excerptNorm = meta.excerpt.replace(/\.\.\.$/, '').trim();
      rawBody = rawBody.replace(new RegExp('^\\s*' + excerptNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\n]*\\s*$', 'm'), '');
    }
  }

  // EPUB content is already HTML — skip markdown processing
  var isEpub = meta && meta.domain === 'epub';

  if (isEpub) {
    html += sanitizeHtml(rawBody);
  } else {
    // Strip the leading H1 from markdown body if it matches the title (avoid duplication)
    let articleBody = cleanMarkdown(rawBody);
    if (meta && meta.title) {
      var h1Match = articleBody.match(/^\s*#\s+(.+)\s*\n/);
      if (h1Match) {
        var normalize = function(s) { return s.toLowerCase().replace(/[\u2018\u2019\u201C\u201D]/g, "'").replace(/[^a-z0-9]/g, ''); };
        // Strip if title matches, or if it's a review (title always duplicated in body)
        if (normalize(h1Match[1]) === normalize(meta.title) || isReviewArticle) {
          articleBody = articleBody.slice(h1Match[0].length);
        }
      }
    }

    html += sanitizeHtml(marked.parse(articleBody));
  }

  // Deduplicate images: remove consecutive/nearby img tags with the same src
  html = (function dedupeImages(h) {
    const div = document.createElement('div');
    div.innerHTML = h;
    const imgs = Array.from(div.querySelectorAll('img'));
    const seen = new Set();
    // Pre-seed with hero image thumbnail to prevent duplication in body
    if (meta && meta.thumbnail) {
      try { seen.add(new URL(meta.thumbnail).origin + new URL(meta.thumbnail).pathname); } catch { seen.add(meta.thumbnail); }
    }
    for (const img of imgs) {
      const src = img.getAttribute('src');
      if (!src) continue;
      // Normalize: strip query params for dedup comparison
      let key;
      try { key = new URL(src).origin + new URL(src).pathname; } catch { key = src; }
      if (seen.has(key)) {
        // Remove the duplicate image (and its wrapping <p> or <a> if it's the only child)
        const parent = img.parentElement;
        if (parent && (parent.tagName === 'P' || parent.tagName === 'A') && parent.children.length === 1 && parent.textContent.trim() === '') {
          parent.remove();
        } else {
          img.remove();
        }
      } else {
        seen.add(key);
      }
    }
    return div.innerHTML;
  })(html);

  // Convert YouTube thumbnail links into embedded video iframes (fallback for inline links)
  html = html.replace(
    /<a[^>]*href="(https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?v=([^"&]+)[^"]*|https?:\/\/youtu\.be\/([^"/?]+)[^"]*)"[^>]*>\s*<img[^>]*src="https:\/\/img\.youtube\.com\/vi\/[^"]*"[^>]*\/?>\s*<\/a>/gi,
    function(match, url, id1, id2) {
      var videoId = id1 || id2;
      if (!videoId) return match;
      return '<div class="yt-embed"><iframe src="https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" title="Embedded video"></iframe></div>';
    }
  );

  // Convert linked video thumbnails into embedded <video> players
  html = html.replace(
    /<a[^>]*href="(https?:\/\/[^"]+\.mp4[^"]*)"[^>]*>\s*<img[^>]*src="([^"]+)"[^>]*\/?>\s*<\/a>/gi,
    function(match, videoUrl, posterUrl) {
      return '<div class="video-embed"><video controls playsinline preload="metadata" poster="' + posterUrl + '"><source src="' + videoUrl + '" type="video/mp4"></video></div>';
    }
  );

  // Link to source for feed-sourced articles, plus optional re-extraction
  if (meta && meta.source === 'feed' && meta.url) {
    html += '<div class="feed-extract-prompt">';
    html += '<a href="' + escapeHtml(meta.url) + '" target="_blank" rel="noopener" class="feed-extract-btn">'
      + '<svg class="icon icon-sm" aria-hidden="true"><use href="#i-external"/></svg> '
      + 'Read full article at ' + escapeHtml(meta.domain || 'source') + '</a>';
    if (serverMode) {
      html += '<button onclick="reprocessFromMenu()" class="feed-extract-btn feed-extract-fetch">'
        + '<svg class="icon icon-sm" aria-hidden="true"><use href="#i-cloud-download"/></svg> '
        + 'Fetch full content</button>';
    }
    html += '</div>';
  }

  html += '<div id="related-reading"></div>';

  content.innerHTML = html;
  document.title = (meta && meta.title) || filename || 'PullRead';

  // Populate related reading asynchronously
  populateRelatedReading(filename);

  // Hide broken images instead of showing broken-image icons
  content.querySelectorAll('.content-wrap img, .article-hero img').forEach(function(img) {
    if (!img.getAttribute('onerror')) {
      img.onerror = function() { this.style.display = 'none'; };
    }
  });

  // Set article language for TTS and CSS :lang() selectors
  if (meta && meta.lang) {
    content.setAttribute('lang', meta.lang);
  } else {
    content.removeAttribute('lang');
  }

  // Apply review-content class for link-blog styling on review articles
  if (isReviewArticle) {
    content.classList.add('review-content');
    enhanceOpenQuestions(content, filename);
    localizeReviewLinks(content);
  } else {
    content.classList.remove('review-content');
  }

  // Post-process for accessibility
  content.querySelectorAll('img:not([alt])').forEach(function(img) { img.setAttribute('alt', ''); });
  content.querySelectorAll('img[alt=""]').forEach(function(img) { img.setAttribute('role', 'presentation'); });
  content.querySelectorAll('table').forEach(function(table) {
    if (!table.querySelector('thead')) {
      var firstRow = table.querySelector('tr');
      if (firstRow && firstRow.querySelectorAll('th').length > 0) {
        firstRow.querySelectorAll('th').forEach(function(th) { th.setAttribute('scope', 'col'); });
      }
    }
    table.setAttribute('role', 'table');
  });
  // Open article content links in new window
  content.querySelectorAll('a[href]').forEach(function(a) {
    var href = a.getAttribute('href');
    if (href && !href.startsWith('#')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });
  // Wrap standalone images in links to their full-size source
  content.querySelectorAll('img[src]').forEach(function(img) {
    var parent = img.parentElement;
    // Skip images already wrapped in a link
    if (parent && parent.tagName === 'A') return;
    var src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) return;
    var a = document.createElement('a');
    a.href = src;
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    img.parentNode.insertBefore(a, img);
    a.appendChild(img);
  });
  // Clean up leftover broken markdown artifacts (stray brackets, parenthesized URLs)
  (function cleanBrokenFragments(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var removals = [];
    while (walker.nextNode()) {
      var node = walker.currentNode;
      var text = node.textContent;
      // Remove text nodes that are just lone brackets
      if (/^\s*[\[\]]\s*$/.test(text)) { removals.push(node); continue; }
      // Remove text nodes that are just a parenthesized URL
      if (/^\s*\(https?:\/\/[^)]+\)\s*$/.test(text)) { removals.push(node); continue; }
      // Remove leading/trailing lone brackets in mixed text
      var cleaned = text.replace(/^\s*\[\s*/, '').replace(/\s*\]\s*$/, '');
      if (cleaned !== text) node.textContent = cleaned;
    }
    removals.forEach(function(n) {
      var p = n.parentElement;
      n.remove();
      // Remove empty <p> tags left behind
      if (p && p.tagName === 'P' && !p.textContent.trim() && !p.querySelector('img,a,iframe')) p.remove();
    });
  })(content);

  // Add read time to article meta (only for 5+ min articles)
  const articleBodyText = content.textContent || '';
  const { words, minutes } = calculateReadStats(articleBodyText);
  if (minutes >= 5) {
    var wordStr = words >= 1000 ? (words / 1000).toFixed(1) + 'k' : words;
    var articleMetaEl = content.querySelector('.article-meta');
    if (articleMetaEl) {
      articleMetaEl.innerHTML += '<span class="sep">&middot;</span><span class="read-stats" title="' + wordStr + ' words">' + minutes + ' min read</span>';
    }
  }

  // Render diagrams (mermaid, d2) before highlighting
  renderDiagrams();

  // Apply syntax highlighting to code blocks
  applySyntaxHighlighting();

  // Generate table of contents (EPUB uses its own embedded TOC)
  if (isEpub) {
    generateEpubToc();
    setupEpubFootnotes();
  } else {
    generateToc();
  }

  // Scroll to top
  document.getElementById('content-scroll').scrollTop = 0;

  // Reset reading progress
  updateReadingProgress();

  // Clear margin notes
  document.getElementById('margin-notes').innerHTML = '';

  // Restore scroll position (after a tick so DOM is settled)
  setTimeout(() => restoreScrollPosition(filename), 100);

  // Update focus mode if active
  if (focusModeActive) {
    setTimeout(updateFocusMode, 200);
  }

  // Show "Playing" state on Listen button if this article is currently playing
  updateListenButtonState();
}


// Add "start a note" buttons to Open Questions in review articles
function enhanceOpenQuestions(container, filename) {
  var headings = container.querySelectorAll('h2');
  var oqHeading = null;
  for (var i = 0; i < headings.length; i++) {
    if (/open questions/i.test(headings[i].textContent)) {
      oqHeading = headings[i];
      break;
    }
  }
  if (!oqHeading) return;

  var list = oqHeading.nextElementSibling;
  if (!list || (list.tagName !== 'UL' && list.tagName !== 'OL')) return;

  var items = list.querySelectorAll('li');
  for (var j = 0; j < items.length; j++) {
    var li = items[j];
    var questionText = li.textContent.trim();
    var btn = document.createElement('button');
    btn.className = 'oq-note-btn';
    btn.textContent = 'Note';
    btn.setAttribute('aria-label', 'Start a note from this question');
    (function(q) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var content = '# ' + q + '\n\n';
        createNote(filename, content);
        _sidebarView = 'notebooks';
        syncSidebarTabs();
        renderFileList();
      };
    })(questionText);
    li.appendChild(btn);
  }
}

// Rewrite review article links to open in PullRead when the article exists locally
function localizeReviewLinks(container) {
  var urlMap = {};
  for (var i = 0; i < allFiles.length; i++) {
    if (allFiles[i].url) urlMap[allFiles[i].url] = allFiles[i].filename;
  }

  container.querySelectorAll('li > a[href]').forEach(function(a) {
    var href = a.getAttribute('href');
    var localFile = urlMap[href];
    if (!localFile) return;

    a.removeAttribute('target');
    a.removeAttribute('rel');
    a.onclick = function(e) {
      e.preventDefault();
      dashLoadArticle(localFile);
    };

    // Add small external link affordance on hover
    var ext = document.createElement('a');
    ext.href = href;
    ext.target = '_blank';
    ext.rel = 'noopener noreferrer';
    ext.className = 'review-ext-link';
    ext.title = 'Open original';
    ext.setAttribute('aria-label', 'Open original article');
    ext.innerHTML = '<svg class="icon icon-sm" aria-hidden="true"><use href="#i-external"/></svg>';
    ext.onclick = function(e) { e.stopPropagation(); };
    a.parentElement.appendChild(ext);
  });
}

// ---- Reading Progress Bar ----
function updateReadingProgress() {
  const pane = document.getElementById('content-scroll');
  const bar = document.getElementById('reading-progress-bar');
  if (!pane || !bar) return;
  const scrollTop = pane.scrollTop;
  const scrollHeight = pane.scrollHeight - pane.clientHeight;
  const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
  bar.style.width = Math.min(100, Math.max(0, progress)) + '%';
}

document.getElementById('content-scroll').addEventListener('scroll', function() {
  updateReadingProgress();
  updateFocusMode();
  updateTocActive();
  saveScrollPosition();
});

// ---- Related Reading ----
function populateRelatedReading(filename) {
  var container = document.getElementById('related-reading');
  if (!container) return;
  var results = findRelatedArticles(filename, 5);
  if (results.length === 0) { container.style.display = 'none'; return; }

  var html = '<div class="related-reading">';
  html += '<h3 class="related-heading">Related Reading</h3>';
  html += '<div class="related-cards">';
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var file = allFiles.find(function(f) { return f.filename === r.filename; });
    if (!file) continue;
    html += '<a href="#" class="related-card" onclick="event.preventDefault();jumpToArticle(\'' + escapeJsStr(r.filename) + '\')">';
    html += '<span class="related-card-title">' + escapeHtml(file.title || r.filename) + '</span>';
    if (file.domain) html += '<span class="related-card-domain">' + escapeHtml(file.domain) + '</span>';
    html += '<span class="related-card-tags">';
    for (var j = 0; j < r.sharedTags.length; j++) {
      if (blockedTags.has(r.sharedTags[j])) continue;
      html += '<span class="tag-pill tag-pill-sm">' + escapeHtml(r.sharedTags[j]) + '</span>';
    }
    html += '</span></a>';
  }
  html += '</div></div>';
  container.innerHTML = html;
}

// ---- Read Time & Word Count ----
function calculateReadStats(text) {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const wpm = 238; // average adult reading speed
  const minutes = Math.ceil(words / wpm);
  return { words, minutes };
}

function formatReadStats(words, minutes) {
  const wordStr = words >= 1000 ? (words / 1000).toFixed(1) + 'k' : words.toString();
  return '<span class="read-stats">' + minutes + ' min read<span class="stat-divider">&middot;</span>' + wordStr + ' words</span>';
}

// ---- Focus Mode ----
let focusModeActive = false;
let focusObserver = null;

function toggleFocusMode() {
  focusModeActive = !focusModeActive;
  document.body.classList.toggle('focus-mode', focusModeActive);
  document.getElementById('focus-btn').classList.toggle('active', focusModeActive);
  localStorage.setItem('pr-focus', focusModeActive ? '1' : '0');
  if (focusModeActive) {
    updateFocusMode();
  } else {
    clearFocusClasses();
  }
}

function clearFocusClasses() {
  document.querySelectorAll('.focus-active, .focus-adjacent').forEach(el => {
    el.classList.remove('focus-active', 'focus-adjacent');
  });
}

function updateFocusMode() {
  if (!focusModeActive) return;
  const content = document.getElementById('content');
  if (!content || content.style.display === 'none') return;

  const pane = document.getElementById('content-scroll');
  const paneRect = pane.getBoundingClientRect();
  // Shift the focus point near the top/bottom of the scroll so edge
  // paragraphs still get highlighted instead of being permanently dimmed.
  const scrollTop = pane.scrollTop;
  const scrollBottom = pane.scrollHeight - pane.clientHeight - scrollTop;
  let focusRatio = 0.4;
  if (scrollTop < 200) focusRatio = 0.15;
  else if (scrollBottom < 200) focusRatio = 0.7;
  const centerY = paneRect.top + paneRect.height * focusRatio;

  const blocks = content.querySelectorAll(':scope > p, :scope > blockquote, :scope > ul, :scope > ol, :scope > pre, :scope > h2, :scope > h3, :scope > h4, :scope > table');

  clearFocusClasses();

  let closest = null;
  let closestDist = Infinity;

  blocks.forEach(block => {
    const rect = block.getBoundingClientRect();
    const blockCenter = rect.top + rect.height / 2;
    const dist = Math.abs(blockCenter - centerY);
    if (dist < closestDist) {
      closestDist = dist;
      closest = block;
    }
  });

  if (closest) {
    closest.classList.add('focus-active');
    // Also highlight immediate siblings for context
    if (closest.previousElementSibling && !closest.previousElementSibling.classList.contains('article-header')) {
      closest.previousElementSibling.classList.add('focus-adjacent');
    }
    if (closest.nextElementSibling && !closest.nextElementSibling.classList.contains('annotations-section')) {
      closest.nextElementSibling.classList.add('focus-adjacent');
    }
  }
}

// ---- Code Syntax Highlighting ----
const DIAGRAM_LANGUAGES = new Set(['mermaid', 'd2']);

function applySyntaxHighlighting() {
  if (typeof hljs === 'undefined') return;
  const content = document.getElementById('content');
  if (!content) return;

  // Update highlight.js theme based on current app theme
  updateHljsTheme();

  content.querySelectorAll('pre code').forEach(block => {
    // Skip if already highlighted
    if (block.classList.contains('hljs')) return;
    // Skip diagram languages — they get rendered by renderDiagrams()
    const langMatch = block.className.match(/language-(\w+)/);
    if (langMatch && DIAGRAM_LANGUAGES.has(langMatch[1])) return;

    hljs.highlightElement(block);

    // Add language label if detected
    const detected = block.result && block.result.language;
    const langName = (langMatch && langMatch[1]) || detected;
    if (langName && langName !== 'undefined') {
      const label = document.createElement('span');
      label.className = 'code-lang-label';
      label.textContent = langName;
      block.closest('pre').appendChild(label);
    }
  });
}

// ---- Diagram Rendering (Mermaid + D2) ----
function renderDiagrams() {
  const content = document.getElementById('content');
  if (!content) return;

  // Mermaid: client-side rendering
  const mermaidBlocks = content.querySelectorAll('pre code.language-mermaid');
  if (mermaidBlocks.length > 0 && typeof mermaid !== 'undefined') {
    mermaidBlocks.forEach((block, i) => {
      const source = block.textContent;
      const pre = block.closest('pre');
      const container = document.createElement('div');
      container.className = 'diagram-container mermaid';
      container.id = 'mermaid-diagram-' + Date.now() + '-' + i;
      container.textContent = source;
      pre.replaceWith(container);
    });
    const theme = document.body.getAttribute('data-theme');
    const isDark = theme === 'dark' || theme === 'high-contrast';
    mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });
    mermaid.run();
  }

  // D2: server-side via kroki.io (no client-side renderer exists)
  content.querySelectorAll('pre code.language-d2').forEach(block => {
    const source = block.textContent;
    const pre = block.closest('pre');
    const container = document.createElement('div');
    container.className = 'diagram-container diagram-d2';
    container.innerHTML = '<span class="diagram-loading">Rendering d2 diagram\u2026</span>';
    pre.replaceWith(container);

    fetch('https://kroki.io/d2/svg', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: source
    })
    .then(function(r) { return r.ok ? r.text() : Promise.reject(r.status + ' ' + r.statusText); })
    .then(function(svg) { container.innerHTML = sanitizeHtml(svg); })
    .catch(function(err) {
      container.innerHTML = '<pre style="text-align:left"><code>' + escapeHtml(source) + '</code></pre>'
        + '<p class="diagram-error-msg">D2 rendering unavailable: ' + escapeHtml(String(err)) + '</p>';
    });
  });
}

function updateHljsTheme() {
  const theme = document.body.getAttribute('data-theme');
  const lightSheet = document.getElementById('hljs-light');
  const darkSheet = document.getElementById('hljs-dark');
  if (!lightSheet || !darkSheet) return;

  if (theme === 'dark' || theme === 'high-contrast') {
    lightSheet.media = 'not all';
    darkSheet.media = 'all';
  } else {
    lightSheet.media = 'all';
    darkSheet.media = 'not all';
  }
}

// ---- Reading Position Memory ----
let scrollSaveTimeout = null;

function saveScrollPosition() {
  if (!activeFile) return;
  clearTimeout(scrollSaveTimeout);
  scrollSaveTimeout = setTimeout(() => {
    const pane = document.getElementById('content-scroll');
    if (!pane) return;
    const scrollHeight = pane.scrollHeight - pane.clientHeight;
    if (scrollHeight <= 0) return;
    const pct = pane.scrollTop / scrollHeight;
    const positions = JSON.parse(localStorage.getItem('pr-scroll-positions') || '{}');
    positions[activeFile] = { pct, ts: Date.now() };
    // Keep only last 100 positions
    const keys = Object.keys(positions);
    if (keys.length > 100) {
      const sorted = keys.sort((a, b) => positions[a].ts - positions[b].ts);
      sorted.slice(0, keys.length - 100).forEach(k => delete positions[k]);
    }
    localStorage.setItem('pr-scroll-positions', JSON.stringify(positions));
  }, 500);
}

function restoreScrollPosition(filename) {
  const positions = JSON.parse(localStorage.getItem('pr-scroll-positions') || '{}');
  const saved = positions[filename];
  if (!saved || saved.pct < 0.02) return; // Don't restore if near the top

  const pane = document.getElementById('content-scroll');
  if (!pane) return;

  // Show a "resume" indicator
  const indicator = document.createElement('div');
  indicator.className = 'resume-indicator';
  indicator.textContent = 'Resume reading \u2193';
  indicator.setAttribute('role', 'button');
  indicator.setAttribute('aria-label', 'Resume reading from where you left off');
  indicator.onclick = function() {
    const scrollHeight = pane.scrollHeight - pane.clientHeight;
    pane.scrollTo({ top: saved.pct * scrollHeight, behavior: 'smooth' });
    indicator.remove();
  };
  document.body.appendChild(indicator);

  // Auto-dismiss after 5 seconds
  setTimeout(() => { if (indicator.parentNode) indicator.remove(); }, 5000);
}

// ---- Table of Contents ----
function generateToc() {
  const content = document.getElementById('content');
  const tocContainer = document.getElementById('toc-container');
  if (!content || !tocContainer) return;

  const headings = content.querySelectorAll('h2, h3');
  tocContainer.innerHTML = '';

  if (headings.length < 3) return; // Only show TOC for articles with 3+ headings

  const panel = document.createElement('div');
  panel.className = 'toc-panel';

  const label = document.createElement('div');
  label.className = 'toc-label';
  label.textContent = 'Contents';
  panel.appendChild(label);

  const list = document.createElement('ul');
  list.className = 'toc-list';

  headings.forEach((heading, i) => {
    // Skip headings inside article-header
    if (heading.closest('.article-header')) return;

    const id = 'toc-heading-' + i;
    heading.id = id;

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + id;
    a.textContent = heading.textContent;
    a.setAttribute('data-toc-target', id);
    if (heading.tagName === 'H3') a.classList.add('toc-h3');

    a.onclick = function(e) {
      e.preventDefault();
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    li.appendChild(a);
    list.appendChild(li);
  });

  panel.appendChild(list);
  tocContainer.appendChild(panel);
}

function updateTocActive() {
  const tocLinks = document.querySelectorAll('.toc-list a');
  if (!tocLinks.length) return;

  const pane = document.getElementById('content-scroll');
  const paneRect = pane.getBoundingClientRect();
  const threshold = paneRect.top + 80;

  let activeId = null;

  // For EPUB TOC, track both chapter divs and any anchored elements
  const isEpubToc = document.querySelector('.epub-toc-list');
  if (isEpubToc) {
    // Gather all elements that TOC links point to
    tocLinks.forEach(function(link) {
      var targetId = link.getAttribute('data-toc-target');
      if (!targetId) return;
      var el = document.getElementById(targetId);
      if (el && el.getBoundingClientRect().top <= threshold) {
        activeId = targetId;
      }
    });
    // Update chapter progress
    var chapters = document.querySelectorAll('#content .epub-chapter');
    var progressEl = document.getElementById('epub-chapter-progress');
    if (progressEl && chapters.length > 1) {
      var currentCh = 0;
      chapters.forEach(function(ch, i) {
        if (ch.getBoundingClientRect().top <= threshold) currentCh = i;
      });
      progressEl.textContent = 'Chapter ' + (currentCh + 1) + ' of ' + chapters.length;
    }
  } else {
    var headings = document.querySelectorAll('#content h2[id], #content h3[id]');
    headings.forEach(function(heading) {
      if (heading.getBoundingClientRect().top <= threshold) {
        activeId = heading.id;
      }
    });
  }

  tocLinks.forEach(link => {
    link.classList.toggle('toc-active', link.getAttribute('data-toc-target') === activeId);
  });
}

// ---- EPUB Table of Contents ----
function generateEpubToc() {
  const content = document.getElementById('content');
  const tocContainer = document.getElementById('toc-container');
  if (!content || !tocContainer) return;
  tocContainer.innerHTML = '';

  // Look for the hidden epub-toc nav we embedded in the content
  const epubTocNav = content.querySelector('nav.epub-toc');
  if (!epubTocNav) {
    // Fallback: generate TOC from chapter headings
    generateToc();
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'toc-panel';

  const label = document.createElement('div');
  label.className = 'toc-label';
  label.textContent = 'Contents';
  panel.appendChild(label);

  // Clone the TOC list from the hidden nav
  const tocList = epubTocNav.querySelector('ol');
  if (!tocList) {
    generateToc();
    return;
  }

  const list = tocList.cloneNode(true);
  list.className = 'toc-list epub-toc-list';

  // Set up click handlers for smooth scrolling
  list.querySelectorAll('a[href]').forEach(function(a) {
    var targetId = a.getAttribute('href');
    if (!targetId || !targetId.startsWith('#')) return;
    a.setAttribute('data-toc-target', targetId.slice(1));
    a.onclick = function(e) {
      e.preventDefault();
      var target = document.getElementById(targetId.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
  });

  panel.appendChild(list);

  // Show chapter progress
  var chapters = content.querySelectorAll('.epub-chapter');
  if (chapters.length > 1) {
    var progress = document.createElement('div');
    progress.className = 'epub-chapter-progress';
    progress.id = 'epub-chapter-progress';
    panel.appendChild(progress);
  }

  tocContainer.appendChild(panel);

  // Remove the hidden nav from content (already consumed)
  epubTocNav.remove();
}

// ---- EPUB Footnote Pop-ups ----
function setupEpubFootnotes() {
  var content = document.getElementById('content');
  if (!content) return;

  // Find all noteref links
  var noterefs = content.querySelectorAll('[data-epub-type="noteref"]');
  noterefs.forEach(function(ref) {
    ref.classList.add('epub-noteref');
    ref.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();

      // Remove any existing popup
      var existing = document.querySelector('.epub-footnote-popup');
      if (existing) existing.remove();

      // Find the footnote target
      var href = ref.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      var target = document.getElementById(href.slice(1));
      if (!target) return;

      // Create popup
      var popup = document.createElement('div');
      popup.className = 'epub-footnote-popup';

      var popupContent = document.createElement('div');
      popupContent.className = 'epub-footnote-popup-content';
      popupContent.innerHTML = sanitizeHtml(target.innerHTML);

      var closeBtn = document.createElement('button');
      closeBtn.className = 'epub-footnote-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.setAttribute('aria-label', 'Close footnote');
      closeBtn.onclick = function() { popup.remove(); };

      popup.appendChild(closeBtn);
      popup.appendChild(popupContent);

      // Position the popup near the reference
      var rect = ref.getBoundingClientRect();
      var pane = document.getElementById('content-scroll');
      var paneRect = pane.getBoundingClientRect();
      popup.style.position = 'absolute';

      // Insert into scroll container for proper scrolling
      pane.appendChild(popup);

      // Position below the reference, centered
      var popupTop = rect.bottom - paneRect.top + pane.scrollTop + 8;
      var popupLeft = Math.max(16, rect.left - paneRect.left - 100);
      // Keep within pane bounds
      popup.style.top = popupTop + 'px';
      popup.style.left = popupLeft + 'px';
      popup.style.maxWidth = Math.min(500, paneRect.width - 32) + 'px';

      // Dismiss on click outside
      function dismiss(ev) {
        if (!popup.contains(ev.target) && ev.target !== ref) {
          popup.remove();
          document.removeEventListener('click', dismiss);
        }
      }
      setTimeout(function() { document.addEventListener('click', dismiss); }, 0);

      // Dismiss on Escape
      function dismissKey(ev) {
        if (ev.key === 'Escape') {
          popup.remove();
          document.removeEventListener('keydown', dismissKey);
        }
      }
      document.addEventListener('keydown', dismissKey);
    });
  });

  // Visually de-emphasize footnote/endnote sections (they show as popups)
  content.querySelectorAll('[data-epub-type="footnote"], [data-epub-type="endnote"], [data-epub-type="rearnote"]').forEach(function(el) {
    el.classList.add('epub-footnote-section');
  });
}

