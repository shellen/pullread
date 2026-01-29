// ABOUTME: Parses Atom feeds from Drafty
// ABOUTME: Extracts bookmark entries with metadata and annotations

import { XMLParser } from 'fast-xml-parser';

export interface FeedEntry {
  title: string;
  url: string;
  updatedAt: string;
  domain: string;
  annotation?: string;
}

export function parseFeed(xml: string): FeedEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });

  const parsed = parser.parse(xml);
  const feed = parsed.feed;

  if (!feed || !feed.entry) {
    return [];
  }

  const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];

  return entries.map((entry: any) => {
    const url = entry.link?.['@_href'] || entry.link;
    const domain = new URL(url).hostname.replace(/^www\./, '');

    let annotation: string | undefined;
    if (entry.content && typeof entry.content === 'string' && entry.content.trim()) {
      annotation = extractTextFromHtml(entry.content);
    } else if (entry.content?.['#text']?.trim()) {
      annotation = extractTextFromHtml(entry.content['#text']);
    }

    return {
      title: entry.title,
      url,
      updatedAt: entry.updated,
      domain,
      annotation: annotation || undefined
    };
  });
}

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
}

export async function fetchFeed(url: string): Promise<FeedEntry[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status}`);
  }
  const xml = await response.text();
  return parseFeed(xml);
}
