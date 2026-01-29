// ABOUTME: SQLite storage for tracking processed URLs
// ABOUTME: Persists sync state to avoid re-processing articles

import Database from 'better-sqlite3';

export interface ProcessedEntry {
  url: string;
  title: string;
  bookmarkedAt: string;
  outputFile: string;
}

export class Storage {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processed (
        url TEXT PRIMARY KEY,
        title TEXT,
        bookmarked_at TEXT,
        processed_at TEXT,
        status TEXT DEFAULT 'success',
        error TEXT,
        output_file TEXT
      )
    `);
  }

  isProcessed(url: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM processed WHERE url = ?').get(url);
    return row !== undefined;
  }

  markProcessed(entry: ProcessedEntry): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO processed (url, title, bookmarked_at, processed_at, status, output_file)
      VALUES (?, ?, ?, datetime('now'), 'success', ?)
    `).run(entry.url, entry.title, entry.bookmarkedAt, entry.outputFile);
  }

  markFailed(url: string, error: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO processed (url, processed_at, status, error)
      VALUES (?, datetime('now'), 'failed', ?)
    `).run(url, error);
  }

  getFailedUrls(): string[] {
    const rows = this.db.prepare("SELECT url FROM processed WHERE status = 'failed'").all() as { url: string }[];
    return rows.map(r => r.url);
  }

  clearFailed(url: string): void {
    this.db.prepare("DELETE FROM processed WHERE url = ? AND status = 'failed'").run(url);
  }

  close(): void {
    this.db.close();
  }
}
