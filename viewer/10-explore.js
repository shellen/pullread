// ---- Tag Cloud / Explore ---- (renders as inline page like Guide)
function showTagCloud() {
  _sidebarView = 'home'; syncSidebarTabs();
  const content = document.getElementById('content');
  const empty = document.getElementById('empty-state');
  empty.style.display = 'none';
  content.style.display = 'block';

  // Deselect sidebar — disables highlights/notes on this page
  activeFile = null;
  document.getElementById('margin-notes').innerHTML = '';
  var toc = document.getElementById('toc-container');
  if (toc) toc.innerHTML = '';
  renderFileList();

  // Collect all tags (user + machine), domain groupings, feed counts
  const tagCounts = {};
  const tagArticles = {};  // tag -> [articles]
  const domainArticles = {};
  const feedCounts = {};

  for (const f of allFiles) {
    if (f.domain && f.domain !== 'pullread') {
      if (!domainArticles[f.domain]) domainArticles[f.domain] = [];
      domainArticles[f.domain].push(f);
    }
    if (f.feed) {
      feedCounts[f.feed] = (feedCounts[f.feed] || 0) + 1;
    }
    const notes = allNotesIndex[f.filename];
    const allTags = [];
    if (notes && notes.tags) allTags.push(...notes.tags);
    if (notes && notes.machineTags) allTags.push(...notes.machineTags);
    for (const tag of allTags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      if (!tagArticles[tag]) tagArticles[tag] = [];
      tagArticles[tag].push(f);
    }
  }

  const sortedDomains = Object.entries(domainArticles)
    .sort((a, b) => b[1].length - a[1].length);
  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1]);

  // Stats bar
  const totalArticles = allFiles.length;
  const totalHighlights = Object.values(allHighlightsIndex).reduce((s, h) => s + (h ? h.length : 0), 0);
  const totalFavorites = Object.values(allNotesIndex).filter(n => n && n.isFavorite).length;
  const totalSummaries = allFiles.filter(f => f.hasSummary).length;
  const totalUnread = allFiles.filter(f => !readArticles.has(f.filename)).length;

  let statsHtml = '<div class="explore-stats">';
  statsHtml += '<span><strong>' + totalArticles + '</strong> articles</span>';
  statsHtml += '<span><strong>' + totalUnread + '</strong> unread</span>';
  statsHtml += '<span><strong>' + totalHighlights + '</strong> highlights</span>';
  statsHtml += '<span><strong>' + totalFavorites + '</strong> favorites</span>';
  statsHtml += '<span><strong>' + totalSummaries + '</strong> summaries</span>';
  statsHtml += '<span><strong>' + Object.keys(domainArticles).length + '</strong> sources</span>';
  statsHtml += '</div>';

  // --- Tab: Discover (quick filters + ontological connections) ---
  const makeQf = function(label, query, variant) {
    return '<button class="tag-pill' + (variant ? ' tag-pill-' + variant : '') + '" onclick="document.getElementById(\'search\').value=\'' + escapeJsStr(query) + '\';filterFiles()">' + escapeHtml(label) + '</button>';
  };
  let discoverHtml = '<div class="tag-cloud">';
  discoverHtml += makeQf('Favorites', 'is:favorite', 'pink');
  discoverHtml += makeQf('Unread', 'is:unread', 'blue');
  discoverHtml += makeQf('Has Summary', 'has:summary', 'green');
  discoverHtml += makeQf('Has Highlights', 'has:highlights', 'amber');
  discoverHtml += makeQf('Has Notes', 'has:notes', '');
  discoverHtml += makeQf('Has Tags', 'has:tags', '');
  discoverHtml += makeQf('Podcasts', 'is:podcast', '');
  var bookCount = allFiles.filter(function(f) { return f.domain === 'epub'; }).length;
  if (bookCount > 0) discoverHtml += makeQf('Books', 'is:book', '');
  const sortedFeeds = Object.entries(feedCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [feed] of sortedFeeds) {
    discoverHtml += makeQf(escapeHtml(feed), 'feed:' + feed, '');
  }
  discoverHtml += '</div>';

  // Auto-tag actions
  const taggedCount = allFiles.filter(function(f) { const n = allNotesIndex[f.filename]; return n && ((n.tags && n.tags.length) || (n.machineTags && n.machineTags.length)); }).length;
  const untaggedCount = totalArticles - taggedCount;
  discoverHtml += '<h3 style="font-size:14px;font-weight:600;margin:24px 0 12px">Auto-Tagging</h3>';
  discoverHtml += '<p style="font-size:13px;color:var(--muted);margin:0 0 10px">' + taggedCount + ' of ' + totalArticles + ' articles tagged. ';
  if (untaggedCount > 0) discoverHtml += untaggedCount + ' remaining.';
  else discoverHtml += 'All articles tagged!';
  discoverHtml += '</p>';
  discoverHtml += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
  discoverHtml += '<button class="tag-pill" id="batch-tag-btn" onclick="batchAutotagAll(false)" title="Tag untagged articles using AI"><svg class="icon icon-sm" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-wand"/></svg> Tag Untagged</button>';
  discoverHtml += '<button class="tag-pill" onclick="batchAutotagAll(true)" title="Re-tag all articles, replacing existing AI tags"><svg class="icon icon-sm" aria-hidden="true" style="vertical-align:-1px;margin-right:3px"><use href="#i-refresh"/></svg> Retag All</button>';
  discoverHtml += '</div>';

  // Ontological connections: find tags shared by 2+ articles and show the clusters
  const connectionsHtml = buildConnectionsHtml(tagArticles, sortedTags);
  if (connectionsHtml) {
    discoverHtml += '<h3 style="font-size:14px;font-weight:600;margin:24px 0 12px">Connections</h3>';
    discoverHtml += connectionsHtml;
  }

  // --- Tab: Most Viewed ---
  const positions = JSON.parse(localStorage.getItem('pr-scroll-positions') || '{}');
  const viewedArticles = allFiles
    .filter(f => positions[f.filename] || readArticles.has(f.filename))
    .sort((a, b) => {
      const pctA = positions[a.filename]?.pct || 0;
      const pctB = positions[b.filename]?.pct || 0;
      const tsA = positions[a.filename]?.ts || 0;
      const tsB = positions[b.filename]?.ts || 0;
      if (Math.abs(pctB - pctA) > 0.1) return pctB - pctA;
      return tsB - tsA;
    })
    .slice(0, 30);

  let viewedHtml = '';
  if (viewedArticles.length > 0) {
    viewedArticles.forEach(function(f, i) {
      const pct = positions[f.filename]?.pct;
      const pctStr = pct ? Math.round(pct * 100) + '%' : 'Opened';
      const domain = f.domain || '';
      const favicon = domain ? '/favicons/' + encodeURIComponent(domain) + '.png' : '';
      viewedHtml += '<div class="most-viewed-item" onclick="jumpToArticle(\'' + escapeJsStr(f.filename) + '\')">';
      viewedHtml += '<div class="most-viewed-rank">' + (i + 1) + '</div>';
      viewedHtml += '<div class="most-viewed-info">';
      viewedHtml += '<div class="most-viewed-title">' + escapeHtml(f.title) + '</div>';
      viewedHtml += '<div class="most-viewed-meta">';
      if (favicon) viewedHtml += '<img src="' + escapeHtml(favicon) + '" alt="" loading="lazy">';
      if (domain) viewedHtml += '<span>' + escapeHtml(domain) + '</span>';
      viewedHtml += '</div></div>';
      viewedHtml += '<div class="most-viewed-pct">' + pctStr + '</div>';
      viewedHtml += '</div>';
    });
  } else {
    viewedHtml = '<p style="color:var(--muted);font-size:13px;padding:12px 0">No reading history yet. Articles you read will appear here.</p>';
  }

  // --- Tab: Tags ---
  let tagsHtml = '';
  if (sortedTags.length > 0) {
    tagsHtml = '<div class="tag-cloud">';
    for (const [tag, count] of sortedTags) {
      tagsHtml += '<button class="tag-pill" onclick="document.getElementById(\'search\').value=\'tag:' + escapeJsStr(tag) + '\';filterFiles()">' + escapeHtml(tag) + '<span class="tag-count">' + count + '</span></button>';
    }
    tagsHtml += '</div>';
  } else {
    tagsHtml = '<p style="color:var(--muted);font-size:13px;padding:12px 0">No tags yet. Tag articles from the notes panel, or use auto-tagging to generate topic tags.</p>';
  }

  // --- Tab: Sources ---
  let domainsHtml = '';
  for (const [domain, articles] of sortedDomains.slice(0, 40)) {
    domainsHtml += '<div class="domain-group">';
    domainsHtml += '<div class="domain-group-header" onclick="document.getElementById(\'search\').value=\'domain:' + escapeJsStr(domain) + '\';filterFiles();this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">';
    domainsHtml += '<img class="file-item-favicon" src="/favicons/' + encodeURIComponent(domain) + '.png" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
    domainsHtml += '<span>' + escapeHtml(domain) + '</span><span class="domain-group-count">' + articles.length + ' article' + (articles.length !== 1 ? 's' : '') + '</span></div>';
    domainsHtml += '<div class="domain-group-articles" style="display:none">';
    for (const a of articles.slice(0, 10)) {
      domainsHtml += '<a href="#" onclick="event.preventDefault();jumpToArticle(\'' + escapeJsStr(a.filename) + '\')">' + escapeHtml(a.title) + '</a>';
    }
    if (articles.length > 10) {
      domainsHtml += '<a href="#" onclick="event.preventDefault();document.getElementById(\'search\').value=\'domain:' + escapeJsStr(domain) + '\';filterFiles()" style="color:var(--link)">+ ' + (articles.length - 10) + ' more</a>';
    }
    domainsHtml += '</div></div>';
  }

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

  // Wire up tab switching
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
  // Pick tags with 2-8 articles (meaningful clusters, not too noisy)
  const clusters = sortedTags
    .filter(function(entry) { return entry[1] >= 2 && entry[1] <= 8; })
    .slice(0, 12);
  if (clusters.length === 0) return '';

  let html = '';
  for (const [tag, count] of clusters) {
    const articles = tagArticles[tag].slice(0, 5);
    html += '<div class="connection-group">';
    html += '<div class="connection-group-title"><span class="conn-tag">' + escapeHtml(tag) + '</span> <span style="font-size:11px;color:var(--muted);font-weight:400">' + count + ' articles</span></div>';
    html += '<div class="connection-group-articles">';
    for (const f of articles) {
      const domain = f.domain || '';
      const favicon = domain ? '/favicons/' + encodeURIComponent(domain) + '.png' : '';
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
  const idx = displayFiles.findIndex(f => f.filename === filename);
  if (idx >= 0) {
    loadFile(idx);
  } else {
    // File might be hidden - clear filters
    document.getElementById('search').value = '';
    hideRead = false;
    document.getElementById('hide-read-toggle').classList.remove('active');
    filterFiles();
    const newIdx = displayFiles.findIndex(f => f.filename === filename);
    if (newIdx >= 0) loadFile(newIdx);
  }
}

