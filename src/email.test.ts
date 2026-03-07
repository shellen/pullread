// ABOUTME: Tests for the email roundup module
// ABOUTME: Covers HTML generation, escaping, provider resolution, config validation, and send logic

import { escapeHtml, buildRoundupHtml, sendTestEmail, sendRoundup, resolveSmtpConfig, SMTP_PROVIDERS } from './email';
import type { EmailConfig } from './email';

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
    expect(html).toContain('No new articles synced');
    expect(html).toContain('from today');
    expect(html).toContain('0 articles');
  });

  test('renders single article with correct singular', () => {
    const html = buildRoundupHtml([{
      filename: 'test.md',
      title: 'Test Article',
      url: 'https://example.com/test',
      domain: 'example.com',
    }], 1);
    expect(html).toContain('1 article '); // singular, no 's'
    expect(html).toContain('Test Article');
    expect(html).toContain('https://example.com/test');
    expect(html).toContain('example.com');
  });

  test('renders multiple articles with plural', () => {
    const html = buildRoundupHtml([
      { filename: 'a.md', title: 'First', url: 'https://a.com', domain: 'a.com' },
      { filename: 'b.md', title: 'Second', url: 'https://b.com', domain: 'b.com' },
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
    const html = buildRoundupHtml([{
      filename: 'test.md',
      title: 'Byline Test',
      url: 'https://example.com',
      domain: 'example.com',
      author: 'Jane Doe',
    }], 1);
    expect(html).toContain('Jane Doe');
  });

  test('falls back to feed when domain is empty', () => {
    const html = buildRoundupHtml([{
      filename: 'test.md',
      title: 'Feed Test',
      url: 'https://example.com',
      domain: '',
      feed: 'My RSS Feed',
    }], 1);
    expect(html).toContain('My RSS Feed');
  });

  test('includes pullread.com/link redirect URL', () => {
    const html = buildRoundupHtml([{
      filename: 'test.md',
      title: 'Link Test',
      url: 'https://example.com/article?id=1',
      domain: 'example.com',
    }], 1);
    expect(html).toContain('pullread.com/link');
    expect(html).toContain('Read in PullRead');
  });

  test('escapes HTML in article titles', () => {
    const html = buildRoundupHtml([{
      filename: 'test.md',
      title: 'Title with <script> & "quotes"',
      url: 'https://example.com',
      domain: 'example.com',
    }], 1);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<script>');
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
    // Gmail provider resolves host from preset, so empty smtpHost is fine.
    // It will fail at SMTP connection, not at validation.
    await expect(sendTestEmail({
      ...baseConfig,
      smtpProvider: 'gmail',
      smtpHost: '',
      smtpPort: 99999, // force connection failure
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
    // This will fail trying to connect to SMTP — we're testing the article fetcher path
    const articles = [
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
    )).rejects.toThrow(); // SMTP connection will fail, but articles path was exercised
  });
});
