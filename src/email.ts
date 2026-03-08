// ABOUTME: Email roundup module for sending daily digest emails
// ABOUTME: Uses nodemailer SMTP to deliver HTML roundups of recent articles

import { createTransport } from 'nodemailer';
import { join } from 'path';
import { homedir } from 'os';
import { readFileSync, existsSync } from 'fs';

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

export interface ArticleMeta {
  filename: string;
  title: string;
  url: string;
  domain: string;
  author?: string;
  feed?: string;
  bookmarked?: string;
  excerpt?: string;
  image?: string;
  categories?: string[];
}

function truncateExcerpt(text: string, max = 120): string {
  if (!text || text.length <= max) return text || '';
  return text.slice(0, max).replace(/\s+\S*$/, '') + '\u2026';
}

function groupByCategory(articles: ArticleMeta[]): Map<string, ArticleMeta[]> {
  const groups = new Map<string, ArticleMeta[]>();
  for (const a of articles) {
    const cat = a.categories?.[0] || 'More';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(a);
  }
  // Sort: named categories alphabetically, "More" last
  const sorted = new Map<string, ArticleMeta[]>();
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === 'More') return 1;
    if (b === 'More') return -1;
    return a.localeCompare(b);
  });
  for (const k of keys) sorted.set(k, groups.get(k)!);
  return sorted;
}

function articleLinks(article: ArticleMeta): string {
  const prLink = `https://pullread.com/link?url=${encodeURIComponent(article.url)}&title=${encodeURIComponent(article.title)}`;
  return `<a href="${escapeHtml(prLink)}" style="color:#b45535;text-decoration:none;font-size:12px;font-weight:500">Open in Pull Read</a>`
    + `<span style="color:#ccc;margin:0 6px">&middot;</span>`
    + `<a href="${escapeHtml(article.url)}" style="color:#888;text-decoration:none;font-size:12px">Read &rarr;</a>`;
}

function metaLine(article: ArticleMeta): string {
  const source = escapeHtml(article.domain || article.feed || '');
  const author = article.author ? ` <span style="color:#999">&middot;</span> ${escapeHtml(article.author)}` : '';
  return `<div style="font-size:12px;color:#999;margin-top:2px">${source}${author}</div>`;
}

function heroArticleHtml(article: ArticleMeta): string {
  const excerpt = truncateExcerpt(article.excerpt || '');
  const hasImage = article.image && article.image.startsWith('http');

  if (hasImage) {
    // Image + text side by side using table layout (email-safe)
    return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:16px"><tr>
<td width="130" valign="top" style="padding-right:16px">
<a href="${escapeHtml(article.url)}" style="text-decoration:none"><img src="${escapeHtml(article.image!)}" width="130" height="90" alt="" style="border-radius:8px;object-fit:cover;display:block;width:130px;height:90px;background:#f0ebe7" /></a>
</td>
<td valign="top">
<a href="${escapeHtml(article.url)}" style="font-size:16px;color:#1a1a1a;text-decoration:none;font-weight:600;line-height:1.3">${escapeHtml(article.title)}</a>
${excerpt ? `<div style="font-size:13px;color:#666;margin-top:4px;line-height:1.4">${escapeHtml(excerpt)}</div>` : ''}
${metaLine(article)}
<div style="margin-top:6px">${articleLinks(article)}</div>
</td>
</tr></table>`;
  }

  // No image — full-width text hero
  return `<div style="margin-bottom:16px">
<a href="${escapeHtml(article.url)}" style="font-size:16px;color:#1a1a1a;text-decoration:none;font-weight:600;line-height:1.3">${escapeHtml(article.title)}</a>
${excerpt ? `<div style="font-size:13px;color:#666;margin-top:4px;line-height:1.4">${escapeHtml(excerpt)}</div>` : ''}
${metaLine(article)}
<div style="margin-top:6px">${articleLinks(article)}</div>
</div>`;
}

function compactArticleHtml(article: ArticleMeta): string {
  const excerpt = truncateExcerpt(article.excerpt || '');
  return `<div style="padding:10px 0;border-top:1px solid #f0ebe7">
<a href="${escapeHtml(article.url)}" style="font-size:15px;color:#1a1a1a;text-decoration:none;font-weight:500;line-height:1.3">${escapeHtml(article.title)}</a>
${excerpt ? `<div style="font-size:13px;color:#666;margin-top:3px;line-height:1.4">${escapeHtml(excerpt)}</div>` : ''}
${metaLine(article)}
<div style="margin-top:4px">${articleLinks(article)}</div>
</div>`;
}

function categorySection(name: string, articles: ArticleMeta[]): string {
  const label = name.toUpperCase();
  let html = `<div style="margin-top:28px;margin-bottom:12px">
<div style="font-size:11px;font-weight:700;color:#b45535;letter-spacing:0.08em;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #b45535">${escapeHtml(label)}</div>
</div>`;

  // First article gets hero treatment
  html += heroArticleHtml(articles[0]);

  // Remaining articles are compact
  for (let i = 1; i < articles.length; i++) {
    html += compactArticleHtml(articles[i]);
  }
  return html;
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
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f7f5f3">
<div style="max-width:600px;margin:0 auto;padding:20px">

<div style="text-align:center;padding:24px 0 16px">
<a href="https://pullread.com" style="text-decoration:none"><img src="https://pullread.com/email-header.png" width="220" height="44" alt="Pull Read" style="display:inline-block" /></a>
</div>

<div style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e8e3de">

<div style="text-align:center;margin-bottom:24px">
<div style="font-size:20px;font-weight:600;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;margin-bottom:4px">Your Roundup</div>
<div style="font-size:13px;color:#999">${escapeHtml(today)} &middot; ${count} article${count === 1 ? '' : 's'} from ${period}</div>
</div>
`;

  if (articles.length === 0) {
    html += `<div style="text-align:center;padding:32px 0">
<div style="font-size:24px;margin-bottom:12px">&mdash;</div>
<div style="font-size:15px;color:#666;line-height:1.5">Nothing new ${lookbackDays === 1 ? 'today' : 'recently'}. Enjoy the quiet.</div>
</div>`;
  } else {
    const groups = groupByCategory(articles);
    for (const [cat, catArticles] of groups) {
      html += categorySection(cat, catArticles);
    }
  }

  html += `</div>

<div style="text-align:center;padding:20px 0 8px">
<div style="font-size:11px;color:#b3a99e">Sent by <a href="https://pullread.com" style="color:#b3a99e;text-decoration:none">Pull Read</a></div>
</div>

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
