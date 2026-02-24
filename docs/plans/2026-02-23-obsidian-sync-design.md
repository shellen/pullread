# Obsidian Sync & Portable Annotations Design

## Problem

PullRead stores annotations (highlights, notes, tags, favorites) in monolithic JSON files under `~/.config/pullread/`, disconnected from the article markdown files. This creates two problems:

1. **No portability.** A future iOS companion app can't access annotations without a separate sync mechanism. If the article folder lives in iCloud/Dropbox, annotations don't travel with it.
2. **No Obsidian integration.** Obsidian users can point a vault at the PullRead folder, but they only see raw articles — no highlights, tags, favorites, or reading metadata.

## Solution

Two complementary changes that solve both problems:

### 1. Portable Annotation Storage (`.annot.json` sidecars)

Move highlights, notes, tags, and favorites out of centralized JSON files and into per-article sidecar files stored alongside the markdown.

**Before:**
```
~/.config/pullread/highlights.json   ← one giant file, all articles
~/.config/pullread/notes.json        ← one giant file, all articles

~/Documents/PullRead/2024/01/article-title.md
```

**After:**
```
~/Documents/PullRead/2024/01/article-title.md
~/Documents/PullRead/2024/01/article-title.annot.json
```

**Sidecar format:**
```json
{
  "highlights": [
    {
      "id": "h3a7b2c1",
      "text": "Selected text from article",
      "color": "yellow",
      "note": "My thought about this passage",
      "contextBefore": "30 chars before...",
      "contextAfter": "30 chars after...",
      "createdAt": "2024-01-29T19:05:18Z"
    }
  ],
  "articleNote": "Overall notes about this article",
  "tags": ["philosophy", "ai"],
  "machineTags": ["technology", "ethics"],
  "isFavorite": true
}
```

**Why sidecars instead of embedding in markdown:**
- Article markdown stays clean and readable
- JSON is easy to parse from any platform (iOS/Swift, TypeScript, Python)
- No risk of corrupting article content during annotation writes
- Merge conflicts are per-article, not one giant blob
- Obsidian ignores non-markdown files

**Migration:** One-time migration splits `highlights.json` and `notes.json` into per-article `.annot.json` files. Old files kept as backup.

### 2. Notebook Notes as Individual Files

Each notebook note becomes its own markdown file in `notebooks/`, replacing the centralized `notebooks.json`.

```
~/Documents/PullRead/notebooks/my-synthesis-note.md
```

```yaml
---
id: note-abc123def456
sourceArticle: 2024-01-29-article-title.md
createdAt: 2024-01-29T19:05:18Z
updatedAt: 2024-02-23T10:30:00Z
---

The actual note content here...
```

**Why individual files:**
- Each note independently editable on any device
- iCloud/Dropbox sync is file-level — smaller files = fewer conflicts
- Obsidian reads them natively
- Wikilinks work in both PullRead and Obsidian

### 3. Obsidian-Aware Output

When the PullRead output folder is inside an Obsidian vault, articles are written with enriched frontmatter that Obsidian and Dataview can query natively.

**Vault structure:**
```
~/Obsidian/MyVault/
├── .obsidian/              ← Obsidian config
├── projects/               ← User's existing notes
├── daily/                  ← User's daily notes
└── reading/                ← PullRead output path
    ├── articles/
    │   ├── article-title.md
    │   └── article-title.annot.json
    ├── highlights/
    │   └── h-article-title-1.md
    ├── notes/
    │   └── my-synthesis-note.md
    └── reading-log.md
```

**Enriched article frontmatter** (Obsidian-standard property names):
```yaml
---
title: "The Future of AI Regulation"
url: https://example.com/article
author: "Jane Smith"
domain: example.com
feed: tech-newsletter
bookmarked: 2024-01-29
tags: [ai, regulation, policy]
favorite: true
has_highlights: true
read: true
pullread_source: 2024/01/2024-01-29-the-future-of-ai-regulation.md
---
```

**Highlight notes** (one per highlight, in `highlights/`):
```yaml
---
source: "[[The Future of AI Regulation]]"
color: yellow
created: 2024-01-29
---

> Selected text from the article

My note about this passage.
```

**Reading log** (`reading-log.md`, single rolling file, newest first):
```markdown
# Reading Log

## 2024-02-23
- [[The Future of AI Regulation]] — *example.com* ⭐
- [[How RSS Still Works]] — *technews.org*

## 2024-02-22
- [[Building a Menu Bar App]] — *swiftblog.dev*
```

**Content preservation:** Articles include a `<!-- pullread-end -->` marker. Anything the user adds below it survives re-sync. Frontmatter is always updated. Body above the marker is PullRead's.

## What We Don't Build

- No separate sync CLI command — PullRead writes directly to the vault subfolder
- No Obsidian plugin — everything works via standard markdown + frontmatter
- No bidirectional sync — the vault is PullRead's output, not an input
- No property mapping configuration — we use Obsidian-standard names
- No daily note integration — the reading log is standalone (users can link to it from their daily notes)

## Architecture Notes

- The `.annot.json` sidecar format is the shared contract between macOS app, iOS companion app, and Obsidian export
- Highlight extraction to separate note files is an Obsidian-specific feature, controlled by a setting (default off unless vault detected)
- The reading log is append-only, never rewritten
- Articles are identified by filename (slug), which is deterministic from title + date
