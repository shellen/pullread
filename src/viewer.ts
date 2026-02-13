// ABOUTME: Local HTTP server for viewing PullRead markdown files
// ABOUTME: Serves viewer UI and provides API for listing/reading articles

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, watch, unlinkSync } from 'fs';
import { join, extname, dirname } from 'path';
import { exec, execFile } from 'child_process';
import { homedir } from 'os';
import { VIEWER_HTML } from './viewer-html';
import { summarizeText, loadLLMConfig, saveLLMConfig, loadLLMSettings, saveLLMSettings, getDefaultModel, isAppleAvailable, KNOWN_MODELS, LLMConfig, LLMSettings } from './summarizer';
import { autotagText, autotagBatch, saveMachineTags, hasMachineTags } from './autotagger';
import { APP_ICON } from './app-icon';
import { fetchAndExtract } from './extractor';
import { generateMarkdown, writeArticle, ArticleData, downloadFavicon } from './writer';
import { loadTTSConfig, saveTTSConfig, generateSpeech, getAudioContentType, getKokoroStatus, preloadKokoro, getCachedAudioPath, createTtsSession, generateSessionChunk, TTS_VOICES, TTS_MODELS } from './tts';

interface FileMeta {
  filename: string;
  title: string;
  url: string;
  domain: string;
  bookmarked: string;
  feed: string;
  author: string;
  mtime: string;
  hasSummary: boolean;
  summaryProvider: string;
  summaryModel: string;
  excerpt: string;
  image: string;
  enclosureUrl: string;
  enclosureType: string;
  enclosureDuration: string;
}

export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"');
      meta[key] = val;
    }
  }
  return meta;
}

function listFiles(outputPath: string): FileMeta[] {
  if (!existsSync(outputPath)) return [];

  const files: FileMeta[] = [];
  const entries = readdirSync(outputPath);

  for (const name of entries) {
    if (extname(name) !== '.md') continue;
    const fullPath = join(outputPath, name);
    try {
      const stat = statSync(fullPath);
      if (!stat.isFile()) continue;
      // Read first 3KB for frontmatter + start of body (for image extraction)
      const buf = Buffer.alloc(3072);
      const fd = require('fs').openSync(fullPath, 'r');
      const bytesRead = require('fs').readSync(fd, buf, 0, 3072, 0);
      require('fs').closeSync(fd);
      const head = buf.slice(0, bytesRead).toString('utf-8');
      const meta = parseFrontmatter(head);

      // Extract first image URL from body
      let image = '';
      const fmEnd = head.indexOf('\n---\n');
      if (fmEnd > 0) {
        const bodyStart = head.slice(fmEnd + 5);
        const imgMatch = bodyStart.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
        if (imgMatch) image = imgMatch[1];
      }

      files.push({
        filename: name,
        title: meta.title || name.replace(/\.md$/, ''),
        url: meta.url || '',
        domain: meta.domain || '',
        bookmarked: meta.bookmarked || '',
        feed: meta.feed || '',
        author: meta.author || '',
        mtime: stat.mtime.toISOString(),
        hasSummary: !!meta.summary,
        summaryProvider: meta.summaryProvider || '',
        summaryModel: meta.summaryModel || '',
        excerpt: meta.excerpt || '',
        image,
        enclosureUrl: meta.enclosure_url || '',
        enclosureType: meta.enclosure_type || '',
        enclosureDuration: meta.enclosure_duration || '',
      });
    } catch {
      // Skip unreadable files
    }
  }

  // Sort by bookmarked date descending, fall back to mtime
  files.sort((a, b) => {
    const da = a.bookmarked || a.mtime;
    const db = b.bookmarked || b.mtime;
    return db.localeCompare(da);
  });

  return files;
}

// Annotations storage path
const ANNOTATIONS_DIR = join(homedir(), '.config', 'pullread');
const FEEDS_PATH = join(ANNOTATIONS_DIR, 'feeds.json');
const HIGHLIGHTS_PATH = join(ANNOTATIONS_DIR, 'highlights.json');
const NOTES_PATH = join(ANNOTATIONS_DIR, 'notes.json');
const NOTEBOOKS_PATH = join(ANNOTATIONS_DIR, 'notebooks.json');

function loadJsonFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

function saveJsonFile(path: string, data: unknown): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, data: unknown) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function send404(res: ServerResponse) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

function writeSummaryToFile(filePath: string, summary: string, provider?: string, model?: string): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf-8');
  const match = content.match(/^(---\n)([\s\S]*?)(\n---)([\s\S]*)$/);
  if (!match) return;

  let frontmatter = match[2];
  // Remove existing summary fields if present
  frontmatter = frontmatter.replace(/\nsummary: ".*?"$/m, '');
  frontmatter = frontmatter.replace(/\nsummary: .*$/m, '');
  frontmatter = frontmatter.replace(/\nsummaryProvider: .*$/m, '');
  frontmatter = frontmatter.replace(/\nsummaryModel: .*$/m, '');

  // Add summary to frontmatter
  const escaped = summary.replace(/"/g, '\\"').replace(/\n/g, ' ');
  frontmatter += `\nsummary: "${escaped}"`;
  if (provider) frontmatter += `\nsummaryProvider: ${provider}`;
  if (model) frontmatter += `\nsummaryModel: ${model}`;

  writeFileSync(filePath, `${match[1]}${frontmatter}${match[3]}${match[4]}`);
}

export async function reprocessFile(filePath: string): Promise<{ ok: boolean; title?: string; error?: string }> {
  try {
    if (!existsSync(filePath)) {
      return { ok: false, error: 'File not found' };
    }

    const existing = readFileSync(filePath, 'utf-8');
    const meta = parseFrontmatter(existing);
    if (!meta.url) {
      return { ok: false, error: 'Article has no source URL in frontmatter' };
    }

    const article = await fetchAndExtract(meta.url);
    if (!article) {
      return { ok: false, error: 'Could not extract article from URL' };
    }

    const data: ArticleData = {
      title: meta.title || article.title,
      url: meta.url,
      bookmarkedAt: meta.bookmarked || new Date().toISOString(),
      domain: meta.domain || '',
      content: article.markdown,
      feed: meta.feed || undefined,
      author: article.byline || meta.author || undefined,
      excerpt: article.excerpt || meta.excerpt || undefined,
    };
    const markdown = generateMarkdown(data);

    if (meta.summary) {
      const escaped = meta.summary.replace(/"/g, '\\"').replace(/\n/g, ' ');
      const withSummary = markdown.replace(/\n---\n/, `\nsummary: "${escaped}"\n---\n`);
      writeFileSync(filePath, withSummary, 'utf-8');
    } else {
      writeFileSync(filePath, markdown, 'utf-8');
    }

    return { ok: true, title: data.title };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : 'Reprocessing failed';
    return { ok: false, error: msg };
  }
}

export function startViewer(outputPath: string, port = 7777, openBrowser = true): void {
  // Watch output directory for .md file changes
  let filesChangedAt = Date.now();
  try {
    watch(outputPath, (event, filename) => {
      if (filename && filename.endsWith('.md')) {
        filesChangedAt = Date.now();
      }
    });
  } catch {}

  // Backfill favicons for existing articles in the background
  (async () => {
    try {
      const files = listFiles(outputPath);
      const domains = [...new Set(files.map(f => f.domain).filter(Boolean))];
      for (const domain of domains) {
        await downloadFavicon(domain, outputPath).catch(() => {});
      }
    } catch {}
  })();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    // CORS for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(VIEWER_HTML);
      return;
    }

    // Web app manifest for Safari "Add to Dock" / PWA support
    if (url.pathname === '/manifest.json') {
      const manifest = {
        name: 'PullRead',
        short_name: 'PullRead',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1a6daa',
        icons: [
          { src: '/icon-256.png', sizes: '256x256', type: 'image/png' },
        ],
      };
      res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
      res.end(JSON.stringify(manifest));
      return;
    }

    // Serve app icon for web app manifest / favicon
    if (url.pathname === '/icon-256.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(APP_ICON);
      return;
    }

    // Serve cue sound for article start
    if (url.pathname === '/audio/cue.webm') {
      try {
        const cuePath = join(__dirname, 'signature_cue.webm');
        const cueData = readFileSync(cuePath);
        res.writeHead(200, {
          'Content-Type': 'audio/webm',
          'Content-Length': cueData.length.toString(),
          'Cache-Control': 'max-age=86400',
        });
        res.end(cueData);
      } catch {
        send404(res);
      }
      return;
    }

    // Serve locally cached favicons
    const faviconMatch = url.pathname.match(/^\/favicons\/([a-zA-Z0-9._-]+\.png)$/);
    if (faviconMatch) {
      const faviconPath = join(outputPath, 'favicons', faviconMatch[1]);
      if (existsSync(faviconPath)) {
        const data = readFileSync(faviconPath);
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': 'max-age=604800',
          'Content-Length': data.length.toString(),
        });
        res.end(data);
      } else {
        send404(res);
      }
      return;
    }

    if (url.pathname === '/api/files') {
      sendJson(res, listFiles(outputPath));
      return;
    }

    // Lightweight poll: returns timestamp of last .md file change
    if (url.pathname === '/api/files-changed') {
      sendJson(res, { changedAt: filesChangedAt });
      return;
    }

    // Inbox API — for URL scheme, share extension, and services menu saved URLs
    const inboxPath = join(homedir(), '.config', 'pullread', 'inbox.json');
    if (url.pathname === '/api/inbox') {
      if (req.method === 'GET') {
        const inbox = existsSync(inboxPath) ? JSON.parse(readFileSync(inboxPath, 'utf-8')) : [];
        sendJson(res, inbox);
        return;
      }
      if (req.method === 'DELETE') {
        writeFileSync(inboxPath, '[]');
        sendJson(res, { ok: true });
        return;
      }
    }
    if (url.pathname === '/api/save' && req.method === 'POST') {
      let body = '';
      req.on('data', (c: Buffer) => { body += c.toString(); });
      req.on('end', async () => {
        try {
          const { url: articleUrl } = JSON.parse(body);
          if (!articleUrl) { res.writeHead(400); res.end('{"error":"url required"}'); return; }

          // Fetch and save the article immediately
          try {
            const article = await fetchAndExtract(articleUrl);
            if (!article) {
              res.writeHead(422);
              res.end(JSON.stringify({ error: 'Could not extract article content' }));
              return;
            }
            const domain = new URL(articleUrl).hostname.replace(/^www\./, '');
            const filename = writeArticle(outputPath, {
              title: article.title || articleUrl,
              url: articleUrl,
              bookmarkedAt: new Date().toISOString(),
              domain,
              content: article.markdown,
              feed: 'inbox',
              author: article.byline,
              excerpt: article.excerpt,
            });
            sendJson(res, { ok: true, filename });
          } catch (err) {
            // Fetch failed — queue to inbox for retry during next sync
            let inbox: { url: string; addedAt: string; title?: string }[] = [];
            if (existsSync(inboxPath)) {
              try { inbox = JSON.parse(readFileSync(inboxPath, 'utf-8')); } catch {}
            }
            inbox.push({ url: articleUrl, addedAt: new Date().toISOString() });
            const dir = join(homedir(), '.config', 'pullread');
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            writeFileSync(inboxPath, JSON.stringify(inbox, null, 2));
            sendJson(res, { ok: true, queued: true, error: err instanceof Error ? err.message : 'Fetch failed' });
          }
        } catch { res.writeHead(400); res.end('{"error":"invalid json"}'); }
      });
      return;
    }

    if (url.pathname === '/api/file') {
      const filename = url.searchParams.get('name');
      if (!filename || filename.includes('..') || filename.includes('/')) {
        send404(res);
        return;
      }
      const filePath = join(outputPath, filename);
      if (!existsSync(filePath)) {
        send404(res);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(readFileSync(filePath, 'utf-8'));
      return;
    }

    // Highlights API
    if (url.pathname === '/api/highlights') {
      if (req.method === 'GET') {
        const name = url.searchParams.get('name');
        const allHighlights = loadJsonFile(HIGHLIGHTS_PATH) as Record<string, unknown[]>;
        if (name) {
          sendJson(res, allHighlights[name] || []);
        } else {
          sendJson(res, allHighlights);
        }
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = JSON.parse(await readBody(req));
          const { name, highlights } = body;
          if (!name) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'name is required' }));
            return;
          }
          const allHighlights = loadJsonFile(HIGHLIGHTS_PATH) as Record<string, unknown[]>;
          allHighlights[name] = highlights || [];
          saveJsonFile(HIGHLIGHTS_PATH, allHighlights);
          sendJson(res, { ok: true });
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid request body' }));
        }
        return;
      }
    }

    // Notes API
    if (url.pathname === '/api/notes') {
      if (req.method === 'GET') {
        const name = url.searchParams.get('name');
        const allNotes = loadJsonFile(NOTES_PATH) as Record<string, unknown>;
        if (name) {
          sendJson(res, allNotes[name] || { articleNote: '', annotations: [], tags: [], isFavorite: false });
        } else {
          sendJson(res, allNotes);
        }
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = JSON.parse(await readBody(req));
          const { name, articleNote, annotations, tags, isFavorite } = body;
          if (!name) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'name is required' }));
            return;
          }
          const allNotes = loadJsonFile(NOTES_PATH) as Record<string, any>;
          const existing = allNotes[name] || {};
          allNotes[name] = {
            articleNote: articleNote || '',
            annotations: annotations || [],
            tags: tags || [],
            isFavorite: !!isFavorite,
            // Preserve machine tags — they're managed by the autotagger, not the UI
            ...(existing.machineTags ? { machineTags: existing.machineTags } : {})
          };
          saveJsonFile(NOTES_PATH, allNotes);
          sendJson(res, { ok: true });
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid request body' }));
        }
        return;
      }
    }

    // Notebooks API
    if (url.pathname === '/api/notebooks') {
      if (req.method === 'GET') {
        const id = url.searchParams.get('id');
        const all = loadJsonFile(NOTEBOOKS_PATH) as Record<string, any>;
        if (id) {
          sendJson(res, all[id] || null);
        } else {
          sendJson(res, all);
        }
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = JSON.parse(await readBody(req));
          const all = loadJsonFile(NOTEBOOKS_PATH) as Record<string, any>;
          const id = body.id || ('nb-' + Math.random().toString(36).slice(2, 8));
          const existing = all[id] || {};
          all[id] = {
            id,
            title: body.title ?? existing.title ?? '',
            content: body.content ?? existing.content ?? '',
            notes: body.notes ?? existing.notes ?? [],
            sources: body.sources ?? existing.sources ?? [],
            tags: body.tags ?? existing.tags ?? [],
            createdAt: existing.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          saveJsonFile(NOTEBOOKS_PATH, all);
          sendJson(res, { ok: true, id });
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid request body' }));
        }
        return;
      }
      if (req.method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (!id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'id is required' }));
          return;
        }
        const all = loadJsonFile(NOTEBOOKS_PATH) as Record<string, any>;
        delete all[id];
        saveJsonFile(NOTEBOOKS_PATH, all);
        sendJson(res, { ok: true });
        return;
      }
    }

    // Weekly review
    if (url.pathname === '/api/review' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const days = body.days || 7;
        const { generateAndSaveReview } = await import('./review');
        const result = await generateAndSaveReview(outputPath, days);
        if (!result) {
          sendJson(res, { error: 'No articles found in the past ' + days + ' days' });
        } else {
          sendJson(res, { filename: result.filename, review: result.review });
        }
      } catch (err: any) {
        sendJson(res, { error: err.message || 'Failed to generate review' });
      }
      return;
    }

    if (url.pathname === '/api/review' && req.method === 'GET') {
      try {
        const days = parseInt(url.searchParams.get('days') || '7', 10);
        const { getRecentArticles } = await import('./review');
        const articles = getRecentArticles(outputPath, days);
        sendJson(res, { count: articles.length, articles: articles.map(a => ({ title: a.title, domain: a.domain, bookmarked: a.bookmarked })) });
      } catch {
        sendJson(res, { count: 0, articles: [] });
      }
      return;
    }

    // Feed title discovery
    if (url.pathname === '/api/feed-title' && req.method === 'GET') {
      const feedUrl = url.searchParams.get('url');
      if (!feedUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'url parameter required' }));
        return;
      }
      try {
        const { fetchFeedTitle } = await import('./feed');
        const title = await fetchFeedTitle(feedUrl);
        sendJson(res, { title: title || null });
      } catch {
        sendJson(res, { title: null });
      }
      return;
    }

    // Feed auto-discovery (for blog URLs that aren't feeds themselves)
    if (url.pathname === '/api/feed-discover' && req.method === 'GET') {
      const pageUrl = url.searchParams.get('url');
      if (!pageUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'url parameter required' }));
        return;
      }
      try {
        const { discoverFeed } = await import('./feed');
        const result = await discoverFeed(pageUrl);
        sendJson(res, result || { feedUrl: null, title: null });
      } catch {
        sendJson(res, { feedUrl: null, title: null });
      }
      return;
    }

    // App config API (feeds.json — output path, feeds, sync interval, browser cookies)
    if (url.pathname === '/api/config') {
      if (req.method === 'GET') {
        const config = loadJsonFile(FEEDS_PATH) as Record<string, unknown>;
        sendJson(res, {
          outputPath: config.outputPath || '',
          feeds: config.feeds || {},
          syncInterval: config.syncInterval || '1h',
          useBrowserCookies: !!config.useBrowserCookies,
          configured: !!(config.outputPath && config.feeds && Object.keys(config.feeds as object).length > 0)
        });
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = JSON.parse(await readBody(req));
          const existing = loadJsonFile(FEEDS_PATH);
          // Merge incoming fields with existing config
          if (body.outputPath !== undefined) existing.outputPath = body.outputPath;
          if (body.feeds !== undefined) existing.feeds = body.feeds;
          if (body.syncInterval !== undefined) existing.syncInterval = body.syncInterval;
          if (body.useBrowserCookies !== undefined) existing.useBrowserCookies = body.useBrowserCookies;
          saveJsonFile(FEEDS_PATH, existing);

          // Create output directory if it doesn't exist
          if (existing.outputPath) {
            const expandedPath = (existing.outputPath as string).replace(/^~/, homedir());
            if (!existsSync(expandedPath)) {
              mkdirSync(expandedPath, { recursive: true });
            }
          }

          sendJson(res, { ok: true });
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid request body' }));
        }
        return;
      }
    }

    // Folder picker API — opens native macOS folder dialog via osascript
    if (url.pathname === '/api/pick-folder' && req.method === 'POST') {
      const defaultPath = homedir() + '/Documents';
      exec(
        `osascript -e 'set p to POSIX path of (choose folder with prompt "Choose output folder" default location POSIX file "${defaultPath}")' 2>/dev/null`,
        { timeout: 60000 },
        (err, stdout) => {
          if (err) {
            // User cancelled or osascript not available
            sendJson(res, { cancelled: true });
          } else {
            const folder = stdout.trim().replace(/\/$/, '');
            // Convert absolute path back to ~/... for display
            const home = homedir();
            const display = folder.startsWith(home) ? '~' + folder.slice(home.length) : folder;
            sendJson(res, { path: display });
          }
        }
      );
      return;
    }

    // Settings API (LLM config — multi-provider)
    const ALL_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter', 'apple'] as const;
    if (url.pathname === '/api/settings') {
      if (req.method === 'GET') {
        const settings = loadLLMSettings();
        const providers: Record<string, { hasKey: boolean; model: string }> = {};
        for (const p of ALL_PROVIDERS) {
          const config = settings.providers[p];
          providers[p] = {
            hasKey: p === 'apple' || !!(config?.apiKey),
            model: config?.model || getDefaultModel(p)
          };
        }
        sendJson(res, {
          llm: {
            defaultProvider: settings.defaultProvider,
            providers,
            appleAvailable: isAppleAvailable()
          }
        });
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = JSON.parse(await readBody(req));

          // New multi-provider format: { defaultProvider, providers: { ... } }
          if (body.defaultProvider) {
            const validSet = new Set<string>(ALL_PROVIDERS);
            if (!validSet.has(body.defaultProvider)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Unknown provider: ' + body.defaultProvider }));
              return;
            }

            const current = loadLLMSettings();
            const newSettings: LLMSettings = {
              defaultProvider: body.defaultProvider,
              providers: { ...current.providers }
            };

            if (body.providers) {
              for (const [p, config] of Object.entries(body.providers as Record<string, any>)) {
                if (!validSet.has(p)) continue; // skip unknown providers
                const key = p as import('./summarizer').Provider;
                const existing = current.providers[key] || {};
                newSettings.providers[key] = {
                  // Only update apiKey if a non-empty value was sent
                  apiKey: config.apiKey || existing.apiKey || '',
                  model: config.model || existing.model || getDefaultModel(p)
                };
              }
            }

            saveLLMSettings(newSettings);
            sendJson(res, { ok: true });
            return;
          }

          // Legacy single-provider format: { provider, apiKey, model }
          const { provider, apiKey, model } = body;
          if (!provider) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'provider or defaultProvider is required' }));
            return;
          }
          if (provider !== 'apple' && !apiKey) {
            const current = loadLLMSettings();
            if (!current.providers[provider as import('./summarizer').Provider]?.apiKey) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'apiKey is required for this provider' }));
              return;
            }
          }
          saveLLMConfig({ provider, apiKey: apiKey || '', model: model || getDefaultModel(provider) });
          sendJson(res, { ok: true });
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid request body' }));
        }
        return;
      }
    }

    // Sync status API
    if (url.pathname === '/api/sync-status' && req.method === 'GET') {
      const config = loadJsonFile(join(homedir(), '.config', 'pullread', 'feeds.json')) as Record<string, unknown>;
      const syncInterval = (config as any).syncInterval || '1h';
      const intervals: Record<string, number> = { '30m': 30, '1h': 60, '4h': 240, '12h': 720 };
      const minutes = intervals[syncInterval as string] || null;

      // Check last sync from file mtime
      const outputFiles = existsSync(outputPath) ? readdirSync(outputPath).filter(f => f.endsWith('.md')) : [];
      let lastSyncFile = null;
      let latestMtime = 0;
      for (const f of outputFiles.slice(-20)) {
        try {
          const mt = statSync(join(outputPath, f)).mtimeMs;
          if (mt > latestMtime) { latestMtime = mt; lastSyncFile = f; }
        } catch {}
      }

      sendJson(res, {
        syncInterval,
        intervalMinutes: minutes,
        lastActivity: latestMtime > 0 ? new Date(latestMtime).toISOString() : null,
        articleCount: outputFiles.length
      });
      return;
    }

    // Auto-tag API
    if (url.pathname === '/api/autotag' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const { name, text } = body;

        // Direct text mode (e.g. notebook content) — no caching, just tag and return
        if (text) {
          const result = await autotagText(text);
          sendJson(res, { machineTags: result.machineTags, model: result.model });
          return;
        }

        if (!name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'name or text is required' }));
          return;
        }

        const filePath = join(outputPath, name);
        if (!existsSync(filePath)) {
          send404(res);
          return;
        }

        // Check if already tagged
        if (hasMachineTags(name)) {
          const allNotes = loadJsonFile(NOTES_PATH) as Record<string, any>;
          sendJson(res, { machineTags: allNotes[name]?.machineTags || [], cached: true });
          return;
        }

        const content = readFileSync(filePath, 'utf-8');
        const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
        const articleText = match ? match[1] : content;

        const result = await autotagText(articleText);
        if (result.machineTags.length > 0) {
          saveMachineTags(name, result.machineTags);
        }

        sendJson(res, { machineTags: result.machineTags, model: result.model });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Auto-tagging failed';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
      return;
    }

    // Batch autotag API — tag all articles (or force re-tag)
    if (url.pathname === '/api/autotag-batch' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const force = body.force === true;
        const llmConfig = loadLLMConfig();
        if (!llmConfig) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No LLM provider configured. Add an API key in Settings.' }));
          return;
        }
        const result = await autotagBatch(outputPath, { config: llmConfig, force });
        sendJson(res, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Batch auto-tagging failed';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
      return;
    }

    // Summarize API
    if (url.pathname === '/api/summarize' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const { name, text } = body;
        if (!text && !name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'text or name is required' }));
          return;
        }

        const config = loadLLMConfig();
        const provider = config?.provider || 'apple';

        let articleText = text;
        if (!articleText && name) {
          const filePath = join(outputPath, name);
          if (!existsSync(filePath)) {
            send404(res);
            return;
          }
          const content = readFileSync(filePath, 'utf-8');

          // Block summarization of review articles
          const fm = parseFrontmatter(content);
          if (fm.feed === 'weekly-review' || fm.feed === 'daily-review') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Reviews cannot be summarized' }));
            return;
          }

          // Strip frontmatter
          const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
          articleText = match ? match[1] : content;
        }

        const result = await summarizeText(articleText);

        // If summarized by filename, write the summary into the markdown frontmatter
        if (name) {
          writeSummaryToFile(join(outputPath, name), result.summary, provider, result.model);
        }

        sendJson(res, { summary: result.summary, model: result.model, provider });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Summarization failed';
        // Provide user-friendly error messages
        let userMsg = msg;
        if (msg.includes('FoundationModels not found')) {
          userMsg = 'Apple Intelligence failed — FoundationModels not found. Run "xcode-select --install" in Terminal, or choose a different provider in Settings.';
        } else if (msg.includes('Apple Intelligence requires macOS 26')) {
          userMsg = 'Apple Intelligence requires macOS 26 (Tahoe). Update macOS or choose a different provider in Settings.';
        } else if (msg.includes('Apple Intelligence is not available')) {
          userMsg = 'Apple Intelligence is not available on this Mac. Choose a cloud provider in Settings.';
        } else if (msg.includes('Apple Intelligence error')) {
          userMsg = 'Apple Intelligence encountered an error. Try again, or switch to a cloud provider for this article.';
        } else if (msg.includes('context window') || msg.includes('too long') || msg.includes('max_tokens') || msg.includes('exceededContextWindowSize')) {
          userMsg = 'Article too long for this model. Try a model with a larger context window.';
        } else if (msg.includes('No API key')) {
          userMsg = 'No model configured. Open Settings to add a provider.';
        } else if (msg.includes('API error 429') || msg.includes('Rate limit') || msg.includes('rate limit')) {
          userMsg = 'Rate limited by provider. Wait a moment and try again, or switch to a different model.';
        }
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: userMsg }));
      }
      return;
    }

    // Reprocess API — re-fetch article from its frontmatter URL
    if (url.pathname === '/api/reprocess' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const { name } = body;
        if (!name || name.includes('..') || name.includes('/')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'valid name is required' }));
          return;
        }

        const filePath = join(outputPath, name);
        const result = await reprocessFile(filePath);
        if (result.ok) {
          sendJson(res, { ok: true, title: result.title });
        } else {
          const status = result.error === 'File not found' ? 404 : result.error?.includes('no source URL') ? 400 : 500;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
        }
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : 'Reprocessing failed';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
      return;
    }

    // Reimport all articles — SSE progress stream
    if (url.pathname === '/api/reimport-all' && req.method === 'POST') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const allFiles = existsSync(outputPath) ? readdirSync(outputPath).filter(f => f.endsWith('.md')) : [];

      // Parse frontmatter to get URLs; skip files without a source URL
      const filesWithUrls: { name: string; domain: string }[] = [];
      for (const name of allFiles) {
        try {
          const content = readFileSync(join(outputPath, name), 'utf-8');
          const meta = parseFrontmatter(content);
          if (meta.url) {
            let domain = '';
            try { domain = new URL(meta.url).hostname; } catch {}
            filesWithUrls.push({ name, domain });
          }
        } catch {}
      }

      // Sort by domain to batch same-host requests
      filesWithUrls.sort((a, b) => a.domain.localeCompare(b.domain));

      const total = filesWithUrls.length;
      let succeeded = 0;
      let failed = 0;
      let lastDomain = '';

      for (let i = 0; i < filesWithUrls.length; i++) {
        const { name, domain } = filesWithUrls[i];

        // 1-second delay between requests to the same host
        if (domain && domain === lastDomain) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        lastDomain = domain;

        const result = await reprocessFile(join(outputPath, name));
        const done = i + 1;

        if (result.ok) {
          succeeded++;
          res.write(`data: ${JSON.stringify({ done, total, current: name, ok: true })}\n\n`);
        } else {
          failed++;
          res.write(`data: ${JSON.stringify({ done, total, current: name, ok: false, error: result.error })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ complete: true, succeeded, failed })}\n\n`);
      res.end();
      return;
    }

    // TTS Settings API
    if (url.pathname === '/api/tts-settings') {
      if (req.method === 'GET') {
        const config = loadTTSConfig();
        const kokoroStatus = getKokoroStatus();
        sendJson(res, {
          provider: config.provider,
          voice: config.voice || '',
          model: config.model || '',
          hasKey: config.provider === 'browser' || config.provider === 'kokoro' || !!config.apiKey,
          voices: TTS_VOICES,
          models: TTS_MODELS,
          kokoro: kokoroStatus,
        });
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = JSON.parse(await readBody(req));
          // Preserve existing API key if client sends preserveKey flag
          if (body.preserveKey) {
            const existing = loadTTSConfig();
            if (existing.apiKey) body.apiKey = existing.apiKey;
            delete body.preserveKey;
          }
          saveTTSConfig(body);
          sendJson(res, { ok: true });
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid request body' }));
        }
        return;
      }
    }

    // TTS progressive playback — start a chunked session
    if (url.pathname === '/api/tts/start' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const { name } = body;
        if (!name || name.includes('..') || name.includes('/')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'valid name is required' }));
          return;
        }

        const config = loadTTSConfig();
        if (config.provider === 'browser') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Browser TTS is handled client-side' }));
          return;
        }

        // Check disk cache first
        if (getCachedAudioPath(name, config)) {
          sendJson(res, { cached: true });
          return;
        }

        const filePath = join(outputPath, name);
        if (!existsSync(filePath)) {
          send404(res);
          return;
        }

        const content = readFileSync(filePath, 'utf-8');
        const meta = parseFrontmatter(content);
        const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
        const bodyText = match ? match[1] : content;
        const articleText = (meta.title ? meta.title + '\n\n' : '') + bodyText;

        const session = createTtsSession(name, articleText, config);
        sendJson(res, { id: session.id, totalChunks: session.totalChunks, cached: false });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'TTS session creation failed';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
      return;
    }

    // TTS progressive playback — generate and return a single chunk
    const chunkMatch = url.pathname.match(/^\/api\/tts\/chunk\/([a-f0-9]+)\/(\d+)$/);
    if (chunkMatch && req.method === 'GET') {
      try {
        const sessionId = chunkMatch[1];
        const chunkIndex = parseInt(chunkMatch[2], 10);
        const config = loadTTSConfig();

        const audio = await generateSessionChunk(sessionId, chunkIndex);

        res.writeHead(200, {
          'Content-Type': getAudioContentType(config.provider),
          'Content-Length': audio.length.toString(),
        });
        res.end(audio);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Chunk generation failed';
        const isNativeLoadError = msg.includes('Kokoro voice engine could not load') || msg.includes('not available in this build');
        const status = isNativeLoadError ? 503 : 500;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg, ...(isNativeLoadError && { fallback: 'browser' }) }));
      }
      return;
    }

    // TTS cached audio — serve pre-generated audio via GET for HTMLAudioElement playback
    if (url.pathname === '/api/tts/play' && req.method === 'GET') {
      try {
        const name = url.searchParams.get('name');
        if (!name || name.includes('..') || name.includes('/')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'valid name is required' }));
          return;
        }
        const config = loadTTSConfig();
        const filePath = join(outputPath, name);
        if (!existsSync(filePath)) { send404(res); return; }

        const content = readFileSync(filePath, 'utf-8');
        const meta = parseFrontmatter(content);
        const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
        const bodyText = match ? match[1] : content;
        const articleText = (meta.title ? meta.title + '\n\n' : '') + bodyText;
        const audio = await generateSpeech(name, articleText, config);

        res.writeHead(200, {
          'Content-Type': getAudioContentType(config.provider),
          'Content-Length': audio.length.toString(),
          'Cache-Control': 'max-age=86400',
        });
        res.end(audio);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'TTS generation failed';
        const isNativeLoadError = msg.includes('Kokoro voice engine could not load') || msg.includes('not available in this build');
        const status = isNativeLoadError ? 503 : 500;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg, ...(isNativeLoadError && { fallback: 'browser' }) }));
      }
      return;
    }

    // TTS Audio generation API (full article, for cached playback and backward compat)
    if (url.pathname === '/api/tts' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const { name } = body;
        if (!name || name.includes('..') || name.includes('/')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'valid name is required' }));
          return;
        }

        const filePath = join(outputPath, name);
        if (!existsSync(filePath)) {
          send404(res);
          return;
        }

        const config = loadTTSConfig();
        if (config.provider === 'browser') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Browser TTS is handled client-side' }));
          return;
        }

        const content = readFileSync(filePath, 'utf-8');
        const meta = parseFrontmatter(content);
        const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
        const bodyText = match ? match[1] : content;
        const articleText = (meta.title ? meta.title + '\n\n' : '') + bodyText;

        const audio = await generateSpeech(name, articleText, config);

        res.writeHead(200, {
          'Content-Type': getAudioContentType(config.provider),
          'Content-Length': audio.length.toString(),
          'Cache-Control': 'max-age=86400',
        });
        res.end(audio);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'TTS generation failed';
        // When Kokoro fails due to native library issues, tell the client to
        // fall back to browser TTS so the user still hears something.
        const isNativeLoadError = msg.includes('Kokoro voice engine could not load') || msg.includes('not available in this build');
        const status = isNativeLoadError ? 503 : 500;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg, ...(isNativeLoadError && { fallback: 'browser' }) }));
      }
      return;
    }

    // Kokoro preload API — trigger background model download
    if (url.pathname === '/api/kokoro-preload' && req.method === 'POST') {
      const config = loadTTSConfig();
      const model = config.model || 'kokoro-v1-q8';
      sendJson(res, { status: 'downloading' });
      preloadKokoro(model).catch(() => {});
      return;
    }

    // Backup API — export all user data as a single JSON download
    if (url.pathname === '/api/backup' && req.method === 'GET') {
      const backupFiles = ['feeds.json', 'settings.json', 'highlights.json', 'notes.json', 'notebooks.json', 'inbox.json'];
      const backup: Record<string, unknown> = {
        _pullread_backup: true,
        _version: '1',
        _createdAt: new Date().toISOString(),
      };
      for (const f of backupFiles) {
        const p = join(ANNOTATIONS_DIR, f);
        if (existsSync(p)) {
          try { backup[f] = JSON.parse(readFileSync(p, 'utf-8')); } catch {}
        }
      }
      // Include sync database if it exists
      const dbPath = join(ANNOTATIONS_DIR, 'pullread.json');
      if (existsSync(dbPath)) {
        try { backup['pullread.json'] = JSON.parse(readFileSync(dbPath, 'utf-8')); } catch {}
      }
      const body = JSON.stringify(backup, null, 2);
      const dateStr = new Date().toISOString().slice(0, 10);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="pullread-backup-${dateStr}.json"`,
      });
      res.end(body);
      return;
    }

    // Restore API — import a backup JSON file
    if (url.pathname === '/api/restore' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        if (!body._pullread_backup) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not a valid PullRead backup file' }));
          return;
        }
        const restorableFiles = ['feeds.json', 'settings.json', 'highlights.json', 'notes.json', 'notebooks.json', 'inbox.json', 'pullread.json'];
        let restored = 0;
        for (const f of restorableFiles) {
          if (body[f] && typeof body[f] === 'object') {
            saveJsonFile(join(ANNOTATIONS_DIR, f), body[f]);
            restored++;
          }
        }
        sendJson(res, { ok: true, restored });
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid backup file' }));
      }
      return;
    }

    // Grammar check API — uses macOS NSSpellChecker (on-device, no cloud)
    if (url.pathname === '/api/grammar' && req.method === 'POST') {
      if (process.platform !== 'darwin') {
        res.writeHead(501, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Grammar checking requires macOS', matches: [] }));
        return;
      }
      try {
        const body = JSON.parse(await readBody(req));
        const { text } = body;
        if (!text || typeof text !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'text is required' }));
          return;
        }

        const configDir = join(homedir(), '.config', 'pullread');
        const tmpText = join(configDir, '.grammar-input.txt');
        const swiftScript = join(configDir, '.grammar-check.swift');

        writeFileSync(tmpText, text);

        // Swift script that uses NSSpellChecker for grammar + spelling
        const scriptContent = [
          'import Cocoa',
          'import Foundation',
          '',
          'let path = CommandLine.arguments[1]',
          'let text = try String(contentsOfFile: path, encoding: .utf8)',
          'let checker = NSSpellChecker.shared',
          'var results: [[String: Any]] = []',
          '',
          '// Grammar check',
          'var offset = 0',
          'while offset < text.count {',
          '    var detailsPtr: NSArray?',
          '    let range = checker.checkGrammar(of: text, startingAt: offset, language: nil, wrap: false, inSpellDocumentWithTag: 0, details: &detailsPtr)',
          '    if range.location == NSNotFound || range.length == 0 { break }',
          '    if let details = detailsPtr as? [[String: Any]] {',
          '        for detail in details {',
          '            let dRange = (detail["NSGrammarRange"] as? NSValue)?.rangeValue ?? range',
          '            let startIdx = text.index(text.startIndex, offsetBy: dRange.location)',
          '            let endIdx = text.index(startIdx, offsetBy: min(dRange.length, text.count - dRange.location))',
          '            let snippet = String(text[startIdx..<endIdx])',
          '            var entry: [String: Any] = [',
          '                "offset": dRange.location,',
          '                "length": dRange.length,',
          '                "context": snippet',
          '            ]',
          '            if let msg = detail["NSGrammarUserDescription"] as? String {',
          '                entry["message"] = msg',
          '            }',
          '            if let corrections = detail["NSGrammarCorrections"] as? [String] {',
          '                entry["replacements"] = corrections',
          '            }',
          '            results.append(entry)',
          '        }',
          '    }',
          '    offset = range.location + range.length',
          '}',
          '',
          '// Spelling check',
          'var spellOffset = 0',
          'while spellOffset < text.count {',
          '    let range = checker.checkSpelling(of: text, startingAt: spellOffset)',
          '    if range.location == NSNotFound { break }',
          '    let startIdx = text.index(text.startIndex, offsetBy: range.location)',
          '    let endIdx = text.index(startIdx, offsetBy: min(range.length, text.count - range.location))',
          '    let word = String(text[startIdx..<endIdx])',
          '    let guesses = checker.guesses(forWordRange: range, in: text, language: nil, inSpellDocumentWithTag: 0) ?? []',
          '    results.append([',
          '        "offset": range.location,',
          '        "length": range.length,',
          '        "context": word,',
          '        "message": "Possible misspelling: \\(word)",',
          '        "replacements": guesses.prefix(5).map { $0 }',
          '    ])',
          '    spellOffset = range.location + range.length',
          '}',
          '',
          '// Sort by offset and output JSON',
          'results.sort { ($0["offset"] as? Int ?? 0) < ($1["offset"] as? Int ?? 0) }',
          'let json = try JSONSerialization.data(withJSONObject: ["matches": results], options: .prettyPrinted)',
          'print(String(data: json, encoding: .utf8)!)',
        ].join('\n');

        writeFileSync(swiftScript, scriptContent);

        const result = await new Promise<string>((resolve, reject) => {
          execFile('swift', [swiftScript, tmpText], {
            encoding: 'utf-8',
            timeout: 30_000,
          }, (err, stdout, stderr) => {
            try { unlinkSync(tmpText); } catch {}
            if (err) reject(new Error(stderr || err.message));
            else resolve(stdout);
          });
        });

        const data = JSON.parse(result.trim());
        sendJson(res, data);
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : 'Grammar check failed';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg, matches: [] }));
      }
      return;
    }

    send404(res);
  });

  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    console.log(`PullRead viewer running at ${url}`);
    console.log(`Reading from: ${outputPath}`);
    console.log('Press Ctrl+C to stop\n');

    // Eagerly preload Kokoro if it's the configured TTS provider so the model
    // is warm on first listen and native-library errors surface immediately.
    const ttsConfig = loadTTSConfig();
    if (ttsConfig.provider === 'kokoro') {
      const model = ttsConfig.model || 'kokoro-v1-q8';
      const status = getKokoroStatus();
      if (status.bundled) {
        console.log(`[TTS] Kokoro model bundled with app — loading ${model}...`);
      } else {
        console.log(`[TTS] Kokoro is configured — preloading ${model} (may download on first run)...`);
      }
      preloadKokoro(model).then(result => {
        if (result.ready) {
          console.log('[TTS] Kokoro model loaded and ready');
        } else {
          console.error('[TTS] Kokoro preload failed:', result.error);
          console.error('[TTS] Audio will fall back to browser speech synthesis');
        }
      });
    }

    if (openBrowser) {
      const cmd = process.platform === 'darwin' ? 'open'
        : process.platform === 'win32' ? 'start'
        : 'xdg-open';
      exec(`${cmd} ${url}`);
    }
  });
}
