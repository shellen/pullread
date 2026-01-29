// ABOUTME: CLI entry point for PullRead
// ABOUTME: Syncs Drafty bookmarks to markdown files

import 'dotenv/config';
import { fetchFeed } from './feed';
import { fetchAndExtract } from './extractor';
import { writeArticle } from './writer';
import { Storage } from './storage';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const FEED_URL = process.env.FEED_URL;
const OUTPUT_PATH = process.env.OUTPUT_PATH?.replace(/^~/, process.env.HOME || '');
const DB_PATH = join(__dirname, '..', 'data', 'pullread.db');

async function sync(retryFailed = false): Promise<void> {
  if (!FEED_URL || !OUTPUT_PATH) {
    console.error('Error: FEED_URL and OUTPUT_PATH must be set in .env');
    process.exit(1);
  }

  const dataDir = join(__dirname, '..', 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const storage = new Storage(DB_PATH);

  try {
    console.log('Fetching feed...');
    const entries = await fetchFeed(FEED_URL);
    console.log(`Found ${entries.length} entries in feed`);

    let urlsToProcess: string[] = [];

    if (retryFailed) {
      urlsToProcess = storage.getFailedUrls();
      console.log(`Retrying ${urlsToProcess.length} failed entries`);
      urlsToProcess.forEach(url => storage.clearFailed(url));
    }

    const newEntries = entries.filter(e =>
      !storage.isProcessed(e.url) || urlsToProcess.includes(e.url)
    );

    console.log(`Processing ${newEntries.length} new entries`);

    let success = 0;
    let failed = 0;

    for (const entry of newEntries) {
      try {
        console.log(`  Extracting: ${entry.title.slice(0, 50)}...`);

        const article = await fetchAndExtract(entry.url);

        if (!article) {
          console.log(`    Skipped: Could not extract article content`);
          storage.markFailed(entry.url, 'No extractable content');
          failed++;
          continue;
        }

        const filename = writeArticle(OUTPUT_PATH, {
          title: article.title || entry.title,
          url: entry.url,
          bookmarkedAt: entry.updatedAt,
          domain: entry.domain,
          content: article.markdown,
          annotation: entry.annotation
        });

        storage.markProcessed({
          url: entry.url,
          title: article.title || entry.title,
          bookmarkedAt: entry.updatedAt,
          outputFile: filename
        });

        console.log(`    Saved: ${filename}`);
        success++;

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`    Failed: ${message}`);
        storage.markFailed(entry.url, message);
        failed++;
      }
    }

    console.log(`\nDone: ${success} saved, ${failed} failed`);

  } finally {
    storage.close();
  }
}

const args = process.argv.slice(2);
const command = args[0];

if (command === 'sync') {
  const retryFailed = args.includes('--retry-failed');
  sync(retryFailed).catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
} else {
  console.log(`Usage: pullread <command>

Commands:
  sync              Fetch feed and save new articles
  sync --retry-failed  Retry previously failed URLs
`);
}
