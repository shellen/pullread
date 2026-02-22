// ABOUTME: Tests for markdown file generation
// ABOUTME: Verifies filename slugification, frontmatter, and enclosure formatting

import { generateFilename, generateMarkdown, fileSubpath, resolveFilePath, listMarkdownFiles, listEpubFiles, writeArticle, migrateToDateFolders, exportNotebook } from './writer';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

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

  test('handles French accented characters', () => {
    const filename = generateFilename('Les Misérables de Victor Hugo', '2024-01-29T12:00:00Z');
    expect(filename).toBe('2024-01-29-les-miserables-de-victor-hugo.md');
  });

  test('handles Spanish accented characters', () => {
    const filename = generateFilename('Ángeles y señales en España', '2024-01-29T12:00:00Z');
    expect(filename).toBe('2024-01-29-angeles-y-senales-en-espana.md');
  });

  test('handles German umlauts and eszett', () => {
    const filename = generateFilename('Über die Größe der Städte', '2024-01-29T12:00:00Z');
    expect(filename).toBe('2024-01-29-uber-die-grosse-der-stadte.md');
  });

  test('handles Italian accented characters', () => {
    const filename = generateFilename('Perché la città è bella', '2024-01-29T12:00:00Z');
    expect(filename).toBe('2024-01-29-perche-la-citta-e-bella.md');
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
    expect(md).not.toContain('# Test Article');
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

  test('includes lang when present', () => {
    const md = generateMarkdown({
      title: 'Article en français',
      url: 'https://example.fr/article',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'example.fr',
      content: 'Contenu de l\'article',
      lang: 'fr'
    });

    expect(md).toContain('lang: fr');
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

  test('includes enclosure for podcasts as flat keys', () => {
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

    expect(md).toContain('enclosure_url: https://cdn.example.com/ep1.mp3');
    expect(md).toContain('enclosure_type: audio/mpeg');
    expect(md).toContain('enclosure_duration: "00:45:30"');
    // Should NOT use nested YAML
    expect(md).not.toContain('enclosure:\n');
  });

  test('omits enclosure_duration when not provided', () => {
    const md = generateMarkdown({
      title: 'Podcast Episode',
      url: 'https://podcast.com/ep1',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'podcast.com',
      content: 'Episode description',
      enclosure: {
        url: 'https://cdn.example.com/ep1.mp3',
        type: 'audio/mpeg',
      }
    });

    expect(md).toContain('enclosure_url: https://cdn.example.com/ep1.mp3');
    expect(md).toContain('enclosure_type: audio/mpeg');
    expect(md).not.toContain('enclosure_duration');
  });
});

describe('fileSubpath', () => {
  test('derives YYYY/MM/filename from dated filename', () => {
    expect(fileSubpath('2024-01-29-my-article.md')).toBe('2024/01/2024-01-29-my-article.md');
  });

  test('handles different months and years', () => {
    expect(fileSubpath('2025-12-05-test.md')).toBe('2025/12/2025-12-05-test.md');
  });

  test('returns filename unchanged for non-dated files', () => {
    expect(fileSubpath('_weekly-review-2024-01-29.md')).toBe('_weekly-review-2024-01-29.md');
  });

  test('returns filename unchanged for bundled book files', () => {
    expect(fileSubpath('pride-and-prejudice.md')).toBe('pride-and-prejudice.md');
  });
});

const TEST_DIR = '/tmp/pullread-writer-test';

function cleanTestDir() {
  try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
}

describe('resolveFilePath', () => {
  beforeEach(() => {
    cleanTestDir();
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterAll(cleanTestDir);

  test('finds file in dated subfolder', () => {
    const subdir = join(TEST_DIR, '2024', '01');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, '2024-01-29-article.md'), 'test');

    const resolved = resolveFilePath(TEST_DIR, '2024-01-29-article.md');
    expect(resolved).toBe(join(subdir, '2024-01-29-article.md'));
  });

  test('falls back to flat path when file exists there', () => {
    writeFileSync(join(TEST_DIR, '2024-01-29-flat.md'), 'test');

    const resolved = resolveFilePath(TEST_DIR, '2024-01-29-flat.md');
    expect(resolved).toBe(join(TEST_DIR, '2024-01-29-flat.md'));
  });

  test('defaults to dated location for new files', () => {
    const resolved = resolveFilePath(TEST_DIR, '2024-01-29-new.md');
    expect(resolved).toBe(join(TEST_DIR, '2024', '01', '2024-01-29-new.md'));
  });

  test('returns flat path for non-dated filenames', () => {
    const resolved = resolveFilePath(TEST_DIR, '_review-2024-01-29.md');
    expect(resolved).toBe(join(TEST_DIR, '_review-2024-01-29.md'));
  });
});

describe('listMarkdownFiles', () => {
  beforeEach(() => {
    cleanTestDir();
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterAll(cleanTestDir);

  test('finds files in root and dated subdirectories', () => {
    writeFileSync(join(TEST_DIR, '_review.md'), 'root file');
    const subdir = join(TEST_DIR, '2024', '01');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, '2024-01-29-article.md'), 'dated file');

    const files = listMarkdownFiles(TEST_DIR);
    expect(files).toHaveLength(2);
    expect(files).toContain(join(TEST_DIR, '_review.md'));
    expect(files).toContain(join(subdir, '2024-01-29-article.md'));
  });

  test('skips favicons and notebooks directories', () => {
    writeFileSync(join(TEST_DIR, 'article.md'), 'ok');
    mkdirSync(join(TEST_DIR, 'favicons'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'favicons', 'not-this.md'), 'skip');
    mkdirSync(join(TEST_DIR, 'notebooks'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'notebooks', 'not-this-either.md'), 'skip');

    const files = listMarkdownFiles(TEST_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('article.md');
  });

  test('returns empty array for non-existent directory', () => {
    expect(listMarkdownFiles('/tmp/does-not-exist-pullread')).toEqual([]);
  });
});

describe('listEpubFiles', () => {
  beforeEach(() => {
    cleanTestDir();
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterAll(cleanTestDir);

  test('finds .epub files in root and subdirectories', () => {
    writeFileSync(join(TEST_DIR, 'book-one.epub'), 'fake epub');
    const subdir = join(TEST_DIR, 'books');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, 'book-two.epub'), 'fake epub 2');

    const files = listEpubFiles(TEST_DIR);
    expect(files).toHaveLength(2);
    expect(files.some(f => f.includes('book-one.epub'))).toBe(true);
    expect(files.some(f => f.includes('book-two.epub'))).toBe(true);
  });

  test('ignores .md files', () => {
    writeFileSync(join(TEST_DIR, 'article.md'), 'markdown');
    writeFileSync(join(TEST_DIR, 'book.epub'), 'epub');

    const files = listEpubFiles(TEST_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('book.epub');
  });

  test('skips favicons and notebooks directories', () => {
    writeFileSync(join(TEST_DIR, 'book.epub'), 'ok');
    mkdirSync(join(TEST_DIR, 'favicons'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'favicons', 'not-this.epub'), 'skip');
    mkdirSync(join(TEST_DIR, 'notebooks'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'notebooks', 'not-this-either.epub'), 'skip');

    const files = listEpubFiles(TEST_DIR);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('book.epub');
  });

  test('returns empty array for non-existent directory', () => {
    expect(listEpubFiles('/tmp/does-not-exist-pullread')).toEqual([]);
  });
});

describe('writeArticle', () => {
  beforeEach(() => {
    cleanTestDir();
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterAll(cleanTestDir);

  test('writes dated articles to YYYY/MM/ subfolder', () => {
    const filename = writeArticle(TEST_DIR, {
      title: 'Test Article',
      url: 'https://example.com/test',
      bookmarkedAt: '2024-03-15T12:00:00Z',
      domain: 'example.com',
      content: 'Article content',
    });

    // Returns bare filename
    expect(filename).toBe('2024-03-15-test-article.md');

    // File written to dated subfolder
    const expected = join(TEST_DIR, '2024', '03', '2024-03-15-test-article.md');
    expect(existsSync(expected)).toBe(true);

    // NOT in root
    expect(existsSync(join(TEST_DIR, '2024-03-15-test-article.md'))).toBe(false);
  });

  test('appends numeric suffix on filename collision', () => {
    const data = {
      title: 'World News',
      url: 'https://example.com/a',
      bookmarkedAt: '2024-03-15T12:00:00Z',
      domain: 'example.com',
      content: 'First article',
    };

    const first = writeArticle(TEST_DIR, data);
    expect(first).toBe('2024-03-15-world-news.md');

    const second = writeArticle(TEST_DIR, { ...data, url: 'https://other.com/b', content: 'Second article' });
    expect(second).toBe('2024-03-15-world-news-2.md');

    const third = writeArticle(TEST_DIR, { ...data, url: 'https://third.com/c', content: 'Third article' });
    expect(third).toBe('2024-03-15-world-news-3.md');

    // All three files exist with correct content
    const dir = join(TEST_DIR, '2024', '03');
    expect(readFileSync(join(dir, '2024-03-15-world-news.md'), 'utf-8')).toContain('First article');
    expect(readFileSync(join(dir, '2024-03-15-world-news-2.md'), 'utf-8')).toContain('Second article');
    expect(readFileSync(join(dir, '2024-03-15-world-news-3.md'), 'utf-8')).toContain('Third article');
  });
});

describe('migrateToDateFolders', () => {
  beforeEach(() => {
    cleanTestDir();
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterAll(cleanTestDir);

  test('moves dated files to YYYY/MM/ subfolders', () => {
    writeFileSync(join(TEST_DIR, '2024-01-15-article-one.md'), 'one');
    writeFileSync(join(TEST_DIR, '2024-03-22-article-two.md'), 'two');
    writeFileSync(join(TEST_DIR, '_weekly-review.md'), 'review');

    const moved = migrateToDateFolders(TEST_DIR);
    expect(moved).toBe(2);

    expect(existsSync(join(TEST_DIR, '2024', '01', '2024-01-15-article-one.md'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '2024', '03', '2024-03-22-article-two.md'))).toBe(true);
    // Non-dated file stays in root
    expect(existsSync(join(TEST_DIR, '_weekly-review.md'))).toBe(true);
    // Originals removed from root
    expect(existsSync(join(TEST_DIR, '2024-01-15-article-one.md'))).toBe(false);
  });

  test('is idempotent — skips already migrated files', () => {
    const subdir = join(TEST_DIR, '2024', '01');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, '2024-01-15-article.md'), 'already there');

    const moved = migrateToDateFolders(TEST_DIR);
    expect(moved).toBe(0);
  });
});

describe('exportNotebook', () => {
  beforeEach(() => {
    cleanTestDir();
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterAll(cleanTestDir);

  test('exports notebook as markdown with frontmatter', () => {
    const notebook: import('./writer').Notebook = {
      id: 'nb-abc123',
      title: 'My Research Notes',
      notes: [{ text: 'Key finding', source: 'article.md' }],
      sources: ['https://example.com'],
      tags: ['research', 'ai'],
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-16T14:00:00Z',
    };

    const filename = exportNotebook(TEST_DIR, notebook);
    expect(filename).toBe('my-research-notes.md');

    const content = readFileSync(join(TEST_DIR, 'notebooks', filename), 'utf-8');
    expect(content).toContain('title: "My Research Notes"');
    expect(content).toContain('created: 2024-01-15T10:00:00Z');
    expect(content).toContain('tags: ["research", "ai"]');
    expect(content).toContain('Key finding');
    expect(content).toContain('*(article.md)*');
    expect(content).toContain('https://example.com');
  });
});
