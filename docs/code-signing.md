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

For automated signing in CI, you'll need to:
1. Export your signing certificate as a .p12 file
2. Store the certificate and password as GitHub secrets
3. Import the certificate in the workflow before building

See Apple's documentation on [Creating a CI/CD workflow for signing](https://developer.apple.com/documentation/xcode/notarizing-macos-software-before-distribution).
