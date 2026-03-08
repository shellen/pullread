// ABOUTME: Tests for the email roundup module
// ABOUTME: Covers HTML generation, escaping, provider resolution, category grouping, and send logic

import { escapeHtml, buildRoundupHtml, sendTestEmail, sendRoundup, resolveSmtpConfig, SMTP_PROVIDERS } from './email';
import type { EmailConfig, ArticleMeta } from './email';

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
  sendTime: '08:00',
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
    expect(html).toContain('the last 7 days');
  });

  test('shows author when present', () => {
    const html = buildRoundupHtml([article({ author: 'Jane Doe' })], 1);
    expect(html).toContain('Jane Doe');
  });

  test('falls back to feed when domain is empty', () => {
    const html = buildRoundupHtml([article({ domain: '', feed: 'My RSS Feed' })], 1);
    expect(html).toContain('My RSS Feed');
  });

  test('includes both PullRead and direct links', () => {
    const html = buildRoundupHtml([article({ url: 'https://example.com/article?id=1' })], 1);
    expect(html).toContain('pullread.com/link');
    expect(html).toContain('Open in Pull Read');
    expect(html).toContain('Read &rarr;');
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
    expect(html).toContain('width="130"');
  });

  test('renders hero without image gracefully', () => {
    const html = buildRoundupHtml([article({
      image: '',
      excerpt: 'No image here.',
    })], 1);
    expect(html).toContain('No image here.');
    // Should not contain an article thumbnail (header image is fine)
    expect(html).not.toContain('width="130"');
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

  test('includes rendered header image', () => {
    const html = buildRoundupHtml([], 1);
    expect(html).toContain('email-header.png');
    expect(html).toContain('Pull Read');
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
  });
});
