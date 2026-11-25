// ABOUTME: Tests for sync-state recording and stale-library detection
// ABOUTME: Covers reading/writing sync-state.json, day math, and the Rundown warning text

import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readSyncState, recordSyncSuccess, recordSyncFailure,
  newestTimestamp, daysSince, formatDaysAgo, libraryStaleNotice,
} from './sync-state';

const NOW = new Date('2026-11-25T12:00:00Z').getTime();
const daysBefore = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe('sync-state file', () => {
  let dir: string;
  let path: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pullread-syncstate-'));
    path = join(dir, 'nested', 'sync-state.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('missing file reads as empty', () => {
    expect(readSyncState(path)).toEqual({});
  });

  test('corrupt file reads as empty', () => {
    recordSyncSuccess('Done: 1 saved, 0 failed', path);
    writeFileSync(path, '{not json');
    expect(readSyncState(path)).toEqual({});
  });

  test('records success and failure without clobbering each other', () => {
    recordSyncSuccess('Done: 3 saved, 1 failed', path, new Date('2026-11-20T08:00:00Z'));
    recordSyncFailure('boom', path, new Date('2026-11-21T08:00:00Z'));
    const state = readSyncState(path);
    expect(state.lastSuccessAt).toBe('2026-11-20T08:00:00.000Z');
    expect(state.lastSummary).toBe('Done: 3 saved, 1 failed');
    expect(state.lastErrorAt).toBe('2026-11-21T08:00:00.000Z');
    expect(state.lastError).toBe('boom');
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual(state);
  });
});

describe('date helpers', () => {
  test('newestTimestamp ignores blanks and junk', () => {
    expect(newestTimestamp([])).toBeNull();
    expect(newestTimestamp(['', undefined, null, 'not a date'])).toBeNull();
    expect(newestTimestamp(['2026-10-01T00:00:00Z', '2026-10-22T09:00:00Z', '2026-10-05'])).toBe('2026-10-22T09:00:00Z');
  });

  test('daysSince rounds down and handles unknowns', () => {
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince('garbage', NOW)).toBeNull();
    expect(daysSince(daysBefore(0.5), NOW)).toBe(0);
    expect(daysSince(daysBefore(1.5), NOW)).toBe(1);
    expect(daysSince(daysBefore(34), NOW)).toBe(34);
    expect(daysSince(daysBefore(-2), NOW)).toBe(0); // future dates don't go negative
  });

  test('formatDaysAgo', () => {
    expect(formatDaysAgo(0)).toBe('today');
    expect(formatDaysAgo(1)).toBe('yesterday');
    expect(formatDaysAgo(34)).toBe('34 days ago');
  });
});

describe('libraryStaleNotice', () => {
  test('quiet when the library is fresh', () => {
    expect(libraryStaleNotice(daysBefore(0.2), daysBefore(0.1), NOW)).toBeNull();
    expect(libraryStaleNotice(daysBefore(1.9), null, NOW)).toBeNull();
  });

  test('quiet when there is nothing to judge by', () => {
    expect(libraryStaleNotice(null, daysBefore(40), NOW)).toBeNull();
  });

  test('warns when the newest article is over 2 days old', () => {
    // The month-long stall: newest article Oct 22, checked Nov 25.
    const msg = libraryStaleNotice('2026-10-22T15:00:00Z', '2026-10-22T16:00:00Z', NOW);
    expect(msg).toContain('33 days ago');
    expect(msg).toContain('October 22');
    expect(msg).toContain('stopped syncing');
    expect(msg).toContain('last successful sync was 33 days ago');
  });

  test('leaves out the sync age when unknown', () => {
    const msg = libraryStaleNotice(daysBefore(3), null, NOW);
    expect(msg).toContain('3 days ago');
    expect(msg).not.toContain('last successful sync');
  });
});
