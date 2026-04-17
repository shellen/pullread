// ABOUTME: Tests for research knowledge graph — PDS lifecycle, extraction, entity queries
// ABOUTME: Verifies createResearchPDS initializes storage and closes without error

import { createResearchPDS, extractArticle, extractNote, runBackgroundExtraction, queryEntities, queryEntityProfile, queryRelatedEntities, queryGraphData, queryTensions, addWatch, removeWatch, listWatches, checkWatchMatches, getUnseenMatches, markMatchesSeen, resetResearchData, extractFromUrl, normalizeEntityName, generateEntityBrief, gatherEntityContext } from './research';
import { summarizeText } from './summarizer';
import { listMarkdownFiles } from './writer';
import { readFileSync } from 'fs';

jest.mock('./summarizer', () => ({
  summarizeText: jest.fn(),
}));
const mockSummarize = summarizeText as jest.MockedFunction<typeof summarizeText>;

jest.mock('./writer', () => ({
  listMarkdownFiles: jest.fn(),
}));
const mockListFiles = listMarkdownFiles as jest.MockedFunction<typeof listMarkdownFiles>;

jest.mock('fs', () => {
  const actual = require('fs');
  return { ...actual, readFileSync: jest.fn() };
});
const mockReadFile = readFileSync as jest.MockedFunction<typeof readFileSync>;

jest.mock('./extractor', () => ({
  fetchAndExtract: jest.fn(),
}));
import { fetchAndExtract } from './extractor';
const mockFetchAndExtract = fetchAndExtract as jest.MockedFunction<typeof fetchAndExtract>;

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

  test('parses JSON wrapped in markdown fences', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: '```json\n' + JSON.stringify({
        entities: [{ name: 'Fenced', type: 'company' }],
        relationships: [],
        themes: [],
      }) + '\n```',
      model: 'test',
    });

    const result = await extractArticle(pds, {
      filename: 'fenced.md', title: 'Fenced', body: 'x',
    });

    expect(result).not.toBeNull();
    expect(result!.entities[0].name).toBe('Fenced');
    pds.close();
  });

  test('logs warning and returns null on malformed JSON', async () => {
    const pds = createResearchPDS(':memory:');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSummarize.mockResolvedValue({ summary: 'not json at all', model: 'test' });

    const result = await extractArticle(pds, {
      filename: 'bad.md', title: 'Bad', body: 'x',
    });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toMatch(/research.*parse/i);
    warnSpy.mockRestore();
    pds.close();
  });

  test('deduplicates entities across multiple articles', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'Ukraine', type: 'place' }],
        relationships: [],
        themes: ['politics'],
      }),
      model: 'test',
    });

    await extractArticle(pds, {
      filename: 'article-1.md',
      title: 'First Article',
      body: 'Article about Ukraine.',
    });

    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'Ukraine', type: 'place' }],
        relationships: [],
        themes: ['politics'],
      }),
      model: 'test',
    });

    await extractArticle(pds, {
      filename: 'article-2.md',
      title: 'Second Article',
      body: 'Another article about Ukraine.',
    });

    const entities = pds.listRecords('app.pullread.entity');
    expect(entities.length).toBe(1);
    expect(entities[0].value.name).toBe('Ukraine');

    const mentions = pds.listRecords('app.pullread.mention');
    expect(mentions.length).toBe(2);
    pds.close();
  });

  test('normalizes stray entity types to canonical set', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [
          { name: 'The Beatles', type: 'band' },
          { name: 'Aspirin', type: 'chemical compound' },
          { name: 'Reddit', type: 'website' },
          { name: 'Grammy', type: 'award' },
        ],
        relationships: [],
        themes: [],
      }),
      model: 'test',
    });

    await extractArticle(pds, {
      filename: 'types-test.md',
      title: 'Type Test',
      body: 'Testing type normalization.',
    });

    const entities = pds.listRecords('app.pullread.entity');
    const types = entities.map((e: any) => ({ name: e.value.name, type: e.value.type }));
    expect(types).toEqual([
      { name: 'The Beatles', type: 'company' },
      { name: 'Aspirin', type: 'concept' },
      { name: 'Reddit', type: 'place' },
      { name: 'Grammy', type: 'concept' },
    ]);
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

describe('entity resolution', () => {
  test('resolver returns null without API key', () => {
    const pds = createResearchPDS(':memory:');
    const { initResolver } = require('./research');
    const resolver = initResolver(pds, null);
    expect(resolver).toBeNull();
    pds.close();
  });
});

describe('runBackgroundExtraction', () => {
  beforeEach(() => {
    mockSummarize.mockReset();
    mockListFiles.mockReset();
    mockReadFile.mockReset();
  });

  test('extracts unprocessed articles and skips already-extracted ones', async () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.extraction', null, {
      filename: 'already-done.md',
      extractedAt: new Date().toISOString(),
    });

    mockListFiles.mockReturnValue(['/tmp/articles/already-done.md', '/tmp/articles/new-article.md']);
    mockReadFile.mockImplementation((path: any) => {
      if (String(path).includes('new-article')) {
        return '---\ntitle: "New Article"\nurl: "https://example.com"\n---\nArticle body text' as any;
      }
      return '---\ntitle: "Done"\nurl: "https://done.com"\n---\nDone' as any;
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

  test('queryEntityProfile returns entity with mentions and edges', () => {
    const pds = createResearchPDS(':memory:');
    const record = pds.putRecord('app.pullread.entity', null, { name: 'Apple', type: 'company' });
    const rkey = record.rkey;
    pds.putRecord('app.pullread.mention', null, { entityName: 'Apple', filename: 'a.md', title: 'Article A' });
    pds.putRecord('app.pullread.edge', null, { from: 'Apple', to: 'Tim Cook', type: 'employs', sourceFilename: 'a.md' });

    const profile = queryEntityProfile(pds, rkey);
    expect(profile).not.toBeNull();
    expect(profile!.entity.name).toBe('Apple');
    expect(profile!.mentions.length).toBe(1);
    expect(profile!.edges.length).toBe(1);
    pds.close();
  });

  test('queryRelatedEntities returns entities mentioned in a file', () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Apple', type: 'company' });
    pds.putRecord('app.pullread.entity', null, { name: 'Google', type: 'company' });
    pds.putRecord('app.pullread.mention', null, { entityName: 'Apple', filename: 'a.md', title: 'A' });
    pds.putRecord('app.pullread.mention', null, { entityName: 'Google', filename: 'b.md', title: 'B' });

    const related = queryRelatedEntities(pds, 'a.md');
    expect(related.length).toBe(1);
    expect(related[0].name).toBe('Apple');
    pds.close();
  });
});

describe('queryGraphData', () => {
  test('returns all entities with mention counts and all edges', () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Apple', type: 'company' });
    pds.putRecord('app.pullread.entity', null, { name: 'Tim Cook', type: 'person' });
    pds.putRecord('app.pullread.mention', null, { entityName: 'Apple', filename: 'a.md', title: 'A' });
    pds.putRecord('app.pullread.mention', null, { entityName: 'Apple', filename: 'b.md', title: 'B' });
    pds.putRecord('app.pullread.mention', null, { entityName: 'Tim Cook', filename: 'a.md', title: 'A' });
    pds.putRecord('app.pullread.edge', null, { from: 'Apple', to: 'Tim Cook', type: 'employs', sourceFilename: 'a.md' });

    const graph = queryGraphData(pds);
    expect(graph.entities.length).toBe(2);
    expect(graph.entities.find((e: any) => e.name === 'Apple')!.mentionCount).toBe(2);
    expect(graph.edges.length).toBe(1);
    expect(graph.edges[0].value.from).toBe('Apple');
    pds.close();
  });

  test('caps entities at maxNodes, sorted by mention count', () => {
    const pds = createResearchPDS(':memory:');
    for (let i = 0; i < 5; i++) {
      pds.putRecord('app.pullread.entity', null, { name: `Entity${i}`, type: 'concept' });
      for (let j = 0; j <= i; j++) {
        pds.putRecord('app.pullread.mention', null, { entityName: `Entity${i}`, filename: `${j}.md`, title: `T${j}` });
      }
    }

    const graph = queryGraphData(pds, { maxNodes: 3 });
    expect(graph.entities.length).toBe(3);
    expect(graph.entities[0].name).toBe('Entity4'); // 5 mentions
    expect(graph.overflow).toBe(2);
    pds.close();
  });

  test('applies 2x weight multiplier to note-origin mentions', () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Apple', type: 'company' });
    pds.putRecord('app.pullread.entity', null, { name: 'Google', type: 'company' });
    // Apple: 1 extracted mention
    pds.putRecord('app.pullread.mention', null, { entityName: 'Apple', filename: 'a.md', title: 'A', origin: 'extracted' });
    // Google: 1 note mention (should count as 2)
    pds.putRecord('app.pullread.mention', null, { entityName: 'Google', filename: 'note:n1', title: 'N', origin: 'note' });

    const graph = queryGraphData(pds);
    const apple = graph.entities.find((e: any) => e.name === 'Apple')!;
    const google = graph.entities.find((e: any) => e.name === 'Google')!;
    expect(google.weightedMentionCount).toBe(2); // 1 note x 2
    expect(apple.weightedMentionCount).toBe(1);  // 1 extracted x 1
    // Google should sort before Apple due to higher weighted count
    expect(graph.entities[0].name).toBe('Google');
    pds.close();
  });
  test('includes origin field on edges in graph data', () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'A', type: 'concept' });
    pds.putRecord('app.pullread.entity', null, { name: 'B', type: 'concept' });
    pds.putRecord('app.pullread.mention', null, { entityName: 'A', filename: 'a.md', title: 'A' });
    pds.putRecord('app.pullread.mention', null, { entityName: 'B', filename: 'b.md', title: 'B' });
    pds.putRecord('app.pullread.edge', null, { from: 'A', to: 'B', type: 'relates', origin: 'note', sourceFilename: 'note:n1' });

    const graph = queryGraphData(pds);
    expect(graph.edges[0].value.origin).toBe('note');
    pds.close();
  });
});

describe('sentiment extraction', () => {
  beforeEach(() => mockSummarize.mockReset());

  test('stores sentiment and stance on mention records', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'Apple', type: 'company', sentiment: 'positive', stance: 'innovative design' }],
        relationships: [],
        themes: ['technology'],
      }),
      model: 'test',
    });

    await extractArticle(pds, {
      filename: 'sentiment-test.md',
      title: 'Apple Review',
      body: 'Apple has an innovative design.',
      publishedAt: '2026-03-01T00:00:00Z',
    });

    const mentions = pds.listRecords('app.pullread.mention');
    expect(mentions.length).toBe(1);
    expect(mentions[0].value.sentiment).toBe('positive');
    expect(mentions[0].value.stance).toBe('innovative design');
    expect(mentions[0].value.publishedAt).toBe('2026-03-01T00:00:00Z');
    pds.close();
  });

  test('defaults sentiment to neutral when not provided', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'Google', type: 'company' }],
        relationships: [],
        themes: [],
      }),
      model: 'test',
    });

    await extractArticle(pds, {
      filename: 'no-sentiment.md',
      title: 'Google News',
      body: 'Google did a thing.',
    });

    const mentions = pds.listRecords('app.pullread.mention');
    expect(mentions[0].value.sentiment).toBe('neutral');
    expect(mentions[0].value.stance).toBeNull();
    pds.close();
  });
});

describe('tension detection', () => {
  test('queryTensions surfaces entities with divergent sentiment', () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Macbook Neo', type: 'technology' });

    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Macbook Neo', filename: 'a.md', title: 'Great Review',
      sentiment: 'positive', stance: 'innovative design', publishedAt: '2026-03-01',
    });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Macbook Neo', filename: 'b.md', title: 'Thermal Issues',
      sentiment: 'negative', stance: 'thermal throttling', publishedAt: '2026-03-02',
    });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Macbook Neo', filename: 'c.md', title: 'Neutral Take',
      sentiment: 'positive', stance: 'sleek hardware', publishedAt: '2026-03-03',
    });

    const tensions = queryTensions(pds);
    expect(tensions.length).toBe(1);
    expect(tensions[0].entityName).toBe('Macbook Neo');
    expect(tensions[0].positive.length).toBe(2);
    expect(tensions[0].negative.length).toBe(1);
    expect(tensions[0].negative[0].stance).toBe('thermal throttling');
    pds.close();
  });

  test('does not flag entities with uniform sentiment', () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Boring Corp', type: 'company' });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Boring Corp', filename: 'a.md', title: 'Fine',
      sentiment: 'neutral', stance: null, publishedAt: '2026-03-01',
    });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Boring Corp', filename: 'b.md', title: 'Also Fine',
      sentiment: 'neutral', stance: null, publishedAt: '2026-03-02',
    });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Boring Corp', filename: 'c.md', title: 'Still Fine',
      sentiment: 'neutral', stance: null, publishedAt: '2026-03-03',
    });

    const tensions = queryTensions(pds);
    expect(tensions.length).toBe(0);
    pds.close();
  });

  test('requires minimum 3 mentions to be a tension', () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Small Topic', type: 'concept' });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Small Topic', filename: 'a.md', title: 'Pro',
      sentiment: 'positive', stance: 'good', publishedAt: '2026-03-01',
    });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Small Topic', filename: 'b.md', title: 'Con',
      sentiment: 'negative', stance: 'bad', publishedAt: '2026-03-02',
    });

    const tensions = queryTensions(pds);
    expect(tensions.length).toBe(0);
    pds.close();
  });
});

describe('watchlists', () => {
  beforeEach(() => mockSummarize.mockReset());

  test('add and list entity watches', () => {
    const pds = createResearchPDS(':memory:');
    const watch = addWatch(pds, { type: 'entity', entityName: 'Apple' });
    expect(watch.rkey).toBeDefined();

    const watches = listWatches(pds);
    expect(watches.length).toBe(1);
    expect(watches[0].value.entityName).toBe('Apple');
    expect(watches[0].value.type).toBe('entity');
    pds.close();
  });

  test('add and list query watches', () => {
    const pds = createResearchPDS(':memory:');
    addWatch(pds, { type: 'query', query: 'AI regulation' });

    const watches = listWatches(pds);
    expect(watches.length).toBe(1);
    expect(watches[0].value.query).toBe('AI regulation');
    pds.close();
  });

  test('remove a watch', () => {
    const pds = createResearchPDS(':memory:');
    const watch = addWatch(pds, { type: 'entity', entityName: 'Apple' });
    removeWatch(pds, watch.rkey);

    const watches = listWatches(pds);
    expect(watches.length).toBe(0);
    pds.close();
  });

  test('checkWatchMatches finds new mentions for entity watches', () => {
    const pds = createResearchPDS(':memory:');
    addWatch(pds, { type: 'entity', entityName: 'Apple' });

    // Simulate extraction having stored mentions
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Apple', filename: 'new-article.md', title: 'Apple News',
      sentiment: 'positive', stance: 'strong earnings', publishedAt: '2026-03-06',
    });

    const matches = checkWatchMatches(pds);
    expect(matches).toBe(1);

    const unseen = getUnseenMatches(pds);
    expect(unseen.length).toBe(1);
    expect(unseen[0].value.filename).toBe('new-article.md');
    pds.close();
  });

  test('checkWatchMatches finds articles matching query watches', () => {
    const pds = createResearchPDS(':memory:');
    addWatch(pds, { type: 'query', query: 'AI regulation' });

    // Simulate extraction with themes
    pds.putRecord('app.pullread.extraction', null, {
      filename: 'ai-article.md', extractedAt: '2026-03-06T00:00:00Z',
      entityCount: 2, themes: ['AI regulation', 'policy'], source: 'feed',
    });

    const matches = checkWatchMatches(pds);
    expect(matches).toBe(1);

    const unseen = getUnseenMatches(pds);
    expect(unseen.length).toBe(1);
    expect(unseen[0].value.filename).toBe('ai-article.md');
    pds.close();
  });

  test('does not create duplicate matches', () => {
    const pds = createResearchPDS(':memory:');
    addWatch(pds, { type: 'entity', entityName: 'Apple' });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Apple', filename: 'a.md', title: 'A',
      sentiment: 'neutral', stance: null, publishedAt: '2026-03-06',
    });

    checkWatchMatches(pds);
    checkWatchMatches(pds); // run again

    const unseen = getUnseenMatches(pds);
    expect(unseen.length).toBe(1);
    pds.close();
  });

  test('markMatchesSeen clears unseen matches', () => {
    const pds = createResearchPDS(':memory:');
    addWatch(pds, { type: 'entity', entityName: 'Apple' });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Apple', filename: 'a.md', title: 'A',
      sentiment: 'neutral', stance: null, publishedAt: '2026-03-06',
    });
    checkWatchMatches(pds);

    markMatchesSeen(pds);
    const unseen = getUnseenMatches(pds);
    expect(unseen.length).toBe(0);
    pds.close();
  });
});

describe('entity name normalization', () => {
  test('normalizeEntityName strips leading articles', () => {
    expect(normalizeEntityName('The New York Times')).toBe('new york times');
    expect(normalizeEntityName('A Brief History')).toBe('brief history');
    expect(normalizeEntityName('An Example')).toBe('example');
  });

  test('normalizeEntityName trims and lowercases', () => {
    expect(normalizeEntityName('  Apple  ')).toBe('apple');
    expect(normalizeEntityName('GOOGLE')).toBe('google');
  });

  test('normalizeEntityName strips title prefixes', () => {
    expect(normalizeEntityName('President Trump')).toBe('trump');
    expect(normalizeEntityName('Dr. Fauci')).toBe('fauci');
    expect(normalizeEntityName('Sen. Warren')).toBe('warren');
  });

  test('normalizeEntityName normalizes abbreviations', () => {
    expect(normalizeEntityName('U.S.')).toBe('us');
    expect(normalizeEntityName('U.S. officials')).toBe('us officials');
    expect(normalizeEntityName('U.K.')).toBe('uk');
  });

  test('extraction merges entities with matching normalized names', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'New York Times Magazine', type: 'company' }],
        relationships: [],
        themes: ['media'],
      }),
      model: 'test',
    });

    await extractArticle(pds, {
      filename: 'article-1.md',
      title: 'First Article',
      body: 'About New York Times Magazine.',
    });

    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'The New York Times Magazine', type: 'company' }],
        relationships: [],
        themes: ['media'],
      }),
      model: 'test',
    });

    await extractArticle(pds, {
      filename: 'article-2.md',
      title: 'Second Article',
      body: 'About The New York Times Magazine.',
    });

    const entities = pds.listRecords('app.pullread.entity');
    expect(entities.length).toBe(1);
    expect(entities[0].value.name).toBe('New York Times Magazine');

    // Both mentions should point to the original name
    const mentions = pds.listRecords('app.pullread.mention');
    expect(mentions.length).toBe(2);
    expect(mentions[0].value.entityName).toBe('New York Times Magazine');
    expect(mentions[1].value.entityName).toBe('New York Times Magazine');
    pds.close();
  });

  test('extraction merges title variants and abbreviations', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [
          { name: 'Trump', type: 'person' },
          { name: 'Iran', type: 'place' },
        ],
        relationships: [{ from: 'Trump', to: 'Iran', type: 'sanctions' }],
        themes: ['politics'],
      }),
      model: 'test',
    });

    await extractArticle(pds, {
      filename: 'article-1.md',
      title: 'First',
      body: 'Trump and Iran.',
    });

    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [
          { name: 'President Trump', type: 'person' },
          { name: 'The Pentagon', type: 'company' },
        ],
        relationships: [{ from: 'President Trump', to: 'The Pentagon', type: 'directs' }],
        themes: ['politics'],
      }),
      model: 'test',
    });

    await extractArticle(pds, {
      filename: 'article-2.md',
      title: 'Second',
      body: 'President Trump and The Pentagon.',
    });

    // "President Trump" merges with "Trump", "The Pentagon" stored as new
    const entities = pds.listRecords('app.pullread.entity');
    const names = entities.map((e: any) => e.value.name).sort();
    expect(names).toContain('Trump');
    expect(names).toContain('The Pentagon');
    expect(names).not.toContain('President Trump');

    // Mentions for "President Trump" should use canonical name "Trump"
    const mentions = pds.listRecords('app.pullread.mention');
    const trumpMentions = mentions.filter((m: any) => m.value.entityName === 'Trump');
    expect(trumpMentions.length).toBe(2);

    // Edge from article-2 should remap "President Trump" to "Trump"
    const edges = pds.listRecords('app.pullread.edge');
    const directsEdge = edges.find((e: any) => e.value.type === 'directs');
    expect(directsEdge!.value.from).toBe('Trump');
    pds.close();
  });

  test('normalizeEntityType preserves "note" type', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'My Research Note', type: 'note' }],
        relationships: [],
        themes: [],
      }),
      model: 'test',
    });

    await extractArticle(pds, {
      filename: 'note-type-test.md',
      title: 'Note Type Test',
      body: 'Testing note type preservation.',
    });

    const entities = pds.listRecords('app.pullread.entity');
    expect(entities[0].value.type).toBe('note');
    pds.close();
  });
});

describe('entity brief', () => {
  beforeEach(() => mockSummarize.mockReset());

  test('gatherEntityContext builds structured data for brief generation', () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Iran', type: 'place' });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Iran', filename: 'a.md', title: 'Iran Negotiations',
      sentiment: 'mixed', stance: 'diplomatic partner', publishedAt: '2026-01-01',
    });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Iran', filename: 'b.md', title: 'Military Tensions',
      sentiment: 'negative', stance: 'nuclear threat', publishedAt: '2026-02-01',
    });
    pds.putRecord('app.pullread.edge', null, {
      from: 'Trump', to: 'Iran', type: 'sanctions', sourceFilename: 'a.md',
    });
    pds.putRecord('app.pullread.edge', null, {
      from: 'Iran', to: 'Russia', type: 'intelligence', sourceFilename: 'b.md',
    });

    const ctx = gatherEntityContext(pds, 'Iran');
    expect(ctx).not.toBeNull();
    expect(ctx!.mentions.length).toBe(2);
    expect(ctx!.sentimentBreakdown).toEqual({ mixed: 1, negative: 1 });
    expect(ctx!.stances).toEqual(['diplomatic partner', 'nuclear threat']);
    expect(ctx!.relatedEntities).toEqual([
      { name: 'Trump', relationship: 'sanctions' },
      { name: 'Russia', relationship: 'intelligence' },
    ]);
    pds.close();
  });

  test('generateEntityBrief calls LLM with structured context', async () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Iran', type: 'place' });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Iran', filename: 'a.md', title: 'Iran Negotiations',
      sentiment: 'negative', stance: 'nuclear threat', publishedAt: '2026-01-01',
    });

    mockSummarize.mockResolvedValue({
      summary: 'Coverage of Iran in your feeds focuses on military tensions and nuclear concerns.',
      model: 'test',
    });

    const brief = await generateEntityBrief(pds, 'Iran');
    expect(brief).not.toBeNull();
    expect(brief!.wikipediaUrl).toBe('https://en.wikipedia.org/wiki/Iran');
    expect(brief!.summary).toContain('Iran');
    expect(brief!.mentionCount).toBe(1);
    expect(mockSummarize).toHaveBeenCalledTimes(1);

    // Verify the prompt contains structured data
    const promptArg = mockSummarize.mock.calls[0][0];
    expect(promptArg).toContain('Iran');
    expect(promptArg).toContain('nuclear threat');
    pds.close();
  });

  test('generateEntityBrief returns null for unknown entity', async () => {
    const pds = createResearchPDS(':memory:');
    const brief = await generateEntityBrief(pds, 'Nobody');
    expect(brief).toBeNull();
    pds.close();
  });

  test('generateEntityBrief falls back to template when LLM fails', async () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Iran', type: 'place' });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Iran', filename: 'a.md', title: 'Article',
      sentiment: 'neutral', stance: null, publishedAt: '2026-01-01',
    });

    mockSummarize.mockRejectedValue(new Error('LLM unavailable'));

    const brief = await generateEntityBrief(pds, 'Iran');
    expect(brief).not.toBeNull();
    expect(brief!.summary).toContain('Iran');
    expect(brief!.summary).toContain('1 article');
    pds.close();
  });
});

describe('origin field', () => {
  beforeEach(() => mockSummarize.mockReset());

  test('extractArticle stores origin "extracted" on mentions and edges', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'Apple', type: 'company' }, { name: 'Tim Cook', type: 'person' }],
        relationships: [{ from: 'Apple', to: 'Tim Cook', type: 'employs' }],
        themes: ['tech'],
      }),
      model: 'test',
    });

    await extractArticle(pds, {
      filename: 'origin-test.md',
      title: 'Origin Test',
      body: 'Apple and Tim Cook.',
    });

    const mentions = pds.listRecords('app.pullread.mention');
    for (const m of mentions) {
      expect((m as any).value.origin).toBe('extracted');
    }
    const edges = pds.listRecords('app.pullread.edge');
    expect((edges[0] as any).value.origin).toBe('extracted');
    pds.close();
  });
});

describe('resetResearchData', () => {
  test('clears all records from the PDS', () => {
    const pds = createResearchPDS(':memory:');
    pds.putRecord('app.pullread.entity', null, { name: 'Apple', type: 'company' });
    pds.putRecord('app.pullread.mention', null, { entityName: 'Apple', filename: 'a.md', title: 'A' });
    pds.putRecord('app.pullread.extraction', null, { filename: 'a.md', extractedAt: '2026-03-06' });
    pds.putRecord('app.pullread.edge', null, { from: 'Apple', to: 'Tim Cook', type: 'employs' });

    resetResearchData(pds);

    expect(pds.listRecords('app.pullread.entity').length).toBe(0);
    expect(pds.listRecords('app.pullread.mention').length).toBe(0);
    expect(pds.listRecords('app.pullread.extraction').length).toBe(0);
    expect(pds.listRecords('app.pullread.edge').length).toBe(0);
    pds.close();
  });
});

describe('extractFromUrl', () => {
  beforeEach(() => {
    mockSummarize.mockReset();
    mockFetchAndExtract.mockReset();
  });

  test('fetches URL content and runs extraction', async () => {
    const pds = createResearchPDS(':memory:');
    mockFetchAndExtract.mockResolvedValue({
      title: 'Test Page',
      markdown: 'Page content about Apple.',
      url: 'https://example.com/page',
      domain: 'example.com',
      excerpt: '',
    } as any);
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'Apple', type: 'company', sentiment: 'neutral' }],
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

  test('returns null when fetch fails', async () => {
    const pds = createResearchPDS(':memory:');
    mockFetchAndExtract.mockResolvedValue(null);

    const result = await extractFromUrl(pds, 'https://example.com/bad');
    expect(result).toBeNull();
    expect(mockSummarize).not.toHaveBeenCalled();
    pds.close();
  });
});

describe('extractNote', () => {
  beforeEach(() => mockSummarize.mockReset());

  test('extracts entities from note content with origin "note"', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'OpenAI', type: 'company', sentiment: 'positive', stance: 'leading AI' }],
        relationships: [],
        themes: ['AI'],
      }),
      model: 'test',
    });

    await extractNote(pds, {
      noteId: 'note-abc123',
      content: 'My thoughts on OpenAI and their approach to AI safety.',
      sourceArticle: '',
    });

    const entities = pds.listRecords('app.pullread.entity');
    expect(entities.length).toBe(2); // OpenAI + the note entity itself
    const noteEntity = entities.find((e: any) => e.value.type === 'note');
    expect(noteEntity).toBeDefined();
    expect(noteEntity!.value.name).toContain('note-abc123');

    const mentions = pds.listRecords('app.pullread.mention');
    const noteMentions = mentions.filter((m: any) => m.value.origin === 'note');
    expect(noteMentions.length).toBeGreaterThanOrEqual(1);
    pds.close();
  });

  test('creates edges from note to source article entities with origin "note"', async () => {
    const pds = createResearchPDS(':memory:');

    // Pre-populate: article extraction created an entity
    pds.putRecord('app.pullread.entity', null, { name: 'OpenAI', type: 'company' });
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'OpenAI', filename: 'source-article.md', title: 'About OpenAI',
      origin: 'extracted', sentiment: 'neutral', stance: null,
    });

    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'OpenAI', type: 'company' }],
        relationships: [],
        themes: ['AI'],
      }),
      model: 'test',
    });

    await extractNote(pds, {
      noteId: 'note-xyz789',
      content: 'Interesting take on OpenAI.',
      sourceArticle: 'source-article.md',
    });

    const edges = pds.listRecords('app.pullread.edge');
    const noteEdges = edges.filter((e: any) => e.value.origin === 'note');
    expect(noteEdges.length).toBeGreaterThanOrEqual(1);
    pds.close();
  });

  test('re-extraction clears only this note origin mentions and edges', async () => {
    const pds = createResearchPDS(':memory:');
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'Apple', type: 'company' }],
        relationships: [],
        themes: ['tech'],
      }),
      model: 'test',
    });

    await extractNote(pds, { noteId: 'note-1', content: 'Apple notes content here', sourceArticle: '' });

    // Also add an extracted mention for Apple (from article extraction)
    pds.putRecord('app.pullread.mention', null, {
      entityName: 'Apple', filename: 'article.md', title: 'Article',
      origin: 'extracted', sentiment: 'neutral', stance: null,
    });

    // Re-extract the note with different content
    mockSummarize.mockResolvedValue({
      summary: JSON.stringify({
        entities: [{ name: 'Google', type: 'company' }],
        relationships: [],
        themes: ['tech'],
      }),
      model: 'test',
    });

    await extractNote(pds, { noteId: 'note-1', content: 'Google notes content here', sourceArticle: '' });

    const mentions = pds.listRecords('app.pullread.mention');
    const extractedMentions = mentions.filter((m: any) => m.value.origin === 'extracted');
    expect(extractedMentions.length).toBe(1); // article mention preserved
    expect(extractedMentions[0].value.entityName).toBe('Apple');

    const noteMentions = mentions.filter((m: any) => m.value.origin === 'note');
    expect(noteMentions.some((m: any) => m.value.entityName === 'Google')).toBe(true);
    expect(noteMentions.some((m: any) => m.value.entityName === 'Apple')).toBe(false);
    pds.close();
  });
});
