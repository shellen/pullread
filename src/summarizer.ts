// ABOUTME: Article summarization using user-provided API keys
// ABOUTME: Supports Anthropic, OpenAI, Gemini, OpenRouter, and Apple Intelligence providers

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { request } from 'https';
import { execFileSync } from 'child_process';
import { saveToKeychain, loadFromKeychain } from './keychain';

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'apple';

export interface LLMConfig {
  provider: Provider;
  apiKey: string;
  model?: string;
}

// Multi-provider settings: stores keys for ALL providers, with a default
export interface LLMSettings {
  defaultProvider: Provider;
  providers: Partial<Record<Provider, { apiKey?: string; model?: string }>>;
}

// Known models per provider — loaded from models.json (single source of truth)
// Ordered cheapest-first within each provider for summarization tasks
function loadModelsConfig(): Record<string, { models: string[]; default: string }> {
  try {
    const modelsPath = join(__dirname, '..', 'models.json');
    const data = JSON.parse(readFileSync(modelsPath, 'utf-8'));
    const result: Record<string, { models: string[]; default: string }> = {};
    for (const [key, val] of Object.entries(data.providers || {})) {
      const p = val as any;
      result[key] = { models: p.models || [], default: p.default || p.models?.[0] || '' };
    }
    return result;
  } catch {
    // Fallback if models.json is missing (e.g. standalone binary)
    return {
      anthropic: { models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929', 'claude-opus-4-6'], default: 'claude-haiku-4-5-20251001' },
      openai: { models: ['gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-5-nano', 'gpt-5-mini', 'gpt-5'], default: 'gpt-4.1-nano' },
      gemini: { models: ['gemini-2.5-flash-lite-preview', 'gemini-2.5-flash', 'gemini-2.5-pro'], default: 'gemini-2.5-flash-lite-preview' },
      openrouter: { models: ['anthropic/claude-haiku-4.5', 'google/gemini-2.5-flash', 'anthropic/claude-sonnet-4.5'], default: 'anthropic/claude-haiku-4.5' },
      apple: { models: ['on-device'], default: 'on-device' }
    };
  }
}

const _modelsConfig = loadModelsConfig();

export const KNOWN_MODELS: Record<Provider, string[]> = {
  anthropic: _modelsConfig.anthropic?.models || [],
  openai: _modelsConfig.openai?.models || [],
  gemini: _modelsConfig.gemini?.models || [],
  openrouter: _modelsConfig.openrouter?.models || [],
  apple: _modelsConfig.apple?.models || ['on-device']
};

interface SummarizeResult {
  summary: string;
  model: string;
}

const SETTINGS_PATH = join(homedir(), '.config', 'pullread', 'settings.json');


// Cache macOS version check
let _appleAvailable: boolean | null = null;

export function isAppleAvailable(): boolean {
  if (_appleAvailable !== null) return _appleAvailable;
  if (process.platform !== 'darwin') { _appleAvailable = false; return false; }
  try {
    const ver = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf-8' }).trim();
    _appleAvailable = parseInt(ver.split('.')[0], 10) >= 26;
  } catch {
    _appleAvailable = false;
  }
  return _appleAvailable;
}

/**
 * Load full multi-provider settings. Handles migration from old single-provider format.
 */
export function loadLLMSettings(): LLMSettings {
  if (!existsSync(SETTINGS_PATH)) {
    return { defaultProvider: 'apple', providers: {} };
  }
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
    const llm = settings.llm;
    if (!llm) return { defaultProvider: 'apple', providers: {} };

    // New format: has defaultProvider and providers map
    if (llm.defaultProvider && llm.providers) {
      const result: LLMSettings = {
        defaultProvider: llm.defaultProvider,
        providers: {}
      };
      for (const [p, config] of Object.entries(llm.providers as Record<string, any>)) {
        // Keychain first, then settings.json fallback
        const apiKey = loadFromKeychain(`llm-${p}`) || config?.apiKey || '';
        result.providers[p as Provider] = { apiKey, model: config?.model || '' };
      }
      return result;
    }

    // Old format: migrate { provider, apiKey, model } → new structure
    if (llm.provider) {
      const apiKey = llm.apiKey || '';
      return {
        defaultProvider: llm.provider,
        providers: {
          [llm.provider]: { apiKey, model: llm.model || '' }
        }
      };
    }

    return { defaultProvider: 'apple', providers: {} };
  } catch {
    return { defaultProvider: 'apple', providers: {} };
  }
}

/**
 * Load the active LLM config for the default provider.
 * Falls back to Apple Intelligence on macOS 26+ if the default provider has no key.
 */
export function loadLLMConfig(): LLMConfig | null {
  const settings = loadLLMSettings();
  const provider = settings.defaultProvider || 'apple';

  if (provider === 'apple') {
    return { provider: 'apple', apiKey: '', model: 'on-device' };
  }

  const provConfig = settings.providers[provider];
  const apiKey = provConfig?.apiKey || '';

  if (apiKey) {
    return {
      provider,
      apiKey,
      model: provConfig?.model || getDefaultModel(provider)
    };
  }

  // Default provider has no key — fall back to Apple on macOS 26+
  if (isAppleAvailable()) {
    return { provider: 'apple', apiKey: '', model: 'on-device' };
  }

  return null;
}

/**
 * Save full multi-provider settings.
 */
export function saveLLMSettings(newSettings: LLMSettings): void {
  let settings: Record<string, unknown> = {};
  if (existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
    } catch {}
  }

  const cleaned: Partial<Record<string, { model?: string }>> = {};
  for (const [p, config] of Object.entries(newSettings.providers)) {
    if (config) {
      // Store API keys in Keychain, not in settings.json
      if (config.apiKey && p !== 'apple') {
        saveToKeychain(`llm-${p}`, config.apiKey);
      }
      const entry: { model?: string } = {};
      if (config.model) entry.model = config.model;
      if (Object.keys(entry).length > 0 || p === 'apple') cleaned[p] = entry;
    }
  }

  settings.llm = {
    defaultProvider: newSettings.defaultProvider,
    providers: cleaned
  };

  const dir = join(homedir(), '.config', 'pullread');
  if (!existsSync(dir)) {
    require('fs').mkdirSync(dir, { recursive: true });
  }
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

/**
 * Save a single provider config. Updates the multi-provider structure and sets it as default.
 */
export function saveLLMConfig(config: LLMConfig): void {
  const current = loadLLMSettings();
  current.defaultProvider = config.provider;
  if (!current.providers[config.provider]) {
    current.providers[config.provider] = {};
  }
  current.providers[config.provider]!.apiKey = config.apiKey;
  current.providers[config.provider]!.model = config.model;
  saveLLMSettings(current);
}

function httpPostOnce(url: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string; retryAfter?: number }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf-8');
        const retryHeader = res.headers['retry-after'];
        const retryAfter = retryHeader ? (parseInt(retryHeader, 10) || 2) : undefined;
        resolve({ status: res.statusCode || 0, body: responseBody, retryAfter });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const MAX_RETRIES_429 = 2;

async function httpPost(url: string, headers: Record<string, string>, body: string): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt++) {
    const result = await httpPostOnce(url, headers, body);
    if (result.status === 429 && attempt < MAX_RETRIES_429) {
      const waitSec = result.retryAfter || (attempt + 1) * 3;
      await new Promise(r => setTimeout(r, waitSec * 1000));
      continue;
    }
    if (result.status >= 400) {
      throw new Error(`API error ${result.status}: ${result.body.slice(0, 200)}`);
    }
    return result.body;
  }
  throw new Error('Rate limited after retries');
}

const SUMMARIZE_PROMPT = `Summarize this article in 2-3 concise sentences. Focus on the key argument or finding. Do not use phrases like "This article discusses" — just state the main points directly.`;

async function callAnthropic(apiKey: string, model: string, articleText: string): Promise<SummarizeResult> {
  // Trim to ~6000 words to stay within context limits
  const trimmed = articleText.split(/\s+/).slice(0, 6000).join(' ');

  const body = JSON.stringify({
    model,
    max_tokens: 300,
    messages: [
      { role: 'user', content: `${SUMMARIZE_PROMPT}\n\n---\n\n${trimmed}` }
    ]
  });

  const response = await httpPost('https://api.anthropic.com/v1/messages', {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  }, body);

  const data = JSON.parse(response);
  const text = data.content?.[0]?.text || '';
  return { summary: text.trim(), model: data.model || model };
}

async function callOpenAI(apiKey: string, model: string, articleText: string): Promise<SummarizeResult> {
  const trimmed = articleText.split(/\s+/).slice(0, 6000).join(' ');

  const body = JSON.stringify({
    model,
    max_tokens: 300,
    messages: [
      { role: 'system', content: SUMMARIZE_PROMPT },
      { role: 'user', content: trimmed }
    ]
  });

  const response = await httpPost('https://api.openai.com/v1/chat/completions', {
    'Authorization': `Bearer ${apiKey}`
  }, body);

  const data = JSON.parse(response);
  const text = data.choices?.[0]?.message?.content || '';
  return { summary: text.trim(), model: data.model || model };
}

async function callGemini(apiKey: string, model: string, articleText: string): Promise<SummarizeResult> {
  const trimmed = articleText.split(/\s+/).slice(0, 6000).join(' ');

  const body = JSON.stringify({
    contents: [{
      parts: [{ text: `${SUMMARIZE_PROMPT}\n\n---\n\n${trimmed}` }]
    }],
    generationConfig: { maxOutputTokens: 300 }
  });

  const response = await httpPost(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {},
    body
  );

  const data = JSON.parse(response);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { summary: text.trim(), model };
}

async function callOpenRouter(apiKey: string, model: string, articleText: string): Promise<SummarizeResult> {
  const trimmed = articleText.split(/\s+/).slice(0, 6000).join(' ');

  const body = JSON.stringify({
    model,
    max_tokens: 300,
    messages: [
      { role: 'system', content: SUMMARIZE_PROMPT },
      { role: 'user', content: trimmed }
    ]
  });

  const response = await httpPost('https://openrouter.ai/api/v1/chat/completions', {
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://github.com/shellen/pullread',
    'X-Title': 'PullRead'
  }, body);

  const data = JSON.parse(response);
  const text = data.choices?.[0]?.message?.content || '';
  return { summary: text.trim(), model: data.model || model };
}

// Low-level helper: run a prompt through Apple Intelligence via Foundation Models
function runApplePrompt(prompt: string): string {
  const configDir = join(homedir(), '.config', 'pullread');
  const tmpPrompt = join(configDir, '.apple-prompt.txt');
  const swiftScript = join(configDir, '.apple-summarize.swift');

  writeFileSync(tmpPrompt, prompt);

  const scriptContent = [
    'import Foundation',
    'import FoundationModels',
    '',
    'let path = CommandLine.arguments[1]',
    'let prompt = try String(contentsOfFile: path, encoding: .utf8)',
    'let session = LanguageModelSession()',
    'let response = try await session.respond(to: prompt)',
    'print(response.content)',
  ].join('\n');
  writeFileSync(swiftScript, scriptContent);

  try {
    const result = execFileSync('swift', [swiftScript, tmpPrompt], {
      encoding: 'utf-8',
      timeout: 90_000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim();
  } catch (err: any) {
    const stderr = err.stderr || '';
    if (stderr.includes('exceededContextWindowSize')) {
      throw new Error('Apple Intelligence context window exceeded (4096 token limit). Try a shorter article or switch to a cloud provider.');
    }
    if (stderr.includes('No such module')) {
      try {
        const ver = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf-8' }).trim();
        const major = parseInt(ver.split('.')[0], 10);
        if (major >= 26) {
          throw new Error('Apple Intelligence failed — FoundationModels not found. Ensure Xcode command line tools are installed: xcode-select --install');
        }
      } catch (verErr: any) {
        if (verErr.message?.includes('FoundationModels')) throw verErr;
      }
      throw new Error('Apple Intelligence requires macOS 26 (Tahoe) with Xcode command line tools installed.');
    }
    if (stderr.includes('not eligible') || stderr.includes('not available')) {
      throw new Error('Apple Intelligence is not available on this Mac. Requires Apple Silicon with macOS 26.');
    }
    throw new Error(`Apple Intelligence error: ${stderr.slice(0, 200) || err.message}`);
  } finally {
    try { unlinkSync(tmpPrompt); } catch {}
  }
}

const CHUNK_WORD_LIMIT = 2000;

// Apple Intelligence has a 4096-token context window.
// Each turn needs room for prompt overhead + response, so sections must be small.
const APPLE_SECTION_WORD_LIMIT = 600;

// RLM-inspired multi-turn summarization for long articles.
// Instead of map-reduce (N separate processes, each losing context), this runs
// ONE Swift process using LanguageModelSession's multi-turn conversation.
// The model progressively reads the article section by section, maintaining
// running notes. Sessions are recycled every few turns to avoid context overflow.
// A final clean session synthesizes the summary from accumulated notes.
function runAppleRLM(articleText: string): string {
  const configDir = join(homedir(), '.config', 'pullread');
  const tmpArticle = join(configDir, '.apple-article.txt');
  const swiftScript = join(configDir, '.apple-rlm.swift');

  writeFileSync(tmpArticle, articleText);

  const sectionLimit = APPLE_SECTION_WORD_LIMIT;
  const scriptContent = [
    'import Foundation',
    'import FoundationModels',
    '',
    'let articlePath = CommandLine.arguments[1]',
    'let fullText = try String(contentsOfFile: articlePath, encoding: .utf8)',
    '',
    '// Split into paragraphs and analyze structure',
    'let paragraphs = fullText.components(separatedBy: "\\n\\n")',
    '    .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }',
    'let totalWords = fullText.split(separator: " ").count',
    'let headings = paragraphs.filter { $0.hasPrefix("#") }',
    '    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }',
    '',
    `// Build sections of ~${sectionLimit} words on paragraph boundaries (4096-token context limit)`,
    'var sections: [String] = []',
    'var current: [String] = []',
    'var wc = 0',
    'for para in paragraphs {',
    '    let w = para.split(separator: " ").count',
    `    if wc + w > ${sectionLimit} && !current.isEmpty {`,
    '        sections.append(current.joined(separator: "\\n\\n"))',
    '        current = []',
    '        wc = 0',
    '    }',
    '    current.append(para)',
    '    wc += w',
    '}',
    'if !current.isEmpty { sections.append(current.joined(separator: "\\n\\n")) }',
    '',
    '// Multi-turn conversation: progressive reading with session recycling',
    '// Each new session gets a fresh 4096-token context window',
    'var session = LanguageModelSession()',
    'var turns = 0',
    'let maxTurns = 2',
    'var notes = ""',
    '',
    '// Phase 1: Structural overview (keep within context limit)',
    'let headingList = headings.isEmpty ? "None" : headings.prefix(10).joined(separator: " | ")',
    'let opening = String(paragraphs.first?.prefix(300) ?? "")',
    'let overview = "Summarize a \\(totalWords)-word article (\\(sections.count) sections).\\n"',
    '    + "Headings: \\(headingList)\\n"',
    '    + "Opening: \\(opening)\\n"',
    '    + "I will feed sections one at a time. Respond with brief bullet-point notes of key facts."',
    '',
    'let r1 = try await session.respond(to: overview)',
    'notes = r1.content',
    'turns = 1',
    '',
    '// Phase 2: Feed each section, recycling sessions to prevent context overflow',
    'for (i, section) in sections.enumerated() {',
    '    if turns >= maxTurns {',
    '        session = LanguageModelSession()',
    '        // Trim notes to keep within context limit',
    '        let trimmedNotes = notes.count > 1500 ? String(notes.suffix(1500)) : notes',
    '        let resume = "Article summarization in progress. Notes so far:\\n"',
    '            + trimmedNotes',
    '            + "\\nMore sections follow. Update notes with key facts."',
    '        let rr = try await session.respond(to: resume)',
    '        notes = rr.content',
    '        turns = 1',
    '    }',
    '    let prompt = "Section \\(i + 1)/\\(sections.count):\\n\\n"',
    '        + section',
    '        + "\\n\\nUpdate notes with key points."',
    '    let r = try await session.respond(to: prompt)',
    '    notes = r.content',
    '    turns += 1',
    '}',
    '',
    '// Phase 3: Final summary in a clean session with just the accumulated notes',
    'let finalSession = LanguageModelSession()',
    'let trimmedFinalNotes = notes.count > 2000 ? String(notes.suffix(2000)) : notes',
    'let finalPrompt = "Notes from reading an article:\\n\\n"',
    '    + trimmedFinalNotes',
    '    + "\\n\\nWrite a 2-3 sentence summary. State the main points directly."',
    '    + " Do not use phrases like \\"This article discusses\\"."',
    'let result = try await finalSession.respond(to: finalPrompt)',
    'print(result.content)',
  ].join('\n');

  writeFileSync(swiftScript, scriptContent);

  try {
    const result = execFileSync('swift', [swiftScript, tmpArticle], {
      encoding: 'utf-8',
      timeout: 180_000, // 3 minutes for multi-turn conversation
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim();
  } catch (err: any) {
    const stderr = err.stderr || '';
    if (stderr.includes('exceededContextWindowSize')) {
      throw new Error('Apple Intelligence context window exceeded (4096 token limit). Try a shorter article or switch to a cloud provider.');
    }
    if (stderr.includes('No such module')) {
      try {
        const ver = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf-8' }).trim();
        const major = parseInt(ver.split('.')[0], 10);
        if (major >= 26) {
          throw new Error('Apple Intelligence failed — FoundationModels not found. Ensure Xcode command line tools are installed: xcode-select --install');
        }
      } catch (verErr: any) {
        if (verErr.message?.includes('FoundationModels')) throw verErr;
      }
      throw new Error('Apple Intelligence requires macOS 26 (Tahoe) with Xcode command line tools installed.');
    }
    if (stderr.includes('not eligible') || stderr.includes('not available')) {
      throw new Error('Apple Intelligence is not available on this Mac. Requires Apple Silicon with macOS 26.');
    }
    throw new Error(`Apple Intelligence error: ${stderr.slice(0, 200) || err.message}`);
  } finally {
    try { unlinkSync(tmpArticle); } catch {}
  }
}

// Apple Intelligence context limit: 4096 tokens total (input + output).
// URLs and code tokenize at ~2 tokens/word, so use conservative limit.
const APPLE_MAX_INPUT_WORDS = 1500;

async function callApple(articleText: string): Promise<SummarizeResult> {
  const words = articleText.split(/\s+/);

  // Try single-prompt path first (always preferred — simpler, no multi-turn overhead).
  // Truncate to fit Apple Intelligence's 4096-token context window if needed.
  if (words.length <= APPLE_MAX_INPUT_WORDS) {
    const prompt = `${SUMMARIZE_PROMPT}\n\n---\n\n${words.join(' ')}`;
    return { summary: runApplePrompt(prompt), model: 'apple-on-device' };
  }

  // Text too long for single prompt — try truncated version first
  try {
    const truncated = words.slice(0, APPLE_MAX_INPUT_WORDS).join(' ');
    const prompt = `${SUMMARIZE_PROMPT}\n\n---\n\n${truncated}`;
    return { summary: runApplePrompt(prompt), model: 'apple-on-device' };
  } catch (err: any) {
    // If truncated single-prompt also fails, fall back to RLM for long articles
    if (!err.message?.includes('context window')) throw err;
  }

  // Multi-turn conversation with section recycling for very long texts
  const summary = runAppleRLM(articleText);
  return { summary, model: 'apple-on-device' };
}

export async function summarizeText(articleText: string, config?: LLMConfig): Promise<SummarizeResult> {
  const llmConfig = config || loadLLMConfig() || { provider: 'apple' as Provider, apiKey: '' };

  const model = llmConfig.model || getDefaultModel(llmConfig.provider);

  switch (llmConfig.provider) {
    case 'anthropic':
      return callAnthropic(llmConfig.apiKey, model, articleText);
    case 'openai':
      return callOpenAI(llmConfig.apiKey, model, articleText);
    case 'gemini':
      return callGemini(llmConfig.apiKey, model, articleText);
    case 'openrouter':
      return callOpenRouter(llmConfig.apiKey, model, articleText);
    case 'apple':
      return callApple(articleText);
    default:
      throw new Error(`Unknown provider: ${llmConfig.provider}`);
  }
}

export function getDefaultModel(provider: string): string {
  return _modelsConfig[provider]?.default || 'gpt-4.1-nano';
}
