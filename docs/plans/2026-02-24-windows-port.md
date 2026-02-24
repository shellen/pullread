# Windows Port — Research and Design

## Status: Research Complete

Investigation into porting Pull Read to Windows, covering platform APIs,
effort estimates, and minimum viable scope.

## Target Platforms

- **Windows 10** version 1803+ (April 2018 Update) — Tauri v2 minimum
- **Windows 11** — full support including system tray, native notifications

## Architecture Overview

Pull Read is a Tauri v2 app with a TypeScript backend (sidecar) and HTML/JS
frontend. Most of the codebase is already cross-platform:

| Layer | Platform-specific? | Notes |
|-------|-------------------|-------|
| Feed parsing (feed.ts) | No | Pure TypeScript |
| Article extraction (extractor.ts) | No | linkedom + Readability |
| Markdown writer (writer.ts) | No | Pure TypeScript |
| Viewer server (viewer.ts) | No | Node HTTP server |
| Summarizer (summarizer.ts) | Partially | Apple Intelligence is macOS-only |
| TTS (tts providers) | Partially | Browser TTS + cloud are cross-platform; Kokoro is local |
| Config paths | Yes | `~/.config/pullread/` → `%APPDATA%\pullread\` |
| API key storage | Yes | macOS Keychain → Windows Credential Manager |
| Cookie extraction | Yes | macOS-specific Safari/Chrome cookie access |
| Spell check | Yes | macOS NSSpellChecker → Windows ISpellChecker |
| Code signing | Yes | Apple codesign → Windows Authenticode |

## Platform API Equivalents

### Apple Intelligence → Windows Copilot Runtime

Windows App SDK 1.7+ (shipped mid-2025) includes the **Windows AI Foundry**
(formerly "Windows Copilot Runtime") with on-device text intelligence:

- **Phi Silica**: NPU-optimized small language model, ~3.3B parameters
- **Text Summarization API**: `TextSummarizer` class in
  `Microsoft.Windows.AI.Generative` namespace
- **Availability**: Copilot+ PCs only (Snapdragon X, Intel Core Ultra,
  AMD Ryzen AI). Requires NPU hardware.
- **API pattern**: Similar to our Apple Intelligence flow — check availability,
  create session, send text, get summary.

```csharp
// Example (C# — would be called via Tauri command or sidecar)
if (TextSummarizer.IsAvailable()) {
    var summarizer = await TextSummarizer.CreateAsync();
    var result = await summarizer.SummarizeAsync(articleText);
}
```

**Implementation**: Add a `windows-ai` provider to our LLM provider list,
gated on `TextSummarizer.IsAvailable()`. Would need a small Rust or C# helper
invoked from the Tauri backend, similar to how we shell out for Apple
Intelligence via `osascript`.

### macOS Keychain → Windows Credential Manager

Windows Credential Manager (DPAPI-backed) stores secrets per-user. Tauri
plugins exist (`tauri-plugin-stronghold` or direct Win32 API calls). The
migration is straightforward:

- `security add-generic-password` → `CredWrite` / `CredRead` Win32 API
- Or use the `keytar` npm package which abstracts both platforms

### macOS NSSpellChecker → Windows ISpellChecker

The `ISpellChecker` COM API has been available since **Windows 8**:

- Per-language spell checker instances
- `Check()` returns misspelling ranges with suggestions
- `ComprehensiveCheck()` for grammar + spelling
- Supports custom dictionaries

For Pull Read, spell check is used in notebook note editing. The Tauri webview
(WebView2 on Windows) has built-in spell check support, so this may work
out of the box without custom integration.

### Config and Data Paths

| macOS | Windows |
|-------|---------|
| `~/.config/pullread/` | `%APPDATA%\pullread\` |
| `~/Documents/Pull Read/` (default output) | `%USERPROFILE%\Documents\Pull Read\` |
| `~/.config/pullread/.tts-cache/` | `%APPDATA%\pullread\.tts-cache\` |

Use `dirs` crate (Rust) or `os.homedir()` + platform check (TypeScript).
Our sidecar already uses `path.join(homedir(), '.config', 'pullread')` which
would need to become platform-aware.

## Blocking Work Items

### Must-have for MVP

1. **Platform-aware config paths**: Replace hardcoded `~/.config/pullread`
   with `%APPDATA%\pullread` on Windows. ~1 day.

2. **Keychain → Credential Manager**: Abstract API key storage behind a
   platform interface. ~1 day.

3. **CI build matrix**: Add Windows to `build-tauri.yml`. Tauri v2 supports
   NSIS and MSI installers. ~1 day.

4. **Code signing**: Get a Windows Authenticode certificate (or use Azure
   Trusted Signing). Configure in CI. ~0.5 day.

5. **Cookie extraction**: Currently macOS-only (Safari + Chrome binary cookie
   parsing). Either skip on Windows or add Chrome cookie support for Windows
   (SQLite path differs). ~0.5–1 day.

### Nice-to-have

6. **Windows Copilot Runtime integration**: Add `windows-ai` LLM provider
   for on-device summarization on Copilot+ PCs. ~2 days.

7. **Auto-updater**: Tauri's updater supports Windows. Needs a separate
   update manifest or shared one with platform-specific assets. ~0.5 day.

8. **System tray**: Tauri v2 system tray works on Windows. Menu bar app
   paradigm maps to system tray naturally. ~0.5 day (mostly testing).

## Estimated Effort

- **Minimum viable Windows build**: ~3–4 days of focused work
- **Polished release with Copilot Runtime**: ~5–6 days
- **Ongoing**: CI build time doubles, manual testing on Windows needed

## Risks

- **WebView2 differences**: Edge-based WebView2 vs macOS WKWebView may have
  rendering differences in our viewer HTML. Needs testing.
- **Font rendering**: Our self-hosted fonts (Work Sans, etc.) may render
  differently on Windows. ClearType vs macOS font smoothing.
- **Kokoro TTS**: Local TTS model loading may behave differently. Needs testing.
- **No Safari cookies**: Windows users can't import Safari reading sessions.
  Chrome cookie extraction would need Windows-specific SQLite paths.

## Decision

This is a viable 1-week project. The codebase is well-positioned for it since
the core logic (feed parsing, extraction, Markdown writing, viewer server) is
pure TypeScript with no platform dependencies. The main work is config paths,
secret storage, CI pipeline, and testing.

Recommend deferring until after the current feature work stabilizes (v0.4.0
timeframe) to avoid splitting focus.
