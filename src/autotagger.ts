// ABOUTME: Automatic machine tagging of articles using LLM providers
// ABOUTME: Extracts topic, entity, and theme tags for relational mapping between articles

import { readFileSync } from 'fs';
import { basename } from 'path';
import { summarizeText, loadLLMConfig, LLMConfig, Provider, getDefaultModel } from './summarizer';
import { listMarkdownFiles, resolveFilePath } from './writer';
import { loadAnnotation, saveAnnotation, allNotes } from './annotations';

const AUTOTAG_PROMPT = `Extract 3-8 machine tags from this article for relational mapping, and classify the article into an editorial section. Tags should help identify connections between articles. Include:
- Main topics (e.g., "artificialintelligence", "climatechange", "economics")
- Key entities mentioned prominently — people, companies, technologies, places
- Themes (e.g., "regulation", "opensource", "privacy", "fundraising")

Return ONLY a valid JSON object with two fields:
- "tags": array of lowercase tag strings with no spaces or dashes
- "section": one of "tech", "news", "science", "business", "culture", "opinion", "lifestyle"

No explanation, no markdown formatting — just the raw JSON object.
Example: {"tags": ["artificialintelligence","openai","regulation","samaltman","safety"], "section": "tech"}
For non-English articles, use English tags where a clear English equivalent exists, but keep proper nouns and culturally specific terms in their original language.`;

interface AutotagResult {
  machineTags: string[];
  section?: string;
  model: string;
}

const VALID_SECTIONS = ['tech', 'news', 'science', 'business', 'culture', 'opinion', 'lifestyle'];


/**
 * Extract machine tags from article text using the configured LLM.
 * Reuses the same provider infrastructure as the summarizer.
 */
export async function autotagText(articleText: string, config?: LLMConfig): Promise<AutotagResult> {
  const llmConfig = config || loadLLMConfig() || { provider: 'apple' as Provider, apiKey: '' };

  // We call summarizeText with a custom prompt by prepending the autotag prompt
  // to the article text, which works because summarizeText passes the full text
  // to the LLM. Instead, we'll use the same provider functions directly.
  // For simplicity, we construct a prompt that includes our instruction + article text.
  const trimmed = articleText.split(/\s+/).slice(0, 4000).join(' ');
  const prompt = `${AUTOTAG_PROMPT}\n\n---\n\n${trimmed}`;

  // Use summarizeText which handles all provider routing
  // The "summary" we get back will actually be a JSON array of tags
  const result = await summarizeText(prompt, {
    ...llmConfig,
    // We still use the same model; the prompt determines the output format
  });

  const { machineTags, section } = parseAutotagResponse(result.summary);
  return { machineTags, section, model: result.model };
}

/**
 * Parse tags and optional section from the LLM response.
 * Handles both object format {tags, section} and legacy array format.
 */
function parseAutotagResponse(response: string): { machineTags: string[]; section?: string } {
  let text = response.trim();
  text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  text = text.trim();

  const normalizeTags = (arr: unknown[]): string[] =>
    arr
      .filter((t: unknown): t is string => typeof t === 'string')
      .map(t => t.toLowerCase().trim().replace(/[\s\-]+/g, ''))
      .filter(t => t.length > 0 && t.length <= 50);

  const validateSection = (s: unknown): string | undefined =>
    typeof s === 'string' && VALID_SECTIONS.includes(s.toLowerCase()) ? s.toLowerCase() : undefined;

  try {
    const parsed = JSON.parse(text);
    if (parsed && !Array.isArray(parsed) && typeof parsed === 'object' && Array.isArray(parsed.tags)) {
      return { machineTags: normalizeTags(parsed.tags), section: validateSection(parsed.section) };
    }
    if (Array.isArray(parsed)) {
      return { machineTags: normalizeTags(parsed) };
    }
  } catch {
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const parsed = JSON.parse(objMatch[0]);
        if (parsed && Array.isArray(parsed.tags)) {
          return { machineTags: normalizeTags(parsed.tags), section: validateSection(parsed.section) };
        }
      } catch {}
    }
    const arrayMatch = text.match(/\[[\s\S]*?\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed)) {
          return { machineTags: normalizeTags(parsed) };
        }
      } catch {}
    }
  }

  return { machineTags: [] };
}

/**
 * Check if an article already has machine tags.
 */
export function hasMachineTags(filename: string): boolean {
  const annot = loadAnnotation(filename);
  return annot.machineTags.length > 0;
}

/**
 * Save machine tags for an article. Preserves existing user data.
 */
export function saveMachineTags(filename: string, machineTags: string[], section?: string): void {
  const existing = loadAnnotation(filename);
  const update = { ...existing, machineTags };
  if (section) update.section = section;
  saveAnnotation(filename, update);
}

/**
 * Strip dashes from all existing machine tags.
 * Idempotent — safe to call multiple times.
 */
export function migrateDashedTags(): number {
  const notes = allNotes();
  let migrated = 0;
  for (const [filename, entry] of Object.entries(notes)) {
    if (entry.machineTags && entry.machineTags.length > 0) {
      const fixed = entry.machineTags.map((t: string) => t.replace(/[\s\-]+/g, ''));
      if (fixed.some((t: string, i: number) => t !== entry.machineTags[i])) {
        const annot = loadAnnotation(filename);
        saveAnnotation(filename, { ...annot, machineTags: fixed });
        migrated++;
      }
    }
  }
  return migrated;
}

/**
 * Batch auto-tag all articles in the output directory that don't already have machine tags.
 */
export async function autotagBatch(
  outputPath: string,
  options: { minSize?: number; config?: LLMConfig; force?: boolean } = {}
): Promise<{ tagged: number; skipped: number; failed: number }> {
  const minSize = options.minSize ?? 500;
  const force = options.force ?? false;
  const llmConfig = options.config || loadLLMConfig();
  if (!llmConfig) {
    throw new Error('No LLM configuration found. Configure an API key in settings.');
  }

  const files: string[] = listMarkdownFiles(outputPath)
    .map(f => basename(f))
    .filter(f => !f.startsWith('_'));

  let tagged = 0;
  let skipped = 0;
  let failed = 0;

  const activeModel = llmConfig.model || getDefaultModel(llmConfig.provider);
  console.log(`  Using ${llmConfig.provider} / ${activeModel}`);

  for (const file of files) {
    // Skip if already has machine tags (unless force mode)
    if (!force && hasMachineTags(file)) {
      skipped++;
      continue;
    }

    const filePath = resolveFilePath(outputPath, file);
    const content = readFileSync(filePath, 'utf-8');

    // Get article body (strip frontmatter)
    const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const body = match ? match[1] : content;

    if (body.length < minSize) {
      skipped++;
      continue;
    }

    const titleMatch = content.match(/^title: "?(.*?)"?\s*$/m);
    const title = titleMatch ? titleMatch[1].slice(0, 50) : file;

    try {
      process.stdout.write(`  ${title}...`);
      const result = await autotagText(body, llmConfig);

      if (result.machineTags.length > 0) {
        saveMachineTags(file, result.machineTags, result.section);
        console.log(` [${result.machineTags.join(', ')}]${result.section ? ` (${result.section})` : ''}`);
        tagged++;
      } else {
        console.log(' no tags extracted');
        skipped++;
      }
    } catch (err) {
      console.log(` failed: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  return { tagged, skipped, failed };
}
