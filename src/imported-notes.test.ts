// ABOUTME: Tests for detecting and clearing article notes that are really feed descriptions
// ABOUTME: Covers the comparison, bookmark-feed exemption, edited notes, and run-once marker

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initAnnotations, saveAnnotation, loadAnnotation } from './annotations';
import {
  isImportedDescription,
  cleanupImportedDescriptionNotes,
  bookmarkFeedNamesFromConfig,
  loadBookmarkFeedNames,
  IMPORTED_NOTES_CLEANUP_MARKER,
} from './imported-notes';

let testDir: string;
let outputPath: string;
let configDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `pullread-imported-notes-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  outputPath = join(testDir, 'articles');
  configDir = join(testDir, 'config');
  mkdirSync(outputPath, { recursive: true });
  mkdirSync(configDir, { recursive: true });
});

afterEach(() => {
  try { rmSync(testDir, { recursive: true, force: true }); } catch {}
});

function writeArticle(filename: string, frontmatter: string) {
  writeFileSync(join(outputPath, filename), `---\ntitle: "T"\n${frontmatter}\n---\n\nBody text.\n`);
}

function note(filename: string, articleNote: string) {
  saveAnnotation(filename, {
    highlights: [{ id: 'h1', text: 'kept' }],
    articleNote,
    annotations: [],
    tags: ['keep-me'],
    machineTags: [],
    isFavorite: true,
  });
}

describe('isImportedDescription', () => {
  test('matches a note copied from annotation:, ignoring case, punctuation and escapes', () => {
    const fm = 'feed: news\nannotation: "The \\"Big\\" Story: what happened today"';
    expect(isImportedDescription('the \\"Big\\" story -- what happened today', fm)).toBe(true);
  });

  test('matches against description: too', () => {
    expect(isImportedDescription('A feed blurb', 'description: "A feed blurb"')).toBe(true);
  });

  test('compares only the first 60 normalized characters', () => {
    const long = 'x'.repeat(59) + ' and then the description keeps going for a while';
    const truncated = 'x'.repeat(59) + ' and then something else';
    expect(isImportedDescription(truncated, `annotation: "${long}"`)).toBe(true);
  });

  test('keeps a note the reader wrote', () => {
    expect(isImportedDescription('I should read this later', 'annotation: "A feed blurb"')).toBe(false);
  });

  test('keeps a note the reader added to after the copy', () => {
    expect(isImportedDescription('A feed blurb. My thoughts: worth sharing.', 'annotation: "A feed blurb"')).toBe(false);
  });

  test('no frontmatter text means not imported', () => {
    expect(isImportedDescription('Anything', 'feed: news')).toBe(false);
    expect(isImportedDescription('', 'annotation: "x"')).toBe(false);
  });
});

describe('bookmarkFeedNamesFromConfig', () => {
  test('picks feeds that point at bookmark services', () => {
    const names = bookmarkFeedNamesFromConfig({
      pinboard: 'https://feeds.pinboard.in/rss/u:someone/',
      ars: 'https://feeds.arstechnica.com/arstechnica/index',
    });
    expect([...names]).toEqual(['pinboard']);
  });

  test('loads from feeds.json, tolerating a missing file', () => {
    expect(loadBookmarkFeedNames(configDir).size).toBe(0);
    writeFileSync(join(configDir, 'feeds.json'), JSON.stringify({ feeds: { insta: 'https://www.instapaper.com/rss/1/x' } }));
    expect([...loadBookmarkFeedNames(configDir)]).toEqual(['insta']);
  });
});

describe('cleanupImportedDescriptionNotes', () => {
  test('clears fake notes, keeps real ones and bookmark annotations, then never reruns', () => {
    writeArticle('fake.md', 'feed: news\nannotation: "Publisher blurb about the article"');
    writeArticle('real.md', 'feed: news\nannotation: "Publisher blurb"');
    writeArticle('pinboard.md', 'feed: pinboard\nannotation: "My own Pinboard note"');
    writeArticle('imported.md', 'feed: import\nannotation: "From my bookmarks.html"');
    writeArticle('nodesc.md', 'feed: news');
    initAnnotations(outputPath, configDir);
    note('fake.md', 'Publisher blurb about the article');
    note('real.md', 'Great piece, follow up with the author');
    note('pinboard.md', 'My own Pinboard note');
    note('imported.md', 'From my bookmarks.html');
    note('nodesc.md', 'Something I wrote');

    const result = cleanupImportedDescriptionNotes(outputPath, configDir, new Set(['pinboard']));
    expect(result).toEqual({ checked: 5, cleared: 1, skipped: false });

    const fake = loadAnnotation('fake.md');
    expect(fake.articleNote).toBe('');
    // Everything else on the sidecar survives
    expect(fake.highlights).toHaveLength(1);
    expect(fake.tags).toEqual(['keep-me']);
    expect(fake.isFavorite).toBe(true);
    expect(JSON.parse(readFileSync(join(outputPath, 'fake.annot.json'), 'utf-8')).articleNote).toBe('');

    expect(loadAnnotation('real.md').articleNote).toBe('Great piece, follow up with the author');
    expect(loadAnnotation('pinboard.md').articleNote).toBe('My own Pinboard note');
    expect(loadAnnotation('imported.md').articleNote).toBe('From my bookmarks.html');
    expect(loadAnnotation('nodesc.md').articleNote).toBe('Something I wrote');

    expect(existsSync(join(configDir, IMPORTED_NOTES_CLEANUP_MARKER))).toBe(true);

    // A later note that happens to match is not touched: the cleanup is one-time.
    note('fake.md', 'Publisher blurb about the article');
    expect(cleanupImportedDescriptionNotes(outputPath, configDir, new Set()).skipped).toBe(true);
    expect(loadAnnotation('fake.md').articleNote).toBe('Publisher blurb about the article');
  });

  test('finds articles in dated subfolders', () => {
    mkdirSync(join(outputPath, '2026', '03'), { recursive: true });
    writeFileSync(join(outputPath, '2026', '03', '2026-03-01-story.md'), '---\nfeed: news\nannotation: "Blurb"\n---\n\nBody\n');
    initAnnotations(outputPath, configDir);
    note('2026-03-01-story.md', 'Blurb');
    expect(cleanupImportedDescriptionNotes(outputPath, configDir, new Set()).cleared).toBe(1);
    expect(loadAnnotation('2026-03-01-story.md').articleNote).toBe('');
  });
});
