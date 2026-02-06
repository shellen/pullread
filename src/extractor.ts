// ABOUTME: Extracts article content from web pages using Readability
// ABOUTME: Converts HTML to clean markdown for storage, with retry and fallback extraction

import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { getCookiesForDomain, getDomainFromUrl } from './cookies';
import { extractText, getDocumentProxy } from 'unpdf';

export interface ExtractedArticle {
  title: string;
  content: string;
  markdown: string;
  byline?: string;
  excerpt?: string;
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
    const parsed = new URL(baseUrl);
    origin = parsed.origin;
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

  return markdown;
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
    return {
      title: article.title || 'Untitled',
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

  const markdown = body;
  return {
    title,
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

/**
 * Extract text content from a PDF and return as a markdown article.
 * Uses unpdf (Mozilla PDF.js) for text extraction.
 */
export async function extractPdf(data: Uint8Array, url: string): Promise<ExtractedArticle | null> {
  try {
    const pdf = await getDocumentProxy(data);
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const textStr = typeof text === 'string' ? text : (text as string[]).join('\n\n');

    // If very little text extracted, likely a scanned/image PDF
    if (textStr.trim().length < 100) {
      return null;
    }

    // Try to extract title from first line or URL
    const lines = textStr.trim().split('\n').filter(l => l.trim());
    const firstLine = lines[0] || '';
    const title = firstLine.length > 10 && firstLine.length < 200
      ? firstLine
      : url.split('/').pop()?.replace('.pdf', '').replace(/[-_]/g, ' ') || 'Untitled PDF';

    // Format as markdown with page count info
    const markdown = `*PDF document · ${totalPages} page${totalPages !== 1 ? 's' : ''}*\n\n${textStr}`;

    return {
      title,
      content: `<p>${textStr}</p>`,
      markdown,
      excerpt: textStr.slice(0, 200).trim()
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

export async function fetchAndExtract(
  url: string,
  options: FetchOptions = {}
): Promise<ExtractedArticle | null> {
  // Check if URL should be skipped entirely
  const skipReason = shouldSkipUrl(url);
  if (skipReason) {
    throw new Error(skipReason);
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
      return extractArticle(html, cleanUrl);

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
