// ABOUTME: Detects social media posts and renders platform-native cards
// ABOUTME: Supports Bluesky, Mastodon, and Twitter/X via domain and URL pattern matching

var SOCIAL_DOMAINS = {
  'bsky.app': 'bluesky',
  'x.com': 'twitter',
  'twitter.com': 'twitter'
};

var SOCIAL_PLATFORM_NAMES = {
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  twitter: 'X'
};

var SOCIAL_PLATFORM_ICONS = {
  bluesky: 'i-bluesky',
  mastodon: 'i-mastodon',
  twitter: 'i-x'
};

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
  try { url = new URL(meta.url); } catch (e) { return null; }

  var handle = '';
  var postId = '';
  var displayName = '';
  var instance = url.hostname;

  if (platform === 'bluesky') {
    var bskyMatch = url.pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)/);
    if (bskyMatch) {
      handle = bskyMatch[1];
      postId = bskyMatch[2];
    }
  } else if (platform === 'mastodon') {
    var mastoMatch = url.pathname.match(/^\/@([^/]+)\/(\d+)/);
    if (mastoMatch) {
      handle = mastoMatch[1];
      postId = mastoMatch[2];
    }
  } else if (platform === 'twitter') {
    var twMatch = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (twMatch) {
      handle = twMatch[1];
      postId = twMatch[2];
    }
  }

  // Display name from feed field (e.g., "@shellen.com - Jason Shellen")
  if (meta.feed) {
    var feedParts = meta.feed.match(/^@\S+\s*[-\u2013\u2014]\s*(.+)$/);
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

  if (!displayName) displayName = handle || 'Unknown';

  return {
    displayName: displayName,
    handle: handle,
    postId: postId,
    instance: instance
  };
}

// In-memory avatar cache: cacheKey -> avatarUrl (or '' for failed lookups)
var _avatarCache = {};

/**
 * Fetch avatar URL for a social account. Returns promise resolving to URL or ''.
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
  var toolbarRight = toolbar ? toolbar.querySelector('.reader-toolbar-right') : null;
  if (toolbarRight) {
    toolbarRight.style.display = '';
    toolbarRight.querySelectorAll('.toolbar-nav-btn, .toolbar-divider').forEach(function(el) { el.style.display = ''; });
    var moreBtn = toolbarRight.querySelector('#more-dropdown button');
    if (moreBtn) moreBtn.setAttribute('onclick', 'toggleMoreMenu(event)');
  }

  // Avatar fallback: platform icon in colored circle
  var avatarId = 'social-avatar-' + (author ? author.handle : 'unknown').replace(/[^a-zA-Z0-9-_.]/g, '_');
  var fallbackSvg = platformIcon
    ? '<div class="social-avatar-fallback" style="background:' + platformColor + '"><svg><use href="#' + platformIcon + '"/></svg></div>'
    : '<div class="social-avatar-fallback" style="background:var(--muted)"></div>';

  var handleDisplay = author ? ('@' + author.handle) : '';
  var timeStr = meta.bookmarked ? timeAgo(meta.bookmarked) : '';
  var timeTitle = meta.bookmarked ? timeAgoTitle(meta.bookmarked) : '';

  // Process body: escape HTML, linkify URLs, convert newlines
  var bodyHtml = body || '';
  bodyHtml = escapeHtml(bodyHtml).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" onclick="event.stopPropagation();prOpenExternal(\'$1\');return false">$1</a>'
  );
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

  html += '</div>';

  el.innerHTML = html;
  el.scrollTop = 0;

  // Populate header tags
  renderHeaderTags(filename);

  // Async: fetch real avatar and replace fallback
  if (author && author.handle) {
    fetchSocialAvatar(author.handle, platform, author.instance).then(function(avatarUrl) {
      if (!avatarUrl) return;
      var avatarEl = document.getElementById(avatarId);
      if (!avatarEl) return;
      var img = document.createElement('img');
      img.alt = '';
      img.src = avatarUrl;
      img.onerror = function() { avatarEl.innerHTML = fallbackSvg; };
      avatarEl.innerHTML = '';
      avatarEl.appendChild(img);
    });
  }
}
