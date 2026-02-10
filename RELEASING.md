# Releasing Pull Read

## Quick Reference

1. Bump version in `Info.plist` + `package.json` (e.g. `1.2.0`, build `3`)
2. Commit, push, and merge to `main`
3. Go to **Actions > "Build and Release" > Run workflow**, type `1.2.0`

That's it. The workflow handles building, signing, notarization, DMG creation, GitHub Release, and Sparkle appcast update.

## Version Locations (must stay in sync)

| File | Key | Example |
|------|-----|---------|
| `PullReadTray/PullReadTray/Info.plist` | `CFBundleShortVersionString` | `1.2.0` |
| `PullReadTray/PullReadTray/Info.plist` | `CFBundleVersion` | `3` |
| `package.json` | `version` | `1.2.0` |

- **CFBundleShortVersionString**: The user-facing semantic version (e.g. `1.2.0`)
- **CFBundleVersion**: The build number — must increment with every release (monotonically increasing integer)
- **package.json version**: Should match `CFBundleShortVersionString`

## How the Release Workflow Works

The **Build and Release** workflow (`.github/workflows/release.yml`) is triggered from the GitHub UI:

**Actions > "Build and Release" > Run workflow > enter version** (e.g. `1.2.0`)

The workflow:
1. Creates a git tag `v1.2.0` (if triggered manually)
2. Builds the CLI binary (universal: arm64 + x64)
3. Installs the Apple signing certificate from secrets
4. Builds the Xcode project with `CODE_SIGN_STYLE=Manual` + `Developer ID Application`
5. Bundles the CLI binary into the app's Resources
6. Notarizes the app with Apple
7. Creates a signed, notarized DMG
8. Publishes a GitHub Release with the DMG attached
9. Updates `site/appcast.xml` for Sparkle auto-updates (if `SPARKLE_PRIVATE_KEY` is set)
10. Pushes the appcast to `main`, triggering a GitHub Pages deploy

## How the "Latest" Download Link Works

The site and README link to:
```
https://github.com/shellen/pullread/releases/download/latest/PullRead.dmg
```

This downloads from the **`latest` tag** release — a prerelease that auto-updates on every push to `main` via the CI workflow (`build-macos-app.yml`). This is separate from versioned releases (v1.1.0, v1.2.0, etc.).

- The CI workflow signs and notarizes when secrets are available (which they are for pushes to `main`)
- GitHub's `/releases/latest` page always shows the newest non-prerelease release
- The `latest` tag prerelease serves as a "nightly" for the direct DMG download link

**If the latest download is broken:** Push a fix to `main` and the CI will rebuild and update the `latest` tag release automatically.

## Required GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `APPLE_CERTIFICATE_BASE64` | Base64-encoded `.p12` Developer ID Application certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` file |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_ID_PASSWORD` | App-specific password for notarization |
| `SPARKLE_PRIVATE_KEY` | Ed25519 private key for signing Sparkle updates (optional) |

See `docs/code-signing.md` for how to set these up.

## Recovering from a Failed Release

If a release build fails:

1. **Fix the issue** on a branch and merge to `main`
2. **Delete the broken tag** (if one was created): go to the repo's Tags page on GitHub > find the tag > click the `...` menu > Delete
3. **Delete the broken GitHub Release** (if partially created): go to Releases > find it > Delete
4. **Re-run the release**: Actions > "Build and Release" > Run workflow with the same or bumped version
5. **Refresh the latest download**: The next push to `main` auto-updates the `latest` tag release via CI

## Checklist for a New Release

- [ ] Version bumped in `Info.plist` (`CFBundleShortVersionString` + `CFBundleVersion`)
- [ ] Version bumped in `package.json`
- [ ] All three version values are in sync
- [ ] LLM models checked — run `bun run sync:models` and review deprecation warnings
- [ ] Changes merged to `main`
- [ ] CI build passes on `main` (check Actions tab)
- [ ] Run "Build and Release" workflow with the version number
- [ ] Verify the release appears at https://github.com/shellen/pullread/releases
- [ ] Verify the DMG downloads and opens correctly
- [ ] Verify Sparkle appcast updated (check `site/appcast.xml` on `main`)

## Keeping LLM Models Up to Date

Models are defined in **`models.json`** at the repo root (single source of truth). Both the CLI (`summarizer.ts`) and the macOS app (`SettingsView.swift`) read from it.

**Quarterly maintenance:**
1. Check each provider's API docs for new models and deprecation notices
2. Edit `models.json` — add new models, remove deprecated ones, update defaults
3. Run `bun run sync:models` to update `SettingsView.swift` automatically
4. The script warns about models approaching their deprecation date

Provider docs:
- [Anthropic](https://docs.anthropic.com/en/docs/about-claude/models)
- [OpenAI](https://platform.openai.com/docs/models)
- [Gemini](https://ai.google.dev/gemini-api/docs/models)
- [OpenRouter](https://openrouter.ai/models)

## What Went Wrong with v1.1.0

The release workflow's xcodebuild step was missing three parameters that the CI workflow had:

```yaml
# Missing from release.yml (caused "requires a development team" error):
CODE_SIGN_STYLE=Manual
DEVELOPMENT_TEAM="$APPLE_TEAM_ID"
-destination 'platform=macOS'
```

Without `CODE_SIGN_STYLE=Manual`, Xcode defaults to "Automatic" signing and expects a team to be configured in the project file (which has `DEVELOPMENT_TEAM = ""`). The CI workflow already handled this correctly; the release workflow was written separately and missed these parameters.
