# Editorial Taxonomy Design

**Goal:** Organize articles into newspaper/magazine-style editorial sections for better content discovery and guaranteed variety across reading surfaces.

**Approach:** Hybrid fixed + discovered sections with tag-first classification and LLM fallback.

## Core Sections (12 fixed)

| Section | Slug | Example machineTags |
|---------|------|---------------------|
| **Tech** | `tech` | artificialintelligence, programming, software, cybersecurity, startups, machinelearning, hardware |
| **News & Politics** | `news` | politics, government, elections, law, diplomacy, journalism, military |
| **Science** | `science` | research, space, physics, biology, astronomy, neuroscience, genetics |
| **Health** | `health` | medicine, publichealth, mentalhealth, nutrition, wellness, fitness |
| **Business** | `business` | finance, economics, markets, investing, management, venturecapital |
| **Culture** | `culture` | arts, music, film, books, gaming, television, media, design |
| **Sports** | `sports` | football, basketball, baseball, soccer, tennis, cycling, esports |
| **Food & Drink** | `food` | cooking, recipes, restaurants, wine, coffee, fermentation, food |
| **Lifestyle** | `lifestyle` | travel, fashion, parenting, diy, home, photography |
| **Environment** | `environment` | climate, energy, sustainability, renewables, conservation, climatechange |
| **Education** | `education` | learning, academia, schools, edtech, pedagogy, university |
| **Opinion** | `opinion` | essay, commentary, editorial, analysis |

Plus **2-3 discovered sections** — the system clusters remaining unclassified tags and surfaces any group with 5+ articles as a user-specific section (e.g., someone reading lots of cycling feeds gets a "Cycling" section).

## Classification Pipeline

1. **Tag mapping** — Static `SECTION_MAP` object maps each machineTag string to a section slug. Applied client-side in the viewer. Covers ~80% of articles with zero cost.

2. **LLM fallback** — Articles with no confident tag mapping get a `section` field during the autotagger pass. Piggyback on the existing machineTags LLM call by adding section classification to the prompt. One of: `tech`, `news`, `science`, `health`, `business`, `culture`, `sports`, `food`, `lifestyle`, `environment`, `education`, `opinion`.

3. **Storage** — Section stored in annotation JSON alongside machineTags as `"section": "tech"`. Once classified, never re-classified unless user triggers re-tag.

4. **Client resolution** — At render time, resolve section for each article: check annotation `section` field first, then attempt tag mapping from machineTags. Cache the result in the file list data structure.

## Proportional Surfacing with Floor/Ceiling

For a display of N total slots:

- Each section gets `floor(N * sectionArticleCount / totalArticleCount)` base slots
- **Floor:** every section with articles gets at least 1 slot
- **Ceiling:** no section gets more than `ceil(N * 0.4)` slots (40% cap)
- Within each section, articles ranked by existing `magicScore()`
- Remaining slots (after floor/ceiling adjustment) distributed to sections with highest unserved demand

## Discovered Sections

After classifying all articles into core sections, collect articles that didn't map to any section:

1. Cluster their machineTags by co-occurrence (reuse existing topic clustering from `15-graph.js`)
2. Any cluster with 5+ articles becomes a discovered section
3. Section name = most frequent tag in the cluster, formatted via `mixerFormatTopic()`
4. Maximum 3 discovered sections
5. Discovered sections appear after core sections in all surfaces

## Surface Changes

### For You tab (`15-graph.js` → `buildDailyRundown`)

- Section headers group the rundown cards
- Proportional allocation ensures variety across sections
- Discovered sections appear after core sections
- Each section header is a clickable filter

### Tags tab (`10-explore.js` → `buildTagsTabHtml`)

- Tags grouped under collapsible section headings instead of flat alphabetical list
- Section headers show article count for that section
- Individual tag counts still shown per-tag within sections
- Unclassified tags appear in an "Other" group at the bottom

### Explore cards (`10-explore.js`)

- Topic cluster cards get section label badges
- Cards can be filtered by section via filter pills at the top
- Section colors/icons for visual distinction

### Unchanged Surfaces

- Sidebar article list (Magic sort diversity cap handles variety already)
- Article reading view
- Search
- Feed management
- Notebooks

## Data Flow

```
Article ingested
  → autotagger adds machineTags + section to annotation JSON
  → viewer loads file list with machineTags from allNotesIndex
  → client resolves section: annotation.section || SECTION_MAP[tags] || 'other'
  → For You / Tags / Explore use section for grouping + proportional allocation
```

## Tag Mapping Maintenance

The `SECTION_MAP` is a static object in the viewer JS. As new machineTags appear in users' feeds that aren't mapped, they fall through to LLM classification. Periodically, common unmapped tags can be added to `SECTION_MAP` to reduce LLM calls.

## Out of Scope

- User-customizable sections (future enhancement)
- Section-level read/unread tracking
- Section-based notification preferences
- RSS category → section mapping (machineTags are more reliable)
