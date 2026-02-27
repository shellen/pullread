# Knowledge Graph Explorer Design

## Goal

Add knowledge graph exploration to PullRead in three incremental phases: related reading discovery, interactive visualization, and enhanced typed entity extraction.

Primary use cases:
- **See the big picture** — visual map of reading coverage, clusters, gaps, dominant themes
- **Find related reading** — from any article, surface related articles based on entity/topic overlap

## Existing Data Assets

| Data | Source | Location |
|------|--------|----------|
| Machine tags (3-8 per article) | LLM autotagger | `*.annot.json` sidecar |
| Feed categories | RSS/Atom feeds | Markdown frontmatter |
| User tags | Manual tagging | `*.annot.json` sidecar |
| Feed name | Config | Markdown frontmatter |
| Domain | URL extraction | Markdown frontmatter |
| Author | Feed/Readability | Markdown frontmatter |
| Timestamps | Feed/bookmark time | Markdown frontmatter |

Machine tags are the strongest relationship signal — LLM-extracted entities and topics, normalized (lowercase, no spaces). Articles sharing machine tags are implicitly connected.

## Key Data Gaps

- **No entity type distinction** — "openai" (company) and "regulation" (theme) look the same
- **No co-occurrence index** — which tags appear together and how often
- **No relationship weights** — two articles sharing 5 tags vs 1 tag are undifferentiated
- **No cross-article summarization** — "here's what your feed says about topic X"

---

## Phase 1: Related Articles + Topic Exploration

### Data computation (client-side, on load)

1. **Article similarity** — Jaccard similarity on machine tags. Use an inverted index (tag → article list) to avoid O(n²). Only store pairs above threshold (~0.25, roughly 2+ shared tags out of 6-8).

2. **Tag frequency index** — article count per machine tag. Powers "trending topics."

3. **Tag co-occurrence** — which tags appear together frequently. Powers "related topics" suggestions.

### UI additions

- **Article detail view (bottom):** "Related Reading" — 3-5 most similar articles with shared tags as chips. Only shown if similarity > threshold.
- **Home tab:** "Your Topics" — top 10-15 machine tags by frequency as clickable chips. Clicking filters via existing `tag:` search.
- **Explore tab:** "Topic Clusters" — groups of 3+ articles sharing 2+ machine tags, shown as expandable cards with shared tags and article titles.

### Validates

- Are machine tags consistent enough to produce meaningful relationships?
- Do users find "related" suggestions useful?
- Is client-side computation fast enough at current article volume?

---

## Phase 2: Interactive Visualization

### Visualization: force-directed cluster graph

Machine tags form a natural bipartite graph (articles ↔ tags). Force layout handles this natively — clusters emerge from shared tags without pre-computed clustering.

### Graph structure

- **Tag nodes** — smaller colored circles, one per unique machine tag
- **Article nodes** — larger circles (domain favicon or thumbnail)
- **Edges** — article-to-tag connections

Force simulation pulls articles with shared tags close together, forming visible clusters.

### Interaction model

- **Hover tag** → highlight connected articles, dim everything else
- **Hover article** → highlight its tags and co-connected articles
- **Click tag** → filter article list via `tag:` search
- **Click article** → open in reader panel
- **Zoom/pan** — standard d3-zoom
- **Search** → dim non-matching nodes

### Technical approach

- **d3-force** — no framework dependency, embeds in single-file viewer
- New section in Explore, or toggleable "List" / "Graph" view mode
- Simulation runs on load, settles, no continuous animation
- Canvas-based rendering if SVG gets sluggish past ~500 nodes

### Validates

- Is the graph more useful than Phase 1 lists, or just prettier?
- Can users navigate intuitively or do they fall back to search?
- What entity types do users wish they could distinguish?

---

## Phase 3: Enhanced Tagging + Typed Entities

### Autotagger upgrade

Change LLM output from flat array to structured entities:

```json
{
  "entities": [
    {"name": "openai", "type": "company"},
    {"name": "samaltman", "type": "person"},
    {"name": "artificialintelligence", "type": "topic"},
    {"name": "gpt5", "type": "technology"},
    {"name": "regulation", "type": "theme"}
  ]
}
```

Fixed type set: `person`, `company`, `technology`, `topic`, `theme`, `place`.

### Storage

Add `machineEntities` alongside existing `machineTags` in annotation sidecar:

```json
{
  "machineTags": ["openai", "samaltman", "regulation"],
  "machineEntities": [
    {"name": "openai", "type": "company"},
    {"name": "samaltman", "type": "person"},
    {"name": "regulation", "type": "theme"}
  ]
}
```

Backward compatible — `machineTags` stays for existing search. Articles without `machineEntities` degrade gracefully.

### What typed entities unlock

- **Graph coloring** — entity types get distinct colors, graph becomes legible at a glance
- **Faceted exploration** — "Show me all people" or "What companies keep appearing?"
- **Smarter relatedness** — sharing a person entity is a stronger signal than sharing a generic topic
- **Entity pages** — click an entity to see every article, connected topics, appearance timeline

### Migration

- New articles get `machineEntities` automatically
- Existing articles: batch re-tag via CLI flag (`--retag`), or lazily on article open
- No forced reprocessing
