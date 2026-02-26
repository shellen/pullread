// ABOUTME: Explore page with tabs for Discover, Most Viewed, Tags, Sources.
// ABOUTME: Builder functions are reusable by the Hub renderer in 04-article.js.

function collectExploreData() {
  var tagCounts = {};
  var tagArticles = {};
  var domainArticles = {};
  var feedCounts = {};

  for (var i = 0; i < allFiles.length; i++) {
    var f = allFiles[i];
    if (f.domain && f.domain !== 'pullread') {
      if (!domainArticles[f.domain]) domainArticles[f.domain] = [];
      domainArticles[f.domain].push(f);
    }
    if (f.feed) {
      feedCounts[f.feed] = (feedCounts[f.feed] || 0) + 1;
    }
    var notes = allNotesIndex[f.filename];
    var allTags = [];
    if (notes && notes.tags) allTags.push.apply(allTags, notes.tags);
    if (notes && notes.machineTags) allTags.push.apply(allTags, notes.machineTags);
    for (var j = 0; j < allTags.length; j++) {
      var tag = allTags[j];
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      if (!tagArticles[tag]) tagArticles[tag] = [];
      tagArticles[tag].push(f);
    }
  }

  var sortedDomains = Object.entries(domainArticles).sort(function(a, b) { return b[1].length - a[1].length; });
  var sortedTags = Object.entries(tagCounts).sort(function(a, b) { return b[1] - a[1]; });

  return {
    tagCounts: tagCounts,
    tagArticles: tagArticles,
    domainArticles: domainArticles,
    feedCounts: feedCounts,
    sortedDomains: sortedDomains,
    sortedTags: sortedTags
  };
}

function buildStatsHtml(data) {
  var totalArticles = allFiles.length;
  var totalHighlights = Object.values(allHighlightsIndex).reduce(function(s, h) { return s + (h ? h.length : 0); }, 0);
  var totalFavorites = Object.values(allNotesIndex).filter(function(n) { return n && n.isFavorite; }).length;
  var totalSummaries = allFiles.filter(function(f) { return f.hasSummary; }).length;
  var totalUnread = allFiles.filter(function(f) { return !readArticles.has(f.filename); }).length;

  var html = '<div class="explore-stats">';
  html += '<span><strong>' + totalArticles + '</strong> articles</span>';
  html += '<span><strong>' + totalUnread + '</strong> unread</span>';
  html += '<span><strong>' + totalHighlights + '</strong> highlights</span>';
  html += '<span><strong>' + totalFavorites + '</strong> starred</span>';
  html += '<span><strong>' + totalSummaries + '</strong> summaries</span>';
  html += '<span><strong>' + Object.keys(data.domainArticles).length + '</strong> sources</span>';
  html += '</div>';
  return html;
}

function buildDiscoverHtml(data) {
  var makeQf = function(label, query, variant) {
    return '<button class="tag-pill' + (variant ? ' tag-pill-' + variant : '') + '" onclick="document.getElementById(\'search\').value=\'' + escapeJsStr(query) + '\';filterFiles()">' + escapeHtml(label) + '</button>';
  };
  var html = '<div class="tag-cloud">';
  html += makeQf('Starred', 'is:favorite', 'pink');
  html += makeQf('Unread', 'is:unread', 'blue');
  html += makeQf('Has Summary', 'has:summary', 'green');
  html += makeQf('Has Highlights', 'has:highlights', 'amber');
  html += makeQf('Has Notes', 'has:notes', '');
  html += makeQf('Has Tags', 'has:tags', '');
  html += makeQf('Podcasts', 'is:podcast', '');
  var bookCount = allFiles.filter(function(f) { return f.domain === 'epub'; }).length;
  if (bookCount > 0) html += makeQf('Books', 'is:book', '');
  var sortedFeeds = Object.entries(data.feedCounts).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 8);
  for (var i = 0; i < sortedFeeds.length; i++) {
    html += makeQf(escapeHtml(sortedFeeds[i][0]), 'feed:' + sortedFeeds[i][0], '');
  }
  html += '</div>';

  // Auto-tag actions
  var taggedCount = allFiles.filter(function(f) { var n = allNotesIndex[f.filename]; return n && ((n.tags && n.tags.length) || (n.machineTags && n.machineTags.length)); }).length;
  var totalArticles = allFiles.length;
  var untaggedCount = totalArticles - taggedCount;
  html += '<h3 style="font-size:14px;font-weight:600;margin:24px 0 12px">Auto-Tagging</h3>';
  html += '<p style="font-size:13px;color:var(--muted);margin:0 0 10px">' + taggedCount + ' of ' + totalArticles + ' articles tagged. ';
  if (untaggedCount > 0) html += untaggedCount + ' remaining.';
  else html += 'All articles tagged!';
  html += '</p>';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
  html += '<button class="tag-pill" id="batch-tag-btn" onclick="batchAutotagAll(false)" title="Tag untagged articles using AI"><svg class="icon icon-sm" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-wand"/></svg> Tag Untagged</button>';
  html += '<button class="tag-pill" onclick="batchAutotagAll(true)" title="Re-tag all articles, replacing existing AI tags"><svg class="icon icon-sm" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-refresh"/></svg> Retag All</button>';
  html += '</div>';

  // Ontological connections
  var connectionsHtml = buildConnectionsHtml(data.tagArticles, data.sortedTags);
  if (connectionsHtml) {
    html += '<h3 style="font-size:14px;font-weight:600;margin:24px 0 12px">Connections</h3>';
    html += connectionsHtml;
  }

  return html;
}

function buildMostViewedHtml() {
  var positions = JSON.parse(localStorage.getItem('pr-scroll-positions') || '{}');
  var viewedArticles = allFiles
    .filter(function(f) { return positions[f.filename] || readArticles.has(f.filename); })
    .sort(function(a, b) {
      var pctA = positions[a.filename] ? positions[a.filename].pct || 0 : 0;
      var pctB = positions[b.filename] ? positions[b.filename].pct || 0 : 0;
      var tsA = positions[a.filename] ? positions[a.filename].ts || 0 : 0;
      var tsB = positions[b.filename] ? positions[b.filename].ts || 0 : 0;
      if (Math.abs(pctB - pctA) > 0.1) return pctB - pctA;
      return tsB - tsA;
    })
    .slice(0, 30);

  var html = '';
  if (viewedArticles.length > 0) {
    for (var i = 0; i < viewedArticles.length; i++) {
      var f = viewedArticles[i];
      var pct = positions[f.filename] ? positions[f.filename].pct : undefined;
      var pctStr = pct ? Math.round(pct * 100) + '%' : 'Opened';
      var domain = f.domain || '';
      var favicon = domain ? '/favicons/' + encodeURIComponent(domain) + '.png' : '';
      html += '<div class="most-viewed-item" onclick="jumpToArticle(\'' + escapeJsStr(f.filename) + '\')">';
      html += '<div class="most-viewed-rank">' + (i + 1) + '</div>';
      html += '<div class="most-viewed-info">';
      html += '<div class="most-viewed-title">' + escapeHtml(f.title) + '</div>';
      html += '<div class="most-viewed-meta">';
      if (favicon) html += '<img src="' + escapeHtml(favicon) + '" alt="" loading="lazy">';
      if (domain) html += '<span>' + escapeHtml(domain) + '</span>';
      html += '</div></div>';
      html += '<div class="most-viewed-pct">' + pctStr + '</div>';
      html += '</div>';
    }
  } else {
    html = '<p style="color:var(--muted);font-size:13px;padding:12px 0">No reading history yet. Articles you read will appear here.</p>';
  }
  return html;
}

function buildTagsHtml(data) {
  var visibleTags = data.sortedTags.filter(function(entry) { return !isTagBlocked(entry[0]); });
  var html = '';
  if (visibleTags.length > 0) {
    html = '<div class="tag-cloud">';
    for (var i = 0; i < visibleTags.length; i++) {
      var tag = visibleTags[i][0];
      var count = visibleTags[i][1];
      html += '<span class="tag-pill-wrap"><button class="tag-pill" onclick="document.getElementById(\'search\').value=\'tag:' + escapeJsStr(tag) + '\';filterFiles()">' + escapeHtml(tag) + '<span class="tag-count">' + count + '</span></button>'
        + '<button class="tag-block-btn" onclick="blockTag(\'' + escapeJsStr(tag) + '\');goHome()" title="Block this tag">&times;</button></span>';
    }
    html += '</div>';
  } else {
    html = '<p style="color:var(--muted);font-size:13px;padding:12px 0">No tags yet. Tag articles from the notes panel, or use auto-tagging to generate topic tags.</p>';
  }

  // Blocked tags
  if (blockedTags.size > 0) {
    html += '<h3 style="font-size:13px;font-weight:600;margin:24px 0 8px;color:var(--muted)">Blocked Tags</h3>';
    html += '<div class="tag-cloud">';
    blockedTags.forEach(function(tag) {
      html += '<button class="tag-pill tag-pill-blocked" onclick="unblockTag(\'' + escapeJsStr(tag) + '\');goHome()">' + escapeHtml(tag) + ' <span style="opacity:0.6">unblock</span></button>';
    });
    html += '</div>';
  }
  return html;
}

function buildSourcesHtml(data) {
  var html = '';
  var domains = data.sortedDomains.slice(0, 40);
  for (var i = 0; i < domains.length; i++) {
    var domain = domains[i][0];
    var articles = domains[i][1];
    html += '<div class="domain-group">';
    html += '<div class="domain-group-header" onclick="document.getElementById(\'search\').value=\'domain:' + escapeJsStr(domain) + '\';filterFiles();this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">';
    html += '<img class="file-item-favicon" src="/favicons/' + encodeURIComponent(domain) + '.png" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
    html += '<span>' + escapeHtml(domain) + '</span><span class="domain-group-count">' + articles.length + ' article' + (articles.length !== 1 ? 's' : '') + '</span></div>';
    html += '<div class="domain-group-articles" style="display:none">';
    for (var j = 0; j < Math.min(articles.length, 10); j++) {
      html += '<a href="#" onclick="event.preventDefault();jumpToArticle(\'' + escapeJsStr(articles[j].filename) + '\')">' + escapeHtml(articles[j].title) + '</a>';
    }
    if (articles.length > 10) {
      html += '<a href="#" onclick="event.preventDefault();document.getElementById(\'search\').value=\'domain:' + escapeJsStr(domain) + '\';filterFiles()" style="color:var(--link)">+ ' + (articles.length - 10) + ' more</a>';
    }
    html += '</div></div>';
  }
  return html;
}

// ---- Standalone Explore page (renders as inline page like Guide) ----
function showTagCloud() {
  _sidebarView = 'home'; syncSidebarTabs();
  const content = document.getElementById('content');
  const empty = document.getElementById('empty-state');
  empty.style.display = 'none';
  content.style.display = 'block';
  var toolbar = document.getElementById('reader-toolbar');
  if (toolbar) toolbar.style.display = 'none';

  activeFile = null;
  document.getElementById('margin-notes').innerHTML = '';
  var toc = document.getElementById('toc-container');
  if (toc) toc.innerHTML = '';
  renderFileList();

  var data = collectExploreData();
  var statsHtml = buildStatsHtml(data);
  var discoverHtml = buildDiscoverHtml(data);
  var viewedHtml = buildMostViewedHtml();
  var tagsHtml = buildTagsHtml(data);
  var domainsHtml = buildSourcesHtml(data);

  content.innerHTML =
    '<div class="article-header"><h1>Explore</h1></div>' +
    statsHtml +
    '<div class="explore-tabs">' +
      '<button class="explore-tab active" data-tab="discover">Discover</button>' +
      '<button class="explore-tab" data-tab="most-viewed">Most Viewed</button>' +
      '<button class="explore-tab" data-tab="tags">Tags</button>' +
      '<button class="explore-tab" data-tab="sources">Sources</button>' +
    '</div>' +
    '<div id="explore-discover" class="explore-tab-panel active">' + discoverHtml + '</div>' +
    '<div id="explore-most-viewed" class="explore-tab-panel">' + viewedHtml + '</div>' +
    '<div id="explore-tags" class="explore-tab-panel">' + tagsHtml + '</div>' +
    '<div id="explore-sources" class="explore-tab-panel">' + domainsHtml + '</div>';

  content.querySelectorAll('.explore-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      content.querySelectorAll('.explore-tab').forEach(function(b) { b.classList.remove('active'); });
      content.querySelectorAll('.explore-tab-panel').forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('explore-' + btn.dataset.tab).classList.add('active');
    });
  });

  document.title = 'Explore Your Library';
  document.getElementById('content-scroll').scrollTop = 0;
}

// Build ontological connections: clusters of articles sharing the same tags
function buildConnectionsHtml(tagArticles, sortedTags) {
  var clusters = sortedTags
    .filter(function(entry) { return entry[1] >= 2 && entry[1] <= 8 && !isTagBlocked(entry[0]); })
    .slice(0, 12);
  if (clusters.length === 0) return '';

  var html = '';
  for (var i = 0; i < clusters.length; i++) {
    var tag = clusters[i][0];
    var count = clusters[i][1];
    var articles = tagArticles[tag].slice(0, 5);
    html += '<div class="connection-group">';
    html += '<div class="connection-group-title"><span class="conn-tag">' + escapeHtml(tag) + '</span> <span style="font-size:11px;color:var(--muted);font-weight:400">' + count + ' articles</span></div>';
    html += '<div class="connection-group-articles">';
    for (var j = 0; j < articles.length; j++) {
      var f = articles[j];
      var domain = f.domain || '';
      var favicon = domain ? '/favicons/' + encodeURIComponent(domain) + '.png' : '';
      html += '<div class="connection-article" onclick="jumpToArticle(\'' + escapeJsStr(f.filename) + '\')">';
      if (favicon) html += '<img src="' + escapeHtml(favicon) + '" alt="" loading="lazy">';
      html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(f.title) + '</span>';
      if (domain) html += '<span class="conn-domain">' + escapeHtml(domain) + '</span>';
      html += '</div>';
    }
    if (tagArticles[tag].length > 5) {
      html += '<div style="padding:4px 8px;font-size:11px"><a href="#" style="color:var(--link);text-decoration:none" onclick="event.preventDefault();document.getElementById(\'search\').value=\'tag:' + escapeJsStr(tag) + '\';filterFiles()">View all ' + count + ' &rsaquo;</a></div>';
    }
    html += '</div><button class="dash-chevron right" onclick="dashScrollRight(this)" aria-label="Scroll right">&#8250;</button></div></div>';
  }
  return html;
}

function jumpToArticle(filename) {
  var idx = displayFiles.findIndex(function(f) { return f.filename === filename; });
  if (idx >= 0) {
    loadFile(idx);
  } else {
    document.getElementById('search').value = '';
    hideRead = false;
    document.getElementById('hide-read-toggle').classList.remove('active');
    filterFiles();
    var newIdx = displayFiles.findIndex(function(f) { return f.filename === filename; });
    if (newIdx >= 0) loadFile(newIdx);
  }
}
