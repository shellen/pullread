# Site Login Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users log into sites via Tauri webview so PullRead can fetch paywalled/authenticated content with their session cookies.

**Architecture:** Tauri opens a login webview per domain, captures cookies on close, stores in macOS Keychain. At sync time, `cookies.ts` reads Keychain entries and attaches to fetch headers. Settings UI shows logged-in domains with add/remove.

**Tech Stack:** Rust (Tauri 2 commands, macOS `security` CLI), TypeScript (cookie reader, viewer API), vanilla JS (Settings UI)

**Design doc:** `docs/plans/2026-02-20-site-login-design.md`

---

### Task 1: Keychain read/write in cookies.ts

Add functions to read and write site login cookies to macOS Keychain. This is the foundation — everything else depends on it.

**Files:**
- Modify: `src/cookies.ts`
- Test: `src/cookies.test.ts` (create)

**Step 1: Write failing test for `saveSiteLoginCookies`**

Create `src/cookies.test.ts`:

```typescript
// ABOUTME: Tests for site login cookie storage via macOS Keychain
// ABOUTME: Uses mock security CLI to avoid actual Keychain access in tests

import { saveSiteLoginCookies, getSiteLoginCookies, removeSiteLogin, listSiteLogins } from './cookies';

// Mock execSync to avoid real Keychain access
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

import { execSync } from 'child_process';
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('Site login cookies', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  test('saveSiteLoginCookies writes JSON to Keychain', () => {
    mockExecSync.mockReturnValue(Buffer.from(''));
    const cookies = [
      { name: 'session', value: 'abc123', domain: '.medium.com', path: '/', expires: 0, secure: true, httpOnly: true }
    ];
    saveSiteLoginCookies('medium.com', cookies);
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('security add-generic-password'),
      expect.any(Object)
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('-s "PullRead"'),
      expect.any(Object)
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('-a "medium.com"'),
      expect.any(Object)
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/cookies.test.ts`
Expected: FAIL — `saveSiteLoginCookies` is not exported

**Step 3: Implement saveSiteLoginCookies, getSiteLoginCookies, removeSiteLogin, listSiteLogins**

Add to `src/cookies.ts`:

```typescript
export interface SiteLoginCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  secure: boolean;
  httpOnly: boolean;
}

const KEYCHAIN_SERVICE = 'PullRead';

/**
 * Saves site login cookies to macOS Keychain.
 * Overwrites any existing entry for the domain.
 */
export function saveSiteLoginCookies(domain: string, cookies: SiteLoginCookie[]): void {
  const json = JSON.stringify(cookies);
  // Delete existing entry first (ignore errors if it doesn't exist)
  try {
    execSync(
      `security delete-generic-password -s "${KEYCHAIN_SERVICE}" -a "${domain}"`,
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
  } catch {
    // Entry didn't exist — fine
  }
  // Add new entry with -U (update if exists) and -w for password data
  execSync(
    `security add-generic-password -s "${KEYCHAIN_SERVICE}" -a "${domain}" -w "${json.replace(/"/g, '\\"')}" -U`,
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

/**
 * Reads site login cookies from macOS Keychain for a domain.
 * Returns formatted cookie header string, or null if no login exists.
 */
export function getSiteLoginCookies(domain: string): string | null {
  try {
    const result = execSync(
      `security find-generic-password -w -s "${KEYCHAIN_SERVICE}" -a "${domain}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const cookies: SiteLoginCookie[] = JSON.parse(result.trim());
    // Filter expired cookies (expires=0 means session cookie — keep those)
    const now = Date.now();
    const valid = cookies.filter(c => c.expires === 0 || c.expires > now);
    if (valid.length === 0) return null;
    return valid.map(c => `${c.name}=${c.value}`).join('; ');
  } catch {
    return null;
  }
}

/**
 * Removes site login cookies from Keychain for a domain.
 */
export function removeSiteLogin(domain: string): boolean {
  try {
    execSync(
      `security delete-generic-password -s "${KEYCHAIN_SERVICE}" -a "${domain}"`,
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists all domains with saved site login cookies.
 */
export function listSiteLogins(): string[] {
  try {
    const result = execSync(
      `security dump-keychain | grep -A4 '"PullRead"'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const domains: string[] = [];
    const lines = result.split('\n');
    for (const line of lines) {
      const match = line.match(/"acct"<blob>="([^"]+)"/);
      if (match) domains.push(match[1]);
    }
    return [...new Set(domains)];
  } catch {
    return [];
  }
}
```

**Step 4: Add remaining tests**

Add to `src/cookies.test.ts`:

```typescript
  test('getSiteLoginCookies reads and formats cookie header', () => {
    const cookies = [
      { name: 'session', value: 'abc', domain: '.medium.com', path: '/', expires: 0, secure: true, httpOnly: true },
      { name: 'uid', value: '42', domain: '.medium.com', path: '/', expires: 0, secure: false, httpOnly: false }
    ];
    mockExecSync.mockReturnValue(JSON.stringify(cookies));
    const result = getSiteLoginCookies('medium.com');
    expect(result).toBe('session=abc; uid=42');
  });

  test('getSiteLoginCookies returns null when no entry exists', () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    expect(getSiteLoginCookies('unknown.com')).toBeNull();
  });

  test('getSiteLoginCookies filters expired cookies', () => {
    const cookies = [
      { name: 'session', value: 'abc', domain: '.x.com', path: '/', expires: 0, secure: true, httpOnly: true },
      { name: 'old', value: 'expired', domain: '.x.com', path: '/', expires: 1000, secure: false, httpOnly: false }
    ];
    mockExecSync.mockReturnValue(JSON.stringify(cookies));
    const result = getSiteLoginCookies('x.com');
    expect(result).toBe('session=abc');
  });

  test('removeSiteLogin calls security delete', () => {
    mockExecSync.mockReturnValue(Buffer.from(''));
    expect(removeSiteLogin('medium.com')).toBe(true);
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('delete-generic-password'),
      expect.any(Object)
    );
  });

  test('removeSiteLogin returns false when entry not found', () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    expect(removeSiteLogin('unknown.com')).toBe(false);
  });

  test('listSiteLogins parses security dump output', () => {
    mockExecSync.mockReturnValue(
      '    "svce"<blob>="PullRead"\n    "acct"<blob>="medium.com"\n' +
      '    "svce"<blob>="PullRead"\n    "acct"<blob>="x.com"\n'
    );
    expect(listSiteLogins()).toEqual(['medium.com', 'x.com']);
  });
```

**Step 5: Run all tests**

Run: `npx jest src/cookies.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/cookies.ts src/cookies.test.ts
git commit -m "Add site login cookie storage via macOS Keychain"
```

---

### Task 2: Wire site login cookies into extractor

Make the extractor prefer site login cookies over Chrome browser cookies.

**Files:**
- Modify: `src/extractor.ts:1320-1331`
- Modify: `src/cookies.ts` (import already there)

**Step 1: Write failing test**

Add to `src/extractor.test.ts` (or the relevant test file that covers extraction options):

The extractor already has cookie handling. This change is a small priority reorder — site login cookies checked first. The real test is integration: verify `getSiteLoginCookies` is called before `getCookiesForDomain`. Since the extractor tests use real fetch (not mocked), we test this at the cookies.ts level instead.

**Step 2: Modify extractor to check site login cookies first**

In `src/extractor.ts`, find the cookie attachment block (~line 1324):

```typescript
  // Current code:
  if (options.useBrowserCookies) {
    const domain = getDomainFromUrl(cleanUrl);
    const cookies = getCookiesForDomain(domain);
    if (cookies) {
      headers['Cookie'] = cookies;
    }
  }
```

Replace with:

```typescript
  // Site login cookies (explicit user logins) take priority
  const domain = getDomainFromUrl(cleanUrl);
  const siteLoginCookies = getSiteLoginCookies(domain);
  if (siteLoginCookies) {
    headers['Cookie'] = siteLoginCookies;
  } else if (options.useBrowserCookies) {
    const browserCookies = getCookiesForDomain(domain);
    if (browserCookies) {
      headers['Cookie'] = browserCookies;
    }
  }
```

Also add import at top of extractor.ts:
```typescript
import { getSiteLoginCookies } from './cookies';
```

Do the same for the other cookie attachment points in the extractor (search for `useBrowserCookies` — there are 3 occurrences at ~lines 994, 1230, 1324). Apply the same priority pattern to each.

**Step 3: Run tests**

Run: `npm test`
Expected: All pass (no behavior change for existing tests — getSiteLoginCookies returns null when no Keychain entries exist)

**Step 4: Commit**

```bash
git add src/extractor.ts
git commit -m "Prefer site login cookies over browser cookies in extractor"
```

---

### Task 3: Viewer API for site logins

Add API endpoints so the Settings UI can list and remove site logins.

**Files:**
- Modify: `src/viewer.ts`
- Test: `src/viewer.test.ts` (add cases)

**Step 1: Add API routes**

In `src/viewer.ts`, add a new route handler near the other API routes:

```typescript
    // Site login management API
    if (url.pathname === '/api/site-logins') {
      if (req.method === 'GET') {
        const { listSiteLogins } = await import('./cookies');
        sendJson(res, { domains: listSiteLogins() });
        return;
      }
      if (req.method === 'DELETE') {
        const body = JSON.parse(await readBody(req));
        const { removeSiteLogin } = await import('./cookies');
        const removed = removeSiteLogin(body.domain);
        sendJson(res, { ok: removed });
        return;
      }
    }
```

**Step 2: Run tests**

Run: `npm test`
Expected: All pass

**Step 3: Commit**

```bash
git add src/viewer.ts
git commit -m "Add site logins API endpoints"
```

---

### Task 4: Tauri login commands

Add Rust commands to open a login webview, capture cookies, and write to Keychain.

**Files:**
- Create: `src-tauri/src/auth.rs`
- Modify: `src-tauri/src/lib.rs` (add mod + command registration)
- Modify: `src-tauri/Cargo.toml` (add `security-framework` crate)

**Step 1: Add dependency**

In `src-tauri/Cargo.toml`, add:
```toml
security-framework = "3"
```

**Step 2: Create auth.rs**

Create `src-tauri/src/auth.rs`:

```rust
// ABOUTME: Site login authentication via Tauri webview
// ABOUTME: Opens login windows, captures cookies, stores in macOS Keychain

use std::process::Command;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const KEYCHAIN_SERVICE: &str = "PullRead";

/// Open a webview window for the user to log into a site.
/// Cookies are captured when the window is closed.
#[tauri::command]
pub async fn open_site_login(app: AppHandle, domain: String) -> Result<(), String> {
    let window_label = format!("login-{}", domain.replace('.', "-"));
    let url = format!("https://{}", domain);

    // Close existing login window for this domain if any
    if let Some(existing) = app.get_webview_window(&window_label) {
        let _ = existing.close();
    }

    let window = WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::External(url.parse().map_err(|e| format!("Invalid URL: {}", e))?),
    )
    .title(format!("Log in to {}", domain))
    .inner_size(900.0, 700.0)
    .min_inner_size(400.0, 300.0)
    .build()
    .map_err(|e| format!("Failed to create login window: {}", e))?;

    // When the window is closed, capture cookies
    let app_handle = app.clone();
    let domain_clone = domain.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            // The webview is gone — we need to read cookies before destroy.
            // Unfortunately Tauri 2 doesn't expose cookie store access on destroy.
            // We'll use a JS injection approach instead (see step 3 below).
            log::info!("Login window for {} closed", domain_clone);
        }
    });

    Ok(())
}

/// List all domains with saved site login cookies in Keychain.
#[tauri::command]
pub fn list_site_logins() -> Vec<String> {
    let output = Command::new("security")
        .args(["dump-keychain"])
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let mut domains = Vec::new();
            let mut in_pullread = false;
            for line in stdout.lines() {
                if line.contains(&format!("\"svce\"<blob>=\"{}\"", KEYCHAIN_SERVICE)) {
                    in_pullread = true;
                }
                if in_pullread {
                    if let Some(start) = line.find("\"acct\"<blob>=\"") {
                        let rest = &line[start + 14..];
                        if let Some(end) = rest.find('"') {
                            domains.push(rest[..end].to_string());
                        }
                        in_pullread = false;
                    }
                }
            }
            domains.sort();
            domains.dedup();
            domains
        }
        Err(_) => Vec::new(),
    }
}

/// Remove site login cookies for a domain from Keychain.
#[tauri::command]
pub fn remove_site_login(domain: String) -> bool {
    Command::new("security")
        .args([
            "delete-generic-password",
            "-s", KEYCHAIN_SERVICE,
            "-a", &domain,
        ])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Save cookies to Keychain (called from JS after reading webview cookies).
#[tauri::command]
pub fn save_site_cookies(domain: String, cookies_json: String) -> Result<(), String> {
    // Delete existing entry first
    let _ = Command::new("security")
        .args([
            "delete-generic-password",
            "-s", KEYCHAIN_SERVICE,
            "-a", &domain,
        ])
        .output();

    // Add new entry
    let status = Command::new("security")
        .args([
            "add-generic-password",
            "-s", KEYCHAIN_SERVICE,
            "-a", &domain,
            "-w", &cookies_json,
            "-U",
        ])
        .output()
        .map_err(|e| format!("Keychain write failed: {}", e))?;

    if status.status.success() {
        Ok(())
    } else {
        Err("Keychain write failed".to_string())
    }
}
```

**Step 3: Register module and commands**

In `src-tauri/src/lib.rs`, add `mod auth;` and register commands:

```rust
mod auth;
```

Add to the `invoke_handler`:
```rust
.invoke_handler(tauri::generate_handler![
    commands::open_viewer,
    commands::trigger_sync,
    commands::trigger_review,
    commands::get_log_content,
    auth::open_site_login,
    auth::list_site_logins,
    auth::remove_site_login,
    auth::save_site_cookies,
])
```

**Step 4: Build and verify**

Run: `cd src-tauri && cargo build`
Expected: Compiles without errors

**Step 5: Commit**

```bash
git add src-tauri/src/auth.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "Add Tauri commands for site login webview and Keychain"
```

---

### Task 5: Cookie capture via JS injection

Tauri 2 doesn't expose a direct cookie store API. Instead, inject JS into the login webview to read `document.cookie` and send it back via Tauri IPC before the window closes.

**Files:**
- Modify: `src-tauri/src/auth.rs`
- Create: `viewer/login-capture.js` (injected script)

**Step 1: Create the injected script**

The login webview will have a "Done" button injected as a floating overlay. When clicked, it reads cookies and calls the Tauri save command.

In `src-tauri/src/auth.rs`, modify `open_site_login` to inject a script after navigation:

```rust
// After building the window, inject a cookie capture script
let domain_for_js = domain.clone();
let _ = window.eval(&format!(r#"
    (function() {{
        // Create floating "Done" button
        var btn = document.createElement('button');
        btn.textContent = 'Done — Save Login';
        btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;padding:12px 24px;background:#1d9bf0;color:#fff;border:none;border-radius:24px;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:-apple-system,BlinkMacSystemFont,sans-serif';
        btn.onmouseover = function() {{ btn.style.background = '#1a8cd8'; }};
        btn.onmouseout = function() {{ btn.style.background = '#1d9bf0'; }};
        btn.onclick = async function() {{
            // Read all cookies visible to JS (non-httpOnly)
            var cookies = document.cookie.split(';').map(function(c) {{
                var parts = c.trim().split('=');
                return {{ name: parts[0], value: parts.slice(1).join('='), domain: '.{domain}', path: '/', expires: 0, secure: location.protocol === 'https:', httpOnly: false }};
            }}).filter(function(c) {{ return c.name && c.value; }});
            // Save via Tauri command
            try {{
                await window.__TAURI__.core.invoke('save_site_cookies', {{ domain: '{domain}', cookiesJson: JSON.stringify(cookies) }});
                btn.textContent = 'Saved!';
                btn.style.background = '#22c55e';
                setTimeout(function() {{ window.close(); }}, 800);
            }} catch(e) {{
                btn.textContent = 'Error: ' + e;
                btn.style.background = '#ef4444';
            }}
        }};
        document.body.appendChild(btn);
    }})();
"#, domain = domain_for_js));
```

Note: `document.cookie` only reads non-httpOnly cookies. Many auth cookies (session tokens) ARE httpOnly. We should also explore using Tauri's webview data store if available, or accept that we'll get the non-httpOnly subset which is often enough for many sites.

**Step 2: Build and test manually**

Run: `cd src-tauri && cargo build`
Test: Launch app, go to Settings > Site Logins, add medium.com, verify login window opens with "Done" button.

**Step 3: Commit**

```bash
git add src-tauri/src/auth.rs
git commit -m "Add cookie capture via JS injection in login webview"
```

---

### Task 6: Settings UI for site logins

Add the "Site Logins" section to Settings with add/remove functionality.

**Files:**
- Modify: `viewer/03-settings.js`

**Step 1: Add the Site Logins section**

In `viewer/03-settings.js`, after the "Bookmarks & Sync" section (`settings-feeds`) and before "Voice Playback" (`settings-voice`), add:

```javascript
  // ---- Site Logins section (Tauri only) ----
  if (window.PR_TAURI) {
    html += '<div class="settings-section" id="settings-site-logins">';
    html += '<h2>Site Logins</h2>';
    html += '<p style="color:var(--muted);font-size:13px;margin-bottom:12px">Log in to sites for paywalled or authenticated content.</p>';
    html += '<div id="site-logins-list" style="margin-bottom:12px"><p style="color:var(--muted);font-size:12px">Loading...</p></div>';
    html += '<button class="settings-btn" onclick="addSiteLogin()">+ Add site login</button>';
    html += '</div>';
  }
```

**Step 2: Add load, add, remove functions**

Add to `viewer/03-settings.js`:

```javascript
async function loadSiteLogins() {
  var container = document.getElementById('site-logins-list');
  if (!container) return;
  try {
    var res = await fetch('/api/site-logins');
    var data = await res.json();
    if (!data.domains || data.domains.length === 0) {
      container.innerHTML = '<p style="color:var(--muted);font-size:12px">No site logins yet.</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < data.domains.length; i++) {
      var d = data.domains[i];
      html += '<div class="settings-row" style="padding:6px 0"><span style="font-size:13px">' + escapeHtml(d) + '</span>';
      html += '<button class="settings-btn" style="font-size:11px;padding:3px 10px" onclick="removeSiteLoginUI(\'' + escapeJsStr(d) + '\')">Log out</button></div>';
    }
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p style="color:var(--muted);font-size:12px">Could not load site logins.</p>';
  }
}

async function addSiteLogin() {
  var domain = prompt('Enter the domain to log in to (e.g. medium.com, nytimes.com):');
  if (!domain) return;
  domain = domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  if (!domain || !domain.includes('.')) {
    showToast('Please enter a valid domain like medium.com');
    return;
  }
  try {
    await window.__TAURI__.core.invoke('open_site_login', { domain: domain });
    // Refresh list after a delay (user will close the login window)
    showToast('Log in, then click "Done — Save Login" when finished');
    // Poll for window close
    var poll = setInterval(async function() {
      var wins = await window.__TAURI__.core.invoke('list_site_logins');
      if (wins.includes(domain)) {
        clearInterval(poll);
        loadSiteLogins();
        showToast('Logged in to ' + domain);
      }
    }, 2000);
    // Stop polling after 5 minutes
    setTimeout(function() { clearInterval(poll); }, 300000);
  } catch (e) {
    showToast('Failed to open login window: ' + e);
  }
}

async function removeSiteLoginUI(domain) {
  try {
    await fetch('/api/site-logins', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: domain })
    });
    loadSiteLogins();
    showToast('Logged out of ' + domain);
  } catch (e) {
    showToast('Failed to remove login: ' + e);
  }
}
```

**Step 3: Call loadSiteLogins on settings load**

Find where other settings sections are loaded (search for `loadFeedConfig` or similar async loaders in `03-settings.js`) and add `loadSiteLogins()` alongside them.

**Step 4: Run tests**

Run: `npm test`
Expected: All pass (no viewer test changes needed — UI is additive)

**Step 5: Rebuild viewer and commit**

```bash
bun scripts/embed-viewer.ts
git add viewer/03-settings.js src/viewer-html.ts
git commit -m "Add Site Logins section to Settings UI"
```

---

### Task 7: End-to-end test and polish

Manual testing and edge case handling.

**Files:**
- Modify: `src-tauri/src/auth.rs` (edge cases)
- Modify: `viewer/03-settings.js` (polish)

**Step 1: Test the full flow manually**

1. Build: `cd src-tauri && cargo build`
2. Launch app
3. Settings > Site Logins > Add site login > enter `httpbin.org`
4. Verify login window opens with "Done" button
5. Click Done > verify "Saved!" appears > window closes
6. Verify `httpbin.org` appears in Site Logins list
7. Click "Log out" > verify it disappears
8. Verify Keychain: `security find-generic-password -s "PullRead" -a "httpbin.org"` should fail after logout

**Step 2: Handle edge cases**

- Duplicate domain: check if already logged in before opening window
- Invalid domain: validate before opening window (must have a dot, no spaces)
- Window already open: close existing before opening new

**Step 3: Run all tests**

Run: `npm test`
Expected: All pass

**Step 4: Final commit**

```bash
git add -A  # after checking git status
git commit -m "Site login: end-to-end testing and edge case polish"
```

---

### Verification Checklist

1. [ ] `saveSiteLoginCookies` writes to Keychain correctly
2. [ ] `getSiteLoginCookies` reads and formats cookie header
3. [ ] `listSiteLogins` returns all logged-in domains
4. [ ] `removeSiteLogin` deletes Keychain entry
5. [ ] Extractor prefers site login cookies over Chrome cookies
6. [ ] Viewer API `GET /api/site-logins` returns domain list
7. [ ] Viewer API `DELETE /api/site-logins` removes a login
8. [ ] Tauri `open_site_login` opens webview to correct URL
9. [ ] "Done" button captures cookies and saves to Keychain
10. [ ] Settings UI shows logged-in domains
11. [ ] Settings UI "Add site login" opens login window
12. [ ] Settings UI "Log out" removes the login
13. [ ] Browser mode: Site Logins section is hidden
14. [ ] All existing tests pass
