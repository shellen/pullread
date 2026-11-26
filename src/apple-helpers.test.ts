// ABOUTME: Tests for bundled Apple Intelligence helper lookup and the CI bundling config staying in sync
// ABOUTME: A bundled, executable helper beats compiling; the helper list, Tauri config and call sites must agree

import { mkdtempSync, writeFileSync, chmodSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { APPLE_HELPERS, bundledHelperPath, helperNameFromCache } from './apple-helpers';
import { ensureAppleBinary } from './summarizer';

const root = join(__dirname, '..');

describe('bundledHelperPath', () => {
  afterEach(() => { delete process.env.PULLREAD_HELPERS_DIR; });

  test('finds an executable helper next to the running executable (inside the app bundle)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pr-helpers-'));
    writeFileSync(join(dir, 'pullread-apple-structured'), '#!/bin/sh\n');
    chmodSync(join(dir, 'pullread-apple-structured'), 0o755);
    expect(bundledHelperPath('.apple-structured', join(dir, 'pullread-cli'))).toBe(join(dir, 'pullread-apple-structured'));
  });

  test('ignores a helper that is not executable, and unknown names', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pr-helpers-'));
    writeFileSync(join(dir, 'pullread-apple-rlm'), 'not executable');
    chmodSync(join(dir, 'pullread-apple-rlm'), 0o644);
    expect(bundledHelperPath('.apple-rlm', join(dir, 'pullread-cli'))).toBeNull();
    expect(bundledHelperPath('.something-else', join(dir, 'pullread-cli'))).toBeNull();
  });

  test('ensureAppleBinary uses the bundled helper instead of compiling', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pr-helpers-'));
    writeFileSync(join(dir, 'pullread-apple-summarize'), '#!/bin/sh\n');
    chmodSync(join(dir, 'pullread-apple-summarize'), 0o755);
    process.env.PULLREAD_HELPERS_DIR = dir;
    // No swiftc here (Linux CI): only the bundled lookup can return a path.
    expect(ensureAppleBinary('import Foundation', '.apple-summarize')).toBe(join(dir, 'pullread-apple-summarize'));
  });
});

describe('helper list, Tauri config and call sites agree', () => {
  test('tauri.apple-helpers.conf.json bundles the sidecar plus every helper', () => {
    const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.apple-helpers.conf.json'), 'utf-8'));
    const base = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf-8'));
    // The extra config replaces externalBin (JSON merge patch), so it must keep the base entries.
    expect(conf.bundle.externalBin).toEqual([...base.bundle.externalBin, ...APPLE_HELPERS.map(n => `binaries/pullread-${n}`)]);
  });

  test('every ensureAppleBinary call names a known helper, and every helper is used', () => {
    const used = new Set<string>();
    for (const f of readdirSync(join(root, 'src')).filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
      for (const m of readFileSync(join(root, 'src', f), 'utf-8').matchAll(/ensureAppleBinary\(\s*\w+,\s*'([^']+)'/g)) {
        expect(helperNameFromCache(m[1])).not.toBeNull();
        used.add(helperNameFromCache(m[1])!);
      }
    }
    expect([...used].sort()).toEqual([...APPLE_HELPERS].sort());
  });

  test('the CI build script has a source for every helper', () => {
    const script = readFileSync(join(root, 'scripts', 'build-apple-helpers.ts'), 'utf-8');
    for (const n of APPLE_HELPERS) expect(script).toContain(`'${n}':`);
  });
});
