# Releasing Pull Read

## Quick Reference

1. Run `bun scripts/bump-version.ts 2.1.0` (updates package.json, site/index.html, and tauri.conf.json)
2. Commit, push, and merge to `main`
3. Tag and push: `git tag v2.1.0 && git push origin v2.1.0`

The CI pipeline handles building (ARM64 + Intel), signing, notarization, DMG creation, and GitHub Release.

## Version Locations

Run **`bun scripts/bump-version.ts <version>`** to update all locations at once. Or run it without arguments to propagate the version already in `package.json`.

| File | Key | Updated by |
|------|-----|------------|
| `package.json` | `version` | **Source of truth** — edit this or pass version to bump script |
| `site/index.html` | `Version X.Y.Z` badge | bump-version.ts |
| `src-tauri/tauri.conf.json` | `version` | bump-version.ts |

## How the Release Pipeline Works

The **Build Tauri App** workflow (`.github/workflows/build-tauri.yml`) triggers on tag pushes matching `v*`:

1. Builds the Bun CLI sidecar for ARM64 and Intel (matrix build)
2. Downloads and bundles the Kokoro TTS model (~92MB)
3. Imports the Apple signing certificate
4. Signs the sidecar binary with entitlements (for ONNX Runtime native addon loading)
5. Runs `tauri-apps/tauri-action` which:
   - Builds the Rust app
   - Signs and notarizes the app bundle and DMG
   - Creates a draft GitHub Release with DMGs and `latest.json` (for auto-updates)
6. Triggers the site deploy workflow

After both matrix legs complete, manually publish the draft release.

## How the "Latest" Download Link Works

The site and README link to:
```
https://github.com/shellen/pullread/releases/latest
```

GitHub's `/releases/latest` always resolves to the most recent **non-prerelease** release. The rolling "latest" tag (updated on every push to main) is marked as a prerelease, so it won't interfere.

## Required GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `APPLE_CERTIFICATE_BASE64` | Base64-encoded `.p12` Developer ID Application certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` file |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_ID_PASSWORD` | App-specific password for notarization |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater signing private key |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the signing key |

Use `scripts/setup-signing-secrets.sh` to configure these, or set them manually.

## Sidecar Entitlements

The CLI binary (`pullread-cli`) is signed with `src-tauri/entitlements.plist`:

- **`com.apple.security.cs.disable-library-validation`** — Required because `kokoro-js` depends on ONNX Runtime, which has a native `.node` addon. Bun's compiled binary extracts native addons to a temp directory at runtime, and macOS rejects them without this entitlement.

## Recovering from a Failed Release

1. **Fix the issue** on a branch and merge to `main`
2. **Delete the broken tag**: go to the repo's Tags page on GitHub > find the tag > Delete
3. **Delete the broken GitHub Release** if partially created
4. **Re-tag**: `git tag v2.1.0 && git push origin v2.1.0`
5. **Refresh the latest download**: The next push to `main` auto-updates the `latest` tag release via CI

## Checklist for a New Release

- [ ] Run `bun scripts/bump-version.ts X.Y.Z` to update all version locations
- [ ] Changes merged to `main`
- [ ] CI build passes on `main` (check Actions tab)
- [ ] Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`
- [ ] Verify draft release appears at https://github.com/shellen/pullread/releases
- [ ] Both architecture DMGs are attached
- [ ] `latest.json` is attached (for auto-updates)
- [ ] Publish the draft release
- [ ] Verify the DMG downloads and installs correctly
- [ ] Verify the site deploy triggered

## Keeping LLM Models Up to Date

Models are defined in **`models.json`** at the repo root (single source of truth). The CLI and viewer read from it at runtime.

**Quarterly maintenance:**
1. Check each provider's API docs for new models and deprecation notices
2. Edit `models.json` — add new models, remove deprecated ones, update defaults

Provider docs:
- [Anthropic](https://docs.anthropic.com/en/docs/about-claude/models)
- [OpenAI](https://platform.openai.com/docs/models)
- [Gemini](https://ai.google.dev/gemini-api/docs/models)
- [OpenRouter](https://openrouter.ai/models)
