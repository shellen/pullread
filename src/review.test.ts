// ABOUTME: Tests for review generation — category parsing, article clustering, and review output
// ABOUTME: Verifies groupByCategories clusters articles and review markdown contains anchor links

import { groupByCategories, type ArticleMeta } from './review';

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
