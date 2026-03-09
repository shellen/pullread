// ABOUTME: Tests for viewer module helpers
// ABOUTME: Covers reprocessFile, parseFrontmatter, sync progress, and XSS sanitization

import { reprocessFile, parseFrontmatter } from './viewer';
import { setOutputPath, resetWriteGuard } from './writer';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock modules to avoid transitive dependency issues and real network calls
jest.mock('./tts', () => ({}));
jest.mock('./summarizer', () => ({}));
jest.mock('./autotagger', () => ({}));
jest.mock('./extractor', () => ({
  fetchAndExtract: jest.fn(),
}));

import { fetchAndExtract } from './extractor';
const mockFetchAndExtract = fetchAndExtract as jest.MockedFunction<typeof fetchAndExtract>;

describe('parseFrontmatter', () => {
  test('extracts key-value pairs from YAML frontmatter', () => {
    const content = `---
title: "My Article"
url: https://example.com/article
domain: example.com
bookmarked: 2025-01-15T00:00:00Z
---
# Article content`;
    const meta = parseFrontmatter(content);
    expect(meta.title).toBe('My Article');
    expect(meta.url).toBe('https://example.com/article');
    expect(meta.domain).toBe('example.com');
    expect(meta.bookmarked).toBe('2025-01-15T00:00:00Z');
  });

  test('returns empty object for content without frontmatter', () => {
    const meta = parseFrontmatter('# Just a heading\nSome text');
    expect(meta).toEqual({});
  });

  test('handles escaped quotes in values', () => {
    const content = `---
title: "He said \\"hello\\""
---
Body`;
    const meta = parseFrontmatter(content);
    expect(meta.title).toBe('He said "hello"');
  });

  test('preserves categories array as raw string', () => {
    const content = `---
title: "Tagged Article"
categories: ["Technology", "Programming"]
---
Body`;
    const meta = parseFrontmatter(content);
    expect(meta.categories).toBe('["Technology", "Programming"]');
  });

  test('aliases Defuddle "source" to "url" when url is absent', () => {
    const content = `---
title: "Defuddle Article"
source: https://example.com/defuddle
domain: example.com
---
Body`;
    const meta = parseFrontmatter(content);
    expect(meta.url).toBe('https://example.com/defuddle');
    expect(meta.source).toBe('https://example.com/defuddle');
  });

  test('aliases Defuddle "published" to "bookmarked" when bookmarked is absent', () => {
    const content = `---
title: "Defuddle Article"
published: 2025-03-09T12:00:00Z
---
Body`;
    const meta = parseFrontmatter(content);
    expect(meta.bookmarked).toBe('2025-03-09T12:00:00Z');
    expect(meta.published).toBe('2025-03-09T12:00:00Z');
  });

  test('aliases Defuddle "description" to "excerpt" when excerpt is absent', () => {
    const content = `---
title: "Defuddle Article"
description: A great article about something
---
Body`;
    const meta = parseFrontmatter(content);
    expect(meta.excerpt).toBe('A great article about something');
    expect(meta.description).toBe('A great article about something');
  });

  test('aliases Defuddle "image" to "thumbnail" when thumbnail is absent', () => {
    const content = `---
title: "Defuddle Article"
image: https://example.com/hero.jpg
---
Body`;
    const meta = parseFrontmatter(content);
    expect(meta.thumbnail).toBe('https://example.com/hero.jpg');
    expect(meta.image).toBe('https://example.com/hero.jpg');
  });

  test('does not overwrite existing PullRead fields with Defuddle aliases', () => {
    const content = `---
title: "Mixed Article"
url: https://pullread.com/article
source: https://defuddle.com/article
bookmarked: 2025-01-01T00:00:00Z
published: 2025-03-09T00:00:00Z
excerpt: "PullRead excerpt"
description: Defuddle description
thumbnail: https://pullread.com/thumb.jpg
image: https://defuddle.com/hero.jpg
---
Body`;
    const meta = parseFrontmatter(content);
    expect(meta.url).toBe('https://pullread.com/article');
    expect(meta.bookmarked).toBe('2025-01-01T00:00:00Z');
    expect(meta.excerpt).toBe('PullRead excerpt');
    expect(meta.thumbnail).toBe('https://pullread.com/thumb.jpg');
  });
});

describe('reprocessFile', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `pullread-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    setOutputPath(testDir);
    mockFetchAndExtract.mockReset();
  });

  afterAll(() => {
    resetWriteGuard();
  });

  test('returns error when file does not exist', async () => {
    const result = await reprocessFile(join(testDir, 'nonexistent.md'));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  test('returns error when file has no URL in frontmatter', async () => {
    const filePath = join(testDir, 'no-url.md');
    writeFileSync(filePath, `---
title: "No URL Article"
domain: example.com
---
# Content`);
    const result = await reprocessFile(filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no source URL/i);
  });

  test('returns error when extraction fails', async () => {
    const filePath = join(testDir, 'fail-extract.md');
    writeFileSync(filePath, `---
title: "Will Fail"
url: https://example.com/broken
domain: example.com
bookmarked: 2025-01-15T00:00:00Z
---
# Old content`);
    mockFetchAndExtract.mockResolvedValue(null);

    const result = await reprocessFile(filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/could not extract/i);
  });

  test('re-fetches and rebuilds markdown preserving frontmatter', async () => {
    const filePath = join(testDir, 'good-article.md');
    writeFileSync(filePath, `---
title: "Original Title"
url: https://example.com/article
domain: example.com
bookmarked: 2025-01-15T00:00:00Z
feed: "My Feed"
---
# Old content that should be replaced`);

    mockFetchAndExtract.mockResolvedValue({
      title: 'Updated Title',
      content: '<p>New content from re-fetch</p>',
      markdown: 'New content from re-fetch',
      byline: 'Author Name',
      excerpt: 'An excerpt',
    });

    const result = await reprocessFile(filePath);
    expect(result.ok).toBe(true);
    expect(result.title).toBe('Original Title');

    // Verify file was rewritten
    const updated = readFileSync(filePath, 'utf-8');
    expect(updated).toContain('New content from re-fetch');
    expect(updated).toContain('https://example.com/article');
    expect(updated).toContain('2025-01-15T00:00:00Z');
  });

  test('preserves summary in frontmatter when present', async () => {
    const filePath = join(testDir, 'with-summary.md');
    writeFileSync(filePath, `---
title: "Summarized Article"
url: https://example.com/summary
domain: example.com
bookmarked: 2025-01-15T00:00:00Z
summary: "This is a summary of the article."
---
# Old content`);

    mockFetchAndExtract.mockResolvedValue({
      title: 'Summarized Article',
      content: '<p>Fresh content</p>',
      markdown: 'Fresh content',
    });

    const result = await reprocessFile(filePath);
    expect(result.ok).toBe(true);

    const updated = readFileSync(filePath, 'utf-8');
    expect(updated).toContain('summary:');
    expect(updated).toContain('This is a summary of the article.');
  });

  test('skips source: feed articles by default to preserve feed content', async () => {
    const filePath = join(testDir, 'feed-article.md');
    writeFileSync(filePath, `---
title: "Feed Article"
url: https://example.com/feed-article
domain: example.com
bookmarked: 2025-01-15T00:00:00Z
source: feed
---
# Feed content that should be preserved`);

    const result = await reprocessFile(filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/feed-sourced/i);

    const unchanged = readFileSync(filePath, 'utf-8');
    expect(unchanged).toContain('source: feed');
    expect(unchanged).toContain('Feed content that should be preserved');
    expect(mockFetchAndExtract).not.toHaveBeenCalled();
  });

  test('allows reprocessing source: feed articles when force is true', async () => {
    const filePath = join(testDir, 'feed-article-force.md');
    writeFileSync(filePath, `---
title: "Feed Article"
url: https://example.com/feed-article
domain: example.com
bookmarked: 2025-01-15T00:00:00Z
source: feed
---
# Short feed content`);

    mockFetchAndExtract.mockResolvedValue({
      title: 'Feed Article',
      content: '<p>Full extracted content</p>',
      markdown: 'Full extracted content',
      byline: 'Author',
    });

    const result = await reprocessFile(filePath, { force: true });
    expect(result.ok).toBe(true);

    const updated = readFileSync(filePath, 'utf-8');
    expect(updated).toContain('source: extracted');
    expect(updated).not.toContain('source: feed');
  });

  test('preserves thumbnail and categories from existing frontmatter', async () => {
    const filePath = join(testDir, 'with-meta.md');
    writeFileSync(filePath, `---
title: "Article With Meta"
url: https://example.com/meta-article
domain: example.com
bookmarked: 2025-01-15T00:00:00Z
categories: ["Technology", "Programming"]
thumbnail: https://example.com/hero.jpg
---
# Old content`);

    mockFetchAndExtract.mockResolvedValue({
      title: 'Article With Meta',
      content: '<p>New content</p>',
      markdown: 'New content',
    });

    const result = await reprocessFile(filePath);
    expect(result.ok).toBe(true);

    const updated = readFileSync(filePath, 'utf-8');
    expect(updated).toContain('image: https://example.com/hero.jpg');
    expect(updated).toContain('categories: ["Technology", "Programming"]');
  });

  test('returns error message from fetch exceptions', async () => {
    const filePath = join(testDir, 'throws.md');
    writeFileSync(filePath, `---
title: "Throws"
url: https://example.com/throws
domain: example.com
bookmarked: 2025-01-15T00:00:00Z
---
# Content`);

    mockFetchAndExtract.mockRejectedValue(new Error('Network timeout'));

    const result = await reprocessFile(filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Network timeout');
  });
});

describe('sync progress', () => {
  const rootDir = join(__dirname, '..');

  test('viewer.html includes sync-status element', () => {
    const html = readFileSync(join(rootDir, 'viewer.html'), 'utf-8');
    expect(html).toContain('id="sync-status"');
  });

  test('13-init.js polls /api/sync-progress', () => {
    const init = readFileSync(join(rootDir, 'viewer', '13-init.js'), 'utf-8');
    expect(init).toContain('/api/sync-progress');
  });

  test('13-init.js updates sync-status element when syncing', () => {
    const init = readFileSync(join(rootDir, 'viewer', '13-init.js'), 'utf-8');
    expect(init).toContain("getElementById('sync-status')");
    expect(init).toContain("classList.add('visible')");
    expect(init).toContain("classList.remove('visible')");
  });

  test('viewer.css styles sync-status with fade transition', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    expect(css).toContain('.sync-status');
    expect(css).toContain('.sync-status.visible');
  });

  test('index.ts writes and clears sync progress file', () => {
    const index = readFileSync(join(rootDir, 'src', 'index.ts'), 'utf-8');
    expect(index).toContain('.sync-progress');
    expect(index).toContain('writeSyncProgress');
    expect(index).toContain('clearSyncProgress');
  });
});

describe('EPUB support', () => {
  const rootDir = join(__dirname, '..');

  test('04-article.js skips markdown parsing for epub content', () => {
    const article = readFileSync(join(rootDir, 'viewer', '04-article.js'), 'utf-8');
    expect(article).toContain("domain === 'epub'");
    expect(article).toContain('isEpub');
  });

  test('writer.ts exports listEpubFiles', () => {
    const writer = readFileSync(join(rootDir, 'src', 'writer.ts'), 'utf-8');
    expect(writer).toMatch(/export\s+function\s+listEpubFiles/);
  });

  test('viewer.ts serves EPUB content via /api/file', () => {
    const viewer = readFileSync(join(rootDir, 'src', 'viewer.ts'), 'utf-8');
    expect(viewer).toContain('listEpubFiles');
    expect(viewer).toContain('extractEpubContent');
    expect(viewer).toContain('.epub');
  });

  test('viewer.ts serves EPUB resources via /api/epub-resource', () => {
    const viewer = readFileSync(join(rootDir, 'src', 'viewer.ts'), 'utf-8');
    expect(viewer).toContain('/api/epub-resource');
    expect(viewer).toContain('extractEpubFile');
  });

  test('viewer.ts rewrites EPUB image paths to /api/epub-resource', () => {
    const viewer = readFileSync(join(rootDir, 'src', 'viewer.ts'), 'utf-8');
    expect(viewer).toContain('/api/epub-resource?name=');
  });

  test('viewer.ts parses EPUB metadata from OPF', () => {
    const viewer = readFileSync(join(rootDir, 'src', 'viewer.ts'), 'utf-8');
    expect(viewer).toContain('dc:title');
    expect(viewer).toContain('dc:creator');
    expect(viewer).toContain('container.xml');
  });
});

describe('XSS sanitization', () => {
  const rootDir = join(__dirname, '..');

  test('DOMPurify is bundled via embed-viewer.ts', () => {
    const html = readFileSync(join(rootDir, 'viewer.html'), 'utf-8');
    expect(html).toContain('DOMPurify');
    const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['dompurify']).toBeDefined();
  });

  test('02-utils.js defines sanitizeHtml helper', () => {
    const utils = readFileSync(join(rootDir, 'viewer', '02-utils.js'), 'utf-8');
    expect(utils).toMatch(/function\s+sanitizeHtml/);
    expect(utils).toContain('DOMPurify');
  });

  test('04-article.js sanitizes marked.parse output', () => {
    const article = readFileSync(join(rootDir, 'viewer', '04-article.js'), 'utf-8');
    // The main article body rendering should use sanitizeHtml(marked.parse(...))
    expect(article).toMatch(/sanitizeHtml\s*\(\s*marked\.parse\s*\(/);
  });

  test('04-article.js sanitizes kroki SVG response', () => {
    const article = readFileSync(join(rootDir, 'viewer', '04-article.js'), 'utf-8');
    // The kroki.io D2 diagram response should be sanitized
    expect(article).toMatch(/sanitizeHtml\s*\(\s*svg\s*\)/);
  });

  test('09-notebooks.js sanitizes marked.parse output in preview', () => {
    const notebooks = readFileSync(join(rootDir, 'viewer', '09-notebooks.js'), 'utf-8');
    expect(notebooks).toMatch(/sanitizeHtml\s*\(\s*marked\.parse\s*\(/);
  });
});

describe('approxCount', () => {
  let approxCount: (n: number) => string;

  beforeAll(() => {
    const rootDir = join(__dirname, '..');
    const utils = readFileSync(join(rootDir, 'viewer', '02-utils.js'), 'utf-8');
    const fn = new Function(utils + '\nreturn { approxCount };');
    approxCount = fn().approxCount;
  });

  test('returns exact number for 0-99', () => {
    expect(approxCount(0)).toBe('0');
    expect(approxCount(1)).toBe('1');
    expect(approxCount(42)).toBe('42');
    expect(approxCount(99)).toBe('99');
  });

  test('rounds down to nearest hundred with + for 100-999', () => {
    expect(approxCount(100)).toBe('100+');
    expect(approxCount(247)).toBe('200+');
    expect(approxCount(999)).toBe('900+');
  });

  test('shows K+ for 1000+', () => {
    expect(approxCount(1000)).toBe('1K+');
    expect(approxCount(1500)).toBe('1K+');
    expect(approxCount(13000)).toBe('13K+');
    expect(approxCount(13999)).toBe('13K+');
  });
});

describe('timeAgo / timeAgoTitle', () => {
  // Eval the pure functions from the client-side JS so we can unit test them
  let timeAgo: (dateStr: string) => string;
  let timeAgoTitle: (dateStr: string) => string;

  beforeAll(() => {
    const rootDir = join(__dirname, '..');
    const utils = readFileSync(join(rootDir, 'viewer', '02-utils.js'), 'utf-8');
    // Extract timeAgo and timeAgoTitle functions
    const fn = new Function(utils + '\nreturn { timeAgo, timeAgoTitle };');
    const fns = fn();
    timeAgo = fns.timeAgo;
    timeAgoTitle = fns.timeAgoTitle;
  });

  test('returns empty string for falsy input', () => {
    expect(timeAgo('')).toBe('');
    expect(timeAgoTitle('')).toBe('');
  });

  test('returns "just now" for dates less than a minute ago', () => {
    const now = new Date().toISOString();
    expect(timeAgo(now)).toBe('just now');
  });

  test('returns minutes ago for recent dates', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(timeAgo(fiveMinAgo)).toBe('5m ago');
  });

  test('returns hours ago for same-day dates', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(timeAgo(threeHoursAgo)).toBe('3h ago');
  });

  test('returns "yesterday" for 1 day ago', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    expect(timeAgo(yesterday)).toBe('yesterday');
  });

  test('returns days ago for 2-6 days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    expect(timeAgo(threeDaysAgo)).toBe('3d ago');
  });

  test('returns "Mon DD" for dates 7+ days in current year', () => {
    const now = new Date();
    // Pick a date 30 days ago in same year (if possible)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    if (thirtyDaysAgo.getFullYear() === now.getFullYear()) {
      const result = timeAgo(thirtyDaysAgo.toISOString());
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      expect(result).toBe(months[thirtyDaysAgo.getMonth()] + ' ' + thirtyDaysAgo.getDate());
    }
  });

  test('returns "Mon DD, YYYY" for dates in a previous year', () => {
    const result = timeAgo('2023-06-15T12:00:00Z');
    expect(result).toBe('Jun 15, 2023');
  });

  test('returns date slice for invalid date strings', () => {
    expect(timeAgo('not-a-date')).toBe('not-a-date');
  });

  test('timeAgoTitle returns full datetime string', () => {
    const result = timeAgoTitle('2025-03-15T14:30:00Z');
    // Should contain date and time parts (exact output depends on timezone)
    expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  });

  test('timeAgoTitle returns raw string for invalid dates', () => {
    expect(timeAgoTitle('not-a-date')).toBe('not-a-date');
  });
});

describe('feed-extract prompt', () => {
  const rootDir = join(__dirname, '..');

  test('04-article.js includes feed-extract-prompt for source: feed articles', () => {
    const article = readFileSync(join(rootDir, 'viewer', '04-article.js'), 'utf-8');
    expect(article).toContain('feed-extract-prompt');
    expect(article).toContain("meta.source === 'feed'");
    expect(article).toContain('reprocessFromMenu()');
  });

  test('viewer.css styles feed-extract-prompt and button', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    expect(css).toContain('.feed-extract-prompt');
    expect(css).toContain('.feed-extract-btn');
  });
});

describe('race condition guards', () => {
  const rootDir = join(__dirname, '..');

  test('preloadAnnotations returns data instead of setting globals', () => {
    const annotations = readFileSync(join(rootDir, 'viewer', '06-annotations.js'), 'utf-8');
    // Must return data object, not set globals directly
    expect(annotations).toMatch(/return\s*\{\s*highlights/);
    expect(annotations).toMatch(/return\s+defaults/);
  });

  test('applyAnnotationData function exists', () => {
    const annotations = readFileSync(join(rootDir, 'viewer', '06-annotations.js'), 'utf-8');
    expect(annotations).toMatch(/function\s+applyAnnotationData/);
  });

  test('loadFile checks activeFile after preloadAnnotations', () => {
    const sidebar = readFileSync(join(rootDir, 'viewer', '05-sidebar.js'), 'utf-8');
    // After annotations load, guard check must exist before applying
    expect(sidebar).toContain('applyAnnotationData');
    // The pattern: await preloadAnnotations -> guard check -> applyAnnotationData
    const annotationsIdx = sidebar.indexOf('preloadAnnotations');
    const guardIdx = sidebar.indexOf('activeFile !== targetFile', annotationsIdx);
    const applyIdx = sidebar.indexOf('applyAnnotationData', guardIdx);
    expect(annotationsIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(annotationsIdx);
    expect(applyIdx).toBeGreaterThan(guardIdx);
  });

  test('loadFile checks activeFile after fetch response', () => {
    const sidebar = readFileSync(join(rootDir, 'viewer', '05-sidebar.js'), 'utf-8');
    // Must have guard checks after the fetch call too
    const fetchIdx = sidebar.indexOf("fetch('/api/file");
    const guardAfterFetch = sidebar.indexOf('activeFile !== targetFile', fetchIdx);
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(guardAfterFetch).toBeGreaterThan(fetchIdx);
  });

  test('loadFile uses AbortController for stale fetches', () => {
    const sidebar = readFileSync(join(rootDir, 'viewer', '05-sidebar.js'), 'utf-8');
    expect(sidebar).toContain('AbortController');
    expect(sidebar).toContain('_loadFileAbort');
    expect(sidebar).toContain('AbortError');
  });

  test('markAsRead uses delayed timer, not instant', () => {
    const sidebar = readFileSync(join(rootDir, 'viewer', '05-sidebar.js'), 'utf-8');
    expect(sidebar).toContain('_markAsReadDelayTimer');
    expect(sidebar).toMatch(/setTimeout\s*\(\s*function/);
    // Timer delay should be 3000ms
    expect(sidebar).toContain('3000');
  });

  test('goHome clears markAsRead timer', () => {
    const article = readFileSync(join(rootDir, 'viewer', '04-article.js'), 'utf-8');
    expect(article).toContain('_markAsReadDelayTimer');
    expect(article).toMatch(/clearTimeout\s*\(\s*_markAsReadDelayTimer\s*\)/);
  });
});

describe('bookmark service detection', () => {
  let isBookmarkServiceUrl: (url: string) => boolean;
  let isBookmarkArticle: (f: { feed?: string; domain?: string }) => boolean;

  beforeAll(() => {
    const rootDir = join(__dirname, '..');
    const utils = readFileSync(join(rootDir, 'viewer', '02-utils.js'), 'utf-8');
    const fn = new Function(utils + '\nreturn { isBookmarkServiceUrl, isBookmarkArticle, _bookmarkFeedNames };');
    const fns = fn();
    isBookmarkServiceUrl = fns.isBookmarkServiceUrl;
    isBookmarkArticle = fns.isBookmarkArticle;
  });

  test('detects Instapaper feed URLs', () => {
    expect(isBookmarkServiceUrl('https://www.instapaper.com/rss/123456/AbCdEf')).toBe(true);
    expect(isBookmarkServiceUrl('https://www.instapaper.com/archive/rss/123456/AbCdEf')).toBe(true);
  });

  test('detects Pinboard feed URLs', () => {
    expect(isBookmarkServiceUrl('https://feeds.pinboard.in/rss/u:jason/')).toBe(true);
    expect(isBookmarkServiceUrl('https://feeds.pinboard.in/rss/secret:abc/u:jason/unread/')).toBe(true);
  });

  test('detects Raindrop.io feed URLs but not blog', () => {
    expect(isBookmarkServiceUrl('https://raindrop.io/collection/123/feed')).toBe(true);
    expect(isBookmarkServiceUrl('https://blog.raindrop.io/feed')).toBe(false);
  });

  test('detects Drafty link feeds', () => {
    expect(isBookmarkServiceUrl('https://www.drafty.com/@jason/links/rss')).toBe(true);
    expect(isBookmarkServiceUrl('https://drafty.com/@someone/links/feed.xml')).toBe(true);
  });

  test('rejects non-bookmark feeds', () => {
    expect(isBookmarkServiceUrl('https://arstechnica.com/feed/')).toBe(false);
    expect(isBookmarkServiceUrl('https://www.nytimes.com/rss/homepage')).toBe(false);
    expect(isBookmarkServiceUrl('https://drafty.com/@jason/posts/rss')).toBe(false);
    expect(isBookmarkServiceUrl('https://www.instapaper.com/help')).toBe(false);
    expect(isBookmarkServiceUrl('https://pinboard.in/howto/')).toBe(false);
  });

  test('handles null/empty', () => {
    expect(isBookmarkServiceUrl('')).toBe(false);
    expect(isBookmarkServiceUrl(null as any)).toBe(false);
  });

  test('detects imported bookmarks.html articles', () => {
    expect(isBookmarkArticle({ feed: 'import' })).toBe(true);
  });

  test('detects inbox-saved articles', () => {
    expect(isBookmarkArticle({ feed: 'inbox' })).toBe(true);
  });

  test('does not detect regular feed articles as bookmarks', () => {
    expect(isBookmarkArticle({ feed: 'Ars Technica' })).toBe(false);
    expect(isBookmarkArticle({ feed: 'Hacker News' })).toBe(false);
    expect(isBookmarkArticle({ domain: 'nytimes.com' })).toBe(false);
  });
});

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

  test('SECTIONS lists all 12 core sections', () => {
    expect(SECTIONS).toEqual(['tech', 'news', 'science', 'health', 'business', 'culture', 'sports', 'food', 'lifestyle', 'environment', 'education', 'opinion']);
  });

  test('SECTION_MAP maps known tags to sections', () => {
    expect(SECTION_MAP['artificialintelligence']).toBe('tech');
    expect(SECTION_MAP['climatechange']).toBe('environment');
    expect(SECTION_MAP['finance']).toBe('business');
    expect(SECTION_MAP['music']).toBe('culture');
    expect(SECTION_MAP['politics']).toBe('news');
    expect(SECTION_MAP['medicine']).toBe('health');
    expect(SECTION_MAP['football']).toBe('sports');
    expect(SECTION_MAP['cooking']).toBe('food');
    expect(SECTION_MAP['sustainability']).toBe('environment');
    expect(SECTION_MAP['academia']).toBe('education');
  });

  test('resolveSection returns section from allNotesIndex annotation', () => {
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
    (globalThis as any).allNotesIndex = { 'article.md': { machineTags: ['programming', 'software', 'climatechange'] } };
    expect(resolveSection('article.md')).toBe('tech');
    delete (globalThis as any).allNotesIndex;
  });

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
      var nonZero = Object.values(result).filter((v: number) => v > 0).length;
      expect(nonZero).toBe(5);
    });
  });
});

describe('For You section grouping', () => {
  const rootDir = join(__dirname, '..');

  test('buildSectionRundown function exists in 15-graph.js', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    expect(graph).toMatch(/function\s+buildSectionRundown/);
  });

  test('buildSectionRundown uses resolveSection for classification', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    expect(graph).toContain('resolveSection');
  });

  test('buildSectionRundown uses allocateSectionSlots for proportional distribution', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    expect(graph).toContain('allocateSectionSlots');
  });

  test('buildSectionRundown returns objects with section, label, articles, totalCount', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    // Each result item should have these properties
    expect(graph).toContain('.section');
    expect(graph).toContain('.label');
    expect(graph).toContain('.articles');
    expect(graph).toContain('.totalCount');
  });

  test('buildSectionRundown processes core sections in SECTIONS order first', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    expect(graph).toContain('SECTIONS.slice()');
  });
});

describe('For You section rendering', () => {
  const rootDir = join(__dirname, '..');

  test('04-article.js has buildSectionRundownHtml function', () => {
    const article = readFileSync(join(rootDir, 'viewer', '04-article.js'), 'utf-8');
    expect(article).toMatch(/function\s+buildSectionRundownHtml/);
  });

  test('buildSectionRundownHtml uses buildSectionRundown data', () => {
    const article = readFileSync(join(rootDir, 'viewer', '04-article.js'), 'utf-8');
    expect(article).toContain('buildSectionRundown(');
  });

  test('section headers use section-header class', () => {
    const article = readFileSync(join(rootDir, 'viewer', '04-article.js'), 'utf-8');
    expect(article).toContain('section-header');
  });

  test('viewer.css styles section headers', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    expect(css).toContain('.section-header');
    expect(css).toContain('.section-title');
  });

  test('For You tab includes section rundown HTML', () => {
    const article = readFileSync(join(rootDir, 'viewer', '04-article.js'), 'utf-8');
    expect(article).toContain('buildSectionRundownHtml()');
  });

  test('section card onerror calls dashCardInitialHtml at runtime, not pre-rendered', () => {
    const article = readFileSync(join(rootDir, 'viewer', '04-article.js'), 'utf-8');
    // Extract the buildSectionRundownHtml function body
    const fnMatch = article.match(/function buildSectionRundownHtml\b[\s\S]*?^}/m);
    expect(fnMatch).toBeTruthy();
    const fnBody = fnMatch![0];
    // The onerror should call dashCardInitialHtml as a function (runtime call pattern)
    // NOT pre-render it and embed raw HTML with unescaped quotes in the attribute
    expect(fnBody).toMatch(/onerror="this\.outerHTML=dashCardInitialHtml\(/);
    expect(fnBody).not.toContain("dashCardInitialHtml(a.domain, 80).replace");
  });
});

describe('Tags tab section grouping', () => {
  const rootDir = join(__dirname, '..');

  test('buildTagsTabHtml groups tags under section headings', () => {
    const explore = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(explore).toContain('section-header');
    expect(explore).toContain('SECTION_LABELS');
  });

  test('Tags grouped by SECTION_MAP lookup', () => {
    const explore = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(explore).toContain('SECTION_MAP');
  });

  test('section groups are collapsible', () => {
    const explore = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(explore).toContain('section-collapse');
  });

  test('CSS supports section collapse', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    expect(css).toContain('.section-group.collapsed .section-body');
    expect(css).toContain('.section-chevron');
  });
});

describe('Explore section badges', () => {
  const rootDir = join(__dirname, '..');

  test('topic cluster cards include section badges', () => {
    const explore = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(explore).toContain('section-badge');
  });

  test('section badge determined from cluster tags via SECTION_MAP', () => {
    const explore = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    // The cluster section detection should use SECTION_MAP
    const badgeSection = explore.indexOf('section-badge');
    const sectionMapRef = explore.indexOf('SECTION_MAP', badgeSection - 200);
    expect(sectionMapRef).toBeGreaterThan(-1);
  });

  test('viewer.css styles section badges', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    expect(css).toContain('.section-badge');
  });
});

describe('findRelevantArticles', () => {
  const { findRelevantArticles } = require('./viewer');

  test('scores articles by keyword matches in title, excerpt, summary, categories, domain', () => {
    const articles: any[] = [
      { filename: 'ai-article.md', title: 'AI Revolution in Healthcare', url: 'https://example.com/1', domain: 'techblog.com', bookmarked: '', feed: '', author: '', mtime: '', hasSummary: true, summaryProvider: '', summaryModel: '', excerpt: 'Artificial intelligence transforms medical diagnosis', image: '', enclosureUrl: '', enclosureType: '', enclosureDuration: '', videoEnclosureUrl: '', videoEnclosureType: '', commentsUrl: '', commentCount: 0, categories: ['Technology', 'Health'] },
      { filename: 'cooking.md', title: 'Best Pasta Recipes', url: 'https://food.com/pasta', domain: 'food.com', bookmarked: '', feed: '', author: '', mtime: '', hasSummary: false, summaryProvider: '', summaryModel: '', excerpt: 'Easy pasta dishes for weeknights', image: '', enclosureUrl: '', enclosureType: '', enclosureDuration: '', videoEnclosureUrl: '', videoEnclosureType: '', commentsUrl: '', commentCount: 0, categories: ['Food'] },
      { filename: 'ai-ethics.md', title: 'Ethics of AI', url: 'https://example.com/2', domain: 'example.com', bookmarked: '', feed: '', author: '', mtime: '', hasSummary: true, summaryProvider: '', summaryModel: '', excerpt: 'Should AI make decisions about healthcare?', image: '', enclosureUrl: '', enclosureType: '', enclosureDuration: '', videoEnclosureUrl: '', videoEnclosureType: '', commentsUrl: '', commentCount: 0, categories: ['Technology'] },
    ];

    const result = findRelevantArticles('What does AI mean for healthcare?', articles, 3);
    expect(result.length).toBe(2);
    // Both AI articles should appear; cooking should not
    const filenames = result.map((a: any) => a.filename);
    expect(filenames).toContain('ai-article.md');
    expect(filenames).toContain('ai-ethics.md');
    expect(filenames).not.toContain('cooking.md');
  });

  test('returns empty array when no articles match', () => {
    const articles: any[] = [
      { filename: 'cooking.md', title: 'Best Pasta Recipes', url: '', domain: 'food.com', bookmarked: '', feed: '', author: '', mtime: '', hasSummary: false, summaryProvider: '', summaryModel: '', excerpt: 'Easy pasta dishes', image: '', enclosureUrl: '', enclosureType: '', enclosureDuration: '', videoEnclosureUrl: '', videoEnclosureType: '', commentsUrl: '', commentCount: 0, categories: ['Food'] },
    ];

    const result = findRelevantArticles('quantum physics breakthroughs', articles, 3);
    expect(result).toHaveLength(0);
  });

  test('respects limit parameter', () => {
    const articles: any[] = [];
    for (let i = 0; i < 10; i++) {
      articles.push({ filename: `ai-${i}.md`, title: `AI Article ${i}`, url: '', domain: 'ai.com', bookmarked: '', feed: '', author: '', mtime: '', hasSummary: false, summaryProvider: '', summaryModel: '', excerpt: 'Artificial intelligence research', image: '', enclosureUrl: '', enclosureType: '', enclosureDuration: '', videoEnclosureUrl: '', videoEnclosureType: '', commentsUrl: '', commentCount: 0, categories: ['AI'] });
    }

    const result = findRelevantArticles('AI research', articles, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  test('title matches score higher than domain matches', () => {
    const articles: any[] = [
      { filename: 'domain-only.md', title: 'Something Else', url: '', domain: 'ai.com', bookmarked: '', feed: '', author: '', mtime: '', hasSummary: false, summaryProvider: '', summaryModel: '', excerpt: 'Unrelated content', image: '', enclosureUrl: '', enclosureType: '', enclosureDuration: '', videoEnclosureUrl: '', videoEnclosureType: '', commentsUrl: '', commentCount: 0, categories: [] },
      { filename: 'title-match.md', title: 'AI Transforms Everything', url: '', domain: 'blog.com', bookmarked: '', feed: '', author: '', mtime: '', hasSummary: false, summaryProvider: '', summaryModel: '', excerpt: 'About artificial intelligence', image: '', enclosureUrl: '', enclosureType: '', enclosureDuration: '', videoEnclosureUrl: '', videoEnclosureType: '', commentsUrl: '', commentCount: 0, categories: [] },
    ];

    const result = findRelevantArticles('AI', articles, 2);
    expect(result[0].filename).toBe('title-match.md');
  });
});

describe('ask page structure', () => {
  const rootDir = join(__dirname, '..');

  test('17-ask.js defines renderAskPage function', () => {
    const ask = readFileSync(join(rootDir, 'viewer', '17-ask.js'), 'utf-8');
    expect(ask).toMatch(/function\s+renderAskPage/);
  });

  test('13-init.js handles #tab=ask hash', () => {
    const init = readFileSync(join(rootDir, 'viewer', '13-init.js'), 'utf-8');
    expect(init).toContain("params.tab === 'ask'");
    expect(init).toContain('renderAskPage');
  });

  test('viewer.css has ask-view styles', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    expect(css).toContain('.ask-view');
    expect(css).toContain('.ask-messages');
    expect(css).toContain('.ask-input-area');
  });

  test('viewer.ts has /api/ask endpoint', () => {
    const viewer = readFileSync(join(rootDir, 'src', 'viewer.ts'), 'utf-8');
    expect(viewer).toContain("/api/ask");
    expect(viewer).toContain('findRelevantArticles');
    expect(viewer).toContain('promptLLM');
  });

  test('17-ask.js defines _askClear function', () => {
    const ask = readFileSync(join(rootDir, 'viewer', '17-ask.js'), 'utf-8');
    expect(ask).toMatch(/function\s+_askClear/);
  });

  test('17-ask.js defines _askSaveToNotebook function', () => {
    const ask = readFileSync(join(rootDir, 'viewer', '17-ask.js'), 'utf-8');
    expect(ask).toMatch(/function\s+_askSaveToNotebook/);
  });

  test('17-ask.js has clear button with plus icon and toast', () => {
    const ask = readFileSync(join(rootDir, 'viewer', '17-ask.js'), 'utf-8');
    expect(ask).toContain('ask-clear-btn');
    expect(ask).toContain('#i-plus');
    expect(ask).not.toContain('#i-refresh');
    expect(ask).toContain('Conversation cleared');
  });

  test('17-ask.js copy excludes button text', () => {
    const ask = readFileSync(join(rootDir, 'viewer', '17-ask.js'), 'utf-8');
    expect(ask).toContain('cloneNode');
    expect(ask).toMatch(/querySelectorAll.*button.*remove/);
  });

  test('17-ask.js has save button with ask-save-btn class', () => {
    const ask = readFileSync(join(rootDir, 'viewer', '17-ask.js'), 'utf-8');
    expect(ask).toContain('ask-save-btn');
  });

  test('17-ask.js shows LLM provider label', () => {
    const ask = readFileSync(join(rootDir, 'viewer', '17-ask.js'), 'utf-8');
    expect(ask).toContain('providerLabel');
  });

  test('viewer.css has ask-clear-btn and ask-save-btn styles', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    expect(css).toContain('.ask-clear-btn');
    expect(css).toContain('.ask-save-btn');
  });
});

describe('page headers use article-header pattern', () => {
  const rootDir = join(__dirname, '..');

  test('settings page uses article-header h1', () => {
    const settings = readFileSync(join(rootDir, 'viewer', '03-settings.js'), 'utf-8');
    expect(settings).toContain('article-header');
  });

  test('ask page uses article-header h1', () => {
    const ask = readFileSync(join(rootDir, 'viewer', '17-ask.js'), 'utf-8');
    expect(ask).toContain('article-header');
  });

  test('manage sources page uses article-header h1', () => {
    const sources = readFileSync(join(rootDir, 'viewer', '16-manage-sources.js'), 'utf-8');
    expect(sources).toContain('article-header');
  });
});

describe('note page improvements', () => {
  const rootDir = join(__dirname, '..');

  test('exportNotebook uses active note title for filename', () => {
    const nb = readFileSync(join(rootDir, 'viewer', '09-notebooks.js'), 'utf-8');
    // The exportNotebook function itself should derive filename from note, not nb.title
    const exportFn = nb.match(/function exportNotebook\(\)[\s\S]*?^}/m);
    expect(exportFn).toBeTruthy();
    expect(exportFn![0]).toContain('_activeNoteId');
  });

  test('note preview strips first heading to avoid title duplication', () => {
    const nb = readFileSync(join(rootDir, 'viewer', '09-notebooks.js'), 'utf-8');
    // openNoteInPane should strip leading # heading from preview content
    const openFn = nb.match(/function openNoteInPane[\s\S]*?^}/m);
    expect(openFn).toBeTruthy();
    expect(openFn![0]).toMatch(/replace.*\\n/);
  });

  test('note actions use reader-toolbar instead of article-actions', () => {
    const nb = readFileSync(join(rootDir, 'viewer', '09-notebooks.js'), 'utf-8');
    expect(nb).toContain('reader-toolbar-actions');
  });

  test('note toolbar has overflow menu with Delete and Highlights', () => {
    const nb = readFileSync(join(rootDir, 'viewer', '09-notebooks.js'), 'utf-8');
    // Extract all toolbarActions += lines
    const toolbarLines = nb.match(/toolbarActions\s*\+=.*/g) || [];
    const directButtons = toolbarLines.join('\n');
    // Delete and Highlights should NOT be direct toolbar buttons
    expect(directButtons).not.toContain('confirmDeleteNote');
    expect(directButtons).not.toContain('showHighlightPicker');
    // They should be in a more-dropdown menu function instead
    expect(nb).toContain('toggleNoteMoreMenu');
    const menuFn = nb.match(/function toggleNoteMoreMenu[\s\S]*?^\}/m);
    expect(menuFn).toBeTruthy();
    expect(menuFn![0]).toContain('confirmDeleteNote');
    expect(menuFn![0]).toContain('showHighlightPicker');
  });

  test('note toolbar does not have Grammar as direct button', () => {
    const nb = readFileSync(join(rootDir, 'viewer', '09-notebooks.js'), 'utf-8');
    const openFn = nb.match(/function openNoteInPane[\s\S]*?^}/m);
    expect(openFn).toBeTruthy();
    // No grammar button in direct toolbar actions
    expect(openFn![0]).not.toMatch(/toolbarActions\s*\+=.*grammar-check-btn/);
  });

  test('export uses note sourceArticle for single-note export', () => {
    const nb = readFileSync(join(rootDir, 'viewer', '09-notebooks.js'), 'utf-8');
    const exportFn = nb.match(/function exportNotebook\(\)[\s\S]*?^}/m);
    expect(exportFn).toBeTruthy();
    // Should use note.sourceArticle for single-note export
    expect(exportFn![0]).toContain('sourceArticle');
    // Should have conditional logic that limits sources per note
    expect(exportFn![0]).toContain('exportSources');
  });

  test('note buttons use rounded-md (6px border-radius)', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    const newNoteBtn = css.match(/\.new-note-btn\s*\{[^}]+\}/);
    expect(newNoteBtn).toBeTruthy();
    expect(newNoteBtn![0]).toContain('border-radius: 6px');
    const suggestPill = css.match(/\.nb-suggest-pill\s*\{[^}]+\}/);
    expect(suggestPill).toBeTruthy();
    expect(suggestPill![0]).toContain('border-radius: 6px');
  });
});

describe('discovered sections', () => {
  const rootDir = join(__dirname, '..');

  test('discoverSections function exists in 15-graph.js', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    expect(graph).toMatch(/function\s+discoverSections/);
  });

  test('discoverSections filters to articles in "other" section', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    expect(graph).toContain('resolveSection');
    expect(graph).toContain("=== 'other'");
  });

  test('discoverSections skips mapped and blocked tags', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    expect(graph).toContain('SECTION_MAP');
    expect(graph).toContain('blockedTags');
  });

  test('discoverSections returns objects with id, label, articleFilenames', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    expect(graph).toContain('.id');
    expect(graph).toContain('.label');
    expect(graph).toContain('.articleFilenames');
  });

  test('buildSectionRundown integrates discoverSections', () => {
    const graph = readFileSync(join(rootDir, 'viewer', '15-graph.js'), 'utf-8');
    expect(graph).toContain('discoverSections');
    // Should appear in buildSectionRundown
    var rundownIdx = graph.indexOf('function buildSectionRundown');
    var discoverIdx = graph.indexOf('discoverSections', rundownIdx);
    expect(discoverIdx).toBeGreaterThan(rundownIdx);
  });
});

describe('Feedback button', () => {
  const rootDir = join(__dirname, '..');

  test('Feedback button calls showFeedbackModal', () => {
    const html = readFileSync(join(rootDir, 'viewer.html'), 'utf-8');
    expect(html).toContain('showFeedbackModal()');
    expect(html).not.toMatch(/<a\s+href="mailto:/);
  });

  test('showFeedbackModal is defined in 11-modals.js', () => {
    const modals = readFileSync(join(rootDir, 'viewer', '11-modals.js'), 'utf-8');
    expect(modals).toMatch(/function\s+showFeedbackModal/);
    expect(modals).toContain('support@alittledrive.com');
    expect(modals).toContain('navigator.clipboard.writeText');
  });
});

describe('Beta features gate', () => {
  const rootDir = join(__dirname, '..');

  test('settings has beta features toggle in advanced tab', () => {
    const settings = readFileSync(join(rootDir, 'viewer', '03-settings.js'), 'utf-8');
    expect(settings).toContain('pr-beta-features');
  });

  test('Discover area shows Ask chip without beta gate', () => {
    const explore = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(explore).toContain('renderAskPage');
    expect(explore).not.toMatch(/pr-beta-features.*renderAskPage/s);
  });

  test('Research nav is gated behind beta flag', () => {
    const init = readFileSync(join(rootDir, 'viewer', '13-init.js'), 'utf-8');
    expect(init).toContain('pr-beta-features');
    expect(init).toContain('nav-research');
  });

  test('Research settings card is gated behind beta flag', () => {
    const settings = readFileSync(join(rootDir, 'viewer', '03-settings.js'), 'utf-8');
    expect(settings).toMatch(/pr-beta-features.*settings-research/s);
  });
});

describe('Feed catalog', () => {
  const rootDir = join(__dirname, '..');

  test('14-suggested-feeds.js defines FEED_CATALOG_FALLBACK with collections', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    expect(js).toContain('FEED_CATALOG_FALLBACK');
    expect(js).toContain('collections');
  });

  test('each catalog collection has id, name, description, icon, and feeds array', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    expect(js).toMatch(/id:\s*'/);
    expect(js).toMatch(/icon:\s*'/);
    expect(js).toContain('.feeds');
  });

  test('each catalog feed has name, url, description, platform', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    expect(js).toMatch(/platform:\s*'/);
  });

  test('fetchFeedCatalog function exists', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    expect(js).toMatch(/function\s+fetchFeedCatalog/);
  });

  test('fetchFeedCatalog uses pr-feed-catalog sessionStorage key', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    expect(js).toContain('pr-feed-catalog');
  });

  test('fetches from pullread.com/api/feed-catalog.json', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    expect(js).toContain('pullread.com/api/feed-catalog.json');
  });

  test('filterCatalogFeeds function removes already-subscribed feeds', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    expect(js).toMatch(/function\s+filterCatalogFeeds/);
  });

  test('no longer contains SUGGESTED_FEEDS_FALLBACK or isFeedsDismissed', () => {
    const js = readFileSync(join(rootDir, 'viewer', '14-suggested-feeds.js'), 'utf-8');
    expect(js).not.toContain('SUGGESTED_FEEDS_FALLBACK');
    expect(js).not.toContain('isFeedsDismissed');
    expect(js).not.toContain('dismissSuggestedFeeds');
    expect(js).not.toContain('fetchSuggestedFeeds');
    expect(js).not.toContain('filterSuggestedFeeds');
  });
});

describe('Explore Discover tab', () => {
  const rootDir = join(__dirname, '..');

  test('hub Discover tab includes feed catalog section', () => {
    const js = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(js).toContain('discover-catalog-content');
    expect(js).toContain('Browse Feeds');
  });

  test('buildDiscoverCatalogHtml function exists', () => {
    const js = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(js).toMatch(/function\s+buildDiscoverCatalogHtml/);
  });

  test('Discover tab renders catalog collection rows', () => {
    const js = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(js).toContain('catalog-collection-row');
    expect(js).toContain('catalog-feed-card');
  });

  test('feed cards show platform badge', () => {
    const js = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(js).toContain('platform-badge');
  });

  test('Discover tab position depends on article count', () => {
    const js = readFileSync(join(rootDir, 'viewer', '10-explore.js'), 'utf-8');
    expect(js).toContain('allFiles.length');
  });
});

describe('Catalog CSS', () => {
  const rootDir = join(__dirname, '..');

  test('viewer.css has catalog collection styles', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    expect(css).toContain('.catalog-collection-row');
    expect(css).toContain('.catalog-feed-card');
    expect(css).toContain('.platform-badge');
  });

  test('viewer.css has feed picker modal styles', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    expect(css).toContain('.feed-picker');
    expect(css).toContain('.collection-card');
  });
});

describe('Onboarding feed picker', () => {
  const rootDir = join(__dirname, '..');

  test('showFeedPicker function exists in modals', () => {
    const js = readFileSync(join(rootDir, 'viewer', '11-modals.js'), 'utf-8');
    expect(js).toMatch(/function\s+showFeedPicker/);
  });

  test('feed picker has collection selection screen', () => {
    const js = readFileSync(join(rootDir, 'viewer', '11-modals.js'), 'utf-8');
    expect(js).toContain('What are you into');
    expect(js).toContain('collection-card');
  });

  test('feed picker has feed cherry-pick screen', () => {
    const js = readFileSync(join(rootDir, 'viewer', '11-modals.js'), 'utf-8');
    expect(js).toContain('Pick your feeds');
    expect(js).toContain('feed-picker-list');
  });

  test('obFinish triggers feed picker for new users', () => {
    const js = readFileSync(join(rootDir, 'viewer', '11-modals.js'), 'utf-8');
    expect(js).toContain('showFeedPicker');
  });

  test('feed picker subscribe button calls /api/config', () => {
    const js = readFileSync(join(rootDir, 'viewer', '11-modals.js'), 'utf-8');
    expect(js).toContain('feedPickerSubscribe');
  });

  test('feed picker hides empty collections and shows all-subscribed message', () => {
    const js = readFileSync(join(rootDir, 'viewer', '11-modals.js'), 'utf-8');
    expect(js).toContain('already subscribed to all');
    expect(js).toContain('feeds.length > 0');
  });
});

describe('Hub and Manage Sources consolidation', () => {
  const rootDir = join(__dirname, '..');

  test('manage-sources no longer contains FEED_BUNDLES', () => {
    const js = readFileSync(join(rootDir, 'viewer', '16-manage-sources.js'), 'utf-8');
    expect(js).not.toContain('FEED_BUNDLES');
  });

  test('manage-sources no longer contains renderSourcesDiscover', () => {
    const js = readFileSync(join(rootDir, 'viewer', '16-manage-sources.js'), 'utf-8');
    expect(js).not.toMatch(/function\s+renderSourcesDiscover/);
  });

  test('manage-sources links to feed picker', () => {
    const js = readFileSync(join(rootDir, 'viewer', '16-manage-sources.js'), 'utf-8');
    expect(js).toContain('showFeedPicker');
    expect(js).not.toContain('setHomeTab');
  });

  test('manage-sources has feed error container', () => {
    const js = readFileSync(join(rootDir, 'viewer', '16-manage-sources.js'), 'utf-8');
    expect(js).toContain('sp-feed-error');
  });

  test('manage-sources has shortcuts section with platform examples', () => {
    const js = readFileSync(join(rootDir, 'viewer', '16-manage-sources.js'), 'utf-8');
    expect(js).toContain('sources-shortcuts');
    expect(js).toContain('r/subreddit');
    expect(js).toContain('youtube.com');
    expect(js).toContain('@user.bsky.social');
    expect(js).toContain('substack.com');
  });

  test('manage-sources OPML is a text link not a button', () => {
    const js = readFileSync(join(rootDir, 'viewer', '16-manage-sources.js'), 'utf-8');
    // OPML trigger should be an <a> tag, not inside sources-add-row as a button
    expect(js).toMatch(/Import OPML<\/a>/);
  });

  test('viewer.css has sources-shortcuts styles', () => {
    const css = readFileSync(join(rootDir, 'viewer.css'), 'utf-8');
    expect(css).toContain('.sources-shortcuts');
    expect(css).toContain('.sources-shortcut-example');
  });

  test('sourcesAddFeed shows success toast', () => {
    const js = readFileSync(join(rootDir, 'viewer', '16-manage-sources.js'), 'utf-8');
    // Should show toast on successful add
    expect(js).toMatch(/showToast\(.*Added/);
  });

  test('sourcesAddFeed expands Reddit shorthand before discovery', () => {
    const js = readFileSync(join(rootDir, 'viewer', '16-manage-sources.js'), 'utf-8');
    // Shorthand expansion: r/sub → https://www.reddit.com/r/sub
    expect(js).toContain("'https://www.reddit.com/'");
  });

  test('sourcesAddFeed expands Bluesky handle shorthand before discovery', () => {
    const js = readFileSync(join(rootDir, 'viewer', '16-manage-sources.js'), 'utf-8');
    // Should detect @handle.bsky.social and expand to full bsky.app URL
    expect(js).toMatch(/@.*bsky\.app/);
  });

  test('sourcesAddFeed checks for duplicate feeds before adding', () => {
    const js = readFileSync(join(rootDir, 'viewer', '16-manage-sources.js'), 'utf-8');
    // Should check existing feeds and show error if already subscribed
    expect(js).toContain('already subscribed');
  });

  test('hub no longer contains loadSuggestedFeedsSection', () => {
    const js = readFileSync(join(rootDir, 'viewer', '04-article.js'), 'utf-8');
    expect(js).not.toMatch(/function\s+loadSuggestedFeedsSection/);
  });

  test('hub no longer contains addSuggestedFeed', () => {
    const js = readFileSync(join(rootDir, 'viewer', '04-article.js'), 'utf-8');
    expect(js).not.toMatch(/function\s+addSuggestedFeed/);
  });
});
