# Content Mix: Sections Instead of Tags

## Problem

The Magic Mixer's Content Mix sub-section shows a slider for every auto-generated machine tag. With 1770+ granular tags (individual people, companies, technologies), this is unusable. Nobody can meaningfully customize thousands of topic sliders.

## Solution

Replace `machineTags` with the 12 editorial `section` categories that the auto-tagger already generates. Max 12 sliders instead of 1770.

## Design

### Section Labels

| Key | Display |
|-----|---------|
| tech | Technology |
| news | News |
| science | Science |
| health | Health |
| business | Business |
| culture | Culture |
| sports | Sports |
| food | Food |
| lifestyle | Lifestyle |
| environment | Environment |
| education | Education |
| opinion | Opinion |

Only sections present in the user's articles are shown.

### Scoring

`magicScore()` checks `notes.section` instead of `notes.machineTags` for boost multiplier lookup. Same 5-stop scale (-2 to +2), same multipliers (0.25x through 2.0x).

### Storage

`tagBoosts` key in `pr-magic-mixer` localStorage now stores section keys instead of tag names. Existing tag boost values are ignored (harmless stale data).

### What doesn't change

- Algorithm weight sliders (Freshness, Sources, Unread, Activity)
- Diversity cap slider
- Preset system
- Multiplier math
- machineTags data (still used for search/filtering, just not in the mixer)

## Files Changed

| File | Change |
|------|--------|
| `viewer/03-settings.js` | Content Mix card: iterate sections instead of machineTags, remove "Show all N topics" overflow |
| `viewer/05-sidebar.js` | `magicScore()`: match `section` instead of `machineTags` for boost lookup |
