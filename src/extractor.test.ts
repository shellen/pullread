// ABOUTME: Tests for article content extraction
// ABOUTME: Verifies Readability extracts clean content from HTML pages

import {
  extractArticle, resolveRelativeUrls, simplifySubstackUrl, isYouTubeUrl, extractYouTubeId,
  matchPaperSource, fixPdfLigatures, stripRunningHeaders, buildParagraphs, extractPdfTitle
} from './extractor';

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

describe('simplifySubstackUrl', () => {
  test('extracts inner URL from Substack CDN proxy URL', () => {
    const url = 'https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc123.png';
    expect(simplifySubstackUrl(url)).toBe('https://substack-post-media.s3.amazonaws.com/public/images/abc123.png');
  });

  test('handles already-decoded inner URLs', () => {
    const url = 'https://substackcdn.com/image/fetch/f_auto,q_auto:good/https://substack-post-media.s3.amazonaws.com/public/images/test.jpg';
    expect(simplifySubstackUrl(url)).toBe('https://substack-post-media.s3.amazonaws.com/public/images/test.jpg');
  });

  test('returns non-Substack URLs unchanged', () => {
    const url = 'https://example.com/image.png';
    expect(simplifySubstackUrl(url)).toBe(url);
  });

  test('handles bucketeer S3 URLs', () => {
    const url = 'https://substackcdn.com/image/fetch/w_848,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-e05bbc84-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fphoto.jpeg';
    expect(simplifySubstackUrl(url)).toBe('https://bucketeer-e05bbc84-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/photo.jpeg');
  });
});

describe('resolveRelativeUrls — Substack CDN simplification', () => {
  test('simplifies Substack CDN URLs in image markdown', () => {
    const md = '![photo](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc.png)';
    const result = resolveRelativeUrls(md, 'https://example.substack.com/p/test');
    expect(result).toBe('![photo](https://substack-post-media.s3.amazonaws.com/public/images/abc.png)');
  });
});

describe('extractArticle — Substack image handling', () => {
  test('extracts images from Substack-style linked image with wrapper div', () => {
    const html = `<html><head><title>Test Post</title></head><body>
      <article>
        <p>This is a paragraph with enough content for readability to extract it properly.</p>
        <a href="https://substackcdn.com/image/fetch/f_auto,q_auto:good/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ffull.png">
          <div class="captioned-image-container">
            <img src="https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ffull.png" alt="A test image" />
          </div>
        </a>
        <p>Another paragraph of content so readability keeps extracting the article text here.</p>
        <p>And a third paragraph to ensure we have enough content for extraction to work properly.</p>
      </article>
    </body></html>`;
    const result = extractArticle(html, 'https://example.substack.com/p/test-post');
    expect(result).not.toBeNull();
    // Should contain a proper image, not raw URL text
    expect(result!.markdown).toContain('![');
    expect(result!.markdown).toContain('](');
    // The Substack CDN URL should be simplified to the direct S3 URL
    expect(result!.markdown).not.toContain('substackcdn.com/image/fetch');
    expect(result!.markdown).toContain('substack-post-media.s3.amazonaws.com');
  });

  test('extracts images from direct Substack img tags', () => {
    const html = `<html><head><title>Direct Image Post</title></head><body>
      <article>
        <p>This article has a direct image tag from substack without a link wrapper around it.</p>
        <img src="https://substackcdn.com/image/fetch/w_848,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ftest.jpg" alt="Direct" />
        <p>More content after the image to ensure proper extraction by readability algorithm.</p>
        <p>And a third paragraph to ensure we have enough content for extraction to work properly.</p>
      </article>
    </body></html>`;
    const result = extractArticle(html, 'https://example.substack.com/p/direct-image');
    expect(result).not.toBeNull();
    expect(result!.markdown).toContain('![');
    expect(result!.markdown).not.toContain('substackcdn.com/image/fetch');
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

// ── Academic paper source matching ──────────────────────────────────

describe('matchPaperSource', () => {
  test('matches arxiv PDF URLs', () => {
    const m = matchPaperSource('https://arxiv.org/pdf/2009.14050');
    expect(m).not.toBeNull();
    expect(m!.source.name).toBe('arxiv');
    expect(m!.htmlUrl).toBe('https://arxiv.org/html/2009.14050');
  });

  test('matches arxiv abs URLs', () => {
    const m = matchPaperSource('https://arxiv.org/abs/2009.14050v2');
    expect(m).not.toBeNull();
    expect(m!.htmlUrl).toBe('https://arxiv.org/html/2009.14050v2');
  });

  test('matches arxiv old-style IDs with slashes', () => {
    const m = matchPaperSource('https://arxiv.org/pdf/hep-ph/0601001');
    expect(m).not.toBeNull();
    expect(m!.htmlUrl).toBe('https://arxiv.org/html/hep-ph/0601001');
  });

  test('matches bioRxiv PDF URLs', () => {
    const m = matchPaperSource('https://www.biorxiv.org/content/10.1101/2024.01.15.575123v1.full.pdf');
    expect(m).not.toBeNull();
    expect(m!.source.name).toBe('bioRxiv');
    expect(m!.htmlUrl).toBe('https://www.biorxiv.org/content/10.1101/2024.01.15.575123v1.full');
  });

  test('matches medRxiv PDF URLs', () => {
    const m = matchPaperSource('https://www.medrxiv.org/content/10.1101/2024.03.20.24304567v1.full.pdf');
    expect(m).not.toBeNull();
    expect(m!.source.name).toBe('medRxiv');
    expect(m!.htmlUrl).toContain('.full');
    expect(m!.htmlUrl).not.toContain('.pdf');
  });

  test('matches PMC PDF URLs', () => {
    const m = matchPaperSource('https://pmc.ncbi.nlm.nih.gov/articles/PMC7654321/pdf/');
    expect(m).not.toBeNull();
    expect(m!.source.name).toBe('PMC');
    expect(m!.htmlUrl).toBe('https://pmc.ncbi.nlm.nih.gov/articles/PMC7654321/');
  });

  test('matches PMC PDF URLs with filename', () => {
    const m = matchPaperSource('https://pmc.ncbi.nlm.nih.gov/articles/PMC7654321/pdf/main.pdf');
    expect(m).not.toBeNull();
    expect(m!.htmlUrl).toBe('https://pmc.ncbi.nlm.nih.gov/articles/PMC7654321/');
  });

  test('matches PLOS PDF URLs', () => {
    const m = matchPaperSource('https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0123456&type=printable');
    expect(m).not.toBeNull();
    expect(m!.source.name).toBe('PLOS');
    expect(m!.htmlUrl).toContain('/article?id=10.1371/journal.pone.0123456');
  });

  test('matches ACM DL PDF URLs', () => {
    const m = matchPaperSource('https://dl.acm.org/doi/pdf/10.1145/3292500.3330919');
    expect(m).not.toBeNull();
    expect(m!.source.name).toBe('ACM');
    expect(m!.htmlUrl).toBe('https://dl.acm.org/doi/fullHtml/10.1145/3292500.3330919');
  });

  test('returns null for non-academic URLs', () => {
    expect(matchPaperSource('https://example.com/paper.pdf')).toBeNull();
    expect(matchPaperSource('https://nytimes.com/article')).toBeNull();
  });

  test('returns null for arxiv non-paper pages', () => {
    expect(matchPaperSource('https://arxiv.org/search/?query=test')).toBeNull();
    expect(matchPaperSource('https://arxiv.org/list/cs.AI/recent')).toBeNull();
  });

  test('returns null for bioRxiv non-PDF pages', () => {
    // abstract page without .full.pdf doesn't get rewritten
    expect(matchPaperSource('https://www.biorxiv.org/content/10.1101/2024.01.15.575123v1')).toBeNull();
  });
});

// ── PDF text cleanup helpers ────────────────────────────────────────

describe('fixPdfLigatures', () => {
  test('replaces Unicode ligature codepoints', () => {
    expect(fixPdfLigatures('e\uFB00ect')).toBe('effect');
    expect(fixPdfLigatures('di\uFB03cult')).toBe('difficult');
    expect(fixPdfLigatures('\uFB02oor')).toBe('floor');
    expect(fixPdfLigatures('o\uFB03ce')).toBe('office');
    expect(fixPdfLigatures('shu\uFB04e')).toBe('shuffle');
    expect(fixPdfLigatures('a\uFB01x')).toBe('afix');
  });

  test('leaves normal text unchanged', () => {
    expect(fixPdfLigatures('hello world')).toBe('hello world');
    expect(fixPdfLigatures('different')).toBe('different');
  });
});

describe('stripRunningHeaders', () => {
  test('removes repeated short lines from page boundaries', () => {
    const pages = [
      'HUMAN LIMITATIONS 1\nFirst page content here.\nMore content on page one.',
      'HUMAN LIMITATIONS 2\nSecond page content here.\nMore content on page two.',
      'HUMAN LIMITATIONS 3\nThird page content here.\nMore content on page three.',
      'HUMAN LIMITATIONS 4\nFourth page content here.\nMore content on page four.',
    ];
    const result = stripRunningHeaders(pages);
    for (const page of result) {
      expect(page).not.toMatch(/HUMAN LIMITATIONS/);
    }
    // Content should be preserved
    expect(result[0]).toContain('First page content');
    expect(result[1]).toContain('Second page content');
  });

  test('removes bare page numbers', () => {
    const pages = [
      '1\nContent of page one.',
      '2\nContent of page two.',
      '3\nContent of page three.',
    ];
    const result = stripRunningHeaders(pages);
    for (const page of result) {
      expect(page.trim()).not.toMatch(/^\d+$/m);
    }
  });

  test('preserves non-repeated content', () => {
    const pages = [
      'Unique Title Page\nIntroduction content here.',
      'Header\nSection two content here.',
      'Header\nSection three content here.',
      'Header\nSection four content here.',
    ];
    const result = stripRunningHeaders(pages);
    expect(result[0]).toContain('Unique Title Page');
    expect(result[0]).toContain('Introduction content');
  });

  test('returns pages unchanged when fewer than 3 pages', () => {
    const pages = ['Page one content.', 'Page two content.'];
    const result = stripRunningHeaders(pages);
    expect(result).toEqual(pages);
  });
});

describe('buildParagraphs', () => {
  test('joins consecutive lines into paragraphs', () => {
    const input = 'First line of paragraph.\nSecond line of paragraph.\n\nNew paragraph here.';
    const result = buildParagraphs(input);
    expect(result).toBe('First line of paragraph. Second line of paragraph.\n\nNew paragraph here.');
  });

  test('handles multiple blank lines as single break', () => {
    const input = 'Para one.\n\n\n\nPara two.';
    const result = buildParagraphs(input);
    expect(result).toBe('Para one.\n\nPara two.');
  });

  test('trims whitespace from lines', () => {
    const input = '  Leading space.\n  Trailing space.  \n\n  Another para.  ';
    const result = buildParagraphs(input);
    expect(result).toBe('Leading space. Trailing space.\n\nAnother para.');
  });

  test('handles single line input', () => {
    expect(buildParagraphs('Just one line.')).toBe('Just one line.');
  });

  test('handles empty input', () => {
    expect(buildParagraphs('')).toBe('');
  });
});

describe('extractPdfTitle', () => {
  test('returns first suitable line', () => {
    const lines = ['Understanding Human Intelligence', 'Thomas L. Griffiths'];
    expect(extractPdfTitle(lines, 'https://example.com/paper.pdf')).toBe('Understanding Human Intelligence');
  });

  test('skips Running head: prefix', () => {
    const lines = ['Running head: HUMAN LIMITATIONS', 'Understanding Human Intelligence'];
    expect(extractPdfTitle(lines, 'https://example.com/paper.pdf')).toBe('Understanding Human Intelligence');
  });

  test('skips bare page numbers', () => {
    const lines = ['1', 'Real Title Here', 'Author Name'];
    expect(extractPdfTitle(lines, 'https://example.com/paper.pdf')).toBe('Real Title Here');
  });

  test('skips arxiv IDs', () => {
    const lines = ['arXiv:2009.14050v3', 'Understanding Human Intelligence'];
    expect(extractPdfTitle(lines, 'https://arxiv.org/pdf/2009.14050')).toBe('Understanding Human Intelligence');
  });

  test('skips short lines', () => {
    const lines = ['Hi', 'Yo', 'A Real Paper Title That Is Long Enough'];
    expect(extractPdfTitle(lines, 'https://example.com/p.pdf')).toBe('A Real Paper Title That Is Long Enough');
  });

  test('falls back to filename from URL', () => {
    const lines = ['1', '2', '3'];
    expect(extractPdfTitle(lines, 'https://example.com/my-paper.pdf')).toBe('my paper');
  });

  test('falls back to Untitled PDF for bare URLs', () => {
    const lines: string[] = [];
    expect(extractPdfTitle(lines, 'https://example.com/')).toBe('Untitled PDF');
  });
});
