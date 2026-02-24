// ABOUTME: Validates models.json schema and data integrity
// ABOUTME: Ensures all providers have required fields, defaults exist in model lists, no duplicates

import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const modelsPath = join(__dirname, '../models.json');
const data = JSON.parse(readFileSync(modelsPath, 'utf-8'));
const providers = data.providers || {};

describe('models.json schema validation', () => {
  test('has providers object', () => {
    expect(typeof providers).toBe('object');
    expect(Object.keys(providers).length).toBeGreaterThan(0);
  });

  test('all expected providers exist', () => {
    for (const id of ['anthropic', 'openai', 'gemini', 'openrouter', 'apple']) {
      expect(providers[id]).toBeDefined();
    }
  });

  for (const [id, provider] of Object.entries(providers) as [string, any][]) {
    describe(`provider: ${id}`, () => {
      test('has label', () => {
        expect(typeof provider.label).toBe('string');
        expect(provider.label.length).toBeGreaterThan(0);
      });

      test('has non-empty models array', () => {
        expect(Array.isArray(provider.models)).toBe(true);
        expect(provider.models.length).toBeGreaterThan(0);
      });

      test('models are all non-empty strings', () => {
        for (const m of provider.models) {
          expect(typeof m).toBe('string');
          expect(m.length).toBeGreaterThan(0);
        }
      });

      test('has no duplicate models', () => {
        const unique = new Set(provider.models);
        expect(unique.size).toBe(provider.models.length);
      });

      test('default model exists in models list', () => {
        expect(typeof provider.default).toBe('string');
        expect(provider.models).toContain(provider.default);
      });

      test('has keyPlaceholder', () => {
        expect(typeof provider.keyPlaceholder).toBe('string');
      });

      test('has docsUrl', () => {
        expect(typeof provider.docsUrl).toBe('string');
        expect(provider.docsUrl).toMatch(/^https?:\/\//);
      });

      if (provider.deprecations) {
        test('deprecated models have valid date format', () => {
          for (const [model, date] of Object.entries(provider.deprecations)) {
            expect(typeof date).toBe('string');
            expect(date as string).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          }
        });
      }
    });
  }
});
