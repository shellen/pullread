# Plan: Auto-Updates, User Messaging, and First-Run Experience

## Context

PullRead is a macOS menu bar app distributed outside the App Store as a
signed/notarized DMG via GitHub Releases. There is currently no mechanism for
notifying users about new versions, no way to communicate feature changes after
an update, and the first-run experience drops users into a configuration form
with minimal guidance.

This plan covers three areas:

1. **Auto-updates** -- so users get new versions without manual downloads
2. **User messaging** -- so users learn about what changed after updating
3. **First-run experience** -- so new users understand the app and configure it
   successfully

---

## 1. Auto-Updates via Sparkle

### Why Sparkle

Sparkle is the standard auto-update framework for non-App Store macOS apps. It
is used by Firefox, iTerm2, VLC, and hundreds of other apps. It handles version
checking, downloading, signature verification, installation, and relaunch. There
is no realistic reason to build this from scratch.

### How it works

- The app includes Sparkle as a Swift Package (SPM dependency).
- On launch, Sparkle checks a remote **appcast.xml** file (an RSS feed with
  version metadata) on a configurable schedule (default: every 24 hours).
- If a newer version exists, Sparkle shows a native update dialog with release
  notes, a download progress bar, and an install-and-relaunch button.
- Updates are verified with **Ed25519 signatures** before installation.

### Integration steps

#### a. Add Sparkle via SPM

Add `https://github.com/sparkle-project/Sparkle` (version 2.x) as a Swift
package dependency in the Xcode project. This is the first SPM dependency in
the project.

#### b. Initialize the updater in AppDelegate

Add an `SPUStandardUpdaterController` property to `AppDelegate.swift`:

```swift
import Sparkle

private let updaterController = SPUStandardUpdaterController(
    startingUpdater: true,
    updaterDelegate: nil,
    userDriverDelegate: nil
)
```

`startingUpdater: true` enables automatic background checks on the default
schedule. No additional timer or polling code is needed.

#### c. Add "Check for Updates..." menu item

In `setupStatusBar()`, add a menu item between "View Logs..." and the
separator before "About PullRead":

```
View Logs... (Cmd+L)
Check for Updates...
─────────────────
About PullRead
Quit PullRead (Cmd+Q)
```

Wire it to `updaterController.checkForUpdates(_:)`. Observe the updater's
`canCheckForUpdates` property to enable/disable the item.

#### d. Add Info.plist keys

Two keys are required in `PullReadTray/PullReadTray/Info.plist`:

| Key | Value | Purpose |
|-----|-------|---------|
| `SUFeedURL` | URL to appcast.xml (see hosting below) | Where Sparkle looks for updates |
| `SUPublicEDKey` | Base64-encoded Ed25519 public key | Verifies update signatures |

#### e. Generate Ed25519 keys (one-time)

Run Sparkle's `generate_keys` tool on the developer machine. It prints the
public key (goes into Info.plist) and saves the private key to the macOS
Keychain. Export the private key and store it as a GitHub Actions secret
(`SPARKLE_PRIVATE_KEY`) for CI signing.

#### f. Generate appcast.xml in CI

Modify `.github/workflows/release.yml` to:

1. Download Sparkle's command-line tools (`sign_update`).
2. Sign the DMG with the Ed25519 private key from GitHub Secrets.
3. Build an `appcast.xml` with the version, download URL, signature, and file
   size.
4. Publish `appcast.xml` to a stable URL (options below).

The appcast format is standard RSS 2.0 with Sparkle namespace extensions:

```xml
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Pull Read Updates</title>
    <item>
      <title>Version 1.1.0</title>
      <sparkle:version>2</sparkle:version>
      <sparkle:shortVersionString>1.1.0</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>14.0</sparkle:minimumSystemVersion>
      <sparkle:releaseNotesLink>https://HOSTNAME/release-notes/1.1.0.html</sparkle:releaseNotesLink>
      <pubDate>Wed, 05 Feb 2026 12:00:00 +0000</pubDate>
      <enclosure
        url="https://github.com/shellen/pullread/releases/download/v1.1.0/PullRead.dmg"
        sparkle:edSignature="BASE64_SIGNATURE"
        length="12345678"
        type="application/octet-stream" />
    </item>
  </channel>
</rss>
```

Key mappings:
- `sparkle:version` = `CFBundleVersion` (integer build number, must increment)
- `sparkle:shortVersionString` = `CFBundleShortVersionString` (user-facing)
- `sparkle:edSignature` = Ed25519 signature of the DMG

#### g. Appcast hosting

Two options:

| Option | URL pattern | Tradeoff |
|--------|-------------|----------|
| GitHub Pages (separate repo or branch) | `https://shellen.github.io/pullread/appcast.xml` | Clean URL, dedicated hosting |
| Raw file in main repo | `https://raw.githubusercontent.com/shellen/pullread/main/appcast.xml` | Simplest, but URL is ugly and GitHub caches raw files for ~5 min |

**Recommendation:** GitHub Pages on the main repo (publish from a `gh-pages`
branch or a `/docs` folder). CI pushes the appcast.xml there after each
release.

#### h. Version management

The current version is hardcoded in three places:
- `Info.plist`: `CFBundleShortVersionString` and `CFBundleVersion`
- `package.json`: `version`
- `AppDelegate.swift`: the About dialog string

For Sparkle to work, `CFBundleVersion` must be an incrementing integer (or
version string that Sparkle can compare). The About dialog should read from
`Bundle.main` instead of a hardcoded string. Consider using `agvtool` or a
CI step to bump versions on tagged releases.

#### i. Local build script update

Add a Sparkle signing step to `scripts/build-release.sh` between DMG creation
and notarization, so locally-built releases also have valid Ed25519 signatures
and an appcast entry.

---

## 2. User Messaging ("What's New")

### The problem

Sparkle shows release notes *before* an update is installed (in the update
prompt dialog). But after the app restarts at the new version, there is no
indication of what changed. Users who accept updates quickly or who update
via Homebrew never see the release notes at all.

### Solution: post-update "What's New" screen

#### a. Version change detection

On every launch, compare the running version against a stored value in
UserDefaults:

```
currentVersion = Bundle.main CFBundleShortVersionString
lastSeenVersion = UserDefaults "lastSeenVersion"

if lastSeenVersion is nil:
    # First install. Set the value silently. Don't show "What's New"
    # because the user hasn't seen any previous version.
    store currentVersion
else if lastSeenVersion != currentVersion:
    # Updated. Show "What's New" for this version.
    show WhatsNew
    store currentVersion
```

This logic goes in `AppDelegate.applicationDidFinishLaunching()`, after the
existing first-run/invalid-config check. First-time users should see onboarding,
not "What's New."

#### b. What's New UI

A new `WhatsNewView.swift` SwiftUI view, presented in the existing
`SettingsWindowController` (or a dedicated window controller). Contents:

- Version number as header
- Bulleted list of 3-5 highlights for the release
- "Got it" dismiss button

Content can be stored as a simple dictionary in Swift for now. When the release
cadence increases, move it to a bundled JSON file in app Resources.

#### c. Relationship to Sparkle release notes

These serve different purposes and both should exist:

| When | What | Where |
|------|------|-------|
| During update prompt | Sparkle release notes (HTML) | Sparkle's update dialog |
| After update, on first launch | "What's New" highlights | In-app SwiftUI view |

The Sparkle release notes can be more detailed (full changelog). The in-app
"What's New" should be a curated summary (top 3-5 user-facing changes).

---

## 3. First-Run Experience

### Current state

The app detects first run by checking for `~/.config/pullread/feeds.json`. If
missing, it opens a settings window with a "Welcome to PullRead" header above
the standard configuration form (output folder, feeds list, cookies toggle).
The save button reads "Get Started" instead of "Save."

This works but has gaps:
- No explanation of what the app does or how the workflow works
- Empty feed list with no guidance on what to add
- No default output folder
- Cookies toggle is unexplained
- After saving, no indication of what to do next
- No first sync triggered

### Phase 1: Quick wins (settings view enhancements)

Changes to `SettingsView.swift` when `isFirstRun = true`:

1. **Add an explanatory paragraph** below the welcome header:
   "PullRead syncs your RSS and Atom feeds into clean markdown files, saved
   to a folder you choose. Add your feeds below and you're ready to go."

2. **Pre-fill a default output folder** of `~/Documents/PullRead` so the field
   is not blank. Users can change it but have a sensible starting point.

3. **Add a sample feed** to the initial feed list so users see what a
   configured feed looks like and can sync immediately. Example:
   `"Hacker News (100+)" -> "https://hnrss.org/newest?points=100"`

4. **Add step labels** to each configuration section: "1. Choose Output
   Folder", "2. Add Your Feeds", "3. Options" to give a sense of progression.

5. **Add helper text** to the cookies toggle: "Enable this to access
   paywalled sites using your Chrome login cookies."

6. **After saving, trigger the first sync automatically** and show a
   notification: "Your first sync is running. Articles will appear in your
   output folder shortly."

7. **Show a brief post-setup message**: "You're all set! Look for the
   PullRead icon in your menu bar to sync, view articles, and manage
   settings."

### Phase 2: Multi-step onboarding wizard

Replace the single-form first-run experience with a stepped flow. Create a
new `OnboardingView.swift` (separate from `SettingsView.swift`) with
Back/Next navigation:

| Step | Content |
|------|---------|
| 1. Welcome | App icon, name, one-sentence description. "PullRead turns your RSS feeds into a local library of clean, readable markdown files." |
| 2. Output folder | Folder picker with default pre-filled. Brief explanation of what goes there. |
| 3. Add feeds | Feed list with suggestions. Text field for custom URLs. Sample feed pre-loaded. |
| 4. Options | Cookies toggle with explanation. Launch at Login toggle (via `SMAppService` on macOS 13+). |
| 5. Ready | "All set" confirmation. "Sync Now" button that runs the first sync inline with a progress indicator. Pointer to the menu bar icon. |

`SettingsWindowController.showSettings(isFirstRun:)` routes to
`OnboardingView` when `isFirstRun = true` and `SettingsView` otherwise.

Store an `onboardingCompleted` flag in UserDefaults so the wizard only
appears once (separate from config-file-based detection, to handle edge
cases like config deletion).

### Phase 3: Discovery and polish

- **"Getting Started" menu item**: Visible for the first week after install
  (tracked via UserDefaults timestamp). Points to a brief help view or the
  project README.
- **Viewer onboarding overlay**: On first "View Articles" open, show a
  lightweight overlay explaining the two-pane UI, search, keyboard shortcuts
  (arrow keys, `/`, `[`, `Esc`), and theme/font controls. Dismiss on any
  interaction.
- **Menu bar icon badge**: After first sync completes, briefly badge the
  menu bar icon (e.g., a small dot) to draw attention to it.
- **Suggested feeds library**: A curated list of popular feeds the user can
  add with one click during onboarding (tech news, blogs, podcasts).

---

## 4. Homebrew Cask (supplemental distribution)

A Homebrew Cask provides an alternative install path for developer-oriented
users. This doesn't replace Sparkle but complements it.

### Setup

Create a tap repository `shellen/homebrew-pullread` with a cask formula at
`Casks/pullread.rb`:

```ruby
cask "pullread" do
  version "1.1.0"
  sha256 "SHA256_OF_DMG"

  url "https://github.com/shellen/pullread/releases/download/v#{version}/PullRead.dmg"
  name "Pull Read"
  desc "Sync RSS and Atom feeds to local markdown files"
  homepage "https://github.com/shellen/pullread"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :sonoma"

  app "Pull Read.app"
end
```

Users install via:
```
brew tap shellen/pullread
brew install --cask pullread
```

`auto_updates true` tells Homebrew that Sparkle manages updates, so
`brew upgrade` skips it (but `brew upgrade --greedy` still works).

### Automation

Add a GitHub Actions workflow on the main repo that, on new releases:
1. Downloads the DMG and computes SHA256.
2. Opens a PR on `shellen/homebrew-pullread` bumping the version and hash.

---

## 5. Implementation Order

| Priority | Work item | Dependencies | Files touched |
|----------|-----------|--------------|---------------|
| **1** | First-run Phase 1 (helper text, defaults, auto-sync) | None | `SettingsView.swift`, `AppDelegate.swift` |
| **2** | Sparkle integration (SPM, updater init, menu item) | None | `project.pbxproj`, `AppDelegate.swift`, `Info.plist` |
| **3** | Ed25519 key generation and appcast CI pipeline | Sparkle integration done | `release.yml`, `build-release.sh` |
| **4** | "What's New" post-update screen | Sparkle shipping (so there are updates to announce) | New `WhatsNewView.swift`, `AppDelegate.swift` |
| **5** | First-run Phase 2 (multi-step wizard) | Phase 1 learnings | New `OnboardingView.swift`, `SettingsWindowController.swift` |
| **6** | Homebrew Cask | Sparkle shipping | New repo `homebrew-pullread` |
| **7** | First-run Phase 3 (discovery, viewer overlay) | Phase 2, viewer stable | `AppDelegate.swift`, `viewer.html` |

Items 1 and 2 have no dependencies on each other and can be developed in
parallel. Items 3 and 4 depend on 2. The Homebrew Cask can be done whenever
but is most useful after Sparkle is live so `auto_updates true` is accurate.

---

## 6. Files Affected

| File | Changes |
|------|---------|
| `PullReadTray/PullReadTray/AppDelegate.swift` | Sparkle updater init, "Check for Updates" menu item, "What's New" version detection, post-first-run auto-sync trigger |
| `PullReadTray/PullReadTray/Info.plist` | Add `SUFeedURL`, `SUPublicEDKey`; dynamic version management |
| `PullReadTray/PullReadTray.xcodeproj/project.pbxproj` | SPM package reference for Sparkle (added by Xcode) |
| `PullReadTray/PullReadTray/SettingsView.swift` | Phase 1 onboarding: explanatory text, step labels, sample feed, default folder, post-setup message |
| `PullReadTray/PullReadTray/SettingsWindowController.swift` | Route to OnboardingView vs SettingsView based on isFirstRun (Phase 2) |
| New: `PullReadTray/PullReadTray/WhatsNewView.swift` | Post-update highlights UI |
| New: `PullReadTray/PullReadTray/OnboardingView.swift` | Multi-step onboarding wizard (Phase 2) |
| `.github/workflows/release.yml` | Sparkle signing, appcast.xml generation, GitHub Pages publish |
| `scripts/build-release.sh` | Local Sparkle signing step |
| `viewer.html` | First-open overlay for viewer onboarding (Phase 3) |
| New repo: `shellen/homebrew-pullread` | Cask formula |
