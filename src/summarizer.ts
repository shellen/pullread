// ABOUTME: LLM summarization for articles using BYOK (Bring Your Own Key)
// ABOUTME: Supports Anthropic Claude and OpenAI-compatible APIs

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { request } from 'https';

export interface LLMConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model?: string;
}

interface SummarizeResult {
  summary: string;
  model: string;
}

const SETTINGS_PATH = join(homedir(), '.config', 'pullread', 'settings.json');

export function loadLLMConfig(): LLMConfig | null {
  if (!existsSync(SETTINGS_PATH)) return null;
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
    if (!settings.llm || !settings.llm.apiKey || !settings.llm.provider) return null;
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

export async function summarizeText(articleText: string, config?: LLMConfig): Promise<SummarizeResult> {
  const llmConfig = config || loadLLMConfig();
  if (!llmConfig) {
    throw new Error('No LLM API key configured. Add your key in Settings or ~/.config/pullread/settings.json');
  }

  if (llmConfig.provider === 'anthropic') {
    const model = llmConfig.model || 'claude-sonnet-4-5-20250929';
    return callAnthropic(llmConfig.apiKey, model, articleText);
  } else {
    const model = llmConfig.model || 'gpt-4o-mini';
    return callOpenAI(llmConfig.apiKey, model, articleText);
  }
}

export function getDefaultModel(provider: string): string {
  if (provider === 'anthropic') return 'claude-sonnet-4-5-20250929';
  return 'gpt-4o-mini';
}
