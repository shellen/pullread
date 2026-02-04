// ABOUTME: Extracts article content from web pages using Readability
// ABOUTME: Converts HTML to clean markdown for storage

import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

export interface ExtractedArticle {
  title: string;
  content: string;
  markdown: string;
  byline?: string;
  excerpt?: string;
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

export function extractArticle(html: string, url: string): ExtractedArticle | null {
  const { document } = parseHTML(html);
  // Set document URL for Readability
  Object.defineProperty(document, 'URL', { value: url });
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article || !article.content) {
    return null;
  }

  const markdown = turndown.turndown(article.content);

  return {
    title: article.title || 'Untitled',
    content: article.content,
    markdown,
    byline: article.byline || undefined,
    excerpt: article.excerpt || undefined
  };
}

export async function fetchAndExtract(url: string): Promise<ExtractedArticle | null> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; PullRead/1.0)'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  return extractArticle(html, url);
}
