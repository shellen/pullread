# PullRead iOS Companion App (Read-Only Viewer)

**Date:** 2026-02-12
**Target:** iOS 16+, iPhone and iPad
**Approach:** Native SwiftUI shell + WKWebView rendering the existing embedded viewer

---

## Problem

PullRead syncs RSS feeds to markdown files and renders them in a self-contained web viewer (HTML + CSS + 14 JS modules, all inlined). Users want to read articles on their phone/iPad using the same viewer, pointing at any folder (iCloud Drive, Dropbox, Syncthing, local). No server, no account, no sync infrastructure.

---

## Architecture

**WKWebView + WKURLSchemeHandler.** Register a custom `pullread://` URL scheme. Load the viewer HTML via `loadHTMLString(_:baseURL: URL(string: "pullread://host/"))`. All relative `/api/*` fetches from the viewer JS resolve to `pullread://host/api/*` and get intercepted by the scheme handler, which reads local files and returns JSON.

This reuses the full viewer UI (sidebar, article rendering, themes, TTS, search, keyboard shortcuts) with zero JS changes. The Swift layer is a thin adapter that maps API requests to filesystem reads.

### Why this works

The viewer already separates data access from rendering cleanly:
- **Init** (`viewer/13-init.js:162`): calls `fetch('/api/files')` → gets JSON array of `FileMeta`
- **Article load** (`viewer/05-sidebar.js:241`): calls `fetch('/api/file?name=X')` → gets markdown text
- **All state** (theme, scroll position, read state): stored in `localStorage`, which persists in WKWebView automatically
- **Auto-refresh** (`viewer/13-init.js:100-116`): polls `/api/files-changed` every 5s, only does a full refresh when the timestamp changes

The scheme handler just needs to implement these ~12 read endpoints. Everything else (annotations, notebooks, summarization, TTS generation) returns empty/stub responses gracefully.

### Why `pullread://` scheme instead of `file://`

If you use `file://` as the base URL, `fetch('/api/files')` resolves to `file:///api/files` — which bypasses the scheme handler entirely. The custom scheme ensures all relative fetches get intercepted.

---

## File Structure

```
PullReadViewer/
├── PullReadViewer.xcodeproj/
└── PullReadViewer/
    ├── App.swift                    — @main entry (~15 lines)
    ├── ContentView.swift            — Welcome screen or webview (~120 lines)
    ├── ArticleSchemeHandler.swift   — WKURLSchemeHandler bridge (~250 lines)
    ├── FrontmatterParser.swift      — Parse YAML frontmatter (~80 lines)
    ├── Info.plist                    — Document provider capabilities
    └── Resources/
        ├── viewer.html              — Viewer with CDN refs → local paths
        ├── marked.min.js            — Bundled markdown parser
        ├── highlight.min.js         — Bundled syntax highlighter
        ├── github.min.css           — Highlight.js light theme
        └── github-dark.min.css      — Highlight.js dark theme
```

**~465 lines of Swift total.** No SPM packages, no CocoaPods.

---

## Component Details

### 1. `App.swift` (~15 lines)

Standard SwiftUI `@main` boilerplate. Nothing interesting here.

### 2. `ContentView.swift` (~120 lines)

Two states:

**No folder selected** — Welcome screen with "Choose Folder" button. Minimal branding. Explains that you point it at a folder of PullRead markdown files.

**Folder selected** — Full-screen `WKWebView` wrapped in `UIViewControllerRepresentable`.

#### Folder Picker

`UIDocumentPickerViewController(forOpeningContentTypes: [.folder])` wrapped in `UIViewControllerRepresentable`. This gives the user the standard iOS document picker — they can navigate to iCloud Drive, Dropbox, Syncthing, or any Files provider.

#### Security-Scoped Bookmarks

When the user picks a folder:
1. Create a bookmark with `url.bookmarkData(options: .minimalBookmark)` (note: `.withSecurityScope` is macOS-only)
2. Save the bookmark `Data` to `UserDefaults`

On app launch:
1. Resolve the bookmark via `URL(resolvingBookmarkData:options:bookmarkDataIsStale:)`
2. Call `url.startAccessingSecurityScopedResource()`
3. If the bookmark is stale, prompt the user to re-pick the folder

The security-scoped URL must remain "accessed" for the lifetime of the app, since the scheme handler reads files on every API call.

#### WKWebView Setup

```swift
let config = WKWebViewConfiguration()
config.setURLSchemeHandler(
    ArticleSchemeHandler(folderURL: url),
    forURLScheme: "pullread"
)
let webView = WKWebView(frame: .zero, configuration: config)
webView.loadHTMLString(viewerHTML, baseURL: URL(string: "pullread://host/"))
```

**Critical:** The scheme handler must be registered on the configuration *before* the WKWebView is instantiated. You can't add handlers after init.

#### External Link Handling

A `WKNavigationDelegate` intercepts all navigation actions. Any URL that isn't `pullread://` gets opened in Safari via `UIApplication.shared.open(url)`. This handles article source links, feed URLs, etc.

### 3. `FrontmatterParser.swift` (~80 lines)

Direct port of the line-based parser from `viewer/02-utils.js:1-14` and `src/viewer.ts:36-49`.

Algorithm:
1. Find the first `---\n` in the file content
2. Find the second `---\n`
3. Split the text between them by newlines
4. For each line, split on the first `:` to get key/value
5. Strip surrounding quotes, unescape `\"`

Returns a struct:

```swift
struct ArticleMeta {
    let title: String
    let url: String
    let domain: String
    let bookmarked: String
    let feed: String
    let author: String
    let excerpt: String
    let summary: String          // presence → hasSummary: true
    let summaryProvider: String
    let summaryModel: String
    let enclosureUrl: String     // frontmatter key: enclosure_url
    let enclosureType: String    // frontmatter key: enclosure_type
    let enclosureDuration: String // frontmatter key: enclosure_duration
}
```

**Performance:** Read only the first 3KB per file for the listing, matching `src/viewer.ts:64`. This keeps the folder scan fast even with thousands of articles.

### 4. `ArticleSchemeHandler.swift` (~250 lines)

Implements `WKURLSchemeHandler`. The core of the app. Routes by URL path:

#### Read Endpoints (fully implemented)

| Route | Response | Notes |
|-------|----------|-------|
| `/api/files` | JSON array of `FileMeta` | Enumerate `.md` files, parse frontmatter, extract first image URL from body. Sort by `bookmarked` desc, fall back to `mtime`. Matches shape from `src/viewer.ts:17-34` exactly. |
| `/api/file?name=X` | Raw markdown text (`text/plain`) | Validate filename: reject if contains `..` or `/`. Read full file content. |
| `/api/files-changed` | `{ "changedAt": <timestamp> }` | Return the folder's modification timestamp. The viewer polls this every 5s (`viewer/13-init.js:100-116`) and only does a full `/api/files` refresh when it changes. Lightweight. |
| `/api/config` | `{ "feeds": {}, "configured": true }` | `configured: true` is critical — without it, the onboarding wizard appears (`viewer/11-modals.js:231`). |
| `/api/tts-settings` | `{ "provider": "browser" }` | Enables the "Listen" button using Web Speech API, which works in WKWebView for free. No server-side TTS needed. |
| `/api/sync-status` | `{ "syncInterval": "manual" }` | Prevents the sync timer display from showing nonsense. |
| `/lib/marked.min.js` | Bundled JS from app resources | `text/javascript` |
| `/lib/highlight.min.js` | Bundled JS from app resources | `text/javascript` |
| `/lib/github.min.css` | Bundled CSS from app resources | `text/css` |
| `/lib/github-dark.min.css` | Bundled CSS from app resources | `text/css` |

#### Stub Endpoints (return empty/safe defaults)

| Route | Response | Why |
|-------|----------|-----|
| `/api/highlights` | `{}` | No highlight storage in v1 |
| `/api/highlights?name=X` | `{}` | Per-article highlights |
| `/api/notes` | `{}` | No notes storage in v1 |
| `/api/notes?name=X` | `{ "annotations": [], "tags": [], "isFavorite": false }` | Per-article notes |
| `/api/notebooks` | `[]` | No notebooks in v1 |
| `/api/settings` | `{}` | LLM settings — not applicable |
| `/favicons/*` | 404 | No favicon cache on device |

#### Write Endpoints (rejected)

Any `POST`, `PUT`, or `DELETE` request returns:
```json
{ "error": "Read-only viewer" }
```
with HTTP 405. This covers `/api/save`, `/api/highlights`, `/api/notes`, `/api/notebooks`, `/api/config`, `/api/summarize`, `/api/reprocess`, `/api/autotag-batch`, `/api/tts/start`, etc.

The viewer handles HTTP errors gracefully — write failures show a brief toast but don't break the read experience.

### 5. Viewer HTML Preparation

Take the output of `scripts/embed-viewer.ts` (the fully inlined HTML with all 14 JS modules and CSS baked in) and make these substitutions:

| CDN URL | Replacement |
|---------|-------------|
| `cdn.jsdelivr.net/npm/marked/marked.min.js` | `pullread://host/lib/marked.min.js` |
| `cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/highlight.min.js` | `pullread://host/lib/highlight.min.js` |
| `cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/styles/github.min.css` | `pullread://host/lib/github.min.css` |
| `cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/styles/github-dark.min.css` | `pullread://host/lib/github-dark.min.css` |
| Mermaid `<script>` tag | Remove entirely (skip for v1) |

**Add** before the JS modules: `window.PR_IOS = true;` — follows the existing `window.PR_TAURI` pattern from `viewer/00-tauri-shim.js:5`.

**Keep** Google Fonts CDN links as-is (`fonts.googleapis.com`). They degrade gracefully to system fonts when offline — Inter, Literata, Lora, Source Serif 4, Work Sans all have reasonable iOS fallbacks.

---

## API Surface Audit

Full list of `/api/*` endpoints the viewer calls (from grepping `viewer/*.js`), with iOS handling:

| Endpoint | Called From | iOS Response |
|----------|------------|-------------|
| `/api/files` | `13-init.js:68,162`, `05-sidebar.js` | **Implement** — core functionality |
| `/api/file?name=X` | `05-sidebar.js:241`, `08-ai.js:67,290`, `07-tts.js:231`, `13-init.js:25` | **Implement** — core functionality |
| `/api/files-changed` | `13-init.js:107,190` | **Implement** — folder mtime |
| `/api/config` | `11-modals.js:229`, `03-settings.js:258,661` | **Stub** — `{ "configured": true, "feeds": {} }` |
| `/api/tts-settings` | `13-init.js:178`, `03-settings.js:329`, `07-tts.js:91,211,1064,1334` | **Stub** — `{ "provider": "browser" }` |
| `/api/sync-status` | `13-init.js:5` | **Stub** — `{ "syncInterval": "manual" }` |
| `/api/highlights` | `06-annotations.js:7,29,54` | **Stub** — `{}` (GET), 405 (POST) |
| `/api/notes` | `06-annotations.js:8,30,64`, `13-init.js:39` | **Stub** — `{}` (GET), 405 (POST) |
| `/api/notebooks` | `09-notebooks.js:49,58,65,126` | **Stub** — `[]` (GET), 405 (POST/DELETE) |
| `/api/settings` | `08-ai.js:12`, `03-settings.js:408,626` | **Stub** — `{}` (GET), 405 (POST) |
| `/api/save` | `05-sidebar.js:342` | **405** — read-only |
| `/api/summarize` | `08-ai.js:88` | **405** — no LLM on device |
| `/api/reprocess` | `08-ai.js:53` | **405** |
| `/api/autotag-batch` | `08-ai.js:406` | **405** |
| `/api/autotag` | `09-notebooks.js:378` | **405** |
| `/api/grammar` | `09-notebooks.js:449,589` | **405** |
| `/api/feed-discover` | `11-modals.js:388`, `03-settings.js:679` | **405** |
| `/api/pick-folder` | `00-tauri-shim.js:24`, `03-settings.js:643` | **405** (folder already selected natively) |
| `/api/tts/start` | `07-tts.js:296,486` | **405** — browser TTS handles this client-side |
| `/api/tts/chunk/*` | `07-tts.js:464,516` | **405** |
| `/api/kokoro-preload` | `13-init.js:182` | **405** |
| `/api/backup` | `03-settings.js:709` | **405** |
| `/api/restore` | `03-settings.js:748` | **405** |
| `/lib/*` | Viewer HTML `<script>`/`<link>` tags | **Implement** — serve from app bundle |
| `/favicons/*` | Sidebar article list | **404** |

---

## Key Gotchas

1. **Scheme handler timing:** Must be registered on `WKWebViewConfiguration` before `WKWebView(frame:configuration:)` is called. Can't add handlers to an existing webview.

2. **iOS bookmark options:** Use `.minimalBookmark`, not `.withSecurityScope`. The latter is macOS-only and will crash on iOS.

3. **Base URL must use the custom scheme:** `loadHTMLString(_:baseURL: URL(string: "pullread://host/"))`. If you use `file://`, relative fetch calls bypass the scheme handler.

4. **`/api/config` must return `configured: true`:** Otherwise `showOnboardingIfNeeded()` (`viewer/11-modals.js:225-241`) shows a 5-step onboarding wizard for setting up feeds, which makes no sense on a read-only viewer.

5. **Browser TTS works free in WKWebView:** The Web Speech API (`speechSynthesis`) is available. Returning `{ "provider": "browser" }` from `/api/tts-settings` enables the "Listen" button with no server-side work.

6. **localStorage persists in WKWebView:** Theme preferences, read/unread state, scroll positions, sidebar collapse state, focus mode — all stored in `localStorage` by the viewer JS. They survive app termination and work automatically.

7. **Auto-refresh polls `/api/files-changed` every 5s:** Returning folder `mtime` is cheap. If the user adds files via another app (e.g., Syncthing), the viewer detects the change and refreshes.

8. **`FileMeta.image` extraction:** The server extracts the first `![...](https://...)` from the article body (after frontmatter) for dashboard thumbnails. The iOS handler should do the same — it's a simple regex on the 3KB head read.

9. **`enclosure_url` vs `enclosureUrl`:** The frontmatter keys use `snake_case` (`enclosure_url`, `enclosure_type`, `enclosure_duration`) but the `FileMeta` JSON uses `camelCase`. The handler must map between them, matching `src/viewer.ts:94-96`.

10. **Info.plist document provider flags:** Set `LSSupportsOpeningDocumentsInPlace: true` and `UISupportsDocumentBrowser: true` so the app can open folders from the Files app and other document providers.

---

## What Works Automatically (No iOS Code Needed)

These viewer features are entirely client-side JS/CSS and work in WKWebView without any Swift support:

- Theme switching (light/dark/auto, stored in localStorage)
- Font selection (Inter, Literata, Lora, Source Serif, Work Sans, OpenDyslexic)
- Font size, line height, content width, paragraph spacing controls
- Article search and filtering
- Read/unread tracking (localStorage)
- Sidebar collapse/expand
- Focus mode (hides sidebar chrome)
- Keyboard shortcuts (for iPad with keyboard)
- Scroll position memory per article
- Dashboard view with reading stats
- Browser-based text-to-speech (Web Speech API)
- Markdown rendering (marked.js — bundled locally)
- Syntax highlighting (highlight.js — bundled locally)

---

## What Doesn't Work (Acceptable for v1)

- **Highlights and notes** — Stored server-side in `~/.config/pullread/`. Stub endpoints return empty. Could add on-device JSON storage in v2.
- **Notebooks** — Same as above.
- **AI summarization** — Requires LLM API keys and server-side calls. 405'd.
- **Auto-tagging** — Same as above.
- **Grammar checking** — Uses server-side NSSpellChecker. 405'd.
- **Feed management / sync** — This is a reader, not a syncer. 405'd.
- **Mermaid diagrams** — Removed from viewer HTML for bundle size. Rare in articles.
- **Favicons** — Would need a favicon cache or on-demand fetch. Returns 404 for now.
- **Server-side TTS (Kokoro)** — Uses browser TTS instead. Works fine.

---

## Verification Checklist

1. Build and run on iOS Simulator
2. Tap "Choose Folder" → pick a folder containing PullRead `.md` files
3. Article list appears in sidebar with titles, domains, dates
4. Tap an article → renders correctly with markdown formatting
5. Syntax-highlighted code blocks work
6. Kill and relaunch app → folder bookmark restores, articles still visible
7. Theme switching works (light/dark/auto, persists across launches)
8. Font switching works
9. External links (article source URLs) open in Safari
10. "Listen" button works (browser TTS reads article aloud)
11. Search filters the article list
12. Empty folder shows graceful empty state
13. iPad: sidebar + content side-by-side layout works
14. Add a new `.md` file to the folder → appears within 5s (auto-refresh)

---

## Future Considerations (Not v1)

- **On-device annotation storage:** Store highlights/notes as JSON files alongside the markdown, or in app-local storage. Would make the viewer fully read-write for personal annotations.
- **Share extension:** "Open in PullRead" from Files or Safari.
- **Widget:** Show recent articles or reading stats.
- **Spotlight indexing:** Index article titles/excerpts for system search.
- **iCloud bookmark sync:** Sync the folder bookmark so iPad and iPhone point at the same folder automatically.
