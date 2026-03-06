# Research Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a knowledge dashboard that extracts entities from articles, Google Drive docs, and URLs, resolves them into a knowledge graph, and presents a browsable Research tab in the viewer.

**Architecture:** loxodonta-core imported as a library (no XRPC server). A separate `research.db` PDS stores entities, edges, mentions, and vectors. Background extraction runs after sync. Pull Read's viewer server exposes `/api/research/*` endpoints. Viewer gets a three-panel Research tab (entity list, detail, graph).

**Tech Stack:** loxodonta-core (PDS, extractor, embedder, resolver, graph), Gemini embeddings API, googleapis (Drive), Canvas/SVG for graph rendering

---

### Task 1: Add loxodonta-core dependency and PDS initialization

**Files:**
- Modify: `package.json`
- Create: `src/research.ts`
- Create: `src/research.test.ts`

**Step 1: Install loxodonta-core**

Run: `npm install loxodonta-core`

**Step 2: Write failing test — PDS creates and closes cleanly**

```typescript
// src/research.test.ts
// ABOUTME: Tests for research knowledge graph — PDS lifecycle, extraction, entity queries
// ABOUTME: Verifies createResearchPDS initializes storage and closes without error

import { createResearchPDS, getResearchPDS } from './research';

describe('createResearchPDS', () => {
  test('creates PDS with in-memory database', () => {
    const pds = createResearchPDS(':memory:');
    expect(pds).toBeDefined();
    pds.close();
  });

  test('can store and retrieve an entity record', () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Apple', type: 'company' });
    const records = pds.listRecords('app.pullread.entity');
    expect(records.length).toBe(1);
    expect(records[0].value.name).toBe('Apple');
    pds.close();
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx jest src/research.test.ts --no-coverage`
Expected: FAIL — cannot resolve `./research`

**Step 4: Write minimal implementation**

```typescript
// src/research.ts
// ABOUTME: Knowledge graph storage — initializes and manages the research PDS
// ABOUTME: Wraps loxodonta-core's PDS for entity, mention, edge, and extraction records

import { createPDS } from 'loxodonta-core';
import { join } from 'path';
import { homedir } from 'os';

let _pds: ReturnType<typeof createPDS> | null = null;

export function createResearchPDS(dbPath?: string): ReturnType<typeof createPDS> {
  const path = dbPath || join(homedir(), '.pullread', 'research.db');
  return createPDS({ db: path, did: 'did:web:pullread.local' });
}

export function getResearchPDS(): ReturnType<typeof createPDS> {
  if (!_pds) {
    _pds = createResearchPDS();
  }
  return _pds;
}

export function closeResearchPDS(): void {
  if (_pds) {
    _pds.close();
    _pds = null;
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx jest src/research.test.ts --no-coverage`
Expected: PASS

**Step 6: Commit**

```bash
git add package.json package-lock.json src/research.ts src/research.test.ts
git commit -m "Add loxodonta-core dependency and research PDS initialization"
```

---

### Task 2: Extraction pipeline — parse articles and extract entities

**Files:**
- Modify: `src/research.ts`
- Modify: `src/research.test.ts`

**Step 1: Write failing test — extraction prompt is sent to LLM and entities are stored**

```typescript
// Add to src/research.test.ts
import { extractArticle } from './research';
import { summarizeText } from './summarizer';

jest.mock('./summarizer', () => ({
  summarizeText: jest.fn(),
}));
const mockSummarize = summarizeText as jest.MockedFunction<typeof summarizeText>;

describe('extractArticle', () => {
  beforeEach(() => mockSummarize.mockReset());

  test('extracts entities from article text and stores in PDS', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'Apple', type: 'company', role: 'subject' }],
        relationships: [],
        themes: ['technology'],
      }),
      model: 'test',
    });

    await extractArticle(pds, {
      filename: 'test-article.md',
      title: 'Apple Announces New Product',
      body: 'Apple today announced a new product line.',
    });

    const extractions = pds.listRecords('app.pullread.extraction');
    expect(extractions.length).toBe(1);
    expect(extractions[0].value.filename).toBe('test-article.md');

    const entities = pds.listRecords('app.pullread.entity');
    expect(entities.length).toBeGreaterThanOrEqual(1);
    pds.close();
  });

  test('skips already-extracted articles', async () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.extraction', null, { filename: 'test-article.md', extractedAt: new Date().toISOString() });

    await extractArticle(pds, {
      filename: 'test-article.md',
      title: 'Test',
      body: 'Test body',
    });

    expect(mockSummarize).not.toHaveBeenCalled();
    pds.close();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/research.test.ts --no-coverage`
Expected: FAIL — `extractArticle` not found

**Step 3: Implement extractArticle**

Add to `src/research.ts`:

```typescript
import { summarizeText } from './summarizer';

interface ArticleInput {
  filename: string;
  title: string;
  body: string;
  source?: string; // 'feed' | 'url-import' | 'google-drive'
}

interface ExtractionResult {
  entities: Array<{ name: string; type: string; role?: string }>;
  relationships: Array<{ from: string; to: string; type: string }>;
  themes: string[];
}

export async function extractArticle(
  pds: ReturnType<typeof createPDS>,
  article: ArticleInput,
): Promise<ExtractionResult | null> {
  // Check if already extracted
  const existing = pds.query('app.pullread.extraction', {
    where: { filename: article.filename },
  });
  if (existing.length > 0) return null;

  const prompt = `You are an analyst. Extract structured information from this document.
Return ONLY valid JSON with these fields:
- entities: array of { name, type, role? } where type is one of: person, company, technology, place, event, concept
- relationships: array of { from, to, type } describing connections between entities
- themes: array of strings

Document title: ${article.title}

${article.body.slice(0, 8000)}`;

  const result = await summarizeText(prompt);
  let parsed: ExtractionResult;
  try {
    parsed = JSON.parse(result.summary);
  } catch {
    // Try extracting JSON from markdown code block
    const jsonMatch = result.summary.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      return null;
    }
  }

  // Store entities
  for (const entity of parsed.entities) {
    pds.putRecord('app.pullread.entity', null, {
      name: entity.name,
      type: entity.type,
      role: entity.role || null,
      source: article.source || 'feed',
    });
  }

  // Store mentions linking entities to this article
  for (const entity of parsed.entities) {
    pds.putRecord('app.pullread.mention', null, {
      entityName: entity.name,
      filename: article.filename,
      title: article.title,
      source: article.source || 'feed',
    });
  }

  // Store relationships as edges
  for (const rel of parsed.relationships) {
    pds.putRecord('app.pullread.edge', null, {
      from: rel.from,
      to: rel.to,
      type: rel.type,
      sourceFilename: article.filename,
    });
  }

  // Mark as extracted
  pds.putRecord('app.pullread.extraction', null, {
    filename: article.filename,
    extractedAt: new Date().toISOString(),
    entityCount: parsed.entities.length,
    themes: parsed.themes,
  });

  return parsed;
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/research.test.ts --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/research.ts src/research.test.ts
git commit -m "Add article extraction pipeline with entity/mention/edge storage"
```

---

### Task 3: Entity resolution with embeddings

**Files:**
- Modify: `src/research.ts`
- Modify: `src/research.test.ts`

**Step 1: Write failing test — resolver merges duplicate entities**

```typescript
// Add to src/research.test.ts
import { initResolver, resolveEntities } from './research';

describe('entity resolution', () => {
  test('resolver is created with PDS and embedder', () => {
    const pds = createResearchPDS(':memory:');
    // Without a real Gemini key, this should return null gracefully
    const resolver = initResolver(pds, null);
    expect(resolver).toBeNull();
    pds.close();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/research.test.ts --no-coverage`
Expected: FAIL — `initResolver` not found

**Step 3: Implement initResolver**

Add to `src/research.ts`:

```typescript
import { createEmbedder } from 'loxodonta-core/embeddings';
import { geminiEmbeddings } from 'loxodonta-core/embeddings/gemini';
import { createResolver } from 'loxodonta-core/resolve';
import { createGraph } from 'loxodonta-core';

export function initResolver(
  pds: ReturnType<typeof createPDS>,
  geminiApiKey: string | null,
) {
  if (!geminiApiKey) return null;

  const embedder = createEmbedder({
    provider: geminiEmbeddings({
      apiKey: geminiApiKey,
      model: 'gemini-embedding-001',
    }),
    dimensions: 768,
  });

  const resolver = createResolver({ pds, embedder, threshold: 0.5 });
  return resolver;
}

export function createResearchGraph(pds: ReturnType<typeof createPDS>) {
  return createGraph(pds);
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/research.test.ts --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/research.ts src/research.test.ts
git commit -m "Add entity resolution and graph initialization"
```

---

### Task 4: Background extraction after sync

**Files:**
- Modify: `src/index.ts`
- Modify: `src/research.ts`
- Modify: `src/research.test.ts`

**Step 1: Write failing test — runBackgroundExtraction processes unextracted articles**

```typescript
// Add to src/research.test.ts
import { runBackgroundExtraction } from './research';
import { listMarkdownFiles } from './writer';
import { readFileSync } from 'fs';

jest.mock('./writer', () => ({
  listMarkdownFiles: jest.fn(),
  resolveFilePath: jest.fn((p: string) => p),
}));
const mockListFiles = listMarkdownFiles as jest.MockedFunction<typeof listMarkdownFiles>;

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, readFileSync: jest.fn(), existsSync: jest.fn().mockReturnValue(true) };
});
const mockReadFile = readFileSync as jest.MockedFunction<typeof readFileSync>;

describe('runBackgroundExtraction', () => {
  test('extracts unprocessed articles and skips already-extracted ones', async () => {
    const pds = createResearchPDS(':memory:');
    // Pre-mark one as extracted
    pds.putRecord('app.pullread.extraction', null, {
      filename: 'already-done.md',
      extractedAt: new Date().toISOString(),
    });

    mockListFiles.mockReturnValue(['/tmp/articles/already-done.md', '/tmp/articles/new-article.md']);
    mockReadFile.mockImplementation((path: any) => {
      if (String(path).includes('new-article')) {
        return '---\ntitle: "New Article"\nurl: "https://example.com"\nbookmarked: 2026-03-06\ndomain: example.com\n---\nArticle body text' as any;
      }
      return '---\ntitle: "Done"\nurl: "https://done.com"\nbookmarked: 2026-03-05\ndomain: done.com\n---\nDone' as any;
    });

    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'Example Corp', type: 'company' }],
        relationships: [],
        themes: ['tech'],
      }),
      model: 'test',
    });

    const stats = await runBackgroundExtraction(pds, '/tmp/articles');
    expect(stats.extracted).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(mockSummarize).toHaveBeenCalledTimes(1);
    pds.close();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/research.test.ts --no-coverage`
Expected: FAIL — `runBackgroundExtraction` not found

**Step 3: Implement runBackgroundExtraction**

Add to `src/research.ts`:

```typescript
import { readFileSync } from 'fs';
import { basename } from 'path';
import { listMarkdownFiles } from './writer';

function parseFrontmatterTitle(text: string): { title: string; body: string } | null {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/);
  if (!match) return null;
  const titleMatch = match[1].match(/^title:\s*"?(.+?)"?\s*$/m);
  return { title: titleMatch ? titleMatch[1] : 'Untitled', body: match[2] };
}

export async function runBackgroundExtraction(
  pds: ReturnType<typeof createPDS>,
  outputPath: string,
): Promise<{ extracted: number; skipped: number; errors: number }> {
  const allPaths = listMarkdownFiles(outputPath);
  const extracted = pds.listRecords('app.pullread.extraction');
  const extractedSet = new Set(extracted.map((r: any) => r.value.filename));

  let extractedCount = 0;
  let skipped = 0;
  let errors = 0;

  for (const filePath of allPaths) {
    const filename = basename(filePath);
    if (filename.startsWith('_')) { skipped++; continue; }
    if (extractedSet.has(filename)) { skipped++; continue; }

    try {
      const text = readFileSync(filePath, 'utf-8');
      const parsed = parseFrontmatterTitle(text);
      if (!parsed) { skipped++; continue; }

      await extractArticle(pds, {
        filename,
        title: parsed.title,
        body: parsed.body,
        source: 'feed',
      });
      extractedCount++;
    } catch (err) {
      errors++;
      console.log(`  Research extraction failed for ${filename}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return { extracted: extractedCount, skipped, errors };
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/research.test.ts --no-coverage`
Expected: PASS

**Step 5: Add post-sync hook in index.ts**

At the end of the `sync()` function in `src/index.ts`, after the auto-tagging block but before the `finally`:

```typescript
// Background research extraction
try {
  const { getResearchPDS, runBackgroundExtraction, closeResearchPDS } = await import('./research');
  const researchPds = getResearchPDS();
  const stats = await runBackgroundExtraction(researchPds, outputPath);
  if (stats.extracted > 0) {
    console.log(`  Research: extracted ${stats.extracted} articles (${stats.skipped} skipped, ${stats.errors} errors)`);
  }
} catch (err) {
  // Research extraction is non-blocking
  console.log(`  Research extraction skipped: ${err instanceof Error ? err.message : err}`);
}
```

**Step 6: Run test to verify it passes**

Run: `npx jest src/research.test.ts --no-coverage`
Expected: PASS

**Step 7: Commit**

```bash
git add src/research.ts src/research.test.ts src/index.ts
git commit -m "Add background extraction after sync"
```

---

### Task 5: Research API endpoints — graph queries

**Files:**
- Modify: `src/viewer.ts`
- Modify: `src/research.ts`
- Modify: `src/research.test.ts`

**Step 1: Write failing test — entity list query**

```typescript
// Add to src/research.test.ts
import { queryEntities, queryEntityProfile, queryRelatedEntities } from './research';

describe('graph queries', () => {
  test('queryEntities returns entities sorted by mention count', () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Apple', type: 'company' });
    pds.putRecord('app.pullread.entity', null, { name: 'Google', type: 'company' });
    pds.putRecord('app.pullread.mention', null, { entityName: 'Apple', filename: 'a.md', title: 'A' });
    pds.putRecord('app.pullread.mention', null, { entityName: 'Apple', filename: 'b.md', title: 'B' });
    pds.putRecord('app.pullread.mention', null, { entityName: 'Google', filename: 'c.md', title: 'C' });

    const results = queryEntities(pds, {});
    expect(results[0].name).toBe('Apple');
    expect(results[0].mentionCount).toBe(2);
    expect(results[1].name).toBe('Google');
    expect(results[1].mentionCount).toBe(1);
    pds.close();
  });

  test('queryEntities filters by search term', () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Apple', type: 'company' });
    pds.putRecord('app.pullread.entity', null, { name: 'Google', type: 'company' });

    const results = queryEntities(pds, { search: 'app' });
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Apple');
    pds.close();
  });

  test('queryEntities filters by type', () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Apple', type: 'company' });
    pds.putRecord('app.pullread.entity', null, { name: 'Tim Cook', type: 'person' });

    const results = queryEntities(pds, { type: 'person' });
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Tim Cook');
    pds.close();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/research.test.ts --no-coverage`
Expected: FAIL — `queryEntities` not found

**Step 3: Implement query functions**

Add to `src/research.ts`:

```typescript
interface EntityResult {
  rkey: string;
  name: string;
  type: string;
  mentionCount: number;
}

interface QueryOptions {
  search?: string;
  type?: string;
  limit?: number;
}

export function queryEntities(
  pds: ReturnType<typeof createPDS>,
  opts: QueryOptions,
): EntityResult[] {
  let entities = pds.listRecords('app.pullread.entity');

  if (opts.type) {
    entities = entities.filter((e: any) => e.value.type === opts.type);
  }
  if (opts.search) {
    const term = opts.search.toLowerCase();
    entities = entities.filter((e: any) => e.value.name.toLowerCase().includes(term));
  }

  const mentions = pds.listRecords('app.pullread.mention');
  const mentionCounts = new Map<string, number>();
  for (const m of mentions) {
    const name = m.value.entityName;
    mentionCounts.set(name, (mentionCounts.get(name) || 0) + 1);
  }

  const results: EntityResult[] = entities.map((e: any) => ({
    rkey: e.rkey,
    name: e.value.name,
    type: e.value.type,
    mentionCount: mentionCounts.get(e.value.name) || 0,
  }));

  results.sort((a, b) => b.mentionCount - a.mentionCount);
  return opts.limit ? results.slice(0, opts.limit) : results;
}

export function queryEntityProfile(
  pds: ReturnType<typeof createPDS>,
  rkey: string,
) {
  const entity = pds.getRecord('app.pullread.entity', rkey);
  if (!entity) return null;

  const mentions = pds.listRecords('app.pullread.mention')
    .filter((m: any) => m.value.entityName === entity.value.name);

  const edges = pds.listRecords('app.pullread.edge')
    .filter((e: any) => e.value.from === entity.value.name || e.value.to === entity.value.name);

  return { entity: entity.value, rkey, mentions, edges };
}

export function queryRelatedEntities(
  pds: ReturnType<typeof createPDS>,
  filename: string,
) {
  const mentions = pds.listRecords('app.pullread.mention')
    .filter((m: any) => m.value.filename === filename);

  const entityNames = new Set(mentions.map((m: any) => m.value.entityName));
  const entities = pds.listRecords('app.pullread.entity')
    .filter((e: any) => entityNames.has(e.value.name));

  return entities.map((e: any) => ({
    rkey: e.rkey,
    name: e.value.name,
    type: e.value.type,
  }));
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/research.test.ts --no-coverage`
Expected: PASS

**Step 5: Wire up API endpoints in viewer.ts**

Add to `src/viewer.ts` after the existing API routes (near the end of the request handler):

```typescript
// Research API
if (url.pathname === '/api/research/entities' && req.method === 'GET') {
  const { getResearchPDS, queryEntities } = await import('./research');
  const pds = getResearchPDS();
  const results = queryEntities(pds, {
    search: url.searchParams.get('search') || undefined,
    type: url.searchParams.get('type') || undefined,
    limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined,
  });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(results));
  return;
}

if (url.pathname.startsWith('/api/research/entity/') && req.method === 'GET') {
  const parts = url.pathname.split('/');
  const rkey = parts[4];
  const subpath = parts[5]; // 'graph' or undefined
  const { getResearchPDS, queryEntityProfile, createResearchGraph } = await import('./research');
  const pds = getResearchPDS();

  if (subpath === 'graph') {
    const graph = createResearchGraph(pds);
    const depth = parseInt(url.searchParams.get('depth') || '1', 10);
    const subgraph = graph.traverse(rkey, { depth });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(subgraph));
    return;
  }

  const profile = queryEntityProfile(pds, rkey);
  if (!profile) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Entity not found' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(profile));
  return;
}

if (url.pathname.startsWith('/api/research/related/') && req.method === 'GET') {
  const filename = decodeURIComponent(url.pathname.split('/').pop()!);
  const { getResearchPDS, queryRelatedEntities } = await import('./research');
  const pds = getResearchPDS();
  const entities = queryRelatedEntities(pds, filename);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(entities));
  return;
}

if (url.pathname === '/api/research/status' && req.method === 'GET') {
  const { getResearchPDS } = await import('./research');
  const pds = getResearchPDS();
  const extractions = pds.listRecords('app.pullread.extraction');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    extractedCount: extractions.length,
    lastExtraction: extractions.length > 0
      ? extractions[extractions.length - 1].value.extractedAt
      : null,
  }));
  return;
}
```

**Step 6: Commit**

```bash
git add src/research.ts src/research.test.ts src/viewer.ts
git commit -m "Add research API endpoints for entity queries and status"
```

---

### Task 6: On-demand URL extraction endpoint

**Files:**
- Modify: `src/viewer.ts`
- Modify: `src/research.ts`
- Modify: `src/research.test.ts`

**Step 1: Write failing test**

```typescript
// Add to src/research.test.ts
import { extractFromUrl } from './research';

jest.mock('./extractor', () => ({
  fetchAndExtract: jest.fn(),
}));
import { fetchAndExtract } from './extractor';
const mockFetchAndExtract = fetchAndExtract as jest.MockedFunction<typeof fetchAndExtract>;

describe('extractFromUrl', () => {
  test('fetches URL content and runs extraction', async () => {
    const pds = createResearchPDS(':memory:');
    mockFetchAndExtract.mockResolvedValue({
      title: 'Test Page',
      markdown: 'Page content about Apple.',
      url: 'https://example.com/page',
      domain: 'example.com',
      excerpt: '',
    });
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'Apple', type: 'company' }],
        relationships: [],
        themes: ['tech'],
      }),
      model: 'test',
    });

    const result = await extractFromUrl(pds, 'https://example.com/page');
    expect(result).not.toBeNull();
    expect(result!.entities.length).toBe(1);

    const extractions = pds.listRecords('app.pullread.extraction');
    expect(extractions[0].value.source).toBe('url-import');
    pds.close();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/research.test.ts --no-coverage`
Expected: FAIL — `extractFromUrl` not found

**Step 3: Implement extractFromUrl**

Add to `src/research.ts`:

```typescript
import { fetchAndExtract } from './extractor';

export async function extractFromUrl(
  pds: ReturnType<typeof createPDS>,
  url: string,
): Promise<ExtractionResult | null> {
  const content = await fetchAndExtract(url);
  if (!content || !content.markdown) return null;

  const filename = `url-import-${Date.now()}.md`;
  return extractArticle(pds, {
    filename,
    title: content.title || url,
    body: content.markdown,
    source: 'url-import',
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/research.test.ts --no-coverage`
Expected: PASS

**Step 5: Wire up API endpoint in viewer.ts**

```typescript
if (url.pathname === '/api/research/extract-url' && req.method === 'POST') {
  let body = '';
  req.on('data', (chunk: Buffer) => { body += chunk; });
  req.on('end', async () => {
    try {
      const { url: targetUrl } = JSON.parse(body);
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'url is required' }));
        return;
      }
      const { getResearchPDS, extractFromUrl } = await import('./research');
      const pds = getResearchPDS();
      const result = await extractFromUrl(pds, targetUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result || { entities: [], relationships: [], themes: [] }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Extraction failed' }));
    }
  });
  return;
}
```

**Step 6: Commit**

```bash
git add src/research.ts src/research.test.ts src/viewer.ts
git commit -m "Add on-demand URL extraction endpoint"
```

---

### Task 7: Google Drive connector

**Files:**
- Create: `src/google-drive.ts`
- Create: `src/google-drive.test.ts`
- Modify: `src/viewer.ts`

**Step 1: Install googleapis**

Run: `npm install googleapis`

**Step 2: Write failing test — Drive client creation and auth URL**

```typescript
// src/google-drive.test.ts
// ABOUTME: Tests for Google Drive OAuth and file operations
// ABOUTME: Verifies auth URL generation, token storage, and file listing

import { createDriveConnector } from './google-drive';
import { createResearchPDS } from './research';

describe('Google Drive connector', () => {
  test('generates auth URL when configured', () => {
    const pds = createResearchPDS(':memory:');
    const drive = createDriveConnector({
      clientId: 'test-client-id',
      clientSecret: 'test-secret',
      redirectUri: 'http://localhost:7777/auth/google/callback',
      pds,
    });
    const url = drive.getAuthUrl();
    expect(url).toContain('accounts.google.com');
    expect(url).toContain('test-client-id');
    pds.close();
  });

  test('isConnected returns false with no tokens', () => {
    const pds = createResearchPDS(':memory:');
    const drive = createDriveConnector({
      clientId: 'test-client-id',
      clientSecret: 'test-secret',
      redirectUri: 'http://localhost:7777/auth/google/callback',
      pds,
    });
    expect(drive.isConnected()).toBe(false);
    pds.close();
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx jest src/google-drive.test.ts --no-coverage`
Expected: FAIL — cannot resolve `./google-drive`

**Step 4: Implement google-drive.ts**

Port the Drive connector from loxodonta-core's reference app, adapting it to use `app.pullread.googleAuth` collection:

```typescript
// src/google-drive.ts
// ABOUTME: Google Drive OAuth and file operations for Research tab
// ABOUTME: Handles auth flow, file browsing, and document export via googleapis

import { google } from 'googleapis';

interface DriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  pds: any; // PDS instance
}

export function createDriveConnector({ clientId, clientSecret, redirectUri, pds }: DriveConfig) {
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  function loadTokens() {
    const records = pds.listRecords('app.pullread.googleAuth', { limit: 1 });
    return records.length ? records[0] : null;
  }

  function saveTokens(tokens: any) {
    const existing = loadTokens();
    const rkey = existing ? existing.rkey : null;
    pds.putRecord('app.pullread.googleAuth', rkey, tokens);
  }

  function isConnected() {
    const record = loadTokens();
    return !!record?.value?.refreshToken;
  }

  function getAuthUrl() {
    return oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive.readonly'],
    });
  }

  async function handleCallback(code: string) {
    const { tokens } = await oauth2.getToken(code);
    saveTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiry: tokens.expiry_date,
    });
    return tokens;
  }

  async function getAuthedClient() {
    const record = loadTokens();
    if (!record?.value?.refreshToken) throw new Error('Not connected to Google');
    oauth2.setCredentials({
      access_token: record.value.accessToken,
      refresh_token: record.value.refreshToken,
      expiry_date: record.value.expiry,
    });
    const now = Date.now();
    if (!record.value.expiry || record.value.expiry < now + 60000) {
      const { credentials } = await oauth2.refreshAccessToken();
      saveTokens({
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || record.value.refreshToken,
        expiry: credentials.expiry_date,
      });
      oauth2.setCredentials(credentials);
    }
    return google.drive({ version: 'v3', auth: oauth2 });
  }

  async function listFiles(folderId = 'root', pageToken: string | null = null) {
    const drive = await getAuthedClient();
    const query = `'${folderId}' in parents and trashed = false`;
    const res = await drive.files.list({
      q: query,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
      pageSize: 100,
      pageToken: pageToken || undefined,
      orderBy: 'name',
    });
    return { files: res.data.files, nextPageToken: res.data.nextPageToken };
  }

  async function exportDoc(fileId: string) {
    const drive = await getAuthedClient();
    const meta = await drive.files.get({ fileId, fields: 'mimeType, name' });
    if (meta.data.mimeType === 'application/vnd.google-apps.document') {
      const res = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'text' });
      return { text: res.data as string, name: meta.data.name, mimeType: meta.data.mimeType };
    }
    if (meta.data.mimeType === 'application/vnd.google-apps.spreadsheet') {
      const res = await drive.files.export({ fileId, mimeType: 'text/csv' }, { responseType: 'text' });
      return { text: res.data as string, name: meta.data.name, mimeType: meta.data.mimeType };
    }
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return { buffer: Buffer.from(res.data as ArrayBuffer), name: meta.data.name, mimeType: meta.data.mimeType };
  }

  function disconnect() {
    const record = loadTokens();
    if (record) pds.deleteRecord('app.pullread.googleAuth', record.rkey);
  }

  return { getAuthUrl, handleCallback, isConnected, listFiles, exportDoc, disconnect };
}
```

**Step 5: Run test to verify it passes**

Run: `npx jest src/google-drive.test.ts --no-coverage`
Expected: PASS

**Step 6: Wire up Drive API endpoints in viewer.ts**

Add Drive endpoints to viewer.ts (auth URL, callback, file listing, import, disconnect). See design doc for endpoint signatures.

**Step 7: Commit**

```bash
git add src/google-drive.ts src/google-drive.test.ts src/viewer.ts package.json package-lock.json
git commit -m "Add Google Drive connector with OAuth and file operations"
```

---

### Task 8: Viewer — Research tab sidebar entry and page skeleton

**Files:**
- Modify: `viewer/05-sidebar.js`
- Create: `viewer/19-research.js`
- Modify: `viewer.css`
- Modify: `scripts/embed-viewer.ts`

**Step 1: Add Research nav item to sidebar**

In `viewer/05-sidebar.js`, add a "Research" nav item below Notebook using the existing pattern. Use a graph/network Heroicon (e.g., `share-nodes` or similar).

**Step 2: Create viewer/19-research.js with page skeleton**

```javascript
// viewer/19-research.js
// ABOUTME: Research tab — knowledge graph dashboard for browsing extracted entities
// ABOUTME: Three-panel layout: entity list, entity detail, graph visualization

function showResearch() {
  var main = document.getElementById('article-body');
  if (!main) return;

  var html = '<div class="article-header"><h1>Research</h1></div>';
  html += '<div class="research-layout">';
  html += '<div class="research-entity-list" id="research-entities">';
  html += '<div class="research-search"><input type="text" id="research-search" placeholder="Search entities..." />';
  html += '<div class="research-type-filters" id="research-type-filters"></div></div>';
  html += '<div id="research-entity-items"></div>';
  html += '</div>';
  html += '<div class="research-detail" id="research-detail">';
  html += '<p class="briefing-hint">Select an entity to view details</p>';
  html += '</div>';
  html += '<div class="research-graph" id="research-graph"></div>';
  html += '</div>';

  main.innerHTML = html;
  loadResearchEntities();
}

function loadResearchEntities(search, type) {
  var params = [];
  if (search) params.push('search=' + encodeURIComponent(search));
  if (type) params.push('type=' + encodeURIComponent(type));
  var qs = params.length ? '?' + params.join('&') : '';

  fetch('/api/research/entities' + qs)
    .then(function(r) { return r.json(); })
    .then(function(entities) {
      renderEntityList(entities);
    });
}

function renderEntityList(entities) {
  var container = document.getElementById('research-entity-items');
  if (!container) return;
  if (entities.length === 0) {
    container.innerHTML = '<p class="briefing-hint">No entities found. Entities are extracted from your articles after sync.</p>';
    return;
  }
  var html = '';
  for (var i = 0; i < entities.length; i++) {
    var e = entities[i];
    html += '<div class="research-entity-row" data-rkey="' + e.rkey + '" onclick="loadEntityDetail(\'' + e.rkey + '\')">';
    html += '<span class="research-entity-name">' + escapeHtml(e.name) + '</span>';
    html += '<span class="research-entity-type">' + escapeHtml(e.type) + '</span>';
    html += '<span class="research-entity-count">' + e.mentionCount + '</span>';
    html += '</div>';
  }
  container.innerHTML = html;
}

function loadEntityDetail(rkey) {
  fetch('/api/research/entity/' + rkey)
    .then(function(r) { return r.json(); })
    .then(function(profile) {
      renderEntityDetail(profile);
    });
}

function renderEntityDetail(profile) {
  var container = document.getElementById('research-detail');
  if (!container || !profile.entity) return;
  var e = profile.entity;
  var html = '<h2>' + escapeHtml(e.name) + '</h2>';
  html += '<span class="research-entity-type">' + escapeHtml(e.type) + '</span>';

  if (profile.mentions && profile.mentions.length > 0) {
    html += '<h3>Mentioned in</h3><ul>';
    for (var i = 0; i < profile.mentions.length; i++) {
      var m = profile.mentions[i];
      html += '<li><a href="#" onclick="openFile(\'' + escapeJsStr(m.value.filename) + '\');return false">' + escapeHtml(m.value.title) + '</a></li>';
    }
    html += '</ul>';
  }

  if (profile.edges && profile.edges.length > 0) {
    html += '<h3>Related</h3><ul>';
    for (var i = 0; i < profile.edges.length; i++) {
      var edge = profile.edges[i];
      var other = edge.value.from === e.name ? edge.value.to : edge.value.from;
      html += '<li>' + escapeHtml(other) + ' <span class="research-edge-type">' + escapeHtml(edge.value.type) + '</span></li>';
    }
    html += '</ul>';
  }

  container.innerHTML = html;
}
```

**Step 3: Add Research CSS to viewer.css**

Add styles for `.research-layout` (three-column grid), `.research-entity-list`, `.research-detail`, `.research-graph`, `.research-entity-row`, `.research-entity-type` badge, etc.

**Step 4: Register in embed-viewer.ts**

Add `19-research.js` to the viewer file list in `scripts/embed-viewer.ts`.

**Step 5: Build and verify**

Run: `bun run scripts/embed-viewer.ts && npm run build`

**Step 6: Commit**

```bash
git add viewer/19-research.js viewer/05-sidebar.js viewer.css scripts/embed-viewer.ts src/viewer-html.ts
git commit -m "Add Research tab skeleton with entity list and detail panels"
```

---

### Task 9: Graph visualization WebComponent

**Files:**
- Create: `viewer/20-research-graph.js`
- Modify: `viewer.css`
- Modify: `scripts/embed-viewer.ts`

**Step 1: Create `<pr-research-graph>` WebComponent**

A canvas-based force-directed graph renderer. Receives nodes and edges via a `render(data)` method. Nodes are circles with labels, edges are lines. Clicking a node dispatches a custom event to navigate the entity detail panel. Supports depth toggle.

Follow the same pattern as `<pr-social-card>` — extends `HTMLElement`, no shadow DOM, `render()` method.

**Step 2: Wire into the Research tab**

When an entity is selected, fetch `/api/research/entity/:rkey/graph?depth=1` and pass the result to `<pr-research-graph>`.

**Step 3: Build and verify**

Run: `bun run scripts/embed-viewer.ts && npm run build`

**Step 4: Commit**

```bash
git add viewer/20-research-graph.js viewer.css scripts/embed-viewer.ts src/viewer-html.ts
git commit -m "Add <pr-research-graph> WebComponent for entity visualization"
```

---

### Task 10: Research settings and configuration

**Files:**
- Modify: `viewer/03-settings.js`
- Modify: `src/viewer.ts`

**Step 1: Add Research section to Settings**

Under a "Research" heading:
- Gemini API key field (for embeddings)
- Extraction toggle (on/off)
- Google Drive connect/disconnect button
- "Re-extract all" button
- Extraction status (X of Y articles extracted)

**Step 2: Add `/api/research/config` and `/api/research/reextract` endpoints**

**Step 3: Build and verify**

Run: `bun run scripts/embed-viewer.ts && npm run build`

**Step 4: Commit**

```bash
git add viewer/03-settings.js src/viewer.ts src/viewer-html.ts
git commit -m "Add Research settings panel with extraction config and Drive connection"
```

---

### Task 11: Integration testing and polish

**Files:**
- Modify: `src/research.test.ts`
- Modify: `src/google-drive.test.ts`

**Step 1: Add integration test — full pipeline**

Test: markdown article → `extractArticle` → `queryEntities` → `queryEntityProfile` → verify mentions link back to source.

**Step 2: Add extraction status endpoint test**

Test: `/api/research/status` returns correct counts after extraction.

**Step 3: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All existing + new tests pass

**Step 4: Build final binary**

Run: `bun run scripts/embed-viewer.ts && npm run build`

**Step 5: Commit**

```bash
git add src/research.test.ts src/google-drive.test.ts
git commit -m "Add integration tests for research extraction pipeline"
```
