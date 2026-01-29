// ABOUTME: Tests for markdown file generation
// ABOUTME: Verifies filename slugification and frontmatter formatting

import { generateFilename, generateMarkdown } from './writer';

describe('generateFilename', () => {
  test('creates date-prefixed slug', () => {
    const filename = generateFilename('My Article Title', '2024-01-29T19:05:18.441Z');
    expect(filename).toBe('2024-01-29-my-article-title.md');
  });

  test('removes special characters', () => {
    const filename = generateFilename("What's Next? A Look @ 2024!", '2024-01-29T12:00:00Z');
    expect(filename).toBe('2024-01-29-whats-next-a-look-2024.md');
  });

  test('truncates long titles', () => {
    const longTitle = 'This is an extremely long article title that goes on and on and should be truncated';
    const filename = generateFilename(longTitle, '2024-01-29T12:00:00Z');
    expect(filename.length).toBeLessThanOrEqual(70);
    expect(filename).toMatch(/\.md$/);
  });

  test('handles Private prefix', () => {
    const filename = generateFilename('[Private] Secret Article', '2024-01-29T12:00:00Z');
    expect(filename).toBe('2024-01-29-secret-article.md');
  });
});

describe('generateMarkdown', () => {
  test('generates frontmatter and content', () => {
    const md = generateMarkdown({
      title: 'Test Article',
      url: 'https://example.com/test',
      bookmarkedAt: '2024-01-29T19:05:18.441Z',
      domain: 'example.com',
      content: 'This is the article content.'
    });

    expect(md).toContain('---');
    expect(md).toContain('title: "Test Article"');
    expect(md).toContain('url: https://example.com/test');
    expect(md).toContain('bookmarked: 2024-01-29T19:05:18.441Z');
    expect(md).toContain('domain: example.com');
    expect(md).toContain('# Test Article');
    expect(md).toContain('This is the article content.');
  });

  test('includes annotation when present', () => {
    const md = generateMarkdown({
      title: 'Test',
      url: 'https://example.com',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'example.com',
      content: 'Content',
      annotation: 'My note about this'
    });

    expect(md).toContain('annotation: "My note about this"');
  });

  test('escapes quotes in title', () => {
    const md = generateMarkdown({
      title: 'Article with "quotes"',
      url: 'https://example.com',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'example.com',
      content: 'Content'
    });

    expect(md).toContain('title: "Article with \\"quotes\\""');
  });
});
