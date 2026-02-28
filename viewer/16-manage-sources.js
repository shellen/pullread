// ABOUTME: Dedicated view for managing feed subscriptions and discovering new sources.
// ABOUTME: Renders in the article content area like Settings does.

var FEED_BUNDLES = [
  { name: 'Indie Web', desc: 'Personal blogs and the open web', feeds: [
    { name: 'kottke.org', url: 'https://feeds.kottke.org/main' },
    { name: 'Waxy.org', url: 'https://waxy.org/feed/' },
    { name: 'Daring Fireball', url: 'https://daringfireball.net/feeds/main' },
    { name: 'Anil Dash', url: 'https://anildash.com/feed.xml' },
    { name: 'Pluralistic', url: 'https://pluralistic.net/feed/' }
  ]},
  { name: 'Comedy Podcasts', desc: 'Laugh while you commute', feeds: [
    { name: 'Conan O\'Brien Needs a Friend', url: 'https://feeds.simplecast.com/dHoohVNH' },
    { name: 'SmartLess', url: 'https://feeds.simplecast.com/yVaAVF_G' },
    { name: 'The Comedy Button', url: 'https://rss.libsyn.com/shows/34195/destinations/79079.xml' },
    { name: 'Good Hang with Amy Poehler', url: 'https://feeds.megaphone.fm/good-hang-with-amy-poehler' }
  ]},
  { name: 'Music News', desc: 'Album reviews, interviews, and industry', feeds: [
    { name: 'Pitchfork', url: 'https://pitchfork.com/feed/feed-news/rss' },
    { name: 'Stereogum', url: 'https://www.stereogum.com/feed/' },
    { name: 'Brooklyn Vegan', url: 'https://www.brooklynvegan.com/feed/' }
  ]}
];

function showManageSourcesPage() {
  var prevActive = activeFile;
  activeFile = null;
  _activeNotebook = null;
  var content = document.getElementById('content');
  var empty = document.getElementById('empty-state');
  empty.style.display = 'none';
  content.style.display = 'block';
  content.classList.remove('settings-view');
  content.classList.add('manage-sources-view');
  document.title = 'Sources \u2014 PullRead';
  document.getElementById('margin-notes').innerHTML = '';
  var toc = document.getElementById('toc-container');
  if (toc) toc.innerHTML = '';
  var toolbar = document.getElementById('reader-toolbar');
  if (toolbar) toolbar.style.display = 'none';
  updateSidebarActiveState(prevActive);

  var html = '';
  html += '<div class="sources-header"><h1>Manage Sources</h1>';
  html += '<p class="sources-desc">Add, remove, and discover feeds</p></div>';

  // Feed container — loaded async
  html += '<div class="sources-content">';
  html += '<div id="settings-feeds">';
  html += '<p style="color:var(--muted);font-size:13px">Loading sources\u2026</p>';
  html += '</div>';

  // Discover section — rendered after feeds load
  html += '<div id="sources-discover"></div>';
  html += '</div>';

  content.innerHTML = html;
  document.getElementById('content-scroll').scrollTop = 0;

  // Load feed config
  if (serverMode) {
    fetch('/api/config').then(function(r) { return r.json(); }).then(function(cfg) {
      var feedSec = document.getElementById('settings-feeds');
      if (!feedSec) return;
      var feeds = cfg.feeds || {};
      var feedNames = Object.keys(feeds);

      var fh = '';
      // Add feed input
      fh += '<div class="sources-add-row">';
      fh += '<input type="text" id="sp-new-feed" placeholder="Paste feed URL or web address\u2026" class="input-field" style="flex:1" onkeydown="if(event.key===\'Enter\')sourcesAddFeed()">';
      fh += '<button class="btn-primary" onclick="sourcesAddFeed()" id="sp-add-feed-btn" style="font-size:13px;padding:6px 14px;white-space:nowrap">Add</button>';
      fh += '<button onclick="sourcesImportOPML()" style="font-size:13px;padding:6px 14px;white-space:nowrap;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit">Import OPML</button>';
      fh += '</div>';

      if (feedNames.length > 0) {
        fh += '<div class="sources-list-header">';
        fh += '<span>Your Sources (' + feedNames.length + ')</span>';
        if (feedNames.length > 8) {
          fh += '<input type="text" placeholder="Filter sources\u2026" class="input-field sources-filter" oninput="settingsFilterFeeds(this.value)">';
        }
        fh += '</div>';

        var initialShow = 10;
        fh += '<div class="sources-feed-list">';
        for (var fi = 0; fi < feedNames.length; fi++) {
          var fn = feedNames[fi];
          var hidden = fi >= initialShow ? ' feed-row-hidden' : '';
          var hiddenStyle = fi >= initialShow ? ' style="display:none"' : '';
          fh += '<div class="feed-row' + hidden + '" id="feed-row-' + fi + '" data-feed-name="' + escapeHtml(fn.toLowerCase()) + '" data-feed-url="' + escapeHtml(feeds[fn].toLowerCase()) + '"' + hiddenStyle + '>';
          fh += '<div style="flex:1;min-width:0">';
          fh += '<div style="font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(fn) + '</div>';
          fh += '<div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(feeds[fn]) + '</div>';
          fh += '</div>';
          fh += '<div style="display:flex;gap:4px;flex-shrink:0">';
          fh += '<button onclick="sourcesEditFeed(' + fi + ')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:12px;padding:2px 6px" title="Edit"><svg class="icon icon-sm"><use href="#i-pen"/></svg></button>';
          fh += '<button onclick="sourcesRemoveFeed(\'' + escapeHtml(fn.replace(/'/g, "\\'")) + '\')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:2px 6px" title="Remove">&times;</button>';
          fh += '</div></div>';
        }
        fh += '</div>';
        if (feedNames.length > initialShow) {
          fh += '<button id="feed-expand-toggle" data-expanded="0" onclick="toggleFeedList()" style="display:block;width:100%;margin-top:6px;padding:6px;text-align:center;font-size:12px;color:var(--link);background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit">Show ' + (feedNames.length - initialShow) + ' more feeds</button>';
        }
      } else {
        fh += '<p style="color:var(--muted);font-size:13px">No feeds configured. Paste a feed URL above to get started.</p>';
      }

      fh += '<div style="font-size:11px;color:var(--muted);margin-top:10px;line-height:1.6">'
        + 'Paste a bookmark feed URL from Instapaper, Pinboard, Raindrop, or Pocket. '
        + 'You can also subscribe to newsletters and blogs \u2014 just paste the web address.'
        + '</div>';

      feedSec.innerHTML = fh;
      feedSec._configData = cfg;

      // Load feed status to show errors
      fetch('/api/feed-status').then(function(r) { return r.json(); }).then(function(status) {
        for (var sn in status) {
          if (!status[sn].ok) {
            var rows = document.querySelectorAll('.feed-row');
            for (var ri = 0; ri < rows.length; ri++) {
              if (rows[ri].getAttribute('data-feed-name') === sn.toLowerCase()) {
                var nameDiv = rows[ri].querySelector('div:first-child');
                if (nameDiv) {
                  var idx = rows[ri].id.replace('feed-row-', '');
                  nameDiv.innerHTML += '<div style="font-size:11px;color:#dc2626;display:flex;align-items:center;gap:4px;margin-top:2px">'
                    + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(status[sn].error || 'Sync failed') + '</span>'
                    + '<button onclick="sourcesRetryFeed(\'' + escapeHtml(sn.replace(/'/g, "\\'")) + '\',\'' + escapeHtml((cfg.feeds[sn] || '').replace(/'/g, "\\'")) + '\',' + idx + ')" style="flex-shrink:0;font-size:10px;padding:2px 8px;background:none;border:1px solid #dc2626;border-radius:4px;color:#dc2626;cursor:pointer;font-family:inherit">Retry</button>'
                    + '</div>';
                }
                break;
              }
            }
          }
        }
      }).catch(function() {});

      // Render discover section
      renderSourcesDiscover(cfg);

    }).catch(function() {
      var feedSec = document.getElementById('settings-feeds');
      if (feedSec) {
        feedSec.innerHTML = '<p style="color:var(--muted);font-size:13px">Could not load feed configuration.</p>';
      }
    });
  }
}

function renderSourcesDiscover(cfg) {
  var el = document.getElementById('sources-discover');
  if (!el) return;
  var userFeeds = cfg.feeds || {};
  var userUrls = new Set();
  for (var k in userFeeds) userUrls.add(userFeeds[k].toLowerCase());

  var html = '<div class="sources-discover-header"><h2>Discover Sources</h2></div>';
  html += '<div class="bundle-cards">';
  for (var bi = 0; bi < FEED_BUNDLES.length; bi++) {
    var bundle = FEED_BUNDLES[bi];
    var unsubscribed = bundle.feeds.filter(function(f) { return !userUrls.has(f.url.toLowerCase()); });
    html += '<div class="bundle-card">';
    html += '<div class="bundle-card-name">' + escapeHtml(bundle.name) + '</div>';
    html += '<div class="bundle-card-desc">' + escapeHtml(bundle.desc) + '</div>';
    html += '<div class="bundle-card-count">' + bundle.feeds.length + ' feeds</div>';
    html += '<div class="bundle-card-feeds">';
    for (var fi = 0; fi < bundle.feeds.length; fi++) {
      var f = bundle.feeds[fi];
      var already = userUrls.has(f.url.toLowerCase());
      if (already) {
        html += '<span class="bundle-feed-pill subscribed">' + escapeHtml(f.name) + ' \u2713</span>';
      } else {
        html += '<button class="bundle-feed-pill" onclick="addBundleFeed(this,\'' + escapeHtml(f.name.replace(/'/g, "\\'")) + '\',\'' + escapeHtml(f.url.replace(/'/g, "\\'")) + '\')">' + escapeHtml(f.name) + '</button>';
      }
    }
    html += '</div>';
    if (unsubscribed.length > 0) {
      html += '<button class="btn-primary bundle-add-all" onclick="addBundle(' + bi + ',this)">Add all ' + unsubscribed.length + '</button>';
    } else {
      html += '<span class="bundle-all-added">\u2713 All added</span>';
    }
    html += '</div>';
  }
  html += '</div>';

  // Individual picks from suggested feeds
  html += '<div class="sources-picks-header"><h3>Individual picks</h3></div>';
  html += '<div id="sources-picks" class="sources-picks">';
  html += '</div>';

  el.innerHTML = html;

  // Load suggested feeds for individual picks
  fetchSuggestedFeeds(function(feeds) {
    var filtered = filterSuggestedFeeds(feeds);
    var picks = document.getElementById('sources-picks');
    if (!picks || filtered.length === 0) return;
    var ph = '';
    for (var i = 0; i < filtered.length; i++) {
      var f = filtered[i];
      ph += '<button class="tag-pill" onclick="addBundleFeed(this,\'' + escapeHtml(f.name.replace(/'/g, "\\'")) + '\',\'' + escapeHtml(f.url.replace(/'/g, "\\'")) + '\')">' + escapeHtml(f.name) + '</button>';
    }
    picks.innerHTML = ph;
  });
}

// Save feeds from the manage sources view (fetches fresh config, merges feeds, saves)
function sourcesSaveConfig() {
  var sec = document.getElementById('settings-feeds');
  if (!sec || !sec._configData) return Promise.resolve();
  var feeds = sec._configData.feeds || {};
  return fetch('/api/config').then(function(r) { return r.json(); }).then(function(cfg) {
    cfg.feeds = feeds;
    return fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
  }).then(function(r) {
    if (r.ok) showManageSourcesPage();
    else showToast('Failed to save feed settings.');
  });
}

async function sourcesAddFeed() {
  var input = document.getElementById('sp-new-feed');
  var url = (input.value || '').trim();
  if (!url) return;
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  var btn = document.getElementById('sp-add-feed-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Finding feed\u2026'; }
  try {
    var r = await fetch('/api/feed-discover?url=' + encodeURIComponent(url));
    var result = await r.json();
    var feedUrl = result.feedUrl || url;
    var title = result.title || feedUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    var sec = document.getElementById('settings-feeds');
    if (sec && sec._configData) {
      if (!sec._configData.feeds) sec._configData.feeds = {};
      sec._configData.feeds[title] = feedUrl;
    }
  } catch (e) {
    var sec2 = document.getElementById('settings-feeds');
    if (sec2 && sec2._configData) {
      if (!sec2._configData.feeds) sec2._configData.feeds = {};
      sec2._configData.feeds[url] = url;
    }
  }
  sourcesSaveConfig();
}

function sourcesRemoveFeed(name) {
  var rows = document.querySelectorAll('.feed-row');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].getAttribute('data-feed-name') === name.toLowerCase()) {
      var row = rows[i];
      row.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:space-between;gap:8px">'
        + '<span style="font-size:13px">Remove <strong>' + escapeHtml(name) + '</strong>?</span>'
        + '<div style="display:flex;gap:6px">'
        + '<button onclick="sourcesConfirmRemoveFeed(\'' + escapeHtml(name.replace(/'/g, "\\'")) + '\')" style="font-size:12px;padding:4px 12px;background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:inherit">Remove</button>'
        + '<button onclick="showManageSourcesPage()" style="font-size:12px;padding:4px 12px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit">Cancel</button>'
        + '</div></div>';
      break;
    }
  }
}

function sourcesConfirmRemoveFeed(name) {
  var sec = document.getElementById('settings-feeds');
  if (sec && sec._configData && sec._configData.feeds) {
    delete sec._configData.feeds[name];
  }
  sourcesSaveConfig();
}

function sourcesEditFeed(rowIndex) {
  var sec = document.getElementById('settings-feeds');
  if (!sec || !sec._configData) return;
  var feeds = sec._configData.feeds || {};
  var names = Object.keys(feeds);
  var name = names[rowIndex];
  if (name === undefined) return;
  var url = feeds[name];
  var row = document.getElementById('feed-row-' + rowIndex);
  if (!row) return;
  row.innerHTML = '<div style="flex:1;display:flex;flex-direction:column;gap:6px">'
    + '<input type="text" id="feed-edit-name-' + rowIndex + '" value="' + escapeHtml(name) + '" placeholder="Feed name" style="padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--fg);font-size:13px;font-family:inherit">'
    + '<input type="text" id="feed-edit-url-' + rowIndex + '" value="' + escapeHtml(url) + '" placeholder="Feed URL" style="padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--fg);font-size:12px;font-family:inherit">'
    + '<div style="display:flex;gap:6px">'
    + '<button class="btn-primary" onclick="sourcesSaveEditFeed(' + rowIndex + ',\'' + escapeHtml(name.replace(/'/g, "\\'")) + '\')" style="font-size:12px;padding:4px 12px">Save</button>'
    + '<button onclick="showManageSourcesPage()" style="font-size:12px;padding:4px 12px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit">Cancel</button>'
    + '</div></div>';
  document.getElementById('feed-edit-name-' + rowIndex).focus();
}

function sourcesSaveEditFeed(rowIndex, oldName) {
  var sec = document.getElementById('settings-feeds');
  if (!sec || !sec._configData) return;
  var newName = (document.getElementById('feed-edit-name-' + rowIndex).value || '').trim();
  var newUrl = (document.getElementById('feed-edit-url-' + rowIndex).value || '').trim();
  if (!newName || !newUrl) return;
  if (newName !== oldName) delete sec._configData.feeds[oldName];
  sec._configData.feeds[newName] = newUrl;
  sourcesSaveConfig();
}

function sourcesRetryFeed(name, feedUrl, rowIndex) {
  var row = document.getElementById('feed-row-' + rowIndex);
  var errDiv = row ? row.querySelector('div[style*="color:#dc2626"]') : null;
  if (errDiv) errDiv.innerHTML = '<span style="color:var(--muted)">Retrying\u2026</span>';
  fetch('/api/retry-feed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, url: feedUrl })
  }).then(function(r) { return r.json(); }).then(function(result) {
    if (result.ok) {
      if (errDiv) errDiv.remove();
      showToast(name + ': OK (' + result.entries + ' entries)');
    } else {
      if (errDiv) errDiv.innerHTML = '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(result.error || 'Retry failed') + '</span>';
      showToast(name + ': still failing');
    }
  }).catch(function() {
    if (errDiv) errDiv.innerHTML = '<span>Retry failed</span>';
  });
}

function sourcesImportOPML() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.opml,.xml';
  input.onchange = function() {
    if (!input.files || !input.files[0]) return;
    var reader = new FileReader();
    reader.onload = function() {
      var doc = new DOMParser().parseFromString(reader.result, 'text/xml');
      var outlines = doc.querySelectorAll('outline[xmlUrl]');
      if (!outlines.length) { showToast('No feeds found in this file.'); return; }
      var sec = document.getElementById('settings-feeds');
      if (!sec || !sec._configData) return;
      if (!sec._configData.feeds) sec._configData.feeds = {};
      var added = 0;
      for (var i = 0; i < outlines.length; i++) {
        var el = outlines[i];
        var url = el.getAttribute('xmlUrl');
        var name = el.getAttribute('text') || el.getAttribute('title') || url;
        if (!sec._configData.feeds[name]) {
          sec._configData.feeds[name] = url;
          added++;
        }
      }
      if (added === 0) { showToast('All feeds already exist.'); return; }
      sourcesSaveConfig();
    };
    reader.readAsText(input.files[0]);
  };
  input.click();
}

function addBundle(bundleIndex, btn) {
  if (bundleIndex < 0 || bundleIndex >= FEED_BUNDLES.length) return;
  var bundle = FEED_BUNDLES[bundleIndex];
  if (btn) { btn.disabled = true; btn.textContent = 'Adding\u2026'; }
  fetch('/api/config').then(function(r) { return r.json(); }).then(function(cfg) {
    var feeds = cfg.feeds || {};
    var added = 0;
    for (var i = 0; i < bundle.feeds.length; i++) {
      var f = bundle.feeds[i];
      var exists = false;
      for (var k in feeds) {
        if (feeds[k].toLowerCase() === f.url.toLowerCase()) { exists = true; break; }
      }
      if (!exists) { feeds[f.name] = f.url; added++; }
    }
    cfg.feeds = feeds;
    return fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
  }).then(function(r) {
    if (r.ok) {
      showToast('Added ' + bundle.name + ' bundle');
      showManageSourcesPage();
    } else {
      if (btn) { btn.disabled = false; btn.textContent = 'Add all'; }
      showToast('Failed to add bundle.');
    }
  }).catch(function() {
    if (btn) { btn.disabled = false; btn.textContent = 'Add all'; }
  });
}

function addBundleFeed(btn, name, url) {
  btn.disabled = true;
  btn.textContent = 'Adding\u2026';
  fetch('/api/config').then(function(r) { return r.json(); }).then(function(cfg) {
    var feeds = cfg.feeds || {};
    feeds[name] = url;
    cfg.feeds = feeds;
    return fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
  }).then(function(r) {
    if (r.ok) {
      btn.textContent = '\u2713 Added';
      btn.style.opacity = '0.5';
      btn.classList.add('subscribed');
      showToast('Added ' + name);
    } else {
      btn.textContent = name;
      btn.disabled = false;
    }
  }).catch(function() {
    btn.textContent = name;
    btn.disabled = false;
  });
}
