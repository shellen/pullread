// ABOUTME: Tests for markdown file generation and filesystem write guard
// ABOUTME: Verifies filename slugification, frontmatter, enclosure formatting, and path restrictions

import { generateFilename, generateMarkdown, fileSubpath, resolveFilePath, listMarkdownFiles, listEpubFiles, writeArticle, migrateToDateFolders, exportNotebook, assertWritablePath, setOutputPath, resetWriteGuard, needsRepair, markRepairAttempted } from './writer';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join, resolve, sep } from 'path';
import { homedir } from 'os';

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

  test('includes categories when present', () => {
    const md = generateMarkdown({
      title: 'Tagged Article',
      url: 'https://example.com/tagged',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'example.com',
      content: 'Content',
      categories: ['Technology', 'Programming']
    });

    expect(md).toContain('categories: ["Technology", "Programming"]');
  });

  test('omits categories when empty or absent', () => {
    const md = generateMarkdown({
      title: 'No Tags',
      url: 'https://example.com/none',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'example.com',
      content: 'Content'
    });

    expect(md).not.toContain('categories');
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

  test('includes source when present', () => {
    const md = generateMarkdown({
      title: 'Feed Article',
      url: 'https://example.com/feed-article',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'example.com',
      content: 'Content from feed',
      source: 'feed'
    });

    expect(md).toContain('source: feed');
  });

  test('includes source: extracted', () => {
    const md = generateMarkdown({
      title: 'Extracted Article',
      url: 'https://example.com/extracted',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'example.com',
      content: 'Extracted content',
      source: 'extracted'
    });

    expect(md).toContain('source: extracted');
  });

  test('omits source when absent', () => {
    const md = generateMarkdown({
      title: 'No Source',
      url: 'https://example.com/none',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'example.com',
      content: 'Content'
    });

    expect(md).not.toContain('source:');
  });

  test('includes video enclosure fields when present', () => {
    const md = generateMarkdown({
      title: 'Video Podcast Episode',
      url: 'https://podcast.com/ep1',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'podcast.com',
      content: 'Episode with video',
      enclosure: {
        url: 'https://cdn.example.com/ep1.mp3',
        type: 'audio/mpeg',
        duration: '00:30:00'
      },
      videoEnclosure: {
        url: 'https://cdn.example.com/ep1.mp4',
        type: 'video/mp4',
      }
    });

    expect(md).toContain('enclosure_url: https://cdn.example.com/ep1.mp3');
    expect(md).toContain('enclosure_type: audio/mpeg');
    expect(md).toContain('video_enclosure_url: https://cdn.example.com/ep1.mp4');
    expect(md).toContain('video_enclosure_type: video/mp4');
  });

  test('omits video enclosure fields when absent', () => {
    const md = generateMarkdown({
      title: 'Audio Only Episode',
      url: 'https://podcast.com/ep2',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'podcast.com',
      content: 'Audio only episode',
      enclosure: {
        url: 'https://cdn.example.com/ep2.mp3',
        type: 'audio/mpeg',
      }
    });

    expect(md).toContain('enclosure_url: https://cdn.example.com/ep2.mp3');
    expect(md).not.toContain('video_enclosure');
  });

  test('writes image instead of thumbnail', () => {
    const md = generateMarkdown({
      title: 'Article With Hero',
      url: 'https://example.com/hero',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'example.com',
      content: 'Content',
      thumbnail: 'https://example.com/hero.jpg'
    });

    expect(md).toContain('image: https://example.com/hero.jpg');
    expect(md).not.toContain('thumbnail:');
  });

  test('writes published alongside bookmarked', () => {
    const md = generateMarkdown({
      title: 'Test',
      url: 'https://example.com',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'example.com',
      content: 'Content'
    });

    expect(md).toContain('bookmarked: 2024-01-29T12:00:00Z');
    expect(md).toContain('published: 2024-01-29T12:00:00Z');
  });

  test('includes favicon when present', () => {
    const md = generateMarkdown({
      title: 'Test',
      url: 'https://example.com',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'example.com',
      content: 'Content',
      favicon: 'https://example.com/favicon.ico'
    });

    expect(md).toContain('favicon: https://example.com/favicon.ico');
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

  test('deduplicates when same file exists in root and dated subfolder', () => {
    // Simulate the bug: flat copy left behind after migration
    writeFileSync(join(TEST_DIR, '2024-01-15-article.md'), 'stale flat copy');
    const subdir = join(TEST_DIR, '2024', '01');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, '2024-01-15-article.md'), 'dated copy');

    const files = listMarkdownFiles(TEST_DIR);
    const basenames = files.map(f => require('path').basename(f));
    // Should only appear once
    expect(basenames.filter(b => b === '2024-01-15-article.md')).toHaveLength(1);
    // Should prefer the dated subfolder version
    expect(files).toContain(join(subdir, '2024-01-15-article.md'));
    expect(files).not.toContain(join(TEST_DIR, '2024-01-15-article.md'));
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

  test('deletes stale flat copy when dated copy already exists', () => {
    const subdir = join(TEST_DIR, '2024', '01');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, '2024-01-15-article.md'), 'dated copy');
    writeFileSync(join(TEST_DIR, '2024-01-15-article.md'), 'stale flat copy');

    const moved = migrateToDateFolders(TEST_DIR);
    // Flat copy should be cleaned up
    expect(existsSync(join(TEST_DIR, '2024-01-15-article.md'))).toBe(false);
    // Dated copy should remain untouched
    expect(readFileSync(join(subdir, '2024-01-15-article.md'), 'utf-8')).toBe('dated copy');
  });
});

describe('exportNotebook', () => {
  beforeEach(() => {
    cleanTestDir();
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterAll(cleanTestDir);

  test('exports notebook with note content and frontmatter', () => {
    const notebook: import('./writer').Notebook = {
      id: 'nb-abc123',
      title: 'My Research Notes',
      notes: [
        { id: 'note-1', content: '# Key Finding\n\nImportant discovery here.', sourceArticle: 'article.md', createdAt: '2024-01-15T10:00:00Z', updatedAt: '2024-01-15T10:00:00Z' },
        { id: 'note-2', content: '# Second Note\n\nAnother insight.', createdAt: '2024-01-16T10:00:00Z', updatedAt: '2024-01-16T10:00:00Z' },
      ],
      sources: ['https://example.com'],
      tags: ['research', 'ai'],
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-16T14:00:00Z',
    };

    const filename = exportNotebook(TEST_DIR, notebook);
    expect(filename).toBe('notebook.md');

    const content = readFileSync(join(TEST_DIR, 'notebooks', filename), 'utf-8');
    expect(content).toContain('title: "Notebook"');
    expect(content).toContain('created: 2024-01-15T10:00:00Z');
    expect(content).toContain('tags: ["research", "ai"]');
    expect(content).toContain('# Key Finding');
    expect(content).toContain('Important discovery here.');
    expect(content).toContain('# Second Note');
    expect(content).toContain('https://example.com');
  });

  test('cleans up stale title-based export file', () => {
    // Simulate an old export with a title-based filename
    const dir = join(TEST_DIR, 'notebooks');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'testing.md'), 'old export');

    const notebook: import('./writer').Notebook = {
      id: 'nb-shared',
      title: 'Testing',
      notes: [{ id: 'note-1', content: '# Real Note', createdAt: '2024-01-15T10:00:00Z', updatedAt: '2024-01-15T10:00:00Z' }],
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-16T14:00:00Z',
    };

    const filename = exportNotebook(TEST_DIR, notebook);
    expect(filename).toBe('notebook.md');

    // New canonical file exists
    expect(existsSync(join(dir, 'notebook.md'))).toBe(true);
    const content = readFileSync(join(dir, 'notebook.md'), 'utf-8');
    expect(content).toContain('# Real Note');

    // Old title-based file cleaned up
    expect(existsSync(join(dir, 'testing.md'))).toBe(false);
  });

  test('skips empty notes in export', () => {
    const notebook: import('./writer').Notebook = {
      id: 'nb-shared',
      title: 'Notebook',
      notes: [
        { id: 'note-1', content: '# Has Content', createdAt: '2024-01-15T10:00:00Z', updatedAt: '2024-01-15T10:00:00Z' },
        { id: 'note-2', content: '', createdAt: '2024-01-15T10:00:00Z', updatedAt: '2024-01-15T10:00:00Z' },
        { id: 'note-3', content: '   ', createdAt: '2024-01-15T10:00:00Z', updatedAt: '2024-01-15T10:00:00Z' },
      ],
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-16T14:00:00Z',
    };

    exportNotebook(TEST_DIR, notebook);
    const content = readFileSync(join(TEST_DIR, 'notebooks', 'notebook.md'), 'utf-8');
    expect(content).toContain('# Has Content');
    // Only one --- separator (from the single non-empty note)
    const separators = content.split('---').length - 1;
    // frontmatter has 2 ---, plus one note separator = 3
    expect(separators).toBe(3);
  });
});

describe('needsRepair', () => {
  test('returns true for short article with url and no repairAttempted flag', () => {
    const content = `---
title: "Short Article"
url: https://example.com/article
domain: example.com
bookmarked: 2024-01-29T12:00:00Z
---
Brief content.`;
    expect(needsRepair(content)).toBe(true);
  });

  test('returns false when repairAttempted is true', () => {
    const content = `---
title: "Short Article"
url: https://example.com/article
domain: example.com
repairAttempted: true
---
Brief content.`;
    expect(needsRepair(content)).toBe(false);
  });

  test('returns false when source is feed', () => {
    const content = `---
title: "Feed Article"
url: https://example.com/feed
source: feed
---
Brief.`;
    expect(needsRepair(content)).toBe(false);
  });

  test('returns false when no url', () => {
    const content = `---
title: "No URL Article"
domain: example.com
---
Brief.`;
    expect(needsRepair(content)).toBe(false);
  });

  test('returns false when body is 200+ chars', () => {
    const longBody = 'x'.repeat(200);
    const content = `---
title: "Long Article"
url: https://example.com/long
---
${longBody}`;
    expect(needsRepair(content)).toBe(false);
  });

  test('returns false for content without frontmatter', () => {
    expect(needsRepair('# Just a heading\nSome text')).toBe(false);
  });
});

describe('markRepairAttempted', () => {
  beforeEach(() => {
    cleanTestDir();
    mkdirSync(TEST_DIR, { recursive: true });
    setOutputPath(TEST_DIR);
  });
  afterAll(cleanTestDir);

  test('adds repairAttempted field to frontmatter', () => {
    const filePath = join(TEST_DIR, 'article.md');
    writeFileSync(filePath, `---
title: "Test"
url: https://example.com
---
Short content.`);

    markRepairAttempted(filePath);

    const updated = readFileSync(filePath, 'utf-8');
    expect(updated).toContain('repairAttempted: true');
    // Preserves existing fields
    expect(updated).toContain('title: "Test"');
    expect(updated).toContain('url: https://example.com');
  });

  test('does not duplicate if already marked', () => {
    const filePath = join(TEST_DIR, 'already-marked.md');
    writeFileSync(filePath, `---
title: "Test"
repairAttempted: true
---
Content.`);

    markRepairAttempted(filePath);

    const updated = readFileSync(filePath, 'utf-8');
    const matches = updated.match(/repairAttempted/g);
    expect(matches).toHaveLength(1);
  });
});

describe('assertWritablePath', () => {
  const configDir = resolve(join(homedir(), '.config', 'pullread'));

  beforeEach(() => {
    resetWriteGuard();
  });

  test('allows paths within config dir', () => {
    expect(() => assertWritablePath(join(configDir, 'feeds.json'))).not.toThrow();
  });

  test('allows paths in nested config subdirectories', () => {
    expect(() => assertWritablePath(join(configDir, 'sub', 'deep', 'file.json'))).not.toThrow();
  });

  test('blocks paths outside allowed directories', () => {
    expect(() => assertWritablePath('/etc/passwd')).toThrow('Write blocked');
  });

  test('blocks traversal via ..', () => {
    expect(() => assertWritablePath(join(configDir, '..', '..', 'etc', 'passwd'))).toThrow('Write blocked');
  });

  test('blocks prefix collisions', () => {
    // /Users/x/.config/pullread-evil should NOT match /Users/x/.config/pullread
    expect(() => assertWritablePath(configDir + '-evil/file.txt')).toThrow('Write blocked');
  });

  test('allows paths within registered output path', () => {
    setOutputPath('/tmp/pullread-output');
    expect(() => assertWritablePath('/tmp/pullread-output/2024/01/article.md')).not.toThrow();
  });

  test('allows the output directory itself', () => {
    setOutputPath('/tmp/pullread-output');
    expect(() => assertWritablePath('/tmp/pullread-output')).not.toThrow();
  });

  test('registers multiple output paths', () => {
    setOutputPath('/tmp/output-a');
    setOutputPath('/tmp/output-b');
    expect(() => assertWritablePath('/tmp/output-a/file.md')).not.toThrow();
    expect(() => assertWritablePath('/tmp/output-b/file.md')).not.toThrow();
  });

  test('does not duplicate already-registered paths', () => {
    setOutputPath('/tmp/pullread-output');
    setOutputPath('/tmp/pullread-output');
    // No error — just verifying it doesn't break
    expect(() => assertWritablePath('/tmp/pullread-output/file.md')).not.toThrow();
  });

  test('expands tilde in setOutputPath', () => {
    setOutputPath('~/Documents/pullread-test');
    const expanded = resolve(join(homedir(), 'Documents', 'pullread-test'));
    expect(() => assertWritablePath(join(expanded, 'article.md'))).not.toThrow();
  });
});
