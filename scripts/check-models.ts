// ABOUTME: Checks LLM provider model APIs for stale or missing models
// ABOUTME: Compares live model availability against models.json and reports discrepancies

import { readFileSync } from 'fs';
import { join } from 'path';

const modelsPath = join(__dirname, '..', 'models.json');
const data = JSON.parse(readFileSync(modelsPath, 'utf-8'));
const providers = data.providers || {};

interface CheckResult {
  provider: string;
  missing: string[];    // in our list but not in provider's API
  available: string[];  // in provider's API, not in our list (notable new ones)
  error?: string;
}

// OpenRouter has a public model listing API (no auth needed)
async function checkOpenRouter(): Promise<CheckResult> {
  const result: CheckResult = { provider: 'openrouter', missing: [], available: [] };
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/models');
    if (!resp.ok) { result.error = `HTTP ${resp.status}`; return result; }
    const json = await resp.json() as { data?: { id: string }[] };
    const liveIds = new Set((json.data || []).map((m: { id: string }) => m.id));
    const ourModels: string[] = providers.openrouter?.models || [];

    for (const m of ourModels) {
      if (!liveIds.has(m)) result.missing.push(m);
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }
  return result;
}

// Anthropic models API (requires key, skips if not available)
async function checkAnthropic(): Promise<CheckResult> {
  const result: CheckResult = { provider: 'anthropic', missing: [], available: [] };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { result.error = 'ANTHROPIC_API_KEY not set, skipping'; return result; }
  try {
    const resp = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    });
    if (!resp.ok) { result.error = `HTTP ${resp.status}`; return result; }
    const json = await resp.json() as { data?: { id: string }[] };
    const liveIds = new Set((json.data || []).map((m: { id: string }) => m.id));
    const ourModels: string[] = providers.anthropic?.models || [];

    for (const m of ourModels) {
      if (!liveIds.has(m)) result.missing.push(m);
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }
  return result;
}

// OpenAI models API (requires key, skips if not available)
async function checkOpenAI(): Promise<CheckResult> {
  const result: CheckResult = { provider: 'openai', missing: [], available: [] };
  const key = process.env.OPENAI_API_KEY;
  if (!key) { result.error = 'OPENAI_API_KEY not set, skipping'; return result; }
  try {
    const resp = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` },
    });
    if (!resp.ok) { result.error = `HTTP ${resp.status}`; return result; }
    const json = await resp.json() as { data?: { id: string }[] };
    const liveIds = new Set((json.data || []).map((m: { id: string }) => m.id));
    const ourModels: string[] = providers.openai?.models || [];

    for (const m of ourModels) {
      if (!liveIds.has(m)) result.missing.push(m);
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }
  return result;
}

// Gemini models API (requires key, skips if not available)
async function checkGemini(): Promise<CheckResult> {
  const result: CheckResult = { provider: 'gemini', missing: [], available: [] };
  const key = process.env.GEMINI_API_KEY;
  if (!key) { result.error = 'GEMINI_API_KEY not set, skipping'; return result; }
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${key}`);
    if (!resp.ok) { result.error = `HTTP ${resp.status}`; return result; }
    const json = await resp.json() as { models?: { name: string }[] };
    const liveIds = new Set((json.models || []).map((m: { name: string }) => m.name.replace('models/', '')));
    const ourModels: string[] = providers.gemini?.models || [];

    for (const m of ourModels) {
      if (!liveIds.has(m)) result.missing.push(m);
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }
  return result;
}

async function main() {
  console.log('Checking model availability against provider APIs...\n');

  const results = await Promise.all([
    checkOpenRouter(),
    checkAnthropic(),
    checkOpenAI(),
    checkGemini(),
  ]);

  let hasIssues = false;

  for (const r of results) {
    if (r.error) {
      console.log(`${r.provider}: ${r.error}`);
      continue;
    }
    if (r.missing.length > 0) {
      hasIssues = true;
      console.log(`${r.provider}: ${r.missing.length} model(s) not found in API:`);
      for (const m of r.missing) console.log(`  - ${m}`);
    } else {
      console.log(`${r.provider}: all models verified`);
    }
  }

  // Check for deprecated models past their date
  const today = new Date().toISOString().slice(0, 10);
  for (const [id, provider] of Object.entries(providers) as [string, any][]) {
    if (!provider.deprecations) continue;
    for (const [model, date] of Object.entries(provider.deprecations) as [string, string][]) {
      if (date <= today && (provider.models as string[]).includes(model)) {
        hasIssues = true;
        console.log(`${id}: "${model}" is past deprecation date (${date}) and still in models list`);
      }
    }
  }

  if (hasIssues) {
    console.log('\nmodels.json may need updating. See above for details.');
    process.exit(1);
  } else {
    console.log('\nAll checks passed.');
  }
}

main();
