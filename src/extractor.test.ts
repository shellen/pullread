// ABOUTME: Tests for article content extraction
// ABOUTME: Verifies Readability extracts clean content from HTML pages

import { extractArticle, resolveRelativeUrls } from './extractor';

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
