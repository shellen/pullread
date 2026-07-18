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
  frequency: 'daily' | 'twice' | 'weekly';
  sendTime: string;
  sendTime2: string;
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
  frequency: 'daily',
  sendTime: '08:00',
  sendTime2: '17:00',
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
<p>Your email is configured correctly! You'll receive The Pull Read Rundown at your scheduled time.</p>
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

// Deterministic per-key rotation derived from a daily seed, so sections that
// tie on strength (e.g. a quiet day where nothing scores) still reshuffle from
// one issue to the next instead of freezing into a fixed order.
function rotationKey(key: string, seed: string): number {
  let h = 2166136261;
  const s = `${seed}|${key}`;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

export interface GroupOptions {
  /** Per-article relevance score; when given, sections and stories are ranked by it. */
  score?: (a: ArticleMeta) => number;
  /** Daily seed for the tie-break rotation (keeps quiet days varying). */
  seed?: string;
}

/**
 * Group articles by their primary category. With a `score` function, sections
 * are ordered by their combined strength (strongest section leads, so the lead
 * changes with the news) and each section's strongest story sorts first (it
 * becomes the hero); "More" stays last and ties break on a daily rotation.
 * Without a score, falls back to the legacy alphabetical order.
 */
export function groupByCategory(articles: ArticleMeta[], opts: GroupOptions = {}): Map<string, ArticleMeta[]> {
  const groups = new Map<string, ArticleMeta[]>();
  for (const a of articles) {
    const cat = a.categories?.[0] || 'More';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(a);
  }

  const { score, seed = '' } = opts;

  if (score) {
    // Strongest story first within each section — it becomes the hero.
    for (const list of groups.values()) {
      list.sort((a, b) => score(b) - score(a));
    }
  }

  const strength = new Map<string, number>();
  if (score) {
    for (const [cat, list] of groups) {
      strength.set(cat, list.reduce((sum, a) => sum + score(a), 0));
    }
  }

  const sorted = new Map<string, ArticleMeta[]>();
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === 'More') return 1;
    if (b === 'More') return -1;
    if (score) {
      const diff = (strength.get(b) || 0) - (strength.get(a) || 0);
      if (Math.abs(diff) > 1e-9) return diff;
      return rotationKey(a, seed) - rotationKey(b, seed);
    }
    return a.localeCompare(b);
  });
  for (const k of keys) sorted.set(k, groups.get(k)!);
  return sorted;
}

function metaLine(article: ArticleMeta): string {
  const source = escapeHtml(article.domain || article.feed || '');
  const author = article.author ? ` <span style="color:#c9c1b9">&middot;</span> ${escapeHtml(article.author)}` : '';
  return `<div style="font-size:12px;color:#9a938c;margin-top:5px">${source}${author}</div>`;
}

// The whole headline is the link, straight to the source — no per-item CTA. On
// mobile the image stacks above the text (.hero-cell / .hero-img in the head).
function heroArticleHtml(article: ArticleMeta): string {
  const excerpt = truncateExcerpt(article.excerpt || '');
  const hasImage = article.image && article.image.startsWith('http');
  const link = escapeHtml(article.url);

  if (hasImage) {
    // Image + text side by side on desktop; stacked (image on top) on mobile.
    return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:22px"><tr>
<td class="hero-cell hero-img" width="140" valign="top" style="padding-right:18px;width:140px">
<a href="${link}" style="text-decoration:none"><img src="${escapeHtml(article.image!)}" width="140" height="96" alt="" style="object-fit:cover;display:block;width:140px;height:96px;border:0;border-radius:8px;background:#f0ebe7" /></a>
</td>
<td class="hero-cell" valign="top">
<a href="${link}" style="font-size:17px;color:#1a1a1a;text-decoration:none;font-weight:600;line-height:1.35">${escapeHtml(article.title)}</a>
${excerpt ? `<div style="font-size:13.5px;color:#6b6560;margin-top:6px;line-height:1.55">${escapeHtml(excerpt)}</div>` : ''}
${metaLine(article)}
</td>
</tr></table>`;
  }

  // No image — full-width text hero
  return `<div style="margin-bottom:22px">
<a href="${link}" style="font-size:17px;color:#1a1a1a;text-decoration:none;font-weight:600;line-height:1.35">${escapeHtml(article.title)}</a>
${excerpt ? `<div style="font-size:13.5px;color:#6b6560;margin-top:6px;line-height:1.55">${escapeHtml(excerpt)}</div>` : ''}
${metaLine(article)}
</div>`;
}

function compactArticleHtml(article: ArticleMeta): string {
  const excerpt = truncateExcerpt(article.excerpt || '');
  const link = escapeHtml(article.url);
  return `<div style="padding:16px 0;border-top:1px solid #f0ebe6">
<a href="${link}" style="font-size:15px;color:#1a1a1a;text-decoration:none;font-weight:600;line-height:1.4">${escapeHtml(article.title)}</a>
${excerpt ? `<div style="font-size:13px;color:#6b6560;margin-top:5px;line-height:1.5">${escapeHtml(excerpt)}</div>` : ''}
${metaLine(article)}
</div>`;
}

function categorySection(name: string, articles: ArticleMeta[]): string {
  const label = name.toUpperCase();
  let html = `<div style="margin:38px 0 20px">
<div style="font-size:11px;font-weight:700;color:#b45535;letter-spacing:0.12em;text-transform:uppercase;padding-bottom:10px;border-bottom:1px solid #ece7e2">${escapeHtml(label)}</div>
</div>`;

  // First article gets hero treatment
  html += heroArticleHtml(articles[0]);

  // Remaining articles are compact
  for (let i = 1; i < articles.length; i++) {
    html += compactArticleHtml(articles[i]);
  }
  return html;
}

/**
 * Render the AI editorial note. Splits into paragraphs (blank-line breaks, then
 * single newlines) so it reads like a reporter's briefing, and turns the model's
 * inline story references — written as `{{linked words|N}}` — into links to the
 * matching article (by 1-based index into `citationUrls`). Markers that point at
 * a missing story, or any stray/unbalanced braces, are stripped so nothing leaks.
 */
function renderSummaryParagraphs(summary: string, citationUrls: string[] = []): string {
  const linkify = (escaped: string): string =>
    escaped
      .replace(/\{\{([^{}|]+)\|(\d+)\}\}/g, (_m, phrase: string, n: string) => {
        const url = citationUrls[parseInt(n, 10) - 1];
        if (!url) return phrase; // out of range — keep the words, drop the marker
        return `<a href="${escapeHtml(url)}" style="color:#b45535;text-decoration:underline;text-underline-offset:2px">${phrase}</a>`;
      })
      .replace(/\{\{|\}\}/g, ''); // drop any leftover markers

  const byBlank = summary.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const paras = byBlank.length > 1
    ? byBlank
    : summary.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const finalParas = paras.length ? paras : [summary.trim()];
  return finalParas
    .map((p, i) => {
      const mb = i === finalParas.length - 1 ? '0' : '15px';
      return `<p style="margin:0 0 ${mb};font-size:16px;line-height:1.72;color:#33302d">${linkify(escapeHtml(p))}</p>`;
    })
    .join('\n');
}

export function buildRoundupHtml(
  articles: ArticleMeta[],
  lookbackDays: number,
  summary?: string | null,
  summaryCredit?: string | null,
  scoreFn?: ((a: ArticleMeta) => number) | null,
): string {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const period = lookbackDays === 1 ? 'today'
    : lookbackDays <= 3 ? `the last ${lookbackDays} days`
    : lookbackDays === 7 ? 'this week'
    : `the last ${lookbackDays} days`;
  const count = articles.length;

  let html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<style>:root{color-scheme:light only}body,table,td,div,p,a,span{color-scheme:light only}
@media only screen and (max-width:600px){.hero-cell{display:block !important;width:100% !important;padding-right:0 !important}.hero-img{padding-bottom:14px !important}.hero-img img{width:100% !important;height:180px !important;max-width:100% !important}}</style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f7f5f3;color:#1a1a1a;-webkit-font-smoothing:antialiased">
<div style="max-width:600px;margin:0 auto;padding:28px 20px 32px;background-color:#f7f5f3">

<div style="text-align:center;padding:8px 0 22px">
<a href="https://pullread.com" style="text-decoration:none"><img src="cid:header" width="300" height="55" alt="Pull Read — The Rundown" style="display:inline-block" /></a>
</div>

<div style="background:#ffffff;padding:40px;border:1px solid #ebe5df;border-radius:14px">

<div style="text-align:center;padding-bottom:24px;margin-bottom:30px;border-bottom:1px solid #ece7e2">
<div style="font-size:27px;font-weight:600;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.01em;margin-bottom:6px">The Rundown</div>
<div style="font-size:13px;color:#9a938c;letter-spacing:0.01em">${escapeHtml(today)} &middot; ${count} article${count === 1 ? '' : 's'} from ${period}</div>
</div>
`;

  if (summary) {
    // The note reads as a newsletter lede straight on the card — no bounding box.
    // Story references written as {{words|N}} link to the Nth article below.
    const citationUrls = articles.map(a => a.url);
    const credit = summaryCredit
      ? `\n<div style="margin-top:16px;font-size:12px;color:#a99f95;letter-spacing:0.01em">`
        + `<span style="color:#b45535">&#10022;</span> Summary by `
        + `<span style="color:#7d746b;font-weight:600">${escapeHtml(summaryCredit)}</span></div>`
      : '';
    html += `<div style="margin:0 0 6px">
${renderSummaryParagraphs(summary, citationUrls)}${credit}
</div>`;
  }

  if (articles.length === 0) {
    html += `<div style="text-align:center;padding:40px 0">
<div style="font-size:26px;margin-bottom:14px;color:#c9c1b9">&mdash;</div>
<div style="font-size:15px;color:#6b6560;line-height:1.5">Nothing new ${lookbackDays === 1 ? 'today' : 'recently'}. Enjoy the quiet.</div>
</div>`;
  } else {
    // Rank sections by the day's signal (seed = today's date) so the lead
    // section changes with the news instead of freezing alphabetically.
    const groups = groupByCategory(articles, scoreFn ? { score: scoreFn, seed: today } : {});
    for (const [cat, catArticles] of groups) {
      html += categorySection(cat, catArticles);
    }
  }

  html += `</div>

<div style="text-align:center;padding:24px 0 8px">
<div style="font-size:11px;color:#b3a99e;letter-spacing:0.02em">Sent by <a href="https://pullread.com" style="color:#b45535;text-decoration:none;font-weight:500">Pull Read</a></div>
</div>

</div>
</body>
</html>`;

  return html;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Brand-level credit for the AI that wrote the intro — e.g. "Claude", "Apple
 * Intelligence", "Gemini". We deliberately don't expose the exact model/version;
 * the family name is enough disclosure and reads cleaner in the byline.
 */
export function formatSummaryCredit(provider: string, model: string): string {
  const lower = (model || '').toLowerCase();

  if (provider === 'apple' || lower === 'on-device' || lower.includes('apple')) {
    return 'Apple Intelligence';
  }

  // Recognize the model family from its id — the reliable signal for
  // OpenRouter-routed models, which name the underlying vendor in the id.
  const family =
    lower.includes('claude') ? 'Claude'
    : lower.includes('gemini') ? 'Gemini'
    : lower.includes('gpt') || /(^|[^a-z])o\d/.test(lower) ? 'GPT'
    : lower.includes('llama') ? 'Llama'
    : lower.includes('deepseek') ? 'DeepSeek'
    : lower.includes('mistral') || lower.includes('mixtral') ? 'Mistral'
    : null;

  if (family) return family;

  switch (provider) {
    case 'anthropic': return 'Claude';
    case 'openai': return 'GPT';
    case 'gemini': return 'Gemini';
    default: return 'AI';
  }
}

async function validateArticleImages(articles: ArticleMeta[]): Promise<void> {
  const checks = articles.map(async (a) => {
    if (!a.image || !a.image.startsWith('http')) return;
    try {
      const resp = await fetch(a.image, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      const contentType = resp.headers.get('content-type') || '';
      if (!resp.ok || !contentType.startsWith('image/')) {
        a.image = '';
      }
    } catch {
      a.image = '';
    }
  });
  await Promise.all(checks);
}

const MAX_ROUNDUP_ARTICLES = 12;

export interface ScoreContext {
  /** Current time in ms, for recency scoring. */
  now: number;
  mentionCounts?: Map<string, number>;
  watchedEntities?: Set<string>;
}

/**
 * Freshness boost: a story bookmarked minutes ago outweighs one from yesterday.
 * Bounded to [0, 3] and decays to zero over ~24h so it nudges ordering without
 * swamping the relevance signals.
 */
function recencyBoost(bookmarked: string | undefined, now: number): number {
  if (!bookmarked) return 0;
  const t = Date.parse(bookmarked);
  if (Number.isNaN(t)) return 0;
  const hoursAgo = (now - t) / 3_600_000;
  if (hoursAgo <= 0) return 3;
  return Math.max(0, 3 - hoursAgo / 8);
}

/**
 * Relevance score for one article, combining freshness, content richness, and
 * research-graph / watched-entity signals. Used both to curate (which stories
 * make the cut) and to rank sections (which section leads the issue).
 */
export function scoreArticle(a: ArticleMeta, ctx: ScoreContext): number {
  let score = 0;
  // Freshness — the strongest lever for making each day's ordering feel different.
  score += recencyBoost(a.bookmarked, ctx.now);
  // Richer content (excerpt, image) reads better as a lead.
  if (a.excerpt) score += 1;
  if (a.image?.startsWith('http')) score += 1;
  // Watched/trending entities in the title.
  if (ctx.mentionCounts && ctx.watchedEntities) {
    const titleLower = a.title.toLowerCase();
    for (const entity of ctx.watchedEntities) {
      if (titleLower.includes(entity.toLowerCase())) score += 3;
    }
  }
  // Research-graph mentions.
  if (ctx.mentionCounts) {
    const titleWords = a.title.toLowerCase().split(/\s+/);
    for (const [entity, count] of ctx.mentionCounts) {
      if (titleWords.some(w => entity.toLowerCase().includes(w) && w.length > 3)) {
        score += Math.min(count, 5);
      }
    }
  }
  return score;
}

export function curateArticles(
  articles: ArticleMeta[],
  mentionCounts?: Map<string, number>,
  watchedEntities?: Set<string>,
  limit = MAX_ROUNDUP_ARTICLES,
): ArticleMeta[] {
  if (articles.length <= limit) return articles;

  const ctx: ScoreContext = { now: Date.now(), mentionCounts, watchedEntities };
  const scored = articles.map(a => ({ article: a, score: scoreArticle(a, ctx) }));

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

const ROUNDUP_SUMMARY_PROMPT = `You're writing the opening note for a daily reading rundown — the short briefing that sits at the very top of the newsletter. Write like a sharp, well-read reporter giving a curious friend the lay of the land: warm, direct, and genuinely interested, never breathless or salesy.

Structure:
- Write 2 to 3 SHORT paragraphs. Separate every paragraph with a blank line.
- Keep each paragraph to 1-2 sentences. Tight beats long.
- Open with the day's throughline — the theme or tension tying the stories together — not a roll call.

Voice:
- Synthesize; don't enumerate. Never march down the list tacking "and it's a reminder that…" onto each item. That pattern is the single worst thing you can do here.
- Be specific. Name the real stakes. "The AI debate is heating up" is flat — say what actually shifted and why it lands.
- Opinions welcome, clichés not.
- Don't name every article or count how many there are.

Linking (important):
- The stories below are numbered. When you reference a specific one, link the exact words that name it by wrapping them like {{these words|N}}, where N is that story's number — e.g. {{Brussels forcing Google to share search data|3}}.
- Link 2 to 4 stories across the whole note. Keep each linked phrase short (a noun phrase, not a full sentence), never link the same story twice, and never use a number that isn't in the list.

Never use: "dive in", "buckle up", "without further ado", "let's get started", "here's what caught my eye", "in today's rundown", "welcome to".

Today's stories (numbered for linking):
`;

/** The editorial intro plus the model that wrote it, for AI disclosure. */
export interface RoundupSummary {
  text: string;
  model: string;
  provider: string;
}

export async function generateRoundupSummary(articles: ArticleMeta[]): Promise<RoundupSummary | null> {
  const { promptLLM, loadLLMConfig } = await import('./summarizer');
  const config = loadLLMConfig();
  if (!config) return null;

  // Number the stories so the model can cite them inline as {{words|N}};
  // renderSummaryParagraphs maps N back to this same (curated) article order.
  const articleList = articles
    .slice(0, 15)
    .map((a, i) => {
      const excerpt = a.excerpt ? ` — ${a.excerpt.slice(0, 100)}` : '';
      return `${i + 1}. ${a.title} (${a.domain || a.feed || ''})${excerpt}`;
    })
    .join('\n');

  // Use promptLLM (not summarizeText): the roundup prompt IS the instruction.
  // summarizeText would prepend its own "Summarize this article…" wrapper, so the
  // model would summarize our instructions instead of following them — producing a
  // near-static blurb anchored on the example lines in ROUNDUP_SUMMARY_PROMPT.
  // A slightly higher token budget lets the model write 2-3 short paragraphs.
  const prompt = ROUNDUP_SUMMARY_PROMPT + articleList;
  try {
    const result = await promptLLM(prompt, config, 400);
    const text = result.text.trim();
    if (!text) return null;
    return { text, model: result.model, provider: config.provider };
  } catch (err) {
    console.warn('[email] Failed to generate roundup summary:', err instanceof Error ? err.message : err);
    return null;
  }
}

export interface RoundupResult {
  html: string;
  subject: string;
  summary: string | null;
  /** Brand-level credit for the AI that wrote the intro (e.g. "Claude"), if any. */
  summaryCredit: string | null;
  articles: ArticleMeta[];
}

/** Keep only articles bookmarked within the lookback window. */
export function filterByLookback(articles: ArticleMeta[], lookbackDays: number): ArticleMeta[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffStr = cutoff.toISOString();
  return articles.filter(a => a.bookmarked && a.bookmarked >= cutoffStr);
}

/**
 * Gather, curate, summarize, and render the roundup HTML — everything except the
 * actual email send. Shared by sendRoundup (which mails it) and the preview-rundown
 * CLI command (which writes it to a file). Provide `fetchArticles` to supply articles
 * directly; otherwise articles are pulled from a running viewer on `port` and filtered
 * to the lookback window.
 */
export async function buildRoundup(
  cfg: EmailConfig,
  fetchArticles?: () => Promise<ArticleMeta[]>,
  port = 7777,
): Promise<RoundupResult> {
  let articles: ArticleMeta[] = [];
  if (fetchArticles) {
    articles = await fetchArticles();
  } else {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/api/files`);
      const allArticles = (await resp.json()) as ArticleMeta[];
      articles = filterByLookback(allArticles, cfg.lookbackDays);
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

  // Validate article images — strip broken URLs to avoid broken image icons
  await validateArticleImages(curated);

  // Generate AI editorial summary (non-blocking — roundup renders even if this fails)
  const summaryResult = await generateRoundupSummary(curated);
  const summary = summaryResult?.text ?? null;
  const summaryCredit = summaryResult
    ? formatSummaryCredit(summaryResult.provider, summaryResult.model)
    : null;

  // Rank sections by the day's relevance/freshness so the lead changes daily.
  const scoreCtx: ScoreContext = { now: Date.now(), mentionCounts, watchedEntities };
  const scoreFn = (a: ArticleMeta) => scoreArticle(a, scoreCtx);
  const html = buildRoundupHtml(curated, cfg.lookbackDays, summary, summaryCredit, scoreFn);
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const subject = `The Pull Read Rundown — ${today}`;

  return { html, subject, summary, summaryCredit, articles: curated };
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

  const { html, subject, articles } = await buildRoundup(cfg, fetchArticles, port);

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

  return `Rundown sent with ${articles.length} article${articles.length === 1 ? '' : 's'}`;
}
