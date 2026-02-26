// ABOUTME: Fetches suggested feed recommendations from pullread.com.
// ABOUTME: Falls back to a hardcoded list if the fetch fails.

var SUGGESTED_FEEDS_FALLBACK = [
  { name: 'Daring Fireball', url: 'https://daringfireball.net/feeds/main', category: 'Tech' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'Tech' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'Tech' },
  { name: 'Platformer', url: 'https://www.platformer.news/rss/', category: 'Tech' },
  { name: 'Stratechery', url: 'https://stratechery.com/feed/', category: 'Business' },
  { name: 'kottke.org', url: 'https://feeds.kottke.org/main', category: 'Culture' },
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'Tech' },
  { name: 'Seth Godin', url: 'https://feeds.feedblitz.com/sethsblog', category: 'Business' }
];

function fetchSuggestedFeeds(callback) {
  var cached = sessionStorage.getItem('pr-suggested-feeds');
  if (cached) {
    try { callback(JSON.parse(cached)); return; } catch (e) {}
  }

  fetch('https://pullread.com/api/suggested-feeds')
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(feeds) {
      if (Array.isArray(feeds) && feeds.length > 0) {
        sessionStorage.setItem('pr-suggested-feeds', JSON.stringify(feeds));
        callback(feeds);
      } else {
        callback(SUGGESTED_FEEDS_FALLBACK);
      }
    })
    .catch(function() {
      callback(SUGGESTED_FEEDS_FALLBACK);
    });
}

function getUserFeedUrls() {
  var urls = new Set();
  for (var i = 0; i < allFiles.length; i++) {
    if (allFiles[i].feedUrl) urls.add(allFiles[i].feedUrl);
  }
  return urls;
}

function filterSuggestedFeeds(feeds) {
  var userUrls = getUserFeedUrls();
  var userFeedNames = new Set();
  for (var i = 0; i < allFiles.length; i++) {
    if (allFiles[i].feed) userFeedNames.add(allFiles[i].feed.toLowerCase());
  }
  return feeds.filter(function(f) {
    if (userUrls.has(f.url)) return false;
    if (userFeedNames.has(f.name.toLowerCase())) return false;
    return true;
  });
}

function isFeedsDismissed() {
  var dismissed = localStorage.getItem('pr-feeds-dismissed');
  if (!dismissed) return false;
  var ts = parseInt(dismissed, 10);
  var thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return (Date.now() - ts) < thirtyDays;
}

function dismissSuggestedFeeds() {
  localStorage.setItem('pr-feeds-dismissed', String(Date.now()));
  var el = document.getElementById('hub-suggested-feeds');
  if (el) el.remove();
}
