// ABOUTME: Tests for autotagger LLM prompt parsing, section classification, and batch processing
// ABOUTME: Covers parseAutotagResponse formats, Apple batch JSONL construction, and error handling

const mockWriteFileSync = jest.fn();
let mockBatchOutput = '';

jest.mock('fs', () => {
  const real = jest.requireActual('fs');
  return {
    ...real,
    readFileSync: real.readFileSync,
    writeFileSync: (...args: any[]) => {
      const path = args[0];
      if (typeof path === 'string' && path.includes('.autotag-batch')) {
        return mockWriteFileSync(...args);
      }
      return real.writeFileSync(...args);
    },
  };
});

jest.mock('child_process', () => {
  const real = jest.requireActual('child_process');
  return {
    ...real,
    execFile: (...args: any[]) => {
      const callback = args[args.length - 1];
      if (typeof args[0] === 'string' && args[0].includes('.apple-batch-autotag') && typeof callback === 'function') {
        process.nextTick(() => callback(null, mockBatchOutput, ''));
        return;
      }
      return real.execFile(...args);
    },
  };
});

jest.mock('./summarizer', () => ({
  summarizeText: jest.fn(),
  loadLLMConfig: jest.fn(),
  getDefaultModel: jest.fn(),
  ensureAppleBinary: jest.fn(),
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

import { autotagText, autotagBatchApple } from './autotagger';
import { summarizeText, ensureAppleBinary } from './summarizer';
import { saveAnnotation } from './annotations';

const mockSummarize = summarizeText as jest.MockedFunction<typeof summarizeText>;
const mockEnsureBinary = ensureAppleBinary as jest.MockedFunction<typeof ensureAppleBinary>;
const mockSaveAnnotation = saveAnnotation as jest.MockedFunction<typeof saveAnnotation>;

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

describe('autotagBatchApple', () => {
  beforeEach(() => {
    mockWriteFileSync.mockReset();
    mockBatchOutput = '';
    mockEnsureBinary.mockReset();
    mockSaveAnnotation.mockReset();
  });

  const articles = [
    { filename: 'article-one.md', body: 'Article about AI and machine learning', title: 'AI Article' },
    { filename: 'article-two.md', body: 'Article about climate change policy', title: 'Climate Article' },
  ];

  test('builds JSONL input with id and prompt for each article', async () => {
    mockEnsureBinary.mockReturnValue('/mock/.config/pullread/.apple-batch-autotag');
    mockBatchOutput =
      '{"id":"article-one.md","response":"{\\"tags\\":[\\"ai\\"],\\"section\\":\\"tech\\"}"}\n' +
      '{"id":"article-two.md","response":"{\\"tags\\":[\\"climate\\"],\\"section\\":\\"science\\"}"}\n';

    await autotagBatchApple(articles, { provider: 'apple', apiKey: '' });

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const jsonlContent = mockWriteFileSync.mock.calls[0][1] as string;
    const lines = jsonlContent.trim().split('\n');
    expect(lines).toHaveLength(2);

    const line1 = JSON.parse(lines[0]);
    expect(line1.id).toBe('article-one.md');
    expect(line1.prompt).toContain('Article about AI');
    expect(line1.prompt).toContain('Extract 3-8 machine tags');

    const line2 = JSON.parse(lines[1]);
    expect(line2.id).toBe('article-two.md');
    expect(line2.prompt).toContain('climate change');
  });

  test('parses responses and saves tags via parseAutotagResponse', async () => {
    mockEnsureBinary.mockReturnValue('/mock/.config/pullread/.apple-batch-autotag');
    mockBatchOutput =
      '{"id":"article-one.md","response":"{\\"tags\\":[\\"ai\\",\\"machinelearning\\"],\\"section\\":\\"tech\\"}"}\n' +
      '{"id":"article-two.md","response":"{\\"tags\\":[\\"climate\\",\\"policy\\"],\\"section\\":\\"science\\"}"}\n';

    const result = await autotagBatchApple(articles, { provider: 'apple', apiKey: '' });

    expect(result).not.toBeNull();
    expect(result!.tagged).toBe(2);
    expect(result!.failed).toBe(0);
    expect(mockSaveAnnotation).toHaveBeenCalledTimes(2);
  });

  test('counts errors in batch output as failed', async () => {
    mockEnsureBinary.mockReturnValue('/mock/.config/pullread/.apple-batch-autotag');
    mockBatchOutput =
      '{"id":"article-one.md","response":"{\\"tags\\":[\\"ai\\"],\\"section\\":\\"tech\\"}"}\n' +
      '{"id":"article-two.md","error":"model not available"}\n';

    const result = await autotagBatchApple(articles, { provider: 'apple', apiKey: '' });

    expect(result).not.toBeNull();
    expect(result!.tagged).toBe(1);
    expect(result!.failed).toBe(1);
  });

  test('returns null when ensureAppleBinary fails', async () => {
    mockEnsureBinary.mockReturnValue(null);

    const result = await autotagBatchApple(articles, { provider: 'apple', apiKey: '' });

    expect(result).toBeNull();
  });

  test('truncates article text to fit Apple context window', async () => {
    mockEnsureBinary.mockReturnValue('/mock/.config/pullread/.apple-batch-autotag');
    mockBatchOutput =
      '{"id":"long-article.md","response":"{\\"tags\\":[\\"ai\\"],\\"section\\":\\"tech\\"}"}\n';

    // Create an article with 3000 words (well over the Apple limit)
    const longBody = Array(3000).fill('word').join(' ');
    const longArticles = [{ filename: 'long-article.md', body: longBody, title: 'Long Article' }];

    await autotagBatchApple(longArticles, { provider: 'apple', apiKey: '' });

    const jsonlContent = mockWriteFileSync.mock.calls[0][1] as string;
    const line = JSON.parse(jsonlContent.trim());
    const promptWords = line.prompt.split(/\s+/).length;
    // Prompt should be well under 2000 words total (article portion + autotag instructions)
    expect(promptWords).toBeLessThan(1500);
  });
});

describe('autotagText word limits', () => {
  beforeEach(() => {
    mockSummarize.mockReset();
  });

  test('truncates to lower limit for Apple provider', async () => {
    mockSummarize.mockResolvedValue({
      summary: '{"tags": ["ai"], "section": "tech"}',
      model: 'apple-on-device',
    });

    // Create article with 3000 words
    const longText = Array(3000).fill('word').join(' ');
    await autotagText(longText, { provider: 'apple' as any, apiKey: '' });

    // The prompt passed to summarizeText should be truncated for Apple
    const passedPrompt = mockSummarize.mock.calls[0][0];
    const wordCount = passedPrompt.split(/\s+/).length;
    // Should be ~1200 words of article + ~120 words of prompt < 1500
    expect(wordCount).toBeLessThan(1500);
  });

  test('uses higher limit for cloud providers', async () => {
    mockSummarize.mockResolvedValue({
      summary: '{"tags": ["ai"], "section": "tech"}',
      model: 'claude-sonnet',
    });

    // Create article with 3000 words
    const longText = Array(3000).fill('word').join(' ');
    await autotagText(longText, { provider: 'anthropic' as any, apiKey: 'sk-test' });

    const passedPrompt = mockSummarize.mock.calls[0][0];
    const wordCount = passedPrompt.split(/\s+/).length;
    // Cloud providers should keep the higher 4000 word limit
    expect(wordCount).toBeGreaterThan(2000);
  });
});
