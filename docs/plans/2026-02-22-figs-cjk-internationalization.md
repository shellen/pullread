# FIGS + CJK Internationalization Plan

**Date:** 2026-02-22
**Status:** Investigation / Planning

## Current State

PullRead has **zero internationalization infrastructure**. All UI strings are hardcoded in English across 10 viewer JS files (108+ string assignments), Rust tray menu items, CLI output, and LLM prompts. Content handling (filenames, search, fetching) assumes ASCII Latin text.

---

## FIGS (French, Italian, German, Spanish) — Changes Needed

### Phase 1: Content Handling Fixes (High impact, low effort)

These are bugs/limitations that affect FIGS content even if the UI stays in English.

#### 1. Filename Generation — Diacritical Stripping

**File:** `src/writer.ts:25-31`
**Problem:** The slug regex `replace(/[^a-z0-9]+/g, '-')` strips ALL non-ASCII characters. FIGS titles lose accented characters:
- "Les Misérables" → `les-mis-rables`
- "Ángeles y demonios" → `ngeles-y-demonios`
- "Über allen Gipfeln" → `ber-allen-gipfeln`

**Fix:** Normalize Unicode diacriticals to ASCII equivalents before slugifying:
```ts
let slug = title
  .replace(/^\[Private\]\s*/i, '')
  .normalize('NFD')                    // decompose é → e + combining accent
  .replace(/[\u0300-\u036f]/g, '')     // strip combining marks
  .toLowerCase()
  .replace(/['']/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 50);
```

Same fix needed in `exportNotebook()` (line 193) and `removeExportedNotebook()` (line 240).

**Effort:** ~30 minutes. **Tests:** Update `writer.test.ts` with accented title cases.

---

#### 2. Search Accent Folding

**File:** `viewer/05-sidebar.js:308`
**Problem:** Search uses simple `.toLowerCase().includes()`. Searching "resume" won't find "résumé", "cafe" won't find "café".

**Fix:** Add an accent-folding normalize function and apply it to both the search query and the match targets:
```js
function foldAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
```
Then change `f.title.toLowerCase().includes(tl)` to `foldAccents(f.title).includes(foldAccents(tl))` (etc.)

**Effort:** ~30 minutes. Purely additive.

---

#### 3. Accept-Language Header

**File:** `src/extractor.ts:843`
**Problem:** `'Accept-Language': 'en-US,en;q=0.9'` tells servers we only want English content. Some sites serve different content based on this header.

**Fix:** Expand to include FIGS languages:
```ts
'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8,de;q=0.7,es;q=0.6,it;q=0.5'
```
Or better: make this configurable via settings.

**Effort:** 5 minutes for the quick fix. Configurable version: ~30 minutes.

---

### Phase 2: UI Localization Infrastructure (Medium effort)

#### 4. Locale String Extraction

**Problem:** 108+ hardcoded English strings in viewer JS files, plus Rust tray menu strings. No i18n framework.

**Approach:** Create a lightweight locale system:
- `viewer/locales/en.json` — English strings (extract from existing code)
- `viewer/locales/fr.json`, `de.json`, `es.json`, `it.json`
- A small `t(key)` function in `viewer/02-utils.js` that looks up strings
- Locale selected in settings, stored in localStorage

**Scope of strings to extract:**
- Viewer toolbar labels ("Summarize", "Share", "Settings", etc.)
- Search placeholders ("Search... try is:favorite or tag:tech")
- Toast messages ("Copied to clipboard", "Highlight saved", etc.)
- Settings panel labels
- Onboarding tour text
- TTS control labels
- Error messages

**Does NOT need localization:**
- Article content (already in the article's language)
- Frontmatter field names (technical, not user-facing)
- CLI output (developer-facing)
- Search operators (`is:favorite`, `tag:`, etc.) — keep as English keywords

**Tray menu (Rust):** `src-tauri/src/tray.rs` has ~10 English strings ("Sync Now", "View Articles", etc.). These would need to use Tauri's localization or accept the OS locale.

**Effort:** 2-3 days for extraction + infrastructure. Translation effort is separate.

---

#### 5. Date/Time Formatting

**Files:** `src/extractor.ts:248`, several viewer files
**Problem:** `toLocaleDateString('en-US', ...)` is hardcoded.
**Status:** Most viewer code already uses `toLocaleDateString()` without a forced locale (uses browser default), which is correct. Only the tweet date formatter in extractor.ts is hardcoded.

**Fix:** Use the configured locale or omit the locale parameter to use system default.

**Effort:** 15 minutes.

---

### Phase 3: AI Feature Localization (Medium effort)

#### 6. LLM Prompt Localization

**Files:** `src/summarizer.ts:253`, `src/autotagger.ts:12`
**Problem:** Summary and autotag prompts are in English. An article in French will get an English summary.

**Fix:** Detect article language (heuristic or `<html lang="...">` from extraction) and instruct the LLM to respond in the same language:
```
Summarize this article in 2-3 concise sentences in the same language as the article.
```

**Effort:** ~1 hour. Need to thread language info through the extraction pipeline.

---

#### 7. TTS Language Support

**File:** `viewer/07-tts.js:377`
**Problem:** Browser TTS uses `navigator.language || 'en-US'`. For FIGS articles, TTS should use the article's language.
**Also:** Kokoro voices are English-only. OpenAI and ElevenLabs have multilingual support.

**Fix:**
- Detect article language from `<html lang>` or frontmatter
- Pass language to browser SpeechSynthesis
- Show a language selector or auto-detect
- Document that Kokoro is English-only; recommend cloud TTS for FIGS

**Effort:** ~2 hours.

---

#### 8. YouTube Transcript Language

**File:** `src/extractor.ts:982`
**Problem:** Hardcoded to prefer English captions. Non-English videos get English auto-translated or first-available track.

**Fix:** Make transcript language preference configurable, or detect from user's language setting. Fall back to original language track if preferred language unavailable.

**Effort:** ~30 minutes.

---

## CJK (Chinese, Japanese, Korean) — Additional Concerns

CJK introduces fundamentally different text handling requirements. These are documented here for planning but would be a separate implementation phase.

### CJK-Specific Issues

#### A. Filename Generation (Hard)
- CJK characters can't be meaningfully transliterated to ASCII without a library
- Options: (a) Use pinyin/romaji libraries, (b) Keep CJK characters in filenames (filesystem-safe), (c) Use a hash-based fallback
- **Recommendation:** Allow CJK characters in filenames. Modern filesystems handle them fine. Change the slug regex to preserve CJK ranges: `[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]`

#### B. Font Stacks (Medium)
- Current fonts (Work Sans, Inter, Literata, etc.) have zero CJK glyphs
- Need to add CJK font families: `"Noto Sans CJK SC"`, `"Noto Serif CJK SC"`, system CJK fonts
- Google Fonts serves CJK subsets but they're large (~2-7MB per weight)
- **Recommendation:** Use system CJK fonts as primary, optional Google Fonts for consistency

#### C. Line Breaking & Text Layout (Medium)
- CJK text doesn't use spaces between words
- CSS `word-break: break-all` or `overflow-wrap: anywhere` may be needed
- Proper line break opportunities: use `word-break: normal` with `overflow-wrap: break-word` and set `lang` attribute
- Ruby text (furigana) may be desired for Japanese

#### D. Search & Text Matching (Hard)
- No word boundaries in CJK text; `.includes()` works for substring matching but users expect fuzzy/segmented search
- Chinese: Traditional/Simplified character variants (搜索 vs 搜索)
- Japanese: Hiragana/Katakana/Kanji equivalence
- **Recommendation:** Start with substring matching (already works), evaluate Intl.Segmenter later

#### E. IME (Input Method Editor) Support
- Tag input and search need to handle IME composition events
- The `compositionstart`/`compositionend` events need to be respected
- Currently the tag input handler fires on `Enter` which may conflict with IME confirmation

#### F. PDF Extraction
- CJK PDF text extraction with unpdf is unreliable — glyph-to-Unicode mapping often fails
- May need alternative extraction strategies for CJK PDFs

#### G. TTS
- Kokoro doesn't support CJK
- Browser TTS quality for CJK varies significantly
- Cloud TTS (OpenAI, ElevenLabs) supports CJK but at higher cost

---

## Recommended Implementation Order

### Start with FIGS (this sprint)

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | Fix filename diacritical handling | 30 min | Critical — broken filenames |
| 2 | Add search accent folding | 30 min | High — broken search for FIGS content |
| 3 | Expand Accept-Language header | 5 min | Medium — some sites may serve wrong language |
| 4 | Fix tweet date locale | 15 min | Low — cosmetic |
| 5 | Add language-aware LLM prompts | 1 hr | Medium — summaries match article language |
| 6 | TTS language detection | 2 hr | Medium — FIGS TTS works |
| 7 | YouTube transcript language pref | 30 min | Low — edge case |

**Total Phase 1 effort: ~5 hours**

### UI Localization (next sprint)

| # | Task | Effort |
|---|------|--------|
| 8 | Create locale JSON infrastructure | 4 hr |
| 9 | Extract viewer strings to locale files | 8 hr |
| 10 | Add language selector in settings | 2 hr |
| 11 | Translate to FR/IT/DE/ES | 8 hr (or use LLM-assisted translation) |
| 12 | Localize Rust tray menu | 2 hr |

**Total Phase 2 effort: ~24 hours**

### CJK (future sprint, separate plan)

Would require its own detailed plan after FIGS is stable.

---

## Files Changed (Phase 1 FIGS)

| File | Change |
|------|--------|
| `src/writer.ts` | Unicode normalization in `generateFilename()`, `exportNotebook()`, `removeExportedNotebook()` |
| `src/writer.test.ts` | Add test cases for accented titles |
| `src/extractor.ts` | Expand Accept-Language, fix tweet date locale |
| `src/summarizer.ts` | Language-aware summary prompt |
| `src/autotagger.ts` | Language-aware tagging prompt |
| `viewer/02-utils.js` | Add `foldAccents()` utility |
| `viewer/05-sidebar.js` | Use accent folding in search |
| `viewer/07-tts.js` | Language-aware TTS |
