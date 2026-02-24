# Releasing Pull Read

## Quick Reference

```bash
bun scripts/bump-version.ts 0.4.0    # update all version locations
# update site/releases.html with release notes
# commit and merge to main
git tag v0.4.0 && git push origin v0.4.0
# CI builds, signs, notarizes, and publishes — no manual steps after tagging
```

## Step by Step

### 1. Prep the release

```bash
# Bump version everywhere (package.json → site → tauri.conf.json → Cargo.toml)
bun scripts/bump-version.ts X.Y.Z

# Rebuild the embedded viewer (picks up any viewer changes)
bun run scripts/embed-viewer.ts

# Run the test suite
bun test
```

### 2. Update release notes

Add a new entry at the top of `site/releases.html` with the version, subtitle, date, and bullet points. Update the fallback version in `viewer/03-settings.js` (search for `_prCurrentVersion`).

### 3. Commit, merge, and tag

```bash
git add -p    # stage the version bump + release notes
git commit -m "Bump version to X.Y.Z"
git checkout main && git merge <branch> && git push origin main
git tag vX.Y.Z && git push origin vX.Y.Z
```

### 4. Wait for CI

The tag push triggers three jobs:

| Job | What it does |
|-----|-------------|
| **build** (matrix) | Builds ARM64 + Intel sidecars, signs, notarizes, creates draft release with DMGs |
| **publish-updater** | Signs update bundles, builds `latest.json`, publishes the release (marks as non-draft) |
| **deploy-site** | Deploys pullread.com to GitHub Pages |

Monitor with `gh run list --limit 5`. The whole pipeline takes ~12 minutes.

**There is no manual publish step.** The `publish-updater` job calls `gh release edit --draft=false` automatically.

### 5. Verify

- [ ] `gh release view vX.Y.Z` shows both DMGs + `latest.json`
- [ ] Auto-updater: open an older version of Pull Read, check for update prompt
- [ ] Site: visit pullread.com/releases and verify the new version appears

## Version Locations

Run **`bun scripts/bump-version.ts <version>`** to update all four at once:

| File | Key |
|------|-----|
| `package.json` | `version` (source of truth) |
| `site/index.html` | Version badge in hero |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `version` |

## How the Pipeline Works

The **Build Tauri App** workflow (`.github/workflows/build-tauri.yml`) triggers on:
- **Tag pushes** (`v*`) — full release: build → sign → notarize → publish
- **Pushes to main** — rolling build: build → update `latest` prerelease
- **Pull requests** — build only, upload artifacts for 30 days

### Build job (runs on macOS, matrix: ARM64 + Intel)

1. `bun install` + `bun scripts/embed-viewer.ts` (embed viewer into binary)
2. `bun build src/index.ts --compile` (compile CLI sidecar for target arch)
3. `bash scripts/prepare-sidecar.sh` (copy sidecar to Tauri location)
4. `bash scripts/download-kokoro-model.sh` (fetch TTS model, ~92MB)
5. Import Apple signing certificate from GitHub Secrets
6. Sign sidecar with entitlements (`com.apple.security.cs.disable-library-validation`)
7. `tauri-apps/tauri-action` builds the Rust app, signs/notarizes the bundle and DMG

### Publish-updater job (runs after build, tags only)

1. Downloads `.tar.gz` bundles from the draft release
2. Signs each bundle with `tauri signer sign`
3. Builds `latest.json` with platform-specific signatures and download URLs
4. Uploads `latest.json` to the release
5. Publishes the release (`--draft=false`)

### Latest-release job (runs after build, main pushes only)

Updates the rolling `latest` prerelease with stable-named DMGs:
- `PullRead.dmg` (ARM64)
- `PullRead_Intel.dmg` (Intel)

The homepage download button links to `https://github.com/shellen/pullread/releases/download/latest/PullRead.dmg`, which always serves the most recent main build.

## How Download Links Work

| Link | Resolves to |
|------|------------|
| `releases/download/latest/PullRead.dmg` | Rolling build from main (ARM64) |
| `releases/download/latest/PullRead_Intel.dmg` | Rolling build from main (Intel) |
| `releases/latest` | Most recent published non-prerelease (tagged release) |

The rolling `latest` release is marked as a **prerelease** so it never steals the "Latest" badge from tagged releases.

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

Use `scripts/setup-signing-secrets.sh` to configure these.

## Sidecar Entitlements

The CLI binary (`pullread-cli`) is signed with `src-tauri/entitlements.plist` which grants `com.apple.security.cs.disable-library-validation`. This is required because ONNX Runtime (used by Kokoro TTS) has native `.node` addons that Bun extracts to a temp directory at runtime — macOS rejects them without this entitlement.

## Recovering from a Failed Release

```bash
# Fix the issue on a branch, merge to main, then:
gh release delete vX.Y.Z --yes          # delete the broken release
git push --delete origin vX.Y.Z         # delete the remote tag
git tag -d vX.Y.Z                       # delete the local tag
git tag vX.Y.Z && git push origin vX.Y.Z  # re-tag and push
```

## Keeping LLM Models Up to Date

Models are defined in `models.json` at the repo root. The CLI and viewer read from it at runtime.

**Quarterly maintenance:**
1. Check each provider's API docs for new models and deprecation notices
2. Edit `models.json` — add new models, remove deprecated ones, update defaults

Provider docs:
- [Anthropic](https://docs.anthropic.com/en/docs/about-claude/models)
- [OpenAI](https://platform.openai.com/docs/models)
- [Gemini](https://ai.google.dev/gemini-api/docs/models)
- [OpenRouter](https://openrouter.ai/models)
