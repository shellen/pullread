// ABOUTME: Local reading history (opened, progress, finished) reported by the viewer, plus Today's one read picks
// ABOUTME: Stored at ~/.config/pullread/reading.json so the sidecar can learn from what the reader actually reads

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

/*
 * Before this, read state lived only in the viewer's localStorage, so the
 * Rundown couldn't skip what you'd read or learn from it. Everything here
 * stays on the Mac.
 */

export interface ReadingRecord {
  /** First time the article was opened (ISO). Missing for backfilled history. */
  opened?: string;
  /** When reading progress first reached FINISHED_AT. */
  finished?: string;
  /** Furthest scroll progress seen, 0–1. */
  progress?: number;
  /** Most recent activity (ISO). */
  lastSeen?: string;
}

export interface PickRecord {
  /** Day of the Rundown, YYYY-MM-DD. */
  date: string;
  filename: string;
  title: string;
}

export interface ReadingState {
  articles: Record<string, ReadingRecord>;
  /** Today's one read picks, newest last. */
  picks: PickRecord[];
}

export interface ReadingEvent {
  filename: string;
  /** open: the article was opened. progress: scroll progress grew. backfill: read at some unknown time. */
  type: 'open' | 'progress' | 'backfill';
  /** Epoch ms or ISO; defaults to now. */
  at?: number | string;
  progress?: number;
}

/** Scroll progress that counts as finished. */
export const FINISHED_AT = 0.9;
const MAX_ARTICLES = 20_000;
const MAX_PICKS = 60;
const MAX_EVENTS_PER_REQUEST = 6_000;

export function readingPath(configDir = join(homedir(), '.config', 'pullread')): string {
  return join(configDir, 'reading.json');
}

export function loadReading(configDir?: string): ReadingState {
  const path = readingPath(configDir);
  try {
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      return { articles: data.articles && typeof data.articles === 'object' ? data.articles : {}, picks: Array.isArray(data.picks) ? data.picks : [] };
    }
  } catch {
    // A corrupt file starts fresh rather than breaking the viewer.
  }
  return { articles: {}, picks: [] };
}

/** Write atomically (temp file + rename) so a crash mid-write can't corrupt the history. */
export function saveReading(state: ReadingState, configDir?: string): void {
  const path = readingPath(configDir);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, path);
}

function validFilename(f: unknown): f is string {
  return typeof f === 'string' && f.length > 0 && f.length <= 300 && !f.includes('..') && /\.(md|epub)$/i.test(f);
}

function toIso(at: number | string | undefined, now: number): string {
  const t = typeof at === 'number' ? at : typeof at === 'string' ? Date.parse(at) : NaN;
  // Clamp to a sane range: not in the future, not before 2000.
  return new Date(Number.isFinite(t) && t > 946_684_800_000 && t <= now + 60_000 ? t : now).toISOString();
}

/** Apply viewer events to the state (pure: returns a new state). Invalid events are ignored. */
export function applyReadingEvents(state: ReadingState, events: unknown[], now = Date.now()): ReadingState {
  const articles = { ...state.articles };
  for (const raw of events.slice(0, MAX_EVENTS_PER_REQUEST)) {
    const ev = raw as ReadingEvent;
    if (!ev || !validFilename(ev.filename)) continue;
    const rec: ReadingRecord = { ...(articles[ev.filename] || {}) };
    if (ev.type === 'backfill') {
      articles[ev.filename] = rec; // known read, date unknown; never overwrites real dates
      continue;
    }
    const at = toIso(ev.at, now);
    if (ev.type === 'open') {
      if (!rec.opened || at < rec.opened) rec.opened = at;
    } else if (ev.type === 'progress') {
      const p = Number(ev.progress);
      if (!Number.isFinite(p)) continue;
      const clamped = Math.max(0, Math.min(1, p));
      rec.progress = Math.max(rec.progress || 0, clamped);
      if (clamped >= FINISHED_AT && !rec.finished) rec.finished = at;
      if (!rec.opened) rec.opened = at;
    } else {
      continue;
    }
    if (!rec.lastSeen || at > rec.lastSeen) rec.lastSeen = at;
    articles[ev.filename] = rec;
  }
  return { ...state, articles: prune(articles) };
}

/** Keep the newest MAX_ARTICLES records (undated backfill goes first). */
function prune(articles: Record<string, ReadingRecord>): Record<string, ReadingRecord> {
  const keys = Object.keys(articles);
  if (keys.length <= MAX_ARTICLES) return articles;
  const keep = keys.sort((a, b) => (articles[b].lastSeen || '').localeCompare(articles[a].lastSeen || '')).slice(0, MAX_ARTICLES);
  return Object.fromEntries(keep.map(k => [k, articles[k]]));
}

/** Record a Today's one read pick (one per day; a re-run replaces that day's pick). */
export function recordPick(state: ReadingState, pick: PickRecord): ReadingState {
  const picks = state.picks.filter(p => p.date !== pick.date).concat(pick).slice(-MAX_PICKS);
  return { ...state, picks };
}

export interface PickOutcome extends PickRecord {
  opened: boolean;
  finished: boolean;
}

/** Recent picks and whether the reader opened or finished them. */
/** Filenames picked as Today's one read in the last `days` days. */
export function recentPicks(state: ReadingState, now: Date = new Date(), days = 7): Set<string> {
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  return new Set(state.picks.filter(p => p.date >= cutoff).map(p => p.filename));
}

export function pickOutcomes(state: ReadingState, n = 7): PickOutcome[] {
  return state.picks.slice(-n).reverse().map(p => {
    const rec = state.articles[p.filename];
    return { ...p, opened: !!rec, finished: !!rec?.finished };
  });
}
