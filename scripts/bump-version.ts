#!/usr/bin/env bun
// ABOUTME: Propagates the version from package.json to site/index.html and the Xcode project
// ABOUTME: Run via `bun scripts/bump-version.ts` (or `bun scripts/bump-version.ts 1.4.0` to set a new version)

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const PKG_PATH = join(ROOT, 'package.json');
const SITE_PATH = join(ROOT, 'site', 'index.html');
const XCPROJ_PATH = join(ROOT, 'PullReadTray', 'PullReadTray.xcodeproj', 'project.pbxproj');

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

// Update Xcode project: all MARKETING_VERSION entries
const xcproj = readFileSync(XCPROJ_PATH, 'utf-8');
const xcprojUpdated = xcproj.replace(/MARKETING_VERSION = \d+\.\d+\.\d+;/g, `MARKETING_VERSION = ${version};`);
const count = (xcproj.match(/MARKETING_VERSION = \d+\.\d+\.\d+;/g) || []).length;
if (count === 0) {
  console.log('project.pbxproj — no MARKETING_VERSION found, skipping');
} else if (xcproj === xcprojUpdated) {
  console.log(`project.pbxproj — already ${version} (${count} occurrences)`);
} else {
  writeFileSync(XCPROJ_PATH, xcprojUpdated);
  console.log(`project.pbxproj → ${version} (${count} occurrences)`);
}
