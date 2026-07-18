// ABOUTME: Tests for the email roundup module
// ABOUTME: Covers HTML generation, escaping, provider resolution, curation, summary, and send logic

import { escapeHtml, buildRoundupHtml, sendTestEmail, sendRoundup, resolveSmtpConfig, SMTP_PROVIDERS, curateArticles, generateRoundupSummary, buildRoundup, filterByLookback, formatSummaryCredit } from './email';
import type { EmailConfig, ArticleMeta } from './email';

jest.mock('./summarizer', () => ({
  // Default: no LLM configured, so generateRoundupSummary short-circuits to null.
  // Individual tests override these mocks as needed.
  loadLLMConfig: jest.fn(() => null),
  promptLLM: jest.fn(),
  summarizeText: jest.fn(),
}));
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
};

function article(overrides: Partial<ArticleMeta> = {}): ArticleMeta {
  return {
    filename: 'test.md',
    title: 'Test Article',
    url: 'https://example.com/test',
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
    await expect(sendTestEmail({
      ...baseConfig,
      smtpProvider: 'gmail',
      smtpHost: '',
      smtpPort: 99999,
    })).rejects.not.toThrow('missing SMTP host or recipient');
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
    mockPromptLLM.mockResolvedValue({ text: 'A fresh, article-aware blurb.', model: 'gpt-5' });

    const articles = [
      article({ title: 'Quantum chips ship', domain: 'chip.news' }),
      article({ title: 'New transit plan', domain: 'city.gov' }),
    ];
    const result = await generateRoundupSummary(articles);

    // Returns the text plus the model/provider that produced it, for AI disclosure.
    expect(result).toEqual({ text: 'A fresh, article-aware blurb.', model: 'gpt-5', provider: 'openai' });
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
    mockPromptLLM.mockResolvedValue({ text: 'A fresh editorial note.', model: 'gpt-5' });

    const articles = [
      article({ title: 'Quantum chips ship', bookmarked: new Date().toISOString() }),
      article({ title: 'New transit plan', bookmarked: new Date().toISOString() }),
    ];
    const result = await buildRoundup(cfg(), async () => articles);

    expect(result.summary).toBe('A fresh editorial note.');
    expect(result.summaryCredit).toBe('GPT');
    expect(result.articles).toHaveLength(2);
    expect(result.html).toContain('Quantum chips ship');
    expect(result.html).toContain('New transit plan');
    expect(result.html).toContain('A fresh editorial note.');
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
