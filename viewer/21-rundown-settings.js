// ABOUTME: Settings for what goes in The Rundown: Today's one read, wider news, and "Near you" local feeds
// ABOUTME: Rendered inside The Rundown card (03-settings.js); saves only these fields via /api/email-settings

var _rundownContent = { oneRead: true, widerNews: true, regionalFeeds: [], panelCatalog: [], panelCustom: false };

var LEAN_LABEL = { left: 'Left-leaning', center: 'Center', right: 'Right-leaning' };

function renderRundownContentSettings(data) {
  _rundownContent = {
    oneRead: data.oneRead !== false,
    widerNews: data.widerNews !== false,
    regionalFeeds: Array.isArray(data.regionalFeeds) ? data.regionalFeeds.slice() : [],
    // Every outlet, with whether it's on. panelCustom: the reader changed the list (else defaults apply).
    panelCatalog: Array.isArray(data.panelCatalog) ? data.panelCatalog.map(function(o) { return { name: o.name, lean: o.lean, scope: o.scope, defaultOn: !!o.defaultOn, enabled: !!o.enabled }; }) : [],
    panelCustom: !!data.panelCustom
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
  h += '<a href="#" onclick="settingsToggleOutletList(event)" style="color:var(--link)">Choose outlets (' + _enabledCount() + ' on)</a></div>';
  h += '<div id="rundown-outlet-list" style="display:none;margin-top:10px">' + renderOutletList(_rundownContent.panelCatalog) + '</div></div>';
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

function _enabledCount() {
  return _rundownContent.panelCatalog.filter(function(o) { return o.enabled; }).length;
}

/** A note when the chosen outlets can't support the coverage check well, else ''. */
function outletBalanceNote(catalog) {
  var on = catalog.filter(function(o) { return o.enabled; });
  var leans = {};
  on.forEach(function(o) { leans[o.lean] = true; });
  var leanCount = Object.keys(leans).length;
  if (on.length < 3) return 'Turn on at least 3 outlets for the coverage check to work.';
  if (leanCount < 2) return 'All your outlets share one lean, so no story can count as widely covered. Add outlets from another lean.';
  var missing = ['left', 'center', 'right'].filter(function(l) { return !leans[l]; });
  if (missing.length) return 'No ' + missing.map(function(l) { return LEAN_LABEL[l].toLowerCase(); }).join(' or ') + ' outlets are on. Coverage checks are most balanced with all three.';
  return '';
}

function renderOutletList(catalog) {
  if (!catalog || !catalog.length) return '<div style="font-size:12px;color:var(--muted)">Outlet list unavailable.</div>';
  var h = '<div class="outlet-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:4px 16px;font-size:13px">';
  ['left', 'center', 'right'].forEach(function(lean) {
    h += '<div><div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin:4px 0 4px">' + LEAN_LABEL[lean] + '</div>';
    catalog.forEach(function(o, i) {
      if (o.lean !== lean) return;
      var id = 'sp-outlet-' + i;
      h += '<label for="' + id + '" style="display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;color:var(--fg)">';
      h += '<input type="checkbox" id="' + id + '"' + (o.enabled ? ' checked' : '') + ' onchange="settingsToggleOutlet(' + i + ', this.checked)" style="accent-color:var(--link)">';
      h += escapeHtml(o.name) + (o.scope === 'global' ? ' <span style="color:var(--muted);font-size:11px">world</span>' : '') + '</label>';
    });
    h += '</div>';
  });
  h += '</div>';
  var note = outletBalanceNote(catalog);
  h += '<div id="rundown-outlet-note" style="font-size:12px;color:' + (note ? 'var(--warning, #b45535)' : 'var(--muted)') + ';margin-top:8px;line-height:1.5">' + escapeHtml(note) + '</div>';
  h += '<div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.5">A story counts as widely covered when at least 3 of your outlets (more if you turn many on), across at least two leans, run it. Leans are rough, based on public media-bias ratings. ';
  h += '<a href="#" onclick="settingsResetOutlets(event)" style="color:var(--link)">Reset to defaults</a></div>';
  return h;
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

function settingsSaveRundownContent(extra) {
  var body = {
    oneRead: _rundownContent.oneRead,
    widerNews: _rundownContent.widerNews,
    regionalFeeds: _rundownContent.regionalFeeds
  };
  // Only store an outlet list once the reader has changed it, so improved defaults still reach everyone else.
  if (_rundownContent.panelCustom) {
    body.panelEnabled = _rundownContent.panelCatalog.filter(function(o) { return o.enabled; }).map(function(o) { return o.name; });
  }
  if (extra) for (var k in extra) body[k] = extra[k];
  return fetch('/api/email-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function(r) { return r.json(); });
}

function _refreshOutletList() {
  var el = document.getElementById('rundown-outlet-list');
  if (el) el.innerHTML = renderOutletList(_rundownContent.panelCatalog);
  var link = document.querySelector && document.querySelector('a[onclick^="settingsToggleOutletList"]');
  if (link) link.textContent = 'Choose outlets (' + _enabledCount() + ' on)';
}

function settingsToggleOutlet(index, checked) {
  var o = _rundownContent.panelCatalog[index];
  if (!o) return Promise.resolve();
  o.enabled = !!checked;
  _rundownContent.panelCustom = true;
  _refreshOutletList();
  return settingsSaveRundownContent();
}

function settingsResetOutlets(e) {
  if (e && e.preventDefault) e.preventDefault();
  _rundownContent.panelCatalog.forEach(function(o) { o.enabled = o.defaultOn; });
  _rundownContent.panelCustom = false;
  _refreshOutletList();
  return settingsSaveRundownContent({ panelEnabled: null });
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
