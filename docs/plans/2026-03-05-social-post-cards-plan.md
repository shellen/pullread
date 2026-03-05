# Social Post Cards Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render social posts (Bluesky, Mastodon, Twitter/X) as platform-native cards in article view and compact rows in sidebar.

**Architecture:** Viewer-only detection by domain/URL pattern. Author info parsed from existing frontmatter (feed name, URL). Avatars fetched from public APIs with platform icon fallback. No backend changes.

**Tech Stack:** Vanilla JS (viewer), CSS custom properties (viewer.css)

---

### Task 1: Social Post Detection Utility

**Files:**
- Create: `viewer/18-social.js`
- Modify: `viewer.html` (add script tag)

**Step 1: Create `viewer/18-social.js` with detection + parsing functions**

```javascript
// ABOUTME: Detects social media posts and parses author/platform metadata
// ABOUTME: Supports Bluesky, Mastodon, and Twitter/X via domain and URL pattern matching

var SOCIAL_DOMAINS = {
  'bsky.app': 'bluesky',
  'x.com': 'twitter',
  'twitter.com': 'twitter'
};

// Platform display names for UI labels
var SOCIAL_PLATFORM_NAMES = {
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  twitter: 'X'
};

// Platform icon IDs (existing SVG symbols in viewer.html)
var SOCIAL_PLATFORM_ICONS = {
  bluesky: 'i-bluesky',
  mastodon: 'i-mastodon',
  twitter: 'i-x'
};

// Platform brand colors for avatar fallback circles
var SOCIAL_PLATFORM_COLORS = {
  bluesky: '#0085ff',
  mastodon: '#6364ff',
  twitter: '#000000'
};

/**
 * Detect if an article is a social media post.
 * Returns platform string ('bluesky', 'mastodon', 'twitter') or null.
 */
function detectSocialPlatform(meta) {
  if (!meta || !meta.domain) return null;

  // Direct domain match
  var platform = SOCIAL_DOMAINS[meta.domain];
  if (platform) return platform;

  // Mastodon: arbitrary domains, detect by URL pattern /@user/digits
  if (meta.url && /^https?:\/\/[^/]+\/@[^/]+\/\d+/.test(meta.url)) {
    return 'mastodon';
  }

  return null;
}

/**
 * Parse social post author info from existing frontmatter.
 * Returns { displayName, handle, postId, instance } or null.
 */
function parseSocialAuthor(meta, platform) {
  if (!meta || !meta.url) return null;

  var url;
  try { url = new URL(meta.url); } catch { return null; }

  var handle = '';
  var postId = '';
  var displayName = '';
  var instance = url.hostname;

  if (platform === 'bluesky') {
    // URL: /profile/{handle}/post/{id}
    var bskyMatch = url.pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)/);
    if (bskyMatch) {
      handle = bskyMatch[1];
      postId = bskyMatch[2];
    }
  } else if (platform === 'mastodon') {
    // URL: /@{user}/{id}
    var mastoMatch = url.pathname.match(/^\/@([^/]+)\/(\d+)/);
    if (mastoMatch) {
      handle = mastoMatch[1];
      postId = mastoMatch[2];
    }
  } else if (platform === 'twitter') {
    // URL: /{handle}/status/{id}
    var twMatch = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (twMatch) {
      handle = twMatch[1];
      postId = twMatch[2];
    }
  }

  // Display name: try meta.feed first (e.g., "@shellen.com - Jason Shellen")
  if (meta.feed) {
    var feedParts = meta.feed.match(/^@\S+\s*[-–—]\s*(.+)$/);
    if (feedParts) {
      displayName = feedParts[1].trim();
    } else {
      displayName = meta.feed;
    }
  }

  // Fallback: parse from title (e.g., "Jason Shellen (@shellen.com)")
  if (!displayName && meta.title && meta.title !== 'Untitled') {
    var titleMatch = meta.title.match(/^(.+?)\s*\(@/);
    if (titleMatch) {
      displayName = titleMatch[1].trim();
    } else {
      displayName = meta.title;
    }
  }

  // Last resort: use handle as display name
  if (!displayName) displayName = handle || 'Unknown';

  return {
    displayName: displayName,
    handle: handle,
    postId: postId,
    instance: instance
  };
}

// In-memory avatar cache: handle -> avatarUrl (or '' for failed lookups)
var _avatarCache = {};

/**
 * Fetch avatar URL for a social account. Returns promise resolving to URL or ''.
 * Results are cached in memory.
 */
function fetchSocialAvatar(handle, platform, instance) {
  var cacheKey = platform + ':' + handle;
  if (cacheKey in _avatarCache) return Promise.resolve(_avatarCache[cacheKey]);

  var apiUrl;
  if (platform === 'bluesky') {
    apiUrl = 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=' + encodeURIComponent(handle);
  } else if (platform === 'mastodon') {
    apiUrl = 'https://' + encodeURIComponent(instance) + '/api/v1/accounts/lookup?acct=' + encodeURIComponent(handle);
  } else {
    // Twitter/X: no public avatar API
    _avatarCache[cacheKey] = '';
    return Promise.resolve('');
  }

  return fetch(apiUrl)
    .then(function(res) { return res.ok ? res.json() : null; })
    .then(function(data) {
      var avatar = (data && data.avatar) || '';
      _avatarCache[cacheKey] = avatar;
      return avatar;
    })
    .catch(function() {
      _avatarCache[cacheKey] = '';
      return '';
    });
}
```

**Step 2: Add script tag to `viewer.html`**

In `viewer.html`, find the line with `<!-- INJECT:JS -->` and add `18-social.js` to the viewer JS list (the embed script will pick it up). Or if scripts are listed explicitly, add:

```html
<script src="viewer/18-social.js"></script>
```

**Step 3: Verify script loads**

Run: `bun scripts/embed-viewer.ts` (or start the dev viewer)
Expected: No errors, `detectSocialPlatform` is callable from console

**Step 4: Commit**

```bash
git add viewer/18-social.js viewer.html
git commit -m "Add social post detection and author parsing utilities"
```

---

### Task 2: Social Card CSS

**Files:**
- Modify: `viewer.css` (append social card styles)

**Step 1: Add social card styles to `viewer.css`**

Find the end of the article-related styles (after `.article-meta` section, around line 2155) and add:

```css
  /* Social post card */
  .social-card {
    max-width: 550px;
    margin: 24px auto;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    background: var(--bg);
  }
  .social-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .social-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .social-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .social-avatar-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .social-avatar-fallback svg {
    width: 24px;
    height: 24px;
    fill: #fff;
  }
  .social-author {
    min-width: 0;
    flex: 1;
  }
  .social-author-name {
    font-weight: 600;
    font-size: 15px;
    color: var(--fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .social-author-meta {
    font-size: 13px;
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .social-author-meta svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
  .social-card-body {
    font-size: 15px;
    line-height: 1.6;
    color: var(--fg);
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .social-card-body a {
    color: var(--link);
  }
  .social-card-footer {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .social-card-footer a {
    font-size: 13px;
    color: var(--muted);
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .social-card-footer a:hover {
    color: var(--link);
  }
  .social-card-footer svg {
    width: 14px;
    height: 14px;
  }
```

**Step 2: Verify CSS loads**

Run the viewer, inspect element — `.social-card` class should be available.

**Step 3: Commit**

```bash
git add viewer.css
git commit -m "Add social post card CSS styles"
```

---

### Task 3: Social Card Rendering in Article View

**Files:**
- Modify: `viewer/04-article.js:713` (inside `renderArticle`)

**Step 1: Add social post branch in `renderArticle()`**

In `renderArticle()`, after the `meta` is parsed (around line 740 where `var meta = parseFrontmatter(text);`) and before the pub-bar rendering begins (around line 745), add the social post detection and early return:

```javascript
  // Social post card: render as card instead of article layout
  var socialPlatform = detectSocialPlatform(meta);
  if (socialPlatform) {
    renderSocialCard(meta, body, filename, socialPlatform);
    return;
  }
```

Then add the `renderSocialCard` function in `viewer/18-social.js`:

```javascript
/**
 * Render a social post as a platform-native card in the article view.
 * Called from renderArticle() when a social platform is detected.
 */
function renderSocialCard(meta, body, filename, platform) {
  var author = parseSocialAuthor(meta, platform);
  var el = document.getElementById('content');
  var emptyEl = document.getElementById('empty-state');
  if (emptyEl) emptyEl.style.display = 'none';

  var platformName = SOCIAL_PLATFORM_NAMES[platform] || platform;
  var platformIcon = SOCIAL_PLATFORM_ICONS[platform] || '';
  var platformColor = SOCIAL_PLATFORM_COLORS[platform] || 'var(--muted)';

  // Build toolbar (same as articles — star, read, share)
  var toolbarActions = '';
  var articleNotes = getAnnotations(filename);
  var isFav = articleNotes.isFavorite;
  toolbarActions += '<button onclick="toggleFavoriteFromHeader(this)" class="toolbar-action-btn' + (isFav ? ' active-fav' : '') + '" aria-label="' + (isFav ? 'Remove star' : 'Star article') + '"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-' + (isFav ? 'heart' : 'heart-o') + '"/></svg><span class="toolbar-action-label"> Star</span></button>';
  var isRead = activeFile && readArticles.has(activeFile);
  toolbarActions += '<button onclick="toggleReadFromHeader(this)" class="toolbar-action-btn' + (isRead ? ' active-read' : '') + '" aria-label="' + (isRead ? 'Mark unread' : 'Mark read') + '"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-' + (isRead ? 'envelope' : 'envelope-open') + '"/></svg><span class="toolbar-action-label"> ' + (isRead ? 'Unread' : 'Read') + '</span></button>';
  if (meta && meta.url) {
    toolbarActions += '<div class="share-dropdown"><button onclick="toggleShareDropdown(event)" class="toolbar-action-btn" aria-label="Share"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-share"/></svg><span class="toolbar-action-label"> Share</span></button></div>';
  }
  var toolbarEl = document.getElementById('reader-toolbar-actions');
  if (toolbarEl) toolbarEl.innerHTML = toolbarActions;
  var toolbar = document.getElementById('reader-toolbar');
  if (toolbar) toolbar.style.display = '';

  // Avatar: start with fallback, async-replace with real avatar
  var avatarId = 'social-avatar-' + (author ? author.handle : 'unknown');
  var fallbackSvg = platformIcon
    ? '<div class="social-avatar-fallback" style="background:' + platformColor + '"><svg><use href="#' + platformIcon + '"/></svg></div>'
    : '<div class="social-avatar-fallback" style="background:var(--muted)"></div>';

  var handleDisplay = author ? ('@' + author.handle) : '';
  var timeStr = meta.bookmarked ? timeAgo(meta.bookmarked) : '';
  var timeTitle = meta.bookmarked ? timeAgoTitle(meta.bookmarked) : '';

  // Process body: linkify URLs, render as HTML
  var bodyHtml = body || '';
  // Convert bare URLs to links
  bodyHtml = escapeHtml(bodyHtml).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" onclick="event.stopPropagation();prOpenExternal(\'$1\');return false">$1</a>'
  );
  // Convert newlines
  bodyHtml = bodyHtml.replace(/\n/g, '<br>');

  var html = '<div class="article-header"><div id="header-tags"></div></div>';
  html += '<div class="social-card">';

  // Header: avatar + author info
  html += '<div class="social-card-header">';
  html += '<div class="social-avatar" id="' + avatarId + '">' + fallbackSvg + '</div>';
  html += '<div class="social-author">';
  html += '<div class="social-author-name">' + escapeHtml(author ? author.displayName : '') + '</div>';
  html += '<div class="social-author-meta">';
  html += '<span>' + escapeHtml(handleDisplay) + '</span>';
  if (timeStr) html += '<span>&middot;</span><span title="' + escapeHtml(timeTitle) + '">' + escapeHtml(timeStr) + '</span>';
  if (platformIcon) html += '<span>&middot;</span><svg style="fill:' + platformColor + '"><use href="#' + platformIcon + '"/></svg>';
  html += '</div></div></div>';

  // Body
  html += '<div class="social-card-body">' + bodyHtml + '</div>';

  // Footer: link to original
  if (meta.url) {
    html += '<div class="social-card-footer">';
    html += '<a href="#" onclick="event.preventDefault();prOpenExternal(\'' + escapeJsStr(meta.url) + '\')">';
    if (platformIcon) html += '<svg style="fill:' + platformColor + '"><use href="#' + platformIcon + '"/></svg>';
    html += 'View on ' + escapeHtml(platformName);
    html += ' <svg><use href="#i-external"/></svg></a>';
    html += '</div>';
  }

  html += '</div>'; // end social-card

  el.innerHTML = html;
  el.scrollTop = 0;

  // Populate header tags
  renderHeaderTags(filename);

  // Async: fetch real avatar and replace fallback
  if (author && author.handle) {
    fetchSocialAvatar(author.handle, platform, author.instance).then(function(avatarUrl) {
      if (!avatarUrl) return;
      var avatarEl = document.getElementById(avatarId);
      if (avatarEl) {
        avatarEl.innerHTML = '<img src="' + escapeHtml(avatarUrl) + '" alt="" onerror="this.parentElement.innerHTML=\'' + fallbackSvg.replace(/'/g, "\\'") + '\'">';
      }
    });
  }
}
```

**Step 2: Find the right insertion point in `renderArticle()`**

After `meta` and `body` are parsed, before the pub-bar section. Look for where `var pubName` or `var pubDomain` is set — insert the social detection just before that block.

**Step 3: Verify rendering**

Start the viewer, navigate to a bsky.app post. Should see a card instead of the article layout.

**Step 4: Commit**

```bash
git add viewer/18-social.js viewer/04-article.js
git commit -m "Render social posts as platform-native cards in article view"
```

---

### Task 4: Sidebar Social Row

**Files:**
- Modify: `viewer/05-sidebar.js:109` (inside `renderFileItem`)

**Step 1: Add social post detection in `renderFileItem()`**

At the top of `renderFileItem()` (line 109), after the existing metadata extraction, add social detection and modify the title/favicon for social posts:

```javascript
  // Social post: use platform icon and post excerpt instead of title
  var socialPlatform = detectSocialPlatform(f);
  var socialAuthor = socialPlatform ? parseSocialAuthor(f, socialPlatform) : null;

  var displayTitle = f.title;
  if (socialAuthor && (f.title === 'Untitled' || f.title.match(/\(@[^)]+\)$/))) {
    // Use handle + truncated post text as the sidebar title
    displayTitle = '@' + socialAuthor.handle;
    if (f.excerpt) {
      var excerptClean = f.excerpt.replace(/\n+/g, ' ').slice(0, 60);
      if (f.excerpt.length > 60) excerptClean += '\u2026';
      displayTitle += ' \u00b7 ' + excerptClean;
    }
  }
```

Then replace the favicon logic for social posts — find where `const favicon` is built (around line 130-135) and add:

```javascript
  // Social posts: use platform icon instead of domain favicon
  if (socialPlatform) {
    var pIcon = SOCIAL_PLATFORM_ICONS[socialPlatform];
    var pColor = SOCIAL_PLATFORM_COLORS[socialPlatform];
    favicon = '<svg class="file-item-favicon" style="width:16px;height:16px;fill:' + pColor + '" aria-hidden="true"><use href="#' + pIcon + '"/></svg>';
  }
```

And update the return statement to use `displayTitle` instead of `f.title`:

```javascript
  // In the return statement, change:
  // escapeHtml(f.title)
  // to:
  // escapeHtml(displayTitle)
```

**Step 2: Verify sidebar rendering**

Start the viewer, check that bsky.app entries show the Bluesky icon and `@handle . post excerpt...` instead of "Untitled".

**Step 3: Commit**

```bash
git add viewer/05-sidebar.js
git commit -m "Show platform icon and post excerpt for social posts in sidebar"
```

---

### Task 5: Test with Real Data

**Files:** None (manual testing)

**Step 1: Test Bluesky posts**

Navigate to any `bsky.app` post in the sidebar. Verify:
- Sidebar shows Bluesky butterfly icon + `@handle . excerpt`
- Article view shows social card with avatar (or fallback icon)
- "View on Bluesky" link works
- Toolbar actions (star, read, share) work

**Step 2: Test Mastodon posts**

Navigate to the `grapheneos.social` post. Verify:
- Detected as Mastodon (URL pattern `/@GrapheneOS/digits`)
- Shows Mastodon icon in sidebar
- Card renders with correct author info

**Step 3: Test non-social articles**

Navigate to a regular article. Verify:
- No change in rendering
- Pub-bar, title, body all normal

**Step 4: Test avatar fallback**

Open browser dev tools, block the Bluesky API endpoint. Verify:
- Card still renders with platform icon in colored circle
- No broken images or layout shifts

**Step 5: Commit any fixes**

If any adjustments needed, commit them.

---

### Task 6: Final Polish and Commit

**Step 1: Embed viewer for production**

```bash
bun scripts/embed-viewer.ts
```

**Step 2: Verify the embedded viewer includes the new JS**

Check that `src/viewer-bundle.ts` or equivalent includes `18-social.js`.

**Step 3: Final commit**

```bash
git add -A  # after checking git status
git commit -m "Embed viewer with social post card support"
```
