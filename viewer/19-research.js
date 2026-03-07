// ABOUTME: Research tab — knowledge graph dashboard for browsing extracted entities
// ABOUTME: Three-panel layout: entity list, entity detail, and related articles

function showResearch() {
  var prevActive = activeFile;
  activeFile = null;
  _activeNotebook = null;
  var content = document.getElementById('content');
  var empty = document.getElementById('empty-state');
  empty.style.display = 'none';
  content.style.display = 'block';
  content.classList.remove('settings-view');
  content.classList.remove('ask-view');
  content.classList.remove('manage-sources-view');
  content.classList.add('research-view');
  document.title = 'Research \u2014 PullRead';
  document.getElementById('margin-notes').innerHTML = '';
  var toc = document.getElementById('toc-container');
  if (toc) toc.innerHTML = '';
  var toolbar = document.getElementById('reader-toolbar');
  if (toolbar) toolbar.style.display = 'none';
  updateSidebarActiveState(prevActive);

  // Check status first — show empty state or entity browser
  fetch('/api/research/status')
    .then(function(r) { return r.json(); })
    .then(function(status) {
      if (status.entityCount > 0) {
        researchRenderBrowser();
      } else {
        researchShowEmptyState(status);
      }
    })
    .catch(function() {
      researchShowEmptyState({ extractedCount: 0, entityCount: 0, totalArticles: 0 });
    });
}

function researchRenderBrowser() {
  var html = '<div class="article-header"><h1>Research</h1></div>';

  // URL import bar
  html += '<div class="research-url-bar">';
  html += '<input type="text" id="research-url-input" placeholder="Paste a URL to extract entities..." />';
  html += '<button class="btn-primary" id="research-url-btn" onclick="researchExtractUrl()" style="font-size:13px;padding:6px 14px">Extract</button>';
  html += '</div>';

  // New for you (watch matches)
  html += '<div id="research-new-for-you"></div>';

  // Tensions section
  html += '<div id="research-tensions"></div>';

  html += '<div class="research-layout">';

  // Entity list panel
  html += '<div class="research-panel research-entity-list">';
  html += '<div class="research-search-bar">';
  html += '<input type="text" id="research-search" placeholder="Search entities..." oninput="researchSearchEntitiesWithClear()" />';
  html += '<button class="research-search-clear" id="research-search-clear" onclick="researchClearSearch()" style="display:none" title="Clear search">&times;</button>';
  html += '</div>';
  html += '<div class="research-type-filters" id="research-type-filters"></div>';
  html += '<div id="research-entity-items" class="research-entity-items"></div>';
  html += '</div>';

  // Detail panel
  html += '<div class="research-panel research-detail" id="research-detail">';
  html += '<p class="briefing-hint">Select an entity to view details</p>';
  html += '</div>';

  html += '</div>'; // .research-layout

  var content = document.getElementById('content');
  content.innerHTML = html;
  document.getElementById('content-scroll').scrollTop = 0;
  researchLoadEntities();
  researchLoadTensions();
  researchLoadMatches();
}

function researchShowEmptyState(status) {
  var content = document.getElementById('content');
  if (!content) return;

  var html = '<div class="article-header"><h1>Research</h1></div>';
  html += '<div class="research-empty">';
  html += '<div class="research-empty-icon"><svg class="icon" style="width:48px;height:48px;color:var(--muted)" aria-hidden="true"><use href="#i-beaker"/></svg></div>';
  html += '<h2>Your knowledge graph</h2>';
  html += '<p>Research extracts people, companies, technologies, and concepts from your articles and maps the connections between them.</p>';

  if (status.totalArticles === 0) {
    html += '<p class="research-empty-detail">Add some feeds and sync to get started.</p>';
  } else if (status.extractedCount === 0) {
    html += '<p class="research-empty-detail">You have <strong>' + status.totalArticles + ' articles</strong> ready to analyze.</p>';
    html += '<button class="btn-primary" onclick="researchStartExtraction()" id="research-extract-btn">Extract entities</button>';
    html += '<p class="research-empty-note">This uses your configured LLM to analyze each article. It may take a while for large libraries.</p>';
  } else {
    html += '<p class="research-empty-detail">Extracted ' + status.extractedCount + ' of ' + status.totalArticles + ' articles but found no entities yet. Try extracting more articles.</p>';
    html += '<button class="btn-primary" onclick="researchStartExtraction()" id="research-extract-btn">Continue extraction</button>';
  }

  html += '</div>';
  content.innerHTML = html;
  document.getElementById('content-scroll').scrollTop = 0;
}

function researchStartExtraction() {
  var btn = document.getElementById('research-extract-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Extracting\u2026';
  }

  fetch('/api/research/extract', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function() {
      researchPollProgress();
    })
    .catch(function(err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Extract entities';
      }
      showToast('Extraction failed: ' + (err.message || 'unknown error'));
    });
}

function researchPollProgress() {
  var btn = document.getElementById('research-extract-btn');
  var interval = setInterval(function() {
    fetch('/api/research/status')
      .then(function(r) { return r.json(); })
      .then(function(status) {
        if (btn) btn.textContent = 'Extracting\u2026 (' + status.extractedCount + '/' + status.totalArticles + ')';
        if (status.entityCount > 0) {
          clearInterval(interval);
          showResearch();
        }
      })
      .catch(function() {
        clearInterval(interval);
      });
  }, 3000);

  // Stop polling after 5 minutes
  setTimeout(function() {
    clearInterval(interval);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Check results';
      btn.onclick = function() { showResearch(); };
    }
  }, 300000);
}

var _researchTypeFilter = null;

function researchLoadEntities(search, type) {
  var params = [];
  if (search) params.push('search=' + encodeURIComponent(search));
  if (type) params.push('type=' + encodeURIComponent(type));
  var qs = params.length ? '?' + params.join('&') : '';

  fetch('/api/research/entities' + qs)
    .then(function(r) { return r.json(); })
    .then(function(entities) {
      researchRenderEntityList(entities);
      researchRenderTypeFilters(entities);
    })
    .catch(function(err) {
      var container = document.getElementById('research-entity-items');
      if (container) container.innerHTML = '<p class="briefing-hint">Could not load entities. Run a sync to extract entities from your articles.</p>';
    });
}

function researchRenderTypeFilters(entities) {
  var container = document.getElementById('research-type-filters');
  if (!container) return;
  var types = {};
  for (var i = 0; i < entities.length; i++) {
    types[entities[i].type] = (types[entities[i].type] || 0) + 1;
  }
  var sorted = Object.entries(types).sort(function(a, b) { return b[1] - a[1]; });
  var html = '<button class="research-type-btn' + (!_researchTypeFilter ? ' active' : '') + '" onclick="researchFilterByType(null)">All</button>';
  for (var i = 0; i < sorted.length; i++) {
    var t = sorted[i][0];
    var isActive = _researchTypeFilter === t;
    html += '<button class="research-type-btn' + (isActive ? ' active' : '') + '" onclick="researchFilterByType(\'' + escapeJsStr(t) + '\')">' + escapeHtml(t) + ' <span class="research-type-count">' + sorted[i][1] + '</span></button>';
  }
  container.innerHTML = html;
}

function researchFilterByType(type) {
  _researchTypeFilter = type;
  var search = document.getElementById('research-search');
  var term = search ? search.value.trim() : '';
  researchLoadEntities(term || undefined, type || undefined);
}

function researchSearchEntities() {
  var search = document.getElementById('research-search');
  var term = search ? search.value.trim() : '';
  researchLoadEntities(term || undefined, _researchTypeFilter || undefined);
}

function researchRenderEntityList(entities) {
  var container = document.getElementById('research-entity-items');
  if (!container) return;
  if (entities.length === 0) {
    container.innerHTML = '<p class="briefing-hint">No entities found. Entities are extracted from your articles after sync.</p>';
    return;
  }
  var html = '';
  for (var i = 0; i < entities.length; i++) {
    var e = entities[i];
    html += '<div class="research-entity-row" data-rkey="' + e.rkey + '" onclick="researchLoadDetail(\'' + escapeJsStr(e.rkey) + '\')">';
    html += '<span class="research-entity-name">' + escapeHtml(e.name) + '</span>';
    html += '<span class="research-entity-badge research-type-' + escapeHtml(e.type) + '">' + escapeHtml(e.type) + '</span>';
    html += '<span class="research-mention-count">' + e.mentionCount + '</span>';
    html += '</div>';
  }
  container.innerHTML = html;
}

function researchLoadDetail(rkey) {
  // Highlight selected row
  document.querySelectorAll('.research-entity-row').forEach(function(row) {
    row.classList.toggle('active', row.dataset.rkey === rkey);
  });

  fetch('/api/research/entity/' + rkey)
    .then(function(r) { return r.json(); })
    .then(function(profile) {
      researchRenderDetail(profile);
    });
}

function researchRenderDetail(profile) {
  var container = document.getElementById('research-detail');
  if (!container || !profile.entity) return;
  var e = profile.entity;
  var html = '<div class="research-detail-header">';
  html += '<h2>' + escapeHtml(e.name) + '</h2>';
  html += '<button class="research-watch-btn" id="research-watch-btn" onclick="researchToggleWatch(\'' + escapeJsStr(e.name) + '\')" title="Watch this entity">';
  html += '<svg class="icon" style="width:16px;height:16px" aria-hidden="true"><use href="#i-star"/></svg>';
  html += '</button>';
  html += '</div>';
  html += '<span class="research-entity-badge research-type-' + escapeHtml(e.type) + '">' + escapeHtml(e.type) + '</span>';
  researchCheckIfWatched(e.name);

  if (profile.mentions && profile.mentions.length > 0) {
    html += '<h3>Mentioned in</h3><ul class="research-mention-list">';
    for (var i = 0; i < profile.mentions.length; i++) {
      var m = profile.mentions[i];
      var sentiment = m.value.sentiment || 'neutral';
      var dot = sentiment === 'positive' ? 'research-sentiment-positive'
        : sentiment === 'negative' ? 'research-sentiment-negative'
        : sentiment === 'mixed' ? 'research-sentiment-mixed'
        : 'research-sentiment-neutral';
      html += '<li>';
      html += '<span class="research-sentiment-dot ' + dot + '"></span>';
      html += '<a href="#" onclick="loadFileByName(\'' + escapeJsStr(m.value.filename) + '\');return false">' + escapeHtml(m.value.title) + '</a>';
      if (m.value.stance) html += ' <span class="research-stance">' + escapeHtml(m.value.stance) + '</span>';
      html += '</li>';
    }
    html += '</ul>';
  }

  if (profile.edges && profile.edges.length > 0) {
    html += '<h3>Related</h3><ul class="research-edge-list">';
    for (var i = 0; i < profile.edges.length; i++) {
      var edge = profile.edges[i];
      var other = edge.value.from === e.name ? edge.value.to : edge.value.from;
      var rel = edge.value.type;
      var isOutgoing = edge.value.from === e.name;
      html += '<li>';
      html += '<a href="#" class="research-edge-name" onclick="researchSearchFor(\'' + escapeJsStr(other) + '\');return false">' + escapeHtml(other) + '</a>';
      html += ' <span class="research-edge-type">' + escapeHtml(rel) + '</span>';
      html += '</li>';
    }
    html += '</ul>';
  }

  // Graph button (requires edges and cytoscape)
  if (profile.edges && profile.edges.length > 0 && typeof cytoscape !== 'undefined') {
    html += '<button class="btn-secondary research-graph-btn" onclick="researchOpenGraph(\'' + escapeJsStr(e.name) + '\')">View graph</button>';
  }

  container.innerHTML = html;
}

var _researchGraphProfile = null;

function researchOpenGraph(centerName) {
  // Find the edges from the currently displayed detail
  var container = document.getElementById('research-detail');
  if (!container || typeof cytoscape === 'undefined') return;

  // Fetch fresh profile to get edges
  var rows = document.querySelectorAll('.research-entity-row.active');
  var rkey = rows.length > 0 ? rows[0].dataset.rkey : null;
  if (!rkey) return;

  fetch('/api/research/entity/' + rkey)
    .then(function(r) { return r.json(); })
    .then(function(profile) {
      if (!profile.edges || profile.edges.length === 0) return;
      researchShowGraphModal(profile.entity.name, profile.edges);
    });
}

function researchShowGraphModal(centerName, edges) {
  // Remove any existing modal
  var existing = document.getElementById('research-graph-modal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'research-graph-modal';
  modal.className = 'research-graph-modal';
  modal.innerHTML = '<div class="research-graph-modal-header">' +
    '<h2>' + escapeHtml(centerName) + '</h2>' +
    '<button class="research-graph-modal-close" onclick="researchCloseGraph()" title="Close">&times;</button>' +
    '</div>' +
    '<div class="research-graph-container" id="research-graph-cy"></div>';
  document.body.appendChild(modal);

  // Close on Escape
  modal._escHandler = function(ev) {
    if (ev.key === 'Escape') researchCloseGraph();
  };
  document.addEventListener('keydown', modal._escHandler);

  // Build Cytoscape elements
  var nodes = {};
  var elements = [];
  nodes[centerName] = true;
  elements.push({ data: { id: centerName, label: centerName }, classes: 'center' });

  for (var i = 0; i < edges.length; i++) {
    var edge = edges[i];
    var from = edge.value.from;
    var to = edge.value.to;
    if (!nodes[from]) {
      nodes[from] = true;
      elements.push({ data: { id: from, label: from } });
    }
    if (!nodes[to]) {
      nodes[to] = true;
      elements.push({ data: { id: to, label: to } });
    }
    elements.push({
      data: {
        id: 'e' + i,
        source: from,
        target: to,
        label: edge.value.type,
      }
    });
  }

  var isDark = document.documentElement.dataset.theme === 'dark';

  var cy = cytoscape({
    container: document.getElementById('research-graph-cy'),
    elements: elements,
    style: [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'background-color': isDark ? '#4a5568' : '#dbeafe',
          'color': isDark ? '#e0e0e0' : '#1e3a5f',
          'border-width': 1,
          'border-color': isDark ? '#718096' : '#93c5fd',
          'font-size': '12px',
          'text-wrap': 'wrap',
          'text-max-width': '100px',
          'width': 'label',
          'height': 'label',
          'padding': '10px',
          'shape': 'round-rectangle',
        }
      },
      {
        selector: 'node.center',
        style: {
          'background-color': '#f59e0b',
          'border-color': '#d97706',
          'color': '#000',
          'font-weight': 'bold',
          'font-size': '14px',
        }
      },
      {
        selector: 'edge',
        style: {
          'label': 'data(label)',
          'width': 1.5,
          'line-color': isDark ? '#555' : '#cbd5e1',
          'target-arrow-color': isDark ? '#555' : '#cbd5e1',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'font-size': '10px',
          'color': isDark ? '#999' : '#64748b',
          'text-rotation': 'autorotate',
          'text-margin-y': -8,
        }
      },
    ],
    layout: {
      name: 'cose',
      animate: false,
      nodeRepulsion: function() { return 8000; },
      idealEdgeLength: function() { return 120; },
      padding: 40,
    },
    minZoom: 0.2,
    maxZoom: 3,
    wheelSensitivity: 0.3,
  });

  // Click node to search
  cy.on('tap', 'node', function(evt) {
    var name = evt.target.data('label');
    researchCloseGraph();
    researchSearchFor(name);
  });

  // Hover cursor
  cy.on('mouseover', 'node', function() {
    document.getElementById('research-graph-cy').style.cursor = 'pointer';
  });
  cy.on('mouseout', 'node', function() {
    document.getElementById('research-graph-cy').style.cursor = 'default';
  });
}

function researchCloseGraph() {
  var modal = document.getElementById('research-graph-modal');
  if (!modal) return;
  if (modal._escHandler) document.removeEventListener('keydown', modal._escHandler);
  modal.remove();
}

function researchLoadTensions() {
  fetch('/api/research/tensions')
    .then(function(r) { return r.json(); })
    .then(function(tensions) {
      researchRenderTensions(tensions);
    })
    .catch(function() {});
}

function researchRenderTensions(tensions) {
  var container = document.getElementById('research-tensions');
  if (!container || tensions.length === 0) {
    if (container) container.innerHTML = '';
    return;
  }

  var html = '<div class="research-tensions-section">';
  html += '<h3>Tensions</h3>';
  html += '<div class="research-tensions-cards">';

  var limit = Math.min(tensions.length, 5);
  for (var i = 0; i < limit; i++) {
    var t = tensions[i];
    html += '<div class="research-tension-card" onclick="researchSearchFor(\'' + escapeJsStr(t.entityName) + '\')">';
    html += '<div class="research-tension-header">';
    html += '<span class="research-tension-name">' + escapeHtml(t.entityName) + '</span>';
    html += '<span class="research-entity-badge research-type-' + escapeHtml(t.entityType) + '">' + escapeHtml(t.entityType) + '</span>';
    html += '</div>';

    // Show opposing stances
    var posStance = researchPickStance(t.positive);
    var negStance = researchPickStance(t.negative);
    if (posStance || negStance) {
      html += '<div class="research-tension-stances">';
      if (posStance) html += '<span class="research-tension-pos">' + escapeHtml(posStance) + '</span>';
      if (posStance && negStance) html += '<span class="research-tension-vs">vs</span>';
      if (negStance) html += '<span class="research-tension-neg">' + escapeHtml(negStance) + '</span>';
      html += '</div>';
    }

    html += '<div class="research-tension-counts">' + t.mentionCount + ' mentions, ' + t.positive.length + ' positive, ' + t.negative.length + ' negative</div>';
    html += '</div>';
  }

  html += '</div></div>';
  container.innerHTML = html;
}

function researchPickStance(mentions) {
  for (var i = 0; i < mentions.length; i++) {
    if (mentions[i].stance) return mentions[i].stance;
  }
  return null;
}

function researchSearchFor(name) {
  var input = document.getElementById('research-search');
  if (input) input.value = name;
  _researchTypeFilter = null;
  researchLoadEntities(name);
  researchUpdateClearBtn();
}

function researchExtractUrl() {
  var input = document.getElementById('research-url-input');
  var btn = document.getElementById('research-url-btn');
  var url = input ? input.value.trim() : '';
  if (!url) return;

  if (btn) { btn.disabled = true; btn.textContent = 'Extracting\u2026'; }

  fetch('/api/research/extract-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url }),
  })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      if (btn) { btn.disabled = false; btn.textContent = 'Extract'; }
      if (input) input.value = '';
      var count = result.entities ? result.entities.length : 0;
      showToast('Extracted ' + count + ' entities from URL');
      researchLoadEntities();
      researchLoadTensions();
    })
    .catch(function(err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Extract'; }
      showToast('Extraction failed: ' + (err.message || 'unknown error'));
    });
}

function researchClearSearch() {
  var input = document.getElementById('research-search');
  if (input) input.value = '';
  _researchTypeFilter = null;
  researchLoadEntities();
  researchUpdateClearBtn();
}

function researchUpdateClearBtn() {
  var input = document.getElementById('research-search');
  var btn = document.getElementById('research-search-clear');
  if (input && btn) {
    btn.style.display = input.value.trim() ? 'block' : 'none';
  }
}

function researchSearchEntitiesWithClear() {
  researchSearchEntities();
  researchUpdateClearBtn();
}

// --- Watchlist UI ---

function researchToggleWatch(entityName) {
  fetch('/api/research/watches')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var existing = data.watches.find(function(w) { return w.entityName === entityName; });
      if (existing) {
        return fetch('/api/research/watches/' + existing.rkey, { method: 'DELETE' })
          .then(function() { researchSetWatchBtn(false); });
      } else {
        return fetch('/api/research/watches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'entity', entityName: entityName }),
        }).then(function() { researchSetWatchBtn(true); });
      }
    });
}

function researchCheckIfWatched(entityName) {
  fetch('/api/research/watches')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var isWatched = data.watches.some(function(w) { return w.entityName === entityName; });
      researchSetWatchBtn(isWatched);
    });
}

function researchSetWatchBtn(isWatched) {
  var btn = document.getElementById('research-watch-btn');
  if (!btn) return;
  btn.classList.toggle('active', isWatched);
  btn.title = isWatched ? 'Unwatch this entity' : 'Watch this entity';
}

// --- Watch matches (New for you) ---

function researchLoadMatches() {
  fetch('/api/research/matches')
    .then(function(r) { return r.json(); })
    .then(function(matches) {
      researchRenderMatches(matches);
    })
    .catch(function() {});
}

function researchRenderMatches(matches) {
  var container = document.getElementById('research-new-for-you');
  if (!container || matches.length === 0) {
    if (container) container.innerHTML = '';
    return;
  }

  var html = '<div class="research-matches-section">';
  html += '<div class="research-matches-header">';
  html += '<h3>New for you</h3>';
  html += '<button class="research-matches-dismiss" onclick="researchDismissMatches()">Mark all seen</button>';
  html += '</div>';
  html += '<div class="research-matches-list">';

  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    var label = m.entityName ? escapeHtml(m.entityName) : escapeHtml(m.query || '');
    var title = m.title ? escapeHtml(m.title) : escapeHtml(m.filename);
    html += '<div class="research-match-row">';
    html += '<span class="research-match-label">' + label + '</span>';
    if (m.title) {
      html += '<a href="#" onclick="loadFileByName(\'' + escapeJsStr(m.filename) + '\');return false">' + title + '</a>';
    } else {
      html += '<span class="research-match-file">' + title + '</span>';
    }
    html += '</div>';
  }

  html += '</div></div>';
  container.innerHTML = html;
}

function researchDismissMatches() {
  fetch('/api/research/matches/seen', { method: 'POST' })
    .then(function() {
      var container = document.getElementById('research-new-for-you');
      if (container) container.innerHTML = '';
    });
}

function loadFileByName(filename) {
  var idx = allFiles.findIndex(function(f) { return f.filename === filename; });
  if (idx >= 0) {
    // Remove research view class before loading article
    var content = document.getElementById('content');
    if (content) content.classList.remove('research-view');
    loadFile(idx);
  }
}
