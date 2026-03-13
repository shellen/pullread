# Knowledge Graph Evolution: Multi-Source Personal Knowledge Graph

**Date:** 2026-03-12
**Status:** Design approved
**Inspired by:** [Harper Reed's Immaculate Knowledge Graph](https://harper.blog/2026/03/11/2026-immaculate-knowledge-graph/) — the insight that different source types create different kinds of links, and user-created connections are more valuable than algorithmic ones.

## Problem

The Research tab treats all knowledge uniformly — LLM entity extraction from articles. But PullRead already captures multiple knowledge types (notes, highlights, articles, podcasts, social posts), each with different signal strength. User-created knowledge (notes, highlights) represents intentional attention and synthesis, which should carry more weight than algorithmically-extracted connections.

The current three-panel entity browser also feels like a database UI rather than an exploration tool. The graph visualization is hidden behind a modal, making discovery passive rather than ambient.

## Design Decisions

### Layout: Two-Panel with Persistent Graph

Replace the three-panel layout (entity list | entity detail | graph modal) with two panels:

- **Left: Adaptive sidebar (260px)** — search, type filter chips, entity list, tensions section, URL import, watch matches, extraction trigger. Collapses the current entity list and detail panels into one scrollable column.
- **Right: Persistent live graph (fills remaining space)** — always visible, not hidden behind a modal. Force-directed layout via Cytoscape.js.

Entity detail moves to a **popover** anchored near the clicked node in the graph. Popover positioning requires translating Cytoscape canvas coordinates to screen coordinates (consider `cytoscape-popper` or manual `renderedPosition()` mapping). This keeps graph focus while still providing full entity context (brief, mentions, related entities).

**Graph performance threshold:** If the entity count exceeds 200 nodes, show only the top 200 by weight and indicate overflow with a count badge. Full clustering/culling deferred to Phase 3.

### Visual Language

Muted palette matching existing viewer.css conventions:

- **Type badges:** `color-mix(in srgb, typeColor 12%, var(--bg))` with type color as text
- **Graph nodes:** desaturated to 30-35% color mix with background. Selected node at 60%.
- **Extracted edges:** thin (1px), dark gray (#3a3a4a) — visible but not prominent
- **User-created edges (notes):** thicker (2-2.5px), dark gold (#8a6d20) — distinguishable without being loud
- **Note nodes:** rounded rectangles (not circles), outlined with dark gold stroke, not filled
- **Sentiment dots:** desaturated via color-mix
- **No emoji anywhere.** Icons from Heroicons; Font Awesome as fallback.

### Data Model

No new PDS collections. Extends existing schema with an `origin` field (distinct from the existing `source` field which tracks article provenance like `"feed"` / `"url-import"`):

**Existing collections (unchanged structure):**
- `app.pullread.entity` — resolved entities (person, company, tech, place, event, concept) + new type `note`
- `app.pullread.mention` — entity-to-article links with sentiment + stance
- `app.pullread.edge` — entity-to-entity relationships
- `app.pullread.extraction` — processing tracker

**New fields:**
- `mention.origin`: `"extracted"` | `"highlight"` | `"note"` (default: `"extracted"` for new records; existing records without this field are treated as `"extracted"`)
- `edge.origin`: `"extracted"` | `"note"` (new field on edges; existing edges without it are treated as `"extracted"`)

**Note type registration:** Add `"note"` to `VALID_ENTITY_TYPES` in the normalizer so it isn't mapped to `"concept"`. Note entities are created programmatically (not via LLM type assignment), so this is an allowlist addition only.

**Note nodes:** Notes become entities with `type: "note"`. When a notebook references articles (via highlight sources), edges are created from the note node to entities in those articles with `origin: "note"`.

**Weight calculation:**
```
entity node size = base + log(extracted_mentions + (highlight_mentions x 3) + (note_mentions x 2))
edge thickness: 1px (extracted) | 2.5px (note-created)
```

Highlights boost **entity node weight** (via mention count), not edge thickness — highlights create mentions, not edges. Note-created edges are the only user-sourced edges.

Multipliers are tunable. Principle: user actions > algorithm.

**Entity name dedup limitations:** The existing case-insensitive normalization (lowercase, strip titles/articles) handles most cases. Variations like "OpenAI" vs "Open AI" won't merge automatically. This is accepted as a known limitation — a merging UI is out of scope for this spec.

### Sidebar-Graph Interaction

**Sidebar to graph (Phase 1a):**
- Click entity in list: graph centers/zooms to that node, highlights it + immediate connections, fades others to 30% opacity
- Type filter chips: graph fades non-matching nodes, hides their edges
- Search: matching nodes pulse in graph; selecting a result centers on it

**Layer toggles (Phase 2+):**
- "All" / "My links" / "Notes" — filters visible edges by origin. Not in Phase 1 sidebar.

**Graph to sidebar:**
- Click entity node: opens detail popover (brief, mentions, related), scrolls sidebar list to highlight that entity
- Click note node: popover shows note content preview, linked articles, "Open in Notebook" action
- Click edge: popover shows relationship label, origin type, source articles
- Pan/zoom: independent of sidebar scroll

**Popover behavior:**
- Anchored near clicked node using Cytoscape `renderedPosition()` mapped to DOM coordinates
- Repositioned on pan/zoom; dismissed if node leaves viewport
- Dismissed by click-elsewhere, Escape, or close button
- "View all N mentions" navigates to article list filtered by entity
- Article title click opens reading view

**Empty/loading states:**
- No entities: existing empty state with extraction prompt
- Extraction running: progress indicator in sidebar header
- < 3 nodes: skip graph panel, full-width entity list with message

### Extraction Pipeline

**Notes (new, LLM-based):**
- Triggered on individual note save/update. The notebook system has a single shared notebook (`nb-shared`) with multiple notes — extraction runs per-note, not per-notebook.
- Same LLM extraction prompt as articles, with preamble: "This is the user's own notes. Entities here represent the user's active interests."
- Extracted entities get `origin: "note"` on their mentions
- Article linking: if the note has a `sourceArticle`, create edges from the note entity to entities in that source article, with `origin: "note"`
- **Re-extraction scope:** On note update, clear only mentions with `origin: "note"` that reference this specific note, and edges with `origin: "note"` sourced from this note. Do NOT delete the note entity itself or any shared entities — they may have mentions from other sources.

**Highlights (Phase 2, entity matching):**
- Triggered on highlight/annotation save
- No LLM call: string match highlighted text against existing entity names
- If match found, add mention with `origin: "highlight"`
- LLM fallback only if highlight >100 chars with no known entity matches
- Inline on save, no background job — graph updates immediately

**Articles (existing, unchanged):**
- Existing pipeline continues. New records get `origin: "extracted"`. Existing records without `origin` are treated as `"extracted"` at query time (no backfill migration needed).

**Podcasts (future):**
- Same pipeline as articles, applied to show notes/descriptions. Skip if body <50 chars.

**Social posts (future):**
- Person-centric: prioritize author as entity. Short text = entity matching, no LLM.

## Phasing

### Phase 1a — Layout Restructure
- Restructure Research tab: 3-panel to 2-panel (sidebar + persistent graph)
- Detail popover replacing detail panel (with Cytoscape coordinate mapping)
- Sidebar-graph bidirectional interaction (click, filter, search)
- Graph node count threshold (200 max, top by weight)
- Migrate existing Research tab features into sidebar (URL import, watch matches, extraction trigger)

### Phase 1b — Note Integration
- Add `origin` field to edge and mention records
- Add `"note"` to `VALID_ENTITY_TYPES`
- Note extraction pipeline (LLM-based, triggered per-note on save)
- Note nodes in graph (rounded rect, outlined)
- Edge weight rendering based on origin type (note edges thicker)

### Phase 2 — Highlight Integration
- Highlight entity matching (no LLM, inline on save)
- Highlight-boosted mention weight (node sizing)
- "My links" / "Notes" layer toggles in sidebar

### Phase 3 — Polish
- Podcast/social entity extraction
- Graph clustering for >200 nodes (viewport culling, semantic grouping)
- Popover anchoring refinements
- Graph animation and transition polish

### Not in scope
- Contextual mini-graphs in article view (separate spec if desired)
- Full-text search within the graph
- Entity merging UI (name normalization handles most cases; known gaps accepted)
- Export/share graph
