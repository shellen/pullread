// ABOUTME: Reads cookies from Chromium-based browsers for authenticated requests
// ABOUTME: Supports Chrome, Arc, Brave, and Edge via macOS Keychain decryption

import { existsSync, copyFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { createDecipheriv, pbkdf2Sync } from 'crypto';
import { Database } from 'bun:sqlite';

interface BrowserConfig {
  name: string;
  cookiePath: string;
  keychainService: string;
  keychainAccount: string;
}

const BROWSERS: BrowserConfig[] = [
  {
    name: 'Chrome',
    cookiePath: join(homedir(), 'Library/Application Support/Google/Chrome/Default/Cookies'),
    keychainService: 'Chrome Safe Storage',
    keychainAccount: 'Chrome',
  },
  {
    name: 'Arc',
    cookiePath: join(homedir(), 'Library/Application Support/Arc/User Data/Default/Cookies'),
    keychainService: 'Arc Safe Storage',
    keychainAccount: 'Arc',
  },
  {
    name: 'Brave',
    cookiePath: join(homedir(), 'Library/Application Support/BraveSoftware/Brave-Browser/Default/Cookies'),
    keychainService: 'Brave Safe Storage',
    keychainAccount: 'Brave',
  },
  {
    name: 'Edge',
    cookiePath: join(homedir(), 'Library/Application Support/Microsoft Edge/Default/Cookies'),
    keychainService: 'Microsoft Edge Safe Storage',
    keychainAccount: 'Microsoft Edge',
  },
];

const SALT = 'saltysalt';
const IV = Buffer.alloc(16, ' '); // 16 spaces
const ITERATIONS = 1003;
const KEY_LENGTH = 16;

interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiresUtc: number;
  isSecure: boolean;
  isHttpOnly: boolean;
}

/**
 * Gets the encryption key for a Chromium browser from macOS Keychain.
 * This will prompt the user for permission on first access.
 */
function getEncryptionKey(browser: BrowserConfig): Buffer | null {
  try {
    const result = execSync(
      `security find-generic-password -w -s "${browser.keychainService}" -a "${browser.keychainAccount}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const password = result.trim();
    return pbkdf2Sync(password, SALT, ITERATIONS, KEY_LENGTH, 'sha1');
  } catch {
    // User denied access or browser not installed
    return null;
  }
}

/**
 * Finds the first available Chromium browser on the system.
 */
function findAvailableBrowser(): BrowserConfig | null {
  for (const browser of BROWSERS) {
    if (existsSync(browser.cookiePath)) {
      return browser;
    }
  }
  return null;
}

/**
 * Returns a list of all available Chromium browsers.
 */
export function getAvailableBrowsers(): string[] {
  return BROWSERS.filter(b => existsSync(b.cookiePath)).map(b => b.name);
}

/**
 * Decrypts a Chrome cookie value.
 * Chrome cookies are encrypted with AES-128-CBC on macOS.
 */
function decryptValue(encryptedValue: Buffer, key: Buffer): string {
  if (!encryptedValue || encryptedValue.length === 0) {
    return '';
  }

  // Chrome prefixes encrypted values with 'v10' or 'v11'
  const prefix = encryptedValue.slice(0, 3).toString();
  if (prefix !== 'v10' && prefix !== 'v11') {
    // Not encrypted, return as-is
    return encryptedValue.toString('utf8');
  }

  try {
    const encrypted = encryptedValue.slice(3);
    const decipher = createDecipheriv('aes-128-cbc', key, IV);
    decipher.setAutoPadding(true);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

/**
 * Checks if any Chromium browser cookies database exists
 */
export function isChromeAvailable(): boolean {
  return findAvailableBrowser() !== null;
}

/**
 * Gets cookies for a specific domain from the first available Chromium browser.
 * Tries Chrome, Arc, Brave, and Edge in order.
 * Returns cookies as a string suitable for the Cookie header.
 */
export function getCookiesForDomain(domain: string): string | null {
  const browser = findAvailableBrowser();
  if (!browser) {
    return null;
  }

  const key = getEncryptionKey(browser);
  if (!key) {
    return null;
  }

  // Copy database to temp location to avoid locking issues
  const tempDbPath = join(homedir(), '.config/pullread/.cookies-temp.db');
  try {
    copyFileSync(browser.cookiePath, tempDbPath);
  } catch {
    return null;
  }

  try {
    const db = new Database(tempDbPath, { readonly: true });

    // Build domain patterns for matching
    // For "nytimes.com", match ".nytimes.com" and "nytimes.com"
    // Also match subdomains like "www.nytimes.com"
    const baseDomain = domain.replace(/^www\./, '');
    const patterns = [
      baseDomain,
      `.${baseDomain}`,
      `www.${baseDomain}`
    ];

    const placeholders = patterns.map(() => '?').join(', ');
    const query = `
      SELECT name, encrypted_value, host_key, path, expires_utc, is_secure, is_httponly
      FROM cookies
      WHERE host_key IN (${placeholders})
         OR host_key LIKE ?
      ORDER BY LENGTH(path) DESC
    `;

    const rows = db.query(query).all(...patterns, `%.${baseDomain}`);
    db.close();

    // Decrypt and format cookies
    const cookies: Cookie[] = [];
    for (const row of rows as any[]) {
      const encryptedValue = row.encrypted_value as Buffer;
      const decryptedValue = decryptValue(encryptedValue, key);

      if (decryptedValue) {
        cookies.push({
          name: row.name,
          value: decryptedValue,
          domain: row.host_key,
          path: row.path,
          expiresUtc: row.expires_utc,
          isSecure: row.is_secure === 1,
          isHttpOnly: row.is_httponly === 1
        });
      }
    }

    if (cookies.length === 0) {
      return null;
    }

    // Filter out known tracking/analytics cookies to reduce header size
    const TRACKING_PREFIXES = [
      '_ga', '_gid', '_gat', '_gcl', // Google Analytics
      '_fbp', '_fbc',                 // Facebook
      '__utm',                        // Legacy GA UTM
      '_hp2_', 'ajs_',               // Analytics trackers
      'OptanonConsent', 'OptanonAlertBoxClosed', // Cookie consent
      'euconsent', '_evidon',         // GDPR consent
      'AMCV_', 'AMCVS_', 's_cc', 's_sq', 's_vi', // Adobe Analytics
    ];

    const filtered = cookies.filter(c => {
      return !TRACKING_PREFIXES.some(prefix => c.name.startsWith(prefix));
    });

    if (filtered.length === 0) {
      return null;
    }

    // Build cookie string, but cap at ~6KB to avoid 494 (header too large) errors
    const MAX_COOKIE_BYTES = 6 * 1024;
    let result = '';
    for (const c of filtered) {
      const pair = `${c.name}=${c.value}`;
      if (result.length + pair.length + 2 > MAX_COOKIE_BYTES) break;
      if (result) result += '; ';
      result += pair;
    }

    return result || null;

  } catch (err) {
    console.error(`  Cookie error: ${err instanceof Error ? err.message : err}`);
    return null;
  } finally {
    // Clean up temp file
    try {
      unlinkSync(tempDbPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extracts the domain from a URL for cookie matching
 */
export function getDomainFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return '';
  }
}
