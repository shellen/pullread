// ABOUTME: Regression test for the article hero image surviving image dedup.
// ABOUTME: The dedup pass pre-seeds the hero URL; it must skip the hero itself.

import { test, expect } from '@playwright/test';

// Article with a frontmatter image AND the same image repeated in the body —
// the exact shape produced by "Fetch full content" adding an og:image.
const ARTICLE = `---
title: "Hero Dedup Regression"
url: https://example.com/hero-test
bookmarked: 2026-08-12T10:00:00.000Z
domain: example.com
image: https://example.com/lead.jpg?w=1200
source: extracted
---

![Lead](https://example.com/lead.jpg?w=800 "Lead")

Some body text that follows the lead image.

![Other](https://example.com/other.jpg)
`;

test('hero image survives dedup; body duplicate is removed', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).renderArticle === 'function');

  await page.evaluate((text) => {
    (window as any).renderArticle(text, 'hero-test.md');
  }, ARTICLE);

  // The hero must exist and still contain its image (it was previously
  // removed as a "duplicate" of its own pre-seeded URL).
  const heroImg = page.locator('.article-hero img');
  await expect(heroImg).toHaveCount(1);
  await expect(heroImg).toHaveAttribute('src', /lead\.jpg/);

  // The body copy of the same image (same path, different params) is deduped…
  const bodyLeads = page.locator('#content .content-wrap img[src*="lead.jpg"]');
  await expect(bodyLeads).toHaveCount(0);

  // …while distinct body images are untouched.
  const otherImg = page.locator('#content img[src*="other.jpg"]');
  await expect(otherImg).toHaveCount(1);
});

test('launch highlights Explore in the sidebar nav (#110)', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.sidebar-nav-item');
  const active = page.locator('.sidebar-nav-item.active');
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute('data-nav', 'explore');
});
