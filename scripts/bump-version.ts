#!/usr/bin/env bun
// ABOUTME: Propagates the version from package.json to site/index.html and tauri.conf.json
// ABOUTME: Run via `bun scripts/bump-version.ts` (or `bun scripts/bump-version.ts 2.1.0` to set a version)

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const PKG_PATH = join(ROOT, 'package.json');
const SITE_PATH = join(ROOT, 'site', 'index.html');
const TAURI_CONF_PATH = join(ROOT, 'src-tauri', 'tauri.conf.json');

// If a version argument is provided, update package.json first
const newVersion = process.argv[2];
const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8'));

if (newVersion) {
  if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.error(`Invalid version: ${newVersion} (expected X.Y.Z)`);
    process.exit(1);
  }
  pkg.version = newVersion;
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`package.json → ${newVersion}`);
}

const version = pkg.version;

// Update site/index.html: "Version X.Y.Z" inside the hero badge
const site = readFileSync(SITE_PATH, 'utf-8');
const siteUpdated = site.replace(/Version \d+\.\d+\.\d+/, `Version ${version}`);
const siteHasVersion = /Version \d+\.\d+\.\d+/.test(site);
if (!siteHasVersion) {
  console.log('site/index.html — no version string found, skipping');
} else if (site === siteUpdated) {
  console.log(`site/index.html — already ${version}`);
} else {
  writeFileSync(SITE_PATH, siteUpdated);
  console.log(`site/index.html → ${version}`);
}

// Update tauri.conf.json version
const tauriConf = JSON.parse(readFileSync(TAURI_CONF_PATH, 'utf-8'));
if (tauriConf.version === version) {
  console.log(`tauri.conf.json — already ${version}`);
} else {
  tauriConf.version = version;
  writeFileSync(TAURI_CONF_PATH, JSON.stringify(tauriConf, null, 2) + '\n');
  console.log(`tauri.conf.json → ${version}`);
}
