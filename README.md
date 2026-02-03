# PullRead

**Sync RSS and Atom feeds to clean markdown files for offline reading and archival.**

PullRead fetches entries from your RSS/Atom feeds, extracts article content using Mozilla's Readability algorithm, and saves them as beautifully formatted markdown files with YAML frontmatter. Perfect for syncing bookmarks, blogs, and podcasts to your local markdown library.

---

## Download

**[Download the latest release](https://github.com/shellen/pullread/releases/latest)**

| Platform | Download | Notes |
|----------|----------|-------|
| **macOS** | [PullReadTray.dmg](https://github.com/shellen/pullread/releases/latest/download/PullReadTray.dmg) | Menu bar app for one-click sync |
| **CLI** | Clone this repo | Works on macOS, Linux, Windows |

> **Quick install:** Download the DMG, open it, drag PullReadTray to your Applications folder, and launch it. The app will guide you through setup on first run.

---

## Table of Contents

- [Download](#download)
- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Supported Feed Formats](#supported-feed-formats)
- [Output Format](#output-format)
- [macOS Menu Bar App](#macos-menu-bar-app)
- [Scheduling](#scheduling)
- [Architecture](#architecture)
- [Development](#development)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Room for Improvement](#room-for-improvement)
- [Future Ideas](#future-ideas)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Multi-format feed support** - Atom, RSS, and podcast feeds with automatic detection
- **Clean article extraction** - Uses Mozilla's Readability algorithm (same as Firefox Reader View)
- **Markdown output** - Converts HTML to clean, readable markdown with YAML frontmatter
- **Intelligent deduplication** - SQLite database tracks processed URLs to avoid re-fetching
- **Retry mechanism** - Failed extractions are tracked and can be retried later
- **Podcast support** - Saves episode metadata with audio links (perfect for show notes)
- **macOS menu bar app** - Native Swift app for one-click sync with notifications
- **Flexible scheduling** - Run on-demand, via launchd, or with AppleScript
- **Cloud-sync friendly** - Output folder can be Dropbox, iCloud, Google Drive, etc.

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/shellen/pullread.git
cd pullread
npm install

# Configure your feeds
cp feeds.json.example feeds.json
# Edit feeds.json with your feed URLs and output path

# Run your first sync
npm run sync
```

---

## Installation

### Prerequisites

- **Node.js** 16 or higher
- **npm** (comes with Node.js)
- **macOS** 11+ (for the menu bar app)
- **Xcode** 15.2+ (only if building the menu bar app from source)

### CLI Installation

```bash
# Clone the repository
git clone https://github.com/shellen/pullread.git
cd pullread

# Install dependencies
npm install

# Verify installation
npm run sync -- --help
```

### macOS Menu Bar App

**Option A: Download Release (Recommended)**

1. Download `PullReadTray.dmg` from [GitHub Releases](https://github.com/shellen/pullread/releases)
2. Open the DMG and drag PullReadTray to Applications
3. Launch PullReadTray from Applications
4. (Optional) Add to Login Items for auto-start

**Option B: Build from Source**

```bash
cd PullReadTray
xcodebuild -project PullReadTray.xcodeproj \
  -scheme PullReadTray \
  -configuration Release \
  -derivedDataPath build \
  build

# App bundle location:
# build/Build/Products/Release/PullReadTray.app
```

---

## Configuration

Create your configuration file:

```bash
cp feeds.json.example feeds.json
```

Edit `feeds.json`:

```json
{
  "outputPath": "~/Dropbox/Articles",
  "feeds": {
    "bookmarks": "https://example.com/user/bookmarks/feed.xml",
    "instapaper": "https://www.instapaper.com/rss/YOUR_ID/...",
    "hn-favorites": "https://hnrss.org/favorites?id=YOUR_USERNAME",
    "podcasts": "https://anchor.fm/s/YOUR_SHOW/podcast/rss"
  }
}
```

### Configuration Options

| Field | Description | Example |
|-------|-------------|---------|
| `outputPath` | Where to save markdown files (supports `~`) | `~/Documents/Articles` |
| `feeds` | Map of feed names to URLs | See above |

### Feed Names

The keys in the `feeds` object (e.g., `bookmarks`, `instapaper`) are used for:
- The `feed` field in frontmatter metadata
- Filtering with `--feed` flag
- Logging and error messages

### Popular Feed Sources

| Service | Feed URL Format |
|---------|-----------------|
| Instapaper | `https://www.instapaper.com/rss/YOUR_FOLDER_ID/YOUR_USER_ID` |
| Pinboard | `https://feeds.pinboard.in/rss/u:USERNAME/` |
| Pocket | Requires IFTTT or Zapier integration |
| Hacker News | `https://hnrss.org/favorites?id=USERNAME` |
| Raindrop.io | `https://raindrop.io/collection/COLLECTION_ID/feed` |
| Feedbin | Available in settings |

---

## Usage

### Basic Commands

```bash
# Sync all configured feeds
npm run sync

# Sync a specific feed only
npm run sync -- --feed bookmarks

# Retry previously failed URLs
npm run sync:retry
# or
npm run sync -- --retry-failed

# Combine flags
npm run sync -- --feed instapaper --retry-failed
```

### What Happens During Sync

1. **Load configuration** from `feeds.json`
2. **Fetch each feed** and auto-detect format (RSS vs Atom)
3. **Check database** to skip already-processed URLs
4. **For articles**: Fetch the page, extract content with Readability, convert to markdown
5. **For podcasts**: Save episode metadata (title, description, audio link)
6. **Record results** in SQLite (success or failure with error message)

### Verbosity

The CLI provides clear progress output:

```
[bookmarks] Fetching feed...
[bookmarks] Found 15 entries, 3 new
[bookmarks] Processing: How to Write Better Code
[bookmarks] Saved: 2024-01-29-how-to-write-better-code.md
[bookmarks] Processing: The Future of AI
[bookmarks] Error: Failed to fetch content (timeout)
[bookmarks] Saved to failed list, use --retry-failed later
```

---

## Supported Feed Formats

### Atom Feeds

Common for bookmark services, GitHub, and modern blogs.

```xml
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Article Title</title>
    <link href="https://example.com/article"/>
    <updated>2024-01-29T19:05:18Z</updated>
    <content>Optional annotation or summary</content>
  </entry>
</feed>
```

### RSS Feeds

Traditional format used by Instapaper, Pinboard, most podcasts, and blogs.

```xml
<rss version="2.0">
  <channel>
    <item>
      <title>Article Title</title>
      <link>https://example.com/article</link>
      <pubDate>Mon, 29 Jan 2024 19:05:18 GMT</pubDate>
      <description>Summary or annotation</description>
    </item>
  </channel>
</rss>
```

### Podcast Feeds

RSS feeds with `<enclosure>` tags for audio files.

```xml
<item>
  <title>Episode 42: The Answer</title>
  <link>https://podcast.com/ep42</link>
  <enclosure url="https://cdn.com/ep42.mp3" type="audio/mpeg" length="12345678"/>
  <itunes:duration>00:45:30</itunes:duration>
</item>
```

---

## Output Format

### Article Example

Saved as `2024-01-29-article-title.md`:

```markdown
---
title: "Article Title"
url: https://example.com/article
bookmarked: 2024-01-29T19:05:18Z
domain: example.com
feed: bookmarks
annotation: "Your note from the bookmark service"
---

# Article Title

[Clean article content extracted by Readability, converted to markdown...]

The extracted content preserves:
- Headings and structure
- Links and images
- Code blocks
- Lists and tables
```

### Podcast Episode Example

```markdown
---
title: "Episode 42: The Answer to Everything"
url: https://podcast.com/ep42
bookmarked: 2024-01-29T19:05:18Z
domain: podcast.com
feed: podcasts
enclosure:
  url: https://cdn.com/ep42.mp3
  type: audio/mpeg
  duration: "00:45:30"
---

# Episode 42: The Answer to Everything

[Episode description/show notes from the feed...]
```

### Filename Convention

Files are named using this pattern:
- **Date prefix**: `YYYY-MM-DD-` from the bookmark/publish date
- **Slugified title**: Lowercase, special characters replaced with hyphens
- **Length limit**: Truncated to ~70 characters for filesystem compatibility
- **Auto-cleanup**: `[Private]` prefixes removed, consecutive hyphens collapsed

Examples:
- `2024-01-29-how-to-write-better-typescript.md`
- `2024-01-28-the-case-for-functional-programming.md`
- `2024-01-27-episode-42-the-answer-to-everything.md`

---

## macOS Menu Bar App

PullReadTray is a native Swift menu bar application that provides a convenient GUI for PullRead.

### Menu Structure

```
┌────────────────────────┐
│ Status: Idle           │  ← Current sync state
│ Last sync: 2:34 PM     │  ← Time of last sync
├────────────────────────┤
│ Sync Now          ⌘S   │  → Runs npm run sync
│ Retry Failed      ⌘R   │  → Retries failed URLs
├────────────────────────┤
│ Open Output Folder ⌘O  │  → Opens your Articles folder
│ Edit Configuration ⌘,  │  → Opens feeds.json
│ View Logs...      ⌘L   │  → Opens sync log
├────────────────────────┤
│ About PullRead         │
│ Quit PullRead     ⌘Q   │
└────────────────────────┘
```

### Features

- **Status indicator** showing idle/syncing state
- **Icon animation** during sync operations
- **Native notifications** on sync completion or failure
- **Keyboard shortcuts** for common actions
- **Automatic Node.js detection** on launch
- **No dock icon** - runs quietly in the menu bar

### Auto-Start on Login

**Via System Preferences:**
1. Open System Preferences > Users & Groups
2. Select your user, then "Login Items"
3. Click + and add PullReadTray.app

**Via command line:**
```bash
osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/PullReadTray.app", hidden:false}'
```

---

## Scheduling

### Option 1: launchd (Recommended)

Create a plist at `~/Library/LaunchAgents/com.pullread.sync.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.pullread.sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npm</string>
        <string>run</string>
        <string>sync</string>
    </array>
    <key>StartInterval</key>
    <integer>1800</integer>
    <key>WorkingDirectory</key>
    <string>/path/to/pullread</string>
    <key>StandardOutPath</key>
    <string>/tmp/pullread.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/pullread.log</string>
</dict>
</plist>
```

Load it:
```bash
launchctl load ~/Library/LaunchAgents/com.pullread.sync.plist
```

### Option 2: cron

```bash
# Edit crontab
crontab -e

# Add line for every 30 minutes
*/30 * * * * cd /path/to/pullread && /usr/local/bin/npm run sync >> /tmp/pullread.log 2>&1
```

### Option 3: AppleScript (for idle-based sync)

See `scripts/PullReadScheduler.applescript` for an idle-based scheduler that runs when your Mac has been idle for a set period.

---

## Architecture

### Project Structure

```
pullread/
├── src/                           # TypeScript CLI source
│   ├── index.ts                   # CLI entry point, orchestration
│   ├── feed.ts                    # RSS/Atom parsing (auto-detects format)
│   ├── extractor.ts               # Article extraction with Readability
│   ├── writer.ts                  # Markdown generation with frontmatter
│   ├── storage.ts                 # SQLite database operations
│   └── *.test.ts                  # Unit tests
│
├── PullReadTray/                  # macOS menu bar app (Swift)
│   ├── PullReadTray/
│   │   ├── PullReadTrayApp.swift  # SwiftUI entry point
│   │   ├── AppDelegate.swift      # Menu bar setup, notifications
│   │   └── SyncService.swift      # Process execution layer
│   ├── PullReadTrayTests/         # XCTest unit tests
│   └── PullReadTrayUITests/       # XCTest UI tests
│
├── scripts/                       # Scheduler scripts
├── docs/plans/                    # Design documentation
├── data/                          # SQLite database (gitignored)
├── feeds.json                     # Your configuration (gitignored)
└── feeds.json.example             # Configuration template
```

### Data Flow

```
feeds.json
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                       index.ts (CLI)                        │
├─────────────────────────────────────────────────────────────┤
│  1. Load config     2. For each feed:                       │
│                        │                                    │
│                        ▼                                    │
│                   ┌─────────┐                               │
│                   │ feed.ts │ ← Fetch & parse RSS/Atom      │
│                   └────┬────┘                               │
│                        │                                    │
│                        ▼                                    │
│                  ┌───────────┐                              │
│                  │storage.ts │ ← Check if URL processed     │
│                  └─────┬─────┘                              │
│                        │ (new URLs only)                    │
│                        ▼                                    │
│                 ┌─────────────┐                             │
│                 │extractor.ts │ ← Fetch page, Readability   │
│                 └──────┬──────┘                             │
│                        │                                    │
│                        ▼                                    │
│                  ┌──────────┐                               │
│                  │writer.ts │ ← Generate markdown file      │
│                  └──────────┘                               │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
               ~/Dropbox/Articles/
               └── 2024-01-29-article-title.md
```

### Database Schema

```sql
CREATE TABLE processed (
  url TEXT PRIMARY KEY,
  title TEXT,
  bookmarked_at TEXT,
  processed_at TEXT,
  status TEXT DEFAULT 'success',  -- 'success' or 'failed'
  error TEXT,                      -- error message if failed
  output_file TEXT,                -- path to saved markdown
  feed TEXT                        -- source feed name
);
```

---

## Development

### Setup

```bash
git clone https://github.com/shellen/pullread.git
cd pullread
npm install
```

### Running in Development

```bash
# Run with ts-node (no compilation needed)
npm run sync

# Or compile and run
npx tsc
node dist/index.js sync
```

### Code Style

- TypeScript with strict mode enabled
- ES2022 target
- Functional approach where practical
- Minimal dependencies

### Key Dependencies

| Package | Purpose |
|---------|---------|
| `fast-xml-parser` | RSS/Atom feed parsing |
| `@mozilla/readability` | Article content extraction |
| `jsdom` | DOM simulation for Readability |
| `turndown` | HTML to Markdown conversion |
| `better-sqlite3` | Persistent URL tracking |

---

## Testing

### Run All Tests

```bash
npm test
```

### Test Coverage

The test suite covers:

- **Feed parsing** (`feed.test.ts`)
  - Atom feed detection and parsing
  - RSS feed detection and parsing
  - Podcast feeds with enclosures
  - CDATA sections and HTML entities

- **Content extraction** (`extractor.test.ts`)
  - Readability algorithm
  - HTML to Markdown conversion
  - Edge cases (empty content, timeouts)

- **Markdown generation** (`writer.test.ts`)
  - Frontmatter generation
  - Filename slugification
  - Special character handling

- **Database operations** (`storage.test.ts`)
  - URL tracking
  - Status updates
  - Failure recording

### macOS App Tests

```bash
cd PullReadTray
xcodebuild test \
  -project PullReadTray.xcodeproj \
  -scheme PullReadTray \
  -destination 'platform=macOS'
```

---

## Troubleshooting

### Common Issues

**"Cannot find module" errors**
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

**"Node.js Not Found" (macOS app)**
```bash
# Install Node.js via Homebrew
brew install node

# Or download from https://nodejs.org
```

**Feed returns 403/401 errors**
- Some feeds require authentication
- Check if the feed URL requires a logged-in session
- Try accessing the URL in a browser first

**Articles have no content**
- Some sites block scraping (paywalls, bot detection)
- Readability may fail on non-article pages
- Check the `--retry-failed` output for specific errors

**Database is corrupted**
```bash
# Reset the database (will re-fetch all articles)
rm data/pullread.db
npm run sync
```

### Viewing Logs

```bash
# CLI output is printed to terminal

# macOS app logs
tail -f /tmp/pullread.log

# View in Console.app
# Filter by "PullRead"
```

---

## Room for Improvement

This project works well for its intended purpose, but there are several areas that could be enhanced:

### Code Quality

- **Add ESLint/Prettier** - The codebase currently lacks linting configuration. Adding ESLint with TypeScript support and Prettier for formatting would improve code consistency.

- **Increase type safety** - Some areas use `any` types that could be more strictly typed, particularly in the feed parsing logic where the XML structure varies.

- **Error handling refinement** - While errors are caught and logged, the error types could be more specific (network errors vs parsing errors vs extraction errors) to enable smarter retry logic.

### Functionality

- **Parallel fetching** - Currently processes feeds sequentially. Could use `Promise.all` with concurrency limits for faster syncs with many feeds.

- **Configurable extraction** - Some sites work better with custom extraction rules. A `siteRules.json` for site-specific selectors would help.

- **Incremental sync** - The feed is re-fetched entirely each time. Supporting `If-Modified-Since` headers would reduce bandwidth.

- **Content caching** - Store extracted content in SQLite to enable re-generating markdown without re-fetching.

### User Experience

- **Progress indicators** - Long syncs could benefit from a progress bar or percentage indicator.

- **Configuration validation** - Validate `feeds.json` on load and provide helpful error messages for common mistakes.

- **Interactive mode** - A `--dry-run` flag to preview what would be synced without actually processing.

### Documentation

- **JSDoc comments** - Add documentation comments to public functions for better IDE support.

- **Architecture diagram** - A visual diagram showing the data flow would help new contributors.

- **Example outputs** - Include sample markdown files in the repo to show expected output.

---

## Future Ideas

Ideas that would extend PullRead's capabilities:

### Near-term

- **Browser extension** - "Send to PullRead" button that adds URLs directly to a local feed
- **Web interface** - Simple local web UI to browse synced articles
- **Tags/categories** - Support for preserving tags from bookmark services
- **Full-text search** - Index markdown content for quick searching

### Medium-term

- **Multi-platform tray app** - Electron or Tauri version for Windows/Linux
- **Kindle/epub export** - Convert markdown collection to ebook format
- **Reading statistics** - Track which articles have been read (via modification date)
- **Webhook support** - Trigger sync via webhook for real-time updates

### Long-term

- **Self-hosted option** - Run as a service with web interface
- **Sync to Obsidian/Notion** - Direct integration with note-taking apps
- **AI summarization** - Generate summaries for long articles
- **Recommendations** - Suggest similar articles based on reading history

### Platform Expansion

- **iOS companion app** - View synced articles with iCloud sync
- **Alfred/Raycast extension** - Quick actions for macOS power users
- **CLI improvements** - Interactive selection of articles to sync

---

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/my-feature`
3. **Make your changes**
4. **Run tests**: `npm test`
5. **Commit with clear messages**: `git commit -m "Add feature X"`
6. **Push to your fork**: `git push origin feature/my-feature`
7. **Open a Pull Request**

### Development Guidelines

- Write tests for new functionality
- Keep commits focused and atomic
- Update documentation for user-facing changes
- Follow existing code style

### Areas Seeking Contributions

- Windows/Linux scheduling scripts
- Additional feed format support (JSON Feed)
- Site-specific extraction rules
- Documentation improvements
- Test coverage expansion

---

## License

ISC License

---

## Acknowledgments

- [Mozilla Readability](https://github.com/mozilla/readability) - The excellent article extraction algorithm
- [Turndown](https://github.com/mixmark-io/turndown) - HTML to Markdown conversion
- [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) - Fast and reliable XML parsing
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - The best SQLite library for Node.js

---

**Made with care for anyone who wants to own their reading list.**
