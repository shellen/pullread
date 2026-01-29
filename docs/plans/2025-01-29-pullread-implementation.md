# PullRead Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a TypeScript CLI that syncs Drafty bookmarks to markdown files.

**Architecture:** Fetch Atom feed → filter unprocessed URLs via SQLite → extract article content with Readability → save as markdown with YAML frontmatter. Each component is a separate module with clear responsibilities.

**Tech Stack:** TypeScript, fast-xml-parser, jsdom, @mozilla/readability, better-sqlite3, turndown, dotenv

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `src/index.ts` (placeholder)

**Step 1: Initialize package.json**

```bash
cd /Users/shellen/Documents/Claude\ Stuff/pullread/.worktrees/implement
npm init -y
```

**Step 2: Install dependencies**

```bash
npm install fast-xml-parser jsdom @mozilla/readability better-sqlite3 turndown dotenv
npm install -D typescript @types/node @types/jsdom @types/better-sqlite3 @types/turndown ts-node
```

**Step 3: Create tsconfig.json**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create .env.example**

Create `.env.example`:
```
FEED_URL=https://www.drafty.com/@username/links/s/.../feed.xml
OUTPUT_PATH=~/Articles
```

**Step 5: Create placeholder entry point**

Create `src/index.ts`:
```typescript
// ABOUTME: CLI entry point for PullRead
// ABOUTME: Syncs Drafty bookmarks to markdown files

console.log('PullRead - not yet implemented');
```

**Step 6: Verify setup**

```bash
npx ts-node src/index.ts
```
Expected: `PullRead - not yet implemented`

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: initialize project with dependencies"
```

---

## Task 2: SQLite Storage Module

**Files:**
- Create: `src/storage.ts`
- Create: `src/storage.test.ts`

**Step 1: Write the failing test**

Create `src/storage.test.ts`:
```typescript
// ABOUTME: Tests for SQLite storage operations
// ABOUTME: Verifies URL tracking and status management

import { Storage } from './storage';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = '/tmp/pullread-test.db';

function cleanup() {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
}

describe('Storage', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  test('creates database and table on init', () => {
    const storage = new Storage(TEST_DB);
    expect(existsSync(TEST_DB)).toBe(true);
    storage.close();
  });

  test('isProcessed returns false for new URL', () => {
    const storage = new Storage(TEST_DB);
    expect(storage.isProcessed('https://example.com/article')).toBe(false);
    storage.close();
  });

  test('markProcessed records URL as successful', () => {
    const storage = new Storage(TEST_DB);
    storage.markProcessed({
      url: 'https://example.com/article',
      title: 'Test Article',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      outputFile: '2024-01-29-test-article.md'
    });
    expect(storage.isProcessed('https://example.com/article')).toBe(true);
    storage.close();
  });

  test('markFailed records URL with error', () => {
    const storage = new Storage(TEST_DB);
    storage.markFailed('https://example.com/broken', 'Timeout');
    expect(storage.isProcessed('https://example.com/broken')).toBe(true);
    storage.close();
  });

  test('getFailedUrls returns only failed entries', () => {
    const storage = new Storage(TEST_DB);
    storage.markProcessed({
      url: 'https://example.com/good',
      title: 'Good',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      outputFile: 'good.md'
    });
    storage.markFailed('https://example.com/bad', 'Error');

    const failed = storage.getFailedUrls();
    expect(failed).toHaveLength(1);
    expect(failed[0]).toBe('https://example.com/bad');
    storage.close();
  });

  test('clearFailed removes failed status for retry', () => {
    const storage = new Storage(TEST_DB);
    storage.markFailed('https://example.com/retry', 'Error');
    storage.clearFailed('https://example.com/retry');
    expect(storage.isProcessed('https://example.com/retry')).toBe(false);
    storage.close();
  });
});
```

**Step 2: Install Jest**

```bash
npm install -D jest @types/jest ts-jest
npx ts-jest config:init
```

**Step 3: Run test to verify it fails**

```bash
npx jest src/storage.test.ts
```
Expected: FAIL with "Cannot find module './storage'"

**Step 4: Write implementation**

Create `src/storage.ts`:
```typescript
// ABOUTME: SQLite storage for tracking processed URLs
// ABOUTME: Persists sync state to avoid re-processing articles

import Database from 'better-sqlite3';

export interface ProcessedEntry {
  url: string;
  title: string;
  bookmarkedAt: string;
  outputFile: string;
}

export class Storage {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processed (
        url TEXT PRIMARY KEY,
        title TEXT,
        bookmarked_at TEXT,
        processed_at TEXT,
        status TEXT DEFAULT 'success',
        error TEXT,
        output_file TEXT
      )
    `);
  }

  isProcessed(url: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM processed WHERE url = ?').get(url);
    return row !== undefined;
  }

  markProcessed(entry: ProcessedEntry): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO processed (url, title, bookmarked_at, processed_at, status, output_file)
      VALUES (?, ?, ?, datetime('now'), 'success', ?)
    `).run(entry.url, entry.title, entry.bookmarkedAt, entry.outputFile);
  }

  markFailed(url: string, error: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO processed (url, processed_at, status, error)
      VALUES (?, datetime('now'), 'failed', ?)
    `).run(url, error);
  }

  getFailedUrls(): string[] {
    const rows = this.db.prepare("SELECT url FROM processed WHERE status = 'failed'").all() as { url: string }[];
    return rows.map(r => r.url);
  }

  clearFailed(url: string): void {
    this.db.prepare("DELETE FROM processed WHERE url = ? AND status = 'failed'").run(url);
  }

  close(): void {
    this.db.close();
  }
}
```

**Step 5: Run test to verify it passes**

```bash
npx jest src/storage.test.ts
```
Expected: All 6 tests PASS

**Step 6: Commit**

```bash
git add src/storage.ts src/storage.test.ts jest.config.js
git commit -m "feat: add SQLite storage for tracking processed URLs"
```

---

## Task 3: Feed Parser Module

**Files:**
- Create: `src/feed.ts`
- Create: `src/feed.test.ts`

**Step 1: Write the failing test**

Create `src/feed.test.ts`:
```typescript
// ABOUTME: Tests for Atom feed parsing
// ABOUTME: Verifies extraction of bookmark entries from Drafty feeds

import { parseFeed, FeedEntry } from './feed';

const SAMPLE_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>@shellen's bookmarks</title>
  <entry>
    <title>Test Article Title</title>
    <link href="https://example.com/article"/>
    <id>urn:uuid:12345</id>
    <updated>2024-01-29T19:05:18.441Z</updated>
    <content type="html">
      &lt;p&gt;Some annotation text&lt;/p&gt;
    </content>
  </entry>
  <entry>
    <title>[Private] Another Article</title>
    <link href="https://example.com/private"/>
    <id>urn:uuid:67890</id>
    <updated>2024-01-28T10:00:00.000Z</updated>
    <content type="html"></content>
  </entry>
</feed>`;

describe('parseFeed', () => {
  test('extracts entries from Atom feed', () => {
    const entries = parseFeed(SAMPLE_FEED);
    expect(entries).toHaveLength(2);
  });

  test('parses entry fields correctly', () => {
    const entries = parseFeed(SAMPLE_FEED);
    const first = entries[0];

    expect(first.title).toBe('Test Article Title');
    expect(first.url).toBe('https://example.com/article');
    expect(first.updatedAt).toBe('2024-01-29T19:05:18.441Z');
    expect(first.annotation).toBe('Some annotation text');
  });

  test('handles entries without annotation', () => {
    const entries = parseFeed(SAMPLE_FEED);
    const second = entries[1];

    expect(second.title).toBe('[Private] Another Article');
    expect(second.annotation).toBeUndefined();
  });

  test('extracts domain from URL', () => {
    const entries = parseFeed(SAMPLE_FEED);
    expect(entries[0].domain).toBe('example.com');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest src/feed.test.ts
```
Expected: FAIL with "Cannot find module './feed'"

**Step 3: Write implementation**

Create `src/feed.ts`:
```typescript
// ABOUTME: Parses Atom feeds from Drafty
// ABOUTME: Extracts bookmark entries with metadata and annotations

import { XMLParser } from 'fast-xml-parser';

export interface FeedEntry {
  title: string;
  url: string;
  updatedAt: string;
  domain: string;
  annotation?: string;
}

export function parseFeed(xml: string): FeedEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });

  const parsed = parser.parse(xml);
  const feed = parsed.feed;

  if (!feed || !feed.entry) {
    return [];
  }

  const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];

  return entries.map((entry: any) => {
    const url = entry.link?.['@_href'] || entry.link;
    const domain = new URL(url).hostname.replace(/^www\./, '');

    let annotation: string | undefined;
    if (entry.content && typeof entry.content === 'string' && entry.content.trim()) {
      annotation = extractTextFromHtml(entry.content);
    } else if (entry.content?.['#text']?.trim()) {
      annotation = extractTextFromHtml(entry.content['#text']);
    }

    return {
      title: entry.title,
      url,
      updatedAt: entry.updated,
      domain,
      annotation: annotation || undefined
    };
  });
}

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
}

export async function fetchFeed(url: string): Promise<FeedEntry[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status}`);
  }
  const xml = await response.text();
  return parseFeed(xml);
}
```

**Step 4: Run test to verify it passes**

```bash
npx jest src/feed.test.ts
```
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/feed.ts src/feed.test.ts
git commit -m "feat: add Atom feed parser for Drafty bookmarks"
```

---

## Task 4: Article Extractor Module

**Files:**
- Create: `src/extractor.ts`
- Create: `src/extractor.test.ts`

**Step 1: Write the failing test**

Create `src/extractor.test.ts`:
```typescript
// ABOUTME: Tests for article content extraction
// ABOUTME: Verifies Readability extracts clean content from HTML pages

import { extractArticle } from './extractor';

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <nav>Navigation stuff</nav>
  <article>
    <h1>Article Headline</h1>
    <p>This is the first paragraph of the article with enough content to be considered main text.</p>
    <p>This is the second paragraph with more substantial content that Readability will extract.</p>
    <p>And a third paragraph to ensure we have enough content for extraction to work properly.</p>
  </article>
  <footer>Footer content</footer>
</body>
</html>
`;

describe('extractArticle', () => {
  test('extracts article content from HTML', () => {
    const result = extractArticle(SAMPLE_HTML, 'https://example.com/test');

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Article Headline');
    expect(result!.content).toContain('first paragraph');
    expect(result!.content).not.toContain('Navigation');
    expect(result!.content).not.toContain('Footer');
  });

  test('returns null for non-article pages', () => {
    const minimal = '<html><body><p>Too short</p></body></html>';
    const result = extractArticle(minimal, 'https://example.com/short');

    expect(result).toBeNull();
  });

  test('converts content to markdown', () => {
    const result = extractArticle(SAMPLE_HTML, 'https://example.com/test');

    expect(result).not.toBeNull();
    // Turndown converts <p> to plain text with newlines, not HTML
    expect(result!.markdown).not.toContain('<p>');
    expect(result!.markdown).toContain('first paragraph');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest src/extractor.test.ts
```
Expected: FAIL with "Cannot find module './extractor'"

**Step 3: Write implementation**

Create `src/extractor.ts`:
```typescript
// ABOUTME: Extracts article content from web pages using Readability
// ABOUTME: Converts HTML to clean markdown for storage

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

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

export function extractArticle(html: string, url: string): ExtractedArticle | null {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.content) {
    return null;
  }

  const markdown = turndown.turndown(article.content);

  return {
    title: article.title,
    content: article.content,
    markdown,
    byline: article.byline || undefined,
    excerpt: article.excerpt || undefined
  };
}

export async function fetchAndExtract(url: string): Promise<ExtractedArticle | null> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; PullRead/1.0)'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  return extractArticle(html, url);
}
```

**Step 4: Run test to verify it passes**

```bash
npx jest src/extractor.test.ts
```
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/extractor.ts src/extractor.test.ts
git commit -m "feat: add Readability-based article extractor"
```

---

## Task 5: Markdown Writer Module

**Files:**
- Create: `src/writer.ts`
- Create: `src/writer.test.ts`

**Step 1: Write the failing test**

Create `src/writer.test.ts`:
```typescript
// ABOUTME: Tests for markdown file generation
// ABOUTME: Verifies filename slugification and frontmatter formatting

import { generateFilename, generateMarkdown } from './writer';

describe('generateFilename', () => {
  test('creates date-prefixed slug', () => {
    const filename = generateFilename('My Article Title', '2024-01-29T19:05:18.441Z');
    expect(filename).toBe('2024-01-29-my-article-title.md');
  });

  test('removes special characters', () => {
    const filename = generateFilename('What's Next? A Look @ 2024!', '2024-01-29T12:00:00Z');
    expect(filename).toBe('2024-01-29-whats-next-a-look-2024.md');
  });

  test('truncates long titles', () => {
    const longTitle = 'This is an extremely long article title that goes on and on and should be truncated';
    const filename = generateFilename(longTitle, '2024-01-29T12:00:00Z');
    expect(filename.length).toBeLessThanOrEqual(70);
    expect(filename).toMatch(/\.md$/);
  });

  test('handles Private prefix', () => {
    const filename = generateFilename('[Private] Secret Article', '2024-01-29T12:00:00Z');
    expect(filename).toBe('2024-01-29-secret-article.md');
  });
});

describe('generateMarkdown', () => {
  test('generates frontmatter and content', () => {
    const md = generateMarkdown({
      title: 'Test Article',
      url: 'https://example.com/test',
      bookmarkedAt: '2024-01-29T19:05:18.441Z',
      domain: 'example.com',
      content: 'This is the article content.'
    });

    expect(md).toContain('---');
    expect(md).toContain('title: "Test Article"');
    expect(md).toContain('url: https://example.com/test');
    expect(md).toContain('bookmarked: 2024-01-29T19:05:18.441Z');
    expect(md).toContain('domain: example.com');
    expect(md).toContain('# Test Article');
    expect(md).toContain('This is the article content.');
  });

  test('includes annotation when present', () => {
    const md = generateMarkdown({
      title: 'Test',
      url: 'https://example.com',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'example.com',
      content: 'Content',
      annotation: 'My note about this'
    });

    expect(md).toContain('annotation: "My note about this"');
  });

  test('escapes quotes in title', () => {
    const md = generateMarkdown({
      title: 'Article with "quotes"',
      url: 'https://example.com',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      domain: 'example.com',
      content: 'Content'
    });

    expect(md).toContain('title: "Article with \\"quotes\\""');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest src/writer.test.ts
```
Expected: FAIL with "Cannot find module './writer'"

**Step 3: Write implementation**

Create `src/writer.ts`:
```typescript
// ABOUTME: Generates markdown files with YAML frontmatter
// ABOUTME: Handles filename slugification and content formatting

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export interface ArticleData {
  title: string;
  url: string;
  bookmarkedAt: string;
  domain: string;
  content: string;
  annotation?: string;
}

export function generateFilename(title: string, bookmarkedAt: string): string {
  const date = bookmarkedAt.slice(0, 10);

  let slug = title
    .replace(/^\[Private\]\s*/i, '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  const filename = `${date}-${slug}.md`;

  return filename.length > 70
    ? filename.slice(0, 67) + '.md'
    : filename;
}

export function generateMarkdown(data: ArticleData): string {
  const escapeQuotes = (s: string) => s.replace(/"/g, '\\"');

  let frontmatter = `---
title: "${escapeQuotes(data.title)}"
url: ${data.url}
bookmarked: ${data.bookmarkedAt}
domain: ${data.domain}`;

  if (data.annotation) {
    frontmatter += `\nannotation: "${escapeQuotes(data.annotation)}"`;
  }

  frontmatter += '\n---';

  return `${frontmatter}

# ${data.title}

${data.content}
`;
}

export function writeArticle(outputPath: string, data: ArticleData): string {
  const filename = generateFilename(data.title, data.bookmarkedAt);
  const fullPath = join(outputPath, filename);

  const dir = dirname(fullPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const markdown = generateMarkdown(data);
  writeFileSync(fullPath, markdown, 'utf-8');

  return filename;
}
```

**Step 4: Run test to verify it passes**

```bash
npx jest src/writer.test.ts
```
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add src/writer.ts src/writer.test.ts
git commit -m "feat: add markdown file writer with frontmatter"
```

---

## Task 6: CLI Entry Point

**Files:**
- Modify: `src/index.ts`

**Step 1: Write the CLI implementation**

Replace `src/index.ts`:
```typescript
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
```

**Step 2: Verify it runs**

```bash
npx ts-node src/index.ts
```
Expected: Usage message displayed

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add CLI entry point with sync command"
```

---

## Task 7: AppleScript Scheduler

**Files:**
- Create: `scripts/PullReadScheduler.applescript`
- Create: `scripts/com.shellen.pullread.plist`

**Step 1: Create scripts directory**

```bash
mkdir -p scripts
```

**Step 2: Create AppleScript**

Create `scripts/PullReadScheduler.applescript`:
```applescript
-- ABOUTME: AppleScript application that runs PullRead on a schedule
-- ABOUTME: Uses idle handler to sync every 30 minutes while running

property syncInterval : 30 * 60 -- 30 minutes in seconds
property pullreadPath : "/Users/shellen/Documents/Claude Stuff/pullread"

on run
	syncNow()
end run

on idle
	syncNow()
	return syncInterval
end idle

on syncNow()
	try
		set timestamp to do shell script "date '+%Y-%m-%d %H:%M:%S'"
		do shell script "echo '" & timestamp & " Starting sync...' >> /tmp/pullread.log"
		do shell script "cd " & quoted form of pullreadPath & " && /usr/local/bin/npx ts-node src/index.ts sync 2>&1 >> /tmp/pullread.log"
		do shell script "echo '" & timestamp & " Sync complete' >> /tmp/pullread.log"
	on error errMsg
		do shell script "echo 'Error: " & errMsg & "' >> /tmp/pullread.log"
	end try
end syncNow

on quit
	continue quit
end quit
```

**Step 3: Create launchd plist**

Create `scripts/com.shellen.pullread.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.shellen.pullread</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npx</string>
        <string>ts-node</string>
        <string>/Users/shellen/Documents/Claude Stuff/pullread/src/index.ts</string>
        <string>sync</string>
    </array>
    <key>StartInterval</key>
    <integer>1800</integer>
    <key>StandardOutPath</key>
    <string>/tmp/pullread.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/pullread.log</string>
    <key>WorkingDirectory</key>
    <string>/Users/shellen/Documents/Claude Stuff/pullread</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

**Step 4: Commit**

```bash
git add scripts/
git commit -m "feat: add AppleScript scheduler and launchd plist"
```

---

## Task 8: Integration Test

**Files:**
- Create: `.env` (local config)

**Step 1: Create .env file**

Create `.env` with actual values:
```
FEED_URL=https://www.drafty.com/@shellen/links/s/nhSgIkkcXNfLV_6vsC7CoxmZBAbc70GN/feed.xml
OUTPUT_PATH=/tmp/pullread-test-output
```

**Step 2: Run full sync**

```bash
mkdir -p /tmp/pullread-test-output
npx ts-node src/index.ts sync
```
Expected: Articles saved to `/tmp/pullread-test-output/`

**Step 3: Verify output**

```bash
ls -la /tmp/pullread-test-output/
head -20 /tmp/pullread-test-output/*.md | head -40
```
Expected: Markdown files with frontmatter

**Step 4: Run all tests**

```bash
npx jest
```
Expected: All tests pass

**Step 5: Final commit**

```bash
git add .env
git commit -m "test: verify end-to-end sync works"
```

---

## Post-Implementation

After all tasks complete:

1. Update `OUTPUT_PATH` in `.env` to actual Dropbox/Drive folder
2. Export AppleScript as application (Script Editor → Export → Application, check "Stay open")
3. Add to Login Items for auto-start
4. Or install launchd: `launchctl load ~/Library/LaunchAgents/com.shellen.pullread.plist`
