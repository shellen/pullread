#!/usr/bin/env bun
// ABOUTME: Propagates the version from package.json to site/index.html, tauri.conf.json, and Cargo.toml
// ABOUTME: Run via `bun scripts/bump-version.ts` (or `bun scripts/bump-version.ts 0.4.0` to set a version)

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const PKG_PATH = join(ROOT, 'package.json');
const SITE_PATH = join(ROOT, 'site', 'index.html');
const TAURI_CONF_PATH = join(ROOT, 'src-tauri', 'tauri.conf.json');
const CARGO_PATH = join(ROOT, 'src-tauri', 'Cargo.toml');

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

// Update site/index.html: "Version X.Y.Z" or "__VERSION__" placeholder inside the hero badge
const site = readFileSync(SITE_PATH, 'utf-8');
const siteVersionRe = /Version (?:\d+\.\d+\.\d+|__VERSION__)/;
const siteUpdated = site.replace(siteVersionRe, `Version ${version}`);
if (!siteVersionRe.test(site)) {
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

// Update Cargo.toml version
const cargo = readFileSync(CARGO_PATH, 'utf-8');
const cargoVersionRe = /^version = "\d+\.\d+\.\d+"/m;
const cargoUpdated = cargo.replace(cargoVersionRe, `version = "${version}"`);
if (!cargoVersionRe.test(cargo)) {
  console.log('Cargo.toml — no version string found, skipping');
} else if (cargo === cargoUpdated) {
  console.log(`Cargo.toml — already ${version}`);
} else {
  writeFileSync(CARGO_PATH, cargoUpdated);
  console.log(`Cargo.toml → ${version}`);
}
