# Email Collection Worker

Cloudflare Worker + D1 backend for download gate and newsletter signups on pullread.com.

## How It Works

Download buttons on pullread.com are gated by `site/download-gate.js`. When a user clicks a download button, a modal collects their email before delivering the DMG link. An optional checkbox lets users also opt into the newsletter (unchecked by default, per CAN-SPAM).

A separate newsletter form on the homepage submits independently.

All emails are stored in a Cloudflare D1 (SQLite) database called `pullread-emails`.

## Endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/subscribe` | POST | CORS (pullread.com only) | Collect email for download or newsletter |
| `/api/unsubscribe` | GET | HMAC token | One-click unsubscribe link |
| `/api/export` | GET | Admin key | CSV export of active subscribers |

## Exporting Emails

**Via API:**

```bash
curl "https://pullread-emails.<your-subdomain>.workers.dev/api/export?key=YOUR_ADMIN_KEY"
```

Returns CSV with columns: `email, source, platform, created_at`. Excludes unsubscribed users. Import directly into Buttondown, Mailchimp, Kit, etc.

**Via CLI:**

```bash
npx wrangler d1 execute pullread-emails --remote \
  --command "SELECT email, source, platform, created_at FROM subscribers WHERE unsubscribed_at IS NULL"
```

## Secrets

Set via `wrangler secret put`:

| Secret | Purpose |
|---|---|
| `ADMIN_KEY` | Authenticates the `/api/export` endpoint |
| `HMAC_SECRET` | Signs unsubscribe tokens (HMAC-SHA256 of email) |

## Development

```bash
cd worker
npm install
npm test          # Vitest with Cloudflare Workers pool
npx wrangler dev  # Local dev server
```

## Schema

The D1 database has one table (`subscribers`) defined in `src/schema.sql`. To apply it to production:

```bash
npx wrangler d1 execute pullread-emails --file=src/schema.sql --remote
```
