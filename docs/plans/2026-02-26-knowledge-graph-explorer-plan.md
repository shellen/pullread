# Knowledge Graph Explorer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add knowledge graph exploration to PullRead in three incremental phases — related reading, interactive visualization, and typed entity extraction.

**Architecture:** Client-side graph computation in a new viewer JS module (`viewer/15-graph.js`) using the existing `allFiles` + `allNotesIndex` data. Phase 2 adds d3-force as an inline dependency. Phase 3 modifies the server-side autotagger and annotation storage.

**Tech Stack:** Vanilla JS (viewer modules), d3-force (Phase 2), existing LLM summarizer infrastructure (Phase 3). Tests use Jest + Bun.

**Design doc:** `docs/plans/2026-02-26-knowledge-graph-explorer-design.md`

---

## Phase 1: Related Articles + Topic Exploration

### Task 1: Graph computation module — similarity index

Build the core data structures that power all Phase 1 UI.

**Files:**
- Create: `viewer/15-graph.js`

**Context:** `allFiles` (array of `FileMeta`) lives in `viewer/01-state.js:5`. `allNotesIndex` (map of filename → `{machineTags, tags, ...}`) lives in `viewer/01-state.js:20`, populated by `viewer/06-annotations.js:40-53` from `/api/notes`. The `collectExploreData()` function in `viewer/10-explore.js:4-42` already builds `tagCounts` and `tagArticles` maps — reuse that pattern.

**Step 1: Create `viewer/15-graph.js` with ABOUTME header and three functions**

```js
// ABOUTME: Knowledge graph computation — article similarity, tag frequency, co-occurrence.
// ABOUTME: Powers related reading, topic clusters, and graph visualization.
```

Implement:

1. `buildTagIndex()` — Returns `{ tagFreq, tagArticles, cooccurrence }`.
   - `tagFreq`: `Map<string, number>` — how many articles each machine tag appears in
   - `tagArticles`: `Map<string, string[]>` — tag → list of filenames
   - `cooccurrence`: `Map<string, Map<string, number>>` — for each tag, how often it appears with each other tag
   - Iterates `allFiles`, looks up `allNotesIndex[f.filename].machineTags` for each
   - Skips articles with no machine tags
   - For cooccurrence: for each article's tag pairs, increment both directions

2. `findRelatedArticles(filename, topN)` — Returns array of `{ filename, similarity, sharedTags }`.
   - Uses the tag index to find all articles sharing at least one machine tag with the given article
   - Computes Jaccard similarity: `|intersection| / |union|` of machine tag sets
   - Returns top N results sorted by similarity descending
   - Threshold: only return results with similarity >= 0.15 (at least ~1-2 shared tags)

3. `buildTopicClusters(minShared, minArticles)` — Returns array of `{ tags, articles }`.
   - Groups articles that share `minShared` (default 2) or more machine tags
   - Only returns clusters with `minArticles` (default 3) or more articles
   - Uses union-find or iterative merging: start with tag-pairs from cooccurrence, group articles connected through shared tag sets

**Step 2: Run `bun run embed-viewer` to verify the new file gets picked up**

The embed script at `scripts/embed-viewer.ts` globs `viewer/*.js` sorted by filename, so `15-graph.js` will be included after `14-suggested-feeds.js`.

**Step 3: Commit**

```bash
git add viewer/15-graph.js
git commit -m "feat: add knowledge graph computation module"
```

---

### Task 2: "Related Reading" in article view

Show related articles at the bottom of every article.

**Files:**
- Modify: `viewer/04-article.js:596-604` (inside `renderArticle()`, after feed-extract-prompt, before `content.innerHTML = html`)
- Modify: `viewer/04-article.js` (after `content.innerHTML = html` at line 604 — add async population)
- Modify: `viewer.html` or inline CSS (styles for related-reading section)

**Context:** `renderArticle()` builds an `html` string and assigns it to `content.innerHTML` at line 604. The current article's filename is available as the `filename` parameter. After `content.innerHTML = html`, the function does DOM manipulation (language attr, review content, scroll restoration). The related reading section should be a placeholder div in the initial HTML, populated asynchronously after render so it doesn't block article display.

**Step 1: Add a placeholder div before `content.innerHTML = html` (line 604)**

Insert just before line 604:
```js
html += '<div id="related-reading"></div>';
```

**Step 2: After `content.innerHTML = html`, populate the placeholder**

Add a function `populateRelatedReading(filename)` that:
- Calls `findRelatedArticles(filename, 5)`
- If no results, hides the div
- Otherwise, renders a section with heading "Related Reading" and a list of article cards
- Each card shows: title, domain, shared tags as small pills
- Clicking a card calls `loadFile(relatedFilename)` (existing function in `05-sidebar.js`)

**Step 3: Add CSS for the related reading section**

Style it to match the existing dashboard card aesthetic. Place styles in the viewer CSS section (injected via `viewer.html` `/* INJECT:CSS */`). Key styles:
- `.related-reading` — margin-top, border-top separator
- `.related-card` — horizontal layout with title + domain + tag pills
- `.related-tag` — small inline pill matching existing `.tag-pill` but smaller

**Step 4: Run `bun run embed-viewer` and test manually**

Open an article that has machine tags and verify related articles appear.

**Step 5: Commit**

```bash
git add viewer/04-article.js viewer.html
git commit -m "feat: add related reading section to article view"
```

---

### Task 3: "Your Topics" on Home/For You tab

Show top machine tags as clickable chips on the hub landing page.

**Files:**
- Modify: `viewer/04-article.js:112-118` (For You tab content, before the quick-actions div)

**Context:** The For You tab content is built as `forYouHtml` in `renderHub()`. Lines 112-118 are the "quick actions" section at the bottom. The `collectExploreData()` call at line 39 already returns `sortedTags` (sorted by frequency). Insert a "Your Topics" section before the quick actions.

**Step 1: Add "Your Topics" section before quick actions (line 112)**

Insert before the `// Quick actions at bottom of For You` comment:
```js
// Your Topics — top machine tags by frequency
var topTopics = data.sortedTags.filter(function(t) { return !blockedTags.has(t[0]); }).slice(0, 15);
if (topTopics.length > 0) {
  forYouHtml += '<div class="dash-section">';
  forYouHtml += '<div class="dash-section-header">';
  forYouHtml += '<span class="dash-section-title"><svg viewBox="0 0 448 512"><use href="#i-tag"/></svg> Your Topics</span>';
  forYouHtml += '</div>';
  forYouHtml += '<div class="tag-cloud" style="padding:0 4px">';
  for (var ti = 0; ti < topTopics.length; ti++) {
    var tagName = topTopics[ti][0];
    var tagCount = topTopics[ti][1];
    forYouHtml += '<button class="tag-pill" onclick="document.getElementById(\'search\').value=\'tag:\\x22' + escapeJsStr(tagName) + '\\x22\';filterFiles()">' + escapeHtml(tagName) + ' <span class="tag-count">' + tagCount + '</span></button>';
  }
  forYouHtml += '</div></div>';
}
```

**Step 2: Run `bun run embed-viewer` and test manually**

Verify the topics section appears on the For You tab with clickable tags that filter the article list.

**Step 3: Commit**

```bash
git add viewer/04-article.js
git commit -m "feat: add Your Topics section to For You tab"
```

---

### Task 4: "Topic Clusters" on Tags tab

Show groups of articles that share multiple machine tags.

**Files:**
- Modify: `viewer/10-explore.js:133-154` (inside `buildTagsTabHtml()`, after auto-tagging section)
- Modify: `viewer/15-graph.js` (ensure `buildTopicClusters` is available)

**Context:** `buildTagsTabHtml()` in `viewer/10-explore.js:133` currently shows auto-tagging actions and the tag cloud. Add a "Topic Clusters" section between them.

**Step 1: Add cluster section after the auto-tagging div (line 150) and before `buildTagsHtml(data)` call (line 151)**

Insert between lines 150 and 151:
```js
// Topic Clusters
var clusters = buildTopicClusters(2, 3);
if (clusters.length > 0) {
  html += '<div style="margin-bottom:20px">';
  html += '<h3 style="font-size:14px;font-weight:600;margin:0 0 12px">Topic Clusters</h3>';
  for (var ci = 0; ci < Math.min(clusters.length, 10); ci++) {
    var cluster = clusters[ci];
    html += '<div class="topic-cluster">';
    html += '<div class="topic-cluster-tags">';
    for (var cti = 0; cti < cluster.tags.length; cti++) {
      html += '<span class="tag-pill tag-pill-sm">' + escapeHtml(cluster.tags[cti]) + '</span>';
    }
    html += '</div>';
    html += '<div class="topic-cluster-articles">';
    for (var cai = 0; cai < Math.min(cluster.articles.length, 5); cai++) {
      var cf = cluster.articles[cai];
      html += '<a href="#" onclick="event.preventDefault();jumpToArticle(\'' + escapeJsStr(cf.filename) + '\')">' + escapeHtml(cf.title) + '</a>';
    }
    if (cluster.articles.length > 5) {
      html += '<span class="topic-cluster-more">+' + (cluster.articles.length - 5) + ' more</span>';
    }
    html += '</div></div>';
  }
  html += '</div>';
}
```

**Step 2: Add CSS for `.topic-cluster` styling**

- `.topic-cluster` — card with subtle border, padding, margin-bottom
- `.topic-cluster-tags` — flex wrap row of small tag pills
- `.topic-cluster-articles` — vertical list of article links

**Step 3: Run `bun run embed-viewer` and test manually**

Verify clusters appear on the Tags tab, showing grouped articles with their shared tags.

**Step 4: Commit**

```bash
git add viewer/10-explore.js viewer.html
git commit -m "feat: add topic clusters to Tags tab"
```

---

### Task 5: Phase 1 integration test and polish

End-to-end verification that all three UI surfaces work together.

**Step 1: Test with real data**

- Open PullRead with a populated library (articles with machine tags)
- Verify: Home → For You shows "Your Topics" chips
- Verify: Clicking a topic chip filters the sidebar correctly
- Verify: Tags tab shows "Topic Clusters" between auto-tagging and tag cloud
- Verify: Opening an article shows "Related Reading" at bottom (if article has machine tags)
- Verify: Clicking a related article navigates to it
- Verify: Articles with no machine tags show no related reading section

**Step 2: Edge cases to check**

- Article with only 1 machine tag (may have no related articles)
- Article with no machine tags at all (related section should be hidden)
- Library with fewer than 3 tagged articles (clusters should not appear)
- Blocked tags should be excluded from Your Topics

**Step 3: Performance check**

- Open browser dev tools → Performance tab
- Load the hub with full library
- `buildTagIndex()` should complete in <50ms for ~1000 articles
- If slow, profile and optimize the hot path

**Step 4: Commit any polish fixes**

```bash
git add viewer/
git commit -m "fix: polish Phase 1 knowledge graph integration"
```

---

## Phase 2: Interactive Visualization

### Task 6: Add d3-force as inline dependency

**Files:**
- Create: `viewer/vendor/d3-force.min.js` (or inline in `15-graph.js`)
- Modify: `scripts/embed-viewer.ts` (if vendor files need special handling)

**Context:** The viewer is a single embedded HTML file. All JS is inlined by `scripts/embed-viewer.ts`. d3-force is ~15KB minified and has no DOM dependency — it only computes positions. For rendering, we use Canvas API directly (no d3-selection needed).

**Step 1: Determine the minimal d3 modules needed**

For a force-directed graph we need:
- `d3-force` — simulation, forceLink, forceManyBody, forceCenter, forceCollide
- `d3-quadtree` — dependency of d3-force
- `d3-zoom` — pan/zoom interaction (uses d3-selection, d3-transition, d3-dispatch, d3-interpolate)

Two options:
- **Option A:** Use only `d3-force` + `d3-quadtree` (~10KB) for layout, implement zoom/pan manually with canvas transforms. Smaller bundle, fewer deps.
- **Option B:** Use full `d3` UMD bundle (~80KB minified). Simpler code, larger bundle.

Recommend **Option A** for the single-file model. Canvas zoom/pan is ~30 lines of code.

**Step 2: Download d3-force + d3-quadtree minified bundles**

```bash
# Install as devDependencies
npm install --save-dev d3-force d3-quadtree
```

Then create a vendor bundle or inline the modules. The embed script already concatenates JS files — add vendor files with a `00-vendor-` prefix or handle in the embed script.

**Step 3: Verify the embed builds successfully**

```bash
bun run embed-viewer
```

**Step 4: Commit**

```bash
git add viewer/vendor/ scripts/embed-viewer.ts package.json
git commit -m "feat: add d3-force dependency for graph visualization"
```

---

### Task 7: Canvas-based graph renderer

**Files:**
- Modify: `viewer/15-graph.js` (add rendering functions)
- Modify: `viewer.html` (add `<canvas>` element in Explore area)

**Context:** The graph computation from Task 1 provides `buildTagIndex()` which gives us tag→article mappings. The renderer turns this into a visual force-directed graph on a `<canvas>` element.

**Step 1: Add a `<canvas id="graph-canvas">` to the Explore/Tags tab area**

Add a toggle button "List / Graph" at the top of the Tags tab in `buildTagsTabHtml()`. When "Graph" is selected, show the canvas; when "List" is selected, show the existing tag cloud.

**Step 2: Implement `renderGraph(canvasEl)` in `viewer/15-graph.js`**

This function should:
1. Build nodes array: one node per article (type: 'article'), one per unique tag (type: 'tag')
2. Build links array: one link per article↔tag connection
3. Filter: only include tags appearing in 2+ articles (avoid noise), only include articles with 2+ tags
4. Create d3-force simulation with:
   - `forceLink(links)` — connects nodes
   - `forceManyBody().strength(-30)` — repulsion
   - `forceCenter(width/2, height/2)` — centering
   - `forceCollide(radius)` — prevent overlap
5. On each tick, clear canvas and redraw:
   - Draw edges as thin gray lines
   - Draw tag nodes as small colored circles (8px radius) with label
   - Draw article nodes as larger circles (12px radius) with favicon or domain initial
6. Stop simulation after 300 ticks or when alpha < 0.001

**Step 3: Implement canvas zoom/pan**

~30 lines: track mouse wheel for zoom, mousedown+mousemove for pan, apply transform matrix to canvas context before drawing.

**Step 4: Run `bun run embed-viewer` and test**

Open Tags tab, click "Graph" toggle. Verify nodes appear and settle into clusters.

**Step 5: Commit**

```bash
git add viewer/15-graph.js viewer.html
git commit -m "feat: add canvas-based force graph renderer"
```

---

### Task 8: Graph interaction — hover and click

**Files:**
- Modify: `viewer/15-graph.js` (add event handlers)

**Step 1: Implement hit testing**

On `mousemove` over the canvas:
- Transform mouse coordinates through the inverse zoom/pan matrix
- Find the nearest node within hit radius (15px)
- If found, set it as `hoveredNode`

**Step 2: Implement hover highlighting**

When `hoveredNode` is set:
- If it's a tag node: highlight all connected article nodes and their edges, dim everything else
- If it's an article node: highlight its tag nodes and other articles sharing those tags
- Show a tooltip with the node name (tag string or article title)

**Step 3: Implement click behavior**

On `click`:
- If tag node: set search to `tag:"tagname"` and call `filterFiles()` — reuses existing search
- If article node: call `loadFile(filename)` to open it in the reader

**Step 4: Implement search dimming**

Listen to the existing search input. When search text changes:
- Find matching article nodes (by title/domain/tag)
- Dim non-matching nodes to 0.1 opacity
- Keep matching nodes and their connections at full opacity

**Step 5: Test interactions manually**

- Hover over tag → connected articles highlight
- Hover over article → its tags and related articles highlight
- Click tag → sidebar filters
- Click article → opens in reader
- Type in search → graph dims non-matches

**Step 6: Commit**

```bash
git add viewer/15-graph.js
git commit -m "feat: add hover, click, and search interaction to graph"
```

---

### Task 9: Phase 2 integration and performance

**Step 1: Test with real library**

- Verify graph loads and settles in <2 seconds for up to ~500 articles
- Verify zoom/pan is smooth
- Verify toggle between List and Graph views preserves state

**Step 2: Performance optimization if needed**

- If >500 nodes: implement viewport culling (only draw visible nodes)
- If simulation is slow: reduce iterations, increase alpha decay
- If canvas is sluggish: use `requestAnimationFrame` throttling, draw only on changes

**Step 3: Visual polish**

- Tag node colors from `SOURCE_COLORS` palette (in `viewer/01-state.js:31-36`)
- Article nodes show favicon if available, domain initial otherwise
- Edge opacity proportional to number of shared tags between connected articles
- Hover tooltip styled consistently with existing UI

**Step 4: Commit**

```bash
git add viewer/
git commit -m "fix: polish Phase 2 graph visualization"
```

---

## Phase 3: Enhanced Tagging + Typed Entities

### Task 10: Upgrade autotagger prompt and parsing

**Files:**
- Modify: `src/autotagger.ts:10-17` (AUTOTAG_PROMPT)
- Modify: `src/autotagger.ts:54-86` (parseTagsFromResponse)
- Create: `src/autotagger.test.ts`

**Context:** The current prompt at `src/autotagger.ts:10` asks for a flat JSON array. The parser at line 54 expects `string[]`. We need to support both the new structured format and the old flat format (for backward compat with LLMs that don't follow instructions perfectly).

**Step 1: Write failing tests for the new entity format**

Create `src/autotagger.test.ts`:

```ts
// ABOUTME: Tests for autotagger entity extraction and tag parsing.
// ABOUTME: Covers both flat tag arrays and structured entity objects.

import { parseEntitiesFromResponse } from './autotagger';

describe('parseEntitiesFromResponse', () => {
  it('parses structured entity JSON', () => {
    const input = JSON.stringify({
      entities: [
        { name: 'openai', type: 'company' },
        { name: 'samaltman', type: 'person' },
      ]
    });
    const result = parseEntitiesFromResponse(input);
    expect(result).toEqual([
      { name: 'openai', type: 'company' },
      { name: 'samaltman', type: 'person' },
    ]);
  });

  it('falls back to flat array (backward compat)', () => {
    const input = '["openai","regulation","samaltman"]';
    const result = parseEntitiesFromResponse(input);
    expect(result).toEqual([
      { name: 'openai', type: 'topic' },
      { name: 'regulation', type: 'topic' },
      { name: 'samaltman', type: 'topic' },
    ]);
  });

  it('handles markdown code fences', () => {
    const input = '```json\n{"entities":[{"name":"ai","type":"topic"}]}\n```';
    const result = parseEntitiesFromResponse(input);
    expect(result).toEqual([{ name: 'ai', type: 'topic' }]);
  });

  it('normalizes names (lowercase, no spaces/dashes)', () => {
    const input = JSON.stringify({
      entities: [{ name: 'Sam Altman', type: 'person' }]
    });
    const result = parseEntitiesFromResponse(input);
    expect(result[0].name).toBe('samaltman');
  });

  it('rejects invalid entity types', () => {
    const input = JSON.stringify({
      entities: [{ name: 'openai', type: 'widget' }]
    });
    const result = parseEntitiesFromResponse(input);
    expect(result[0].type).toBe('topic'); // defaults to 'topic'
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx jest src/autotagger.test.ts
```

Expected: FAIL — `parseEntitiesFromResponse` doesn't exist yet.

**Step 3: Update the prompt**

Replace `AUTOTAG_PROMPT` at `src/autotagger.ts:10-17` with:

```ts
const AUTOTAG_PROMPT = `Extract 3-8 entities from this article for relational mapping. For each entity, provide a name and type.

Entity types: person, company, technology, topic, theme, place

Return ONLY valid JSON in this format, no explanation or markdown:
{"entities":[{"name":"artificialintelligence","type":"topic"},{"name":"openai","type":"company"},{"name":"samaltman","type":"person"}]}

Names must be lowercase with no spaces or dashes.
For non-English articles, use English names where a clear equivalent exists, but keep proper nouns in their original language.`;
```

**Step 4: Add `MachineEntity` type and `parseEntitiesFromResponse()` function**

```ts
export interface MachineEntity {
  name: string;
  type: 'person' | 'company' | 'technology' | 'topic' | 'theme' | 'place';
}

const VALID_ENTITY_TYPES = new Set(['person', 'company', 'technology', 'topic', 'theme', 'place']);
```

Implement `parseEntitiesFromResponse(response: string): MachineEntity[]`:
- Strip markdown code fences
- Try `JSON.parse` → if `{entities: [...]}`, validate each entry
- Fallback: if parsed as `string[]` (flat array), map each to `{name, type: 'topic'}`
- Normalize names: `toLowerCase().trim().replace(/[\s\-]+/g, '')`
- Default invalid types to `'topic'`

**Step 5: Update `autotagText()` to return entities alongside flat tags**

Keep returning `machineTags: string[]` for backward compat, plus add `machineEntities: MachineEntity[]`:

```ts
interface AutotagResult {
  machineTags: string[];
  machineEntities: MachineEntity[];
  model: string;
}
```

The `machineTags` array is derived from `machineEntities.map(e => e.name)` — single source of truth.

**Step 6: Run tests to verify they pass**

```bash
npx jest src/autotagger.test.ts
```

**Step 7: Commit**

```bash
git add src/autotagger.ts src/autotagger.test.ts
git commit -m "feat: upgrade autotagger to extract typed entities"
```

---

### Task 11: Update annotation storage for entities

**Files:**
- Modify: `src/annotations.ts:8-15` (AnnotationData interface)
- Modify: `src/annotations.ts:17-24` (EMPTY_ANNOTATION)
- Modify: `src/annotations.ts:62-69` (cache population in `initAnnotations`)
- Modify: `src/annotations.ts:107-119` (allNotes return type)
- Modify: `src/autotagger.ts:99-102` (saveMachineTags)
- Modify: `src/annotations.test.ts` (add entity tests)

**Context:** `AnnotationData` at `src/annotations.ts:8` defines the sidecar shape. Adding `machineEntities` must be backward compatible — old sidecars without it should load fine.

**Step 1: Write failing test**

Add to `src/annotations.test.ts`:
```ts
it('loads machineEntities from sidecar', () => {
  // Write sidecar with machineEntities
  const data = {
    ...EMPTY,
    machineTags: ['openai'],
    machineEntities: [{ name: 'openai', type: 'company' }],
  };
  saveAnnotation('test.md', data);
  const loaded = loadAnnotation('test.md');
  expect(loaded.machineEntities).toEqual([{ name: 'openai', type: 'company' }]);
});

it('defaults machineEntities to empty array for old sidecars', () => {
  // Write sidecar WITHOUT machineEntities (simulates old format)
  // ...
  const loaded = loadAnnotation('old-article.md');
  expect(loaded.machineEntities).toEqual([]);
});
```

**Step 2: Run test to verify it fails**

**Step 3: Add `machineEntities` to `AnnotationData`**

At `src/annotations.ts:8-15`:
```ts
export interface AnnotationData {
  highlights: unknown[];
  articleNote: string;
  annotations: unknown[];
  tags: string[];
  machineTags: string[];
  machineEntities: MachineEntity[];  // new
  isFavorite: boolean;
}
```

Import `MachineEntity` from `./autotagger`.

Update `EMPTY_ANNOTATION` at line 17-24 to include `machineEntities: []`.

Update cache population at line 62-69 to include `machineEntities: data.machineEntities || []`.

Update `allNotes()` at line 107-119 to include `machineEntities` in the return value.

**Step 4: Update `saveMachineTags` to also save entities**

Rename to `saveMachineTagsAndEntities` or add a new `saveMachineEntities` function in `src/autotagger.ts`. The caller (`autotagBatch`) should save both `machineTags` and `machineEntities`.

**Step 5: Run tests**

```bash
npx jest src/annotations.test.ts src/autotagger.test.ts
```

**Step 6: Commit**

```bash
git add src/annotations.ts src/autotagger.ts src/annotations.test.ts
git commit -m "feat: add machineEntities to annotation storage"
```

---

### Task 12: Batch re-tag CLI command

**Files:**
- Modify: `src/index.ts` (add `--retag` flag to existing autotag command)
- Modify: `src/autotagger.ts:127-190` (`autotagBatch` — save entities too)

**Context:** `autotagBatch()` at `src/autotagger.ts:127` already supports `force: boolean` to re-tag all articles. The `--retag` behavior is equivalent to `force: true` but for entity extraction specifically. The simplest approach: when `force` is true, the batch function now saves both `machineTags` and `machineEntities`.

**Step 1: Update `autotagBatch` to save entities**

In the success path at line 175-178, after `saveMachineTags(file, result.machineTags)`, also save `result.machineEntities` via the updated annotation storage.

**Step 2: Verify existing `--force` / retag-all button still works**

The viewer's "Retag All" button (`viewer/10-explore.js:148`) calls `batchAutotagAll(true)` which hits the `/api/autotag-batch` endpoint. Ensure the endpoint passes `force: true` through to `autotagBatch`.

**Step 3: Test with a few articles**

Run autotag on 2-3 test articles, verify `.annot.json` files contain both `machineTags` and `machineEntities`.

**Step 4: Commit**

```bash
git add src/index.ts src/autotagger.ts
git commit -m "feat: batch retag saves typed entities"
```

---

### Task 13: Update graph visualization for entity types

**Files:**
- Modify: `viewer/15-graph.js` (color coding, legend, faceted filtering)
- Modify: `viewer/04-article.js` (related reading shows entity types)

**Context:** The `/api/notes` endpoint (which populates `allNotesIndex`) needs to include `machineEntities`. Once available client-side, the graph and related reading can use entity types.

**Step 1: Verify `allNotesIndex` includes `machineEntities`**

The `allNotes()` function in `src/annotations.ts` builds the notes map. After Task 11, it should include `machineEntities`. Verify the `/api/notes` handler in `src/viewer.ts` passes it through.

**Step 2: Color-code tag nodes by entity type**

In `renderGraph()`, assign colors based on entity type:
- `person` → blue
- `company` → green
- `technology` → purple
- `topic` → orange
- `theme` → gray
- `place` → teal
- Unknown/untyped → default gray

Look up entity type from `allNotesIndex[filename].machineEntities` for each tag. If the same tag has different types across articles, use the most common type.

**Step 3: Add a legend**

Small legend overlay on the canvas showing entity type → color mapping.

**Step 4: Update related reading to show entity types**

In the "Related Reading" section (Task 2), show shared entity chips with type-colored dots:
- `🔵 Sam Altman` (person)
- `🟢 OpenAI` (company)
- `🟠 AI Regulation` (topic)

**Step 5: Test with re-tagged articles**

Re-tag a batch of articles, then verify the graph shows colored nodes and the related reading shows typed entities.

**Step 6: Commit**

```bash
git add viewer/15-graph.js viewer/04-article.js
git commit -m "feat: color-code graph nodes and related reading by entity type"
```

---

### Task 14: Phase 3 integration and final polish

**Step 1: End-to-end test**

- Run batch retag on full library
- Verify graph shows colored nodes by entity type
- Verify related reading shows typed entity chips
- Verify old articles without entities still work (graceful degradation)
- Verify new articles auto-tagged through normal flow get entities

**Step 2: Edge cases**

- Article with entities but some have unknown types → default to 'topic'
- Mixed library (some articles have entities, some don't) → graph shows untyped as gray
- LLM returns flat array instead of structured → falls back correctly

**Step 3: Performance check**

- Full library load time with entity data
- Graph render time unchanged from Phase 2

**Step 4: Final commit**

```bash
git add viewer/ src/
git commit -m "fix: polish Phase 3 typed entity integration"
```
