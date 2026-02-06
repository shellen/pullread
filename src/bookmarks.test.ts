// ABOUTME: Tests for bookmarks.html parsing
// ABOUTME: Verifies extraction of bookmarks from Netscape format

import { parseBookmarksHtml, bookmarksToEntries } from './bookmarks';

const PINBOARD_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Pinboard Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
<DT><A HREF="https://example.com/article1" ADD_DATE="1705312200" TAGS="tech,ai">AI in 2024</A>
<DD>A comprehensive overview of AI progress
<DT><A HREF="https://example.com/article2" ADD_DATE="1705225800" TAGS="design">Good Design</A>
<DT><A HREF="https://example.com/article3" ADD_DATE="1705139400">No Tags Article</A>
</DL></p>`;

const CHROME_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1705312200" LAST_MODIFIED="1705312200">Bookmark Bar</H3>
    <DL><p>
        <DT><A HREF="https://example.com/chrome1" ADD_DATE="1705312200">Chrome Bookmark</A>
        <DT><A HREF="https://example.com/chrome2" ADD_DATE="1705225800">Another Chrome Bookmark</A>
    </DL><p>
</DL><p>`;

const INSTAPAPER_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Instapaper: Export</TITLE>
<H1>Instapaper: Export</H1>
<DL>
<DT><A HREF="https://example.com/insta1" ADD_DATE="1705312200">Instapaper Article</A>
<DD>Saved from Instapaper
</DL>`;

describe('parseBookmarksHtml', () => {
  test('parses Pinboard bookmarks', () => {
    const bookmarks = parseBookmarksHtml(PINBOARD_HTML);
    expect(bookmarks).toHaveLength(3);
  });

  test('extracts bookmark fields correctly', () => {
    const bookmarks = parseBookmarksHtml(PINBOARD_HTML);
    const first = bookmarks[0];

    expect(first.title).toBe('AI in 2024');
    expect(first.url).toBe('https://example.com/article1');
    expect(first.tags).toEqual(['tech', 'ai']);
    expect(first.description).toBe('A comprehensive overview of AI progress');
    expect(first.addedAt).toBe('2024-01-15T09:50:00.000Z');
  });

  test('handles bookmarks without tags', () => {
    const bookmarks = parseBookmarksHtml(PINBOARD_HTML);
    const third = bookmarks[2];

    expect(third.title).toBe('No Tags Article');
    expect(third.tags).toEqual([]);
  });

  test('handles bookmarks without description', () => {
    const bookmarks = parseBookmarksHtml(PINBOARD_HTML);
    const second = bookmarks[1];

    expect(second.description).toBeUndefined();
  });

  test('parses Chrome bookmarks', () => {
    const bookmarks = parseBookmarksHtml(CHROME_HTML);
    expect(bookmarks).toHaveLength(2);
    expect(bookmarks[0].title).toBe('Chrome Bookmark');
    expect(bookmarks[0].url).toBe('https://example.com/chrome1');
  });

  test('parses Instapaper export', () => {
    const bookmarks = parseBookmarksHtml(INSTAPAPER_HTML);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].title).toBe('Instapaper Article');
    expect(bookmarks[0].description).toBe('Saved from Instapaper');
  });

  test('returns empty array for non-bookmark HTML', () => {
    const bookmarks = parseBookmarksHtml('<html><body>Not bookmarks</body></html>');
    expect(bookmarks).toHaveLength(0);
  });

  test('skips javascript: URLs', () => {
    const html = '<DT><A HREF="javascript:void(0)" ADD_DATE="1705312200">Bad Link</A>';
    const bookmarks = parseBookmarksHtml(html);
    expect(bookmarks).toHaveLength(0);
  });
});

const POCKET_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Pocket Export</TITLE>
<H1>Unread</H1>
<DL>
  <DT><A HREF="https://example.com/pocket1" ADD_DATE="1705312200" TAGS="tech,programming">Pocket Saved Article</A>
  <DT><A HREF="https://example.com/pocket2" ADD_DATE="1705225800">Pocket Article No Tags</A>
</DL>
<H1>Read Archive</H1>
<DL>
  <DT><A HREF="https://example.com/pocket3" ADD_DATE="1705139400" TAGS="science">Archived Pocket Article</A>
</DL>`;

const RAINDROP_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3>Reading List</H3>
  <DL><p>
    <DT><A HREF="https://example.com/rain1" ADD_DATE="1705312200" TAGS="design,ux">Raindrop Bookmark</A>
    <DD>Saved from Raindrop.io collection
    <DT><A HREF="https://example.com/rain2" ADD_DATE="1705225800">Another Raindrop Item</A>
  </DL><p>
  <DT><H3>Favorites</H3>
  <DL><p>
    <DT><A HREF="https://example.com/rain3" ADD_DATE="1705139400" TAGS="reference">Favorite Link</A>
  </DL><p>
</DL><p>`;

const FIREFOX_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be overwritten when you export bookmarks. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks Menu</H1>
<DL><p>
    <DT><H3>Bookmarks Toolbar</H3>
    <DL><p>
        <DT><A HREF="https://example.com/ff1" ADD_DATE="1705312200" LAST_MODIFIED="1705400000">Firefox Bookmark</A>
        <DT><A HREF="https://example.com/ff2" ADD_DATE="1705225800" SHORTCUTURL="example" LAST_MODIFIED="1705300000" TAGS="dev">Firefox Tagged</A>
    </DL><p>
</DL><p>`;

describe('parseBookmarksHtml - Pocket', () => {
  test('parses Pocket export with sections', () => {
    const bookmarks = parseBookmarksHtml(POCKET_HTML);
    expect(bookmarks).toHaveLength(3);
  });

  test('extracts Pocket tags', () => {
    const bookmarks = parseBookmarksHtml(POCKET_HTML);
    expect(bookmarks[0].tags).toEqual(['tech', 'programming']);
    expect(bookmarks[1].tags).toEqual([]);
    expect(bookmarks[2].tags).toEqual(['science']);
  });
});

describe('parseBookmarksHtml - Raindrop', () => {
  test('parses Raindrop export with collections', () => {
    const bookmarks = parseBookmarksHtml(RAINDROP_HTML);
    expect(bookmarks).toHaveLength(3);
  });

  test('extracts Raindrop descriptions', () => {
    const bookmarks = parseBookmarksHtml(RAINDROP_HTML);
    expect(bookmarks[0].description).toBe('Saved from Raindrop.io collection');
    expect(bookmarks[0].tags).toEqual(['design', 'ux']);
  });
});

describe('parseBookmarksHtml - Firefox', () => {
  test('parses Firefox bookmarks', () => {
    const bookmarks = parseBookmarksHtml(FIREFOX_HTML);
    expect(bookmarks).toHaveLength(2);
  });

  test('extracts Firefox tags', () => {
    const bookmarks = parseBookmarksHtml(FIREFOX_HTML);
    expect(bookmarks[1].tags).toEqual(['dev']);
  });
});

describe('bookmarksToEntries', () => {
  test('converts bookmarks to feed entries', () => {
    const bookmarks = parseBookmarksHtml(PINBOARD_HTML);
    const entries = bookmarksToEntries(bookmarks);

    expect(entries).toHaveLength(3);
    expect(entries[0].title).toBe('AI in 2024');
    expect(entries[0].domain).toBe('example.com');
    expect(entries[0].annotation).toBe('A comprehensive overview of AI progress');
  });
});
