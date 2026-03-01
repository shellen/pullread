// ABOUTME: Parses RSS, Atom, and JSON feeds
// ABOUTME: Extracts entries with metadata, annotations, and enclosures

import { XMLParser } from 'fast-xml-parser';

const FEED_HEADERS = { 'User-Agent': 'PullRead/1.0 (+https://pullread.com)' };

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
  contentHtml?: string;
  enclosure?: Enclosure;
  author?: string;
  categories?: string[];
  thumbnail?: string;
}

type FeedType = 'atom' | 'rss' | 'rdf' | 'json';

function detectFeedType(parsed: any): FeedType {
  if (parsed.feed) return 'atom';
  if (parsed.rss) return 'rss';
  if (parsed['rdf:RDF']) return 'rdf';
  throw new Error('Unknown feed format: expected RSS, Atom, or RDF');
}

function isJsonFeed(text: string): boolean {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed.version === 'string' && parsed.version.includes('jsonfeed.org');
  } catch {
    return false;
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return m + ':' + String(s).padStart(2, '0');
}

function extractMediaUrl(media: any): string | undefined {
  if (!media) return undefined;
  // Single element: { '@_url': '...' }
  if (media['@_url']) return media['@_url'];
  // Array of media:content elements — pick the first image
  if (Array.isArray(media)) {
    const img = media.find((m: any) => !m['@_medium'] || m['@_medium'] === 'image');
    return img?.['@_url'] || media[0]?.['@_url'] || undefined;
  }
  return undefined;
}

function extractCategories(raw: any): string[] | undefined {
  if (!raw) return undefined;
  const items = Array.isArray(raw) ? raw : [raw];
  const cats = items.map((c: any) => {
    if (typeof c === 'string') return c.trim();
    if (c?.['@_term']) return String(c['@_term']).trim();
    if (c?.['#text']) return String(c['#text']).trim();
    if (c?.__cdata) return String(c.__cdata).trim();
    return String(c).trim();
  }).filter(Boolean);
  return cats.length > 0 ? cats : undefined;
}

function parseJsonFeed(text: string): FeedEntry[] {
  const feed = JSON.parse(text);
  const items = Array.isArray(feed.items) ? feed.items : [];

  return items.map((item: any) => {
    const url = item.url || item.external_url || '';
    let domain = '';
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}

    let annotation: string | undefined;
    let contentHtml: string | undefined;
    if (item.content_text?.trim()) {
      annotation = item.content_text.trim();
    } else if (item.content_html?.trim()) {
      annotation = item.content_html.replace(/<[^>]+>/g, '').trim() || undefined;
      if (item.content_html.trim().length > 50) contentHtml = item.content_html.trim();
    } else if (item.summary?.trim()) {
      annotation = item.summary.trim();
    }

    let enclosure: Enclosure | undefined;
    if (Array.isArray(item.attachments) && item.attachments.length > 0) {
      const att = item.attachments[0];
      enclosure = {
        url: att.url,
        type: att.mime_type,
        length: att.size_in_bytes || undefined,
        duration: att.duration_in_seconds ? formatDuration(att.duration_in_seconds) : undefined
      };
    }

    // JSON Feed author: item.author.name (v1.0) or item.authors[0].name (v1.1)
    const jsonAuthor = item.authors?.[0]?.name || item.author?.name || '';
    const jsonAuthorStr = typeof jsonAuthor === 'string' ? jsonAuthor.trim() : '';

    const categories = Array.isArray(item.tags) && item.tags.length > 0
      ? item.tags.filter((t: any) => typeof t === 'string' && t.trim()).map((t: string) => t.trim())
      : undefined;

    const thumbnail = item.image || item.banner_image || undefined;

    return {
      title: item.title || 'Untitled',
      url,
      updatedAt: item.date_published || item.date_modified || '',
      domain,
      annotation: annotation || undefined,
      contentHtml: contentHtml || undefined,
      enclosure,
      author: jsonAuthorStr || undefined,
      categories: categories?.length ? categories : undefined,
      thumbnail
    };
  });
}

function parseJsonFeedTitle(text: string): string | null {
  try {
    const feed = JSON.parse(text);
    return feed.title?.trim() || null;
  } catch {
    return null;
  }
}

function extractAtomAuthorName(author: any): string | undefined {
  if (!author) return undefined;
  if (typeof author === 'string') return author.trim() || undefined;
  // Atom author: { name: "...", uri: "...", email: "..." } — we only want name
  if (author.name) {
    const name = typeof author.name === 'string' ? author.name : String(author.name);
    return name.trim() || undefined;
  }
  return undefined;
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

  // Feed-level author (Atom allows <author> on <feed> as default for entries)
  const feedAuthor = extractAtomAuthorName(feed.author);
  const feedImage = feed.logo || feed.icon || undefined;

  return entries.map((entry: any) => {
    const url = resolveAtomLink(entry.link);
    const domain = new URL(url).hostname.replace(/^www\./, '');

    let annotation: string | undefined;
    let contentHtml: string | undefined;
    let rawHtml = typeof entry.content === 'string' ? entry.content.trim()
      : entry.content?.['__cdata']?.trim() || entry.content?.['#text']?.trim() || undefined;
    if (!rawHtml) {
      rawHtml = typeof entry.summary === 'string' ? entry.summary.trim()
        : entry.summary?.['__cdata']?.trim() || entry.summary?.['#text']?.trim() || undefined;
    }
    if (rawHtml) {
      annotation = extractTextFromHtml(rawHtml);
      if (rawHtml.length > 50) contentHtml = rawHtml;
    }

    const author = extractAtomAuthorName(entry.author) || feedAuthor;
    const categories = extractCategories(entry.category);

    const thumbnail = extractMediaUrl(entry['media:content'])
      || extractMediaUrl(entry['media:thumbnail'])
      || feedImage
      || undefined;

    return {
      title: extractTitle(entry.title),
      url,
      updatedAt: entry.updated,
      domain,
      annotation: annotation || undefined,
      contentHtml: contentHtml || undefined,
      author: author || undefined,
      categories,
      thumbnail
    };
  });
}

function parseRssFeed(rss: any): FeedEntry[] {
  const channel = rss.channel;
  if (!channel || !channel.item) {
    return [];
  }

  const channelImage = channel['itunes:image']?.['@_href'] || channel?.image?.url || undefined;

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

    // Extract raw HTML from description (handles string, CDATA, #text)
    const rawDescription = typeof item.description === 'string' ? item.description.trim()
      : item.description?.__cdata?.trim() || item.description?.['#text']?.trim() || '';
    const description = rawDescription
      ? extractTextFromHtml(extractTitle(item.description))
      : undefined;

    // Preserve full HTML from content:encoded (RSS 2.0 full-content feeds)
    const rawContentEncoded = item['content:encoded'] || item['content\\:encoded'];
    const contentEncodedStr = typeof rawContentEncoded === 'string' ? rawContentEncoded
      : rawContentEncoded?.__cdata || '';
    let contentHtml: string | undefined;
    if (contentEncodedStr.trim().length > 50) {
      contentHtml = contentEncodedStr.trim();
    } else if (rawDescription.length > 50) {
      contentHtml = rawDescription;
    }

    let enclosure: Enclosure | undefined;
    if (item.enclosure) {
      enclosure = {
        url: item.enclosure['@_url'],
        type: item.enclosure['@_type'],
        length: item.enclosure['@_length'] ? parseInt(item.enclosure['@_length'], 10) : undefined,
        duration: item['itunes:duration'] || undefined
      };
    }

    // RSS author: <dc:creator> or <author> (often an email address, sometimes CDATA)
    const rawAuthor = item['dc:creator'] || item.author || '';
    const authorStr = typeof rawAuthor === 'string' ? rawAuthor.trim()
      : rawAuthor?.__cdata?.trim() || rawAuthor?.['#text']?.trim() || '';
    // Strip email format like "email (Name)" → "Name"
    const authorName = authorStr.includes('@')
      ? (authorStr.match(/\(([^)]+)\)/)?.[1] || '').trim()
      : authorStr;

    const categories = extractCategories(item.category);

    const thumbnail = extractMediaUrl(item['media:content'])
      || extractMediaUrl(item['media:thumbnail'])
      || item['itunes:image']?.['@_href']
      || channelImage
      || undefined;

    return [{
      title: extractTitle(item.title),
      url,
      updatedAt: parseRssDate(item.pubDate),
      domain,
      annotation: description || undefined,
      contentHtml: contentHtml || undefined,
      enclosure,
      author: authorName || undefined,
      categories,
      thumbnail
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

    // Preserve full HTML from content:encoded (RDF feeds can include it)
    const rawContentEncoded = item['content:encoded'] || item['content\\:encoded'];
    const contentEncodedStr = typeof rawContentEncoded === 'string' ? rawContentEncoded
      : rawContentEncoded?.__cdata || '';
    const contentHtml = contentEncodedStr.trim().length > 50
      ? contentEncodedStr.trim() : undefined;

    // Dublin Core date (dc:date) is ISO 8601
    const dateStr = item['dc:date'] || item.pubDate || '';
    let updatedAt = dateStr;
    try { updatedAt = new Date(dateStr).toISOString(); } catch {}

    const rdfAuthor = item['dc:creator'] || '';
    const rdfAuthorStr = typeof rdfAuthor === 'string' ? rdfAuthor.trim() : '';
    const categories = extractCategories(item['dc:subject'] || item.category);

    return {
      title: extractTitle(item.title),
      url,
      updatedAt,
      domain,
      annotation: description || undefined,
      contentHtml: contentHtml || undefined,
      author: rdfAuthorStr || undefined,
      categories
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

export function parseFeed(text: string): FeedEntry[] {
  if (isJsonFeed(text)) return parseJsonFeed(text);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    cdataPropName: '__cdata'
  });

  const parsed = parser.parse(text);
  const feedType = detectFeedType(parsed);

  if (feedType === 'atom') {
    return parseAtomFeed(parsed.feed);
  } else if (feedType === 'rdf') {
    return parseRdfFeed(parsed['rdf:RDF']);
  } else {
    return parseRssFeed(parsed.rss);
  }
}

export function parseFeedTitle(text: string): string | null {
  if (isJsonFeed(text)) return parseJsonFeedTitle(text);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    cdataPropName: '__cdata'
  });

  try {
    const parsed = parser.parse(text);
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
  const response = await fetch(url, { headers: FEED_HEADERS });
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

    const typeMatch = tag.match(/type\s*=\s*["'](application\/(rss|atom)\+xml|application\/feed\+json)["']/i);
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
  '/feed.json',      // JSON Feed
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

  const response = await fetch(url, { headers: FEED_HEADERS });
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
      const feedResponse = await fetch(feedUrl, { headers: FEED_HEADERS });
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
      const probeRes = await fetch(candidate, { redirect: 'follow', headers: FEED_HEADERS });
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
        const response = await fetch(`https://www.youtube.com/@${handleMatch[1]}`, { headers: FEED_HEADERS });
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
  const response = await fetch(url, { headers: FEED_HEADERS });
  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status}`);
  }
  const xml = await response.text();
  return parseFeed(xml);
}
