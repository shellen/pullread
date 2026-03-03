// ABOUTME: Tests for autotagger LLM prompt parsing and section classification
// ABOUTME: Covers parseAutotagResponse with both object and legacy array response formats

jest.mock('./summarizer', () => ({
  summarizeText: jest.fn(),
  loadLLMConfig: jest.fn(),
  getDefaultModel: jest.fn(),
}));
jest.mock('./writer', () => ({
  listMarkdownFiles: jest.fn(),
  resolveFilePath: jest.fn(),
}));
jest.mock('./annotations', () => ({
  loadAnnotation: jest.fn().mockReturnValue({ highlights: [], articleNote: '', annotations: [], tags: [], machineTags: [], isFavorite: false }),
  saveAnnotation: jest.fn(),
  allNotes: jest.fn().mockReturnValue({}),
}));

import { autotagText } from './autotagger';
import { summarizeText } from './summarizer';

const mockSummarize = summarizeText as jest.MockedFunction<typeof summarizeText>;

describe('autotagger section classification', () => {
  beforeEach(() => {
    mockSummarize.mockReset();
  });

  test('parses object response with tags and section', async () => {
    mockSummarize.mockResolvedValue({
      summary: '{"tags": ["artificialintelligence", "openai"], "section": "tech"}',
      model: 'test-model',
    });
    const result = await autotagText('Some article about AI', { provider: 'apple' as any, apiKey: '' });
    expect(result.machineTags).toEqual(['artificialintelligence', 'openai']);
    expect(result.section).toBe('tech');
  });

  test('parses legacy array response (no section)', async () => {
    mockSummarize.mockResolvedValue({
      summary: '["artificialintelligence", "openai"]',
      model: 'test-model',
    });
    const result = await autotagText('Some article about AI', { provider: 'apple' as any, apiKey: '' });
    expect(result.machineTags).toEqual(['artificialintelligence', 'openai']);
    expect(result.section).toBeUndefined();
  });

  test('handles object response wrapped in code block', async () => {
    mockSummarize.mockResolvedValue({
      summary: '```json\n{"tags": ["climate", "science"], "section": "science"}\n```',
      model: 'test-model',
    });
    const result = await autotagText('Climate article', { provider: 'apple' as any, apiKey: '' });
    expect(result.machineTags).toEqual(['climate', 'science']);
    expect(result.section).toBe('science');
  });

  test('validates section against allowed values', async () => {
    mockSummarize.mockResolvedValue({
      summary: '{"tags": ["ai"], "section": "invalid_section"}',
      model: 'test-model',
    });
    const result = await autotagText('Article', { provider: 'apple' as any, apiKey: '' });
    expect(result.machineTags).toEqual(['ai']);
    expect(result.section).toBeUndefined();
  });

  test('normalizes tag strings in object response', async () => {
    mockSummarize.mockResolvedValue({
      summary: '{"tags": ["Artificial Intelligence", "open-ai"], "section": "tech"}',
      model: 'test-model',
    });
    const result = await autotagText('Article', { provider: 'apple' as any, apiKey: '' });
    expect(result.machineTags).toEqual(['artificialintelligence', 'openai']);
  });
});
