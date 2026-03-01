// ABOUTME: Tests for knowledge graph computation functions.
// ABOUTME: Sets up mock globals and evals 15-graph.js to test pure computation logic.

const fs = require('fs');
const path = require('path');

// Load the graph module into global scope
function loadGraphModule() {
  const code = fs.readFileSync(path.join(__dirname, '15-graph.js'), 'utf8');
  const fn = new Function(code + '\nreturn { buildTagIndex, findRelatedArticles, buildTopicClusters, buildDailyRundown };');
  const exports = fn();
  globalThis.buildTagIndex = exports.buildTagIndex;
  globalThis.findRelatedArticles = exports.findRelatedArticles;
  globalThis.buildTopicClusters = exports.buildTopicClusters;
  globalThis.buildDailyRundown = exports.buildDailyRundown;
}

// Helper: set up mock global state
function setupMockData(files, notesIndex, readSet) {
  globalThis.allFiles = files;
  globalThis.allNotesIndex = notesIndex || {};
  globalThis.blockedTags = new Set();
  globalThis.readArticles = readSet || new Set();
}

beforeEach(() => {
  loadGraphModule();
});

afterEach(() => {
  globalThis.allFiles = [];
  globalThis.allNotesIndex = {};
  globalThis.blockedTags = new Set();
  globalThis.readArticles = new Set();
});

describe('buildTagIndex', () => {
  test('builds tag frequency and tag-to-articles map from machine tags', () => {
    setupMockData(
      [
        { filename: 'a.md', title: 'Article A' },
        { filename: 'b.md', title: 'Article B' },
        { filename: 'c.md', title: 'Article C' },
      ],
      {
        'a.md': { machineTags: ['ai', 'openai', 'regulation'] },
        'b.md': { machineTags: ['ai', 'openai'] },
        'c.md': { machineTags: ['crypto', 'regulation'] },
      }
    );

    const idx = buildTagIndex();

    expect(idx.tagFreq.get('ai')).toBe(2);
    expect(idx.tagFreq.get('openai')).toBe(2);
    expect(idx.tagFreq.get('regulation')).toBe(2);
    expect(idx.tagFreq.get('crypto')).toBe(1);

    expect(idx.tagArticles.get('ai')).toEqual(['a.md', 'b.md']);
    expect(idx.tagArticles.get('regulation')).toEqual(['a.md', 'c.md']);
  });

  test('builds co-occurrence matrix', () => {
    setupMockData(
      [{ filename: 'a.md' }, { filename: 'b.md' }],
      {
        'a.md': { machineTags: ['ai', 'openai', 'regulation'] },
        'b.md': { machineTags: ['ai', 'openai'] },
      }
    );

    const idx = buildTagIndex();

    // ai and openai co-occur in both articles
    expect(idx.cooccurrence.get('ai').get('openai')).toBe(2);
    expect(idx.cooccurrence.get('openai').get('ai')).toBe(2);
    // ai and regulation co-occur in 1 article
    expect(idx.cooccurrence.get('ai').get('regulation')).toBe(1);
  });

  test('skips articles with no machine tags', () => {
    setupMockData(
      [{ filename: 'a.md' }, { filename: 'b.md' }],
      {
        'a.md': { machineTags: ['ai'] },
        'b.md': { tags: ['manual-tag'] }, // no machineTags
      }
    );

    const idx = buildTagIndex();
    expect(idx.tagFreq.get('ai')).toBe(1);
    expect(idx.tagFreq.has('manual-tag')).toBe(false);
  });

  test('skips articles not in allNotesIndex', () => {
    setupMockData(
      [{ filename: 'a.md' }, { filename: 'missing.md' }],
      { 'a.md': { machineTags: ['ai'] } }
    );

    const idx = buildTagIndex();
    expect(idx.tagFreq.size).toBe(1);
  });
});

describe('findRelatedArticles', () => {
  test('returns articles sorted by Jaccard similarity', () => {
    setupMockData(
      [
        { filename: 'target.md', title: 'Target' },
        { filename: 'close.md', title: 'Close Match' },
        { filename: 'far.md', title: 'Far Match' },
        { filename: 'none.md', title: 'No Match' },
      ],
      {
        'target.md': { machineTags: ['ai', 'openai', 'regulation'] },
        'close.md': { machineTags: ['ai', 'openai', 'ethics'] },          // shares 2/4 = 0.5
        'far.md': { machineTags: ['ai', 'crypto'] },                       // shares 1/4 = 0.25
        'none.md': { machineTags: ['sports'] },                             // shares 0
      }
    );

    const results = findRelatedArticles('target.md', 5);

    expect(results.length).toBe(2); // 'none.md' excluded (similarity 0), 'far.md' at threshold
    expect(results[0].filename).toBe('close.md');
    expect(results[0].sharedTags).toEqual(expect.arrayContaining(['ai', 'openai']));
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
  });

  test('returns empty array for article with no machine tags', () => {
    setupMockData(
      [{ filename: 'a.md' }],
      { 'a.md': {} }
    );
    expect(findRelatedArticles('a.md', 5)).toEqual([]);
  });

  test('respects topN limit', () => {
    setupMockData(
      [
        { filename: 'target.md' },
        { filename: 'a.md' },
        { filename: 'b.md' },
        { filename: 'c.md' },
      ],
      {
        'target.md': { machineTags: ['ai', 'ml', 'dl'] },
        'a.md': { machineTags: ['ai', 'ml', 'dl'] },
        'b.md': { machineTags: ['ai', 'ml'] },
        'c.md': { machineTags: ['ai', 'ml'] },
      }
    );

    const results = findRelatedArticles('target.md', 1);
    expect(results.length).toBe(1);
  });
});

describe('buildTopicClusters', () => {
  test('groups articles sharing multiple machine tags', () => {
    setupMockData(
      [
        { filename: 'a.md', title: 'A' },
        { filename: 'b.md', title: 'B' },
        { filename: 'c.md', title: 'C' },
        { filename: 'd.md', title: 'D' },
      ],
      {
        'a.md': { machineTags: ['ai', 'openai', 'regulation'] },
        'b.md': { machineTags: ['ai', 'openai', 'ethics'] },
        'c.md': { machineTags: ['ai', 'openai', 'safety'] },
        'd.md': { machineTags: ['sports', 'football'] },
      }
    );

    const clusters = buildTopicClusters(2, 3);

    expect(clusters.length).toBeGreaterThanOrEqual(1);
    // The cluster with ai+openai should contain a, b, c
    const aiCluster = clusters.find(c => c.tags.includes('ai') && c.tags.includes('openai'));
    expect(aiCluster).toBeDefined();
    expect(aiCluster.articles.length).toBe(3);
  });

  test('returns empty when no clusters meet thresholds', () => {
    setupMockData(
      [{ filename: 'a.md' }, { filename: 'b.md' }],
      {
        'a.md': { machineTags: ['ai'] },
        'b.md': { machineTags: ['sports'] },
      }
    );

    const clusters = buildTopicClusters(2, 3);
    expect(clusters).toEqual([]);
  });

  test('excludes blocked tags', () => {
    setupMockData(
      [
        { filename: 'a.md', title: 'A' },
        { filename: 'b.md', title: 'B' },
        { filename: 'c.md', title: 'C' },
      ],
      {
        'a.md': { machineTags: ['ai', 'blocked-tag'] },
        'b.md': { machineTags: ['ai', 'blocked-tag'] },
        'c.md': { machineTags: ['ai', 'blocked-tag'] },
      }
    );
    globalThis.blockedTags = new Set(['blocked-tag']);

    const clusters = buildTopicClusters(2, 3);
    // Can't form a cluster with 2 shared tags since blocked-tag is excluded
    expect(clusters).toEqual([]);
  });
});

describe('buildDailyRundown', () => {
  // Helper: 3 articles sharing 2 tags = 1 cluster at threshold (2, 2)
  function setupRundownData(readSet) {
    var today = new Date().toISOString();
    setupMockData(
      [
        { filename: 'a.md', title: 'AI Regulation Update', domain: 'tech.com', image: 'https://tech.com/og.jpg', bookmarked: today },
        { filename: 'b.md', title: 'OpenAI Policy Shift', domain: 'ai.org', image: '', bookmarked: today },
        { filename: 'c.md', title: 'AI Safety Standards', domain: 'safety.io', image: 'https://safety.io/og.png', bookmarked: today },
        { filename: 'd.md', title: 'Crypto Market Rally', domain: 'crypto.com', image: '', bookmarked: today },
        { filename: 'e.md', title: 'Bitcoin Regulation', domain: 'coin.net', image: '', bookmarked: today },
      ],
      {
        'a.md': { machineTags: ['ai', 'regulation'] },
        'b.md': { machineTags: ['ai', 'regulation'] },
        'c.md': { machineTags: ['ai', 'regulation'] },
        'd.md': { machineTags: ['crypto', 'markets'] },
        'e.md': { machineTags: ['crypto', 'markets'] },
      },
      readSet || new Set()
    );
  }

  test('returns clusters with only unread articles', () => {
    setupRundownData(new Set(['a.md']));

    const rundown = buildDailyRundown(5);

    // ai+regulation cluster should exist but only have 2 unread articles
    const aiCluster = rundown.find(c => c.tags.includes('ai'));
    expect(aiCluster).toBeDefined();
    expect(aiCluster.articles.length).toBe(2);
    expect(aiCluster.articles.every(a => a.filename !== 'a.md')).toBe(true);
  });

  test('drops clusters with no unread articles', () => {
    setupRundownData(new Set(['a.md', 'b.md', 'c.md']));

    const rundown = buildDailyRundown(5);

    // ai+regulation cluster should be gone (all read)
    const aiCluster = rundown.find(c => c.tags.includes('ai'));
    expect(aiCluster).toBeUndefined();
  });

  test('sorts by unread article count descending', () => {
    var today = new Date().toISOString();
    setupMockData(
      [
        { filename: 'a.md', title: 'A', domain: 'a.com', bookmarked: today },
        { filename: 'b.md', title: 'B', domain: 'b.com', bookmarked: today },
        { filename: 'c.md', title: 'C', domain: 'c.com', bookmarked: today },
        { filename: 'd.md', title: 'D', domain: 'd.com', bookmarked: today },
        { filename: 'e.md', title: 'E', domain: 'e.com', bookmarked: today },
      ],
      {
        'a.md': { machineTags: ['small', 'topic'] },
        'b.md': { machineTags: ['small', 'topic'] },
        'c.md': { machineTags: ['big', 'cluster'] },
        'd.md': { machineTags: ['big', 'cluster'] },
        'e.md': { machineTags: ['big', 'cluster'] },
      }
    );

    const rundown = buildDailyRundown(5);

    expect(rundown.length).toBe(2);
    var counts = rundown.map(r => r.articles.length).sort((a, b) => b - a);
    expect(counts[0]).toBeGreaterThanOrEqual(counts[1]);
  });

  test('respects maxTopics limit', () => {
    setupRundownData();

    const rundown = buildDailyRundown(1);

    expect(rundown.length).toBe(1);
  });

  test('builds label from shortest tags in cluster', () => {
    setupRundownData();

    const rundown = buildDailyRundown(5);
    const aiCluster = rundown.find(c => c.tags.includes('regulation'));
    expect(aiCluster).toBeDefined();
    // 'ai' (2 chars) is shortest, 'regulation' (10 chars) is next
    expect(aiCluster.label).toBe('ai & regulation');
  });

  test('includes domain and image in article entries', () => {
    setupRundownData();

    const rundown = buildDailyRundown(5);
    const aiCluster = rundown.find(c => c.tags.includes('ai'));
    expect(aiCluster).toBeDefined();
    expect(aiCluster.articles[0]).toHaveProperty('domain');
    expect(aiCluster.articles[0]).toHaveProperty('image');
  });

  test('returns empty array when no clusters exist', () => {
    setupMockData(
      [{ filename: 'a.md', title: 'A', domain: 'a.com' }],
      { 'a.md': { machineTags: ['solo'] } }
    );

    const rundown = buildDailyRundown(5);
    expect(rundown).toEqual([]);
  });

  test('defaults maxTopics to 5', () => {
    // Create enough clusters to test the default
    setupMockData(
      Array.from({ length: 14 }, (_, i) => ({ filename: i + '.md', title: 'Art ' + i, domain: i + '.com' })),
      Object.fromEntries(Array.from({ length: 14 }, (_, i) => {
        // 7 pairs, each sharing 2 tags
        var pairIdx = Math.floor(i / 2);
        return [i + '.md', { machineTags: ['tag' + pairIdx + 'a', 'tag' + pairIdx + 'b'] }];
      }))
    );

    const rundown = buildDailyRundown();
    expect(rundown.length).toBeLessThanOrEqual(5);
  });
});
