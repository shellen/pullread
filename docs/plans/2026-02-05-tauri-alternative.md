# Tauri as an Alternative to Swift for PullRead

## Context

PullRead is currently a native Swift/SwiftUI macOS menu bar app that bundles a
Bun-compiled TypeScript CLI binary. This document evaluates whether Tauri could
replace the native Swift layer, and what the tradeoffs would be.

## What Is Tauri

Tauri is a Rust-based framework for building desktop apps using web technologies
for the frontend (HTML/CSS/JS). It produces small, self-contained binaries by
using the operating system's native WebView (WebKit on macOS, WebView2 on
Windows, WebKitGTK on Linux) instead of bundling Chromium like Electron.

Tauri 2.x (stable since 2024) supports macOS, Windows, Linux, iOS, and Android.

## Architecture Comparison

### Current Architecture (Swift)

```
PullReadTray (Swift/SwiftUI)
├── AppDelegate.swift      → Menu bar, sync orchestration
├── SettingsView.swift      → Native SwiftUI settings UI
├── OnboardingView.swift    → Native SwiftUI onboarding
├── WhatsNewView.swift      → Native SwiftUI update messaging
├── SyncService.swift       → Runs bundled pullread CLI binary
└── Bundled: pullread       → Bun-compiled TypeScript binary
```

### Tauri Architecture (Hypothetical)

```
PullRead (Tauri/Rust)
├── src-tauri/
│   ├── main.rs            → System tray, window management
│   ├── commands.rs        → Tauri commands (sync, config, viewer)
│   └── tray.rs            → System tray menu
├── src/ (web frontend)
│   ├── settings.html      → Settings UI (already web-capable)
│   ├── viewer.html        → Article reader (already exists)
│   └── onboarding.html    → Onboarding wizard
└── Bundled: pullread       → Same Bun-compiled binary, OR
                              sync logic rewritten in Rust/TS
```

## Pros of Switching to Tauri

### 1. Cross-Platform Distribution
The most compelling advantage. Tauri builds for macOS, Windows, and Linux from
a single codebase. PullRead's core sync engine is TypeScript — it already runs
on all platforms. The only macOS-specific code is the Swift UI layer. Tauri
would make Windows and Linux support achievable.

### 2. Web Frontend Reuse
PullRead already has a sophisticated web-based article reader (`viewer.html`)
with themes, fonts, search, and keyboard navigation. The highlights and notes
UI is entirely web-based. A Tauri app could use this directly as the main
window, rather than opening `localhost:7777` in the default browser.

### 3. TypeScript/JavaScript Everywhere
The settings, onboarding, and What's New views would be built in HTML/CSS/JS
rather than SwiftUI. This keeps the entire frontend in one language and makes
it maintainable by web developers without Xcode or Swift knowledge.

### 4. Smaller Learning Curve for Contributors
Contributors would need to know HTML/CSS/JS (which they already do for the
viewer) plus basic Rust for the system integration. SwiftUI is a niche skill
compared to web technologies.

### 5. Updater Built In
Tauri has its own auto-update mechanism (`tauri-plugin-updater`) that works
similarly to Sparkle — it checks a JSON endpoint for updates, downloads them,
and installs. This would replace the need for Sparkle integration entirely.

### 6. App Size
Tauri apps are typically 5-15 MB, comparable to native Swift apps. Electron
apps are 150-300 MB by comparison.

## Cons of Switching to Tauri

### 1. Loss of Native macOS Polish
SwiftUI provides native macOS controls, animations, and behaviors that are
difficult to replicate in HTML/CSS. PullRead's current glass morphism
settings, native `NSAlert` dialogs, `NSOpenPanel` folder picker, and
`NSStatusItem` menu bar behavior all feel like a proper macOS app.

Tauri's system tray API supports menus but lacks the fine-grained control
of `NSStatusItem` (animated icons, dynamic menu items). The settings UI
would need to be rebuilt as a web page and would look less native.

### 2. Rust Build Complexity
Tauri requires a Rust toolchain. The build pipeline would change from
Xcode (`xcodebuild`) to `cargo tauri build`, adding Rust compilation to
CI. Rust compilation is slower than Swift, especially for first builds.

### 3. macOS-Specific Features Become Harder
- **Chrome cookie decryption**: Uses macOS Keychain APIs. In Swift, this
  is `SecItemCopyMatching`. In Rust, you'd need the `security-framework`
  crate or shell out to `security` CLI.
- **Launch at Login**: Swift uses `SMAppService` (macOS 13+) or
  `LSSharedFileList`. Tauri has `tauri-plugin-autostart` but it's less
  reliable.
- **Notifications**: Currently uses `UNUserNotificationCenter`. Tauri
  has `tauri-plugin-notification` which works but is less configurable.
- **Code signing & notarization**: Tauri supports Apple signing, but
  the tooling is less mature than Xcode's built-in signing workflow.

### 4. Two Runtimes
The Bun-compiled binary is still needed for the sync engine (it uses
Node.js APIs, Readability, Turndown). Tauri adds a Rust binary on top.
The app would bundle two executables. Alternatively, the sync engine
could be rewritten in Rust, but that's a significant effort.

### 5. WebView Limitations on macOS
Tauri uses WKWebView on macOS. While performant, it has quirks:
- No native context menus without custom implementation
- No native spell check in textareas
- Debugging requires Safari Web Inspector
- Some CSS features may render slightly differently than in Chrome

### 6. Migration Effort
The existing Swift codebase (6 files, ~1500 lines) would be discarded.
The settings, onboarding, and What's New views would need to be rewritten
as HTML/CSS/JS. The system tray logic would move to Rust. This is several
days of work for an app that already works well.

## Comparison Table

| Aspect | Swift (Current) | Tauri |
|--------|----------------|-------|
| **Platforms** | macOS only | macOS, Windows, Linux |
| **App size** | ~8 MB | ~10 MB |
| **UI fidelity** | Native macOS controls | Web-based (good but not native) |
| **Menu bar** | Full NSStatusItem control | Basic system tray API |
| **Build tools** | Xcode | Rust + Cargo + Node |
| **Auto-updates** | Sparkle (industry standard) | Built-in (tauri-plugin-updater) |
| **Cookie support** | Native Keychain access | Requires Rust crate or shell exec |
| **Code signing** | Xcode native | Supported but less integrated |
| **Developer pool** | Swift developers | Web + Rust developers |
| **Viewer integration** | Opens localhost in browser | Embedded WebView (seamless) |

## Recommendation

**Keep Swift for the macOS-only version. Consider Tauri for a cross-platform
expansion.**

The current Swift app is well-built, native-feeling, and covers all macOS-specific
features cleanly. Switching to Tauri for macOS alone would trade native polish for
no clear gain.

However, if PullRead needs to support Windows or Linux users, Tauri is the right
choice for that separate build target. The TypeScript sync engine is already
cross-platform. The viewer HTML is already cross-platform. Only the tray app
and settings UI need a Tauri wrapper.

A practical approach:
1. **Keep** the Swift macOS app as the primary distribution
2. **Create** a `src-tauri/` directory for a Tauri version targeting
   Windows/Linux
3. **Share** the TypeScript sync engine and viewer.html between both
4. **Build** a web-based settings UI that both the Tauri app and the
   viewer could use (the viewer already runs on localhost)

This avoids rewriting what works while opening the door to cross-platform
when the demand materializes.
