// ABOUTME: Email roundup module for sending daily digest emails
// ABOUTME: Uses nodemailer SMTP with AI curation and editorial summaries

import { createTransport } from 'nodemailer';
import { join } from 'path';
import { homedir } from 'os';
import { readFileSync, existsSync } from 'fs';
import { PANEL_CATALOG, panelFor, groupStories, withOtherCopies, alsoInFor, biggestPanelStories, weighStories, findConsensus, pickTopStories, fetchPanelHeadlines } from './stories';
import type { PanelSource, Scope } from './stories';
import {
  applyModelGroups, checkIntro, blockingFailures, structuredIntroToMarkers,
  appleSentenceInstructions, buildPerStoryIntro, mentionsToIntro,
} from './rundown-ai';
import type { StoryGroup } from './stories';

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
  /** Read a balanced panel of broad news outlets so major stories surface even outside your feeds. */
  widerNews: boolean;
  /** Local outlets for the "Near you" check, e.g. [{ name: 'KQED', feedUrl: '…' }]. Two or more must agree. */
  regionalFeeds: Array<{ name: string; feedUrl: string }>;
  /** Lead with Today's one read: the day's best match for your highlights, notes, favorites and watches. */
  oneRead: boolean;
  /** Wider-news outlets the reader turned on (catalog names), or null for the defaults. */
  panelEnabled: string[] | null;
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
  widerNews: true,
  regionalFeeds: [],
  oneRead: true,
  panelEnabled: null,
};

/** Rundown content settings the Settings page edits (the rest of EmailConfig is delivery). */
export interface RundownContentSettings {
  oneRead?: boolean;
  widerNews?: boolean;
  regionalFeeds?: Array<{ name: string; feedUrl: string }>;
  /** Catalog outlet names, or null to go back to the defaults. */
  panelEnabled?: string[] | null;
}

const MAX_REGIONAL_FEEDS = 10;

/**
 * Validate the content settings from a Settings-page POST. Only fields that
 * are present and valid are returned, so a partial update never clobbers the
 * rest. Regional feeds must be http(s) URLs; a missing name becomes the host.
 */
export function sanitizeRundownContentSettings(body: unknown): RundownContentSettings {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const out: RundownContentSettings = {};
  if (typeof b.oneRead === 'boolean') out.oneRead = b.oneRead;
  if (typeof b.widerNews === 'boolean') out.widerNews = b.widerNews;
  if (b.panelEnabled === null) out.panelEnabled = null;
  else if (Array.isArray(b.panelEnabled)) {
    const known = new Set(PANEL_CATALOG.map(p => p.name));
    out.panelEnabled = [...new Set(b.panelEnabled.filter((n): n is string => typeof n === 'string' && known.has(n)))];
  }
  if (Array.isArray(b.regionalFeeds)) {
    const seen = new Set<string>();
    out.regionalFeeds = [];
    for (const f of b.regionalFeeds) {
      const raw = f && typeof f === 'object' ? (f as Record<string, unknown>) : {};
      const feedUrl = typeof raw.feedUrl === 'string' ? raw.feedUrl.trim() : '';
      let parsed: URL;
      try { parsed = new URL(feedUrl); } catch { continue; }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      const name = (typeof raw.name === 'string' ? raw.name.trim() : '').slice(0, 60) || parsed.hostname.replace(/^www\./, '');
      out.regionalFeeds.push({ name, feedUrl: parsed.href });
      if (out.regionalFeeds.length >= MAX_REGIONAL_FEEDS) break;
    }
  }
  return out;
}

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
  summary?: string;
  image?: string;
  categories?: string[];
  /** Set on stories in the Top stories block: who else ran it, and whether the wider news did. */
  story?: StoryCoverage;
}

export interface StoryCoverage {
  /** In the Top stories block (vs. a multi-source story shown in its section). */
  top: boolean;
  alsoIn: Array<{ source: string; url: string }>;
  wider?: { sources: string[]; scope: Scope };
  beyondFeeds: boolean;
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
  // Articles saved before the feed parser fix can carry a stringified object.
  const authorText = article.author && !/\[object \w+\]/.test(article.author) ? article.author : '';
  const author = authorText ? ` <span style="color:#c9c1b9">&middot;</span> ${escapeHtml(authorText)}` : '';
  return `<div style="font-size:12px;color:#9a938c;margin-top:5px">${source}${author}</div>`;
}

/**
 * "Also in pitchfork.com, stereogum.com" / "Widely covered · BBC News, Fox News, NPR +3"
 * under a top story, so the reader can see why it's at the top.
 */
function coverageLine(article: ArticleMeta): string {
  const s = article.story;
  if (!s) return '';
  const parts: string[] = [];
  if (s.beyondFeeds) {
    const label = s.wider?.scope === 'regional' ? 'Near you' : 'Beyond your feeds';
    parts.push(`<span style="color:#b45535;font-weight:600">${label}</span>`);
  }
  if (s.alsoIn.length) {
    const links = s.alsoIn.slice(0, 3).map(o =>
      `<a href="${escapeHtml(o.url)}" style="color:#7d746b;text-decoration:underline;text-underline-offset:2px">${escapeHtml(o.source)}</a>`);
    const more = s.alsoIn.length > 3 ? ` +${s.alsoIn.length - 3}` : '';
    parts.push(`Also in ${links.join(', ')}${more}`);
  }
  if (s.wider) {
    const names = s.wider.sources.slice(0, 3).map(escapeHtml).join(', ');
    const more = s.wider.sources.length > 3 ? ` +${s.wider.sources.length - 3}` : '';
    parts.push(s.beyondFeeds ? `Covered by ${names}${more}` : `Widely covered: ${names}${more}`);
  }
  return `<div style="font-size:12px;color:#9a938c;margin-top:4px;line-height:1.5">${parts.join(' &middot; ')}</div>`;
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
${metaLine(article)}${coverageLine(article)}
</td>
</tr></table>`;
  }

  // No image — full-width text hero
  return `<div style="margin-bottom:22px">
<a href="${link}" style="font-size:17px;color:#1a1a1a;text-decoration:none;font-weight:600;line-height:1.35">${escapeHtml(article.title)}</a>
${excerpt ? `<div style="font-size:13.5px;color:#6b6560;margin-top:6px;line-height:1.55">${escapeHtml(excerpt)}</div>` : ''}
${metaLine(article)}${coverageLine(article)}
</div>`;
}

function compactArticleHtml(article: ArticleMeta): string {
  const excerpt = truncateExcerpt(article.excerpt || '');
  const link = escapeHtml(article.url);
  return `<div style="padding:16px 0;border-top:1px solid #f0ebe6">
<a href="${link}" style="font-size:15px;color:#1a1a1a;text-decoration:none;font-weight:600;line-height:1.4">${escapeHtml(article.title)}</a>
${excerpt ? `<div style="font-size:13px;color:#6b6560;margin-top:5px;line-height:1.5">${escapeHtml(excerpt)}</div>` : ''}
${metaLine(article)}${coverageLine(article)}
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

const SUMMARY_LINK_STYLE = 'color:#b45535;text-decoration:underline;text-underline-offset:2px';

/** Case/quote/whitespace-insensitive form for comparing a mention to a title. */
function normalizeForTitleMatch(s: string): string {
  return s.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ').trim().replace(/[.,;:!?]+$/, '');
}

/** The distinctive part of a title — before any " | Show Name" / " (Full Episode)" suffix. */
function titleCore(title: string): string {
  return title.split(' | ')[0].split(' (')[0].trim();
}

/**
 * Does a quoted span from the model's prose name this title? Exact match, the
 * title's core, or a shortened form covering at least half the title all count;
 * short generic fragments (a show name shared by many titles) do not.
 */
function quotedSpanNamesTitle(spanNorm: string, escapedTitle: string, escapedCore: string): boolean {
  const t = normalizeForTitleMatch(escapedTitle);
  if (!spanNorm || !t) return false;
  if (spanNorm === t || spanNorm.includes(t)) return true;
  if (spanNorm === normalizeForTitleMatch(escapedCore)) return true;
  return t.includes(spanNorm) && spanNorm.length >= t.length / 2;
}

/** Normalize one whitespace-delimited token from escaped HTML for word matching. */
function normalizeToken(raw: string): string {
  return raw.toLowerCase()
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/^[^a-z0-9&]+/, '').replace(/[^a-z0-9&]+$/, '');
}

/**
 * Find a run of words in `segment` (escaped HTML, no anchors) matching the
 * beginning of the title core — how prose naturally shortens a long title
 * ("Nordstrom Anniversary Sale 2026" for "Nordstrom Anniversary Sale 2026 –
 * Picks for Men | Dapper"). Returns the [start, end) span to link, or null.
 * Requires at least 3 matched words and 14 matched characters (or the whole
 * core) so common short phrases never false-match.
 */
function findTitleCoreRun(segment: string, core: string): { start: number; end: number } | null {
  const coreWords = core.split(/\s+/).map(normalizeToken).filter(Boolean);
  if (coreWords.length === 0) return null;

  const tokens: Array<{ norm: string; start: number; end: number }> = [];
  const tokenRe = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(segment)) !== null) {
    tokens.push({ norm: normalizeToken(m[0]), start: m.index, end: m.index + m[0].length });
  }

  const stopwords = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'and', '&', 'or', 'for', 'with', 'by', 'is', 'are', 'was', 'vs', '-', '–', '—']);
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i].norm || tokens[i].norm !== coreWords[0]) continue;
    let len = 1;
    while (len < coreWords.length && i + len < tokens.length && tokens[i + len].norm === coreWords[len]) len++;
    // A partial match must not end on a stopword — "Jake Johnson, the beloved
    // actor" matching title "Jake Johnson - The Dink" through "the" reads broken.
    while (len > 0 && len < coreWords.length && stopwords.has(coreWords[len - 1])) len--;
    if (len === 0) continue;
    const last = tokens[i + len - 1];
    const matchedChars = last.end - tokens[i].start;
    if (len === coreWords.length || (len >= 3 && matchedChars >= 14)) {
      // Trim trailing punctuation off the final token so it stays outside the link.
      const rawRun = segment.slice(tokens[i].start, last.end);
      const trimmed = rawRun.replace(/(?:&(?:quot|amp|#39);|[^A-Za-z0-9)])+$/, '');
      return { start: tokens[i].start, end: tokens[i].start + (trimmed.length || rawRun.length) };
    }
  }
  return null;
}

/**
 * Wrap the first plain-text occurrence of `escapedTitle` (already HTML-escaped,
 * matched case-insensitively outside existing <a> tags) in a link. Returns the
 * updated HTML, or null if the title isn't mentioned.
 */
function linkTitleOutsideAnchors(html: string, escapedTitle: string, url: string): string | null {
  const segments = html.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/);
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].startsWith('<a')) continue;
    const idx = segments[i].toLowerCase().indexOf(escapedTitle.toLowerCase());
    if (idx === -1) continue;
    const matched = segments[i].slice(idx, idx + escapedTitle.length);
    segments[i] = segments[i].slice(0, idx)
      + `<a href="${escapeHtml(url)}" style="${SUMMARY_LINK_STYLE}">${matched}</a>`
      + segments[i].slice(idx + escapedTitle.length);
    return segments.join('');
  }
  return null;
}

/**
 * Render the AI editorial note. Splits into paragraphs (blank-line breaks, then
 * single newlines) so it reads like a reporter's briefing, and turns the model's
 * inline story references — written as `{{linked words|N}}` — into links to the
 * matching article (by 1-based index into `citations`). Markers that point at
 * a missing story, or any stray/unbalanced braces, are stripped so nothing leaks.
 * Stories the model mentions by exact title without a marker (Apple Intelligence
 * ignores the marker convention) are linked too, same as the in-app briefing.
 */
function renderSummaryParagraphs(summary: string, citations: Array<{ title: string; url: string }> = []): string {
  // Parity with the in-app briefing: drop the generic preamble line some models prepend.
  const cleaned = summary.replace(/^(?:here(?:'s|\s+is)|below\s+is|this\s+is)\s+(?:a|the|your)?\s*(?:summary|overview|briefing|rundown|opening\s+note|editorial\s+note)[^\n]*\n+/i, '');

  const linkedUrls = new Set<string>();

  // Models sometimes number markers wrong (e.g. renumbering their mentions
  // 1, 2, 3… regardless of the list). When the linked phrase itself names a
  // story — it matches a title, or a title matches it — trust the words over
  // the number. `phrase` arrives already HTML-escaped, so compare escaped.
  const citationByPhrase = (escapedPhrase: string): { title: string; url: string } | undefined => {
    const p = escapedPhrase.trim().toLowerCase();
    if (p.length < 8) return undefined;
    return citations.find(c => {
      if (!c.title || !c.url) return false;
      const t = escapeHtml(c.title).trim().toLowerCase();
      return t === p || p.includes(t) || (t.includes(p) && p.length >= t.length / 2);
    });
  };

  const linkify = (escaped: string): string =>
    escaped
      .replace(/\{\{([^{}|]+)\|(\d+)\}\}/g, (_m, phrase: string, n: string) => {
        const cite = citationByPhrase(phrase) || citations[parseInt(n, 10) - 1];
        if (!cite?.url) return phrase; // out of range — keep the words, drop the marker
        linkedUrls.add(cite.url);
        return `<a href="${escapeHtml(cite.url)}" style="${SUMMARY_LINK_STYLE}">${phrase}</a>`;
      })
      .replace(/\{\{|\}\}/g, ''); // drop any leftover markers

  const byBlank = cleaned.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const paras = byBlank.length > 1
    ? byBlank
    : cleaned.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const finalParas = paras.length ? paras : [cleaned.trim()];
  const htmlParas = finalParas.map(p => linkify(escapeHtml(p)));

  // Fallback linking for models that skip the {{…|N}} convention but still name
  // stories by title: link the first mention of each not-yet-linked title.
  for (const cite of citations) {
    if (!cite.url || !cite.title || linkedUrls.has(cite.url)) continue;
    const escapedTitle = escapeHtml(cite.title);
    for (let i = 0; i < htmlParas.length; i++) {
      const replaced = linkTitleOutsideAnchors(htmlParas[i], escapedTitle, cite.url);
      if (replaced) {
        htmlParas[i] = replaced;
        linkedUrls.add(cite.url);
        break;
      }
    }
  }

  // Second fallback: models often QUOTE a shortened form of a title ("Story
  // Name" without the | Show Name suffix). Link quoted spans that clearly
  // name a story, matched fuzzily.
  const quoteRe = /(&quot;|“)(.{8,180}?)(&quot;|”)/g;
  for (const cite of citations) {
    if (!cite.url || !cite.title || linkedUrls.has(cite.url)) continue;
    const escapedTitle = escapeHtml(cite.title);
    const escapedCore = escapeHtml(titleCore(cite.title));
    let done = false;
    for (let i = 0; i < htmlParas.length && !done; i++) {
      const segments = htmlParas[i].split(/(<a\b[^>]*>[\s\S]*?<\/a>)/);
      for (let s = 0; s < segments.length && !done; s++) {
        if (segments[s].startsWith('<a')) continue;
        quoteRe.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = quoteRe.exec(segments[s])) !== null) {
          if (!quotedSpanNamesTitle(normalizeForTitleMatch(m[2]), escapedTitle, escapedCore)) continue;
          const start = m.index + m[1].length;
          segments[s] = segments[s].slice(0, start)
            + `<a href="${escapeHtml(cite.url)}" style="${SUMMARY_LINK_STYLE}">${m[2]}</a>`
            + segments[s].slice(start + m[2].length);
          htmlParas[i] = segments.join('');
          linkedUrls.add(cite.url);
          done = true;
          break;
        }
      }
    }
  }

  // Last fallback: unquoted shortened mentions — a word run matching the start
  // of a story's title ("the Nordstrom Anniversary Sale 2026 promises…").
  for (const cite of citations) {
    if (!cite.url || !cite.title || linkedUrls.has(cite.url)) continue;
    const escapedCore = escapeHtml(titleCore(cite.title));
    let done = false;
    for (let i = 0; i < htmlParas.length && !done; i++) {
      const segments = htmlParas[i].split(/(<a\b[^>]*>[\s\S]*?<\/a>)/);
      for (let s = 0; s < segments.length && !done; s++) {
        if (segments[s].startsWith('<a')) continue;
        const run = findTitleCoreRun(segments[s], escapedCore);
        if (!run) continue;
        segments[s] = segments[s].slice(0, run.start)
          + `<a href="${escapeHtml(cite.url)}" style="${SUMMARY_LINK_STYLE}">${segments[s].slice(run.start, run.end)}</a>`
          + segments[s].slice(run.end);
        htmlParas[i] = segments.join('');
        linkedUrls.add(cite.url);
        done = true;
      }
    }
  }

  return htmlParas
    .map((p, i) => {
      const mb = i === htmlParas.length - 1 ? '0' : '15px';
      return `<p style="margin:0 0 ${mb};font-size:16px;line-height:1.72;color:#33302d">${p}</p>`;
    })
    .join('\n');
}

export function buildRoundupHtml(
  articles: ArticleMeta[],
  lookbackDays: number,
  summary?: string | null,
  summaryCredit?: string | null,
  scoreFn?: ((a: ArticleMeta) => number) | null,
  extras: { oneRead?: { article: ArticleMeta; why: string } | null } = {},
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
@media only screen and (max-width:600px){.rundown-wrap{padding:12px 8px 20px !important}.rundown-card{padding:22px 16px !important;border-radius:10px !important}.hero-cell{display:block !important;width:100% !important;padding-right:0 !important}.hero-img{padding-bottom:14px !important}.hero-img img{width:100% !important;height:180px !important;max-width:100% !important}}
@media only screen and (min-width:601px){.rundown-card{padding:40px !important}}</style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f7f5f3;color:#1a1a1a;-webkit-font-smoothing:antialiased">
<div class="rundown-wrap" style="max-width:600px;margin:0 auto;padding:20px 10px 28px;background-color:#f7f5f3">

<div style="text-align:center;padding:8px 0 22px">
<a href="https://pullread.com" style="text-decoration:none"><img src="cid:header" width="300" height="55" alt="Pull Read — The Rundown" style="display:inline-block" /></a>
</div>

<!-- Narrow side padding by default (mobile-first): on a phone the old 20px wrap + 40px card padding left a third of the screen empty. Clients that honor the media queries get 40px back on desktop. -->
<div class="rundown-card" style="background:#ffffff;padding:28px 22px;border:1px solid #ebe5df;border-radius:14px">

<div style="text-align:center;padding-bottom:24px;margin-bottom:30px;border-bottom:1px solid #ece7e2">
<div style="font-size:27px;font-weight:600;color:#1a1a1a;font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.01em;margin-bottom:6px">The Rundown</div>
<div style="font-size:13px;color:#9a938c;letter-spacing:0.01em">${escapeHtml(today)} &middot; ${count} article${count === 1 ? '' : 's'} from ${period}</div>
</div>
`;

  if (extras.oneRead) {
    // Today's one read: the reader's own pick, above the day's news. The "why"
    // names the signals it matched, so the choice is never a mystery.
    html += `<div style="margin:0 0 30px;padding:0 0 26px;border-bottom:1px solid #ece7e2">
<div style="font-size:11px;font-weight:700;color:#b45535;letter-spacing:0.12em;text-transform:uppercase;padding-bottom:12px">Today\u2019s one read</div>
${heroArticleHtml(extras.oneRead.article).replace(/margin-bottom:22px/, 'margin-bottom:10px')}
<div style="font-size:12.5px;color:#7d746b;font-style:italic;line-height:1.5">${escapeHtml(extras.oneRead.why)}</div>
</div>
`;
  }

  if (summary) {
    // The note reads as a newsletter lede straight on the card — no bounding box.
    // Story references written as {{words|N}} link to the Nth article below.
    const citations = articles.map(a => ({ title: a.title, url: a.url }));
    // The on-device model can misstate facts in ways the intro checks can't
    // catch (live runs: a losing candidate "declaring victory", a man called
    // "her"), so its credit says so plainly. Cloud models keep the plain credit.
    const onDevice = summaryCredit === 'Apple Intelligence';
    const credit = summaryCredit
      ? `\n<div style="margin-top:16px;font-size:12px;color:#a99f95;letter-spacing:0.01em">`
        + `<span style="color:#b45535">&#10022;</span> ${onDevice ? 'Written on-device by ' : 'Summary by '}`
        + `<span style="color:#7d746b;font-weight:600">${escapeHtml(summaryCredit)}</span>`
        + (onDevice ? ' &middot; may contain errors, so check the stories below' : '')
        + `</div>`
      : '';
    html += `<div style="margin:0 0 6px">
${renderSummaryParagraphs(summary, citations)}${credit}
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
    // Top stories (marked with .story by buildRoundup) lead, in weight order;
    // every one gets the hero treatment so they read as the day's headlines.
    const top = articles.filter(a => a.story?.top);
    if (top.length) {
      html += `<div style="margin:38px 0 20px">
<div style="font-size:11px;font-weight:700;color:#b45535;letter-spacing:0.12em;text-transform:uppercase;padding-bottom:10px;border-bottom:1px solid #ece7e2">Top stories</div>
</div>`;
      for (const a of top) html += heroArticleHtml(a);
    }
    const groups = groupByCategory(articles.filter(a => !a.story?.top), scoreFn ? { score: scoreFn, seed: today } : {});
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

/**
 * Drop duplicate stories: the same URL (ignoring query, hash, www and trailing
 * slash), the same title, or near-identical titles from different outlets.
 * Keeps the first occurrence unless a later copy has a real image or excerpt the
 * first lacks. (groupStories keeps the extra copies; this keeps only the leads.)
 */
export function dedupeArticles(articles: ArticleMeta[]): ArticleMeta[] {
  return groupStories(articles).map(g => g.lead);
}

export function curateArticles(
  articles: ArticleMeta[],
  mentionCounts?: Map<string, number>,
  watchedEntities?: Set<string>,
  limit = MAX_ROUNDUP_ARTICLES,
): ArticleMeta[] {
  articles = dedupeArticles(articles);
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

/**
 * Build the editorial-intro prompt. `strictTitles` swaps the {{phrase|N}} marker
 * convention for a "copy the exact title" rule — small on-device models (Apple
 * Intelligence) ignore the marker syntax, but do repeat titles verbatim, which
 * the renderer's title-matching fallback then turns into links (the same
 * approach the in-app briefing uses).
 */
/** "Monday, November 23, 2026 (evening)" — the issue's date and time of day, for the prompt. */
export function issueDateLine(now: Date = new Date()): string {
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const h = now.getHours();
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `${date} (${part})`;
}

function roundupSummaryPrompt(strictTitles: boolean, dateLine: string = issueDateLine()): string {
  const linking = strictTitles
    ? `Linking (important):
- LINKING RULE — THIS IS CRITICAL: every story you reference MUST be named by its exact title, copied word-for-word from the list below, wrapped in double quotes. Do not shorten, reword, or retitle it.
- Reference 2 to 4 stories this way across the whole note, woven into the prose.`
    : `Linking (important):
- The stories below are numbered. When you reference a specific one, link the exact words that name it by wrapping them like {{these words|N}}, where N is that story's number from the list — write {{a short phrase naming story three|3}} to link story 3.
- Link 2 to 4 stories across the whole note. Keep each linked phrase short (a noun phrase, not a full sentence), never link the same story twice, and double-check each N matches the story you're naming.
- If you mention a story without a {{…|N}} marker, name it by its exact title as listed so it can be linked automatically.`;

  return `You're writing the opening note for a daily reading rundown — the short briefing that sits at the very top of the newsletter. Write like a sharp, well-read reporter giving a curious friend the lay of the land: warm, direct, and genuinely interested, never breathless or salesy.

Structure:
- Write 2 to 3 SHORT paragraphs of flowing prose. Separate every paragraph with a blank line.
- Keep each paragraph to 1-2 sentences. Tight beats long.
- Open with the day's throughline — the theme or tension tying the stories together — not a roll call.
- NEVER output bullet points, numbered lists, or a "quick updates" section. Every story you mention gets woven into a sentence.

Voice:
- Synthesize; don't enumerate. Never march down the list tacking "and it's a reminder that…" onto each item. That pattern is the single worst thing you can do here.
- Be specific: name who did what and the real stakes. No vague trend-talk about debates heating up or landscapes shifting.
- Cover the day's actual range — don't fixate on a single theme. If a strong story sits outside the throughline, give it one good sentence.
- Write only about the stories listed below. Do not invent stories, and do not reuse any wording from these instructions.
- Opinions welcome, clichés not.
- Don't name every article or count how many there are.

Timing:
- This note goes out on ${dateLine}. Stories may mention other days ("Friday the 13th weekend", "Monday morning traffic"); those are not today.
- Don't name today's weekday or date, and don't describe anything as coming up unless the story itself is about a future date.

${linking}

Never use: "dive in", "buckle up", "without further ado", "let's get started", "here's what caught my eye", "in today's rundown", "welcome to". No greetings, no sign-offs, no "that's the rundown" — start with the news and end with the news.

Today's stories (numbered for linking):
`;
}

/**
 * Drop the throat-clearing and sign-off paragraphs small models tack on despite
 * instructions ("Let's get started, shall we?", "So, there you have it, folks…").
 * Only whole paragraphs that are clearly filler are removed; the news survives.
 */
export function stripFillerParagraphs(text: string): string {
  const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const greeting = /^(let'?s (get started|dive|begin)|welcome( to| back)?\b|good (morning|afternoon|evening)|hello|hi there|hey (there|folks|everyone)|alright,? (folks|everyone)|shall we|today,? we'?re diving|here(?:'s| is) (a |the |your )?(opening note|note|briefing|summary|rundown))/i;
  const signoff = /(that'?s (today'?s|the|your) (rundown|briefing|roundup)|that'?s all for (today|now|this week)|until next time|don'?t forget to (share|subscribe|comment)|there you have it|happy reading|stay (tuned|curious)|keep (exploring|reading|questioning)|see you (tomorrow|next))/i;

  while (paras.length > 1 && greeting.test(paras[0]) && paras[0].length < 160) paras.shift();
  while (paras.length > 1 && signoff.test(paras[paras.length - 1])) paras.pop();
  return paras.join('\n\n');
}

/** The editorial intro plus the model that wrote it, for AI disclosure. */
export interface RoundupSummary {
  text: string;
  model: string;
  provider: string;
}

export async function generateRoundupSummary(articles: ArticleMeta[], opts: { now?: Date } = {}): Promise<RoundupSummary | null> {
  const { promptLLM, loadLLMConfig } = await import('./summarizer');
  const config = loadLLMConfig();
  if (!config) return null;
  // No stories, no intro: given an empty list, the model invents a day of news
  // that isn't in the reader's library, and the email would still go out
  // (seen live on macOS 26.6: Biden, the Supreme Court, Chang'e-6 — none of it saved).
  if (!articles.length) return null;
  const now = opts.now ?? new Date();

  // The free-text intro (all providers; also Apple's fallback).
  const textIntro = async (): Promise<RoundupSummary | null> => {
    // Number the stories so the model can cite them inline as {{words|N}};
    // renderSummaryParagraphs maps N back to this same (curated) article order.
    // Feed each story's summary (or excerpt) like the in-app briefing does —
    // titles alone push small models toward vague filler prose.
    const buildList = (maxArticles: number, gistCap: number) => articles
      .slice(0, maxArticles)
      .map((a, i) => {
        const gist = a.summary || a.excerpt || '';
        const detail = gist && gistCap > 0 ? `\n   ${a.summary ? 'Summary' : 'Excerpt'}: ${gist.slice(0, gistCap)}` : '';
        return `${i + 1}. "${a.title}" (${a.domain || a.feed || ''})${detail}`;
      })
      .join('\n');

    const base = roundupSummaryPrompt(config.provider === 'apple');
    let articleList = buildList(15, 300);

    if (config.provider === 'apple') {
      // Apple Intelligence has a hard 4096-token window shared with the ~400-token
      // reply, and roughly 3 chars/token on mixed text — a rich prompt overflows it
      // and the whole intro is lost. Shrink the story gists (then the list) until
      // the prompt fits comfortably.
      const budget = 7000; // total prompt chars
      for (const [n, cap] of [[15, 120], [12, 80], [10, 40], [8, 0], [5, 0]] as const) {
        articleList = buildList(n, cap);
        if (base.length + articleList.length <= budget) break;
      }
    }

    // Use promptLLM (not summarizeText): the roundup prompt IS the instruction.
    // summarizeText would prepend its own "Summarize this article…" wrapper, so the
    // model would summarize our instructions instead of following them — producing a
    // near-static blurb anchored on the example lines in the prompt.
    // A slightly higher token budget lets the model write 2-3 short paragraphs.
    const run = async (list: string) => {
      const result = await promptLLM(base + list, config, 400);
      const text = stripFillerParagraphs(result.text.trim());
      return text ? { text, model: result.model, provider: config.provider } : null;
    };
    try {
      return await run(articleList);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Last resort: a bare titles-only list still beats an email with no intro.
      if (/context window/i.test(msg)) {
        try {
          return await run(buildList(5, 0));
        } catch (retryErr) {
          console.warn('[email] Roundup summary retry failed:', retryErr instanceof Error ? retryErr.message : retryErr);
          return null;
        }
      }
      console.warn('[email] Failed to generate roundup summary:', msg);
      return null;
    }
  };

  // Apple Intelligence: guided generation with per-story sentences, which the
  // on-device model follows far better than a free-form prompt (see
  // src/apple-structured.ts). Falls back to the text prompt on any error.
  const structuredAppleIntro = async (retry: boolean): Promise<RoundupSummary | null> => {
    const { runAppleStructured } = await import('./apple-structured');
    // One story per request: a refusal (Apple's guardrails, on sensitive news)
    // drops that story instead of the whole intro, and each request is tiny.
    let refused = 0;
    const built = await buildPerStoryIntro(articles, async (prompt, retryStory) => {
      try {
        return await runAppleStructured('sentence', appleSentenceInstructions(issueDateLine(now), retry || retryStory), prompt, 30_000);
      } catch (err) {
        if ((err as { kind?: string }).kind === 'refusal') refused++;
        throw err;
      }
    });
    if (refused) console.warn(`[email] Apple Intelligence declined ${refused} stor${refused === 1 ? 'y' : 'ies'}; writing the intro from the rest`);
    if (built?.copied) console.warn(`[email] Skipped ${built.copied} stor${built.copied === 1 ? 'y' : 'ies'} whose sentence kept copying the headline`);
    if (built?.invented) console.warn(`[email] Skipped ${built.invented} stor${built.invented === 1 ? 'y' : 'ies'} whose sentence named things the story doesn't mention`);
    if (!built) return null;
    const { text } = structuredIntroToMarkers(mentionsToIntro(built.mentions, articles.map(a => a.title)), articles.length);
    return text.trim() ? { text, model: 'on-device', provider: 'apple' } : null;
  };

  const attempt = async (retry: boolean): Promise<RoundupSummary | null> => {
    if (config.provider === 'apple') {
      try {
        const r = await structuredAppleIntro(retry);
        if (r) return r;
      } catch (err) {
        console.warn('[email] Structured Apple intro failed, using the text prompt:', err instanceof Error ? err.message : err);
      }
    }
    return textIntro();
  };

  // Gate: an intro that names the wrong day, uses banned filler, cites a story
  // that isn't there, copies the stories, or isn't about them at all gets one
  // retry, then is left out — no intro beats a wrong one.
  const sources = articles.flatMap(a => [a.title, a.summary || a.excerpt || '']).filter(Boolean);
  for (let i = 1; i <= 2; i++) {
    const result = await attempt(i > 1);
    if (!result) return null;
    const failures = blockingFailures(checkIntro(result.text, { now, storyCount: articles.length, sources }));
    if (!failures.length) return result;
    console.warn(`[email] Roundup intro failed checks (attempt ${i} of 2): ${failures.join('; ')}`);
  }
  return null;
}

export interface RoundupResult {
  html: string;
  subject: string;
  summary: string | null;
  /** Brand-level credit for the AI that wrote the intro (e.g. "Claude"), if any. */
  summaryCredit: string | null;
  articles: ArticleMeta[];
  /** What story curation did: panel feeds reached, model grouping, merges. */
  report?: StoryReport;
  /** Today's one read, its runners-up and the profile it came from (for preview-rundown). */
  oneRead?: {
    pick: { article: ArticleMeta; why: string; score: number; terms: string[] } | null;
    runnersUp: Array<{ title: string; score: number; terms: string[] }>;
    signals: Partial<Record<string, number>>;
    topInterests: string[];
    /** A few of the notes, to spot imported text masquerading as notes. */
    sampleNotes: string[];
    /** Recent picks and whether the reader opened or finished them. */
    history: Array<{ date: string; title: string; opened: boolean; finished: boolean }>;
    /** Articles in the reading history (all skipped). */
    readCount: number;
    /** Strongest words contributed by each kind of signal. */
    bySource: Record<string, string[]>;
  };
}

/** Keep only articles bookmarked within the lookback window. */
export function filterByLookback(articles: ArticleMeta[], lookbackDays: number): ArticleMeta[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffStr = cutoff.toISOString();
  return articles.filter(a => a.bookmarked && a.bookmarked >= cutoffStr);
}

export interface StoryCurationOptions {
  /** Supply panel headlines directly (tests, previews); otherwise they're fetched when widerNews is on. */
  panelHeadlines?: import('./stories').PanelHeadline[];
  panel?: PanelSource[];
  limit?: number;
  /**
   * Model grouping as "ids|label|importance" lines (Phase 4 / demo 2), ids being
   * 1-based positions in groupingPrompt(groups). Merges groups, relabels their
   * sections, and nudges weight by importance.
   */
  modelGroups?: string[];
  /**
   * Ask a model to group the stories (Apple on-device on macOS 26: see
   * onDeviceGrouping). Returns "ids|label|importance" lines, or null to skip.
   * Errors are caught and the stories stay grouped by word matching alone.
   */
  modelGrouper?: (groups: StoryGroup[], context: { allGroups: StoryGroup[] }) => string[] | null | Promise<string[] | null>;
  /** Receives a summary of what curation did (for preview-rundown and logs). */
  onReport?: (report: StoryReport) => void;
}

export interface StoryReport {
  panelFeeds: number;
  /** Panel outlets that returned at least one recent headline. */
  panelFeedsReached: string[];
  panelHeadlines: number;
  widelyCovered: number;
  /** Panel stories run by the most outlets, even below the bar (diagnostics). */
  biggestPanelStories: Array<{ title: string; sources: string[]; titles: string[] }>;
  beyondFeeds: number;
  storyGroups: number;
  modelGrouping: 'not used' | 'applied' | 'skipped' | 'failed';
  merges: string[];
}

/** Stories sent to the model for grouping: the strongest by score and coverage. */
const MODEL_GROUPING_MAX = 40;

/**
 * Weight per importance step away from the middle (3): a 5 adds 1.5, a 1 takes
 * 1.5 off. Kept small: on macOS 26 the on-device model's ratings were flat or
 * inflated across runs (Nov 25), so they nudge rather than reorder.
 */
const IMPORTANCE_POINTS = 0.75;

/**
 * Group the day's articles into stories, weigh them (your sources' coverage +
 * the wider-news panel), pull out the Top stories, and curate the rest. Top
 * stories come first in the returned list, marked with `.story`.
 */
export async function curateWithStories(
  articles: ArticleMeta[],
  cfg: Pick<EmailConfig, 'widerNews' | 'regionalFeeds'> & Partial<Pick<EmailConfig, 'panelEnabled'>>,
  scoreFn: (a: ArticleMeta) => number,
  mentionCounts?: Map<string, number>,
  watchedEntities?: Set<string>,
  opts: StoryCurationOptions = {},
): Promise<ArticleMeta[]> {
  const limit = opts.limit ?? MAX_ROUNDUP_ARTICLES;
  // Near you works on its own: local feeds are read even with Wider news off.
  const panel = opts.panel ?? [
    ...(cfg.widerNews ? panelFor(cfg.panelEnabled) : []),
    ...(cfg.regionalFeeds || []).map(f => ({ ...f, lean: 'center' as const, scope: 'regional' as const })),
  ];

  let headlines = opts.panelHeadlines ?? [];
  if (!opts.panelHeadlines && panel.length) {
    try {
      const { fetchFeed } = await import('./feed');
      headlines = await fetchPanelHeadlines(panel, fetchFeed);
    } catch {
      headlines = []; // offline or every feed failed — rank on your feeds alone
    }
  }
  // Measure coverage against the outlets that answered, so a dead feed doesn't raise the bar.
  const reached = [...new Set(headlines.map(h => h.source))];
  const consensus = headlines.length && !opts.panelHeadlines ? findConsensus(headlines, panel, { reached })
    : headlines.length ? findConsensus(headlines, panel) : [];

  let groups = groupStories(articles);
  const storyGroups = groups.length;
  let weighFn = scoreFn;
  let modelLines = opts.modelGroups;
  let modelGrouping: StoryReport['modelGrouping'] = opts.modelGroups ? 'applied' : 'not used';
  let merges: string[] = [];
  if (!modelLines && opts.modelGrouper && groups.length > 1) {
    try {
      // Only the strongest stories can make a 12-story email, so only they go to
      // the model (a live 3-day window had 246 stories — ~17 on-device calls).
      const ranked = groups
        .map((g, i) => ({ i, w: scoreFn(g.lead) + 2.5 * (g.sources.length - 1) }))
        .sort((a, b) => b.w - a.w)
        .slice(0, MODEL_GROUPING_MAX);
      const subLines = await opts.modelGrouper(ranked.map(r => groups[r.i]), { allGroups: groups });
      // Map the model's ids (positions in the shortlist) back to positions in `groups`.
      modelLines = subLines?.map(line => {
        const [ids, ...rest] = line.split('|');
        const mapped = ids.split(',').map(n => ranked[parseInt(n, 10) - 1]?.i).filter(i => i !== undefined).map(i => i! + 1);
        return [mapped.join(','), ...rest].join('|');
      }).filter(line => !line.startsWith('|'));
      modelGrouping = modelLines ? 'applied' : 'skipped';
    } catch (err) {
      modelGrouping = 'failed';
      console.warn('[email] Model story grouping failed; using word matching only:', err instanceof Error ? err.message : err);
    }
  }
  if (modelLines?.length) {
    const model = applyModelGroups(groups, modelLines);
    merges = model.merges;
    groups = model.groups.map(g => {
      const label = model.labels.get(g);
      return label ? { ...g, lead: { ...g.lead, categories: [label] } } : g;
    });
    const importanceByUrl = new Map(model.groups.map((g, i) => [groups[i].lead.url, model.importance.get(g)]));
    weighFn = (a: ArticleMeta) => scoreFn(a) + IMPORTANCE_POINTS * ((importanceByUrl.get(a.url) ?? 3) - 3);
  }
  const weighed = weighStories(groups, consensus, weighFn);
  const { top, rest } = pickTopStories(weighed, consensus, { baseScore: weighFn });

  const topArticles = top.map(t => ({
    ...t.article,
    story: { top: true, alsoIn: t.alsoIn, wider: t.wider, beyondFeeds: t.beyondFeeds },
  }));
  // Stories outside the top block still show who else ran them.
  const leads = rest.map(g => {
    const alsoIn = alsoInFor(g);
    return alsoIn.length ? { ...g.lead, story: { top: false, alsoIn, beyondFeeds: false } } : g.lead;
  });
  const others = curateArticles(leads, mentionCounts, watchedEntities, Math.max(0, limit - topArticles.length));
  opts.onReport?.({
    panelFeeds: panel.length,
    panelFeedsReached: [...new Set(headlines.map(h => h.source))],
    panelHeadlines: headlines.length,
    widelyCovered: consensus.length,
    biggestPanelStories: biggestPanelStories(headlines),
    beyondFeeds: top.filter(t => t.beyondFeeds).length,
    storyGroups,
    modelGrouping,
    merges,
  });
  return [...topArticles, ...others];
}

/**
 * On-device story grouping for Apple Intelligence users (macOS 26): merges
 * reworded copies of the same story and labels sections from a fixed list.
 * Other providers keep word matching only for now.
 */
async function appleGrouperIfEnabled(): Promise<StoryCurationOptions['modelGrouper']> {
  try {
    const { loadLLMConfig, isAppleAvailable } = await import('./summarizer');
    if (loadLLMConfig()?.provider !== 'apple' || !isAppleAvailable()) return undefined;
    const { runAppleStructured } = await import('./apple-structured');
    const { onDeviceGrouping, commonWords } = await import('./rundown-ai');
    return (groups, { allGroups }) => onDeviceGrouping(groups, (mode, instructions, prompt) => runAppleStructured(mode, instructions, prompt, 30_000), {
      common: commonWords(allGroups), // measured over the whole day, not the shortlist
    });
  } catch {
    return undefined;
  }
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
  opts: { outputPath?: string; recordPick?: boolean } = {},
): Promise<RoundupResult> {
  let articles: ArticleMeta[] = [];
  if (fetchArticles) {
    articles = await fetchArticles();
  } else {
    try {
      // summaries=1 includes each article's stored AI summary — the editorial
      // intro prompt needs real content, not just titles, to stay specific.
      const resp = await fetch(`http://127.0.0.1:${port}/api/files?summaries=1`);
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

  const scoreCtx: ScoreContext = { now: Date.now(), mentionCounts, watchedEntities };
  const scoreFn = (a: ArticleMeta) => scoreArticle(a, scoreCtx);
  // Today's one read: the best match for the reader's own signals, picked from
  // the whole window before curation, then kept out of the rest of the email
  // (with any other copies of the same story).
  let oneRead: RoundupResult['oneRead'];
  if (cfg.oneRead && articles.length) {
    try {
      const { gatherInterestSignals, buildInterestProfile, pickOneRead } = await import('./interests');
      const { signals, engaged, read } = await gatherInterestSignals({
        outputPath: opts.outputPath || '',
        watches: [...(watchedEntities || [])],
      });
      const profile = buildInterestProfile(signals);
      // Skip what the reader already opened (reading history) or highlighted,
      // noted or favorited, and every other copy of those stories: on Nov 26 the
      // pick was another outlet's copy of an obituary the reader had favorited.
      const stories = groupStories(articles);
      const skip = withOtherCopies(stories, new Set([...engaged, ...read]));
      const storyOf = new Map<string, number>();
      stories.forEach((g, gi) => { for (const m of g.members) storyOf.set(m.filename, gi); });
      const { pick, ranked } = pickOneRead(articles, profile, skip);
      const { loadReading, saveReading, recordPick, pickOutcomes } = await import('./reading');
      if (pick && opts.recordPick) {
        const date = new Date().toISOString().slice(0, 10);
        saveReading(recordPick(loadReading(), { date, filename: pick.article.filename, title: pick.article.title }));
      }
      const history = pickOutcomes(loadReading());
      oneRead = {
        pick,
        // One runner-up per story, not four copies of the pick.
        runnersUp: ranked.filter((c, i, all) => all.findIndex(o => storyOf.get(o.article.filename) === storyOf.get(c.article.filename)) === i)
          .slice(1, 6).map(c => ({ title: c.article.title, score: c.score, terms: c.terms.slice(0, 4) })),
        signals: profile.counts,
        topInterests: [...profile.weights].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t]) => t),
        bySource: Object.fromEntries(Object.keys(profile.counts).map(kind => [kind,
          [...profile.sources].map(([t, m]) => [t, m.get(kind as never) || 0] as const)
            .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t)])),
        history: history.map(h => ({ date: h.date, title: h.title, opened: h.opened, finished: h.finished })),
        readCount: read.size,
        sampleNotes: signals.filter(x => x.kind === 'note').sort((a, b) => b.text.length - a.text.length)
          .filter((_, i, arr) => i === 0 || i === Math.floor(arr.length / 2) || i === arr.length - 1)
          .map(x => `${x.text.length} chars: ${x.text.replace(/\s+/g, ' ').slice(0, 110)}`),
      };
      if (pick) {
        const sameStory = groupStories(articles).find(g => g.members.includes(pick.article));
        const remove = new Set((sameStory?.members ?? [pick.article]).map(a => a.filename));
        articles = articles.filter(a => !remove.has(a.filename));
        await validateArticleImages([pick.article]);
      }
    } catch (err) {
      console.warn("[email] Today's one read skipped:", err instanceof Error ? err.message : err);
    }
  }

  let report: StoryReport | undefined;
  const curated = await curateWithStories(articles, cfg, scoreFn, mentionCounts, watchedEntities, {
    modelGrouper: await appleGrouperIfEnabled(),
    onReport: r => { report = r; },
  });

  // Validate article images — strip broken URLs to avoid broken image icons
  await validateArticleImages(curated);

  // Generate AI editorial summary (non-blocking — roundup renders even if this fails)
  const summaryResult = await generateRoundupSummary(curated);
  const summary = summaryResult?.text ?? null;
  const summaryCredit = summaryResult
    ? formatSummaryCredit(summaryResult.provider, summaryResult.model)
    : null;

  // Rank sections by the day's relevance/freshness so the lead changes daily.
  const html = buildRoundupHtml(curated, cfg.lookbackDays, summary, summaryCredit, scoreFn, {
    oneRead: oneRead?.pick ? { article: oneRead.pick.article, why: oneRead.pick.why } : null,
  });
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const subject = `The Pull Read Rundown — ${today}`;

  return { html, subject, summary, summaryCredit, articles: curated, report, oneRead };
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

  const { html, subject, articles } = await buildRoundup(cfg, fetchArticles, port, { recordPick: true });

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
