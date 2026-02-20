# PullRead iOS App — Next Steps

Based on the existing build spec (`2026-02-12-ios-companion-app.md`), here's the concrete implementation plan broken into phases.

---

## Current State

- **Desktop app**: Tauri 2.0 (Rust) with a bundled Bun CLI sidecar for sync/extraction. The viewer is served via a localhost HTTP server inside a Tauri WebView window.
- **Existing spec**: A complete Expo + WebView architecture is designed for the iOS companion app.
- **Viewer**: Self-contained HTML/JS viewer (~400KB) already works in any WebView.
- **Architecture**: Fetch bridge intercepts `/api/*` calls → routes to an Expo native Swift module → reads local `.md` files.
- **Scope**: Read-only companion app. No sync, no accounts, no server.

> **Note**: The iOS app's Swift code (the `FolderAccessModule` Expo native module) is completely separate from the desktop app's Tauri/Rust shell. The desktop app does not use Swift.

---

## How Articles Get to Your Phone

The iOS app is a **reader only** — the desktop PullRead app (Tauri) does all the RSS syncing and article extraction. The `.md` files need to reach your phone via a **shared folder** using a cloud or sync service.

### How iOS folder access works

iOS provides a system-wide **Files** framework. Any app that registers as a "File Provider" (iCloud Drive, Dropbox, Google Drive, OneDrive, etc.) exposes its files through the standard iOS folder picker (`UIDocumentPickerViewController`). PullRead iOS uses this picker.

When you tap "Choose Folder" in the app:

1. iOS presents the system folder picker (same UI as the Files app)
2. You see all installed File Providers — iCloud Drive, Dropbox, Google Drive, On My iPhone, etc.
3. You navigate to the folder containing your PullRead `.md` files and select it
4. iOS grants the app a **security-scoped bookmark** — a persistent permission token that survives app restarts
5. PullRead reads the `.md` files from that folder and displays them in the viewer

### Recommended workflows

**iCloud Drive (simplest for Mac users):**
1. On Mac, set PullRead's `outputPath` in `feeds.json` to a folder inside iCloud Drive:
   `~/Library/Mobile Documents/com~apple~CloudDocs/PullRead/`
2. macOS syncs this folder to iCloud automatically
3. On iPhone, open PullRead iOS → "Choose Folder" → iCloud Drive → PullRead
4. New articles synced on Mac appear on iPhone automatically

**Dropbox:**
1. Set desktop `outputPath` to `~/Dropbox/PullRead/`
2. Install Dropbox app on iPhone (it registers as a File Provider)
3. In PullRead iOS → "Choose Folder" → Dropbox → PullRead

**Google Drive:**
1. Set desktop `outputPath` to a Google Drive folder
2. Install Google Drive app on iPhone
3. In PullRead iOS → "Choose Folder" → Google Drive → your folder

**Syncthing (self-hosted, no cloud):**
1. Use Möbius Sync (iOS Syncthing client) to sync the articles folder directly between Mac and iPhone
2. In PullRead iOS → "Choose Folder" → Möbius Sync → your folder

### Caveats

- **Cloud providers may not pre-download files.** Dropbox/Google Drive keep files "cloud-only" until accessed. PullRead only reads the first 3KB per file for the article list (fast), and downloads the full file when you tap to read. This works transparently.
- **The security-scoped bookmark persists.** You pick the folder once; the app remembers it across launches.
- **No background sync in the iOS app.** It reads whatever files are in the folder at the time. The cloud service handles syncing; PullRead polls the folder modification time every 5 seconds and auto-refreshes when files change.

---

## Phase 1: Project Scaffolding & Viewer Embed

**Goal**: Expo project that loads the viewer HTML in a WebView.

1. **Create Expo project**
   ```bash
   npx create-expo-app pullread-mobile --template blank-typescript
   ```
2. **Install dependencies** — `expo-router`, `expo-asset`, `expo-file-system`, `react-native-webview`, `react-native-safe-area-context`, `react-native-screens`
3. **Prepare the viewer HTML asset**
   - Run `bun run scripts/embed-viewer.ts` in the PullRead source
   - Extract the HTML string, inline CDN dependencies (marked.js, highlight.js, highlight CSS)
   - Remove mermaid, PWA manifest/icon links
   - Save as `pullread-mobile/assets/viewer.html`
4. **Create `lib/viewer-html.ts`** — loads the HTML asset via `expo-asset` + `expo-file-system`
5. **Create `app/_layout.tsx`** and **`app/reader.tsx`** — minimal Stack layout with a full-screen WebView
6. **Verify**: viewer HTML renders in the simulator (will show an empty state since there's no data yet)

### Decision point
The `scripts/prepare-viewer.sh` build step should be automated. Consider whether to:
- (a) Check in a pre-built `viewer.html` and update it manually when the viewer changes
- (b) Script it into the Expo build pipeline so it always reflects the latest viewer

Option (a) is simpler for v1.

---

## Phase 2: Fetch Bridge & API Handler

**Goal**: Wire the WebView to respond to the viewer's API calls with stub data.

1. **Create `lib/fetch-bridge.ts`** — JavaScript injected via `injectedJavaScriptBeforeContentLoaded` that overrides `window.fetch` for `/api/*` paths, routing them through `postMessage`
2. **Create `lib/api-handler.ts`** — routes incoming messages to stub responses:
   - `GET /api/config` → `{ configured: true }` (critical — prevents onboarding wizard)
   - `GET /api/files` → `[]` (empty for now)
   - All other endpoints → safe defaults per the spec
3. **Wire into `reader.tsx`** — `onMessage` handler parses bridge messages, calls `handleApiRequest`, injects response back via `injectJavaScript`
4. **Verify**: app loads, viewer renders with empty article list, no JS errors in console

---

## Phase 3: Native Folder Access Module

**Goal**: Users can pick a folder of `.md` files and browse articles.

1. **Create the Expo native module** — `modules/folder-access/`
   - `expo-module.config.json` — register for iOS
   - `index.ts` — TypeScript interface (`pickFolder`, `restoreFolder`, `listMarkdownFiles`, `readFile`, `getFolderModTime`, `clearFolder`)
   - `ios/FolderAccessModule.swift` — the core Swift implementation
2. **Implement `pickFolder`** — present `UIDocumentPickerViewController` for `.folder` type, save security-scoped bookmark to `UserDefaults`
3. **Implement `restoreFolder`** — resolve saved bookmark on app launch
4. **Implement `listMarkdownFiles`** — enumerate `.md` files, read first 3KB for frontmatter, parse YAML, extract first image URL, return `FileMeta[]` sorted by bookmarked date
5. **Implement `readFile`** — return full contents of a named `.md` file
6. **Implement `getFolderModTime`** — return folder modification timestamp for the viewer's 5-second poll
7. **Create `app/index.tsx`** — welcome screen with "Choose Folder" button, auto-restores on launch
8. **Wire `api-handler.ts`** to use the native module for `/api/files`, `/api/file`, `/api/files-changed`
9. **Verify** against the 15-item checklist in the build spec

### Key gotchas to remember
- Use `.minimalBookmark` (not `.withSecurityScope` — that's macOS-only and will crash)
- Frontmatter snake_case keys (`enclosure_url`) must map to camelCase (`enclosureUrl`)
- `injectedJavaScriptBeforeContentLoaded` timing is critical — the viewer calls `fetch('/api/files')` during init

---

## Phase 4: Polish & Device Testing

**Goal**: Production-quality experience on iPhone and iPad.

1. **Safe area handling** — ensure the WebView respects iOS safe areas (notch, home indicator)
2. **External link handling** — `onShouldStartLoadWithRequest` opens `http(s)` links in Safari
3. **Dark mode** — `useColorScheme()` for the welcome screen; viewer handles its own theme via localStorage
4. **iPad layout** — verify the viewer's sidebar + content layout works at tablet widths
5. **Keyboard shortcuts** — verify that the viewer's keyboard shortcuts work with iPad external keyboards
6. **App icon and splash screen** — design and configure in `app.config.ts`
7. **Test on physical device** — Expo Go won't work (native module); use `npx expo run:ios` or EAS development build

---

## Phase 5: Build & Distribution

**Goal**: App Store submission.

1. **Configure `app.config.ts`** — bundle identifier (`com.pullread.mobile`), version, orientation, `infoPlist` keys for document browser support
2. **EAS Build setup** — `eas build --platform ios --profile production`
3. **Code signing** — Apple Developer account, provisioning profiles
4. **App Store Connect** — create app listing, screenshots, description
5. **TestFlight** — beta distribution for testing
6. **Submit for review**

### App Store review considerations
- This is not "just a website in a wrapper" — it has a native folder picker, security-scoped bookmarks, and reads local files. This provides functionality beyond what Safari can do.
- The `UISupportsDocumentBrowser` and `LSSupportsOpeningDocumentsInPlace` Info.plist keys signal to Apple that this is a document-based app.

---

## Phase 6: Manual Sync (On-Device Article Fetching)

**Goal**: Let users sync RSS feeds directly from iOS, without needing the desktop app.

The extraction pipeline is almost entirely pure JavaScript — the core libraries (`fast-xml-parser`, `@mozilla/readability`, `linkedom`, `turndown`) have zero platform dependencies. This phase ports the sync logic to run in the React Native JS runtime, writing `.md` files directly to the user's selected folder.

### Why this works

| Component | Desktop (Bun) | iOS (React Native) | Portability |
|-----------|---------------|---------------------|-------------|
| Feed parsing | `fast-xml-parser` | Same library | Pure JS — zero changes |
| HTTP fetching | `fetch()` | `fetch()` | Works in Hermes runtime |
| DOM + Readability | `linkedom` + `@mozilla/readability` | Same libraries | Pure JS — zero changes |
| HTML→Markdown | `turndown` | Same library | Pure JS — zero changes |
| URL tracking DB | `bun:sqlite` | `expo-sqlite` | Same SQLite, different wrapper |
| File writing | Node `fs` | `FolderAccessModule.writeFile()` | New native method |
| Chrome cookies | macOS Keychain decryption | N/A — see WKWebView login below | Different mechanism |
| YouTube transcripts | `fetch()` + XML parsing | Same | Pure JS |
| Twitter/X via fxtwitter | `fetch()` + JSON | Same | Pure JS |
| PDF extraction | `unpdf` (PDF.js/Wasm) | Needs testing — may need fallback | Medium risk |

### Architecture

```
User taps "Sync Now"
        │
        ▼
┌─────────────────────────────────────────────┐
│  sync-engine.ts (React Native JS runtime)   │
│                                              │
│  1. Read feed config (expo-sqlite or JSON)   │
│  2. For each feed URL:                       │
│     a. fetch() the RSS/Atom XML              │
│     b. Parse with fast-xml-parser            │
│     c. For each new article URL:             │
│        - Check expo-sqlite (already synced?) │
│        - fetch() the article page            │
│        - linkedom → Readability → extract    │
│        - turndown → markdown                 │
│        - FolderAccess.writeFile() → .md      │
│        - Record in expo-sqlite               │
│  3. Update UI with sync progress             │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  FolderAccessModule.swift                    │
│  (existing module + new writeFile method)    │
│                                              │
│  writeFile(filename, content) → writes .md   │
│  to the security-scoped bookmarked folder    │
└─────────────────────────────────────────────┘
               │
               ▼
      iCloud Drive / Dropbox / etc.
      (syncs back to desktop too)
```

### Implementation steps

1. **Add `writeFile` to `FolderAccessModule.swift`**
   ```swift
   AsyncFunction("writeFile") { (filename: String, content: String) in
       guard let folderURL = Self.resolveBookmark() else { throw ... }
       let fileURL = folderURL.appendingPathComponent(filename)
       try content.write(to: fileURL, atomically: true, encoding: .utf8)
   }
   ```

2. **Add `expo-sqlite` for URL tracking**
   - Same schema as the desktop's `pullread.db`: `processed_urls(url TEXT PRIMARY KEY, filename TEXT, synced_at TEXT)`
   - Prevents re-fetching articles that were already synced (by desktop or by a previous iOS sync)

3. **Port the extraction pipeline**
   - Copy `feed.ts`, `extractor.ts`, `writer.ts` into `pullread-mobile/lib/sync/`
   - Replace `fs.writeFileSync` → `FolderAccess.writeFile()`
   - Replace `bun:sqlite` → `expo-sqlite`
   - Remove `cookies.ts` import (replaced by WKWebView login — see below)
   - Remove `unpdf` initially (PDF articles get skipped; add back if Wasm works in Hermes)

4. **Feed configuration UI**
   - Simple screen to add/remove RSS feed URLs
   - Option to import `feeds.json` from the same folder (auto-detect on folder pick)
   - Store feed list in `expo-sqlite`

5. **Sync UI**
   - "Sync Now" button on the main screen
   - Progress indicator: "Fetching TechCrunch... 3/12 articles"
   - Sync only runs while app is in foreground (iOS kills background work)
   - Sequential processing (one article at a time) to stay within iOS memory limits

6. **Wire into the viewer**
   - Change `api-handler.ts` to return `{ syncInterval: 'manual' }` with a sync action
   - After sync completes, the existing folder poll detects new files and auto-refreshes

### Authenticated content via WKWebView login

For paywalled sites (Medium, NYT, etc.), the iOS app can't read Safari's cookies. Instead:

1. **"Manage Logins" settings screen** — lists domains the user can authenticate with
2. User taps "Log in to Medium" → app opens a `WKWebView` to `medium.com`
3. User logs in normally — **iCloud Keychain autofill works**, so it's typically one tap
4. App reads cookies via `WKHTTPCookieStore.getAllCookies()`
   ```swift
   webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
       let domainCookies = cookies.filter { $0.domain.contains("medium.com") }
       // Persist to Keychain for use during sync
   }
   ```
5. During sync, attach stored cookies to fetch requests for that domain
6. Cookies persist in the app's WKWebView data store across launches

This is the same approach used by Reeder, Fiery Feeds, and other iOS RSS readers for authenticated feeds. It's arguably **more transparent** than the desktop approach (silently reading Chrome cookies) — the user explicitly chooses which sites to authenticate.

### iOS-specific constraints

- **Foreground only** — iOS aggressively kills background tasks. Sync runs only while the app is open. "Manual sync while the app is open" is the design intent.
- **No Chrome cookies** — replaced by the WKWebView login flow above.
- **Memory** — sequential article processing (already the desktop's approach) keeps memory usage low.
- **Network** — iOS apps can make arbitrary HTTP requests in the foreground. No restrictions.
- **App Store** — plenty of RSS readers (Reeder, NetNewsWire, Unread) do exactly this. Apple won't object.
- **Bidirectional sync via shared folder** — articles synced on iOS appear on desktop (and vice versa) through the cloud service. No custom sync protocol needed.

### What this unlocks

- **Phone-only users** — can use PullRead without a Mac at all
- **Travel/offline prep** — sync articles to the phone before going offline
- **Bidirectional** — desktop syncs show up on phone; phone syncs show up on desktop
- **Same pipeline** — identical extraction quality (Readability, Turndown, etc.)
- **Authenticated feeds** — WKWebView login handles paywalled content

---

## Future (v2+)

Features to consider after the initial release:

| Feature | Approach |
|---------|----------|
| **Highlights & notes** | On-device JSON storage via `expo-file-system`, bridged to viewer via POST endpoints |
| **Share extension** | Accept URLs from Safari → save to a "to read" queue, extract on next sync |
| **Widgets** | Show reading stats or recent articles on home screen |
| **Background App Refresh** | Lightweight check for new feed items (iOS allows ~30s of background work) |
| **Spotlight search** | Index article titles via Core Spotlight |
| **Shortcuts integration** | "Sync feeds" or "Open latest article" Siri Shortcuts |
| **Safari cookies (macOS desktop)** | Add Safari support to the desktop tool — `~/Library/Cookies/Cookies.binarycookies` is unencrypted binary (simpler than Chrome's AES), but requires Full Disk Access permission |

---

## Why Expo + WebView (vs. alternatives)

The existing build spec chose Expo + WebView. Here's the rationale against alternatives:

| Approach | Verdict |
|----------|---------|
| **Capacitor** | Lower effort (wraps web app as-is), but less native feel, WKWebView quirks, and Apple may flag it as "just a website." Expo's native module gives us genuine native functionality. |
| **PWA** | iOS aggressively evicts Service Worker caches — a dealbreaker for offline reading. No App Store presence. |
| **Full React Native rewrite** | Would require rewriting the entire viewer UI in React Native components. The viewer is 14 JS modules and works perfectly in WebView. No benefit to rewriting. |
| **Swift/SwiftUI native** | Best possible quality, but zero code reuse and months of work. Not justified when the viewer already exists. |
| **Expo + WebView** (chosen) | Reuses the viewer unchanged. Native module for folder access. App Store distributable. Clean separation between viewer (web) and platform (native). |

The key insight is that PullRead's viewer is already a self-contained, framework-agnostic HTML app with a clean API boundary. The WebView approach leverages this architecture rather than fighting it.
