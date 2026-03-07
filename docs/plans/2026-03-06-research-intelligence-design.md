# Research Intelligence Design

## Overview

Extends the Research tab from a static entity browser into a living research tool that tracks narratives, detects viewpoints and tensions, surfaces clusters, and runs persistent queries against your feed over time. All processing is local-first — your reading patterns and interest signals never leave your machine.

This document describes **six capabilities**. Each is independent and can be approved, denied, or deferred individually.

## Current State

The Research tab today extracts entities, relationships, and themes from articles via LLM and stores them in a local SQLite-backed PDS. Users can browse entities, see where they're mentioned, and view relationship edges. This is a solid foundation but it's a snapshot — it doesn't track change, detect patterns, or surface insights proactively.

---

## Capability 1: Viewpoint and Sentiment Tracking

**What it does**: Each entity mention gets a sentiment signal and optional stance extracted alongside the entity itself. Over time, you can see how coverage of an entity shifts — was it positive last month, negative this week?

**How it works**:
- Extend the extraction prompt to return `sentiment` (positive / negative / neutral / mixed) and `stance` (a short phrase like "privacy concerns", "strong earnings") per entity mention
- Store sentiment and stance on `app.pullread.mention` records
- Detail panel shows a sentiment timeline: a simple sparkline or color-coded dot per mention, ordered by date

**Data model change**:
```
app.pullread.mention (extended)
  + sentiment: "positive" | "negative" | "neutral" | "mixed"
  + stance: string | null
  + publishedAt: ISO date string (from article frontmatter)
```

**LLM cost**: Zero additional calls — sentiment is extracted in the same prompt as entities.

**Complexity**: Simple. Prompt change + two new fields + timeline rendering.

**What you'd see**: Click "Macbook Neo" and see: 6 mentions. Early coverage neutral (announcement). Recent coverage mixed — "innovative design" from The Verge, "thermal throttling concerns" from Ars Technica. Sparkline goes green → yellow.

---

## Capability 2: Tension Detection

**What it does**: Automatically surfaces entities where sources disagree. Instead of browsing entities one by one, you see a "Tensions" section that highlights where the interesting debates are happening.

**How it works**:
- After extraction, scan entities with 3+ mentions for sentiment variance
- An entity has "tension" when it has both positive and negative mentions
- Rank tensions by mention count × sentiment divergence
- Display as a card in the Research tab: entity name, opposing stances, source articles on each side

**Data model change**: None — computed from existing mention sentiment data (requires Capability 1).

**Complexity**: Simple, once Capability 1 exists. Pure query logic + a new UI section.

**What you'd see**: A "Tensions" card at the top of Research showing: "AI Regulation — 4 sources split: 'necessary safeguards' vs 'innovation killer'". Click to see the articles on each side.

---

## Capability 3: Entity Briefs (Temporal Snapshots)

**What it does**: Maintains a running summary of what your feeds say about an entity. When new articles mention it, the brief updates. You can see how the narrative evolved over time.

**How it works**:
- When an entity accumulates N mentions (configurable, default 3), generate an initial brief via LLM: "What do these articles collectively say about X?"
- On subsequent extractions, if the entity gets new mentions, regenerate the brief with all mentions as context
- Store briefs with timestamps so previous versions are preserved
- Detail panel shows the current brief at the top, with a "history" toggle to see how it changed

**Data model change**:
```
app.pullread.brief (new collection)
  entityName: string
  text: string
  generatedAt: ISO date string
  mentionCount: number  (at time of generation)
  sourceFilenames: string[]
```

**LLM cost**: One additional call per entity per brief generation. Briefs regenerate only when new mentions appear, not on every sync. For a library with 50 tracked entities, this might be 5-10 extra calls per sync.

**Complexity**: Moderate. Needs a brief generation prompt, a trigger mechanism (post-extraction check), and versioned storage.

**What you'd see**: Click "Ukraine" and see at the top: *"Coverage focuses on four diplomatic paths forward, with recent articles highlighting EU energy policy shifts and NATO expansion debates. Sources are divided on ceasefire prospects."* Below that, the raw mention list as today.

---

## Capability 4: Watchlists and Persistent Queries

**What it does**: Pin entities or define compound queries. On each sync, new articles are checked against your watchlist and matches are surfaced — a personal alert system built on the knowledge graph.

**How it works**:
- User can "watch" an entity from its detail view (star/pin button)
- User can define custom queries: free text matched against article themes and entity names, or compound filters like "entity:Apple AND theme:privacy"
- After each sync + extraction, check new articles against all active watches
- Surface matches in a "New for you" section at the top of Research, or as a badge on the Research nav item

**Data model change**:
```
app.pullread.watch (new collection)
  type: "entity" | "query"
  entityName: string | null
  query: string | null
  createdAt: ISO date string
  lastMatchAt: ISO date string | null

app.pullread.watchMatch (new collection)
  watchRkey: string
  filename: string
  matchedAt: ISO date string
  seen: boolean
```

**LLM cost**: Zero for entity watches (exact match on extraction output). For free-text queries, could use embedding similarity (one Gemini call per query per sync) or simple keyword matching (zero cost).

**Complexity**: Moderate. Needs watch management UI, post-extraction matching logic, and notification rendering.

**What you'd see**: You pin "Macbook Neo". Next sync pulls in 30 articles, 2 mention it. Research tab shows a badge "2 new" and a panel: "Macbook Neo — 2 new articles since yesterday: 'Neo Teardown Reveals...' and 'Apple Responds to Thermal...'"

---

## Capability 5: Cluster Detection

**What it does**: Groups entities that frequently co-occur across articles. Surfaces emergent topic clusters you might not have noticed — "these 5 entities keep appearing together, and here's the theme."

**How it works**:
- Build a co-occurrence matrix from mentions: for each pair of entities that appear in the same article, increment their co-occurrence count
- Apply simple community detection (connected components with a minimum co-occurrence threshold, or modularity-based clustering for larger graphs)
- Label each cluster with its most common themes
- Display clusters as cards in Research: cluster label, member entities, article count

**Data model change**: None required — computed from existing mention data. Could optionally cache cluster results:
```
app.pullread.cluster (optional cache)
  label: string
  entityNames: string[]
  themes: string[]
  articleCount: number
  computedAt: ISO date string
```

**LLM cost**: Zero for the basic version (pure co-occurrence math). Optional: one LLM call to generate a human-readable cluster label from the member entities and themes.

**Complexity**: Moderate. The math is straightforward but the UX needs thought — how many clusters to show, how to handle overlapping clusters, when to recompute.

**What you'd see**: A "Clusters" section in Research showing: "AI Policy Debate — Sam Altman, Dario Amodei, EU AI Act, Senate Commerce Committee — appeared together in 8 articles". Click to expand and see the articles.

---

## Capability 6: Graph Traversal and Path Finding

**What it does**: Answer structural questions about your knowledge graph. "What connects entity A to entity B?" "What's the neighborhood around X?" "Which entities bridge different topic areas?"

**How it works**:
- Implement BFS/DFS traversal on the edge graph with configurable depth (1-3 hops)
- Path finding between two entities: shortest path through relationship edges
- Betweenness centrality: identify "bridge" entities that connect otherwise separate clusters
- Expose via API (`/api/research/entity/:rkey/graph?depth=2`) and render as a visual network

**Data model change**: None — operates on existing `app.pullread.edge` records.

**LLM cost**: Zero. Pure graph algorithms.

**Complexity**: Moderate (algorithms) to Complex (visualization). The traversal logic is well-understood CS, but rendering an interactive graph in the viewer is the hard part. Could use a `<pr-research-graph>` WebComponent with canvas/SVG rendering similar to the existing `15-graph.js`.

**What you'd see**: Click "Show connections" on an entity. See a network diagram: the entity at center, related entities one hop out, their connections to each other. Click a distant entity and see the path highlighted: "Apple → Tim Cook → Stanford → AI Research → OpenAI".

---

## Suggested Sequencing

These build on each other but each is independently useful:

| Order | Capability | Depends on | Rationale |
|-------|-----------|------------|-----------|
| 1 | Viewpoint/Sentiment | Nothing | Enriches existing data with zero new infra |
| 2 | Tension Detection | Capability 1 | High-value insight from data we already have |
| 3 | Watchlists | Nothing | Most requested "research tool" behavior |
| 4 | Entity Briefs | Nothing (but better with 1) | Transforms raw data into readable intelligence |
| 5 | Cluster Detection | Nothing | Surfaces patterns humans miss |
| 6 | Graph Traversal | Nothing | Most complex; visualization is the bottleneck |

## Briefing View (Composite)

Once Capabilities 1-5 exist, the Research tab landing page becomes a **daily briefing**:

1. **New for you** — watchlist matches from latest sync
2. **Tensions** — entities where sources disagree
3. **Emerging clusters** — new entity groupings detected
4. **Updated briefs** — entities whose narrative shifted since last visit

This replaces the current entity list as the default view (entity browser moves to a sub-tab or search).

## Non-Goals

- **Social features**: No sharing, collaboration, or multi-user anything
- **Real-time streaming**: All processing happens on sync, not live
- **External data sources beyond feeds**: Google Drive and URL import are already planned separately. This doc focuses on intelligence derived from data already in the system
- **Training custom models**: All ML is via API calls to existing providers. No local model training or fine-tuning

## Cost Summary

| Capability | Additional LLM calls per sync | Notes |
|-----------|------------------------------|-------|
| Viewpoint/Sentiment | 0 | Same extraction prompt |
| Tension Detection | 0 | Pure query |
| Entity Briefs | 5-10 | Only for entities with new mentions |
| Watchlists | 0-5 | Zero for entity watches; optional embedding for text queries |
| Cluster Detection | 0-1 | Optional label generation |
| Graph Traversal | 0 | Pure algorithms |

Total incremental cost: modest. The extraction call (which already exists) does the heavy lifting. Most intelligence capabilities are computed from stored data.
