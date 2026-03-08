// ABOUTME: Renders the email header as a PNG using Playwright
// ABOUTME: Outputs email-header.png for base64 embedding in roundup emails

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; }
  body {
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 440px;
    height: 80px;
  }
  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand svg {
    width: 28px;
    height: 28px;
    color: #b45535;
  }
  .brand-text {
    font-family: 'Instrument Serif', Georgia, serif;
    font-size: 32px;
    color: #1a1a1a;
    letter-spacing: -0.01em;
  }
  .subtitle {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 12px;
    color: #999;
    letter-spacing: 0.03em;
  }
</style>
</head>
<body>
<div class="header">
  <div class="brand">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="15" height="19" rx="2"/>
      <line x1="7" y1="10.5" x2="14" y2="10.5"/>
      <line x1="7" y1="14" x2="12.5" y2="14"/>
      <line x1="7" y1="17.5" x2="11" y2="17.5"/>
      <path d="M14 2v7l2.25-1.75L18.5 9V2z" fill="currentColor" stroke="none"/>
    </svg>
    <span class="brand-text">Pull Read</span>
  </div>
  <div class="subtitle">YOUR DAILY ROUNDUP</div>
</div>
</body>
</html>`;

async function render() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 440, height: 80 },
    deviceScaleFactor: 2,
  });

  await page.setContent(HTML, { waitUntil: 'networkidle' });
  // Wait for font to load
  await page.waitForTimeout(1000);

  const screenshot = await page.screenshot({
    type: 'png',
    omitBackground: true,
  });

  const outPath = join(__dirname, '..', 'email-header.png');
  writeFileSync(outPath, screenshot);
  console.log(`Wrote ${outPath} (${screenshot.length} bytes)`);

  // Also output base64 for embedding
  const b64 = screenshot.toString('base64');
  const dataUri = `data:image/png;base64,${b64}`;
  const b64Path = join(__dirname, '..', 'email-header-b64.txt');
  writeFileSync(b64Path, dataUri);
  console.log(`Wrote ${b64Path} (${dataUri.length} chars)`);

  await browser.close();
}

render().catch(err => {
  console.error(err);
  process.exit(1);
});
