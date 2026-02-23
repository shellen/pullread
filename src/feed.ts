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

type FeedType = 'atom' | 'rss' | 'rdf';

function detectFeedType(parsed: any): FeedType {
  if (parsed.feed) return 'atom';
  if (parsed.rss) return 'rss';
  if (parsed['rdf:RDF']) return 'rdf';
  throw new Error('Unknown feed format: expected RSS, Atom, or RDF');
}

function resolveAtomLink(link: any): string {
  if (typeof link === 'string') return link;
  if (!Array.isArray(link)) return link?.['@_href'] || '';
  // Multiple <link> elements: prefer rel="related", then rel="alternate", then first href
  const related = link.find((l: any) => l['@_rel'] === 'related');
  if (related) return related['@_href'];
  const alternate = link.find((l: any) => l['@_rel'] === 'alternate');
  if (alternate) return alternate['@_href'];
  return link[0]?.['@_href'] || '';
}

function parseAtomFeed(feed: any): FeedEntry[] {
  if (!feed || !feed.entry) {
    return [];
  }

  const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];

  return entries.map((entry: any) => {
    const url = resolveAtomLink(entry.link);
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

  return items.flatMap((item: any) => {
    // Resolve item URL: prefer <link>, fall back to <guid>, then enclosure URL
    let url = typeof item.link === 'string' ? item.link
      : item.link?.['@_href'] || item.link?.['#text'] || item.link?.['__cdata'] || undefined;
    if (!url && item.guid) {
      const guid = typeof item.guid === 'string' ? item.guid : item.guid?.['#text'];
      if (guid && guid.startsWith('http')) url = guid;
    }
    if (!url && item.enclosure?.['@_url']) {
      url = item.enclosure['@_url'];
    }
    if (!url) return []; // skip items with no usable URL

    let domain = '';
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}

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

    return [{
      title: extractTitle(item.title),
      url,
      updatedAt: parseRssDate(item.pubDate),
      domain,
      annotation: description || undefined,
      enclosure
    }];
  });
}

function parseRdfFeed(rdf: any): FeedEntry[] {
  // RDF/RSS 1.0: items are siblings to channel, not children
  const items = rdf.item ? (Array.isArray(rdf.item) ? rdf.item : [rdf.item]) : [];

  return items.map((item: any) => {
    const url = item.link || item['@_rdf:about'] || '';
    let domain = '';
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}

    const description = item.description
      ? extractTextFromHtml(extractTitle(item.description))
      : undefined;

    // Dublin Core date (dc:date) is ISO 8601
    const dateStr = item['dc:date'] || item.pubDate || '';
    let updatedAt = dateStr;
    try { updatedAt = new Date(dateStr).toISOString(); } catch {}

    return {
      title: extractTitle(item.title),
      url,
      updatedAt,
      domain,
      annotation: description || undefined
    };
  });
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractTitle(title: any): string {
  let text: string;
  if (typeof title === 'string') text = title;
  else if (title?.['#text']) text = title['#text'];
  else if (title?.['__cdata']) text = title['__cdata'];
  else text = String(title || 'Untitled');
  return decodeEntities(text).replace(/<[^>]+>/g, '').trim();
}

function parseRssDate(dateStr: string): string {
  try {
    return new Date(dateStr).toISOString();
  } catch {
    return dateStr;
  }
}

function extractTextFromHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
      .replace(/<[^>]+>/g, '')
  ).trim();
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
  } else if (feedType === 'rdf') {
    return parseRdfFeed(parsed['rdf:RDF']);
  } else {
    return parseRssFeed(parsed.rss);
  }
}

export function parseFeedTitle(xml: string): string | null {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    cdataPropName: '__cdata'
  });

  try {
    const parsed = parser.parse(xml);
    const feedType = detectFeedType(parsed);

    let title: any;
    if (feedType === 'atom') {
      title = parsed.feed?.title;
    } else if (feedType === 'rss') {
      title = parsed.rss?.channel?.title;
    } else if (feedType === 'rdf') {
      title = parsed['rdf:RDF']?.channel?.title;
    }

    if (!title) return null;

    const raw = typeof title === 'object' ? (title.__cdata || title['#text'] || '') : String(title);
    return raw.replace(/<[^>]+>/g, '').trim() || null;
  } catch {
    return null;
  }
}

export async function fetchFeedTitle(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const xml = await response.text();
  return parseFeedTitle(xml);
}

/**
 * Discover RSS/Atom feed URL from an HTML page.
 * Looks for <link rel="alternate" type="application/rss+xml|application/atom+xml"> tags.
 * Returns the feed URL if found, null otherwise.
 */
export function discoverFeedUrl(html: string, baseUrl: string): string | null {
  // Match <link> tags with rel="alternate" and RSS/Atom types
  const linkRegex = /<link\b[^>]*>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    const relMatch = tag.match(/rel\s*=\s*["']?\s*alternate\s*["']?/i);
    if (!relMatch) continue;

    const typeMatch = tag.match(/type\s*=\s*["'](application\/(rss|atom)\+xml)["']/i);
    if (!typeMatch) continue;

    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;

    const href = hrefMatch[1].trim();
    // Resolve relative URLs
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return href;
    }
  }
  return null;
}

/**
 * Well-known RSS/Atom feed paths for popular newsletter and blogging platforms.
 * Tried in order when HTML <link> auto-discovery fails.
 */
const WELL_KNOWN_FEED_PATHS = [
  '/feed',           // WordPress, Ghost, many blogs
  '/rss',            // Substack, Ghost, generic
  '/feed.xml',       // Jekyll, Hugo, many static sites
  '/rss.xml',        // common fallback
  '/atom.xml',       // Atom feeds
  '/index.xml',      // Hugo default
  '/feed/rss',       // Buttondown
  '/blog/rss',       // some platforms put feeds under /blog
];

/**
 * Try to discover and return the feed URL from a given URL.
 * If the URL is already an RSS/Atom feed, returns the original URL.
 * If it's an HTML page, tries to discover the feed via <link> tags,
 * then falls back to probing well-known feed paths (Substack, Ghost,
 * Buttondown, WordPress, etc.).
 */
export async function discoverFeed(url: string): Promise<{ feedUrl: string; title: string | null } | null> {
  url = await transformPlatformUrl(url);

  const response = await fetch(url);
  if (!response.ok) return null;
  const text = await response.text();

  // First, try parsing as a feed directly
  const title = parseFeedTitle(text);
  if (title !== null) {
    return { feedUrl: url, title };
  }

  // Not a feed — try HTML <link> auto-discovery
  const feedUrl = discoverFeedUrl(text, url);
  if (feedUrl) {
    try {
      const feedResponse = await fetch(feedUrl);
      if (feedResponse.ok) {
        const feedXml = await feedResponse.text();
        const feedTitle = parseFeedTitle(feedXml);
        if (feedTitle !== null) return { feedUrl, title: feedTitle };
      }
    } catch {}
    // Even if we couldn't fetch title, the <link> tag is authoritative
    return { feedUrl, title: null };
  }

  // Fallback: probe well-known feed paths
  let baseOrigin: string;
  try { baseOrigin = new URL(url).origin; } catch { return null; }

  for (const path of WELL_KNOWN_FEED_PATHS) {
    const candidate = baseOrigin + path;
    try {
      const probeRes = await fetch(candidate, { redirect: 'follow' });
      if (!probeRes.ok) continue;
      const probeText = await probeRes.text();
      const probeTitle = parseFeedTitle(probeText);
      if (probeTitle !== null) {
        return { feedUrl: candidate, title: probeTitle };
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Transform platform-specific URLs (YouTube, Reddit) into RSS feed URLs.
 * Returns the original URL if no platform pattern matches.
 */
export async function transformPlatformUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const host = parsed.hostname.replace(/^www\./, '');

  // YouTube: /channel/UCxxx → feed URL directly
  if (host === 'youtube.com') {
    // Already a feed URL
    if (parsed.pathname.startsWith('/feeds/')) return url;

    const channelMatch = parsed.pathname.match(/^\/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (channelMatch) {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelMatch[1]}`;
    }

    // YouTube: /@handle → fetch page to find channel ID
    const handleMatch = parsed.pathname.match(/^\/@([\w.-]+)/);
    if (handleMatch) {
      try {
        const response = await fetch(`https://www.youtube.com/@${handleMatch[1]}`);
        if (response.ok) {
          const html = await response.text();
          // Look for channel ID in page source
          const idMatch = html.match(/"externalId"\s*:\s*"(UC[a-zA-Z0-9_-]+)"/)
            || html.match(/<meta\s+itemprop="identifier"\s+content="(UC[a-zA-Z0-9_-]+)"/)
            || html.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
          if (idMatch) {
            return `https://www.youtube.com/feeds/videos.xml?channel_id=${idMatch[1]}`;
          }
        }
      } catch {}
    }
  }

  // Reddit: /r/subreddit → append .rss
  if (host === 'reddit.com') {
    const subredditMatch = parsed.pathname.match(/^\/r\/([\w]+)\/?$/);
    if (subredditMatch) {
      return `https://www.reddit.com/r/${subredditMatch[1]}/.rss`;
    }
  }

  return url;
}

export async function fetchFeed(url: string): Promise<FeedEntry[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status}`);
  }
  const xml = await response.text();
  return parseFeed(xml);
}
