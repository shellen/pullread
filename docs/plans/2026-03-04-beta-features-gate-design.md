# Beta Features Gate

Gate experimental features (starting with Ask) behind a single "Beta features" toggle in Settings.

## Changes

### Settings UI (03-settings.js, Advanced tab)
- Add "Beta features" checkbox: "Enable experimental features like Ask"
- Stores `pr-beta-features` in localStorage (matches existing pattern for UI prefs)

### Discover area (10-explore.js)
- When beta enabled AND `serverMode && llmConfigured`, render an "Ask" chip alongside Daily/Weekly Review chips
- Chip calls `renderAskPage()`

### Deep link gating (13-init.js)
- `#tab=ask` handler checks `localStorage.getItem('pr-beta-features')` before navigating
- If beta not enabled, ignore the hash silently

### No changes to
- `17-ask.js` (Ask page implementation)
- `/api/ask` endpoint (server-side)
- Any other existing functionality
