// ABOUTME: Reads cookies from Chrome browser for authenticated requests
// ABOUTME: Uses macOS Keychain for decryption key, works with Bun's built-in SQLite

import { existsSync, copyFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { createDecipheriv, pbkdf2Sync } from 'crypto';
import { Database } from 'bun:sqlite';

const CHROME_COOKIES_PATH = join(
  homedir(),
  'Library/Application Support/Google/Chrome/Default/Cookies'
);

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
 * Gets the Chrome Safe Storage encryption key from macOS Keychain.
 * This will prompt the user for permission on first access.
 */
function getEncryptionKey(): Buffer | null {
  try {
    const result = execSync(
      'security find-generic-password -w -s "Chrome Safe Storage" -a "Chrome"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const password = result.trim();
    return pbkdf2Sync(password, SALT, ITERATIONS, KEY_LENGTH, 'sha1');
  } catch {
    // User denied access or Chrome not installed
    return null;
  }
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
 * Checks if Chrome cookies database exists
 */
export function isChromeAvailable(): boolean {
  return existsSync(CHROME_COOKIES_PATH);
}

/**
 * Gets cookies for a specific domain from Chrome.
 * Returns cookies as a string suitable for the Cookie header.
 */
export function getCookiesForDomain(domain: string): string | null {
  if (!isChromeAvailable()) {
    return null;
  }

  const key = getEncryptionKey();
  if (!key) {
    return null;
  }

  // Copy database to temp location to avoid locking issues with Chrome
  const tempDbPath = join(homedir(), '.config/pullread/.cookies-temp.db');
  try {
    copyFileSync(CHROME_COOKIES_PATH, tempDbPath);
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
