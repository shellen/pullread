// ABOUTME: Tests for the on-device interest profile and Today's one read
// ABOUTME: Covers signal gathering from local files, fading, scoring rules, the "why" line, and skipping

import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildInterestProfile, rankForInterests, explainPick, pickOneRead, gatherInterestSignals, titleFromFilename, isImportedDescription } from './interests';
import type { InterestSignal } from './interests';
import type { ArticleMeta } from './email';

const now = Date.parse('2026-11-25T18:00:00Z');
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
const art = (title: string, extra: Partial<ArticleMeta> = {}): ArticleMeta =>
  ({ filename: `${title.toLowerCase().replace(/\W+/g, '-')}.md`, title, url: `https://x.com/${encodeURIComponent(title)}`, domain: 'x.com', ...extra });

describe('buildInterestProfile', () => {
  test('recent signals count more, and watches never fade', () => {
    const p = buildInterestProfile([
      { text: 'local newspaper ownership', kind: 'highlight', at: daysAgo(1) },
      { text: 'crypto exchange collapse', kind: 'highlight', at: daysAgo(63) }, // three half-lives
      { text: 'Nvidia', kind: 'watch' },
    ], now);
    expect(p.weights.get('newspaper')!).toBeGreaterThan(p.weights.get('crypto')! * 6);
    expect(p.weights.get('nvidia')).toBe(4);
    expect(p.counts).toEqual({ highlight: 2, watch: 1 });
  });

  test('a word in most notes is a habit, and a flood of notes cannot drown three highlights', () => {
    // Second live profile: ~1,000 prose notes made "because" and "right" the top interests.
    const notes: InterestSignal[] = Array.from({ length: 200 }, (_, i) => ({
      text: `because right now the topic${i} is talking about including such things`, kind: 'note' as const, at: daysAgo(2),
    }));
    const p = buildInterestProfile([
      ...notes,
      { text: 'Semafor reports on Nvidia board politics', kind: 'highlight', at: daysAgo(2) },
      { text: 'Nvidia export controls and chip policy', kind: 'highlight', at: daysAgo(2) },
      { text: 'local newspaper ownership', kind: 'highlight', at: daysAgo(2) },
    ], now);
    const top = [...p.weights].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);
    expect(top[0]).toBe('nvidia');
    expect(top).not.toContain('because');
    expect(top).not.toContain('talking');
  });

  test('filler words and numbers carry no interest', () => {
    const p = buildInterestProfile([{ text: 'I really think people want 2026 things', kind: 'note', at: daysAgo(0) }], now);
    expect([...p.weights.keys()]).toEqual([]);
  });
});

describe('rankForInterests and the pick', () => {
  const profile = buildInterestProfile([
    { text: 'Al Gore local newspaper ownership', kind: 'highlight', at: daysAgo(2) },
    { text: 'local news economics and newspaper buyouts', kind: 'notebook', at: daysAgo(5) },
    { text: 'Nvidia', kind: 'watch' },
  ], now);

  test('the best match wins, with its matched words', () => {
    const ranked = rankForInterests([
      art('Al Gore buys hometown Tennessee newspaper'),
      art('BMW M350 pricing explained'),
      art('Why Jensen Huang was reinstated at Nvidia'),
    ], profile);
    expect(ranked[0].article.title).toBe('Al Gore buys hometown Tennessee newspaper');
    expect(ranked[0].terms.slice(0, 3)).toEqual(expect.arrayContaining(['gore', 'newspaper']));
  });

  test('one matching word is not enough', () => {
    // "Nvidia" alone matches a watch, but a single word could be a coincidence.
    expect(rankForInterests([art('Why Jensen Huang was reinstated at Nvidia')], profile)).toEqual([]);
  });

  test('a word in most of the day’s articles counts less than a rare one', () => {
    const p = buildInterestProfile([{ text: 'election turnout Alaska Peltola', kind: 'highlight', at: daysAgo(1) }], now);
    const day = [
      art('Alaska Senate: Peltola wins', { excerpt: 'Turnout was high.' }),
      ...['Ohio', 'Texas', 'Iowa', 'Maine'].map(s => art(`${s} election results`, { excerpt: 'Turnout was steady.' })),
    ];
    const ranked = rankForInterests(day, p);
    expect(ranked[0].article.title).toBe('Alaska Senate: Peltola wins');
    expect(ranked.slice(1).every(c => c.score < ranked[0].score / 2)).toBe(true);
  });

  test('the why line names the signal kinds and the words', () => {
    expect(explainPick(['newspaper', 'gore', 'local'], profile)).toBe('Because of your highlights and Notebook on newspaper, gore and local');
  });

  test('articles the reader already highlighted or noted are skipped', () => {
    const gore = art('Al Gore buys hometown Tennessee newspaper');
    const { pick } = pickOneRead([gore, art('Local newspaper buyouts spread across the South')], profile, new Set([gore.filename]));
    expect(pick?.article.title).toBe('Local newspaper buyouts spread across the South');
    expect(pick?.why).toMatch(/^Because of your /);
  });

  test('common English cannot win the pick (real Nov 25 case: Illustrator template vs Riemann hypothesis)', () => {
    const p = buildInterestProfile([
      { text: "What's going on with the Riemann hypothesis? Has it been solved? The problem is based on primes", kind: 'notebook', at: daysAgo(3) },
      { text: 'We\u2019ve got the 11pm NPR headline for November', kind: 'notebook', at: daysAgo(3) },
    ], now);
    const { pick } = pickOneRead([
      art('A Grid-Based Presentation Template for Illustrator That Makes Alignment a Solved Problem'),
      art("What's going on with the Riemann hypothesis?", { excerpt: 'A century-old problem about primes.' }),
    ], p);
    expect(pick?.article.title).toBe("What's going on with the Riemann hypothesis?");
    expect(pick?.why).toContain('Riemann');
    expect(pick?.why).toMatch(/\bhypothesis\b/); // the article's word, not the stem "hypothesi"
    for (const junk of ['11pm', 'weve', 'november', 'headline', 'what', 'solved', 'problem', 'based']) expect(p.weights.has(junk)).toBe(false);
  });

  test('no signals, no pick', () => {
    expect(pickOneRead([art('Anything')], buildInterestProfile([], now)).pick).toBeNull();
  });
});

describe('gatherInterestSignals (local files)', () => {
  test('reads sidecars, the Notebook and watches', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pr-interests-'));
    const out = join(root, 'library');
    const config = join(root, 'config');
    mkdirSync(out); mkdirSync(config);

    writeFileSync(join(out, '2026-11-20-why-local-news-matters.md'), '---\ntitle: Why local news matters\n---\n');
    writeFileSync(join(out, '2026-11-20-why-local-news-matters.annot.json'), JSON.stringify({
      highlights: [{ id: 'h1', text: 'newspaper ownership is consolidating', createdAt: daysAgo(3) }],
      annotations: [{ id: 'a1', note: 'compare with Gore', anchorText: 'family-owned', createdAt: daysAgo(3) }],
      articleNote: '', tags: ['media', 'classicbooks'], machineTags: ['news'], isFavorite: true,
    }));
    writeFileSync(join(config, 'notebooks.json'), JSON.stringify({ 'nb-1': { notes: [{ content: 'Idea: a co-op model for small papers', createdAt: daysAgo(4) }] } }));

    const { signals, engaged } = await gatherInterestSignals({ outputPath: out, configDir: config, watches: ['Al Gore'] });
    const kinds = signals.map((x: InterestSignal) => x.kind).sort();
    expect(kinds).toEqual(['favorite', 'highlight', 'note', 'notebook', 'tag', 'watch']); // classicbooks tag skipped
    expect(signals.find(x => x.kind === 'favorite')!.text).toBe('why local news matters');
    expect([...engaged]).toEqual(['2026-11-20-why-local-news-matters.md']);
  });

  test('a favorite alone counts as engaged, so its story is never the one read', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pr-interests-'));
    const out = join(root, 'library');
    const config = join(root, 'config');
    mkdirSync(out); mkdirSync(config);
    writeFileSync(join(out, '2026-11-26-andy-taylor-dies.md'), '---\ntitle: Andy Taylor dies\n---\n');
    writeFileSync(join(out, '2026-11-26-andy-taylor-dies.annot.json'), JSON.stringify({ highlights: [], annotations: [], articleNote: '', tags: [], machineTags: [], isFavorite: true }));
    const { engaged } = await gatherInterestSignals({ outputPath: out, configDir: config });
    expect([...engaged]).toEqual(['2026-11-26-andy-taylor-dies.md']);
  });

  test('article notes are ignored: in real libraries they mostly hold imported text', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pr-interests-'));
    const out = join(root, 'library');
    const config = join(root, 'config');
    mkdirSync(out); mkdirSync(config);
    const blurb = 'U2 announced a 2027 North American stadium tour on Tuesday, their first since 2018.';
    writeFileSync(join(out, '2026-11-24-u2-tour.md'), `---\ntitle: U2 tour\nannotation: "${blurb}"\n---\nBody`);
    writeFileSync(join(out, '2026-11-24-u2-tour.annot.json'), JSON.stringify({ highlights: [], annotations: [], articleNote: blurb, tags: [], machineTags: [], isFavorite: false }));
    const { signals, engaged } = await gatherInterestSignals({ outputPath: out, configDir: config });
    expect(signals.filter(x => x.kind === 'note')).toEqual([]);
    expect([...engaged]).toEqual([]);
    // The detector stays available for the source fix (feed descriptions copied into notes).
    expect(isImportedDescription(blurb, join(out, '2026-11-24-u2-tour.annot.json'))).toBe(true);
  });

  test('reading history: everything opened is returned to skip; recently finished articles become signals', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pr-interests-'));
    const out = join(root, 'library');
    const config = join(root, 'config');
    mkdirSync(out); mkdirSync(config);
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const old = new Date(Date.now() - 90 * 86_400_000).toISOString();
    writeFileSync(join(config, 'reading.json'), JSON.stringify({ picks: [], articles: {
      '2026-11-23-semafor-trump-nvidia-board.md': { opened: recent, progress: 0.95, finished: recent, lastSeen: recent },
      '2026-08-01-old-finished-piece.md': { opened: old, progress: 1, finished: old, lastSeen: old },
      '2026-11-24-skimmed.md': { opened: recent, progress: 0.2, lastSeen: recent },
      '2019-01-01-backfilled.md': {},
    } }));
    const { signals, read } = await gatherInterestSignals({ outputPath: out, configDir: config });
    expect(signals.filter(x => x.kind === 'read').map(x => x.text)).toEqual(['semafor trump nvidia board']);
    expect(read.size).toBe(4);
  });

  test('titleFromFilename turns a dated slug back into words', () => {
    expect(titleFromFilename('2026/11/2026-11-20-why-local-news-matters.md')).toBe('why local news matters');
  });
});
