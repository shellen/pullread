# PullRead iOS App — Build Specification

> **Purpose**: Drop this file into a fresh LLM session and say "build this." It contains everything needed to create the PullRead iOS app from scratch.

---

## What Is PullRead?

PullRead is an RSS reader that saves articles as local markdown files. The desktop app (macOS, Tauri + Bun) fetches RSS feeds, extracts article content, converts it to markdown, and saves `.md` files to a local folder. A self-contained HTML viewer (~400KB, 14 JS modules + CSS inlined) renders articles in a browser-like reading experience.

The iOS app reuses that same viewer inside a WebView, with a native Swift module for folder access and an optional on-device sync engine.

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
│  - POST /api/sync-now → on-device sync engine    │
│                                                  │
│  Native module (Swift):                          │
│  - iOS folder picker (UIDocumentPickerVC)        │
│  - Security-scoped bookmarks (persist access)    │
│  - File enumeration + frontmatter parsing        │
│  - File writing (for on-device sync)             │
│                                                  │
│  Sync engine (TypeScript, same libs as desktop): │
│  - fast-xml-parser → fetch → Readability →       │
│    Turndown → write .md to shared folder         │
│  - WKWebView cookie auth for paywalled sites     │
└──────────────────────────────────────────────────┘
```

**Why this works:** The viewer separates data from rendering. All data comes via `fetch('/api/*')`. Injected JS intercepts these and routes them to React Native, which reads/writes local files via a native Swift module.

---

## Project Structure

```
pullread-mobile/
├── app/
│   ├── _layout.tsx              — Expo Router root layout
│   ├── index.tsx                — Welcome screen ("Choose Folder")
│   ├── reader.tsx               — Full-screen WebView reader
│   └── settings.tsx             — Feed config, sync, site logins
├── lib/
│   ├── fetch-bridge.ts          — JS injected into WebView to intercept fetch()
│   ├── api-handler.ts           — Routes API requests to native module
│   ├── viewer-html.ts           — Loads the viewer HTML asset
│   └── sync/
│       ├── feed.ts              — RSS/Atom feed parsing
│       ├── extractor.ts         — Article extraction
│       ├── writer.ts            — Markdown file generation
│       └── url-tracker.ts       — AsyncStorage deduplication
├── modules/
│   └── folder-access/
│       ├── index.ts             — TypeScript interface
│       ├── expo-module.config.json
│       └── ios/
│           └── FolderAccessModule.swift
├── assets/
│   └── viewer.html              — Pre-built embedded viewer
├── app.config.ts
├── package.json
└── tsconfig.json
```

---

## Dependencies

```json
{
  "name": "pullread-mobile",
  "version": "1.0.0",
  "main": "expo-router/entry",
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
    "react-native-screens": "~4.4.0",
    "@react-native-async-storage/async-storage": "2.1.0",
    "@mozilla/readability": "^0.6.0",
    "fast-xml-parser": "^5.3.3",
    "linkedom": "^0.18.12",
    "turndown": "^7.2.2"
  },
  "devDependencies": {
    "@types/react": "~18.3.0",
    "@types/turndown": "^5.0.5",
    "typescript": "~5.3.0"
  }
}
```

---

## app.config.ts

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
  plugins: ['./modules/folder-access'],
};

export default config;
```

---

## Source Files

### `app/_layout.tsx`

```tsx
import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="reader" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
```

### `app/index.tsx`

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
        if (name) router.replace('/reader');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  const handlePickFolder = async () => {
    try {
      const folderName = await FolderAccess.pickFolder();
      if (folderName) router.replace('/reader');
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

### `app/reader.tsx`

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

  useEffect(() => { getViewerHtml().then(setHtml); }, []);

  const onMessage = async (event: WebViewMessageEvent) => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (msg.type !== 'api') return;

    const { id, url, method } = msg;
    const result = await handleApiRequest(url, method);
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
          if (request.url === 'about:blank' || request.url.startsWith('about:srcdoc')) return true;
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

### `lib/fetch-bridge.ts`

Injected **before** viewer JS executes. Overrides `window.fetch` so `/api/*` goes through `postMessage`.

```typescript
export const FETCH_BRIDGE_JS = `
(function() {
  var _originalFetch = window.fetch;
  var _pending = {};
  var _nextId = 0;

  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    var method = (init && init.method) ? init.method.toUpperCase() : 'GET';

    if (url.startsWith('/api/') || url.startsWith('/favicons/')) {
      return new Promise(function(resolve, reject) {
        var id = ++_nextId;
        _pending[id] = { resolve: resolve, reject: reject };
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'api', id: id, url: url, method: method,
          body: (init && init.body) ? init.body : null
        }));
        setTimeout(function() {
          if (_pending[id]) { delete _pending[id]; reject(new Error('Timeout: ' + url)); }
        }, 30000);
      });
    }
    return _originalFetch.apply(this, arguments);
  };

  window.__resolveApiFetch = function(id, status, contentType, body) {
    var p = _pending[id];
    if (!p) return;
    delete _pending[id];
    p.resolve(new Response(body, { status: status, headers: { 'Content-Type': contentType } }));
  };

  window.PR_IOS = true;
})();
true;
`;
```

**Critical**: Must use `injectedJavaScriptBeforeContentLoaded` — the viewer calls `fetch('/api/files')` during init.

### `lib/api-handler.ts`

```typescript
import FolderAccess from '../modules/folder-access';

interface ApiResponse { status: number; contentType: string; body: string; }

export async function handleApiRequest(url: string, method: string): Promise<ApiResponse> {
  if (method !== 'GET') return json(405, { error: 'Read-only viewer' });

  try {
    if (url === '/api/files') return json(200, await FolderAccess.listMarkdownFiles());
    if (url.startsWith('/api/file?name=')) {
      const name = decodeURIComponent(url.split('name=')[1]);
      if (name.includes('..') || name.includes('/')) return json(400, { error: 'Invalid filename' });
      return { status: 200, contentType: 'text/plain', body: await FolderAccess.readFile(name) };
    }
    if (url === '/api/files-changed') return json(200, { changedAt: await FolderAccess.getFolderModTime() });

    // CRITICAL: configured:true prevents onboarding wizard
    if (url === '/api/config') return json(200, { feeds: {}, configured: true });
    if (url === '/api/tts-settings') return json(200, { provider: 'browser' });
    if (url === '/api/sync-status') return json(200, { syncInterval: 'manual' });
    if (url === '/api/highlights' || url.startsWith('/api/highlights?')) return json(200, {});
    if (url === '/api/notes') return json(200, {});
    if (url.startsWith('/api/notes?')) return json(200, { annotations: [], tags: [], isFavorite: false });
    if (url === '/api/notebooks') return json(200, []);
    if (url === '/api/settings') return json(200, {});
    if (url.startsWith('/favicons/')) return { status: 404, contentType: 'text/plain', body: '' };
    return json(404, { error: 'Not found' });
  } catch (e: any) {
    return json(500, { error: e.message || 'Internal error' });
  }
}

function json(status: number, data: any): ApiResponse {
  return { status, contentType: 'application/json', body: JSON.stringify(data) };
}
```

### `lib/viewer-html.ts`

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

### `modules/folder-access/index.ts`

```typescript
import { requireNativeModule } from 'expo-modules-core';

export interface FileMeta {
  filename: string;
  title: string;
  url: string;
  domain: string;
  bookmarked: string;
  feed: string;
  author: string;
  mtime: string;
  hasSummary: boolean;
  summaryProvider: string;
  summaryModel: string;
  excerpt: string;
  image: string;
  enclosureUrl: string;
  enclosureType: string;
  enclosureDuration: string;
}

interface FolderAccessModule {
  pickFolder(): Promise<string | null>;
  restoreFolder(): Promise<string | null>;
  listMarkdownFiles(): Promise<FileMeta[]>;
  readFile(filename: string): Promise<string>;
  writeFile(filename: string, content: string): Promise<void>;
  getFolderModTime(): Promise<number>;
  clearFolder(): Promise<void>;
}

export default requireNativeModule<FolderAccessModule>('FolderAccess');
```

### `modules/folder-access/expo-module.config.json`

```json
{ "platforms": ["ios"], "ios": { "modules": ["FolderAccessModule"] } }
```

### `modules/folder-access/ios/FolderAccessModule.swift`

```swift
import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

public class FolderAccessModule: Module {
    private static let bookmarkKey = "pullread_folder_bookmark"

    public func definition() -> ModuleDefinition {
        Name("FolderAccess")

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
                    guard let url = url else { promise.resolve(nil as String?); return }
                    do {
                        let bookmark = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
                        UserDefaults.standard.set(bookmark, forKey: FolderAccessModule.bookmarkKey)
                        promise.resolve(url.lastPathComponent)
                    } catch { promise.reject("BOOKMARK", error.localizedDescription) }
                }
                objc_setAssociatedObject(picker, "delegate", delegate, .OBJC_ASSOCIATION_RETAIN)
                picker.delegate = delegate
                rootVC.present(picker, animated: true)
            }
        }

        AsyncFunction("restoreFolder") { () -> String? in
            guard let url = Self.resolveBookmark() else { return nil }
            return url.lastPathComponent
        }

        AsyncFunction("listMarkdownFiles") { () -> [[String: Any]] in
            guard let folderURL = Self.resolveBookmark() else {
                throw NSError(domain: "FolderAccess", code: 1, userInfo: [NSLocalizedDescriptionKey: "No folder selected"])
            }
            let fm = FileManager.default
            let keys: [URLResourceKey] = [.contentModificationDateKey, .isRegularFileKey]
            guard let items = try? fm.contentsOfDirectory(at: folderURL, includingPropertiesForKeys: keys) else { return [] }

            let isoFormatter = ISO8601DateFormatter()
            var results: [[String: Any]] = []

            for item in items {
                guard item.pathExtension == "md" else { continue }
                guard let values = try? item.resourceValues(forKeys: Set(keys)), values.isRegularFile == true else { continue }

                let filename = item.lastPathComponent
                let mtime = values.contentModificationDate ?? Date(timeIntervalSince1970: 0)

                guard let handle = try? FileHandle(forReadingFrom: item) else { continue }
                let headData = handle.readData(ofLength: 3072)
                handle.closeFile()
                guard let head = String(data: headData, encoding: .utf8) else { continue }

                let meta = Self.parseFrontmatter(head)

                var image = ""
                if let fmEndRange = head.range(of: "\n---\n") {
                    let body = String(head[fmEndRange.upperBound...])
                    if let match = body.range(of: #"!\[.*?\]\((https?://[^)]+)\)"#, options: .regularExpression) {
                        let full = String(body[match])
                        if let lp = full.firstIndex(of: "("), let rp = full.lastIndex(of: ")") {
                            image = String(full[full.index(after: lp)..<rp])
                        }
                    }
                }

                results.append([
                    "filename": filename,
                    "title": meta["title"] ?? filename.replacingOccurrences(of: ".md", with: ""),
                    "url": meta["url"] ?? "", "domain": meta["domain"] ?? "",
                    "bookmarked": meta["bookmarked"] ?? "", "feed": meta["feed"] ?? "",
                    "author": meta["author"] ?? "", "mtime": isoFormatter.string(from: mtime),
                    "hasSummary": meta["summary"] != nil && !meta["summary"]!.isEmpty,
                    "summaryProvider": meta["summaryProvider"] ?? "",
                    "summaryModel": meta["summaryModel"] ?? "",
                    "excerpt": meta["excerpt"] ?? "", "image": image,
                    "enclosureUrl": meta["enclosure_url"] ?? "",
                    "enclosureType": meta["enclosure_type"] ?? "",
                    "enclosureDuration": meta["enclosure_duration"] ?? "",
                ])
            }

            results.sort { a, b in
                let dateA = { let bm = a["bookmarked"] as? String ?? ""; return bm.isEmpty ? (a["mtime"] as? String ?? "") : bm }()
                let dateB = { let bm = b["bookmarked"] as? String ?? ""; return bm.isEmpty ? (b["mtime"] as? String ?? "") : bm }()
                return dateB > dateA
            }
            return results
        }

        AsyncFunction("readFile") { (filename: String) -> String in
            guard let folderURL = Self.resolveBookmark() else {
                throw NSError(domain: "FolderAccess", code: 1, userInfo: [NSLocalizedDescriptionKey: "No folder selected"])
            }
            return try String(contentsOf: folderURL.appendingPathComponent(filename), encoding: .utf8)
        }

        AsyncFunction("writeFile") { (filename: String, content: String) in
            guard let folderURL = Self.resolveBookmark() else {
                throw NSError(domain: "FolderAccess", code: 1, userInfo: [NSLocalizedDescriptionKey: "No folder selected"])
            }
            try content.write(to: folderURL.appendingPathComponent(filename), atomically: true, encoding: .utf8)
        }

        AsyncFunction("getFolderModTime") { () -> Double in
            guard let url = Self.resolveBookmark() else { return 0 }
            let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
            return (attrs?[.modificationDate] as? Date ?? Date(timeIntervalSince1970: 0)).timeIntervalSince1970
        }

        AsyncFunction("clearFolder") { () in
            UserDefaults.standard.removeObject(forKey: FolderAccessModule.bookmarkKey)
        }
    }

    private static func resolveBookmark() -> URL? {
        guard let data = UserDefaults.standard.data(forKey: bookmarkKey) else { return nil }
        var isStale = false
        guard let url = try? URL(resolvingBookmarkData: data, bookmarkDataIsStale: &isStale) else { return nil }
        if isStale { UserDefaults.standard.removeObject(forKey: bookmarkKey); return nil }
        guard url.startAccessingSecurityScopedResource() else { return nil }
        return url
    }

    private static func parseFrontmatter(_ text: String) -> [String: String] {
        guard text.hasPrefix("---\n") else { return [:] }
        let searchStart = text.index(text.startIndex, offsetBy: 4)
        guard let endRange = text.range(of: "\n---", range: searchStart..<text.endIndex) else { return [:] }
        let block = String(text[searchStart..<endRange.lowerBound])
        var meta: [String: String] = [:]
        for line in block.split(separator: "\n", omittingEmptySubsequences: false) {
            guard let colonIdx = line.firstIndex(of: ":") else { continue }
            let key = line[line.startIndex..<colonIdx].trimmingCharacters(in: .whitespaces)
            var val = line[line.index(after: colonIdx)...].trimmingCharacters(in: .whitespaces)
            if val.hasPrefix("\"") && val.hasSuffix("\"") && val.count >= 2 {
                val = String(val.dropFirst().dropLast())
                val = val.replacingOccurrences(of: "\\\"", with: "\"")
            }
            if !key.isEmpty { meta[key] = val }
        }
        return meta
    }
}

private class PickerDelegate: NSObject, UIDocumentPickerDelegate {
    private let completion: (URL?) -> Void
    init(completion: @escaping (URL?) -> Void) { self.completion = completion }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { completion(urls.first) }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { completion(nil) }
}
```

---

## On-Device Sync Engine

The desktop extraction pipeline is almost entirely pure JavaScript. It runs in React Native's Hermes runtime with minimal changes.

### What ports unchanged

| Component | Library | Notes |
|-----------|---------|-------|
| Feed parsing | `fast-xml-parser` | Pure JS |
| HTTP fetching | `fetch()` | Built into Hermes |
| Readability | `@mozilla/readability` + `linkedom` | Pure JS virtual DOM |
| HTML → Markdown | `turndown` | Pure JS |

### What needs adapting

| Desktop | iOS | Effort |
|---------|-----|--------|
| `fs.writeFileSync` | `FolderAccess.writeFile()` | Small |
| `bun:sqlite` URL tracking | `AsyncStorage` JSON set | Small |
| Chrome cookie decryption | WKWebView in-app login | Medium |
| `unpdf` (PDF.js WASM) | Skip for v1 | None |

### Key types to port from desktop

```typescript
// feed.ts
interface FeedEntry {
  title: string; url: string; updatedAt: string; domain: string;
  annotation?: string; enclosure?: { url: string; type: string; duration?: string };
}
function parseFeed(xml: string): FeedEntry[]       // fast-xml-parser
function fetchFeed(url: string): Promise<FeedEntry[]>

// extractor.ts
interface ExtractedArticle {
  title: string; content: string; markdown: string;
  byline?: string; excerpt?: string; thumbnail?: string;
}
async function fetchAndExtract(url: string): Promise<ExtractedArticle | null>

// writer.ts
interface ArticleData {
  title: string; url: string; bookmarkedAt: string; domain: string; content: string;
  feed?: string; author?: string; excerpt?: string; enclosure?: Enclosure;
}
function generateFilename(title: string, bookmarkedAt: string): string
function generateMarkdown(data: ArticleData): string
```

**Extraction routing** (in order):
1. Skip Instagram, TikTok, Figma, Amazon
2. YouTube → metadata + transcript via caption tracks
3. Twitter/X → fxtwitter.com API for tweets + thread chain
4. Academic papers → try HTML version, fall back to PDF
5. Generic HTML → Mozilla Readability
6. Fallback → OpenGraph + JSON-LD

**Retry**: Max 2 retries (2s/5s delays). On 403: try Wayback Machine. 30s timeout.

### URL deduplication (AsyncStorage)

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY = 'pullread_processed_urls';

export async function isProcessed(url: string): Promise<boolean> {
  const data = await AsyncStorage.getItem(KEY);
  return data ? JSON.parse(data).includes(url) : false;
}

export async function markProcessed(url: string): Promise<void> {
  const data = await AsyncStorage.getItem(KEY);
  const urls: string[] = data ? JSON.parse(data) : [];
  if (!urls.includes(url)) { urls.push(url); await AsyncStorage.setItem(KEY, JSON.stringify(urls)); }
}
```

---

## Authenticated Fetching on iOS

Desktop reads Chrome/Arc/Brave cookies from the macOS Keychain. That's not possible on iOS.

**iOS approach — WKWebView in-app login:**

1. User taps "Log in to Medium" in a settings screen
2. App opens a `WKWebView` to that site's login page
3. User logs in (iCloud Keychain autofill = one tap)
4. App reads cookies via `WKHTTPCookieStore.getAllCookies()`
5. Cookies stored encrypted, attached to future fetch requests

```swift
webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
    let siteCookies = cookies.filter { $0.domain.contains("medium.com") }
    // Store and use for fetch requests
}
```

Same approach Reeder and Fiery Feeds use. Public feeds (majority) need no cookies.

---

## Viewer HTML Preparation

Build from PullRead desktop source with CDN deps inlined for offline:

1. `cd /path/to/pullread && bun run scripts/embed-viewer.ts`
2. Extract HTML string from `src/viewer-html.ts`
3. Download marked.min.js, highlight.min.js, github.min.css, github-dark.min.css
4. Replace CDN `<script>`/`<link>` tags with inline `<script>`/`<style>` tags
5. Remove mermaid and PWA manifest links
6. **Critical**: preserve `id="hljs-light"` and `id="hljs-dark"` on style tags (theme switcher uses these)
7. Copy to `pullread-mobile/assets/viewer.html`

---

## Frontmatter Format

```yaml
---
title: "Article Title"
url: https://example.com/article
bookmarked: 2026-02-21T10:30:00Z
domain: example.com
feed: https://example.com/feed.xml
author: John Doe
excerpt: "Brief description"
enclosure_url: https://example.com/episode.mp3
enclosure_type: audio/mpeg
enclosure_duration: 1842
---

# Markdown content...
```

Parser rules: starts with `---\n`, split on first `:`, trim whitespace, strip surrounding quotes, unescape `\"`. Only first 3KB read for listings.

Key mapping: `enclosure_url` → `enclosureUrl`, `enclosure_type` → `enclosureType`, `enclosure_duration` → `enclosureDuration`.

---

## File Access on iOS

iOS has a system **Files** app showing folders from any installed File Provider: iCloud Drive, Dropbox, Google Drive, OneDrive, etc.

"Choose Folder" presents the system picker → user selects folder → app gets a **security-scoped bookmark** (persists across restarts).

**Desktop → Phone**: Set desktop `outputPath` to a cloud folder (iCloud, Dropbox, etc.). Files sync automatically.
**Phone → Desktop**: On-device sync writes `.md` files to the same shared folder. They sync back.

---

## Gotchas

1. `/api/config` must return `configured: true` — otherwise onboarding wizard appears
2. Security-scoped bookmarks: `.minimalBookmark` on iOS (`.withSecurityScope` = macOS-only, crashes)
3. Fetch bridge timing: `injectedJavaScriptBeforeContentLoaded` (post-load is too late)
4. `injectJavaScript` must end with `true;`
5. `hljs-light`/`hljs-dark` element IDs must exist for theme switching
6. Frontmatter snake_case → FileMeta camelCase mapping
7. 3KB head read for file listing (matches server behavior)
8. Viewer polls `/api/files-changed` every 5s
9. iOS foreground only — no background sync

---

## Build Phases

| Phase | What | Key Work |
|-------|------|----------|
| 1 | Scaffolding | Create Expo project, install deps, prepare viewer.html, render in WebView |
| 2 | Fetch Bridge | Wire `window.fetch` interception, route `/api/*` to native module |
| 3 | Native Module | Swift folder picker, bookmarks, `.md` enumeration, frontmatter parsing, read/write |
| 4 | Polish | Safe areas, external links → Safari, dark mode, iPad layout, device testing |
| 5 | Distribution | EAS Build, code signing, TestFlight, App Store |
| 6 | On-Device Sync | Port feed/extractor/writer, sync UI, WKWebView auth |

---

## Verification Checklist

1. Launch → welcome screen with "Choose Folder"
2. Tap → iOS document picker opens
3. Select folder with `.md` files → article list appears
4. Tap article → renders with markdown + syntax highlighting
5. Kill/relaunch → folder restores, articles visible
6. Theme and font switching work and persist
7. Source links open in Safari
8. "Listen" button → TTS works
9. Search filters articles
10. Empty folder → graceful empty state
11. Add `.md` via another app → appears within 5 seconds
12. iPad → sidebar + content side-by-side
