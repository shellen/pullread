// ABOUTME: macOS Keychain integration for secure API key storage
// ABOUTME: Uses security CLI to write and read secrets without user prompts

import { execFileSync } from 'child_process';

const SERVICE = 'com.pullread.api-keys';

/** Store a value in macOS Keychain. Returns true on success. */
export function saveToKeychain(account: string, value: string): boolean {
  if (process.platform !== 'darwin') return false;
  try {
    execFileSync('security', [
      'add-generic-password', '-U',
      '-s', SERVICE,
      '-a', account,
      '-w', value,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

/** Delete a value from macOS Keychain. Returns true on success. */
export function deleteFromKeychain(account: string): boolean {
  if (process.platform !== 'darwin') return false;
  try {
    execFileSync('security', [
      'delete-generic-password',
      '-s', SERVICE,
      '-a', account,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

/** Load a value from macOS Keychain. Returns null if not found. */
export function loadFromKeychain(account: string): string | null {
  if (process.platform !== 'darwin') return null;
  try {
    const result = execFileSync('security', [
      'find-generic-password', '-w',
      '-s', SERVICE,
      '-a', account,
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return result.trim() || null;
  } catch {
    return null;
  }
}
