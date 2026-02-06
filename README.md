# PullRead

**Sync RSS and Atom feeds to clean markdown files for offline reading and archival.**

PullRead fetches entries from your RSS/Atom feeds, extracts article content using Mozilla's Readability algorithm, and saves them as beautifully formatted markdown files with YAML frontmatter. Perfect for syncing bookmarks, blogs, and podcasts to your local markdown library.

---

## Download

**[Download the latest release](https://github.com/shellen/pullread/releases/latest)**

| Platform | Download | Notes |
|----------|----------|-------|
| **macOS** | [PullRead.dmg](https://github.com/shellen/pullread/releases/download/latest/PullRead.dmg) | Self-contained menu bar app with bundled CLI |
| **CLI** | Clone this repo | For development or running on Linux/Windows |

> **Quick install:** Download the DMG, open it, drag Pull Read to your Applications folder, and launch it. The app is fully self-contained—no Node.js or other dependencies required. Configure your feeds in Settings and start syncing.

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
- **Intelligent deduplication** - Tracks processed URLs to avoid re-fetching
- **Retry mechanism** - Failed extractions are tracked and can be retried later
- **Podcast support** - Saves episode metadata with audio links (perfect for show notes)
- **Built-in article reader** - Two-pane local web UI with full keyboard navigation (j/k, arrow keys, boundary-aware scrolling)
- **Self-contained macOS app** - Native Swift menu bar app with bundled CLI binary (no Node.js required)
- **Flexible scheduling** - Run on-demand, via launchd, or with AppleScript
- **AI summaries (BYOK)** - On-demand article summarization via Anthropic or OpenAI APIs with your own key
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

**For the macOS menu bar app:**
- **macOS** 11+ (no other dependencies required—the app is self-contained)

**For CLI development:**
- **Node.js** 16 or higher (for development with ts-node)
- **Bun** (optional, for building standalone binaries)
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

1. Download `PullRead.dmg` from [GitHub Releases](https://github.com/shellen/pullread/releases)
2. Open the DMG and drag Pull Read to Applications
3. Launch Pull Read from Applications
4. Open Settings to configure your feeds and output path
5. (Optional) Add to Login Items for auto-start

The app bundles its own CLI binary—no Node.js or npm required.

**Option B: Build from Source**

```bash
# First, build the CLI binary (requires Bun)
npm install
./scripts/build-release.sh

# Then build the Xcode project
cd PullReadTray
xcodebuild -project PullReadTray.xcodeproj \
  -scheme PullReadTray \
  -configuration Release \
  -derivedDataPath build \
  build

# App bundle location:
# build/Build/Products/Release/Pull Read.app
```

---

## Configuration

**For the macOS app:** Open Pull Read's Settings window to configure your feeds and output path. Configuration is stored at `~/.config/pullread/feeds.json`.

**For CLI development:** Create a configuration file in the project directory:

```bash
cp feeds.json.example feeds.json
```

The bundled CLI binary uses `~/.config/pullread/feeds.json` by default, but you can override with `--config-path` and `--data-path` flags.

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

# Summarize articles missing summaries (requires LLM API key)
npm run summarize -- --batch

# Summarize articles over 1000 characters
npm run summarize -- --batch --min-size 1000
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

Pull Read is a self-contained native Swift menu bar application. It bundles the CLI binary, so no external dependencies (Node.js, npm) are required.

### Menu Structure

```
┌────────────────────────┐
│ Status: Idle           │  ← Current sync state
│ Last sync: 2:34 PM     │  ← Time of last sync
├────────────────────────┤
│ Sync Now          ⌘S   │  → Runs the bundled CLI
│ Retry Failed      ⌘R   │  → Retries failed URLs
├────────────────────────┤
│ Open Output Folder ⌘O  │  → Opens your Articles folder
│ View Articles...  ⌘D   │  → Opens the markdown reader
│ Settings          ⌘,   │  → Configure feeds and output path
│ View Logs...      ⌘L   │  → Opens sync log
├────────────────────────┤
│ About PullRead         │
│ Quit PullRead     ⌘Q   │
└────────────────────────┘
```

### Features

- **Self-contained** - Bundled CLI binary, no Node.js required
- **Article reader** - Built-in two-pane markdown viewer via "View Articles..." menu
- **Highlights & notes** - Select text to highlight, add inline annotations, and write article-level notes
- **Resync recovery** - Deleted output files are detected and re-synced automatically
- **Status indicator** showing idle/syncing state
- **Icon animation** during sync operations
- **Native notifications** on sync completion or failure
- **Keyboard shortcuts** for common actions
- **No dock icon** - runs quietly in the menu bar

### Article Reader

The built-in article reader (`pullread view` or **View Articles** in the menu bar app) is a two-pane web UI served on `localhost:7777`. It supports themes (Light, Dark, Sepia), multiple font families, adjustable text sizes, highlights, notes, and full keyboard navigation.

#### Highlights & Notes

Select any text in an article to see a floating toolbar with highlight color options (yellow, green, blue, pink) and an "Add note" button. Click an existing highlight to change its color or delete it.

- **Highlights** are saved per-article at `~/.config/pullread/highlights.json`
- **Notes** are saved per-article at `~/.config/pullread/notes.json`
- **Article-level notes** can be written in a collapsible "Notes" panel at the bottom of each article
- **Inline annotations** attach a note to a specific text passage, shown with a marker icon
- Sidebar items show indicator dots for articles with highlights (yellow) or notes (blue)

#### AI Summaries

PullRead supports on-demand article summarization using your own API key (BYOK — Bring Your Own Key). Summaries are stored directly in each article's YAML frontmatter.

**Setup:**
1. Click the gear icon in the viewer toolbar to open AI Settings
2. Choose a provider (Anthropic or OpenAI)
3. Enter your API key and optionally customize the model
4. Click Save

**Usage:**
- Click the "Summarize" button on any article to generate a summary
- Summaries appear at the top of the article with a purple accent
- Articles with summaries show a purple dot in the sidebar
- Use the CLI for batch summarization: `pullread summarize --batch`

**CLI batch mode:**
```bash
# Summarize all articles missing summaries (over 500 chars)
pullread summarize --batch

# Customize minimum article size
pullread summarize --batch --min-size 1000
```

**Configuration:** LLM settings are stored at `~/.config/pullread/settings.json`:
```json
{
  "llm": {
    "provider": "anthropic",
    "apiKey": "sk-ant-...",
    "model": "claude-sonnet-4-5-20250929"
  }
}
```

Supported providers: **Anthropic** (Claude) and **OpenAI** (GPT). Default models are `claude-sonnet-4-5-20250929` and `gpt-4o-mini` respectively.

#### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `Right Arrow` | Next article |
| `k` / `Left Arrow` | Previous article |
| `Up Arrow` / `Down Arrow` | Scroll content (navigates to prev/next article at top/bottom) |
| `/` | Focus search (opens sidebar if collapsed) |
| `[` | Toggle sidebar |
| `h` | Highlight selected text (yellow) |
| `n` | Toggle article notes panel |
| `Escape` | Clear search / dismiss popover |
| `Enter` | Reload current article |

Arrow key scrolling is boundary-aware: when you reach the bottom of an article and press Down, or the top and press Up, it automatically advances to the next or previous article.

### Auto-Start on Login

**Via System Preferences:**
1. Open System Preferences > Users & Groups
2. Select your user, then "Login Items"
3. Click + and add Pull Read.app

**Via command line:**
```bash
osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/Pull Read.app", hidden:false}'
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
│   ├── viewer.ts                  # Local article reader (HTTP server on port 7777)
│   ├── storage.ts                 # JSON file storage operations
│   ├── summarizer.ts              # BYOK LLM summarization (Anthropic/OpenAI)
│   └── *.test.ts                  # Unit tests
│
├── PullReadTray/                  # macOS menu bar app (Swift)
│   ├── PullReadTray/
│   │   ├── PullReadTrayApp.swift  # SwiftUI entry point
│   │   ├── AppDelegate.swift      # Menu bar setup, notifications
│   │   └── SyncService.swift      # Bundled CLI binary execution
│   ├── PullReadTrayTests/         # XCTest unit tests
│   └── PullReadTrayUITests/       # XCTest UI tests
│
├── scripts/                       # Build and scheduler scripts
│   └── build-release.sh           # Builds universal CLI binary
├── dist/                          # Compiled CLI binaries (gitignored)
├── docs/plans/                    # Design documentation
├── feeds.json                     # Dev configuration (gitignored)
└── feeds.json.example             # Configuration template

~/.config/pullread/                # User config directory (created by app)
├── feeds.json                     # User's feed configuration
├── pullread.json                  # Processed URL tracking database
├── settings.json                  # LLM API key configuration (BYOK)
├── highlights.json                # Article highlights
└── notes.json                     # Article notes and annotations
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

### Storage Format

The processed URL database is stored as a JSON file at `~/.config/pullread/pullread.json`:

```json
{
  "entries": {
    "https://example.com/article": {
      "url": "https://example.com/article",
      "title": "Article Title",
      "bookmarkedAt": "2024-01-29T19:05:18Z",
      "processedAt": "2024-01-29T20:00:00Z",
      "status": "success",
      "outputFile": "~/Dropbox/Articles/2024-01-29-article-title.md"
    },
    "https://example.com/failed-article": {
      "url": "https://example.com/failed-article",
      "processedAt": "2024-01-29T20:01:00Z",
      "status": "failed",
      "error": "Failed to fetch content (timeout)"
    }
  }
}
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

**Build tooling:**
- **Bun** - Used to compile TypeScript to standalone binaries for the macOS app

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

**"Cannot find module" errors (CLI development)**
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

**Feed returns 403/401 errors**
- Some feeds require authentication
- Check if the feed URL requires a logged-in session
- Try accessing the URL in a browser first

**Articles have no content**
- Some sites block scraping (paywalls, bot detection)
- Readability may fail on non-article pages
- Check the `--retry-failed` output for specific errors

**Storage file is corrupted**
```bash
# Reset the storage file (will re-fetch all articles)
rm ~/.config/pullread/pullread.json
# Then run a new sync from the app or CLI
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

### Highlights, Notes & Read State

> **Note:** Highlights and Notes are now implemented. See the [Article Reader](#article-reader) section above for usage. Read State tracking remains a future idea.

These features turn PullRead from a read-only archive into an active reading tool. Here's the design for how each works within the existing architecture.

#### Read State

Track which articles have been opened and how far the user scrolled.

**Storage:** A JSON file at `~/.config/pullread/reading-state.json`:
```json
{
  "2024-01-29-article-title.md": {
    "read": true,
    "openedAt": "2024-01-30T10:00:00Z",
    "scrollPercent": 100,
    "lastReadAt": "2024-01-30T10:05:00Z"
  }
}
```

**Implementation:**
- **Server:** Add `GET /api/read-state` and `POST /api/read-state` endpoints to `viewer.ts` for loading/saving per-article state
- **Client:** On article load, mark it as opened and send a `POST`. Track `scrollTop / scrollHeight` on scroll (debounced) and persist the percentage. Show unread articles with a visual indicator (bold title or dot) in the sidebar. Add a filter toggle ("Unread only") next to the search bar
- **Frontmatter option:** Alternatively, append `read: true` directly to each markdown file's YAML frontmatter, making state portable across devices via cloud sync — no separate JSON needed

#### Highlights

Let users select text in an article and save highlights.

**Storage:** A JSON file at `~/.config/pullread/highlights.json`:
```json
{
  "2024-01-29-article-title.md": [
    {
      "id": "h1a2b3",
      "text": "the exact selected text",
      "contextBefore": "preceding words for anchoring",
      "contextAfter": "following words for anchoring",
      "color": "yellow",
      "createdAt": "2024-01-30T10:02:00Z"
    }
  ]
}
```

**Implementation:**
- **Server:** Add `GET /api/highlights?name=<file>` and `POST /api/highlights` endpoints
- **Client:** Listen for `mouseup` / `selectionchange` events. When the user selects text, show a small floating toolbar with color options. On highlight creation, save the selected text plus surrounding context (for fuzzy re-anchoring if content changes). After rendering markdown to HTML, walk the DOM text nodes and wrap matched ranges in `<mark>` elements with a `data-highlight-id` attribute. Clicking an existing highlight could show a popover to change color or delete
- **CSS:** Add `.highlight-yellow`, `.highlight-green`, `.highlight-blue`, `.highlight-pink` classes with appropriate background colors per theme
- **Export:** Add `pullread export-highlights` CLI command that outputs all highlights as a markdown file grouped by article

#### Notes / Annotations

Let users attach freeform notes to specific passages or to an article as a whole.

**Storage:** Extend `highlights.json` or use a separate `~/.config/pullread/notes.json`:
```json
{
  "2024-01-29-article-title.md": {
    "articleNote": "Overall thoughts about this piece...",
    "annotations": [
      {
        "id": "n4d5e6",
        "anchorText": "text the note is attached to",
        "contextBefore": "...",
        "contextAfter": "...",
        "note": "My comment on this passage",
        "createdAt": "2024-01-30T10:03:00Z"
      }
    ]
  }
}
```

**Implementation:**
- **Inline annotations:** After selecting text and clicking an "Add note" button, show a small textarea popover anchored to the selection. Save the note with the same context-anchoring approach as highlights. Render a margin icon or underline in the article to indicate annotated passages; hover/click to reveal the note
- **Article-level notes:** Add a collapsible "Notes" panel below the article metadata header. This is a simple textarea that persists via the API. Could also be written back into the markdown frontmatter as an `notes:` field for portability
- **Server:** `GET /api/notes?name=<file>` and `POST /api/notes` endpoints in `viewer.ts`
- **Keyboard shortcut:** `n` to open the article-level notes panel, `h` to highlight current selection

#### Shared Design Principles

- **File-based storage** — JSON files in `~/.config/pullread/` keeps everything portable and inspectable. No database needed
- **Frontmatter as source of truth (optional)** — For maximum portability (Dropbox/iCloud sync), read state and article-level notes could be written directly into each markdown file's YAML frontmatter. Highlights and inline annotations are better suited to a sidecar JSON since they reference DOM positions
- **Offline-first** — All state is local. The viewer reads/writes through the local HTTP API. No external services
- **Graceful degradation** — If state files are missing, the viewer works exactly as it does today. Features appear only when state exists

### Other Ideas

- **Browser extension** - "Send to PullRead" button that adds URLs directly to a local feed
- **Tags/categories** - Support for preserving tags from bookmark services
- **Full-text search** - Index markdown content for quick searching
- **Multi-platform tray app** - Electron or Tauri version for Windows/Linux
- **Kindle/epub export** - Convert markdown collection to ebook format
- **Webhook support** - Trigger sync via webhook for real-time updates
- **Self-hosted option** - Run as a service with web interface
- **Sync to Obsidian/Notion** - Direct integration with note-taking apps
- ~~**AI summarization**~~ - Implemented. See [AI Summaries](#ai-summaries) above
- **Recommendations** - Suggest similar articles based on reading history
- **iOS companion app** - View synced articles with iCloud sync
- **Alfred/Raycast extension** - Quick actions for macOS power users

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
- [Bun](https://bun.sh) - Fast JavaScript runtime used to build standalone binaries

---

**Made with care for anyone who wants to own their reading list.**
