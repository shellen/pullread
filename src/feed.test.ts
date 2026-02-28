// ABOUTME: Tests for RSS, Atom, and JSON feed parsing
// ABOUTME: Verifies extraction of entries from various feed formats

import { parseFeed, parseFeedTitle, discoverFeedUrl, transformPlatformUrl } from './feed';

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

  test('preserves contentHtml when Atom content is substantial', () => {
    const longContent = '<p>' + 'This is a full article paragraph. '.repeat(10) + '</p>';
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Full Content Feed</title>
  <entry>
    <title>Full Article</title>
    <link href="https://newcomer.co/p/test-article"/>
    <id>urn:uuid:full-1</id>
    <updated>2024-06-01T12:00:00Z</updated>
    <content type="html">${longContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</content>
  </entry>
</feed>`;
    const entries = parseFeed(feed);
    expect(entries[0].contentHtml).toBeDefined();
    expect(entries[0].contentHtml!.length).toBeGreaterThan(200);
    expect(entries[0].annotation).toBeDefined();
  });

  test('does not set contentHtml for short Atom content', () => {
    const entries = parseFeed(ATOM_FEED);
    expect(entries[0].contentHtml).toBeUndefined();
    expect(entries[0].annotation).toBe('Some annotation text');
  });

  test('preserves contentHtml for medium-length Atom content (50-200 chars)', () => {
    const mediumContent = '<p>This is a short blog post with enough content to be worth preserving as feed HTML.</p>';
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Short Post Feed</title>
  <entry>
    <title>Short Post</title>
    <link href="https://example.com/short-post"/>
    <id>urn:uuid:short-1</id>
    <updated>2024-06-01T12:00:00Z</updated>
    <content type="html">${mediumContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</content>
  </entry>
</feed>`;
    const entries = parseFeed(feed);
    expect(entries[0].contentHtml).toBeDefined();
    expect(entries[0].contentHtml!.length).toBeGreaterThan(50);
    expect(entries[0].contentHtml!.length).toBeLessThan(200);
  });

  test('extracts contentHtml from CDATA-wrapped Atom content', () => {
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>sippey.com</title>
  <entry>
    <title>Noah Kalina interviews Scott Rogowsky</title>
    <link rel="alternate" type="text/html" href="https://noahkalina.substack.com/p/newsletter-193" />
    <id>https://sippey.com/links/2026/02/26/noah-kalina.html</id>
    <updated>2026-02-26T21:28:00-08:00</updated>
    <content type="html"><![CDATA[
      <p>Scott Rogowsky was the host of HQ Trivia.</p>
      <blockquote><p>Long quote from the linked article goes here to make this substantial enough.</p></blockquote>
      <p>Click through, read the whole thing.</p>
    ]]></content>
  </entry>
</feed>`;
    const entries = parseFeed(feed);
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe('https://noahkalina.substack.com/p/newsletter-193');
    expect(entries[0].domain).toBe('noahkalina.substack.com');
    expect(entries[0].contentHtml).toBeDefined();
    expect(entries[0].contentHtml).toContain('Scott Rogowsky');
    expect(entries[0].contentHtml).toContain('<blockquote>');
    expect(entries[0].annotation).toContain('Scott Rogowsky');
  });

  test('falls back to summary when content is absent', () => {
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>xkcd</title>
  <entry>
    <title>Standards</title>
    <link href="https://xkcd.com/927/" rel="alternate"/>
    <id>https://xkcd.com/927/</id>
    <updated>2024-08-01T00:00:00Z</updated>
    <summary type="html">&lt;img src="https://imgs.xkcd.com/comics/standards.png" title="Hover text" alt="Standards" /&gt;</summary>
  </entry>
</feed>`;
    const entries = parseFeed(feed);
    expect(entries).toHaveLength(1);
    expect(entries[0].contentHtml).toBeDefined();
    expect(entries[0].contentHtml).toContain('imgs.xkcd.com');
  });

  test('prefers content over summary when both present', () => {
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Feed</title>
  <entry>
    <title>Both Fields</title>
    <link href="https://example.com/both"/>
    <id>urn:uuid:both-1</id>
    <updated>2024-08-01T00:00:00Z</updated>
    <content type="html">&lt;p&gt;This is the full content from the content element which should always win.&lt;/p&gt;</content>
    <summary type="html">&lt;p&gt;This is just the summary.&lt;/p&gt;</summary>
  </entry>
</feed>`;
    const entries = parseFeed(feed);
    expect(entries).toHaveLength(1);
    expect(entries[0].contentHtml).toContain('full content from the content element');
    expect(entries[0].contentHtml).not.toContain('just the summary');
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

  test('preserves contentHtml for medium-length RSS content:encoded (50-200 chars)', () => {
    const mediumContent = '<p>A short blog post from an RSS feed with enough text to be worth keeping.</p>';
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Short Post Feed</title>
    <item>
      <title>Short RSS Post</title>
      <link>https://example.com/short-rss</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <content:encoded><![CDATA[${mediumContent}]]></content:encoded>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].contentHtml).toBeDefined();
    expect(entries[0].contentHtml!.length).toBeGreaterThan(50);
    expect(entries[0].contentHtml!.length).toBeLessThan(200);
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

  test('preserves contentHtml for medium-length RDF content (50-200 chars)', () => {
    const mediumContent = '<p>A short blog post from an RDF feed with enough content to be worth saving.</p>';
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
 xmlns="http://purl.org/rss/1.0/"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel rdf:about="https://example.com/">
    <title>Test RDF</title>
    <link>https://example.com/</link>
  </channel>
  <item rdf:about="https://example.com/medium-article">
    <title>Medium RDF Item</title>
    <link>https://example.com/medium-article</link>
    <dc:date>2025-03-01T12:00:00Z</dc:date>
    <content:encoded><![CDATA[${mediumContent}]]></content:encoded>
  </item>
</rdf:RDF>`;
    const entries = parseFeed(feed);
    expect(entries[0].contentHtml).toBeDefined();
    expect(entries[0].contentHtml!.length).toBeGreaterThan(50);
    expect(entries[0].contentHtml!.length).toBeLessThan(200);
  });

  test('preserves contentHtml from content:encoded in RDF', () => {
    const longContent = '<p>' + 'Full article text from RDF feed source. '.repeat(10) + '</p>';
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
 xmlns="http://purl.org/rss/1.0/"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel rdf:about="https://example.com/">
    <title>Test RDF</title>
    <link>https://example.com/</link>
  </channel>
  <item rdf:about="https://example.com/full-article">
    <title>Full Content RDF Item</title>
    <link>https://example.com/full-article</link>
    <dc:date>2025-03-01T12:00:00Z</dc:date>
    <description>Short summary</description>
    <content:encoded><![CDATA[${longContent}]]></content:encoded>
  </item>
</rdf:RDF>`;
    const entries = parseFeed(feed);
    expect(entries[0].contentHtml).toBeDefined();
    expect(entries[0].contentHtml!.length).toBeGreaterThan(200);
    expect(entries[0].annotation).toBe('Short summary');
  });

  test('does not set contentHtml for RDF items without content:encoded', () => {
    const entries = parseFeed(RDF_FEED);
    expect(entries[0].contentHtml).toBeUndefined();
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

describe('transformPlatformUrl', () => {
  test('transforms YouTube /channel/UCxxx URL to feed URL', async () => {
    const result = await transformPlatformUrl('https://www.youtube.com/channel/UCBcRF18a7Qf58cCRy5xuWwQ');
    expect(result).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UCBcRF18a7Qf58cCRy5xuWwQ');
  });

  test('transforms YouTube /channel/UCxxx URL without www', async () => {
    const result = await transformPlatformUrl('https://youtube.com/channel/UCBcRF18a7Qf58cCRy5xuWwQ');
    expect(result).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UCBcRF18a7Qf58cCRy5xuWwQ');
  });

  test('transforms Reddit subreddit URL to RSS', async () => {
    const result = await transformPlatformUrl('https://www.reddit.com/r/javascript');
    expect(result).toBe('https://www.reddit.com/r/javascript/.rss');
  });

  test('transforms Reddit URL without www', async () => {
    const result = await transformPlatformUrl('https://reddit.com/r/programming/');
    expect(result).toBe('https://www.reddit.com/r/programming/.rss');
  });

  test('passes through non-matching URLs unchanged', async () => {
    const result = await transformPlatformUrl('https://example.com/blog');
    expect(result).toBe('https://example.com/blog');
  });

  test('passes through already-RSS YouTube feed URLs', async () => {
    const result = await transformPlatformUrl('https://www.youtube.com/feeds/videos.xml?channel_id=UCxxx');
    expect(result).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UCxxx');
  });
});

const JSON_FEED = JSON.stringify({
  version: 'https://jsonfeed.org/version/1.1',
  title: 'My JSON Feed',
  home_page_url: 'https://example.com/',
  feed_url: 'https://example.com/feed.json',
  items: [
    {
      id: '1',
      title: 'JSON Feed Article',
      url: 'https://example.com/json-article',
      content_text: 'This is the article content.',
      date_published: '2024-01-29T19:05:18Z'
    },
    {
      id: '2',
      title: 'Second JSON Item',
      url: 'https://example.com/second',
      content_html: '<p>HTML content</p>',
      date_published: '2024-01-28T10:00:00Z'
    },
    {
      id: '3',
      url: 'https://example.com/no-title',
      date_published: '2024-01-27T08:00:00Z'
    }
  ]
});

const JSON_FEED_PODCAST = JSON.stringify({
  version: 'https://jsonfeed.org/version/1.1',
  title: 'My JSON Podcast',
  items: [
    {
      id: 'ep1',
      title: 'Episode One',
      url: 'https://podcast.com/ep1',
      content_text: 'Episode description here',
      date_published: '2024-01-29T12:00:00Z',
      attachments: [
        {
          url: 'https://cdn.example.com/ep1.mp3',
          mime_type: 'audio/mpeg',
          size_in_bytes: 12345678,
          duration_in_seconds: 2730
        }
      ]
    }
  ]
});

describe('parseFeed - JSON Feed', () => {
  test('extracts entries from JSON feed', () => {
    const entries = parseFeed(JSON_FEED);
    expect(entries).toHaveLength(3);
  });

  test('parses JSON feed entry fields correctly', () => {
    const entries = parseFeed(JSON_FEED);
    const first = entries[0];

    expect(first.title).toBe('JSON Feed Article');
    expect(first.url).toBe('https://example.com/json-article');
    expect(first.updatedAt).toBe('2024-01-29T19:05:18Z');
    expect(first.annotation).toBe('This is the article content.');
    expect(first.domain).toBe('example.com');
  });

  test('extracts text from HTML content', () => {
    const entries = parseFeed(JSON_FEED);
    const second = entries[1];

    expect(second.annotation).toBe('HTML content');
  });

  test('preserves contentHtml for medium-length JSON Feed HTML (50-200 chars)', () => {
    const feed = JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'Short Post Feed',
      items: [{
        id: 'medium-1',
        title: 'Short JSON Post',
        url: 'https://example.com/short-json',
        content_html: '<p>A short blog post in a JSON feed with enough content to preserve.</p>',
        date_published: '2024-01-29T12:00:00Z'
      }]
    });
    const entries = parseFeed(feed);
    expect(entries[0].contentHtml).toBeDefined();
    expect(entries[0].contentHtml!.length).toBeGreaterThan(50);
    expect(entries[0].contentHtml!.length).toBeLessThan(200);
  });

  test('handles items without title', () => {
    const entries = parseFeed(JSON_FEED);
    const third = entries[2];

    expect(third.title).toBe('Untitled');
    expect(third.annotation).toBeUndefined();
  });

  test('extracts domain from URL', () => {
    const entries = parseFeed(JSON_FEED);
    expect(entries[0].domain).toBe('example.com');
  });

  test('parses podcast attachments as enclosures', () => {
    const entries = parseFeed(JSON_FEED_PODCAST);
    expect(entries).toHaveLength(1);

    const ep = entries[0];
    expect(ep.enclosure).toBeDefined();
    expect(ep.enclosure!.url).toBe('https://cdn.example.com/ep1.mp3');
    expect(ep.enclosure!.type).toBe('audio/mpeg');
    expect(ep.enclosure!.length).toBe(12345678);
    expect(ep.enclosure!.duration).toBe('45:30');
  });
});

describe('parseFeedTitle - JSON Feed', () => {
  test('extracts title from JSON feed', () => {
    expect(parseFeedTitle(JSON_FEED)).toBe('My JSON Feed');
  });
});

describe('discoverFeedUrl - JSON Feed', () => {
  test('discovers JSON feed from link tag', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/feed+json" href="/feed.json" title="JSON Feed">
    </head><body></body></html>`;
    expect(discoverFeedUrl(html, 'https://example.com')).toBe('https://example.com/feed.json');
  });
});

describe('parseFeed - author extraction', () => {
  test('extracts author name from Atom entry', () => {
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Daring Fireball</title>
  <entry>
    <title>Test Post</title>
    <link rel="alternate" href="https://example.com/article"/>
    <id>urn:uuid:1</id>
    <updated>2024-01-29T12:00:00Z</updated>
    <author>
      <name>John Gruber</name>
      <uri>http://daringfireball.net/</uri>
    </author>
  </entry>
</feed>`;
    const entries = parseFeed(feed);
    expect(entries[0].author).toBe('John Gruber');
  });

  test('inherits feed-level Atom author when entry has none', () => {
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Single Author Blog</title>
  <author>
    <name>Jane Doe</name>
  </author>
  <entry>
    <title>No Entry Author</title>
    <link href="https://example.com/post"/>
    <id>urn:uuid:2</id>
    <updated>2024-01-29T12:00:00Z</updated>
  </entry>
</feed>`;
    const entries = parseFeed(feed);
    expect(entries[0].author).toBe('Jane Doe');
  });

  test('extracts dc:creator from RSS entry', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Multi-Author Blog</title>
    <item>
      <title>Guest Post</title>
      <link>https://example.com/guest</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <dc:creator>Alice Smith</dc:creator>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].author).toBe('Alice Smith');
  });

  test('strips email from RSS author field', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Email Author</title>
    <item>
      <title>Test</title>
      <link>https://example.com/test</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <author>noreply@example.com (Bob Jones)</author>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].author).toBe('Bob Jones');
  });

  test('omits author when RSS author is bare email', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Bare Email</title>
    <item>
      <title>Test</title>
      <link>https://example.com/test</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <author>noreply@example.com</author>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].author).toBeUndefined();
  });

  test('extracts dc:creator from RDF entry', () => {
    const entries = parseFeed(RDF_FEED);
    expect(entries[0].author).toBe('testuser');
  });

  test('omits author when RDF entry has no dc:creator', () => {
    const entries = parseFeed(RDF_FEED);
    expect(entries[1].author).toBeUndefined();
  });

  test('extracts author from JSON Feed v1.1 authors array', () => {
    const feed = JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'Authored Feed',
      items: [{
        id: '1',
        title: 'Post',
        url: 'https://example.com/post',
        date_published: '2024-01-29T12:00:00Z',
        authors: [{ name: 'Carol White', url: 'https://example.com/carol' }]
      }]
    });
    const entries = parseFeed(feed);
    expect(entries[0].author).toBe('Carol White');
  });

  test('extracts author from JSON Feed v1.0 author object', () => {
    const feed = JSON.stringify({
      version: 'https://jsonfeed.org/version/1',
      title: 'V1 Feed',
      items: [{
        id: '1',
        title: 'Post',
        url: 'https://example.com/post',
        date_published: '2024-01-29T12:00:00Z',
        author: { name: 'Dan Brown' }
      }]
    });
    const entries = parseFeed(feed);
    expect(entries[0].author).toBe('Dan Brown');
  });

  test('omits author when none present in any format', () => {
    const entries = parseFeed(ATOM_FEED);
    expect(entries[0].author).toBeUndefined();

    const rssEntries = parseFeed(RSS_FEED);
    expect(rssEntries[0].author).toBeUndefined();

    const jsonEntries = parseFeed(JSON_FEED);
    expect(jsonEntries[0].author).toBeUndefined();
  });
});

describe('parseFeed - category extraction', () => {
  test('extracts categories from RSS <category> elements', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Category Feed</title>
    <item>
      <title>Tagged Article</title>
      <link>https://example.com/tagged</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <category>Technology</category>
      <category>Programming</category>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].categories).toEqual(['Technology', 'Programming']);
  });

  test('extracts categories from Atom <category> elements', () => {
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Categories</title>
  <entry>
    <title>Atom Tagged</title>
    <link href="https://example.com/atom-tagged"/>
    <id>urn:uuid:cat-1</id>
    <updated>2024-01-29T12:00:00Z</updated>
    <category term="science"/>
    <category term="physics"/>
  </entry>
</feed>`;
    const entries = parseFeed(feed);
    expect(entries[0].categories).toEqual(['science', 'physics']);
  });

  test('extracts tags from JSON Feed', () => {
    const feed = JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'Tagged JSON Feed',
      items: [{
        id: '1',
        title: 'JSON Tagged',
        url: 'https://example.com/json-tagged',
        date_published: '2024-01-29T12:00:00Z',
        tags: ['design', 'css', 'frontend']
      }]
    });
    const entries = parseFeed(feed);
    expect(entries[0].categories).toEqual(['design', 'css', 'frontend']);
  });

  test('omits categories when none present', () => {
    const entries = parseFeed(RSS_FEED);
    expect(entries[0].categories).toBeUndefined();
  });

  test('extracts categories from RDF with dc:subject', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
 xmlns="http://purl.org/rss/1.0/"
 xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://example.com/">
    <title>RDF Categories</title>
    <link>https://example.com/</link>
  </channel>
  <item rdf:about="https://example.com/rdf-tagged">
    <title>RDF Tagged</title>
    <link>https://example.com/rdf-tagged</link>
    <dc:date>2025-01-15T10:30:00Z</dc:date>
    <dc:subject>bookmarks</dc:subject>
  </item>
</rdf:RDF>`;
    const entries = parseFeed(feed);
    expect(entries[0].categories).toEqual(['bookmarks']);
  });

  test('handles single RSS category (not array)', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Single Cat Feed</title>
    <item>
      <title>One Tag</title>
      <link>https://example.com/one</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <category>Solo</category>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].categories).toEqual(['Solo']);
  });

  test('handles RSS category with CDATA', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>CDATA Cat Feed</title>
    <item>
      <title>CDATA Tags</title>
      <link>https://example.com/cdata</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <category><![CDATA[Web Development]]></category>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].categories).toEqual(['Web Development']);
  });
});

describe('parseFeed - thumbnail extraction', () => {
  test('extracts media:content url from RSS item', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Media Feed</title>
    <item>
      <title>Article With Image</title>
      <link>https://example.com/article</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <media:content url="https://example.com/hero.jpg" medium="image"/>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].thumbnail).toBe('https://example.com/hero.jpg');
  });

  test('extracts media:thumbnail url from RSS item', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Thumbnail Feed</title>
    <item>
      <title>Article With Thumbnail</title>
      <link>https://example.com/article</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <media:thumbnail url="https://example.com/thumb.jpg"/>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].thumbnail).toBe('https://example.com/thumb.jpg');
  });

  test('extracts itunes:image from RSS item', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Podcast Feed</title>
    <item>
      <title>Episode With Art</title>
      <link>https://podcast.com/ep1</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <itunes:image href="https://podcast.com/art.jpg"/>
      <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].thumbnail).toBe('https://podcast.com/art.jpg');
  });

  test('extracts media:content from Atom entry', () => {
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Atom Media Feed</title>
  <entry>
    <title>Atom With Image</title>
    <link href="https://example.com/atom-article"/>
    <id>urn:uuid:media-1</id>
    <updated>2024-01-29T12:00:00Z</updated>
    <media:content url="https://example.com/atom-hero.jpg" medium="image"/>
  </entry>
</feed>`;
    const entries = parseFeed(feed);
    expect(entries[0].thumbnail).toBe('https://example.com/atom-hero.jpg');
  });

  test('extracts image from JSON Feed item', () => {
    const feed = JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'Image JSON Feed',
      items: [{
        id: '1',
        title: 'JSON With Image',
        url: 'https://example.com/json-article',
        date_published: '2024-01-29T12:00:00Z',
        image: 'https://example.com/json-hero.jpg'
      }]
    });
    const entries = parseFeed(feed);
    expect(entries[0].thumbnail).toBe('https://example.com/json-hero.jpg');
  });

  test('omits thumbnail when no media tags present', () => {
    const entries = parseFeed(RSS_FEED);
    expect(entries[0].thumbnail).toBeUndefined();
  });

  test('prefers media:content over media:thumbnail in RSS', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Both Media Feed</title>
    <item>
      <title>Article With Both</title>
      <link>https://example.com/both</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <media:content url="https://example.com/full.jpg" medium="image"/>
      <media:thumbnail url="https://example.com/small.jpg"/>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].thumbnail).toBe('https://example.com/full.jpg');
  });

  test('falls back to channel-level itunes:image in RSS', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>NPR News Hour</title>
    <itunes:image href="https://podcast.com/show-art.jpg"/>
    <item>
      <title>Episode Without Art</title>
      <link>https://podcast.com/ep1</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].thumbnail).toBe('https://podcast.com/show-art.jpg');
  });

  test('falls back to channel-level image url in RSS', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Blog Feed</title>
    <image>
      <url>https://blog.com/logo.png</url>
      <title>Blog</title>
      <link>https://blog.com</link>
    </image>
    <item>
      <title>Post Without Image</title>
      <link>https://blog.com/post1</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].thumbnail).toBe('https://blog.com/logo.png');
  });

  test('per-item artwork takes precedence over channel artwork in RSS', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Podcast With Both</title>
    <itunes:image href="https://podcast.com/show-art.jpg"/>
    <item>
      <title>Episode With Own Art</title>
      <link>https://podcast.com/ep1</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <itunes:image href="https://podcast.com/ep1-art.jpg"/>
      <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].thumbnail).toBe('https://podcast.com/ep1-art.jpg');
  });

  test('falls back to feed-level image in Atom', () => {
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Atom Feed With Logo</title>
  <icon>https://example.com/feed-icon.png</icon>
  <entry>
    <title>Entry Without Image</title>
    <link href="https://example.com/atom-entry"/>
    <id>urn:uuid:feed-img-1</id>
    <updated>2024-01-29T12:00:00Z</updated>
  </entry>
</feed>`;
    const entries = parseFeed(feed);
    expect(entries[0].thumbnail).toBe('https://example.com/feed-icon.png');
  });

  test('per-entry artwork takes precedence over feed-level image in Atom', () => {
    const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Atom Feed With Logo</title>
  <icon>https://example.com/feed-icon.png</icon>
  <entry>
    <title>Entry With Own Image</title>
    <link href="https://example.com/atom-entry"/>
    <id>urn:uuid:feed-img-2</id>
    <updated>2024-01-29T12:00:00Z</updated>
    <media:content url="https://example.com/entry-hero.jpg" medium="image"/>
  </entry>
</feed>`;
    const entries = parseFeed(feed);
    expect(entries[0].thumbnail).toBe('https://example.com/entry-hero.jpg');
  });
});

describe('parseFeed - RSS description as contentHtml fallback', () => {
  test('uses HTML description as contentHtml when content:encoded is absent', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Description HTML Feed</title>
    <item>
      <title>Article With HTML Description</title>
      <link>https://example.com/html-desc</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <description><![CDATA[<p>This is a full article body stored in the description element with enough content to be substantial.</p><p>It has multiple paragraphs and real HTML structure.</p>]]></description>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].contentHtml).toBeDefined();
    expect(entries[0].contentHtml).toContain('<p>');
    expect(entries[0].annotation).toBeDefined();
  });

  test('does not use short plain-text description as contentHtml', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Short Desc Feed</title>
    <item>
      <title>Short Description Article</title>
      <link>https://example.com/short-desc</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <description>Just a brief summary.</description>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].contentHtml).toBeUndefined();
    expect(entries[0].annotation).toBe('Just a brief summary.');
  });

  test('prefers content:encoded over HTML description for contentHtml', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Both Content Feed</title>
    <item>
      <title>Article With Both</title>
      <link>https://example.com/both-content</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <description><![CDATA[<p>HTML description that is long enough to qualify as contentHtml on its own merit easily.</p>]]></description>
      <content:encoded><![CDATA[<p>Full article from content:encoded which should be preferred over description always.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].contentHtml).toContain('content:encoded');
    expect(entries[0].contentHtml).not.toContain('HTML description');
  });

  test('uses long plain-text description as contentHtml (link blog commentary)', () => {
    const longPlainText = 'This is a long plain text description without any HTML tags. '.repeat(5);
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Long Plain Feed</title>
    <item>
      <title>Long Plain Description</title>
      <link>https://example.com/long-plain</link>
      <pubDate>Mon, 29 Jan 2024 12:00:00 GMT</pubDate>
      <description>${longPlainText}</description>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].contentHtml).toBeDefined();
    expect(entries[0].contentHtml).toContain('long plain text description');
    expect(entries[0].annotation).toBeDefined();
  });
});

describe('parseFeed - Substack RSS feeds', () => {
  test('extracts full article from content:encoded with short description', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
  <channel>
    <title><![CDATA[Test Newsletter]]></title>
    <generator>Substack</generator>
    <item>
      <title><![CDATA[How To Build Great Products]]></title>
      <description><![CDATA[Community Wisdom 175]]></description>
      <link>https://newsletter.example.com/p/how-to-build-great-products</link>
      <guid isPermaLink="false">https://newsletter.example.com/p/how-to-build-great-products</guid>
      <dc:creator><![CDATA[Test Author]]></dc:creator>
      <pubDate>Fri, 28 Feb 2026 12:00:00 GMT</pubDate>
      <content:encoded><![CDATA[<p>This is the full article body from Substack with multiple paragraphs of content.</p><p>Substack stores the real content in content:encoded while description is just a teaser.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('How To Build Great Products');
    expect(entries[0].contentHtml).toBeDefined();
    expect(entries[0].contentHtml).toContain('full article body from Substack');
    expect(entries[0].annotation).toBe('Community Wisdom 175');
    expect(entries[0].author).toBe('Test Author');
  });

  test('extracts content:encoded even with very short description', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" version="2.0">
  <channel>
    <title><![CDATA[Kelly's Newsletter]]></title>
    <generator>Substack</generator>
    <item>
      <title><![CDATA[Photos From My Trip]]></title>
      <description><![CDATA[Eric Dane ❤️]]></description>
      <link>https://kelly.substack.com/p/photos-from-my-trip</link>
      <dc:creator><![CDATA[Kelly Oxford]]></dc:creator>
      <pubDate>Wed, 26 Feb 2026 18:00:00 GMT</pubDate>
      <content:encoded><![CDATA[<div class="captioned-image-container"><figure><img src="https://cdn.substack.com/image/fetch/photo.jpg" alt="A photo from the trip"/></figure></div><p>Here are the photos I promised from last week's adventure. We started early in the morning and the light was incredible.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].contentHtml).toBeDefined();
    expect(entries[0].contentHtml).toContain('captioned-image-container');
    expect(entries[0].contentHtml).toContain('photos I promised');
  });

  test('handles paywall preview in content:encoded', () => {
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" version="2.0">
  <channel>
    <title><![CDATA[Premium Newsletter]]></title>
    <generator>Substack</generator>
    <item>
      <title><![CDATA[Deep Dive: Engineering at Scale]]></title>
      <description><![CDATA[Notes from the summit and workshop on the future of development.]]></description>
      <link>https://premium.substack.com/p/deep-dive-engineering</link>
      <dc:creator><![CDATA[Premium Author]]></dc:creator>
      <pubDate>Mon, 24 Feb 2026 10:00:00 GMT</pubDate>
      <content:encoded><![CDATA[<p>Two weeks ago, I hosted the annual summit in San Francisco.</p><p>This post is for paid subscribers only. <a href="https://premium.substack.com/subscribe">Subscribe</a> to read the rest.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;
    const entries = parseFeed(feed);
    expect(entries[0].contentHtml).toBeDefined();
    expect(entries[0].contentHtml).toContain('annual summit');
    expect(entries[0].contentHtml).toContain('Subscribe');
  });
});
