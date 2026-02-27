# Full Sidebar Design Decision

**Date**: 2026-02-24
**Status**: Implementing

## Decision

Replace the 64px icon rail sidebar with a full-width 260px sidebar that contains brand, tabs, search, navigation items, article list, and settings.

## Context

The previous three-panel redesign used:
- 64px icon rail (brand icon + nav buttons)
- 280px drawer (article list, search, file count)
- Content pane

This followed a "progressive disclosure" pattern where clicking icons revealed functionality. After review against the original prototype and RSS reader conventions, this was the wrong approach for PullRead's audience.

## Rationale

PullRead users are RSS power users who need information density at a glance:
- Source counts, tag counts, unread counts
- Article list always visible
- Search immediately accessible
- Navigation without extra clicks

The icon rail hides too much behind clicks. Established RSS readers (NetNewsWire, Reeder, Google Reader) all use full sidebars because they work for this audience.

## What Changes

### Sidebar (260px, always visible on desktop)
- Brand header with "PullRead" text + collapse/add/refresh buttons
- Home | Notebook tabs
- Search bar + pinned filters
- Nav items: All Items, Sources, Tags, Unread, Starred (each with count)
- Quick-add row
- File count + hide-read toggle
- Source filter bar (shows active source filter)
- Article list
- Sync status
- Settings footer

### Drawer (0px default, 250px when open)
- Sub-panel for Sources and Tags drill-down only
- Opens when clicking "Sources" or "Tags" nav items
- Lists source domains or tags with counts
- Clicking a source/tag filters the article list

### Mobile (<=750px)
- Top header bar: hamburger + "PullRead" brand + search button
- Sidebar becomes slide-over overlay with backdrop
- Drawer hidden on mobile (sources/tags filter via sidebar nav)

### Removed
- 64px icon rail
- Floating hamburger button
- Nav rail buttons/labels

## What Stays

- Content pane (reader-toolbar + content-scroll) — unchanged
- Audio player — unchanged
- Mini mode — unchanged
- All article rendering, highlights, TTS, AI summaries, notebooks, explore
- `sourceColor()` and `SOURCE_COLORS` palette

## Revert Plan

If this doesn't work out:
1. Git revert to the commit before this change
2. The icon rail approach is preserved in git history on the `three-panel-layout` branch
3. Consider a hybrid: full sidebar that collapses to icon rail (like VS Code)
