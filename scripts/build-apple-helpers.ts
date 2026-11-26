#!/usr/bin/env bun
// ABOUTME: Compiles the Apple Intelligence Swift helpers for the app bundle (CI, Apple Silicon only)
// ABOUTME: Usage: bun scripts/build-apple-helpers.ts <target-triple> [outDir]; writes built=true|false to GITHUB_OUTPUT

/*
 * Sources come from the app's own code, so the bundled helpers always match
 * the version being built. Outputs follow Tauri's externalBin naming:
 * src-tauri/binaries/pullread-<helper>-<target-triple>.
 *
 * Skips (exit 0, built=false) instead of failing the build when:
 *  - the target isn't Apple Silicon (Apple Intelligence doesn't run on Intel Macs)
 *  - no installed Xcode has the macOS 26 SDK with FoundationModels
 * The app then falls back to compiling on the user's Mac, as before.
 */

import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { APPLE_HELPERS, bundledFileName } from '../src/apple-helpers';
import type { AppleHelperName } from '../src/apple-helpers';
import { SUMMARIZE_SWIFT, RLM_SWIFT } from '../src/summarizer';
import { BATCH_AUTOTAG_SWIFT } from '../src/autotagger';
import { APPLE_STRUCTURED_SWIFT } from '../src/apple-structured';

const SOURCES: Record<AppleHelperName, string> = {
  'apple-summarize': SUMMARIZE_SWIFT,
  'apple-rlm': RLM_SWIFT,
  'apple-batch-autotag': BATCH_AUTOTAG_SWIFT,
  'apple-structured': APPLE_STRUCTURED_SWIFT,
};

const target = process.argv[2] || '';
const outDir = resolve(process.argv[3] || 'src-tauri/binaries');

function output(built: boolean) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `built=${built}\n`);
}

function skip(reason: string): never {
  console.log(`Skipping Apple Intelligence helpers: ${reason}`);
  console.log('The app will compile them on first use instead (needs Xcode command line tools).');
  output(false);
  process.exit(0);
}

if (target !== 'aarch64-apple-darwin') skip(`target ${target || '(none)'} is not Apple Silicon`);
if (process.platform !== 'darwin') skip('not running on macOS');

/** A developer directory whose macOS SDK has FoundationModels (macOS 26+). */
function findDeveloperDir(): string | null {
  const candidates: string[] = [];
  try { candidates.push(execFileSync('xcode-select', ['-p'], { encoding: 'utf-8' }).trim()); } catch {}
  try {
    for (const app of readdirSync('/Applications').filter(n => /^Xcode.*\.app$/.test(n)).sort().reverse()) {
      candidates.push(`/Applications/${app}/Contents/Developer`);
    }
  } catch {}
  for (const dev of candidates) {
    const fw = join(dev, 'Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/System/Library/Frameworks/FoundationModels.framework');
    if (existsSync(fw)) return dev;
  }
  return null;
}

const developerDir = findDeveloperDir();
if (!developerDir) skip('no installed Xcode has the macOS 26 SDK (FoundationModels)');
console.log(`Using ${developerDir}`);

mkdirSync(outDir, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'pullread-helpers-'));
const env = { ...process.env, DEVELOPER_DIR: developerDir! };

for (const name of APPLE_HELPERS) {
  const src = join(work, `${name}.swift`);
  const out = join(outDir, `${bundledFileName(name)}-${target}`);
  writeFileSync(src, SOURCES[name]);
  // macOS 26 deployment target: the helpers only run where Apple Intelligence exists.
  execFileSync('xcrun', ['--sdk', 'macosx', 'swiftc', '-parse-as-library', '-O',
    '-target', 'arm64-apple-macos26.0', src, '-o', out], { stdio: 'inherit', env });
  console.log(`Built ${out}`);
}
output(true);
