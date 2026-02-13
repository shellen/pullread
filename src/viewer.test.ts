// ABOUTME: Tests for viewer module helpers
// ABOUTME: Covers reprocessFile and parseFrontmatter functions

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
