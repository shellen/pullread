// ABOUTME: Local HTTP server for viewing PullRead markdown files
// ABOUTME: Serves viewer UI and provides API for listing/reading articles

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, watch } from 'fs';
import { join, extname, dirname } from 'path';
import { exec } from 'child_process';
import { homedir } from 'os';
import { VIEWER_HTML } from './viewer-html';
import { summarizeText, loadLLMConfig, saveLLMConfig, getDefaultModel, KNOWN_MODELS, LLMConfig } from './summarizer';
import { autotagText, autotagBatch, saveMachineTags, hasMachineTags } from './autotagger';
import { APP_ICON } from './app-icon';
import { fetchAndExtract } from './extractor';
import { generateMarkdown, ArticleData } from './writer';
import { loadTTSConfig, saveTTSConfig, generateSpeech, getAudioContentType, getKokoroStatus, preloadKokoro, TTS_VOICES, TTS_MODELS } from './tts';

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
}

function parseFrontmatter(content: string): Record<string, string> {
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

export function startViewer(outputPath: string, port = 7777): void {
  // Watch output directory for .md file changes
  let filesChangedAt = Date.now();
  try {
    watch(outputPath, (event, filename) => {
      if (filename && filename.endsWith('.md')) {
        filesChangedAt = Date.now();
      }
    });
  } catch {}

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

    // Lightweight poll: returns timestamp of last .md file change
    if (url.pathname === '/api/files-changed') {
      sendJson(res, { changedAt: filesChangedAt });
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

    // Auto-tag API
    if (url.pathname === '/api/autotag' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const { name } = body;
        if (!name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'name is required' }));
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
        if (!existsSync(filePath)) {
          send404(res);
          return;
        }

        // Read existing file to get frontmatter metadata
        const existing = readFileSync(filePath, 'utf-8');
        const meta = parseFrontmatter(existing);
        if (!meta.url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Article has no source URL in frontmatter' }));
          return;
        }

        // Re-fetch and extract
        const article = await fetchAndExtract(meta.url);
        if (!article) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Could not extract article from URL' }));
          return;
        }

        // Rebuild the markdown file preserving original frontmatter fields
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

        // Preserve summary if it existed
        if (meta.summary) {
          const escaped = meta.summary.replace(/"/g, '\\"').replace(/\n/g, ' ');
          const withSummary = markdown.replace(/\n---\n/, `\nsummary: "${escaped}"\n---\n`);
          writeFileSync(filePath, withSummary, 'utf-8');
        } else {
          writeFileSync(filePath, markdown, 'utf-8');
        }

        sendJson(res, { ok: true, title: data.title });
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : 'Reprocessing failed';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
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

    // TTS Audio generation API
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
        // Strip frontmatter to get just the article body
        const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
        const articleText = match ? match[1] : content;

        const audio = await generateSpeech(name, articleText, config);

        res.writeHead(200, {
          'Content-Type': getAudioContentType(config.provider),
          'Content-Length': audio.length.toString(),
          'Cache-Control': 'max-age=86400',
        });
        res.end(audio);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'TTS generation failed';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
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

    send404(res);
  });

  server.listen(port, '127.0.0.1', () => {
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
