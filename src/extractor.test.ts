// ABOUTME: Tests for article content extraction
// ABOUTME: Verifies Readability extracts clean content from HTML pages

import {
  extractArticle, resolveRelativeUrls, simplifySubstackUrl, isYouTubeUrl, extractYouTubeId,
  matchPaperSource, fixPdfLigatures, stripRunningHeaders, buildParagraphs, extractPdfTitle,
  parseCaptionTracks, extractTweetId, isThreadsUrl, formatTweetMarkdown, fetchAndExtract,
  stripEmbedNoise, htmlToMarkdown, shouldSkipUrl, isBinaryUrl,
  type FxTweet
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

describe('extractArticle — language detection', () => {
  test('extracts lang attribute from html element', () => {
    const html = `<html lang="fr"><head><title>Article en français</title></head>
      <body><article><p>Ceci est le premier paragraphe de l'article avec assez de contenu.</p>
      <p>Voici le deuxième paragraphe avec plus de contenu substantiel.</p>
      <p>Et un troisième paragraphe pour s'assurer que Readability fonctionne correctement.</p>
      </article></body></html>`;
    const result = extractArticle(html, 'https://example.fr/article');
    expect(result).not.toBeNull();
    expect(result!.lang).toBe('fr');
  });

  test('extracts base language from lang with region', () => {
    const html = `<html lang="de-DE"><head><title>Deutscher Artikel</title></head>
      <body><article><p>Dies ist der erste Absatz des Artikels mit genug Inhalt.</p>
      <p>Hier ist der zweite Absatz mit mehr inhaltlichem Material für die Extraktion.</p>
      <p>Und ein dritter Absatz, um sicherzustellen, dass alles korrekt funktioniert.</p>
      </article></body></html>`;
    const result = extractArticle(html, 'https://example.de/artikel');
    expect(result).not.toBeNull();
    expect(result!.lang).toBe('de');
  });

  test('returns undefined lang when html has no lang attribute', () => {
    const result = extractArticle(SAMPLE_HTML, 'https://example.com/test');
    expect(result).not.toBeNull();
    expect(result!.lang).toBeUndefined();
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

  test('resolves protocol-relative image URLs to https', () => {
    const md = '![chart](//static.lukew.com/bench_toolcalls.png)';
    const result = resolveRelativeUrls(md, 'https://www.lukew.com/ff/entry.asp?123');
    expect(result).toBe('![chart](https://static.lukew.com/bench_toolcalls.png)');
  });

  test('resolves protocol-relative link URLs to https', () => {
    const md = '[read more](//cdn.example.com/page)';
    const result = resolveRelativeUrls(md, baseUrl);
    expect(result).toBe('[read more](https://cdn.example.com/page)');
  });

  test('does not double-prefix protocol-relative URLs with origin', () => {
    const md = '![img](//static.lukew.com/image.png) and [link](//cdn.example.com/doc)';
    const result = resolveRelativeUrls(md, 'https://www.lukew.com/ff/rss');
    expect(result).toBe('![img](https://static.lukew.com/image.png) and [link](https://cdn.example.com/doc)');
  });
});

describe('stripEmbedNoise', () => {
  test('strips raw iframe code shown as visible text', () => {
    const md = 'Some intro.\n\n<iframe src="https://www.npr.org/player/embed/123/456" width="100%" height="290" frameborder="0" scrolling="no" title="NPR embedded audio player">\n\nActual article content.';
    const result = stripEmbedNoise(md);
    expect(result).not.toContain('iframe');
    expect(result).toContain('Some intro.');
    expect(result).toContain('Actual article content.');
  });

  test('strips Embed heading followed by iframe code', () => {
    const md = '# The hack that almost broke the internet\n\n## Embed\n<iframe src="https://www.npr.org/player/embed/123/456">\n\nLast month, the world narrowly avoided a cyberattack.';
    const result = stripEmbedNoise(md);
    expect(result).not.toContain('Embed');
    expect(result).not.toContain('iframe');
    expect(result).toContain('Last month');
  });

  test('strips bare Download bullet from player UI', () => {
    const md = '* **Download**\n\nArticle content here.';
    const result = stripEmbedNoise(md);
    expect(result).not.toContain('Download');
    expect(result).toContain('Article content here.');
  });

  test('preserves normal content with download links', () => {
    const md = 'You can [download the app](https://example.com/app) here.';
    const result = stripEmbedNoise(md);
    expect(result).toContain('download the app');
  });

  test('collapses excess blank lines', () => {
    const md = 'First paragraph.\n\n\n\n\n\nSecond paragraph.';
    const result = stripEmbedNoise(md);
    expect(result).toBe('First paragraph.\n\n\nSecond paragraph.');
  });

  test('passes through clean content unchanged', () => {
    const md = '# Title\n\nSome article text.\n\n## Subtitle\n\nMore text.';
    const result = stripEmbedNoise(md);
    expect(result).toBe(md);
  });

  test('strips Google AdSense script remnants', () => {
    const md = 'Article content.\n\n(adsbygoogle = window.adsbygoogle || []).push({});\n\nMore content.';
    const result = stripEmbedNoise(md);
    expect(result).not.toContain('adsbygoogle');
    expect(result).toContain('Article content.');
    expect(result).toContain('More content.');
  });

  test('strips window.adsbygoogle variant', () => {
    const md = 'Intro.\n\nwindow.adsbygoogle = window.adsbygoogle || [];\n\nBody text.';
    const result = stripEmbedNoise(md);
    expect(result).not.toContain('adsbygoogle');
    expect(result).toContain('Intro.');
    expect(result).toContain('Body text.');
  });
});

describe('htmlToMarkdown', () => {
  test('converts HTML to markdown with resolved URLs', () => {
    const html = '<p>Hello <strong>world</strong></p><p>A <a href="/page">link</a></p>';
    const result = htmlToMarkdown(html, 'https://example.com/article');
    expect(result).toContain('Hello **world**');
    expect(result).toContain('[link](https://example.com/page)');
  });

  test('converts Substack-style feed content to clean markdown', () => {
    const html = '<h2>Introduction</h2><p>This is the first paragraph of a Substack article.</p>'
      + '<p>It has <em>formatting</em> and <a href="https://example.com">links</a>.</p>';
    const result = htmlToMarkdown(html, 'https://newcomer.co/p/some-article');
    expect(result).toContain('## Introduction');
    expect(result).toContain('first paragraph');
    expect(result).toContain('_formatting_');
    expect(result).toContain('[links](https://example.com)');
  });

  test('strips script tags from HTML content', () => {
    const html = '<p>Article text.</p><script>(adsbygoogle = window.adsbygoogle || []).push({});</script><p>More text.</p>';
    const result = htmlToMarkdown(html, 'https://example.com');
    expect(result).not.toContain('adsbygoogle');
    expect(result).toContain('Article text.');
    expect(result).toContain('More text.');
  });

  test('strips style tags from HTML content', () => {
    const html = '<style>.ad { display: block; }</style><p>Content here.</p>';
    const result = htmlToMarkdown(html, 'https://example.com');
    expect(result).not.toContain('.ad');
    expect(result).toContain('Content here.');
  });

  test('preserves img title attribute in linked images', () => {
    const html = '<a href="https://xkcd.com/1234/"><img src="https://imgs.xkcd.com/comics/test.png" alt="Test Comic" title="The punchline goes here"></a>';
    const result = htmlToMarkdown(html, 'https://xkcd.com/1234/');
    expect(result).toContain('![Test Comic](https://imgs.xkcd.com/comics/test.png "The punchline goes here")');
  });

  test('handles img with no title attribute in linked images', () => {
    const html = '<a href="https://example.com"><img src="https://example.com/photo.jpg" alt="Photo"></a>';
    const result = htmlToMarkdown(html, 'https://example.com');
    expect(result).toContain('![Photo](https://example.com/photo.jpg)');
    expect(result).not.toContain('""');
  });

  test('escapes quotes in img title attribute', () => {
    const html = '<a href="https://xkcd.com/1234/"><img src="https://imgs.xkcd.com/comics/test.png" alt="Comic" title=\'He said "hello" to them\'></a>';
    const result = htmlToMarkdown(html, 'https://xkcd.com/1234/');
    expect(result).toContain('![Comic](https://imgs.xkcd.com/comics/test.png "He said \\"hello\\" to them")');
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

describe('parseCaptionTracks', () => {
  test('extracts caption tracks from YouTube page HTML', () => {
    const html = `some stuff "captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc","languageCode":"en"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc&lang=es","languageCode":"es","kind":"asr"}] more stuff`;
    const tracks = parseCaptionTracks(html);
    expect(tracks).not.toBeNull();
    expect(tracks!.length).toBe(2);
    expect(tracks![0].languageCode).toBe('en');
    expect(tracks![1].languageCode).toBe('es');
    expect(tracks![1].kind).toBe('asr');
  });

  test('returns null when no captionTracks found', () => {
    const html = '<html><body>No captions here</body></html>';
    expect(parseCaptionTracks(html)).toBeNull();
  });

  test('returns null for empty caption tracks array', () => {
    const html = `"captionTracks":[]`;
    expect(parseCaptionTracks(html)).toBeNull();
  });

  test('handles captionTracks with escaped quotes in URLs', () => {
    const html = `"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc\\u0026lang=en","languageCode":"en"}]`;
    const tracks = parseCaptionTracks(html);
    expect(tracks).not.toBeNull();
    expect(tracks!.length).toBe(1);
  });

  test('handles captionTracks containing brackets in values', () => {
    const html = `"captionTracks":[{"baseUrl":"https://example.com/tt?v=x","name":{"simpleText":"English [CC]"},"languageCode":"en"}] other stuff`;
    const tracks = parseCaptionTracks(html);
    expect(tracks).not.toBeNull();
    expect(tracks!.length).toBe(1);
    expect(tracks![0].languageCode).toBe('en');
  });
});

// ── Twitter/X tweet ID extraction ───────────────────────────────────

describe('extractTweetId', () => {
  test('extracts from standard x.com URL', () => {
    const result = extractTweetId('https://x.com/naval/status/1002103360646823936');
    expect(result).toEqual({ username: 'naval', statusId: '1002103360646823936' });
  });

  test('extracts from twitter.com URL', () => {
    const result = extractTweetId('https://twitter.com/user/status/123456789');
    expect(result).toEqual({ username: 'user', statusId: '123456789' });
  });

  test('extracts from www.twitter.com URL', () => {
    const result = extractTweetId('https://www.twitter.com/user/status/123');
    expect(result).toEqual({ username: 'user', statusId: '123' });
  });

  test('extracts from mobile.x.com URL', () => {
    const result = extractTweetId('https://mobile.x.com/user/status/123');
    expect(result).toEqual({ username: 'user', statusId: '123' });
  });

  test('handles URL with trailing query params', () => {
    const result = extractTweetId('https://x.com/user/status/123?s=20&t=abc');
    expect(result).toEqual({ username: 'user', statusId: '123' });
  });

  test('returns null for profile URL', () => {
    expect(extractTweetId('https://x.com/naval')).toBeNull();
  });

  test('returns null for followers page', () => {
    expect(extractTweetId('https://x.com/naval/followers')).toBeNull();
  });

  test('returns null for non-numeric status ID', () => {
    expect(extractTweetId('https://x.com/user/status/not-a-number')).toBeNull();
  });

  test('returns null for non-Twitter URL', () => {
    expect(extractTweetId('https://example.com/user/status/123')).toBeNull();
  });

  test('returns null for invalid URL', () => {
    expect(extractTweetId('not-a-url')).toBeNull();
  });
});

// ── Threads.net URL detection ───────────────────────────────────────

describe('isThreadsUrl', () => {
  test('detects www.threads.net', () => {
    expect(isThreadsUrl('https://www.threads.net/@user/post/xxx')).toBe(true);
  });

  test('detects threads.net without www', () => {
    expect(isThreadsUrl('https://threads.net/@user/post/xxx')).toBe(true);
  });

  test('detects threads.com', () => {
    expect(isThreadsUrl('https://threads.com/@user/post/xxx')).toBe(true);
  });

  test('detects www.threads.com', () => {
    expect(isThreadsUrl('https://www.threads.com/@user/post/xxx')).toBe(true);
  });

  test('rejects non-Threads URLs', () => {
    expect(isThreadsUrl('https://example.com')).toBe(false);
    expect(isThreadsUrl('https://x.com/user/status/123')).toBe(false);
  });

  test('returns false for invalid URL', () => {
    expect(isThreadsUrl('not-a-url')).toBe(false);
  });
});

// ── Tweet markdown formatting ───────────────────────────────────────

describe('formatTweetMarkdown', () => {
  const baseTweet: FxTweet = {
    text: 'Seek wealth, not money or status.',
    author: { name: 'Naval', screen_name: 'naval' },
    created_at: 'Thu May 31 08:23:54 +0000 2018',
  };

  test('formats basic tweet with author and date', () => {
    const md = formatTweetMarkdown(baseTweet);
    expect(md).toContain('**@naval**');
    expect(md).toContain('May 31, 2018');
    expect(md).toContain('Seek wealth, not money or status.');
  });

  test('includes photos as markdown images', () => {
    const tweet: FxTweet = {
      ...baseTweet,
      media: {
        photos: [
          { url: 'https://pbs.twimg.com/media/abc.jpg', alt_text: 'A photo' },
        ],
      },
    };
    const md = formatTweetMarkdown(tweet);
    expect(md).toContain('![A photo](https://pbs.twimg.com/media/abc.jpg)');
  });

  test('includes videos as linked thumbnails', () => {
    const tweet: FxTweet = {
      ...baseTweet,
      media: {
        videos: [
          { url: 'https://video.twimg.com/v1.mp4', thumbnail_url: 'https://pbs.twimg.com/thumb.jpg' },
        ],
      },
    };
    const md = formatTweetMarkdown(tweet);
    expect(md).toContain('[![](https://pbs.twimg.com/thumb.jpg)](https://video.twimg.com/v1.mp4)');
  });

  test('includes quoted tweet as blockquote', () => {
    const tweet: FxTweet = {
      ...baseTweet,
      quote: {
        text: 'Original thought here',
        author: { name: 'Other', screen_name: 'other' },
        created_at: 'Wed May 30 12:00:00 +0000 2018',
      },
    };
    const md = formatTweetMarkdown(tweet);
    expect(md).toContain('> **@other**');
    expect(md).toContain('Original thought here');
  });

  test('handles tweet with no media gracefully', () => {
    const md = formatTweetMarkdown(baseTweet);
    expect(md).not.toContain('![');
    expect(md).not.toContain('[![');
  });

  test('renders article tweet with title and content blocks', () => {
    const articleTweet: FxTweet = {
      text: '',
      author: { name: 'Test Author', screen_name: 'testuser' },
      created_at: 'Wed Jan 01 12:00:00 +0000 2025',
      article: {
        title: 'Agentic Note-Taking',
        preview_text: 'Written from the other side.',
        content: {
          blocks: [
            { type: 'unstyled', text: 'First paragraph.' },
            { type: 'header-two', text: 'A Subheading' },
            { type: 'unstyled', text: 'Second paragraph.' },
          ],
        },
      },
    };
    const md = formatTweetMarkdown(articleTweet);
    expect(md).toContain('## Agentic Note-Taking');
    expect(md).toContain('First paragraph.');
    expect(md).toContain('## A Subheading');
    expect(md).toContain('Second paragraph.');
    expect(md).toContain('**@testuser**');
  });
});

// ── Tweet extraction integration (mocked fetch) ────────────────────

describe('extractTweet via fetchAndExtract', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  function mockFxTwitter(tweet: any) {
    return new Response(JSON.stringify({ code: 200, message: 'OK', tweet }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  test('extracts single tweet via fxtwitter API', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('api.fxtwitter.com')) {
        return mockFxTwitter({
          text: 'Hello world!',
          author: { name: 'TestUser', screen_name: 'testuser' },
          created_at: 'Mon Jan 01 12:00:00 +0000 2024',
          replying_to_status: null,
        });
      }
      throw new Error('Unexpected fetch');
    });

    const result = await fetchAndExtract('https://x.com/testuser/status/123456789');
    expect(result).not.toBeNull();
    expect(result!.markdown).toContain('**@testuser**');
    expect(result!.markdown).toContain('Hello world!');
    expect(result!.title).toBeTruthy();
  });

  test('stitches thread by walking reply chain', async () => {
    const tweet1 = {
      id: '100',
      text: 'Thread start',
      author: { name: 'A', screen_name: 'user' },
      created_at: 'Mon Jan 01 12:00:00 +0000 2024',
      replying_to_status: null,
    };
    const tweet2 = {
      id: '200',
      text: 'Thread middle',
      author: { name: 'A', screen_name: 'user' },
      created_at: 'Mon Jan 01 12:01:00 +0000 2024',
      replying_to_status: '100',
    };
    const tweet3 = {
      id: '300',
      text: 'Thread end',
      author: { name: 'A', screen_name: 'user' },
      created_at: 'Mon Jan 01 12:02:00 +0000 2024',
      replying_to_status: '200',
    };

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('status/300')) return mockFxTwitter(tweet3);
      if (url.includes('status/200')) return mockFxTwitter(tweet2);
      if (url.includes('status/100')) return mockFxTwitter(tweet1);
      throw new Error('Unexpected fetch: ' + url);
    });

    const result = await fetchAndExtract('https://x.com/user/status/300');
    expect(result).not.toBeNull();
    // Thread should be in chronological order (oldest first)
    const md = result!.markdown;
    const startIdx = md.indexOf('Thread start');
    const midIdx = md.indexOf('Thread middle');
    const endIdx = md.indexOf('Thread end');
    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(midIdx).toBeGreaterThan(startIdx);
    expect(endIdx).toBeGreaterThan(midIdx);
    // Thread tweets separated by horizontal rules
    expect(md).toContain('---');
  });

  test('falls back to generic extraction on fxtwitter 404', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('api.fxtwitter.com')) {
        return new Response('Not Found', { status: 404 });
      }
      // Generic HTML fallback
      return new Response(`<html><head><title>X Post</title>
        <meta property="og:description" content="Fallback tweet text" />
        </head><body><article><p>Fallback tweet text with enough content for extraction.</p>
        <p>More content to satisfy readability requirements for article parsing.</p>
        <p>Third paragraph so the article is long enough for readability to work.</p></article></body></html>`, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    });

    const result = await fetchAndExtract('https://x.com/user/status/999');
    expect(result).not.toBeNull();
    expect(result!.markdown).toContain('Fallback tweet text');
  });
});

describe('isBinaryUrl', () => {
  test('detects audio file extensions', () => {
    expect(isBinaryUrl('https://cdn.example.com/episode.mp3')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/episode.m4a')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/episode.wav')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/episode.ogg')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/episode.aac')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/episode.flac')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/episode.wma')).toBe(true);
  });

  test('detects video file extensions', () => {
    expect(isBinaryUrl('https://cdn.example.com/clip.mp4')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/clip.webm')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/clip.avi')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/clip.mov')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/clip.mkv')).toBe(true);
  });

  test('detects image file extensions', () => {
    expect(isBinaryUrl('https://cdn.example.com/photo.jpg')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/photo.jpeg')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/photo.png')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/photo.gif')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/photo.webp')).toBe(true);
  });

  test('detects archive/binary file extensions', () => {
    expect(isBinaryUrl('https://cdn.example.com/archive.zip')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/archive.tar.gz')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/app.exe')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/app.dmg')).toBe(true);
  });

  test('returns false for article URLs', () => {
    expect(isBinaryUrl('https://example.com/article')).toBe(false);
    expect(isBinaryUrl('https://example.com/article.html')).toBe(false);
    expect(isBinaryUrl('https://example.com/post/123')).toBe(false);
  });

  test('handles query strings after extension', () => {
    expect(isBinaryUrl('https://cdn.example.com/episode.mp3?token=abc')).toBe(true);
  });

  test('is case insensitive', () => {
    expect(isBinaryUrl('https://cdn.example.com/episode.MP3')).toBe(true);
    expect(isBinaryUrl('https://cdn.example.com/clip.MP4')).toBe(true);
  });
});

describe('fetchAndExtract — binary content safeguards', () => {
  test('rejects binary URLs before fetching', async () => {
    await expect(
      fetchAndExtract('https://cdn.npr.org/podcast/episode.mp3')
    ).rejects.toThrow(/binary/i);
  });

  test('rejects audio content-type responses', async () => {
    globalThis.fetch = async () => new Response('binary garbage', {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    }) as any;

    await expect(
      fetchAndExtract('https://cdn.npr.org/podcast/episode')
    ).rejects.toThrow(/binary/i);
  });

  test('rejects video content-type responses', async () => {
    globalThis.fetch = async () => new Response('binary garbage', {
      status: 200,
      headers: { 'content-type': 'video/mp4' },
    }) as any;

    await expect(
      fetchAndExtract('https://example.com/stream')
    ).rejects.toThrow(/binary/i);
  });
});
