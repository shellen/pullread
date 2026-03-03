// ABOUTME: Automatic machine tagging of articles using LLM providers
// ABOUTME: Extracts topic, entity, and theme tags for relational mapping between articles

import { readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { homedir } from 'os';
import { execFile, ExecFileOptions } from 'child_process';
import { summarizeText, loadLLMConfig, LLMConfig, Provider, getDefaultModel, ensureAppleBinary } from './summarizer';
import { listMarkdownFiles, resolveFilePath } from './writer';
import { loadAnnotation, saveAnnotation, allNotes } from './annotations';

const AUTOTAG_PROMPT = `Extract 3-8 machine tags from this article for relational mapping, and classify the article into an editorial section. Tags should help identify connections between articles. Include:
- Main topics (e.g., "artificialintelligence", "climatechange", "economics")
- Key entities mentioned prominently — people, companies, technologies, places
- Themes (e.g., "regulation", "opensource", "privacy", "fundraising")

Return ONLY a valid JSON object with two fields:
- "tags": array of lowercase tag strings with no spaces or dashes
- "section": one of "tech", "news", "science", "health", "business", "culture", "sports", "food", "lifestyle", "environment", "education", "opinion"

No explanation, no markdown formatting — just the raw JSON object.
Example: {"tags": ["artificialintelligence","openai","regulation","samaltman","safety"], "section": "tech"}
For non-English articles, use English tags where a clear English equivalent exists, but keep proper nouns and culturally specific terms in their original language.`;

interface AutotagResult {
  machineTags: string[];
  section?: string;
  model: string;
}

const VALID_SECTIONS = ['tech', 'news', 'science', 'health', 'business', 'culture', 'sports', 'food', 'lifestyle', 'environment', 'education', 'opinion'];


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

// Compiled Swift binary for batch autotagging via JSONL.
// Reads JSONL input (one {"id","prompt"} per line), processes each with an independent
// LanguageModelSession, and writes JSONL output ({"id","response"} or {"id","error"}).
const BATCH_AUTOTAG_SWIFT = `import Foundation
import FoundationModels

@main struct Run {
    static func main() async throws {
        let inputPath = CommandLine.arguments[1]
        let lines = try String(contentsOfFile: inputPath, encoding: .utf8)
            .components(separatedBy: "\\n")
            .filter { !$0.isEmpty }

        for line in lines {
            guard let data = line.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: String],
                  let id = obj["id"],
                  let prompt = obj["prompt"] else { continue }

            do {
                let session = LanguageModelSession()
                let response = try await session.respond(to: prompt)
                let result = try JSONSerialization.data(withJSONObject: ["id": id, "response": response.content])
                print(String(data: result, encoding: .utf8)!)
            } catch {
                let result = try JSONSerialization.data(withJSONObject: ["id": id, "error": error.localizedDescription])
                print(String(data: result, encoding: .utf8)!)
            }
            fflush(stdout)
        }
    }
}
`;

export interface BatchArticle {
  filename: string;
  body: string;
  title: string;
}

// Process all articles in a single compiled Swift binary invocation.
// Returns { tagged, failed } on success, or null if the binary can't be compiled
// (caller should fall back to sequential processing).
export async function autotagBatchApple(
  articles: BatchArticle[],
  llmConfig: LLMConfig
): Promise<{ tagged: number; failed: number } | null> {
  const binary = ensureAppleBinary(BATCH_AUTOTAG_SWIFT, '.apple-batch-autotag');
  if (!binary) return null;

  const configDir = join(homedir(), '.config', 'pullread');
  const inputPath = join(configDir, '.autotag-batch-input.jsonl');

  // Build JSONL input
  const jsonlLines = articles.map(article => {
    const trimmed = article.body.split(/\s+/).slice(0, 4000).join(' ');
    const prompt = `${AUTOTAG_PROMPT}\n\n---\n\n${trimmed}`;
    return JSON.stringify({ id: article.filename, prompt });
  });
  writeFileSync(inputPath, jsonlLines.join('\n') + '\n');

  let tagged = 0;
  let failed = 0;

  try {
    const timeout = articles.length * 15_000 + 60_000;
    const output = await new Promise<string>((resolve, reject) => {
      execFile(binary, [inputPath], {
        encoding: 'utf-8',
        timeout,
        maxBuffer: 50 * 1024 * 1024,
      } as ExecFileOptions, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout as string);
      });
    });

    const outputLines = output.trim().split('\n').filter(l => l.trim());
    for (const line of outputLines) {
      try {
        const obj = JSON.parse(line);
        if (obj.error) {
          console.log(`  ${obj.id}: failed: ${obj.error}`);
          failed++;
          continue;
        }
        const { machineTags, section } = parseAutotagResponse(obj.response);
        if (machineTags.length > 0) {
          saveMachineTags(obj.id, machineTags, section);
          console.log(`  ${obj.id}: [${machineTags.join(', ')}]${section ? ` (${section})` : ''}`);
          tagged++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
  } catch (err: any) {
    console.log(`  Batch processing failed: ${err.message}`);
    failed = articles.length;
  }

  return { tagged, failed };
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

  let skipped = 0;
  const activeModel = llmConfig.model || getDefaultModel(llmConfig.provider);
  console.log(`  Using ${llmConfig.provider} / ${activeModel}`);

  // Collect articles to process
  const articles: BatchArticle[] = [];
  for (const file of files) {
    if (!force && hasMachineTags(file)) {
      skipped++;
      continue;
    }

    const filePath = resolveFilePath(outputPath, file);
    const content = readFileSync(filePath, 'utf-8');

    const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const body = match ? match[1] : content;

    if (body.length < minSize) {
      skipped++;
      continue;
    }

    const titleMatch = content.match(/^title: "?(.*?)"?\s*$/m);
    const title = titleMatch ? titleMatch[1].slice(0, 50) : file;
    articles.push({ filename: file, body, title });
  }

  // Apple provider: batch all articles in a single binary invocation
  if (llmConfig.provider === 'apple') {
    const batchResult = await autotagBatchApple(articles, llmConfig);
    if (batchResult) {
      return { tagged: batchResult.tagged, skipped, failed: batchResult.failed };
    }
    // Binary compilation failed — fall through to sequential processing
    console.log('  Binary compilation failed, falling back to sequential processing');
  }

  // Sequential processing for cloud providers (or Apple fallback)
  let tagged = 0;
  let failed = 0;

  for (const article of articles) {
    try {
      process.stdout.write(`  ${article.title}...`);
      const result = await autotagText(article.body, llmConfig);

      if (result.machineTags.length > 0) {
        saveMachineTags(article.filename, result.machineTags, result.section);
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
