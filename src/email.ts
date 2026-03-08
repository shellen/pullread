// ABOUTME: Email roundup module for sending daily digest emails
// ABOUTME: Uses nodemailer SMTP with AI curation and editorial summaries

import { createTransport } from 'nodemailer';
import { join } from 'path';
import { homedir } from 'os';
import { readFileSync, existsSync } from 'fs';

const HEADER_IMAGE_PATH = join(__dirname, '..', 'email-header.png');

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

export function buildRoundupHtml(articles: ArticleMeta[], lookbackDays: number, summary?: string | null): string {
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
<a href="https://pullread.com" style="text-decoration:none"><img src="cid:header" width="220" height="40" alt="Pull Read" style="display:inline-block" /></a>
</div>

<div style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e8e3de">

<div style="text-align:center;margin-bottom:24px">
<div style="font-size:20px;font-weight:600;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;margin-bottom:4px">Your Roundup</div>
<div style="font-size:13px;color:#999">${escapeHtml(today)} &middot; ${count} article${count === 1 ? '' : 's'} from ${period}</div>
</div>
`;

  if (summary) {
    html += `<div style="font-size:15px;color:#444;line-height:1.6;padding:16px 20px;background:#faf8f6;border-radius:8px;border-left:3px solid #b45535;margin-bottom:24px;font-style:italic">${escapeHtml(summary)}</div>`;
  }

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

const MAX_ROUNDUP_ARTICLES = 12;

export function curateArticles(
  articles: ArticleMeta[],
  mentionCounts?: Map<string, number>,
  watchedEntities?: Set<string>,
  limit = MAX_ROUNDUP_ARTICLES,
): ArticleMeta[] {
  if (articles.length <= limit) return articles;

  // Score each article based on signals
  const scored = articles.map(a => {
    let score = 0;
    // Boost articles with excerpts (richer content)
    if (a.excerpt) score += 1;
    // Boost articles with images (visual interest)
    if (a.image?.startsWith('http')) score += 1;
    // Boost articles that mention watched/trending entities
    if (mentionCounts && watchedEntities) {
      const titleLower = a.title.toLowerCase();
      for (const entity of watchedEntities) {
        if (titleLower.includes(entity.toLowerCase())) score += 3;
      }
    }
    // Boost articles with research graph mentions
    if (mentionCounts) {
      const titleWords = a.title.toLowerCase().split(/\s+/);
      for (const [entity, count] of mentionCounts) {
        if (titleWords.some(w => entity.toLowerCase().includes(w) && w.length > 3)) {
          score += Math.min(count, 5);
        }
      }
    }
    return { article: a, score };
  });

  // Sort by score descending, then ensure category diversity
  scored.sort((a, b) => b.score - a.score);

  const picked: ArticleMeta[] = [];
  const catCounts = new Map<string, number>();
  const maxPerCategory = Math.ceil(limit / 3);

  for (const { article } of scored) {
    if (picked.length >= limit) break;
    const cat = article.categories?.[0] || 'More';
    const catCount = catCounts.get(cat) || 0;
    // Only enforce diversity cap when there are multiple categories
    const uniqueCats = new Set(scored.map(s => s.article.categories?.[0] || 'More'));
    if (uniqueCats.size > 1 && catCount >= maxPerCategory && picked.length > limit / 2) continue;
    picked.push(article);
    catCounts.set(cat, catCount + 1);
  }

  return picked;
}

const ROUNDUP_SUMMARY_PROMPT = `You are writing the editorial intro for a daily reading roundup email. Based on the article titles and excerpts below, write 2-3 sentences that highlight the most interesting themes and stories. Be conversational and engaging — like a smart friend telling you what's worth reading today. Do not list articles individually. Do not use phrases like "today's roundup features" or "here are the highlights". Just dive into what's interesting.

Articles:
`;

export async function generateRoundupSummary(articles: ArticleMeta[]): Promise<string | null> {
  try {
    const { summarizeText, loadLLMConfig } = await import('./summarizer');
    const config = loadLLMConfig();
    if (!config) return null;

    const articleList = articles
      .slice(0, 15)
      .map(a => {
        const excerpt = a.excerpt ? ` — ${a.excerpt.slice(0, 100)}` : '';
        return `- ${a.title} (${a.domain || a.feed || ''})${excerpt}`;
      })
      .join('\n');

    const prompt = ROUNDUP_SUMMARY_PROMPT + articleList;
    const result = await summarizeText(prompt, config);
    return result.summary;
  } catch {
    return null;
  }
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

  // Curate using research graph if available
  let mentionCounts: Map<string, number> | undefined;
  let watchedEntities: Set<string> | undefined;
  try {
    const { getResearchPDS, listWatches } = await import('./research');
    const pds = getResearchPDS();
    const mentions = pds.listRecords('app.pullread.mention');
    mentionCounts = new Map();
    for (const m of mentions) {
      const name = m.value.entityName as string;
      mentionCounts.set(name, (mentionCounts.get(name) || 0) + 1);
    }
    const watches = listWatches(pds);
    watchedEntities = new Set(watches.map(w => w.value.query as string));
  } catch {
    // Research module not available — curate without it
  }

  const curated = curateArticles(articles, mentionCounts, watchedEntities);

  // Generate AI editorial summary (non-blocking — email sends even if this fails)
  const summary = await generateRoundupSummary(curated);

  const html = buildRoundupHtml(curated, cfg.lookbackDays, summary);
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const subject = `Pull Read Roundup — ${today}`;

  const transport = createSmtpTransport(cfg);
  const mailOptions: Record<string, unknown> = {
    from: cfg.fromAddress || cfg.smtpUser,
    to: cfg.toAddress,
    subject,
    html,
  };

  if (existsSync(HEADER_IMAGE_PATH)) {
    mailOptions.attachments = [{
      filename: 'email-header.png',
      path: HEADER_IMAGE_PATH,
      cid: 'header',
    }];
  }

  await transport.sendMail(mailOptions);

  return `Roundup sent with ${curated.length} article${curated.length === 1 ? '' : 's'}`;
}
