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

## Scheduled Execution

An AppleScript application runs PullRead on a schedule using macOS's built-in idle handler.

### AppleScript: PullRead Scheduler

Location: `scripts/PullReadScheduler.scpt` (compile to `.app` for use)

```applescript
-- PullRead Scheduler
-- Runs pullread sync every 30 minutes while the app is open

property syncInterval : 30 * 60 -- 30 minutes in seconds
property pullreadPath : "/Users/shellen/Documents/Claude Stuff/pullread"

on run
    syncNow()
end run

on idle
    syncNow()
    return syncInterval
end idle

on syncNow()
    try
        do shell script "cd " & quoted form of pullreadPath & " && /usr/local/bin/npx ts-node src/index.ts sync 2>&1 >> /tmp/pullread.log"
    on error errMsg
        -- Log errors but don't crash
        do shell script "echo " & quoted form of ("Error: " & errMsg) & " >> /tmp/pullread.log"
    end try
end syncNow

on quit
    continue quit
end quit
```

### Usage

1. Open in Script Editor, export as Application (File → Export → File Format: Application)
2. Check "Stay open after run handler"
3. Add to Login Items (System Preferences → Users & Groups → Login Items) for auto-start
4. Logs written to `/tmp/pullread.log`

### Alternative: launchd

For headless operation, use a launchd plist instead:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.shellen.pullread</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npx</string>
        <string>ts-node</string>
        <string>/Users/shellen/Documents/Claude Stuff/pullread/src/index.ts</string>
        <string>sync</string>
    </array>
    <key>StartInterval</key>
    <integer>1800</integer>
    <key>StandardOutPath</key>
    <string>/tmp/pullread.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/pullread.log</string>
    <key>WorkingDirectory</key>
    <string>/Users/shellen/Documents/Claude Stuff/pullread</string>
</dict>
</plist>
```

Save to `~/Library/LaunchAgents/com.shellen.pullread.plist` and load with:
```bash
launchctl load ~/Library/LaunchAgents/com.shellen.pullread.plist
```
