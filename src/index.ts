// ABOUTME: CLI entry point for PullRead
// ABOUTME: Syncs RSS and Atom feeds to markdown files

import 'dotenv/config';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fetchFeed, FeedEntry } from './feed';
import { fetchAndExtract } from './extractor';
import { writeArticle } from './writer';
import { Storage } from './storage';

const OUTPUT_PATH = process.env.OUTPUT_PATH?.replace(/^~/, process.env.HOME || '');
const DB_PATH = join(__dirname, '..', 'data', 'pullread.db');
const FEEDS_PATH = join(__dirname, '..', 'feeds.json');

interface FeedsConfig {
  [name: string]: string;
}

function loadFeeds(): FeedsConfig {
  if (!existsSync(FEEDS_PATH)) {
    console.error('Error: feeds.json not found. Copy feeds.json.example to feeds.json and configure your feeds.');
    process.exit(1);
  }

  try {
    const content = readFileSync(FEEDS_PATH, 'utf-8');
    return JSON.parse(content);
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
  if (!OUTPUT_PATH) {
    console.error('Error: OUTPUT_PATH must be set in .env');
    process.exit(1);
  }

  const feeds = loadFeeds();
  const feedNames = Object.keys(feeds);

  if (feedNames.length === 0) {
    console.error('Error: No feeds configured in feeds.json');
    process.exit(1);
  }

  if (feedFilter && !feeds[feedFilter]) {
    console.error(`Error: Feed "${feedFilter}" not found in feeds.json`);
    console.error(`Available feeds: ${feedNames.join(', ')}`);
    process.exit(1);
  }

  const dataDir = join(__dirname, '..', 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const storage = new Storage(DB_PATH);

  try {
    let totalSuccess = 0;
    let totalFailed = 0;

    const feedsToSync = feedFilter ? { [feedFilter]: feeds[feedFilter] } : feeds;

    for (const [name, url] of Object.entries(feedsToSync)) {
      const { success, failed } = await syncFeed(name, url, storage, OUTPUT_PATH, retryFailed);
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
