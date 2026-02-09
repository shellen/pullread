// ABOUTME: CLI entry point for PullRead
// ABOUTME: Syncs RSS and Atom feeds to markdown files

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fetchFeed, FeedEntry } from './feed';
import { fetchAndExtract, FetchOptions, shouldSkipUrl, classifyFetchError } from './extractor';
import { writeArticle } from './writer';
import { Storage } from './storage';
import { startViewer } from './viewer';
import { summarizeText, loadLLMConfig } from './summarizer';
import { autotagBatch } from './autotagger';
import { parseBookmarksHtml, bookmarksToEntries } from './bookmarks';

// Default paths for standalone binary
const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'pullread');
const DEFAULT_DB_PATH = join(DEFAULT_CONFIG_DIR, 'pullread.db');
const DEFAULT_CONFIG_PATH = join(DEFAULT_CONFIG_DIR, 'feeds.json');

// Allow overriding via command line args: --config-path and --data-path
function getPaths(): { configPath: string; dbPath: string } {
  const args = process.argv;
  const configIndex = args.indexOf('--config-path');
  const dataIndex = args.indexOf('--data-path');

  const configPath = configIndex !== -1 && args[configIndex + 1]
    ? args[configIndex + 1]
    : DEFAULT_CONFIG_PATH;

  const dbPath = dataIndex !== -1 && args[dataIndex + 1]
    ? args[dataIndex + 1]
    : DEFAULT_DB_PATH;

  return { configPath, dbPath };
}

const { configPath: CONFIG_PATH, dbPath: DB_PATH } = getPaths();

interface Config {
  outputPath: string;
  feeds: { [name: string]: string };
  useBrowserCookies?: boolean;
}

function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    console.error('Error: feeds.json not found. Copy feeds.json.example to feeds.json and configure.');
    process.exit(1);
  }

  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content);

    if (!config.outputPath) {
      console.error('Error: feeds.json missing "outputPath"');
      process.exit(1);
    }

    if (!config.feeds || Object.keys(config.feeds).length === 0) {
      console.error('Error: feeds.json missing "feeds" or no feeds configured');
      process.exit(1);
    }

    return {
      outputPath: config.outputPath.replace(/^~/, process.env.HOME || ''),
      feeds: config.feeds,
      useBrowserCookies: config.useBrowserCookies || false
    };
  } catch (err) {
    console.error('Error: Could not parse feeds.json:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

async function syncFeed(
  feedName: string,
  feedUrl: string,
  storage: Storage,
  outputPath: string,
  retryFailed: boolean,
  fetchOptions: FetchOptions = {}
): Promise<{ success: number; failed: number }> {
  console.log(`\nSyncing ${feedName}...`);

  let entries: FeedEntry[];
  try {
    entries = await fetchFeed(feedUrl);
    console.log(`  Found ${entries.length} entries`);
  } catch (err) {
    console.error(`  Error fetching feed: ${err instanceof Error ? err.message : err}`);
    return { success: 0, failed: 0 };
  }

  let urlsToProcess: string[] = [];

  if (retryFailed) {
    urlsToProcess = storage.getFailedUrls();
    urlsToProcess.forEach(url => storage.clearFailed(url));
  }

  const newEntries = entries.filter(e =>
    !storage.isProcessed(e.url) || urlsToProcess.includes(e.url)
  );

  if (newEntries.length === 0) {
    console.log('  No new entries');
    return { success: 0, failed: 0 };
  }

  console.log(`  Processing ${newEntries.length} new entries`);

  let success = 0;
  let failed = 0;

  for (const entry of newEntries) {
    try {
      const titlePreview = entry.title.slice(0, 50);
      console.log(`    ${titlePreview}${entry.title.length > 50 ? '...' : ''}`);

      // Check if URL should be skipped before attempting fetch
      const skipReason = shouldSkipUrl(entry.url);
      if (skipReason) {
        console.log(`      Skipped: ${skipReason}`);
        storage.markFailed(entry.url, skipReason);
        failed++;
        continue;
      }

      let content: string;
      let title = entry.title;
      let author: string | undefined;
      let excerpt: string | undefined;

      if (entry.enclosure) {
        content = entry.annotation || 'No description available.';
      } else {
        const article = await fetchAndExtract(entry.url, fetchOptions);

        if (!article) {
          console.log(`      Skipped: Could not extract content`);
          storage.markFailed(entry.url, 'No extractable content');
          failed++;
          continue;
        }

        content = article.markdown;
        title = article.title || entry.title;
        author = article.byline;
        excerpt = article.excerpt;
      }

      const filename = writeArticle(outputPath, {
        title,
        url: entry.url,
        bookmarkedAt: entry.updatedAt,
        domain: entry.domain,
        content,
        feed: feedName,
        annotation: entry.annotation,
        enclosure: entry.enclosure,
        author,
        excerpt
      });

      storage.markProcessed({
        url: entry.url,
        title,
        bookmarkedAt: entry.updatedAt,
        outputFile: filename
      });

      console.log(`      Saved: ${filename}`);
      success++;

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Try to extract HTTP status from error message for classification
      const statusMatch = message.match(/: (\d{3})$/);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : undefined;
      const label = classifyFetchError(err, status);
      console.log(`      Failed: ${label} — ${message}`);
      storage.markFailed(entry.url, message);
      failed++;
    }
  }

  return { success, failed };
}

async function sync(feedFilter?: string, retryFailed = false): Promise<void> {
  const config = loadConfig();
  const feedNames = Object.keys(config.feeds);

  if (feedFilter && !config.feeds[feedFilter]) {
    console.error(`Error: Feed "${feedFilter}" not found in feeds.json`);
    console.error(`Available feeds: ${feedNames.join(', ')}`);
    process.exit(1);
  }

  // Ensure config directory exists for database
  const configDir = join(DB_PATH, '..');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Ensure output directory exists
  if (!existsSync(config.outputPath)) {
    mkdirSync(config.outputPath, { recursive: true });
  }

  const storage = new Storage(DB_PATH, config.outputPath);

  try {
    let totalSuccess = 0;
    let totalFailed = 0;

    const feedsToSync = feedFilter
      ? { [feedFilter]: config.feeds[feedFilter] }
      : config.feeds;

    const fetchOptions: FetchOptions = {
      useBrowserCookies: config.useBrowserCookies
    };

    if (config.useBrowserCookies) {
      console.log('Browser cookies enabled - using Chrome login sessions');
    }

    for (const [name, url] of Object.entries(feedsToSync)) {
      const { success, failed } = await syncFeed(name, url, storage, config.outputPath, retryFailed, fetchOptions);
      totalSuccess += success;
      totalFailed += failed;
    }

    console.log(`\nDone: ${totalSuccess} saved, ${totalFailed} failed`);

  } finally {
    storage.close();
  }
}

const args = process.argv.slice(2);
const command = args[0];

if (command === 'sync') {
  const retryFailed = args.includes('--retry-failed');
  const feedIndex = args.indexOf('--feed');
  const feedFilter = feedIndex !== -1 ? args[feedIndex + 1] : undefined;

  sync(feedFilter, retryFailed).catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
} else if (command === 'view') {
  const config = loadConfig();
  const portIndex = args.indexOf('--port');
  const port = portIndex !== -1 && args[portIndex + 1]
    ? parseInt(args[portIndex + 1], 10)
    : 7777;
  startViewer(config.outputPath, port);
} else if (command === 'summarize') {
  const config = loadConfig();
  const batchMode = args.includes('--batch');
  const minSizeIndex = args.indexOf('--min-size');
  const minSize = minSizeIndex !== -1 && args[minSizeIndex + 1]
    ? parseInt(args[minSizeIndex + 1], 10)
    : 500; // minimum character count to summarize

  const llmConfig = loadLLMConfig();
  if (!llmConfig) {
    console.error('Error: No LLM API key configured.');
    console.error('Add your key via the viewer settings or create ~/.config/pullread/settings.json:');
    console.error('  { "llm": { "provider": "anthropic", "apiKey": "sk-...", "model": "claude-sonnet-4-5-20250929" } }');
    process.exit(1);
  }

  (async () => {
    const { readdirSync } = require('fs');
    const { extname } = require('path');
    const files = readdirSync(config.outputPath)
      .filter((f: string) => extname(f) === '.md');

    let summarized = 0;
    let skipped = 0;

    for (const file of files) {
      const filePath = join(config.outputPath, file);
      const content = readFileSync(filePath, 'utf-8');

      // Check if already has summary
      const hasSummary = /^summary: /m.test(content.split('---')[1] || '');
      if (hasSummary && batchMode) {
        skipped++;
        continue;
      }

      // Get article body (strip frontmatter)
      const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
      const body = match ? match[1] : content;

      if (body.length < minSize) {
        skipped++;
        continue;
      }

      if (!batchMode && !hasSummary) {
        skipped++;
        continue;
      }

      const titleMatch = content.match(/^title: "?(.*?)"?\s*$/m);
      const title = titleMatch ? titleMatch[1].slice(0, 50) : file;

      try {
        process.stdout.write(`  ${title}...`);
        const result = await summarizeText(body, llmConfig);

        // Write summary to frontmatter
        const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)([\s\S]*)$/);
        if (fmMatch) {
          let fm = fmMatch[2].replace(/\nsummary: ".*?"$/m, '').replace(/\nsummary: .*$/m, '');
          const escaped = result.summary.replace(/"/g, '\\"').replace(/\n/g, ' ');
          fm += `\nsummary: "${escaped}"`;
          const { writeFileSync: wf } = require('fs');
          wf(filePath, `${fmMatch[1]}${fm}${fmMatch[3]}${fmMatch[4]}`);
        }

        console.log(' done');
        summarized++;
      } catch (err) {
        console.log(` failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    console.log(`\nDone: ${summarized} summarized, ${skipped} skipped`);
  })().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
} else if (command === 'import') {
  const filePath = args[1];
  if (!filePath) {
    console.error('Usage: pullread import <bookmarks.html>');
    process.exit(1);
  }

  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const config = loadConfig();
  const html = readFileSync(filePath, 'utf-8');
  const bookmarks = parseBookmarksHtml(html);

  if (bookmarks.length === 0) {
    console.error('No bookmarks found in file');
    process.exit(1);
  }

  console.log(`Found ${bookmarks.length} bookmarks in ${filePath}`);

  const entries = bookmarksToEntries(bookmarks);
  const configDir = join(DB_PATH, '..');
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  if (!existsSync(config.outputPath)) mkdirSync(config.outputPath, { recursive: true });

  const storage = new Storage(DB_PATH, config.outputPath);
  const fetchOptions: FetchOptions = { useBrowserCookies: config.useBrowserCookies };

  (async () => {
    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (const entry of entries) {
      if (storage.isProcessed(entry.url)) {
        skipped++;
        continue;
      }

      const titlePreview = entry.title.slice(0, 50);
      process.stdout.write(`  ${titlePreview}${entry.title.length > 50 ? '...' : ''}`);

      const skipReason = shouldSkipUrl(entry.url);
      if (skipReason) {
        console.log(` — Skipped: ${skipReason}`);
        storage.markFailed(entry.url, skipReason);
        failed++;
        continue;
      }

      try {
        const article = await fetchAndExtract(entry.url, fetchOptions);
        if (!article) {
          console.log(' — No content');
          storage.markFailed(entry.url, 'No extractable content');
          failed++;
          continue;
        }

        const filename = writeArticle(config.outputPath, {
          title: article.title || entry.title,
          url: entry.url,
          bookmarkedAt: entry.updatedAt,
          domain: entry.domain,
          content: article.markdown,
          feed: 'import',
          annotation: entry.annotation,
          author: article.byline,
          excerpt: article.excerpt
        });

        storage.markProcessed({
          url: entry.url,
          title: article.title || entry.title,
          bookmarkedAt: entry.updatedAt,
          outputFile: filename
        });

        console.log(` — Saved: ${filename}`);
        success++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const statusMatch = message.match(/: (\d{3})$/);
        const status = statusMatch ? parseInt(statusMatch[1], 10) : undefined;
        const label = classifyFetchError(err, status);
        console.log(` — Failed: ${label}`);
        storage.markFailed(entry.url, message);
        failed++;
      }
    }

    storage.close();
    console.log(`\nDone: ${success} saved, ${failed} failed, ${skipped} already imported`);
  })().catch(err => {
    storage.close();
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
} else if (command === 'review') {
  const config = loadConfig();
  const daysIndex = args.indexOf('--days');
  const days = daysIndex !== -1 && args[daysIndex + 1]
    ? parseInt(args[daysIndex + 1], 10)
    : 7;

  (async () => {
    const { generateAndSaveReview, getRecentArticles } = await import('./review');
    const articles = getRecentArticles(config.outputPath, days);

    if (articles.length === 0) {
      console.log(`No articles found in the past ${days} days.`);
      process.exit(0);
    }

    console.log(`Found ${articles.length} articles from the past ${days} days`);
    console.log('Generating weekly review...');

    const result = await generateAndSaveReview(config.outputPath, days);
    if (result) {
      console.log(`\nReview saved: ${result.filename}`);
      console.log(`\n${result.review}`);
    } else {
      console.log('Failed to generate review.');
    }
  })().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
} else if (command === 'autotag') {
  const config = loadConfig();
  const batchMode = args.includes('--batch');
  const minSizeIndex = args.indexOf('--min-size');
  const minSize = minSizeIndex !== -1 && args[minSizeIndex + 1]
    ? parseInt(args[minSizeIndex + 1], 10)
    : 500;

  if (!batchMode) {
    console.log('Usage: pullread autotag --batch [--min-size N]');
    console.log('  Auto-generates machine tags for articles missing them.');
    process.exit(0);
  }

  const llmConfig = loadLLMConfig();
  if (!llmConfig) {
    console.error('Error: No LLM API key configured.');
    console.error('Add your key via the viewer settings or create ~/.config/pullread/settings.json');
    process.exit(1);
  }

  console.log('Auto-tagging articles...');
  autotagBatch(config.outputPath, { minSize, config: llmConfig })
    .then(({ tagged, skipped, failed }) => {
      console.log(`\nDone: ${tagged} tagged, ${skipped} skipped, ${failed} failed`);
    })
    .catch(err => {
      console.error('Fatal error:', err.message);
      process.exit(1);
    });
} else {
  console.log(`Usage: pullread <command>

Commands:
  sync                    Sync all feeds
  sync --feed <name>      Sync a specific feed
  sync --retry-failed     Retry previously failed URLs
  view                    Open article viewer in browser
  view --port <number>    Use a custom port (default: 7777)
  summarize --batch       Summarize articles missing summaries
  summarize --min-size N  Skip articles under N chars (default: 500)
  autotag --batch         Generate machine tags for untagged articles
  autotag --min-size N    Skip articles under N chars (default: 500)
  import <file.html>      Import bookmarks from HTML file (Netscape format)
  review                  Generate a weekly review of recent articles
  review --days N         Review the past N days (default: 7)
`);
}
