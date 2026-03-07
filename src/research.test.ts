// ABOUTME: Tests for research knowledge graph — PDS lifecycle, extraction, entity queries
// ABOUTME: Verifies createResearchPDS initializes storage and closes without error

import { createResearchPDS, extractArticle, runBackgroundExtraction, queryEntities, queryEntityProfile, queryRelatedEntities, queryTensions, addWatch, removeWatch, listWatches, checkWatchMatches, getUnseenMatches, markMatchesSeen, resetResearchData } from './research';
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
  const actual = jest.requireActual('fs');
  return { ...actual, readFileSync: jest.fn() };
});
const mockReadFile = readFileSync as jest.MockedFunction<typeof readFileSync>;

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
