# PullRead macOS Menu Bar App

A native Swift menu bar application for PullRead that provides quick access to sync controls without a dock icon.

## Overview

PullReadTray is a lightweight macOS menu bar app that wraps the PullRead CLI. It provides:

- One-click sync from the menu bar
- Status indicators and last sync time
- Quick access to output folder and configuration
- macOS notifications on sync completion

## Architecture

```
┌─────────────────────────────────────────┐
│           PullReadTray.app              │
├─────────────────────────────────────────┤
│  PullReadTrayApp.swift                  │
│  └── @main SwiftUI App entry point      │
│                                         │
│  AppDelegate.swift                      │
│  └── NSStatusBar menu setup             │
│  └── Menu item actions                  │
│  └── Notification handling              │
│                                         │
│  SyncService.swift                      │
│  └── Process execution (npm run sync)  │
│  └── Configuration reading              │
│  └── Log file management                │
└─────────────────────────────────────────┘
              │
              ▼ executes
┌─────────────────────────────────────────┐
│           Node.js CLI                   │
│  npm run sync / npm run sync:retry      │
└─────────────────────────────────────────┘
```

## Menu Structure

```
┌────────────────────────┐
│ Status: Idle           │  (disabled, shows current state)
│ Last sync: 2:34 PM     │  (disabled, shows last sync time)
├────────────────────────┤
│ Sync Now          ⌘S   │  → Runs npm run sync
│ Retry Failed      ⌘R   │  → Runs npm run sync:retry
├────────────────────────┤
│ Open Output Folder ⌘O  │  → Opens outputPath from feeds.json
│ Edit Configuration ⌘,  │  → Opens feeds.json in default editor
│ View Logs...      ⌘L   │  → Opens /tmp/pullread.log
├────────────────────────┤
│ About PullRead         │
│ Quit PullRead     ⌘Q   │
└────────────────────────┘
```

## Requirements

- macOS 12.0 (Monterey) or later
- Node.js installed (checked on launch)
- PullRead CLI configured with `feeds.json`

## Installation

### Option 1: Download Release

1. Download `PullReadTray.dmg` from GitHub Releases
2. Open the DMG and drag PullReadTray to Applications
3. Launch PullReadTray from Applications
4. (Optional) Add to Login Items for auto-start

### Option 2: Build from Source

```bash
cd PullReadTray
xcodebuild -project PullReadTray.xcodeproj \
  -scheme PullReadTray \
  -configuration Release \
  -derivedDataPath build \
  build

# App bundle is at: build/Build/Products/Release/PullReadTray.app
```

### Option 3: Build with Xcode

1. Open `PullReadTray/PullReadTray.xcodeproj` in Xcode
2. Select Product > Build (⌘B)
3. Product > Archive for distribution

## Cloud Build Services

### GitHub Actions

The repository includes a GitHub Actions workflow that builds the app on every push to `main` or `claude/**` branches.

**Workflow file:** `.github/workflows/build-macos-app.yml`

**Features:**
- Builds on `macos-14` runner with Xcode 15
- Produces `.app` bundle and `.dmg` installer
- Uploads artifacts for 30 days
- Optional release creation via manual dispatch

**To trigger a release:**
1. Go to Actions > Build macOS App
2. Click "Run workflow"
3. Check "Create a release with the built app"
4. Click "Run workflow"

**Or create a tag:**
```bash
git tag v1.0.0
git push origin v1.0.0
```

### Xcode Cloud

Xcode Cloud is Apple's CI/CD service integrated into Xcode.

**Setup:**
1. Open `PullReadTray.xcodeproj` in Xcode
2. Go to Product > Xcode Cloud > Create Workflow
3. Sign in with your Apple Developer account
4. Configure triggers (e.g., push to main, pull requests)
5. Configure actions (build, test, archive)
6. Save the workflow

**CI Scripts:** The `ci_scripts/` directory contains:

| Script | When it runs | Purpose |
|--------|--------------|---------|
| `ci_post_clone.sh` | After clone | Install npm dependencies |
| `ci_pre_xcodebuild.sh` | Before build | Set build number from CI |
| `ci_post_xcodebuild.sh` | After build | Log build artifacts |

**Pricing:**
- 25 free compute hours/month with Apple Developer Program
- Additional hours: $49.99 (100hrs) to $399.99 (1000hrs) per month

## Configuration

### Project Path Discovery

SyncService looks for the PullRead project in this order:

1. Bundled: `Bundle.main.resourcePath/pullread/`
2. Development: Parent directory of app bundle
3. Fallback: `~/Projects/pullread`

### Node.js Discovery

Checks these paths in order:
- `/usr/local/bin/node` (Homebrew Intel)
- `/opt/homebrew/bin/node` (Homebrew Apple Silicon)
- `/usr/bin/node` (System)

## Testing

### Unit Tests (XCTest)

```bash
cd PullReadTray
xcodebuild test \
  -project PullReadTray.xcodeproj \
  -scheme PullReadTray \
  -destination 'platform=macOS'
```

### UI Tests (XCUITest)

```bash
xcodebuild test \
  -project PullReadTray.xcodeproj \
  -scheme PullReadTray \
  -destination 'platform=macOS' \
  -only-testing:PullReadTrayUITests
```

### Test Coverage

Tests cover:
- `SyncService` - Path discovery, config reading, process execution
- `AppDelegate` - Menu creation, status updates
- UI - Menu interactions, notifications

## Development

### Adding App Icons

1. Create icons at these sizes: 16, 32, 128, 256, 512 (×1 and ×2)
2. Name them: `icon_16x16.png`, `icon_16x16@2x.png`, etc.
3. Place in `PullReadTray/Assets.xcassets/AppIcon.appiconset/`
4. Update `Contents.json` with filenames

### Adding a Custom Tray Icon

1. Create a template image (black with transparency, 18×18 or 36×36 @2x)
2. Place in `PullReadTray/Assets.xcassets/TrayIcon.imageset/`
3. Update `Contents.json` with filenames
4. The app currently uses SF Symbols (`doc.text.fill`)

### Debugging

```bash
# Run with console output
open PullReadTray.app --stdout /dev/stdout --stderr /dev/stderr

# View logs
tail -f /tmp/pullread.log
```

## Troubleshooting

### "Node.js Not Found" Alert

Install Node.js:
```bash
# Homebrew
brew install node

# Or download from https://nodejs.org
```

### App Doesn't Appear in Menu Bar

1. Check that the app is running (Activity Monitor)
2. Look for errors in Console.app
3. Ensure macOS allows the app (System Preferences > Security & Privacy)

### Sync Fails

1. Check `/tmp/pullread.log` for errors
2. Verify `feeds.json` exists and is valid
3. Run `npm run sync` manually in terminal to see full output

## Auto-Start on Login

1. Open System Preferences > Users & Groups
2. Select your user, then "Login Items"
3. Click + and add PullReadTray.app

Or via command line:
```bash
osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/PullReadTray.app", hidden:false}'
```
