// ABOUTME: Structured-output helpers for the Rundown: intro with exact citations, model-assisted
// ABOUTME: story grouping, and rule checks on generated intros (plan: docs/plans/2026-11-25-…)

import { domainOf, storyTokens } from './stories';
import { PROFILE_STOPWORDS } from './interests';
import type { StoryGroup } from './stories';

// ---------------------------------------------------------------------------
// Demo 1 — structured intro (guided generation)
// ---------------------------------------------------------------------------

export interface IntroLink {
  /** Words in the paragraph to turn into a link. Must appear verbatim. */
  phrase: string;
  /** 1-based story number from the list the model was given. */
  story: number;
  /**
   * Where this story's own sentence sits in the paragraph text ([start, end)).
   * When set, the phrase is only looked for there, so a word shared by two
   * sentences can't put one story's link in another story's sentence.
   */
  start?: number;
  end?: number;
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
  return run.slice(0, 6).join(' ').replace(/^[^\w$]+|[^\w$]+$/g, '');
}

/**
 * Parse the per-story shape the macOS 26 helper returns — paragraphs of
 * { story, sentence, phrase } — into a StructuredIntro. Each sentence carries
 * its own story number, so every mentioned story gets a link.
 */
export function mentionsToIntro(paragraphs: Mention[][], titles: string[]): StructuredIntro {
  return {
    paragraphs: paragraphs.filter(p => p.length).map(mentions => {
      let offset = 0;
      const links: IntroLink[] = [];
      const sentences = mentions.map(m => {
        const sentence = m.sentence.trim();
        const title = titles[m.story - 1] || '';
        const phrase = (m.phrase || '').trim();
        const words = phrase.split(/\s+/).filter(Boolean).length;
        // Small models often "link" the whole sentence; keep links to a few words.
        const usable = phrase && words <= 6 && phrase.length < sentence.length * 0.8
          && sentence.toLowerCase().includes(phrase.toLowerCase());
        links.push({ story: m.story, phrase: usable ? phrase : fallbackPhrase(sentence, title), start: offset, end: offset + sentence.length });
        offset += sentence.length + 1; // the joining space
        return sentence;
      });
      return { text: sentences.join(' '), links };
    }),
  };
}

/** Accept either response shape: macOS 26 mentions, or the flat fm (macOS 27) arrays. */
export function parseIntroResponse(raw: any, titles: string[]): StructuredIntro {
  return Array.isArray(raw?.mentions) ? mentionsToIntro(raw.mentions, titles) : parseFlatIntro(raw);
}

/**
 * Instructions for the on-device intro (Apple Intelligence, macOS 26). Pairs
 * with IntroResult in APPLE_STRUCTURED_SWIFT: per-story sentences in a lead
 * (1-2) and a second paragraph (2-3), in the model's own words, short links.
 */
export function appleIntroInstructions(dateLine: string): string {
  return `You write the opening note for a daily reading email.
Pick the 1-2 most important stories for the first paragraph and 2-3 others for the second. For each, write ONE sentence IN YOUR OWN WORDS saying what happened and why it matters, with one concrete detail (a number, a name, a place). Do not copy the headline or the excerpt.
For each sentence also give the link: 2 to 5 words from your sentence that name the story (for example "Bayer's Roundup deal"), never the whole sentence.
This note goes out on ${dateLine}. Stories may mention other days; those are not today. Don't name today's weekday or date.
No greetings, no sign-offs, no "here are the top stories", never "dive in" or "buckle up".`;
}

const wordsOf = (t: string) => t.toLowerCase().replace(/[\u2018\u2019]/g, "'").match(/[a-z0-9$.']+/g) || [];

/** Does this sentence (8+ words) take at least 85% of its words from one of the sources? */
export function copiesSource(sentence: string, sources: string[]): boolean {
  const w = wordsOf(sentence);
  if (w.length < 8) return false;
  return sources.filter(Boolean).some(src => {
    const set = new Set(wordsOf(src));
    return w.filter(x => set.has(x)).length / w.length >= 0.85;
  });
}

// Capitalized words that aren't names (sentence starts are skipped separately).
const NOT_NAMES = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'it', 'its', 'he', 'she', 'they', 'his', 'her', 'their',
  'this', 'that', 'these', 'those', 'and', 'but', 'or', 'for', 'with', 'after', 'before', 'as', 'by', 'from', 'to', 'of',
  'new', 'meanwhile', 'elsewhere', 'also', 'closer', 'home', 'i']);

/**
 * Names in a sentence that its source doesn't mention: capitalized words
 * (other than the first) and quoted titles. The on-device model invents
 * detail despite instructions — live: "John Berger appeared in 'Grand Theft
 * Auto' as a character named 'The Philosopher'".
 */
/**
 * Roles the model likes to guess. A sentence that gives someone a role the
 * story never mentions is invented: on Nov 26 it called Andy Taylor "Duran
 * Duran's drummer" (he was the guitarist).
 */
const ROLE_WORDS = [
  'drummer', 'guitarist', 'bassist', 'singer', 'frontman', 'keyboardist', 'rapper', 'actor', 'actress',
  'director', 'producer', 'author', 'novelist', 'poet', 'comedian', 'founder', 'cofounder', 'co-founder',
  'ceo', 'cfo', 'chairman', 'chairwoman', 'president', 'vice president', 'senator', 'governor', 'mayor',
  'congressman', 'congresswoman', 'representative', 'judge', 'justice', 'minister', 'prime minister',
  'coach', 'quarterback', 'pitcher', 'striker', 'goalkeeper', 'manager', 'owner', 'professor', 'scientist',
];

export function unsupportedRoles(sentence: string, source: string): string[] {
  const src = source.toLowerCase();
  const text = sentence.toLowerCase();
  return ROLE_WORDS.filter(r => new RegExp(`\\b${r}s?\\b`).test(text) && !new RegExp(`\\b${r}`).test(src));
}

/**
 * Numbers in a sentence that the story doesn't state. On Nov 26 two runs gave
 * one U2 tour 11 cities and 14 cities. Ages like "at the age of 84" count only
 * if 84 is in the story too.
 */
export function unsupportedNumbers(sentence: string, source: string): string[] {
  const nums = (t: string) => (t.match(/\d[\d,.]*/g) || []).map(n => n.replace(/[,.]+$/, '').replace(/,/g, ''));
  const have = new Set(nums(source));
  return [...new Set(nums(sentence).filter(n => !have.has(n)))];
}

export function unsupportedNames(sentence: string, source: string): string[] {
  const src = source.toLowerCase().replace(/[\u2018\u2019]/g, "'");
  const out: string[] = [];
  for (const q of sentence.matchAll(/['\u2018"\u201c]([A-Z][^'\u2019"\u201d]{2,60})['\u2019"\u201d]/g)) {
    if (!src.includes(q[1].toLowerCase())) out.push(q[1]);
  }
  const words = sentence.replace(/['\u2018"\u201c][^'\u2019"\u201d]*['\u2019"\u201d]/g, ' ').split(/\s+/);
  words.forEach((raw, i) => {
    const w = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9'\u2019]+$/g, '').replace(/['\u2019]s$/, '');
    if (i === 0 || !/^[A-Z][A-Za-z'\u2019.-]{2,}$/.test(w) || NOT_NAMES.has(w.toLowerCase())) return;
    if (!src.includes(w.toLowerCase())) out.push(w);
  });
  return [...new Set(out)];
}

/**
 * Instructions for one story's sentence (on-device, one story per request). A
 * refusal then costs one story, not the whole intro: on a real day, Apple's
 * guardrails refused the six-story request outright (Nov 25, 2026).
 */
export function appleSentenceInstructions(dateLine: string, retry = false): string {
  return `You write one sentence for a daily reading email about the story below.
Say what happened IN YOUR OWN WORDS, with one concrete detail (a number, a name, a place). Do not copy the headline or the excerpt.
Use ONLY facts stated in the headline and excerpt. Do not add background, guess who people are, or explain why it matters. If unsure, say less.
Also give 2 to 5 words from your sentence that name the story, never the whole sentence.
This email goes out on ${dateLine}. Don't name today's weekday or date, and don't call past events upcoming. No greetings, no hype.`
    + (retry ? '\nImportant: never reuse more than three words in a row from the headline or excerpt.' : '');
}

/**
 * Build the intro one story at a time: up to `want` sentences from the top
 * stories, the first two as the lead paragraph and the rest as the second.
 * Stories the model refuses or fails on are skipped (up to `maxTries` stories
 * are tried). Returns null if fewer than 3 sentences came back.
 */
type StorySentence = { sentence?: string; phrase?: string } | null;

export async function buildPerStoryIntro(
  stories: Array<{ title: string; domain?: string; summary?: string; excerpt?: string }>,
  ask: (prompt: string, retry: boolean) => StorySentence | Promise<StorySentence>,
  opts: { want?: number; maxTries?: number; gistCap?: number } = {},
): Promise<{ mentions: Mention[][]; skipped: number; copied: number; invented: number } | null> {
  const { want = 5, maxTries = 8, gistCap = 200 } = opts;
  const got: Mention[] = [];
  let skipped = 0;
  let copied = 0;
  let invented = 0;
  const firstSentence = (t: string) => t.trim().match(/^.+?[.!?](?=\s+[A-Z"\u201c]|\s*$)/)?.[0] ?? t.trim();
  for (let i = 0; i < Math.min(stories.length, maxTries) && got.length < want; i++) {
    const a = stories[i];
    const gist = (a.summary || a.excerpt || '').slice(0, gistCap);
    const prompt = `Headline: ${a.title}\nSource: ${a.domain || ''}${gist ? `\nExcerpt: ${gist}` : ''}`;
    const askOnce = async (retry: boolean): Promise<StorySentence> => { try { return await ask(prompt, retry); } catch { return null; } };
    // One sentence per story: the model often adds "This is significant because…".
    let r = await askOnce(false);
    let sentence = r?.sentence?.trim() ? firstSentence(r.sentence) : '';
    // A sentence that copies its own headline or excerpt, or names something
    // the story doesn't mention, gets one more try, then the story is skipped —
    // instead of one bad sentence sinking (or misinforming) the intro.
    const source = `${a.title} ${gist}`;
    const bad = (t: string) => copiesSource(t, [a.title, gist]) ? 'copied'
      : unsupportedNames(t, source).length || unsupportedRoles(t, source).length || unsupportedNumbers(t, source).length ? 'invented' : '';
    if (sentence && bad(sentence)) {
      r = await askOnce(true);
      sentence = r?.sentence?.trim() ? firstSentence(r.sentence) : '';
      const why = sentence ? bad(sentence) : '';
      if (why === 'copied') { copied++; sentence = ''; }
      if (why === 'invented') { invented++; sentence = ''; }
    }
    if (!sentence) { skipped++; continue; }
    got.push({ story: i + 1, sentence, phrase: r?.phrase });
  }
  if (got.length < 3) return null;
  return { mentions: [got.slice(0, 2), got.slice(2)], skipped, copied, invented };
}

/** The numbered story list for the on-device intro: top stories only, short gists (4K window). */
export function appleIntroStoryList(stories: Array<{ title: string; domain?: string; summary?: string; excerpt?: string }>, max = 6, gistCap = 140): string {
  return stories.slice(0, max).map((a, i) => {
    const gist = (a.summary || a.excerpt || '').slice(0, gistCap);
    return `${i + 1}. ${a.title} (${a.domain || ''})${gist ? ` \u2014 ${gist}` : ''}`;
  }).join('\n');
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
    // Links tied to their own sentence go last-to-first, so inserting a marker
    // never shifts the offsets of the sentences still to be linked.
    const located = p.links.every(l => l.start !== undefined);
    const links = located ? [...p.links].sort((a, b) => (b.start ?? 0) - (a.start ?? 0)) : p.links;
    for (const link of links) {
      if (link.story < 1 || link.story > storyCount) {
        dropped.push(`paragraph ${pi + 1}: story ${link.story} doesn't exist`);
        continue;
      }
      const from = located ? link.start! : 0;
      const to = located ? (link.end ?? text.length) : text.length;
      const found = text.slice(from, to).toLowerCase().indexOf(link.phrase.toLowerCase());
      const idx = found === -1 ? -1 : from + found;
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

const YEAR = /^(19|20)\d\d$/;

/**
 * Words too common in the day's stories to be evidence of the same event:
 * in more than max(3, 2%) of them. Compute this over the WHOLE day, not a
 * shortlist — within a 40-story shortlist "BMW" and "Black Friday" looked
 * rare, and the model merged unrelated BMW and Black Friday stories.
 */
export function commonWords(groups: StoryGroup[]): Set<string> {
  const df = new Map<string, number>();
  for (const g of groups) for (const w of groupTokens(g)) df.set(w, (df.get(w) || 0) + 1);
  const above = Math.max(3, Math.ceil(groups.length * 0.02));
  return new Set([...df].filter(([, n]) => n > above).map(([w]) => w));
}

/**
 * Pairs of group indexes (0-based) worth asking about, most shared words
 * first. A pair needs at least two shared uncommon words — words that appear
 * in only a few of the day's stories. A word that runs through the whole day
 * ("BMW" for a reader of BMW BLOG) is not evidence of the same event: on a
 * real day the model merged three unrelated BMW stories that shared it.
 */
/** A headline that lists several stories: "A; B" or NPR's "A. And, B". */
export function isDigestTitle(title: string): boolean {
  return title.includes(';') || /\.\s+And,?\s/.test(title);
}

export function candidatePairs(groups: StoryGroup[], max = 40, common: Set<string> = commonWords(groups)): Array<[number, number]> {
  const tokens = groups.map(groupTokens);
  // A headline that lists several stories ("Santa Cruz County business: Capstan …;
  // Driscoll's wins …") is a digest, never the same event as one story: on Nov 26
  // the model merged one into two mayor's-race stories over "Santa Cruz".
  // NPR's newsletter headlines do the same with ". And, …".
  const digest = groups.map(g => g.members.some(m => isDigestTitle(m.title)));
  const pairs: Array<{ pair: [number, number]; shared: number }> = [];
  for (let i = 0; i < groups.length; i++) {
    if (digest[i]) continue;
    for (let j = i + 1; j < groups.length; j++) {
      if (digest[j]) continue;
      let shared = 0;
      // Everyday words ("time", "latest", "review") aren't evidence either, however rare
      // they are that day: "That Time John Berger Was in 'Grand Theft Auto'" merged with
      // "Life Time Announces … Grand Prix Series" over "time" and "grand" (Nov 25).
      for (const w of tokens[i]) if (tokens[j].has(w) && !common.has(w) && !YEAR.test(w) && !PROFILE_STOPWORDS.has(w)) shared++;
      if (shared >= 2) pairs.push({ pair: [i, j], shared });
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

/**
 * Fixed section names. The on-device model labels far more consistently picking
 * from a list than inventing names ("Tech" vs "Technology", Roundup as "Health").
 * Keep in sync with SECTIONS in scripts/demos/fm-structured.swift.
 */
export const SECTION_NAMES = [
  'World', 'U.S.', 'Politics', 'Business', 'Courts', 'Tech', 'Science', 'Health',
  'Climate', 'Culture', 'Music', 'Design', 'Sports', 'Autos', 'Local',
];

export const LABEL_INSTRUCTIONS = `You sort a day's news headlines into newspaper sections.
Each line is "[id] headline (outlets)". For each headline give its id, the best section from this list: ${SECTION_NAMES.join(', ')}; and its importance from 1 to 5 for a general reader today (5 = major news anywhere, 3 = solid story, 1 = niche). Use 5 rarely.`;

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
 * its parts and the highest importance. With `useImportance: false` the
 * ratings are dropped — on macOS 26 the on-device model's ratings were noise
 * across three live runs (all 4s; mostly 3s; a pile of 5s for niche stories).
 */
export function groupingLinesFromPairs(
  groupCount: number,
  pairs: Array<[number, number]>,
  sameIds: string[],
  labelLines: string[],
  opts: { useImportance?: boolean } = {},
): string[] {
  const { useImportance = true } = opts;
  // No chaining: two clusters join only if the model confirmed every cross
  // pair. (A~C and B~C alone does not make A, B and C one story.)
  const confirmed = new Set<string>();
  for (const id of sameIds) {
    const pair = pairs[parseInt(String(id).replace(/^\s*P/i, ''), 10) - 1];
    if (pair) confirmed.add(`${Math.min(...pair)},${Math.max(...pair)}`);
  }
  const isConfirmed = (a: number, b: number) => confirmed.has(`${Math.min(a, b)},${Math.max(a, b)}`);
  const clusterOf = Array.from({ length: groupCount }, (_, i) => [i]);
  for (const key of confirmed) {
    const [a, b] = key.split(',').map(Number);
    const ca = clusterOf[a], cb = clusterOf[b];
    if (ca === cb) continue;
    if (!ca.every(x => cb.every(y => isConfirmed(x, y)))) continue;
    const merged = [...ca, ...cb].sort((x, y) => x - y);
    for (const x of merged) clusterOf[x] = merged;
  }

  const info = new Map<number, { label: string; imp: number }>();
  for (const line of labelLines) {
    const [idPart, label = '', imp = ''] = line.split('|').map(x => x.trim());
    const i = parseInt((idPart || '').replace(/[^\d]/g, ''), 10) - 1;
    if (i >= 0 && i < groupCount && !info.has(i)) info.set(i, { label, imp: parseInt(imp, 10) || 0 });
  }

  return [...new Set(clusterOf)].map(ids => {
    const label = ids.map(i => info.get(i)?.label).find(Boolean) || '';
    const imp = useImportance ? Math.max(0, ...ids.map(i => info.get(i)?.imp || 0)) : 0;
    return `${ids.map(i => i + 1).join(',')}|${label}|${imp || ''}`;
  });
}

export type StructuredRunner = (mode: 'pairs' | 'labels', instructions: string, prompt: string) => any | Promise<any>;

/**
 * The macOS 26 grouping pass end to end: "same event?" for candidate pairs in
 * batches of 12, then fixed-list section labels in batches of 20. Importance
 * is dropped (unreliable on-device). Returns "ids|label|" lines for
 * applyModelGroups, or null if the time budget runs out before the pair
 * questions finish. Labels are optional: if time runs out during labeling,
 * the merges still count. `run` throws on model errors; callers catch.
 */
export async function onDeviceGrouping(
  groups: StoryGroup[],
  run: StructuredRunner,
  opts: { budgetMs?: number; clock?: () => number; common?: Set<string> } = {},
): Promise<string[] | null> {
  const { budgetMs = 45_000, clock = Date.now, common } = opts;
  const start = clock();
  const pairs = candidatePairs(groups, 40, common);
  // A batch the model refuses (sensitive headlines) is split in half and each half
  // retried, down to single items, so one obituary doesn't cost the whole batch:
  // on Nov 26 every batch was refused and grouping fell back to word matching.
  // Other failures skip the batch.
  let failed = 0;
  let calls = 0;
  let outOfTime = false;
  const skipped = { pairs: 0, labels: 0 };
  const reasons = new Set<string>();
  const MIN_SPLIT = 2; // down to single items; the time budget still caps the calls
  const ask = async <T>(mode: 'pairs' | 'labels', items: T[], prompt: (part: T[], offset: number) => string, offset: number, pick: (r: any) => string[]): Promise<string[]> => {
    if (clock() - start > budgetMs) { outOfTime = true; return []; }
    calls++;
    try {
      return pick(await run(mode, mode === 'pairs' ? PAIR_INSTRUCTIONS : LABEL_INSTRUCTIONS, prompt(items, offset)));
    } catch (err) {
      failed++;
      const refused = (err as { kind?: string })?.kind === 'refusal';
      if (refused && items.length >= MIN_SPLIT) {
        const mid = Math.ceil(items.length / 2);
        return [
          ...await ask(mode, items.slice(0, mid), prompt, offset, pick),
          ...await ask(mode, items.slice(mid), prompt, offset + mid, pick),
        ];
      }
      skipped[mode] += items.length;
      reasons.add(err instanceof Error ? err.message : String(err));
      return [];
    }
  };
  const same: string[] = [];
  const pairBatches = batches(pairs, 12);
  for (let bi = 0; bi < pairBatches.length; bi++) {
    same.push(...await ask('pairs', pairBatches[bi], (part, offset) => pairsPrompt(groups, part, offset), bi * 12, r => r?.same || []));
    if (outOfTime) return null;
  }
  const labels: string[] = [];
  for (const ids of batches(groups.map((_, i) => i), 20)) {
    labels.push(...await ask('labels', ids, part => labelPrompt(groups, part), 0, r => r?.stories || []));
    if (outOfTime) break;
  }
  if (skipped.pairs || skipped.labels) {
    const parts = [skipped.pairs && `${skipped.pairs} pair${skipped.pairs === 1 ? '' : 's'}`, skipped.labels && `${skipped.labels} label${skipped.labels === 1 ? '' : 's'}`].filter(Boolean);
    console.warn(`[email] Grouping skipped ${parts.join(' and ')}: ${[...reasons].join('; ')}`);
  }
  if (calls > 0 && failed === calls) throw new Error(`every model call failed (${failed})`);
  return groupingLinesFromPairs(groups.length, pairs, same, labels, { useImportance: false });
}

// ---------------------------------------------------------------------------
// Demo 3 — intro rule checks (Evaluations-style)
// ---------------------------------------------------------------------------

/** Phrases the intro prompt forbids (kept in sync with roundupSummaryPrompt in email.ts). */
/**
 * Rules that block an intro from being sent (retry once, then omit it). The
 * rest — paragraph count, link length, link count — are logged but allowed:
 * links can also come from the renderer's title matching, and a long intro is
 * still a correct one.
 */
export const BLOCKING_RULES = new Set([
  "Doesn't name a day or date as today",
  'No banned phrases',
  'No greeting or sign-off',
  'No filler opener',
  'Every cited story exists',
  'Written in its own words',
  "Grounded in today's stories",
  'No stock filler',
]);

/**
 * Small-model filler tells, from a real on-device intro (Nov 25, 2026) that
 * passed every other check: "The tension is palpable", "As we navigate these
 * complex issues, it's important to stay informed…".
 */
export const STOCK_FILLER: RegExp[] = [
  /\bthe tension is palpable\b/i, /\bas we navigate\b/i, /\bit'?s important to stay informed\b/i,
  /\bstay informed and engaged\b/i, /\bin the (world|realm) of\b/i, /\bon one hand\b/i,
  /\bit'?s no surprise\b/i, /\bsent ripples through\b/i, /\bshape our communities\b/i,
  /\bin today'?s fast-paced\b/i, /\bonly time will tell\b/i, /^lastly,/im,
  /\bthis (development )?is significant\b/i, /\bhighlights the intersection\b/i, /\bmarks a major step\b/i,
];

/** The blocking failures in a set of checks, as "rule — detail" strings. */
export function blockingFailures(checks: IntroCheck[]): string[] {
  return checks.filter(c => !c.passed && BLOCKING_RULES.has(c.rule)).map(c => (c.detail ? `${c.rule} — ${c.detail}` : c.rule));
}

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
export function checkIntro(text: string, opts: { now: Date; storyCount: number; sources?: string[] }): IntroCheck[] {
  const lower = text.toLowerCase().replace(/[\u2018\u2019]/g, "'");
  const weekday = opts.now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const monthDay = opts.now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }).toLowerCase();
  const checks: IntroCheck[] = [];

  // Blocking: a day presented as today ("It's Friday the 13th", "Happy Monday").
  // Not blocking: today's weekday or date merely mentioned — stories legitimately
  // say "Tuesday's count" on a Tuesday, and blocking that dropped accurate intros.
  const days = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';
  const asToday = lower.match(new RegExp(`\\b(?:it's|it is|today is|this|happy)\\s+(?:${days})\\b[^.,;:!?]*`));
  checks.push({ rule: "Doesn't name a day or date as today", passed: !asToday,
    detail: asToday ? `"${asToday[0].trim()}"` : undefined });
  const mentionsToday = new RegExp(`\\b${weekday}\\b`).test(lower) || lower.includes(monthDay);
  checks.push({ rule: "Doesn't mention today's weekday or date", passed: !mentionsToday,
    detail: mentionsToday ? `"${lower.includes(monthDay) ? monthDay : weekday}"` : undefined });

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

  const filler = STOCK_FILLER.map(re => lower.match(re)?.[0]).filter(Boolean) as string[];
  checks.push({ rule: 'No stock filler', passed: filler.length === 0, detail: filler.length ? filler.map(f => `"${f}"`).join(', ') : undefined });

  const preamble = text.trim().split(/\n/)[0].match(/^(here (are|is)|here's|below (are|is)|these are|today's (top )?stories|in this (issue|edition))\b[^.!?\n]*[.!?:]?/i);
  checks.push({ rule: 'No filler opener', passed: !preamble, detail: preamble ? `"${preamble[0]}"` : undefined });

  const paraCount = text.split(/\n\s*\n/).filter(p => p.trim()).length;
  checks.push({ rule: 'At most 3 paragraphs', passed: paraCount <= 3, detail: paraCount > 3 ? `${paraCount} paragraphs` : undefined });

  const longLinks = markers.filter(m => m[1].trim().split(/\s+/).length > 8);
  checks.push({ rule: 'Links are short (≤8 words)', passed: longLinks.length === 0,
    detail: longLinks.length ? `${longLinks.length} long link(s), e.g. "${longLinks[0][1].slice(0, 50)}…"` : undefined });

  // Copying: a sentence whose words (8+) nearly all come from one story's title or excerpt.
  if (opts.sources?.length) {
    // Quoted titles are allowed (the strict-titles prompt asks for them); measure the rest.
    const plain = text.replace(/\{\{([^{}|]+)\|\d+\}\}/g, '$1').replace(/["\u201c][^"\u201d]{12,}["\u201d]/g, ' ');
    const copied = plain.split(/(?<=[.!?])\s+/).filter(sentence => copiesSource(sentence, opts.sources!));
    checks.push({ rule: 'Written in its own words', passed: copied.length === 0,
      detail: copied.length ? `${copied.length} sentence(s) copied from the stories, e.g. "${copied[0].slice(0, 60)}…"` : undefined });
  }

  // Grounding: every paragraph must cite a story or share at least two
  // distinctive words with one. Catches an intro about news that isn't in the
  // list at all (the model inventing a day's headlines from an empty list).
  if (opts.sources) {
    const sourceTokens = opts.sources.map(src => storyTokens(src));
    const ungrounded = text.split(/\n\s*\n/).filter(p => p.trim()).filter(p => {
      if (/\{\{[^{}|]+\|\d+\}\}/.test(p)) return false;
      const t = storyTokens(p.replace(/\{\{|\}\}/g, ''));
      return !sourceTokens.some(st => { let n = 0; for (const w of t) if (st.has(w) && ++n >= 2) return true; return false; });
    });
    checks.push({ rule: "Grounded in today's stories", passed: ungrounded.length === 0,
      detail: ungrounded.length ? `${ungrounded.length} paragraph(s) about none of the stories, e.g. "${ungrounded[0].slice(0, 60)}…"` : undefined });
  }

  checks.push({ rule: 'Links at least one story', passed: markers.length > 0,
    detail: markers.length ? undefined : 'no story links' });

  const paras = text.split(/\n\s*\n/).filter(p => p.trim());
  const long = paras.filter(p => p.split(/\s+/).length > 70);
  checks.push({ rule: 'Short paragraphs (≤70 words)', passed: long.length === 0,
    detail: long.length ? `${long.length} long paragraph(s)` : undefined });

  return checks;
}
