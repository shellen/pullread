// ABOUTME: Structured-output helpers for the Rundown: intro with exact citations, model-assisted
// ABOUTME: story grouping, and rule checks on generated intros (plan: docs/plans/2026-11-25-…)

import { domainOf, storyTokens } from './stories';
import type { StoryGroup } from './stories';

// ---------------------------------------------------------------------------
// Demo 1 — structured intro (guided generation)
// ---------------------------------------------------------------------------

export interface IntroLink {
  /** Words in the paragraph to turn into a link. Must appear verbatim. */
  phrase: string;
  /** 1-based story number from the list the model was given. */
  story: number;
}

export interface StructuredIntro {
  paragraphs: Array<{ text: string; links: IntroLink[] }>;
}

/**
 * Parse the flat shape the `fm` CLI returns for the intro schema: one array of
 * paragraph strings and one array of "paragraph|story|phrase" link strings.
 * (Apple's `fm schema` examples are flat; nested objects may make this moot.)
 */
export function parseFlatIntro(raw: { paragraphs?: string[]; links?: string[] }): StructuredIntro {
  const paragraphs = (raw.paragraphs || []).map(text => ({ text: text.trim(), links: [] as IntroLink[] }));
  for (const line of raw.links || []) {
    const m = line.match(/^\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(.+?)\s*$/);
    if (!m) continue;
    const p = paragraphs[parseInt(m[1], 10) - 1];
    if (p) p.links.push({ story: parseInt(m[2], 10), phrase: m[3] });
  }
  return { paragraphs };
}

export interface Mention {
  story: number;
  sentence: string;
  phrase?: string;
}

/**
 * Words in `sentence` to link for a story when the model's phrase isn't there:
 * the longest run of consecutive words that appear in the story's title, else
 * the first few words. Small on-device models often paraphrase the phrase.
 */
export function fallbackPhrase(sentence: string, title: string): string {
  const titleWords = storyTokens(title);
  const words = sentence.split(/\s+/);
  let best: [number, number] = [0, 0];
  let start = -1;
  for (let i = 0; i <= words.length; i++) {
    const w = i < words.length ? [...storyTokens(words[i])][0] : undefined;
    const hit = w !== undefined && titleWords.has(w);
    if (hit && start === -1) start = i;
    if (!hit && start !== -1) {
      if (i - start > best[1] - best[0]) best = [start, i];
      start = -1;
    }
  }
  const run = best[1] > best[0] ? words.slice(best[0], best[1]) : words.slice(0, Math.min(4, words.length));
  return run.join(' ').replace(/^[^\w$]+|[^\w$]+$/g, '');
}

/**
 * Parse the per-story shape the macOS 26 helper returns — paragraphs of
 * { story, sentence, phrase } — into a StructuredIntro. Each sentence carries
 * its own story number, so every mentioned story gets a link.
 */
export function mentionsToIntro(paragraphs: Mention[][], titles: string[]): StructuredIntro {
  return {
    paragraphs: paragraphs.filter(p => p.length).map(mentions => ({
      text: mentions.map(m => m.sentence.trim()).join(' '),
      links: mentions.map(m => {
        const title = titles[m.story - 1] || '';
        const has = m.phrase && m.sentence.toLowerCase().includes(m.phrase.toLowerCase());
        return { story: m.story, phrase: has ? m.phrase! : fallbackPhrase(m.sentence, title) };
      }),
    })),
  };
}

/** Accept either response shape: macOS 26 mentions, or the flat fm (macOS 27) arrays. */
export function parseIntroResponse(raw: any, titles: string[]): StructuredIntro {
  return Array.isArray(raw?.mentions) ? mentionsToIntro(raw.mentions, titles) : parseFlatIntro(raw);
}

/**
 * Turn a structured intro into the `{{phrase|N}}` marker text the existing
 * renderer already links, so links come from the model's citations instead of
 * title matching. A link whose phrase isn't in its paragraph, or whose story
 * number is out of range, is dropped (the words stay) and reported.
 */
export function structuredIntroToMarkers(intro: StructuredIntro, storyCount: number): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const paras = intro.paragraphs.map((p, pi) => {
    let text = p.text.replace(/\{\{|\}\}/g, '');
    for (const link of p.links) {
      if (link.story < 1 || link.story > storyCount) {
        dropped.push(`paragraph ${pi + 1}: story ${link.story} doesn't exist`);
        continue;
      }
      const idx = text.toLowerCase().indexOf(link.phrase.toLowerCase());
      // Skip phrases already inside a marker from an earlier link.
      if (idx === -1 || /\{\{[^}]*$/.test(text.slice(0, idx))) {
        dropped.push(`paragraph ${pi + 1}: "${link.phrase}" isn't in the text`);
        continue;
      }
      const words = text.slice(idx, idx + link.phrase.length);
      text = `${text.slice(0, idx)}{{${words}|${link.story}}}${text.slice(idx + link.phrase.length)}`;
    }
    return text;
  });
  return { text: paras.join('\n\n'), dropped };
}

// ---------------------------------------------------------------------------
// Demo 2 — model-assisted story grouping (PCC)
// ---------------------------------------------------------------------------

export interface ModelGrouping {
  groups: StoryGroup[];
  /** Section label the model gave each resulting group's lead. */
  labels: Map<StoryGroup, string>;
  /** Model's 1–5 importance rating per resulting group. */
  importance: Map<StoryGroup, number>;
  merges: string[];
  /** Merges refused because the headlines share no distinctive word (model over-merging by topic). */
  rejected: string[];
}

/** Do the parts share at least one distinctive word across their headlines? */
function shareAWord(parts: StoryGroup[]): boolean {
  const sets = parts.map(p => {
    const t = new Set<string>();
    for (const m of p.members) for (const w of storyTokens(m.title)) t.add(w);
    return t;
  });
  return sets.slice(1).every(set => [...set].some(w => sets[0].has(w)));
}

/** The numbered list sent to the model: one line per story group. */
export function groupingPrompt(groups: StoryGroup[]): string {
  return groups.map((g, i) => {
    const others = g.members.filter(m => m !== g.lead).map(m => m.title).slice(0, 2);
    return `[${i + 1}] ${g.lead.title} (${g.sources.join(', ')})${others.length ? ` — also: ${others.join(' / ')}` : ''}`;
  }).join('\n');
}

export const GROUPING_INSTRUCTIONS = `You group a day's news headlines into stories and label them.
Each line is "[id] headline (outlets)". Return one entry per story as "ids|label|importance":
- ids: comma-separated ids of headlines that report the SAME news event (most entries have one id). Only merge when they are clearly the same event, not just the same topic.
- label: a 1-3 word section name a newspaper would use (e.g. "Courts", "Music", "Climate", "Bay Area").
- importance: 1-5, how much this matters to a general reader today (5 = major news anywhere, 1 = niche).
Every id must appear exactly once.`;

/**
 * Apply the model's "ids|label|importance" lines to the deterministic groups.
 * The model can merge groups the word-overlap pass missed ("Bayer wins…" /
 * "Weedkiller maker cleared…") but can never split one — the deterministic
 * matches stand. A merge whose headlines share no distinctive word at all is
 * refused (the model grouping by topic, not event) and the parts are kept
 * separate with the model's label. Unknown ids and repeats are ignored; groups
 * the model skipped are kept as they were.
 */
export function applyModelGroups(groups: StoryGroup[], lines: string[]): ModelGrouping {
  const used = new Set<number>();
  const out: StoryGroup[] = [];
  const labels = new Map<StoryGroup, string>();
  const importance = new Map<StoryGroup, number>();
  const merges: string[] = [];
  const rejected: string[] = [];

  const keep = (g: StoryGroup, label: string, imp: string) => {
    out.push(g);
    if (label) labels.set(g, label.slice(0, 30));
    const n = parseInt(imp, 10);
    if (n >= 1 && n <= 5) importance.set(g, n);
  };

  for (const line of lines) {
    const [idsPart, label = '', imp = ''] = line.split('|').map(s => s.trim());
    const ids = (idsPart || '').split(/[,\s]+/).map(n => parseInt(n, 10) - 1)
      .filter(i => i >= 0 && i < groups.length && !used.has(i));
    if (!ids.length) continue;
    ids.forEach(i => used.add(i));
    const parts = ids.map(i => groups[i]);
    if (parts.length > 1 && !shareAWord(parts)) {
      rejected.push(parts.map(p => `"${p.lead.title}"`).join(' + '));
      parts.forEach(p => keep(p, label, imp));
      continue;
    }
    const members = parts.flatMap(p => p.members);
    // Lead: the richest of the parts' leads (image, then excerpt), first on ties.
    const lead = parts.map(p => p.lead).reduce((best, a) =>
      ((a.image?.startsWith('http') ? 2 : 0) + (a.excerpt ? 1 : 0)) > ((best.image?.startsWith('http') ? 2 : 0) + (best.excerpt ? 1 : 0)) ? a : best);
    const merged: StoryGroup = {
      lead,
      members,
      sources: [...new Set(members.map(m => m.domain || domainOf(m.url)).filter(Boolean))],
    };
    if (parts.length > 1) merges.push(parts.map(p => `"${p.lead.title}"`).join(' + '));
    keep(merged, label, imp);
  }
  groups.forEach((g, i) => { if (!used.has(i)) out.push(g); });
  return { groups: out, labels, importance, merges, rejected };
}

// ---------------------------------------------------------------------------
// Demo 2, macOS 26 path — the on-device model as a tie-breaker
// ---------------------------------------------------------------------------
//
// The on-device model's context is too small for a whole day of headlines, so
// on macOS 26 it only answers narrow questions in small batches:
//   1. "Same event?" for candidate pairs — groups that share at least one
//      distinctive word but that word matching didn't merge. Groups sharing no
//      word are never asked about (this is also the merge guard).
//   2. A section label and 1–5 importance for ~20 groups at a time.
// groupingLinesFromPairs() turns the answers into "ids|label|importance" lines
// for applyModelGroups(), the same input the macOS 27 (PCC) full-list path makes.

function groupTokens(g: StoryGroup): Set<string> {
  const t = new Set<string>();
  for (const m of g.members) for (const w of storyTokens(m.title)) t.add(w);
  return t;
}

/** Pairs of group indexes (0-based) worth asking about, most shared words first. */
export function candidatePairs(groups: StoryGroup[], max = 40): Array<[number, number]> {
  const tokens = groups.map(groupTokens);
  const pairs: Array<{ pair: [number, number]; shared: number }> = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      let shared = 0;
      for (const w of tokens[i]) if (tokens[j].has(w)) shared++;
      if (shared > 0) pairs.push({ pair: [i, j], shared });
    }
  }
  return pairs.sort((a, b) => b.shared - a.shared).slice(0, max).map(p => p.pair);
}

export const PAIR_INSTRUCTIONS = `You compare pairs of news headlines.
For each pair, decide whether both headlines report the SAME news event. Sharing a topic, company, person or place is not enough; it must be the same event.
Return "same": the ids (like P3) of the pairs that are the same event. Return an empty list if none are.`;

/** One line per pair, numbered from P{offset+1} so ids stay unique across batches. */
export function pairsPrompt(groups: StoryGroup[], pairs: Array<[number, number]>, offset = 0): string {
  return pairs.map(([a, b], i) =>
    `P${offset + i + 1}: "${groups[a].lead.title}" (${groups[a].sources.join(', ')}) || "${groups[b].lead.title}" (${groups[b].sources.join(', ')})`).join('\n');
}

export const LABEL_INSTRUCTIONS = `You label a day's news headlines for a newsletter.
Each line is "[id] headline (outlets)". Return one entry per headline as "id|label|importance":
- label: a 1-3 word section name a newspaper would use (e.g. "Courts", "Music", "Climate", "Bay Area").
- importance: 1-5, how much this matters to a general reader today (5 = major news anywhere, 1 = niche).`;

/** "[id] headline (outlets)" lines for the given 0-based group indexes, ids 1-based. */
export function labelPrompt(groups: StoryGroup[], indexes: number[]): string {
  return indexes.map(i => `[${i + 1}] ${groups[i].lead.title} (${groups[i].sources.join(', ')})`).join('\n');
}

export function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Combine the tie-breaker answers into "ids|label|importance" lines. Confirmed
 * pairs are joined transitively; a merged story takes the first label among
 * its parts and the highest importance.
 */
export function groupingLinesFromPairs(
  groupCount: number,
  pairs: Array<[number, number]>,
  sameIds: string[],
  labelLines: string[],
): string[] {
  const parent = Array.from({ length: groupCount }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const id of sameIds) {
    const n = parseInt(String(id).replace(/^\s*P/i, ''), 10) - 1;
    const pair = pairs[n];
    if (pair) parent[find(pair[1])] = find(pair[0]);
  }

  const info = new Map<number, { label: string; imp: number }>();
  for (const line of labelLines) {
    const [idPart, label = '', imp = ''] = line.split('|').map(x => x.trim());
    const i = parseInt((idPart || '').replace(/[^\d]/g, ''), 10) - 1;
    if (i >= 0 && i < groupCount && !info.has(i)) info.set(i, { label, imp: parseInt(imp, 10) || 0 });
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < groupCount; i++) {
    const r = find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r)!.push(i);
  }
  return [...clusters.values()].map(ids => {
    const label = ids.map(i => info.get(i)?.label).find(Boolean) || '';
    const imp = Math.max(0, ...ids.map(i => info.get(i)?.imp || 0));
    return `${ids.map(i => i + 1).join(',')}|${label}|${imp || ''}`;
  });
}

// ---------------------------------------------------------------------------
// Demo 3 — intro rule checks (Evaluations-style)
// ---------------------------------------------------------------------------

/** Phrases the intro prompt forbids (kept in sync with roundupSummaryPrompt in email.ts). */
export const BANNED_PHRASES = [
  'dive in', 'buckle up', 'without further ado', "let's get started", "here's what caught my eye",
  "in today's rundown", 'welcome to', "that's the rundown",
];

export interface IntroCheck {
  rule: string;
  passed: boolean;
  detail?: string;
}

/**
 * Check a generated intro against the rules its prompt states. Runs on the raw
 * model text (before rendering), so marker problems are visible.
 */
export function checkIntro(text: string, opts: { now: Date; storyCount: number }): IntroCheck[] {
  const lower = text.toLowerCase().replace(/[\u2018\u2019]/g, "'");
  const weekday = opts.now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const monthDay = opts.now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }).toLowerCase();
  const checks: IntroCheck[] = [];

  // Today's weekday or date anywhere, or any day presented as today ("It's Friday the 13th").
  const days = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';
  const asToday = lower.match(new RegExp(`\\b(?:it's|it is|today is|this|happy)\\s+(?:${days})\\b[^.,;:!?]*`));
  const namesToday = new RegExp(`\\b${weekday}\\b`).test(lower) || lower.includes(monthDay) || !!asToday;
  checks.push({ rule: "Doesn't name a day or date as today", passed: !namesToday,
    detail: namesToday ? `"${asToday ? asToday[0].trim() : lower.includes(monthDay) ? monthDay : weekday}"` : undefined });

  const banned = BANNED_PHRASES.filter(p => lower.includes(p));
  checks.push({ rule: 'No banned phrases', passed: banned.length === 0, detail: banned.length ? banned.join(', ') : undefined });

  const greeting = /^(hi|hello|hey|good (morning|afternoon|evening)|happy \w+)\b/i.test(text.trim());
  const signoff = /(see you tomorrow|until next time|happy reading|enjoy your (day|evening|reading))[.!]?\s*$/i.test(text.trim());
  checks.push({ rule: 'No greeting or sign-off', passed: !greeting && !signoff,
    detail: greeting ? 'opens with a greeting' : signoff ? 'ends with a sign-off' : undefined });

  const markers = [...text.matchAll(/\{\{([^{}|]+)\|(\d+)\}\}/g)];
  const bad = markers.filter(m => { const n = parseInt(m[2], 10); return n < 1 || n > opts.storyCount; });
  checks.push({ rule: 'Every cited story exists', passed: bad.length === 0,
    detail: bad.length ? bad.map(m => `"${m[1]}" → story ${m[2]}`).join(', ') : undefined });

  const preamble = text.trim().split(/\n/)[0].match(/^(here (are|is)|here's|below (are|is)|these are|today's (top )?stories|in this (issue|edition))\b[^.!?\n]*[.!?:]?/i);
  checks.push({ rule: 'No filler opener', passed: !preamble, detail: preamble ? `"${preamble[0]}"` : undefined });

  const paraCount = text.split(/\n\s*\n/).filter(p => p.trim()).length;
  checks.push({ rule: 'At most 3 paragraphs', passed: paraCount <= 3, detail: paraCount > 3 ? `${paraCount} paragraphs` : undefined });

  checks.push({ rule: 'Links at least one story', passed: markers.length > 0,
    detail: markers.length ? undefined : 'no story links' });

  const paras = text.split(/\n\s*\n/).filter(p => p.trim());
  const long = paras.filter(p => p.split(/\s+/).length > 70);
  checks.push({ rule: 'Short paragraphs (≤70 words)', passed: long.length === 0,
    detail: long.length ? `${long.length} long paragraph(s)` : undefined });

  return checks;
}
