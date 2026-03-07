// ABOUTME: Email roundup module for sending daily digest emails
// ABOUTME: Uses nodemailer SMTP to deliver HTML roundups of recent articles

import { createTransport } from 'nodemailer';
import { join } from 'path';
import { homedir } from 'os';
import { readFileSync, writeFileSync, existsSync } from 'fs';

export interface EmailConfig {
  enabled: boolean;
  smtpProvider: 'gmail' | 'outlook' | 'custom';
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  useTls: boolean;
  fromAddress: string;
  toAddress: string;
  sendTime: string;
  lookbackDays: number;
}

const DEFAULT_CONFIG: EmailConfig = {
  enabled: false,
  smtpProvider: 'gmail',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  useTls: true,
  fromAddress: '',
  toAddress: '',
  sendTime: '08:00',
  lookbackDays: 1,
};

function settingsPath(): string {
  return join(homedir(), '.config', 'pullread', 'settings.json');
}

export function loadEmailConfig(): EmailConfig {
  const path = settingsPath();
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return { ...DEFAULT_CONFIG, ...(data.emailRoundup || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveEmailConfig(config: Partial<EmailConfig>): void {
  const path = settingsPath();
  let data: Record<string, unknown> = {};
  if (existsSync(path)) {
    try { data = JSON.parse(readFileSync(path, 'utf-8')); } catch { /* fresh */ }
  }
  data.emailRoundup = { ...(data.emailRoundup as object || {}), ...config };
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export const SMTP_PROVIDERS: Record<string, { host: string; port: number; useTls: boolean }> = {
  gmail: { host: 'smtp.gmail.com', port: 587, useTls: true },
  outlook: { host: 'smtp.office365.com', port: 587, useTls: true },
};

export function resolveSmtpConfig(config: EmailConfig): { host: string; port: number; useTls: boolean } {
  const preset = SMTP_PROVIDERS[config.smtpProvider];
  if (preset) return preset;
  return { host: config.smtpHost, port: config.smtpPort, useTls: config.useTls };
}

function createSmtpTransport(config: EmailConfig) {
  const smtp = resolveSmtpConfig(config);
  return createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.useTls && smtp.port === 465,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
    tls: smtp.useTls ? { rejectUnauthorized: false } : undefined,
  });
}

export async function sendTestEmail(config?: EmailConfig): Promise<string> {
  const cfg = config || loadEmailConfig();
  const smtp = resolveSmtpConfig(cfg);
  if (!smtp.host || !cfg.toAddress) {
    throw new Error('Email not configured: missing SMTP host or recipient');
  }

  const transport = createSmtpTransport(cfg);
  await transport.sendMail({
    from: cfg.fromAddress || cfg.smtpUser,
    to: cfg.toAddress,
    subject: 'Pull Read — Test Email',
    html: `<html><body style="font-family:sans-serif;padding:20px">
<h2>Pull Read Email Test</h2>
<p>Your email roundup is configured correctly! You'll receive daily roundups at your scheduled time.</p>
</body></html>`,
  });

  return 'Test email sent successfully';
}

interface ArticleMeta {
  filename: string;
  title: string;
  url: string;
  domain: string;
  author?: string;
  feed?: string;
  bookmarked?: string;
}

export function buildRoundupHtml(articles: ArticleMeta[], lookbackDays: number): string {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const period = lookbackDays === 1 ? 'today' : `the last ${lookbackDays} days`;
  const count = articles.length;

  let html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5">
<div style="max-width:600px;margin:0 auto;padding:20px">
<div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e0e0e0">
<h1 style="margin:0 0 4px;font-size:22px;color:#1a1a1a">Pull Read Roundup</h1>
<p style="margin:0 0 24px;font-size:14px;color:#888">${escapeHtml(today)} &middot; ${count} article${count === 1 ? '' : 's'} from ${period}</p>
`;

  if (articles.length === 0) {
    html += '<p style="color:#666;font-size:15px">No new articles synced. Check back later!</p>';
  } else {
    for (const article of articles) {
      const domain = article.domain || article.feed || '';
      const authorLine = article.author
        ? ` <span style="color:#888">&middot; ${escapeHtml(article.author)}</span>`
        : '';
      const prLink = `https://pullread.com/link?url=${encodeURIComponent(article.url)}&title=${encodeURIComponent(article.title)}`;

      html += `<div style="padding:12px 0;border-bottom:1px solid #f0f0f0">
<a href="${escapeHtml(article.url)}" style="font-size:15px;color:#1a1a1a;text-decoration:none;font-weight:500">${escapeHtml(article.title)}</a>
<div style="font-size:12px;margin-top:4px">
<a href="${escapeHtml(article.url)}" style="color:#888;text-decoration:none">${escapeHtml(domain)}</a>${authorLine}
<span style="float:right"><a href="${escapeHtml(prLink)}" style="color:#0066cc;text-decoration:none;font-size:11px">Read in PullRead &rarr;</a></span>
</div>
</div>
`;
    }
  }

  html += `</div>
<p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px">Sent by <a href="https://pullread.com" style="color:#aaa">PullRead</a></p>
</div>
</body>
</html>`;

  return html;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function sendRoundup(
  config?: EmailConfig,
  fetchArticles?: () => Promise<ArticleMeta[]>,
  port = 7777,
): Promise<string> {
  const cfg = config || loadEmailConfig();
  const smtp = resolveSmtpConfig(cfg);
  if (!smtp.host || !cfg.toAddress) {
    throw new Error('Email not configured: missing SMTP host or recipient');
  }

  let articles: ArticleMeta[] = [];
  if (fetchArticles) {
    articles = await fetchArticles();
  } else {
    // Fetch from local API
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/api/files`);
      const allArticles = (await resp.json()) as ArticleMeta[];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - cfg.lookbackDays);
      const cutoffStr = cutoff.toISOString();
      articles = allArticles.filter(a => a.bookmarked && a.bookmarked >= cutoffStr);
    } catch (err) {
      throw new Error(`Failed to fetch articles: ${err instanceof Error ? err.message : err}`);
    }
  }

  const html = buildRoundupHtml(articles, cfg.lookbackDays);
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const subject = `Pull Read Roundup — ${today}`;

  const transport = createSmtpTransport(cfg);
  await transport.sendMail({
    from: cfg.fromAddress || cfg.smtpUser,
    to: cfg.toAddress,
    subject,
    html,
  });

  return `Roundup sent with ${articles.length} article${articles.length === 1 ? '' : 's'}`;
}
