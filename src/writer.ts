// ABOUTME: Generates markdown files with YAML frontmatter
// ABOUTME: Handles filename slugification and content formatting

import { writeFileSync, existsSync, mkdirSync, readdirSync, statSync, renameSync, unlinkSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { Enclosure } from './feed';

export interface ArticleData {
  title: string;
  url: string;
  bookmarkedAt: string;
  domain: string;
  content: string;
  feed?: string;
  annotation?: string;
  enclosure?: Enclosure;
  author?: string;
  excerpt?: string;
  thumbnail?: string;
  lang?: string;
  categories?: string[];
}

export function generateFilename(title: string, bookmarkedAt: string): string {
  const date = bookmarkedAt.slice(0, 10);

  let slug = title
    .replace(/^\[Private\]\s*/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00df/g, 'ss')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  const filename = `${date}-${slug}.md`;

  return filename.length > 70
    ? filename.slice(0, 67) + '.md'
    : filename;
}

export function generateMarkdown(data: ArticleData): string {
  const escapeQuotes = (s: string) => s.replace(/"/g, '\\"');

  let frontmatter = `---
title: "${escapeQuotes(data.title)}"
url: ${data.url}
bookmarked: ${data.bookmarkedAt}
domain: ${data.domain}`;

  if (data.feed) {
    frontmatter += `\nfeed: ${data.feed}`;
  }

  if (data.lang) {
    frontmatter += `\nlang: ${data.lang}`;
  }

  if (data.categories && data.categories.length > 0) {
    frontmatter += `\ncategories: [${data.categories.map(c => `"${escapeQuotes(c)}"`).join(', ')}]`;
  }

  if (data.author) {
    frontmatter += `\nauthor: "${escapeQuotes(data.author)}"`;
  }

  if (data.excerpt) {
    frontmatter += `\nexcerpt: "${escapeQuotes(data.excerpt)}"`;
  }

  if (data.thumbnail) {
    frontmatter += `\nthumbnail: ${data.thumbnail}`;
  }

  if (data.annotation) {
    frontmatter += `\nannotation: "${escapeQuotes(data.annotation)}"`;
  }

  if (data.enclosure) {
    frontmatter += `\nenclosure_url: ${data.enclosure.url}`;
    frontmatter += `\nenclosure_type: ${data.enclosure.type}`;
    if (data.enclosure.duration) {
      frontmatter += `\nenclosure_duration: "${data.enclosure.duration}"`;
    }
  }

  frontmatter += '\n---';

  return `${frontmatter}

${data.content}
`;
}

const DATE_PREFIX_RE = /^(\d{4})-(\d{2})-\d{2}-.+\.md$/;

/** Derive YYYY/MM/filename from a date-prefixed filename. Non-dated files pass through unchanged. */
export function fileSubpath(filename: string): string {
  const m = filename.match(DATE_PREFIX_RE);
  if (!m) return filename;
  return `${m[1]}/${m[2]}/${filename}`;
}

/** Resolve a bare filename to its full path, checking dated subfolder first, then flat. */
export function resolveFilePath(outputPath: string, filename: string): string {
  const subpath = fileSubpath(filename);
  const datedPath = join(outputPath, subpath);
  if (subpath !== filename && existsSync(datedPath)) return datedPath;

  const flatPath = join(outputPath, filename);
  if (existsSync(flatPath)) return flatPath;

  // Default to dated location for new files, or flat for non-dated
  return datedPath;
}

/** Recursively list all .md files, skipping favicons/ and notebooks/ directories. */
export function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  const SKIP = new Set(['favicons', 'notebooks']);

  function walk(current: string) {
    let entries: string[];
    try { entries = readdirSync(current); } catch { return; }
    for (const name of entries) {
      if (SKIP.has(name)) continue;
      const full = join(current, name);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (stat.isFile() && extname(name) === '.md') {
          results.push(full);
        }
      } catch { continue; }
    }
  }

  walk(dir);
  return results;
}

/** Recursively list all .epub files, skipping favicons/ and notebooks/ directories. */
export function listEpubFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  const SKIP = new Set(['favicons', 'notebooks']);

  function walk(current: string) {
    let entries: string[];
    try { entries = readdirSync(current); } catch { return; }
    for (const name of entries) {
      if (SKIP.has(name)) continue;
      const full = join(current, name);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (stat.isFile() && extname(name) === '.epub') {
          results.push(full);
        }
      } catch { continue; }
    }
  }

  walk(dir);
  return results;
}

export function writeArticle(outputPath: string, data: ArticleData): string {
  let filename = generateFilename(data.title, data.bookmarkedAt);
  let fullPath = join(outputPath, fileSubpath(filename));

  // Avoid overwriting an existing file with a different URL
  for (let i = 2; i <= 99 && existsSync(fullPath); i++) {
    filename = filename.replace(/(-\d+)?\.md$/, `-${i}.md`);
    fullPath = join(outputPath, fileSubpath(filename));
  }

  const dir = dirname(fullPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const markdown = generateMarkdown(data);
  writeFileSync(fullPath, markdown, 'utf-8');

  // Download favicon in background (non-blocking)
  if (data.domain) {
    downloadFavicon(data.domain, outputPath).catch(() => {});
  }

  return filename;
}

/** Move dated .md files from root to YYYY/MM/ subfolders. Returns count of files moved. */
export function migrateToDateFolders(outputPath: string): number {
  if (!existsSync(outputPath)) return 0;
  let moved = 0;
  let entries: string[];
  try { entries = readdirSync(outputPath); } catch { return 0; }

  for (const name of entries) {
    if (extname(name) !== '.md') continue;
    const m = name.match(DATE_PREFIX_RE);
    if (!m) continue;

    const src = join(outputPath, name);
    try { if (!statSync(src).isFile()) continue; } catch { continue; }

    const destDir = join(outputPath, m[1], m[2]);
    const dest = join(destDir, name);
    if (existsSync(dest)) continue; // already migrated

    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    renameSync(src, dest);
    moved++;
  }
  return moved;
}

export interface Notebook {
  id: string;
  title: string;
  content?: string;
  notes?: Array<{ text: string; source?: string }>;
  sources?: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Export a notebook as markdown to outputPath/notebooks/{slug}.md */
export function exportNotebook(outputPath: string, notebook: Notebook): string {
  const slug = (notebook.title || notebook.id)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00df/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const filename = `${slug}.md`;
  const dir = join(outputPath, 'notebooks');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const tags = (notebook.tags && notebook.tags.length > 0)
    ? `\ntags: [${notebook.tags.map(t => `"${t}"`).join(', ')}]`
    : '';

  let body = '';
  if (notebook.notes && notebook.notes.length > 0) {
    body += '## Notes\n\n';
    for (const note of notebook.notes) {
      body += `- ${note.text}`;
      if (note.source) body += ` *(${note.source})*`;
      body += '\n';
    }
    body += '\n';
  }
  if (notebook.content) {
    body += notebook.content + '\n';
  }
  if (notebook.sources && notebook.sources.length > 0) {
    body += '\n## Sources\n\n';
    for (const src of notebook.sources) {
      body += `- ${src}\n`;
    }
  }

  const md = `---
title: "${notebook.title.replace(/"/g, '\\"')}"
created: ${notebook.createdAt}
updated: ${notebook.updatedAt}${tags}
---

${body}`;

  writeFileSync(join(dir, filename), md, 'utf-8');
  return filename;
}

/** Remove an exported notebook markdown file */
export function removeExportedNotebook(outputPath: string, notebook: Notebook): void {
  const slug = (notebook.title || notebook.id)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00df/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const filepath = join(outputPath, 'notebooks', `${slug}.md`);
  try { if (existsSync(filepath)) unlinkSync(filepath); } catch {}
}

/** Download a site's favicon and save it locally for privacy */
export async function downloadFavicon(domain: string, outputPath: string): Promise<void> {
  const faviconDir = join(outputPath, 'favicons');
  const faviconPath = join(faviconDir, domain + '.png');
  if (existsSync(faviconPath)) return;

  if (!existsSync(faviconDir)) {
    mkdirSync(faviconDir, { recursive: true });
  }

  // Try the site's own /favicon.ico first, then fall back to Google's service
  const sources = [
    `https://${domain}/favicon.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`,
  ];

  for (const url of sources) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'PullRead/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      // Skip HTML error pages served as favicon
      if (contentType.includes('text/html')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 10) continue;
      writeFileSync(faviconPath, buf);
      return;
    } catch {
      continue;
    }
  }
}
