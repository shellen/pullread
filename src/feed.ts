// ABOUTME: Parses RSS and Atom feeds
// ABOUTME: Extracts entries with metadata, annotations, and enclosures

import { XMLParser } from 'fast-xml-parser';

export interface Enclosure {
  url: string;
  type: string;
  length?: number;
  duration?: string;
}

export interface FeedEntry {
  title: string;
  url: string;
  updatedAt: string;
  domain: string;
  annotation?: string;
  enclosure?: Enclosure;
}

type FeedType = 'atom' | 'rss';

function detectFeedType(parsed: any): FeedType {
  if (parsed.feed) return 'atom';
  if (parsed.rss) return 'rss';
  throw new Error('Unknown feed format: expected RSS or Atom');
}

function parseAtomFeed(feed: any): FeedEntry[] {
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
      title: extractTitle(entry.title),
      url,
      updatedAt: entry.updated,
      domain,
      annotation: annotation || undefined
    };
  });
}

function parseRssFeed(rss: any): FeedEntry[] {
  const channel = rss.channel;
  if (!channel || !channel.item) {
    return [];
  }

  const items = Array.isArray(channel.item) ? channel.item : [channel.item];

  return items.map((item: any) => {
    const url = item.link;
    const domain = new URL(url).hostname.replace(/^www\./, '');

    const description = item.description
      ? extractTextFromHtml(extractTitle(item.description))
      : undefined;

    let enclosure: Enclosure | undefined;
    if (item.enclosure) {
      enclosure = {
        url: item.enclosure['@_url'],
        type: item.enclosure['@_type'],
        length: item.enclosure['@_length'] ? parseInt(item.enclosure['@_length'], 10) : undefined,
        duration: item['itunes:duration'] || undefined
      };
    }

    return {
      title: extractTitle(item.title),
      url,
      updatedAt: parseRssDate(item.pubDate),
      domain,
      annotation: description || undefined,
      enclosure
    };
  });
}

function extractTitle(title: any): string {
  if (typeof title === 'string') return title;
  if (title?.['#text']) return title['#text'];
  if (title?.['__cdata']) return title['__cdata'];
  return String(title || 'Untitled');
}

function parseRssDate(dateStr: string): string {
  try {
    return new Date(dateStr).toISOString();
  } catch {
    return dateStr;
  }
}

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

export function parseFeed(xml: string): FeedEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    cdataPropName: '__cdata'
  });

  const parsed = parser.parse(xml);
  const feedType = detectFeedType(parsed);

  if (feedType === 'atom') {
    return parseAtomFeed(parsed.feed);
  } else {
    return parseRssFeed(parsed.rss);
  }
}

export async function fetchFeed(url: string): Promise<FeedEntry[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status}`);
  }
  const xml = await response.text();
  return parseFeed(xml);
}
