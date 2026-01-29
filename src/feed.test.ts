// ABOUTME: Tests for RSS and Atom feed parsing
// ABOUTME: Verifies extraction of entries from various feed formats

import { parseFeed } from './feed';

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
});

describe('parseFeed - Error handling', () => {
  test('throws on unknown feed format', () => {
    const invalidXml = '<?xml version="1.0"?><unknown><item/></unknown>';
    expect(() => parseFeed(invalidXml)).toThrow('Unknown feed format');
  });
});
