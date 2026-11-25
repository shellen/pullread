// ABOUTME: Settings for what goes in The Rundown: Today's one read, wider news, and "Near you" local feeds
// ABOUTME: Rendered inside The Rundown card (03-settings.js); saves only these fields via /api/email-settings

var _rundownContent = { oneRead: true, widerNews: true, regionalFeeds: [], panelOutlets: [] };

var LEAN_LABEL = { left: 'Left-leaning', center: 'Center', right: 'Right-leaning' };

function renderRundownContentSettings(data) {
  _rundownContent = {
    oneRead: data.oneRead !== false,
    widerNews: data.widerNews !== false,
    regionalFeeds: Array.isArray(data.regionalFeeds) ? data.regionalFeeds.slice() : [],
    panelOutlets: Array.isArray(data.panelOutlets) ? data.panelOutlets : []
  };
  var h = '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">';
  h += '<div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">What goes in</div>';
  h += '</div>';

  // Today's one read
  h += '<div class="setting-row">';
  h += '<div class="setting-label"><label for="sp-rundown-oneread">Today’s one read</label>';
  h += '<div class="setting-desc">Lead with the one article that best matches your highlights, favorites, notes and reading. Picked on this Mac; nothing is sent anywhere.</div></div>';
  h += '<div class="setting-control"><input type="checkbox" id="sp-rundown-oneread"' + (_rundownContent.oneRead ? ' checked' : '') + ' onchange="settingsToggleRundownContent(\'oneRead\', this.checked)" style="width:18px;height:18px;accent-color:var(--link)"></div>';
  h += '</div>';

  // Wider news
  h += '<div class="setting-row">';
  h += '<div class="setting-label"><label for="sp-rundown-widernews">Wider news</label>';
  h += '<div class="setting-desc">Check headlines from major outlets across the political spectrum, so big stories reach you even if you don’t follow them. Headlines only; nothing is saved to your library. ';
  h += '<a href="#" onclick="settingsToggleOutletList(event)" style="color:var(--link)">Which outlets?</a></div>';
  h += '<div id="rundown-outlet-list" style="display:none;margin-top:8px;font-size:12px;color:var(--muted);line-height:1.6">' + renderOutletList(_rundownContent.panelOutlets) + '</div></div>';
  h += '<div class="setting-control"><input type="checkbox" id="sp-rundown-widernews"' + (_rundownContent.widerNews ? ' checked' : '') + ' onchange="settingsToggleRundownContent(\'widerNews\', this.checked)" style="width:18px;height:18px;accent-color:var(--link)"></div>';
  h += '</div>';

  // Near you
  h += '<div class="setting-row" style="align-items:flex-start">';
  h += '<div class="setting-label"><label>Near you</label>';
  h += '<div class="setting-desc">Add two or more local news feeds. When they agree on a story, it shows as “Near you”.</div></div>';
  h += '<div class="setting-control" style="flex-direction:column;align-items:stretch;gap:6px;min-width:260px">';
  h += '<div id="rundown-regional-list">' + renderRegionalFeedList(_rundownContent.regionalFeeds) + '</div>';
  h += '<div style="display:flex;gap:6px">';
  h += '<input type="text" id="sp-regional-name" placeholder="Name" aria-label="Feed name" class="input-field" style="width:90px">';
  h += '<input type="url" id="sp-regional-url" aria-label="Feed address" placeholder="https://…/feed" class="input-field" style="flex:1;min-width:0" onkeydown="if(event.key===\'Enter\')settingsAddRegionalFeed()">';
  h += '<button onclick="settingsAddRegionalFeed()" style="font-size:13px;padding:4px 12px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit">Add</button>';
  h += '</div>';
  h += '<div id="rundown-regional-status" style="font-size:12px;color:var(--muted)"></div>';
  h += '</div></div>';
  return h;
}

function renderOutletList(outlets) {
  if (!outlets || !outlets.length) return 'Outlet list unavailable.';
  var groups = { left: [], center: [], right: [] };
  for (var i = 0; i < outlets.length; i++) {
    var o = outlets[i];
    (groups[o.lean] || (groups[o.lean] = [])).push(escapeHtml(o.name));
  }
  var parts = [];
  ['left', 'center', 'right'].forEach(function(lean) {
    if (groups[lean] && groups[lean].length) parts.push('<strong>' + LEAN_LABEL[lean] + ':</strong> ' + groups[lean].join(', '));
  });
  return parts.join('<br>') + '<br>A story counts as widely covered when 3 or more of these, across at least two leans, run it.';
}

function renderRegionalFeedList(feeds) {
  if (!feeds || !feeds.length) return '<div style="font-size:12px;color:var(--muted)">No local feeds yet.</div>';
  var h = '';
  for (var i = 0; i < feeds.length; i++) {
    h += '<div class="regional-feed-row" style="display:flex;align-items:center;gap:8px;font-size:13px;padding:2px 0">';
    h += '<span style="font-weight:500">' + escapeHtml(feeds[i].name) + '</span>';
    h += '<span style="color:var(--muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(feeds[i].feedUrl) + '">' + escapeHtml(feeds[i].feedUrl) + '</span>';
    h += '<button onclick="settingsRemoveRegionalFeed(' + i + ')" aria-label="Remove ' + escapeHtml(feeds[i].name) + '" style="border:none;background:none;color:var(--muted);cursor:pointer;font-size:15px;line-height:1">×</button>';
    h += '</div>';
  }
  if (feeds.length === 1) h += '<div style="font-size:12px;color:var(--muted)">Add one more: “Near you” needs two local outlets to agree.</div>';
  return h;
}

/** Returns an error message, or '' when the URL is a usable feed address. */
function validateRegionalFeedUrl(url, existing) {
  var u;
  try { u = new URL(url); } catch (e) { return 'Enter a full feed address, starting with https://'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Feed addresses must start with http:// or https://';
  for (var i = 0; i < (existing || []).length; i++) {
    if (existing[i].feedUrl === u.href) return 'That feed is already in the list.';
  }
  if ((existing || []).length >= 10) return 'Up to 10 local feeds.';
  return '';
}

function settingsSaveRundownContent() {
  return fetch('/api/email-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      oneRead: _rundownContent.oneRead,
      widerNews: _rundownContent.widerNews,
      regionalFeeds: _rundownContent.regionalFeeds
    })
  }).then(function(r) { return r.json(); });
}

function settingsToggleRundownContent(key, checked) {
  _rundownContent[key] = !!checked;
  return settingsSaveRundownContent();
}

function settingsToggleOutletList(e) {
  if (e && e.preventDefault) e.preventDefault();
  var el = document.getElementById('rundown-outlet-list');
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

function _refreshRegionalList(message) {
  var list = document.getElementById('rundown-regional-list');
  if (list) list.innerHTML = renderRegionalFeedList(_rundownContent.regionalFeeds);
  var status = document.getElementById('rundown-regional-status');
  if (status) status.textContent = message || '';
}

function settingsAddRegionalFeed() {
  var nameEl = document.getElementById('sp-regional-name');
  var urlEl = document.getElementById('sp-regional-url');
  var url = ((urlEl && urlEl.value) || '').trim();
  var err = validateRegionalFeedUrl(url, _rundownContent.regionalFeeds);
  if (err) { _refreshRegionalList(err); return Promise.resolve(false); }
  var href = new URL(url).href;
  var name = ((nameEl && nameEl.value) || '').trim() || new URL(url).hostname.replace(/^www\./, '');
  _rundownContent.regionalFeeds.push({ name: name.slice(0, 60), feedUrl: href });
  if (nameEl) nameEl.value = '';
  if (urlEl) urlEl.value = '';
  _refreshRegionalList('');
  return settingsSaveRundownContent().then(function() { _refreshRegionalList('Saved'); return true; });
}

function settingsRemoveRegionalFeed(index) {
  _rundownContent.regionalFeeds.splice(index, 1);
  _refreshRegionalList('');
  return settingsSaveRundownContent();
}
