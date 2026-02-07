// ABOUTME: Tests for article content extraction
// ABOUTME: Verifies Readability extracts clean content from HTML pages

import { extractArticle, resolveRelativeUrls, isYouTubeUrl, extractYouTubeId } from './extractor';

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <nav>Navigation stuff</nav>
  <article>
    <h1>Article Headline</h1>
    <p>This is the first paragraph of the article with enough content to be considered main text.</p>
    <p>This is the second paragraph with more substantial content that Readability will extract.</p>
    <p>And a third paragraph to ensure we have enough content for extraction to work properly.</p>
  </article>
  <footer>Footer content</footer>
</body>
</html>
`;

describe('extractArticle', () => {
  test('extracts article content from HTML', () => {
    const result = extractArticle(SAMPLE_HTML, 'https://example.com/test');

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Test Page');
    expect(result!.content).toContain('first paragraph');
    expect(result!.content).not.toContain('Navigation');
    expect(result!.content).not.toContain('Footer');
  });

  test('extracts content from minimal pages', () => {
    const minimal = '<html><body><p>Short content here</p></body></html>';
    const result = extractArticle(minimal, 'https://example.com/short');

    expect(result).not.toBeNull();
    expect(result!.content).toContain('Short content');
  });

  test('converts content to markdown', () => {
    const result = extractArticle(SAMPLE_HTML, 'https://example.com/test');

    expect(result).not.toBeNull();
    // Turndown converts <p> to plain text with newlines, not HTML
    expect(result!.markdown).not.toContain('<p>');
    expect(result!.markdown).toContain('first paragraph');
  });
});

describe('extractArticle — X.com/Twitter handling', () => {
  test('generates title from og:description for X.com posts', () => {
    const html = `<html><head>
      <meta property="og:description" content="Just shipped the new feature! Really excited about this one." />
    </head><body>
      <article><p>Just shipped the new feature! Really excited about this one.</p>
      <p>More content here for readability to pick up properly in extraction.</p>
      <p>Even more content to make sure readability considers this an article.</p></article>
    </body></html>`;
    const result = extractArticle(html, 'https://x.com/johndoe/status/123456789');
    expect(result).not.toBeNull();
    // Should NOT be "Untitled"
    expect(result!.title).not.toBe('Untitled');
    expect(result!.title).toContain('shipped');
  });

  test('generates username-based title when no description available', () => {
    const html = `<html><head><title></title></head><body>
      <article><p>Some tweet content that readability will extract from the page.</p>
      <p>Additional content to make readability happy with extraction length.</p>
      <p>Third paragraph for good measure to ensure extraction works properly.</p></article>
    </body></html>`;
    const result = extractArticle(html, 'https://x.com/janedoe/status/987654321');
    expect(result).not.toBeNull();
    expect(result!.title).not.toBe('Untitled');
  });

  test('does not alter titles for non-Twitter URLs', () => {
    const html = `<html><head><title></title></head><body>
      <article><p>Content of the page without a proper title set in head.</p>
      <p>More content here for the readability algorithm to extract properly.</p>
      <p>And even more substantial content for good extraction results.</p></article>
    </body></html>`;
    const result = extractArticle(html, 'https://example.com/article');
    // For non-Twitter, "Untitled" is still the default
    if (result) {
      // Either has a title or is Untitled — but NOT Twitter-specific
      expect(result.title).not.toContain('post on X');
    }
  });

  test('handles long tweet descriptions by truncating', () => {
    const longDesc = 'A'.repeat(100);
    const html = `<html><head>
      <meta property="og:description" content="${longDesc}" />
    </head><body>
      <article><p>${longDesc}</p>
      <p>Second paragraph of tweet content for readability extraction to work.</p>
      <p>Third paragraph to ensure there is enough content for extraction.</p></article>
    </body></html>`;
    const result = extractArticle(html, 'https://x.com/user/status/111');
    expect(result).not.toBeNull();
    expect(result!.title.length).toBeLessThanOrEqual(80);
  });
});

describe('resolveRelativeUrls', () => {
  const baseUrl = 'https://example.com/articles/my-post';

  test('resolves root-relative image paths to absolute URLs', () => {
    const md = '![Screenshot](/art/afterword/image.png)';
    const result = resolveRelativeUrls(md, baseUrl);
    expect(result).toBe('![Screenshot](https://example.com/art/afterword/image.png)');
  });

  test('resolves root-relative link paths to absolute URLs', () => {
    const md = '[Read more](/articles/other-post)';
    const result = resolveRelativeUrls(md, baseUrl);
    expect(result).toBe('[Read more](https://example.com/articles/other-post)');
  });

  test('leaves absolute URLs unchanged', () => {
    const md = '![img](https://cdn.example.com/photo.jpg)\n[link](https://other.com/page)';
    const result = resolveRelativeUrls(md, baseUrl);
    expect(result).toBe(md);
  });

  test('does not modify image links when resolving regular links', () => {
    const md = '![alt](/img/photo.png) and [text](/page)';
    const result = resolveRelativeUrls(md, baseUrl);
    expect(result).toBe('![alt](https://example.com/img/photo.png) and [text](https://example.com/page)');
  });

  test('handles complex alt text and paths', () => {
    const md = '![Screenshot 2026-02-02 at 10.49.54\u202FAM](/art/afterword/1770047479321-Screenshot_2026-02-02_at_10.49.54___AM.png)';
    const result = resolveRelativeUrls(md, 'https://blog.example.com/posts/my-article');
    expect(result).toBe('![Screenshot 2026-02-02 at 10.49.54\u202FAM](https://blog.example.com/art/afterword/1770047479321-Screenshot_2026-02-02_at_10.49.54___AM.png)');
  });

  test('resolves relative image paths (no leading slash)', () => {
    const md = '![figure](x1.png)';
    const result = resolveRelativeUrls(md, 'https://arxiv.org/html/2512.24601v1/');
    expect(result).toBe('![figure](https://arxiv.org/html/2512.24601v1/x1.png)');
  });

  test('resolves relative link paths (no leading slash)', () => {
    const md = '[see appendix](appendix.html)';
    const result = resolveRelativeUrls(md, 'https://example.com/docs/guide/');
    expect(result).toBe('[see appendix](https://example.com/docs/guide/appendix.html)');
  });

  test('resolves relative paths with subdirectories', () => {
    const md = '![chart](images/chart.png)';
    const result = resolveRelativeUrls(md, 'https://example.com/post/my-article/');
    expect(result).toBe('![chart](https://example.com/post/my-article/images/chart.png)');
  });

  test('does not touch data: URIs or fragments', () => {
    const md = '![img](data:image/png;base64,abc) and [link](#section)';
    const result = resolveRelativeUrls(md, baseUrl);
    expect(result).toBe(md);
  });

  test('resolves relative URLs with base URL lacking trailing slash', () => {
    const md = '![fig](x1.png)';
    // Without trailing slash, x1.png resolves relative to the parent directory
    const result = resolveRelativeUrls(md, 'https://arxiv.org/html/2512.24601v1');
    expect(result).toBe('![fig](https://arxiv.org/html/x1.png)');
  });

  test('returns markdown unchanged for invalid base URL', () => {
    const md = '![img](/photo.jpg)';
    const result = resolveRelativeUrls(md, 'not-a-url');
    expect(result).toBe(md);
  });

  test('handles multiple images and links', () => {
    const md = '![a](/img/1.png)\n\n[b](/page1)\n\n![c](/img/2.png)\n\n[d](/page2)';
    const result = resolveRelativeUrls(md, baseUrl);
    expect(result).toContain('https://example.com/img/1.png');
    expect(result).toContain('https://example.com/page1');
    expect(result).toContain('https://example.com/img/2.png');
    expect(result).toContain('https://example.com/page2');
  });
});

describe('isYouTubeUrl', () => {
  test('detects youtube.com URLs', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(isYouTubeUrl('https://youtube.com/watch?v=abc123')).toBe(true);
    expect(isYouTubeUrl('https://m.youtube.com/watch?v=abc123')).toBe(true);
  });

  test('detects youtu.be URLs', () => {
    expect(isYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
  });

  test('rejects non-YouTube URLs', () => {
    expect(isYouTubeUrl('https://example.com/video')).toBe(false);
    expect(isYouTubeUrl('https://vimeo.com/123')).toBe(false);
  });
});

describe('extractYouTubeId', () => {
  test('extracts ID from standard watch URL', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts ID from youtu.be short URL', () => {
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts ID from embed URL', () => {
    expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts ID with extra parameters', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=abc123&t=30s')).toBe('abc123');
  });

  test('returns null for non-video YouTube pages', () => {
    expect(extractYouTubeId('https://www.youtube.com/channel/UC12345')).toBeNull();
    expect(extractYouTubeId('https://www.youtube.com/results?search_query=test')).toBeNull();
  });

  test('returns null for invalid URLs', () => {
    expect(extractYouTubeId('not-a-url')).toBeNull();
  });
});
