// ABOUTME: Playwright test verifying all interactive elements inherit the correct font-family.
// ABOUTME: Catches the bug where browsers default buttons/inputs/links to Arial instead of Work Sans.

import { test, expect } from '@playwright/test';

test.describe('Font family inheritance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to initialize
    await page.waitForSelector('.app');
  });

  test('body has Work Sans as primary font', async ({ page }) => {
    const fontFamily = await page.evaluate(() => {
      return getComputedStyle(document.body).fontFamily;
    });
    expect(fontFamily).toContain('Work Sans');
  });

  test('buttons inherit font-family, not Arial', async ({ page }) => {
    // Check all visible buttons on the page
    const buttons = page.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const fontFamily = await btn.evaluate(el => getComputedStyle(el).fontFamily);
        expect(fontFamily, `Button ${i} should not use Arial`).not.toMatch(/^Arial/i);
        expect(fontFamily).toContain('Work Sans');
        break; // Just need to verify one visible button
      }
    }
  });

  test('inputs inherit font-family, not Arial', async ({ page }) => {
    // The search input should be present in the sidebar
    const searchInput = page.locator('#search');
    if (await searchInput.isVisible()) {
      const fontFamily = await searchInput.evaluate(el => getComputedStyle(el).fontFamily);
      expect(fontFamily).not.toMatch(/^Arial/i);
      expect(fontFamily).toContain('Work Sans');
    }
  });

  test('brand displays with correct font', async ({ page }) => {
    const brand = page.locator('.brand');
    const fontFamily = await brand.evaluate(el => getComputedStyle(el).fontFamily);
    expect(fontFamily).toContain('Instrument Serif');
  });

  test('CSS rule button,input,select,textarea,a has font-family:inherit', async ({ page }) => {
    // Verify the global inherit rule exists and is applied
    const hasInheritRule = await page.evaluate(() => {
      const sheets = document.styleSheets;
      for (let i = 0; i < sheets.length; i++) {
        try {
          const rules = sheets[i].cssRules;
          for (let j = 0; j < rules.length; j++) {
            const rule = rules[j] as CSSStyleRule;
            if (rule.selectorText &&
                rule.selectorText.includes('button') &&
                rule.selectorText.includes('input') &&
                rule.selectorText.includes('a') &&
                rule.style.fontFamily === 'inherit') {
              return true;
            }
          }
        } catch (e) {
          // Cross-origin stylesheet, skip
        }
      }
      return false;
    });
    expect(hasInheritRule, 'Global font-family:inherit rule must exist for button,input,select,textarea,a').toBe(true);
  });

  test('share dropdown buttons use Work Sans', async ({ page }) => {
    // We need to open the share dropdown - but we need an article first
    // Instead, inject a mock share dropdown and test the computed style
    await page.evaluate(() => {
      const panel = document.createElement('div');
      panel.className = 'share-dropdown-panel';
      panel.innerHTML = '<button>Test Share Button</button>';
      document.body.appendChild(panel);
    });

    const btn = page.locator('.share-dropdown-panel button');
    const fontFamily = await btn.evaluate(el => getComputedStyle(el).fontFamily);
    expect(fontFamily, 'Share dropdown button should use Work Sans, not Arial').not.toMatch(/^Arial/i);
    expect(fontFamily).toContain('Work Sans');
  });

  test('more dropdown buttons use Work Sans', async ({ page }) => {
    await page.evaluate(() => {
      const panel = document.createElement('div');
      panel.className = 'more-dropdown-panel';
      panel.innerHTML = '<button>Test More Button</button>';
      document.body.appendChild(panel);
    });

    const btn = page.locator('.more-dropdown-panel button');
    const fontFamily = await btn.evaluate(el => getComputedStyle(el).fontFamily);
    expect(fontFamily, 'More dropdown button should use Work Sans, not Arial').not.toMatch(/^Arial/i);
    expect(fontFamily).toContain('Work Sans');
  });
});
