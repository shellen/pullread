# PullRead Design

A TypeScript CLI that syncs Drafty bookmarks to markdown files.

## Overview

PullRead fetches an Atom feed of bookmarks, extracts article content using Mozilla Readability, and saves clean markdown files to a local folder (which can be synced via Dropbox/Drive).

## Core Flow

```
Drafty Atom feed → fetch new entries → extract article content → save as .md
                          ↓
                   SQLite tracks processed URLs
```

Running `pullread sync`:
1. Fetches the Atom feed
2. Compares entries against SQLite (by URL)
3. For new entries: fetches the article, extracts with Readability, saves as markdown
4. Records the URL as processed

## File Structure

```
pullread/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── feed.ts           # Fetch and parse Atom feed
│   ├── extractor.ts      # Readability + JSDOM article extraction
│   ├── storage.ts        # SQLite operations (track processed URLs)
│   └── writer.ts         # Markdown file generation
├── data/
│   └── pullread.db       # SQLite database (gitignored, created at runtime)
├── package.json
├── tsconfig.json
└── .env                  # Feed URL, output path config
```

## Configuration

Environment variables in `.env`:

```
FEED_URL=https://www.drafty.com/@shellen/links/s/.../feed.xml
OUTPUT_PATH=~/Dropbox/Articles
```

## Markdown Output Format

```markdown
---
title: "Article Title Here"
url: https://example.com/article
bookmarked: 2024-01-29T19:05:18Z
domain: example.com
annotation: "Your note from Drafty, if any"
---

# Article Title Here

[Article content extracted by Readability, converted to markdown...]
```

Filename format: `2024-01-29-article-title.md` (date-prefixed, slugified, max ~60 chars)

## Dependencies

```json
{
  "dependencies": {
    "fast-xml-parser": "^4.x",
    "jsdom": "^24.x",
    "@mozilla/readability": "^0.5",
    "better-sqlite3": "^11.x",
    "turndown": "^7.x",
    "dotenv": "^16.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "@types/jsdom": "^21.x",
    "@types/better-sqlite3": "^7.x",
    "@types/turndown": "^5.x"
  }
}
```

## Error Handling

- **Log and skip** failed extractions, move on to next entry
- **Track failures in SQLite** with a `status` column to avoid retrying every run
- **`--retry-failed` flag** to re-attempt previously failed URLs

Paywalled content gets whatever Readability can extract (often the lede). The bookmark URL is preserved for visiting the full article.

## SQLite Schema

```sql
CREATE TABLE processed (
  url TEXT PRIMARY KEY,
  title TEXT,
  bookmarked_at TEXT,
  processed_at TEXT,
  status TEXT DEFAULT 'success',  -- 'success' or 'failed'
  error TEXT,                      -- error message if failed
  output_file TEXT                 -- path to saved markdown file
);
```
