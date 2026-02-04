// ABOUTME: Extracts article content from web pages using Readability
// ABOUTME: Converts HTML to clean markdown for storage

import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { getCookiesForDomain, getDomainFromUrl } from './cookies';

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

export interface FetchOptions {
  useBrowserCookies?: boolean;
}

export async function fetchAndExtract(
  url: string,
  options: FetchOptions = {}
): Promise<ExtractedArticle | null> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  // Add browser cookies if enabled
  if (options.useBrowserCookies) {
    const domain = getDomainFromUrl(url);
    const cookies = getCookiesForDomain(domain);
    if (cookies) {
      headers['Cookie'] = cookies;
    }
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  return extractArticle(html, url);
}
