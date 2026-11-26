// ABOUTME: HTTP-level security tests for the local viewer server
// ABOUTME: Covers SMTP password redaction, blank-password merge, and cross-origin rejection

import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { request } from 'http';
import type { Server, AddressInfo } from 'net';

jest.mock('./extractor', () => ({ fetchAndExtract: jest.fn() }));
// tts.ts starts a module-level interval and the viewer watches the output
// folder; stub both so Jest can exit.
jest.mock('./tts', () => ({}));
jest.mock('fs', () => ({ ...jest.requireActual('fs'), watch: jest.fn() }));
// viewer.ts and writer.ts resolve ~/.config/pullread from os.homedir() at
// import time. Jest's sandboxed process.env doesn't reach Node's os module,
// so mock homedir itself to keep the real config dir untouched.
jest.mock('os', () => {
  const actual = jest.requireActual('os');
  const dir = jest.requireActual('fs').mkdtempSync(jest.requireActual('path').join(actual.tmpdir(), 'pr-viewer-sec-'));
  return { ...actual, homedir: () => dir };
});

const home = homedir();
const configDir = join(home, '.config', 'pullread');
const settingsPath = join(configDir, 'settings.json');
const outDir = join(home, 'articles');
mkdirSync(configDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

import * as viewer from './viewer';

const SECRET = 'super-secret-app-password';
let server: Server;
let port: number;

function call(method: string, path: string, opts: { origin?: string; body?: unknown } = {}): Promise<{ status: number; headers: Record<string, unknown>; text: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (opts.origin) headers.Origin = opts.origin;
    let payload: string | undefined;
    if (opts.body !== undefined) {
      payload = JSON.stringify(opts.body);
      headers['Content-Type'] = 'application/json';
    }
    const req = request({ host: '127.0.0.1', port, method, path, headers }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, text: Buffer.concat(chunks).toString('utf-8') }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function writeSettings() {
  writeFileSync(settingsPath, JSON.stringify({
    emailRoundup: { enabled: true, smtpProvider: 'gmail', smtpUser: 'me@example.com', smtpPass: SECRET, toAddress: 'me@example.com' },
  }));
}

beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  server = viewer.startViewer(outDir, 0, false) as unknown as Server;
  await new Promise<void>(r => (server.listening ? r() : server.once('listening', () => r())));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()));
  rmSync(home, { recursive: true, force: true });
});

beforeEach(writeSettings);

describe('isSameOrigin', () => {
  test('allows missing origin and the viewer origins only', () => {
    expect(viewer.isSameOrigin(undefined, 7777)).toBe(true);
    expect(viewer.isSameOrigin('http://localhost:7777', 7777)).toBe(true);
    expect(viewer.isSameOrigin('http://127.0.0.1:7777', 7777)).toBe(true);
    expect(viewer.isSameOrigin('http://localhost:8888', 7777)).toBe(false);
    expect(viewer.isSameOrigin('https://evil.example', 7777)).toBe(false);
    expect(viewer.isSameOrigin('null', 7777)).toBe(false);
  });
});

describe('GET /api/email-settings', () => {
  test('never contains the SMTP password', async () => {
    const res = await call('GET', '/api/email-settings', { origin: `http://localhost:${port}` });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(SECRET);
    const data = JSON.parse(res.text);
    expect(data).not.toHaveProperty('smtpPass');
    expect(data.smtpPassSet).toBe(true);
    expect(data.smtpUser).toBe('me@example.com');
  });

  test('reports smtpPassSet false when no password is saved', async () => {
    writeFileSync(settingsPath, JSON.stringify({}));
    const data = JSON.parse((await call('GET', '/api/email-settings')).text);
    expect(data).not.toHaveProperty('smtpPass');
    expect(data.smtpPassSet).toBe(false);
  });
});

describe('POST /api/email-settings', () => {
  test('blank password keeps the saved one', async () => {
    const res = await call('POST', '/api/email-settings', {
      origin: `http://localhost:${port}`,
      body: { smtpUser: 'new@example.com', smtpPass: '' },
    });
    expect(res.status).toBe(200);
    const saved = JSON.parse(readFileSync(settingsPath, 'utf-8')).emailRoundup;
    expect(saved.smtpPass).toBe(SECRET);
    expect(saved.smtpUser).toBe('new@example.com');
  });

  test('omitted password keeps the saved one', async () => {
    await call('POST', '/api/email-settings', { body: { frequency: 'twice' } });
    const saved = JSON.parse(readFileSync(settingsPath, 'utf-8')).emailRoundup;
    expect(saved.smtpPass).toBe(SECRET);
    expect(saved.frequency).toBe('twice');
  });

  test('non-empty password replaces the saved one', async () => {
    await call('POST', '/api/email-settings', { body: { smtpPass: 'rotated' } });
    const saved = JSON.parse(readFileSync(settingsPath, 'utf-8')).emailRoundup;
    expect(saved.smtpPass).toBe('rotated');
  });
});

describe('cross-origin requests', () => {
  const evil = 'https://evil.example';

  test.each([
    ['GET', '/api/email-settings'],
    ['POST', '/api/email-settings'],
    ['GET', '/api/settings'],
    ['GET', '/api/tts-settings'],
    ['GET', '/api/site-logins'],
    ['GET', '/api/config'],
    ['GET', '/api/backup'],
    ['POST', '/api/restore'],
    ['POST', '/api/email/test'],
    ['OPTIONS', '/api/email-settings'],
  ])('%s %s from another origin gets 403', async (method, path) => {
    const res = await call(method, path, { origin: evil, body: method === 'POST' ? { smtpPass: 'attacker' } : undefined });
    expect(res.status).toBe(403);
    expect(res.text).not.toContain(SECRET);
  });

  test('cross-origin POST does not change the saved password', async () => {
    await call('POST', '/api/email-settings', { origin: evil, body: { smtpPass: 'attacker' } });
    const saved = JSON.parse(readFileSync(settingsPath, 'utf-8')).emailRoundup;
    expect(saved.smtpPass).toBe(SECRET);
  });

  test('responses carry no wildcard CORS header', async () => {
    const res = await call('GET', '/api/files', { origin: `http://localhost:${port}` });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
