# Issues to file on GitHub

Copy-paste each section as a new issue. All verified against the codebase.

---

## 1. Kokoro TTS chunk size too large — causes silent audio truncation

**Labels:** bug, tts

Kokoro-82M has a ~510 phoneme-token context window. When text exceeds this, the audio output is silently truncated (you get ~20 seconds of a 2+ minute article).

**Current behavior:** `kokoroTTS()` in `src/tts.ts:489` chunks text at **5,000 characters**, far exceeding Kokoro's context window.

**Expected behavior:** Kokoro chunks should be ~500 characters to stay within the phoneme-token limit.

```typescript
// src/tts.ts:489
const chunks = chunkText(text, 5000);  // Should be ~500
```

**Impact:** Most articles produce incomplete/truncated audio when using Kokoro TTS.

---

## 2. WAV concatenation produces corrupt audio files

**Labels:** bug, tts

When Kokoro TTS generates audio for multi-chunk articles, the individual WAV buffers are naively concatenated with `Buffer.concat()` (`src/tts.ts:509`). Each WAV chunk has its own 44-byte RIFF header — the concatenated file contains multiple RIFF headers interleaved in the audio data.

Result: only the first chunk plays, or the file fails to parse.

**Fix:** Extract raw PCM samples from each WAV chunk (skip the RIFF/fmt/data headers), concatenate the raw sample buffers, then encode a single WAV with one correct RIFF header using the existing `encodeWav()` function.

Note: MP3 concatenation (OpenAI/ElevenLabs) is fine since MP3 frames are self-delimiting.

---

## 3. Dashboard article navigation fails when hide-read is active

**Labels:** bug, viewer

`dashLoadArticle()` in `viewer/04-article.js:182` fails to load read articles when the "hide read" toggle is active.

**Root cause:** The function calls `filterFiles()` without first setting `activeFile`. The hide-read filter in `renderFileList()` preserves `activeFile`:
```javascript
displayFiles = filteredFiles.filter(f => !readArticles.has(f.filename) || f.filename === activeFile);
```
Since `activeFile` hasn't been updated, the target article gets filtered out.

**Fix:** Set `activeFile = filename` before calling `filterFiles()`.

---

## 4. Feed add/remove changes are silently lost (not persisted)

**Labels:** bug, settings

`settingsAddFeed()` and `settingsRemoveFeed()` in `viewer/03-settings.js` modify the in-memory config but never call `settingsPageSaveConfig()`. Changes appear to work (UI updates) but are silently lost on navigation or restart.

- `settingsAddFeed()` (line 606): adds to `sec._configData.feeds` → calls `showSettingsPage()` only
- `settingsRemoveFeed()` (line 633): deletes from `sec._configData.feeds` → calls `showSettingsPage()` only

**Fix:** Call `settingsPageSaveConfig()` after modifying feeds in both functions.

---

## 5. AI settings shows API key fields for all providers simultaneously

**Labels:** enhancement, settings

The AI settings page (`viewer/03-settings.js:446–469`) renders API key and model input fields for all 4 cloud providers (Anthropic, OpenAI, Gemini, OpenRouter) at once, regardless of which is selected.

**Expected:** Show only the selected provider's fields. Collapse or hide non-selected providers.

---

## 6. TTS reading highlight scroll-jacks the viewport

**Labels:** bug, tts, viewer

`ttsHighlightParagraph()` in `viewer/07-tts.js:478` calls `scrollIntoView({ behavior: 'smooth', block: 'center' })` on every paragraph transition during TTS playback. This forcibly repositions the viewport, disrupting the user if they scroll away.

**Fix:** Remove the `scrollIntoView()` call. The `.tts-reading-hl` CSS (left-border + light background) is already effective without forced scrolling.

---

## 7. Bun server writes API keys to settings.json in plaintext

**Labels:** bug, security

The Swift app correctly stores API keys in macOS Keychain. However, the Bun sidecar writes keys back to `settings.json` in plaintext:

1. `src/summarizer.ts:191` — `saveLLMSettings()` includes `apiKey` in the settings object written to disk
2. `src/tts.ts:118` — `saveTTSConfig()` writes entire config including `apiKey` to disk
3. `src/viewer.ts:591` — POST endpoint passes keys through to the broken save functions

**Expected:** Strip `apiKey` fields before writing to disk. Store only `hasKey: true` flag (matching the Swift app's behavior). Optionally save to Keychain via `security` CLI.
