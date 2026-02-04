// ABOUTME: JSON file storage for tracking processed URLs
// ABOUTME: Persists sync state to avoid re-processing articles

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

export interface ProcessedEntry {
  url: string;
  title: string;
  bookmarkedAt: string;
  outputFile: string;
}

interface StoredEntry {
  url: string;
  title?: string;
  bookmarkedAt?: string;
  processedAt: string;
  status: 'success' | 'failed';
  error?: string;
  outputFile?: string;
}

interface StorageData {
  entries: { [url: string]: StoredEntry };
}

export class Storage {
  private data: StorageData;
  private dbPath: string;

  constructor(dbPath: string) {
    // Use .json extension instead of .db
    this.dbPath = dbPath.replace(/\.db$/, '.json');
    this.data = this.load();
  }

  private load(): StorageData {
    if (existsSync(this.dbPath)) {
      try {
        const content = readFileSync(this.dbPath, 'utf-8');
        return JSON.parse(content);
      } catch {
        return { entries: {} };
      }
    }
    return { entries: {} };
  }

  private save(): void {
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
  }

  isProcessed(url: string): boolean {
    return url in this.data.entries;
  }

  markProcessed(entry: ProcessedEntry): void {
    this.data.entries[entry.url] = {
      url: entry.url,
      title: entry.title,
      bookmarkedAt: entry.bookmarkedAt,
      processedAt: new Date().toISOString(),
      status: 'success',
      outputFile: entry.outputFile
    };
    this.save();
  }

  markFailed(url: string, error: string): void {
    this.data.entries[url] = {
      url,
      processedAt: new Date().toISOString(),
      status: 'failed',
      error
    };
    this.save();
  }

  getFailedUrls(): string[] {
    return Object.values(this.data.entries)
      .filter(e => e.status === 'failed')
      .map(e => e.url);
  }

  clearFailed(url: string): void {
    if (this.data.entries[url]?.status === 'failed') {
      delete this.data.entries[url];
      this.save();
    }
  }

  close(): void {
    // No-op for JSON storage, but kept for API compatibility
  }
}
