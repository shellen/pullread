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

function buildDailyRundown(maxTopics) {
  if (maxTopics === undefined) maxTopics = 5;

  var clusters = buildTopicClusters(2, 2);

  var rundown = [];
  for (var i = 0; i < clusters.length; i++) {
    var c = clusters[i];
    var unread = c.articles.filter(function(a) {
      return !readArticles.has(a.filename);
    });
    if (unread.length === 0) continue;

    var articles = unread.map(function(a) {
      var file = allFiles.find(function(f) { return f.filename === a.filename; });
      return { filename: a.filename, title: a.title, domain: file ? file.domain : '', image: file ? file.image : '' };
    });

    // Label: 2 shortest tags joined — short tags are the recognizable keywords
    var sorted = c.tags.slice().sort(function(a, b) { return a.length - b.length; });
    var label = sorted.slice(0, 2).join(' & ');

    rundown.push({ tags: c.tags, articles: articles, label: label });
  }

  rundown.sort(function(a, b) { return b.articles.length - a.articles.length; });
  return rundown.slice(0, maxTopics);
}

function initRundown() {
  var track = document.querySelector('.rundown-track');
  if (!track) return;

  var dots = document.querySelectorAll('.rundown-dot');
  if (dots.length === 0) return;

  track.addEventListener('scroll', function() {
    var cardWidth = track.firstElementChild ? track.firstElementChild.offsetWidth : 1;
    var idx = Math.round(track.scrollLeft / cardWidth);
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('active', i === idx);
    }
  });
}

function rundownGoTo(idx) {
  var track = document.querySelector('.rundown-track');
  if (!track || !track.firstElementChild) return;
  var cardWidth = track.firstElementChild.offsetWidth;
  track.scrollTo({ left: cardWidth * idx, behavior: 'smooth' });
}
