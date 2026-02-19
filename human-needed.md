# Human-Needed: Manual Steps for CI/CD Migration

Steps that require human action (secrets, account access, or manual verification) to complete the Tauri CI/CD pipeline.

## Done

- [x] Generate Tauri updater signing keypair (`bunx @tauri-apps/cli signer generate -w ~/.tauri/keys`)
- [x] Set `TAURI_SIGNING_PRIVATE_KEY` GitHub secret (`gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/keys`)
- [x] Set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub secret
- [x] Public key added to `src-tauri/tauri.conf.json` updater config

## To Do

### Verify Existing Apple Signing Secrets

The workflow expects these secrets (carried over from the Swift pipeline). Verify they're still set:

```bash
gh secret list
```

Expected secrets:
- `APPLE_CERTIFICATE_BASE64` — base64-encoded .p12 Developer ID certificate
- `APPLE_CERTIFICATE_PASSWORD` — password for the .p12
- `APPLE_ID` — Apple ID email for notarization
- `APPLE_ID_PASSWORD` — app-specific password for notarization
- `APPLE_TEAM_ID` — Apple Developer Team ID

If any are missing, use `scripts/setup-signing-secrets.sh` to set them up.

### Test the CI Pipeline

1. **Push this branch or open a PR** — should trigger a CI build (unsigned, since PR builds may not have access to secrets)
2. **Verify both matrix legs pass** — `macos-latest` (ARM64) and `macos-13` (Intel)
3. **Check artifacts** — both builds should upload DMG + app artifacts

### Test a Signed Release

1. **Merge to main** — should trigger a build + "latest" pre-release update
2. **Verify signing** — download the DMG from the "latest" release, open it, confirm no Gatekeeper warnings
3. **Tag a release** — `git tag v2.0.0 && git push origin v2.0.0`
4. **Verify draft release** — should create a draft GitHub Release with DMGs from both architectures
5. **Publish the release** — manually publish the draft after verifying artifacts
6. **Verify auto-updater** — confirm `latest.json` is attached to the release and the app can find updates

### Test the Updater End-to-End

After a tagged release is published:
1. Install an older version of the app
2. Launch it and trigger "Check for Updates"
3. Confirm it finds the update and can download/install it

### Clean Up (Optional)

- Delete the old `latest` release tag if it still references the Swift DMG
- Remove `SPARKLE_PRIVATE_KEY` secret if still set (no longer needed)
- Remove `APPLE_CERTIFICATE` secret if it duplicates `APPLE_CERTIFICATE_BASE64`
- Remove `KEYCHAIN_PASSWORD` secret if set (now generated at runtime in CI)
- Remove `APPLE_SIGNING_IDENTITY` secret if set (now hardcoded as "Developer ID Application")
- Remove `APPLE_APP_SPECIFIC_PASSWORD` secret if set (renamed to `APPLE_ID_PASSWORD`)

### Phase 2: Share Extension (Future)

The macOS Share Extension (.appex) needs to be built and injected into the Tauri app bundle. This can be done via `beforeBundleCommand` in tauri.conf.json. Tracked separately.
