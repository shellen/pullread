// ABOUTME: Tests for email collection worker endpoints.
// ABOUTME: Covers subscribe, unsubscribe, export, CORS, and input validation.

import { env, SELF } from 'cloudflare:test';
import { describe, test, expect, beforeEach } from 'vitest';

const SCHEMA =
  "CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('download', 'newsletter')), platform TEXT CHECK(platform IN ('apple_silicon', 'intel')), created_at TEXT NOT NULL DEFAULT (datetime('now')), unsubscribed_at TEXT, UNIQUE(email, source));";

async function hmacToken(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode('test-secret-key'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(email));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

beforeEach(async () => {
  await env.DB.exec('DROP TABLE IF EXISTS subscribers');
  await env.DB.exec(SCHEMA);
});

// ── POST /api/subscribe ──────────────────────────────────

describe('POST /api/subscribe', () => {
  test('valid download returns 200 with download_url', async () => {
    const res = await SELF.fetch('https://fake.host/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', source: 'download' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; download_url: string };
    expect(body.ok).toBe(true);
    expect(body.download_url).toContain('PullRead.dmg');
  });

  test('valid newsletter returns 200, no download_url', async () => {
    const res = await SELF.fetch('https://fake.host/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', source: 'newsletter' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; download_url?: string };
    expect(body.ok).toBe(true);
    expect(body.download_url).toBeUndefined();
  });

  test('download with newsletter opt-in creates two D1 rows', async () => {
    // First request: download
    await SELF.fetch('https://fake.host/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'both@example.com', source: 'download' }),
    });
    // Second request: newsletter
    await SELF.fetch('https://fake.host/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'both@example.com', source: 'newsletter' }),
    });
    const { results } = await env.DB.prepare(
      'SELECT * FROM subscribers WHERE email = ?',
    )
      .bind('both@example.com')
      .all();
    expect(results.length).toBe(2);
    const sources = results.map((r: Record<string, unknown>) => r.source).sort();
    expect(sources).toEqual(['download', 'newsletter']);
  });

  test('invalid email returns 400', async () => {
    const res = await SELF.fetch('https://fake.host/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', source: 'download' }),
    });
    expect(res.status).toBe(400);
  });

  test('missing source returns 400', async () => {
    const res = await SELF.fetch('https://fake.host/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });
    expect(res.status).toBe(400);
  });

  test('duplicate email is idempotent (200)', async () => {
    const body = JSON.stringify({
      email: 'dup@example.com',
      source: 'download',
    });
    const headers = { 'Content-Type': 'application/json' };
    await SELF.fetch('https://fake.host/api/subscribe', {
      method: 'POST',
      headers,
      body,
    });
    const res = await SELF.fetch('https://fake.host/api/subscribe', {
      method: 'POST',
      headers,
      body,
    });
    expect(res.status).toBe(200);
  });

  test('intel platform returns Intel DMG URL', async () => {
    const res = await SELF.fetch('https://fake.host/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'intel@example.com',
        source: 'download',
        platform: 'intel',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { download_url: string };
    expect(body.download_url).toContain('PullRead_Intel.dmg');
  });

  test('CORS headers present on response', async () => {
    const res = await SELF.fetch('https://fake.host/api/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://pullread.com',
      },
      body: JSON.stringify({ email: 'cors@example.com', source: 'download' }),
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://pullread.com',
    );
  });

  test('GET /api/subscribe returns 405', async () => {
    const res = await SELF.fetch('https://fake.host/api/subscribe');
    expect(res.status).toBe(405);
  });
});

// ── OPTIONS preflight ────────────────────────────────────

describe('OPTIONS preflight', () => {
  test('returns 204 with CORS headers', async () => {
    const res = await SELF.fetch('https://fake.host/api/subscribe', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://pullread.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://pullread.com',
    );
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});

// ── GET /api/unsubscribe ─────────────────────────────────

describe('GET /api/unsubscribe', () => {
  test('valid token sets unsubscribed_at', async () => {
    // Seed a subscriber
    await env.DB.prepare(
      "INSERT INTO subscribers (email, source) VALUES (?, 'newsletter')",
    )
      .bind('unsub@example.com')
      .run();
    const token = await hmacToken('unsub@example.com');
    const res = await SELF.fetch(
      `https://fake.host/api/unsubscribe?email=unsub@example.com&token=${token}`,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Unsubscribed');

    const { results } = await env.DB.prepare(
      'SELECT unsubscribed_at FROM subscribers WHERE email = ?',
    )
      .bind('unsub@example.com')
      .all();
    expect(results[0].unsubscribed_at).toBeTruthy();
  });

  test('bad token returns 403', async () => {
    const res = await SELF.fetch(
      'https://fake.host/api/unsubscribe?email=unsub@example.com&token=badtoken',
    );
    expect(res.status).toBe(403);
  });
});

// ── GET /api/export ──────────────────────────────────────

describe('GET /api/export', () => {
  test('valid key returns CSV with correct columns', async () => {
    await env.DB.prepare(
      "INSERT INTO subscribers (email, source, platform) VALUES (?, 'download', 'apple_silicon')",
    )
      .bind('export@example.com')
      .run();
    const res = await SELF.fetch(
      'https://fake.host/api/export?key=test-admin-key',
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const csv = await res.text();
    expect(csv).toContain('email,source,platform,created_at');
    expect(csv).toContain('export@example.com');
  });

  test('bad key returns 403', async () => {
    const res = await SELF.fetch(
      'https://fake.host/api/export?key=wrong-key',
    );
    expect(res.status).toBe(403);
  });

  test('excludes unsubscribed emails', async () => {
    await env.DB.prepare(
      "INSERT INTO subscribers (email, source, unsubscribed_at) VALUES (?, 'newsletter', datetime('now'))",
    )
      .bind('gone@example.com')
      .run();
    await env.DB.prepare(
      "INSERT INTO subscribers (email, source) VALUES (?, 'newsletter')",
    )
      .bind('active@example.com')
      .run();
    const res = await SELF.fetch(
      'https://fake.host/api/export?key=test-admin-key',
    );
    const csv = await res.text();
    expect(csv).not.toContain('gone@example.com');
    expect(csv).toContain('active@example.com');
  });
});
