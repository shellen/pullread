// ABOUTME: Tests for the email roundup module
// ABOUTME: Covers HTML generation, escaping, provider resolution, curation, summary, and send logic

import { escapeHtml, buildRoundupHtml, sendTestEmail, sendRoundup, resolveSmtpConfig, SMTP_PROVIDERS, curateArticles, curateWithStories, dedupeArticles, generateRoundupSummary, buildRoundup, filterByLookback, formatSummaryCredit, scoreArticle, groupByCategory, issueDateLine } from './email';
import type { EmailConfig, ArticleMeta } from './email';

jest.mock('nodemailer', () => ({
  // No test should ever open a real socket — a connect attempt in offline
  // environments hangs until the Jest timeout (issue #106). Send paths that
  // pass config validation reject with this marker error instead.
  createTransport: jest.fn(() => ({
    sendMail: jest.fn(() => Promise.reject(new Error('mock transport: network disabled in tests'))),
  })),
}));

jest.mock('./summarizer', () => ({
  // Default: no LLM configured, so generateRoundupSummary short-circuits to null.
  // Individual tests override these mocks as needed.
  loadLLMConfig: jest.fn(() => null),
  promptLLM: jest.fn(),
  summarizeText: jest.fn(),
}));
jest.mock('./apple-structured', () => ({
  // Never compile or run Swift in tests; individual tests set a return value.
  runAppleStructured: jest.fn(() => { throw new Error('apple-structured not mocked for this test'); }),
}));
import { runAppleStructured } from './apple-structured';
const mockRunAppleStructured = runAppleStructured as jest.MockedFunction<typeof runAppleStructured>;
import { loadLLMConfig, promptLLM } from './summarizer';
const mockLoadLLMConfig = loadLLMConfig as jest.MockedFunction<typeof loadLLMConfig>;
const mockPromptLLM = promptLLM as jest.MockedFunction<typeof promptLLM>;

const baseConfig: EmailConfig = {
  enabled: true,
  smtpProvider: 'custom',
  smtpHost: 'smtp.test.com',
  smtpPort: 587,
  smtpUser: 'user',
  smtpPass: 'pass',
  useTls: true,
  fromAddress: 'from@test.com',
  toAddress: 'to@test.com',
  frequency: 'daily',
  sendTime: '08:00',
  sendTime2: '17:00',
  lookbackDays: 1,
  // Tests never reach the network: the wider-news panel is exercised in stories.test.ts.
  widerNews: false,
  regionalFeeds: [],
};

function article(overrides: Partial<ArticleMeta> = {}): ArticleMeta {
  return {
    filename: 'test.md',
    title: 'Test Article',
    url: `https://example.com/${(overrides.title || 'test').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    domain: 'example.com',
    ...overrides,
  };
}

describe('escapeHtml', () => {
  test('escapes ampersands', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  test('escapes angle brackets and quotes', () => {
    expect(escapeHtml('<script>"alert"</script>')).toBe('&lt;script&gt;&quot;alert&quot;&lt;/script&gt;');
  });

  test('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  test('leaves clean text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
});

describe('resolveSmtpConfig', () => {
  test('returns Gmail preset for gmail provider', () => {
    const result = resolveSmtpConfig({ ...baseConfig, smtpProvider: 'gmail' });
    expect(result.host).toBe('smtp.gmail.com');
    expect(result.port).toBe(587);
    expect(result.useTls).toBe(true);
  });

  test('returns Outlook preset for outlook provider', () => {
    const result = resolveSmtpConfig({ ...baseConfig, smtpProvider: 'outlook' });
    expect(result.host).toBe('smtp.office365.com');
    expect(result.port).toBe(587);
    expect(result.useTls).toBe(true);
  });

  test('returns custom values for custom provider', () => {
    const result = resolveSmtpConfig({
      ...baseConfig,
      smtpProvider: 'custom',
      smtpHost: 'mail.example.com',
      smtpPort: 465,
      useTls: false,
    });
    expect(result.host).toBe('mail.example.com');
    expect(result.port).toBe(465);
    expect(result.useTls).toBe(false);
  });

  test('gmail provider ignores custom smtpHost', () => {
    const result = resolveSmtpConfig({
      ...baseConfig,
      smtpProvider: 'gmail',
      smtpHost: 'wrong.host.com',
    });
    expect(result.host).toBe('smtp.gmail.com');
  });
});

describe('buildRoundupHtml', () => {
  test('shows empty state when no articles', () => {
    const html = buildRoundupHtml([], 1);
    expect(html).toContain('Enjoy the quiet');
    expect(html).toContain('from today');
    expect(html).toContain('0 articles');
  });

  test('renders single article with correct singular', () => {
    const html = buildRoundupHtml([article()], 1);
    expect(html).toContain('1 article ');
    expect(html).toContain('Test Article');
    expect(html).toContain('example.com');
  });

  test('renders multiple articles with plural', () => {
    const html = buildRoundupHtml([
      article({ filename: 'a.md', title: 'First', url: 'https://a.com', domain: 'a.com' }),
      article({ filename: 'b.md', title: 'Second', url: 'https://b.com', domain: 'b.com' }),
    ], 1);
    expect(html).toContain('2 articles');
    expect(html).toContain('First');
    expect(html).toContain('Second');
  });

  test('uses lookback period text for multi-day', () => {
    const html = buildRoundupHtml([], 7);
    expect(html).toContain('this week');
  });

  test('shows author when present', () => {
    const html = buildRoundupHtml([article({ author: 'Jane Doe' })], 1);
    expect(html).toContain('Jane Doe');
  });

  test('falls back to feed when domain is empty', () => {
    const html = buildRoundupHtml([article({ domain: '', feed: 'My RSS Feed' })], 1);
    expect(html).toContain('My RSS Feed');
  });

  test('headline is the only link (to the source); no per-item Pull Read CTA', () => {
    const url = 'https://example.com/article?id=1';
    const html = buildRoundupHtml([article({ url, image: 'https://example.com/p.jpg', excerpt: 'x' })], 1);
    // The headline links straight to the source, so it works on any device.
    expect(html).toContain(`<a href="${url}"`);
    // No repeated "Open in Pull Read" label / deep link on every item.
    expect(html).not.toContain('Open in Pull Read');
    expect(html).not.toContain('pullread.com/link');
  });

  test('hero image/text stack on mobile via responsive classes', () => {
    const html = buildRoundupHtml([article({ image: 'https://example.com/p.jpg', excerpt: 'x' })], 1);
    expect(html).toContain('class="hero-cell hero-img"');
    // The media query that stacks the cells on small screens is present.
    expect(html).toContain('.hero-cell{display:block');
  });

  test('escapes HTML in article titles', () => {
    const html = buildRoundupHtml([article({ title: 'Title with <script> & "quotes"' })], 1);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<script>');
  });

  test('groups articles by category', () => {
    const html = buildRoundupHtml([
      article({ title: 'Tech One', categories: ['Technology'] }),
      article({ title: 'Biz One', categories: ['Business'] }),
      article({ title: 'Tech Two', categories: ['Technology'] }),
    ], 1);
    // Categories appear as uppercase headers
    expect(html).toContain('BUSINESS');
    expect(html).toContain('TECHNOLOGY');
    // Business should appear before Technology (alphabetical)
    const bizPos = html.indexOf('BUSINESS');
    const techPos = html.indexOf('TECHNOLOGY');
    expect(bizPos).toBeLessThan(techPos);
  });

  test('puts uncategorized articles in More section at the end', () => {
    const html = buildRoundupHtml([
      article({ title: 'Categorized', categories: ['Tech'] }),
      article({ title: 'No Category' }),
    ], 1);
    expect(html).toContain('MORE');
    const techPos = html.indexOf('TECH');
    const morePos = html.indexOf('MORE');
    expect(techPos).toBeLessThan(morePos);
  });

  test('renders hero article with image when available', () => {
    const html = buildRoundupHtml([article({
      image: 'https://example.com/photo.jpg',
      excerpt: 'A fascinating look at something.',
    })], 1);
    expect(html).toContain('https://example.com/photo.jpg');
    expect(html).toContain('A fascinating look at something.');
    expect(html).toContain('width="140"');
  });

  test('renders hero without image gracefully', () => {
    const html = buildRoundupHtml([article({
      image: '',
      excerpt: 'No image here.',
    })], 1);
    expect(html).toContain('No image here.');
    // Should not contain an article thumbnail (header image is fine)
    expect(html).not.toContain('width="140"');
  });

  test('truncates long excerpts', () => {
    const longExcerpt = 'A'.repeat(200);
    const html = buildRoundupHtml([article({ excerpt: longExcerpt })], 1);
    expect(html).toContain('\u2026'); // ellipsis
    expect(html).not.toContain('A'.repeat(200));
  });

  test('uses brand colors and warm background', () => {
    const html = buildRoundupHtml([article()], 1);
    expect(html).toContain('#f7f5f3'); // warm background
    expect(html).toContain('#b45535'); // terracotta accent
  });

  test('includes rendered header image via CID', () => {
    const html = buildRoundupHtml([], 1);
    expect(html).toContain('cid:header');
    expect(html).toContain('Pull Read');
  });

  test('renders the AI intro as a plain newsletter lede (no bounding box)', () => {
    const html = buildRoundupHtml([article()], 1, 'AI is reshaping how we read and write.');
    expect(html).toContain('AI is reshaping how we read and write.');
    // No boxed callout — the intro sits on the card like a lede.
    expect(html).not.toContain('border-left:3px solid #b45535');
    expect(html).not.toContain('background:#faf8f6');
  });

  test('renders without summary when null', () => {
    const html = buildRoundupHtml([article()], 1, null);
    expect(html).not.toContain('Summary by');
  });

  test('links story references in the intro to the matching article', () => {
    const arts = [
      article({ title: 'EU forces Google', url: 'https://a.com/eu' }),
      article({ title: 'Self-parking EV', url: 'https://b.com/ev' }),
    ];
    const summary = 'Regulators moved on {{Google’s search data|1}} while carmakers bet on {{a self-parking EV|2}}.';
    const html = buildRoundupHtml(arts, 1, summary);
    expect(html).toContain('<a href="https://a.com/eu"');
    expect(html).toContain('<a href="https://b.com/ev"');
    expect(html).toContain('a self-parking EV');
    // The raw {{...|n}} markers never leak into the output.
    expect(html).not.toContain('{{');
    expect(html).not.toContain('|1}}');
  });

  test('links plain title mentions when the model skips the {{…|N}} markers', () => {
    // Apple Intelligence ignores the marker convention but names stories by
    // title — the renderer links those mentions, same as the in-app briefing.
    const arts = [
      article({ title: 'Apple Does Fusion', url: 'https://a.com/fusion' }),
      article({ title: 'EU Fines Google', url: 'https://b.com/eu' }),
    ];
    const summary = 'The article "Apple Does Fusion" digs into fusion energy, while "EU fines Google" covers the antitrust ruling.';
    const html = buildRoundupHtml(arts, 1, summary);
    expect(html).toContain('<a href="https://a.com/fusion"');
    // Case-insensitive match, original casing preserved in the link text.
    expect(html).toContain('<a href="https://b.com/eu"');
    expect(html).toContain('>EU fines Google</a>');
  });

  test('trusts the phrase over the number when a marker names a different story', () => {
    // Regression: Apple Intelligence renumbered its mentions 1, 2, 3… so every
    // marker pointed at the wrong article. When the phrase IS a story's title,
    // the words win over the number.
    const arts = [
      article({ title: 'EU Fines Google', url: 'https://a.com/eu' }),
      article({ title: 'Quake Strikes Border Region', url: 'https://b.com/quake' }),
    ];
    const summary = 'Big day: {{Quake Strikes Border Region|1}} and more.';
    const html = buildRoundupHtml(arts, 1, summary);
    expect(html).toContain('<a href="https://b.com/quake" style="color:#b45535;text-decoration:underline');
    expect(html).not.toContain('<a href="https://a.com/eu" style="color:#b45535;text-decoration:underline');
  });

  test('links a quoted, shortened title mention to the right story', () => {
    // Small models quote titles but drop the "| Show Name" suffix.
    const arts = [article({
      title: "Analyzing Portugal's Devastating Wildfire (Full Episode) | Witness to Disaster",
      url: 'https://y.com/wildfire',
    })];
    const summary = 'The documentary "Analyzing Portugal’s Devastating Wildfire" explores the largest fire in the country’s history.';
    const html = buildRoundupHtml(arts, 1, summary);
    expect(html).toContain('<a href="https://y.com/wildfire" style="color:#b45535;text-decoration:underline');
  });

  test('links an unquoted word run matching the start of a long title', () => {
    const arts = [article({
      title: 'Nordstrom Anniversary Sale 2026 – Picks for Men | Dapper',
      url: 'https://d.com/nordstrom',
    })];
    const summary = 'Meanwhile the Nordstrom Anniversary Sale 2026 promises a shopping paradise.';
    const html = buildRoundupHtml(arts, 1, summary);
    expect(html).toContain('<a href="https://d.com/nordstrom" style="color:#b45535;text-decoration:underline');
    expect(html).toContain('>Nordstrom Anniversary Sale 2026</a>');
  });

  test('does not produce a link ending on a stopword from a partial title match', () => {
    const arts = [article({ title: 'Jake Johnson - “The Dink” | The Daily Show', url: 'https://y.com/dink' })];
    const summary = 'Jake Johnson, the beloved actor, discusses his new project.';
    const html = buildRoundupHtml(arts, 1, summary);
    expect(html).not.toContain('<a href="https://y.com/dink" style="color:#b45535;text-decoration:underline');
  });

  test('does not link a short common word run', () => {
    const arts = [article({ title: 'How to Fix Your Sleep | Wired', url: 'https://w.com/sleep' })];
    const summary = 'Someone explains how to fix the power grid this decade.';
    const html = buildRoundupHtml(arts, 1, summary);
    expect(html).not.toContain('<a href="https://w.com/sleep" style="color:#b45535;text-decoration:underline');
  });

  test('does not link a short generic quoted fragment shared by many titles', () => {
    const arts = [article({
      title: 'Sports War: Norway Fan Hates Rowing | The Daily Show',
      url: 'https://y.com/sports',
    })];
    const summary = 'Michael Kosta on "The Daily Show" covers the tournament.';
    const html = buildRoundupHtml(arts, 1, summary);
    expect(html).not.toContain('<a href="https://y.com/sports" style="color:#b45535;text-decoration:underline');
  });

  test('does not double-link a story cited via marker and also named by title', () => {
    const arts = [article({ title: 'Apple Does Fusion', url: 'https://a.com/fusion' })];
    const summary = 'Om Malik on {{fusion energy|1}} — Apple Does Fusion is worth your time.';
    const html = buildRoundupHtml(arts, 1, summary);
    // Count intro-styled links only (the article card below links the URL too).
    const introLinks = html.match(/href="https:\/\/a\.com\/fusion" style="color:#b45535;text-decoration:underline/g) || [];
    expect(introLinks.length).toBe(1);
  });

  test('strips greeting and sign-off filler paragraphs but keeps the news', () => {
    const { stripFillerParagraphs } = require('./email');
    const text = "Let's get started, shall we?\n\nPortugal's 2017 wildfires get the documentary treatment.\n\nSo, there you have it, folks. That's today's rundown. Until next time, keep exploring.";
    const cleaned = stripFillerParagraphs(text);
    expect(cleaned).toBe("Portugal's 2017 wildfires get the documentary treatment.");
  });

  test('never strips the only paragraph even if it pattern-matches filler', () => {
    const { stripFillerParagraphs } = require('./email');
    expect(stripFillerParagraphs("Welcome to the future: robots now file taxes.")).toBe("Welcome to the future: robots now file taxes.");
  });

  test("strips a \"Here's the opening note\" preamble paragraph", () => {
    const { stripFillerParagraphs } = require('./email');
    const text = "Here's the opening note for your daily reading rundown:\n\nWashington had a loud day.";
    expect(stripFillerParagraphs(text)).toBe('Washington had a loud day.');
  });

  test('strips a generic preamble line before rendering the intro', () => {
    const html = buildRoundupHtml([article()], 1, 'Here is a summary of your reading queue:\n\nThe real briefing starts here.');
    expect(html).toContain('The real briefing starts here.');
    expect(html).not.toContain('Here is a summary');
  });

  test('strips citation markers that reference a missing story, keeping the words', () => {
    const html = buildRoundupHtml([article({ url: 'https://a.com/x' })], 1, 'A claim about {{something big|9}} today.');
    expect(html).toContain('something big');
    expect(html).not.toContain('{{');
    expect(html).not.toContain('|9');
  });

  test('splits the intro into paragraphs on blank lines', () => {
    const summary = 'First para, the throughline.\n\nSecond para, the tension.\n\nThird para, the payoff.';
    const html = buildRoundupHtml([article()], 1, summary);
    // Each paragraph becomes its own <p> so the note reads like a briefing.
    const paraCount = (html.match(/<p style="margin:0 0 [^"]*;font-size:16px/g) || []).length;
    expect(paraCount).toBe(3);
    expect(html).toContain('First para, the throughline.');
    expect(html).toContain('Second para, the tension.');
    expect(html).toContain('Third para, the payoff.');
  });

  test('credits the AI that wrote the intro when provided', () => {
    const html = buildRoundupHtml([article()], 1, 'A sharp little briefing.', 'Claude');
    expect(html).toContain('Summary by');
    expect(html).toContain('Claude');
  });

  test('omits the AI credit when none is provided', () => {
    const html = buildRoundupHtml([article()], 1, 'A sharp little briefing.');
    expect(html).not.toContain('Summary by');
  });
});

describe('curateArticles', () => {
  test('returns all articles when under limit', () => {
    const articles = [article({ title: 'A' }), article({ title: 'B' })];
    const result = curateArticles(articles, undefined, undefined, 5);
    expect(result).toHaveLength(2);
  });

  test('limits articles to max count', () => {
    const articles = Array.from({ length: 20 }, (_, i) => article({ title: `Art ${i}` }));
    const result = curateArticles(articles, undefined, undefined, 5);
    expect(result).toHaveLength(5);
  });

  test('boosts articles with excerpts and images', () => {
    const articles = [
      article({ title: 'Plain', filename: 'plain.md' }),
      article({ title: 'Rich', filename: 'rich.md', excerpt: 'Great stuff', image: 'https://img.com/a.jpg' }),
      article({ title: 'Also Plain', filename: 'plain2.md' }),
    ];
    const result = curateArticles(articles, undefined, undefined, 2);
    expect(result[0].title).toBe('Rich');
  });

  test('boosts articles matching watched entities', () => {
    const articles = [
      article({ title: 'Random News' }),
      article({ title: 'Apple Launches New Product' }),
      article({ title: 'Weather Report' }),
    ];
    const watched = new Set(['Apple']);
    const result = curateArticles(articles, new Map(), watched, 2);
    expect(result.some(a => a.title.includes('Apple'))).toBe(true);
  });

  test('ensures category diversity', () => {
    const articles = Array.from({ length: 12 }, (_, i) =>
      article({ title: `Tech ${i}`, categories: ['Technology'], excerpt: 'x' })
    ).concat([
      article({ title: 'Business One', categories: ['Business'], excerpt: 'x' }),
    ]);
    const result = curateArticles(articles, undefined, undefined, 6);
    const cats = new Set(result.map(a => a.categories?.[0]));
    expect(cats.size).toBeGreaterThan(1);
  });
});

describe('dedupeArticles', () => {
  test('drops the same story listed under two links with the same title (Nov 21 Roundup)', () => {
    const title = 'Judge Approves $7 Billion Settlement Over Claims That Roundup Caused Cancer';
    const result = dedupeArticles([
      article({ title, url: 'https://www.nytimes.com/2026/11/20/business/judge-approves-7-billion-settlement-over-claims-that-roundup-caused-cancer.html', categories: ['Suits and Litigation (Civil)'] }),
      article({ title, url: 'https://www.nytimes.com/2026/11/20/business/bayer-settlement-roundup-cancer.html', categories: ['Bayer AG'] }),
      article({ title: 'BMW Recalls 286 i5 And i7 EVs' }),
    ]);
    expect(result).toHaveLength(2);
  });

  test('drops the same news from two outlets (Nov 17 Julien Baker)', () => {
    const result = dedupeArticles([
      article({ title: 'Julien Baker Lines Up New Album This World or the Next', url: 'https://pitchfork.com/story/julien-baker' }),
      article({ title: 'Julien Baker Announces New Album This World Or The Next: Hear \u201cHound\u201d', url: 'https://stereogum.com/2518378/julien-baker' }),
    ]);
    expect(result).toHaveLength(1);
  });

  test('treats URLs differing only by query, hash, www or trailing slash as one', () => {
    const result = dedupeArticles([
      article({ title: 'First headline', url: 'https://www.example.com/story/' }),
      article({ title: 'Different headline', url: 'https://example.com/story?utm_source=rss#top' }),
    ]);
    expect(result).toHaveLength(1);
  });

  test('keeps the copy with an image when the first has none', () => {
    const result = dedupeArticles([
      article({ title: 'Same Story Here About Things', url: 'https://a.com/1' }),
      article({ title: 'Same Story Here About Things', url: 'https://b.com/2', image: 'https://img.com/x.jpg' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://b.com/2');
  });

  test('keeps different stories that share a name', () => {
    const result = dedupeArticles([
      article({ title: 'Trump orders federal contractors to check with White House before responding to Congress' }),
      article({ title: 'Trump lands in China with key meetings with Xi and Putin on the agenda' }),
      article({ title: 'Jeff Bezos says he was heavily involved in picking the new James Bond' }),
      article({ title: 'Bezos shrugs off blue wave, warns politicians not to make tech a villain' }),
    ]);
    expect(result).toHaveLength(4);
  });

  test('curateArticles removes duplicates even when under the limit', () => {
    const title = 'Judge Approves $7 Billion Settlement Over Claims That Roundup Caused Cancer';
    const result = curateArticles([
      article({ title, url: 'https://nytimes.com/a' }),
      article({ title, url: 'https://nytimes.com/b' }),
    ], undefined, undefined, 12);
    expect(result).toHaveLength(1);
  });
});

describe('byline guard', () => {
  test('hides a stringified-object byline saved by older builds', () => {
    const html = buildRoundupHtml([article({ title: 'Nico Therin photographs', author: '[object Object]' })], 1, null);
    expect(html).not.toContain('[object Object]');
    expect(html).toContain('Nico Therin photographs');
  });

  test('still shows a real byline', () => {
    const html = buildRoundupHtml([article({ title: 'A story', author: 'Jazz Monroe' })], 1, null);
    expect(html).toContain('Jazz Monroe');
  });
});

describe('mobile layout', () => {
  test('uses narrow side padding by default and widens it only on desktop', () => {
    const html = buildRoundupHtml([article({ title: 'A story' })], 1, null);
    expect(html).toContain('class="rundown-card" style="background:#ffffff;padding:28px 22px');
    expect(html).toContain('.rundown-card{padding:22px 16px !important');
    expect(html).toContain('@media only screen and (min-width:601px){.rundown-card{padding:40px !important}}');
    expect(html).not.toContain('padding:40px;border:1px solid');
  });
});

describe('issueDateLine', () => {
  test('names the weekday, date and time of day', () => {
    expect(issueDateLine(new Date(2026, 10, 17, 17, 0))).toBe('Tuesday, November 17, 2026 (evening)');
    expect(issueDateLine(new Date(2026, 10, 18, 8, 0))).toBe('Wednesday, November 18, 2026 (morning)');
  });
});

describe('scoreArticle', () => {
  const now = Date.parse('2026-07-18T12:00:00Z');

  test('rewards fresher stories', () => {
    const fresh = scoreArticle(article({ bookmarked: '2026-07-18T11:00:00Z' }), { now });
    const old = scoreArticle(article({ bookmarked: '2026-07-17T12:00:00Z' }), { now });
    expect(fresh).toBeGreaterThan(old);
  });

  test('rewards richer content and watched entities', () => {
    const plain = scoreArticle(article({ title: 'Plain' }), { now });
    const rich = scoreArticle(article({ title: 'Plain', excerpt: 'x', image: 'https://i/x.jpg' }), { now });
    expect(rich).toBeGreaterThan(plain);

    const watched = scoreArticle(
      article({ title: 'Apple ships a thing' }),
      { now, mentionCounts: new Map(), watchedEntities: new Set(['Apple']) },
    );
    expect(watched).toBeGreaterThan(plain);
  });

  test('missing or unparseable bookmark contributes no recency', () => {
    expect(scoreArticle(article({}), { now })).toBe(0);
    expect(scoreArticle(article({ bookmarked: 'not-a-date' }), { now })).toBe(0);
  });
});

describe('groupByCategory section ranking', () => {
  const sectionOrder = (m: Map<string, unknown>) => [...m.keys()];

  test('without a score, falls back to alphabetical with More last', () => {
    const groups = groupByCategory([
      article({ categories: ['Crypto'] }),
      article({ categories: ['AI'] }),
      article({}), // -> More
    ]);
    expect(sectionOrder(groups)).toEqual(['AI', 'Crypto', 'More']);
  });

  test('with a score, the strongest section leads (not alphabetical)', () => {
    const arts = [
      article({ title: 'weak ai', categories: ['AI'] }),
      article({ title: 'huge crypto story', categories: ['Crypto'] }),
    ];
    const score = (a: ArticleMeta) => (a.categories?.[0] === 'Crypto' ? 10 : 1);
    const groups = groupByCategory(arts, { score, seed: 'day' });
    // Crypto outranks AI despite coming later in the alphabet.
    expect(sectionOrder(groups)).toEqual(['Crypto', 'AI']);
  });

  test("the strongest story sorts first within a section (it becomes the hero)", () => {
    const arts = [
      article({ title: 'quiet', categories: ['AI'], filename: 'q.md' }),
      article({ title: 'loud', categories: ['AI'], filename: 'l.md' }),
    ];
    const score = (a: ArticleMeta) => (a.title === 'loud' ? 9 : 1);
    const groups = groupByCategory(arts, { score, seed: 'day' });
    expect(groups.get('AI')![0].title).toBe('loud');
  });

  test('More stays last even when it scores highest', () => {
    const arts = [
      article({ title: 'strong uncat' }), // More
      article({ title: 'ai', categories: ['AI'] }),
    ];
    const score = (a: ArticleMeta) => (a.categories?.[0] ? 1 : 100);
    const groups = groupByCategory(arts, { score, seed: 'day' });
    expect(sectionOrder(groups)[sectionOrder(groups).length - 1]).toBe('More');
  });

  test('ties reshuffle across days (seed) instead of freezing', () => {
    // All sections score zero -> pure tie; different daily seeds should be able
    // to lead with different sections.
    const arts = [
      article({ categories: ['AI'] }),
      article({ categories: ['Business'] }),
      article({ categories: ['Crypto'] }),
      article({ categories: ['Design'] }),
    ];
    const score = () => 0;
    const leads = new Set<string>();
    for (const seed of ['2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22']) {
      leads.add(sectionOrder(groupByCategory(arts, { score, seed }))[0]);
    }
    // Not the same section every day.
    expect(leads.size).toBeGreaterThan(1);
    // But deterministic for a given seed.
    const a = sectionOrder(groupByCategory(arts, { score, seed: 'fixed' }));
    const b = sectionOrder(groupByCategory(arts, { score, seed: 'fixed' }));
    expect(a).toEqual(b);
  });
});

describe('sendTestEmail', () => {
  test('throws when custom provider has no host', async () => {
    await expect(sendTestEmail({
      ...baseConfig,
      smtpProvider: 'custom',
      smtpHost: '',
    })).rejects.toThrow('missing SMTP host or recipient');
  });

  test('throws when recipient is missing', async () => {
    await expect(sendTestEmail({
      ...baseConfig,
      toAddress: '',
    })).rejects.toThrow('missing SMTP host or recipient');
  });

  test('does not throw for gmail provider with empty smtpHost', async () => {
    // Gmail's host comes from the provider preset, so validation passes and
    // the call proceeds to the (mocked) transport — no real socket.
    await expect(sendTestEmail({
      ...baseConfig,
      smtpProvider: 'gmail',
      smtpHost: '',
      smtpPort: 99999,
    })).rejects.toThrow('mock transport: network disabled in tests');
  });
});

describe('sendRoundup', () => {
  test('throws when custom provider has no host', async () => {
    await expect(sendRoundup({
      ...baseConfig,
      smtpProvider: 'custom',
      smtpHost: '',
    })).rejects.toThrow('missing SMTP host or recipient');
  });

  test('throws when recipient is missing', async () => {
    await expect(sendRoundup({
      ...baseConfig,
      smtpHost: 'smtp.test.com',
      toAddress: '',
    })).rejects.toThrow('missing SMTP host or recipient');
  });

  test('sends roundup with injected articles', async () => {
    const articles: ArticleMeta[] = [
      { filename: 'a.md', title: 'Article A', url: 'https://a.com', domain: 'a.com' },
    ];
    await expect(sendRoundup(
      {
        ...baseConfig,
        smtpProvider: 'custom',
        smtpHost: 'localhost',
        smtpPort: 99999,
        smtpUser: '',
        smtpPass: '',
        useTls: false,
      },
      async () => articles,
    )).rejects.toThrow();
  }, 45000);
});

describe('roundup intro gate and Apple structured intro', () => {
  const now = new Date(2026, 10, 24, 18, 0); // a Tuesday evening
  const stories = [
    article({ title: 'Chile earthquake: Dozens dead after 7.8 magnitude quake strikes near Santiago', domain: 'bbc.com' }),
    article({ title: 'Judge Approves $7 Billion Settlement Over Claims That Roundup Caused Cancer', domain: 'nytimes.com' }),
    article({ title: 'BART suspends service systemwide after power failure', domain: 'kqed.org' }),
  ];

  beforeEach(() => {
    mockLoadLLMConfig.mockReset();
    mockPromptLLM.mockReset();
    mockRunAppleStructured.mockReset();
    mockRunAppleStructured.mockImplementation(() => { throw new Error('not mocked'); });
  });

  test('an intro that names the wrong day is retried once, then left out', async () => {
    mockLoadLLMConfig.mockReturnValue({ provider: 'anthropic', apiKey: 'k', model: 'm' });
    mockPromptLLM.mockResolvedValue({ text: "It's Friday the 13th, and the {{Roundup settlement|2}} is done.", model: 'm' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await generateRoundupSummary(stories, { now })).toBeNull();
    expect(mockPromptLLM).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toContain("Doesn't name a day or date as today");
    warn.mockRestore();
  });

  test('no stories means no intro — the model is never asked to invent one', async () => {
    mockLoadLLMConfig.mockReturnValue({ provider: 'apple', apiKey: '' });
    expect(await generateRoundupSummary([], { now })).toBeNull();
    expect(mockRunAppleStructured).not.toHaveBeenCalled();
    expect(mockPromptLLM).not.toHaveBeenCalled();
  });

  test('Apple retry tells the model not to reuse headline wording', async () => {
    mockLoadLLMConfig.mockReturnValue({ provider: 'apple', apiKey: '' });
    // Every sentence copies its headline, so both attempts fail the checks.
    mockRunAppleStructured.mockImplementation(((_mode: string, _inst: string, prompt: string) => {
      const title = prompt.split('\n')[0].replace('Headline: ', '');
      return { sentence: `${title}.`, phrase: title.split(' ').slice(0, 3).join(' ') };
    }) as any);
    mockPromptLLM.mockResolvedValue({ text: 'Good evening! Let\u2019s dive in.', model: 'apple-on-device' });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await generateRoundupSummary(stories, { now })).toBeNull();
    const instructions = mockRunAppleStructured.mock.calls.map(c => c[1]);
    expect(instructions[0]).not.toContain('never reuse more than three words');
    expect(instructions[instructions.length - 1]).toContain('never reuse more than three words');
  });

  test('a failed first attempt is replaced by a passing retry', async () => {
    mockLoadLLMConfig.mockReturnValue({ provider: 'anthropic', apiKey: 'k', model: 'm' });
    mockPromptLLM
      .mockResolvedValueOnce({ text: 'Good evening! Let\u2019s dive in.', model: 'm' })
      .mockResolvedValueOnce({ text: 'A {{7.8 quake near Santiago|1}} has killed dozens.', model: 'm' });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await generateRoundupSummary(stories, { now });
    expect(r?.text).toBe('A {{7.8 quake near Santiago|1}} has killed dozens.');
    expect(mockPromptLLM).toHaveBeenCalledTimes(2);
  });

  test('Apple Intelligence writes the intro one story per request', async () => {
    mockLoadLLMConfig.mockReturnValue({ provider: 'apple', apiKey: '' });
    const answers: Record<string, { sentence: string; phrase: string }> = {
      Chile: { sentence: 'A powerful quake near Santiago has killed dozens of people.', phrase: 'quake near Santiago' },
      Judge: { sentence: 'Bayer will pay $7 billion to settle the cancer lawsuits.', phrase: 'Bayer will pay $7 billion to settle the cancer lawsuits' },
      BART: { sentence: 'BART stopped every train during the evening commute.', phrase: 'BART stopped every train' },
    };
    mockRunAppleStructured.mockImplementation(((_mode: string, _inst: string, prompt: string) =>
      answers[prompt.split('\n')[0].replace('Headline: ', '').split(/[ :]/)[0]]) as any);
    const r = await generateRoundupSummary(stories, { now });
    expect(mockPromptLLM).not.toHaveBeenCalled();
    expect(r?.provider).toBe('apple');
    expect(r?.text).toBe('A powerful {{quake near Santiago|1}} has killed dozens of people. Bayer will pay {{$7 billion|2}} to settle the cancer lawsuits.\n\n{{BART stopped every train|3}} during the evening commute.');
    expect(mockRunAppleStructured.mock.calls.map(c => c[0])).toEqual(['sentence', 'sentence', 'sentence']);
    expect(mockRunAppleStructured.mock.calls[0][1]).toContain('Tuesday, November 24, 2026 (evening)');
  });

  test('a story Apple refuses is skipped and the intro is written from the rest', async () => {
    mockLoadLLMConfig.mockReturnValue({ provider: 'apple', apiKey: '' });
    const four = [...stories, article({ title: 'Al Gore buys hometown Tennessee newspaper', domain: 'foxnews.com' })];
    mockRunAppleStructured.mockImplementation(((_mode: string, _inst: string, prompt: string) => {
      if (prompt.includes('Chile')) throw Object.assign(new Error('declined'), { kind: 'refusal' });
      if (prompt.includes('Judge')) return { sentence: 'Bayer will pay billions to end the Roundup cancer cases.', phrase: 'Roundup cancer cases' };
      if (prompt.includes('BART')) return { sentence: 'BART halted all trains in a systemwide power failure.', phrase: 'BART halted all trains' };
      return { sentence: 'Al Gore is buying the paper he grew up reading in Tennessee.', phrase: 'Al Gore is buying' };
    }) as any);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await generateRoundupSummary(four, { now });
    expect(r?.text).not.toContain('|1}}');
    expect(r?.text).toContain('{{Roundup cancer cases|2}}');
    expect(r?.text).toContain('{{Al Gore is buying|4}}');
    expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toContain('declined 1 story');
  });

  test('Apple falls back to the text prompt when the structured helper fails', async () => {
    mockLoadLLMConfig.mockReturnValue({ provider: 'apple', apiKey: '' });
    mockPromptLLM.mockResolvedValue({ text: 'A quake in "Chile earthquake: Dozens dead after 7.8 magnitude quake strikes near Santiago" leads.', model: 'apple-on-device' });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await generateRoundupSummary(stories, { now });
    expect(mockRunAppleStructured).toHaveBeenCalled();
    expect(mockPromptLLM).toHaveBeenCalledTimes(1);
    expect(r?.text).toContain('Chile earthquake'); // a quoted exact title is not "copying"
  });
});

describe('curateWithStories model grouper', () => {
  const cfg = { widerNews: false, regionalFeeds: [] };
  const score = () => 0;
  const items = [
    article({ title: 'Judge Approves $7 Billion Settlement Over Claims That Roundup Caused Cancer', url: 'https://www.nytimes.com/roundup', domain: 'nytimes.com', categories: ['Business'] }),
    article({ title: 'Weedkiller maker cleared to pay out billions to cancer claimants', url: 'https://www.theguardian.com/weedkiller', domain: 'theguardian.com', categories: ['Suits and Litigation (Civil)'] }),
    article({ title: 'BMW Recalls 286 i5 And i7 EVs Over Battery Fire Risk', url: 'https://electrek.co/bmw', domain: 'electrek.co', categories: ['Business'] }),
  ];

  test('merges and relabels with the model grouping', async () => {
    const out = await curateWithStories(items, cfg, score, undefined, undefined, { modelGrouper: () => ['1,2|Courts|', '3|Autos|'] });
    expect(out).toHaveLength(2);
    const roundup = out.find(a => a.domain === 'nytimes.com')!;
    expect(roundup.categories).toEqual(['Courts']);
    expect(roundup.story?.alsoIn.map(x => x.source)).toEqual(['theguardian.com']);
  });

  test('the model sees a shortlist ranked by score, and its ids map back to the right stories', async () => {
    const byScore = (a: ArticleMeta) => (a.domain === 'electrek.co' ? 10 : 0); // BMW ranks first in the shortlist
    let seen: string[] = [];
    const out = await curateWithStories(items, cfg, byScore, undefined, undefined, {
      modelGrouper: groups => { seen = groups.map(g => g.lead.domain); return ['2,3|Courts|', '1|Autos|']; },
    });
    expect(seen).toEqual(['electrek.co', 'nytimes.com', 'theguardian.com']);
    expect(out).toHaveLength(2);
    expect(out.find(a => a.domain === 'nytimes.com')!.categories).toEqual(['Courts']);
    expect(out.find(a => a.domain === 'electrek.co')!.categories).toEqual(['Autos']);
  });

  test('a failing grouper leaves word-matching groups in place', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await curateWithStories(items, cfg, score, undefined, undefined, { modelGrouper: () => { throw new Error('context window'); } });
    expect(out).toHaveLength(3);
  });
});

describe('generateRoundupSummary', () => {
  beforeEach(() => {
    mockLoadLLMConfig.mockReset();
    mockPromptLLM.mockReset();
    mockLoadLLMConfig.mockReturnValue(null);
  });

  test('returns null when no LLM is configured', async () => {
    mockLoadLLMConfig.mockReturnValue(null);
    const result = await generateRoundupSummary([article({ title: 'A' })]);
    expect(result).toBeNull();
    expect(mockPromptLLM).not.toHaveBeenCalled();
  });

  test('sends the roundup prompt as an instruction (not wrapped as article text to summarize)', async () => {
    mockLoadLLMConfig.mockReturnValue({ provider: 'openai', apiKey: 'k', model: 'gpt-5' });
    mockPromptLLM.mockResolvedValue({ text: 'Quantum chips finally ship, and the city has a new transit plan.', model: 'gpt-5' });

    const articles = [
      article({ title: 'Quantum chips ship', domain: 'chip.news' }),
      article({ title: 'New transit plan', domain: 'city.gov' }),
    ];
    const result = await generateRoundupSummary(articles);

    // Returns the text plus the model/provider that produced it, for AI disclosure.
    expect(result).toEqual({ text: 'Quantum chips finally ship, and the city has a new transit plan.', model: 'gpt-5', provider: 'openai' });
    // Must route through promptLLM, which sends the prompt verbatim — NOT summarizeText,
    // which would prepend "Summarize this article…" and yield a near-static blurb.
    expect(mockPromptLLM).toHaveBeenCalledTimes(1);
    const prompt = mockPromptLLM.mock.calls[0][0];
    // The actual article titles are present so the model can write a fresh rundown.
    expect(prompt).toContain('Quantum chips ship');
    expect(prompt).toContain('New transit plan');
    // The roundup instructions are present as instructions.
    expect(prompt).toContain('opening note for a daily reading rundown');
    // The prompt asks for real paragraph structure.
    expect(prompt).toContain('SHORT paragraphs');
    // The model is told the issue date so it doesn't take a date from a story as today's.
    expect(prompt).toContain(`This note goes out on ${issueDateLine()}`);
  });

  test('returns null when the model yields empty text', async () => {
    mockLoadLLMConfig.mockReturnValue({ provider: 'openai', apiKey: 'k', model: 'gpt-5' });
    mockPromptLLM.mockResolvedValue({ text: '   ', model: 'gpt-5' });
    const result = await generateRoundupSummary([article({ title: 'A' })]);
    expect(result).toBeNull();
  });

  test('returns null when the model call throws', async () => {
    mockLoadLLMConfig.mockReturnValue({ provider: 'openai', apiKey: 'k', model: 'gpt-5' });
    mockPromptLLM.mockRejectedValue(new Error('rate limited'));
    const result = await generateRoundupSummary([article({ title: 'A' })]);
    expect(result).toBeNull();
  });
});

describe('filterByLookback', () => {
  const iso = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  };

  test('keeps articles bookmarked within the window, drops older ones', () => {
    const articles = [
      article({ title: 'today', bookmarked: iso(0) }),
      article({ title: 'yesterday', bookmarked: iso(1) }),
      article({ title: 'last week', bookmarked: iso(7) }),
    ];
    const kept = filterByLookback(articles, 2).map(a => a.title);
    expect(kept).toContain('today');
    expect(kept).toContain('yesterday');
    expect(kept).not.toContain('last week');
  });

  test('drops articles with no bookmarked date', () => {
    const kept = filterByLookback([article({ title: 'undated' })], 30);
    expect(kept).toHaveLength(0);
  });
});

describe('buildRoundup', () => {
  beforeEach(() => {
    mockLoadLLMConfig.mockReset();
    mockPromptLLM.mockReset();
    mockLoadLLMConfig.mockReturnValue(null);
  });

  const cfg = (): EmailConfig => ({ ...baseConfig });

  test('renders article titles and the editorial note into the HTML, and discloses the model', async () => {
    mockLoadLLMConfig.mockReturnValue({ provider: 'openai', apiKey: 'k', model: 'gpt-5' });
    mockPromptLLM.mockResolvedValue({ text: 'Quantum chips finally ship this week, and the new transit plan is out.', model: 'gpt-5' });

    const articles = [
      article({ title: 'Quantum chips ship', bookmarked: new Date().toISOString() }),
      article({ title: 'New transit plan', bookmarked: new Date().toISOString() }),
    ];
    const result = await buildRoundup(cfg(), async () => articles);

    expect(result.summary).toBe('Quantum chips finally ship this week, and the new transit plan is out.');
    expect(result.summaryCredit).toBe('GPT');
    expect(result.articles).toHaveLength(2);
    expect(result.html).toContain('Quantum chips ship');
    expect(result.html).toContain('New transit plan');
    expect(result.html).toContain('finally ship this week, and the ');
    // The AI-written intro credits which AI produced it (brand only).
    expect(result.html).toContain('Summary by');
    expect(result.html).toContain('GPT');
    expect(result.subject).toContain('The Pull Read Rundown');
  });

  test('still renders (no note) when no LLM is configured', async () => {
    const articles = [article({ title: 'Solo story', bookmarked: new Date().toISOString() })];
    const result = await buildRoundup(cfg(), async () => articles);

    expect(result.summary).toBeNull();
    expect(result.summaryCredit).toBeNull();
    expect(result.html).toContain('Solo story');
    expect(result.html).not.toContain('Summary by');
    expect(mockPromptLLM).not.toHaveBeenCalled();
  });
});

describe('formatSummaryCredit', () => {
  test('credits a brand, not a specific model/version', () => {
    expect(formatSummaryCredit('anthropic', 'claude-haiku-4-5-20251001')).toBe('Claude');
    expect(formatSummaryCredit('anthropic', 'claude-opus-4-7')).toBe('Claude');
    expect(formatSummaryCredit('openai', 'gpt-5')).toBe('GPT');
    expect(formatSummaryCredit('openai', 'gpt-4.1-nano')).toBe('GPT');
    expect(formatSummaryCredit('gemini', 'gemini-2.5-flash-lite')).toBe('Gemini');
  });

  test('names Apple Intelligence (no on-device model detail)', () => {
    expect(formatSummaryCredit('apple', 'on-device')).toBe('Apple Intelligence');
    expect(formatSummaryCredit('apple', 'apple-on-device')).toBe('Apple Intelligence');
  });

  test('derives the brand from OpenRouter-routed model ids', () => {
    expect(formatSummaryCredit('openrouter', 'anthropic/claude-haiku-4.5')).toBe('Claude');
    expect(formatSummaryCredit('openrouter', 'google/gemini-2.5-flash')).toBe('Gemini');
    expect(formatSummaryCredit('openrouter', 'meta-llama/llama-3.3-70b-instruct:free')).toBe('Llama');
  });

  test('falls back to the provider brand when the model id is unrecognized', () => {
    expect(formatSummaryCredit('anthropic', '')).toBe('Claude');
    expect(formatSummaryCredit('openai', 'some-unknown-id')).toBe('GPT');
  });
});
