// ABOUTME: Knowledge graph storage — initializes and manages the research PDS
// ABOUTME: Wraps loxodonta-core's PDS for entity, mention, edge, and extraction records

import { join } from 'path';
import { homedir } from 'os';
import { summarizeText } from './summarizer';

// Import storage directly to avoid pulling in server dependencies (express, cors)
const { createPDS } = require('loxodonta-core-monorepo/packages/loxodonta-core/src/storage/index.js');

type PDS = ReturnType<typeof createPDS>;

let _pds: PDS | null = null;

export function createResearchPDS(dbPath?: string): PDS {
  const path = dbPath || join(homedir(), '.pullread', 'research.db');
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

  for (const entity of parsed.entities) {
    pds.putRecord('app.pullread.entity', null, {
      name: entity.name,
      type: entity.type,
      role: entity.role || null,
      source: article.source || 'feed',
    });
  }

  for (const entity of parsed.entities) {
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
