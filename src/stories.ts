// ABOUTME: Groups the day's articles into stories and weighs them for the Rundown
// ABOUTME: Adds a balanced "wider news" panel so major stories surface even outside the user's feeds

import type { ArticleMeta } from './email';


// ---------------------------------------------------------------------------
// Matching: when are two headlines the same story?
// ---------------------------------------------------------------------------

/** Lowercased host (no www) + path (no trailing slash); query and hash dropped. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '').toLowerCase() + u.pathname.replace(/\/+$/, '');
  } catch {
    return url.trim().toLowerCase();
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function normalizeTitle(s: string): string {
  return s.toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drop a trailing " - Outlet" / " | Outlet" suffix some feeds append to titles. */
function titleCore(title: string): string {
  return title.replace(/\s+[-|–—]\s+[^-|–—]{2,40}$/, '').trim() || title;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'and', 'or', 'for', 'with', 'by', 'is', 'are',
  'was', 'were', 'be', 'up', 'its', 'it', 'as', 'from', 'over', 'that', 'this', 'after', 'into',
  'new', 'says', 'say', 'said', 'will', 'has', 'have', 'how', 'why', 'what', 'who', 'not', 'but',
  'about', 'more', 'than', 'his', 'her', 'their', 'out', 'off', 'amid', 'hear', 'watch', 'live',
]);

/** Distinctive words of a title (the strict tokenizer used for exact-story dedupe). */
export function titleTokens(title: string): Set<string> {
  const words = normalizeTitle(titleCore(title))
    .replace(/['"]/g, '')
    .split(/[^a-z0-9$]+/)
    .filter(w => w && !STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Looser tokens for matching across outlets, which word the same news very
 * differently: short words dropped, plurals folded ("quakes" → "quake"), and a
 * few common synonyms collapsed. Step 2 (on-device embeddings on macOS) replaces
 * this with real semantic similarity; this is the portable fallback.
 */
const SYNONYMS: Record<string, string> = {
  earthquake: 'quake', killed: 'dead', deaths: 'dead', death: 'dead', dies: 'dead', died: 'dead',
  usa: 'us', america: 'us', american: 'us',
  announces: 'announce', announced: 'announce', unveils: 'announce', approves: 'approve',
  approved: 'approve', approval: 'approve', settlement: 'settle', settles: 'settle',
};

export function storyTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of normalizeTitle(titleCore(text)).replace(/['"]/g, '').split(/[^a-z0-9$.]+/)) {
    let w = raw.replace(/^\.+|\.+$/g, '');
    if (!w || STOPWORDS.has(w)) continue;
    if (!/\d/.test(w)) {
      if (w.length < 3) continue;
      if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    }
    out.add(SYNONYMS[w] || w);
  }
  return out;
}

function sharedCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

/**
 * Same story, strict: at least 4 shared distinctive words and Jaccard ≥ 0.5.
 * Catches the same news from two outlets without merging unrelated stories
 * that share a name. (This is the rule PR #121's dedupe introduced.)
 */
export function sameStory(a: Set<string>, b: Set<string>): boolean {
  const shared = sharedCount(a, b);
  if (shared < 4) return false;
  return shared / (a.size + b.size - shared) >= 0.5;
}

/**
 * Same story, loose — for matching outlet headlines against each other, where
 * wording differs more ("7.8 quake hits Chile" / "Chile earthquake: dozens
 * dead"). At least 3 shared words covering half of the shorter headline.
 */
export function relatedStory(a: Set<string>, b: Set<string>): boolean {
  const shared = sharedCount(a, b);
  if (shared < 3) return false;
  return shared / Math.min(a.size, b.size) >= 0.5;
}

// ---------------------------------------------------------------------------
// Step 1: group the user's articles into stories
// ---------------------------------------------------------------------------

export interface StoryGroup {
  /** The copy shown in the email: the first one, unless a later copy has an image or excerpt it lacks. */
  lead: ArticleMeta;
  /** Every copy, lead included, in arrival order. */
  members: ArticleMeta[];
  /** Distinct outlets (domains) that covered it. Two NYT links count once. */
  sources: string[];
}

function richness(a: ArticleMeta): number {
  return (a.image?.startsWith('http') ? 1 : 0) + (a.summary || a.excerpt ? 1 : 0);
}

/**
 * Group articles that are the same story: the same URL (ignoring query, hash,
 * www and trailing slash), the same title, or near-identical titles from
 * different outlets. Unlike a plain dedupe, the extra copies are kept — how
 * many of your sources ran a story is the best sign of how much it matters.
 */
export function groupStories(articles: ArticleMeta[]): StoryGroup[] {
  const groups: Array<StoryGroup & { urls: Set<string>; tokens: Set<string>; titles: Set<string> }> = [];
  for (const article of articles) {
    const url = canonicalUrl(article.url);
    const tokens = titleTokens(article.title);
    const title = normalizeTitle(article.title);
    const g = groups.find(k => k.urls.has(url) || k.titles.has(title) || sameStory(k.tokens, tokens));
    if (!g) {
      groups.push({ lead: article, members: [article], sources: [], urls: new Set([url]), tokens, titles: new Set([title]) });
      continue;
    }
    g.members.push(article);
    g.urls.add(url);
    g.titles.add(title);
    if (richness(article) > richness(g.lead)) g.lead = article;
  }
  return groups.map(({ lead, members }) => ({
    lead,
    members,
    sources: [...new Set(members.map(m => m.domain || domainOf(m.url)).filter(Boolean))],
  }));
}

// ---------------------------------------------------------------------------
// The wider-news panel: a balanced set of broad outlets read in the background
// ---------------------------------------------------------------------------

export type Lean = 'left' | 'center' | 'right';
export type Scope = 'global' | 'national' | 'regional';

export interface PanelSource {
  name: string;
  feedUrl: string;
  /**
   * Rough editorial lean, used only to require that a "major story" is covered
   * across the spectrum rather than by one side. Loosely based on public media
   * bias ratings (e.g. AllSides); users can edit the panel.
   */
  lean: Lean;
  scope: Scope;
}

/**
 * Default panel: three outlets per lean so no side dominates the vote. Headlines
 * only — nothing from the panel is saved to the library. Regional sources are
 * added from the user's region setting.
 */
export const DEFAULT_PANEL: PanelSource[] = [
  { name: 'NPR', feedUrl: 'https://feeds.npr.org/1001/rss.xml', lean: 'left', scope: 'national' },
  { name: 'The Guardian', feedUrl: 'https://www.theguardian.com/world/rss', lean: 'left', scope: 'global' },
  { name: 'The New York Times', feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', lean: 'left', scope: 'national' },
  { name: 'BBC News', feedUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml', lean: 'center', scope: 'global' },
  { name: 'The Wall Street Journal', feedUrl: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml', lean: 'center', scope: 'global' },
  { name: 'The Hill', feedUrl: 'https://thehill.com/feed/', lean: 'center', scope: 'national' },
  { name: 'Fox News', feedUrl: 'https://moxie.foxnews.com/google-publisher/latest.xml', lean: 'right', scope: 'national' },
  { name: 'Washington Examiner', feedUrl: 'https://www.washingtonexaminer.com/feed/', lean: 'right', scope: 'national' },
  { name: 'New York Post', feedUrl: 'https://nypost.com/feed/', lean: 'right', scope: 'national' },
];

export interface PanelHeadline {
  title: string;
  url: string;
  excerpt?: string;
  image?: string;
  publishedAt?: string;
  source: string;
  lean: Lean;
  scope: Scope;
}

export interface ConsensusStory {
  headlines: PanelHeadline[];
  /** Distinct panel outlets that ran it. */
  sources: string[];
  leans: Lean[];
  scope: Scope;
  /** Share of the relevant panel (national/global, or regional) that ran it, 0–1. */
  strength: number;
  tokens: Set<string>;
}

export interface ConsensusOptions {
  /** Minimum share of the national/global panel for a story to count as widely covered. Default 0.4. */
  minShare?: number;
  /** Minimum distinct leans that must cover it. Default 2. */
  minLeans?: number;
  /** Minimum regional outlets for a regional story. Default 2. */
  minRegional?: number;
}

/**
 * Find the stories the panel agrees on. Each panel outlet only gets one vote
 * per story, and a story must be run by a meaningful share of the panel across
 * at least two leans — so one outlet's obsession, or one side's, doesn't count.
 */
export function findConsensus(headlines: PanelHeadline[], panel: PanelSource[], opts: ConsensusOptions = {}): ConsensusStory[] {
  const { minShare = 0.4, minLeans = 2, minRegional = 2 } = opts;
  const wideSize = panel.filter(p => p.scope !== 'regional').length;
  const regionalSize = panel.filter(p => p.scope === 'regional').length;

  const clusters: Array<{ headlines: PanelHeadline[]; tokens: Set<string> }> = [];
  for (const h of headlines) {
    const tokens = storyTokens(`${h.title}`);
    // Compare against each cluster's first headline only, so clusters can't drift.
    const c = clusters.find(k => relatedStory(k.tokens, tokens));
    if (c) c.headlines.push(h);
    else clusters.push({ headlines: [h], tokens });
  }

  const out: ConsensusStory[] = [];
  for (const c of clusters) {
    const wide = c.headlines.filter(h => h.scope !== 'regional');
    const regional = c.headlines.filter(h => h.scope === 'regional');
    const wideSources = new Set(wide.map(h => h.source));
    const regionalSources = new Set(regional.map(h => h.source));
    const leans = [...new Set(wide.map(h => h.lean))];

    let scope: Scope | null = null;
    let strength = 0;
    if (wideSize > 0 && wideSources.size / wideSize >= minShare && leans.length >= minLeans) {
      scope = wide.every(h => h.scope === 'global') ? 'global' : 'national';
      strength = wideSources.size / wideSize;
    } else if (regionalSize > 0 && regionalSources.size >= Math.min(minRegional, regionalSize)) {
      scope = 'regional';
      strength = regionalSources.size / regionalSize;
    }
    if (!scope) continue;
    out.push({
      headlines: c.headlines,
      sources: [...new Set(c.headlines.map(h => h.source))],
      leans,
      scope,
      strength,
      tokens: c.tokens,
    });
  }
  return out.sort((a, b) => b.strength - a.strength);
}

// ---------------------------------------------------------------------------
// Weighing and picking the top stories
// ---------------------------------------------------------------------------

export interface WeighedStory {
  group: StoryGroup;
  /** Base relevance of the lead (freshness, richness, watched entities). */
  base: number;
  /** Boost for being run by several of your own sources. */
  coverage: number;
  /** Boost for being widely covered by the panel. */
  wider: number;
  weight: number;
  consensus?: ConsensusStory;
}

/** Points per extra outlet among your own feeds, capped so a pile-on can't run away. */
const COVERAGE_POINTS = 2.5;
const COVERAGE_CAP = 7.5;
/** Points for full panel agreement (scaled by strength). Big enough to beat a fresh, image-rich story. */
const WIDER_POINTS = 10;

export function weighStories(
  groups: StoryGroup[],
  consensus: ConsensusStory[],
  baseScore: (a: ArticleMeta) => number,
): WeighedStory[] {
  return groups.map(group => {
    const base = baseScore(group.lead);
    const coverage = Math.min(COVERAGE_CAP, COVERAGE_POINTS * (group.sources.length - 1));
    const tokens = new Set<string>();
    for (const m of group.members) for (const t of storyTokens(m.title)) tokens.add(t);
    const match = consensus.find(c => relatedStory(c.tokens, tokens)
      || c.headlines.some(h => canonicalUrl(h.url) === canonicalUrl(group.lead.url)));
    const wider = match ? WIDER_POINTS * match.strength : 0;
    return { group, base, coverage, wider, weight: base + coverage + wider, consensus: match };
  }).sort((a, b) => b.weight - a.weight);
}

export interface TopStory {
  article: ArticleMeta;
  weight: number;
  /** Other outlets among your feeds that ran it. */
  alsoIn: Array<{ source: string; url: string }>;
  /** Set when the panel widely covered it. */
  wider?: { sources: string[]; scope: Scope };
  /** True when none of your feeds had it — it came in from the panel alone. */
  beyondFeeds: boolean;
}

export interface PickOptions {
  /** Max stories in the Top stories block. Default 3. */
  maxTop?: number;
  /** Max stories from outside your feeds. Default 2. */
  maxBeyond?: number;
  /** Panel share a story needs to be added from outside your feeds. Default 0.6. */
  beyondShare?: number;
  /** Base score (freshness, image, excerpt) for stories pulled in from the panel, same as your own get. */
  baseScore?: (a: ArticleMeta) => number;
}

/** Other outlets among your feeds that ran a story (one link per outlet, lead's outlet excluded). */
export function alsoInFor(group: StoryGroup): Array<{ source: string; url: string }> {
  const leadSource = group.lead.domain || domainOf(group.lead.url);
  const seen = new Set([leadSource]);
  const out: Array<{ source: string; url: string }> = [];
  for (const m of group.members) {
    const src = m.domain || domainOf(m.url);
    if (seen.has(src)) continue;
    seen.add(src);
    out.push({ source: src, url: m.url });
  }
  return out;
}

/** Points for a regional story pulled in from local outlets: below a major national story. */
const REGIONAL_POINTS = 5;

/** Prefer a center outlet's copy for a story pulled in from the panel. */
function bestHeadline(c: ConsensusStory): PanelHeadline {
  const order: Lean[] = ['center', 'left', 'right'];
  return [...c.headlines].sort((a, b) =>
    (b.image ? 1 : 0) - (a.image ? 1 : 0) || order.indexOf(a.lean) - order.indexOf(b.lean)
    || (b.excerpt ? 1 : 0) - (a.excerpt ? 1 : 0))[0];
}

/**
 * Pick the Top stories block. A story from your feeds qualifies when more than
 * one of your sources ran it or the panel widely covered it. A story none of
 * your feeds had gets in only past a higher bar (most of the panel, across the
 * spectrum) — that's the "earth-shattering news punches through" path. Regional
 * stories qualify when the region's outlets agree.
 */
export function pickTopStories(
  weighed: WeighedStory[],
  consensus: ConsensusStory[],
  opts: PickOptions = {},
): { top: TopStory[]; rest: StoryGroup[] } {
  const { maxTop = 3, maxBeyond = 2, beyondShare = 0.6, baseScore = () => 0 } = opts;

  const fromFeeds: TopStory[] = weighed
    .filter(w => w.group.sources.length > 1 || w.consensus)
    .map(w => ({
      article: w.group.lead,
      weight: w.weight,
      alsoIn: alsoInFor(w.group),
      wider: w.consensus ? { sources: w.consensus.sources, scope: w.consensus.scope } : undefined,
      beyondFeeds: false,
    }));

  const matched = new Set(weighed.map(w => w.consensus).filter(Boolean));
  const beyond: TopStory[] = consensus
    .filter(c => !matched.has(c) && (c.scope === 'regional' || c.strength >= beyondShare))
    .slice(0, maxBeyond)
    .map(c => {
      const h = bestHeadline(c);
      const article: ArticleMeta = {
        filename: '',
        title: h.title,
        url: h.url,
        domain: domainOf(h.url),
        excerpt: h.excerpt,
        image: h.image,
        bookmarked: h.publishedAt,
        categories: [c.scope === 'regional' ? 'Near you' : 'World'],
      };
      return {
        article,
        weight: baseScore(article) + (c.scope === 'regional' ? REGIONAL_POINTS : WIDER_POINTS) * c.strength,
        alsoIn: [],
        wider: { sources: c.sources, scope: c.scope },
        beyondFeeds: true,
      };
    });

  const top = [...fromFeeds, ...beyond].sort((a, b) => b.weight - a.weight).slice(0, maxTop);
  const topLeads = new Set(top.map(t => t.article));
  const rest = weighed.map(w => w.group).filter(g => !topLeads.has(g.lead));
  return { top, rest };
}

// ---------------------------------------------------------------------------
// Fetching the panel (headlines only, cached)
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

/**
 * Read the panel's recent headlines. Each feed is fetched in parallel with a
 * short timeout; a feed that fails is skipped, not fatal. `hours` limits to
 * the last day by default.
 */
export async function fetchPanelHeadlines(
  panel: PanelSource[],
  fetchFeedFn: (url: string) => Promise<Array<{ title: string; url: string; updatedAt: string; contentHtml?: string; thumbnail?: string }>>,
  hours = 24,
  now = Date.now(),
): Promise<PanelHeadline[]> {
  const cutoff = now - hours * 3_600_000;
  const results = await Promise.allSettled(panel.map(async p => {
    const entries = await Promise.race([
      fetchFeedFn(p.feedUrl),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);
    return entries
      .filter(e => {
        const t = Date.parse(e.updatedAt);
        return Number.isNaN(t) || t >= cutoff;
      })
      .slice(0, 40)
      .map(e => ({
        title: e.title,
        url: e.url,
        excerpt: e.contentHtml ? stripHtml(e.contentHtml).slice(0, 240) : undefined,
        image: e.thumbnail,
        publishedAt: e.updatedAt,
        source: p.name,
        lean: p.lean,
        scope: p.scope,
      }));
  }));
  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
}
