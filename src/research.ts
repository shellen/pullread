// ABOUTME: Knowledge graph storage — initializes and manages the research PDS
// ABOUTME: Stores entities, mentions, edges, and extraction records in SQLite

import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { readFileSync, mkdirSync } from 'fs';
import { summarizeText } from './summarizer';
import { listMarkdownFiles } from './writer';
import { createPDS } from './research-db';

type PDS = ReturnType<typeof createPDS>;

let _pds: PDS | null = null;

export function createResearchPDS(dbPath?: string): PDS {
  const path = dbPath || join(homedir(), '.pullread', 'research.db');
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  return createPDS({ db: path, did: 'did:web:pullread.local' });
}

export function getResearchPDS(): PDS {
  if (!_pds) {
    _pds = createResearchPDS();
  }
  return _pds;
}

export function closeResearchPDS(): void {
  if (_pds) {
    _pds.close();
    _pds = null;
  }
}

interface ArticleInput {
  filename: string;
  title: string;
  body: string;
  source?: string;
}

interface ExtractionResult {
  entities: Array<{ name: string; type: string; role?: string }>;
  relationships: Array<{ from: string; to: string; type: string }>;
  themes: string[];
}

export async function extractArticle(
  pds: PDS,
  article: ArticleInput,
): Promise<ExtractionResult | null> {
  const existing = pds.query('app.pullread.extraction', {
    where: { filename: article.filename },
  });
  if (existing.length > 0) return null;

  const prompt = `You are an analyst. Extract structured information from this document.
Return ONLY valid JSON with these fields:
- entities: array of { name, type, role? } where type is one of: person, company, technology, place, event, concept
- relationships: array of { from, to, type } describing connections between entities
- themes: array of strings

Document title: ${article.title}

${article.body.slice(0, 8000)}`;

  const result = await summarizeText(prompt);
  let parsed: ExtractionResult;
  try {
    parsed = JSON.parse(result.summary);
  } catch {
    const jsonMatch = result.summary.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      return null;
    }
  }

  if (!parsed.entities || !Array.isArray(parsed.entities)) return null;
  if (!parsed.relationships) parsed.relationships = [];
  if (!parsed.themes) parsed.themes = [];

  for (const entity of parsed.entities) {
    if (!entity.name || !entity.type) continue;
    const existing = pds.query('app.pullread.entity', {
      where: { name: entity.name },
    });
    if (existing.length === 0) {
      pds.putRecord('app.pullread.entity', null, {
        name: entity.name,
        type: entity.type,
        role: entity.role || null,
        source: article.source || 'feed',
      });
    }

    pds.putRecord('app.pullread.mention', null, {
      entityName: entity.name,
      filename: article.filename,
      title: article.title,
      source: article.source || 'feed',
    });
  }

  for (const rel of parsed.relationships) {
    pds.putRecord('app.pullread.edge', null, {
      from: rel.from,
      to: rel.to,
      type: rel.type,
      sourceFilename: article.filename,
    });
  }

  pds.putRecord('app.pullread.extraction', null, {
    filename: article.filename,
    extractedAt: new Date().toISOString(),
    entityCount: parsed.entities.length,
    themes: parsed.themes,
    source: article.source || 'feed',
  });

  return parsed;
}

// Dynamic require for optional loxodonta-core modules (embeddings, resolver, graph)
// that pull in native deps like sqlite-vec — only loaded when actually called
const _loxBase = ['loxodonta-core-monorepo', 'packages', 'loxodonta-core', 'src'].join('/');
const _loxModule = (mod: string) => require(`${_loxBase}/${mod}`);

export function initResolver(
  pds: PDS,
  geminiApiKey: string | null,
) {
  if (!geminiApiKey) return null;

  const { createEmbedder } = _loxModule('embeddings/index.js');
  const { geminiEmbeddings } = _loxModule('embeddings/gemini.js');
  const { createResolver } = _loxModule('resolve/index.js');

  const embedder = createEmbedder({
    provider: geminiEmbeddings({
      apiKey: geminiApiKey,
      model: 'gemini-embedding-001',
    }),
    dimensions: 768,
  });

  return createResolver({ pds, embedder, threshold: 0.5 });
}

export function createResearchGraph(pds: PDS) {
  const { createGraph } = _loxModule('graph/index.js');
  return createGraph(pds);
}

function parseFrontmatterTitle(text: string): { title: string; body: string } | null {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/);
  if (!match) return null;
  const titleMatch = match[1].match(/^title:\s*"?(.+?)"?\s*$/m);
  return { title: titleMatch ? titleMatch[1] : 'Untitled', body: match[2] };
}

export async function runBackgroundExtraction(
  pds: PDS,
  outputPath: string,
): Promise<{ extracted: number; skipped: number; errors: number }> {
  const allPaths = listMarkdownFiles(outputPath);
  const extracted = pds.listRecords('app.pullread.extraction');
  const extractedSet = new Set(extracted.map((r: any) => r.value.filename));

  let extractedCount = 0;
  let skipped = 0;
  let errors = 0;

  for (const filePath of allPaths) {
    const filename = basename(filePath);
    if (filename.startsWith('_')) { skipped++; continue; }
    if (extractedSet.has(filename)) { skipped++; continue; }

    try {
      const text = readFileSync(filePath, 'utf-8');
      const parsed = parseFrontmatterTitle(text);
      if (!parsed) { skipped++; continue; }

      await extractArticle(pds, {
        filename,
        title: parsed.title,
        body: parsed.body,
        source: 'feed',
      });
      extractedCount++;
    } catch (err) {
      errors++;
      console.log(`  Research extraction failed for ${filename}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return { extracted: extractedCount, skipped, errors };
}

interface EntityResult {
  rkey: string;
  name: string;
  type: string;
  mentionCount: number;
}

interface QueryOptions {
  search?: string;
  type?: string;
  limit?: number;
}

export function queryEntities(pds: PDS, opts: QueryOptions): EntityResult[] {
  let entities = pds.listRecords('app.pullread.entity');

  if (opts.type) {
    entities = entities.filter((e: any) => e.value.type === opts.type);
  }
  if (opts.search) {
    const term = opts.search.toLowerCase();
    entities = entities.filter((e: any) => e.value.name.toLowerCase().includes(term));
  }

  const mentions = pds.listRecords('app.pullread.mention');
  const mentionCounts = new Map<string, number>();
  for (const m of mentions) {
    const name = (m as any).value.entityName;
    mentionCounts.set(name, (mentionCounts.get(name) || 0) + 1);
  }

  const results: EntityResult[] = entities.map((e: any) => ({
    rkey: e.rkey,
    name: e.value.name,
    type: e.value.type,
    mentionCount: mentionCounts.get(e.value.name) || 0,
  }));

  results.sort((a, b) => b.mentionCount - a.mentionCount);
  return opts.limit ? results.slice(0, opts.limit) : results;
}

export function queryEntityProfile(pds: PDS, rkey: string) {
  const entity = pds.getRecord('app.pullread.entity', rkey);
  if (!entity) return null;

  const mentions = pds.listRecords('app.pullread.mention')
    .filter((m: any) => m.value.entityName === entity.value.name);

  const edges = pds.listRecords('app.pullread.edge')
    .filter((e: any) => e.value.from === entity.value.name || e.value.to === entity.value.name);

  return { entity: entity.value, rkey, mentions, edges };
}

export function queryRelatedEntities(pds: PDS, filename: string) {
  const mentions = pds.listRecords('app.pullread.mention')
    .filter((m: any) => m.value.filename === filename);

  const entityNames = new Set(mentions.map((m: any) => m.value.entityName));
  const entities = pds.listRecords('app.pullread.entity')
    .filter((e: any) => entityNames.has(e.value.name));

  return entities.map((e: any) => ({
    rkey: e.rkey,
    name: e.value.name,
    type: e.value.type,
  }));
}
