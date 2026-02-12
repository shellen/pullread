// ABOUTME: Generates markdown files with YAML frontmatter
// ABOUTME: Handles filename slugification and content formatting

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
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
}

export function generateFilename(title: string, bookmarkedAt: string): string {
  const date = bookmarkedAt.slice(0, 10);

  let slug = title
    .replace(/^\[Private\]\s*/i, '')
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
    frontmatter += `\nenclosure:`;
    frontmatter += `\n  url: ${data.enclosure.url}`;
    frontmatter += `\n  type: ${data.enclosure.type}`;
    if (data.enclosure.duration) {
      frontmatter += `\n  duration: "${data.enclosure.duration}"`;
    }
  }

  frontmatter += '\n---';

  return `${frontmatter}

${data.content}
`;
}

export function writeArticle(outputPath: string, data: ArticleData): string {
  const filename = generateFilename(data.title, data.bookmarkedAt);
  const fullPath = join(outputPath, filename);

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
