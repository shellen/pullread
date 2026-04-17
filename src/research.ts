// ABOUTME: Knowledge graph storage — initializes and manages the research PDS
// ABOUTME: Stores entities, mentions, edges, and extraction records in SQLite

import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { readFileSync, mkdirSync } from 'fs';
import { summarizeText } from './summarizer';
import { listMarkdownFiles } from './writer';
import { fetchAndExtract } from './extractor';
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

const RESEARCH_COLLECTIONS = [
  'app.pullread.entity',
  'app.pullread.mention',
  'app.pullread.extraction',
  'app.pullread.edge',
  'app.pullread.watch',
  'app.pullread.watchMatch',
];

export function resetResearchData(pds: PDS): void {
  for (const collection of RESEARCH_COLLECTIONS) {
    pds.deleteCollection(collection);
  }
}

interface ArticleInput {
  filename: string;
  title: string;
  body: string;
  source?: string;
  publishedAt?: string;
}

const VALID_ENTITY_TYPES = new Set(['person', 'company', 'technology', 'place', 'event', 'concept', 'note']);

const TYPE_ALIASES: Record<string, string> = {
  organization: 'company', org: 'company', brand: 'company', band: 'company',
  group: 'company', 'music group': 'company', team: 'company', podcast: 'company',
  publication: 'company', institution: 'company', network: 'company',
  product: 'technology', software: 'technology', tool: 'technology', platform: 'technology',
  website: 'place', building: 'place', venue: 'place', country: 'place', city: 'place',
  animal: 'concept', species: 'concept', genre: 'concept', material: 'concept',
  'chemical compound': 'concept', character: 'concept', title: 'concept',
  'television show': 'concept', program: 'concept', award: 'concept',
  role: 'concept', people: 'person', year: 'event',
  show: 'concept', series: 'concept', listener: 'person',
  listeners: 'concept', host: 'person',
};

function normalizeEntityType(type: string): string {
  if (!type) return 'concept';
  const lower = type.toLowerCase().trim();
  if (VALID_ENTITY_TYPES.has(lower)) return lower;
  return TYPE_ALIASES[lower] || 'concept';
}

const VALID_SENTIMENTS = new Set(['positive', 'negative', 'neutral', 'mixed']);

// Applied after dots are stripped, so "Dr." becomes "dr", "Sen." becomes "sen"
const TITLE_PREFIXES = /^(president|dr|mr|mrs|ms|sir|lord|senator|sen|rep|gov|gen|col|sgt)\s+/i;

export function normalizeEntityName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\./g, '')        // U.S. → US, Dr. → Dr
    .replace(/^(the|a|an)\s+/i, '')
    .replace(TITLE_PREFIXES, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findExistingEntityName(pds: PDS, name: string): string | null {
  const normalized = normalizeEntityName(name);
  const entities = pds.listRecords('app.pullread.entity');
  for (const e of entities) {
    if (normalizeEntityName((e as any).value.name) === normalized) {
      return (e as any).value.name;
    }
  }
  return null;
}

function normalizeSentiment(sentiment?: string): string {
  if (!sentiment) return 'neutral';
  const lower = sentiment.toLowerCase().trim();
  return VALID_SENTIMENTS.has(lower) ? lower : 'neutral';
}

interface ExtractionResult {
  entities: Array<{ name: string; type: string; role?: string; sentiment?: string; stance?: string }>;
  relationships: Array<{ from: string; to: string; type: string }>;
  themes: string[];
}

function parseExtractionJson(text: string, context: string): ExtractionResult | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try { return JSON.parse(match[1]); } catch {}
    }
    console.warn(`[research] Failed to parse JSON from LLM (${context}):`, text.slice(0, 200));
    return null;
  }
}

export async function extractArticle(
  pds: PDS,
  article: ArticleInput,
): Promise<ExtractionResult | null> {
  const existing = pds.query('app.pullread.extraction', {
    where: { filename: article.filename },
  });
  if (existing.length > 0) return null;

  const prompt = `Extract structured information from this document as JSON.

STRICT RULES:
- entities: array of { name, type, sentiment, stance } where:
  - type MUST be exactly one of: person, company, technology, place, event, concept
    - "person" = individual humans
    - "company" = companies, brands, organizations, bands, teams, podcasts, publications
    - "technology" = software, hardware, protocols, scientific concepts, products
    - "place" = countries, cities, buildings, venues, websites/platforms
    - "event" = named events, conferences, wars, elections
    - "concept" = abstract ideas, genres, movements, themes
    - Do NOT invent new types. If unsure, use "concept".
  - sentiment MUST be exactly one of: positive, negative, neutral, mixed
    - How does this document portray this entity? Use "neutral" if no clear sentiment.
  - stance: a short phrase (3-6 words) capturing the document's position on this entity, or null if neutral
- relationships: array of { from, to, type } connecting entity names
- themes: array of short topic strings

Document title: ${article.title}

${article.body.slice(0, 8000)}`;

  const result = await summarizeText(prompt);
  const parsed = parseExtractionJson(result.summary, `article:${article.filename}`);
  if (!parsed || !parsed.entities || !Array.isArray(parsed.entities)) return null;
  if (!parsed.relationships) parsed.relationships = [];
  if (!parsed.themes) parsed.themes = [];

  // Normalize entity types to the canonical set
  for (const entity of parsed.entities) {
    entity.type = normalizeEntityType(entity.type);
  }

  // Build name mapping: LLM-extracted name -> canonical stored name
  const nameMap = new Map<string, string>();

  for (const entity of parsed.entities) {
    if (!entity.name || !entity.type) continue;
    const existingName = findExistingEntityName(pds, entity.name);
    const canonicalName = existingName || entity.name;
    nameMap.set(entity.name, canonicalName);

    if (!existingName) {
      pds.putRecord('app.pullread.entity', null, {
        name: canonicalName,
        type: entity.type,
        role: entity.role || null,
        source: article.source || 'feed',
      });
    }

    const sentiment = normalizeSentiment(entity.sentiment);
    pds.putRecord('app.pullread.mention', null, {
      entityName: canonicalName,
      filename: article.filename,
      title: article.title,
      source: article.source || 'feed',
      origin: 'extracted',
      sentiment,
      stance: sentiment === 'neutral' ? null : (entity.stance || null),
      publishedAt: article.publishedAt || null,
    });
  }

  for (const rel of parsed.relationships) {
    pds.putRecord('app.pullread.edge', null, {
      from: nameMap.get(rel.from) || rel.from,
      to: nameMap.get(rel.to) || rel.to,
      type: rel.type,
      origin: 'extracted',
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

export async function extractFromUrl(
  pds: PDS,
  url: string,
): Promise<ExtractionResult | null> {
  const content = await fetchAndExtract(url);
  if (!content || !content.markdown) return null;

  const filename = `url-import-${Date.now()}.md`;
  return extractArticle(pds, {
    filename,
    title: content.title || url,
    body: content.markdown,
    source: 'url-import',
  });
}

interface NoteInput {
  noteId: string;
  content: string;
  sourceArticle: string;
}

const noteExtractLocks = new Map<string, Promise<ExtractionResult | null>>();

export async function extractNote(
  pds: PDS,
  note: NoteInput,
): Promise<ExtractionResult | null> {
  const prior = noteExtractLocks.get(note.noteId);
  const mine = (async () => {
    if (prior) await prior.catch(() => {});
    return doExtractNote(pds, note);
  })();
  noteExtractLocks.set(note.noteId, mine);
  try {
    return await mine;
  } finally {
    if (noteExtractLocks.get(note.noteId) === mine) {
      noteExtractLocks.delete(note.noteId);
    }
  }
}

async function doExtractNote(
  pds: PDS,
  note: NoteInput,
): Promise<ExtractionResult | null> {
  const noteFilename = `note:${note.noteId}`;

  // Clear previous note-origin mentions and edges for this note
  const existingMentions = pds.query('app.pullread.mention', {
    where: { origin: 'note', filename: noteFilename },
  });
  for (const m of existingMentions) {
    pds.deleteRecord('app.pullread.mention', m.rkey);
  }
  const existingEdges = pds.query('app.pullread.edge', {
    where: { origin: 'note', sourceFilename: noteFilename },
  });
  for (const e of existingEdges) {
    pds.deleteRecord('app.pullread.edge', e.rkey);
  }

  // Delete previous extraction record for this note
  const prevExtraction = pds.query('app.pullread.extraction', {
    where: { filename: noteFilename },
  });
  for (const ex of prevExtraction) {
    pds.deleteRecord('app.pullread.extraction', ex.rkey);
  }

  if (!note.content || note.content.trim().length < 10) return null;

  const prompt = `This is the user's own notes. Entities here represent the user's active interests.

Extract structured information from this note as JSON.

STRICT RULES:
- entities: array of { name, type, sentiment, stance } where:
  - type MUST be exactly one of: person, company, technology, place, event, concept
  - sentiment MUST be exactly one of: positive, negative, neutral, mixed
  - stance: a short phrase (3-6 words) or null
- relationships: array of { from, to, type } connecting entity names
- themes: array of short topic strings

Note content:

${note.content.slice(0, 4000)}`;

  const result = await summarizeText(prompt);
  const parsed = parseExtractionJson(result.summary, `note:${note.noteId}`);
  if (!parsed || !parsed.entities || !Array.isArray(parsed.entities)) return null;
  if (!parsed.relationships) parsed.relationships = [];
  if (!parsed.themes) parsed.themes = [];

  for (const entity of parsed.entities) {
    entity.type = normalizeEntityType(entity.type);
  }

  // Create the note entity itself
  const noteEntityName = `note:${note.noteId}`;
  const existingNoteEntity = findExistingEntityName(pds, noteEntityName);
  if (!existingNoteEntity) {
    pds.putRecord('app.pullread.entity', null, {
      name: noteEntityName,
      type: 'note',
      role: null,
      source: 'note',
    });
  }

  const nameMap = new Map<string, string>();

  for (const entity of parsed.entities) {
    if (!entity.name || !entity.type) continue;
    const existingName = findExistingEntityName(pds, entity.name);
    const canonicalName = existingName || entity.name;
    nameMap.set(entity.name, canonicalName);

    if (!existingName) {
      pds.putRecord('app.pullread.entity', null, {
        name: canonicalName,
        type: entity.type,
        role: entity.role || null,
        source: 'note',
      });
    }

    const sentiment = normalizeSentiment(entity.sentiment);
    pds.putRecord('app.pullread.mention', null, {
      entityName: canonicalName,
      filename: noteFilename,
      title: note.content.slice(0, 60),
      source: 'note',
      origin: 'note',
      sentiment,
      stance: sentiment === 'neutral' ? null : (entity.stance || null),
      publishedAt: null,
    });
  }

  for (const rel of parsed.relationships) {
    pds.putRecord('app.pullread.edge', null, {
      from: nameMap.get(rel.from) || rel.from,
      to: nameMap.get(rel.to) || rel.to,
      type: rel.type,
      origin: 'note',
      sourceFilename: noteFilename,
    });
  }

  // If note has a source article, create edges from note entity to article entities
  if (note.sourceArticle) {
    const articleEntities = queryRelatedEntities(pds, note.sourceArticle);
    for (const ae of articleEntities) {
      pds.putRecord('app.pullread.edge', null, {
        from: noteEntityName,
        to: ae.name,
        type: 'references',
        origin: 'note',
        sourceFilename: noteFilename,
      });
    }
  }

  pds.putRecord('app.pullread.extraction', null, {
    filename: noteFilename,
    extractedAt: new Date().toISOString(),
    entityCount: parsed.entities.length,
    themes: parsed.themes,
    source: 'note',
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
  let entities = opts.type
    ? pds.query('app.pullread.entity', { where: { type: opts.type } })
    : pds.listRecords('app.pullread.entity');

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

interface GraphData {
  entities: any[];
  edges: any[];
  overflow: number;
}

export function queryGraphData(pds: PDS, opts?: { maxNodes?: number }): GraphData {
  const maxNodes = opts?.maxNodes || 200;

  // Compute weighted mention counts per entity
  const mentions = pds.listRecords('app.pullread.mention');
  const weightedCounts = new Map<string, number>();
  const rawCounts = new Map<string, number>();
  for (const m of mentions) {
    const name = (m as any).value.entityName;
    const origin = (m as any).value.origin || 'extracted';
    const weight = origin === 'note' ? 2 : origin === 'highlight' ? 3 : 1;
    weightedCounts.set(name, (weightedCounts.get(name) || 0) + weight);
    rawCounts.set(name, (rawCounts.get(name) || 0) + 1);
  }

  let entities = pds.listRecords('app.pullread.entity').map((e: any) => ({
    rkey: e.rkey,
    name: e.value.name,
    type: e.value.type,
    mentionCount: rawCounts.get(e.value.name) || 0,
    weightedMentionCount: weightedCounts.get(e.value.name) || 0,
  }));

  entities.sort((a: any, b: any) => b.weightedMentionCount - a.weightedMentionCount);
  const overflow = Math.max(0, entities.length - maxNodes);
  entities = entities.slice(0, maxNodes);

  const entityNames = new Set(entities.map((e: any) => e.name));
  const edges = pds.listRecords('app.pullread.edge')
    .filter((e: any) => entityNames.has(e.value.from) && entityNames.has(e.value.to));

  return { entities, edges, overflow };
}

export function queryEntityProfile(pds: PDS, rkey: string) {
  const entity = pds.getRecord('app.pullread.entity', rkey);
  if (!entity) return null;

  const mentions = pds.query('app.pullread.mention', {
    where: { entityName: entity.value.name },
  });
  const edges = edgesTouching(pds, entity.value.name);

  return { entity: entity.value, rkey, mentions, edges };
}

export function queryRelatedEntities(pds: PDS, filename: string) {
  const mentions = pds.query('app.pullread.mention', { where: { filename } });
  const entityNames = new Set(mentions.map((m: any) => m.value.entityName));
  const entities = pds.listRecords('app.pullread.entity')
    .filter((e: any) => entityNames.has(e.value.name));

  return entities.map((e: any) => ({
    rkey: e.rkey,
    name: e.value.name,
    type: e.value.type,
  }));
}

function edgesTouching(pds: PDS, entityName: string): any[] {
  const fromEdges = pds.query('app.pullread.edge', { where: { from: entityName } });
  const toEdges = pds.query('app.pullread.edge', { where: { to: entityName } });
  const byRkey = new Map<string, any>();
  for (const e of fromEdges) byRkey.set(e.rkey, e);
  for (const e of toEdges) byRkey.set(e.rkey, e);
  return [...byRkey.values()].sort((a, b) => a.rkey < b.rkey ? -1 : a.rkey > b.rkey ? 1 : 0);
}

interface TensionMention {
  filename: string;
  title: string;
  sentiment: string;
  stance: string | null;
  publishedAt: string | null;
}

interface Tension {
  entityName: string;
  entityType: string;
  positive: TensionMention[];
  negative: TensionMention[];
  mentionCount: number;
}

export function queryTensions(pds: PDS, minMentions = 3): Tension[] {
  const mentions = pds.listRecords('app.pullread.mention');

  const byEntity = new Map<string, any[]>();
  for (const m of mentions) {
    const name = (m as any).value.entityName;
    if (!byEntity.has(name)) byEntity.set(name, []);
    byEntity.get(name)!.push((m as any).value);
  }

  const entities = pds.listRecords('app.pullread.entity');
  const entityTypes = new Map<string, string>();
  for (const e of entities) {
    entityTypes.set((e as any).value.name, (e as any).value.type);
  }

  const tensions: Tension[] = [];
  for (const [name, entityMentions] of byEntity) {
    if (entityMentions.length < minMentions) continue;

    const positive = entityMentions.filter((m: any) => m.sentiment === 'positive' || m.sentiment === 'mixed');
    const negative = entityMentions.filter((m: any) => m.sentiment === 'negative' || m.sentiment === 'mixed');

    if (positive.length === 0 || negative.length === 0) continue;

    const toMention = (m: any): TensionMention => ({
      filename: m.filename,
      title: m.title,
      sentiment: m.sentiment,
      stance: m.stance || null,
      publishedAt: m.publishedAt || null,
    });

    tensions.push({
      entityName: name,
      entityType: entityTypes.get(name) || 'concept',
      positive: positive.map(toMention),
      negative: negative.map(toMention),
      mentionCount: entityMentions.length,
    });
  }

  tensions.sort((a, b) => b.mentionCount - a.mentionCount);
  return tensions;
}

// --- Entity brief ---

interface EntityBrief {
  summary: string;
  wikipediaUrl: string;
  mentionCount: number;
}

export function gatherEntityContext(pds: PDS, entityName: string): {
  entity: any;
  mentions: any[];
  edges: any[];
  sentimentBreakdown: Record<string, number>;
  stances: string[];
  relatedEntities: Array<{ name: string; relationship: string }>;
} | null {
  const matches = pds.query('app.pullread.entity', { where: { name: entityName }, limit: 1 });
  const entity = matches[0];
  if (!entity) return null;

  const mentions = pds.query('app.pullread.mention', { where: { entityName } });
  const edges = edgesTouching(pds, entityName);

  const sentimentBreakdown: Record<string, number> = {};
  const stances: string[] = [];
  for (const m of mentions) {
    const s = (m as any).value.sentiment || 'neutral';
    sentimentBreakdown[s] = (sentimentBreakdown[s] || 0) + 1;
    if ((m as any).value.stance) stances.push((m as any).value.stance);
  }

  // Deduplicate related entities
  const relMap = new Map<string, string>();
  for (const edge of edges) {
    const other = (edge as any).value.from === entityName
      ? (edge as any).value.to
      : (edge as any).value.from;
    if (!relMap.has(other)) relMap.set(other, (edge as any).value.type);
  }
  const relatedEntities = Array.from(relMap.entries()).map(([name, relationship]) => ({ name, relationship }));

  return { entity: (entity as any).value, mentions, edges, sentimentBreakdown, stances, relatedEntities };
}

export async function generateEntityBrief(pds: PDS, entityName: string): Promise<EntityBrief | null> {
  const ctx = gatherEntityContext(pds, entityName);
  if (!ctx) return null;

  const wikiSlug = entityName.replace(/\s+/g, '_');
  const wikipediaUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiSlug).replace(/%2F/g, '/')}`;

  const articleTitles = ctx.mentions.map((m: any) => m.value.title).slice(0, 10);
  const relatedSummary = ctx.relatedEntities.slice(0, 8)
    .map(r => `${r.name} (${r.relationship})`).join(', ');

  const prompt = `Write a 2-3 sentence research insight about "${entityName}" based ONLY on the data below. Synthesize the sentiment, relationships, and stances into a narrative. Be specific and analytical, not generic. Do NOT start with "${entityName} is a...". Just write the insight paragraph, nothing else.

Type: ${ctx.entity.type}
Mentioned in ${ctx.mentions.length} articles: ${articleTitles.join(', ')}
Sentiment: ${Object.entries(ctx.sentimentBreakdown).map(([k, v]) => `${v} ${k}`).join(', ')}
Stances: ${ctx.stances.slice(0, 6).join('; ') || 'none recorded'}
Related: ${relatedSummary || 'none'}`;

  try {
    const result = await summarizeText(prompt);
    return { summary: result.summary.trim(), wikipediaUrl, mentionCount: ctx.mentions.length };
  } catch {
    // Fallback to simple template if LLM fails
    let summary = `${entityName} appears in ${ctx.mentions.length} article${ctx.mentions.length === 1 ? '' : 's'}`;
    if (ctx.relatedEntities.length > 0) {
      summary += `, connected to ${ctx.relatedEntities.slice(0, 3).map(r => r.name).join(', ')}`;
    }
    summary += '.';
    return { summary, wikipediaUrl, mentionCount: ctx.mentions.length };
  }
}

// --- Watchlists ---

interface WatchInput {
  type: 'entity' | 'query';
  entityName?: string;
  query?: string;
}

export function addWatch(pds: PDS, input: WatchInput) {
  return pds.putRecord('app.pullread.watch', null, {
    type: input.type,
    entityName: input.entityName || null,
    query: input.query || null,
    createdAt: new Date().toISOString(),
    lastMatchAt: null,
  });
}

export function removeWatch(pds: PDS, rkey: string) {
  pds.deleteRecord('app.pullread.watch', rkey);
}

export function listWatches(pds: PDS) {
  return pds.listRecords('app.pullread.watch');
}

export function checkWatchMatches(pds: PDS): number {
  const watches = pds.listRecords('app.pullread.watch');
  const existingMatches = pds.listRecords('app.pullread.watchMatch');
  const matchedKeys = new Set(existingMatches.map((m: any) =>
    m.value.watchRkey + ':' + m.value.filename
  ));

  let newMatches = 0;

  for (const watch of watches) {
    const w = watch.value as any;

    if (w.type === 'entity' && w.entityName) {
      const mentions = pds.query('app.pullread.mention', {
        where: { entityName: w.entityName },
      });
      for (const mention of mentions) {
        const key = watch.rkey + ':' + (mention as any).value.filename;
        if (matchedKeys.has(key)) continue;
        matchedKeys.add(key);
        pds.putRecord('app.pullread.watchMatch', null, {
          watchRkey: watch.rkey,
          watchType: 'entity',
          entityName: w.entityName,
          filename: (mention as any).value.filename,
          title: (mention as any).value.title,
          matchedAt: new Date().toISOString(),
          seen: false,
        });
        newMatches++;
      }
    }

    if (w.type === 'query' && w.query) {
      const queryLower = w.query.toLowerCase();
      const extractions = pds.listRecords('app.pullread.extraction');
      for (const ext of extractions) {
        const themes: string[] = (ext as any).value.themes || [];
        const matches = themes.some((t: string) => t.toLowerCase().includes(queryLower));
        if (!matches) continue;

        const key = watch.rkey + ':' + (ext as any).value.filename;
        if (matchedKeys.has(key)) continue;
        matchedKeys.add(key);
        pds.putRecord('app.pullread.watchMatch', null, {
          watchRkey: watch.rkey,
          watchType: 'query',
          query: w.query,
          filename: (ext as any).value.filename,
          title: null,
          matchedAt: new Date().toISOString(),
          seen: false,
        });
        newMatches++;
      }
    }
  }

  return newMatches;
}

export function getUnseenMatches(pds: PDS) {
  return pds.query('app.pullread.watchMatch', { where: { seen: false } });
}

export function markMatchesSeen(pds: PDS) {
  const unseen = getUnseenMatches(pds);
  for (const match of unseen) {
    pds.putRecord('app.pullread.watchMatch', match.rkey, {
      ...(match as any).value,
      seen: true,
    });
  }
}
