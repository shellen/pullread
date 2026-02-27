# Viewer Architecture Notes

Recurring patterns, known pitfalls, and design principles for the PullRead viewer (the HTML/CSS/JS single-page app embedded via `embed-viewer.ts`).

## Search Parser: Quoting Values with Spaces

**This bug has recurred multiple times. Read this before touching search.**

The search parser in `filterFiles()` splits queries into terms using this regex:

```js
const terms = group.match(/\S+:"[^"]*"|"[^"]*"|\S+/g) || [];
```

This means **unquoted values with spaces get split into separate AND terms**:

- `feed:NPR News Now` → terms: `feed:NPR`, `News`, `Now` (BROKEN)
- `feed:"NPR News Now"` → terms: `feed:"NPR News Now"` (CORRECT)

**Rule:** Any code that programmatically sets `search.value` with a prefix operator (`feed:`, `tag:`, `domain:`, `author:`) MUST quote the value:

```js
// WRONG — breaks for values with spaces
search.value = 'feed:' + source;

// CORRECT — always quote
search.value = 'feed:"' + source + '"';

// In inline onclick attributes, use \x22 for the double quote
'search.value=\'feed:\\x22' + escapeJsStr(name) + '\\x22\''
```

The filter handlers must strip quotes when extracting the value:

```js
const feedQ = tl.slice(5).replace(/^"(.*)"$/, '$1');
```

The `author:` operator was the only one that originally got this right. All others (`feed:`, `tag:`, `domain:`) were fixed in Feb 2026 after the bug was discovered for the third time.

## Web Components

The viewer uses one web component: `<pr-player>` (defined in `07-tts-player.js`). It's a custom element for the TTS audio player that supports expanded and mini display modes.

When building new self-contained UI widgets, prefer web components (`class extends HTMLElement` + `customElements.define`) over raw DOM manipulation. Benefits:
- Encapsulated lifecycle (connectedCallback, disconnectedCallback)
- Clean attribute-based API
- Can be placed anywhere in the DOM without wiring

## User Feedback: No Browser Chrome

**Do not use `alert()`, `confirm()`, or `prompt()`.** Use in-app feedback instead:

- **Errors/success:** Use `showToast(message, isError)` — the existing toast system
- **Confirmations:** Build an in-app modal or confirmation dialog
- **Information:** Use inline UI (status text, badges, banners)

Browser alerts block the main thread, look inconsistent across platforms, can't be styled, and break the app's visual flow. As of Feb 2026 there are ~19 legacy `alert()`/`confirm()` calls remaining across 7 files that should be migrated to in-app alternatives over time.

## Build Pipeline

`scripts/embed-viewer.ts` reads the viewer sources and produces a single `src/viewer-html.ts` module:

1. **Fonts** — reads woff2 from `@fontsource/*`, encodes as base64 `@font-face` rules
2. **Icons** — reads SVGs from `heroicons/24/{outline,solid}/`, generates `<symbol>` elements injected at `<!-- INJECT:ICONS -->`
3. **CSS** — fonts + `viewer.css` injected at `/* INJECT:CSS */`
4. **JS** — all `viewer/*.js` files concatenated in sort order, injected at `/* INJECT:JS */`

Brand icons (bluesky, threads, linkedin, mastodon, facebook) and custom icons (headphones, keyboard, magic-hat) are kept inline in `viewer.html` since they're not from Heroicons.
