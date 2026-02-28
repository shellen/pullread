// ABOUTME: End-to-end tests for core PullRead user flows against the real viewer server.
// ABOUTME: Covers feed management, article reading, TTS, podcasts, font settings, and sharing.

import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join, homedir } from 'path';

const FEEDS_PATH = join(process.env.HOME || require('os').homedir(), '.config', 'pullread', 'feeds.json');
let feedsBackup: string | null = null;

test.beforeAll(() => {
  // Back up the real feeds.json so feed add/delete tests don't corrupt it
  if (existsSync(FEEDS_PATH)) {
    feedsBackup = readFileSync(FEEDS_PATH, 'utf-8');
  }
});

test.afterAll(() => {
  // Restore feeds.json from backup
  if (feedsBackup !== null) {
    writeFileSync(FEEDS_PATH, feedsBackup);
  }
});

test.describe('Feed management via API', () => {
  test('add a feed', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app');

    // Get current config
    const before = await (await page.request.get('/api/config')).json();
    const feeds = { ...before.feeds, 'E2E Test Feed': 'https://hnrss.org/newest?count=1' };

    // Add the feed via POST
    const postRes = await page.request.post('/api/config', {
      data: { feeds },
    });
    expect(postRes.ok()).toBe(true);

    // Verify the feed now exists
    const after = await (await page.request.get('/api/config')).json();
    expect(after.feeds['E2E Test Feed']).toBe('https://hnrss.org/newest?count=1');
  });

  test('delete a feed', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app');

    // First add a feed to delete
    const before = await (await page.request.get('/api/config')).json();
    const feeds = { ...before.feeds, 'Feed To Delete': 'https://example.com/feed-to-delete.xml' };
    await page.request.post('/api/config', { data: { feeds } });

    // Verify it was added
    const mid = await (await page.request.get('/api/config')).json();
    expect(mid.feeds['Feed To Delete']).toBe('https://example.com/feed-to-delete.xml');

    // Now delete it
    const { 'Feed To Delete': _, ...remaining } = mid.feeds;
    await page.request.post('/api/config', { data: { feeds: remaining } });

    // Verify it's gone
    const after = await (await page.request.get('/api/config')).json();
    expect(after.feeds['Feed To Delete']).toBeUndefined();
  });
});

test.describe('Article reading', () => {
  test('scroll an article and track reading progress', async ({ page }) => {
    // Use a small viewport so the article content overflows
    await page.setViewportSize({ width: 800, height: 400 });
    await page.goto('/');
    await page.waitForSelector('.file-item');

    // Click the first article (the long one)
    await page.click('.file-item');
    await page.waitForSelector('#content', { state: 'visible' });

    // Wait for content to render fully
    await page.waitForFunction(() => {
      const scroll = document.getElementById('content-scroll');
      return scroll ? scroll.scrollHeight > scroll.clientHeight : false;
    }, { timeout: 5000 });

    // Get initial progress bar width
    const initialWidth = await page.evaluate(() => {
      const bar = document.getElementById('reading-progress-bar');
      return bar ? bar.getBoundingClientRect().width : 0;
    });

    // Scroll down
    await page.evaluate(() => {
      const scroll = document.getElementById('content-scroll');
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
    });

    // Wait for progress bar to update
    await page.waitForFunction((initW) => {
      const bar = document.getElementById('reading-progress-bar');
      if (!bar) return false;
      return bar.getBoundingClientRect().width > initW;
    }, initialWidth, { timeout: 3000 });
  });

  test('change font size', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.file-item');

    // Load an article so the toolbar is visible
    await page.click('.file-item');
    await page.waitForSelector('#content', { state: 'visible' });

    // Click the Aa button to open settings dropdown
    await page.click('.toolbar-aa-btn');
    await page.waitForSelector('.settings-dropdown-panel');

    // Click the xlarge size button
    await page.click('[data-setting="size"][data-val="xlarge"]');

    // Verify body class changed
    const hasClass = await page.evaluate(() =>
      document.body.className.includes('size-xlarge')
    );
    expect(hasClass).toBe(true);

    // Verify the button is now active
    const isActive = await page.evaluate(() => {
      const btn = document.querySelector('[data-setting="size"][data-val="xlarge"]');
      return btn?.classList.contains('active') ?? false;
    });
    expect(isActive).toBe(true);
  });
});

test.describe('Audio playback', () => {
  test('listen to article shows TTS player', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.file-item');

    // Click a non-podcast article (first one should be a regular article)
    const articleItem = page.locator('.file-item').filter({ hasNotText: 'Podcast' }).first();
    await articleItem.click();
    await page.waitForSelector('#content', { state: 'visible' });

    // Click the Listen button
    const listenBtn = page.locator('#listen-btn');
    await expect(listenBtn).toBeVisible();
    await listenBtn.click();

    // The TTS player should appear (or a configuration prompt if no TTS is configured)
    // We check for either the player element or an error/config prompt
    const playerOrPrompt = await page.waitForFunction(() => {
      return document.querySelector('pr-player') !== null
        || document.querySelector('#tts-play-btn') !== null
        || document.querySelector('.bottom-bar') !== null
        || document.querySelector('.key-action') !== null;
    }, { timeout: 5000 });
    expect(playerOrPrompt).toBeTruthy();
  });

  test('podcast article shows play button', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.file-item');

    // Click the podcast fixture article
    const podcastItem = page.locator('.file-item', { hasText: 'Podcast' });
    await podcastItem.click();
    await page.waitForSelector('#content', { state: 'visible' });

    // Podcast articles should show "Play" instead of "Listen" on the button
    const listenBtn = page.locator('#listen-btn');
    await expect(listenBtn).toBeVisible();
    const label = await listenBtn.textContent();
    expect(label?.trim()).toMatch(/Play/i);
  });
});

test.describe('Sharing', () => {
  test('share dropdown shows all sharing options', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.file-item');

    // Load an article
    await page.click('.file-item');
    await page.waitForSelector('#content', { state: 'visible' });

    // Click the Share button in the toolbar
    const shareBtn = page.locator('.toolbar-action-btn[aria-label="Share article"]');
    await expect(shareBtn).toBeVisible();
    await shareBtn.click();

    // Wait for share dropdown panel
    await page.waitForSelector('.share-dropdown-panel');

    // Verify all expected sharing options are present
    const panel = page.locator('.share-dropdown-panel');
    await expect(panel.locator('button', { hasText: 'Copy Link' })).toBeVisible();
    await expect(panel.locator('button', { hasText: 'Export Markdown' })).toBeVisible();
    await expect(panel.locator('button', { hasText: 'Email' })).toBeVisible();
    await expect(panel.locator('button', { hasText: 'Messages' })).toBeVisible();
    await expect(panel.locator('button', { hasText: 'LinkedIn' })).toBeVisible();
    await expect(panel.locator('button', { hasText: 'Bluesky' })).toBeVisible();
    await expect(panel.locator('button', { hasText: 'Threads' })).toBeVisible();
  });

  test('copy link copies URL to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/');
    await page.waitForSelector('.file-item');

    // Load an article
    await page.click('.file-item');
    await page.waitForSelector('#content', { state: 'visible' });

    // Open share dropdown and click Copy Link
    await page.click('.toolbar-action-btn[aria-label="Share article"]');
    await page.waitForSelector('.share-dropdown-panel');
    await page.click('.share-dropdown-panel button:text("Copy Link")');

    // Verify clipboard has a URL
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toMatch(/^https?:\/\//);
  });

  test('highlight text shows share toolbar with copy quote', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.file-item');

    // Load an article with content
    await page.click('.file-item');
    await page.waitForSelector('#content', { state: 'visible' });

    // Select some text in the article by simulating a click-drag
    const content = page.locator('#content');
    const paragraphs = content.locator('p');
    const firstParagraph = paragraphs.first();
    await firstParagraph.waitFor({ state: 'visible' });

    // Use evaluate to select text programmatically then trigger mouseup
    await page.evaluate(() => {
      const contentEl = document.getElementById('content');
      if (!contentEl) return;
      const paragraphs = contentEl.querySelectorAll('p');
      if (paragraphs.length === 0) return;
      const p = paragraphs[0];
      const range = document.createRange();
      range.selectNodeContents(p);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });

    // Trigger mouseup to show highlight toolbar
    await page.locator('#content p').first().dispatchEvent('mouseup', { bubbles: true });

    // The highlight toolbar should appear with share button
    const hlToolbar = page.locator('.hl-toolbar');
    await expect(hlToolbar).toBeVisible({ timeout: 3000 });
    await expect(hlToolbar.locator('.hl-share-btn')).toBeVisible();
  });

  test('messages button uses correct sms: URL format', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.file-item');

    // Load an article
    await page.click('.file-item');
    await page.waitForSelector('#content', { state: 'visible' });

    // Open share dropdown
    await page.click('.toolbar-action-btn[aria-label="Share article"]');
    await page.waitForSelector('.share-dropdown-panel');

    // Get the Messages button's onclick attribute
    const messagesBtn = page.locator('.share-dropdown-panel button', { hasText: 'Messages' });
    const onclick = await messagesBtn.getAttribute('onclick');

    // Must use sms:?body= (RFC 5724), not sms:&body=
    expect(onclick, 'Messages button must use sms:?body= format').toContain('sms:?body=');
    expect(onclick).not.toContain('sms:&body=');
  });
});

test.describe('Source highlighting', () => {
  test('clicking article highlights matching source in drawer', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.file-item');

    // Click the "Test Article One" item (from "Test Feed")
    const articleItem = page.locator('.file-item', { hasText: 'Test Article One' });
    await articleItem.click();
    await page.waitForSelector('#content', { state: 'visible' });

    // Open the Sources drawer
    await page.click('.sidebar-nav-item[data-nav="sources"]');
    await page.waitForSelector('#drawer-content .drawer-item');

    // The drawer item for "Test Feed" should have .active class
    const activeItem = page.locator('#drawer-content .drawer-item.active');
    await expect(activeItem).toBeVisible();
    const sourceName = await activeItem.getAttribute('data-source');
    expect(sourceName).toBe('Test Feed');
  });

  test('going home clears source highlight in drawer', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.file-item');

    // Click an article
    await page.click('.file-item');
    await page.waitForSelector('#content', { state: 'visible' });

    // Go home
    await page.click('.sidebar-tab[data-tab="home"]');
    await page.waitForSelector('#dashboard');

    // Open drawer — no item should be active
    await page.click('.sidebar-nav-item[data-nav="sources"]');
    await page.waitForSelector('#drawer-content .drawer-item');
    const activeItems = await page.locator('#drawer-content .drawer-item.active').count();
    expect(activeItems).toBe(0);
  });
});
