// ABOUTME: Tests for review generation — category parsing, article clustering, and briefing output
// ABOUTME: Verifies groupByCategories clusters articles, generateBriefing returns linked articles

jest.mock('./summarizer', () => ({
  summarizeText: jest.fn(),
}));
jest.mock('./writer', () => ({
  listMarkdownFiles: jest.fn(),
  resolveFilePath: jest.fn((p: string) => p),
}));

import { groupByCategories, generateBriefing, type ArticleMeta } from './review';
import { summarizeText } from './summarizer';
import { listMarkdownFiles } from './writer';
import { readFileSync } from 'fs';

const mockSummarize = summarizeText as jest.MockedFunction<typeof summarizeText>;
const mockListFiles = listMarkdownFiles as jest.MockedFunction<typeof listMarkdownFiles>;

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, readFileSync: jest.fn(), existsSync: jest.fn().mockReturnValue(true) };
});
const mockReadFile = readFileSync as jest.MockedFunction<typeof readFileSync>;

describe('groupByCategories', () => {
  const articles: ArticleMeta[] = [
    { title: 'SF Jewelry Heist', url: 'https://sfgate.com/heist', bookmarked: '2026-02-27', domain: 'sfgate.com', categories: ['Crime', 'San Francisco'] },
    { title: 'Robbery Ring Busted', url: 'https://nytimes.com/robbery', bookmarked: '2026-02-26', domain: 'nytimes.com', categories: ['Crime', 'Law Enforcement'] },
    { title: 'AI Model Release', url: 'https://tech.com/ai', bookmarked: '2026-02-25', domain: 'tech.com', categories: ['Technology', 'AI'] },
    { title: 'Robot Vacuum Review', url: 'https://verge.com/vacuum', bookmarked: '2026-02-24', domain: 'theverge.com', categories: ['Technology', 'Reviews'] },
    { title: 'Solo Article', url: 'https://random.com/solo', bookmarked: '2026-02-23', domain: 'random.com', categories: ['Unique'] },
  ];

  test('groups articles sharing categories (2+ articles per group)', () => {
    const groups = groupByCategories(articles);
    const slugs = groups.map(g => g.slug);
    expect(slugs).toContain('cluster-crime');
    expect(slugs).toContain('cluster-technology');
  });

  test('excludes categories with only one article', () => {
    const groups = groupByCategories(articles);
    const slugs = groups.map(g => g.slug);
    expect(slugs).not.toContain('cluster-unique');
    expect(slugs).not.toContain('cluster-reviews');
  });

  test('each group contains correct articles', () => {
    const groups = groupByCategories(articles);
    const crime = groups.find(g => g.slug === 'cluster-crime');
    expect(crime).toBeDefined();
    expect(crime!.articles.map(a => a.title)).toEqual(['SF Jewelry Heist', 'Robbery Ring Busted']);
  });

  test('falls back to domain grouping when no categories', () => {
    const noCats: ArticleMeta[] = [
      { title: 'A', url: 'https://a.com/1', bookmarked: '2026-02-27', domain: 'nytimes.com' },
      { title: 'B', url: 'https://b.com/2', bookmarked: '2026-02-26', domain: 'nytimes.com' },
      { title: 'C', url: 'https://c.com/3', bookmarked: '2026-02-25', domain: 'bbc.com' },
      { title: 'D', url: 'https://d.com/4', bookmarked: '2026-02-24', domain: 'bbc.com' },
    ];
    const groups = groupByCategories(noCats);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups.some(g => g.label === 'nytimes.com')).toBe(true);
  });

  test('returns empty when single domain (no meaningful clusters)', () => {
    const sameDomain: ArticleMeta[] = [
      { title: 'A', url: 'https://a.com/1', bookmarked: '2026-02-27', domain: 'example.com' },
      { title: 'B', url: 'https://a.com/2', bookmarked: '2026-02-26', domain: 'example.com' },
    ];
    const groups = groupByCategories(sameDomain);
    expect(groups).toEqual([]);
  });

  test('returns empty for empty input', () => {
    expect(groupByCategories([])).toEqual([]);
  });

  test('slug format produces valid anchor IDs', () => {
    const arts: ArticleMeta[] = [
      { title: 'A', url: 'https://a.com/1', bookmarked: '2026-02-27', domain: 'a.com', categories: ['Law Enforcement'] },
      { title: 'B', url: 'https://b.com/2', bookmarked: '2026-02-26', domain: 'b.com', categories: ['Law Enforcement'] },
    ];
    const groups = groupByCategories(arts);
    expect(groups[0].slug).toBe('cluster-law-enforcement');
    expect(groups[0].slug).toMatch(/^cluster-[a-z0-9-]+$/);
  });
});

describe('generateBriefing', () => {
  const today = new Date().toISOString().slice(0, 10);

  function makeFrontmatter(title: string, domain: string, bookmarked: string) {
    return `---\ntitle: "${title}"\nurl: "https://${domain}/article"\nbookmarked: ${bookmarked}\ndomain: ${domain}\n---\nBody text`;
  }

  beforeEach(() => {
    mockSummarize.mockReset();
    mockListFiles.mockReset();
    mockReadFile.mockReset();
  });

  test('returns null when no recent articles', async () => {
    mockListFiles.mockReturnValue([]);
    const result = await generateBriefing('/tmp/test', 1);
    expect(result).toBeNull();
  });

  test('returns briefing text and article metadata with filenames', async () => {
    mockListFiles.mockReturnValue(['/tmp/test/article-one.md', '/tmp/test/article-two.md']);
    // Files sorted by name descending: article-two before article-one
    mockReadFile
      .mockReturnValueOnce(makeFrontmatter('Second Article', 'other.com', today) as any)
      .mockReturnValueOnce(makeFrontmatter('First Article', 'example.com', today) as any);
    mockSummarize.mockResolvedValue({ summary: '**First Article** is great. **Second Article** too.', model: 'test' });

    const result = await generateBriefing('/tmp/test', 1);
    expect(result).not.toBeNull();
    expect(result!.briefing).toContain('First Article');
    expect(result!.model).toBe('test');
    expect(result!.articles).toHaveLength(2);
    const first = result!.articles.find(a => a.title === 'First Article');
    expect(first).toEqual({
      title: 'First Article',
      filename: 'article-one.md',
      domain: 'example.com',
    });
  });

  test('caps articles at 25', async () => {
    const paths = Array.from({ length: 30 }, (_, i) => `/tmp/test/art-${i}.md`);
    mockListFiles.mockReturnValue(paths);
    for (let i = 0; i < 30; i++) {
      mockReadFile.mockReturnValueOnce(makeFrontmatter(`Article ${i}`, 'example.com', today) as any);
    }
    mockSummarize.mockResolvedValue({ summary: 'Briefing text.', model: 'test' });

    const result = await generateBriefing('/tmp/test', 1);
    expect(result).not.toBeNull();
    expect(result!.articles.length).toBeLessThanOrEqual(25);
    // Prompt should have been called with at most 25 articles
    expect(mockSummarize).toHaveBeenCalledTimes(1);
  });

  test('calls summarizeText with markdown link format and tone guidance', async () => {
    mockListFiles.mockReturnValue(['/tmp/test/a.md']);
    mockReadFile.mockReturnValueOnce(makeFrontmatter('Test Title', 'test.com', today) as any);
    mockSummarize.mockResolvedValue({ summary: 'Brief', model: 'test' });

    await generateBriefing('/tmp/test', 1);
    const prompt = mockSummarize.mock.calls[0][0];
    expect(prompt).toContain('no headings');
    expect(prompt).toContain('#article-');
    expect(prompt).toContain('[exact title](#article-');
    expect(prompt).toContain('author');
    expect(prompt).toContain('video');
    expect(prompt).toContain('podcast');
    expect(prompt).toContain('two paragraphs');
    expect(prompt).toContain('somber');
    expect(prompt).toContain('generic');
    expect(prompt).not.toContain('biggest');
  });

  test('prompt forbids "here" as link text and bare article-N references', async () => {
    mockListFiles.mockReturnValue(['/tmp/test/a.md']);
    mockReadFile.mockReturnValueOnce(makeFrontmatter('Test Title', 'test.com', today) as any);
    mockSummarize.mockResolvedValue({ summary: 'Brief', model: 'test' });

    await generateBriefing('/tmp/test', 1);
    const prompt = mockSummarize.mock.calls[0][0];
    expect(prompt).toMatch(/never.*\bhere\b/i);
    expect(prompt).toMatch(/never.*bare.*article-/i);
  });

  test('excludes articles by filename when excludeFilenames provided', async () => {
    mockListFiles.mockReturnValue(['/tmp/test/keep.md', '/tmp/test/exclude-me.md']);
    mockReadFile
      .mockReturnValueOnce(makeFrontmatter('Keep Article', 'keep.com', today) as any)
      .mockReturnValueOnce(makeFrontmatter('Excluded Article', 'excluded.com', today) as any);
    mockSummarize.mockResolvedValue({ summary: 'Brief', model: 'test' });

    const result = await generateBriefing('/tmp/test', 1, ['exclude-me.md']);
    expect(result).not.toBeNull();
    expect(result!.articles).toHaveLength(1);
    expect(result!.articles[0].title).toBe('Keep Article');
    const prompt = mockSummarize.mock.calls[0][0];
    expect(prompt).not.toContain('Excluded Article');
  });

  test('includes trending categories in prompt when articles have categories', async () => {
    const fm = (title: string, domain: string, cats: string[]) =>
      `---\ntitle: "${title}"\nurl: "https://${domain}/article"\nbookmarked: ${today}\ndomain: ${domain}\ncategories: ${JSON.stringify(cats)}\n---\nBody`;
    mockListFiles.mockReturnValue(['/tmp/test/a.md', '/tmp/test/b.md', '/tmp/test/c.md']);
    mockReadFile
      .mockReturnValueOnce(fm('Tech Article 1', 'tech.com', ['Technology']) as any)
      .mockReturnValueOnce(fm('Tech Article 2', 'verge.com', ['Technology']) as any)
      .mockReturnValueOnce(fm('Solo Article', 'other.com', ['Sports']) as any);
    mockSummarize.mockResolvedValue({ summary: 'Brief', model: 'test' });

    await generateBriefing('/tmp/test', 1);
    const prompt = mockSummarize.mock.calls[0][0];
    expect(prompt).toContain('Technology');
    expect(prompt).toMatch(/trending|trend/i);
  });
});
