# Unified Video Playback Design

## Problem

YouTube videos are orphaned from the playback system. They render as bare `<iframe>` embeds in the article body with no connection to the queue, player bar, mini player, popout system, speed controls, or auto-advance. Podcast video enclosures have full integration; YouTube has none.

## Goal

Make YouTube a first-class video source: queue integration, player bar controls, inline playback with popout option, auto-popout on navigate, speed control, and queue advancement on video end.

## Approach

**Approach A: YouTube as a Queue Item Type.** Add a new playback path in the existing router alongside browser TTS, cloud TTS, podcast audio, and video popout. The YouTube IFrame API provides the programmatic control needed for full integration.

Fallback plan: if the YouTube IFrame API proves problematic, retreat to Approach B (unified `<pr-video>` component) or C (postMessage bridge) without structural changes — Approach A is additive.

## Design

### Queue Item & Routing

Queue item gets a new optional field:

```js
{
  filename: '2026-03-01-some-youtube-video.md',
  title: 'Video Title',
  domain: 'youtube.com',
  image: 'https://img.youtube.com/vi/{id}/hqdefault.jpg',
  youtubeVideoId: 'dQw4w9WgXcQ',
}
```

Router branch order in `07-tts.js`:

```
if item.youtubeVideoId       → playYouTube()         // NEW
if item.enclosureUrl + video → playVideoPopout()      // existing
if item.enclosureUrl + audio → playPodcastAudio()     // existing
if cloud TTS cached          → playCloudTTSCached()   // existing
...
```

Detection: when building a queue item from an article, check if `domain` matches `youtube.com|youtu.be|m.youtube.com`. If so, extract video ID from the URL and set `youtubeVideoId`.

### Video ID Extraction

New helper `extractYouTubeVideoId(url)` handles all URL patterns:

- `youtube.com/watch?v={id}`
- `youtube.com/shorts/{id}`
- `youtube.com/embed/{id}`
- `youtu.be/{id}`
- `m.youtube.com/watch?v={id}`

### Inline Playback

When `playYouTube()` fires and the article is displayed:

1. **Load YouTube IFrame API on demand** — inject `<script src="https://www.youtube.com/iframe_api">` if not loaded. Cache the `YT` global.
2. **Replace bare iframe** — swap the existing `<iframe>` with a `YT.Player` instance in the same container.
3. **Wire events:**
   - `YT.PlayerState.PLAYING` → `ttsPlaying = true`, `renderAudioPlayer()`
   - `YT.PlayerState.PAUSED` → `ttsPlaying = false`, `renderAudioPlayer()`
   - `YT.PlayerState.ENDED` → `autoplayNext()`
   - `onPlaybackRateChange` → sync speed display
4. **Progress tracking:** Poll `getCurrentTime()`/`getDuration()` at 250ms intervals (YouTube API has no continuous progress event).
5. **Thumbnail:** Auto-derived from `https://img.youtube.com/vi/{id}/hqdefault.jpg`.

### Shorts & Vertical Video

- `youtube.com/shorts/{id}` URL pattern supported in video ID extraction.
- After `onReady`, detect vertical video and apply 9:16 aspect ratio container with `max-height: 80vh`, centered.
- Standard videos use responsive 16:9 container.

### Popout

**Manual popout** (user clicks "Pop out"):
- Blob HTML window — 960x640 for landscape, 400x700 for vertical/Shorts.
- Contains a `YT.Player` instance.
- Pop-back-in button calls `window.opener._videoPopIn(currentTime)`.
- Player bar shows "Playing in popout" indicator.

**Auto-popout on navigate:**
- When user navigates away from an article with an active inline YouTube player:
  1. Grab `ytPlayer.getCurrentTime()`
  2. Destroy inline player
  3. Open popout window, create `YT.Player`, seek to saved time
  4. Playback continues in popout

**Pop-back-in:**
- Popout calls `window.opener._videoPopIn(currentTime)`
- Parent navigates to article, creates inline `YT.Player`, seeks to position
- Same flow as existing video pop-back-in.

### Player Bar & Mini Player

The `<pr-player>` component stays generic — it renders from queue state without knowing about YouTube. YouTube-specific logic lives in `07-tts.js`.

**Expanded bottom bar:** Artwork, title, transport (play/pause, ±15s skip), draggable progress bar, speed slider, video icon.

**Mini player:** Same compact display — thumbnail + title + play button + progress. No changes needed.

### Speed Slider

YouTube supports 8 rates: 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2x. When a YouTube item is active, constrain the speed slider to only show these 8 rates. When switching to a non-YouTube item, restore the full 15-preset slider.

### Error Handling

- **API load failure:** Fall back to bare `<iframe>`. Toast: "YouTube player controls unavailable."
- **Autoplay restrictions:** If `playVideo()` doesn't transition to `PLAYING` within 2s, show paused state. User tap triggers playback (browser allows user gesture).
- **Multiple YouTube embeds in one article:** Only the one matching the article's frontmatter URL gets wired to the queue. Others stay as bare iframes.

## Files Changed

| File | Change |
|------|--------|
| `viewer/07-tts.js` | `playYouTube()` path, API loader, progress polling, auto-popout |
| `viewer/07-tts-player.js` | Constrain speed slider for YouTube rates |
| `viewer/04-article.js` | Replace iframe with `YT.Player` container; Shorts URL handling; vertical CSS |
| `viewer/02-utils.js` | `extractYouTubeVideoId(url)` helper |
| `viewer.css` | Vertical video container, responsive YouTube sizing |
| `src/viewer-html.ts` | Rebuild |

**Not changed:** `feed.ts`, `writer.ts`, `index.ts`, `viewer.ts` — markdown pipeline untouched.

## Testing

- Unit test `extractYouTubeVideoId()` for all URL patterns including Shorts
- Manual: queue YouTube article, verify player bar, popout, auto-popout, pop-back-in, queue advance
- Fallback: block YouTube API script, verify bare iframe still works
- Shorts/vertical video renders at correct aspect ratio
