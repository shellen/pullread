// ABOUTME: Extracts article content from web pages using Readability
// ABOUTME: Converts HTML to clean markdown for storage, with retry and fallback extraction

import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { getCookiesForDomain, getDomainFromUrl } from './cookies';
import { extractText, getDocumentProxy } from 'unpdf';
import { XMLParser } from 'fast-xml-parser';

export interface ExtractedArticle {
  title: string;
  content: string;
  markdown: string;
  byline?: string;
  excerpt?: string;
  thumbnail?: string;
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

// URLs that are never articles (apps, login walls, product pages, etc.)
const SKIP_PATTERNS = [
  /^https?:\/\/(www\.)?instagram\.com/,
  /^https?:\/\/(www\.)?tiktok\.com/,
  /^https?:\/\/play\.tailwindcss\.com/,
  /^https?:\/\/(www\.)?figma\.com\/file/,
  /^https?:\/\/(www\.)?amazon\.com\/gp\/product/,
  /^https?:\/\/(www\.)?amazon\.com\/dp\//,
];

// Tracking parameters to strip from URLs before fetching
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'mc_cid', 'mc_eid',
  'share_id', 'ref', 'ref_', 'referer',
];

// Site-specific URL transforms
function normalizeUrl(url: string): string {
  let u: URL;
  try { u = new URL(url); } catch { return url; }

  // Strip tracking parameters
  for (const param of TRACKING_PARAMS) {
    u.searchParams.delete(param);
  }

  // Medium: strip tracking params but keep share key (sk bypasses paywall)
  if (u.hostname === 'medium.com' || u.hostname.endsWith('.medium.com')) {
    u.searchParams.delete('source');
    // Keep 'sk' — it's an author-shared paywall bypass token
  }

  // Reddit: use old.reddit.com for better HTML extraction
  if (u.hostname === 'www.reddit.com' || u.hostname === 'reddit.com') {
    u.hostname = 'old.reddit.com';
  }

  return u.toString();
}

export function shouldSkipUrl(url: string): string | null {
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(url)) {
      return 'Non-article URL (app/product/login page)';
    }
  }
  return null;
}

export function resolveRelativeUrls(markdown: string, baseUrl: string): string {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return markdown;
  }

  // Resolve root-relative URLs in markdown images: ![alt](/path) -> ![alt](https://domain.com/path)
  markdown = markdown.replace(
    /!\[([^\]]*)\]\((\/[^)]+)\)/g,
    (_, alt, path) => `![${alt}](${origin}${path})`
  );

  // Resolve root-relative URLs in markdown links: [text](/path) -> [text](https://domain.com/path)
  markdown = markdown.replace(
    /(?<!!)\[([^\]]*)\]\((\/[^)]+)\)/g,
    (_, text, path) => `[${text}](${origin}${path})`
  );

  // Resolve relative URLs in images: ![alt](x1.png) -> ![alt](https://domain.com/path/x1.png)
  // Skips absolute URLs, root-relative, data URIs, fragments, and mailto
  markdown = markdown.replace(
    /!\[([^\]]*)\]\((?!\/|https?:|data:|#|mailto:)([^)\s]+)\)/g,
    (_, alt, relPath) => {
      try {
        return `![${alt}](${new URL(relPath, baseUrl).href})`;
      } catch {
        return `![${alt}](${relPath})`;
      }
    }
  );

  // Resolve relative URLs in links
  markdown = markdown.replace(
    /(?<!!)\[([^\]]*)\]\((?!\/|https?:|data:|#|mailto:)([^)\s]+)\)/g,
    (_, text, relPath) => {
      try {
        return `[${text}](${new URL(relPath, baseUrl).href})`;
      } catch {
        return `[${text}](${relPath})`;
      }
    }
  );

  return markdown;
}

/**
 * Detect if a URL is from X.com/Twitter
 */
function isTwitterUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'x.com' || host === 'www.x.com' ||
           host === 'twitter.com' || host === 'www.twitter.com' ||
           host === 'mobile.twitter.com' || host === 'mobile.x.com';
  } catch {
    return false;
  }
}

/**
 * Detect if a URL is a YouTube video
 */
export function isYouTubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'www.youtube.com' || host === 'youtube.com' ||
           host === 'm.youtube.com' || host === 'youtu.be';
  } catch {
    return false;
  }
}

/**
 * Extract YouTube video ID from various URL formats
 */
export function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null;
    }
    if (parsed.pathname === '/watch') {
      return parsed.searchParams.get('v');
    }
    const embedMatch = parsed.pathname.match(/\/(embed|v)\/([^/?]+)/);
    if (embedMatch) return embedMatch[2];
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect if a URL is a Bluesky post
 */
function isBlueskyUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'bsky.app' || host === 'staging.bsky.app';
  } catch {
    return false;
  }
}

/**
 * Detect if a URL is a Mastodon post (common instances)
 */
function isMastodonUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    const path = new URL(url).pathname;
    // Common Mastodon instances + path pattern /@user/123456
    const knownInstances = ['mastodon.social', 'mastodon.online', 'hachyderm.io', 'infosec.exchange', 'fosstodon.org', 'mstdn.social', 'techhub.social'];
    if (knownInstances.includes(host) && path.match(/^\/@[^/]+\/\d+/)) return true;
    // Generic detection: /@user/digits pattern (common Mastodon URL structure)
    if (path.match(/^\/@[^/]+\/\d+$/)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Detect if a URL is a Reddit post
 */
function isRedditUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'www.reddit.com' || host === 'reddit.com' ||
           host === 'old.reddit.com' || host === 'np.reddit.com';
  } catch {
    return false;
  }
}

/**
 * Detect if a URL is a Hacker News thread
 */
function isHackerNewsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.hostname === 'news.ycombinator.com' || u.hostname === 'hacker-news.firebaseio.com') &&
           u.pathname === '/item';
  } catch {
    return false;
  }
}

// ── Academic paper sources: PDF → HTML rewriting ────────────────────
// Each source defines how to convert a PDF URL to an HTML full-text URL.
// The handler tries HTML first (clean structure via Readability) then falls
// back to improved PDF text extraction.

interface PaperSource {
  name: string;
  match: (u: URL) => boolean;
  toHtmlUrl: (u: URL) => string | null;
}

const PAPER_SOURCES: PaperSource[] = [
  {
    name: 'arxiv',
    match: (u) => u.hostname === 'arxiv.org' || u.hostname === 'www.arxiv.org' || u.hostname === 'export.arxiv.org',
    toHtmlUrl: (u) => {
      const m = u.pathname.match(/^\/(pdf|abs)\/(.+?)(?:\.pdf)?$/);
      return m ? `https://arxiv.org/html/${m[2]}` : null;
    },
  },
  {
    name: 'bioRxiv',
    match: (u) => u.hostname === 'www.biorxiv.org' || u.hostname === 'biorxiv.org',
    toHtmlUrl: (u) => {
      // /content/10.1101/ID.full.pdf → /content/10.1101/ID.full
      if (u.pathname.endsWith('.full.pdf')) return `${u.origin}${u.pathname.replace(/\.pdf$/, '')}`;
      return null;
    },
  },
  {
    name: 'medRxiv',
    match: (u) => u.hostname === 'www.medrxiv.org' || u.hostname === 'medrxiv.org',
    toHtmlUrl: (u) => {
      if (u.pathname.endsWith('.full.pdf')) return `${u.origin}${u.pathname.replace(/\.pdf$/, '')}`;
      return null;
    },
  },
  {
    name: 'PMC',
    match: (u) => (u.hostname === 'pmc.ncbi.nlm.nih.gov' || u.hostname === 'www.ncbi.nlm.nih.gov') && u.pathname.includes('/articles/'),
    toHtmlUrl: (u) => {
      // /articles/PMC123/pdf/ or /articles/PMC123/pdf/filename.pdf → /articles/PMC123/
      const m = u.pathname.match(/^(\/(?:pmc\/)?articles\/PMC\d+)\/pdf\b/);
      return m ? `${u.origin}${m[1]}/` : null;
    },
  },
  {
    name: 'PLOS',
    match: (u) => u.hostname.endsWith('plos.org'),
    toHtmlUrl: (u) => {
      // article/file?id=DOI&type=printable → article?id=DOI
      if (u.pathname.includes('/article/file') && u.searchParams.get('type') === 'printable') {
        const doi = u.searchParams.get('id');
        return doi ? `${u.origin}${u.pathname.replace('/article/file', '/article')}?id=${doi}` : null;
      }
      return null;
    },
  },
  {
    name: 'ACM',
    match: (u) => u.hostname === 'dl.acm.org',
    toHtmlUrl: (u) => {
      // /doi/pdf/10.1145/... → /doi/fullHtml/10.1145/...
      if (u.pathname.startsWith('/doi/pdf/')) return `${u.origin}${u.pathname.replace('/doi/pdf/', '/doi/fullHtml/')}`;
      return null;
    },
  },
];

/**
 * Check if a URL matches a known academic paper source that has an HTML version.
 */
export function matchPaperSource(url: string): { source: PaperSource; htmlUrl: string } | null {
  try {
    const u = new URL(url);
    for (const source of PAPER_SOURCES) {
      if (source.match(u)) {
        const htmlUrl = source.toHtmlUrl(u);
        if (htmlUrl) return { source, htmlUrl };
      }
    }
  } catch {}
  return null;
}

/**
 * Detect if a URL is a social post (any platform)
 */
function isSocialPostUrl(url: string): boolean {
  return isTwitterUrl(url) || isBlueskyUrl(url) || isMastodonUrl(url);
}

/**
 * Generate a friendly title for social posts based on platform
 */
function generateSocialTitle(html: string, url: string): string {
  const { document } = parseHTML(html);
  const desc = document.querySelector('meta[property="og:description"]')?.getAttribute('content')
    || document.querySelector('meta[name="description"]')?.getAttribute('content')
    || '';

  let platform = 'social media';
  let username = '';

  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);

    if (isTwitterUrl(url)) {
      platform = 'X';
      username = parts[0] ? `@${parts[0]}` : '';
    } else if (isBlueskyUrl(url)) {
      platform = 'Bluesky';
      // bsky.app/profile/user.bsky.social/post/123
      if (parts[0] === 'profile' && parts[1]) {
        username = parts[1].includes('.') ? `@${parts[1].split('.')[0]}` : `@${parts[1]}`;
      }
    } else if (isMastodonUrl(url)) {
      platform = 'Mastodon';
      if (parts[0]?.startsWith('@')) username = parts[0];
    }
  } catch {}

  if (desc) {
    const clean = desc.replace(/\n/g, ' ').trim();
    const short = clean.length > 80 ? clean.slice(0, 77) + '...' : clean;
    return short;
  }

  if (username) {
    return `A post by ${username} on ${platform}`;
  }

  return `A post on ${platform}`;
}

/**
 * Generate a friendly title for X.com/Twitter posts
 */
function generateTwitterTitle(html: string, url: string): string {
  const { document } = parseHTML(html);
  // Try og:description for tweet text
  const desc = document.querySelector('meta[property="og:description"]')?.getAttribute('content')
    || document.querySelector('meta[name="description"]')?.getAttribute('content')
    || '';

  if (desc) {
    // Truncate to first sentence or 80 chars
    const clean = desc.replace(/\n/g, ' ').trim();
    const short = clean.length > 80 ? clean.slice(0, 77) + '...' : clean;
    return short;
  }

  // Extract username from URL like x.com/username/status/123
  try {
    const path = new URL(url).pathname;
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 1) {
      return `A post by @${parts[0]} on X`;
    }
  } catch {}

  return 'A post on X';
}

/**
 * Extract article using Readability. If that fails, try fallback extraction
 * from OpenGraph/meta tags + JSON-LD structured data.
 */
export function extractArticle(html: string, url: string): ExtractedArticle | null {
  const { document } = parseHTML(html);
  // Set document URL for Readability
  Object.defineProperty(document, 'URL', { value: url });
  const reader = new Readability(document);
  const article = reader.parse();

  if (article && article.content) {
    const markdown = resolveRelativeUrls(
      turndown.turndown(article.content),
      url
    );
    let title = article.title || 'Untitled';

    // For social posts, "Untitled" is common — generate a better title
    if ((title === 'Untitled' || !title.trim()) && isSocialPostUrl(url)) {
      title = generateSocialTitle(html, url);
    } else if (isTwitterUrl(url) && (title === 'Untitled' || !title.trim())) {
      title = generateTwitterTitle(html, url);
    }

    return {
      title,
      content: article.content,
      markdown,
      byline: article.byline || undefined,
      excerpt: article.excerpt || undefined
    };
  }

  // Fallback: try OpenGraph and JSON-LD extraction
  return extractFallback(document, url);
}

function extractFallback(document: any, url: string): ExtractedArticle | null {
  const getMeta = (prop: string): string => {
    const el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
    return el?.getAttribute('content') || '';
  };

  const title = getMeta('og:title') || getMeta('twitter:title') || document.querySelector('title')?.textContent || '';
  const description = getMeta('og:description') || getMeta('twitter:description') || getMeta('description') || '';
  const author = getMeta('author') || getMeta('article:author') || '';

  // Try JSON-LD for structured article content
  let jsonLdContent = '';
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'Article' || item['@type'] === 'NewsArticle' || item['@type'] === 'BlogPosting') {
          jsonLdContent = item.articleBody || item.text || '';
          break;
        }
      }
    } catch { /* ignore parse errors */ }
  }

  const body = jsonLdContent || description;
  if (!title || !body) return null;

  // For social posts, replace generic titles
  let finalTitle = title;
  if (!finalTitle.trim() || finalTitle === 'Untitled') {
    if (isSocialPostUrl(url)) {
      finalTitle = generateSocialTitle(`<html><head><meta property="og:description" content="${description}"></head></html>`, url);
    } else if (isTwitterUrl(url)) {
      const clean = description.replace(/\n/g, ' ').trim();
      finalTitle = clean.length > 80 ? clean.slice(0, 77) + '...' : (clean || 'A post on X');
    }
  }

  const markdown = body;
  return {
    title: finalTitle,
    content: `<p>${body}</p>`,
    markdown,
    byline: author || undefined,
    excerpt: description || undefined
  };
}

/**
 * Check if a URL points to a PDF file
 */
export function isPdfUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

// ── PDF text cleanup helpers ────────────────────────────────────────

/**
 * Fix common PDF ligature issues. PDF.js sometimes extracts Unicode
 * ligature codepoints (U+FB00–FB04) instead of ASCII character sequences.
 */
export function fixPdfLigatures(text: string): string {
  return text
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl');
}

/**
 * Strip running headers and footers from per-page PDF text.
 * Detects short lines that repeat on >50% of pages and removes them.
 */
export function stripRunningHeaders(pages: string[]): string[] {
  if (pages.length < 3) return pages;

  // Count how often each short line appears in the first/last 3 lines of each page
  const candidateCounts = new Map<string, number>();
  const N = 3;

  for (const page of pages) {
    const lines = page.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) continue;

    const candidates = new Set<string>();
    const headerLines = lines.slice(0, N);
    const footerLines = lines.slice(-N);

    for (const line of [...headerLines, ...footerLines]) {
      if (line.length < 80) {
        // Normalize: strip trailing page numbers for matching
        const normalized = line.replace(/\s*\d+\s*$/, '').trim();
        if (normalized.length > 0 && normalized.length < 80) {
          candidates.add(normalized);
        }
        if (/^\d+$/.test(line)) {
          candidates.add('__PAGE_NUMBER__');
        }
      }
    }

    for (const c of candidates) {
      candidateCounts.set(c, (candidateCounts.get(c) || 0) + 1);
    }
  }

  const threshold = pages.length * 0.5;
  const headersToStrip = new Set<string>();
  for (const [text, count] of candidateCounts) {
    if (count >= threshold) headersToStrip.add(text);
  }

  if (headersToStrip.size === 0) return pages;

  return pages.map(page => {
    const lines = page.split('\n');
    return lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true; // keep blank lines
      if (/^\d+$/.test(trimmed) && headersToStrip.has('__PAGE_NUMBER__')) return false;
      const normalized = trimmed.replace(/\s*\d+\s*$/, '').trim();
      return !headersToStrip.has(normalized);
    }).join('\n');
  });
}

/**
 * Convert raw PDF text into proper paragraphs.
 * PDF text has hard line breaks at column width boundaries — join them.
 */
export function buildParagraphs(text: string): string {
  const lines = text.split('\n');
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      if (current.length > 0) {
        paragraphs.push(current.join(' '));
        current = [];
      }
    } else {
      current.push(trimmed);
    }
  }
  if (current.length > 0) {
    paragraphs.push(current.join(' '));
  }

  return paragraphs.join('\n\n');
}

const PDF_TITLE_SKIP = [
  /^running head:/i,
  /^draft$/i,
  /^preprint$/i,
  /^\d+$/,
  /^page \d+/i,
  /^arxiv:\d/i,
  /^https?:\/\//,
];

/**
 * Extract a title from the first lines of PDF text, skipping headers/noise.
 */
export function extractPdfTitle(lines: string[], url: string): string {
  for (const line of lines.slice(0, 5)) {
    const trimmed = line.trim();
    if (trimmed.length < 5 || trimmed.length > 200) continue;
    if (PDF_TITLE_SKIP.some(p => p.test(trimmed))) continue;
    return trimmed;
  }
  return url.split('/').pop()?.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ') || 'Untitled PDF';
}

/**
 * Extract text content from a PDF and return as a markdown article.
 * Uses unpdf (Mozilla PDF.js) with per-page extraction, ligature fixing,
 * running header stripping, and paragraph detection.
 */
export async function extractPdf(data: Uint8Array, url: string): Promise<ExtractedArticle | null> {
  try {
    const pdf = await getDocumentProxy(data);
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]) as string[];

    // Fix ligatures on each page
    const fixedPages = pages.map(fixPdfLigatures);

    // Strip running headers/footers
    const cleanPages = stripRunningHeaders(fixedPages);

    // Join pages and build paragraphs
    const rawText = cleanPages.join('\n\n');
    if (rawText.trim().length < 100) return null;

    const bodyText = buildParagraphs(rawText);

    // Extract title from the first page
    const firstPageLines = (cleanPages[0] || '').split('\n').filter(l => l.trim());
    const title = extractPdfTitle(firstPageLines, url);

    const markdown = `*PDF document · ${totalPages} page${totalPages !== 1 ? 's' : ''}*\n\n${bodyText}`;

    return {
      title,
      content: `<p>${bodyText}</p>`,
      markdown,
      excerpt: bodyText.slice(0, 200).trim()
    };
  } catch {
    return null;
  }
}

export interface FetchOptions {
  useBrowserCookies?: boolean;
}

// Modern Chrome-like headers to pass bot detection
function getBrowserHeaders(url: string): Record<string, string> {
  const parsed = new URL(url);
  const isMedium = parsed.hostname === 'medium.com' || parsed.hostname.endsWith('.medium.com');
  return {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'DNT': '1',
    'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': isMedium ? 'cross-site' : 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    // Medium serves full content to visitors from Google (SEO first-click-free)
    'Referer': isMedium ? 'https://www.google.com/' : parsed.origin + '/',
  };
}

// Classify an error for better logging and to decide whether to retry
type ErrorClass = 'bot_blocked' | 'not_found' | 'server_error' | 'timeout' | 'connection' | 'redirect_loop' | 'header_too_large' | 'unknown';

function classifyError(err: any, status?: number): { cls: ErrorClass; retryable: boolean } {
  const msg = err?.message || String(err);
  if (status === 403 || status === 401) return { cls: 'bot_blocked', retryable: false };
  if (status === 404 || status === 410) return { cls: 'not_found', retryable: false };
  if (status === 494 || status === 431) return { cls: 'header_too_large', retryable: true };
  if (status && status >= 500) return { cls: 'server_error', retryable: true };
  if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('AbortError')) return { cls: 'timeout', retryable: true };
  if (msg.includes('socket') || msg.includes('ECONNRESET') || msg.includes('closed unexpectedly')) return { cls: 'connection', retryable: true };
  if (msg.includes('redirect')) return { cls: 'redirect_loop', retryable: false };
  return { cls: 'unknown', retryable: false };
}

export function classifyFetchError(err: any, status?: number): string {
  const { cls } = classifyError(err, status);
  const labels: Record<ErrorClass, string> = {
    bot_blocked: 'Blocked by site (403)',
    not_found: 'Page not found',
    server_error: 'Server error (retrying)',
    timeout: 'Request timed out',
    connection: 'Connection failed',
    redirect_loop: 'Too many redirects (login wall?)',
    header_too_large: 'Cookie header too large',
    unknown: 'Fetch failed',
  };
  return labels[cls];
}

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAYS = [2_000, 5_000];

/**
 * Try fetching an archived version of a page from the Wayback Machine.
 * Used as a fallback when the original site blocks us (403).
 */
async function fetchFromWayback(url: string): Promise<ExtractedArticle | null> {
  try {
    const apiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json() as any;
    if (!data.archived_snapshots?.closest?.available) return null;

    const snapshotUrl: string = data.archived_snapshots.closest.url;
    const snapRes = await fetchWithTimeout(snapshotUrl, getBrowserHeaders(snapshotUrl), FETCH_TIMEOUT_MS);
    if (!snapRes.ok) return null;

    const html = await snapRes.text();
    return extractArticle(html, url);
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, headers: Record<string, string>, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch YouTube transcript via the timedtext/captions API.
 * Extracts caption track list from the video page, then fetches the transcript.
 */
async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
  try {
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetchWithTimeout(pageUrl, getBrowserHeaders(pageUrl), FETCH_TIMEOUT_MS);
    if (!res.ok) return null;
    const html = await res.text();

    // Extract captionTracks from ytInitialPlayerResponse
    const match = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!match) return null;

    const tracks = JSON.parse(match[1]) as Array<{ baseUrl: string; languageCode: string; kind?: string }>;
    if (!tracks || tracks.length === 0) return null;

    // Prefer English manual captions, then auto-generated English, then first available
    const english = tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr');
    const autoEn = tracks.find(t => t.languageCode === 'en');
    const track = english || autoEn || tracks[0];

    const captionRes = await fetchWithTimeout(track.baseUrl, {}, FETCH_TIMEOUT_MS);
    if (!captionRes.ok) return null;
    const xml = await captionRes.text();

    // Parse XML: extract <text> elements
    const lines: string[] = [];
    const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
    let m;
    while ((m = textRegex.exec(xml)) !== null) {
      const text = m[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n/g, ' ')
        .trim();
      if (text) lines.push(text);
    }

    return lines.length > 0 ? lines.join('\n') : null;
  } catch {
    return null;
  }
}

/**
 * Handle YouTube URLs: extract title/description from page, embed video, and include transcript
 */
async function extractYouTube(url: string, videoId: string, options: FetchOptions): Promise<ExtractedArticle | null> {
  const cleanUrl = normalizeUrl(url);
  const headers = getBrowserHeaders(cleanUrl);

  if (options.useBrowserCookies) {
    const domain = getDomainFromUrl(cleanUrl);
    const cookies = getCookiesForDomain(domain);
    if (cookies) headers['Cookie'] = cookies;
  }

  const response = await fetchWithTimeout(cleanUrl, headers, FETCH_TIMEOUT_MS);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);

  const html = await response.text();
  const { document } = parseHTML(html);

  const getMeta = (prop: string): string => {
    const el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
    return el?.getAttribute('content') || '';
  };

  const title = getMeta('og:title') || getMeta('twitter:title')
    || document.querySelector('title')?.textContent || `YouTube Video ${videoId}`;
  const description = getMeta('og:description') || getMeta('description') || '';
  const channelMatch = html.match(/"ownerChannelName"\s*:\s*"([^"]+)"/);
  const channel = channelMatch ? channelMatch[1] : undefined;

  // Build markdown with video thumbnail link (viewer converts to embedded iframe)
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  let markdown = `[![Watch on YouTube](${thumbnailUrl})](${url})\n\n`;
  if (channel) markdown += `*${channel}*\n\n`;

  if (description) {
    markdown += `${description}\n\n`;
  }

  // Try to fetch transcript
  const transcript = await fetchYouTubeTranscript(videoId);
  if (transcript) {
    markdown += `---\n\n## Transcript\n\n${transcript}\n`;
  }

  return {
    title,
    content: `<p>${description}</p>`,
    markdown,
    byline: channel || undefined,
    excerpt: description.slice(0, 200) || undefined,
    thumbnail: thumbnailUrl,
  };
}

/**
 * Detect Apple News URLs (apple.news shortlinks)
 */
function isAppleNewsUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'apple.news' || host === 'www.apple.news';
  } catch {
    return false;
  }
}

/**
 * Resolve Apple News URL to the original article URL by following redirects.
 * Apple News links are shortlinks that 302-redirect to the real article.
 */
async function resolveAppleNewsUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    });
    // The final URL after redirects is the real article
    if (response.url && response.url !== url && !isAppleNewsUrl(response.url)) {
      return response.url;
    }
    // Fallback: try GET if HEAD didn't resolve
    const getResponse = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    });
    if (getResponse.url && getResponse.url !== url && !isAppleNewsUrl(getResponse.url)) {
      return getResponse.url;
    }
    // Last resort: parse the HTML for a canonical URL or meta refresh
    const html = await getResponse.text();
    const canonMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    if (canonMatch) return canonMatch[1];
    const refreshMatch = html.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'\s]+)/i);
    if (refreshMatch) return refreshMatch[1];
  } catch {}
  return url;
}

// ── Academic paper extraction ───────────────────────────────────────

/**
 * Extract arxiv paper ID from a URL for API metadata lookup.
 */
function extractArxivId(url: string): string | null {
  try {
    const m = new URL(url).pathname.match(/^\/(pdf|abs|html)\/(.+?)(?:\.pdf)?$/);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

/**
 * Fetch title/authors/abstract from the arxiv Atom API.
 */
async function fetchArxivMetadata(
  arxivId: string
): Promise<{ title: string; authors: string; abstract: string } | null> {
  try {
    const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}&max_results=1`;
    const response = await fetchWithTimeout(apiUrl, {}, 10_000);
    if (!response.ok) return null;
    const xml = await response.text();

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const parsed = parser.parse(xml);
    const entry = parsed?.feed?.entry;
    if (!entry) return null;

    const title = (typeof entry.title === 'string' ? entry.title : '').replace(/\s+/g, ' ').trim();
    if (!title) return null;

    const authorList = Array.isArray(entry.author) ? entry.author : [entry.author];
    const authors = authorList.map((a: any) => a?.name).filter(Boolean).join(', ');
    const abstract = (typeof entry.summary === 'string' ? entry.summary : '').replace(/\s+/g, ' ').trim();

    return { title, authors, abstract };
  } catch {
    return null;
  }
}

/**
 * Handle academic paper URLs: try HTML version first, fall back to PDF.
 * For arxiv, also fetches metadata from the Atom API.
 */
async function extractAcademicPaper(
  url: string,
  match: { source: PaperSource; htmlUrl: string },
  options: FetchOptions
): Promise<ExtractedArticle | null> {
  const { source, htmlUrl } = match;

  // For arxiv, start metadata fetch (runs concurrently with HTML attempt)
  const metadataPromise = source.name === 'arxiv'
    ? fetchArxivMetadata(extractArxivId(url) || '')
    : Promise.resolve(null);

  // Try the HTML version first
  try {
    const headers = getBrowserHeaders(htmlUrl);
    const response = await fetchWithTimeout(htmlUrl, headers, FETCH_TIMEOUT_MS);
    if (response.ok) {
      const html = await response.text();
      const article = extractArticle(html, response.url || htmlUrl);
      if (article && article.markdown.length > 200) {
        const metadata = await metadataPromise;
        if (metadata) {
          article.title = metadata.title;
          if (metadata.authors) article.byline = metadata.authors;
          if (metadata.abstract) article.excerpt = metadata.abstract;
        }
        return article;
      }
    }
  } catch {
    // HTML not available — fall through to PDF
  }

  // Fall back to PDF extraction via the normal fetch path
  const cleanUrl = normalizeUrl(url);
  const headers = getBrowserHeaders(cleanUrl);
  if (options.useBrowserCookies) {
    const domain = getDomainFromUrl(cleanUrl);
    const cookies = getCookiesForDomain(domain);
    if (cookies) headers['Cookie'] = cookies;
  }

  try {
    const response = await fetchWithTimeout(cleanUrl, headers, FETCH_TIMEOUT_MS);
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/pdf') || isPdfUrl(cleanUrl)) {
      const buffer = await response.arrayBuffer();
      const article = await extractPdf(new Uint8Array(buffer), cleanUrl);
      if (article) {
        const metadata = await metadataPromise;
        if (metadata) {
          article.title = metadata.title;
          if (metadata.authors) article.byline = metadata.authors;
          if (metadata.abstract) article.excerpt = metadata.abstract;
        }
        return article;
      }
    } else {
      // Not a PDF — extract as HTML (e.g., arxiv /abs/ page)
      const html = await response.text();
      const article = extractArticle(html, response.url || cleanUrl);
      if (article) {
        const metadata = await metadataPromise;
        if (metadata) {
          article.title = metadata.title;
          if (metadata.authors) article.byline = metadata.authors;
          if (metadata.abstract) article.excerpt = metadata.abstract;
        }
        return article;
      }
    }
  } catch {
    // PDF fetch failed
  }

  return null;
}

export async function fetchAndExtract(
  url: string,
  options: FetchOptions = {}
): Promise<ExtractedArticle | null> {
  // Check if URL should be skipped entirely
  const skipReason = shouldSkipUrl(url);
  if (skipReason) {
    throw new Error(skipReason);
  }

  // Resolve Apple News shortlinks to original article URLs
  if (isAppleNewsUrl(url)) {
    const resolved = await resolveAppleNewsUrl(url);
    if (resolved !== url) {
      // Recursively extract the resolved URL
      return fetchAndExtract(resolved, options);
    }
  }

  // YouTube videos get special handling — embed + transcript
  if (isYouTubeUrl(url)) {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      return extractYouTube(url, videoId, options);
    }
  }

  // Academic papers: try HTML version first, fall back to improved PDF
  const paperMatch = matchPaperSource(url);
  if (paperMatch) {
    return extractAcademicPaper(url, paperMatch, options);
  }

  // Normalize URL (strip tracking, site-specific transforms)
  const cleanUrl = normalizeUrl(url);
  const headers = getBrowserHeaders(cleanUrl);

  // Add browser cookies if enabled
  if (options.useBrowserCookies) {
    const domain = getDomainFromUrl(cleanUrl);
    const cookies = getCookiesForDomain(domain);
    if (cookies) {
      headers['Cookie'] = cookies;
    }
  }

  let lastError: any;
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // On retry for header_too_large, drop cookies
      const attemptHeaders = { ...headers };
      if (attempt > 0 && lastStatus && (lastStatus === 494 || lastStatus === 431)) {
        delete attemptHeaders['Cookie'];
      }

      const response = await fetchWithTimeout(cleanUrl, attemptHeaders, FETCH_TIMEOUT_MS);

      if (!response.ok) {
        const { cls, retryable } = classifyError(null, response.status);
        if (retryable && attempt < MAX_RETRIES) {
          lastError = new Error(`HTTP ${response.status}`);
          lastStatus = response.status;
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        // For 403s, try Wayback Machine as a last resort
        if (cls === 'bot_blocked') {
          const archived = await fetchFromWayback(url);
          if (archived) return archived;
        }
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';

      // Handle PDF responses
      if (contentType.includes('application/pdf') || isPdfUrl(cleanUrl)) {
        const buffer = await response.arrayBuffer();
        return extractPdf(new Uint8Array(buffer), cleanUrl);
      }

      const html = await response.text();
      // Use final URL after redirects for better relative URL resolution
      return extractArticle(html, response.url || cleanUrl);

    } catch (err: any) {
      lastError = err;
      const { retryable } = classifyError(err, lastStatus);
      if (retryable && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}
