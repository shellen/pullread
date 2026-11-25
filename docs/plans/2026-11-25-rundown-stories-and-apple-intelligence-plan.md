# Rundown Stories + Apple Intelligence (WWDC26) — Plan

**Date**: 2026-11-25
**Status**: Plan. Phase 1 is prototyped on `claude/lucid-shannon-jkllpp`.
**Ships after**: PR #121 (Rundown fixes) in 0.5.2. This work targets 0.6.0 and later.

## Problem

The Rundown ranks articles one at a time, and the signals it uses are basic:

1. **Weight ignores coverage.** `scoreArticle` is mostly about freshness (+3, fading over 24h) plus +1 for an excerpt and +1 for an image. A story five of your feeds ran scores the same as one only a single feed ran. PR #121's dedupe throws the extra copies away, losing that signal entirely.
2. **The ranking depends entirely on what you follow.** If something huge happens and none of your feeds cover it, the Rundown doesn't mention it.
3. **Sections are publisher taxonomy.** `groupByCategory` uses each feed's first category string, so one story can land under "Suits and Litigation (Civil)" or "Bayer AG".
4. **Apple Intelligence is barely used.** Pull Read uses only the macOS 26 basics: `LanguageModelSession().respond(to:)` with plain text out. The helpers are compiled with `swiftc` on the user's Mac, which is where the "FoundationModels not found" errors come from. Articles are chunked on fixed word counts sized for a 4K context window. Pull Read also uses none of macOS 26's guided generation, which is why the Rundown intro needs the `strictTitles` workaround for small models that ignore `{{story|N}}` markers.

## What WWDC26 added that matters here

From Apple's sessions [241](https://developer.apple.com/videos/play/wwdc2026/241/) and [334](https://developer.apple.com/videos/play/wwdc2026/334/):

| API | Notes | Use in Pull Read |
|---|---|---|
| `PrivateCloudComputeLanguageModel` (macOS 27) | 32K-token context and adjustable reasoning (`reasoningLevel`). No API keys, and no cost to developers under 2M first-time downloads. Users get daily limits, higher with iCloud+. **Requires an entitlement.** | Story grouping and importance across the whole day's headlines in one call. |
| `SystemLanguageModel().contextSize`, `tokenCount(for:)` (iOS 26.4 / macOS 26.4) | Apple's sample shows 8192 on newer devices. | Replace fixed word chunking with real token budgets. |
| `fm` CLI (pre-installed on macOS 27) | `fm respond --schema schema.json` returns JSON, and `--model pcc` uses the big model. Output can be captured from a script. | A no-compile path on macOS 27, and the basis for the demos. |
| Image input (`Attachment(...)`) | Any image size, though larger images cost more tokens. | Tell real artwork from logos and placeholders (draft #116). |
| Evaluations framework (Xcode 27) | Tests for prompts. | Regression tests for the Rundown intro rules. |
| Guided generation (`@Generable`, macOS 26) | Not new, but unused. | Structured intro output with exact citations. |

Not added: embeddings, clustering and ranking APIs. On-device semantic matching still uses the Natural Language framework (`NLEmbedding`, `NLTagger`).

Not yet confirmed: the PCC entitlement name and its daily limits (in session 319), and the on-device context size on macOS 26 vs. 27.

## Phases

### Phase 1: Story grouping + wider-news panel (prototyped)

`src/stories.ts`, wired in through `curateWithStories()` in `src/email.ts`.

- `groupStories()` keeps every copy of a story. Its weight is base score + 2.5 per extra outlet (capped at 7.5) + 10 × panel strength.
- **Wider-news panel.** Nine broad outlets, three per rough lean, read for headlines only and never saved to the library. A story counts as consensus when ≥40% of the panel runs it across ≥2 leans, with one vote per outlet.
- **Punch-through.** A story none of your feeds carry gets in only at ≥60% of the panel, with at most two such stories, labeled "Beyond your feeds".
- **Regional.** Optional `regionalFeeds`. When two local outlets agree, the story shows as "Near you", ranked below a major national story.
- **Top stories block.** Up to 3 stories, with "Also in …" and "Widely covered: …" lines.
- **Settings.** `widerNews` (default on) and `regionalFeeds` (default empty).

Remaining before merge:
- [ ] Fetch the nine panel feeds live on a Mac. None have been checked yet.
- [ ] Settings UI for `widerNews` and `regionalFeeds`.
- [ ] Decide the panel lineup, the 40%/60% thresholds, and whether the panel is on by default.
- [ ] Cache panel headlines (about 1h) so twice-daily sends and previews don't refetch.

### Phase 2: Build the Swift helpers in CI, and switch to real availability and token checks

This is the foundation for everything after it, and it works on macOS 26.

- Compile the Swift helpers (`SUMMARIZE_SWIFT`, `RLM_SWIFT` and the autotagger batch helper) in `build-tauri.yml`, then sign them with the app. This removes the Xcode command-line tools requirement.
- Replace the `sw_vers ≥ 26` check with `SystemLanguageModel.default.availability`, which reports when the device isn't eligible, Apple Intelligence is off, or the model isn't downloaded.
- Size the RLM chunks with `contextSize` and `tokenCount(for:)` on 26.4+, and keep the word-count fallback below that.
- Required for Phase 4: the PCC entitlement can only live on the signed app, not on binaries compiled on the user's Mac.

### Phase 3: Guided generation for the Rundown intro (macOS 26+)

- Replace free text plus `{{phrase|N}}` markers with a `@Generable` result: `paragraphs: [{ text, stories: [Int] }]`.
- Render the links from the cited story numbers instead of matching titles in the text. This retires `strictTitles` and most of the title-matching fallback.
- Other providers keep the current marker path. Claude and OpenAI could also use their own structured-output modes later.
- **Demo 1** shows the renderer.

### Phase 4: Model-assisted story grouping and importance (macOS 27, PCC)

- Send the day's feed and panel headlines (about 150–300 short lines fit in 32K) to PCC with a schema: groups of headline IDs, plus a short label and a 1–5 importance rating per group.
- Merge the result into `groupStories()`. The word-overlap matching stays as the fallback and the check: the model can only merge groups, never split ones the deterministic pass is sure of.
- Guard against grouping by topic: a merge is refused unless the headlines share at least one distinctive word. In the demo this kept Roundup + Weedkiller ("cancer") and refused a Verge digest-apps + Bezos merge. Panel headlines go into the same prompt, so panel-only stories (the quake) get an importance rating too. The demo doesn't do that yet, which is why Roundup outranks the quake there.
- Use the model's labels as sections, replacing the feeds' category strings.
- Use `reasoningLevel(.light)`, and fall back to Phase 1 alone when PCC isn't available or the daily limit is reached.
- **Demo 2** shows the merge.

### Phase 5: Rundown prompt checks (Evaluations)

- Automatically check the intro against the rules in its prompt: no weekday or date for today, every cited story exists, no banned phrases, no greetings or sign-offs, and every story it mentions is linked.
- Run these checks on recorded outputs in jest now. Move to Apple's Evaluations framework when we adopt Xcode 27.
- **Demo 3** shows the checks.

### Later

- **Image input:** hide logos and placeholder images used as hero art. This supersedes the size rules in draft #116.
- **On-device embeddings** (`NLEmbedding`) for semantic matching where PCC isn't available.

## Demos

Each demo has a part that runs anywhere (jest, or the sample render in `scripts/demos/`) and a part that runs only on a Mac with macOS 27 through `fm`. Apple shows only flat `fm schema` examples, so the demos use flat schemas: arrays of strings with the structure encoded inside them. Check `fm schema --help` for nested objects before Phase 3/4 production code.

```bash
bun scripts/demos/rundown-demos.ts            # sample data, renders HTML to ./demo-out
bun scripts/demos/rundown-demos.ts --live     # macOS 27: fm (PCC; --on-device for local). macOS 26: Swift helper, on-device only
```

## Release sequencing

1. #121 merges and 0.5.2 ships through the normal release process (`RELEASING.md`).
2. Phase 1 gets its own PR, once the remaining items above are done. It's stacked on #121.
3. Phases 2 and 3 go in one PR, so CI-built helpers and structured output land together.
4. Phases 4 and 5 come after we have the PCC entitlement.
