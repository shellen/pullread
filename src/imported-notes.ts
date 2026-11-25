// ABOUTME: Detects and clears article notes that are really the feed's own description.
// ABOUTME: Older builds copied frontmatter `annotation:` (often a feed blurb) into articleNote.

import { existsSync, readFileSync, writeFileSync, openSync, readSync, closeSync } from 'fs';
import { join } from 'path';
import { allNotes, loadAnnotation, saveAnnotation } from './annotations';
import { resolveFilePath } from './writer';
import { isBookmarkFeedUrl } from './feed';

/** Marker file in the config dir; its presence means the cleanup already ran. */
export const IMPORTED_NOTES_CLEANUP_MARKER = '.imported-notes-cleanup-v1';

/** Feed names whose articles come from the reader's own bookmarks. */
const ALWAYS_BOOKMARK_FEEDS = new Set(['import', 'inbox']);

export const normalizeNoteText = (t: string) =>
  t.toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/** Read one raw frontmatter field (first line only), unquoted and unescaped. */
function frontmatterField(frontmatter: string, key: string): string {
  const m = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  if (!m) return '';
  return m[1].trim().replace(/^"([\s\S]*)"$/, '$1').replace(/\\"/g, '"');
}

/** Extract the YAML frontmatter block from the start of an article. */
export function extractFrontmatter(markdown: string): string {
  return markdown.match(/^---\n([\s\S]*?)\n---/)?.[1] || '';
}

/**
 * Is this article note really the feed's description? Compares it with the
 * frontmatter `annotation:` (where older builds stored feed descriptions) and
 * `description:` (where they're stored now): normalize both, then compare the
 * first 60 characters. A note longer than the description is treated as one
 * the reader added to, and kept.
 */
export function isImportedDescription(note: string, frontmatter: string): boolean {
  const n = normalizeNoteText(note || '');
  if (!n) return false;
  for (const key of ['annotation', 'description']) {
    const a = normalizeNoteText(frontmatterField(frontmatter, key));
    if (!a) continue;
    const k = Math.min(60, a.length, n.length);
    if (a.slice(0, k) === n.slice(0, k) && n.length <= a.length) return true;
  }
  return false;
}

/** Is this article from a bookmark source, where `annotation:` is the reader's own note? */
export function isBookmarkArticle(frontmatter: string, bookmarkFeedNames: Set<string>): boolean {
  const feed = frontmatterField(frontmatter, 'feed');
  return ALWAYS_BOOKMARK_FEEDS.has(feed) || bookmarkFeedNames.has(feed);
}

/** Names of configured feeds that point at a bookmark service. */
export function bookmarkFeedNamesFromConfig(feeds: Record<string, unknown> | undefined): Set<string> {
  const names = new Set<string>();
  for (const [name, url] of Object.entries(feeds || {})) {
    if (typeof url === 'string' && isBookmarkFeedUrl(url)) names.add(name);
  }
  return names;
}

function readHead(path: string, bytes = 8192): string {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    return buf.toString('utf-8', 0, n);
  } finally {
    closeSync(fd);
  }
}

export interface ImportedNotesCleanupResult {
  checked: number;
  cleared: number;
  skipped: boolean;
}

/**
 * One-time cleanup: clear articleNote wherever it's just the feed description
 * copied in by the old viewer migration. Leaves bookmark-feed articles alone
 * (their annotation is the reader's own note) and notes the reader edited.
 * Requires initAnnotations() to have run. Writes a marker so it runs once.
 */
export function cleanupImportedDescriptionNotes(
  outputPath: string,
  configDir: string,
  bookmarkFeedNames: Set<string>,
): ImportedNotesCleanupResult {
  const markerPath = join(configDir, IMPORTED_NOTES_CLEANUP_MARKER);
  if (existsSync(markerPath)) return { checked: 0, cleared: 0, skipped: true };

  let checked = 0;
  let cleared = 0;
  for (const [filename, note] of Object.entries(allNotes())) {
    if (!note.articleNote?.trim()) continue;
    checked++;
    try {
      const mdPath = resolveFilePath(outputPath, filename);
      if (!existsSync(mdPath)) continue;
      const fm = extractFrontmatter(readHead(mdPath));
      if (!fm || isBookmarkArticle(fm, bookmarkFeedNames)) continue;
      if (!isImportedDescription(note.articleNote, fm)) continue;
      saveAnnotation(filename, { ...loadAnnotation(filename), articleNote: '' });
      cleared++;
    } catch {
      continue;
    }
  }

  try {
    writeFileSync(markerPath, JSON.stringify({ ranAt: new Date().toISOString(), checked, cleared }) + '\n');
  } catch {}
  return { checked, cleared, skipped: false };
}

/** Load bookmark feed names from feeds.json in the config dir. */
export function loadBookmarkFeedNames(configDir: string): Set<string> {
  try {
    const cfg = JSON.parse(readFileSync(join(configDir, 'feeds.json'), 'utf-8'));
    return bookmarkFeedNamesFromConfig(cfg?.feeds);
  } catch {
    return new Set();
  }
}
