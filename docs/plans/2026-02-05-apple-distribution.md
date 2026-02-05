# Apple Developer License & Distribution for PullRead

## Applying Your Apple Developer License

### Overview

PullRead is distributed outside the Mac App Store as a signed, notarized DMG.
This requires an Apple Developer Program membership ($99/year) and a
"Developer ID Application" certificate.

The existing `docs/code-signing.md` covers the signing and notarization
workflow in detail. This document focuses on the higher-level distribution
strategy and branding under A Little Drive.

### Bundle Identifier

Update the bundle identifier to reflect A Little Drive ownership:

**Current:** `$(PRODUCT_BUNDLE_IDENTIFIER)` (likely auto-generated)

**Recommended:** `com.alittledrive.pullread`

Set this in Xcode:
1. Open `PullReadTray/PullReadTray.xcodeproj`
2. Select the PullReadTray target
3. General tab → Bundle Identifier → `com.alittledrive.pullread`

### Team & Certificate Setup

1. **Sign in to Apple Developer** at https://developer.apple.com with the
   A Little Drive team account

2. **Create a Developer ID Application certificate** if one doesn't exist:
   - Certificates, Identifiers & Profiles → Certificates → "+"
   - Select "Developer ID Application"
   - Generate and download to your Mac

3. **Create an App ID** (identifier) for PullRead:
   - Identifiers → "+"
   - App IDs → Select "App"
   - Description: "PullRead"
   - Bundle ID: `com.alittledrive.pullread`
   - No capabilities needed (no App Store, no iCloud, no push notifications)

4. **Set the Team ID** in the Xcode project:
   - Signing & Capabilities → Team → Select A Little Drive team
   - Or set `DEVELOPMENT_TEAM` in project.pbxproj

### Info.plist Branding

The Info.plist has been updated with:

```xml
<key>NSHumanReadableCopyright</key>
<string>Copyright 2026 A Little Drive. All rights reserved.</string>
```

### About Dialog

The About dialog now reads:

> **PullRead**
> RSS to Markdown Sync
>
> Version 1.1 (2)
>
> Syncs RSS and Atom feeds to markdown files for offline reading.
>
> By A Little Drive
> https://alittledrive.com

## Distribution Channels

### 1. GitHub Releases (Primary)

The existing CI/CD workflow in `.github/workflows/release.yml` builds,
signs, notarizes, and publishes a DMG to GitHub Releases on tag push.

**Process:**
```bash
# Bump version in Info.plist (CFBundleShortVersionString + CFBundleVersion)
# Then:
git tag v1.1.0
git push origin v1.1.0
```

The workflow:
1. Checks out code
2. Builds the Bun CLI binary (arm64 + x64)
3. Builds the Swift app in Xcode
4. Creates a signed DMG
5. Submits for Apple notarization
6. Staples the notarization ticket
7. Creates a GitHub Release with the DMG attached

### 2. Homebrew Cask (Developer-Friendly)

Create a Homebrew tap for one-command installation:

```bash
brew tap shellen/pullread
brew install --cask pullread
```

See `PLAN-updates-and-onboarding.md` for the Cask formula and automation
details. Key points:
- Create `shellen/homebrew-pullread` repository
- `auto_updates true` since Sparkle manages updates
- CI auto-creates PRs to bump the Cask on new releases

### 3. Direct Download from alittledrive.com (Optional)

Host the DMG on alittledrive.com for non-GitHub users:
- Add a `/pullread` page with download button
- Point `SUFeedURL` in Info.plist to `https://alittledrive.com/pullread/appcast.xml`
  (instead of GitHub Pages) for a branded update experience
- Can also host release notes HTML for Sparkle's update dialog

### 4. Mac App Store (Future Consideration)

The Mac App Store provides discovery and automatic updates but requires:
- Sandbox restrictions (limits file system access, subprocess execution)
- Different certificate type ("Mac App Distribution" + provisioning profile)
- App review process
- 30% revenue share if paid (PullRead is free, so this doesn't apply)

**Blockers for App Store distribution:**
- PullRead executes a bundled CLI binary — sandboxing restricts this
- Chrome cookie reading requires unsandboxed filesystem access
- The viewer runs an HTTP server on localhost — may require justification

**Verdict:** Not recommended for PullRead's architecture. Developer ID
distribution (DMG + notarization) is the appropriate channel.

## Version Numbering

Maintain version numbers in three places:

| Location | Key | Format | Example |
|----------|-----|--------|---------|
| `Info.plist` | `CFBundleShortVersionString` | Semantic (user-facing) | `1.1.0` |
| `Info.plist` | `CFBundleVersion` | Integer (build number, must increment) | `2` |
| `package.json` | `version` | Semantic | `1.1.0` |

Sparkle requires `CFBundleVersion` to be a monotonically increasing integer
or dot-separated version. The build number must always be higher than any
previously released build.

**Recommendation:** Use `agvtool` to bump versions:
```bash
cd PullReadTray
agvtool new-marketing-version 1.1.0    # Sets CFBundleShortVersionString
agvtool next-version -all              # Increments CFBundleVersion
```

## Checklist for First A Little Drive Release

- [ ] Set bundle identifier to `com.alittledrive.pullread`
- [ ] Set DEVELOPMENT_TEAM to A Little Drive team ID in Xcode
- [ ] Verify `NSHumanReadableCopyright` in Info.plist says "A Little Drive"
- [ ] Verify About dialog references A Little Drive
- [ ] Create Developer ID Application certificate under A Little Drive team
- [ ] Create App ID `com.alittledrive.pullread`
- [ ] Export signing certificate as .p12 and update GitHub Secrets
- [ ] Update `APPLE_TEAM_ID`, `APPLE_ID`, `APPLE_ID_PASSWORD` in GitHub Secrets
- [ ] Generate Sparkle Ed25519 keys and add `SUPublicEDKey` to Info.plist
- [ ] Add `SPARKLE_PRIVATE_KEY` to GitHub Secrets
- [ ] Bump version to 1.1.0 in Info.plist and package.json
- [ ] Tag and push `v1.1.0`
- [ ] Verify DMG downloads, mounts, and launches without Gatekeeper warnings
- [ ] Set up Homebrew tap (optional)
