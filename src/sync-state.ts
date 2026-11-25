// ABOUTME: Records when the last sync finished, and judges when the library looks stale
// ABOUTME: Written by the sync CLI; read by the viewer, the Rundown email, and the Tauri tray

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

export const SYNC_STATE_PATH = join(homedir(), '.config', 'pullread', 'sync-state.json');

const DAY_MS = 86_400_000;

export interface SyncState {
  lastSuccessAt?: string;
  lastSummary?: string;
  lastErrorAt?: string;
  lastError?: string;
}

export function readSyncState(path = SYNC_STATE_PATH): SyncState {
  try {
    if (!existsSync(path)) return {};
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSyncState(update: SyncState, path: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ ...readSyncState(path), ...update }, null, 2));
  } catch {}
}

export function recordSyncSuccess(summary: string, path = SYNC_STATE_PATH, now = new Date()): void {
  writeSyncState({ lastSuccessAt: now.toISOString(), lastSummary: summary }, path);
}

export function recordSyncFailure(error: string, path = SYNC_STATE_PATH, now = new Date()): void {
  writeSyncState({ lastErrorAt: now.toISOString(), lastError: error.slice(0, 500) }, path);
}

/** Newest ISO timestamp in a list, ignoring blanks and unparseable values. */
export function newestTimestamp(values: Array<string | undefined | null>): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const v of values) {
    if (!v) continue;
    const ms = new Date(v).getTime();
    if (!isNaN(ms) && ms > bestMs) { bestMs = ms; best = v; }
  }
  return best;
}

/** Whole days between `iso` and `now` (0 when under a day, null when unknown). */
export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return null;
  return Math.max(0, Math.floor((now - ms) / DAY_MS));
}

/** "today", "yesterday", "N days ago". */
export function formatDaysAgo(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * For the Rundown: a short warning when the newest article in the library is
 * older than `thresholdDays`, which means syncing has probably stopped. Returns
 * null when the library looks fresh or there's nothing to judge by.
 */
export function libraryStaleNotice(
  newestArticleAt: string | null | undefined,
  lastSyncAt: string | null | undefined,
  now = Date.now(),
  thresholdDays = 2,
): string | null {
  const age = daysSince(newestArticleAt, now);
  if (age === null || age < thresholdDays) return null;
  const newest = new Date(newestArticleAt as string).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  let msg = `Heads up: the newest article in your library was saved ${formatDaysAgo(age)} (${newest}), so Pull Read may have stopped syncing.`;
  const syncAge = daysSince(lastSyncAt, now);
  if (syncAge !== null) msg += ` The last successful sync was ${formatDaysAgo(syncAge)}.`;
  msg += ' Open Pull Read and choose Sync Now, or restart the app.';
  return msg;
}
