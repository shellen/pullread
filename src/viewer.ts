// ABOUTME: Local HTTP server for viewing PullRead markdown files
// ABOUTME: Serves viewer UI and provides API for listing/reading articles

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, watch, unlinkSync, copyFileSync } from 'fs';
import { join, extname, dirname } from 'path';
import { exec, execFile, execFileSync } from 'child_process';
import { homedir } from 'os';
import { VIEWER_HTML } from './viewer-html';
import { summarizeText, loadLLMConfig, saveLLMConfig, loadLLMSettings, saveLLMSettings, getDefaultModel, isAppleAvailable, KNOWN_MODELS, LLMConfig, LLMSettings } from './summarizer';
import { autotagText, autotagBatch, saveMachineTags, hasMachineTags, migrateDashedTags } from './autotagger';
import { initAnnotations, loadAnnotation, saveAnnotation, allHighlights, allNotes, migrateMonolithicFiles } from './annotations';
import { APP_ICON } from './app-icon';
import { fetchAndExtract } from './extractor';
import { generateMarkdown, writeArticle, ArticleData, downloadFavicon, resolveFilePath, listMarkdownFiles, listEpubFiles, migrateToDateFolders, exportNotebook, removeExportedNotebook } from './writer';
import { loadTTSConfig, saveTTSConfig, generateSpeech, getAudioContentType, getKokoroStatus, preloadKokoro, getCachedAudioPath, createTtsSession, generateSessionChunk, TTS_VOICES, TTS_MODELS } from './tts';
import { listSiteLogins, removeSiteLogin, saveSiteLoginCookies } from './cookies';

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
  categories: string[];
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

interface EpubMeta {
  title: string;
  author: string;
  description: string;
  language: string;
  coverPath: string;
}

/** Extract metadata from an EPUB file by reading its OPF document. */
function parseEpubMeta(epubPath: string): EpubMeta {
  const fallback: EpubMeta = { title: '', author: '', description: '', language: '', coverPath: '' };
  try {
    // EPUB is a ZIP; use unzip to extract META-INF/container.xml
    const containerXml = execFileSync('unzip', ['-p', epubPath, 'META-INF/container.xml'], {
      encoding: 'utf-8',
      timeout: 3000,
      maxBuffer: 64 * 1024,
    });
    // Find the rootfile path (e.g. OEBPS/content.opf or content.opf)
    const rfMatch = containerXml.match(/rootfile[^>]*full-path="([^"]+)"/);
    if (!rfMatch) return fallback;

    const opfPath = rfMatch[1];
    const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
    const opfXml = execFileSync('unzip', ['-p', epubPath, opfPath], {
      encoding: 'utf-8',
      timeout: 3000,
      maxBuffer: 256 * 1024,
    });

    // Parse Dublin Core metadata from OPF
    const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
    const authorMatch = opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
    const descMatch = opfXml.match(/<dc:description[^>]*>([^<]+)<\/dc:description>/i);
    const langMatch = opfXml.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/i);

    // Find cover image
    let coverPath = '';
    // EPUB 3: properties="cover-image"
    const coverItemMatch = opfXml.match(/<item\s+[^>]*properties="[^"]*cover-image[^"]*"[^>]*href="([^"]+)"/i)
      || opfXml.match(/<item\s+[^>]*href="([^"]+)"[^>]*properties="[^"]*cover-image[^"]*"/i);
    if (coverItemMatch) {
      coverPath = opfDir + coverItemMatch[1];
    }
    // EPUB 2 fallback: <meta name="cover" content="item-id"/>
    if (!coverPath) {
      const coverMetaMatch = opfXml.match(/<meta\s+name="cover"\s+content="([^"]+)"/i)
        || opfXml.match(/<meta\s+content="([^"]+)"\s+name="cover"/i);
      if (coverMetaMatch) {
        const coverId = coverMetaMatch[1];
        const coverHrefMatch = opfXml.match(new RegExp('<item\\s+[^>]*id="' + coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*href="([^"]+)"', 'i'));
        if (coverHrefMatch) {
          coverPath = opfDir + coverHrefMatch[1];
        }
      }
    }

    return {
      title: titleMatch ? titleMatch[1].trim() : '',
      author: authorMatch ? authorMatch[1].trim() : '',
      description: descMatch ? descMatch[1].trim().replace(/<[^>]+>/g, '').slice(0, 300) : '',
      language: langMatch ? langMatch[1].trim().split('-')[0] : '',
      coverPath,
    };
  } catch {
    return fallback;
  }
}

/** Resolve an EPUB filename to its full path in the output directory. */
function resolveEpubPath(outputPath: string, filename: string): string | null {
  const epubPaths = listEpubFiles(outputPath);
  for (const p of epubPaths) {
    if (require('path').basename(p) === filename) return p;
  }
  return null;
}

/** Extract a single file from an EPUB (ZIP) as a Buffer. */
function extractEpubFile(epubPath: string, innerPath: string): Buffer | null {
  try {
    return execFileSync('unzip', ['-p', epubPath, innerPath], {
      timeout: 5000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/**
 * Extract readable HTML content from an EPUB by parsing its spine.
 * Returns frontmatter + HTML body, similar to how markdown articles are served.
 * Image src attributes are rewritten to /api/epub-resource?name=...&path=...
 * Chapters are wrapped in <div class="epub-chapter"> with IDs for navigation.
 * Includes embedded TOC nav and cover image support.
 */
function extractEpubContent(epubPath: string, filename: string): string | null {
  try {
    const meta = parseEpubMeta(epubPath);

    // Read container.xml to find OPF
    const containerXml = execFileSync('unzip', ['-p', epubPath, 'META-INF/container.xml'], {
      encoding: 'utf-8', timeout: 3000, maxBuffer: 64 * 1024,
    });
    const rfMatch = containerXml.match(/rootfile[^>]*full-path="([^"]+)"/);
    if (!rfMatch) return null;

    const opfPath = rfMatch[1];
    const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
    const opfXml = execFileSync('unzip', ['-p', epubPath, opfPath], {
      encoding: 'utf-8', timeout: 3000, maxBuffer: 512 * 1024,
    });

    // Build manifest: id → { href, mediaType, properties }
    const manifest: Record<string, { href: string; mediaType: string; properties: string }> = {};
    const manifestRe = /<item\s+([^>]+)>/gi;
    let mm;
    while ((mm = manifestRe.exec(opfXml)) !== null) {
      const attrs = mm[1];
      const idMatch = attrs.match(/id="([^"]+)"/);
      const hrefMatch = attrs.match(/href="([^"]+)"/);
      const typeMatch = attrs.match(/media-type="([^"]+)"/);
      const propsMatch = attrs.match(/properties="([^"]+)"/);
      if (idMatch && hrefMatch) {
        manifest[idMatch[1]] = {
          href: hrefMatch[1],
          mediaType: typeMatch ? typeMatch[1] : '',
          properties: propsMatch ? propsMatch[1] : '',
        };
      }
    }

    // Parse spine order
    const spineRe = /<itemref\s+[^>]*idref="([^"]+)"[^>]*>/gi;
    const spineIds: string[] = [];
    let sm;
    while ((sm = spineRe.exec(opfXml)) !== null) {
      spineIds.push(sm[1]);
    }

    // --- Cover image detection ---
    const encFilename = encodeURIComponent(filename);
    let coverImagePath = '';

    // EPUB 3: properties="cover-image" on manifest item
    for (const id of Object.keys(manifest)) {
      if (manifest[id].properties.includes('cover-image')) {
        coverImagePath = opfDir + manifest[id].href;
        break;
      }
    }
    // EPUB 2 fallback: <meta name="cover" content="item-id"/>
    if (!coverImagePath) {
      const coverMetaMatch = opfXml.match(/<meta\s+name="cover"\s+content="([^"]+)"/i)
        || opfXml.match(/<meta\s+content="([^"]+)"\s+name="cover"/i);
      if (coverMetaMatch && manifest[coverMetaMatch[1]]) {
        coverImagePath = opfDir + manifest[coverMetaMatch[1]].href;
      }
    }

    // --- TOC parsing ---
    // Build href-to-chapter-index map as we process spine
    const hrefToChapterIdx: Record<string, number> = {};
    let chapterIndex = 0;
    for (const id of spineIds) {
      const item = manifest[id];
      if (!item || !item.mediaType.includes('html')) continue;
      hrefToChapterIdx[item.href] = chapterIndex;
      chapterIndex++;
    }

    let tocHtml = '';

    // EPUB 3: look for nav document (properties includes "nav")
    let navItemId = '';
    for (const id of Object.keys(manifest)) {
      if (manifest[id].properties.includes('nav')) {
        navItemId = id;
        break;
      }
    }

    if (navItemId) {
      try {
        const navPath = opfDir + manifest[navItemId].href;
        const navDir = navPath.includes('/') ? navPath.slice(0, navPath.lastIndexOf('/') + 1) : opfDir;
        const navXml = execFileSync('unzip', ['-p', epubPath, navPath], {
          encoding: 'utf-8', timeout: 5000, maxBuffer: 1024 * 1024,
        });
        // Extract the <nav epub:type="toc"> element content
        const tocMatch = navXml.match(/<nav[^>]*epub:type="toc"[^>]*>([\s\S]*?)<\/nav>/i);
        if (tocMatch) {
          tocHtml = rewriteTocHrefs(tocMatch[1], navDir, opfDir, hrefToChapterIdx);
        }
      } catch { /* nav parsing is best-effort */ }
    }

    // EPUB 2 fallback: NCX table of contents
    if (!tocHtml) {
      for (const id of Object.keys(manifest)) {
        if (manifest[id].mediaType === 'application/x-dtbncx+xml') {
          try {
            const ncxPath = opfDir + manifest[id].href;
            const ncxDir = ncxPath.includes('/') ? ncxPath.slice(0, ncxPath.lastIndexOf('/') + 1) : opfDir;
            const ncxXml = execFileSync('unzip', ['-p', epubPath, ncxPath], {
              encoding: 'utf-8', timeout: 5000, maxBuffer: 1024 * 1024,
            });
            tocHtml = parseNcxToTocHtml(ncxXml, ncxDir, opfDir, hrefToChapterIdx);
          } catch { /* NCX parsing is best-effort */ }
          break;
        }
      }
    }

    // --- Extract each spine document with chapter wrappers ---
    let bodyHtml = '';
    chapterIndex = 0;

    for (const id of spineIds) {
      const item = manifest[id];
      if (!item || !item.mediaType.includes('html')) continue;

      const innerPath = opfDir + item.href;
      const chapterXml = execFileSync('unzip', ['-p', epubPath, innerPath], {
        encoding: 'utf-8', timeout: 5000, maxBuffer: 2 * 1024 * 1024,
      });

      // Extract <body> content
      const bodyMatch = chapterXml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (!bodyMatch) continue;
      let chapterHtml = bodyMatch[1];

      // Resolve relative resource paths for images and links
      const chapterDir = innerPath.includes('/') ? innerPath.slice(0, innerPath.lastIndexOf('/') + 1) : opfDir;

      // Rewrite image src to /api/epub-resource
      chapterHtml = chapterHtml.replace(
        /(<img[^>]*\s+src=")([^"]+)(")/gi,
        function(_match, before, src, after) {
          if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return before + src + after;
          const resolved = resolveRelPath(chapterDir, src);
          return before + '/api/epub-resource?name=' + encFilename + '&path=' + encodeURIComponent(resolved) + after;
        }
      );
      // Also rewrite image src in xlink:href (SVG images in EPUB)
      chapterHtml = chapterHtml.replace(
        /(xlink:href="|href=")([^"]+\.(jpe?g|png|gif|svg|webp))(")/gi,
        function(_match, before, src, _ext, after) {
          if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return before + src + after;
          const resolved = resolveRelPath(chapterDir, src);
          return before + '/api/epub-resource?name=' + encFilename + '&path=' + encodeURIComponent(resolved) + after;
        }
      );

      // Convert epub:type to data-epub-type so it survives DOMPurify sanitization
      chapterHtml = chapterHtml.replace(/epub:type=/gi, 'data-epub-type=');

      // Wrap in chapter div with ID for navigation
      bodyHtml += '<div class="epub-chapter" id="epub-ch-' + chapterIndex + '">\n';
      bodyHtml += chapterHtml;
      bodyHtml += '\n</div>\n';
      chapterIndex++;
    }

    if (!bodyHtml.trim()) return null;

    // Prepend cover image if found
    let coverHtml = '';
    if (coverImagePath) {
      const coverUrl = '/api/epub-resource?name=' + encFilename + '&path=' + encodeURIComponent(coverImagePath);
      coverHtml = '<div class="epub-cover"><img src="' + coverUrl + '" alt="Cover" class="epub-cover-img"></div>\n';
    }

    // Prepend hidden TOC nav for frontend to read
    let tocNav = '';
    if (tocHtml) {
      tocNav = '<nav class="epub-toc" hidden>' + tocHtml + '</nav>\n';
    }

    // Build a markdown-like response with frontmatter
    const escapeQuotes = (s: string) => s.replace(/"/g, '\\"');
    let frontmatter = `---\ntitle: "${escapeQuotes(meta.title || filename.replace(/\.epub$/, ''))}"\ndomain: epub\nfeed: books`;
    if (meta.author) frontmatter += `\nauthor: "${escapeQuotes(meta.author)}"`;
    if (meta.language) frontmatter += `\nlang: ${meta.language}`;
    if (meta.description) frontmatter += `\nexcerpt: "${escapeQuotes(meta.description.slice(0, 200))}"`;
    if (coverImagePath) frontmatter += `\nimage: /api/epub-resource?name=${encFilename}&path=${encodeURIComponent(coverImagePath)}`;
    frontmatter += `\nepub_chapters: ${chapterIndex}`;
    frontmatter += '\n---\n\n';

    return frontmatter + tocNav + coverHtml + bodyHtml;
  } catch {
    return null;
  }
}

/** Rewrite TOC hrefs from EPUB 3 nav document to point to chapter IDs. */
function rewriteTocHrefs(
  tocInnerHtml: string,
  navDir: string,
  opfDir: string,
  hrefToChapterIdx: Record<string, number>
): string {
  return tocInnerHtml.replace(
    /href="([^"]+)"/gi,
    function(_match, href) {
      const [filePart, fragment] = href.split('#');
      // Resolve relative path from nav document to get the path relative to OPF dir
      const resolved = resolveRelPath(navDir, filePart);
      // Strip opfDir prefix to get the href as it appears in the manifest
      const manifestHref = resolved.startsWith(opfDir) ? resolved.slice(opfDir.length) : resolved;

      const chIdx = hrefToChapterIdx[manifestHref] ?? hrefToChapterIdx[decodeURIComponent(manifestHref)];
      if (chIdx !== undefined) {
        if (fragment) {
          // Sub-section: use the original fragment ID (it exists in the chapter HTML)
          return 'href="#' + fragment + '"';
        }
        return 'href="#epub-ch-' + chIdx + '"';
      }
      // If we can't map it, try with the fragment
      if (fragment) return 'href="#' + fragment + '"';
      return 'href="#"';
    }
  );
}

/** Parse EPUB 2 NCX <navMap> into HTML <ol> for the TOC. */
function parseNcxToTocHtml(
  ncxXml: string,
  ncxDir: string,
  opfDir: string,
  hrefToChapterIdx: Record<string, number>
): string {
  const navMapMatch = ncxXml.match(/<navMap>([\s\S]*)<\/navMap>/i);
  if (!navMapMatch) return '';

  function parseNavPoints(xml: string): string {
    let html = '<ol>';
    // Split on navPoint opening tags to find each entry
    const segments = xml.split(/<navPoint[^>]*>/i);
    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      const labelMatch = seg.match(/<navLabel>\s*<text>([^<]*)<\/text>/i);
      const srcMatch = seg.match(/<content\s+src="([^"]+)"/i);
      if (labelMatch && srcMatch) {
        const label = labelMatch[1].trim();
        const src = srcMatch[1];
        const [filePart, fragment] = src.split('#');
        const resolved = resolveRelPath(ncxDir, filePart);
        const manifestHref = resolved.startsWith(opfDir) ? resolved.slice(opfDir.length) : resolved;
        const chIdx = hrefToChapterIdx[manifestHref] ?? hrefToChapterIdx[decodeURIComponent(manifestHref)];

        let hrefAttr: string;
        if (chIdx !== undefined) {
          hrefAttr = fragment ? '#' + fragment : '#epub-ch-' + chIdx;
        } else {
          hrefAttr = fragment ? '#' + fragment : '#';
        }
        html += '<li><a href="' + hrefAttr + '">' + label.replace(/</g, '&lt;') + '</a></li>';
      }
    }
    html += '</ol>';
    return html;
  }

  return parseNavPoints(navMapMatch[1]);
}

/** Resolve a relative path against a base directory (handles ../ segments). */
function resolveRelPath(base: string, rel: string): string {
  // Decode percent-encoded paths first
  const decoded = decodeURIComponent(rel);
  const parts = (base + decoded).split('/');
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === '..') resolved.pop();
    else if (p && p !== '.') resolved.push(p);
  }
  return resolved.join('/');
}

function listFiles(outputPath: string): FileMeta[] {
  if (!existsSync(outputPath)) return [];

  const files: FileMeta[] = [];
  const allPaths = listMarkdownFiles(outputPath);

  for (const fullPath of allPaths) {
    const name = require('path').basename(fullPath);
    try {
      const stat = statSync(fullPath);
      if (!stat.isFile()) continue;
      // Read first 32KB for frontmatter + start of body (for image extraction)
      const buf = Buffer.alloc(32768);
      const fd = require('fs').openSync(fullPath, 'r');
      const bytesRead = require('fs').readSync(fd, buf, 0, 32768, 0);
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

      // Parse categories from frontmatter YAML array: ["a", "b"] or [a, b]
      let categories: string[] = [];
      if (meta.categories) {
        try {
          const parsed = JSON.parse(meta.categories.replace(/'/g, '"'));
          if (Array.isArray(parsed)) categories = parsed;
        } catch {
          categories = meta.categories.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        }
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
        categories,
      });
    } catch {
      // Skip unreadable files
    }
  }

  // Add EPUB files
  const epubPaths = listEpubFiles(outputPath);
  if (epubPaths.length) console.log(`[EPUB] Found ${epubPaths.length} file(s):`, epubPaths.map(p => require('path').basename(p)));
  for (const fullPath of epubPaths) {
    const name = require('path').basename(fullPath);
    try {
      const stat = statSync(fullPath);
      if (!stat.isFile()) continue;
      const meta = parseEpubMeta(fullPath);
      const encName = encodeURIComponent(name);
      const coverImage = meta.coverPath
        ? '/api/epub-resource?name=' + encName + '&path=' + encodeURIComponent(meta.coverPath)
        : '';
      files.push({
        filename: name,
        title: meta.title || name.replace(/\.epub$/, '').replace(/[-_]/g, ' '),
        url: '',
        domain: 'epub',
        bookmarked: stat.mtime.toISOString(),
        feed: 'books',
        author: meta.author || '',
        mtime: stat.mtime.toISOString(),
        hasSummary: false,
        summaryProvider: '',
        summaryModel: '',
        excerpt: meta.description || '',
        image: coverImage,
        enclosureUrl: '',
        enclosureType: '',
        enclosureDuration: '',
        categories: [],
      });
    } catch (err) {
      console.error(`[EPUB] Failed to index ${name}:`, err);
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

// App config and data paths
const CONFIG_DIR = join(homedir(), '.config', 'pullread');
const FEEDS_PATH = join(CONFIG_DIR, 'feeds.json');
const APP_SETTINGS_PATH = join(CONFIG_DIR, 'settings.json');
const NOTEBOOKS_PATH = join(CONFIG_DIR, 'notebooks.json');
const APP_VERSION = require('../package.json').version as string;

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

/** Copy bundled classic books into the output directory and tag them */
function installBundledBooks(outputPath: string): void {
  const booksDir = join(__dirname, '..', 'data', 'books');
  if (!existsSync(booksDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(booksDir).filter(f => f.endsWith('.md'));
  } catch { return; }

  if (entries.length === 0) return;

  for (const filename of entries) {
    const dest = join(outputPath, filename);
    if (!existsSync(dest)) {
      copyFileSync(join(booksDir, filename), dest);
    }

    // Ensure "classicbooks" tag exists in annotation sidecar
    const annot = loadAnnotation(filename);
    if (!annot.tags.includes('classicbooks')) {
      saveAnnotation(filename, { ...annot, tags: [...annot.tags, 'classicbooks'] });
    }
  }
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
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
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
    watch(outputPath, { recursive: true }, (event, filename) => {
      if (filename && (filename.endsWith('.md') || filename.endsWith('.epub'))) {
        filesChangedAt = Date.now();
      }
    });
  } catch {}

  // Move flat dated articles into YYYY/MM/ subfolders
  const migrated = migrateToDateFolders(outputPath);
  if (migrated > 0) {
    console.log(`[Storage] Migrated ${migrated} articles to dated folders`);
  }

  // Migrate monolithic highlights.json + notes.json to per-article .annot.json sidecars
  const migration = migrateMonolithicFiles(outputPath, CONFIG_DIR);
  if (migration.migrated > 0 || migration.orphaned > 0) {
    console.log(`[Storage] Migrated ${migration.migrated} annotations to sidecars (${migration.orphaned} orphaned)`);
  }

  // Load annotation sidecars into memory
  initAnnotations(outputPath, CONFIG_DIR);

  // Normalize any legacy dashed machine tags
  migrateDashedTags();

  // Install bundled classic books and tag them
  installBundledBooks(outputPath);

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

    // /settings redirects to the viewer with Settings panel open
    if (url.pathname === '/settings') {
      res.writeHead(302, { 'Location': '/#tab=settings' });
      res.end();
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

      // EPUB files: extract content as frontmatter + HTML (same as markdown articles)
      if (filename.endsWith('.epub')) {
        const epubPath = resolveEpubPath(outputPath, filename);
        if (!epubPath || !epubPath.startsWith(outputPath)) {
          send404(res);
          return;
        }
        const content = extractEpubContent(epubPath, filename);
        if (!content) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Failed to extract EPUB content');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(content);
        return;
      }

      const filePath = resolveFilePath(outputPath, filename);
      if (!filePath.startsWith(outputPath) || !existsSync(filePath)) {
        send404(res);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(readFileSync(filePath, 'utf-8'));
      return;
    }

    // Serve EPUB embedded resources (images, fonts, etc.)
    if (url.pathname === '/api/epub-resource') {
      const filename = url.searchParams.get('name');
      const innerPath = url.searchParams.get('path');
      if (!filename || !innerPath || filename.includes('..') || innerPath.includes('..')) {
        send404(res);
        return;
      }
      const epubPath = resolveEpubPath(outputPath, filename);
      if (!epubPath || !epubPath.startsWith(outputPath)) {
        send404(res);
        return;
      }
      const data = extractEpubFile(epubPath, innerPath);
      if (!data) {
        send404(res);
        return;
      }
      // Determine content type from extension
      const ext = innerPath.split('.').pop()?.toLowerCase() || '';
      const contentTypes: Record<string, string> = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
        'gif': 'image/gif', 'svg': 'image/svg+xml', 'webp': 'image/webp',
        'css': 'text/css', 'woff': 'font/woff', 'woff2': 'font/woff2',
        'ttf': 'font/ttf', 'otf': 'font/otf',
      };
      res.writeHead(200, {
        'Content-Type': contentTypes[ext] || 'application/octet-stream',
        'Content-Length': data.length.toString(),
        'Cache-Control': 'max-age=86400',
      });
      res.end(data);
      return;
    }

    // Highlights API
    if (url.pathname === '/api/highlights') {
      if (req.method === 'GET') {
        const name = url.searchParams.get('name');
        if (name) {
          sendJson(res, loadAnnotation(name).highlights);
        } else {
          sendJson(res, allHighlights());
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
          const existing = loadAnnotation(name);
          saveAnnotation(name, { ...existing, highlights: highlights || [] });
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
        if (name) {
          const annot = loadAnnotation(name);
          sendJson(res, { articleNote: annot.articleNote, annotations: annot.annotations, tags: annot.tags, isFavorite: annot.isFavorite, ...(annot.machineTags.length ? { machineTags: annot.machineTags } : {}) });
        } else {
          sendJson(res, allNotes());
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
          const existing = loadAnnotation(name);
          saveAnnotation(name, {
            ...existing,
            articleNote: articleNote || '',
            annotations: annotations || [],
            tags: tags || [],
            isFavorite: !!isFavorite,
          });
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
          try { exportNotebook(outputPath, all[id]); } catch {}
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
        const notebook = all[id];
        if (notebook) {
          try { removeExportedNotebook(outputPath, notebook); } catch {}
        }
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

    // Per-feed sync status
    if (url.pathname === '/api/feed-status' && req.method === 'GET') {
      const statusPath = join(CONFIG_DIR, 'feed-status.json');
      sendJson(res, loadJsonFile(statusPath));
      return;
    }

    // Retry a single feed sync
    if (url.pathname === '/api/retry-feed' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const { name, url: feedUrl } = body;
      if (!name || !feedUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'name and url required' }));
        return;
      }
      const statusPath = join(CONFIG_DIR, 'feed-status.json');
      try {
        const { fetchFeed } = await import('./feed');
        const entries = await fetchFeed(feedUrl);
        const status = loadJsonFile(statusPath);
        status[name] = { ok: true, lastSync: new Date().toISOString(), entries: entries.length };
        saveJsonFile(statusPath, status);
        sendJson(res, { ok: true, entries: entries.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = loadJsonFile(statusPath);
        status[name] = { ok: false, lastSync: new Date().toISOString(), error: message };
        saveJsonFile(statusPath, status);
        sendJson(res, { ok: false, error: message });
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
          maxAgeDays: config.maxAgeDays || 0,
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
          if (body.maxAgeDays !== undefined) existing.maxAgeDays = body.maxAgeDays;
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
        const appSettings = loadJsonFile(APP_SETTINGS_PATH);
        sendJson(res, {
          llm: {
            defaultProvider: settings.defaultProvider,
            providers,
            appleAvailable: isAppleAvailable()
          },
          viewerMode: (appSettings.viewerMode as string) || 'app',
          timeFormat: (appSettings.timeFormat as string) || '12h'
        });
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = JSON.parse(await readBody(req));

          // Viewer mode preference (app window vs default browser)
          if (body.viewerMode !== undefined) {
            const appSettings = loadJsonFile(APP_SETTINGS_PATH);
            appSettings.viewerMode = body.viewerMode === 'browser' ? 'browser' : 'app';
            saveJsonFile(APP_SETTINGS_PATH, appSettings);
            sendJson(res, { ok: true });
            return;
          }

          // Time format preference (12h vs 24h)
          if (body.timeFormat !== undefined) {
            const appSettings = loadJsonFile(APP_SETTINGS_PATH);
            appSettings.timeFormat = body.timeFormat === '24h' ? '24h' : '12h';
            saveJsonFile(APP_SETTINGS_PATH, appSettings);
            sendJson(res, { ok: true });
            return;
          }

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

    // Model catalog for Settings UI
    if (url.pathname === '/api/models' && req.method === 'GET') {
      try {
        const modelsPath = join(__dirname, '..', 'models.json');
        const data = JSON.parse(readFileSync(modelsPath, 'utf-8'));
        sendJson(res, data.providers || {});
      } catch {
        sendJson(res, {});
      }
      return;
    }

    // Version and update check
    if (url.pathname === '/api/check-updates' && req.method === 'GET') {
      try {
        const resp = await fetch('https://api.github.com/repos/shellen/pullread/releases/latest', {
          headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'PullRead/' + APP_VERSION }
        });
        if (!resp.ok) {
          sendJson(res, { currentVersion: APP_VERSION, error: 'Could not reach GitHub' });
          return;
        }
        const data = await resp.json() as { tag_name?: string; html_url?: string };
        const latest = (data.tag_name || '').replace(/^v/, '');
        const isNewer = (() => {
          if (!latest || latest === APP_VERSION) return false;
          const [aMaj = 0, aMin = 0, aPat = 0] = latest.split('.').map(Number);
          const [bMaj = 0, bMin = 0, bPat = 0] = APP_VERSION.split('.').map(Number);
          return aMaj > bMaj || (aMaj === bMaj && (aMin > bMin || (aMin === bMin && aPat > bPat)));
        })();
        sendJson(res, {
          currentVersion: APP_VERSION,
          latestVersion: latest,
          updateAvailable: isNewer,
          releaseUrl: data.html_url || ''
        });
      } catch {
        sendJson(res, { currentVersion: APP_VERSION, error: 'Network error' });
      }
      return;
    }

    // Sync status API
    if (url.pathname === '/api/sync-status' && req.method === 'GET') {
      const config = loadJsonFile(join(homedir(), '.config', 'pullread', 'feeds.json')) as Record<string, unknown>;
      const syncInterval = (config as any).syncInterval || '1h';
      let minutes: number | null = null;
      const mMatch = String(syncInterval).match(/^(\d+)m$/);
      const hMatch = String(syncInterval).match(/^(\d+)h$/);
      if (mMatch) minutes = parseInt(mMatch[1], 10);
      else if (hMatch) minutes = parseInt(hMatch[1], 10) * 60;

      // Check last sync from file mtime
      const outputFiles = listMarkdownFiles(outputPath);
      let lastSyncFile = null;
      let latestMtime = 0;
      for (const f of outputFiles.slice(-20)) {
        try {
          const mt = statSync(f).mtimeMs;
          if (mt > latestMtime) { latestMtime = mt; lastSyncFile = f; }
        } catch {}
      }

      sendJson(res, {
        syncInterval,
        intervalMinutes: minutes,
        lastActivity: latestMtime > 0 ? new Date(latestMtime).toISOString() : null,
        articleCount: outputFiles.length,
      });
      return;
    }

    // Live sync progress (written by CLI during sync)
    if (url.pathname === '/api/sync-progress' && req.method === 'GET') {
      const progressPath = join(homedir(), '.config', 'pullread', '.sync-progress');
      try {
        if (existsSync(progressPath)) {
          const data = JSON.parse(readFileSync(progressPath, 'utf-8'));
          // Treat as stale if not updated in 60 seconds (CLI died or timed out)
          const timestamp = data.updatedAt || data.startedAt;
          if (timestamp) {
            const age = Date.now() - new Date(timestamp).getTime();
            if (age > 60000) {
              try { unlinkSync(progressPath); } catch {}
              sendJson(res, { status: 'idle' });
              return;
            }
          }
          sendJson(res, data);
        } else {
          sendJson(res, { status: 'idle' });
        }
      } catch {
        sendJson(res, { status: 'idle' });
      }
      return;
    }

    // Site login save via navigation (bypasses all external CSP restrictions)
    if (url.pathname === '/api/site-login-callback') {
      const domain = url.searchParams.get('domain') || '';
      if (!domain) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><body>Missing domain</body></html>');
        return;
      }
      // Serve a landing page that reads cookies from window.name and POSTs them.
      // Cookies are passed via window.name to avoid URL length limits.
      const safeDomain = domain.replace(/[<>&"]/g, '');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><body style="background:#1a1a2e;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div id="status" style="text-align:center"><p style="font-size:18px;color:#888">Saving login for ${safeDomain}\u2026</p></div>
<script>
(function() {
  var cookies = [];
  try { cookies = JSON.parse(window.name || '[]'); } catch(e) {}
  window.name = '';
  fetch('/api/site-logins', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({domain: '${safeDomain}', cookies: cookies})
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.ok) {
      document.getElementById('status').innerHTML = '<div style="font-size:48px;margin-bottom:16px;color:#22c55e">&#10003;</div><p style="font-size:18px">Login saved for ${safeDomain}</p><p style="color:#888;font-size:13px">This window will close automatically.</p>';
    } else {
      document.getElementById('status').innerHTML = '<p style="color:#ef4444">Error: ' + (d.error || 'save failed') + '</p>';
    }
  }).catch(function(e) {
    document.getElementById('status').innerHTML = '<p style="color:#ef4444">Error: ' + e.message + '</p>';
  });
})();
</script></body></html>`);
      return;
    }

    // Site login management
    if (url.pathname === '/api/site-logins') {
      if (req.method === 'GET') {
        sendJson(res, { domains: listSiteLogins() });
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = JSON.parse(await readBody(req));
          if (!body.domain || !body.cookies) { sendJson(res, { ok: false, error: 'missing domain or cookies' }); return; }
          saveSiteLoginCookies(body.domain, body.cookies);
          sendJson(res, { ok: true });
        } catch (e: any) { sendJson(res, { ok: false, error: e.message || 'save failed' }); }
        return;
      }
      if (req.method === 'DELETE') {
        try {
          const body = JSON.parse(await readBody(req));
          if (!body.domain) { sendJson(res, { ok: false, error: 'missing domain' }); return; }
          const removed = removeSiteLogin(body.domain);
          sendJson(res, { ok: removed });
        } catch { sendJson(res, { ok: false, error: 'invalid request' }); }
        return;
      }
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

        const filePath = resolveFilePath(outputPath, name);
        if (!existsSync(filePath)) {
          send404(res);
          return;
        }

        // Check if already tagged
        if (hasMachineTags(name)) {
          sendJson(res, { machineTags: loadAnnotation(name).machineTags, cached: true });
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
          const filePath = resolveFilePath(outputPath, name);
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
          writeSummaryToFile(resolveFilePath(outputPath, name), result.summary, provider, result.model);
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

        const filePath = resolveFilePath(outputPath, name);
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

      const allFilePaths = listMarkdownFiles(outputPath);

      // Parse frontmatter to get URLs; skip files without a source URL
      const filesWithUrls: { name: string; fullPath: string; domain: string }[] = [];
      for (const fullPath of allFilePaths) {
        const name = require('path').basename(fullPath);
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const meta = parseFrontmatter(content);
          if (meta.url) {
            let domain = '';
            try { domain = new URL(meta.url).hostname; } catch {}
            filesWithUrls.push({ name, fullPath, domain });
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
        const { name, fullPath, domain } = filesWithUrls[i];

        // 1-second delay between requests to the same host
        if (domain && domain === lastDomain) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        lastDomain = domain;

        const result = await reprocessFile(fullPath);
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

        const filePath = resolveFilePath(outputPath, name);
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
        const filePath = resolveFilePath(outputPath, name);
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

        const filePath = resolveFilePath(outputPath, name);
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
      const backupFiles = ['feeds.json', 'settings.json', 'notebooks.json', 'inbox.json'];
      const backup: Record<string, unknown> = {
        _pullread_backup: true,
        _version: '2',
        _createdAt: new Date().toISOString(),
      };
      for (const f of backupFiles) {
        const p = join(CONFIG_DIR, f);
        if (existsSync(p)) {
          try { backup[f] = JSON.parse(readFileSync(p, 'utf-8')); } catch {}
        }
      }
      // Build highlights and notes from sidecar cache for backward-compatible backup
      backup['highlights.json'] = allHighlights();
      backup['notes.json'] = allNotes();
      // Include sync database if it exists
      const dbPath = join(CONFIG_DIR, 'pullread.json');
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
        const restorableFiles = ['feeds.json', 'settings.json', 'notebooks.json', 'inbox.json', 'pullread.json'];
        let restored = 0;
        for (const f of restorableFiles) {
          if (body[f] && typeof body[f] === 'object') {
            saveJsonFile(join(CONFIG_DIR, f), body[f]);
            restored++;
          }
        }
        // Restore highlights and notes as per-article sidecars
        const restoredHighlights = body['highlights.json'] || {};
        const restoredNotes = body['notes.json'] || {};
        const allFilenames = new Set([...Object.keys(restoredHighlights), ...Object.keys(restoredNotes)]);
        for (const filename of allFilenames) {
          const highlights = restoredHighlights[filename] || [];
          const note = restoredNotes[filename] || {};
          saveAnnotation(filename, {
            highlights: Array.isArray(highlights) ? highlights : [],
            articleNote: note.articleNote || '',
            annotations: note.annotations || [],
            tags: note.tags || [],
            machineTags: note.machineTags || [],
            isFavorite: !!note.isFavorite,
          });
          restored++;
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

    // Log viewer — serves the sidecar log file as plain text
    if (url.pathname === '/api/log' && req.method === 'GET') {
      const logFile = '/tmp/pullread.log';
      const logOld = '/tmp/pullread.log.old';
      let content = '';
      // Include rotated log for context, then current log
      if (existsSync(logOld)) {
        content += readFileSync(logOld, 'utf-8');
      }
      if (existsSync(logFile)) {
        content += readFileSync(logFile, 'utf-8');
      }
      if (!content) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('No log file found.');
        return;
      }
      // Return only the last ~200 KB to avoid sending huge payloads
      const MAX_RESPONSE = 200 * 1024;
      if (content.length > MAX_RESPONSE) {
        const trimmed = content.slice(-MAX_RESPONSE);
        // Start at the first complete line
        const firstNewline = trimmed.indexOf('\n');
        content = '--- log trimmed ---\n' + (firstNewline >= 0 ? trimmed.slice(firstNewline + 1) : trimmed);
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(content);
      return;
    }

    // Reveal output folder in Finder
    if (url.pathname === '/api/reveal-folder' && req.method === 'POST') {
      const folder = outputPath.startsWith('~')
        ? join(homedir(), outputPath.slice(1))
        : outputPath;
      exec(`open "${folder}"`, (err) => {
        sendJson(res, { ok: !err });
      });
      return;
    }

    // Write exported content to a user-chosen file path (used by Tauri save dialog)
    if (url.pathname === '/api/write-export' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const { path: filePath, content } = JSON.parse(body);
        if (!filePath || typeof filePath !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing path' }));
          return;
        }
        const dir = dirname(filePath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(filePath, content, 'utf-8');
        sendJson(res, { ok: true, path: filePath });
      } catch (e: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || 'Write failed' }));
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
      execFile(cmd, [url]);
    }
  });
}
