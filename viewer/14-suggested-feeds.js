// ABOUTME: Fetches the curated feed catalog organized by mood/intent collections.
// ABOUTME: Falls back to a hardcoded subset if the remote fetch fails.

var FEED_CATALOG_FALLBACK = {
  version: 1,
  collections: [
    {
      id: 'stay-informed',
      name: 'Stay Informed',
      description: 'Breaking news and daily briefings',
      icon: 'i-calendar',
      feeds: [
        { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', description: 'Technology, science, and culture reporting', platform: 'web', tags: ['tech', 'science'] },
        { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', description: 'Technology and culture news', platform: 'web', tags: ['tech', 'culture'] },
        { name: 'NPR Top Stories', url: 'https://feeds.npr.org/1001/rss.xml', description: 'Top stories from NPR', platform: 'web', tags: ['news', 'politics'] },
        { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', description: 'World news from the BBC', platform: 'web', tags: ['news', 'world'] },
        { name: 'Platformer', url: 'https://www.platformer.news/rss/', description: 'Big tech and democracy', platform: 'web', tags: ['tech', 'policy'] },
        { name: 'r/worldnews', url: 'https://www.reddit.com/r/worldnews/.rss', description: 'World news from Reddit', platform: 'reddit', tags: ['news', 'world'] }
      ]
    },
    {
      id: 'go-deep',
      name: 'Go Deep',
      description: 'Long reads, essays, and analysis',
      icon: 'i-book',
      feeds: [
        { name: 'kottke.org', url: 'https://feeds.kottke.org/main', description: 'Curiosity and culture since 1998', platform: 'web', tags: ['culture', 'curiosity'] },
        { name: 'Longreads', url: 'https://longreads.com/feed/', description: 'The best longform writing on the web', platform: 'web', tags: ['longform', 'culture'] },
        { name: 'Astral Codex Ten', url: 'https://www.astralcodexten.com/feed', description: 'Essays on science, philosophy, and rationality', platform: 'web', tags: ['essays', 'science'] },
        { name: 'The Atlantic Ideas', url: 'https://www.theatlantic.com/feed/channel/ideas/', description: 'Ideas and commentary from The Atlantic', platform: 'web', tags: ['essays', 'politics'] },
        { name: 'Wait But Why', url: 'https://waitbutwhy.com/feed', description: 'Deep dives into big topics', platform: 'web', tags: ['essays', 'science'] }
      ]
    },
    {
      id: 'be-entertained',
      name: 'Be Entertained',
      description: 'Music, comedy, film, and culture',
      icon: 'i-play',
      feeds: [
        { name: 'Pitchfork', url: 'https://pitchfork.com/feed/feed-news/rss', description: 'Music news and reviews', platform: 'web', tags: ['music', 'reviews'] },
        { name: 'Stereogum', url: 'https://www.stereogum.com/feed/', description: 'Indie music news and discovery', platform: 'web', tags: ['music', 'indie'] },
        { name: 'Conan O\'Brien Needs a Friend', url: 'https://feeds.simplecast.com/dHoohVNH', description: 'Comedy podcast with Conan O\'Brien', platform: 'podcast', tags: ['comedy', 'interviews'] },
        { name: 'Brooklyn Vegan', url: 'https://www.brooklynvegan.com/feed/', description: 'Music, concerts, and culture', platform: 'web', tags: ['music', 'concerts'] },
        { name: 'r/movies', url: 'https://www.reddit.com/r/movies/.rss', description: 'Movie news and discussion', platform: 'reddit', tags: ['film', 'entertainment'] },
        { name: 'Kurzgesagt', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsXVk37bltHxD1rDPwtNM8Q', description: 'Animated science and philosophy videos', platform: 'youtube', tags: ['science', 'animation'] }
      ]
    },
    {
      id: 'learn-something',
      name: 'Learn Something',
      description: 'Science, history, and how things work',
      icon: 'i-wand',
      feeds: [
        { name: 'Quanta Magazine', url: 'https://api.quantamagazine.org/feed/', description: 'Illuminating science and mathematics', platform: 'web', tags: ['science', 'math'] },
        { name: '99% Invisible', url: 'https://feeds.simplecast.com/BqbsxVfO', description: 'Stories about design and architecture', platform: 'podcast', tags: ['design', 'architecture'] },
        { name: 'Nautilus', url: 'https://nautil.us/feed/', description: 'Science connected to philosophy and culture', platform: 'web', tags: ['science', 'culture'] },
        { name: 'Radiolab', url: 'https://feeds.simplecast.com/EmVW7VGp', description: 'Curiosity-driven storytelling about science', platform: 'podcast', tags: ['science', 'storytelling'] },
        { name: '3Blue1Brown', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCYO_jab_esuFRV4b17AJtAw', description: 'Visual explanations of math concepts', platform: 'youtube', tags: ['math', 'education'] },
        { name: 'Hacker News Best', url: 'https://hnrss.org/best', description: 'Top stories from Hacker News', platform: 'web', tags: ['tech', 'startups'] }
      ]
    },
    {
      id: 'indie-voices',
      name: 'Indie Voices',
      description: 'Personal blogs and the open web',
      icon: 'i-globe',
      feeds: [
        { name: 'Daring Fireball', url: 'https://daringfireball.net/feeds/main', description: 'John Gruber on Apple and technology', platform: 'web', tags: ['tech', 'apple'] },
        { name: 'Waxy.org', url: 'https://waxy.org/feed/', description: 'Andy Baio on web culture and creativity', platform: 'web', tags: ['web', 'culture'] },
        { name: 'Anil Dash', url: 'https://anildash.com/feed.xml', description: 'Technology, culture, and the open web', platform: 'web', tags: ['tech', 'culture'] },
        { name: 'Pluralistic', url: 'https://pluralistic.net/feed/', description: 'Cory Doctorow on tech, policy, and justice', platform: 'web', tags: ['tech', 'politics'] },
        { name: 'Seth Godin', url: 'https://feeds.feedblitz.com/sethsblog', description: 'Daily insights on marketing and leadership', platform: 'web', tags: ['business', 'marketing'] },
        { name: 'On my Om', url: 'https://om.co/feed/', description: 'Om Malik on technology and venture', platform: 'web', tags: ['tech', 'venture'] }
      ]
    }
  ]
};

function fetchFeedCatalog(callback) {
  var cached = sessionStorage.getItem('pr-feed-catalog');
  if (cached) {
    try { callback(JSON.parse(cached)); return; } catch (e) {}
  }

  fetch('https://pullread.com/api/feed-catalog.json')
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(catalog) {
      if (catalog && Array.isArray(catalog.collections)) {
        sessionStorage.setItem('pr-feed-catalog', JSON.stringify(catalog));
        callback(catalog);
      } else {
        callback(FEED_CATALOG_FALLBACK);
      }
    })
    .catch(function() {
      callback(FEED_CATALOG_FALLBACK);
    });
}

function getUserFeedUrls() {
  var urls = new Set();
  for (var i = 0; i < allFiles.length; i++) {
    if (allFiles[i].feedUrl) urls.add(allFiles[i].feedUrl);
  }
  return urls;
}

function filterCatalogFeeds(catalog) {
  var userUrls = getUserFeedUrls();
  var userFeedNames = new Set();
  for (var i = 0; i < allFiles.length; i++) {
    if (allFiles[i].feed) userFeedNames.add(allFiles[i].feed.toLowerCase());
  }
  return {
    version: catalog.version,
    collections: catalog.collections.map(function(collection) {
      return {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        icon: collection.icon,
        feeds: collection.feeds.filter(function(f) {
          if (userUrls.has(f.url)) return false;
          if (userFeedNames.has(f.name.toLowerCase())) return false;
          return true;
        })
      };
    })
  };
}
