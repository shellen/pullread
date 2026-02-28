// ABOUTME: Tests that the Tauri shell open regex allows expected URL schemes
// ABOUTME: Validates mailto:, sms:, tel:, http(s):// pass and dangerous schemes are blocked

import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

function getShellOpenRegex(): RegExp {
  const conf = JSON.parse(readFileSync(join(__dirname, '../src-tauri/tauri.conf.json'), 'utf-8'));
  const pattern = conf.plugins?.shell?.open;
  if (!pattern || typeof pattern !== 'string') {
    throw new Error('No shell.open regex found in tauri.conf.json');
  }
  return new RegExp(pattern);
}

describe('Tauri shell open URL validation', () => {
  const re = getShellOpenRegex();

  describe('allowed schemes', () => {
    test('mailto with recipient', () => {
      expect(re.test('mailto:user@example.com?subject=Test')).toBe(true);
    });

    test('mailto without recipient (share sheet)', () => {
      expect(re.test('mailto:?subject=Test&body=Hello')).toBe(true);
    });

    test('sms with body only (? separator)', () => {
      expect(re.test('sms:?body=Check this out')).toBe(true);
    });

    test('sms with phone number', () => {
      expect(re.test('sms:+15551234567?body=Hello')).toBe(true);
    });

    test('tel with phone number', () => {
      expect(re.test('tel:+15551234567')).toBe(true);
    });

    test('https URL', () => {
      expect(re.test('https://pullread.com')).toBe(true);
    });

    test('http localhost', () => {
      expect(re.test('http://localhost:3000')).toBe(true);
    });
  });

  describe('blocked schemes', () => {
    test('file:// is blocked', () => {
      expect(re.test('file:///etc/passwd')).toBe(false);
    });

    test('javascript: is blocked', () => {
      expect(re.test('javascript:alert(1)')).toBe(false);
    });

    test('data: is blocked', () => {
      expect(re.test('data:text/html,<script>alert(1)</script>')).toBe(false);
    });
  });
});
