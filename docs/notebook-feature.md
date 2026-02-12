# PullRead Notebook & Notes

PullRead's notebook is a synthesis writing surface built into the reader. It gives you a place to think through what you've read — pull in highlights, write notes, and develop ideas — without leaving the app.

## How It Works

### One Notebook, Many Notes

Everything lives in a single shared notebook. Each note is its own document with a title, markdown content, and an optional link back to a source article. Notes appear as individual items in the sidebar, just like articles do — click one to open it full-page.

The data model is flat: a notebook object contains an array of notes.

```
notebook
├── notes[]
│   ├── note { id, content, sourceArticle, createdAt, updatedAt }
│   ├── note { id, content, sourceArticle, createdAt, updatedAt }
│   └── ...
├── sources[]    (filenames of referenced articles)
├── tags[]       (notebook-level tags)
└── timestamps
```

Notes are stored in `~/.config/pullread/notebooks.json` and persisted via a simple REST API (`GET`/`POST`/`DELETE` on `/api/notebooks`). All reads and writes go through this single file — no database, no sync layer.

### The Editor

Each note opens as a full-page editor styled like the article reading view — same header, same byline area, same action bar. The title is an editable input that stays in sync with the first `# heading` line of the note's markdown content. Edit the title, the content updates. Edit the first line in the body, the title updates. The sidebar item title updates in real-time too.

The editor is a plain `<textarea>` with markdown. Action buttons across the top provide:

- **Preview / Edit** — Toggle between the textarea and rendered markdown (via `marked.parse`). Preview mode also renders diagrams and applies syntax highlighting.
- **Focus** — Full-screen distraction-free writing mode (described below).
- **Insert Highlights** — Opens a picker showing all your highlights from all articles, grouped by date and source. Check the ones you want and they're inserted as markdown blockquotes at your cursor position.
- **Grammar** — On-device grammar checking using macOS NSSpellChecker. Results appear inline with one-click fixes.
- **Export** — Download as `.md` (with YAML frontmatter) or `.pdf` (rendered markdown in a print-optimized layout).
- **Delete** — Removes the note and opens the next one (or an empty state).

### Auto-Save

Every edit triggers a debounced save (800ms). A small "Saving..." → "Saved" hint in the action bar confirms persistence. The save handler checks both the regular editor textarea and the focus mode textarea, so content is never lost when switching between modes.

### Tags

Tags live at the notebook level (shared across all notes). Type in the tag input and press Enter to add. After you've written a couple of paragraphs, the app suggests tags using AI — they appear as dismissable pills below the editor. Suggestions are throttled to 10 seconds after input stops and require at least two substantial paragraphs.

---

## Focus Mode

Focus mode is a full-screen writing overlay inspired by iA Writer. It strips away the sidebar, the toolbar, the article list — everything except your words and a word count.

### Sentence Highlighting

The key feature is sentence-level focus. As you type, everything outside your current sentence is dimmed to 30% opacity. The sentence you're working on stays at full brightness. This is done with a single absolutely-positioned `<div>` whose height adjusts dynamically to cover the sentence's line span, combined with a CSS `box-shadow` trick:

```css
box-shadow:
  0 -3px 0 0 var(--bg),        /* solid strip above */
  0  3px 0 0 var(--bg),        /* solid strip below */
  0  0   0 9999px               /* massive overlay covering everything else */
    color-mix(in srgb, var(--bg) 70%, transparent);
```

The overlay element is transparent (so the sentence shows through), while its enormous shadow covers the rest of the textarea with a semi-transparent wash of the background color. The position and height update on every keystroke, click, and scroll event, with a 120ms CSS transition for smooth movement.

### Sentence Detection

Sentence boundaries are found by scanning backward and forward from the cursor position:

- **Start**: the character after the nearest `.` `!` `?` (followed by whitespace), or after a paragraph break (`\n\n`), or the start of the text.
- **End**: the next `.` `!` `?` (followed by whitespace or end-of-text), or the next paragraph break, or the end of the text. Trailing quotes and closing parens are included in the sentence.

The character positions are converted to line numbers, and those line numbers determine the highlight element's `top` and `height`.

### Vertical Centering

The textarea has `padding-top: 45vh` and `padding-bottom: 45vh` — nearly half the viewport of empty space above the first line and below the last. This means even when you're writing the very first sentence, it sits in the middle of the screen, not jammed against the top.

As you type, a scroll-centering function keeps the cursor line vertically centered:

```
cursorY = paddingTop + cursorLine × lineHeight
scrollTop = cursorY − visibleHeight / 2 + lineHeight / 2
```

The visible height is measured from the parent container (not the textarea's `clientHeight`, which includes the padding and would be far too large). The textarea's native scrollbar is hidden — scrolling is managed entirely by JavaScript in response to input, clicks, and arrow keys.

### The Overlay

The overlay structure:

```
┌──────────────────────────────────┐
│  Exit Focus    Note Title    42w │  ← toolbar (hidden, shows on hover)
├──────────────────────────────────┤
│                                  │
│                                  │  ← 45vh padding (empty space)
│                                  │
│  The dimmed text above appears   │  ← dimmed (70% background overlay)
│  at reduced opacity.             │
│                                  │
│  ▸ This sentence is fully        │  ← HIGHLIGHTED (full brightness)
│    visible and crisp. ◂          │
│                                  │
│  More dimmed content below       │  ← dimmed
│  continues here.                 │
│                                  │
│                                  │  ← 45vh padding (empty space)
│                                  │
└──────────────────────────────────┘
```

On exit, the overlay syncs content back to the note object, triggers a save, removes itself from the DOM, and refreshes the inline editor so it shows the updated content.

---

## Article → Notebook Pipeline

Notes don't have to start from scratch. The "Write About This" button in the article share menu creates a new note pre-filled with context from the current article:

1. A heading: `## Notes on: Article Title`
2. All your highlights as blockquotes: `> highlighted text`
3. Any highlight annotations in italics
4. Your article-level notes

The note's `sourceArticle` field links back to the original, and the article is added to the notebook's `sources` list. The sidebar switches to the Notebook tab and opens the new note.

You can also insert highlights from any article into any note at any time via the Insert Highlights picker — a modal that shows all your highlights across all articles, searchable and grouped by date. Selected highlights are inserted as blockquotes at the cursor position.

---

## Sidebar Integration

The Notebook tab in the sidebar shows:

1. **+ New Note** button
2. Individual notes — each showing the first line as a title (stripped of `#` markdown), the last-modified date, and the source article's domain if linked
3. **Annotated Articles** — articles that have highlights or notes, shown below the notes list

Notes are filterable by the search bar (matches against note content). The active note is highlighted in the sidebar, and the count shows total notes.

---

## Grammar Checking

Grammar checking runs entirely on-device using macOS NSSpellChecker — no data leaves the machine. Click "Grammar" and the results panel appears below the editor showing up to 10 suggestions, each with:

- The error in context (highlighted in the surrounding text)
- A description of the issue
- Up to 3 one-click replacement buttons

Applying a fix does a direct string replacement in the textarea and triggers a save. The grammar panel is removed after any edit (since the character offsets are now stale).

---

## Data Storage

All notebook data lives in `~/.config/pullread/notebooks.json` — a single JSON file keyed by notebook ID. The current model uses one notebook (`nb-shared`) containing all notes. The API is three endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/notebooks` | Load all notebooks (or one by `?id=`) |
| `POST` | `/api/notebooks` | Create or update a notebook |
| `DELETE` | `/api/notebooks?id=` | Remove a notebook |

The server merges incoming data with existing records, preserving `createdAt` and auto-updating `updatedAt`. The same `loadJsonFile`/`saveJsonFile` pattern is used for highlights, article notes, and the save inbox.

Legacy migration handles two cases automatically:
- **Content blob → notes**: Old notebooks with a single `content` field get split on `---` separators into discrete note objects.
- **Multiple notebooks → single**: If multiple old-style notebooks exist, their content, sources, and tags are merged into the single shared notebook, and the old records are deleted.

---

## Export

Two export formats:

**Markdown** — Downloads a `.md` file with YAML frontmatter (title, type, dates, tags, sources) followed by all notes concatenated with `---` separators.

**PDF** — Opens a new window with the notebook rendered as clean HTML (Georgia serif, 700px max-width, styled blockquotes and code blocks), then triggers `window.print()` for the browser's native print-to-PDF.
