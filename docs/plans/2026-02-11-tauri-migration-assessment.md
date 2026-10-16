# Tauri Migration Assessment: PullRead

## Executive Summary

**Difficulty: Moderate-Hard**

PullRead is a hybrid application combining a Bun/TypeScript CLI, a native Swift/SwiftUI macOS menu bar app, and an embedded HTML viewer served over localhost. Migrating to Tauri would consolidate the Swift GUI and the viewer into a single cross-platform binary, but requires rewriting all backend logic in Rust and rearchitecting how the CLI binary, the native shell, and the web UI communicate. The viewer HTML (the easiest part) ports almost directly; everything else requires significant work.

---

## Current Architecture

```
macOS Menu Bar (Swift/SwiftUI)
    |
    |-- launches bundled binary via Process API
    v
PullRead CLI (Bun-compiled standalone binary, ~100MB)
    |
    |-- RSS/Atom feed parsing (fast-xml-parser)
    |-- Article extraction (@mozilla/readability + linkedom)
    |-- HTML-to-Markdown conversion (turndown)
    |-- PDF text extraction (unpdf)
    |-- Chrome cookie decryption (bun:sqlite + crypto)
    |-- LLM summarization (Anthropic, OpenAI, Gemini, OpenRouter, Apple Intelligence)
    |-- Local HTTP server serving viewer UI on port 7777
    |-- SQLite-backed sync state (bun:sqlite)
    |-- JSON config files (~/.config/pullread/)
    v
viewer.html (vanilla HTML/CSS/JS, uses marked.js for rendering)
```

Key observation: the Swift app is a thin shell that launches the CLI binary and provides native macOS integration (system tray, notifications, file dialogs). The real logic lives in TypeScript.

---

## What Ports Easily

### 1. Viewer HTML Frontend
**Effort: Low**

The `viewer.html` is a self-contained, framework-free HTML/CSS/JS file. It already communicates with the backend via fetch calls to `localhost:7777/api/*`. In Tauri, this would become the webview content directly, with API calls replaced by Tauri `invoke()` commands or kept as-is if an internal server is retained.

- No framework dependency (no React/Vue/Angular to configure)
- Clean REST API boundary already exists (`/api/files`, `/api/file`, `/api/highlights`, `/api/notes`, `/api/settings`, `/api/summarize`)
- CSS variables and theming (light/dark/sepia) work in any webview
- Only external dependency is `marked.js` from CDN (can be bundled)

### 2. System Tray / Menu Bar
**Effort: Low**

Tauri 2.0 has first-class system tray support via `tray-icon`. The current Swift menu (`NSStatusBar`, `NSMenu`) maps directly to Tauri's `TrayIconBuilder`:

| Current (Swift) | Tauri Equivalent |
|---|---|
| `NSStatusBar.system.statusItem()` | `TrayIconBuilder::new()` |
| `NSMenu` / `NSMenuItem` | `MenuBuilder` / `MenuItemBuilder` |
| SF Symbols icon | PNG/ICO icon asset |
| Menu item actions via `#selector` | Event handlers via `on_menu_event` |

The existing menu items (Sync Now, Retry Failed, Open Output Folder, View Articles, Settings, View Logs, Quit) all have direct Tauri equivalents.

### 3. Desktop Notifications
**Effort: Low**

Tauri has an official `notification` plugin (`tauri-plugin-notification`) that replaces the current `UNUserNotificationCenter` usage. The API is simpler than the Swift version.

### 4. File System Access & Config Management
**Effort: Low**

Tauri's `fs` and `path` plugins provide the same capabilities as the current `FileManager` (Swift) and Node.js `fs` (TypeScript) usage. Config reading/writing at `~/.config/pullread/` translates directly to Rust `std::fs` or Tauri's scoped filesystem access.

### 5. JSON Storage / Config
**Effort: Low**

The JSON config files (`feeds.json`, `settings.json`, `highlights.json`, `notes.json`) are just `serde_json` in Rust. This is arguably easier than the current approach which implements JSON I/O twice (once in Swift, once in TypeScript).

---

## What Requires Significant Work

### 6. RSS/Atom Feed Parsing
**Effort: Medium**

Currently uses `fast-xml-parser` (npm). Rust equivalents exist (`feed-rs`, `rss`, `atom_syndication`) and are mature. The current feed.ts handles both RSS 2.0 and Atom with custom date parsing and entry normalization. This needs a full rewrite but the logic is straightforward.

| Current (TypeScript) | Rust Equivalent |
|---|---|
| `fast-xml-parser` | `feed-rs` crate (unified RSS/Atom parser) |
| Custom date normalization | `chrono` crate |
| URL normalization / sanitization | `url` crate |

### 7. Article Extraction (Readability)
**Effort: Medium-Hard**

This is the most critical content pipeline component. Currently uses:
- `@mozilla/readability` - the gold-standard article extractor (same as Firefox Reader View)
- `linkedom` - server-side DOM implementation
- `turndown` - HTML to Markdown conversion

Rust options:
- **`readability`** crate: exists but is less mature than Mozilla's JS implementation and may produce different extraction results
- **`scraper` + custom logic**: more control but significantly more work
- Alternative: keep readability running in the Tauri webview via JS (using Tauri's webview evaluation), though this is architecturally awkward

The risk here is extraction quality regression. The Mozilla Readability library has years of site-specific heuristics that Rust ports may not fully replicate.

### 8. HTML to Markdown Conversion
**Effort: Medium**

`turndown` (JS) would need to be replaced. Rust has `htmd` and `html2md` crates. The current code has custom Turndown rules (for code blocks, images, etc.) that would need to be reimplemented.

### 9. PDF Text Extraction
**Effort: Medium**

Currently uses `unpdf` (wraps Mozilla's PDF.js). Rust has `pdf-extract`, `lopdf`, and `pdf` crates. PDF extraction quality varies significantly between libraries, so testing against real-world PDFs would be needed.

### 10. Chrome Cookie Decryption
**Effort: Medium-Hard**

This is a macOS-specific feature that:
1. Reads Chrome's encryption key from macOS Keychain via `security find-generic-password`
2. Derives an AES-128-CBC key via PBKDF2
3. Opens Chrome's SQLite cookie database
4. Decrypts cookie values with AES-128-CBC

In Rust, this requires:
- `security-framework` crate for Keychain access (or `std::process::Command` to shell out)
- `rusqlite` for SQLite
- `aes` + `cbc` + `pbkdf2` crates for decryption
- Platform-conditional compilation (`#[cfg(target_os = "macos")]`)

The crypto is straightforward in Rust, but the Keychain interaction and Chrome-specific formats need careful handling. This feature is also macOS-only, which works against Tauri's cross-platform value proposition.

### 11. LLM Summarization
**Effort: Medium**

Five API integrations (Anthropic, OpenAI, Gemini, OpenRouter, Apple Intelligence) need to be reimplemented. The HTTP calls are simple POST requests via `reqwest` in Rust. The Apple Intelligence integration is the exception -- it currently shells out to a Swift script using the `FoundationModels` framework, which would need a different approach in Tauri (possibly via a Swift plugin or native bridge).

### 12. SQLite Sync State Database
**Effort: Low-Medium**

Currently uses `bun:sqlite`. Tauri has `tauri-plugin-sql` (backed by sqlx) or direct `rusqlite` usage. The schema is simple (URL tracking, processed/failed state). Migration is mechanical.

---

## Architectural Challenges

### A. Bun Runtime Dependency Eliminated (Pro and Con)

**Pro:** The current Bun-compiled binary is ~100MB. A Tauri app would be 5-10MB since it uses the system webview.

**Con:** All TypeScript backend logic (~2,000 lines across 8 modules) must be rewritten in Rust. There is no way to "wrap" the existing Bun binary inside Tauri -- the current architecture where Swift launches a Bun binary would need to be fully replaced.

### B. Two-App Architecture Collapses to One (Pro)

Currently PullRead ships as a Swift app that bundles a Bun binary. This means:
- Two build pipelines (Xcode + Bun)
- Two languages (Swift + TypeScript)
- IPC via Process stdout/stderr
- Binary bundling and code signing for both

Tauri collapses this to a single Rust+HTML application with one build pipeline. This is a major maintenance win.

### C. Cross-Platform Becomes Possible (Pro)

The current app is macOS-only (Swift UI + macOS Keychain + Chrome cookie path is `~/Library/...`). Tauri would enable Windows and Linux support with minimal extra work for the core functionality. Cookie decryption would need per-platform implementations.

### D. SwiftUI Settings/Onboarding UI Must Be Rebuilt

The settings view (`SettingsView.swift`, ~770 lines) and onboarding wizard (`OnboardingView.swift`, ~490 lines) are polished SwiftUI interfaces with glass-effect cards, progress bars, folder pickers, and segmented controls. These would need to be rebuilt as HTML/CSS in the Tauri webview. The HTML viewer already demonstrates this is feasible, but it is additional frontend work.

### E. Build & Distribution Pipeline Changes

| Current | Tauri |
|---|---|
| `bun build --compile` + `xcodebuild` | `cargo tauri build` |
| Code signing via `codesign` | Tauri's built-in signing |
| Notarization via `notarytool` | Tauri's built-in notarization |
| DMG via `hdiutil` | Tauri generates `.dmg` / `.app` / `.msi` / `.AppImage` |
| Manual `build-release.sh` (73 lines) | Single `tauri build` command |

This is a significant simplification.

---

## Effort Estimate

| Component | Lines of Code | Rewrite Effort | Risk |
|---|---|---|---|
| Feed parsing (`feed.ts`) | ~200 | Medium | Low -- mature Rust crates |
| Article extraction (`extractor.ts`) | ~350 | Hard | **High** -- readability quality |
| HTML-to-Markdown (`extractor.ts`) | (included above) | Medium | Medium -- output differences |
| PDF extraction | ~50 | Medium | Medium -- quality varies |
| Markdown writer (`writer.ts`) | ~150 | Low | Low |
| Sync state storage (`storage.ts`) | ~150 | Low | Low |
| Chrome cookies (`cookies.ts`) | ~200 | Medium-Hard | Medium -- platform-specific |
| Viewer API (`viewer.ts`) | ~350 | Medium | Low -- becomes Tauri commands |
| Viewer HTML (`viewer.html`) | ~2,000 | **Minimal** | Low -- works as-is |
| LLM summarization (`summarizer.ts`) | ~260 | Medium | Low |
| CLI entry/config (`index.ts`) | ~450 | Medium | Low |
| Swift menu bar app | ~1,250 | Medium | Low -- Tauri tray API |
| Swift settings UI | ~1,260 | Medium | Low -- becomes HTML |
| Build pipeline | ~260 | **Simplified** | Low |

**Total rewrite: ~5,000+ lines of TypeScript/Swift to ~4,000-5,000 lines of Rust + HTML modifications.**

---

## Recommendation

### Do It If:
- You want cross-platform support (Windows/Linux)
- The ~100MB binary size is a concern (Tauri apps are 5-10MB)
- You want a single build pipeline instead of managing Xcode + Bun
- You are comfortable with Rust or want to invest in learning it
- You plan to add more native-feeling UI features (Tauri's webview provides more flexibility than the current localhost HTTP server approach)

### Don't Do It If:
- macOS-only is sufficient for your use case
- Article extraction quality (via `@mozilla/readability`) is paramount and you cannot accept any regression
- You want to keep the CLI as a standalone tool (Tauri doesn't naturally produce a CLI binary)
- The current architecture is working well and maintenance burden is manageable
- Rust is not in your skillset and the learning curve isn't justified

### A Middle Path: Hybrid Migration

Rather than a full rewrite, consider:

1. **Keep the Bun CLI as-is** for sync, extraction, and summarization
2. **Replace only the Swift shell** with a Tauri app that:
   - Provides the system tray via Tauri's tray API
   - Hosts the viewer HTML directly in its webview (no localhost server needed)
   - Launches the existing Bun binary for sync operations (via Rust `std::process::Command`)
   - Implements the settings/onboarding UI in HTML within the webview

This gets you cross-platform shell support, smaller GUI overhead, a unified build tool, and eliminates the Swift dependency -- without rewriting the content extraction pipeline.

---

## Summary Table

| Aspect | Current | Full Tauri | Hybrid Tauri |
|---|---|---|---|
| App size | ~100MB+ | ~5-10MB | ~105MB (Tauri + Bun binary) |
| Platforms | macOS only | macOS, Windows, Linux | macOS, Windows, Linux |
| Languages | Swift + TypeScript | Rust + HTML/JS | Rust + TypeScript + HTML/JS |
| Build pipeline | Xcode + Bun | `cargo tauri build` | `cargo tauri build` + Bun |
| Extraction quality | Gold standard (Mozilla) | Risk of regression | Gold standard (unchanged) |
| Maintenance | Two apps, two languages | One app, one language | One app, two runtimes |
| Migration effort | N/A | Large (full rewrite) | Medium (shell replacement) |

---

## Update: 2026-02-11

Recent changes significantly affect the migration calculus. See
[`docs/plans/2026-02-11-tauri-hybrid-migration-plan.md`](docs/plans/2026-02-11-tauri-hybrid-migration-plan.md)
for a full implementation plan accounting for these changes:

- **Viewer modularized** into 13 JS modules (easier to adapt for Tauri)
- **Onboarding moved to web** (eliminates ~490 lines of SwiftUI to port)
- **Settings consolidated to web** (SettingsView.swift now redundant)
- **Folder picker abstracted** behind `/api/pick-folder` (trivial Tauri swap)
- **Kokoro TTS bundled portably** (no macOS-specific code in TTS path)
- **Five new macOS-native integrations** added (Keychain, Share Extension,
  Spotlight, Shortcuts, NSSpellChecker) — these make the Swift shell thicker
  but are all optional/graceful-degradation features

**Net effect:** The hybrid approach (Tauri shell + Bun sidecar) is now *more*
attractive because the web UI covers onboarding and settings. The remaining
Swift-only features are all optional macOS integrations that can be deferred.
