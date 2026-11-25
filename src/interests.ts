// ABOUTME: Builds an on-device interest profile from the reader's own signals (highlights, notes,
// ABOUTME: favorites, tags, Research watches, the Notebook) and picks Today's one read

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { storyTokens } from './stories';
import type { ArticleMeta } from './email';

/*
 * Everything here stays on the Mac: the profile is built from local files and
 * never sent anywhere. Scoring is deterministic word matching so the "why" is
 * explainable; a model can choose among the top candidates later.
 */

export type SignalKind = 'highlight' | 'note' | 'favorite' | 'tag' | 'watch' | 'notebook' | 'read';

export interface InterestSignal {
  text: string;
  kind: SignalKind;
  /** When the reader made this signal (ISO). Undated signals don't fade. */
  at?: string;
}

/** How much one signal of each kind counts. Explicit watches count most. */
export const KIND_WEIGHT: Record<SignalKind, number> = {
  watch: 4, highlight: 3, note: 3, notebook: 3, favorite: 2, tag: 1.5,
  // Finishing an article is a mild signal: you might finish things you disliked.
  read: 1,
};

/** Recent interest matters more: a signal's weight halves every 21 days. Watches don't fade. */
const HALF_LIFE_DAYS = 21;

/** Readable labels for the "why" line. */
const KIND_LABEL: Record<SignalKind, string> = {
  highlight: 'highlights', note: 'notes', favorite: 'favorites', tag: 'tags',
  watch: 'Research watches', notebook: 'Notebook', read: 'reading',
};

// Words that carry no interest on their own, on top of storyTokens' stopwords.
const PROFILE_STOPWORDS = new Set([
  'just', 'like', 'really', 'think', 'thing', 'things', 'something', 'also', 'still', 'much', 'many',
  'very', 'even', 'well', 'make', 'made', 'take', 'going', 'want', 'need', 'good', 'great', 'people',
  'time', 'year', 'years', 'today', 'week', 'way', 'one', 'two', 'first', 'last', 'other', 'every',
  'could', 'would', 'should', 'might', 'there', 'their', 'they', 'them', 'these', 'those', 'into',
  'only', 'some', 'most', 'more', 'than', 'then', 'when', 'where', 'which', 'while', 'your', 'you',
  'our', 'can', 'get', 'got', 'see', 'use', 'used', 'using', 'here', 'all', 'any', 'each', 'own',
  // From the first live profile (Nov 25), where they topped the "interests":
  'now', 'been', 'back', 'had', 'did', 'does', 'done', 'around', 'through', 'next', 'look', 'looks',
  'another', 'over', 'under', 'again', 'ever', 'never', 'always', 'already', 'yet', 'soon', 'since',
  'being', 'having', 'doing', 'went', 'come', 'came', 'goes', 'gets', 'put', 'set', 'say', 'told',
  'know', 'knew', 'new', 'old', 'big', 'small', 'high', 'low', 'long', 'day', 'days', 'month',
  'months', 'today', 'tonight', 'tomorrow', 'yesterday', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday', 'sunday', 'work', 'world', 'state', 'part', 'show', 'shows',
  // Common English (fourth live profile, Nov 25: "solved", "problem", "based" picked an
  // Illustrator template over a Riemann hypothesis explainer that matched the Notebook).
  'what', 'whats', 'that', 'thats', 'with', 'about', 'because', 'right', 'left', 'before', 'after',
  'talking', 'without', 'including', 'such', 'same', 'down', 'little', 'read', 'wrote', 'write',
  'against', 'fact', 'latest', 'asking', 'ask', 'asked', 'based', 'problem', 'problems', 'solved',
  'solve', 'question', 'questions', 'answer', 'reason', 'reasons', 'example', 'point', 'case', 'kind',
  'sort', 'lot', 'lots', 'bit', 'better', 'best', 'worse', 'worst', 'less', 'least', 'enough', 'quite',
  'probably', 'maybe', 'perhaps', 'actually', 'basically', 'certainly', 'clearly', 'simply', 'pretty',
  'sure', 'real', 'true', 'whole', 'different', 'important', 'possible', 'able', 'early', 'late',
  'recent', 'recently', 'current', 'currently', 'start', 'started', 'end', 'ended', 'keep', 'kept',
  'give', 'gave', 'given', 'find', 'found', 'feel', 'felt', 'seem', 'seems', 'seemed', 'try', 'tried',
  'call', 'called', 'mean', 'means', 'meant', 'help', 'helps', 'turn', 'turned', 'move', 'moved',
  'change', 'changed', 'open', 'close', 'thought', 'idea', 'ideas', 'note', 'notes', 'post', 'posts',
  'link', 'links', 'page', 'site', 'thing', 'stuff', 'okay', 'yes', 'no', 'not', 'also', 'via', 'per',
  'weve', 'youre', 'theyre', 'dont', 'didnt', 'doesnt', 'isnt', 'wasnt', 'cant', 'wont', 'ive', 'id',
  'ill', 'lets', 'heres', 'theres', 'whos', 'january', 'february', 'march', 'april', 'june', 'july',
  'august', 'september', 'october', 'november', 'december', 'headline', 'headlines', 'story', 'stories',
  'article', 'articles', 'news', 'update', 'updates', 'report', 'reports', 'video', 'watch',
  'listen', 'episode', 'review', 'today', 'whether', 'nothing', 'everything', 'anything',
]);

function interestTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of storyTokens(text)) {
    // Numbers, times ("11pm"), ordinals ("25th"), decades ("1990s") carry no interest.
    if (t.length < 3 || PROFILE_STOPWORDS.has(t) || /^\d+(am|pm|th|st|nd|rd|s)?$/.test(t)) continue;
    out.add(t);
  }
  return out;
}

/** "2026-11-20-why-local-news-matters.md" → "why local news matters" */
export function titleFromFilename(filename: string): string {
  return filename.replace(/^.*\//, '').replace(/\.(md|epub)$/i, '').replace(/^\d{4}-\d{2}-\d{2}-?/, '').replace(/[-_]+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Gathering signals
// ---------------------------------------------------------------------------

export interface GatherOptions {
  outputPath: string;
  configDir?: string;
  /** Watched entities/queries from the Research tab (already loaded by buildRoundup). */
  watches?: string[];
}

/**
 * Collect the reader's interest signals from local files. Each source is
 * optional and failures are ignored: a missing Notebook or vault just means
 * fewer signals.
 */
export async function gatherInterestSignals(opts: GatherOptions): Promise<{ signals: InterestSignal[]; engaged: Set<string>; read: Set<string> }> {
  const { outputPath, configDir = join(homedir(), '.config', 'pullread'), watches = [] } = opts;
  const signals: InterestSignal[] = [];
  /** Articles the reader already highlighted or noted: treated as already read. */
  const engaged = new Set<string>();

  // Highlights, inline notes, article notes, favorites, tags (.annot.json sidecars).
  try {
    const ann = await import('./annotations');
    if (outputPath ? !ann.annotationsInitialized(outputPath) : !ann.annotationsInitialized()) ann.initAnnotations(outputPath, configDir);
    for (const [filename, data] of Object.entries(ann.allNotes())) {
      const full = ann.loadAnnotation(filename);
      const title = titleFromFilename(filename);
      let mtime: string | undefined;
      try { mtime = statSync(ann.annotationPath(outputPath, filename)).mtime.toISOString(); } catch {}
      // articleNote is NOT used: in real libraries it mostly holds imported text
      // (feed descriptions copied by the viewer/13-init.js migration, whole
      // article bodies, old bookmark-service blurbs), indistinguishable from the
      // reader's own notes. Live sample, Nov 25: a 59,059-character article body.
      if (full.highlights.length || data.annotations.length) engaged.add(filename);
      for (const h of full.highlights as Array<{ text?: string; note?: string; createdAt?: string }>) {
        if (h.text) signals.push({ text: `${h.text} ${h.note || ''}`, kind: 'highlight', at: h.createdAt });
      }
      for (const a of data.annotations as Array<{ note?: string; anchorText?: string; createdAt?: string }>) {
        if (a.note || a.anchorText) signals.push({ text: `${a.note || ''} ${a.anchorText || ''}`, kind: 'note', at: a.createdAt });
      }
      if (data.isFavorite) signals.push({ text: title, kind: 'favorite', at: mtime });
      for (const t of data.tags || []) {
        if (t && !/^(classicbooks|gutenberg)$/i.test(t)) signals.push({ text: t.replace(/[-_]/g, ' '), kind: 'tag', at: mtime });
      }
    }
  } catch {
    // Annotations unavailable — carry on with the other sources.
  }

  // Reading history from the viewer (src/reading.ts): everything opened is
  // skipped; articles finished in the last 60 days are a mild interest signal.
  const read = new Set<string>();
  try {
    const { loadReading } = await import('./reading');
    const cutoff = new Date(Date.now() - 60 * 86_400_000).toISOString();
    for (const [filename, rec] of Object.entries(loadReading(configDir).articles)) {
      read.add(filename);
      if (rec.finished && rec.finished >= cutoff) signals.push({ text: titleFromFilename(filename), kind: 'read', at: rec.finished });
    }
  } catch {}

  // Research watches: explicit, so they don't fade.
  for (const w of watches) if (w?.trim()) signals.push({ text: w, kind: 'watch' });

  // The Notebook.
  try {
    const path = join(configDir, 'notebooks.json');
    if (existsSync(path)) {
      const books = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, { content?: string; updatedAt?: string; notes?: Array<{ content?: string; createdAt?: string; updatedAt?: string }> }>;
      for (const nb of Object.values(books)) {
        for (const n of nb.notes || []) if (n.content?.trim()) signals.push({ text: n.content, kind: 'notebook', at: n.updatedAt || n.createdAt });
        if (nb.content?.trim()) signals.push({ text: nb.content.slice(0, 4000), kind: 'notebook', at: nb.updatedAt });
      }
    }
  } catch {}

  return { signals, engaged, read };
}

const normalize = (t: string) => t.toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Is this "article note" really the feed's description, copied in by an old
 * migration? Compares it with the article's frontmatter `annotation:` field.
 * (First live profile: 19,794 "notes", nearly all feed blurbs.)
 */
export function isImportedDescription(note: string, annotPath: string): boolean {
  try {
    const md = annotPath.replace(/\.annot\.json$/, '.md');
    const head = readFileSync(md, 'utf-8').slice(0, 8000);
    const fm = head.match(/^---\n([\s\S]*?)\n---/)?.[1] || '';
    const raw = fm.match(/^annotation:\s*"?([\s\S]*?)"?\s*$/m)?.[1] || '';
    const a = normalize(raw.replace(/\\"/g, '"'));
    const n = normalize(note);
    if (!a || !n) return false;
    const k = Math.min(60, a.length, n.length);
    return a.slice(0, k) === n.slice(0, k);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Profile and pick
// ---------------------------------------------------------------------------

export interface InterestProfile {
  weights: Map<string, number>;
  /** Per word, how much each kind of signal contributed (for the "why"). */
  sources: Map<string, Map<SignalKind, number>>;
  /** How many signals of each kind went in. */
  counts: Partial<Record<SignalKind, number>>;
}

export function buildInterestProfile(signals: InterestSignal[], now = Date.now()): InterestProfile {
  const weights = new Map<string, number>();
  const sources = new Map<string, Map<SignalKind, number>>();
  const counts: Partial<Record<SignalKind, number>> = {};
  for (const sig of signals) counts[sig.kind] = (counts[sig.kind] || 0) + 1;

  const tokenSets = signals.map(sig => interestTokens(sig.text));
  // How many signals use each word. A word in most of them is a writing habit
  // ("because", "right", "before" topped the second live profile), not an interest.
  const df = new Map<string, number>();
  for (const t of tokenSets) for (const w of t) df.set(w, (df.get(w) || 0) + 1);
  const n = Math.max(1, signals.length);
  // ln((n+1)/df) / ln(n+1): 1 for a word in one signal, near 0 for a word in
  // nearly all of a large set, but still ~0.2 for a word shared by 3 of 3.
  const idf = (w: string) => Math.log((n + 1) / (df.get(w) || 1)) / Math.log(n + 1);

  signals.forEach((sig, i) => {
    // No kind can drown out the others by volume: a kind's signals share its
    // weight by the square root of how many there are (1,029 notes vs 3 highlights).
    let w = KIND_WEIGHT[sig.kind] / Math.sqrt(counts[sig.kind] || 1);
    if (sig.at && sig.kind !== 'watch') {
      const days = (now - Date.parse(sig.at)) / 86_400_000;
      if (Number.isFinite(days) && days > 0) w *= Math.pow(0.5, days / HALF_LIFE_DAYS);
    }
    const tokens = tokenSets[i];
    // A long note shouldn't outweigh a sharp highlight: spread its weight a little.
    const per = w / Math.max(1, Math.sqrt(tokens.size / 8));
    for (const t of tokens) {
      const add = per * idf(t);
      weights.set(t, (weights.get(t) || 0) + add);
      if (!sources.has(t)) sources.set(t, new Map());
      const m = sources.get(t)!;
      m.set(sig.kind, (m.get(sig.kind) || 0) + add);
    }
  });
  return { weights, sources, counts };
}

export interface OneReadCandidate {
  article: ArticleMeta;
  score: number;
  /** Matched words, strongest first. */
  terms: string[];
}

export interface OneRead extends OneReadCandidate {
  why: string;
}

/**
 * Score each candidate against the profile. Words common across the day's
 * articles count less (a day full of election stories shouldn't make every
 * one a match), and an article needs at least two different matching words.
 */
export function rankForInterests(candidates: ArticleMeta[], profile: InterestProfile): OneReadCandidate[] {
  if (!profile.weights.size || !candidates.length) return [];
  const docTokens = candidates.map(a => ({
    title: interestTokens(a.title),
    body: interestTokens(`${a.summary || ''} ${a.excerpt || ''}`),
  }));
  const df = new Map<string, number>();
  for (const d of docTokens) for (const t of new Set([...d.title, ...d.body])) df.set(t, (df.get(t) || 0) + 1);
  const n = candidates.length;
  const idf = (t: string) => Math.log(1 + n / (df.get(t) || 1));

  return candidates.map((article, i) => {
    const contrib = new Map<string, number>();
    for (const t of docTokens[i].title) { const w = profile.weights.get(t); if (w) contrib.set(t, 2 * w * idf(t)); }
    for (const t of docTokens[i].body) { const w = profile.weights.get(t); if (w && !contrib.has(t)) contrib.set(t, w * idf(t)); }
    const terms = [...contrib].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    const score = terms.length >= 2 ? [...contrib.values()].reduce((s, v) => s + v, 0) : 0;
    return { article, score, terms };
  }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);
}

/** "Because of your highlights and Research watches on nvidia and chip exports" */
export function explainPick(terms: string[], profile: InterestProfile): string {
  const top = terms.slice(0, 3);
  const kinds = new Map<SignalKind, number>();
  for (const t of top) for (const [k, v] of profile.sources.get(t) || []) kinds.set(k, (kinds.get(k) || 0) + v);
  const labels = [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => KIND_LABEL[k]);
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  return `Because of your ${list(labels)} on ${list(top)}`;
}

/**
 * Today's one read: the best match among the day's articles, skipping ones
 * the reader already highlighted or noted (read state isn't visible to the
 * sidecar yet, so engagement stands in for "already read").
 */
export function pickOneRead(candidates: ArticleMeta[], profile: InterestProfile, skip: Set<string> = new Set()): { pick: OneRead | null; ranked: OneReadCandidate[] } {
  const ranked = rankForInterests(candidates.filter(a => !skip.has(a.filename)), profile);
  const best = ranked[0];
  return { pick: best ? { ...best, why: explainPick(best.terms, profile) } : null, ranked };
}
