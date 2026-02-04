# Code Signing Pull Read for macOS

This guide explains how to sign and notarize the Pull Read app for distribution outside the Mac App Store.

## Prerequisites

1. **Apple Developer Program membership** ($99/year at [developer.apple.com](https://developer.apple.com))
2. **Xcode** installed with your Apple ID signed in
3. **Developer ID Application certificate** (created in Apple Developer portal)

## Step 1: Configure Your Team in Xcode

1. Open `PullReadTray/PullReadTray.xcodeproj` in Xcode
2. Select the **PullReadTray** project in the navigator
3. Select the **PullReadTray** target
4. Go to **Signing & Capabilities** tab
5. Check **Automatically manage signing**
6. Select your team from the **Team** dropdown

## Step 2: Find Your Team ID

Your Team ID is needed for command-line builds. Find it at:
- https://developer.apple.com/account → Membership → Team ID
- Or run: `security find-identity -v -p codesigning | grep "Developer ID"`

## Step 3: Update Project Settings

Edit `PullReadTray/PullReadTray.xcodeproj/project.pbxproj` and set `DEVELOPMENT_TEAM` to your Team ID in both Debug and Release build configurations:

```
DEVELOPMENT_TEAM = YOUR_TEAM_ID;
```

## Step 4: Build Signed App

### Via Xcode (Recommended for first-time setup)

1. Select **Product → Archive**
2. In the Organizer window, click **Distribute App**
3. Choose **Developer ID** (for distribution outside App Store)
4. Select **Upload** (for automatic notarization) or **Export** (manual)

### Via Command Line

```bash
cd PullReadTray

# Build signed release
xcodebuild -project PullReadTray.xcodeproj \
  -scheme PullReadTray \
  -configuration Release \
  -derivedDataPath build \
  CODE_SIGN_IDENTITY="Developer ID Application" \
  DEVELOPMENT_TEAM="YOUR_TEAM_ID" \
  build
```

The signed app will be at `build/Build/Products/Release/Pull Read.app`

## Step 5: Notarize the App (Required for Gatekeeper)

Notarization lets users open the app without security warnings. Apple scans the app for malware and issues a "ticket" that macOS trusts.

### Create an App-Specific Password

1. Go to https://appleid.apple.com/account/manage
2. Sign in and go to **App-Specific Passwords**
3. Generate a new password for "notarytool"
4. Save it securely (you'll need it for the commands below)

### Submit for Notarization

```bash
cd build/Build/Products/Release

# Create a ZIP for notarization
ditto -c -k --keepParent "Pull Read.app" PullRead.zip

# Submit for notarization (replace placeholders)
xcrun notarytool submit PullRead.zip \
  --apple-id "your-apple-id@example.com" \
  --team-id "YOUR_TEAM_ID" \
  --password "your-app-specific-password" \
  --wait

# Staple the notarization ticket to the app
xcrun stapler staple "Pull Read.app"
```

### Store Credentials (Optional)

To avoid entering credentials each time:

```bash
xcrun notarytool store-credentials "pullread-notarize" \
  --apple-id "your-apple-id@example.com" \
  --team-id "YOUR_TEAM_ID" \
  --password "your-app-specific-password"

# Then use:
xcrun notarytool submit PullRead.zip --keychain-profile "pullread-notarize" --wait
```

## Step 6: Create Signed DMG

```bash
# Create DMG from signed app
hdiutil create -volname "Pull Read" \
  -srcfolder "Pull Read.app" \
  -ov -format UDZO \
  PullRead.dmg

# Sign the DMG
codesign --sign "Developer ID Application" PullRead.dmg

# Notarize the DMG
xcrun notarytool submit PullRead.dmg \
  --keychain-profile "pullread-notarize" \
  --wait

# Staple the ticket
xcrun stapler staple PullRead.dmg
```

## Verification

```bash
# Check code signature
codesign -dv --verbose=4 "Pull Read.app"

# Verify notarization status
spctl -a -v "Pull Read.app"
# Expected output: "Pull Read.app: accepted source=Notarized Developer ID"

# Check DMG
spctl -a -v --type open --context context:primary-signature PullRead.dmg
```

## Troubleshooting

### "Developer ID Application" certificate not found

Generate one at https://developer.apple.com/account/resources/certificates

### Notarization fails with "invalid signature"

Ensure all nested code (frameworks, helpers) is also signed:
```bash
codesign --deep --force --sign "Developer ID Application" "Pull Read.app"
```

### App rejected due to hardened runtime

The project already has hardened runtime enabled. If you add new entitlements, ensure they're justified.

## GitHub Actions (CI/CD)

The repository includes a GitHub Actions workflow (`.github/workflows/release.yml`) that automatically builds, signs, and notarizes the app when you push a version tag.

### One-Time Setup

#### 1. Export Your Signing Certificate

On your Mac with the Developer ID certificate installed:

```bash
# Open Keychain Access
# 1. Click "login" keychain in sidebar
# 2. Search for "Developer ID Application"
# 3. Select both the certificate AND private key (Cmd+click)
# 4. File → Export Items
# 5. Save as .p12, create a password
```

#### 2. Get Base64 of Certificate

```bash
base64 -i developer-id.p12 | pbcopy
# This copies the base64 string to your clipboard
```

#### 3. Create App-Specific Password

1. Go to https://appleid.apple.com/account/manage
2. Sign in → App-Specific Passwords
3. Generate a password for "GitHub Actions"

#### 4. Add GitHub Secrets

Go to your repository → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `APPLE_CERTIFICATE_BASE64` | The base64 string from step 2 |
| `APPLE_CERTIFICATE_PASSWORD` | Password you created when exporting .p12 |
| `APPLE_TEAM_ID` | Your Team ID (from developer.apple.com) |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_ID_PASSWORD` | App-specific password from step 3 |

#### 5. Delete Local Certificate File

```bash
rm developer-id.p12
```

### Creating a Release

#### Option A: Push a Tag

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow automatically triggers and creates a GitHub Release with the signed DMG.

#### Option B: Manual Trigger

1. Go to Actions → Build and Release
2. Click "Run workflow"
3. Enter version number (e.g., `1.0.0`)
4. Click "Run workflow"

### Security Notes

- GitHub Secrets are encrypted and never exposed in logs
- Secrets are masked if accidentally printed
- Fork PRs cannot access secrets
- The .p12 file is imported to a temporary keychain that's deleted after the build
