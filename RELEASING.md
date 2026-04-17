# Releasing Pull Read

## Quick Reference

```bash
# Check the latest tagged version to determine the next one
git tag --sort=-v:refname | head -1       # e.g. v0.4.5 → next is 0.4.6

# 1. Review Guide, FAQ, release notes — draft user-facing bullets
# 2. Bump version + rebuild + test
bun scripts/bump-version.ts X.Y.Z
bun run scripts/embed-viewer.ts && bun test
# 3. Update site/releases.html and _prCurrentVersion fallback
# 4. Commit, push, create PR → wait for CI ✓
# 5. Merge PR to main → wait for CI ✓
# 6. Tag
git checkout main && git pull
git tag vX.Y.Z && git push origin vX.Y.Z
# CI builds, signs, notarizes, and publishes — no manual steps after tagging
```

## Step by Step

### 1. Pre-flight review

Before touching version numbers, scan these for anything that needs updating:
- **In-app Guide** — does it cover any features being released?
- **FAQ** (site and in-app) — are there new questions users might have?
- **Release notes** (`site/releases.html`) — draft the bullet points first

Release notes should be **user-facing**: describe what changed from the user's perspective. Skip internal details like dependency swaps, npm package changes, or refactors unless they fix a user-visible bug.

### 2. Prep the release

```bash
# Bump version everywhere (package.json → site → tauri.conf.json → Cargo.toml)
bun scripts/bump-version.ts X.Y.Z

# Rebuild the embedded viewer (picks up any viewer changes)
bun run scripts/embed-viewer.ts

# Run the test suite
bun test
```

### 3. Update release notes

Add a new entry at the top of `site/releases.html` with the version, subtitle, date, and bullet points. Update the fallback version in `viewer/03-settings.js` (search for `_prCurrentVersion`).

### 4. Create PR and wait for CI

```bash
git add -p    # stage the version bump + release notes
git commit -m "Bump version to X.Y.Z"
git push -u origin <branch>
gh pr create --title "Release X.Y.Z" --body "Version bump and release notes"
```

**Wait for CI checks to pass** on the PR before merging. Do not merge a red build.

### 5. Merge to main and wait for CI

```bash
gh pr merge --merge
```

**Wait for the main branch build to succeed.** This ensures the `latest` rolling build is healthy before tagging. Check with `gh run list --limit 3`.

### 6. Tag the release

```bash
git checkout main && git pull
git tag vX.Y.Z && git push origin vX.Y.Z
```

### 7. Wait for release CI

The tag push triggers three jobs:

| Job | What it does |
|-----|-------------|
| **build** (matrix) | Builds ARM64 + Intel sidecars, signs, notarizes, creates draft release with DMGs |
| **publish-updater** | Signs update bundles, builds `latest.json`, publishes the release (marks as non-draft) |
| **deploy-site** | Deploys pullread.com to GitHub Pages |

Monitor with `gh run list --limit 5`. The whole pipeline takes ~12 minutes.

**There is no manual publish step.** The `publish-updater` job calls `gh release edit --draft=false` automatically.

### 8. Verify

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
4. Import Apple signing certificate from GitHub Secrets
5. Sign sidecar with entitlements (`com.apple.security.cs.disable-library-validation`)
6. `tauri-apps/tauri-action` builds the Rust app, signs/notarizes the bundle and DMG

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

The CLI binary (`pullread-cli`) is signed with `src-tauri/entitlements.plist` which grants `com.apple.security.cs.disable-library-validation`. This is required because Bun may extract native addons to a temp directory at runtime — macOS rejects them without this entitlement.

## Recovering from a Failed Release

The pipeline can fail at four points. Your response depends on whether users have seen the release yet.

### Triage

```bash
gh release view vX.Y.Z                    # check artifacts + draft/prerelease flags
gh run list --limit 10                    # find the failing workflow run
gh run view <run-id> --log-failed         # read the error
```

If `gh release view` shows `isDraft: true`, users have seen nothing yet — safe to delete. If the release is published (non-draft) and non-prerelease, assume users may have auto-updated.

### Case 1 — Release is still a draft (build or sign step failed)

Nobody's seen it. Delete and retry.

```bash
gh release delete vX.Y.Z --yes
git push --delete origin vX.Y.Z
git tag -d vX.Y.Z
# Fix the problem on a branch, merge to main, then re-tag:
git tag vX.Y.Z && git push origin vX.Y.Z
```

### Case 2 — Release published but `latest.json` broken

Auto-updater can't validate the update, so users won't actually receive it. Same fix as Case 1.

```bash
gh release delete vX.Y.Z --yes
git push --delete origin vX.Y.Z
git tag -d vX.Y.Z
# Fix whatever broke publish-updater, then re-tag.
```

### Case 3 — Catastrophic: bug reaches users

A published release is shipping broken behavior and users may have auto-updated. **Do not delete the tag** — the auto-updater treats tags as immutable and users need a path forward. Roll forward with a patch release.

```bash
# 1. Demote the broken release so the homepage stops pointing at it.
gh release edit vX.Y.Z --prerelease=true

# 2. Revert the problem commits (or craft a fix) on main.
git checkout main && git pull
git revert <commit-sha>           # or a targeted fix commit
git push

# 3. Bump and ship a patch release.
bun scripts/bump-version.ts X.Y.(Z+1)
# Add a short note to site/releases.html describing the fix.
git add -A && git commit -m "Bump version to X.Y.(Z+1)"
git push
git tag vX.Y.(Z+1) && git push origin vX.Y.(Z+1)
```

Users on the broken version will be prompted to update within ~24 hours (Tauri updater check interval). If the problem is severe enough that waiting isn't acceptable, coordinate a notice on pullread.com and in the Feedback modal.

### Case 4 — Rolling `latest` build is serving a bad DMG

The homepage download button pulls from `releases/download/latest/PullRead.dmg`. If `main` broke and CI published a bad rolling build, the homepage is actively handing out a broken binary.

```bash
# Fastest path: overwrite latest with a known-good DMG from the previous release.
mkdir -p /tmp/rollback && cd /tmp/rollback
gh release download vX.Y.(Z-1) -p "PullRead*.dmg"
gh release upload latest PullRead.dmg PullRead_Intel.dmg --clobber

# Then fix main so the next CI run restores a healthy rolling build.
```

### What not to do

- **Do not delete a tag users have already received.** The Tauri updater keyed off that version; deleting it causes "no update available" confusion and orphans users on the bad build.
- **Do not force-push to main.** Always revert. History is an audit trail.
- **Do not ship a re-tag over an existing version** in Case 3. Users who already updated won't re-download the same tag — you need `Z+1`.
- **Do not skip the `--prerelease=true` demotion** on a broken release. `releases/latest` should always resolve to a working version.

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

