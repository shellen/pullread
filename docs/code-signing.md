# Code Signing Pull Read for macOS

This guide explains how to set up code signing and notarization for the Tauri app.

## Prerequisites

1. **Apple Developer Program membership** ($99/year at [developer.apple.com](https://developer.apple.com))
2. **Developer ID Application certificate** (created in Apple Developer portal)
3. **GitHub CLI** (`brew install gh`) installed and authenticated

## Quick Setup

Use the helper script to configure all GitHub secrets at once:

```bash
scripts/setup-signing-secrets.sh \
  --p12 ~/certs/developer-id.p12 \
  --apple-id your@email.com \
  --team-id ABC123DEF \
  --app-password xxxx-xxxx-xxxx-xxxx \
  --tauri-signing-key ~/.tauri/keys \
  --tauri-signing-password "your-key-password"
```

## Manual Setup

### 1. Export Your Signing Certificate

On your Mac with the Developer ID certificate installed:

1. Open **Keychain Access**
2. Click "login" keychain in sidebar
3. Search for "Developer ID Application"
4. Select both the certificate AND private key (Cmd+click)
5. File > Export Items > Save as .p12, create a password

### 2. Generate Tauri Updater Keys

```bash
bunx @tauri-apps/cli signer generate -w ~/.tauri/keys
```

The public key goes in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

### 3. Add GitHub Secrets

Go to your repository > Settings > Secrets and variables > Actions, or use `gh secret set`:

| Secret Name | Value |
|-------------|-------|
| `APPLE_CERTIFICATE_BASE64` | `base64 -i developer-id.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | Password you created when exporting .p12 |
| `APPLE_TEAM_ID` | Your Team ID (from developer.apple.com) |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_ID_PASSWORD` | App-specific password (generate at appleid.apple.com) |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/keys` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password entered during key generation |

### 4. Clean Up

```bash
rm developer-id.p12
```

## How Signing Works in CI

The `build-tauri.yml` workflow:

1. Imports the .p12 certificate into a temporary keychain
2. Signs the sidecar binary with `entitlements.plist` (hardened runtime + disable-library-validation)
3. Passes signing credentials to `tauri-apps/tauri-action`, which signs the app bundle and DMG
4. `tauri-apps/tauri-action` submits the app for notarization and staples the ticket
5. The temporary keychain is deleted after the build

## Local Signing

For local builds with signing:

```bash
APPLE_SIGNING_IDENTITY="Developer ID Application" bash scripts/build-tauri.sh
```

The build script will sign the sidecar binary with entitlements. The `cargo tauri build` step handles signing the app bundle if the certificate is in your keychain.

## Verification

```bash
# Check code signature on the app
codesign -dv --verbose=4 "src-tauri/target/release/bundle/macos/PullRead.app"

# Verify notarization
spctl -a -v "src-tauri/target/release/bundle/macos/PullRead.app"
# Expected: "PullRead.app: accepted source=Notarized Developer ID"

# Check DMG
spctl -a -v --type open --context context:primary-signature PullRead.dmg
```

## Security Notes

- GitHub Secrets are encrypted and never exposed in logs
- Secrets are masked if accidentally printed
- Fork PRs cannot access secrets
- The .p12 file is imported to a temporary keychain that's deleted after the build
- The sidecar entitlement (`disable-library-validation`) is scoped to the CLI binary only
