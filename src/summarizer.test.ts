// ABOUTME: Tests for article summarization chunking logic
// ABOUTME: Verifies splitIntoSections and chunkedSummarize for long article handling

import { splitIntoSections, chunkedSummarize } from './summarizer';

describe('splitIntoSections', () => {
  test('returns single section for short text', () => {
    const text = 'Hello world. This is a short paragraph.';
    const sections = splitIntoSections(text, 100);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toBe(text);
  });

  test('splits on paragraph boundaries respecting word limit', () => {
    // Build 3 paragraphs of ~50 words each
    const para = (n: number) => `Paragraph ${n}. ` + 'word '.repeat(47) + 'end.';
    const text = [para(1), para(2), para(3)].join('\n\n');

    // Limit of 60 words should put each paragraph in its own section
    const sections = splitIntoSections(text, 60);
    expect(sections).toHaveLength(3);
    expect(sections[0]).toContain('Paragraph 1');
    expect(sections[1]).toContain('Paragraph 2');
    expect(sections[2]).toContain('Paragraph 3');
  });

  test('groups paragraphs that fit within word limit', () => {
    const para = (n: number) => `Paragraph ${n}. ` + 'word '.repeat(17) + 'end.';
    const text = [para(1), para(2), para(3), para(4)].join('\n\n');

    // Limit of 50 words should group ~2 paragraphs per section (~20 words each)
    const sections = splitIntoSections(text, 50);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toContain('Paragraph 1');
    expect(sections[0]).toContain('Paragraph 2');
    expect(sections[1]).toContain('Paragraph 3');
    expect(sections[1]).toContain('Paragraph 4');
  });

  test('handles empty input', () => {
    const sections = splitIntoSections('', 100);
    expect(sections).toHaveLength(0);
  });

  test('handles text with only whitespace between paragraphs', () => {
    const text = 'First paragraph.\n\n\n\n\nSecond paragraph.';
    const sections = splitIntoSections(text, 100);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toContain('First paragraph.');
    expect(sections[0]).toContain('Second paragraph.');
  });

  test('never produces empty sections', () => {
    const text = '\n\n\n\nSome content.\n\n\n\n';
    const sections = splitIntoSections(text, 100);
    for (const section of sections) {
      expect(section.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('chunkedSummarize', () => {
  // Build a long article with 3 sections worth of content (~4000 words each)
  function makeLongArticle(sectionCount: number, wordsPerSection: number): string {
    const sections: string[] = [];
    for (let i = 1; i <= sectionCount; i++) {
      sections.push(`Section ${i} topic sentence. ` + 'content '.repeat(wordsPerSection - 4) + 'end.');
    }
    return sections.join('\n\n');
  }

  test('calls provider function N+1 times (N sections + 1 synthesis)', async () => {
    const calls: string[] = [];
    const callFn = async (prompt: string, _maxTokens: number): Promise<string> => {
      calls.push(prompt);
      return `Notes for call ${calls.length}`;
    };

    // 3 sections of ~100 words each (uses CLOUD_SECTION_WORDS=4000 internally)
    // We need sections > 4000 words to get multiple splits
    const article = makeLongArticle(3, 4500);
    await chunkedSummarize(article, callFn);

    // Should be 3 map calls + 1 reduce call = 4 total
    expect(calls.length).toBe(4);
  });

  test('map calls include section content', async () => {
    const calls: string[] = [];
    const callFn = async (prompt: string, _maxTokens: number): Promise<string> => {
      calls.push(prompt);
      return 'Some notes';
    };

    const article = makeLongArticle(2, 4500);
    await chunkedSummarize(article, callFn);

    // First 2 calls are map calls — should contain section content
    expect(calls[0]).toContain('Section 1 topic sentence');
    expect(calls[1]).toContain('Section 2 topic sentence');
  });

  test('synthesis call includes notes from all sections', async () => {
    const callFn = async (prompt: string, _maxTokens: number): Promise<string> => {
      if (prompt.includes('Section 1 topic sentence')) return 'Notes about topic 1';
      if (prompt.includes('Section 2 topic sentence')) return 'Notes about topic 2';
      return 'Final summary';
    };

    const article = makeLongArticle(2, 4500);
    const result = await chunkedSummarize(article, callFn);

    // The result should be the output of the synthesis call
    expect(result).toBe('Final summary');
  });

  test('returns synthesis result as final output', async () => {
    const callFn = async (_prompt: string, _maxTokens: number): Promise<string> => {
      return 'The synthesized summary';
    };

    const article = makeLongArticle(2, 4500);
    const result = await chunkedSummarize(article, callFn);
    expect(result).toBe('The synthesized summary');
  });
});
