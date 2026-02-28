# Web Presence Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update all site pages to match the app's warm terracotta design system, extract shared CSS, and refresh content for v0.4.0 features.

**Architecture:** Extract shared styles (tokens, nav, footer, buttons, accessibility) into `site/shared.css`. Replace index.html with the provided prototype adapted for actual features. Restyle all sub-pages to link shared.css and use page-specific inline styles only. Refresh FAQ and releases content for v0.4.0.

**Tech Stack:** Static HTML + CSS, Google Fonts (Instrument Serif + Work Sans), GitHub Pages deployment (no build step).

---

### Task 1: Create `site/shared.css`

**Files:**
- Create: `site/shared.css`

**Step 1: Create the shared CSS file**

Extract all common styles from the prototype into `site/shared.css`. This includes:

```css
/* ABOUTME: Shared design tokens, nav, footer, buttons, and accessibility styles
/* ABOUTME: for the pullread.com marketing site. */

/* ═══ DESIGN TOKENS (from viewer.css — source of truth) ═══ */
:root {
  --paper: #faf8f4;
  --paper-warm: #f3efe8;
  --paper-deep: #ece6db;
  --card: #ffffff;
  --ink: #1c1917;
  --ink-secondary: #57534e;
  --ink-muted: #736d67;
  --ink-faint: #d6d3d1;
  --accent: #b45535;
  --accent-hover: #9c4529;
  --accent-bg: #fef2ee;
  --border: #e7e1d8;
  --border-light: #f0ece5;
  --shadow-sm: 0 1px 2px rgba(28,25,23,0.04);
  --shadow-md: 0 2px 8px rgba(28,25,23,0.08);
  --radius: 10px;
  --radius-lg: 16px;
  --font-display: 'Instrument Serif', Georgia, 'Times New Roman', serif;
  --font-body: 'Work Sans', -apple-system, BlinkMacSystemFont, sans-serif;
}
```

Include these sections from the prototype:
- Reset (`*, *::before, *::after { box-sizing... }`)
- Base body styles (font-family, background, color, line-height)
- Accessibility: `.skip-link`, `.sr-only`, `:focus-visible`, `@media (prefers-reduced-motion)`, `@media (prefers-contrast: high)`, `::selection`
- Nav: fixed, glass blur (`rgba(250,248,244,0.9)`), `.nav-brand` with `.nav-logo` (terracotta square + book SVG) and `.nav-wordmark` (Instrument Serif), `.nav-links`
- Buttons: `.btn`, `.btn-accent`, `.btn-dark`, `.btn-outline`, `.btn-sm`, `.dl-icon`
- Footer: border-top, flex layout, `.f-left`, `.f-links`
- Page header component (for sub-pages):
  ```css
  .page-header {
    padding: clamp(110px, 13vw, 140px) clamp(16px, 4vw, 40px) 48px;
    text-align: center;
    max-width: 700px;
    margin: 0 auto;
  }
  .page-header h1 {
    font-family: var(--font-display);
    font-size: clamp(32px, 5vw, 52px);
    font-weight: 400;
    letter-spacing: -0.03em;
    line-height: 1.08;
    margin-bottom: 12px;
  }
  .page-header p {
    font-size: clamp(16px, 2vw, 18px);
    color: var(--ink-secondary);
    line-height: 1.6;
  }
  ```
- Scroll reveal: `.reveal` opacity/transform transition, `.reveal.vis` visible state
- Responsive: `@media (max-width: 900px)` and `@media (max-width: 480px)` for nav-links hiding, page-header padding, footer stacking

**Step 2: Verify the file loads in a browser**

Open `site/shared.css` in browser dev tools to confirm no syntax errors.

**Step 3: Commit**

```bash
git add site/shared.css
git commit -m "feat: add shared CSS for site-wide design tokens and components"
```

---

### Task 2: Replace `site/index.html` with adapted prototype

**Files:**
- Replace: `site/index.html`

**Step 1: Adapt the prototype HTML**

Start from the provided prototype HTML. Make these changes:

1. **Add `<link rel="stylesheet" href="/shared.css">` in `<head>`** and remove any styles that are now in shared.css (keep page-specific styles like hero, showcase, features grid, AI section, markdown section, sources, CTA, trust bar, creator strip, and the full app mockup inline).

2. **Replace example sources in the app mockup** with indie publications that have full-content RSS feeds. Use these instead of the SFist-heavy list:

   Sidebar article list (replace SFist articles):
   - "How Do You Know What You Know?" — kottke.org
   - "The Internet Archive Just Got Bigger" — 404media.co
   - "Walking and Thinking in Yakushima" — craigmod.com
   - "New Downtown Mural Honors Watsonville's Farmworkers" — lookoutlocal.com (Lookout Santa Cruz)
   - "Why Every Museum Is Starting to Look the Same" — hyperallergic.com
   - "The Hidden Costs of Streaming Music" — thebaffler.com
   - "A Beginner's Guide to Birdwatching in the East Bay" — berkeleyside.org
   - "Behind the Blog: Using Your Brain" — 404media.co

   Sources drawer list (replace with these feeds):
   - Podcasts (media type, keep)
   - kottke.org
   - 404 Media
   - Craig Mod
   - Lookout Santa Cruz
   - Hyperallergic
   - BrooklynVegan
   - The Markup
   - Berkeleyside
   - Longreads
   - Daring Fireball
   - Lifehacker (keep, full RSS)
   - Stereogum (keep, full RSS)

   Reading pane article (replace DoorDash/SFist):
   - Use a kottke.org or Craig Mod article as the featured reading pane example

   Update the colored letter squares with appropriate colors for each source.

3. **Update the AI section model names** to match current implementation:
   - Apple Intelligence → `on-device` (keep as-is)
   - Anthropic → `claude-haiku-4-5-20251001` (default model)
   - OpenAI → `gpt-5-nano`
   - Gemini → `gemini-2.5-flash`
   - OpenRouter → `deepseek/deepseek-r1` (keep)

4. **Update the integrations/sources pills** to match implemented imports:
   - Keep: Instapaper, Pinboard, Raindrop.io, Feedbin, Blogs, Substack, Ghost, Mastodon, Hacker News, YouTube, Podcasts, Any RSS / Atom / JSON Feed
   - Add: Pocket, Buttondown, Beehiiv (if in prototype, verify if actually implemented)
   - Remove any that aren't implemented

5. **Update features section** to reflect actual v0.4.0:
   - Summaries feature: mention Apple Intelligence on supported Macs (not "macOS 26+" — it works on Sonoma+ with compatible hardware)
   - Add or adjust features for: Knowledge graph / Related Reading, For You dashboard, Magic sort
   - Keep existing accurate features: highlights, TTS, YouTube & podcasts, Obsidian-native, search operators, notebooks, export & share

6. **Update meta description and OG tags** to match prototype copy

7. **Keep the Google Fonts link** for Instrument Serif + Work Sans

**Step 2: Verify the page renders correctly**

Open `site/index.html` in a browser. Check:
- Nav renders with terracotta logo and Instrument Serif wordmark
- Hero section displays properly
- App mockup shows indie publication content
- All sections scroll and reveal properly
- Footer matches design
- Mobile responsive (resize to 480px)

**Step 3: Commit**

```bash
git add site/index.html
git commit -m "feat: replace homepage with warm terracotta design and indie source content"
```

---

### Task 3: Update `site/faq.html`

**Files:**
- Modify: `site/faq.html`

**Step 1: Link shared.css and update structure**

1. Add `<link rel="stylesheet" href="/shared.css">` in `<head>`
2. Add Instrument Serif to the Google Fonts link: `family=Instrument+Serif:ital@0;1&family=Work+Sans:wght@300;400;500;600;700`
3. Remove all styles that are now in shared.css (nav, footer, buttons, reset, base body)
4. Keep page-specific FAQ styles inline but update:
   - `.faq-section-title` border-bottom color: `var(--accent)` (was teal)
   - `.faq-answer a` color: `var(--accent)` (was teal)
   - `.faq-toc a:hover` border/color/bg: use `var(--accent)` and `var(--accent-bg)` (was teal/teal-subtle)
   - `.page-header h1` use `var(--font-display)`, `font-weight: 400` (was 800)
   - All color variables mapped: `--fg` → `var(--ink)`, `--body` → `var(--ink-secondary)`, `--muted` → `var(--ink-muted)`, etc.
5. Replace nav HTML with the prototype nav (book icon logo, Instrument Serif wordmark, terracotta download button)
6. Replace footer HTML with prototype footer
7. Add skip-link before nav: `<a href="#main-content" class="skip-link">Skip to content</a>`
8. Add `id="main-content"` to the page header or FAQ content container

**Step 2: Update FAQ content for v0.4.0**

Review and update these sections:

**Getting Started:**
- "What is Pull Read?" — add mention of knowledge graph / related reading features
- Keep installation, storage, offline answers as-is (still accurate)

**Feeds & Content:**
- Add mention of browser bookmarks import
- Podcasts answer — mention inline audio player with seeking and auto-advance
- Keep other answers (still accurate)

**Reading & Highlights:**
- "How do I browse by source or tag?" — mention For You dashboard and Magic Sort
- Search operators — add `before:*` operator if not listed
- TTS providers list — update to 4 providers:
  - Apple (built-in) — works offline, macOS system voices
  - Google (built-in) — browser-based Web Speech API, works on all platforms
  - OpenAI — premium neural voices (API key required)
  - ElevenLabs — high-quality neural voices (API key required)

**AI Features:**
- Add Apple Intelligence on supported Macs (Sonoma+ with Apple Silicon or M-series)
- Update provider list with current model names
- Add mention of auto-generated daily/weekly reviews on For You dashboard
- Add mention of knowledge graph: related reading suggestions and topic clusters

**Data & Privacy:**
- Annotations answer — mention .annot.json sidecar files (not just JSON in config)
- Keep other answers (still accurate)

**Obsidian:**
- Update frontmatter example to include tags, summary, summaryProvider, summaryModel fields
- Keep other answers (still accurate)

**Troubleshooting:**
- Keep as-is (still accurate)

**Step 3: Verify in browser**

Open FAQ page. Check styling, links, content accuracy.

**Step 4: Commit**

```bash
git add site/faq.html
git commit -m "feat: update FAQ with terracotta design and v0.4.0 content"
```

---

### Task 4: Update `site/releases.html`

**Files:**
- Modify: `site/releases.html`

**Step 1: Link shared.css and update structure**

Same process as FAQ:
1. Add `<link rel="stylesheet" href="/shared.css">` and Instrument Serif font
2. Remove duplicated styles
3. Update inline page-specific styles:
   - `.release-card li::before` background: `var(--accent)` (was teal)
   - `.release-subtitle` color: `var(--accent)` (was teal)
   - `.page-header h1` uses Instrument Serif, weight 400
4. Replace nav and footer HTML
5. Add skip-link and main content landmark

**Step 2: Add v0.4.0 release card**

Add as the first release card:

```html
<div class="release-card reveal" id="v0.4.0">
  <div class="release-header">
    <span class="release-version">0.4.0</span>
    <span class="release-subtitle">"Connecting the dots"</span>
  </div>
  <div class="release-date">February 2026</div>
  <ul>
    <li>Knowledge graph — Related Reading suggestions on every article</li>
    <li>Your Topics — see what you read about most, powered by auto-tagging</li>
    <li>Topic Clusters in the Tags tab — browse related tags together</li>
    <li>For You dashboard with Daily Rundown, continue reading, and reviews</li>
    <li>Redesigned audio player with Apple Music-style miniplayer</li>
    <li>Three-state API key fields — see what's saved without exposing secrets</li>
    <li>Auto-save on all settings — no more Save buttons</li>
    <li>Browser TTS seeking and auto-advance to next article</li>
    <li>Fixed Substack empty article bodies</li>
    <li>XKCD comic strip rendering with hover-text captions</li>
  </ul>
</div>
```

**Step 3: Verify in browser**

Check release card renders, deep-link anchor works (#v0.4.0).

**Step 4: Commit**

```bash
git add site/releases.html
git commit -m "feat: update releases page with terracotta design and v0.4.0 notes"
```

---

### Task 5: Update `site/privacy.html`

**Files:**
- Modify: `site/privacy.html`

**Step 1: Link shared.css and update structure**

1. Add `<link rel="stylesheet" href="/shared.css">` and Instrument Serif font
2. Remove all inline styles (privacy uses minimal styles that will be in shared.css)
3. Keep page-specific content styles inline:
   ```css
   .container { max-width: 680px; margin: 0 auto; padding: 100px clamp(16px, 4vw, 40px) 80px; }
   h1 { font-family: var(--font-display); font-size: clamp(28px, 4vw, 36px); font-weight: 400; letter-spacing: -0.025em; margin-bottom: 8px; }
   .updated { font-size: 14px; color: var(--ink-muted); margin-bottom: 40px; }
   h2 { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; margin: 36px 0 12px; color: var(--ink); }
   p, ul { font-size: 15px; color: var(--ink-secondary); margin-bottom: 16px; line-height: 1.7; }
   ul { padding-left: 20px; }
   li { margin-bottom: 6px; }
   a { color: var(--accent); text-decoration: none; }
   a:hover { text-decoration: underline; }
   .back { display: inline-block; margin-bottom: 32px; font-size: 14px; font-weight: 500; color: var(--ink-muted); }
   .back:hover { color: var(--ink); text-decoration: none; }
   ```
4. Replace nav HTML with prototype nav (full nav with links, not just brand)
5. Add footer
6. Add skip-link

**Step 2: Verify in browser**

**Step 3: Commit**

```bash
git add site/privacy.html
git commit -m "feat: update privacy page with terracotta design"
```

---

### Task 6: Update `site/terms.html`

**Files:**
- Modify: `site/terms.html`

**Step 1: Same process as privacy.html**

Identical structure — link shared.css, update inline styles to use design tokens, replace nav/footer, add skip-link.

**Step 2: Verify in browser**

**Step 3: Commit**

```bash
git add site/terms.html
git commit -m "feat: update terms page with terracotta design"
```

---

### Task 7: Update `site/link.html`

**Files:**
- Modify: `site/link.html`

**Step 1: Link shared.css and update structure**

1. Add `<link rel="stylesheet" href="/shared.css">` and Instrument Serif font
2. Remove duplicated styles (nav, footer, buttons, reset)
3. Keep page-specific styles inline (link-card, spinner, loading states)
4. Update spinner color: `border-top-color: var(--accent)` (was teal)
5. Replace inline SVG logo icons (3 occurrences) with the terracotta book icon from prototype
6. Replace nav and footer HTML
7. Replace `.btn-teal` references with `.btn-accent`

**Step 2: Verify in browser**

Test with a URL parameter: `link.html?url=https://example.com&title=Test`

**Step 3: Commit**

```bash
git add site/link.html
git commit -m "feat: update link page with terracotta design"
```

---

### Task 8: Final verification and commit

**Step 1: Cross-page verification**

Open each page and verify:
- [ ] Nav looks identical across all pages (logo, wordmark, links, download button)
- [ ] Footer looks identical across all pages
- [ ] Accent color is consistent terracotta (#b45535) everywhere
- [ ] No remaining teal (#2a9d8f) references
- [ ] Instrument Serif loads for all headlines
- [ ] Mobile responsive works on all pages (resize to 480px)
- [ ] All internal links work (/, /faq, /releases, /privacy, /terms)
- [ ] Download button links are correct

**Step 2: Search for leftover old tokens**

```bash
grep -r "2a9d8f\|teal\|e76f51" site/ --include="*.html" --include="*.css"
```

Should return zero matches (no old teal/orange references remaining).

**Step 3: Final commit if any cleanup needed**

```bash
git add site/
git commit -m "chore: final cleanup for web presence refresh"
```
