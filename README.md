# PullRead

**Save articles from your bookmark services as clean, local markdown files.**

PullRead connects to bookmark services like Instapaper, Pinboard, Raindrop, and Omnivore (via their RSS feeds), extracts article content using Mozilla's Readability algorithm, and saves them as beautifully formatted markdown files with YAML frontmatter. It also handles RSS/Atom feeds, podcasts, YouTube videos (with transcripts), and more. Perfect for building a local, searchable reading archive synced to Dropbox, iCloud, or any folder you choose.

---

## Download

**[Download the latest release](https://github.com/shellen/pullread/releases/latest)**

| Platform | Download | Notes |
|----------|----------|-------|
| **macOS** | [PullRead.dmg](https://github.com/shellen/pullread/releases/latest/download/PullRead.dmg) | Self-contained menu bar app with bundled CLI |
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
- [LLM Models](#llm-models)
- [Testing](#testing)
- [Code Signing](#code-signing)
- [Auto-Updates (Sparkle)](#auto-updates-sparkle)
- [Troubleshooting](#troubleshooting)
- [Room for Improvement](#room-for-improvement)
- [Future Ideas](#future-ideas)
- [Contributing](#contributing)
- [Legal](#legal)
- [License](#license)

---

## Features

- **Bookmark service integration** - Connect Instapaper, Pinboard, Raindrop, Omnivore, and more via RSS feeds
- **Import bookmarks** - Import a `bookmarks.html` export from any browser or service
- **RSS auto-discovery** - Paste a blog URL and PullRead finds the RSS/Atom feed automatically
- **Clean article extraction** - Uses Mozilla's Readability algorithm (same as Firefox Reader View)
- **YouTube support** - Embeds video thumbnail with full transcript when available
- **X.com/Twitter support** - Generates meaningful titles from tweet content
- **Markdown output** - Converts HTML to clean, readable markdown with YAML frontmatter
- **Intelligent deduplication** - Tracks processed URLs to avoid re-fetching
- **Retry mechanism** - Failed extractions are tracked and can be retried later
- **Podcast support** - Saves episode metadata with audio links (perfect for show notes)
- **Built-in article reader** - Two-pane local web UI with full keyboard navigation, highlights, notes, and tags
- **Homepage dashboard** - Card-based landing page with continue reading, reviews, favorites, and recent articles
- **Search operators** - Filter articles with `is:favorite`, `tag:tech`, `has:summary`, AND/OR logic, and more
- **Weekly reviews** - AI-generated summaries of your recent reading (daily/weekly schedule or on-demand)
- **Self-contained macOS app** - Native Swift menu bar app with bundled CLI binary (no Node.js required)
- **Article summaries** - On-demand summarization with 5 LLM providers, shown with provider/model badges
- **Text-to-speech** - Listen to articles via browser TTS (free), Kokoro local AI, OpenAI, or ElevenLabs
- **Voice notes** - Record article notes using your microphone via Web Speech API
- **Export markdown** - Share articles as .md with optional highlights, notes, summary, and tags
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
    "instapaper": "https://www.instapaper.com/rss/YOUR_FOLDER_ID/YOUR_USER_ID",
    "pinboard": "https://feeds.pinboard.in/rss/u:YOUR_USERNAME/",
    "raindrop": "https://raindrop.io/collection/COLLECTION_ID/feed",
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
| Raindrop.io | `https://raindrop.io/collection/COLLECTION_ID/feed` |
| Omnivore | `https://api.omnivore.app/feed/YOUR_ID` |
| Hacker News | `https://hnrss.org/favorites?id=USERNAME` |
| Feedbin | Available in settings |

> **Tip:** You don't need to find the exact RSS URL. Paste a blog or site URL and PullRead will auto-discover the feed.

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

### Special URL Handling

PullRead handles certain URLs with specialized extractors:

- **YouTube** - Instead of extracting the page HTML, PullRead embeds the video thumbnail at the top of the article and includes the full video transcript (when captions are available). In the article reader, YouTube thumbnails are automatically converted to embedded video players.
- **X.com / Twitter** - Tweets often lack useful `<title>` tags. PullRead generates a meaningful title from the tweet content (via `og:description`), e.g., "Thread on AI safety by @username" instead of "Untitled".
- **Blog URLs** - If you add a blog URL that isn't a feed, PullRead auto-discovers the RSS/Atom feed via `<link rel="alternate">` tags in the HTML.

### Weekly Reviews

PullRead can generate AI-powered summaries of your recent reading. In the macOS app, go to Settings and set the review schedule to **Daily** or **Weekly**. You can also generate a review on-demand from the menu bar.

Reviews use the same LLM settings as article summaries (configure your API key in the viewer's gear icon). From the CLI:

```bash
# Generate a review of the last 7 days
pullread review --days 7
```

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
┌──────────────────────────┐
│ Status: Idle             │  ← Current sync state
│ Last sync: 2:34 PM       │  ← Time of last sync
├──────────────────────────┤
│ Sync Now            ⌘S   │  → Runs the bundled CLI
│ Retry Failed        ⌘R   │  → Retries failed URLs
│ Generate Review Now       │  → AI summary of recent reading
├──────────────────────────┤
│ Open Output Folder  ⌘O   │  → Opens your Articles folder
│ View Articles...    ⌘D   │  → Opens the markdown reader
│ Settings            ⌘,   │  → Configure feeds, services, reviews
│ View Logs...        ⌘L   │  → Opens sync log
│ Check for Updates...      │  → Sparkle auto-update check
├──────────────────────────┤
│ Welcome Guide...          │
│ About PullRead           │
│ Quit PullRead       ⌘Q   │
└──────────────────────────┘
```

### Features

- **Self-contained** - Bundled CLI binary, no Node.js required
- **Article reader** - Built-in two-pane markdown viewer via "View Articles..." menu
- **Highlights & notes** - Select text to highlight, add inline annotations, and write article-level notes
- **Weekly reviews** - Scheduled AI summaries of your recent reading (daily, weekly, or on-demand)
- **Bookmark import** - Import a `bookmarks.html` file from any browser or service
- **RSS auto-discovery** - Paste a blog URL and the app finds the feed automatically
- **Resync recovery** - Deleted output files are detected and re-synced automatically
- **Status indicator** showing idle/syncing state with badge for unread reviews
- **Icon animation** during sync operations
- **Native notifications** on sync completion or failure
- **Keyboard shortcuts** for common actions
- **No dock icon** - runs quietly in the menu bar

### Article Reader

The built-in article reader (`pullread view` or **View Articles** in the menu bar app) is a two-pane web UI served on `localhost:7777`. It supports themes (Light, Dark, Sepia), multiple font families, adjustable text sizes, highlights, notes, and full keyboard navigation.

#### Highlights & Notes

Select any text in an article to see a floating toolbar with highlight color options (yellow, green, blue, pink) and an "Add note" button. Click an existing highlight to change its color, add a note to it, or delete it.

- **Highlights** are saved per-article at `~/.config/pullread/highlights.json` — each highlight can optionally carry a note
- **Notes** are saved per-article at `~/.config/pullread/notes.json`
- **Article-level notes** can be written in a collapsible "Notes" panel at the bottom of each article
- **Voice notes** — click the microphone button to dictate notes hands-free via Web Speech API
- **Inline annotations** attach a note to a specific text passage, shown with a marker icon
- **Tags** can be added to any article via the Notes panel (press Enter or comma to add)
- **Favorites** mark articles with a heart icon in the sidebar
- Sidebar items show indicator dots for favorites (heart), highlights (yellow), notes (blue), and summaries

#### Summaries

PullRead can generate article summaries using your own API key. Summaries are stored directly in each article's YAML frontmatter along with which provider and model generated them.

**Setup:**
1. Click the gear icon in the viewer toolbar to open Summary Settings
2. Choose a model provider (Anthropic, OpenAI, Gemini, OpenRouter, or Apple Intelligence)
3. Enter your API key and optionally customize the model
4. Click Save

**Usage:**
- Click the "Summarize" button on any article to generate a summary
- Summaries appear at the top of the article with flat badges showing the provider and model
- Articles with summaries show an indicator dot in the sidebar
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

Supported model providers: **Anthropic** (Claude), **OpenAI** (GPT), **Gemini**, **OpenRouter**, and **Apple Intelligence** (macOS 26+, on-device). See [LLM Models](#llm-models) for defaults and deprecation dates.

#### Search Operators

The search bar supports operators to narrow down your article list:

| Operator | Description | Example |
|----------|-------------|---------|
| `is:favorite` | Favorited articles | `is:fav` |
| `is:read` / `is:unread` | Filter by read status | `is:unread` |
| `has:summary` | Articles with AI summaries | `has:summary` |
| `has:highlights` | Articles with highlights | `has:highlights` |
| `has:notes` | Articles with notes | `has:notes` |
| `has:tags` | Articles with any tags | `has:tags` |
| `tag:value` | Filter by specific tag | `tag:technology` |
| `feed:value` | Filter by feed name | `feed:instapaper` |
| `domain:value` | Filter by domain | `domain:substack` |
| `author:value` | Filter by author | `author:patrick` |

**Combining operators:**
- **AND** (default): `is:favorite tag:tech` — favorites tagged with "tech"
- **OR**: `tag:ai OR tag:ml` — articles tagged "ai" or "ml"
- **Quoted phrases**: `"machine learning"` — exact match

#### Text-to-Speech

Listen to articles read aloud with multiple TTS providers:

| Provider | Cost | Notes |
|----------|------|-------|
| **Browser** (default) | Free | Built-in speech synthesis, works offline |
| **Kokoro** | Free | Local AI voice (~86MB model, auto-downloads on first use) |
| **OpenAI** | ~$0.15/article | Cloud API, bring your own key |
| **ElevenLabs** | ~$1.20-2.40/article | Cloud API, bring your own key |

- Queue multiple articles for continuous playback
- Adjustable speed (0.5x–2x) with skip/previous controls
- Audio is cached locally after first listen
- Paid providers require a separate TTS API key (never shared with summaries)
- Cost estimates shown in TTS Settings with consent gate before first paid use

#### Export Markdown

Share articles as markdown files with optional content:
- Click **Share → Export Markdown** on any article
- Choose what to include: summary, highlights, notes, tags
- Download as `.md` file or copy to clipboard

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
| `f` | Toggle focus mode |
| `p` | Print article |
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

### Option 1: macOS Menu Bar App (Recommended)

The macOS app handles scheduling automatically. Just add it to your Login Items (see [Auto-Start on Login](#auto-start-on-login)) and it stays in your menu bar. Click **Sync Now** or let it sync on launch. You can also schedule **Weekly Reviews** under Settings → Options.

### Option 2: launchd

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

### Option 3: cron

```bash
# Edit crontab
crontab -e

# Add line for every 30 minutes
*/30 * * * * cd /path/to/pullread && /usr/local/bin/npm run sync >> /tmp/pullread.log 2>&1
```

### Option 4: AppleScript (for idle-based sync)

See `scripts/PullReadScheduler.applescript` for an idle-based scheduler that runs when your Mac has been idle for a set period.

---

## Architecture

### Project Structure

```
pullread/
├── src/                           # TypeScript CLI source
│   ├── index.ts                   # CLI entry point, orchestration
│   ├── feed.ts                    # RSS/Atom parsing, auto-discovery
│   ├── extractor.ts               # Article extraction (Readability, YouTube, X.com)
│   ├── writer.ts                  # Markdown generation with frontmatter
│   ├── viewer.ts                  # Local article reader (HTTP server on port 7777)
│   ├── storage.ts                 # JSON file storage operations
│   ├── summarizer.ts              # Article summarization (5 LLM providers)
│   ├── autotagger.ts              # Machine tagging using LLM providers
│   ├── tts.ts                     # Text-to-speech (Kokoro, OpenAI, ElevenLabs)
│   ├── review.ts                  # Weekly review generation
│   └── *.test.ts                  # Unit tests (86 tests across 5 suites)
│
├── PullReadTray/                  # macOS menu bar app (Swift)
│   ├── PullReadTray/
│   │   ├── PullReadTrayApp.swift  # SwiftUI entry point
│   │   ├── AppDelegate.swift      # Menu bar, notifications, review scheduling
│   │   ├── SyncService.swift      # Bundled CLI binary execution
│   │   ├── SettingsView.swift     # Feed management, bookmark services, options
│   │   └── OnboardingView.swift   # First-run setup wizard
│   ├── PullReadTrayTests/         # XCTest unit tests
│   └── PullReadTrayUITests/       # XCTest UI tests
│
├── scripts/                       # Build and scheduler scripts
│   ├── build-release.sh           # Builds universal CLI binary
│   └── embed-viewer.ts            # Generates viewer-html.ts from viewer.html
├── viewer.html                    # Article reader source (single-file HTML/JS/CSS)
├── .github/workflows/             # CI: build, test, sign, notarize
├── dist/                          # Compiled CLI binaries (gitignored)
├── feeds.json                     # Dev configuration (gitignored)
└── feeds.json.example             # Configuration template

~/.config/pullread/                # User config directory (created by app)
├── feeds.json                     # User's feed configuration
├── pullread.json                  # Processed URL tracking database
├── settings.json                  # LLM and TTS provider settings
├── highlights.json                # Article highlights
├── notes.json                     # Article notes, tags, and annotations
├── tts-cache/                     # Cached TTS audio files (mp3/wav)
└── kokoro-model/                  # Local Kokoro TTS model (~86MB, auto-downloaded)
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
| `linkedom` | DOM simulation for Readability |
| `turndown` | HTML to Markdown conversion |
| `kokoro-js` | Local TTS voice synthesis (optional) |

**Build tooling:**
- **Bun** - Used to compile TypeScript to standalone binaries for the macOS app

---

## LLM Models

PullRead supports five LLM providers for article summarization, auto-tagging, and reviews. Available models are defined in **`models.json`** (single source of truth) and used by both the CLI and the macOS app.

| Provider | Default Model | Notes |
|----------|---------------|-------|
| **Anthropic** | claude-haiku-4-5 | Cheapest for batch tagging |
| **OpenAI** | gpt-4.1-nano | GPT-4.1 series deprecated Feb 13 2026; migrate to GPT-5 |
| **Gemini** | gemini-2.5-flash-lite | Gemini 2.0 deprecated Mar 31 2026 |
| **OpenRouter** | anthropic/claude-haiku-4.5 | Aggregator; includes DeepSeek, Llama free tiers |
| **Apple Intelligence** | on-device | Requires macOS 26 + Xcode CLT |

### Updating Models

Models change frequently. To update:

1. Edit `models.json` — add/remove models, update defaults, note deprecation dates
2. Run `bun run sync:models` — this updates `SettingsView.swift` from models.json and warns about upcoming deprecations
3. The CLI (`summarizer.ts`) reads `models.json` at runtime, no code changes needed

Provider API docs for checking latest models:
- [Anthropic Models](https://docs.anthropic.com/en/docs/about-claude/models)
- [OpenAI Models](https://platform.openai.com/docs/models)
- [Gemini Models](https://ai.google.dev/gemini-api/docs/models)
- [OpenRouter Models](https://openrouter.ai/models)

---

## Testing

### Run All Tests

```bash
npm test
```

### Test Coverage

86 tests across 5 suites:

- **Content extraction** (`extractor.test.ts` — 28 tests)
  - Readability algorithm
  - HTML to Markdown conversion
  - YouTube URL detection and video ID extraction
  - X.com/Twitter title generation
  - Edge cases (empty content, timeouts)

- **Feed parsing** (`feed.test.ts` — 26 tests)
  - Atom, RSS, and RDF feed detection and parsing
  - Podcast feeds with enclosures
  - CDATA sections and HTML entities
  - RSS auto-discovery from HTML pages

- **Bookmark import** (`bookmarks.test.ts` — 19 tests)
  - Browser bookmark HTML parsing
  - Folder and tag extraction

- **Database operations** (`storage.test.ts` — 7 tests)
  - URL tracking
  - Status updates
  - Failure recording

- **Markdown generation** (`writer.test.ts` — 6 tests)
  - Frontmatter generation
  - Filename slugification
  - Special character handling

### macOS App Tests

```bash
cd PullReadTray
xcodebuild test \
  -project PullReadTray.xcodeproj \
  -scheme PullReadTray \
  -destination 'platform=macOS'
```

---

## Code Signing

The CI workflow automatically signs, notarizes, and staples the macOS app when the required secrets are configured. Without them, the workflow still builds and tests the app — it just produces an unsigned build.

### Prerequisites

- An [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/year)
- A **Developer ID Application** certificate (for distributing outside the App Store)

### Step 1: Create a Developer ID Certificate

1. Go to [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates)
2. Click **+** to create a new certificate
3. Select **Developer ID Application** and follow the prompts
4. Download and install the certificate into Keychain Access

### Step 2: Export as .p12

1. Open **Keychain Access**
2. Find your "Developer ID Application: ..." certificate under **My Certificates**
3. Right-click → **Export** → choose `.p12` format
4. Set a strong password (you'll need this for the GitHub secret)

### Step 3: Base64-encode the .p12

```bash
base64 -i Certificates.p12 | pbcopy
```

This copies the encoded certificate to your clipboard.

### Step 4: Create an App-Specific Password

1. Go to [appleid.apple.com](https://appleid.apple.com) → **Sign-In and Security** → **App-Specific Passwords**
2. Generate a new password and label it "PullRead Notarization"
3. Save the generated password

### Step 5: Find Your Team ID

1. Go to [developer.apple.com/account](https://developer.apple.com/account) → **Membership Details**
2. Copy the **Team ID** (a 10-character alphanumeric string)

### Step 6: Add GitHub Secrets

Go to your repository's **Settings → Secrets and variables → Actions** and add these five secrets:

| Secret | Value |
|--------|-------|
| `APPLE_CERTIFICATE_BASE64` | The base64-encoded `.p12` from Step 3 |
| `APPLE_CERTIFICATE_PASSWORD` | The password you set when exporting the `.p12` |
| `APPLE_ID` | Your Apple ID email address |
| `APPLE_ID_PASSWORD` | The app-specific password from Step 4 |
| `APPLE_TEAM_ID` | Your 10-character Team ID from Step 5 |

### Step 7: Test

Push a commit that touches `PullReadTray/` or `src/` and watch the [Actions tab](../../actions). The workflow will:

1. Build the CLI binary
2. Import the certificate into a temporary keychain
3. Build the Xcode project with `CODE_SIGN_IDENTITY="Developer ID Application"`
4. Sign the app bundle and DMG
5. Submit for notarization via `xcrun notarytool` and staple the ticket
6. Upload the signed DMG as a build artifact

If the signing secrets aren't configured, the workflow gracefully falls back to an unsigned build.

---

## Auto-Updates (Sparkle)

PullRead uses [Sparkle 2](https://sparkle-project.org/) for automatic updates. When configured, the app checks for updates daily and shows a native macOS update prompt when a new version is available. Users can also check manually via the **Check for Updates...** menu item.

### How It Works

1. The release workflow (`release.yml`) builds a signed, notarized DMG
2. The DMG is signed with an EdDSA (Ed25519) key for Sparkle verification
3. An `appcast.xml` feed is generated and published to GitHub Pages
4. Installed apps check the appcast on a schedule (daily by default)
5. When a new version is found, Sparkle prompts the user to download and install it

### Setup

Sparkle requires an Ed25519 keypair. The **public key** is shipped in the app bundle so it can verify update signatures. The **private key** stays in GitHub Secrets and is only used during releases to sign the DMG.

> **One-time setup only.** These steps need to be done once when first configuring Sparkle for a fork or fresh repo. After setup, releases are fully automated from the GitHub Actions UI.

#### Step 1: Generate Ed25519 Signing Keys

1. Go to your repo on GitHub
2. Click **Actions** → **Sparkle Key Generation (one-time)** → **Run workflow** → **Run workflow**
3. Wait for the job to complete, then click into the completed job
4. Expand the **Generate Ed25519 keys** step to see the output

The output will contain two things you need to copy:

**The public key** looks like this in the output:
```
<key>SUPublicEDKey</key>
<string>kp53pifY8xCdPlB+Z+laUwknXBgRMJLTxFIAk+7/0rc=</string>
```

**The private key** is printed between the separator lines by `generate_keys -p`. It will be a long base64 string.

> **Important:** The CI runner is ephemeral — once the job finishes, the keys are gone forever. Copy both keys from the log output before navigating away. If you lose them, re-run the workflow to generate a new pair.

#### Step 2: Store the Private Key as a GitHub Secret (manual copy-paste required)

This is a one-time manual step. GitHub Secrets cannot be set by workflows — you must paste the value yourself.

1. Copy the **private key** string from the workflow output (Step 1)
2. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `SPARKLE_PRIVATE_KEY`
5. Value: paste the private key you copied
6. Click **Add secret**

The private key is only accessed by the `release.yml` workflow during the "Sign DMG for Sparkle" and "Update Sparkle appcast" steps. It never appears in source code.

#### Step 3: Update the Public Key in Info.plist (if regenerating keys)

The public key is already set in `PullReadTray/PullReadTray/Info.plist` under `SUPublicEDKey`. If you ran the keygen workflow and got a **different** public key than what's currently in Info.plist, you need to update it:

1. Open `PullReadTray/PullReadTray/Info.plist`
2. Find the `SUPublicEDKey` entry
3. Replace the `<string>...</string>` value with your new public key from the workflow output
4. Commit and push the change

If the public key matches what's already in Info.plist, skip this step.

#### Step 4: Enable GitHub Pages (if not already configured)

The Sparkle appcast is served from GitHub Pages. If your repo already has GitHub Pages enabled (e.g., serving `pullread.com`), this step is already done.

Otherwise:

1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Set **Branch** to `gh-pages` / `root`
4. Click **Save**

The `deploy-site.yml` workflow publishes `site/appcast.xml` (and any other site content) automatically.

#### Setup Checklist

- [ ] Ran **Sparkle Key Generation** workflow and copied both keys from the log output
- [ ] Created `SPARKLE_PRIVATE_KEY` secret in repo Settings with the private key
- [ ] Verified `SUPublicEDKey` in Info.plist matches the public key from the workflow
- [ ] Enabled GitHub Pages (Settings → Pages → gh-pages / root) — already done if pullread.com is live

### Releasing an Update

Once Sparkle is configured, cut a new release entirely from the GitHub UI — no CLI or git tags required:

1. Go to **Actions** → **Build and Release** → **Run workflow**
2. Enter the version number (e.g., `1.1.0`)
3. Click **Run workflow**

The workflow automatically:
1. Creates and pushes a `v1.1.0` git tag
2. Builds the universal CLI binary (arm64 + x64)
3. Builds, signs, and notarizes the app and DMG
4. Signs the DMG with the Sparkle private key
5. Creates a GitHub Release with the DMG attached
6. Generates a new `appcast.xml` and pushes it to the site
7. GitHub Pages deploys the updated appcast

Alternatively, pushing a tag (`git tag v1.1.0 && git push origin v1.1.0`) triggers the same workflow.

Existing users with Sparkle enabled will see the update prompt within 24 hours (or immediately via **Check for Updates...**).

### Configuration Reference

These values are set in `PullReadTray/PullReadTray/Info.plist`:

| Key | Value | Purpose |
|-----|-------|---------|
| `SUFeedURL` | `https://pullread.com/appcast.xml` | URL of the Sparkle appcast feed |
| `SUPublicEDKey` | *(base64 Ed25519 public key)* | Verifies update signatures |
| `SUEnableAutomaticChecks` | `true` | Check for updates on launch |
| `SUScheduledCheckInterval` | `86400` | Check interval in seconds (24 hours) |

### Important Notes

- **Existing users without Sparkle** cannot be auto-updated. If a user installed a version before Sparkle was enabled, they need to manually download the new version once. After that, all future updates are automatic.
- **The public key is safe to commit.** It can only verify signatures, not create them. This is by design — Sparkle needs it in the app bundle.
- **If you regenerate keys**, you must update `SUPublicEDKey` in Info.plist to match the new public key, and update the `SPARKLE_PRIVATE_KEY` secret with the new private key. The old and new keys are not interchangeable.

### GitHub Secrets Summary

| Secret | Purpose | Required For |
|--------|---------|--------------|
| `SPARKLE_PRIVATE_KEY` | Signs DMGs for Sparkle update verification | `release.yml` |
| `APPLE_CERTIFICATE_BASE64` | Code signing certificate | `release.yml` |
| `APPLE_CERTIFICATE_PASSWORD` | Certificate password | `release.yml` |
| `APPLE_ID` | Apple ID for notarization | `release.yml` |
| `APPLE_ID_PASSWORD` | App-specific password for notarization | `release.yml` |
| `APPLE_TEAM_ID` | Developer team ID | `release.yml` |

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

- **Browser extension** - "Send to PullRead" button that adds URLs directly to a local feed
- **Multi-platform tray app** - Electron or Tauri version for Windows/Linux
- **Kindle/epub export** - Convert markdown collection to ebook format
- **Webhook support** - Trigger sync via webhook for real-time updates
- **Self-hosted option** - Run as a service with web interface
- **Sync to Obsidian/Notion** - Direct integration with note-taking apps
- **Recommendations** - Suggest similar articles based on reading history and tags
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

## Legal

### Content and copyright

Pull Read is a tool that fetches, extracts, and saves web content at your direction. **You are responsible for ensuring that your use complies with applicable copyright laws and the terms of service of any websites or services you access.** Only sync content you are authorized to copy or that is available under terms permitting personal archival. Do not use Pull Read to redistribute or commercially exploit content you do not have rights to.

### Privacy

Pull Read is local-first by design. Articles, highlights, notes, and reading history stay on your Mac. Data is only sent to third parties when you explicitly use optional AI features (summaries, auto-tagging, reviews, cloud TTS), at which point article text is transmitted to your selected provider using your own API key. Browser TTS, Kokoro local TTS, and all reading features work entirely on-device. See [Privacy Policy](https://pullread.com/privacy) for details.

### Third-party services

Pull Read is **not affiliated with, endorsed by, or sponsored by** Instapaper, Pinboard, Raindrop, Omnivore, Feedbin, YouTube, X (Twitter), Anthropic, OpenAI, Google, ElevenLabs, OpenRouter, or any other third-party service. All trademarks belong to their respective owners.

### Third-party notices

See [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES) for open-source license attributions for bundled dependencies.

---

## License

[MIT License](LICENSE)

---

## Acknowledgments

- [Mozilla Readability](https://github.com/mozilla/readability) - The excellent article extraction algorithm
- [Turndown](https://github.com/mixmark-io/turndown) - HTML to Markdown conversion
- [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) - Fast and reliable XML parsing
- [Kokoro](https://github.com/hexgrad/kokoro) - High-quality local text-to-speech model
- [Bun](https://bun.sh) - Fast JavaScript runtime used to build standalone binaries

---

**Made with care for anyone who wants to keep what they read.**
