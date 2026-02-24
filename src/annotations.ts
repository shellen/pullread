// ABOUTME: Per-article annotation sidecar storage (.annot.json files)
// ABOUTME: Replaces monolithic highlights.json and notes.json with portable per-article files

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, renameSync } from 'fs';
import { join, dirname, basename } from 'path';
import { resolveFilePath } from './writer';

export interface AnnotationData {
  highlights: unknown[];
  articleNote: string;
  annotations: unknown[];
  tags: string[];
  machineTags: string[];
  isFavorite: boolean;
}

const EMPTY_ANNOTATION: AnnotationData = {
  highlights: [],
  articleNote: '',
  annotations: [],
  tags: [],
  machineTags: [],
  isFavorite: false,
};

// In-memory cache keyed by article filename
let _cache: Record<string, AnnotationData> = {};
let _outputPath = '';
let _configDir = '';

/** Resolve the .annot.json sidecar path for an article filename */
export function annotationPath(outputPath: string, filename: string): string {
  const articlePath = resolveFilePath(outputPath, filename);
  const dir = dirname(articlePath);
  const base = basename(filename, '.md');
  return join(dir, base + '.annot.json');
}

/** Scan output directory for all .annot.json files and populate cache */
export function initAnnotations(outputPath: string, configDir: string): void {
  _outputPath = outputPath;
  _configDir = configDir;
  _cache = {};

  if (!existsSync(outputPath)) return;

  function walk(dir: string) {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    const SKIP = new Set(['favicons', 'notebooks']);
    for (const name of entries) {
      if (SKIP.has(name)) continue;
      const full = join(dir, name);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (stat.isFile() && name.endsWith('.annot.json')) {
          const articleFilename = name.replace(/\.annot\.json$/, '.md');
          try {
            const data = JSON.parse(readFileSync(full, 'utf-8'));
            _cache[articleFilename] = {
              highlights: data.highlights || [],
              articleNote: data.articleNote || '',
              annotations: data.annotations || [],
              tags: data.tags || [],
              machineTags: data.machineTags || [],
              isFavorite: !!data.isFavorite,
            };
          } catch {}
        }
      } catch { continue; }
    }
  }

  walk(outputPath);
}

/** Load annotation data for a single article */
export function loadAnnotation(filename: string): AnnotationData {
  return _cache[filename] || { ...EMPTY_ANNOTATION, highlights: [], annotations: [], tags: [], machineTags: [] };
}

/** Save annotation data to sidecar file and update cache */
export function saveAnnotation(filename: string, data: AnnotationData): void {
  const sidecarPath = annotationPath(_outputPath, filename);
  const dir = dirname(sidecarPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(sidecarPath, JSON.stringify(data, null, 2));
  _cache[filename] = data;
}

/** Return all highlights keyed by filename (for backward-compatible API) */
export function allHighlights(): Record<string, unknown[]> {
  const result: Record<string, unknown[]> = {};
  for (const [filename, annot] of Object.entries(_cache)) {
    if (annot.highlights.length > 0) {
      result[filename] = annot.highlights;
    }
  }
  return result;
}

/** Return all notes keyed by filename (for backward-compatible API) */
export function allNotes(): Record<string, { articleNote: string; annotations: unknown[]; tags: string[]; machineTags: string[]; isFavorite: boolean }> {
  const result: Record<string, { articleNote: string; annotations: unknown[]; tags: string[]; machineTags: string[]; isFavorite: boolean }> = {};
  for (const [filename, annot] of Object.entries(_cache)) {
    result[filename] = {
      articleNote: annot.articleNote,
      annotations: annot.annotations,
      tags: annot.tags,
      machineTags: annot.machineTags,
      isFavorite: annot.isFavorite,
    };
  }
  return result;
}

interface MigrationResult {
  migrated: number;
  orphaned: number;
}

/** Migrate monolithic highlights.json and notes.json to per-article sidecars */
export function migrateMonolithicFiles(outputPath: string, configDir: string): MigrationResult {
  const highlightsPath = join(configDir, 'highlights.json');
  const notesPath = join(configDir, 'notes.json');
  const hasHighlights = existsSync(highlightsPath);
  const hasNotes = existsSync(notesPath);

  if (!hasHighlights && !hasNotes) {
    return { migrated: 0, orphaned: 0 };
  }

  let oldHighlights: Record<string, unknown[]> = {};
  let oldNotes: Record<string, any> = {};

  if (hasHighlights) {
    try { oldHighlights = JSON.parse(readFileSync(highlightsPath, 'utf-8')); } catch {}
  }
  if (hasNotes) {
    try { oldNotes = JSON.parse(readFileSync(notesPath, 'utf-8')); } catch {}
  }

  // Collect all unique filenames from both sources
  const allFilenames = new Set([...Object.keys(oldHighlights), ...Object.keys(oldNotes)]);

  let migrated = 0;
  let orphaned = 0;
  const orphanedData: Record<string, any> = {};

  for (const filename of allFilenames) {
    const sidecarPath = annotationPath(outputPath, filename);

    // Skip if sidecar already exists
    if (existsSync(sidecarPath)) continue;

    // Check if the article file exists on disk
    const articlePath = resolveFilePath(outputPath, filename);
    if (!existsSync(articlePath)) {
      // Orphaned — article was deleted but annotations remain
      const highlights = oldHighlights[filename] || [];
      const note = oldNotes[filename] || {};
      orphanedData[filename] = {
        highlights,
        articleNote: note.articleNote || '',
        annotations: note.annotations || [],
        tags: note.tags || [],
        machineTags: note.machineTags || [],
        isFavorite: !!note.isFavorite,
      };
      orphaned++;
      continue;
    }

    // Build sidecar data from both sources
    const highlights = oldHighlights[filename] || [];
    const note = oldNotes[filename] || {};
    const sidecarData: AnnotationData = {
      highlights: Array.isArray(highlights) ? highlights : [],
      articleNote: note.articleNote || '',
      annotations: note.annotations || [],
      tags: note.tags || [],
      machineTags: note.machineTags || [],
      isFavorite: !!note.isFavorite,
    };

    // Write sidecar
    const dir = dirname(sidecarPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(sidecarPath, JSON.stringify(sidecarData, null, 2));
    migrated++;
  }

  // Save orphaned annotations
  if (orphaned > 0) {
    writeFileSync(join(configDir, 'orphaned-annotations.json'), JSON.stringify(orphanedData, null, 2));
  }

  // Rename originals so migration doesn't re-run
  if (hasHighlights) {
    renameSync(highlightsPath, highlightsPath + '.migrated');
  }
  if (hasNotes) {
    renameSync(notesPath, notesPath + '.migrated');
  }

  return { migrated, orphaned };
}
