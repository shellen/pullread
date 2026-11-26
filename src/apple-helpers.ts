// ABOUTME: Names and lookup for the Apple Intelligence Swift helpers that CI builds and bundles with the app
// ABOUTME: ensureAppleBinary() uses a bundled helper when present, and only compiles with swiftc as a fallback

import { existsSync, accessSync, constants } from 'fs';
import { dirname, join } from 'path';

/*
 * Each helper is a small Swift program whose source lives in the app's code
 * (SUMMARIZE_SWIFT, RLM_SWIFT, BATCH_AUTOTAG_SWIFT, APPLE_STRUCTURED_SWIFT).
 * scripts/build-apple-helpers.ts compiles them in CI (Apple Silicon only) and
 * src-tauri/tauri.apple-helpers.conf.json bundles them next to the sidecar, so
 * users don't need Xcode command line tools and the helpers are signed with
 * the app. Development runs (bun src/index.ts) still compile on first use.
 */
export const APPLE_HELPERS = ['apple-summarize', 'apple-rlm', 'apple-batch-autotag', 'apple-structured'] as const;
export type AppleHelperName = typeof APPLE_HELPERS[number];

/** ".apple-summarize" (the runtime cache name) → "apple-summarize". */
export function helperNameFromCache(cacheName: string): AppleHelperName | null {
  const name = cacheName.replace(/^\./, '') as AppleHelperName;
  return (APPLE_HELPERS as readonly string[]).includes(name) ? name : null;
}

/** File name of a bundled helper (Tauri strips the target-triple suffix when it bundles externalBin). */
export function bundledFileName(name: AppleHelperName): string {
  return `pullread-${name}`;
}

/**
 * Path to a bundled, executable helper, or null. Looks next to the running
 * executable (inside the app: Contents/MacOS, beside pullread-cli), or in
 * PULLREAD_HELPERS_DIR when set.
 */
export function bundledHelperPath(cacheName: string, execPath = process.execPath): string | null {
  const name = helperNameFromCache(cacheName);
  if (!name) return null;
  const dirs = [process.env.PULLREAD_HELPERS_DIR, dirname(execPath)].filter(Boolean) as string[];
  for (const dir of dirs) {
    const p = join(dir, bundledFileName(name));
    try {
      if (existsSync(p)) { accessSync(p, constants.X_OK); return p; }
    } catch {
      // Present but not executable: ignore and fall back to compiling.
    }
  }
  return null;
}
