# PullRead

**Save articles from your bookmark services as clean, local markdown files.**

PullRead connects to bookmark services like Instapaper, Pinboard, Raindrop, and Omnivore (via their RSS feeds), extracts article content using Mozilla's Readability algorithm, and saves them as beautifully formatted markdown files with YAML frontmatter. It also handles RSS/Atom feeds, podcasts, YouTube videos (with transcripts), and more. Perfect for building a local, searchable reading archive synced to Dropbox, iCloud, or any folder you choose.

---

## Download

**[Download the latest release](https://github.com/shellen/pullread/releases/latest)**

| Platform | Download | Architecture |
|----------|----------|-------------|
| **macOS (Apple Silicon)** | [PullRead_aarch64.dmg](https://github.com/shellen/pullread/releases/latest) | ARM64 (M1/M2/M3/M4) |
| **macOS (Intel)** | [PullRead_x64.dmg](https://github.com/shellen/pullread/releases/latest) | x86_64 |
| **CLI** | Clone this repo | For development, Linux, or Windows |

> **Quick install:** Download the DMG, open it, drag PullRead to your Applications folder, and launch it. The app is fully self-contained — no Node.js or other dependencies required. Configure your feeds in Settings and start syncing.

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
- [Desktop App](#desktop-app)
- [Scheduling](#scheduling)
- [Architecture](#architecture)
- [Development](#development)
- [LLM Models](#llm-models)
- [Testing](#testing)
- [Code Signing & Distribution](#code-signing--distribution)
- [Auto-Updates](#auto-updates)
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
- **Cross-platform desktop app** - Tauri-based menu bar app with bundled CLI (macOS first, Windows/Linux planned)
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

**For the desktop app (download):**
- **macOS** 13+ (no other dependencies required — the app is self-contained)

**For CLI development:**
- **Node.js** 16 or higher (for development with ts-node)
- **Bun** (optional, for building standalone binaries)

**For building the Tauri app from source:**
- **Rust** (latest stable) and **Cargo**
- **Bun** (for compiling the CLI sidecar binary)
- On macOS: Xcode Command Line Tools
- On Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`

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

### Desktop App (Tauri)

**Option A: Download Release (Recommended)**

1. Download `PullRead.dmg` from [GitHub Releases](https://github.com/shellen/pullread/releases)
2. Open the DMG and drag PullRead to Applications
3. Launch PullRead from Applications
4. The onboarding wizard walks you through setting up feeds and output path
5. (Optional) Enable "Launch at Login" in Settings

The app bundles its own CLI binary — no Node.js or npm required.

**Option B: Build from Source**

```bash
# Install dependencies
bun install

# Build the CLI sidecar binary
bun build src/index.ts --compile --outfile dist/pullread

# Prepare the sidecar for Tauri
bash scripts/prepare-sidecar.sh

# Build the Tauri app
cd src-tauri && cargo tauri build
# Output: src-tauri/target/release/bundle/dmg/PullRead_*.dmg
```

Or use the all-in-one build script:

```bash
bash scripts/build-tauri.sh
```

---

## Configuration

**For the desktop app:** Launch PullRead and the onboarding wizard guides you through setup. All configuration is stored at `~/.config/pullread/feeds.json`.

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
| `syncInterval` | Auto-sync interval (`30m`, `1h`, `4h`, `12h`, `manual`) | `1h` |

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

PullRead can generate AI-powered summaries of your recent reading. In the desktop app, go to Settings and set the review schedule to **Daily** or **Weekly**. You can also generate a review on-demand from the menu bar.

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

## Desktop App

PullRead ships as a menu bar application that runs quietly in the system tray. The app is built with **Tauri** (Rust + WebView) and bundles the CLI as a sidecar binary, so no external dependencies are required.

### How It Works

The Tauri shell manages the system tray, timers, notifications, and window lifecycle. When you trigger a sync or open the viewer, it spawns the bundled Bun CLI binary as a subprocess. The viewer runs as an HTTP server on a dynamic localhost port, displayed in a native WebView window.

```
Tauri App (Rust)
├── System tray with menu ──→ User interaction
├── Sync/review timers    ──→ Periodic background operations
├── Notifications          ──→ Sync complete / failed alerts
├── URL scheme handler    ──→ pullread://open, save, sync
└── WebView window        ──→ Displays viewer on localhost:PORT
         │
         │ spawns sidecar
         ▼
Bun CLI Binary (TypeScript)
├── sync   ──→ Fetch feeds, extract articles, save markdown
├── view   ──→ HTTP server with REST API + viewer HTML
├── review ──→ AI-generated reading summaries
└── autotag ──→ Machine tagging via LLM providers
```

### Menu Structure

```
┌──────────────────────────┐
│ Sync Now            ⌘S   │  → Runs the bundled CLI
│ Last sync: Never         │  ← Updated after each sync
│ Next sync: —             │
├──────────────────────────┤
│ View Articles       ⌘D   │  → Opens the markdown reader
│ Open Folder         ⌘O   │  → Opens your Articles folder
├──────────────────────────┤
│ Retry Failed        ⌘R   │  → Retries failed URLs
│ Generate Review          │  → AI summary of recent reading
├──────────────────────────┤
│ Logs                ⌘L   │  → Opens sync log
│ Check for Updates…       │  → Tauri auto-update check
├──────────────────────────┤
│ About PullRead           │
│ Quit PullRead       ⌘Q   │
└──────────────────────────┘
```

### Features

- **Self-contained** - Bundled CLI binary, no Node.js required
- **No dock icon** - Runs as a menu bar accessory (dock icon appears when viewer is open)
- **Article reader** - Built-in two-pane markdown viewer in a native WebView window
- **Highlights & notes** - Select text to highlight, add inline annotations, and write article-level notes
- **Weekly reviews** - Scheduled AI summaries of your recent reading (daily, weekly, or on-demand)
- **Bookmark import** - Import a `bookmarks.html` file from any browser or service
- **RSS auto-discovery** - Paste a blog URL and the app finds the feed automatically
- **Native notifications** on sync completion or failure (with configurable sounds)
- **Launch at login** via system autostart
- **URL scheme** - `pullread://save?url=...` to save articles from other apps
- **Auto-updates** - Built-in update mechanism checks for new versions

### Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| **macOS** (ARM) | Supported | Primary target, full feature parity |
| **macOS** (Intel) | Supported | Universal binary via CI |
| **Windows** | Planned | Platform stubs in place |
| **Linux** | Planned | Platform stubs in place |

The platform abstraction layer (`src-tauri/src/platform/`) provides a `PlatformServices` trait with implementations for macOS (Keychain, NSSpellChecker) and stubs for Windows/Linux.

### macOS-Specific Features

These features use native macOS APIs and are available only on macOS:

- **Keychain integration** - API keys stored securely in macOS Keychain
- **Grammar checking** - Local grammar check via NSSpellChecker
- **Spotlight indexing** - Articles indexed for macOS search (via Swift helper)
- **Share Extension** - Accept URLs from macOS Share sheet (via companion appex)
- **Shortcuts/Siri** - "Save article", "Sync feeds" via App Intents

On other platforms, these features degrade gracefully (API keys in config file, no grammar check, no system search indexing).

### Article Reader

The built-in article reader (**View Articles** in the menu bar) is a two-pane web UI served on a dynamic localhost port. It supports themes (Light, Dark, Sepia), multiple font families, adjustable text sizes, highlights, notes, and full keyboard navigation.

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
- Adjustable speed (0.5x-2x) with skip/previous controls
- Audio is cached locally after first listen
- Paid providers require a separate TTS API key (never shared with summaries)
- Cost estimates shown in TTS Settings with consent gate before first paid use

#### Export Markdown

Share articles as markdown files with optional content:
- Click **Share > Export Markdown** on any article
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

### URL Scheme

PullRead registers the `pullread://` URL scheme for deep linking:

| URL | Action |
|-----|--------|
| `pullread://open` | Open the viewer |
| `pullread://open?file=article.md` | Open a specific article |
| `pullread://save?url=https://...` | Save a URL to the inbox for next sync |
| `pullread://sync` | Trigger a sync |
| `pullread://notebook?id=my-notebook` | Open a specific notebook |

Use these from browser bookmarklets, Alfred/Raycast, Shortcuts, or other automation tools.

---

## Scheduling

### Option 1: Desktop App (Recommended)

The desktop app handles scheduling automatically. Configure the sync interval in Settings (`30m`, `1h`, `4h`, `12h`, or `manual`). The app stays in your menu bar and syncs on schedule. You can also schedule **Weekly Reviews** under Settings.

### Option 2: launchd (macOS)

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

---

## Architecture

PullRead uses a **hybrid architecture**: a Tauri shell (Rust) manages the system tray, window, and platform integrations, while the content processing engine remains in TypeScript, bundled as a sidecar binary compiled with Bun.

This design preserves Mozilla Readability's extraction quality (the gold-standard JS implementation) while providing a native desktop experience with cross-platform potential.

### Project Structure

```
pullread/
├── src/                           # TypeScript CLI source
│   ├── index.ts                   # CLI entry point, orchestration
│   ├── feed.ts                    # RSS/Atom parsing, auto-discovery
│   ├── extractor.ts               # Article extraction (Readability, YouTube, X.com)
│   ├── writer.ts                  # Markdown generation with frontmatter
│   ├── viewer.ts                  # Local article reader (HTTP server)
│   ├── storage.ts                 # SQLite-backed sync state
│   ├── summarizer.ts              # Article summarization (5 LLM providers)
│   ├── autotagger.ts              # Machine tagging using LLM providers
│   ├── tts.ts                     # Text-to-speech (Kokoro, OpenAI, ElevenLabs)
│   ├── review.ts                  # Weekly review generation
│   └── *.test.ts                  # Unit tests (86 tests across 5 suites)
│
├── src-tauri/                     # Tauri desktop app (Rust)
│   ├── src/
│   │   ├── main.rs                # Entry point
│   │   ├── lib.rs                 # App setup, plugins, startup flow
│   │   ├── tray.rs                # System tray menu (14 items)
│   │   ├── sidecar.rs             # Bun binary lifecycle management
│   │   ├── commands.rs            # IPC commands, viewer window, deep links
│   │   ├── notifications.rs       # Cross-platform notification helpers
│   │   ├── timers.rs              # Sync/review scheduling
│   │   └── platform/              # OS-specific services
│   │       ├── mod.rs             # PlatformServices trait definition
│   │       ├── macos.rs           # Keychain, NSSpellChecker
│   │       ├── windows.rs         # Stubs (Credential Manager)
│   │       └── linux.rs           # Stubs (keyring, hunspell)
│   ├── binaries/                  # Sidecar binaries (gitignored, built)
│   ├── Cargo.toml                 # Rust dependencies
│   ├── tauri.conf.json            # App configuration
│   └── capabilities/default.json  # Permission definitions
│
├── viewer/                        # Article reader (modular JS)
│   ├── 00-tauri-shim.js           # Tauri environment detection & helpers
│   ├── 01-state.js                # Global state and data structures
│   ├── 02-utils.js                # Helper functions
│   ├── 03-settings.js             # Preferences UI
│   ├── 04-article.js              # Article rendering
│   ├── 05-sidebar.js              # Sidebar/file list
│   ├── 06-annotations.js          # Highlights and notes
│   ├── 07-tts.js                  # Text-to-speech controls
│   ├── 08-ai.js                   # AI summarization
│   ├── 09-notebooks.js            # Notebook/collection management
│   ├── 10-explore.js              # Feed discovery
│   ├── 11-modals.js               # Settings, onboarding, guides
│   ├── 12-keyboard.js             # Keyboard shortcuts
│   └── 13-init.js                 # Initialization and auto-refresh
│
├── viewer.html                    # Viewer HTML template
├── viewer.css                     # Viewer styles
├── viewer-dist/                   # Tauri frontend placeholder (loading screen)
│
├── scripts/
│   ├── build-tauri.sh             # Full Tauri build pipeline
│   ├── prepare-sidecar.sh         # Copy Bun binary with target triple naming
│   ├── download-kokoro-model.sh   # Downloads Kokoro TTS model for bundling
│   ├── bundle-kokoro.ts           # Copies Kokoro runtime files to Tauri resources
│   ├── embed-viewer.ts            # Inlines viewer modules into viewer-html.ts
│   └── setup-signing-secrets.sh   # Configures GitHub Actions signing secrets
│
├── .github/workflows/
│   ├── build-tauri.yml            # CI/CD: build, sign, notarize, release (ARM + Intel)
│   ├── deploy-site.yml            # CI: GitHub Pages deployment
│   └── check-models.yml           # CI: Scheduled LLM model checks
│
├── docs/plans/                    # Architecture and migration plans
│   ├── 2026-02-11-tauri-hybrid-migration-plan.md
│   ├── 2026-02-05-tauri-alternative.md
│   └── ...
│
├── TAURI_MIGRATION_ASSESSMENT.md  # Tauri migration analysis
├── models.json                    # LLM model registry (single source of truth)
├── package.json                   # Node dependencies
├── feeds.json.example             # Configuration template
└── dist/                          # Compiled CLI binaries (gitignored)

~/.config/pullread/                # User config directory (created by app)
├── feeds.json                     # User's feed configuration
├── pullread.db                    # SQLite processed URL tracking database
├── settings.json                  # LLM and TTS provider settings
├── highlights.json                # Article highlights
├── notes.json                     # Article notes, tags, and annotations
├── inbox.json                     # URLs saved via pullread:// scheme
├── tts-cache/                     # Cached TTS audio files (mp3/wav)
└── kokoro-model/                  # Local Kokoro TTS model (~86MB)
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

The processed URL database is stored as SQLite at `~/.config/pullread/pullread.db`, tracking URL status (processed/failed), titles, timestamps, and output file paths.

---

## Development

### Setup

```bash
git clone https://github.com/shellen/pullread.git
cd pullread
npm install
```

### Running in Development

**CLI only (no Tauri):**
```bash
# Run with ts-node (no compilation needed)
npm run sync

# Start the viewer
npm run -- view
```

**Tauri development mode:**
```bash
# Build the CLI sidecar first
bun build src/index.ts --compile --outfile dist/pullread
bash scripts/prepare-sidecar.sh

# Run Tauri dev mode (hot-reload for Rust changes)
cd src-tauri && cargo tauri dev
```

### Code Style

- TypeScript with strict mode enabled (CLI engine)
- Rust with standard Clippy lints (Tauri shell)
- ES2022 target
- Functional approach where practical
- Minimal dependencies

### Key Dependencies

**TypeScript CLI:**

| Package | Purpose |
|---------|---------|
| `fast-xml-parser` | RSS/Atom feed parsing |
| `@mozilla/readability` | Article content extraction |
| `linkedom` | DOM simulation for Readability |
| `turndown` | HTML to Markdown conversion |
| `kokoro-js` | Local TTS voice synthesis (optional) |

**Tauri Shell (Rust):**

| Crate | Purpose |
|-------|---------|
| `tauri` | App framework, window management, system tray |
| `tauri-plugin-shell` | Sidecar binary spawning |
| `tauri-plugin-dialog` | Native folder picker |
| `tauri-plugin-notification` | Desktop notifications |
| `tauri-plugin-updater` | Auto-update mechanism |
| `tauri-plugin-deep-link` | URL scheme handling |
| `tauri-plugin-autostart` | Launch at login |
| `portpicker` | Dynamic port allocation |

**Build tooling:**
- **Bun** - Compiles TypeScript to standalone binaries for the sidecar
- **Cargo** - Builds the Tauri Rust application

---

## LLM Models

PullRead supports five LLM providers for article summarization, auto-tagging, and reviews. Available models are defined in **`models.json`** (single source of truth) and used by both the CLI and the desktop app.

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
2. The CLI (`summarizer.ts`) and viewer read `models.json` at runtime, no code changes needed

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

---

## Code Signing & Distribution

The CI/CD pipeline (`.github/workflows/build-tauri.yml`) handles building, signing, notarization, and releasing via `tauri-apps/tauri-action`. It builds for both ARM64 and Intel in a matrix, producing signed, notarized DMGs.

**Important:** The sidecar binary (Bun CLI) is code-signed with entitlements *before* the Tauri build step, because the sidecar needs `com.apple.security.cs.disable-library-validation` to load native ONNX Runtime addons at runtime.

### Required GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `APPLE_CERTIFICATE_BASE64` | Base64-encoded .p12 signing certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Certificate password |
| `APPLE_ID` | Apple ID for notarization |
| `APPLE_ID_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Developer team ID |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater signing private key |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the signing key |

Use `scripts/setup-signing-secrets.sh` to configure all secrets at once.

### Build Pipeline

```bash
# Full local build:
bash scripts/build-tauri.sh

# Steps:
# 1. bun install
# 2. Embed viewer HTML
# 3. Compile Bun CLI binary
# 4. Copy to src-tauri/binaries/ with target triple naming
# 5. Download Kokoro TTS model (~92MB)
# 6. Code-sign sidecar with entitlements (macOS, if APPLE_SIGNING_IDENTITY set)
# 7. cargo tauri build (compiles Rust, packages DMG)
```

### CI/CD Triggers

| Trigger | Behavior |
|---------|----------|
| Push to `main` | Build + upload artifacts, update rolling "latest" pre-release |
| Pull request | Build + upload artifacts (no release) |
| Tag `v*` | Build + create draft GitHub Release with DMGs |
| `workflow_dispatch` | Manual build with optional version/debug inputs |

---

## Auto-Updates

The Tauri app uses `tauri-plugin-updater` with Ed25519 signatures for update verification. When a tagged release is created, `tauri-apps/tauri-action` generates a `latest.json` manifest with download URLs and signatures, attached to the GitHub Release.

The app checks `https://github.com/shellen/pullread/releases/latest/download/latest.json` for updates. Users can also check manually via the **Check for Updates...** menu item.

**Key generation (one-time):**
```bash
bunx @tauri-apps/cli signer generate -w ~/.tauri/keys
```

The public key goes in `tauri.conf.json` (`plugins.updater.pubkey`). The private key is set as the `TAURI_SIGNING_PRIVATE_KEY` GitHub secret.

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
# Reset the database (will re-fetch all articles)
rm ~/.config/pullread/pullread.db
# Then run a new sync from the app or CLI
```

**Tauri app won't start**
```bash
# Check logs
tail -f /tmp/pullread.log

# Verify sidecar binary exists and is executable
ls -la src-tauri/binaries/pullread-cli-*
```

**Sidecar binary not found**
```bash
# Rebuild the sidecar
bun build src/index.ts --compile --outfile dist/pullread
bash scripts/prepare-sidecar.sh
```

### Viewing Logs

```bash
# CLI output is printed to terminal

# Desktop app logs
tail -f /tmp/pullread.log

# View in Console.app (macOS)
# Filter by "PullRead"
```

---

## Room for Improvement

### Code Quality

- **Add ESLint/Prettier** - The codebase currently lacks linting configuration. Adding ESLint with TypeScript support and Prettier for formatting would improve code consistency.
- **Increase type safety** - Some areas use `any` types that could be more strictly typed, particularly in the feed parsing logic where the XML structure varies.
- **Error handling refinement** - While errors are caught and logged, the error types could be more specific (network errors vs parsing errors vs extraction errors) to enable smarter retry logic.

### Functionality

- **Parallel fetching** - Currently processes feeds sequentially. Could use `Promise.all` with concurrency limits for faster syncs with many feeds.
- **Configurable extraction** - Some sites work better with custom extraction rules. A `siteRules.json` for site-specific selectors would help.
- **Incremental sync** - The feed is re-fetched entirely each time. Supporting `If-Modified-Since` headers would reduce bandwidth.
- **Content caching** - Store extracted content in SQLite to enable re-generating markdown without re-fetching.

---

## Future Ideas

Ideas that would extend PullRead's capabilities:

- **Windows & Linux builds** - Platform stubs are in place; needs CI runners and platform testing
- **Browser extension** - "Send to PullRead" button that uses the `pullread://save` URL scheme
- **Kindle/epub export** - Convert markdown collection to ebook format
- **Webhook support** - Trigger sync via webhook for real-time updates
- **Self-hosted option** - Run as a service with web interface
- **Sync to Obsidian/Notion** - Direct integration with note-taking apps
- **Recommendations** - Suggest similar articles based on reading history and tags
- **iOS companion app** - View synced articles with iCloud sync (Tauri supports iOS)
- **Alfred/Raycast extension** - Quick actions using `pullread://` URL scheme

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
- Follow existing code style (TypeScript for CLI, Rust for Tauri shell)

### Areas Seeking Contributions

- Windows/Linux platform implementations (`src-tauri/src/platform/`)
- Additional feed format support (JSON Feed)
- Site-specific extraction rules
- Test coverage expansion
- Tauri app testing and polish

---

## Legal

### Content and copyright

PullRead is a tool that fetches, extracts, and saves web content at your direction. **You are responsible for ensuring that your use complies with applicable copyright laws and the terms of service of any websites or services you access.** Only sync content you are authorized to copy or that is available under terms permitting personal archival. Do not use PullRead to redistribute or commercially exploit content you do not have rights to.

### Privacy

PullRead is local-first by design. Articles, highlights, notes, and reading history stay on your machine. Data is only sent to third parties when you explicitly use optional AI features (summaries, auto-tagging, reviews, cloud TTS), at which point article text is transmitted to your selected provider using your own API key. Browser TTS, Kokoro local TTS, and all reading features work entirely on-device. See [Privacy Policy](https://pullread.com/privacy) for details.

### Third-party services

PullRead is **not affiliated with, endorsed by, or sponsored by** Instapaper, Pinboard, Raindrop, Omnivore, Feedbin, YouTube, X (Twitter), Anthropic, OpenAI, Google, ElevenLabs, OpenRouter, or any other third-party service. All trademarks belong to their respective owners.

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
- [Tauri](https://tauri.app) - Lightweight cross-platform desktop app framework

---

**Made with care for anyone who wants to keep what they read.**
