// ABOUTME: Local HTTP server for viewing PullRead markdown files
// ABOUTME: Serves viewer UI and provides API for listing/reading articles

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, extname, dirname } from 'path';
import { exec } from 'child_process';
import { homedir } from 'os';
import { VIEWER_HTML } from './viewer-html';
import { summarizeText, loadLLMConfig, saveLLMConfig, getDefaultModel, LLMConfig } from './summarizer';

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

    // Settings API (LLM config)
    if (url.pathname === '/api/settings') {
      if (req.method === 'GET') {
        const config = loadLLMConfig();
        sendJson(res, {
          llm: config ? {
            provider: config.provider,
            model: config.model || getDefaultModel(config.provider),
            hasKey: true
          } : null
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

        sendJson(res, { summary: result.summary, model: result.model });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Summarization failed';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
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
