# Magic Mixer Design

## Problem

Magic sort ranks articles using hardcoded weights (40% recency, 35% source engagement, 15% unread, 10% signals) with a fixed diversity cap of 3 per source. Users have no control over how ranking works — they can only toggle Magic on/off. This leads to frustrating patterns like too many news articles in a row or personal blogs buried under high-volume feeds.

## Goal

Give users interactive control over how Magic sort ranks their sidebar, with named presets for quick setup and advanced sliders for fine-tuning. Changes apply to the sidebar in realtime (debounced).

## Design

### Presets

5 named presets displayed as a pill group:

| Preset | Recency | Source | Unread | Signals | Diversity Cap |
|--------|---------|--------|--------|---------|--------------|
| **Balanced** (default) | 40 | 35 | 15 | 10 | 3 |
| **What's New** | 60 | 15 | 20 | 5 | 2 |
| **Deep Reading** | 15 | 50 | 10 | 25 | 4 |
| **Discovery** | 25 | 20 | 30 | 25 | 2 |
| **Custom** | (user values) | | | | |

Selecting a preset applies its weights immediately. "Custom" auto-activates when any slider is manually adjusted.

### Advanced Sliders (Algorithm Weights)

Revealed by an "Advanced" toggle below the presets. 4 algorithm weight sliders + 1 diversity slider:

| Slider | Label | Range | Default | Description |
|--------|-------|-------|---------|-------------|
| Recency | "Freshness" | 0–100 | 40 | How much newer articles are prioritized |
| Source Engagement | "Sources I read" | 0–100 | 35 | Boost feeds you interact with more |
| Unread | "Unread boost" | 0–100 | 15 | How much unread articles float up |
| Signals | "My activity" | 0–100 | 10 | Boost articles you've starred, highlighted, or annotated |
| Diversity | "Max per source" | 1–5 | 3 | Maximum articles from one feed before mixing in others |

Weights are **relative** — they don't need to sum to 100. The algorithm normalizes internally (divide each by the sum). This avoids a "must sum to 100" constraint.

### Tag Boosts (Content Mix)

Below the algorithm sliders, a "Content Mix" sub-section. One slider per tag that exists across the user's feeds.

| Slider | Range | Default | Semantics |
|--------|-------|---------|-----------|
| Per-tag boost | -2 to +2 | 0 (Neutral) | 5-stop: Reduce, Less, Neutral, More, Boost |

Boost is a multiplier on the final magic score:
- -2 = 0.25x (strongly reduced)
- -1 = 0.5x
-  0 = 1.0x (neutral)
- +1 = 1.5x
- +2 = 2.0x (strongly boosted)

Articles with multiple tags get the highest applicable boost (not stacked). If 10+ tags exist, show top 8 most-used with a "Show all" toggle.

### Scoring Formula

```
rawScore = W_recency * recency + W_source * source + W_unread * unread + W_signals * signals
finalScore = rawScore * tagBoostMultiplier(article)
```

Weights are normalized: `W_x = config.x / (config.recency + config.source + config.unread + config.signals)`

### Storage

Single `pr-magic-mixer` localStorage key containing JSON:

```json
{
  "preset": "balanced",
  "weights": { "recency": 40, "source": 35, "unread": 15, "signals": 10 },
  "diversity": 3,
  "tagBoosts": { "news": -1, "personal": 2 }
}
```

Default state (no key) = Balanced preset.

### Live Update

When a slider changes: save to localStorage, then call `scheduleRenderFileList()` after a 300ms debounce (setTimeout wrapping the save+re-render). Sidebar re-sorts visibly without page reload.

### Settings Placement

New "Magic Mixer" card in the **Reading** tab, after Voice Playback and before AI Summaries. Only fully rendered when Magic sort is enabled. If Magic sort is off, show a muted note with a button to enable it.

### Edge Cases

- **No tags:** Hide the "Content Mix" sub-section entirely.
- **Magic sort off:** Show muted card with enable button.
- **All weights at 0:** Fall back to equal weights (25/25/25/25). Show subtle note.
- **Dead tags:** Boosts for removed tags persist harmlessly. Reapply if tag returns.
- **Preset detection:** On open, check if current weights match any preset. Highlight matching pill or "Custom."

## Files Changed

| File | Change |
|------|--------|
| `viewer/03-settings.js` | New Magic Mixer card — presets, advanced toggle, sliders, tag boosts, reset |
| `viewer/05-sidebar.js` | `magicScore()` reads mixer config; diversity cap from config; tag boost multiplier |
| `viewer.css` | Slider styles, tag boost row styles, advanced toggle |
| `src/viewer-html.ts` | Rebuild |

**Not changed:** `01-state.js`, `07-tts.js`, `04-article.js`, feed pipeline, backend.

## Testing

- Verify each preset applies correct weights and sidebar re-sorts
- Verify custom slider adjustment switches to "Custom" preset
- Verify tag boost multipliers affect ranking correctly
- Verify diversity cap slider changes max-per-source behavior
- Verify reset returns to Balanced defaults
- Verify 300ms debounce on live sidebar update
- Verify Magic sort off state shows enable prompt
- Verify all-weights-zero fallback
