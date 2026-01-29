# PullRead Design

A TypeScript CLI that syncs RSS and Atom feeds to markdown files.

## Overview

PullRead fetches entries from multiple feeds (bookmarks, link blogs, podcasts), extracts article content using Mozilla Readability, and saves clean markdown files to a local folder (which can be synced via Dropbox/Drive).

Supports:
- **Atom feeds** - Common for bookmark services and blogs
- **RSS feeds** - Instapaper, Pinboard, podcasts, and most blogs
- **Podcast feeds** - Saves episode metadata with audio link (no download)

## Core Flow

```
feeds.json → for each feed:
                fetch → detect type (RSS/Atom) → parse entries
                                    ↓
                          SQLite tracks processed URLs
                                    ↓
                     for new entries: extract content → save as .md
```

Running `pullread sync`:
1. Loads feed URLs from `feeds.json`
2. For each feed: fetches and parses (auto-detects RSS vs Atom)
3. Compares entries against SQLite (by URL)
4. For articles: fetches page, extracts with Readability, saves as markdown
5. For podcasts: saves episode metadata with audio link (no extraction)
6. Records each URL as processed

## File Structure

```
pullread/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── feed.ts           # Fetch and parse RSS/Atom feeds
│   ├── extractor.ts      # Readability + JSDOM article extraction
│   ├── storage.ts        # SQLite operations (track processed URLs)
│   └── writer.ts         # Markdown file generation
├── data/
│   └── pullread.db       # SQLite database (gitignored)
├── feeds.json            # Feed configuration (gitignored)
├── feeds.json.example    # Example configuration
├── package.json
├── tsconfig.json
└── .env                  # Output path config
```

## Configuration

### feeds.json

```json
{
  "bookmarks": "https://example.com/user/bookmarks/feed.xml",
  "instapaper": "https://instapaper.com/rss/...",
  "podcasts": "https://anchor.fm/s/.../podcast/rss"
}
```

Keys become the `feed` field in frontmatter and are used for logging.

### Environment variables (.env)

```
OUTPUT_PATH=~/Dropbox/Articles
```

## CLI Usage

```bash
# Sync all feeds
npm run sync

# Sync a specific feed
npm run sync -- --feed bookmarks

# Retry previously failed URLs
npm run sync -- --retry-failed
```

## Feed Parsing

### Auto-detection

```typescript
function detectFeedType(xml: string): 'atom' | 'rss' {
  if (parsed.feed) return 'atom';
  if (parsed.rss) return 'rss';
  throw new Error('Unknown feed format');
}
```

### Unified Entry Interface

```typescript
interface FeedEntry {
  title: string;
  url: string;
  updatedAt: string;
  domain: string;
  annotation?: string;
  enclosure?: {
    url: string;
    type: string;    // e.g., "audio/mpeg"
    length?: number;
    duration?: string;
  };
}
```

### RSS vs Atom Mapping

| Field | Atom | RSS |
|-------|------|-----|
| title | `<title>` | `<title>` |
| url | `<link href="...">` | `<link>` (text) |
| date | `<updated>` | `<pubDate>` |
| content | `<content>` | `<description>` |
| enclosure | — | `<enclosure>` |

## Markdown Output Format

### Article

```markdown
---
title: "Article Title Here"
url: https://example.com/article
bookmarked: 2024-01-29T19:05:18Z
domain: example.com
feed: bookmarks
annotation: "Your note, if any"
---

# Article Title Here

[Article content extracted by Readability, converted to markdown...]
```

### Podcast Episode

```markdown
---
title: "Episode Title"
url: https://podcast.com/episode
bookmarked: 2024-01-29T19:05:18Z
domain: podcast.com
feed: podcasts
enclosure:
  url: https://cdn.com/episode.mp3
  type: audio/mpeg
  duration: "00:34:55"
---

# Episode Title

[Episode description from feed...]
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
  }
}
```

## Error Handling

- **Log and skip** failed extractions, move on to next entry
- **Track failures in SQLite** with a `status` column to avoid retrying every run
- **`--retry-failed` flag** to re-attempt previously failed URLs
- **Per-feed errors** don't stop other feeds from syncing

## SQLite Schema

```sql
CREATE TABLE processed (
  url TEXT PRIMARY KEY,
  title TEXT,
  bookmarked_at TEXT,
  processed_at TEXT,
  status TEXT DEFAULT 'success',  -- 'success' or 'failed'
  error TEXT,                      -- error message if failed
  output_file TEXT,                -- path to saved markdown file
  feed TEXT                        -- source feed name
);
```

## Scheduled Execution

An AppleScript application or launchd plist can run PullRead on a schedule.

### launchd (recommended)

Save to `~/Library/LaunchAgents/com.pullread.sync.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.pullread.sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npx</string>
        <string>ts-node</string>
        <string>/path/to/pullread/src/index.ts</string>
        <string>sync</string>
    </array>
    <key>StartInterval</key>
    <integer>1800</integer>
    <key>StandardOutPath</key>
    <string>/tmp/pullread.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/pullread.log</string>
    <key>WorkingDirectory</key>
    <string>/path/to/pullread</string>
</dict>
</plist>
```

Load with:
```bash
launchctl load ~/Library/LaunchAgents/com.pullread.sync.plist
```
