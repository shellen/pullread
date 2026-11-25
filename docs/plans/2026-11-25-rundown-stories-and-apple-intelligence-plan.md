# Rundown Stories + Apple Intelligence (WWDC26) — Plan

**Date**: 2026-11-25
**Status**: Plan. Phase 1 is prototyped on `claude/lucid-shannon-jkllpp`.
**Ships after**: PR #121 (Rundown fixes) in 0.5.2. This work targets 0.6.0 and later.
**Target OS**: macOS 26 (Tahoe), which is what we develop and test on (26.6). Everything in Phases 1–5 runs on macOS 26. The macOS 27 features are a separate later section and nothing earlier depends on them.

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
| Guided generation (`@Generable`, **macOS 26**) | Not new, but unused. | Structured intro output with exact citations, and model-assisted grouping. |
| `SystemLanguageModel().contextSize`, `tokenCount(for:)` (**macOS 26.4+**) | Apple's sample shows 8192 on newer devices. | Real token budgets, for RLM chunks and grouping batches. |
| `PrivateCloudComputeLanguageModel` (macOS 27) | 32K-token context and adjustable reasoning (`reasoningLevel`). No API keys, and no cost to developers under 2M first-time downloads. Users get daily limits, higher with iCloud+. **Requires an entitlement.** | Story grouping and importance across the whole day's headlines in one call. |
| `fm` CLI (pre-installed on macOS 27) | `fm respond --schema schema.json` returns JSON, and `--model pcc` uses the big model. Output can be captured from a script. | A no-compile path on macOS 27, and the basis for the demos. |
| Image input (`Attachment(...)`) | Any image size, though larger images cost more tokens. | Tell real artwork from logos and placeholders (draft #116). |
| Evaluations framework (Xcode 27) | Tests for prompts. | Regression tests for the Rundown intro rules. |

Not added: embeddings, clustering and ranking APIs. On-device semantic matching still uses the Natural Language framework (`NLEmbedding`, `NLTagger`).

**Measured on macOS 26.6 (M4 Pro, Nov 25):** the on-device context window is **4,096 tokens**, covering prompt, schema and answer together. Apple's 8,192 figure is for macOS 27. In guided generation, an unbounded `[T]` field let the model run until the window was full (`exceededContextWindowSize` at 4,091 tokens). Every array field needs a `.count`/`.maximumCount` guide, and every call needs `GenerationOptions(maximumResponseTokens:)`.

Not yet confirmed: the PCC entitlement name and its daily limits (in session 319).

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
- Later, for macOS 27: the PCC entitlement can only live on the signed app, not on binaries compiled on the user's Mac. Building the helpers in CI now is what makes that possible.

### Phase 3: Guided generation for the Rundown intro (macOS 26+)

- Replace free text plus `{{phrase|N}}` markers with a `@Generable` result: `paragraphs: [{ text, stories: [Int] }]`.
- Render the links from the cited story numbers instead of matching titles in the text. This retires `strictTitles` and most of the title-matching fallback.
- Other providers keep the current marker path. Claude and OpenAI could also use their own structured-output modes later.
- **Demo 1** shows the renderer.

### Phase 4: Model-assisted story grouping and importance (macOS 26, on-device)

The on-device model's context is too small for a whole day of headlines, so on macOS 26 it acts as a tie-breaker that answers narrow questions in small batches (`src/rundown-ai.ts`):

1. **"Same event?" for candidate pairs.** `candidatePairs()` lists groups that share at least one distinctive word but that word matching didn't merge, most shared words first, capped at 40 pairs. The model answers in batches of 12 (`PAIR_INSTRUCTIONS`, returning `same: ["P3", …]`). Groups that share no word are never asked about, so the model can't group by topic alone. In the demo, only Roundup vs. Weedkiller ("cancer") is asked, and Verge digest apps vs. Bezos never is.
2. **Labels and importance.** One section label and a 1–5 rating per group, in batches of 20 (`LABEL_INSTRUCTIONS`).
3. `groupingLinesFromPairs()` joins confirmed pairs transitively and produces "ids|label|importance" lines. `applyModelGroups()` merges and relabels the groups, and `curateWithStories({ modelGroups })` adjusts weight by ±1.5 per importance step. The model can only merge groups, never split ones the word matching joined. Merges with no shared word are still refused, as a backstop.

Still to do:
- [ ] Include the panel headlines in the label batches, so panel-only stories (the quake) get an importance rating too. The demo doesn't do this yet, which is why Roundup outranks the quake there.
- [ ] Size batches with `tokenCount(for:)` instead of fixed counts.
- [ ] Time the full pass on a real day (about 100 stories means roughly 4 pair batches and 5 label batches) and set a time budget, falling back to Phase 1 alone if it runs over.
- [ ] Production helper: move `scripts/demos/fm-structured.swift`'s `@Generable` types into the CI-built helpers from Phase 2.

**Demo 2** shows this path.

### Phase 5: Rundown prompt checks (Evaluations)

- Automatically check the intro against the rules in its prompt: no weekday or date for today, every cited story exists, no banned phrases, no greetings or sign-offs, and every story it mentions is linked.
- Run these checks on recorded outputs in jest now. Move to Apple's Evaluations framework when we adopt Xcode 27.
- **Demo 3** shows the checks.

### Later: macOS 27

None of this is needed for the phases above. Pick it up once we test on macOS 27.

- **Private Cloud Compute for grouping.** Send the whole day's feed and panel headlines (about 150–300 lines fit in 32K) in one call with `reasoningLevel(.light)`, replacing the pair and label batches. `groupingPrompt()` and `GROUPING_INSTRUCTIONS` already exist, and the demos use them when `fm` is present. Needs the PCC entitlement (session 319) and the CI-signed helpers from Phase 2. Fall back to the macOS 26 path when PCC is unavailable or over its daily limit.
- **`fm` CLI** as a no-compile path for scripts and previews.
- **Evaluations framework** (Xcode 27) to replace the jest-based intro checks.
- **Image input:** hide logos and placeholder images used as hero art. This supersedes the size rules in draft #116.

### Later: any OS

- **On-device embeddings** (`NLEmbedding`, macOS 26) to find candidate pairs by meaning, not just shared words. This would catch pairs like "Bayer" vs. "Roundup maker" that share no word.

## Demos

Each demo has a part that runs anywhere (jest, or the sample render in `scripts/demos/`) and a part that runs on a Mac with Apple Intelligence.

- **macOS 26:** `--live` compiles `scripts/demos/fm-structured.swift` once with `swiftc`, then asks the on-device model with `@Generable` types. Demo 2 uses the pair and label batches.
- **macOS 27:** `--live` uses `fm respond --schema` (PCC by default), and demo 2 sends the full list. Apple shows only flat `fm schema` examples, so the demos use flat string-array schemas.

```bash
bun scripts/demos/rundown-demos.ts            # sample data, renders HTML to ./demo-out
bun scripts/demos/rundown-demos.ts --live     # macOS 26: Swift helper, on-device · macOS 27: fm (PCC; --on-device for local)
```

## Release sequencing

1. #121 merges and 0.5.2 ships through the normal release process (`RELEASING.md`).
2. Phase 1 gets its own PR, once the remaining items above are done. It's stacked on #121.
3. Phases 2 and 3 go in one PR, so CI-built helpers and structured output land together.
4. Phases 4 and 5 follow in their own PR, on-device on macOS 26.
5. The macOS 27 items come later, once we're testing on 27 and have the PCC entitlement.
