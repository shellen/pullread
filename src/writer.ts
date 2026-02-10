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

  return filename;
}
