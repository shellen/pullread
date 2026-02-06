// ABOUTME: Article summarization using user-provided API keys
// ABOUTME: Supports Anthropic, OpenAI, Gemini, OpenRouter, and Apple Intelligence providers

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { request } from 'https';
import { execFileSync } from 'child_process';

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'apple';

export interface LLMConfig {
  provider: Provider;
  apiKey: string;
  model?: string;
}

// Known models per provider — used for dropdown guidance
export const KNOWN_MODELS: Record<Provider, string[]> = {
  anthropic: ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'],
  gemini: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'],
  openrouter: ['anthropic/claude-sonnet-4-5', 'openai/gpt-4o', 'google/gemini-2.0-flash-001', 'meta-llama/llama-4-scout'],
  apple: ['on-device']
};

interface SummarizeResult {
  summary: string;
  model: string;
}

const SETTINGS_PATH = join(homedir(), '.config', 'pullread', 'settings.json');

export function loadLLMConfig(): LLMConfig | null {
  if (!existsSync(SETTINGS_PATH)) return null;
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
    if (!settings.llm || !settings.llm.provider) return null;
    // Apple Intelligence doesn't need an API key
    if (settings.llm.provider === 'apple') return settings.llm;
    if (!settings.llm.apiKey) return null;
    return settings.llm;
  } catch {
    return null;
  }
}

export function saveLLMConfig(config: LLMConfig): void {
  let settings: Record<string, unknown> = {};
  if (existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
    } catch {}
  }
  settings.llm = config;
  const dir = join(homedir(), '.config', 'pullread');
  if (!existsSync(dir)) {
    require('fs').mkdirSync(dir, { recursive: true });
  }
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function httpPost(url: string, headers: Record<string, string>, body: string): Promise<string> {
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
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`API error ${res.statusCode}: ${responseBody.slice(0, 200)}`));
        } else {
          resolve(responseBody);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
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

async function callApple(articleText: string): Promise<SummarizeResult> {
  // Apple Intelligence has a 4,096 token context window — use a smaller input
  const trimmed = articleText.split(/\s+/).slice(0, 2500).join(' ');
  const prompt = `${SUMMARIZE_PROMPT}\n\n---\n\n${trimmed}`;

  const configDir = join(homedir(), '.config', 'pullread');
  const tmpPrompt = join(configDir, '.apple-prompt.txt');
  const swiftScript = join(configDir, '.apple-summarize.swift');

  // Write the prompt to a temp file
  writeFileSync(tmpPrompt, prompt);

  // Write the Swift helper script (uses Foundation Models framework, macOS 26+)
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
      timeout: 60_000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { summary: result.trim(), model: 'apple-on-device' };
  } catch (err: any) {
    const stderr = err.stderr || '';
    if (stderr.includes('No such module') || stderr.includes('FoundationModels')) {
      throw new Error('Apple Intelligence requires macOS 26 (Tahoe) with Xcode command line tools installed.');
    }
    if (stderr.includes('not eligible') || stderr.includes('not available')) {
      throw new Error('Apple Intelligence is not available on this Mac. Requires Apple Silicon with macOS 26.');
    }
    throw new Error(`Apple Intelligence failed: ${stderr.slice(0, 200) || err.message}`);
  } finally {
    try { unlinkSync(tmpPrompt); } catch {}
  }
}

export async function summarizeText(articleText: string, config?: LLMConfig): Promise<SummarizeResult> {
  const llmConfig = config || loadLLMConfig();
  if (!llmConfig) {
    throw new Error('No API key configured. Add your key in the PullRead Settings window.');
  }

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
  switch (provider) {
    case 'anthropic': return 'claude-sonnet-4-5-20250929';
    case 'openai': return 'gpt-4o-mini';
    case 'gemini': return 'gemini-2.0-flash';
    case 'openrouter': return 'anthropic/claude-sonnet-4-5';
    case 'apple': return 'on-device';
    default: return 'gpt-4o-mini';
  }
}
