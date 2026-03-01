// ABOUTME: Email collection API for download gate and newsletter signups.
// ABOUTME: Handles subscribe, unsubscribe, and CSV export via Cloudflare D1.

export interface Env {
  DB: D1Database;
  HMAC_SECRET: string;
  ADMIN_KEY: string;
}

const ALLOWED_ORIGIN = 'https://pullread.com';
const DMG_URL =
  'https://github.com/shellen/pullread/releases/download/latest/PullRead.dmg';
const INTEL_DMG_URL =
  'https://github.com/shellen/pullread/releases/download/latest/PullRead_Intel.dmg';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function handleSubscribe(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders(),
    });
  }

  let body: { email?: string; source?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { email, source, platform } = body;

  if (!email || !isValidEmail(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  if (!source || !['download', 'newsletter'].includes(source)) {
    return new Response(JSON.stringify({ error: 'Invalid source' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  await env.DB.prepare(
    'INSERT OR IGNORE INTO subscribers (email, source, platform) VALUES (?, ?, ?)',
  )
    .bind(email, source, platform ?? null)
    .run();

  const result: { ok: boolean; download_url?: string } = { ok: true };
  if (source === 'download') {
    result.download_url = platform === 'intel' ? INTEL_DMG_URL : DMG_URL;
  }

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

async function handleUnsubscribe(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  const token = url.searchParams.get('token');

  if (!email || !token) {
    return new Response('Missing parameters', { status: 400 });
  }

  const expected = await hmacHex(env.HMAC_SECRET, email);
  if (token !== expected) {
    return new Response('Invalid token', { status: 403 });
  }

  await env.DB.prepare(
    "UPDATE subscribers SET unsubscribed_at = datetime('now') WHERE email = ? AND unsubscribed_at IS NULL",
  )
    .bind(email)
    .run();

  return new Response(
    '<html><body><h1>Unsubscribed</h1><p>You have been unsubscribed.</p></body></html>',
    { headers: { 'Content-Type': 'text/html' } },
  );
}

async function handleExport(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  if (key !== env.ADMIN_KEY) {
    return new Response('Forbidden', { status: 403 });
  }

  const { results } = await env.DB.prepare(
    'SELECT email, source, platform, created_at FROM subscribers WHERE unsubscribed_at IS NULL ORDER BY created_at DESC',
  ).all();

  let csv = 'email,source,platform,created_at\n';
  for (const row of results) {
    csv += `${row.email},${row.source},${row.platform ?? ''},${row.created_at}\n`;
  }

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="subscribers.csv"',
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === '/api/subscribe') {
      return handleSubscribe(request, env);
    }

    if (url.pathname === '/api/unsubscribe') {
      return handleUnsubscribe(request, env);
    }

    if (url.pathname === '/api/export') {
      return handleExport(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
