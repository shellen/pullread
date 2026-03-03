# Editorial Taxonomy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Organize articles into newspaper-style editorial sections (Tech, News, Science, Business, Culture, Opinion, Lifestyle) with proportional surfacing across For You, Tags, and Explore.

**Architecture:** Client-side `SECTION_MAP` maps machineTags to sections. LLM fallback adds `section` field to autotagger output for unclassifiable articles. Proportional allocation algorithm distributes display slots with floor/ceiling guarantees. Discovered sections emerge from clustering unclassified tags.

**Tech Stack:** Vanilla JS (viewer), TypeScript (server), existing annotation storage system, existing LLM autotagger.

---

### Task 1: SECTION_MAP and resolveSection()

Add the static tag-to-section mapping and a resolution function that determines which section an article belongs to.

**Files:**
- Modify: `viewer/02-utils.js`
- Modify: `src/viewer.test.ts`

**Step 1: Write the failing tests**

Add to `src/viewer.test.ts`:

```typescript
describe('editorial sections', () => {
  let SECTION_MAP: Record<string, string>;
  let SECTIONS: string[];
  let resolveSection: (filename: string) => string;

  beforeAll(() => {
    const rootDir = join(__dirname, '..');
    const utils = readFileSync(join(rootDir, 'viewer', '02-utils.js'), 'utf-8');
    const fn = new Function(utils + '\nreturn { SECTION_MAP, SECTIONS, resolveSection };');
    const fns = fn();
    SECTION_MAP = fns.SECTION_MAP;
    SECTIONS = fns.SECTIONS;
    resolveSection = fns.resolveSection;
  });

  test('SECTIONS lists all 7 core sections', () => {
    expect(SECTIONS).toEqual(['tech', 'news', 'science', 'business', 'culture', 'opinion', 'lifestyle']);
  });

  test('SECTION_MAP maps known tags to sections', () => {
    expect(SECTION_MAP['artificialintelligence']).toBe('tech');
    expect(SECTION_MAP['climatechange']).toBe('science');
    expect(SECTION_MAP['finance']).toBe('business');
    expect(SECTION_MAP['music']).toBe('culture');
    expect(SECTION_MAP['politics']).toBe('news');
  });

  test('resolveSection returns section from allNotesIndex annotation', () => {
    // Mock allNotesIndex with a section field
    (globalThis as any).allNotesIndex = { 'article.md': { machineTags: ['randomtag'], section: 'opinion' } };
    expect(resolveSection('article.md')).toBe('opinion');
    delete (globalThis as any).allNotesIndex;
  });

  test('resolveSection falls back to tag mapping when no annotation section', () => {
    (globalThis as any).allNotesIndex = { 'article.md': { machineTags: ['artificialintelligence', 'openai'] } };
    expect(resolveSection('article.md')).toBe('tech');
    delete (globalThis as any).allNotesIndex;
  });

  test('resolveSection returns "other" when no tags match', () => {
    (globalThis as any).allNotesIndex = { 'article.md': { machineTags: ['obscuretag'] } };
    expect(resolveSection('article.md')).toBe('other');
    delete (globalThis as any).allNotesIndex;
  });

  test('resolveSection returns "other" when article has no notes', () => {
    (globalThis as any).allNotesIndex = {};
    expect(resolveSection('article.md')).toBe('other');
    delete (globalThis as any).allNotesIndex;
  });

  test('resolveSection picks most frequent section when tags span multiple', () => {
    // 2 tech tags, 1 science tag → tech wins
    (globalThis as any).allNotesIndex = { 'article.md': { machineTags: ['programming', 'software', 'climatechange'] } };
    expect(resolveSection('article.md')).toBe('tech');
    delete (globalThis as any).allNotesIndex;
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun test src/viewer.test.ts`
Expected: FAIL — `SECTION_MAP`, `SECTIONS`, `resolveSection` not defined

**Step 3: Write the implementation**

Add to the end of `viewer/02-utils.js`:

```js
// Editorial section taxonomy — maps machineTags to newspaper-style sections
var SECTIONS = ['tech', 'news', 'science', 'business', 'culture', 'opinion', 'lifestyle'];

var SECTION_MAP = {
  // Tech
  artificialintelligence: 'tech', machinelearning: 'tech', programming: 'tech',
  software: 'tech', cybersecurity: 'tech', startups: 'tech', cloudcomputing: 'tech',
  webdevelopment: 'tech', opensource: 'tech', datascience: 'tech', blockchain: 'tech',
  cryptocurrency: 'tech', hardware: 'tech', robotics: 'tech', apple: 'tech',
  google: 'tech', microsoft: 'tech', amazon: 'tech', meta: 'tech', openai: 'tech',
  semiconductors: 'tech', computing: 'tech', android: 'tech', ios: 'tech',
  linux: 'tech', python: 'tech', javascript: 'tech', rust: 'tech', golang: 'tech',
  // News
  politics: 'news', government: 'news', elections: 'news', law: 'news',
  legislation: 'news', diplomacy: 'news', military: 'news', congress: 'news',
  supremecourt: 'news', whitehouse: 'news', foreignpolicy: 'news',
  immigration: 'news', democracy: 'news', journalism: 'news',
  // Science
  research: 'science', climate: 'science', climatechange: 'science', space: 'science',
  biology: 'science', physics: 'science', medicine: 'science', environment: 'science',
  neuroscience: 'science', genetics: 'science', astronomy: 'science', nasa: 'science',
  health: 'science', publichealth: 'science', mentalhealth: 'science',
  // Business
  finance: 'business', economics: 'business', markets: 'business',
  entrepreneurship: 'business', investing: 'business', management: 'business',
  venturecapital: 'business', wallstreet: 'business', banking: 'business',
  realestate: 'business', advertising: 'business', marketing: 'business',
  // Culture
  arts: 'culture', entertainment: 'culture', music: 'culture', film: 'culture',
  books: 'culture', media: 'culture', gaming: 'culture', television: 'culture',
  literature: 'culture', theater: 'culture', design: 'culture', architecture: 'culture',
  photography: 'culture', animation: 'culture', comics: 'culture', podcasts: 'culture',
  // Opinion (few tags — mostly LLM-classified)
  essay: 'opinion', commentary: 'opinion', editorial: 'opinion', analysis: 'opinion',
  // Lifestyle
  food: 'lifestyle', travel: 'lifestyle', fitness: 'lifestyle', fashion: 'lifestyle',
  parenting: 'lifestyle', cooking: 'lifestyle', wellness: 'lifestyle',
  productivity: 'lifestyle', diy: 'lifestyle',
};

var SECTION_LABELS = {
  tech: 'Tech', news: 'News', science: 'Science', business: 'Business',
  culture: 'Culture', opinion: 'Opinion', lifestyle: 'Lifestyle', other: 'Other'
};

function resolveSection(filename) {
  var notes = allNotesIndex[filename];
  if (!notes) return 'other';
  // Check explicit section from LLM classification
  if (notes.section && SECTION_LABELS[notes.section]) return notes.section;
  // Fall back to tag mapping — pick section with most matching tags
  var tags = notes.machineTags || [];
  if (tags.length === 0) return 'other';
  var counts = {};
  for (var i = 0; i < tags.length; i++) {
    var s = SECTION_MAP[tags[i]];
    if (s) counts[s] = (counts[s] || 0) + 1;
  }
  var best = 'other';
  var bestCount = 0;
  for (var key in counts) {
    if (counts[key] > bestCount) { best = key; bestCount = counts[key]; }
  }
  return best;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun test src/viewer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add viewer/02-utils.js src/viewer.test.ts
git commit -m "feat: add SECTION_MAP and resolveSection for editorial taxonomy"
```

---

### Task 2: Extend autotagger to include section classification

Modify the LLM prompt to also return a section classification. Update the parser and storage.

**Files:**
- Modify: `src/autotagger.ts`
- Modify: `src/annotations.ts`
- Modify: `src/viewer.ts` (the `/api/notes` endpoint)
- Create: `src/autotagger.test.ts`

**Step 1: Write the failing tests**

Create `src/autotagger.test.ts`:

```typescript
// ABOUTME: Tests for autotagger LLM prompt parsing and section classification
// ABOUTME: Covers parseTagsFromResponse with both array and object response formats

jest.mock('./summarizer', () => ({
  summarizeText: jest.fn(),
  loadLLMConfig: jest.fn(),
  getDefaultModel: jest.fn(),
}));
jest.mock('./writer', () => ({
  listMarkdownFiles: jest.fn(),
  resolveFilePath: jest.fn(),
}));
jest.mock('./annotations', () => ({
  loadAnnotation: jest.fn().mockReturnValue({ highlights: [], articleNote: '', annotations: [], tags: [], machineTags: [], isFavorite: false }),
  saveAnnotation: jest.fn(),
  allNotes: jest.fn().mockReturnValue({}),
}));

import { autotagText } from './autotagger';
import { summarizeText } from './summarizer';
import { saveAnnotation } from './annotations';

const mockSummarize = summarizeText as jest.MockedFunction<typeof summarizeText>;

describe('autotagger section classification', () => {
  beforeEach(() => {
    mockSummarize.mockReset();
  });

  test('parses object response with tags and section', async () => {
    mockSummarize.mockResolvedValue({
      summary: '{"tags": ["artificialintelligence", "openai"], "section": "tech"}',
      model: 'test-model',
    });
    const result = await autotagText('Some article about AI', { provider: 'apple' as any, apiKey: '' });
    expect(result.machineTags).toEqual(['artificialintelligence', 'openai']);
    expect(result.section).toBe('tech');
  });

  test('parses legacy array response (no section)', async () => {
    mockSummarize.mockResolvedValue({
      summary: '["artificialintelligence", "openai"]',
      model: 'test-model',
    });
    const result = await autotagText('Some article about AI', { provider: 'apple' as any, apiKey: '' });
    expect(result.machineTags).toEqual(['artificialintelligence', 'openai']);
    expect(result.section).toBeUndefined();
  });

  test('handles object response wrapped in code block', async () => {
    mockSummarize.mockResolvedValue({
      summary: '```json\n{"tags": ["climate", "science"], "section": "science"}\n```',
      model: 'test-model',
    });
    const result = await autotagText('Climate article', { provider: 'apple' as any, apiKey: '' });
    expect(result.machineTags).toEqual(['climate', 'science']);
    expect(result.section).toBe('science');
  });

  test('validates section against allowed values', async () => {
    mockSummarize.mockResolvedValue({
      summary: '{"tags": ["ai"], "section": "invalid_section"}',
      model: 'test-model',
    });
    const result = await autotagText('Article', { provider: 'apple' as any, apiKey: '' });
    expect(result.machineTags).toEqual(['ai']);
    expect(result.section).toBeUndefined();
  });

  test('normalizes tag strings in object response', async () => {
    mockSummarize.mockResolvedValue({
      summary: '{"tags": ["Artificial Intelligence", "open-ai"], "section": "tech"}',
      model: 'test-model',
    });
    const result = await autotagText('Article', { provider: 'apple' as any, apiKey: '' });
    expect(result.machineTags).toEqual(['artificialintelligence', 'openai']);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun test src/autotagger.test.ts`
Expected: FAIL — `result.section` is undefined (AutotagResult interface doesn't have section field yet)

**Step 3: Implement the changes**

**`src/autotagger.ts`** — Update prompt, interface, and parser:

1. Update `AUTOTAG_PROMPT` (line 10-17) to request an object with tags + section:

```
const AUTOTAG_PROMPT = `Extract 3-8 machine tags from this article for relational mapping, and classify the article into an editorial section. Tags should help identify connections between articles. Include:
- Main topics (e.g., "artificialintelligence", "climatechange", "economics")
- Key entities mentioned prominently — people, companies, technologies, places
- Themes (e.g., "regulation", "opensource", "privacy", "fundraising")

Return ONLY a valid JSON object with two fields:
- "tags": array of lowercase tag strings with no spaces or dashes
- "section": one of "tech", "news", "science", "business", "culture", "opinion", "lifestyle"

No explanation, no markdown formatting — just the raw JSON object.
Example: {"tags": ["artificialintelligence","openai","regulation","samaltman","safety"], "section": "tech"}
For non-English articles, use English tags where a clear English equivalent exists, but keep proper nouns and culturally specific terms in their original language.`;
```

2. Update `AutotagResult` interface (line 19-22):

```typescript
interface AutotagResult {
  machineTags: string[];
  section?: string;
  model: string;
}
```

3. Add valid sections constant:

```typescript
const VALID_SECTIONS = ['tech', 'news', 'science', 'business', 'culture', 'opinion', 'lifestyle'];
```

4. Replace `parseTagsFromResponse` with `parseAutotagResponse` that handles both object and array formats:

```typescript
function parseAutotagResponse(response: string): { machineTags: string[]; section?: string } {
  let text = response.trim();
  text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  text = text.trim();

  const normalizeTags = (arr: unknown[]): string[] =>
    arr
      .filter((t: unknown): t is string => typeof t === 'string')
      .map(t => t.toLowerCase().trim().replace(/[\s\-]+/g, ''))
      .filter(t => t.length > 0 && t.length <= 50);

  try {
    const parsed = JSON.parse(text);
    // Object format: { tags: [...], section: "..." }
    if (parsed && !Array.isArray(parsed) && typeof parsed === 'object' && Array.isArray(parsed.tags)) {
      const machineTags = normalizeTags(parsed.tags);
      const section = typeof parsed.section === 'string' && VALID_SECTIONS.includes(parsed.section.toLowerCase())
        ? parsed.section.toLowerCase()
        : undefined;
      return { machineTags, section };
    }
    // Legacy array format: [...]
    if (Array.isArray(parsed)) {
      return { machineTags: normalizeTags(parsed) };
    }
  } catch {
    // Try to extract JSON from the response
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const parsed = JSON.parse(objMatch[0]);
        if (parsed && Array.isArray(parsed.tags)) {
          const machineTags = normalizeTags(parsed.tags);
          const section = typeof parsed.section === 'string' && VALID_SECTIONS.includes(parsed.section.toLowerCase())
            ? parsed.section.toLowerCase()
            : undefined;
          return { machineTags, section };
        }
      } catch {}
    }
    const arrayMatch = text.match(/\[[\s\S]*?\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed)) {
          return { machineTags: normalizeTags(parsed) };
        }
      } catch {}
    }
  }

  return { machineTags: [] };
}
```

5. Update `autotagText` (line 46) to use new parser and return section:

```typescript
  const { machineTags, section } = parseAutotagResponse(result.summary);
  return { machineTags, section, model: result.model };
```

6. Update `saveMachineTags` to also save section:

```typescript
export function saveMachineTags(filename: string, machineTags: string[], section?: string): void {
  const existing = loadAnnotation(filename);
  const update: any = { ...existing, machineTags };
  if (section) update.section = section;
  saveAnnotation(filename, update);
}
```

7. Update call sites in `autotagBatch` (line 176):

```typescript
        saveMachineTags(file, result.machineTags, result.section);
```

**`src/annotations.ts`** — Add `section` to the data model:

1. Add `section` to `AnnotationData` interface (line 8-15):

```typescript
export interface AnnotationData {
  highlights: unknown[];
  articleNote: string;
  annotations: unknown[];
  tags: string[];
  machineTags: string[];
  section?: string;
  isFavorite: boolean;
}
```

2. Update `EMPTY_ANNOTATION` (line 17-24) to include `section: undefined`.

3. Update `_loadAll` parsing (line 64-69) to include: `section: data.section || undefined,`

4. Update `allNotes` return type and mapping to include `section`.

**`src/viewer.ts`** — Update `/api/notes` endpoint to include section:

In the `allNotes()` response, section will flow through automatically since `allNotes()` returns what's in the annotation cache. But for the single-file response (line 1017), add `section`:

```typescript
sendJson(res, {
  articleNote: annot.articleNote,
  annotations: annot.annotations,
  tags: annot.tags,
  isFavorite: annot.isFavorite,
  ...(annot.machineTags.length ? { machineTags: annot.machineTags } : {}),
  ...(annot.section ? { section: annot.section } : {}),
});
```

**Step 4: Run tests to verify they pass**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun test src/autotagger.test.ts`
Expected: PASS

Also run: `bun test src/viewer.test.ts src/annotations.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/autotagger.ts src/autotagger.test.ts src/annotations.ts src/viewer.ts
git commit -m "feat: extend autotagger to classify articles into editorial sections"
```

---

### Task 3: Proportional section allocation algorithm

Pure function that distributes N display slots across sections with floor/ceiling guarantees.

**Files:**
- Modify: `viewer/02-utils.js`
- Modify: `src/viewer.test.ts`

**Step 1: Write the failing tests**

Add to the `editorial sections` describe block in `src/viewer.test.ts`:

```typescript
describe('allocateSectionSlots', () => {
  let allocateSectionSlots: (sectionCounts: Record<string, number>, totalSlots: number) => Record<string, number>;

  beforeAll(() => {
    const rootDir = join(__dirname, '..');
    const utils = readFileSync(join(rootDir, 'viewer', '02-utils.js'), 'utf-8');
    const fn = new Function(utils + '\nreturn { allocateSectionSlots };');
    allocateSectionSlots = fn().allocateSectionSlots;
  });

  test('gives every section with articles at least 1 slot', () => {
    var result = allocateSectionSlots({ tech: 50, news: 2, science: 1 }, 10);
    expect(result['tech']).toBeGreaterThanOrEqual(1);
    expect(result['news']).toBeGreaterThanOrEqual(1);
    expect(result['science']).toBeGreaterThanOrEqual(1);
  });

  test('caps any section at 40% of total slots', () => {
    var result = allocateSectionSlots({ tech: 100, news: 5, science: 5 }, 10);
    expect(result['tech']).toBeLessThanOrEqual(4);
  });

  test('total allocated slots equals totalSlots', () => {
    var result = allocateSectionSlots({ tech: 30, news: 20, science: 15, business: 10, culture: 5 }, 20);
    var total = Object.values(result).reduce((a: number, b: number) => a + b, 0);
    expect(total).toBe(20);
  });

  test('empty sections get 0 slots', () => {
    var result = allocateSectionSlots({ tech: 10, news: 0 }, 5);
    expect(result['news']).toBe(0);
  });

  test('handles single section gracefully', () => {
    var result = allocateSectionSlots({ tech: 50 }, 10);
    expect(result['tech']).toBe(10);
  });

  test('handles more sections than slots', () => {
    var result = allocateSectionSlots({ tech: 5, news: 5, science: 5, business: 5, culture: 5, opinion: 5, lifestyle: 5 }, 5);
    var total = Object.values(result).reduce((a: number, b: number) => a + b, 0);
    expect(total).toBe(5);
    // At least 5 sections should get 1 slot each (total=5, so exactly 5 get 1)
    var nonZero = Object.values(result).filter((v: number) => v > 0).length;
    expect(nonZero).toBe(5);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun test src/viewer.test.ts`
Expected: FAIL — `allocateSectionSlots` not defined

**Step 3: Write the implementation**

Add to `viewer/02-utils.js` after `resolveSection`:

```js
function allocateSectionSlots(sectionCounts, totalSlots) {
  var sections = [];
  var totalArticles = 0;
  for (var key in sectionCounts) {
    if (sectionCounts[key] > 0) {
      sections.push({ id: key, count: sectionCounts[key] });
      totalArticles += sectionCounts[key];
    }
  }
  var result = {};
  for (var key in sectionCounts) result[key] = 0;

  if (sections.length === 0 || totalSlots === 0) return result;

  var ceiling = Math.ceil(totalSlots * 0.4);

  // Give each section its proportional share, floored
  var allocated = 0;
  for (var i = 0; i < sections.length; i++) {
    var s = sections[i];
    var share = Math.floor(totalSlots * s.count / totalArticles);
    // Floor: at least 1 if we have budget
    s.slots = Math.max(share, 1);
    // Ceiling: no more than 40%
    if (s.slots > ceiling) s.slots = ceiling;
    // Can't exceed actual article count
    if (s.slots > s.count) s.slots = s.count;
    allocated += s.slots;
  }

  // If we over-allocated (many small sections all getting floor=1), trim from largest
  while (allocated > totalSlots) {
    sections.sort(function(a, b) { return b.slots - a.slots; });
    for (var i = 0; i < sections.length && allocated > totalSlots; i++) {
      if (sections[i].slots > 1) {
        sections[i].slots--;
        allocated--;
      }
    }
    // Safety: if all at 1 and still over, remove from end
    if (allocated > totalSlots) {
      for (var i = sections.length - 1; i >= 0 && allocated > totalSlots; i--) {
        if (sections[i].slots > 0) {
          sections[i].slots--;
          allocated--;
        }
      }
    }
  }

  // If we under-allocated, distribute remaining to sections with most unserved demand
  while (allocated < totalSlots) {
    sections.sort(function(a, b) {
      return (b.count - b.slots) - (a.count - a.slots);
    });
    var added = false;
    for (var i = 0; i < sections.length && allocated < totalSlots; i++) {
      if (sections[i].slots < ceiling && sections[i].slots < sections[i].count) {
        sections[i].slots++;
        allocated++;
        added = true;
      }
    }
    if (!added) break;
  }

  for (var i = 0; i < sections.length; i++) {
    result[sections[i].id] = sections[i].slots;
  }
  return result;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun test src/viewer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add viewer/02-utils.js src/viewer.test.ts
git commit -m "feat: add proportional section allocation with floor/ceiling guarantees"
```

---

### Task 4: For You tab section grouping

Modify `buildDailyRundown()` to group results by editorial section with proportional allocation.

**Files:**
- Modify: `viewer/15-graph.js` (~lines 160-228)
- Modify: `src/viewer.test.ts`

**Step 1: Write the failing tests**

Add to `src/viewer.test.ts`:

```typescript
describe('For You section grouping', () => {
  const rootDir = join(__dirname, '..');

  test('buildDailyRundown includes section field on each topic', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    expect(graph).toContain('resolveSection');
    expect(graph).toContain('.section');
  });

  test('buildSectionRundown function exists for section-grouped view', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    expect(graph).toMatch(/function\s+buildSectionRundown/);
  });

  test('buildSectionRundown uses allocateSectionSlots', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    expect(graph).toContain('allocateSectionSlots');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun test src/viewer.test.ts`
Expected: FAIL

**Step 3: Implement the changes**

Add `buildSectionRundown()` to `viewer/15-graph.js` after `buildDailyRundown()`:

```js
function buildSectionRundown(maxPerSection) {
  if (maxPerSection === undefined) maxPerSection = 20;

  // Count articles per section
  var sectionArticles = {};
  for (var i = 0; i < allFiles.length; i++) {
    var f = allFiles[i];
    if (readArticles.has(f.filename)) continue;
    var sec = resolveSection(f.filename);
    if (!sectionArticles[sec]) sectionArticles[sec] = [];
    sectionArticles[sec].push(f);
  }

  // Allocate slots proportionally
  var counts = {};
  for (var sec in sectionArticles) counts[sec] = sectionArticles[sec].length;
  var totalSlots = Math.min(maxPerSection * Object.keys(counts).length, 30);
  var slots = allocateSectionSlots(counts, totalSlots);

  // Build result: for each section, pick top-scored articles
  var engagement = computeSourceEngagement();
  var mc = getMixerConfig();
  var result = [];

  // Core sections first, in order
  var allSections = SECTIONS.slice();
  // Add discovered sections (any key in counts not in SECTIONS)
  for (var sec in counts) {
    if (allSections.indexOf(sec) === -1) allSections.push(sec);
  }

  for (var si = 0; si < allSections.length; si++) {
    var sec = allSections[si];
    var articles = sectionArticles[sec];
    if (!articles || articles.length === 0) continue;
    var slotCount = slots[sec] || 1;

    // Score and sort articles within section
    articles.sort(function(a, b) {
      return magicScore(b, engagement, mc) - magicScore(a, engagement, mc);
    });

    var picked = articles.slice(0, slotCount);
    result.push({
      section: sec,
      label: SECTION_LABELS[sec] || mixerFormatTopic(sec),
      articles: picked.map(function(f) {
        return {
          filename: f.filename,
          title: f.title,
          domain: f.domain || '',
          image: f.image || '',
          bookmarked: f.bookmarked || '',
          feed: f.feed || ''
        };
      }),
      totalCount: articles.length
    });
  }

  return result;
}
```

Also annotate existing `buildDailyRundown()` results with section info — add `section: resolveSection(c.articles[0].filename)` to each rundown item in the existing function (around line 213 inside the `rundown.push(...)` call).

**Step 4: Run tests to verify they pass**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun test src/viewer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add viewer/15-graph.js src/viewer.test.ts
git commit -m "feat: add buildSectionRundown for section-grouped For You view"
```

---

### Task 5: Render For You with section headers

Update the For You tab rendering to use `buildSectionRundown()` and display section headers.

**Files:**
- Modify: `viewer/15-graph.js` (rendering function)
- Modify: `viewer.css`
- Modify: `src/viewer.test.ts`

**Step 1: Write failing tests**

Add to `src/viewer.test.ts`:

```typescript
describe('For You section rendering', () => {
  const rootDir = join(__dirname, '..');

  test('15-graph.js renders section headers with SECTION_LABELS', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    expect(graph).toContain('section-header');
    expect(graph).toContain('SECTION_LABELS');
  });

  test('viewer.css styles section headers', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    expect(css).toContain('.section-header');
  });
});
```

**Step 2: Run to verify fail**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun test src/viewer.test.ts`
Expected: FAIL

**Step 3: Implement**

Find the function in `15-graph.js` that renders Daily Rundown HTML (it uses `buildDailyRundown()` and generates card HTML). Add a section-based rendering path that uses `buildSectionRundown()` and adds section header dividers.

The section header HTML pattern:

```html
<div class="section-header">
  <h3 class="section-title">Tech</h3>
  <span class="section-count">12 articles</span>
</div>
```

Add to `viewer.css`:

```css
.section-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 24px 0 12px;
  padding: 0 4px;
  border-bottom: 1px solid var(--border);
}
.section-header:first-child { margin-top: 8px; }
.section-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 400;
  margin: 0 0 6px;
}
.section-count {
  font-size: 12px;
  color: var(--muted);
}
```

**Step 4: Run tests to verify pass**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun test src/viewer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add viewer/15-graph.js viewer.css src/viewer.test.ts
git commit -m "feat: render For You tab with section headers"
```

---

### Task 6: Tags tab section grouping

Group the Tags tab under collapsible section headings instead of a flat list.

**Files:**
- Modify: `viewer/10-explore.js` (~line 133, `buildTagsTabHtml`)
- Modify: `viewer.css`
- Modify: `src/viewer.test.ts`

**Step 1: Write failing tests**

Add to `src/viewer.test.ts`:

```typescript
describe('Tags tab section grouping', () => {
  const rootDir = join(__dirname, '..');

  test('buildTagsTabHtml groups tags under section headings', () => {
    const explore = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(explore).toContain('section-header');
    expect(explore).toContain('SECTION_LABELS');
    expect(explore).toContain('resolveSection');
  });

  test('section groups are collapsible', () => {
    const explore = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(explore).toContain('section-collapse');
  });
});
```

**Step 2: Run tests to verify fail**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun test src/viewer.test.ts`
Expected: FAIL

**Step 3: Implement**

In `buildTagsTabHtml()` (line ~133 of `10-explore.js`), after the Topic Clusters section and before `buildTagsHtml(data)`, replace or wrap the tag list rendering:

1. Group `data.sortedTags` by section using `SECTION_MAP`
2. Render each section with a collapsible header
3. Tags within each section listed by count (existing behavior)
4. "Other" section at the bottom for unmapped tags

The grouping logic:

```js
// Group tags by section
var tagsBySection = {};
for (var ti = 0; ti < data.sortedTags.length; ti++) {
  var tagEntry = data.sortedTags[ti];
  var tagName = tagEntry[0];
  var sec = SECTION_MAP[tagName] || 'other';
  if (!tagsBySection[sec]) tagsBySection[sec] = [];
  tagsBySection[sec].push(tagEntry);
}

// Render sections in order
var sectionOrder = SECTIONS.concat(['other']);
for (var si = 0; si < sectionOrder.length; si++) {
  var sec = sectionOrder[si];
  var tags = tagsBySection[sec];
  if (!tags || tags.length === 0) continue;
  var totalInSection = tags.reduce(function(sum, t) { return sum + t[1]; }, 0);
  html += '<div class="section-group">';
  html += '<div class="section-header section-collapse" onclick="this.parentNode.classList.toggle(\'collapsed\')">';
  html += '<h3 class="section-title">' + escapeHtml(SECTION_LABELS[sec] || sec) + '</h3>';
  html += '<span class="section-count">' + totalInSection + ' articles</span>';
  html += '<svg class="icon icon-sm section-chevron"><use href="#i-chevron-down"/></svg>';
  html += '</div>';
  html += '<div class="section-body">';
  // Render tags within section (existing tag pill pattern)
  for (var ti = 0; ti < tags.length; ti++) {
    // ... existing tag rendering ...
  }
  html += '</div></div>';
}
```

Add to `viewer.css`:

```css
.section-group.collapsed .section-body { display: none; }
.section-group.collapsed .section-chevron { transform: rotate(-90deg); }
.section-chevron {
  color: var(--muted);
  transition: transform 0.15s ease;
  margin-left: auto;
}
.section-collapse { cursor: pointer; }
.section-body { padding: 8px 0 16px; }
```

**Step 4: Run tests**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun test src/viewer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add viewer/10-explore.js viewer.css src/viewer.test.ts
git commit -m "feat: group Tags tab under collapsible section headings"
```

---

### Task 7: Explore topic clusters with section badges

Add section labels to the existing topic cluster cards on the Explore page.

**Files:**
- Modify: `viewer/10-explore.js` (topic cluster card rendering, ~line 155)
- Modify: `viewer.css`
- Modify: `src/viewer.test.ts`

**Step 1: Write failing tests**

```typescript
describe('Explore section badges', () => {
  const rootDir = join(__dirname, '..');

  test('topic cluster cards include section badges', () => {
    const explore = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(explore).toContain('section-badge');
  });

  test('viewer.css styles section badges', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    expect(css).toContain('.section-badge');
  });
});
```

**Step 2: Run tests to verify fail**

**Step 3: Implement**

In the topic cluster card rendering (inside `buildTagsTabHtml`, around line 155), determine the dominant section for each cluster's tags:

```js
// Determine cluster's section from its tags
var clusterSections = {};
for (var cti = 0; cti < cluster.tags.length; cti++) {
  var cs = SECTION_MAP[cluster.tags[cti]];
  if (cs) clusterSections[cs] = (clusterSections[cs] || 0) + 1;
}
var clusterSection = 'other';
var bestSC = 0;
for (var cs in clusterSections) {
  if (clusterSections[cs] > bestSC) { clusterSection = cs; bestSC = clusterSections[cs]; }
}
html += '<span class="section-badge section-' + clusterSection + '">' + escapeHtml(SECTION_LABELS[clusterSection] || clusterSection) + '</span>';
```

Add to `viewer.css`:

```css
.section-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--bg-offset);
  color: var(--muted);
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add viewer/10-explore.js viewer.css src/viewer.test.ts
git commit -m "feat: add section badges to explore topic cluster cards"
```

---

### Task 8: Discovered sections from unclassified tags

Cluster articles that don't fit any core section into 1-3 discovered sections.

**Files:**
- Modify: `viewer/15-graph.js`
- Modify: `src/viewer.test.ts`

**Step 1: Write failing tests**

```typescript
describe('discovered sections', () => {
  const rootDir = join(__dirname, '..');

  test('buildSectionRundown handles non-core section keys', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    // buildSectionRundown should include "other" articles clustered into discovered sections
    expect(graph).toContain('discoverSections');
  });

  test('discoverSections function exists', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    expect(graph).toMatch(/function\s+discoverSections/);
  });
});
```

**Step 2: Run to verify fail**

**Step 3: Implement**

Add `discoverSections()` to `viewer/15-graph.js`:

```js
function discoverSections(maxDiscovered) {
  if (maxDiscovered === undefined) maxDiscovered = 3;

  // Collect articles in "other" section
  var otherArticles = [];
  for (var i = 0; i < allFiles.length; i++) {
    if (resolveSection(allFiles[i].filename) === 'other') {
      otherArticles.push(allFiles[i]);
    }
  }
  if (otherArticles.length < 5) return [];

  // Count machineTags among "other" articles
  var tagCounts = {};
  var tagArticleMap = {};
  for (var i = 0; i < otherArticles.length; i++) {
    var notes = allNotesIndex[otherArticles[i].filename];
    var tags = (notes && notes.machineTags) || [];
    for (var j = 0; j < tags.length; j++) {
      var tag = tags[j];
      if (SECTION_MAP[tag]) continue; // skip mapped tags
      if (blockedTags.has(tag)) continue;
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      if (!tagArticleMap[tag]) tagArticleMap[tag] = [];
      tagArticleMap[tag].push(otherArticles[i].filename);
    }
  }

  // Find tags with 5+ articles, sorted by frequency
  var candidates = [];
  for (var tag in tagCounts) {
    if (tagCounts[tag] >= 5) candidates.push({ tag: tag, count: tagCounts[tag] });
  }
  candidates.sort(function(a, b) { return b.count - a.count; });

  // Pick top discovered sections, avoiding overlap
  var discovered = [];
  var usedArticles = new Set();
  for (var i = 0; i < candidates.length && discovered.length < maxDiscovered; i++) {
    var tag = candidates[i].tag;
    var articles = tagArticleMap[tag].filter(function(fn) { return !usedArticles.has(fn); });
    if (articles.length < 5) continue;
    discovered.push({ id: tag, label: mixerFormatTopic(tag), articleFilenames: articles });
    for (var j = 0; j < articles.length; j++) usedArticles.add(articles[j]);
  }

  return discovered;
}
```

Update `buildSectionRundown()` to call `discoverSections()` and include discovered sections in the results.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add viewer/15-graph.js src/viewer.test.ts
git commit -m "feat: discover user-specific sections from unclassified articles"
```

---

### Task 9: Rebuild and integration verification

Rebuild the embedded viewer and verify everything works together.

**Files:**
- Rebuild: `src/viewer-html.ts` (via embed-viewer.ts)

**Step 1: Run full test suite**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun test`
Expected: All tests pass

**Step 2: Rebuild viewer**

Run: `cd "/Users/shellen/Documents/Claude Stuff/pullread" && bun scripts/embed-viewer.ts`
Expected: Build succeeds, reports all JS modules embedded

**Step 3: Commit rebuild**

```bash
git add src/viewer-html.ts
git commit -m "chore: rebuild viewer-html.ts with editorial taxonomy"
```

---

## Files Modified Summary

| File | Change |
|------|--------|
| `viewer/02-utils.js` | `SECTION_MAP`, `SECTIONS`, `SECTION_LABELS`, `resolveSection()`, `allocateSectionSlots()` |
| `src/autotagger.ts` | Updated prompt for object response with section; updated parser; save section to annotations |
| `src/autotagger.test.ts` | Tests for section parsing from LLM responses |
| `src/annotations.ts` | Added `section` field to `AnnotationData` interface |
| `src/viewer.ts` | Include `section` in `/api/notes` response |
| `viewer/15-graph.js` | `buildSectionRundown()`, `discoverSections()`, section headers in For You |
| `viewer/10-explore.js` | Tags grouped by section, section badges on clusters |
| `viewer.css` | `.section-header`, `.section-title`, `.section-count`, `.section-badge`, `.section-group`, `.section-collapse` |
| `src/viewer.test.ts` | Tests for all editorial taxonomy features |
| `src/viewer-html.ts` | Rebuild |

## Verification Checklist

1. `bun test` — all tests pass
2. `bun scripts/embed-viewer.ts` — builds without errors
3. Start viewer, open For You tab — section headers group articles
4. Open Tags tab — tags grouped under collapsible section headings
5. Topic clusters show section badges
6. Re-tag an article — section field saved in annotation
7. Articles without machineTags show as "Other"
