// ABOUTME: Tests for per-article annotation sidecar storage
// ABOUTME: Covers load, save, migration from monolithic files, and cache behavior

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  initAnnotations,
  loadAnnotation,
  saveAnnotation,
  allHighlights,
  allNotes,
  annotationPath,
  migrateMonolithicFiles,
} from './annotations';

let testDir: string;
let outputPath: string;
let configDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `pullread-annot-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  outputPath = join(testDir, 'articles');
  configDir = join(testDir, 'config');
  mkdirSync(outputPath, { recursive: true });
  mkdirSync(configDir, { recursive: true });
});

afterEach(() => {
  try { rmSync(testDir, { recursive: true, force: true }); } catch {}
});

describe('annotationPath', () => {
  test('returns .annot.json path next to article in dated subfolder', () => {
    const articleDir = join(outputPath, '2026', '02');
    mkdirSync(articleDir, { recursive: true });
    writeFileSync(join(articleDir, '2026-02-04-test-article.md'), '# test');

    const result = annotationPath(outputPath, '2026-02-04-test-article.md');
    expect(result).toBe(join(articleDir, '2026-02-04-test-article.annot.json'));
  });

  test('returns path next to flat article when no dated subfolder exists', () => {
    writeFileSync(join(outputPath, 'undated-article.md'), '# test');

    const result = annotationPath(outputPath, 'undated-article.md');
    expect(result).toBe(join(outputPath, 'undated-article.annot.json'));
  });
});

describe('loadAnnotation', () => {
  test('returns empty defaults when no sidecar exists', () => {
    initAnnotations(outputPath, configDir);
    const annot = loadAnnotation('nonexistent.md');
    expect(annot).toEqual({
      highlights: [],
      articleNote: '',
      annotations: [],
      tags: [],
      machineTags: [],
      isFavorite: false,
    });
  });

  test('loads existing sidecar data', () => {
    const articleDir = join(outputPath, '2026', '02');
    mkdirSync(articleDir, { recursive: true });
    writeFileSync(join(articleDir, '2026-02-04-article.md'), '# test');
    writeFileSync(join(articleDir, '2026-02-04-article.annot.json'), JSON.stringify({
      highlights: [{ id: 'h1', text: 'hello', color: 'yellow' }],
      articleNote: 'my note',
      annotations: [],
      tags: ['ai'],
      machineTags: ['technology'],
      isFavorite: true,
    }));

    initAnnotations(outputPath, configDir);
    const annot = loadAnnotation('2026-02-04-article.md');
    expect(annot.highlights).toHaveLength(1);
    expect((annot.highlights[0] as any).id).toBe('h1');
    expect(annot.articleNote).toBe('my note');
    expect(annot.tags).toEqual(['ai']);
    expect(annot.machineTags).toEqual(['technology']);
    expect(annot.isFavorite).toBe(true);
  });
});

describe('saveAnnotation', () => {
  test('writes sidecar file and updates cache', () => {
    const articleDir = join(outputPath, '2026', '02');
    mkdirSync(articleDir, { recursive: true });
    writeFileSync(join(articleDir, '2026-02-04-article.md'), '# test');

    initAnnotations(outputPath, configDir);
    saveAnnotation('2026-02-04-article.md', {
      highlights: [{ id: 'h2', text: 'world', color: 'blue' }],
      articleNote: 'updated note',
      annotations: [],
      tags: ['science'],
      machineTags: [],
      isFavorite: false,
    });

    // Verify file was written
    const sidecarPath = join(articleDir, '2026-02-04-article.annot.json');
    expect(existsSync(sidecarPath)).toBe(true);
    const onDisk = JSON.parse(readFileSync(sidecarPath, 'utf-8'));
    expect(onDisk.highlights[0].id).toBe('h2');
    expect(onDisk.articleNote).toBe('updated note');

    // Verify cache was updated
    const cached = loadAnnotation('2026-02-04-article.md');
    expect((cached.highlights[0] as any).id).toBe('h2');
  });
});

describe('allHighlights', () => {
  test('returns all highlights keyed by filename', () => {
    const dir1 = join(outputPath, '2026', '01');
    const dir2 = join(outputPath, '2026', '02');
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });
    writeFileSync(join(dir1, '2026-01-10-a.md'), '# a');
    writeFileSync(join(dir2, '2026-02-04-b.md'), '# b');
    writeFileSync(join(dir1, '2026-01-10-a.annot.json'), JSON.stringify({
      highlights: [{ id: 'h1', text: 'first' }],
      articleNote: '', annotations: [], tags: [], machineTags: [], isFavorite: false,
    }));
    writeFileSync(join(dir2, '2026-02-04-b.annot.json'), JSON.stringify({
      highlights: [{ id: 'h2', text: 'second' }],
      articleNote: '', annotations: [], tags: [], machineTags: [], isFavorite: false,
    }));

    initAnnotations(outputPath, configDir);
    const all = allHighlights();
    expect(all['2026-01-10-a.md']).toHaveLength(1);
    expect(all['2026-02-04-b.md']).toHaveLength(1);
  });
});

describe('allNotes', () => {
  test('returns all notes keyed by filename', () => {
    const dir1 = join(outputPath, '2026', '01');
    mkdirSync(dir1, { recursive: true });
    writeFileSync(join(dir1, '2026-01-10-a.md'), '# a');
    writeFileSync(join(dir1, '2026-01-10-a.annot.json'), JSON.stringify({
      highlights: [],
      articleNote: 'note a',
      annotations: [],
      tags: ['ai'],
      machineTags: ['tech'],
      isFavorite: true,
    }));

    initAnnotations(outputPath, configDir);
    const all = allNotes();
    expect(all['2026-01-10-a.md'].articleNote).toBe('note a');
    expect(all['2026-01-10-a.md'].tags).toEqual(['ai']);
    expect(all['2026-01-10-a.md'].machineTags).toEqual(['tech']);
    expect(all['2026-01-10-a.md'].isFavorite).toBe(true);
  });
});

describe('migrateMonolithicFiles', () => {
  test('migrates highlights.json and notes.json to per-article sidecars', () => {
    // Set up old-style monolithic files
    const highlightsData = {
      '2026-02-04-article.md': [
        { id: 'h1', text: 'highlighted text', color: 'yellow' }
      ],
      '2026-01-15-other.md': [
        { id: 'h2', text: 'other highlight', color: 'blue' }
      ],
    };
    const notesData = {
      '2026-02-04-article.md': {
        articleNote: 'my note',
        annotations: [],
        tags: ['philosophy'],
        isFavorite: true,
        machineTags: ['ethics', 'ai'],
      },
      '2026-01-15-other.md': {
        articleNote: '',
        annotations: [],
        tags: [],
        isFavorite: false,
      },
    };

    writeFileSync(join(configDir, 'highlights.json'), JSON.stringify(highlightsData));
    writeFileSync(join(configDir, 'notes.json'), JSON.stringify(notesData));

    // Create article files in output
    const dir1 = join(outputPath, '2026', '02');
    const dir2 = join(outputPath, '2026', '01');
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });
    writeFileSync(join(dir1, '2026-02-04-article.md'), '# article');
    writeFileSync(join(dir2, '2026-01-15-other.md'), '# other');

    const result = migrateMonolithicFiles(outputPath, configDir);
    expect(result.migrated).toBe(2);
    expect(result.orphaned).toBe(0);

    // Verify sidecar files were created
    const sidecar1 = JSON.parse(readFileSync(join(dir1, '2026-02-04-article.annot.json'), 'utf-8'));
    expect(sidecar1.highlights).toHaveLength(1);
    expect(sidecar1.highlights[0].id).toBe('h1');
    expect(sidecar1.articleNote).toBe('my note');
    expect(sidecar1.tags).toEqual(['philosophy']);
    expect(sidecar1.machineTags).toEqual(['ethics', 'ai']);
    expect(sidecar1.isFavorite).toBe(true);

    const sidecar2 = JSON.parse(readFileSync(join(dir2, '2026-01-15-other.annot.json'), 'utf-8'));
    expect(sidecar2.highlights).toHaveLength(1);
    expect(sidecar2.highlights[0].id).toBe('h2');
    expect(sidecar2.articleNote).toBe('');

    // Verify originals were renamed
    expect(existsSync(join(configDir, 'highlights.json'))).toBe(false);
    expect(existsSync(join(configDir, 'highlights.json.migrated'))).toBe(true);
    expect(existsSync(join(configDir, 'notes.json'))).toBe(false);
    expect(existsSync(join(configDir, 'notes.json.migrated'))).toBe(true);
  });

  test('collects orphaned annotations when article file is missing', () => {
    const highlightsData = {
      'deleted-article.md': [{ id: 'h1', text: 'orphan' }],
    };
    const notesData = {
      'deleted-article.md': {
        articleNote: 'orphan note',
        annotations: [],
        tags: ['lost'],
        isFavorite: false,
      },
    };

    writeFileSync(join(configDir, 'highlights.json'), JSON.stringify(highlightsData));
    writeFileSync(join(configDir, 'notes.json'), JSON.stringify(notesData));

    const result = migrateMonolithicFiles(outputPath, configDir);
    expect(result.migrated).toBe(0);
    expect(result.orphaned).toBe(1);

    // Verify orphaned file was created
    const orphanedPath = join(configDir, 'orphaned-annotations.json');
    expect(existsSync(orphanedPath)).toBe(true);
    const orphaned = JSON.parse(readFileSync(orphanedPath, 'utf-8'));
    expect(orphaned['deleted-article.md']).toBeDefined();
    expect(orphaned['deleted-article.md'].highlights).toHaveLength(1);
    expect(orphaned['deleted-article.md'].articleNote).toBe('orphan note');
  });

  test('is idempotent — skips when monolithic files already migrated', () => {
    // No monolithic files exist
    const result = migrateMonolithicFiles(outputPath, configDir);
    expect(result.migrated).toBe(0);
    expect(result.orphaned).toBe(0);
  });

  test('does not overwrite existing sidecar files', () => {
    const dir1 = join(outputPath, '2026', '02');
    mkdirSync(dir1, { recursive: true });
    writeFileSync(join(dir1, '2026-02-04-article.md'), '# article');

    // Pre-existing sidecar with user data
    writeFileSync(join(dir1, '2026-02-04-article.annot.json'), JSON.stringify({
      highlights: [{ id: 'existing', text: 'keep this' }],
      articleNote: 'existing note',
      annotations: [],
      tags: ['existing-tag'],
      machineTags: [],
      isFavorite: true,
    }));

    // Monolithic file with different data
    writeFileSync(join(configDir, 'highlights.json'), JSON.stringify({
      '2026-02-04-article.md': [{ id: 'old', text: 'should not overwrite' }],
    }));
    writeFileSync(join(configDir, 'notes.json'), JSON.stringify({
      '2026-02-04-article.md': {
        articleNote: 'old note',
        annotations: [],
        tags: ['old-tag'],
        isFavorite: false,
      },
    }));

    const result = migrateMonolithicFiles(outputPath, configDir);

    // Sidecar should be untouched
    const sidecar = JSON.parse(readFileSync(join(dir1, '2026-02-04-article.annot.json'), 'utf-8'));
    expect(sidecar.highlights[0].id).toBe('existing');
    expect(sidecar.articleNote).toBe('existing note');
  });
});
