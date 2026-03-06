# Research Tab Design

## Overview

A knowledge dashboard that extracts entities, relationships, and themes from Pull Read articles, Google Drive documents, and on-demand URLs — then presents them as a browsable, searchable knowledge graph within the Pull Read viewer.

Powered by [loxodonta-core](https://github.com/shellen/loxodonta-core), imported as a library (no separate server).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary UX | Knowledge dashboard (graph-centric) | Standalone view for browsing entities and relationships |
| Integration model | Library import, no XRPC server | Avoids running a second process; Pull Read owns the API surface |
| Data sources | Articles + Google Drive + on-demand URLs | Full knowledge coverage from day one |
| LLM for extraction | User's configured Pull Read provider | Zero extra config for the extraction step |
| LLM for embeddings | Gemini (pinned) | Consistent vectors for entity resolution; free-tier embedding API |
| Extraction timing | Background job after sync | Non-blocking; Research tab stays current without manual action |

## Data Layer

A separate SQLite database (`research.db`) in Pull Read's data directory, managed by loxodonta-core's `createPDS()`.

### Collections

| Collection | Purpose |
|------------|---------|
| `app.pullread.entity` | Resolved entities — name, type, aliases |
| `app.pullread.mention` | Links an entity to a source article or document |
| `app.pullread.edge` | Relationships between entities (e.g., "works at", "announced") |
| `app.pullread.extraction` | Tracks which articles have been processed (prevents re-extraction) |
| `app.pullread.googleAuth` | Google Drive OAuth tokens |

The PDS is isolated from Pull Read's article storage. It can be rebuilt from scratch by re-extracting all articles.

## Extraction Pipeline

### Background extraction (after sync)

1. After sync completes, list all article `.md` files
2. Filter out articles already in `app.pullread.extraction` (by filename hash)
3. For each unprocessed article, read the markdown body
4. Send to user's configured LLM with a structured extraction prompt
5. LLM returns JSON: `{ entities, relationships, themes }`
6. Pass entities through loxodonta-core's `createResolver()` — Gemini embeddings, similarity matching merges duplicates
7. Store resolved entities, edges, and mentions in PDS
8. Mark article as extracted

### On-demand URL extraction

User pastes a URL in the Research tab. Pull Read fetches and extracts the page (reusing the existing defuddle pipeline), then runs the same extraction/resolution flow. Source tagged as `url-import`.

### Google Drive extraction

After OAuth, user browses Drive folders in the Research tab. Selecting a file exports it (Google Docs to text, PDFs via content parser) and runs the same extraction flow. Source tagged as `google-drive`.

### Cost considerations

One LLM call per article for extraction. One Gemini embedding call per entity batch for resolution. For a typical sync of 10-50 new articles, this is modest. A "Re-extract all" option in settings supports provider changes.

## API Endpoints

### Graph queries

| Endpoint | Description |
|----------|-------------|
| `GET /api/research/entities` | List entities. Supports `?search=`, `?type=`, `?limit=` |
| `GET /api/research/entity/:rkey` | Entity profile: record, mentions (with article titles), edges |
| `GET /api/research/entity/:rkey/graph` | Traverse from entity. `?depth=1\|2`. Returns nodes + edges |
| `GET /api/research/related/:filename` | Entities mentioned in a specific article |

### Extraction

| Endpoint | Description |
|----------|-------------|
| `POST /api/research/extract-url` | Body `{ url }`. Fetches, extracts, resolves. Returns entities |
| `GET /api/research/status` | Stats: total articles, extracted count, pending, last run time |

### Google Drive

| Endpoint | Description |
|----------|-------------|
| `GET /api/research/drive/auth-url` | Returns OAuth URL |
| `GET /auth/google/callback` | OAuth callback, stores tokens in PDS |
| `GET /api/research/drive/files` | Browse Drive folders. `?folderId=` |
| `POST /api/research/drive/import` | Body `{ fileId }`. Exports, extracts, resolves |
| `DELETE /api/research/drive/disconnect` | Revoke tokens |

### Settings

| Endpoint | Description |
|----------|-------------|
| `GET /api/research/config` | Current state: Drive connected? Gemini key? Extraction enabled? |
| `POST /api/research/reextract` | Clear extraction records, re-process all articles |

## Viewer UI

### Sidebar

"Research" nav item below Notebook. Graph/network Heroicon. Badge shows total entity count.

### Main view — three panels

1. **Entity list** (left): Scrollable, sorted by mention count. Each row: entity name, type badge (person/company/tech/place), mention count. Search bar and type filter chips at top.

2. **Entity detail** (center): Selected entity's name, type, aliases. "Mentioned in" list of clickable articles. "Related entities" list. Aggregated themes.

3. **Graph view** (right or toggle): Visual network of selected entity's connections. Nodes are entities, edges are relationships. Depth toggle (1-2 hops). Implemented as `<pr-research-graph>` WebComponent.

### Additional UI

- **Extract URL button** in toolbar — paste URL, see extraction progress, results appear in entity list
- **Google Drive panel** in Settings — connect/disconnect, browse, import files
- **Extraction progress** — indicator showing "12 of 340 articles extracted" when background job is running

### Style

Consistent with Pull Read: `.article-header h1` for page title, `border-radius: 6px` buttons, Heroicons, CSS variables for dark/light theme, no emoji.

## Dependencies

### New npm dependency

`loxodonta-core` — storage, embeddings, resolver, and graph modules. No server layer imported.

### New configuration

| Setting | Required | Description |
|---------|----------|-------------|
| `GEMINI_API_KEY` | Yes (for Research) | Powers entity embeddings. May share existing Gemini key |
| `GOOGLE_CLIENT_ID` | No | For Drive OAuth. Drive features hidden if not set |
| `GOOGLE_CLIENT_SECRET` | No | For Drive OAuth |
| Research extraction toggle | — | On/off in Settings. Off until Gemini key configured |

Google OAuth uses a registered Pull Read client ID shipped with the app. `drive.readonly` scope.

### Build impact

loxodonta-core is pure JS — no new native modules. googleapis adds bundle size but is tree-shakeable. No impact on Tauri signing/notarization.

## Testing Strategy

- **Unit**: Entity resolution, extraction prompt formatting, graph traversal — all testable against in-memory PDS
- **Integration**: Full pipeline (markdown → extraction → resolution → graph query) with mocked LLM responses but real PDS/embedder
- **Viewer**: API endpoint responses, Research tab rendering
- **Google Drive**: Mock googleapis client, test OAuth flow and import pipeline
