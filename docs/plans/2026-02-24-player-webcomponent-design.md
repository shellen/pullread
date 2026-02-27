# Player WebComponent Design

## Problem

The podcast/TTS player is a full-width fixed bottom bar that spans the entire viewport. It should only span the reading pane, with the ability to minimize into a compact widget at the sidebar bottom and expand back. The player's DOM and state are tangled with article rendering globals, meaning navigating articles can disrupt the listening experience.

## Approach

Refactor the player into a custom element `<pr-player>` with two visual modes:

- **Expanded**: Full player spanning the reading pane (content area), showing artwork, title/status, transport controls, progress bar, speed, queue, close.
- **Mini**: Compact widget at sidebar bottom showing play/pause, truncated title, thin progress bar, and an expand arrow.

A single `<pr-player>` element exists at all times. It moves between two mount points depending on mode. Audio playback is uninterrupted during transitions.

## Architecture

### Inside the WebComponent

- **DOM**: All player chrome — artwork, title, status, controls, progress bar, queue list, speed popup. Built in `connectedCallback`, updated via internal `render()`.
- **State**: `queue`, `currentIndex`, `playing`, `speed`, `provider`, `generating`, `chunkSession`. Move from global variables to component properties.
- **Audio elements**: `HTMLAudioElement` and `SpeechSynthesisUtterance` references become component properties.
- **Server API calls**: TTS endpoints (`/api/tts/start`, `/api/tts/chunk/...`, `/api/tts-settings`) stay inside the component.

### Outside the WebComponent

- `addCurrentToTTSQueue()` / `playNextFromArticle()` — read `activeFile`/`allFiles`, call `player.enqueue(item)`.
- `updateSidebarAudioIndicators()` — listens to custom events from the component.
- Listen button loading animation — tied to article action buttons, not the player.

### Event-based Communication

The component fires custom events:
- `pr-player:queue-change` — queue modified (sidebar indicators update)
- `pr-player:now-playing` — track changed (sidebar highlighting)
- `pr-player:stopped` — playback ended

The app calls public methods: `player.enqueue(item)`, `player.playNext(item)`, `player.stop()`.

## Layout

### Expanded (desktop)

Positioned as a flex child at the bottom of `#content-pane` (not `position: fixed`). Width fills the content area between sidebar and margin notes. Content scrolls above it.

```
┌─────────┬──────────────────────────────────────┬────────┐
│ sidebar │  reading pane                        │ margin │
│         │  [article content...]                │        │
│         ├──────────────────────────────────────┤        │
│         │  ▶ Title · Playing   ◁15 ▶ 15▷  ─●─ 1x ✕    │
│         └──────────────────────────────────────┘        │
└─────────┘                                      └────────┘
```

### Mini (desktop)

`position: sticky; bottom: 0` inside the sidebar. Thin progress bar under the title. Expand arrow (↗) pops it back to reading pane.

```
┌─────────┬──────────────────────────────────────┐
│ [items] │  reading pane                        │
│         │  [article fills full height]         │
│ ▶ Title │                                      │
│ ──●── ↗ │                                      │
└─────────┴──────────────────────────────────────┘
```

### Mobile (<=750px)

Fixed bottom bar, current behavior. Media query forces `position: fixed; left: 0; right: 0; bottom: 0` regardless of mode attribute. Minimize/expand toggle hidden.

## Migration Strategy

Incremental — no big-bang rewrite. Each step is independently buildable and testable.

1. **Create `07-tts-player.js`** — WebComponent class with DOM template and render logic. Move `renderAudioPlayer()`, speed popup, queue rendering, mini mode rendering into the component.

2. **Refactor `07-tts.js`** — Playback logic stays initially but references the component instead of `document.getElementById`. Global state variables become component properties.

3. **Wire up events** — Replace direct DOM queries with component internal refs. Replace `updateSidebarAudioIndicators()` calls with custom events.

4. **Move playback state into component** — Migrate `ttsQueue`, `ttsPlaying`, `ttsAudio`, etc. into component properties. Remaining `07-tts.js` code becomes thin wrappers calling `player.enqueue(item)`.

5. **Add minimize/expand** — Mode toggle and mount-point switching.

## Decisions

- **No Shadow DOM** — regular custom element so CSS variables (`var(--bg)`, `var(--muted)`) flow through naturally without duplicating the theme system.
- **No other WebComponents yet** — player is the pilot. Evaluate the pattern before applying elsewhere.
- **No TTS API changes** — server endpoints and playback strategies (browser TTS, cloud chunking, podcast enclosure, cached) unchanged.
- **Mobile unchanged** — full-width fixed bar on mobile, same as current.
