// ABOUTME: Creates a temp directory with sample markdown articles and starts the real PullRead server.
// ABOUTME: Used by Playwright e2e-real project to test against a live viewer instance on port 7788.

import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { startViewer } from '../../../src/viewer';

const PORT = 7788;
const TEMP_DIR = join(tmpdir(), 'pullread-e2e-' + process.pid);

// Sample articles go in YYYY/MM/ subdirectory structure
const ARTICLE_DIR = join(TEMP_DIR, '2026', '02');

const ARTICLES = [
  {
    filename: '2026-02-27-test-article-one.md',
    content: `---
title: "Test Article One"
url: https://example.com/article-1
bookmarked: 2026-02-27T00:00:00Z
domain: example.com
feed: Test Feed
author: "Jane Doe"
excerpt: "A sample article for end-to-end testing"
---

# Test Article One

This is the first sample article used for end-to-end testing of PullRead.

## Introduction

PullRead is a local-first RSS reader that saves articles as markdown files. This article exists solely for automated testing purposes. It contains enough paragraphs to test scrolling behavior and reading progress tracking.

## The History of Testing

Testing software is almost as old as software itself. In the early days of computing, testing was done manually by running programs and checking their output. As software grew more complex, automated testing became essential.

## Types of Tests

There are many kinds of tests: unit tests, integration tests, and end-to-end tests. Each serves a different purpose. Unit tests verify individual functions. Integration tests check that components work together. End-to-end tests simulate real user interactions.

## Why E2E Tests Matter

End-to-end tests catch bugs that other tests miss. They verify the full user experience from start to finish. They are slower than unit tests but provide the highest confidence that the application works correctly.

## More Content for Scrolling

This paragraph exists to make the article long enough to require scrolling in the viewer. The reading progress bar should update as the user scrolls through the content. We need enough text to ensure the content area has a scrollHeight greater than its clientHeight.

## Even More Content

Here is yet another section to ensure this article is sufficiently long. Without enough content, the scroll tests would fail because the article would fit entirely within the viewport without requiring scrolling.

## Final Thoughts

This concludes our test article. It has enough content to test scrolling, TTS generation, and reading progress tracking. The article also has proper frontmatter metadata for testing feed display and filtering.

## Appendix

Additional filler content to guarantee scrollability across different viewport sizes. Testing requires thoroughness, and thoroughness requires sufficient test data. This article provides that data.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
`,
  },
  {
    filename: '2026-02-27-test-article-two.md',
    content: `---
title: "Test Article Two"
url: https://example.com/article-2
bookmarked: 2026-02-27T01:00:00Z
domain: example.com
feed: Test Feed
author: "John Smith"
---

# Test Article Two

A second test article for verifying multi-article behavior in the sidebar.

## Content

This article is shorter but still useful for testing article switching and navigation between items in the file list.
`,
  },
  {
    filename: '2026-02-27-test-article-three.md',
    content: `---
title: "Test Article Three"
url: https://example.com/article-3
bookmarked: 2026-02-27T02:00:00Z
domain: other-site.org
feed: Another Feed
---

# Test Article Three

A third article from a different domain and feed, for testing filtering and grouping.
`,
  },
  {
    filename: '2026-02-27-test-podcast-episode.md',
    content: `---
title: "Test Podcast Episode"
url: https://example.com/podcast-1
bookmarked: 2026-02-27T03:00:00Z
domain: example.com
feed: Test Podcast
enclosure_url: https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3
enclosure_type: audio/mpeg
enclosure_duration: "0:30"
---

This is a test podcast episode with an audio enclosure for testing podcast playback.
`,
  },
  {
    filename: '2026-02-27-test-xkcd-comic.md',
    content: `---
title: "Standards"
url: https://xkcd.com/927/
bookmarked: 2026-02-27T04:00:00Z
domain: xkcd.com
feed: xkcd
source: feed
---

# Standards

![Standards](https://imgs.xkcd.com/comics/standards.png "Fortunately, the charging one has been solved now that we've all standardized on mini-USB. Or is it micro-USB? Shit.")

Permanent link to this comic: https://xkcd.com/927/
`,
  },
  {
    filename: '2026-02-27-test-feed-image.md',
    content: `---
title: "Saturn Photo of the Day"
url: https://apod.example.com/2026/02/27
bookmarked: 2026-02-27T05:00:00Z
domain: apod.example.com
feed: Astronomy Picture of the Day
source: feed
---

# Saturn Photo of the Day

![Saturn rings](https://apod.example.com/images/saturn.jpg "The rings of Saturn as seen from Cassini")
`,
  },
];

// Create temp directory and write fixture articles
mkdirSync(ARTICLE_DIR, { recursive: true });
for (const article of ARTICLES) {
  writeFileSync(join(ARTICLE_DIR, article.filename), article.content);
}

console.log(`[e2e-setup] Created ${ARTICLES.length} fixture articles in ${TEMP_DIR}`);

// Start the real viewer server pointing at our temp article directory
startViewer(TEMP_DIR, PORT, false);

// Clean up on exit
function cleanup() {
  try {
    rmSync(TEMP_DIR, { recursive: true, force: true });
    console.log(`[e2e-setup] Cleaned up ${TEMP_DIR}`);
  } catch {}
}

process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });
