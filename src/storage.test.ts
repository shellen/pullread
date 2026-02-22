// ABOUTME: Tests for SQLite storage operations
// ABOUTME: Verifies URL tracking and status management

import { Storage } from './storage';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmdirSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DB = '/tmp/pullread-test.db';
const TEST_OUTPUT = '/tmp/pullread-test-output';

function cleanup() {
  // Clean up .json version (Storage converts .db to .json)
  const jsonPath = TEST_DB.replace(/\.db$/, '.json');
  if (existsSync(jsonPath)) unlinkSync(jsonPath);
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  // Clean up test output dir
  try { rmSync(TEST_OUTPUT, { recursive: true, force: true }); } catch {}
}

describe('Storage', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  test('creates storage file on first write', () => {
    const jsonPath = TEST_DB.replace(/\.db$/, '.json');
    const storage = new Storage(TEST_DB);
    // File is created lazily on first write, not on init
    storage.markProcessed({
      url: 'https://example.com/init-test',
      title: 'Init Test',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      outputFile: 'init-test.md'
    });
    expect(existsSync(jsonPath)).toBe(true);
    storage.close();
  });

  test('isProcessed returns false for new URL', () => {
    const storage = new Storage(TEST_DB);
    expect(storage.isProcessed('https://example.com/article')).toBe(false);
    storage.close();
  });

  test('markProcessed records URL as successful', () => {
    const storage = new Storage(TEST_DB);
    storage.markProcessed({
      url: 'https://example.com/article',
      title: 'Test Article',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      outputFile: '2024-01-29-test-article.md'
    });
    expect(storage.isProcessed('https://example.com/article')).toBe(true);
    storage.close();
  });

  test('markFailed records URL with error', () => {
    const storage = new Storage(TEST_DB);
    storage.markFailed('https://example.com/broken', 'Timeout');
    expect(storage.isProcessed('https://example.com/broken')).toBe(true);
    storage.close();
  });

  test('getFailedUrls returns only failed entries', () => {
    const storage = new Storage(TEST_DB);
    storage.markProcessed({
      url: 'https://example.com/good',
      title: 'Good',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      outputFile: 'good.md'
    });
    storage.markFailed('https://example.com/bad', 'Error');

    const failed = storage.getFailedUrls();
    expect(failed).toHaveLength(1);
    expect(failed[0]).toBe('https://example.com/bad');
    storage.close();
  });

  test('clearFailed removes failed status for retry', () => {
    const storage = new Storage(TEST_DB);
    storage.markFailed('https://example.com/retry', 'Error');
    storage.clearFailed('https://example.com/retry');
    expect(storage.isProcessed('https://example.com/retry')).toBe(false);
    storage.close();
  });

  test('isProcessed returns false when output file is deleted (resync recovery)', () => {
    mkdirSync(TEST_OUTPUT, { recursive: true });
    const outputFile = '2024-01-29-test-article.md';
    writeFileSync(join(TEST_OUTPUT, outputFile), '# Test');

    const storage = new Storage(TEST_DB, TEST_OUTPUT);
    storage.markProcessed({
      url: 'https://example.com/article',
      title: 'Test Article',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      outputFile
    });

    // File exists — should be processed
    expect(storage.isProcessed('https://example.com/article')).toBe(true);

    // Delete the output file
    unlinkSync(join(TEST_OUTPUT, outputFile));

    // File gone — should no longer be considered processed
    expect(storage.isProcessed('https://example.com/article')).toBe(false);
    storage.close();
  });

  test('isProcessed finds file in dated subfolder', () => {
    mkdirSync(TEST_OUTPUT, { recursive: true });
    const outputFile = '2024-01-29-test-article.md';
    // File is in dated subfolder, not root
    const subdir = join(TEST_OUTPUT, '2024', '01');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, outputFile), '# Test');

    const storage = new Storage(TEST_DB, TEST_OUTPUT);
    storage.markProcessed({
      url: 'https://example.com/dated-article',
      title: 'Test Article',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      outputFile
    });

    // File exists in dated subfolder — should be processed
    expect(storage.isProcessed('https://example.com/dated-article')).toBe(true);
    storage.close();
  });

  test('isProcessed still returns true for entries without outputPath set', () => {
    const storage = new Storage(TEST_DB);
    storage.markProcessed({
      url: 'https://example.com/article',
      title: 'Test Article',
      bookmarkedAt: '2024-01-29T12:00:00Z',
      outputFile: '2024-01-29-test-article.md'
    });
    // No outputPath — skip file check, return true
    expect(storage.isProcessed('https://example.com/article')).toBe(true);
    storage.close();
  });
});
