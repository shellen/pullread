// ABOUTME: Local HTTP server for viewing PullRead markdown files
// ABOUTME: Serves viewer UI and provides API for listing/reading articles

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, extname, dirname } from 'path';
import { exec } from 'child_process';
import { homedir } from 'os';
import { VIEWER_HTML } from './viewer-html';
import { summarizeText, loadLLMConfig, saveLLMConfig, getDefaultModel, KNOWN_MODELS, LLMConfig } from './summarizer';
import { APP_ICON } from './app-icon';

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
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1');
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
      // Read only first 1KB for frontmatter
      const buf = Buffer.alloc(1024);
      const fd = require('fs').openSync(fullPath, 'r');
      const bytesRead = require('fs').readSync(fd, buf, 0, 1024, 0);
      require('fs').closeSync(fd);
      const head = buf.slice(0, bytesRead).toString('utf-8');
      const meta = parseFrontmatter(head);

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
const HIGHLIGHTS_PATH = join(ANNOTATIONS_DIR, 'highlights.json');
const NOTES_PATH = join(ANNOTATIONS_DIR, 'notes.json');

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

function writeSummaryToFile(filePath: string, summary: string): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf-8');
  const match = content.match(/^(---\n)([\s\S]*?)(\n---)([\s\S]*)$/);
  if (!match) return;

  let frontmatter = match[2];
  // Remove existing summary if present
  frontmatter = frontmatter.replace(/\nsummary: ".*?"$/m, '');
  frontmatter = frontmatter.replace(/\nsummary: .*$/m, '');

  // Add summary to frontmatter
  const escaped = summary.replace(/"/g, '\\"').replace(/\n/g, ' ');
  frontmatter += `\nsummary: "${escaped}"`;

  writeFileSync(filePath, `${match[1]}${frontmatter}${match[3]}${match[4]}`);
}

export function startViewer(outputPath: string, port = 7777): void {
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

    if (url.pathname === '/api/files') {
      sendJson(res, listFiles(outputPath));
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
          const allNotes = loadJsonFile(NOTES_PATH) as Record<string, unknown>;
          allNotes[name] = {
            articleNote: articleNote || '',
            annotations: annotations || [],
            tags: tags || [],
            isFavorite: !!isFavorite
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

    // Settings API (LLM config)
    if (url.pathname === '/api/settings') {
      if (req.method === 'GET') {
        const config = loadLLMConfig();
        sendJson(res, {
          llm: config ? {
            provider: config.provider,
            model: config.model || getDefaultModel(config.provider),
            hasKey: config.provider === 'apple' || !!config.apiKey
          } : { provider: 'apple', model: 'on-device', hasKey: true }
        });
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = JSON.parse(await readBody(req));
          const { provider, apiKey, model } = body;
          if (!provider || !apiKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'provider and apiKey are required' }));
            return;
          }
          saveLLMConfig({ provider, apiKey, model: model || getDefaultModel(provider) });
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
          // Strip frontmatter
          const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
          articleText = match ? match[1] : content;
        }

        const result = await summarizeText(articleText);

        // If summarized by filename, write the summary into the markdown frontmatter
        if (name) {
          writeSummaryToFile(join(outputPath, name), result.summary);
        }

        sendJson(res, { summary: result.summary, model: result.model, provider });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Summarization failed';
        // Provide user-friendly error messages
        let userMsg = msg;
        if (msg.includes('Apple Intelligence requires macOS 26')) {
          userMsg = 'Apple Intelligence requires macOS 26 (Tahoe). Update macOS or choose a different provider in Settings.';
        } else if (msg.includes('Apple Intelligence is not available')) {
          userMsg = 'Apple Intelligence is not available on this Mac. Choose a cloud provider in Settings.';
        } else if (msg.includes('Apple Intelligence error')) {
          userMsg = 'Apple Intelligence encountered an error. Try again, or switch to a cloud provider for this article.';
        } else if (msg.includes('context window') || msg.includes('too long') || msg.includes('max_tokens') || msg.includes('exceededContextWindowSize')) {
          userMsg = 'Article too long for this model. Try a model with a larger context window.';
        } else if (msg.includes('No API key')) {
          userMsg = 'No model configured. Open Settings to add a provider.';
        }
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: userMsg }));
      }
      return;
    }

    send404(res);
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`PullRead viewer running at ${url}`);
    console.log(`Reading from: ${outputPath}`);
    console.log('Press Ctrl+C to stop\n');

    // Open browser
    const cmd = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
      : 'xdg-open';
    exec(`${cmd} ${url}`);
  });
}
