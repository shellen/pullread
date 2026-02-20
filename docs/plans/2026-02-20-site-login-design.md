# Site Login Design

In-app login flow for authenticated content extraction from paywalled and login-gated sites.

## Problem

PullRead extracts articles via server-side fetch, which fails on paywalled sites (NYT, Medium) and login-gated sites (X.com). The existing Chrome cookie reading (`cookies.ts`) works but silently snoops the user's browser cookies — not transparent, requires Keychain permission prompts, and doesn't work when the user hasn't logged into a site in Chrome.

## Solution

Add an explicit "Log in to site" flow via Tauri webview. Users open a real browser window to a site's login page, log in normally (with Keychain autofill, 2FA, CAPTCHAs), and PullRead captures the session cookies. Cookies are stored in macOS Keychain and attached to fetch requests during sync.

## Architecture

### Components

1. **Tauri login commands** (`commands.rs` / new `auth.rs`) — Open login webview, capture cookies on close, read/write Keychain
2. **Keychain storage** — One entry per domain under service `PullRead`, account = domain name, data = JSON cookie array
3. **Cookie reader** (`cookies.ts`) — New `getSiteLoginCookies(domain)` reads from Keychain via `security` CLI
4. **Settings UI** (`03-settings.js`) — "Site Logins" section with add/remove, hidden in browser mode
5. **Viewer API** (`viewer.ts`) — `GET/DELETE /api/site-logins` for the Settings UI

### Cookie Priority Chain

```
1. Site login cookies (Keychain)    — explicit user logins
2. Chrome browser cookies (existing) — ambient browser sessions
3. No cookies                        — unauthenticated fetch
```

### Data Flow

```
User clicks "Log in" in Settings
  → Tauri opens new webview window to https://{domain}
  → User logs in normally
  → User closes window
  → Tauri reads cookies from webview cookie store
  → Filters to target domain
  → Serializes as JSON, writes to macOS Keychain
  → Next sync: cookies.ts reads Keychain → attaches to fetch headers
```

## Login Flow

- User goes to Settings > Site Logins > "Add site login"
- Enters domain (e.g. `nytimes.com`)
- Tauri opens a ~900x700 window titled "Log in to {domain}"
- Window navigates to `https://{domain}`
- User logs in, then closes the window
- On close: Tauri reads cookies, writes to Keychain
- No automatic login detection — user decides when they're done

## Cookie Expiry

- Session cookies expire naturally
- When extraction gets 401/403 for a domain with site login cookies, surface a toast: "Your {domain} session expired. Log in again in Settings."
- No automatic refresh — user re-logs in when needed

## Settings UI

```
Site Logins
─────────────────────────────────
Log in to sites for paywalled or authenticated content.

  x.com            [Log out]
  medium.com       [Log out]

  [+ Add site login]
```

- "Add site login" opens a text input for the domain, then triggers Tauri login command
- "Log out" deletes the Keychain entry
- Hidden in browser mode (no `window.__TAURI__`)

## Keychain Format

- **Service**: `PullRead`
- **Account**: domain (e.g. `x.com`, `medium.com`)
- **Data**: JSON array of `{name, value, domain, path, expires, secure, httpOnly}`

## Tauri Commands

| Command | Purpose |
|---------|---------|
| `open_site_login(domain)` | Open login webview, return cookies on close |
| `list_site_logins()` | Query Keychain for all PullRead entries |
| `remove_site_login(domain)` | Delete Keychain entry |

## Viewer API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/site-logins` | List logged-in domains |
| `DELETE /api/site-logins/:domain` | Remove a site login |

## Coexistence with Chrome Cookies

The existing `useBrowserCookies` setting and `cookies.ts` Chrome/Arc/Brave/Edge cookie reading remain unchanged. Site login cookies take priority — if both exist for a domain, the explicit site login wins.

In browser mode (not Tauri webview), the Site Logins section is hidden and Chrome cookies are the only option.

## Future: X.com DOM Walking

X.com is a React SPA that returns an empty shell to fetch requests even with cookies. A future follow-up would add hidden webview DOM extraction: load the X.com URL in an offscreen webview with site login cookies, wait for React hydration, query `[data-testid="tweetText"]` etc. This design provides the cookie infrastructure that feature will build on.

## Scope

- General site login infrastructure (any site)
- Cookie-authenticated fetch only (no JS rendering)
- macOS only (Keychain storage)
- X.com DOM walking is a follow-up
