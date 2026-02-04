// ABOUTME: CLI entry point for PullRead
// ABOUTME: Syncs RSS and Atom feeds to markdown files

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fetchFeed, FeedEntry } from './feed';
import { fetchAndExtract } from './extractor';
import { writeArticle } from './writer';
import { Storage } from './storage';

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
      feeds: config.feeds
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
  retryFailed: boolean
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

      let content: string;
      let title = entry.title;

      if (entry.enclosure) {
        content = entry.annotation || 'No description available.';
      } else {
        const article = await fetchAndExtract(entry.url);

        if (!article) {
          console.log(`      Skipped: Could not extract content`);
          storage.markFailed(entry.url, 'No extractable content');
          failed++;
          continue;
        }

        content = article.markdown;
        title = article.title || entry.title;
      }

      const filename = writeArticle(outputPath, {
        title,
        url: entry.url,
        bookmarkedAt: entry.updatedAt,
        domain: entry.domain,
        content,
        feed: feedName,
        annotation: entry.annotation,
        enclosure: entry.enclosure
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
      console.log(`      Failed: ${message}`);
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

  const storage = new Storage(DB_PATH);

  try {
    let totalSuccess = 0;
    let totalFailed = 0;

    const feedsToSync = feedFilter
      ? { [feedFilter]: config.feeds[feedFilter] }
      : config.feeds;

    for (const [name, url] of Object.entries(feedsToSync)) {
      const { success, failed } = await syncFeed(name, url, storage, config.outputPath, retryFailed);
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
} else {
  console.log(`Usage: pullread <command>

Commands:
  sync                    Sync all feeds
  sync --feed <name>      Sync a specific feed
  sync --retry-failed     Retry previously failed URLs
`);
}
