# Tauri Hybrid Migration Plan: PullRead

**Date:** 2026-02-11
**Target:** macOS first, then Windows/Linux
**Approach:** Hybrid — replace the Swift shell with Tauri, keep the Bun CLI unchanged

---

## Context: What Changed Today

Today's commits significantly reshape the migration calculus:

1. **Viewer modularized** — The monolithic `viewer.html` was split into 13 JS modules
   (`viewer/01-state.js` through `viewer/13-init.js`). This makes targeted adaptation
   for Tauri much easier — you can modify `07-tts.js` without touching `05-sidebar.js`.

2. **Onboarding moved to web** — `OnboardingView.swift` is no longer the primary
   onboarding path. The 5-step wizard now lives in `viewer/11-modals.js`. This
   eliminates ~490 lines of SwiftUI that would have needed rewriting.

3. **Settings consolidated to web** — The viewer now has a full web-based settings UI
   covering feeds, LLM providers, TTS, sync schedule, and output folder. The native
   `SettingsView.swift` is now redundant for a Tauri build.

4. **Folder picker abstracted** — `/api/pick-folder` uses `osascript` behind a clean
   API endpoint. Tauri swaps in `tauri::dialog::pick_folder()` trivially.

5. **Kokoro TTS bundled portably** — Model files at `~/.config/pullread/kokoro-model/`
   referenced via env var. No macOS-specific code in the TTS path.

6. **Five deep macOS integrations added** — Keychain, Share Extension, Spotlight,
   Shortcuts/Siri, and NSSpellChecker grammar. These make the Swift shell *thicker*
   but are all optional/graceful-degradation features.

---

## Architecture Overview

### Current (Swift + Bun)

```
PullReadTray (Swift/SwiftUI)          ← REPLACE THIS
├── AppDelegate.swift                 ← System tray, timers, URL scheme, notifications
├── SyncService.swift                 ← Spawns Bun binary, parses output
├── SettingsView.swift                ← Native settings (redundant with web)
├── OnboardingView.swift              ← Native onboarding (redundant with web)
├── KeychainService.swift             ← Secure API key storage
├── SpotlightIndexer.swift            ← CoreSpotlight indexing
├── Intents/*.swift                   ← Siri Shortcuts
├── ShareViewController.swift         ← macOS Share Extension
└── ArticleViewerWindowController     ← WKWebView window
         |
         | spawns Process() with pipes
         v
pullread CLI (Bun binary, ~100MB)     ← KEEP AS-IS
├── sync, view, review, autotag, summarize, import
├── HTTP server on localhost:7777
└── 32 API endpoints
         |
         | serves HTML + handles fetch()
         v
viewer.html (modular JS/CSS)          ← KEEP AS-IS (minor adaptations)
├── 13 JS modules (01-state through 13-init)
├── Onboarding, settings, TTS, AI, notebooks
└── All communication via /api/* endpoints
```

### Target (Tauri + Bun)

```
PullRead (Tauri/Rust)                 ← NEW
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                   ← App setup, activation policy, plugin init
│   │   ├── tray.rs                   ← System tray menu (12 items)
│   │   ├── sidecar.rs                ← Bun binary lifecycle management
│   │   ├── commands.rs               ← Tauri IPC commands (folder picker, etc.)
│   │   ├── timers.rs                 ← Sync/review scheduling
│   │   ├── notifications.rs          ← Cross-platform notifications
│   │   └── platform/
│   │       ├── mod.rs
│   │       ├── macos.rs              ← Keychain, Spotlight, grammar (optional)
│   │       ├── windows.rs            ← Credential Manager, Windows Search (future)
│   │       └── linux.rs              ← keyring, (future)
│   ├── binaries/
│   │   ├── pullread-aarch64-apple-darwin     ← Bun binary (Apple Silicon)
│   │   ├── pullread-x86_64-apple-darwin      ← Bun binary (Intel Mac)
│   │   ├── pullread-x86_64-unknown-linux-gnu ← (future)
│   │   └── pullread-x86_64-pc-windows-msvc.exe ← (future)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/
│       └── default.json              ← Permissions for sidecar, dialog, etc.
│
├── src/ (web frontend — the existing viewer)
│   ├── viewer.html                   ← Entry point (served by Bun or embedded)
│   ├── viewer/01-state.js ... 13-init.js
│   └── viewer.css
│
└── pullread CLI (Bun binary)         ← UNCHANGED
    └── (all existing src/*.ts)
```

---

## Phase 1: Scaffold & System Tray (macOS)

**Goal:** Tauri app that lives in the macOS menu bar, launches the Bun sidecar,
and opens the viewer in a native window. No behavior changes from the user's
perspective.

### 1.1 Initialize Tauri project

```bash
cd pullread
cargo install create-tauri-app
npm run tauri init
```

This creates `src-tauri/` with `Cargo.toml`, `tauri.conf.json`, `src/main.rs`.

Configure `tauri.conf.json`:
- `identifier`: `"com.pullread.app"`
- `bundle.icon`: existing app icons
- `bundle.externalBin`: `["binaries/pullread"]`
- `app.windows`: empty array (no default window — tray-only app)
- `plugins.updater`: Ed25519 public key + endpoint URL

### 1.2 System tray with full menu

Port the 12 menu items from `AppDelegate.swift` lines 138-265:

```rust
// src-tauri/src/tray.rs
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;

pub fn create_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let sync_now = MenuItem::with_id(app, "sync_now", "Sync Now", true, Some("CmdOrCtrl+S"))?;
    let last_sync = MenuItem::with_id(app, "last_sync", "Last sync: —", false, None::<&str>)?;
    let next_sync = MenuItem::with_id(app, "next_sync", "Next sync: —", false, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let view_articles = MenuItem::with_id(app, "view", "View Articles", true, Some("CmdOrCtrl+D"))?;
    let open_folder = MenuItem::with_id(app, "open_folder", "Open Folder", true, Some("CmdOrCtrl+O"))?;
    let retry_failed = MenuItem::with_id(app, "retry", "Retry Failed", true, Some("CmdOrCtrl+R"))?;
    let gen_review = MenuItem::with_id(app, "review", "Generate Review", true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let logs = MenuItem::with_id(app, "logs", "Logs", true, Some("CmdOrCtrl+L"))?;
    let check_updates = MenuItem::with_id(app, "updates", "Check for Updates…", true, None::<&str>)?;
    let about = MenuItem::with_id(app, "about", "About PullRead", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, Some("CmdOrCtrl+Q"))?;

    let menu = Menu::with_items(app, &[
        &sync_now, &last_sync, &next_sync, &separator1,
        &view_articles, &open_folder, &retry_failed, &gen_review, &separator2,
        &logs, &check_updates, &about, &quit,
    ])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .menu_on_left_click(true)
        .on_menu_event(handle_menu_event)
        .build(app)?;

    Ok(())
}
```

### 1.3 Hide dock icon (tray-only)

```rust
// src-tauri/src/main.rs
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            tray::create_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running app");
}
```

Dynamic toggle when viewer window opens/closes:

```rust
// When opening viewer:
app.set_activation_policy(tauri::ActivationPolicy::Regular);
window.show()?;
window.set_focus()?;

// When viewer closes (window close event):
app.set_activation_policy(tauri::ActivationPolicy::Accessory);
```

### 1.4 Bundle Bun binary as sidecar

Place pre-built Bun binaries in `src-tauri/binaries/`:
```
src-tauri/binaries/pullread-aarch64-apple-darwin
src-tauri/binaries/pullread-x86_64-apple-darwin
```

Build script to copy from existing build:
```bash
# scripts/prepare-sidecar.sh
#!/bin/bash
BUN_BIN="$(pwd)/dist/pullread"
TARGET=$(rustc --print host-tuple 2>/dev/null || rustc -vV | grep host | cut -d' ' -f2)
cp "$BUN_BIN" "src-tauri/binaries/pullread-${TARGET}"
```

Permissions in `src-tauri/capabilities/default.json`:
```json
{
  "identifier": "default",
  "windows": ["*"],
  "permissions": [
    "core:default",
    {
      "identifier": "shell:allow-spawn",
      "allow": [{
        "name": "binaries/pullread",
        "sidecar": true,
        "args": [{ "validator": "\\S+" }]
      }]
    },
    "dialog:default",
    "notification:default"
  ]
}
```

### 1.5 Sidecar lifecycle management

```rust
// src-tauri/src/sidecar.rs
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use std::sync::Mutex;

pub struct SidecarState {
    viewer_child: Mutex<Option<CommandChild>>,
    config_path: String,
    data_path: String,
    kokoro_model_dir: Option<String>,
}

impl SidecarState {
    /// Start the HTTP viewer server on a dynamic port
    pub async fn ensure_viewer_running(&self, app: &tauri::AppHandle) -> Result<u16, String> {
        let mut child_lock = self.viewer_child.lock().unwrap();
        if child_lock.is_some() {
            return Ok(self.viewer_port);
        }

        let port = portpicker::pick_unused_port().unwrap_or(7777);

        let mut cmd = app.shell().sidecar("pullread").unwrap();
        cmd = cmd.args(["view", "--config-path", &self.config_path, "--port", &port.to_string()]);

        if let Some(ref dir) = self.kokoro_model_dir {
            cmd = cmd.env("PULLREAD_KOKORO_MODEL_DIR", dir);
        }

        let (mut rx, child) = cmd.spawn().map_err(|e| e.to_string())?;
        *child_lock = Some(child);

        // Wait for server ready
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        Ok(port)
    }

    /// Run a sync operation (short-lived process)
    pub async fn sync(&self, app: &tauri::AppHandle, retry_failed: bool) -> Result<String, String> {
        let mut args = vec!["sync", "--config-path", &self.config_path, "--data-path", &self.data_path];
        if retry_failed {
            args.push("--retry-failed");
        }

        let output = app.shell().sidecar("pullread").unwrap()
            .args(&args)
            .output()
            .await
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !stderr.is_empty() {
            // Log to file
            append_log(&stderr);
        }

        Ok(stdout)
    }
}
```

### 1.6 Open viewer in Tauri WebView window

```rust
// src-tauri/src/commands.rs
use tauri::WebviewUrl;
use tauri::WebviewWindowBuilder;

#[tauri::command]
async fn open_viewer(app: tauri::AppHandle, state: tauri::State<'_, SidecarState>) -> Result<(), String> {
    let port = state.ensure_viewer_running(&app).await?;
    let url = format!("http://localhost:{}", port);

    // Reuse existing window or create new
    if let Some(window) = app.get_webview_window("viewer") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        let window = WebviewWindowBuilder::new(
            &app,
            "viewer",
            WebviewUrl::External(url.parse().unwrap()),
        )
        .title("PullRead")
        .inner_size(1100.0, 750.0)
        .build()
        .map_err(|e| e.to_string())?;

        // Show in dock when viewer is open
        #[cfg(target_os = "macos")]
        app.set_activation_policy(tauri::ActivationPolicy::Regular);
    }

    Ok(())
}
```

---

## Phase 2: Core Features (macOS)

**Goal:** Full feature parity with the Swift shell for core operations.

### 2.1 Scheduled sync timers

Port the timer logic from `AppDelegate.swift` lines 336-370.

```rust
// src-tauri/src/timers.rs
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::time::{interval, Duration};

pub fn start_sync_timer(app: tauri::AppHandle, interval_str: &str) {
    let duration = match interval_str {
        "30m" => Duration::from_secs(30 * 60),
        "1h"  => Duration::from_secs(60 * 60),
        "4h"  => Duration::from_secs(4 * 60 * 60),
        "12h" => Duration::from_secs(12 * 60 * 60),
        _     => return, // "manual" — no timer
    };

    tauri::async_runtime::spawn(async move {
        let mut tick = interval(duration);
        tick.tick().await; // skip first immediate tick
        loop {
            tick.tick().await;
            // trigger sync via app state
            let state = app.state::<SidecarState>();
            let _ = state.sync(&app, false).await;
            // update tray menu "Last sync: HH:MM"
            update_last_sync_time(&app);
        }
    });
}
```

Review timer follows the same pattern with `"daily"` (86400s) and `"weekly"` (604800s).

### 2.2 Notifications

```rust
// src-tauri/src/notifications.rs
use tauri_plugin_notification::NotificationExt;

pub fn notify_sync_complete(app: &tauri::AppHandle, message: &str, sound: bool) {
    let mut builder = app.notification()
        .builder()
        .title("Sync Complete")
        .body(message);

    if sound {
        builder = builder.sound("default");
    }

    let _ = builder.show();
}
```

Triggered after each sync/review completes. Sound preference read from config file.

### 2.3 URL scheme handling (`pullread://`)

Register the URL scheme in `tauri.conf.json`:
```json
{
  "app": {
    "security": {
      "dangerousRemoteDomainIpcAccess": [{
        "scheme": "pullread",
        "domain": "localhost",
        "windows": ["viewer"]
      }]
    }
  }
}
```

Handle in Rust using Tauri's deep link plugin:
```rust
// Handle pullread://open, pullread://save?url=..., pullread://sync, etc.
use tauri_plugin_deep_link::DeepLinkExt;

app.deep_link().on_open_url(|event| {
    let urls = event.urls();
    for url in urls {
        match url.host_str() {
            Some("open") => { /* open viewer, optionally with ?file= param */ }
            Some("save") => { /* append to inbox.json */ }
            Some("sync") => { /* trigger sync */ }
            Some("notebook") => { /* open viewer with notebook fragment */ }
            _ => {}
        }
    }
});
```

### 2.4 Folder picker (replace osascript)

The web viewer calls `/api/pick-folder`. Two options:

**Option A (no viewer changes):** The Bun server's `/api/pick-folder` endpoint
already works via `osascript`. Keep as-is for Phase 2. It works on macOS.

**Option B (Tauri-native, cross-platform):** Add a Tauri command and have the
viewer call it when running inside Tauri:

```javascript
// viewer/03-settings.js — detect Tauri environment
async function pickFolder() {
    if (window.__TAURI__) {
        const { open } = await import('@tauri-apps/plugin-dialog');
        return await open({ directory: true });
    }
    // fallback to existing /api/pick-folder for standalone viewer
    const res = await fetch('/api/pick-folder', { method: 'POST' });
    const data = await res.json();
    return data.cancelled ? null : data.path;
}
```

**Recommendation:** Option A for Phase 2 (zero viewer changes), Option B for Phase 3.

### 2.5 Startup sync

```rust
// In main.rs setup():
let app_handle = app.handle().clone();
tauri::async_runtime::spawn(async move {
    tokio::time::sleep(Duration::from_secs(2)).await;
    let state = app_handle.state::<SidecarState>();
    if state.is_configured() && !state.is_first_run() {
        let _ = state.sync(&app_handle, false).await;
    }
});
```

### 2.6 Auto-update (replace Sparkle)

Generate signing keys:
```bash
npm run tauri signer generate -- -w ~/.tauri/pullread.key
```

Configure in `tauri.conf.json`:
```json
{
  "bundle": { "createUpdaterArtifacts": true },
  "plugins": {
    "updater": {
      "pubkey": "<ED25519_PUBLIC_KEY>",
      "endpoints": ["https://releases.pullread.com/{{target}}/{{arch}}/{{current_version}}"]
    }
  }
}
```

Wire the "Check for Updates…" tray menu item:
```rust
"updates" => {
    use tauri_plugin_updater::UpdaterExt;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match app.updater().unwrap().check().await {
            Ok(Some(update)) => {
                let _ = update.download_and_install(|_, _| {}, || {}).await;
                app.restart();
            }
            Ok(None) => { notify(&app, "You're up to date."); }
            Err(e) => { notify(&app, &format!("Update check failed: {}", e)); }
        }
    });
}
```

### 2.7 Launch at login

```rust
// main.rs
use tauri_plugin_autostart::MacosLauncher;

tauri::Builder::default()
    .plugin(tauri_plugin_autostart::init(
        MacosLauncher::LaunchAgent,
        None,
    ))
```

Expose toggle via tray menu or settings page:
```rust
use tauri_plugin_autostart::ManagerExt;

let mgr = app.autolaunch();
if enable { mgr.enable()?; } else { mgr.disable()?; }
```

---

## Phase 3: Platform Abstraction Layer

**Goal:** Abstract macOS-specific features behind a trait so Windows/Linux
implementations can be added later.

### 3.1 Platform trait

```rust
// src-tauri/src/platform/mod.rs

pub trait PlatformServices: Send + Sync {
    /// Store a secret (API key) securely
    fn store_secret(&self, account: &str, password: &str) -> Result<(), String>;

    /// Retrieve a secret
    fn load_secret(&self, account: &str) -> Result<Option<String>, String>;

    /// Delete a secret
    fn delete_secret(&self, account: &str) -> Result<(), String>;

    /// Check grammar (returns JSON matches)
    fn check_grammar(&self, text: &str) -> Result<Vec<GrammarMatch>, String>;

    /// Index articles for system search (Spotlight, Windows Search, etc.)
    fn index_articles(&self, output_path: &str) -> Result<(), String>;

    /// Open a file/folder in the system file manager
    fn reveal_in_file_manager(&self, path: &str) -> Result<(), String>;
}
```

### 3.2 macOS implementation

```rust
// src-tauri/src/platform/macos.rs

pub struct MacOSServices;

impl PlatformServices for MacOSServices {
    fn store_secret(&self, account: &str, password: &str) -> Result<(), String> {
        // Use security-framework crate or shell out to `security` CLI
        // Maps to current KeychainService.swift behavior
        use std::process::Command;
        Command::new("security")
            .args(["add-generic-password", "-a", account, "-s", "com.pullread.api-keys",
                   "-w", password, "-U"])
            .output()
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn check_grammar(&self, text: &str) -> Result<Vec<GrammarMatch>, String> {
        // Shell out to swift -e 'NSSpellChecker...' same as current /api/grammar
        // Or use objc2 crate for direct Cocoa access
    }

    fn index_articles(&self, output_path: &str) -> Result<(), String> {
        // Use objc2 + CoreSpotlight bindings
        // Or shell out to mdimport / custom Swift helper
    }

    fn reveal_in_file_manager(&self, path: &str) -> Result<(), String> {
        std::process::Command::new("open").arg(path).spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
}
```

### 3.3 Stub implementations for Windows/Linux (future)

```rust
// src-tauri/src/platform/windows.rs
pub struct WindowsServices;

impl PlatformServices for WindowsServices {
    fn store_secret(&self, account: &str, password: &str) -> Result<(), String> {
        // Use windows-credentials crate (DPAPI)
        todo!("Windows Credential Manager")
    }
    fn check_grammar(&self, text: &str) -> Result<Vec<GrammarMatch>, String> {
        // Use Windows Spell Checker API or fall back to LanguageTool cloud
        todo!("Windows spell checker")
    }
    fn index_articles(&self, _output_path: &str) -> Result<(), String> {
        Ok(()) // Skip — Windows Search indexes markdown files automatically
    }
    fn reveal_in_file_manager(&self, path: &str) -> Result<(), String> {
        std::process::Command::new("explorer").arg(path).spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
}
```

### 3.4 Wire platform services into app state

```rust
// main.rs
fn main() {
    let platform: Box<dyn PlatformServices> = {
        #[cfg(target_os = "macos")]
        { Box::new(platform::macos::MacOSServices) }
        #[cfg(target_os = "windows")]
        { Box::new(platform::windows::WindowsServices) }
        #[cfg(target_os = "linux")]
        { Box::new(platform::linux::LinuxServices) }
    };

    tauri::Builder::default()
        .manage(platform)
        // ...
}
```

---

## Phase 4: Viewer Adaptations

**Goal:** The viewer works unchanged in Phase 1-2 (served by Bun over localhost).
Phase 4 adds Tauri-aware enhancements where beneficial.

### 4.1 Tauri detection shim

Add a thin compatibility layer that the existing viewer modules can call:

```javascript
// viewer/00-tauri-shim.js (loaded first, before 01-state.js)
window.PR_TAURI = !!window.__TAURI__;

window.prFetch = async function(url, options) {
    // For now, always use fetch() to the Bun server.
    // In the future, selected endpoints could use invoke().
    return fetch(url, options);
};

window.prPickFolder = async function() {
    if (window.PR_TAURI) {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const path = await open({ directory: true });
            return path ? { path } : { cancelled: true };
        } catch { /* fall through */ }
    }
    const res = await fetch('/api/pick-folder', { method: 'POST' });
    return res.json();
};
```

This approach means **zero changes to existing viewer modules** in Phase 1-3.
The shim is only loaded when building for Tauri.

### 4.2 Event-based file watching (replace polling)

Currently `13-init.js` polls `/api/files-changed` every 5 seconds. In Tauri,
this can be replaced with event-based updates:

```javascript
// viewer/13-init.js — enhanced init
if (window.PR_TAURI) {
    const { listen } = await import('@tauri-apps/api/event');
    await listen('files:changed', () => {
        loadFiles(); // Refresh article list immediately
    });
} else {
    // Keep existing 5-second polling for standalone viewer
    setInterval(checkFilesChanged, 5000);
}
```

The Rust side emits the event when a sync completes:

```rust
app.emit("files:changed", ()).unwrap();
```

### 4.3 Window title sync

```javascript
// The existing viewer already sets document.title.
// Tauri picks this up automatically for the window title bar.
// No changes needed.
```

---

## Phase 5: Build & Distribution

### 5.1 Build pipeline

```bash
# Step 1: Build the Bun CLI binary
bun build --compile --target=bun-darwin-arm64 src/index.ts --outfile dist/pullread

# Step 2: Copy to sidecar location
scripts/prepare-sidecar.sh

# Step 3: Pre-sign the sidecar (required for notarization)
codesign --force --options runtime \
  --sign "Developer ID Application: ..." \
  src-tauri/binaries/pullread-aarch64-apple-darwin

# Step 4: Build Tauri app
cd src-tauri && cargo tauri build

# Output: src-tauri/target/release/bundle/dmg/PullRead_X.Y.Z_aarch64.dmg
```

### 5.2 CI/CD (GitHub Actions)

```yaml
name: Build Tauri
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: aarch64-apple-darwin
          - os: macos-13  # Intel runner
            target: x86_64-apple-darwin
          # Future:
          # - os: ubuntu-latest
          #   target: x86_64-unknown-linux-gnu
          # - os: windows-latest
          #   target: x86_64-pc-windows-msvc

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: oven-sh/setup-bun@v2
      - uses: dtolnay/rust-toolchain@stable

      - name: Build Bun sidecar
        run: |
          bun install
          bun build --compile src/index.ts --outfile dist/pullread
          bash scripts/prepare-sidecar.sh

      - name: Sign sidecar
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
        run: |
          codesign --force --options runtime \
            --sign "$APPLE_SIGNING_IDENTITY" \
            src-tauri/binaries/pullread-${{ matrix.target }}

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_KEY }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

### 5.3 Update manifest

Host a JSON endpoint (e.g., GitHub Pages or S3) at the configured updater URL:

```json
{
  "version": "2.0.0",
  "notes": "First Tauri release",
  "pub_date": "2026-03-01T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<ED25519_SIG>",
      "url": "https://github.com/shellen/pullread/releases/download/v2.0.0/PullRead.app.tar.gz"
    }
  }
}
```

---

## Phase 6: macOS-Only Integrations (Optional, Post-Launch)

These features are currently in the Swift shell and would be macOS-only
even in the Tauri version. They can be added incrementally after the
core Tauri app ships.

### 6.1 Share Extension

**Cannot be done in Tauri.** Share Extensions are separate app extension bundles
that macOS loads into other apps' processes. Options:

- **Option A:** Ship a separate `PullReadShareExtension.appex` alongside the Tauri
  app. This requires a small amount of Swift code and Xcode project for just the
  extension. The extension writes to `~/.config/pullread/inbox.json` (same as today).
- **Option B:** Drop Share Extension support. Users can use the URL scheme
  (`pullread://save?url=...`) via a bookmarklet or browser extension instead.

**Recommendation:** Option B for launch. Option A later if users request it.

### 6.2 Spotlight Indexing

Can be done from Rust using `objc2` + `core-spotlight` bindings, or by shelling
out to a small Swift helper. The current `SpotlightIndexer.swift` is 144 lines.

**Recommendation:** Defer. Run a small Swift helper binary for this if needed:
```bash
swift PullReadSpotlight.swift --index /path/to/articles
```

### 6.3 Shortcuts/Siri

Requires App Intents framework which is Swift-only. Similar to Share Extension,
this would need a native Swift companion.

**Recommendation:** Defer. The URL scheme (`pullread://sync`, `pullread://open`)
provides equivalent functionality accessible from Shortcuts via "Open URL" action.

---

## Migration Checklist

### Phase 1: Scaffold (est. ~3 days)
- [ ] `cargo tauri init` and configure `tauri.conf.json`
- [ ] System tray with all 12 menu items
- [ ] Dock icon hidden, tray-only activation policy
- [ ] Bun binary bundled as sidecar with correct target triples
- [ ] Sidecar spawn for `view` command (HTTP server)
- [ ] Open viewer in Tauri WebView window
- [ ] Window state save/restore (position, size)
- [ ] Dynamic activation policy toggle (dock icon on window open/close)

### Phase 2: Core Features (est. ~5 days)
- [ ] Sidecar spawn for `sync` command with stdout/stderr parsing
- [ ] Sync timer (30m, 1h, 4h, 12h, manual)
- [ ] Review timer (daily, weekly, off)
- [ ] Startup sync (2s delay, skip if first run)
- [ ] Notifications (sync complete, sync failed, review ready)
- [ ] Sound preference toggle for notifications
- [ ] URL scheme registration and handling (`pullread://`)
- [ ] Inbox write for `pullread://save?url=...`
- [ ] Tray menu dynamic updates ("Last sync: HH:MM", "Next sync: HH:MM")
- [ ] Log file management (`/tmp/pullread.log`)
- [ ] "Open Folder" action (reveal in Finder)
- [ ] "About" dialog
- [ ] Auto-update via `tauri-plugin-updater`
- [ ] Launch at login via `tauri-plugin-autostart`

### Phase 3: Platform Abstraction (est. ~3 days)
- [ ] `PlatformServices` trait definition
- [ ] macOS Keychain integration (store/load/delete API keys)
- [ ] macOS grammar check (NSSpellChecker via Swift helper)
- [ ] Platform service injection into app state
- [ ] Stub implementations for Windows/Linux

### Phase 4: Viewer Adaptations (est. ~2 days)
- [ ] `00-tauri-shim.js` compatibility layer
- [ ] Tauri-native folder picker (replace osascript)
- [ ] Event-based file watching (replace 5s polling)
- [ ] Build script: embed shim when building for Tauri

### Phase 5: Build & Distribution (est. ~3 days)
- [ ] `prepare-sidecar.sh` build script
- [ ] Sidecar code signing (pre-sign before Tauri build)
- [ ] GitHub Actions workflow for macOS (ARM + Intel)
- [ ] Ed25519 key generation and updater configuration
- [ ] Update manifest hosting
- [ ] DMG generation and notarization testing
- [ ] Appcast / update endpoint for existing Sparkle users

### Phase 6: macOS Extras (est. ~2-4 days, deferrable)
- [ ] Spotlight indexing (via Swift helper or objc2 bindings)
- [ ] Share Extension (separate .appex bundle)
- [ ] Shortcuts/Siri (App Intents — separate Swift companion)

---

## Dependencies (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-notification = "2"
tauri-plugin-autostart = "2"
tauri-plugin-updater = "2"
tauri-plugin-deep-link = "2"
tauri-plugin-window-state = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
portpicker = "0.1"

# macOS-specific (optional)
[target.'cfg(target_os = "macos")'.dependencies]
security-framework = "2"
# objc2 = "0.5"  # If using Spotlight directly
```

---

## What We Are NOT Doing

- **Not rewriting the Bun CLI in Rust.** The content extraction pipeline
  (`@mozilla/readability`, `turndown`, feed parsing) stays in TypeScript.
  This is the single most important decision — it preserves extraction
  quality and avoids the largest rewrite risk.

- **Not changing the viewer's API communication pattern.** The viewer still
  talks to localhost via `fetch()`. The Bun HTTP server still runs. We're
  only replacing the *shell* that launches it.

- **Not adding Windows/Linux support in Phase 1-5.** macOS first, validated,
  then cross-platform. The architecture supports it, but we ship what works.

- **Not dropping the standalone CLI.** `pullread sync`, `pullread view`, etc.
  still work from the terminal. The Tauri app is an optional GUI wrapper.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Sidecar notarization fails | Medium | High | Pre-sign binary; known workaround exists ([#11992](https://github.com/tauri-apps/tauri/issues/11992)) |
| Bun binary size (~100MB) | Certain | Low | Compress in DMG (~29MB); acceptable for desktop app |
| WKWebView rendering differences | Low | Low | Already using WKWebView in Swift version; no change |
| Tauri tray API missing dynamic features | Low | Medium | Current menu is standard items; no custom views needed |
| Autostart unreliable on macOS | Low | Low | LaunchAgent approach; AppleScript fallback available |
| Two runtimes (Rust + Bun) | Certain | Low | Acceptable tradeoff; keeps extraction quality |

---

## Success Criteria

The Tauri version is ready to ship when:

1. Menu bar icon appears on launch with all 12 menu items functional
2. Sync runs on schedule and on-demand with correct notifications
3. Viewer opens in native window with full article reading capability
4. Onboarding completes for a new user (no Swift UI shown)
5. Auto-update checks and installs new versions
6. `pullread://save?url=...` adds articles to inbox
7. App size (DMG) is under 150MB
8. Code signing and notarization pass on macOS
9. No regressions in article extraction quality (unchanged Bun binary)
10. Clean uninstall (no orphan processes, no leftover files)
