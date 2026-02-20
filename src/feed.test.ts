// ABOUTME: Tests for RSS and Atom feed parsing
// ABOUTME: Verifies extraction of entries from various feed formats

import { parseFeed, parseFeedTitle, discoverFeedUrl } from './feed';

const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Bookmarks</title>
  <entry>
    <title>Test Article Title</title>
    <link href="https://example.com/article"/>
    <id>urn:uuid:12345</id>
    <updated>2024-01-29T19:05:18.441Z</updated>
    <content type="html">
      &lt;p&gt;Some annotation text&lt;/p&gt;
    </content>
  </entry>
  <entry>
    <title>[Private] Another Article</title>
    <link href="https://example.com/private"/>
    <id>urn:uuid:67890</id>
    <updated>2024-01-28T10:00:00.000Z</updated>
    <content type="html"></content>
  </entry>
</feed>`;

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>My RSS Feed</title>
    <item>
      <title>RSS Article</title>
      <link>https://example.com/rss-article</link>
      <pubDate>Mon, 29 Jan 2024 19:05:18 GMT</pubDate>
      <description>This is the article description.</description>
    </item>
    <item>
      <title>Another RSS Item</title>
      <link>https://example.com/another</link>
      <pubDate>Sun, 28 Jan 2024 10:00:00 GMT</pubDate>
      <description></description>
    </item>
  </channel>
</rss>`;

const PODCAST_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>My Podcast</title>
    <item>
      <title><![CDATA[Episode 1: The Beginning]]></title>
      <link>https://podcast.com/ep1</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <description><![CDATA[<p>Episode description here</p>]]></description>
      <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg" length="12345678"/>
      <itunes:duration>00:45:30</itunes:duration>
    </item>
  </channel>
</rss>`;

describe('parseFeed - Atom', () => {
  test('extracts entries from Atom feed', () => {
    const entries = parseFeed(ATOM_FEED);
    expect(entries).toHaveLength(2);
  });

  test('parses entry fields correctly', () => {
    const entries = parseFeed(ATOM_FEED);
    const first = entries[0];

    expect(first.title).toBe('Test Article Title');
    expect(first.url).toBe('https://example.com/article');
    expect(first.updatedAt).toBe('2024-01-29T19:05:18.441Z');
    expect(first.annotation).toBe('Some annotation text');
  });

  test('handles entries without annotation', () => {
    const entries = parseFeed(ATOM_FEED);
    const second = entries[1];

    expect(second.title).toBe('[Private] Another Article');
    expect(second.annotation).toBeUndefined();
  });

  test('extracts domain from URL', () => {
    const entries = parseFeed(ATOM_FEED);
    expect(entries[0].domain).toBe('example.com');
  });
});

describe('parseFeed - RSS', () => {
  test('extracts entries from RSS feed', () => {
    const entries = parseFeed(RSS_FEED);
    expect(entries).toHaveLength(2);
  });

  test('parses RSS entry fields correctly', () => {
    const entries = parseFeed(RSS_FEED);
    const first = entries[0];

    expect(first.title).toBe('RSS Article');
    expect(first.url).toBe('https://example.com/rss-article');
    expect(first.updatedAt).toBe('2024-01-29T19:05:18.000Z');
    expect(first.annotation).toBe('This is the article description.');
    expect(first.domain).toBe('example.com');
  });

  test('handles empty description', () => {
    const entries = parseFeed(RSS_FEED);
    const second = entries[1];

    expect(second.annotation).toBeUndefined();
  });

  test('decodes HTML entities in titles', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Entity Feed</title>
    <item>
      <title>Mumford &#038; Sons announce tour</title>
      <link>https://example.com/mumford</link>
      <pubDate>Mon, 20 Feb 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Rock &amp; Roll Hall of Fame</title>
      <link>https://example.com/rock</link>
      <pubDate>Mon, 20 Feb 2026 11:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Tom&#x27;s Diner &#8211; A Classic</title>
      <link>https://example.com/toms</link>
      <pubDate>Mon, 20 Feb 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].title).toBe('Mumford & Sons announce tour');
    expect(entries[1].title).toBe('Rock & Roll Hall of Fame');
    expect(entries[2].title).toBe("Tom's Diner \u2013 A Classic");
  });

  test('strips HTML tags from titles', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Tag Feed</title>
    <item>
      <title>Grace Ives Announces New Album &lt;em&gt;Girlfriend&lt;/em&gt;: Hear &#8220;Stupid&#8221;</title>
      <link>https://example.com/grace</link>
      <pubDate>Thu, 20 Feb 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Best &lt;b&gt;New&lt;/b&gt; Music: February 2026</title>
      <link>https://example.com/best</link>
      <pubDate>Thu, 20 Feb 2026 11:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].title).toBe('Grace Ives Announces New Album Girlfriend: Hear \u201cStupid\u201d');
    expect(entries[1].title).toBe('Best New Music: February 2026');
  });

  test('strips HTML tags encoded as numeric entities', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Stereogum</title>
    <item>
      <title>At The Gates Announce Final Album &#060;em&#062;The Ghost&#060;/em&#062;: Hear &#8220;Mask&#8221;</title>
      <link>https://example.com/gates</link>
      <pubDate>Thu, 20 Feb 2026 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].title).toBe('At The Gates Announce Final Album The Ghost: Hear \u201cMask\u201d');
  });
});

describe('parseFeed - Podcast', () => {
  test('extracts podcast episode with enclosure', () => {
    const entries = parseFeed(PODCAST_FEED);
    expect(entries).toHaveLength(1);

    const episode = entries[0];
    expect(episode.title).toBe('Episode 1: The Beginning');
    expect(episode.url).toBe('https://podcast.com/ep1');
    expect(episode.annotation).toBe('Episode description here');
  });

  test('parses enclosure metadata', () => {
    const entries = parseFeed(PODCAST_FEED);
    const episode = entries[0];

    expect(episode.enclosure).toBeDefined();
    expect(episode.enclosure!.url).toBe('https://cdn.example.com/ep1.mp3');
    expect(episode.enclosure!.type).toBe('audio/mpeg');
    expect(episode.enclosure!.length).toBe(12345678);
    expect(episode.enclosure!.duration).toBe('00:45:30');
  });

  test('handles CDATA in title and description', () => {
    const entries = parseFeed(PODCAST_FEED);
    const episode = entries[0];

    expect(episode.title).toBe('Episode 1: The Beginning');
    expect(episode.annotation).not.toContain('CDATA');
    expect(episode.annotation).not.toContain('<p>');
  });

  test('falls back to enclosure URL when item has no link', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>No-Link Podcast</title>
    <item>
      <title>Episode Without Link</title>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <description>An episode with no link element</description>
      <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg" length="12345678"/>
      <itunes:duration>00:30:00</itunes:duration>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe('https://cdn.example.com/ep1.mp3');
    expect(entries[0].domain).toBe('cdn.example.com');
    expect(entries[0].enclosure).toBeDefined();
    expect(entries[0].enclosure!.url).toBe('https://cdn.example.com/ep1.mp3');
  });

  test('falls back to guid when item has no link but has guid URL', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Guid Podcast</title>
    <item>
      <title>Episode With Guid</title>
      <guid>https://podcast.com/episodes/123</guid>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <description>An episode with guid but no link</description>
      <enclosure url="https://cdn.example.com/ep2.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe('https://podcast.com/episodes/123');
    expect(entries[0].domain).toBe('podcast.com');
  });

  test('handles link element parsed as object with attributes', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Object Link Feed</title>
    <atom:link href="https://example.com/feed" rel="self" type="application/rss+xml"/>
    <item>
      <title>Item With Object Link</title>
      <link>https://example.com/article</link>
      <atom:link href="https://example.com/article" rel="alternate"/>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <description>Normal article</description>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe('https://example.com/article');
  });

  test('handles link wrapped in CDATA', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>CDATA Link Podcast</title>
    <item>
      <title>CDATA Episode</title>
      <link><![CDATA[https://podcast.example.com/ep1]]></link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <description>Episode with CDATA link</description>
      <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe('https://podcast.example.com/ep1');
    expect(entries[0].domain).toBe('podcast.example.com');
  });

  test('skips items with no usable URL at all', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Bad Feed</title>
    <item>
      <title>No URL Item</title>
      <description>Has no link, guid, or enclosure</description>
    </item>
    <item>
      <title>Good Item</title>
      <link>https://example.com/good</link>
      <description>This one is fine</description>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('Good Item');
  });
});

const RDF_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
 xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
 xmlns="http://purl.org/rss/1.0/"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:taxo="http://purl.org/rss/1.0/modules/taxonomy/">
  <channel rdf:about="https://pinboard.in/u:testuser">
    <title>Pinboard (testuser)</title>
    <link>https://pinboard.in/u:testuser</link>
    <description></description>
  </channel>
  <item rdf:about="https://example.com/article1">
    <title>Pinboard Article One</title>
    <link>https://example.com/article1</link>
    <dc:date>2025-01-15T10:30:00Z</dc:date>
    <dc:creator>testuser</dc:creator>
    <description>A great article about testing</description>
  </item>
  <item rdf:about="https://example.com/article2">
    <title>Another Pinboard Bookmark</title>
    <link>https://example.com/article2</link>
    <dc:date>2025-01-14T08:00:00Z</dc:date>
    <description></description>
  </item>
</rdf:RDF>`;

describe('parseFeed - RDF/RSS 1.0 (Pinboard)', () => {
  test('extracts entries from RDF feed', () => {
    const entries = parseFeed(RDF_FEED);
    expect(entries).toHaveLength(2);
  });

  test('parses RDF entry fields correctly', () => {
    const entries = parseFeed(RDF_FEED);
    const first = entries[0];

    expect(first.title).toBe('Pinboard Article One');
    expect(first.url).toBe('https://example.com/article1');
    expect(first.updatedAt).toBe('2025-01-15T10:30:00.000Z');
    expect(first.annotation).toBe('A great article about testing');
    expect(first.domain).toBe('example.com');
  });

  test('handles empty description', () => {
    const entries = parseFeed(RDF_FEED);
    const second = entries[1];

    expect(second.title).toBe('Another Pinboard Bookmark');
    expect(second.annotation).toBeUndefined();
  });
});

describe('parseFeedTitle', () => {
  test('extracts title from Atom feed', () => {
    expect(parseFeedTitle(ATOM_FEED)).toBe('Bookmarks');
  });

  test('extracts title from RSS feed', () => {
    expect(parseFeedTitle(RSS_FEED)).toBe('My RSS Feed');
  });

  test('extracts title from RDF feed', () => {
    expect(parseFeedTitle(RDF_FEED)).toBe('Pinboard (testuser)');
  });

  test('extracts title from podcast feed with CDATA', () => {
    expect(parseFeedTitle(PODCAST_FEED)).toBe('My Podcast');
  });

  test('returns null for invalid XML', () => {
    expect(parseFeedTitle('not xml at all')).toBeNull();
  });

  test('returns null for unknown format', () => {
    expect(parseFeedTitle('<?xml version="1.0"?><unknown/>')).toBeNull();
  });
});

describe('parseFeed - Atom with multiple link elements', () => {
  test('extracts related URL from entry with alternate and related links', () => {
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Bookmarks</title>
  <entry>
    <title>Test Bookmark</title>
    <link rel="alternate" href="https://www.drafty.com/@user/links"/>
    <link rel="related" href="https://example.com/bookmarked-article"/>
    <id>abc123</id>
    <updated>2024-01-29T19:05:18.441Z</updated>
  </entry>
</feed>`;
    const entries = parseFeed(feed);
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe('https://example.com/bookmarked-article');
    expect(entries[0].domain).toBe('example.com');
  });

  test('falls back to alternate link when no related link exists', () => {
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Bookmarks</title>
  <entry>
    <title>Test Entry</title>
    <link rel="alternate" href="https://example.com/article"/>
    <link rel="self" href="https://example.com/feed/entry/1"/>
    <id>def456</id>
    <updated>2024-01-29T19:05:18.441Z</updated>
  </entry>
</feed>`;
    const entries = parseFeed(feed);
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe('https://example.com/article');
  });
});

describe('parseFeed - Error handling', () => {
  test('throws on unknown feed format', () => {
    const invalidXml = '<?xml version="1.0"?><unknown><item/></unknown>';
    expect(() => parseFeed(invalidXml)).toThrow('Unknown feed format');
  });
});

describe('discoverFeedUrl', () => {
  test('discovers RSS feed from link tag', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="Blog RSS">
    </head><body>Blog content</body></html>`;
    expect(discoverFeedUrl(html, 'https://blog.example.com')).toBe('https://blog.example.com/feed.xml');
  });

  test('discovers Atom feed from link tag', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/atom+xml" href="https://blog.example.com/atom.xml">
    </head><body></body></html>`;
    expect(discoverFeedUrl(html, 'https://blog.example.com')).toBe('https://blog.example.com/atom.xml');
  });

  test('discovers feed with href before type attribute', () => {
    const html = `<html><head>
      <link href="/rss" rel="alternate" type="application/rss+xml">
    </head><body></body></html>`;
    expect(discoverFeedUrl(html, 'https://example.com')).toBe('https://example.com/rss');
  });

  test('resolves relative feed URLs', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="feed.xml">
    </head><body></body></html>`;
    expect(discoverFeedUrl(html, 'https://example.com/blog/')).toBe('https://example.com/blog/feed.xml');
  });

  test('returns null when no feed link found', () => {
    const html = `<html><head>
      <link rel="stylesheet" href="/style.css">
    </head><body></body></html>`;
    expect(discoverFeedUrl(html, 'https://example.com')).toBeNull();
  });

  test('returns null for empty HTML', () => {
    expect(discoverFeedUrl('', 'https://example.com')).toBeNull();
  });
});
