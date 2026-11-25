// ABOUTME: Tests for the local reading history (viewer events → reading.json) and Today's one read pick tracking
// ABOUTME: Also runs viewer/20-reading.js against stubbed fetch/localStorage to check batching and backfill

import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { applyReadingEvents, loadReading, saveReading, recordPick, pickOutcomes, readingPath } from './reading';
import type { ReadingState } from './reading';

const now = Date.parse('2026-11-25T18:00:00Z');
const empty = (): ReadingState => ({ articles: {}, picks: [] });

describe('applyReadingEvents', () => {
  test('open, progress and finishing at 90%', () => {
    let s = applyReadingEvents(empty(), [{ filename: 'a.md', type: 'open', at: now - 60_000 }], now);
    s = applyReadingEvents(s, [{ filename: 'a.md', type: 'progress', progress: 0.5, at: now - 30_000 }], now);
    expect(s.articles['a.md'].finished).toBeUndefined();
    s = applyReadingEvents(s, [{ filename: 'a.md', type: 'progress', progress: 0.93, at: now }], now);
    expect(s.articles['a.md']).toEqual({
      opened: new Date(now - 60_000).toISOString(),
      progress: 0.93,
      finished: new Date(now).toISOString(),
      lastSeen: new Date(now).toISOString(),
    });
  });

  test('progress never goes backwards, and finishing is recorded once', () => {
    let s = applyReadingEvents(empty(), [{ filename: 'a.md', type: 'progress', progress: 0.95, at: now - 1000 }], now);
    s = applyReadingEvents(s, [{ filename: 'a.md', type: 'progress', progress: 0.2, at: now }], now);
    expect(s.articles['a.md'].progress).toBe(0.95);
    expect(s.articles['a.md'].finished).toBe(new Date(now - 1000).toISOString());
  });

  test('backfill marks an article read without inventing dates, and never overwrites real ones', () => {
    let s = applyReadingEvents(empty(), [{ filename: 'old.md', type: 'backfill' }], now);
    expect(s.articles['old.md']).toEqual({});
    s = applyReadingEvents(s, [{ filename: 'old.md', type: 'open', at: now }], now);
    s = applyReadingEvents(s, [{ filename: 'old.md', type: 'backfill' }], now);
    expect(s.articles['old.md'].opened).toBe(new Date(now).toISOString());
  });

  test('ignores bad filenames and junk, and clamps future timestamps to now', () => {
    const s = applyReadingEvents(empty(), [
      { filename: '../../etc/passwd', type: 'open' }, { filename: 'x.txt', type: 'open' }, null, 42,
      { filename: 'a.md', type: 'progress', progress: 'lots' }, { filename: 'a.md', type: 'nonsense' },
      { filename: 'b.md', type: 'open', at: now + 86_400_000 },
    ], now);
    expect(Object.keys(s.articles)).toEqual(['b.md']);
    expect(s.articles['b.md'].opened).toBe(new Date(now).toISOString());
  });
});

describe('picks and outcomes', () => {
  test('one pick per day, newest outcomes first, opened/finished from history', () => {
    let s = recordPick(empty(), { date: '2026-11-23', filename: 'a.md', title: 'A' });
    s = recordPick(s, { date: '2026-11-24', filename: 'b.md', title: 'B' });
    s = recordPick(s, { date: '2026-11-24', filename: 'c.md', title: 'C' }); // re-run replaces that day's pick
    s = applyReadingEvents(s, [{ filename: 'a.md', type: 'progress', progress: 1, at: now }], now);
    expect(pickOutcomes(s)).toEqual([
      { date: '2026-11-24', filename: 'c.md', title: 'C', opened: false, finished: false },
      { date: '2026-11-23', filename: 'a.md', title: 'A', opened: true, finished: true },
    ]);
  });
});

describe('load and save', () => {
  test('round-trips through reading.json, and a corrupt file starts fresh', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pr-reading-'));
    const s = applyReadingEvents(empty(), [{ filename: 'a.md', type: 'open', at: now }], now);
    saveReading(s, dir);
    expect(loadReading(dir)).toEqual(s);
    writeFileSync(readingPath(dir), '{not json');
    expect(loadReading(dir)).toEqual(empty());
  });
});

describe('viewer/20-reading.js', () => {
  function loadViewerModule() {
    const src = readFileSync(join(__dirname, '..', 'viewer', '20-reading.js'), 'utf-8');
    const store: Record<string, string> = {};
    const posts: any[] = [];
    const env = {
      localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } },
      fetch: jest.fn(async (_url: string, init: any) => { posts.push(JSON.parse(init.body)); return { ok: true }; }),
      setTimeout: (_fn: () => void) => 0, clearTimeout: () => {},
      window: undefined, navigator: {},
    };
    const api = new Function(...Object.keys(env), `${src}; return { queueReadingEvent, flushReadingEvents, syncReadingBackfill, get queue() { return _readingQueue; } };`)(...Object.values(env));
    return { api, store, posts };
  }

  test('progress is only reported in 10-point steps or when crossing 90%', async () => {
    const { api, posts } = loadViewerModule();
    for (const p of [0.05, 0.12, 0.15, 0.31, 0.35, 0.86, 0.91, 0.95]) api.queueReadingEvent({ filename: 'a.md', type: 'progress', progress: p, at: 1 });
    await api.flushReadingEvents();
    expect(posts[0].events.map((e: any) => e.progress)).toEqual([0.12, 0.31, 0.86, 0.91]);
  });

  test('backfills the existing read list and scroll positions once', async () => {
    const { api, store, posts } = loadViewerModule();
    store['pr-read-articles'] = JSON.stringify(['a.md', 'b.md']);
    store['pr-scroll-positions'] = JSON.stringify({ 'b.md': { pct: 0.97, ts: 1700000000000 } });
    expect(await api.syncReadingBackfill()).toBe(true);
    expect(posts[0].events).toEqual([
      { filename: 'a.md', type: 'backfill' }, { filename: 'b.md', type: 'backfill' },
      { filename: 'b.md', type: 'progress', progress: 0.97, at: 1700000000000 },
    ]);
    expect(await api.syncReadingBackfill()).toBe(false); // already done
    expect(posts).toHaveLength(1);
  });
});
