# Defuddle Integration

## Current Setup

PullRead uses Defuddle for article content extraction in `src/extractor.ts`.
We import the **core Defuddle class** (from `defuddle`, not `defuddle/node`) and
pair it with **linkedom** instead of jsdom.

### Why not `defuddle/node`?

The `defuddle/node` entry point depends on jsdom. When Bun compiles our CLI
binary (`bun build --compile`), jsdom's `xhr-sync-worker.js` gets a hardcoded
absolute path baked in from the build machine. On CI (GitHub Actions), that path
is `/Users/runner/work/...` which doesn't exist on end-user machines, causing an
immediate crash on import.

### linkedom compatibility

linkedom doesn't implement `getComputedStyle` or `matchMedia`, which Defuddle
uses for hidden-element detection and responsive layout evaluation. We stub these
in `stubBrowserApis()` so Defuddle's content scoring works. This means:

- Hidden elements styled via CSS `display:none` won't be detected (they'll be
  treated as visible). In practice this rarely matters for article extraction.
- Media query evaluation is a no-op. Defuddle handles this gracefully.

## Potential Upstream Issues for Defuddle

### 1. Export `toMarkdown` / `createMarkdownContent`

The `defuddle/node` wrapper calls an internal `toMarkdown()` function after
parsing, which has rich turndown rules for tables, math, callouts, footnotes,
etc. This function is not accessible outside `defuddle/node` because:

- It lives in `dist/markdown.js` which is not in the package `exports` map
- The core `defuddle` export doesn't include it

**Ask**: Either add a `defuddle/markdown` export, or make `toMarkdown` available
from the main `defuddle` entry point. This would let consumers who can't use
jsdom still get Defuddle's high-quality markdown conversion.

### 2. Support non-jsdom DOM implementations

The core Defuddle class accepts a `Document` but assumes browser-level APIs like
`getComputedStyle` and `matchMedia` exist on the document's window. A
lightweight compatibility mode or optional graceful fallback for these APIs would
make Defuddle work with linkedom, happy-dom, or other server-side DOM
implementations without requiring consumer-side stubs.

**Ask**: Either document the required window APIs, or add internal fallbacks so
Defuddle degrades gracefully when `getComputedStyle`/`matchMedia` are missing.

### Upstream Tracking

- **Issue #56** (Cloudflare Workers): Exact same problem — linkedom lacking
  `getComputedStyle` and `doc.styleSheets`. Open, unresolved.
  https://github.com/kepano/defuddle/issues/56
- **@nbbaier's linkedom fork**: Implements `styleSheets` and `getComputedStyle`
  for Defuddle compatibility. Worth watching.
  https://github.com/nbbaier/linkedom

### 3. Consider a `defuddle/linkedom` entry point

Similar to the existing `defuddle/node` wrapper but using linkedom instead of
jsdom. This would be a drop-in replacement for server-side/CLI usage where jsdom
is problematic (Bun compile, edge runtimes, etc.).
