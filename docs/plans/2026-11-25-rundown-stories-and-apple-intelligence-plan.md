# Rundown Stories + Apple Intelligence (WWDC26) — Plan

**Date**: 2026-11-25
**Status**: In progress on `claude/lucid-shannon-jkllpp` (0.6.0).
- Phase 1 is built and still needs a live feed check and a settings screen.
- The macOS 26 parts of Phases 3–5 are in the app, under "In the app now" below.
- Phase 2 (helpers built and signed in CI) is next.
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

## In the app now (from the demos)

These were proven on macOS 26.6 over four live runs and moved from `scripts/demos/` into the app:

- **`src/apple-structured.ts`.** The guided-generation Swift helper, compiled once with `ensureAppleBinary` like the summarizer's. It covers three modes: `intro`, `pairs` and `labels`. It checks availability first, caps every array and every response length, and names context-window and generation errors. The demos now call this same helper.
- **Rundown intro for Apple users** (`generateRoundupSummary`). It asks for the per-story structure (`appleIntroInstructions`, top 6 stories, 140-character gists). If that fails, it falls back to the existing text prompt.
- **Intro gate for every provider.** `checkIntro` plus `blockingFailures`: an intro that names the wrong day, uses banned filler, a greeting or a filler opener, cites a missing story, or copies a story's text is retried once, then left out. Paragraph count and link length are logged only. Quoted exact titles don't count as copying, because the strict-titles prompt asks for them.
- **No stories, no intro; every paragraph must be grounded.** Live finding: `preview-rundown` on a day with 0 saved articles produced an invented intro (Biden, a Supreme Court ruling, Chang'e-6, an oil spill), and the first version of the gate let it through. Now `generateRoundupSummary` returns early when there are no articles. A blocking rule, "Grounded in today's stories", requires every paragraph to cite a story or share at least two distinctive words with one. On a retry, the Apple intro adds "never reuse more than three words in a row from any headline", because one live run wrote in its own words and the next copied headlines.
- **First run on real articles (246 stories over 3 days, Nov 25).**
  - The panel reached 9 of 9 outlets, and the Christian Science Monitor feed works.
  - With the tuned bar, 3 stories were widely covered: Huang/Nvidia (6 outlets), Al Gore's newspaper and the Pope diary (3 each).
  - **The on-device model refused both the intro and the grouping** (`GenerationError.refusal`), probably over headlines on sexual misconduct and similar topics. The helper now uses `SystemLanguageModel(guardrails: .permissiveContentTransformations)`, since this is the user's own content being transformed. It's unconfirmed whether that applies to guided generation.
  - A refused grouping batch is now skipped instead of failing the whole pass.
  - Only the top 40 stories go to the model, keeping it to about 6 calls.
  - The intro fell back to the text prompt, which wrote stock filler ("The tension is palpable…") and got a fact wrong: it said both Santa Cruz candidates declared victory, when one conceded. The new "No stock filler" rule blocks the filler. **Open question:** should on-device users get the text-prompt fallback at all, since the checks can't catch factual errors?
- **Second real-article run (266 stories, Nov 25).**
  - Permissive guardrails did **not** stop the refusal of the six-story intro. The text fallback then failed the checks twice, so the gate correctly sent no intro.
  - **The Apple intro is now one story per request** (`sentence` mode, `buildPerStoryIntro`). A refused story is skipped, and the intro is written from up to 5 others. It needs at least 3 sentences.
  - Grouping ran, but merged three unrelated BMW BLOG stories that shared only "BMW", and the merges chained. Now a pair is only asked about if it shares at least **two uncommon words** (words in more than `max(3, 2%)` of the day's stories don't count). Clusters merge only when the model confirmed **every** cross pair.
- **Third real-article run (Nov 25).**
  - Per-story intro worked: 2 stories declined, intro built from 5.
  - Santa Cruz mayor race merge was correct.
  - **Over-merges:** three Black Friday deal posts, which then became the top story on coverage, and two BMW BLOG posts. Cause: common words were measured on the 40-story shortlist, not the whole day. Fixed with `commonWords(allGroups)`, and years are ignored.
  - **The intro had factual errors no check can catch:** Molly Meldrum as "her", John Berger "featured in GTA", and an unsupported "first time the brand has built a vehicle in the US". It also added "This is significant…" sentences. Now: first sentence only, "use only facts from the headline and excerpt", more filler patterns.
  - **Decision (Nov 25):** the on-device intro stays on by default, with a clearer label. The credit reads "Written on-device by Apple Intelligence · may contain errors, so check the stories below". Cloud providers keep "Summary by …". Revisit with PCC on macOS 27.
- **`preview-rundown` report and `--days N`.** It prints panel outlets reached, widely covered stories, story count and the model grouping outcome (`StoryReport`), so a live run shows whether each part worked.
- **On-device grouping for Apple users** (`buildRoundup` → `appleGrouperIfEnabled` → `onDeviceGrouping`). "Same event?" for candidate pairs, plus fixed-list labels, with importance ignored. It runs under a 45-second budget. Each call has a 30-second timeout, and on any error the Rundown keeps word matching only.

Caveat: the helper runs synchronously (`execFileSync`), like the existing Apple summarizer, so the sidecar blocks while it runs. That's acceptable for a scheduled email, but it should go async in Phase 2.

## Today's one read (v1, Nov 25)

Inspired by a friend's personal newspaper, which picks one story a day from about 8,000 feeds using months of hand-tuned instructions built from Obsidian and meeting notes. Pull Read builds the interest profile automatically from what you do in Pull Read, and keeps it on the Mac (`src/interests.ts`).

- **Signals** (all local; `gatherInterestSignals`), with these weights:

  | Signal | Weight | Notes |
  |---|---|---|
  | Research watches | 4 | Never fade |
  | Highlights and inline notes | 3 | |
  | Notebook notes | 3 | |
  | Favorites | 2 | The article's title |
  | Your own tags | 1.5 | |

  Dated signals halve every 21 days.
- **No Obsidian (decided Nov 25):** the library is already saved as markdown, so a vault would mostly feed your own reads back in.
- **Article notes are not used at all (third live profile).** Even after filtering feed descriptions, 1,029 remained. Samples: a 59,059-character article body, a feed blurb, and a 2010 bookmark description. They can't be told apart from real notes, so the profile uses only timestamped signals created in Pull Read. The pick stays weak until read state is synced.
- **Intro: names must come from the story.** `unsupportedNames()` rejects a sentence that names anything (capitalized words, quoted titles) missing from its headline and excerpt. It gets one retry, then the story is skipped. Live: "John Berger appeared in 'Grand Theft Auto' as a character named 'The Philosopher'" grew more elaborate on each run despite the facts-only prompt.
- **Imported feed descriptions are not notes.** An old viewer migration (`viewer/13-init.js`) copied each RSS item's `annotation:` (the feed's description) into `articleNote`. The first live profile counted 19,794 "notes" this way, and their filler words ("now", "been", "back") topped the profile. `isImportedDescription()` now compares each note with the frontmatter and skips copies. The stoplist also grew.
- **Scoring** (`rankForInterests`): words from the title count double. Words common across the day's articles are discounted, and an article needs at least two different matching words.
- **Pick** (`pickOneRead`): the best match. Articles you've highlighted or really noted are skipped, since read state lives only in the viewer's localStorage. The pick and any other copies of its story are removed from the rest of the email.
- **Email:** a "Today's one read" block above the intro, with a "why" line. `oneRead` defaults to on.
- **Preview:** `preview-rundown` prints the pick, its score and why, the profile's signal counts and strongest interests, and the five runners-up.

- **Read-state sync (built Nov 25).**
  - `viewer/20-reading.js` reports opens (from `markAsRead`) and scroll progress (from `saveScrollPosition`, in 10-point steps, with 90% counting as finished). Events are batched every 3s and flushed with `sendBeacon` on page hide.
  - It also backfills the existing `pr-read-articles` list and saved scroll positions once.
  - The sidecar stores everything in `~/.config/pullread/reading.json` (`src/reading.ts`, atomic writes, capped at 20,000 articles) via `POST /api/reading`.
  - The profile uses articles finished in the last 60 days as a mild `read` signal (weight 1, fading).
  - The pick skips everything opened.
  - Sent Rundowns record their pick (`recordPick`), and the preview shows recent picks as opened, finished or not yet. That's the feedback loop.

Next:
- **Let a model choose among the top 5** with a one-line reason.
- **Show the profile in Settings.**

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
- [x] Settings UI: The Rundown card → "What goes in" has toggles for Today's one read and Wider news (with a "Which outlets?" list from `DEFAULT_PANEL`), and a Near you feed editor. It saves through `/api/email-settings`, validated by `sanitizeRundownContentSettings`.
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
- **On-device schema (from live runs on macOS 26.6).** Free paragraphs plus a separate links list failed: the model wrote a filler opener and ten one-line paragraphs, with no links. Per-story fields work better: `lead` (1–2) and `more` (2–3) mentions of `{ story, sentence, phrase }`, all bounded. The next run respected the structure and linked every story correctly, but copied titles and excerpts verbatim and linked whole sentences. Now: prompt for own words, ≤5-word links, and code replaces long links with title words.
- **Gate the intro on the checks (Phase 5).** In production, run `checkIntro()` on the result. Retry once on failure, then leave the intro out. No intro is better than a copied or broken one.
- **Section labels from a fixed list.** On-device labels were inconsistent ("Tech" vs. "Technology", Roundup as "Health"), so the label schema uses `.anyOf(SECTION_NAMES)` and `.range(1...5)`. Importance ratings were noise across three live runs (all 4s, then mostly 3s, then 5/5 for niche stories like a type foundry), so the macOS 26 path ignores them entirely (`useImportance: false`) and keeps only labels and merges. Ratings return with PCC on macOS 27, worth ±0.75 per step.
- **Demo 1** shows the renderer.

### Phase 4: Model-assisted story grouping and importance (macOS 26, on-device)

The on-device model's context is too small for a whole day of headlines, so on macOS 26 it acts as a tie-breaker that answers narrow questions in small batches (`src/rundown-ai.ts`):

1. **"Same event?" for candidate pairs.** `candidatePairs()` lists groups that share at least one distinctive word but that word matching didn't merge, most shared words first, capped at 40 pairs. The model answers in batches of 12 (`PAIR_INSTRUCTIONS`, returning `same: ["P3", …]`). Groups that share no word are never asked about, so the model can't group by topic alone. In the demo, only Roundup vs. Weedkiller ("cancer") is asked, and Verge digest apps vs. Bezos never is.
2. **Labels and importance.** One section label and a 1–5 rating per group, in batches of 20 (`LABEL_INSTRUCTIONS`).
3. `groupingLinesFromPairs()` joins confirmed pairs transitively and produces "ids|label|importance" lines (importance left out on macOS 26). `applyModelGroups()` merges and relabels the groups, and `curateWithStories({ modelGroups })` adjusts weight by ±1.5 per importance step. The model can only merge groups, never split ones the word matching joined. Merges with no shared word are still refused, as a backstop.

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
