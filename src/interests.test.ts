// ABOUTME: Tests for the on-device interest profile and Today's one read
// ABOUTME: Covers signal gathering from local files, fading, scoring rules, the "why" line, and skipping

import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildInterestProfile, rankForInterests, explainPick, pickOneRead, gatherInterestSignals, titleFromFilename } from './interests';
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

  test('no signals, no pick', () => {
    expect(pickOneRead([art('Anything')], buildInterestProfile([], now)).pick).toBeNull();
  });
});

describe('gatherInterestSignals (local files)', () => {
  test('reads sidecars, the Notebook, watches and recent Obsidian notes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pr-interests-'));
    const out = join(root, 'library');
    const config = join(root, 'config');
    const vault = join(root, 'vault');
    mkdirSync(out); mkdirSync(config); mkdirSync(join(vault, '.obsidian'), { recursive: true });

    writeFileSync(join(out, '2026-11-20-why-local-news-matters.md'), '---\ntitle: Why local news matters\n---\n');
    writeFileSync(join(out, '2026-11-20-why-local-news-matters.annot.json'), JSON.stringify({
      highlights: [{ id: 'h1', text: 'newspaper ownership is consolidating', createdAt: daysAgo(3) }],
      annotations: [{ id: 'a1', note: 'compare with Gore', anchorText: 'family-owned', createdAt: daysAgo(3) }],
      articleNote: '', tags: ['media', 'classicbooks'], machineTags: ['news'], isFavorite: true,
    }));
    writeFileSync(join(config, 'notebooks.json'), JSON.stringify({ 'nb-1': { notes: [{ content: 'Idea: a co-op model for small papers', createdAt: daysAgo(4) }] } }));
    writeFileSync(join(vault, 'Local news.md'), '# Local news\nOwnership and civic health.');
    writeFileSync(join(vault, 'Old idea.md'), 'Ancient note');
    utimesSync(join(vault, 'Old idea.md'), new Date(now - 90 * 86_400_000), new Date(now - 90 * 86_400_000));
    writeFileSync(join(vault, '.obsidian', 'workspace.md'), 'should be ignored');

    const { signals, engaged } = await gatherInterestSignals({ outputPath: out, configDir: config, watches: ['Al Gore'], obsidianPath: vault, now });
    const kinds = signals.map((x: InterestSignal) => x.kind).sort();
    expect(kinds).toEqual(['favorite', 'highlight', 'note', 'notebook', 'obsidian', 'tag', 'watch']); // classicbooks tag skipped
    expect(signals.find(x => x.kind === 'obsidian')!.text).toContain('Local news');
    expect(signals.some(x => x.text.includes('should be ignored') || x.text.includes('Ancient'))).toBe(false);
    expect(signals.find(x => x.kind === 'favorite')!.text).toBe('why local news matters');
    expect([...engaged]).toEqual(['2026-11-20-why-local-news-matters.md']);
  });

  test('titleFromFilename turns a dated slug back into words', () => {
    expect(titleFromFilename('2026/11/2026-11-20-why-local-news-matters.md')).toBe('why local news matters');
  });
});
