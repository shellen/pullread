// ABOUTME: Research tab — knowledge graph dashboard for browsing extracted entities
// ABOUTME: Two-panel layout: sidebar with entity list, persistent Cytoscape graph with popovers

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

  // Sidebar: search, filters, entities, tensions, watch matches, URL import
  html += '<div class="research-sidebar">';
  html += '<div class="research-search-bar">';
  html += '<input type="text" id="research-search" placeholder="Search entities..." oninput="researchSearchEntitiesWithClear()" />';
  html += '<button class="research-search-clear" id="research-search-clear" onclick="researchClearSearch()" style="display:none" title="Clear search">&times;</button>';
  html += '</div>';
  html += '<div class="research-type-filters" id="research-type-filters"></div>';
  html += '<div id="research-entity-items" class="research-entity-items"></div>';
  html += '<div id="research-tensions"></div>';
  html += '<div id="research-new-for-you"></div>';
  html += '<div class="research-url-bar">';
  html += '<input type="text" id="research-url-input" placeholder="Paste a URL to extract entities..." />';
  html += '<button class="btn-primary" id="research-url-btn" onclick="researchExtractUrl()" style="font-size:13px;padding:6px 14px">Extract</button>';
  html += '</div>';
  html += '</div>';

  // Graph panel with Cytoscape container
  html += '<div class="research-graph-panel">';
  html += '<div class="research-graph-cy" id="research-graph-cy"></div>';
  html += '<div class="research-graph-legend">';
  html += '<span><span class="research-graph-legend-line"></span> extracted</span>';
  html += '<span><span class="research-graph-legend-line" style="height:2.5px;background:#8a6d20;border-radius:1px"></span> your links</span>';
  html += '<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;border:1.5px solid #8a6d20;background:transparent;vertical-align:middle"></span> note</span>';
  html += '</div>';
  html += '<div class="research-graph-overflow" id="research-graph-overflow" style="display:none"></div>';
  html += '<div class="research-popover" id="research-popover"></div>';
  html += '</div>';

  html += '</div>'; // .research-layout

  var content = document.getElementById('content');
  content.innerHTML = html;
  document.getElementById('content-scroll').scrollTop = 0;
  researchLoadEntities();
  researchLoadTensions();
  researchLoadMatches();
  researchLoadGraph();
}

var _researchCy = null;

function researchLoadGraph() {
  if (typeof cytoscape === 'undefined') return;
  fetch('/api/research/graph?maxNodes=50')
    .then(function(r) { return r.json(); })
    .then(function(graph) {
      if (!graph.entities || graph.entities.length < 3) {
        var cy = document.getElementById('research-graph-cy');
        if (cy) cy.innerHTML = '<p class="briefing-hint" style="text-align:center;padding-top:40px">Not enough entities to render a graph yet.</p>';
        return;
      }
      researchRenderGraph(graph);
    })
    .catch(function(err) { console.error('researchLoadGraph error:', err); });
}

function researchMixHex(color, bgColor, pct) {
  function parseHex(h) {
    h = h.replace('#', '');
    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
  }
  var c = parseHex(color);
  var bg = parseHex(bgColor);
  var r = Math.round(c[0] * pct + bg[0] * (1 - pct));
  var g = Math.round(c[1] * pct + bg[1] * (1 - pct));
  var b = Math.round(c[2] * pct + bg[2] * (1 - pct));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

var _researchTypeColors = {
  person: '#3b82f6',
  company: '#8b5cf6',
  technology: '#10b981',
  place: '#f59e0b',
  event: '#ef4444',
  concept: '#6366f1'
};

function researchRenderGraph(graph) {
  try { _researchRenderGraphInner(graph); }
  catch (err) { console.error('researchRenderGraph error:', err); }
}

function _researchRenderGraphInner(graph) {
  var isDark = document.documentElement.dataset.theme === 'dark';
  var bgHex = isDark ? '#1a1a2e' : '#f8f9fa';
  var elements = [];

  // Build node elements with pre-computed colors
  var entityByName = {};
  for (var i = 0; i < graph.entities.length; i++) {
    var e = graph.entities[i];
    entityByName[e.name] = e;
    var baseColor = _researchTypeColors[e.type] || '#6366f1';
    var bgColor = researchMixHex(baseColor, bgHex, 0.35);
    var borderColor = researchMixHex(baseColor, bgHex, 0.50);
    var wmc = e.weightedMentionCount || e.mentionCount || 0;
    var fontSize = Math.max(9, Math.min(16, 9 + Math.log(1 + wmc) * 1.5));
    elements.push({
      data: {
        id: e.name,
        label: e.name,
        rkey: e.rkey,
        type: e.type,
        bgColor: bgColor,
        borderColor: borderColor,
        fontSize: fontSize
      }
    });
  }

  // Deduplicate edges
  var edgeMap = {};
  for (var i = 0; i < graph.edges.length; i++) {
    var edge = graph.edges[i];
    var from = edge.value.from;
    var to = edge.value.to;
    if (from === to) continue;
    if (!entityByName[from] || !entityByName[to]) continue;
    var pairKey = [from, to].sort().join('\0');
    var normLabel = edge.value.type.toLowerCase().replace(/s$/, '');
    if (!edgeMap[pairKey]) edgeMap[pairKey] = { from: from, to: to, labels: {}, hasNoteOrigin: false };
    if (edge.value.origin === 'note') edgeMap[pairKey].hasNoteOrigin = true;
    edgeMap[pairKey].labels[normLabel] = (edgeMap[pairKey].labels[normLabel] || 0) + 1;
  }
  var edgeKeys = Object.keys(edgeMap);
  var maxEdges = 150;
  for (var i = 0; i < edgeKeys.length && i < maxEdges; i++) {
    var entry = edgeMap[edgeKeys[i]];
    var bestLabel = '';
    var bestCount = 0;
    var labelKeys = Object.keys(entry.labels);
    for (var j = 0; j < labelKeys.length; j++) {
      if (entry.labels[labelKeys[j]] > bestCount) {
        bestCount = entry.labels[labelKeys[j]];
        bestLabel = labelKeys[j];
      }
    }
    elements.push({
      data: {
        id: 'e' + i,
        source: entry.from,
        target: entry.to,
        label: bestLabel,
        edgeWidth: entry.hasNoteOrigin ? 2.5 : 1,
        edgeColor: entry.hasNoteOrigin ? '#8a6d20' : (isDark ? '#3a3a4a' : '#cbd5e1')
      }
    });
  }
  console.log('Research graph: ' + graph.entities.length + ' nodes, ' + edgeKeys.length + ' unique edges (' + Math.min(edgeKeys.length, maxEdges) + ' rendered), ' + graph.edges.length + ' raw edges');

  if (_researchCy) {
    _researchCy.destroy();
    _researchCy = null;
  }

  _researchCy = cytoscape({
    container: document.getElementById('research-graph-cy'),
    elements: elements,
    style: [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'background-color': 'data(bgColor)',
          'color': isDark ? '#e0e0e0' : '#1e3a5f',
          'border-width': 1,
          'border-color': 'data(borderColor)',
          'font-size': 10,
          'text-wrap': 'wrap',
          'text-max-width': 80,
          'padding': 8,
          'shape': 'round-rectangle'
        }
      },
      {
        selector: 'node[type="note"]',
        style: {
          'background-color': 'transparent',
          'border-color': '#8a6d20',
          'border-width': 1.5,
          'color': isDark ? '#9a8a5a' : '#6a5a2a',
          'font-style': 'italic',
          'font-size': 9
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 1,
          'line-color': isDark ? '#3a3a4a' : '#cbd5e1',
          'target-arrow-color': isDark ? '#3a3a4a' : '#cbd5e1',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'font-size': 8,
          'color': isDark ? '#666' : '#94a3b8',
          'text-rotation': 'autorotate',
          'text-margin-y': -6
        }
      }
    ],
    layout: {
      name: 'cose',
      animate: false,
      randomize: true,
      nodeRepulsion: function() { return 12000; },
      idealEdgeLength: function() { return 100; },
      numIter: 200,
      padding: 40
    },
    minZoom: 0.2,
    maxZoom: 3,
    wheelSensitivity: 0.3
  });

  // Node click shows popover
  _researchCy.on('tap', 'node', function(evt) {
    var node = evt.target;
    researchShowPopover(node);
    researchHighlightSidebarEntity(node.data('rkey'));
  });

  // Background click dismisses popover
  _researchCy.on('tap', function(evt) {
    if (evt.target === _researchCy) {
      researchDismissPopover();
    }
  });

  // Hover cursor
  _researchCy.on('mouseover', 'node', function() {
    document.getElementById('research-graph-cy').style.cursor = 'pointer';
  });
  _researchCy.on('mouseout', 'node', function() {
    document.getElementById('research-graph-cy').style.cursor = 'default';
  });

  // Overflow badge
  var overflowEl = document.getElementById('research-graph-overflow');
  if (overflowEl) {
    if (graph.overflow > 0) {
      overflowEl.textContent = '+' + graph.overflow + ' more entities';
      overflowEl.style.display = '';
    } else {
      overflowEl.style.display = 'none';
    }
  }
}

function researchShowPopover(node) {
  var popover = document.getElementById('research-popover');
  if (!popover || !_researchCy) return;

  var rkey = node.data('rkey');
  var name = node.data('label');
  var type = node.data('type');

  // Build initial popover content
  var html = '<button class="research-popover-close" onclick="researchDismissPopover()">&times;</button>';
  html += '<h3>' + escapeHtml(name) + '</h3>';
  html += '<span class="research-entity-badge research-type-' + escapeHtml(type) + '">' + escapeHtml(type) + '</span>';
  html += '<div id="research-popover-brief" class="research-brief" style="margin:8px 0 0"></div>';
  html += '<div id="research-popover-mentions"></div>';
  popover.innerHTML = html;

  // Position near node
  var pos = node.renderedPosition();
  var graphPanel = document.querySelector('.research-graph-panel');
  var panelRect = graphPanel ? graphPanel.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 600 };
  var popLeft = pos.x + 20;
  var popTop = pos.y - 20;
  // Keep within panel bounds
  if (popLeft + 240 > panelRect.width) popLeft = pos.x - 260;
  if (popTop + 200 > panelRect.height) popTop = panelRect.height - 210;
  if (popTop < 10) popTop = 10;
  popover.style.left = popLeft + 'px';
  popover.style.top = popTop + 'px';
  popover.style.display = 'block';

  // Highlight selected node + neighbors, fade others
  _researchCy.elements().style('opacity', 0.15);
  node.style('opacity', 1);
  node.neighborhood().style('opacity', 1);

  // Load brief via direct fetch
  fetch('/api/research/brief/' + encodeURIComponent(name))
    .then(function(r) { return r.json(); })
    .then(function(brief) {
      var el = document.getElementById('research-popover-brief');
      if (!el || !brief.summary) return;
      el.innerHTML = '<p class="research-brief-text">' + escapeHtml(brief.summary) + '</p>';
    })
    .catch(function() {});

  // Load entity profile for mentions
  fetch('/api/research/entity/' + rkey)
    .then(function(r) { return r.json(); })
    .then(function(profile) {
      var mentionsEl = document.getElementById('research-popover-mentions');
      if (!mentionsEl || !profile.mentions || profile.mentions.length === 0) return;
      var mHtml = '<div class="research-popover-section-title">Mentions</div>';
      var limit = Math.min(profile.mentions.length, 3);
      for (var i = 0; i < limit; i++) {
        var m = profile.mentions[i];
        var sentiment = m.value.sentiment || 'neutral';
        var dot = sentiment === 'positive' ? 'research-sentiment-positive'
          : sentiment === 'negative' ? 'research-sentiment-negative'
          : sentiment === 'mixed' ? 'research-sentiment-mixed'
          : 'research-sentiment-neutral';
        mHtml += '<div class="research-popover-mention">';
        mHtml += '<span class="research-sentiment-dot ' + dot + '"></span>';
        mHtml += '<a href="#" onclick="loadFileByName(\'' + escapeJsStr(m.value.filename) + '\');return false">' + escapeHtml(m.value.title) + '</a>';
        mHtml += '</div>';
      }
      if (profile.mentions.length > 3) {
        mHtml += '<a class="research-popover-viewall" href="#" onclick="researchSearchFor(\'' + escapeJsStr(name) + '\');return false">View all ' + profile.mentions.length + ' mentions</a>';
      }
      mentionsEl.innerHTML = mHtml;
    })
    .catch(function() {});
}

function researchDismissPopover() {
  var popover = document.getElementById('research-popover');
  if (popover) popover.style.display = 'none';
  if (_researchCy) {
    _researchCy.elements().style('opacity', 1);
  }
}

document.addEventListener('keydown', function(ev) {
  if (ev.key === 'Escape') researchDismissPopover();
});

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

  // Fade non-matching graph nodes
  if (_researchCy) {
    if (!type) {
      _researchCy.elements().style('opacity', 1);
    } else {
      _researchCy.nodes().forEach(function(n) {
        n.style('opacity', n.data('type') === type ? 1 : 0.15);
      });
      _researchCy.edges().style('opacity', 0.1);
    }
  }
}

function researchSearchEntities() {
  var search = document.getElementById('research-search');
  var term = search ? search.value.trim() : '';
  researchLoadEntities(term || undefined, _researchTypeFilter || undefined);

  // Highlight matching nodes in graph
  if (_researchCy) {
    if (!term) {
      _researchCy.elements().style('opacity', 1);
    } else {
      var lowerTerm = term.toLowerCase();
      _researchCy.nodes().forEach(function(n) {
        var matches = n.data('label').toLowerCase().indexOf(lowerTerm) >= 0;
        n.style('opacity', matches ? 1 : 0.2);
      });
      _researchCy.edges().style('opacity', 0.1);
    }
  }
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
    html += '<div class="research-entity-row" data-rkey="' + e.rkey + '" data-name="' + escapeHtml(e.name) + '" onclick="researchLoadDetail(\'' + escapeJsStr(e.rkey) + '\', \'' + escapeJsStr(e.name) + '\')">';
    html += '<span class="research-entity-name">' + escapeHtml(e.name) + '</span>';
    html += '<span class="research-entity-badge research-type-' + escapeHtml(e.type) + '">' + escapeHtml(e.type) + '</span>';
    html += '<span class="research-mention-count">' + e.mentionCount + '</span>';
    html += '</div>';
  }
  container.innerHTML = html;
}

function researchLoadDetail(rkey, name) {
  researchHighlightSidebarEntity(rkey);

  // Center graph on entity node and show popover
  if (_researchCy && name) {
    var node = _researchCy.getElementById(name);
    if (node && node.length > 0) {
      _researchCy.animate({ center: { eles: node }, duration: 300 });
      researchShowPopover(node);
    }
  }
}

function researchHighlightSidebarEntity(rkey) {
  document.querySelectorAll('.research-entity-row').forEach(function(row) {
    row.classList.toggle('active', row.dataset.rkey === rkey);
  });
  // Scroll active row into view
  var activeRow = document.querySelector('.research-entity-row.active');
  if (activeRow) activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function researchRenderDetail() {
  // Detail is now shown in the graph popover (researchShowPopover)
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

function researchLoadBrief(entityName) {
  fetch('/api/research/brief/' + encodeURIComponent(entityName))
    .then(function(r) { return r.json(); })
    .then(function(brief) {
      var el = document.getElementById('research-brief');
      if (!el || !brief.summary) return;
      var html = '<p class="research-brief-text">' + escapeHtml(brief.summary) + '</p>';
      html += '<a class="research-brief-wiki" href="' + escapeHtml(brief.wikipediaUrl) + '" target="_blank" rel="noopener">';
      html += '<svg class="icon" style="width:14px;height:14px;vertical-align:-2px" aria-hidden="true"><use href="#i-globe-alt"/></svg> ';
      html += 'Wikipedia</a>';
      el.innerHTML = html;
    })
    .catch(function() {});
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
  if (_researchCy) _researchCy.elements().style('opacity', 1);
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
