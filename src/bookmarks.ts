// ABOUTME: Parses Netscape bookmarks.html (exported from browsers, Pinboard, Instapaper, etc.)
// ABOUTME: Extracts bookmark URLs with titles, dates, tags, and descriptions

import { FeedEntry } from './feed';

export interface Bookmark {
  title: string;
  url: string;
  addedAt: string;
  tags: string[];
  description?: string;
}

/**
 * Parse a Netscape-format bookmarks.html file.
 * Works with exports from Chrome, Firefox, Safari, Pinboard, Instapaper,
 * Pocket, Raindrop, and most bookmark managers.
 *
 * Format:
 *   <DT><A HREF="url" ADD_DATE="timestamp" TAGS="tag1,tag2">Title</A>
 *   <DD>Optional description
 */
export function parseBookmarksHtml(html: string): Bookmark[] {
  const bookmarks: Bookmark[] = [];

  // Match <A> tags with HREF attribute inside <DT> elements
  // The regex handles attributes in any order
  const linkPattern = /<DT>\s*<A\s+([^>]+)>([\s\S]*?)<\/A>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    const attrs = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();

    // Extract HREF
    const hrefMatch = attrs.match(/HREF="([^"]+)"/i);
    if (!hrefMatch) continue;
    const url = hrefMatch[1];

    // Skip javascript: and place: URLs
    if (url.startsWith('javascript:') || url.startsWith('place:')) continue;

    // Extract ADD_DATE (Unix timestamp in seconds)
    const dateMatch = attrs.match(/ADD_DATE="(\d+)"/i);
    let addedAt = new Date().toISOString();
    if (dateMatch) {
      try {
        addedAt = new Date(parseInt(dateMatch[1], 10) * 1000).toISOString();
      } catch {}
    }

    // Extract TAGS (comma-separated)
    const tagsMatch = attrs.match(/TAGS="([^"]+)"/i);
    const tags = tagsMatch ? tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean) : [];

    // Look for a <DD> description following this <DT>
    const afterLink = html.slice(match.index + match[0].length, match.index + match[0].length + 2000);
    const ddMatch = afterLink.match(/^\s*(?:<\/DT>)?\s*<DD>([\s\S]*?)(?=<DT>|<\/DL>|<DT |$)/i);
    const description = ddMatch ? ddMatch[1].replace(/<[^>]+>/g, '').trim() : undefined;

    bookmarks.push({
      title: title || url,
      url,
      addedAt,
      tags,
      description: description || undefined,
    });
  }

  return bookmarks;
}

/**
 * Convert parsed bookmarks to FeedEntry format for use with the existing sync pipeline.
 */
export function bookmarksToEntries(bookmarks: Bookmark[]): FeedEntry[] {
  return bookmarks.map(b => {
    let domain = '';
    try { domain = new URL(b.url).hostname.replace(/^www\./, ''); } catch {}

    return {
      title: b.title,
      url: b.url,
      updatedAt: b.addedAt,
      domain,
      annotation: b.description || undefined,
    };
  });
}
