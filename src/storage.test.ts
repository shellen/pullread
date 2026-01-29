// ABOUTME: Tests for SQLite storage operations
// ABOUTME: Verifies URL tracking and status management

import { Storage } from './storage';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = '/tmp/pullread-test.db';

function cleanup() {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
}

describe('Storage', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  test('creates database and table on init', () => {
    const storage = new Storage(TEST_DB);
    expect(existsSync(TEST_DB)).toBe(true);
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
});
