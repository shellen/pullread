# PullRead iOS Companion App — Expo Build Spec

Build a React Native (Expo) app that lets users browse PullRead markdown articles on iOS. The app reuses an existing self-contained HTML viewer (14 JS modules + CSS inlined into one HTML file) by loading it in a WebView and intercepting its API calls.

**No server. No account. No sync.** The user picks a folder of `.md` files and reads them.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  WebView (react-native-webview)                  │
│                                                  │
│  Loads viewer.html (400KB self-contained HTML)   │
│  Viewer JS calls fetch('/api/files'), etc.       │
│                                                  │
│  Injected JS overrides window.fetch():           │
│  - /api/* → postMessage to React Native          │
│  - External URLs → original fetch (pass through) │
│                                                  │
│  React Native resolves via injectJavaScript()    │
│  → window.__resolveApiFetch(id, status, body)    │
│  → Promise resolves → viewer renders normally    │
└────────────────────┬─────────────────────────────┘
                     │ postMessage / injectJavaScript
                     ▼
┌──────────────────────────────────────────────────┐
│  React Native (Expo)                             │
│                                                  │
│  api-handler.ts routes requests:                 │
│  - GET /api/files → native module reads folder   │
│  - GET /api/file?name=X → native module reads md │
│  - GET /api/config → { configured: true }        │
│  - POST anything → 405 (read-only)               │
│                                                  │
│  Native module (Swift) handles:                  │
│  - iOS folder picker (UIDocumentPickerVC)        │
│  - Security-scoped bookmarks (persist access)    │
│  - File enumeration + frontmatter parsing        │
└──────────────────────────────────────────────────┘
```

**Why this works:** The viewer already separates data access from rendering. All data comes via `fetch('/api/*')` calls. The injected JS intercepts these and routes them to React Native, which reads local files via a native Swift module. External requests (Google Fonts, etc.) pass through to the real `fetch()`.

**Why not a local HTTP server:** No first-party Expo package for that. The fetch bridge is ~40 lines and works reliably.

---

## Project Structure

```
pullread-mobile/
├── app/
│   ├── _layout.tsx                   — Expo Router root layout
│   ├── index.tsx                     — Welcome screen with "Choose Folder" button
│   └── reader.tsx                    — Full-screen WebView reader
├── lib/
│   ├── fetch-bridge.ts              — JavaScript injected into WebView to intercept fetch()
│   ├── api-handler.ts               — Routes API requests from WebView to native module
│   └── viewer-html.ts               — Loads the viewer HTML asset
├── modules/
│   └── folder-access/
│       ├── index.ts                 — TypeScript interface to native module
│       ├── expo-module.config.json  — Expo module registration
│       └── ios/
│           └── FolderAccessModule.swift  — Folder picker + file I/O + frontmatter parser
├── assets/
│   └── viewer.html                  — Pre-built embedded viewer (see preparation steps below)
├── scripts/
│   └── prepare-viewer.sh           — Builds viewer.html from PullRead source
├── app.config.ts
├── package.json
└── tsconfig.json
```

---

## Dependencies

**package.json:**

```json
{
  "name": "pullread-mobile",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "build": "eas build --platform ios",
    "prepare-viewer": "./scripts/prepare-viewer.sh"
  },
  "dependencies": {
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "expo-status-bar": "~2.0.0",
    "expo-asset": "~11.0.0",
    "expo-file-system": "~18.0.0",
    "react": "18.3.1",
    "react-native": "0.76.0",
    "react-native-webview": "13.12.0",
    "react-native-safe-area-context": "4.14.0",
    "react-native-screens": "~4.4.0"
  },
  "devDependencies": {
    "@types/react": "~18.3.0",
    "typescript": "~5.3.0"
  }
}
```

---

## Configuration

**app.config.ts:**

```typescript
import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'PullRead',
  slug: 'pullread-mobile',
  version: '1.0.0',
  orientation: 'default',
  scheme: 'pullread',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.pullread.mobile',
    supportsTablet: true,
    infoPlist: {
      LSSupportsOpeningDocumentsInPlace: true,
      UISupportsDocumentBrowser: true,
    },
  },
  plugins: [
    './modules/folder-access',
  ],
};

export default config;
```

**tsconfig.json:**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

---

## Source Files

### `app/_layout.tsx`

Root layout. Two screens, no header (the viewer has its own UI).

```tsx
import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="reader" />
    </Stack>
  );
}
```

---

### `app/index.tsx`

Welcome screen. On mount, tries to restore a previously saved folder bookmark. If found, navigates straight to reader. Otherwise shows a "Choose Folder" button.

```tsx
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import FolderAccess from '../modules/folder-access';

export default function WelcomeScreen() {
  const isDark = useColorScheme() === 'dark';
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    FolderAccess.restoreFolder()
      .then((name: string | null) => {
        if (name) {
          router.replace('/reader');
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, []);

  const handlePickFolder = async () => {
    try {
      const folderName = await FolderAccess.pickFolder();
      if (folderName) {
        router.replace('/reader');
      }
    } catch (e) {
      console.error('Folder pick failed:', e);
    }
  };

  if (checking) return <View style={[styles.container, isDark && styles.dark]} />;

  return (
    <View style={[styles.container, isDark && styles.dark]}>
      <StatusBar style="auto" />
      <Text style={[styles.title, isDark && styles.textLight]}>PullRead</Text>
      <Text style={[styles.subtitle, isDark && styles.textMuted]}>
        Read your PullRead articles on iOS.{'\n'}
        Point this app at a folder of markdown files.
      </Text>
      <TouchableOpacity style={styles.button} onPress={handlePickFolder}>
        <Text style={styles.buttonText}>Choose Folder</Text>
      </TouchableOpacity>
      <Text style={[styles.hint, isDark && styles.textMuted]}>
        Works with iCloud Drive, Dropbox, Syncthing,{'\n'}or any Files provider.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#fff' },
  dark: { backgroundColor: '#1a1a1a' },
  title: { fontSize: 36, fontWeight: '700', marginBottom: 12, color: '#000' },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 32, lineHeight: 24, color: '#444' },
  hint: { fontSize: 13, textAlign: 'center', marginTop: 20, color: '#888', lineHeight: 20 },
  textLight: { color: '#fff' },
  textMuted: { color: '#999' },
  button: { backgroundColor: '#2563eb', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 10 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
```

---

### `app/reader.tsx`

Full-screen WebView that loads the viewer HTML. Handles the fetch bridge message loop and external link interception.

```tsx
import { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { FETCH_BRIDGE_JS } from '../lib/fetch-bridge';
import { handleApiRequest } from '../lib/api-handler';
import { getViewerHtml } from '../lib/viewer-html';

export default function ReaderScreen() {
  const webViewRef = useRef<WebView>(null);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    getViewerHtml().then(setHtml);
  }, []);

  const onMessage = async (event: WebViewMessageEvent) => {
    let msg;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type !== 'api') return;

    const { id, url, method } = msg;
    const result = await handleApiRequest(url, method);

    // Send response back to WebView, resolving the pending Promise
    const escaped = JSON.stringify(result.body);
    webViewRef.current?.injectJavaScript(
      `window.__resolveApiFetch(${id},${result.status},${JSON.stringify(result.contentType)},${escaped});true;`
    );
  };

  if (!html) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <WebView
        ref={webViewRef}
        source={{ html, baseUrl: '' }}
        style={styles.webview}
        injectedJavaScriptBeforeContentLoaded={FETCH_BRIDGE_JS}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(request) => {
          // Allow the initial HTML load
          if (request.url === 'about:blank' || request.url.startsWith('about:srcdoc')) {
            return true;
          }
          // Open http/https links in Safari
          if (request.url.startsWith('http://') || request.url.startsWith('https://')) {
            Linking.openURL(request.url);
            return false;
          }
          return true;
        }}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        contentMode="mobile"
        textInteractionEnabled={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  webview: { flex: 1 },
});
```

---

### `lib/fetch-bridge.ts`

JavaScript string injected into the WebView **before** the viewer's own JS executes. Overrides `window.fetch` so that `/api/*` requests go through `postMessage` instead of the network. External URLs (Google Fonts, etc.) pass through to the real `fetch()`.

```typescript
export const FETCH_BRIDGE_JS = `
(function() {
  var _originalFetch = window.fetch;
  var _pending = {};
  var _nextId = 0;

  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    var method = (init && init.method) ? init.method.toUpperCase() : 'GET';

    // Only intercept local API requests
    if (url.startsWith('/api/') || url.startsWith('/favicons/')) {
      return new Promise(function(resolve, reject) {
        var id = ++_nextId;
        _pending[id] = { resolve: resolve, reject: reject };
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'api',
          id: id,
          url: url,
          method: method,
          body: (init && init.body) ? init.body : null
        }));
        // Timeout after 30 seconds
        setTimeout(function() {
          if (_pending[id]) {
            delete _pending[id];
            reject(new Error('Request timeout: ' + url));
          }
        }, 30000);
      });
    }

    // Pass through external requests (Google Fonts, CDN, etc.)
    return _originalFetch.apply(this, arguments);
  };

  // Called from React Native to resolve a pending fetch request.
  // Parameters: request id, HTTP status, content-type header, response body string.
  window.__resolveApiFetch = function(id, status, contentType, body) {
    var p = _pending[id];
    if (!p) return;
    delete _pending[id];
    p.resolve(new Response(body, {
      status: status,
      headers: { 'Content-Type': contentType }
    }));
  };

  // Platform detection flag (matches existing window.PR_TAURI pattern)
  window.PR_IOS = true;
})();
true;
`;
```

**Why `injectedJavaScriptBeforeContentLoaded`:** The viewer calls `fetch('/api/files')` during initialization (in `init()` at the end of the last JS module). The bridge must be in place before any `<script>` tags execute.

**The `true;` at the end:** Required by react-native-webview to avoid a console warning. `injectedJavaScript` strings must evaluate to a value.

---

### `lib/api-handler.ts`

Routes API requests from the WebView to the native module or returns stub responses. This is the mapping layer between the viewer's HTTP API expectations and the local filesystem.

```typescript
import FolderAccess from '../modules/folder-access';

interface ApiResponse {
  status: number;
  contentType: string;
  body: string;
}

export async function handleApiRequest(url: string, method: string): Promise<ApiResponse> {
  // All non-GET requests → 405 (this is a read-only viewer)
  if (method !== 'GET') {
    return json(405, { error: 'Read-only viewer' });
  }

  try {
    // --- Core endpoints (implemented) ---

    // List all markdown files with metadata
    if (url === '/api/files') {
      const files = await FolderAccess.listMarkdownFiles();
      return json(200, files);
    }

    // Read a specific markdown file
    if (url.startsWith('/api/file?name=')) {
      const name = decodeURIComponent(url.split('name=')[1]);
      if (name.includes('..') || name.includes('/')) {
        return json(400, { error: 'Invalid filename' });
      }
      const content = await FolderAccess.readFile(name);
      return { status: 200, contentType: 'text/plain', body: content };
    }

    // Folder modification timestamp (viewer polls this every 5s for auto-refresh)
    if (url === '/api/files-changed') {
      const mtime = await FolderAccess.getFolderModTime();
      return json(200, { changedAt: mtime });
    }

    // --- Stub endpoints (return safe defaults) ---

    // CRITICAL: must return configured:true or the onboarding wizard appears
    if (url === '/api/config') {
      return json(200, { feeds: {}, configured: true });
    }

    // Enable browser text-to-speech (Web Speech API works in WKWebView)
    if (url === '/api/tts-settings') {
      return json(200, { provider: 'browser' });
    }

    if (url === '/api/sync-status') {
      return json(200, { syncInterval: 'manual' });
    }

    // Highlights: empty index or empty per-article
    if (url === '/api/highlights' || url.startsWith('/api/highlights?')) {
      return json(200, {});
    }

    // Notes: empty index or empty per-article
    if (url === '/api/notes') {
      return json(200, {});
    }
    if (url.startsWith('/api/notes?')) {
      return json(200, { annotations: [], tags: [], isFavorite: false });
    }

    // Notebooks: empty array
    if (url === '/api/notebooks') {
      return json(200, []);
    }

    // LLM settings: empty
    if (url === '/api/settings') {
      return json(200, {});
    }

    // Favicons: not available
    if (url.startsWith('/favicons/')) {
      return { status: 404, contentType: 'text/plain', body: '' };
    }

    return json(404, { error: 'Not found' });

  } catch (e: any) {
    return json(500, { error: e.message || 'Internal error' });
  }
}

function json(status: number, data: any): ApiResponse {
  return { status, contentType: 'application/json', body: JSON.stringify(data) };
}
```

---

### `lib/viewer-html.ts`

Loads the viewer HTML from the app's asset bundle. The HTML is a pre-built ~500KB file containing the full viewer UI (14 JS modules + CSS + SVG icons, all inlined).

```typescript
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

let cached: string | null = null;

export async function getViewerHtml(): Promise<string> {
  if (cached) return cached;

  const asset = Asset.fromModule(require('../assets/viewer.html'));
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('Failed to load viewer.html asset');

  cached = await FileSystem.readAsStringAsync(asset.localUri);
  return cached;
}
```

---

### `modules/folder-access/index.ts`

TypeScript interface to the native Swift module. Defines the exact shape of `FileMeta` that the viewer expects.

```typescript
import { requireNativeModule } from 'expo-modules-core';

// Matches the FileMeta shape expected by the PullRead viewer JS.
// See: src/viewer.ts lines 17-34 in the PullRead source.
export interface FileMeta {
  filename: string;       // e.g. "2024-03-15-some-article.md"
  title: string;          // from frontmatter, or filename without .md
  url: string;            // original article URL
  domain: string;         // e.g. "example.com"
  bookmarked: string;     // ISO 8601 timestamp
  feed: string;           // feed source URL
  author: string;         // article author
  mtime: string;          // ISO 8601 file modification time
  hasSummary: boolean;    // true if frontmatter contains "summary" key
  summaryProvider: string;
  summaryModel: string;
  excerpt: string;
  image: string;          // first image URL from article body
  enclosureUrl: string;   // podcast audio URL (frontmatter key: enclosure_url)
  enclosureType: string;  // MIME type (frontmatter key: enclosure_type)
  enclosureDuration: string; // seconds (frontmatter key: enclosure_duration)
}

interface FolderAccessModule {
  pickFolder(): Promise<string | null>;
  restoreFolder(): Promise<string | null>;
  listMarkdownFiles(): Promise<FileMeta[]>;
  readFile(filename: string): Promise<string>;
  getFolderModTime(): Promise<number>;
  clearFolder(): Promise<void>;
}

export default requireNativeModule<FolderAccessModule>('FolderAccess');
```

---

### `modules/folder-access/expo-module.config.json`

```json
{
  "platforms": ["ios"],
  "ios": {
    "modules": ["FolderAccessModule"]
  }
}
```

---

### `modules/folder-access/ios/FolderAccessModule.swift`

The native Swift module. Handles:
- Presenting the iOS folder picker (`UIDocumentPickerViewController`)
- Creating and restoring security-scoped bookmarks (so the folder persists across app launches)
- Enumerating `.md` files and parsing YAML frontmatter
- Reading individual files
- Returning folder modification timestamp for change detection

```swift
import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

public class FolderAccessModule: Module {
    private static let bookmarkKey = "pullread_folder_bookmark"

    public func definition() -> ModuleDefinition {
        Name("FolderAccess")

        // Present iOS folder picker. Returns folder name on success, nil on cancel.
        // Saves a security-scoped bookmark to UserDefaults for persistence.
        AsyncFunction("pickFolder") { (promise: Promise) in
            DispatchQueue.main.async {
                guard let windowScene = UIApplication.shared.connectedScenes
                    .compactMap({ $0 as? UIWindowScene }).first,
                      let rootVC = windowScene.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
                    promise.reject("NO_VC", "No root view controller found")
                    return
                }

                let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
                picker.allowsMultipleSelection = false

                let delegate = PickerDelegate { url in
                    guard let url = url else {
                        promise.resolve(nil as String?)
                        return
                    }
                    do {
                        // .minimalBookmark is correct for iOS.
                        // .withSecurityScope is macOS-only and will crash here.
                        let bookmark = try url.bookmarkData(
                            options: .minimalBookmark,
                            includingResourceValuesForKeys: nil,
                            relativeTo: nil
                        )
                        UserDefaults.standard.set(bookmark, forKey: FolderAccessModule.bookmarkKey)
                        promise.resolve(url.lastPathComponent)
                    } catch {
                        promise.reject("BOOKMARK", error.localizedDescription)
                    }
                }

                // Prevent delegate from being deallocated while picker is presented
                objc_setAssociatedObject(picker, "delegate", delegate, .OBJC_ASSOCIATION_RETAIN)
                picker.delegate = delegate
                rootVC.present(picker, animated: true)
            }
        }

        // Try to restore a previously saved folder bookmark.
        // Returns the folder name if successful, nil if stale or missing.
        AsyncFunction("restoreFolder") { () -> String? in
            guard let url = Self.resolveBookmark() else { return nil }
            return url.lastPathComponent
        }

        // Enumerate .md files in the bookmarked folder.
        // Reads first 3KB of each file for frontmatter + image extraction.
        // Returns array matching the FileMeta JSON shape the viewer expects.
        AsyncFunction("listMarkdownFiles") { () -> [[String: Any]] in
            guard let folderURL = Self.resolveBookmark() else {
                throw NSError(domain: "FolderAccess", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "No folder selected"])
            }

            let fm = FileManager.default
            let keys: [URLResourceKey] = [.contentModificationDateKey, .isRegularFileKey]
            guard let items = try? fm.contentsOfDirectory(
                at: folderURL, includingPropertiesForKeys: keys
            ) else {
                return []
            }

            let isoFormatter = ISO8601DateFormatter()
            var results: [[String: Any]] = []

            for item in items {
                guard item.pathExtension == "md" else { continue }
                guard let values = try? item.resourceValues(forKeys: Set(keys)),
                      values.isRegularFile == true else { continue }

                let filename = item.lastPathComponent
                let mtime = values.contentModificationDate ?? Date(timeIntervalSince1970: 0)
                let mtimeISO = isoFormatter.string(from: mtime)

                // Read only first 3KB (matches server-side behavior for performance)
                guard let handle = try? FileHandle(forReadingFrom: item) else { continue }
                let headData = handle.readData(ofLength: 3072)
                handle.closeFile()
                guard let head = String(data: headData, encoding: .utf8) else { continue }

                let meta = Self.parseFrontmatter(head)

                // Extract first markdown image URL from body (for dashboard thumbnails)
                var image = ""
                if let fmEndRange = head.range(of: "\n---\n") {
                    let body = String(head[fmEndRange.upperBound...])
                    if let match = body.range(
                        of: #"!\[.*?\]\((https?://[^)]+)\)"#,
                        options: .regularExpression
                    ) {
                        let full = String(body[match])
                        if let lp = full.firstIndex(of: "("),
                           let rp = full.lastIndex(of: ")") {
                            let start = full.index(after: lp)
                            image = String(full[start..<rp])
                        }
                    }
                }

                results.append([
                    "filename": filename,
                    "title": meta["title"] ?? filename.replacingOccurrences(of: ".md", with: ""),
                    "url": meta["url"] ?? "",
                    "domain": meta["domain"] ?? "",
                    "bookmarked": meta["bookmarked"] ?? "",
                    "feed": meta["feed"] ?? "",
                    "author": meta["author"] ?? "",
                    "mtime": mtimeISO,
                    "hasSummary": meta["summary"] != nil && !meta["summary"]!.isEmpty,
                    "summaryProvider": meta["summaryProvider"] ?? "",
                    "summaryModel": meta["summaryModel"] ?? "",
                    "excerpt": meta["excerpt"] ?? "",
                    "image": image,
                    // Note: frontmatter keys use snake_case but FileMeta uses camelCase
                    "enclosureUrl": meta["enclosure_url"] ?? "",
                    "enclosureType": meta["enclosure_type"] ?? "",
                    "enclosureDuration": meta["enclosure_duration"] ?? "",
                ])
            }

            // Sort by bookmarked date descending, fall back to mtime
            results.sort { a, b in
                let dateA = {
                    let bm = a["bookmarked"] as? String ?? ""
                    return bm.isEmpty ? (a["mtime"] as? String ?? "") : bm
                }()
                let dateB = {
                    let bm = b["bookmarked"] as? String ?? ""
                    return bm.isEmpty ? (b["mtime"] as? String ?? "") : bm
                }()
                return dateB > dateA
            }

            return results
        }

        // Read the full content of a specific markdown file.
        AsyncFunction("readFile") { (filename: String) -> String in
            guard let folderURL = Self.resolveBookmark() else {
                throw NSError(domain: "FolderAccess", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "No folder selected"])
            }
            let fileURL = folderURL.appendingPathComponent(filename)
            return try String(contentsOf: fileURL, encoding: .utf8)
        }

        // Return folder modification timestamp (seconds since epoch).
        // The viewer polls this every 5s and only does a full refresh when it changes.
        AsyncFunction("getFolderModTime") { () -> Double in
            guard let url = Self.resolveBookmark() else { return 0 }
            let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
            let date = attrs?[.modificationDate] as? Date ?? Date(timeIntervalSince1970: 0)
            return date.timeIntervalSince1970
        }

        // Remove the saved folder bookmark (for "change folder" functionality).
        AsyncFunction("clearFolder") { () in
            UserDefaults.standard.removeObject(forKey: FolderAccessModule.bookmarkKey)
        }
    }

    // MARK: - Resolve saved bookmark to a URL with security-scoped access

    private static func resolveBookmark() -> URL? {
        guard let data = UserDefaults.standard.data(forKey: bookmarkKey) else { return nil }
        var isStale = false
        guard let url = try? URL(
            resolvingBookmarkData: data,
            bookmarkDataIsStale: &isStale
        ) else { return nil }
        if isStale {
            UserDefaults.standard.removeObject(forKey: bookmarkKey)
            return nil
        }
        guard url.startAccessingSecurityScopedResource() else { return nil }
        return url
    }

    // MARK: - Frontmatter parser
    // Direct port of parseFrontmatter() from viewer/02-utils.js and src/viewer.ts.
    // Format: YAML-style key:value pairs between --- delimiters.

    private static func parseFrontmatter(_ text: String) -> [String: String] {
        guard text.hasPrefix("---\n") else { return [:] }
        let searchStart = text.index(text.startIndex, offsetBy: 4)
        guard let endRange = text.range(of: "\n---", range: searchStart..<text.endIndex) else {
            return [:]
        }
        let block = String(text[searchStart..<endRange.lowerBound])
        var meta: [String: String] = [:]
        for line in block.split(separator: "\n", omittingEmptySubsequences: false) {
            guard let colonIdx = line.firstIndex(of: ":") else { continue }
            let key = line[line.startIndex..<colonIdx].trimmingCharacters(in: .whitespaces)
            var val = line[line.index(after: colonIdx)...].trimmingCharacters(in: .whitespaces)
            // Strip surrounding quotes and unescape
            if val.hasPrefix("\"") && val.hasSuffix("\"") && val.count >= 2 {
                val = String(val.dropFirst().dropLast())
                val = val.replacingOccurrences(of: "\\\"", with: "\"")
            }
            if !key.isEmpty {
                meta[key] = val
            }
        }
        return meta
    }
}

// MARK: - UIDocumentPickerDelegate wrapper

private class PickerDelegate: NSObject, UIDocumentPickerDelegate {
    private let completion: (URL?) -> Void

    init(completion: @escaping (URL?) -> Void) {
        self.completion = completion
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        completion(urls.first)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        completion(nil)
    }
}
```

---

## Viewer HTML Preparation

The viewer HTML is a self-contained file generated by the PullRead build system. It contains all CSS, all 14 JS modules, and SVG icon sprites inlined into one HTML file (~400KB).

For the iOS app, we need to modify it so that the third-party libraries (marked.js, highlight.js) are also inlined rather than loaded from CDN — this makes the viewer work fully offline.

### Step-by-step

**1. Build the embedded viewer** (requires the PullRead source repo with `bun` installed):

```bash
cd /path/to/pullread
bun run scripts/embed-viewer.ts
```

This produces `src/viewer-html.ts` containing the full HTML as a JS string.

**2. Extract the HTML string:**

```bash
node -e "
  const src = require('fs').readFileSync('src/viewer-html.ts', 'utf8');
  const match = src.match(/export const VIEWER_HTML = (.*);/s);
  require('fs').writeFileSync('/tmp/viewer-raw.html', JSON.parse(match[1]));
"
```

**3. Download libraries for offline inlining:**

```bash
curl -sL "https://cdn.jsdelivr.net/npm/marked/marked.min.js" -o /tmp/marked.min.js
curl -sL "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/highlight.min.js" -o /tmp/highlight.min.js
curl -sL "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/styles/github.min.css" -o /tmp/github.min.css
curl -sL "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/styles/github-dark.min.css" -o /tmp/github-dark.min.css
```

**4. Patch the HTML** (replace CDN tags with inline, remove mermaid):

```bash
node -e "
  const fs = require('fs');
  let html = fs.readFileSync('/tmp/viewer-raw.html', 'utf8');
  const marked = fs.readFileSync('/tmp/marked.min.js', 'utf8');
  const hljs = fs.readFileSync('/tmp/highlight.min.js', 'utf8');
  const lightCss = fs.readFileSync('/tmp/github.min.css', 'utf8');
  const darkCss = fs.readFileSync('/tmp/github-dark.min.css', 'utf8');

  // Replace marked.js CDN with inline
  html = html.replace(
    /<script src=\"https:\/\/cdn\.jsdelivr\.net\/npm\/marked\/marked\.min\.js\"><\/script>/,
    '<script>' + marked + '<\/script>'
  );

  // Replace highlight.js CDN with inline
  html = html.replace(
    /<script src=\"https:\/\/cdn\.jsdelivr\.net\/gh\/highlightjs\/cdn-release@11\/build\/highlight\.min\.js\"><\/script>/,
    '<script>' + hljs + '<\/script>'
  );

  // Replace highlight.js light CSS — preserve id='hljs-light' (used by theme switcher)
  html = html.replace(
    /<link rel=\"stylesheet\" href=\"https:\/\/cdn\.jsdelivr\.net\/gh\/highlightjs\/cdn-release@11\/build\/styles\/github\.min\.css\"[^>]*>/,
    '<style id=\"hljs-light\" media=\"(prefers-color-scheme: light)\">' + lightCss + '</style>'
  );

  // Replace highlight.js dark CSS — preserve id='hljs-dark' (used by theme switcher)
  html = html.replace(
    /<link rel=\"stylesheet\" href=\"https:\/\/cdn\.jsdelivr\.net\/gh\/highlightjs\/cdn-release@11\/build\/styles\/github-dark\.min\.css\"[^>]*>/,
    '<style id=\"hljs-dark\" media=\"(prefers-color-scheme: dark)\">' + darkCss + '</style>'
  );

  // Remove mermaid (not needed for v1, saves ~300KB if it were bundled)
  html = html.replace(/<script src=\"https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@11\/dist\/mermaid\.min\.js\"><\/script>/, '');

  // Remove PWA manifest/icon links (native app doesn't need these)
  html = html.replace(/<link rel=\"manifest\"[^>]*>/, '');
  html = html.replace(/<link rel=\"apple-touch-icon\"[^>]*>/, '');
  html = html.replace(/<link rel=\"icon\"[^>]*>/, '');

  fs.writeFileSync('/tmp/viewer-ios.html', html);
  console.log('Output: ' + html.length + ' bytes');
"
```

**5. Copy to the project:**

```bash
cp /tmp/viewer-ios.html pullread-mobile/assets/viewer.html
```

**Important notes about the viewer HTML:**
- The `id="hljs-light"` and `id="hljs-dark"` attributes MUST be preserved on the style tags. The viewer's `updateHljsTheme()` function (in `04-article.js:658-671`) toggles the `media` attribute on these elements to switch syntax highlighting themes.
- Google Fonts CDN links are left as-is. They load when online and degrade gracefully to system fonts when offline.
- The OpenDyslexic font CDN link is also left as-is (accessibility font, rarely needed offline).

---

## Complete API Contract

Every `/api/*` endpoint the viewer calls, with the exact response this app returns.

### Implemented (reads local files)

| Endpoint | Response |
|----------|----------|
| `GET /api/files` | JSON array of FileMeta objects. Each has: `filename`, `title`, `url`, `domain`, `bookmarked`, `feed`, `author`, `mtime` (ISO 8601), `hasSummary` (bool), `summaryProvider`, `summaryModel`, `excerpt`, `image`, `enclosureUrl`, `enclosureType`, `enclosureDuration`. Sorted by `bookmarked` descending, falls back to `mtime`. |
| `GET /api/file?name=<filename>` | Raw markdown text (`text/plain`). Full file contents. Filename is validated: rejected if it contains `..` or `/`. |
| `GET /api/files-changed` | `{ "changedAt": 1707753600.123 }` — Folder modification time as seconds since epoch. Viewer polls this every 5 seconds; only does a full `/api/files` refresh when the value changes. |

### Stubs (return safe defaults)

| Endpoint | Response | Why |
|----------|----------|-----|
| `GET /api/config` | `{ "feeds": {}, "configured": true }` | **`configured: true` is critical.** Without it, a 5-step onboarding wizard appears asking to set up RSS feeds. |
| `GET /api/tts-settings` | `{ "provider": "browser" }` | Enables the "Listen" button using Web Speech API, which works in WKWebView for free. |
| `GET /api/sync-status` | `{ "syncInterval": "manual" }` | Prevents the sync status display from showing undefined. |
| `GET /api/highlights` | `{}` | Highlights index (not implemented in v1). |
| `GET /api/highlights?name=X` | `{}` | Per-article highlights. |
| `GET /api/notes` | `{}` | Notes index. |
| `GET /api/notes?name=X` | `{ "annotations": [], "tags": [], "isFavorite": false }` | Per-article notes. |
| `GET /api/notebooks` | `[]` | Notebooks list. |
| `GET /api/settings` | `{}` | LLM provider settings (not applicable). |
| `GET /favicons/*` | 404 | No favicon cache on device. |

### Rejected (read-only viewer)

All `POST`, `PUT`, and `DELETE` requests return `405` with body `{ "error": "Read-only viewer" }`.

This covers: `/api/save`, `/api/highlights` (POST), `/api/notes` (POST), `/api/notebooks` (POST/DELETE), `/api/config` (POST), `/api/summarize`, `/api/reprocess`, `/api/autotag`, `/api/autotag-batch`, `/api/grammar`, `/api/feed-discover`, `/api/pick-folder`, `/api/tts/start`, `/api/tts/chunk/*`, `/api/kokoro-preload`, `/api/backup`, `/api/restore`, `/api/settings` (POST), `/api/tts-settings` (POST).

The viewer handles 405 errors gracefully — write failures show a brief toast but don't break the reading experience.

---

## Frontmatter Format

Each `.md` file starts with YAML-style frontmatter between `---` delimiters:

```markdown
---
title: "Some Article Title"
url: https://example.com/article
domain: example.com
bookmarked: 2024-03-15T10:30:00Z
feed: https://example.com/feed.xml
author: John Doe
excerpt: "A brief description of the article"
summary: "AI-generated summary text"
summaryProvider: anthropic
summaryModel: claude-3-5-sonnet
enclosure_url: https://example.com/episode.mp3
enclosure_type: audio/mpeg
enclosure_duration: 1842
---

# Article content in markdown...
```

**Parser rules** (matching `viewer/02-utils.js` lines 1-14):
1. File must start with `---\n`
2. Second `---` ends the frontmatter block
3. Each line is split on the first `:` → key:value
4. Values are trimmed of whitespace
5. Surrounding double quotes are stripped: `"foo"` → `foo`
6. Escaped quotes are unescaped: `\"` → `"`
7. Only the first 3KB of each file is read for the listing (performance)

**Key name mapping** (frontmatter snake_case → FileMeta camelCase):
- `enclosure_url` → `enclosureUrl`
- `enclosure_type` → `enclosureType`
- `enclosure_duration` → `enclosureDuration`

---

## What Works Automatically

These viewer features are entirely client-side JS/CSS and work in WKWebView with zero native support:

- Theme switching (light / dark / high-contrast / auto, stored in localStorage)
- Font selection (Inter, Literata, Lora, Source Serif, Work Sans, OpenDyslexic)
- Font size, line height, content width, paragraph spacing controls
- Article search and filtering (by title, domain, feed, author)
- Read/unread tracking (localStorage)
- Sidebar collapse/expand
- Focus mode (hides sidebar chrome)
- Keyboard shortcuts (iPad with external keyboard)
- Scroll position memory per article
- Dashboard view with reading statistics
- Browser text-to-speech ("Listen" button via Web Speech API)
- Markdown rendering (marked.js, inlined)
- Syntax highlighting (highlight.js, inlined)

**localStorage persistence:** WKWebView (used by react-native-webview on iOS) persists localStorage across app launches. All user preferences survive app termination automatically.

---

## What Doesn't Work (Acceptable for v1)

| Feature | Why | Impact |
|---------|-----|--------|
| Highlights & notes | Server-side storage; 405'd | Can add on-device JSON storage in v2 |
| Notebooks | Server-side storage; 405'd | Same |
| AI summarization | Requires LLM API keys | Summaries already in frontmatter still display |
| Auto-tagging | Server-side LLM calls | Existing tags still display |
| Grammar checking | Server-side NSSpellChecker | Low priority |
| Feed management / sync | This is a reader, not a syncer | By design |
| Mermaid diagrams | Removed for bundle size | Rare in articles |
| Favicons | Would need cache or on-demand fetch | Returns 404 |
| Server-side TTS (Kokoro) | Browser TTS used instead | Works fine |

---

## Build & Test

**Prerequisites:**
- Node.js 18+, Expo CLI (`npx expo`)
- Xcode 15+ (for iOS build)
- An Apple Developer account (for device testing)

**Setup:**

```bash
npx create-expo-app pullread-mobile --template blank-typescript
cd pullread-mobile
npx expo install expo-router expo-asset expo-file-system react-native-webview react-native-safe-area-context react-native-screens
```

Then add the source files as listed above.

**Build for device (EAS):**

```bash
npx eas build --platform ios --profile development
```

**Build locally:**

```bash
npx expo prebuild --platform ios
npx expo run:ios
```

**Verification checklist:**

1. Launch app → welcome screen appears with "Choose Folder" button
2. Tap "Choose Folder" → iOS document picker opens
3. Navigate to a folder containing PullRead `.md` files → select it
4. Article list appears in the viewer sidebar
5. Tap an article → renders with full markdown formatting
6. Code blocks have syntax highlighting
7. Kill and relaunch app → folder bookmark restores automatically, articles visible
8. Theme switching works (light/dark, persists across launches)
9. Font switching works (Inter, Literata, etc.)
10. Tap an article's source link → opens in Safari
11. "Listen" button → reads article aloud via browser TTS
12. Search bar filters the article list
13. Empty folder → graceful empty state
14. Add a new `.md` file to the folder via another app → appears within 5 seconds
15. iPad → sidebar + content side-by-side layout

---

## Gotchas

1. **`/api/config` must return `configured: true`** — Otherwise a 5-step feed onboarding wizard appears that makes no sense for a reader app.

2. **Security-scoped bookmarks use `.minimalBookmark`** on iOS. Using `.withSecurityScope` will crash — that option is macOS-only.

3. **`injectedJavaScriptBeforeContentLoaded` timing** — The fetch bridge MUST be injected before the viewer's `<script>` tags execute. Using `injectedJavaScript` (post-load) is too late — the viewer calls `fetch('/api/files')` during init.

4. **`injectJavaScript` must end with `true;`** — react-native-webview requires the injected string to evaluate to a value. Without the trailing `true;`, you get console warnings.

5. **`hljs-light` and `hljs-dark` element IDs must exist** — The viewer's `updateHljsTheme()` function in `04-article.js` toggles syntax highlighting themes by setting the `media` attribute on elements with these IDs. If the IDs are missing, theme switching for code blocks silently fails.

6. **Frontmatter snake_case → JSON camelCase** — The frontmatter keys `enclosure_url`, `enclosure_type`, `enclosure_duration` must be mapped to `enclosureUrl`, `enclosureType`, `enclosureDuration` in the FileMeta JSON.

7. **3KB head read for performance** — The listing reads only the first 3KB of each file (matching the server). This is enough for frontmatter + first image URL extraction but won't catch images deep in the article.

8. **Auto-refresh polling** — The viewer polls `GET /api/files-changed` every 5 seconds. Returning the folder's modification timestamp is lightweight. When the user adds files via another app (Syncthing, etc.), the timestamp changes and the viewer auto-refreshes.

9. **`Response` constructor in WKWebView** — The fetch bridge creates `new Response(body, opts)` to resolve intercepted fetches. This works because WKWebView supports the full Fetch API including the Response constructor.

10. **Large article payloads via `injectJavaScript`** — When returning a 100KB markdown article, the `injectJavaScript` call passes a ~200KB string (JSON double-encoded). This works fine in practice — `injectJavaScript` handles multi-MB strings.
