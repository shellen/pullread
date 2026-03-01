// ABOUTME: Knowledge graph computation — article similarity, tag frequency, co-occurrence.
// ABOUTME: Powers related reading, topic clusters, and graph visualization.

function buildTagIndex() {
  var tagFreq = new Map();
  var tagArticles = new Map();
  var cooccurrence = new Map();

  for (var i = 0; i < allFiles.length; i++) {
    var f = allFiles[i];
    var notes = allNotesIndex[f.filename];
    if (!notes || !notes.machineTags || notes.machineTags.length === 0) continue;

    var tags = notes.machineTags;
    for (var j = 0; j < tags.length; j++) {
      var tag = tags[j];
      tagFreq.set(tag, (tagFreq.get(tag) || 0) + 1);
      if (!tagArticles.has(tag)) tagArticles.set(tag, []);
      tagArticles.get(tag).push(f.filename);

      // Co-occurrence: pair this tag with every other tag in the same article
      for (var k = j + 1; k < tags.length; k++) {
        var other = tags[k];
        if (!cooccurrence.has(tag)) cooccurrence.set(tag, new Map());
        if (!cooccurrence.has(other)) cooccurrence.set(other, new Map());
        var tagMap = cooccurrence.get(tag);
        var otherMap = cooccurrence.get(other);
        tagMap.set(other, (tagMap.get(other) || 0) + 1);
        otherMap.set(tag, (otherMap.get(tag) || 0) + 1);
      }
    }
  }

  return { tagFreq: tagFreq, tagArticles: tagArticles, cooccurrence: cooccurrence };
}

function findRelatedArticles(filename, topN) {
  var notes = allNotesIndex[filename];
  if (!notes || !notes.machineTags || notes.machineTags.length === 0) return [];

  var myTags = new Set(notes.machineTags);
  var idx = buildTagIndex();
  var candidates = new Map(); // filename → { shared tags set }

  // Use inverted index to find all articles sharing at least one tag
  myTags.forEach(function(tag) {
    var articles = idx.tagArticles.get(tag);
    if (!articles) return;
    for (var i = 0; i < articles.length; i++) {
      var other = articles[i];
      if (other === filename) continue;
      if (!candidates.has(other)) candidates.set(other, new Set());
      candidates.get(other).add(tag);
    }
  });

  // Compute Jaccard similarity for each candidate
  var results = [];
  candidates.forEach(function(sharedSet, otherFilename) {
    var otherNotes = allNotesIndex[otherFilename];
    if (!otherNotes || !otherNotes.machineTags) return;
    var otherTags = new Set(otherNotes.machineTags);
    var unionSize = new Set([...myTags, ...otherTags]).size;
    var similarity = sharedSet.size / unionSize;
    if (similarity >= 0.15) {
      results.push({
        filename: otherFilename,
        similarity: similarity,
        sharedTags: Array.from(sharedSet),
      });
    }
  });

  results.sort(function(a, b) { return b.similarity - a.similarity; });
  return results.slice(0, topN);
}

function buildTopicClusters(minShared, minArticles) {
  if (minShared === undefined) minShared = 2;
  if (minArticles === undefined) minArticles = 3;

  var idx = buildTagIndex();

  // Find tag pairs that co-occur in enough articles
  // For each pair of tags that co-occur, collect the articles containing both
  var pairArticles = new Map(); // "tag1\0tag2" → Set of filenames

  idx.cooccurrence.forEach(function(partners, tag) {
    if (blockedTags.has(tag)) return;
    partners.forEach(function(count, otherTag) {
      if (blockedTags.has(otherTag)) return;
      if (tag >= otherTag) return; // avoid duplicates
      var key = tag + '\0' + otherTag;
      // Find articles that have both tags
      var articlesA = idx.tagArticles.get(tag) || [];
      var articlesB = new Set(idx.tagArticles.get(otherTag) || []);
      var both = articlesA.filter(function(f) { return articlesB.has(f); });
      if (both.length >= minArticles) {
        pairArticles.set(key, new Set(both));
      }
    });
  });

  // Merge overlapping pairs into clusters using union-find on articles
  // Each cluster has a set of tags and a set of articles
  var clusters = [];
  pairArticles.forEach(function(articleSet, key) {
    var tags = key.split('\0');
    // Try to merge into an existing cluster that shares articles
    var merged = false;
    for (var i = 0; i < clusters.length; i++) {
      var c = clusters[i];
      var overlap = 0;
      articleSet.forEach(function(f) { if (c.articleSet.has(f)) overlap++; });
      if (overlap >= minArticles) {
        // Merge
        for (var t = 0; t < tags.length; t++) c.tagSet.add(tags[t]);
        articleSet.forEach(function(f) { c.articleSet.add(f); });
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({
        tagSet: new Set(tags),
        articleSet: new Set(articleSet),
      });
    }
  });

  // Filter by minArticles and format output
  return clusters
    .filter(function(c) { return c.articleSet.size >= minArticles && c.tagSet.size >= minShared; })
    .map(function(c) {
      var articles = Array.from(c.articleSet).map(function(filename) {
        var file = allFiles.find(function(f) { return f.filename === filename; });
        return { filename: filename, title: file ? file.title : filename };
      });
      return { tags: Array.from(c.tagSet).sort(), articles: articles };
    })
    .sort(function(a, b) { return b.articles.length - a.articles.length; });
}

function _dailySeed() {
  var d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function _seededShuffle(arr, seed) {
  var a = arr.slice();
  var s = seed;
  for (var i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    var j = s % (i + 1);
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

function buildDailyRundown(maxTopics) {
  if (maxTopics === undefined) maxTopics = 5;

  var clusters = buildTopicClusters(2, 2);
  var seed = _dailySeed();
  var now = new Date();
  var thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
  var recentCutoff = thirtyDaysAgo.toISOString();
  var threeDaysAgo = new Date(now); threeDaysAgo.setDate(now.getDate() - 3);
  var trendingCutoff = threeDaysAgo.toISOString();

  var rundown = [];
  for (var i = 0; i < clusters.length; i++) {
    var c = clusters[i];
    var unread = c.articles.filter(function(a) {
      return !readArticles.has(a.filename);
    });
    if (unread.length === 0) continue;

    var articles = unread.map(function(a) {
      var file = allFiles.find(function(f) { return f.filename === a.filename; });
      return { filename: a.filename, title: a.title, domain: file ? file.domain : '', image: file ? file.image : '', bookmarked: file ? file.bookmarked : '' };
    });

    // Sort articles: newest first so hero image and headlines come from fresh content
    articles.sort(function(a, b) { return (b.bookmarked || '') > (a.bookmarked || '') ? 1 : -1; });

    var newestDate = articles.length > 0 ? (articles[0].bookmarked || '') : '';
    // Count recent (last 30 days) and trending (last 3 days) articles
    var recentCount = 0;
    var trendingCount = 0;
    for (var ai = 0; ai < articles.length; ai++) {
      var bk = articles[ai].bookmarked || '';
      if (bk >= recentCutoff) recentCount++;
      if (bk >= trendingCutoff) trendingCount++;
    }

    // Label: 2 shortest tags joined
    var sorted = c.tags.slice().sort(function(a, b) { return a.length - b.length; });
    var label = sorted.slice(0, 2).join(' & ');

    rundown.push({ tags: c.tags, articles: articles, label: label, _recentCount: recentCount, _trendingCount: trendingCount, _newestDate: newestDate });
  }

  // Split into tiers
  var trending = rundown.filter(function(r) { return r._trendingCount > 0; });
  var recent = rundown.filter(function(r) { return r._trendingCount === 0 && r._recentCount > 0; });
  var deepCuts = rundown.filter(function(r) { return r._recentCount === 0; });

  // Trending: most trending activity first
  trending.sort(function(a, b) {
    if (b._trendingCount !== a._trendingCount) return b._trendingCount - a._trendingCount;
    return (b._newestDate || '') > (a._newestDate || '') ? 1 : -1;
  });

  // Recent: newest first
  recent.sort(function(a, b) { return (b._newestDate || '') > (a._newestDate || '') ? 1 : -1; });

  // Deep cuts: shuffle daily for discovery
  deepCuts = _seededShuffle(deepCuts, seed);

  // Build result: trending first, then recent, then deep cuts (cap at 1)
  var result = [];
  for (var ti = 0; ti < trending.length && result.length < maxTopics; ti++) result.push(trending[ti]);
  for (var ri = 0; ri < recent.length && result.length < maxTopics; ri++) result.push(recent[ri]);
  if (deepCuts.length > 0 && result.length < maxTopics) result.push(deepCuts[0]);

  return result.slice(0, maxTopics);
}

function initRundown() {
  var track = document.querySelector('.rundown-track');
  if (!track) return;

  var dots = document.querySelectorAll('.rundown-dot');
  var cardCount = track.children.length;
  if (cardCount === 0) return;

  var currentIdx = 0;

  function goTo(idx) {
    if (idx < 0) idx = 0;
    if (idx >= cardCount) idx = cardCount - 1;
    currentIdx = idx;
    var cardWidth = track.firstElementChild.offsetWidth;
    track.scrollTo({ left: cardWidth * idx, behavior: 'smooth' });
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('active', i === idx);
    }
  }

  // Sync dots on manual scroll (desktop wheel, accessibility)
  track.addEventListener('scroll', function() {
    var cardWidth = track.firstElementChild ? track.firstElementChild.offsetWidth : 1;
    var idx = Math.round(track.scrollLeft / cardWidth);
    if (idx !== currentIdx) {
      currentIdx = idx;
      for (var i = 0; i < dots.length; i++) {
        dots[i].classList.toggle('active', i === idx);
      }
    }
  });

  // Touch swipe handling
  var startX = 0;
  var startY = 0;
  var startTime = 0;
  var swiping = false;

  track.addEventListener('touchstart', function(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    swiping = false;
  }, { passive: true });

  track.addEventListener('touchmove', function(e) {
    var dx = e.touches[0].clientX - startX;
    var dy = e.touches[0].clientY - startY;
    // If horizontal movement dominates, this is a swipe
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      swiping = true;
    }
  }, { passive: true });

  track.addEventListener('touchend', function(e) {
    var endX = e.changedTouches[0].clientX;
    var dx = endX - startX;
    var elapsed = Date.now() - startTime;

    if (swiping) {
      // Velocity-based: fast flick or long drag both work
      var velocity = Math.abs(dx) / elapsed;
      if (Math.abs(dx) > 50 || velocity > 0.3) {
        if (dx < 0) goTo(currentIdx + 1);
        else goTo(currentIdx - 1);
      } else {
        goTo(currentIdx); // snap back
      }
      return;
    }

    // Tap (not a swipe): right half = next, left half = prev
    // But only if the tap wasn't on an interactive element
    var target = e.target;
    if (target.closest('a, button, .tag-pill')) return;

    var rect = track.getBoundingClientRect();
    var tapX = endX - rect.left;
    if (tapX > rect.width * 0.5) {
      goTo(currentIdx + 1);
    } else {
      goTo(currentIdx - 1);
    }
  });

  // Expose for dot clicks
  window._rundownGoTo = goTo;
}

function rundownGoTo(idx) {
  if (window._rundownGoTo) {
    window._rundownGoTo(idx);
    return;
  }
  var track = document.querySelector('.rundown-track');
  if (!track || !track.firstElementChild) return;
  var cardWidth = track.firstElementChild.offsetWidth;
  track.scrollTo({ left: cardWidth * idx, behavior: 'smooth' });
}
