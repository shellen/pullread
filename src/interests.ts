// ABOUTME: Builds an on-device interest profile from the reader's own signals (highlights, notes,
// ABOUTME: favorites, tags, Research watches, the Notebook, an optional Obsidian folder) and picks Today's one read

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { storyTokens } from './stories';
import type { ArticleMeta } from './email';

/*
 * Everything here stays on the Mac: the profile is built from local files and
 * never sent anywhere. Scoring is deterministic word matching so the "why" is
 * explainable; a model can choose among the top candidates later.
 */

export type SignalKind = 'highlight' | 'note' | 'favorite' | 'tag' | 'watch' | 'notebook' | 'obsidian';

export interface InterestSignal {
  text: string;
  kind: SignalKind;
  /** When the reader made this signal (ISO). Undated signals don't fade. */
  at?: string;
}

/** How much one signal of each kind counts. Explicit watches count most; Obsidian is broad, so least. */
export const KIND_WEIGHT: Record<SignalKind, number> = {
  watch: 4, highlight: 3, note: 3, notebook: 3, favorite: 2, tag: 1.5, obsidian: 1,
};

/** Recent interest matters more: a signal's weight halves every 21 days. Watches don't fade. */
const HALF_LIFE_DAYS = 21;

/** Readable labels for the "why" line. */
const KIND_LABEL: Record<SignalKind, string> = {
  highlight: 'highlights', note: 'notes', favorite: 'favorites', tag: 'tags',
  watch: 'Research watches', notebook: 'Notebook', obsidian: 'Obsidian notes',
};

// Words that carry no interest on their own, on top of storyTokens' stopwords.
const PROFILE_STOPWORDS = new Set([
  'just', 'like', 'really', 'think', 'thing', 'things', 'something', 'also', 'still', 'much', 'many',
  'very', 'even', 'well', 'make', 'made', 'take', 'going', 'want', 'need', 'good', 'great', 'people',
  'time', 'year', 'years', 'today', 'week', 'way', 'one', 'two', 'first', 'last', 'other', 'every',
  'could', 'would', 'should', 'might', 'there', 'their', 'they', 'them', 'these', 'those', 'into',
  'only', 'some', 'most', 'more', 'than', 'then', 'when', 'where', 'which', 'while', 'your', 'you',
  'our', 'can', 'get', 'got', 'see', 'use', 'used', 'using', 'here', 'all', 'any', 'each', 'own',
]);

function interestTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of storyTokens(text)) {
    if (t.length < 3 || PROFILE_STOPWORDS.has(t) || /^\d+$/.test(t)) continue;
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
  /** Optional Obsidian vault (or any folder of markdown notes). Notes edited in the last 30 days count. */
  obsidianPath?: string;
  now?: number;
}

/**
 * Collect the reader's interest signals from local files. Each source is
 * optional and failures are ignored: a missing Notebook or vault just means
 * fewer signals.
 */
export async function gatherInterestSignals(opts: GatherOptions): Promise<{ signals: InterestSignal[]; engaged: Set<string> }> {
  const { outputPath, configDir = join(homedir(), '.config', 'pullread'), watches = [], obsidianPath, now = Date.now() } = opts;
  const signals: InterestSignal[] = [];
  /** Articles the reader already highlighted or noted: treated as already read. */
  const engaged = new Set<string>();

  // Highlights, inline notes, article notes, favorites, tags (.annot.json sidecars).
  try {
    const ann = await import('./annotations');
    if (!ann.annotationsInitialized()) ann.initAnnotations(outputPath, configDir);
    for (const [filename, data] of Object.entries(ann.allNotes())) {
      const full = ann.loadAnnotation(filename);
      const title = titleFromFilename(filename);
      let mtime: string | undefined;
      try { mtime = statSync(ann.annotationPath(outputPath, filename)).mtime.toISOString(); } catch {}
      if (full.highlights.length || data.annotations.length || data.articleNote?.trim()) engaged.add(filename);
      for (const h of full.highlights as Array<{ text?: string; note?: string; createdAt?: string }>) {
        if (h.text) signals.push({ text: `${h.text} ${h.note || ''}`, kind: 'highlight', at: h.createdAt });
      }
      for (const a of data.annotations as Array<{ note?: string; anchorText?: string; createdAt?: string }>) {
        if (a.note || a.anchorText) signals.push({ text: `${a.note || ''} ${a.anchorText || ''}`, kind: 'note', at: a.createdAt });
      }
      if (data.articleNote?.trim()) signals.push({ text: `${data.articleNote} ${title}`, kind: 'note', at: mtime });
      if (data.isFavorite) signals.push({ text: title, kind: 'favorite', at: mtime });
      for (const t of data.tags || []) {
        if (t && !/^(classicbooks|gutenberg)$/i.test(t)) signals.push({ text: t.replace(/[-_]/g, ' '), kind: 'tag', at: mtime });
      }
    }
  } catch {
    // Annotations unavailable — carry on with the other sources.
  }

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

  // Optional Obsidian vault: notes edited in the last 30 days.
  if (obsidianPath) signals.push(...readRecentNotes(obsidianPath.replace(/^~/, homedir()), now));

  return { signals, engaged };
}

/** Markdown notes edited in the last `days`, newest first, capped so a big vault stays fast. */
function readRecentNotes(dir: string, now: number, days = 30, maxFiles = 200): InterestSignal[] {
  const cutoff = now - days * 86_400_000;
  const found: Array<{ path: string; mtime: number }> = [];
  const walk = (d: string, depth: number) => {
    if (depth > 6) return;
    let entries: string[];
    try { entries = readdirSync(d); } catch { return; }
    for (const name of entries) {
      if (name.startsWith('.')) continue; // .obsidian, .trash, .git
      const full = join(d, name);
      try {
        const st = statSync(full);
        if (st.isDirectory()) walk(full, depth + 1);
        else if (name.endsWith('.md') && st.mtimeMs >= cutoff) found.push({ path: full, mtime: st.mtimeMs });
      } catch {}
    }
  };
  walk(dir, 0);
  return found.sort((a, b) => b.mtime - a.mtime).slice(0, maxFiles).map(f => {
    let body = '';
    try { body = readFileSync(f.path, 'utf-8').slice(0, 20_000); } catch {}
    const name = f.path.replace(/^.*\//, '').replace(/\.md$/, '');
    // The note's title and headings say what it's about; weight them by repeating.
    const headings = (body.match(/^#{1,3}\s+.+$/gm) || []).join(' ');
    return { text: `${name} ${name} ${headings} ${headings} ${body.replace(/^---[\s\S]*?---/, '')}`, kind: 'obsidian' as const, at: new Date(f.mtime).toISOString() };
  });
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
  for (const sig of signals) {
    counts[sig.kind] = (counts[sig.kind] || 0) + 1;
    let w = KIND_WEIGHT[sig.kind];
    if (sig.at && sig.kind !== 'watch') {
      const days = (now - Date.parse(sig.at)) / 86_400_000;
      if (Number.isFinite(days) && days > 0) w *= Math.pow(0.5, days / HALF_LIFE_DAYS);
    }
    const tokens = interestTokens(sig.text);
    // A long note shouldn't outweigh a sharp highlight: spread its weight a little.
    const per = w / Math.max(1, Math.sqrt(tokens.size / 8));
    for (const t of tokens) {
      weights.set(t, (weights.get(t) || 0) + per);
      if (!sources.has(t)) sources.set(t, new Map());
      const m = sources.get(t)!;
      m.set(sig.kind, (m.get(sig.kind) || 0) + per);
    }
  }
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
