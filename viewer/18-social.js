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

// Cache for Bluesky post thread data (keyed by post URL)
var _bskyThreadCache = {};

/**
 * Fetch Bluesky post thread including engagement metrics and quoted posts.
 * Returns promise resolving to thread data or null.
 */
function fetchBskyThread(handle, postId) {
  var cacheKey = handle + '/' + postId;
  if (cacheKey in _bskyThreadCache) return Promise.resolve(_bskyThreadCache[cacheKey]);

  // Resolve handle to DID, then fetch thread
  return fetch('https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=' + encodeURIComponent(handle))
    .then(function(res) { return res.ok ? res.json() : null; })
    .then(function(data) {
      if (!data || !data.did) return null;
      var uri = 'at://' + data.did + '/app.bsky.feed.post/' + postId;
      return fetch('https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=' + encodeURIComponent(uri) + '&depth=0');
    })
    .then(function(res) { return res && res.ok ? res.json() : null; })
    .then(function(data) {
      if (!data || !data.thread || !data.thread.post) return null;
      var post = data.thread.post;
      var result = {
        likeCount: post.likeCount || 0,
        repostCount: post.repostCount || 0,
        replyCount: post.replyCount || 0,
        quoteCount: post.quoteCount || 0,
        createdAt: post.record ? post.record.createdAt : '',
        quotedPost: null
      };
      // Extract quoted/embedded post
      var embed = post.embed;
      if (embed && embed.record && embed.record.author) {
        var qr = embed.record;
        result.quotedPost = {
          author: qr.author.displayName || qr.author.handle || '',
          handle: qr.author.handle || '',
          avatar: qr.author.avatar || '',
          text: (qr.value && qr.value.text) || '',
          uri: qr.uri || ''
        };
      }
      _bskyThreadCache[cacheKey] = result;
      return result;
    })
    .catch(function() {
      _bskyThreadCache[cacheKey] = null;
      return null;
    });
}

/**
 * Build HTML for a quoted post card.
 */
function renderQuotedPost(qp) {
  var html = '<div class="social-quote-post">';
  html += '<div class="social-quote-header">';
  if (qp.avatar) {
    html += '<img class="social-quote-avatar" src="' + escapeHtml(qp.avatar) + '" alt="" onerror="this.style.display=\'none\'">';
  }
  html += '<span class="social-quote-author">' + escapeHtml(qp.author) + '</span>';
  html += '<span class="social-quote-handle">@' + escapeHtml(qp.handle) + '</span>';
  html += '</div>';
  var qText = escapeHtml(qp.text).replace(/(https?:\/\/[^\s<]+)/g,
    '<a href="$1" onclick="event.stopPropagation();prOpenExternal(\'$1\');return false">$1</a>'
  ).replace(/\n/g, '<br>');
  html += '<div class="social-quote-body">' + qText + '</div>';
  html += '</div>';
  return html;
}

/**
 * Build HTML for engagement metrics bar.
 */
function renderEngagementBar(thread) {
  var parts = [];
  if (thread.replyCount) parts.push('<span><svg class="social-engagement-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"/></svg> ' + thread.replyCount + '</span>');
  if (thread.repostCount) parts.push('<span><svg class="social-engagement-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3"/></svg> ' + thread.repostCount + '</span>');
  if (thread.likeCount) parts.push('<span><svg class="social-engagement-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"/></svg> ' + thread.likeCount + '</span>');
  if (thread.quoteCount) parts.push('<span><svg class="social-engagement-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/></svg> ' + thread.quoteCount + '</span>');
  if (!parts.length) return '';
  return '<div class="social-engagement">' + parts.join('') + '</div>';
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
  var isFav = articleNotes.isFavorite;
  toolbarActions += '<button onclick="toggleFavoriteFromHeader(this)" class="toolbar-action-btn' + (isFav ? ' active-fav' : '') + '" aria-label="' + (isFav ? 'Remove star' : 'Star article') + '"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-' + (isFav ? 'heart' : 'heart-o') + '"/></svg><span class="toolbar-action-label"> Star</span></button>';
  var isRead = activeFile && readArticles.has(activeFile);
  toolbarActions += '<button onclick="toggleReadFromHeader(this)" class="toolbar-action-btn' + (isRead ? ' active-read' : '') + '" aria-label="' + (isRead ? 'Mark unread' : 'Mark read') + '"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-' + (isRead ? 'envelope' : 'envelope-open') + '"/></svg><span class="toolbar-action-label"> ' + (isRead ? 'Unread' : 'Read') + '</span></button>';
  toolbarActions += '<div class="play-next-menu" id="play-next-menu">';
  toolbarActions += '<button id="listen-btn" onclick="addCurrentToTTSQueue()" class="toolbar-action-btn" aria-label="Listen"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-volume"/></svg><span class="toolbar-action-label"> Listen</span></button>';
  toolbarActions += '<button class="play-next-trigger" id="play-next-trigger" onclick="togglePlayNextMenu(event)" aria-label="Queue options" style="display:none"><svg class="icon icon-sm" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>';
  toolbarActions += '</div>';
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
  // Show actual date/time for social posts
  var timeStr = '';
  var timeTitle = '';
  if (meta.bookmarked) {
    var d = new Date(meta.bookmarked);
    if (!isNaN(d.getTime())) {
      timeStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      timeTitle = d.toISOString();
    }
  }

  // Body: fall back to excerpt or annotation when body is empty
  var bodyText = body || meta.excerpt || meta.annotation || '';
  // Strip quote-post placeholder from Bluesky feed content
  bodyText = bodyText.replace(/\\?\[contains quote post or other embedded content\\?\]/gi, '').trim();

  // Process body: escape HTML, linkify URLs, convert newlines
  var bodyHtml = escapeHtml(bodyText).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" onclick="event.stopPropagation();prOpenExternal(\'$1\');return false">$1</a>'
  );
  bodyHtml = bodyHtml.replace(/\n/g, '<br>');

  var html = '<div class="article-header"></div>';
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

  // Tags inside the card
  html += '<div class="social-card-tags" id="header-tags"></div>';

  html += '</div>';

  el.innerHTML = html;
  el.scrollTop = 0;

  // Populate tags
  renderNotesPanel();

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

  // Async: fetch Bluesky thread data for engagement metrics and quoted posts
  if (platform === 'bluesky' && author && author.handle && author.postId) {
    fetchBskyThread(author.handle, author.postId).then(function(thread) {
      if (!thread) return;
      // Verify we're still viewing this article
      if (activeFile !== filename) return;

      // Update timestamp from API if available (more accurate than bookmarked date)
      if (thread.createdAt) {
        var metaEl = el.querySelector('.social-author-meta');
        if (metaEl) {
          var td = new Date(thread.createdAt);
          if (!isNaN(td.getTime())) {
            var newTime = td.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              + ' ' + td.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
            var spans = metaEl.querySelectorAll('span');
            // Find the time span (second text span after the dot separator)
            for (var si = 0; si < spans.length; si++) {
              if (spans[si].hasAttribute('title')) {
                spans[si].textContent = newTime;
                spans[si].title = td.toISOString();
                break;
              }
            }
          }
        }
      }

      // Insert engagement bar before footer
      var engHtml = renderEngagementBar(thread);
      if (engHtml) {
        var footer = el.querySelector('.social-card-footer');
        if (footer) {
          footer.insertAdjacentHTML('beforebegin', engHtml);
        }
      }

      // Insert quoted post after body
      if (thread.quotedPost) {
        var bodyEl = el.querySelector('.social-card-body');
        if (bodyEl) {
          bodyEl.insertAdjacentHTML('afterend', renderQuotedPost(thread.quotedPost));
        }
      }
    });
  }
}
