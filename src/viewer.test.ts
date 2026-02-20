// ABOUTME: Tests for viewer module helpers
// ABOUTME: Covers reprocessFile, parseFrontmatter, sync progress, and XSS sanitization

import { reprocessFile, parseFrontmatter } from './viewer';
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
});

describe('reprocessFile', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `pullread-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    mockFetchAndExtract.mockReset();
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

describe('XSS sanitization', () => {
  const rootDir = join(__dirname, '..');

  test('viewer.html includes DOMPurify script tag', () => {
    const html = readFileSync(join(rootDir, 'viewer.html'), 'utf-8');
    expect(html).toContain('dompurify');
    expect(html).toContain('purify.min.js');
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
