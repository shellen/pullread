// ABOUTME: Reports reading activity (opens, progress, finishes) to the local sidecar for Today's one read
// ABOUTME: Batches events to /api/reading, flushes on page hide, and backfills the existing read list once

// Read state used to live only in localStorage, so the Rundown couldn't skip
// what you'd read or learn from it. Everything goes to the local sidecar only.

var _readingQueue = [];
var _readingTimer = null;
var _readingSentProgress = {};
var READING_BACKFILL_KEY = 'pr-reading-backfilled-v1';

function queueReadingEvent(ev) {
  if (!ev || !ev.filename) return;
  if (ev.type === 'progress') {
    var last = _readingSentProgress[ev.filename] || 0;
    // Only meaningful progress: 10 more points, or crossing 90% (finished).
    var crossesFinish = ev.progress >= 0.9 && last < 0.9;
    if (ev.progress < last + 0.1 && !crossesFinish) return;
    _readingSentProgress[ev.filename] = ev.progress;
  }
  _readingQueue.push(ev);
  if (_readingQueue.length > 500) _readingQueue = _readingQueue.slice(-500);
  clearTimeout(_readingTimer);
  _readingTimer = setTimeout(flushReadingEvents, 3000);
}

function flushReadingEvents() {
  if (!_readingQueue.length) return Promise.resolve();
  var batch = _readingQueue;
  _readingQueue = [];
  return fetch('/api/reading', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: batch })
  }).then(function(r) {
    if (!r.ok) throw new Error('reading sync failed: ' + r.status);
  }).catch(function() {
    // Keep the events for the next flush (bounded).
    _readingQueue = batch.concat(_readingQueue).slice(-500);
  });
}

// Send the existing read list and saved scroll positions once, so history
// from before this feature isn't lost.
function syncReadingBackfill() {
  try {
    if (localStorage.getItem(READING_BACKFILL_KEY)) return Promise.resolve(false);
  } catch (e) { return Promise.resolve(false); }
  var events = [];
  try {
    var read = JSON.parse(localStorage.getItem('pr-read-articles') || '[]');
    for (var i = 0; i < read.length; i++) events.push({ filename: read[i], type: 'backfill' });
    var positions = JSON.parse(localStorage.getItem('pr-scroll-positions') || '{}');
    Object.keys(positions).forEach(function(f) {
      var p = positions[f];
      if (p && p.pct > 0) events.push({ filename: f, type: 'progress', progress: p.pct, at: p.ts });
    });
  } catch (e) {}
  var markDone = function() {
    try { localStorage.setItem(READING_BACKFILL_KEY, new Date().toISOString()); } catch (e) {}
    return true;
  };
  if (!events.length) return Promise.resolve(markDone());
  return fetch('/api/reading', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: events })
  }).then(function(r) { return r.ok ? markDone() : false; }).catch(function() { return false; });
}

if (typeof window !== 'undefined' && window.addEventListener) {
  // Don't lose the last few events when the window closes.
  window.addEventListener('pagehide', function() {
    if (!_readingQueue.length || !navigator.sendBeacon) return;
    navigator.sendBeacon('/api/reading', JSON.stringify({ events: _readingQueue }));
    _readingQueue = [];
  });
  setTimeout(syncReadingBackfill, 5000);
}
