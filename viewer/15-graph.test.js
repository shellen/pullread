// ABOUTME: Tests for knowledge graph computation functions.
// ABOUTME: Sets up mock globals and evals 15-graph.js to test pure computation logic.

const fs = require('fs');
const path = require('path');

// Load the graph module into global scope
function loadGraphModule() {
  const code = fs.readFileSync(path.join(__dirname, '15-graph.js'), 'utf8');
  const fn = new Function(code + '\nreturn { buildTagIndex, findRelatedArticles, buildTopicClusters };');
  const exports = fn();
  globalThis.buildTagIndex = exports.buildTagIndex;
  globalThis.findRelatedArticles = exports.findRelatedArticles;
  globalThis.buildTopicClusters = exports.buildTopicClusters;
}

// Helper: set up mock global state
function setupMockData(files, notesIndex) {
  globalThis.allFiles = files;
  globalThis.allNotesIndex = notesIndex || {};
  globalThis.blockedTags = new Set();
}

beforeEach(() => {
  loadGraphModule();
});

afterEach(() => {
  globalThis.allFiles = [];
  globalThis.allNotesIndex = {};
  globalThis.blockedTags = new Set();
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
