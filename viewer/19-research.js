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
  html += '<div class="research-layout">';

  // Entity list panel
  html += '<div class="research-panel research-entity-list">';
  html += '<div class="research-search-bar">';
  html += '<input type="text" id="research-search" placeholder="Search entities..." oninput="researchSearchEntities()" />';
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
  var html = '<h2>' + escapeHtml(e.name) + '</h2>';
  html += '<span class="research-entity-badge research-type-' + escapeHtml(e.type) + '">' + escapeHtml(e.type) + '</span>';

  if (profile.mentions && profile.mentions.length > 0) {
    html += '<h3>Mentioned in</h3><ul class="research-mention-list">';
    for (var i = 0; i < profile.mentions.length; i++) {
      var m = profile.mentions[i];
      html += '<li><a href="#" onclick="loadFileByName(\'' + escapeJsStr(m.value.filename) + '\');return false">' + escapeHtml(m.value.title) + '</a></li>';
    }
    html += '</ul>';
  }

  if (profile.edges && profile.edges.length > 0) {
    html += '<h3>Related</h3><ul class="research-edge-list">';
    for (var i = 0; i < profile.edges.length; i++) {
      var edge = profile.edges[i];
      var other = edge.value.from === e.name ? edge.value.to : edge.value.from;
      html += '<li><span class="research-edge-name">' + escapeHtml(other) + '</span> <span class="research-edge-type">' + escapeHtml(edge.value.type) + '</span></li>';
    }
    html += '</ul>';
  }

  container.innerHTML = html;
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
