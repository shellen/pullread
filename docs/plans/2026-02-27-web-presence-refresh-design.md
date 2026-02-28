# Web Presence Refresh Design

## Goal

Update all site pages (index, FAQ, releases, privacy, terms, link) to match the app's actual design system — warm terracotta palette, Instrument Serif display font, refined typography — and refresh content to reflect current v0.4.0 features.

## Design Decisions

1. **Replace homepage** with the provided prototype, adapted for actual features and appropriate example content
2. **Shared CSS file** (`site/shared.css`) for common tokens, nav, footer, buttons, accessibility
3. **Visual + content refresh** for all sub-pages
4. **Colored letter squares** for source icons (matching app behavior, no image files)
5. **Example sources**: indie/small publications with full-content RSS feeds

## Design Tokens (from viewer.css — source of truth)

```css
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
```

Typography:
- Display: `Instrument Serif` (headlines, nav wordmark)
- Body: `Work Sans` (everything else)

## File Changes

### New: `site/shared.css`
- CSS custom properties (design tokens)
- Reset & base typography
- Nav component (fixed, glass blur, Instrument Serif wordmark, book icon logo, terracotta download button)
- Footer component
- Button variants (`.btn-accent`, `.btn-dark`, `.btn-outline`, `.btn-sm`)
- Page header component (for sub-pages)
- Accessibility: skip-link, sr-only, focus-visible, reduced-motion, high-contrast
- Scroll reveal animation
- Responsive breakpoints

### Replace: `site/index.html`
Based on prototype with adaptations:
- Example sources: Kottke, 404 Media, Craig Mod, Longreads, Hyperallergic, BrooklynVegan, The Markup, Berkeleyside, Lookout Santa Cruz, etc.
- Features verified against actual implementation
- AI model names current
- Integrations pills matched to implemented sources
- Colored letter squares for source icons

### Update: `site/faq.html`
- Link shared.css, remove duplicated styles
- Nav/footer match homepage
- Section title borders: terracotta
- TOC pills: terracotta hover
- Link colors: terracotta
- Content review for v0.4.0 accuracy

### Update: `site/releases.html`
- Link shared.css, remove duplicated styles
- Nav/footer match homepage
- Release bullet dots: terracotta
- Add v0.4.0 release card (if features are shipping)

### Update: `site/privacy.html`
- Link shared.css, remove duplicated styles
- Nav match homepage
- Link colors: terracotta
- Content unchanged (legal)

### Update: `site/terms.html`
- Same as privacy.html

### Update: `site/link.html`
- Link shared.css, remove duplicated styles
- Nav/footer match homepage
- Spinner color: terracotta
- Logo: book icon
