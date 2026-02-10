#!/usr/bin/env bun
// ABOUTME: Reads models.json and updates SettingsView.swift's knownModels and defaultModels
// ABOUTME: Run via `bun run sync:models` after editing models.json

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const MODELS_PATH = join(ROOT, 'models.json');
const SWIFT_PATH = join(ROOT, 'PullReadTray', 'PullReadTray', 'SettingsView.swift');

const config = JSON.parse(readFileSync(MODELS_PATH, 'utf-8'));
const providers = config.providers as Record<string, { models: string[]; default: string }>;

// Generate Swift dictionary literal for knownModels
const knownLines: string[] = [];
for (const [key, val] of Object.entries(providers)) {
  const models = val.models.map((m: string) => `"${m}"`).join(', ');
  knownLines.push(`        "${key}": [${models}]`);
}
const knownSwift = `    private static let knownModels: [String: [String]] = [\n${knownLines.join(',\n')}\n    ]`;

// Generate Swift dictionary literal for defaultModels
const defaultLines: string[] = [];
for (const [key, val] of Object.entries(providers)) {
  defaultLines.push(`        "${key}": "${val.default}"`);
}
const defaultSwift = `    private static let defaultModels: [String: String] = [\n${defaultLines.join(',\n')}\n    ]`;

// Read and patch SettingsView.swift
let swift = readFileSync(SWIFT_PATH, 'utf-8');

// Replace knownModels block
swift = swift.replace(
  /    private static let knownModels: \[String: \[String\]\] = \[[\s\S]*?\n    \]/,
  knownSwift
);

// Replace defaultModels block
swift = swift.replace(
  /    private static let defaultModels: \[String: String\] = \[[\s\S]*?\n    \]/,
  defaultSwift
);

writeFileSync(SWIFT_PATH, swift);

console.log('SettingsView.swift updated from models.json');
console.log('');
for (const [key, val] of Object.entries(providers)) {
  console.log(`  ${key}: ${val.models.length} models (default: ${val.default})`);
}

// Check for upcoming deprecations
const now = new Date();
for (const [key, val] of Object.entries(providers)) {
  const deps = (val as any).deprecations;
  if (!deps) continue;
  for (const [model, dateStr] of Object.entries(deps)) {
    const depDate = new Date(dateStr as string);
    const daysUntil = Math.ceil((depDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 30 && daysUntil > 0) {
      console.log(`\n  ⚠ ${key}/${model} deprecated in ${daysUntil} days (${dateStr})`);
    } else if (daysUntil <= 0) {
      console.log(`\n  ✘ ${key}/${model} is PAST deprecation date (${dateStr}) — remove it!`);
    }
  }
}
