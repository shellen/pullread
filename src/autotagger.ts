// ABOUTME: Automatic machine tagging of articles using LLM providers
// ABOUTME: Extracts topic, entity, and theme tags for relational mapping between articles

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { summarizeText, loadLLMConfig, LLMConfig, Provider } from './summarizer';

const NOTES_PATH = join(homedir(), '.config', 'pullread', 'notes.json');

const AUTOTAG_PROMPT = `Extract 3-8 machine tags from this article for relational mapping. Tags should help identify connections between articles. Include:
- Main topics (e.g., "artificial-intelligence", "climate-change", "economics")
- Key entities mentioned prominently — people, companies, technologies, places
- Themes (e.g., "regulation", "open-source", "privacy", "fundraising")

Return ONLY a valid JSON array of lowercase, hyphenated tag strings. No explanation, no markdown formatting — just the raw JSON array.
Example: ["artificial-intelligence","openai","regulation","sam-altman","safety"]`;

interface AutotagResult {
  machineTags: string[];
  model: string;
}

function loadNotesFile(): Record<string, any> {
  if (!existsSync(NOTES_PATH)) return {};
  try {
    return JSON.parse(readFileSync(NOTES_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveNotesFile(notes: Record<string, any>): void {
  const dir = join(homedir(), '.config', 'pullread');
  if (!existsSync(dir)) {
    require('fs').mkdirSync(dir, { recursive: true });
  }
  require('fs').writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2));
}

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

  const machineTags = parseTagsFromResponse(result.summary);
  return { machineTags, model: result.model };
}

/**
 * Parse a JSON array of tags from the LLM response.
 * Handles common formatting issues like markdown code blocks.
 */
function parseTagsFromResponse(response: string): string[] {
  let text = response.trim();

  // Strip markdown code block if present
  text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  text = text.trim();

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((t: unknown): t is string => typeof t === 'string')
        .map(t => t.toLowerCase().trim().replace(/\s+/g, '-'))
        .filter(t => t.length > 0 && t.length <= 50);
    }
  } catch {
    // Try to extract array-like content from the response
    const arrayMatch = text.match(/\[[\s\S]*?\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((t: unknown): t is string => typeof t === 'string')
            .map(t => t.toLowerCase().trim().replace(/\s+/g, '-'))
            .filter(t => t.length > 0 && t.length <= 50);
        }
      } catch {}
    }
  }

  return [];
}

/**
 * Check if an article already has machine tags in notes.json.
 */
export function hasMachineTags(filename: string): boolean {
  const notes = loadNotesFile();
  const entry = notes[filename];
  return entry?.machineTags && Array.isArray(entry.machineTags) && entry.machineTags.length > 0;
}

/**
 * Save machine tags for an article into notes.json.
 * Preserves existing user tags and other note data.
 */
export function saveMachineTags(filename: string, machineTags: string[]): void {
  const notes = loadNotesFile();
  const existing = notes[filename] || {
    articleNote: '',
    annotations: [],
    tags: [],
    isFavorite: false
  };
  existing.machineTags = machineTags;
  notes[filename] = existing;
  saveNotesFile(notes);
}

/**
 * Batch auto-tag all articles in the output directory that don't already have machine tags.
 */
export async function autotagBatch(
  outputPath: string,
  options: { minSize?: number; config?: LLMConfig } = {}
): Promise<{ tagged: number; skipped: number; failed: number }> {
  const { readdirSync } = require('fs');
  const { extname } = require('path');

  const minSize = options.minSize ?? 500;
  const llmConfig = options.config || loadLLMConfig();
  if (!llmConfig) {
    throw new Error('No LLM configuration found. Configure an API key in settings.');
  }

  const files: string[] = readdirSync(outputPath)
    .filter((f: string) => extname(f) === '.md' && !f.startsWith('_'));

  let tagged = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    // Skip if already has machine tags
    if (hasMachineTags(file)) {
      skipped++;
      continue;
    }

    const filePath = join(outputPath, file);
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
        saveMachineTags(file, result.machineTags);
        console.log(` [${result.machineTags.join(', ')}]`);
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
