# Knowledge Graph Evolution Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Research tab's three-panel entity browser with a two-panel layout (sidebar + persistent live graph) and add note integration with origin-weighted edges.

**Architecture:** Phase 1a restructures the frontend from 3-panel to 2-panel with persistent Cytoscape graph and detail popovers. Phase 1b adds `origin` field to the data model, note extraction pipeline, and note-specific graph rendering. Both phases modify `viewer/19-research.js` (frontend), `viewer.css` (styles), `src/research.ts` (backend), and `src/viewer.ts` (API endpoints).

**Tech Stack:** Cytoscape.js (existing), vanilla JS (viewer), TypeScript (backend), SQLite PDS (loxodonta), Jest (tests)

**Spec:** `docs/plans/2026-03-12-knowledge-graph-evolution-design.md`

---

## Chunk 1: Phase 1a — Backend: Graph Data API

The persistent graph needs all entities and edges at once, not just edges for a single entity. Add a new query function and API endpoint.

### Task 1: Add `queryGraphData` to research.ts

**Files:**
- Modify: `src/research.ts:335-362` (near existing query functions)
- Test: `src/research.test.ts`

- [ ] **Step 1: Write failing test for queryGraphData**

Add to `src/research.test.ts` after the existing `graph queries` describe block:

```typescript
describe('queryGraphData', () => {
  test('returns all entities with mention counts and all edges', () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Apple', type: 'company' });
    pds.putRecord('app.pullread.entity', null, { name: 'Tim Cook', type: 'person' });
    pds.putRecord('app.pullread.mention', null, { entityName: 'Apple', filename: 'a.md', title: 'A' });
    pds.putRecord('app.pullread.mention', null, { entityName: 'Apple', filename: 'b.md', title: 'B' });
    pds.putRecord('app.pullread.mention', null, { entityName: 'Tim Cook', filename: 'a.md', title: 'A' });
    pds.putRecord('app.pullread.edge', null, { from: 'Apple', to: 'Tim Cook', type: 'employs', sourceFilename: 'a.md' });

    const graph = queryGraphData(pds);
    expect(graph.entities.length).toBe(2);
    expect(graph.entities.find((e: any) => e.name === 'Apple')!.mentionCount).toBe(2);
    expect(graph.edges.length).toBe(1);
    expect(graph.edges[0].value.from).toBe('Apple');
    pds.close();
  });

  test('caps entities at maxNodes, sorted by mention count', () => {
    const pds = createResearchPDS(':memory:');
    for (let i = 0; i < 5; i++) {
      pds.putRecord('app.pullread.entity', null, { name: `Entity${i}`, type: 'concept' });
      for (let j = 0; j <= i; j++) {
        pds.putRecord('app.pullread.mention', null, { entityName: `Entity${i}`, filename: `${j}.md`, title: `T${j}` });
      }
    }

    const graph = queryGraphData(pds, { maxNodes: 3 });
    expect(graph.entities.length).toBe(3);
    expect(graph.entities[0].name).toBe('Entity4'); // 5 mentions
    expect(graph.overflow).toBe(2);
    pds.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest research.test -- -t "queryGraphData"`
Expected: FAIL — `queryGraphData` is not exported

- [ ] **Step 3: Add queryGraphData import to test file**

Add `queryGraphData` to the import line at `src/research.test.ts:4`.

- [ ] **Step 4: Write queryGraphData implementation**

Add to `src/research.ts` after `queryEntities` (after line 362):

```typescript
interface GraphData {
  entities: EntityResult[];
  edges: any[];
  overflow: number;
}

export function queryGraphData(pds: PDS, opts?: { maxNodes?: number }): GraphData {
  const maxNodes = opts?.maxNodes || 200;
  const allEntities = queryEntities(pds, {});
  const overflow = Math.max(0, allEntities.length - maxNodes);
  const entities = allEntities.slice(0, maxNodes);
  const entityNames = new Set(entities.map(e => e.name));
  const edges = pds.listRecords('app.pullread.edge')
    .filter((e: any) => entityNames.has(e.value.from) && entityNames.has(e.value.to));
  return { entities, edges, overflow };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest research.test -- -t "queryGraphData"`
Expected: PASS (both tests)

- [ ] **Step 6: Commit**

```bash
git add src/research.ts src/research.test.ts
git commit -m "feat(research): add queryGraphData for persistent graph panel"
```

### Task 2: Add `/api/research/graph` endpoint

**Files:**
- Modify: `src/viewer.ts:2589` (near existing research endpoints)
- Modify: `src/research.ts` (export queryGraphData — already done in Task 1)

- [ ] **Step 1: Add the API endpoint**

Add after the `/api/research/status` handler (around line 2605 in `src/viewer.ts`). Note: viewer.ts uses dynamic `await import()` and Node HTTP helpers (`sendJson`, `readBody`), not Fetch API:

```typescript
    if (url.pathname === '/api/research/graph' && req.method === 'GET') {
      const { getResearchPDS, queryGraphData } = await import('./research');
      const pds = getResearchPDS();
      const maxNodes = parseInt(url.searchParams.get('maxNodes') || '200', 10);
      const graph = queryGraphData(pds, { maxNodes });
      sendJson(res, graph);
      return;
    }
```

- [ ] **Step 2: Run existing tests to verify no regressions**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest research.test`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/viewer.ts src/research.ts
git commit -m "feat(research): add /api/research/graph endpoint for persistent graph"
```

---

## Chunk 2: Phase 1a — Frontend: Two-Panel Layout + Persistent Graph

Replace the three-panel layout with sidebar + persistent Cytoscape graph. The graph modal code becomes the persistent graph panel.

### Task 3: Add new CSS for two-panel layout and popover

**Files:**
- Modify: `viewer.css:6801-7284` (research section)

- [ ] **Step 1: Replace the research layout grid**

At `viewer.css:6801-6810`, change `.research-layout` from `grid-template-columns: 320px 1fr` to the new two-panel layout. Also add styles for the graph panel, popover, and note nodes.

Replace the existing `.research-layout` rule:

```css
.research-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  min-height: 500px;
}
```

- [ ] **Step 2: Add graph panel styles**

Add after `.research-graph-modal` styles (line ~7284), replacing the modal styles:

```css
.research-graph-panel {
  position: relative;
  min-height: 0;
  background: color-mix(in srgb, var(--bg) 95%, #000);
}
.research-graph-panel .research-graph-cy {
  width: 100%;
  height: 100%;
  min-height: 500px;
}
.research-graph-legend {
  position: absolute;
  bottom: 10px;
  right: 14px;
  font-size: 10px;
  color: var(--muted);
  display: flex;
  gap: 14px;
  align-items: center;
}
.research-graph-legend-line {
  display: inline-block;
  width: 14px;
  height: 1px;
  background: #3a3a4a;
  vertical-align: middle;
}
.research-graph-overflow {
  position: absolute;
  top: 10px;
  right: 14px;
  font-size: 11px;
  color: var(--muted);
  background: var(--bg);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
}
```

- [ ] **Step 3: Add entity popover styles**

```css
.research-popover {
  position: absolute;
  width: 240px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  font-size: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  z-index: 100;
  max-height: 400px;
  overflow-y: auto;
}
.research-popover-close {
  position: absolute;
  top: 8px;
  right: 10px;
  cursor: pointer;
  color: var(--muted);
  font-size: 16px;
  background: none;
  border: none;
  padding: 0;
  line-height: 1;
}
.research-popover h3 {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 4px;
}
.research-popover-section-title {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  margin: 10px 0 4px;
}
.research-popover-mention {
  padding: 3px 0;
  font-size: 11px;
  color: var(--fg);
  cursor: pointer;
}
.research-popover-mention:hover {
  text-decoration: underline;
}
.research-popover-viewall {
  margin-top: 8px;
  font-size: 10px;
  color: var(--link);
  cursor: pointer;
}
```

- [ ] **Step 4: Update sidebar to 260px width**

The `.research-entity-list` at line 6815 currently has `max-height: 70vh`. Change to let it fill the sidebar panel:

```css
.research-sidebar {
  overflow-y: auto;
  padding: 12px;
  font-size: 13px;
}
```

- [ ] **Step 5: Remove old graph modal styles**

Delete the `.research-graph-modal`, `.research-graph-modal-header`, `.research-graph-modal-close`, and `.research-graph-container` rules (lines 7249-7284) since the graph is now persistent, not a modal.

- [ ] **Step 6: Update responsive breakpoint**

At lines 7179-7192, update the responsive rule to stack sidebar on top of graph:

```css
@media (max-width: 768px) {
  .research-layout {
    grid-template-columns: 1fr;
  }
  .research-sidebar {
    max-height: 40vh;
  }
  .research-graph-panel .research-graph-cy {
    min-height: 300px;
  }
}
```

- [ ] **Step 7: Commit CSS changes**

```bash
git add viewer.css
git commit -m "feat(research): add CSS for two-panel layout with persistent graph and popover"
```

### Task 4: Restructure researchRenderBrowser to two-panel layout

**Files:**
- Modify: `viewer/19-research.js:39-79` (`researchRenderBrowser`)

- [ ] **Step 1: Rewrite researchRenderBrowser**

Replace the function at lines 39-79. The new version renders:
- Sidebar (260px) containing: search bar, type filter chips, entity list, tensions, URL import bar, extraction trigger
- Graph panel (fills remaining space) with Cytoscape container

```javascript
function researchRenderBrowser() {
  var html = '<div class="article-header"><h1>Research</h1></div>';

  html += '<div class="research-layout">';

  // Sidebar
  html += '<div class="research-sidebar">';
  html += '<div class="research-search-bar">';
  html += '<input type="text" id="research-search" placeholder="Search entities..." oninput="researchSearchEntitiesWithClear()" />';
  html += '<button class="research-search-clear" id="research-search-clear" onclick="researchClearSearch()" style="display:none" title="Clear search">&times;</button>';
  html += '</div>';
  html += '<div class="research-type-filters" id="research-type-filters"></div>';
  html += '<div id="research-entity-items" class="research-entity-items"></div>';
  html += '<div id="research-tensions"></div>';
  html += '<div class="research-url-bar">';
  html += '<input type="text" id="research-url-input" placeholder="Paste a URL to extract entities..." />';
  html += '<button class="btn-primary" id="research-url-btn" onclick="researchExtractUrl()" style="font-size:13px;padding:6px 14px">Extract</button>';
  html += '</div>';
  html += '<div id="research-new-for-you"></div>';
  html += '</div>';

  // Graph panel
  html += '<div class="research-graph-panel" id="research-graph-panel">';
  html += '<div class="research-graph-cy" id="research-graph-cy"></div>';
  html += '<div class="research-graph-legend">';
  html += '<span><span class="research-graph-legend-line"></span> extracted</span>';
  html += '</div>';
  html += '<div id="research-graph-overflow" class="research-graph-overflow" style="display:none"></div>';
  html += '</div>';

  html += '</div>'; // .research-layout

  // Popover container (positioned absolutely within graph panel)
  html += '<div id="research-popover" class="research-popover" style="display:none"></div>';

  var content = document.getElementById('content');
  content.innerHTML = html;
  document.getElementById('content-scroll').scrollTop = 0;
  researchLoadEntities();
  researchLoadTensions();
  researchLoadMatches();
  researchLoadGraph();
}
```

- [ ] **Step 2: Verify the page renders without JS errors (manual)**

Open PullRead, navigate to Research tab. Sidebar should render; graph panel should be empty until `researchLoadGraph` is implemented.

- [ ] **Step 3: Commit**

```bash
git add viewer/19-research.js
git commit -m "feat(research): restructure researchRenderBrowser to two-panel layout"
```

### Task 5: Implement persistent graph rendering

**Files:**
- Modify: `viewer/19-research.js` (add `researchLoadGraph`, replace graph modal code)

- [ ] **Step 1: Add researchLoadGraph function**

Add after the existing `researchRenderBrowser` function. This fetches `/api/research/graph` and renders a persistent Cytoscape graph:

```javascript
var _researchCy = null;

function researchLoadGraph() {
  if (typeof cytoscape === 'undefined') return;
  fetch('/api/research/graph')
    .then(function(r) { return r.json(); })
    .then(function(graph) {
      if (!graph.entities || graph.entities.length < 3) {
        // Too few nodes — hide graph panel, show message
        var panel = document.getElementById('research-graph-panel');
        if (panel) panel.innerHTML = '<p style="padding:20px;color:var(--muted);text-align:center">Not enough entities for a graph yet. Extract more articles to see connections.</p>';
        return;
      }
      researchRenderGraph(graph);
    })
    .catch(function() {});
}

function researchMixHex(color, bgColor, pct) {
  // Mix two hex colors at given percentage (0-1) — canvas-safe alternative to color-mix()
  var parse = function(hex) {
    hex = hex.replace('#', '');
    return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
  };
  var c = parse(color), bg = parse(bgColor);
  var r = Math.round(c[0] * pct + bg[0] * (1 - pct));
  var g = Math.round(c[1] * pct + bg[1] * (1 - pct));
  var b = Math.round(c[2] * pct + bg[2] * (1 - pct));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function researchRenderGraph(graph) {
  var isDark = document.documentElement.dataset.theme === 'dark';
  var bgHex = isDark ? '#1a1a2e' : '#f0f0f5';
  var typeColors = {
    person: '#3b82f6', company: '#8b5cf6', technology: '#10b981',
    place: '#f59e0b', event: '#ef4444', concept: '#6366f1'
  };

  // Build Cytoscape elements
  var elements = [];
  var entityNames = {};
  for (var i = 0; i < graph.entities.length; i++) {
    var ent = graph.entities[i];
    entityNames[ent.name] = true;
    var baseColor = typeColors[ent.type] || '#6366f1';
    var nodeSize = Math.max(20, 10 + Math.log(1 + ent.mentionCount) * 12);
    elements.push({
      data: {
        id: ent.name,
        label: ent.name,
        type: ent.type,
        rkey: ent.rkey,
        mentionCount: ent.mentionCount,
        baseColor: baseColor,
        bgColor: researchMixHex(baseColor, bgHex, 0.35),
        borderColor: researchMixHex(baseColor, bgHex, 0.50),
        nodeSize: nodeSize
      }
    });
  }

  // Normalize edge names and deduplicate
  var edgeMap = {};
  for (var i = 0; i < graph.edges.length; i++) {
    var edge = graph.edges[i].value;
    if (!entityNames[edge.from] || !entityNames[edge.to]) continue;
    if (edge.from === edge.to) continue;
    var pairKey = [edge.from, edge.to].sort().join('\0');
    if (!edgeMap[pairKey]) edgeMap[pairKey] = { from: edge.from, to: edge.to, labels: {} };
    var normLabel = edge.type.toLowerCase().replace(/s$/, '');
    edgeMap[pairKey].labels[normLabel] = (edgeMap[pairKey].labels[normLabel] || 0) + 1;
  }

  var edgeKeys = Object.keys(edgeMap);
  for (var i = 0; i < edgeKeys.length; i++) {
    var entry = edgeMap[edgeKeys[i]];
    var bestLabel = '', bestCount = 0;
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
        edgeWidth: 1
      }
    });
  }

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
          'width': 'data(nodeSize)',
          'height': 'data(nodeSize)',
          // Cytoscape renders to canvas — color-mix() is not supported.
          // Pre-compute desaturated hex colors in JavaScript instead.
          'background-color': 'data(bgColor)',
          'color': isDark ? '#aaa' : '#555',
          'border-width': 1,
          'border-color': 'data(borderColor)',
          'font-size': '10px',
          'text-wrap': 'wrap',
          'text-max-width': '80px',
          'shape': 'ellipse',
          'padding': '6px',
        }
      },
      {
        selector: 'node:selected',
        style: {
          // Selected state uses 60% mix — computed dynamically via class swap
          'border-width': 2,
          'color': isDark ? '#eee' : '#222',
          'font-weight': 'bold',
        }
      },
      {
        selector: 'edge',
        style: {
          'label': 'data(label)',
          'width': 'data(edgeWidth)',
          'line-color': '#3a3a4a',
          'target-arrow-color': '#3a3a4a',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'font-size': '9px',
          'color': isDark ? '#555' : '#999',
          'text-rotation': 'autorotate',
          'text-margin-y': -8,
          'opacity': 0.7,
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

  _researchCy = cy;

  // Show overflow badge
  if (graph.overflow > 0) {
    var badge = document.getElementById('research-graph-overflow');
    if (badge) {
      badge.textContent = '+' + graph.overflow + ' more entities';
      badge.style.display = '';
    }
  }

  // Click node -> show popover + highlight sidebar
  cy.on('tap', 'node', function(evt) {
    var node = evt.target;
    researchShowPopover(node);
    researchHighlightSidebarEntity(node.data('rkey'));
  });

  // Click background -> dismiss popover
  cy.on('tap', function(evt) {
    if (evt.target === cy) researchDismissPopover();
  });

  // Hover cursor
  cy.on('mouseover', 'node', function() {
    document.getElementById('research-graph-cy').style.cursor = 'pointer';
  });
  cy.on('mouseout', 'node', function() {
    document.getElementById('research-graph-cy').style.cursor = 'default';
  });
}
```

- [ ] **Step 2: Remove old researchShowGraphModal and researchOpenGraph**

Delete `researchOpenGraph` (lines 366-382), `researchShowGraphModal` (lines 384-568), and `researchCloseGraph` (lines 570-575). These are replaced by the persistent graph.

- [ ] **Step 3: Remove the "Show graph" button from researchRenderDetail**

In `researchRenderDetail` (around lines 356-359), remove the graph modal button since the graph is now always visible. Also remove the `_researchGraphProfile` variable (line 364).

- [ ] **Step 4: Commit**

```bash
git add viewer/19-research.js
git commit -m "feat(research): persistent Cytoscape graph replacing modal"
```

### Task 6: Implement entity popover

**Files:**
- Modify: `viewer/19-research.js` (add popover functions)

- [ ] **Step 1: Add researchShowPopover function**

This translates Cytoscape node position to screen coordinates and shows the entity detail popover:

```javascript
function researchShowPopover(node) {
  researchDismissPopover();
  var rkey = node.data('rkey');
  if (!rkey) return;

  fetch('/api/research/entity/' + rkey)
    .then(function(r) { return r.json(); })
    .then(function(profile) {
      if (!profile || !profile.entity) return;
      var popover = document.getElementById('research-popover');
      if (!popover) return;

      var html = '<button class="research-popover-close" onclick="researchDismissPopover()">&times;</button>';
      html += '<h3>' + escapeHtml(profile.entity.name) + '</h3>';
      html += '<span class="research-entity-badge research-type-' + profile.entity.type + '">' + profile.entity.type + '</span>';

      // Brief (loaded async)
      html += '<p id="research-popover-brief" style="font-size:11px;color:var(--muted);margin:6px 0 10px;">Loading...</p>';

      // Mentions
      if (profile.mentions && profile.mentions.length > 0) {
        html += '<div class="research-popover-section-title">Mentioned in</div>';
        var shown = profile.mentions.slice(0, 3);
        for (var i = 0; i < shown.length; i++) {
          var m = shown[i].value;
          var dotClass = 'research-sentiment-' + (m.sentiment || 'neutral');
          html += '<div class="research-popover-mention" onclick="openFile(\'' + escapeHtml(m.filename) + '\')">';
          html += '<span class="research-sentiment-dot ' + dotClass + '"></span> ';
          html += escapeHtml(m.title || m.filename);
          html += '</div>';
        }
        if (profile.mentions.length > 3) {
          html += '<div class="research-popover-viewall" onclick="researchSearchFor(\'' + escapeHtml(profile.entity.name).replace(/'/g, "\\'") + '\')">View all ' + profile.mentions.length + ' mentions &rarr;</div>';
        }
      }

      popover.innerHTML = html;

      // Append popover into graph panel FIRST, then position it
      var graphPanel = document.getElementById('research-graph-panel');
      if (graphPanel) graphPanel.appendChild(popover);
      popover.style.display = '';

      // Position near the node using renderedPosition -> DOM coordinates
      if (graphPanel && _researchCy) {
        var pos = node.renderedPosition();
        var panelRect = graphPanel.getBoundingClientRect();
        var left = pos.x + 20;
        var top = pos.y - 20;
        if (left + 260 > panelRect.width) left = pos.x - 270;
        if (top + 300 > panelRect.height) top = panelRect.height - 310;
        if (top < 10) top = 10;
        popover.style.left = left + 'px';
        popover.style.top = top + 'px';
      }

      // Load brief async — researchLoadBrief doesn't return a Promise,
      // so fetch directly here
      fetch('/api/research/brief/' + encodeURIComponent(profile.entity.name))
        .then(function(r) { return r.json(); })
        .then(function(brief) {
          var el = document.getElementById('research-popover-brief');
          if (el && brief && brief.summary) el.textContent = brief.summary;
          else if (el) el.textContent = '';
        })
        .catch(function() {
          var el = document.getElementById('research-popover-brief');
          if (el) el.textContent = '';
        });

      // Highlight node + neighbors, fade others
      _researchCy.elements().style('opacity', 0.3);
      node.style('opacity', 1);
      node.neighborhood().style('opacity', 0.8);
    });
}

function researchDismissPopover() {
  var popover = document.getElementById('research-popover');
  if (popover) popover.style.display = 'none';
  if (_researchCy) {
    _researchCy.elements().style('opacity', 1);
  }
}
```

- [ ] **Step 2: Add Escape key handler for popover**

Add after `researchDismissPopover`:

```javascript
document.addEventListener('keydown', function(ev) {
  if (ev.key === 'Escape') researchDismissPopover();
});
```

- [ ] **Step 3: Commit**

```bash
git add viewer/19-research.js
git commit -m "feat(research): entity detail popover anchored to graph nodes"
```

### Task 7: Sidebar-graph bidirectional interaction

**Files:**
- Modify: `viewer/19-research.js`

- [ ] **Step 1: Add entity name to data-name attribute on entity rows**

In `researchRenderEntityList` (line 206), update each entity row div to include `data-name`:

Change the row rendering to include `data-name="' + escapeHtml(e.name) + '"` on each `.research-entity-row` div, alongside the existing `data-rkey` attribute.

- [ ] **Step 2: Add sidebar-to-graph click handler**

Modify `researchLoadDetail` (line 225) — when clicking an entity in the sidebar list, also center the graph on that entity and highlight it:

```javascript
function researchLoadDetail(rkey) {
  // Highlight in sidebar
  var rows = document.querySelectorAll('.research-entity-row');
  for (var i = 0; i < rows.length; i++) {
    rows[i].classList.remove('active');
    if (rows[i].dataset.rkey === rkey) rows[i].classList.add('active');
  }

  // Center graph on this entity
  if (_researchCy) {
    var entity = document.querySelector('.research-entity-row[data-rkey="' + rkey + '"]');
    var name = entity ? entity.dataset.name : null;
    if (name) {
      var node = _researchCy.getElementById(name);
      if (node.length) {
        _researchCy.animate({ center: { eles: node }, zoom: 1.5 }, { duration: 300 });
        researchShowPopover(node);
      }
    }
  }
}
```

- [ ] **Step 3: Add graph-to-sidebar scroll**

Add `researchHighlightSidebarEntity`:

```javascript
function researchHighlightSidebarEntity(rkey) {
  var rows = document.querySelectorAll('.research-entity-row');
  for (var i = 0; i < rows.length; i++) {
    rows[i].classList.remove('active');
    if (rows[i].dataset.rkey === rkey) {
      rows[i].classList.add('active');
      rows[i].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}
```

- [ ] **Step 4: Add type filter chip -> graph fade**

Modify `researchFilterByType` to also fade non-matching graph nodes:

```javascript
function researchFilterByType(type) {
  _researchTypeFilter = type === _researchTypeFilter ? null : type;
  researchLoadEntities(document.getElementById('research-search')?.value, _researchTypeFilter);

  // Fade non-matching nodes in graph
  if (_researchCy) {
    if (_researchTypeFilter) {
      _researchCy.nodes().forEach(function(node) {
        node.style('opacity', node.data('type') === _researchTypeFilter ? 1 : 0.15);
      });
      _researchCy.edges().style('opacity', 0.1);
    } else {
      _researchCy.elements().style('opacity', 1);
    }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add viewer/19-research.js
git commit -m "feat(research): sidebar-graph bidirectional interaction"
```

### Task 8: Add search-to-graph interaction

**Files:**
- Modify: `viewer/19-research.js` (`researchSearchEntities`)

- [ ] **Step 1: Add graph pulsing on search**

In `researchSearchEntities` (line 200), after loading entities, also highlight matching nodes in the graph:

```javascript
function researchSearchEntities() {
  var term = document.getElementById('research-search') ? document.getElementById('research-search').value : '';
  researchLoadEntities(term, _researchTypeFilter);

  // Highlight matching nodes in graph
  if (_researchCy && term && term.length > 1) {
    var lowerTerm = term.toLowerCase();
    _researchCy.nodes().forEach(function(node) {
      var matches = node.data('label').toLowerCase().includes(lowerTerm);
      node.style('opacity', matches ? 1 : 0.2);
    });
    _researchCy.edges().style('opacity', 0.1);
  } else if (_researchCy && !term) {
    _researchCy.elements().style('opacity', 1);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add viewer/19-research.js
git commit -m "feat(research): search highlights matching nodes in graph"
```

### Task 9: Remove old detail panel rendering

**Files:**
- Modify: `viewer/19-research.js:238-362` (`researchRenderDetail`)

- [ ] **Step 1: Simplify researchRenderDetail**

Since entity detail is now in the popover, the old `researchRenderDetail` function is no longer needed for rendering the right panel. Replace it with a minimal version that just calls the graph popover:

```javascript
function researchRenderDetail(profile) {
  // Detail is now shown in graph popover — this function kept for compatibility
  // with any existing callers, but the popover is the primary detail view
}
```

- [ ] **Step 2: Commit**

```bash
git add viewer/19-research.js
git commit -m "refactor(research): remove old detail panel, detail now in popover"
```

---

## Chunk 3: Phase 1b — Backend: Origin Field + Note Extraction

### Task 10: Add `origin` field to mention and edge records

**Files:**
- Modify: `src/research.ts:198-216` (mention/edge creation in `extractArticle`)
- Test: `src/research.test.ts`

- [ ] **Step 1: Write failing test for origin field on mentions**

Add to `src/research.test.ts`:

```typescript
describe('origin field', () => {
  beforeEach(() => mockSummarize.mockReset());

  test('extractArticle stores origin "extracted" on mentions and edges', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'Apple', type: 'company' }, { name: 'Tim Cook', type: 'person' }],
        relationships: [{ from: 'Apple', to: 'Tim Cook', type: 'employs' }],
        themes: ['tech'],
      }),
      model: 'test',
    });

    await extractArticle(pds, {
      filename: 'origin-test.md',
      title: 'Origin Test',
      body: 'Apple and Tim Cook.',
    });

    const mentions = pds.listRecords('app.pullread.mention');
    for (const m of mentions) {
      expect((m as any).value.origin).toBe('extracted');
    }
    const edges = pds.listRecords('app.pullread.edge');
    expect((edges[0] as any).value.origin).toBe('extracted');
    pds.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest research.test -- -t "origin field"`
Expected: FAIL — `origin` field is undefined on mentions/edges

- [ ] **Step 3: Add origin field to mention creation**

In `src/research.ts`, in the `extractArticle` function, add `origin: 'extracted'` to the mention record (around line 199):

```typescript
    pds.putRecord('app.pullread.mention', null, {
      entityName: canonicalName,
      filename: article.filename,
      title: article.title,
      source: article.source || 'feed',
      origin: 'extracted',
      sentiment,
      stance: sentiment === 'neutral' ? null : (entity.stance || null),
      publishedAt: article.publishedAt || null,
    });
```

And add `origin: 'extracted'` to the edge record (around line 211):

```typescript
    pds.putRecord('app.pullread.edge', null, {
      from: nameMap.get(rel.from) || rel.from,
      to: nameMap.get(rel.to) || rel.to,
      type: rel.type,
      origin: 'extracted',
      sourceFilename: article.filename,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest research.test -- -t "origin field"`
Expected: PASS

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest research.test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/research.ts src/research.test.ts
git commit -m "feat(research): add origin field to mentions and edges"
```

### Task 11: Add `"note"` to VALID_ENTITY_TYPES

**Files:**
- Modify: `src/research.ts:61` (VALID_ENTITY_TYPES)
- Test: `src/research.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
test('normalizeEntityType preserves "note" type', async () => {
  const pds = createResearchPDS(':memory:');
  mockSummarize.mockResolvedValue({
    summary: JSON.stringify({
      entities: [{ name: 'My Research Note', type: 'note' }],
      relationships: [],
      themes: [],
    }),
    model: 'test',
  });

  await extractArticle(pds, {
    filename: 'note-type-test.md',
    title: 'Note Type Test',
    body: 'Testing note type preservation.',
  });

  const entities = pds.listRecords('app.pullread.entity');
  expect(entities[0].value.type).toBe('note');
  pds.close();
});
```

Add this test inside the existing `extractArticle` describe block.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest research.test -- -t "preserves .note. type"`
Expected: FAIL — `note` is not in VALID_ENTITY_TYPES, gets normalized to `concept`

- [ ] **Step 3: Add "note" to VALID_ENTITY_TYPES**

At `src/research.ts:61`, change:

```typescript
const VALID_ENTITY_TYPES = new Set(['person', 'company', 'technology', 'place', 'event', 'concept']);
```

to:

```typescript
const VALID_ENTITY_TYPES = new Set(['person', 'company', 'technology', 'place', 'event', 'concept', 'note']);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest research.test -- -t "preserves .note. type"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/research.ts src/research.test.ts
git commit -m "feat(research): add 'note' to VALID_ENTITY_TYPES"
```

### Task 12: Add note extraction function

**Files:**
- Modify: `src/research.ts` (add `extractNote` function)
- Test: `src/research.test.ts`

- [ ] **Step 1: Write failing tests for extractNote**

```typescript
describe('extractNote', () => {
  beforeEach(() => mockSummarize.mockReset());

  test('extracts entities from note content with origin "note"', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'OpenAI', type: 'company', sentiment: 'positive', stance: 'leading AI' }],
        relationships: [],
        themes: ['AI'],
      }),
      model: 'test',
    });

    await extractNote(pds, {
      noteId: 'note-abc123',
      content: 'My thoughts on OpenAI and their approach to AI safety.',
      sourceArticle: '',
    });

    const entities = pds.listRecords('app.pullread.entity');
    expect(entities.length).toBe(2); // OpenAI + the note entity itself
    const noteEntity = entities.find((e: any) => e.value.type === 'note');
    expect(noteEntity).toBeDefined();
    expect(noteEntity!.value.name).toContain('note-abc123');

    const mentions = pds.listRecords('app.pullread.mention');
    const noteMentions = mentions.filter((m: any) => m.value.origin === 'note');
    expect(noteMentions.length).toBeGreaterThanOrEqual(1);
    pds.close();
  });

  test('creates edges from note to source article entities with origin "note"', async () => {
    const pds = createResearchPDS(':memory:');

    // Pre-populate: article extraction created an entity
    pds.putRecord('app.pullread.entity', null, { name: 'OpenAI', type: 'company' });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'OpenAI', filename: 'source-article.md', title: 'About OpenAI',
      origin: 'extracted', sentiment: 'neutral', stance: null,
    });

    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'OpenAI', type: 'company' }],
        relationships: [],
        themes: ['AI'],
      }),
      model: 'test',
    });

    await extractNote(pds, {
      noteId: 'note-xyz789',
      content: 'Interesting take on OpenAI.',
      sourceArticle: 'source-article.md',
    });

    const edges = pds.listRecords('app.pullread.edge');
    const noteEdges = edges.filter((e: any) => e.value.origin === 'note');
    expect(noteEdges.length).toBeGreaterThanOrEqual(1);
    pds.close();
  });

  test('re-extraction clears only this note origin mentions and edges', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'Apple', type: 'company' }],
        relationships: [],
        themes: ['tech'],
      }),
      model: 'test',
    });

    await extractNote(pds, { noteId: 'note-1', content: 'Apple notes', sourceArticle: '' });

    // Also add an extracted mention for Apple (from article extraction)
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Apple', filename: 'article.md', title: 'Article',
      origin: 'extracted', sentiment: 'neutral', stance: null,
    });

    // Re-extract the note
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'Google', type: 'company' }],
        relationships: [],
        themes: ['tech'],
      }),
      model: 'test',
    });

    await extractNote(pds, { noteId: 'note-1', content: 'Google notes', sourceArticle: '' });

    const mentions = pds.listRecords('app.pullread.mention');
    const extractedMentions = mentions.filter((m: any) => m.value.origin === 'extracted');
    expect(extractedMentions.length).toBe(1); // article mention preserved
    expect(extractedMentions[0].value.entityName).toBe('Apple');

    const noteMentions = mentions.filter((m: any) => m.value.origin === 'note');
    expect(noteMentions.some((m: any) => m.value.entityName === 'Google')).toBe(true);
    expect(noteMentions.some((m: any) => m.value.entityName === 'Apple')).toBe(false);
    pds.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest research.test -- -t "extractNote"`
Expected: FAIL — `extractNote` is not exported

- [ ] **Step 3: Add extractNote import to test file**

Add `extractNote` to the import line at `src/research.test.ts:4`.

- [ ] **Step 4: Implement extractNote**

Add to `src/research.ts` after `extractFromUrl` (after line ~244):

```typescript
interface NoteInput {
  noteId: string;
  content: string;
  sourceArticle: string;
}

export async function extractNote(
  pds: PDS,
  note: NoteInput,
): Promise<ExtractionResult | null> {
  const noteFilename = `note:${note.noteId}`;

  // Clear previous note-origin mentions and edges for this note
  // Use pds.query with where clause for efficiency (avoids loading all records)
  const existingMentions = pds.query('app.pullread.mention', {
    where: { origin: 'note', filename: noteFilename },
  });
  for (const m of existingMentions) {
    pds.deleteRecord('app.pullread.mention', m.rkey);
  }
  const existingEdges = pds.query('app.pullread.edge', {
    where: { origin: 'note', sourceFilename: noteFilename },
  });
  for (const e of existingEdges) {
    pds.deleteRecord('app.pullread.edge', e.rkey);
  }

  // Delete previous extraction record for this note
  const prevExtraction = pds.query('app.pullread.extraction', { where: { filename: noteFilename } });
  for (const ex of prevExtraction) {
    pds.deleteRecord('app.pullread.extraction', ex.rkey);
  }

  if (!note.content || note.content.trim().length < 10) return null;

  const prompt = `This is the user's own notes. Entities here represent the user's active interests.

Extract structured information from this note as JSON.

STRICT RULES:
- entities: array of { name, type, sentiment, stance } where:
  - type MUST be exactly one of: person, company, technology, place, event, concept
  - sentiment MUST be exactly one of: positive, negative, neutral, mixed
  - stance: a short phrase (3-6 words) or null
- relationships: array of { from, to, type } connecting entity names
- themes: array of short topic strings

Note content:

${note.content.slice(0, 4000)}`;

  const result = await summarizeText(prompt);
  let parsed: ExtractionResult;
  try {
    parsed = JSON.parse(result.summary);
  } catch {
    const jsonMatch = result.summary.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[1]); } catch { return null; }
    } else { return null; }
  }

  if (!parsed.entities || !Array.isArray(parsed.entities)) return null;
  if (!parsed.relationships) parsed.relationships = [];
  if (!parsed.themes) parsed.themes = [];

  for (const entity of parsed.entities) {
    entity.type = normalizeEntityType(entity.type);
  }

  // Create the note entity itself
  const noteEntityName = `note:${note.noteId}`;
  const existingNoteEntity = findExistingEntityName(pds, noteEntityName);
  if (!existingNoteEntity) {
    pds.putRecord('app.pullread.entity', null, {
      name: noteEntityName,
      type: 'note',
      role: null,
      source: 'note',
    });
  }

  const nameMap = new Map<string, string>();

  for (const entity of parsed.entities) {
    if (!entity.name || !entity.type) continue;
    const existingName = findExistingEntityName(pds, entity.name);
    const canonicalName = existingName || entity.name;
    nameMap.set(entity.name, canonicalName);

    if (!existingName) {
      pds.putRecord('app.pullread.entity', null, {
        name: canonicalName,
        type: entity.type,
        role: entity.role || null,
        source: 'note',
      });
    }

    const sentiment = normalizeSentiment(entity.sentiment);
    pds.putRecord('app.pullread.mention', null, {
      entityName: canonicalName,
      filename: noteFilename,
      title: note.content.slice(0, 60),
      source: 'note',
      origin: 'note',
      sentiment,
      stance: sentiment === 'neutral' ? null : (entity.stance || null),
      publishedAt: null,
    });
  }

  for (const rel of parsed.relationships) {
    pds.putRecord('app.pullread.edge', null, {
      from: nameMap.get(rel.from) || rel.from,
      to: nameMap.get(rel.to) || rel.to,
      type: rel.type,
      origin: 'note',
      sourceFilename: noteFilename,
    });
  }

  // If note has a source article, create edges from note entity to article entities
  if (note.sourceArticle) {
    const articleEntities = queryRelatedEntities(pds, note.sourceArticle);
    for (const ae of articleEntities) {
      pds.putRecord('app.pullread.edge', null, {
        from: noteEntityName,
        to: ae.name,
        type: 'references',
        origin: 'note',
        sourceFilename: noteFilename,
      });
    }
  }

  pds.putRecord('app.pullread.extraction', null, {
    filename: noteFilename,
    extractedAt: new Date().toISOString(),
    entityCount: parsed.entities.length,
    themes: parsed.themes,
    source: 'note',
  });

  return parsed;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest research.test -- -t "extractNote"`
Expected: All 3 tests PASS

- [ ] **Step 6: Run full test suite**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest research.test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/research.ts src/research.test.ts
git commit -m "feat(research): add extractNote function with origin tracking and re-extraction"
```

### Task 13: Add `/api/research/extract-note` endpoint

**Files:**
- Modify: `src/viewer.ts` (add endpoint)

- [ ] **Step 1: Add the API endpoint**

Add after the `/api/research/extract-url` handler in `src/viewer.ts`. Use the same Node HTTP pattern as other endpoints (`readBody`, `sendJson`, dynamic import):

```typescript
    if (url.pathname === '/api/research/extract-note' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        if (!body.noteId || !body.content) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'noteId and content required' }));
          return;
        }
        const { getResearchPDS, extractNote } = await import('./research');
        const pds = getResearchPDS();
        const result = await extractNote(pds, {
          noteId: body.noteId,
          content: body.content,
          sourceArticle: body.sourceArticle || '',
        });
        sendJson(res, result || { entities: [], relationships: [], themes: [] });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Note extraction failed' }));
      }
      return;
    }
```

- [ ] **Step 2: Commit**

```bash
git add src/viewer.ts
git commit -m "feat(research): add /api/research/extract-note endpoint"
```

### Task 14: Trigger note extraction on save

**Files:**
- Modify: `viewer/09-notebooks.js` (hook into note save)

- [ ] **Step 1: Add extraction trigger to note save**

In `viewer/09-notebooks.js`, find where notes are saved. The `saveNotebook` function (line 70) saves the whole notebook. We need to trigger extraction when an individual note's content changes.

Add a debounced extraction function after the existing notebook functions:

```javascript
var _noteExtractTimeout = null;

function researchExtractNoteDebounced(noteId, content, sourceArticle) {
  if (_noteExtractTimeout) clearTimeout(_noteExtractTimeout);
  _noteExtractTimeout = setTimeout(function() {
    fetch('/api/research/extract-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId: noteId, content: content, sourceArticle: sourceArticle || '' })
    }).catch(function() {});
  }, 3000); // 3s debounce
}
```

Then, in `notebookDebounceSave()` (line 389), after the `saveNotebook(_activeNotebook).then(...)` call at line 408, add the extraction trigger. The function already has the active note in scope via `_activeNoteId` and `_activeNotebook`:

```javascript
// Inside notebookDebounceSave, after saveNotebook().then() at line 408:
    _activeNotebook.updatedAt = new Date().toISOString();
    saveNotebook(_activeNotebook).then(() => {
      if (hint) hint.textContent = 'Saved';
      // Trigger research extraction for the active note
      if (_activeNoteId && _activeNotebook && _activeNotebook.notes) {
        var note = _activeNotebook.notes.find(function(n) { return n.id === _activeNoteId; });
        if (note && note.content && note.content.trim().length > 10) {
          researchExtractNoteDebounced(note.id, note.content, note.sourceArticle);
        }
      }
    });
```

- [ ] **Step 2: Commit**

```bash
git add viewer/09-notebooks.js
git commit -m "feat(research): trigger note extraction on save with 3s debounce"
```

---

## Chunk 4: Phase 1b — Frontend: Note Nodes + Origin-Based Edge Rendering

### Task 15: Implement origin-weighted mention counts

The spec requires: `entity node size = base + log(extracted_mentions + (highlight_mentions x 3) + (note_mentions x 2))`. Phase 1b implements the note 2x multiplier (highlights are Phase 2).

**Files:**
- Modify: `src/research.ts` (`queryGraphData`)
- Test: `src/research.test.ts`

- [ ] **Step 1: Write failing test for weighted mention count**

Add to the `queryGraphData` describe block in `src/research.test.ts`:

```typescript
test('applies 2x weight multiplier to note-origin mentions', () => {
  const pds = createResearchPDS(':memory:');
  pds.putRecord('app.pullread.entity', null, { name: 'Apple', type: 'company' });
  pds.putRecord('app.pullread.entity', null, { name: 'Google', type: 'company' });
  // Apple: 1 extracted mention
  pds.putRecord('app.pullread.mention', null, { entityName: 'Apple', filename: 'a.md', title: 'A', origin: 'extracted' });
  // Google: 1 note mention (should count as 2)
  pds.putRecord('app.pullread.mention', null, { entityName: 'Google', filename: 'note:n1', title: 'N', origin: 'note' });

  const graph = queryGraphData(pds);
  const apple = graph.entities.find((e: any) => e.name === 'Apple')!;
  const google = graph.entities.find((e: any) => e.name === 'Google')!;
  expect(google.weightedMentionCount).toBe(2); // 1 note x 2
  expect(apple.weightedMentionCount).toBe(1);  // 1 extracted x 1
  // Google should sort before Apple due to higher weighted count
  expect(graph.entities[0].name).toBe('Google');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest research.test -- -t "applies 2x weight"`
Expected: FAIL — `weightedMentionCount` is undefined

- [ ] **Step 3: Update queryGraphData to compute weighted counts**

Modify `queryGraphData` in `src/research.ts` to compute weighted mention counts:

```typescript
export function queryGraphData(pds: PDS, opts?: { maxNodes?: number }): GraphData {
  const maxNodes = opts?.maxNodes || 200;

  // Compute weighted mention counts per entity
  const mentions = pds.listRecords('app.pullread.mention');
  const weightedCounts = new Map<string, number>();
  const rawCounts = new Map<string, number>();
  for (const m of mentions) {
    const name = (m as any).value.entityName;
    const origin = (m as any).value.origin || 'extracted';
    const weight = origin === 'note' ? 2 : origin === 'highlight' ? 3 : 1;
    weightedCounts.set(name, (weightedCounts.get(name) || 0) + weight);
    rawCounts.set(name, (rawCounts.get(name) || 0) + 1);
  }

  let entities = pds.listRecords('app.pullread.entity').map((e: any) => ({
    rkey: e.rkey,
    name: e.value.name,
    type: e.value.type,
    mentionCount: rawCounts.get(e.value.name) || 0,
    weightedMentionCount: weightedCounts.get(e.value.name) || 0,
  }));

  entities.sort((a: any, b: any) => b.weightedMentionCount - a.weightedMentionCount);
  const overflow = Math.max(0, entities.length - maxNodes);
  entities = entities.slice(0, maxNodes);

  const entityNames = new Set(entities.map((e: any) => e.name));
  const edges = pds.listRecords('app.pullread.edge')
    .filter((e: any) => entityNames.has(e.value.from) && entityNames.has(e.value.to));

  return { entities, edges, overflow };
}
```

Update the `GraphData` interface to include `weightedMentionCount`:

```typescript
interface GraphData {
  entities: Array<EntityResult & { weightedMentionCount: number }>;
  edges: any[];
  overflow: number;
}
```

- [ ] **Step 4: Update frontend node sizing to use weightedMentionCount**

In `researchRenderGraph` (Task 5), update the node size calculation:

```javascript
var nodeSize = Math.max(20, 10 + Math.log(1 + (ent.weightedMentionCount || ent.mentionCount)) * 12);
```

- [ ] **Step 5: Run tests to verify**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest research.test -- -t "queryGraphData"`
Expected: All queryGraphData tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/research.ts src/research.test.ts viewer/19-research.js
git commit -m "feat(research): origin-weighted mention counts (note x2) for graph node sizing"
```

### Task 16: Render note nodes as rounded rectangles in graph

**Files:**
- Modify: `viewer/19-research.js` (`researchRenderGraph`)

- [ ] **Step 1: Add note node styling to Cytoscape config**

In `researchRenderGraph`, add a node style selector for note-type entities. Add after the `'node:selected'` style block:

```javascript
{
  selector: 'node[type="note"]',
  style: {
    'shape': 'round-rectangle',
    'background-color': 'transparent',
    'border-color': '#8a6d20',
    'border-width': 1.5,
    'color': isDark ? '#9a8a5a' : '#6a5a2a',
    'font-style': 'italic',
    'font-size': '9px',
  }
},
```

- [ ] **Step 2: Commit**

```bash
git add viewer/19-research.js
git commit -m "feat(research): render note entities as outlined rounded rectangles"
```

### Task 17: Render origin-based edge styling

**Files:**
- Modify: `viewer/19-research.js` (`researchRenderGraph`)
- Modify: `src/research.ts` (`queryGraphData` — include origin on edges)

- [ ] **Step 1: Write failing test for origin in graph data**

Add to the `queryGraphData` describe block in `src/research.test.ts`:

```typescript
test('includes origin field on edges in graph data', () => {
  const pds = createResearchPDS(':memory:');
  pds.putRecord('app.pullread.entity', null, { name: 'A', type: 'concept' });
  pds.putRecord('app.pullread.entity', null, { name: 'B', type: 'concept' });
  pds.putRecord('app.pullread.mention', null, { entityName: 'A', filename: 'a.md', title: 'A' });
  pds.putRecord('app.pullread.mention', null, { entityName: 'B', filename: 'b.md', title: 'B' });
  pds.putRecord('app.pullread.edge', null, { from: 'A', to: 'B', type: 'relates', origin: 'note', sourceFilename: 'note:n1' });

  const graph = queryGraphData(pds);
  expect(graph.edges[0].value.origin).toBe('note');
  pds.close();
});
```

- [ ] **Step 2: Run test to verify it passes (origin is already on the edge record)**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest research.test -- -t "includes origin field"`
Expected: PASS (origin is stored in the PDS record value, already returned)

- [ ] **Step 3: Update edge rendering in researchRenderGraph**

In the edge deduplication loop within `researchRenderGraph`, track origin and set edge width accordingly:

Update the edge building section to track origin:

```javascript
  // In the edgeMap building loop, also track origin:
  var edgeMap = {};
  for (var i = 0; i < graph.edges.length; i++) {
    var edge = graph.edges[i].value;
    if (!entityNames[edge.from] || !entityNames[edge.to]) continue;
    if (edge.from === edge.to) continue;
    var pairKey = [edge.from, edge.to].sort().join('\0');
    if (!edgeMap[pairKey]) edgeMap[pairKey] = { from: edge.from, to: edge.to, labels: {}, hasNoteOrigin: false };
    var normLabel = edge.type.toLowerCase().replace(/s$/, '');
    edgeMap[pairKey].labels[normLabel] = (edgeMap[pairKey].labels[normLabel] || 0) + 1;
    if (edge.origin === 'note') edgeMap[pairKey].hasNoteOrigin = true;
  }

  // In the edge element creation, set width based on origin:
  var edgeKeys = Object.keys(edgeMap);
  for (var i = 0; i < edgeKeys.length; i++) {
    var entry = edgeMap[edgeKeys[i]];
    // ... (best label logic unchanged) ...
    elements.push({
      data: {
        id: 'e' + i,
        source: entry.from,
        target: entry.to,
        label: bestLabel,
        edgeWidth: entry.hasNoteOrigin ? 2.5 : 1,
        edgeColor: entry.hasNoteOrigin ? '#8a6d20' : '#3a3a4a',
      }
    });
  }
```

Update the Cytoscape edge style to use the data-driven color:

```javascript
{
  selector: 'edge',
  style: {
    'label': 'data(label)',
    'width': 'data(edgeWidth)',
    'line-color': 'data(edgeColor)',
    'target-arrow-color': 'data(edgeColor)',
    'target-arrow-shape': 'triangle',
    'curve-style': 'bezier',
    'font-size': '9px',
    'color': isDark ? '#555' : '#999',
    'text-rotation': 'autorotate',
    'text-margin-y': -8,
    'opacity': 0.7,
  }
},
```

- [ ] **Step 4: Update graph legend to show note edge type**

In `researchRenderBrowser`, update the legend HTML:

```javascript
html += '<div class="research-graph-legend">';
html += '<span><span class="research-graph-legend-line"></span> extracted</span>';
html += '<span><span class="research-graph-legend-line" style="height:2.5px;background:#8a6d20;border-radius:1px"></span> your links</span>';
html += '<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;border:1.5px solid #8a6d20;background:transparent;vertical-align:middle"></span> note</span>';
html += '</div>';
```

- [ ] **Step 5: Commit**

```bash
git add viewer/19-research.js src/research.test.ts
git commit -m "feat(research): origin-based edge styling — note edges thicker with dark gold"
```

### Task 18: Add note type badge color to CSS

**Files:**
- Modify: `viewer.css` (add `.research-type-note` badge)

- [ ] **Step 1: Add note type badge**

Add after the existing type badge rules (around line 6891):

```css
.research-type-note { background: color-mix(in srgb, #b8860b 10%, var(--bg)); color: #9a7a3a; }
```

- [ ] **Step 2: Commit**

```bash
git add viewer.css
git commit -m "feat(research): add note type badge color"
```

### Task 19: Add note type to sidebar type filter chips

**Files:**
- Modify: `viewer/19-research.js:176-191` (`researchRenderTypeFilters`)

- [ ] **Step 1: Update type filter to include note type when present**

The existing `researchRenderTypeFilters` dynamically builds chips from the entity types in the results. Since note entities have `type: "note"`, they'll automatically appear if we don't filter them out. Verify this is the case — read the function to confirm it doesn't hardcode the type list.

If the function dynamically builds from data, no change is needed. If it hardcodes, add `'note'` to the list.

- [ ] **Step 2: Commit (if changes needed)**

```bash
git add viewer/19-research.js
git commit -m "feat(research): include note type in sidebar filter chips"
```

---

## Chunk 5: Integration Testing + Final Verification

### Task 20: Run full test suite and manual verification

- [ ] **Step 1: Run all backend tests**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && npx jest`
Expected: All tests PASS with pristine output

- [ ] **Step 2: Manual verification checklist**

Open PullRead and verify:
1. Research tab shows two-panel layout (sidebar + graph)
2. Sidebar contains: search, type filters, entity list, tensions, URL import, watch matches
3. Graph renders with all entities as nodes, edges between them
4. Clicking entity in sidebar centers graph on that node and shows popover
5. Clicking node in graph shows popover and highlights sidebar row
6. Type filter chips fade non-matching nodes in graph
7. Popover shows entity name, type badge, brief, mentions, "View all" link
8. Popover dismissed by clicking elsewhere, Escape, or close button
9. Overflow badge shown when > 200 entities
10. < 3 entities shows message instead of graph

- [ ] **Step 3: Verify note extraction (if notes exist)**

1. Open a note in the notebook
2. Edit and save
3. After 3s debounce, check Research tab — new note entities should appear
4. Note entity shows as rounded rectangle in graph
5. Note edges show as thicker dark gold lines

- [ ] **Step 4: Final commit if any fixups needed**

```bash
git add -p  # review changes
git commit -m "fix(research): integration fixups from manual testing"
```
