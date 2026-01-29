// ABOUTME: Tests for markdown file generation
// ABOUTME: Verifies filename slugification, frontmatter, and enclosure formatting

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

  test('includes feed name when present', () => {
    const md = generateMarkdown({
      title: 'Test',
      url: 'https://example.com',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'example.com',
      content: 'Content',
      feed: 'bookmarks'
    });

    expect(md).toContain('feed: bookmarks');
  });

  test('includes enclosure for podcasts', () => {
    const md = generateMarkdown({
      title: 'Podcast Episode',
      url: 'https://podcast.com/ep1',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'podcast.com',
      content: 'Episode description',
      feed: 'podcasts',
      enclosure: {
        url: 'https://cdn.example.com/ep1.mp3',
        type: 'audio/mpeg',
        duration: '00:45:30'
      }
    });

    expect(md).toContain('enclosure:');
    expect(md).toContain('  url: https://cdn.example.com/ep1.mp3');
    expect(md).toContain('  type: audio/mpeg');
    expect(md).toContain('  duration: "00:45:30"');
  });
});
