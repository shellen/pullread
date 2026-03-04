// ABOUTME: Weekly review generation — thematic overview of recently bookmarked articles
// ABOUTME: Uses configured LLM (or Apple Intelligence) to produce a digest

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';
import { summarizeText } from './summarizer';
import { listMarkdownFiles, resolveFilePath } from './writer';

export interface ArticleMeta {
  title: string;
  url: string;
  bookmarked: string;
  domain: string;
  filename?: string;
  feed?: string;
  summary?: string;
  excerpt?: string;
  categories?: string[];
}

interface ClusterGroup {
  label: string;
  slug: string;
  articles: ArticleMeta[];
}

function parseFrontmatter(text: string): ArticleMeta | null {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const meta: any = {};
  match[1].split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1');
      meta[key] = val;
    }
  });

  if (!meta.title || !meta.bookmarked) return null;

  // Parse categories from YAML array: ["Technology", "Programming"]
  if (meta.categories && typeof meta.categories === 'string') {
    try {
      const parsed = JSON.parse(meta.categories.replace(/'/g, '"'));
      if (Array.isArray(parsed)) meta.categories = parsed;
      else delete meta.categories;
    } catch {
      delete meta.categories;
    }
  }

  return meta as ArticleMeta;
}

function toSlug(s: string): string {
  return 'cluster-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function groupByCategories(articles: ArticleMeta[]): ClusterGroup[] {
  if (articles.length === 0) return [];

  // Try category-based grouping first
  const catMap = new Map<string, ArticleMeta[]>();
  let hasCats = false;
  for (const a of articles) {
    if (a.categories && a.categories.length > 0) {
      hasCats = true;
      for (const cat of a.categories) {
        const list = catMap.get(cat) || [];
        list.push(a);
        catMap.set(cat, list);
      }
    }
  }

  if (hasCats) {
    const groups: ClusterGroup[] = [];
    for (const [label, arts] of catMap) {
      if (arts.length >= 2) {
        groups.push({ label, slug: toSlug(label), articles: arts });
      }
    }
    return groups;
  }

  // Fallback: group by domain
  const domainMap = new Map<string, ArticleMeta[]>();
  for (const a of articles) {
    const list = domainMap.get(a.domain) || [];
    list.push(a);
    domainMap.set(a.domain, list);
  }

  // Single domain = no meaningful clusters
  if (domainMap.size <= 1) return [];

  const groups: ClusterGroup[] = [];
  for (const [label, arts] of domainMap) {
    if (arts.length >= 2) {
      groups.push({ label, slug: toSlug(label), articles: arts });
    }
  }
  return groups;
}

export function getRecentArticles(outputPath: string, days: number = 7): ArticleMeta[] {
  if (!existsSync(outputPath)) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const allPaths = listMarkdownFiles(outputPath);
  const files = allPaths
    .map(f => ({ name: basename(f), fullPath: f }))
    .filter(f => !f.name.startsWith('_'))
    .sort((a, b) => b.name.localeCompare(a.name));

  const articles: ArticleMeta[] = [];
  for (const file of files) {
    try {
      const text = readFileSync(file.fullPath, 'utf-8');
      const meta = parseFrontmatter(text);
      if (!meta) continue;

      meta.filename = file.name;
      const bookmarkDate = new Date(meta.bookmarked);
      if (bookmarkDate >= cutoff) {
        articles.push(meta);
      }
    } catch {
      continue;
    }
  }

  return articles.sort((a, b) =>
    new Date(b.bookmarked).getTime() - new Date(a.bookmarked).getTime()
  );
}

export async function generateWeeklyReview(outputPath: string, days: number = 7): Promise<string | null> {
  const articles = getRecentArticles(outputPath, days);
  if (articles.length === 0) return null;

  const isDaily = days <= 1;
  const reviewType = isDaily ? 'daily' : 'weekly';
  const periodLabel = isDaily ? 'day' : `${days} days`;

  // Build a digest of article titles, domains, and summaries/excerpts
  const articleList = articles.map((a, i) => {
    let entry = `${i + 1}. "${a.title}" (${a.domain})`;
    if (a.summary) entry += `\n   Summary: ${a.summary}`;
    else if (a.excerpt) entry += `\n   Excerpt: ${a.excerpt}`;
    return entry;
  }).join('\n');

  // Build cluster info for the prompt
  const clusters = groupByCategories(articles);
  let clusterHint = '';
  if (clusters.length > 0) {
    clusterHint = `\n\nTopic clusters detected (use markdown links like [topic](#${clusters[0].slug}) when mentioning these):\n`;
    clusterHint += clusters.map(c =>
      `- ${c.label} (#${c.slug}): ${c.articles.map(a => `"${a.title}"`).join(', ')}`
    ).join('\n');
  }

  const prompt = `You are a reading digest assistant. Below is a list of ${articles.length} articles bookmarked in the past ${periodLabel}.

Write a thematic ${reviewType} review in two sections:

**Review** (3-5 paragraphs): Identify the main themes, notable findings, and interesting connections between articles. Group related articles together. Use a conversational but informative tone. Do not list every article — synthesize the key ideas.

**Open Questions** (3-5 questions): Based on these readings, what questions remain unanswered or deserve further exploration? Be Socratic — frame questions that challenge assumptions, probe implications, or connect ideas across domains. Each question should briefly reference the article(s) that prompted it.

Format the output with ## Review and ## Open Questions headers.

Articles:
${articleList}${clusterHint}

${isDaily ? 'Daily' : 'Weekly'} Review:`;

  // Use the configured LLM to generate the review
  const result = await summarizeText(prompt);
  return result.summary;
}

export async function generateAndSaveReview(outputPath: string, days: number = 7): Promise<{ filename: string; review: string } | null> {
  const review = await generateWeeklyReview(outputPath, days);
  if (!review) return null;

  const isDaily = days <= 1;
  const reviewLabel = isDaily ? 'Daily Review' : 'Weekly Review';
  const feedLabel = isDaily ? 'daily-review' : 'weekly-review';
  const periodLabel = isDaily ? 'day' : `${days} days`;
  const articlesLabel = isDaily ? 'Articles Today' : 'Articles This Week';

  const date = new Date().toISOString().slice(0, 10);
  const filename = `_${feedLabel}-${date}.md`;
  const fullPath = join(outputPath, filename);

  const articles = getRecentArticles(outputPath, days);
  const clusters = groupByCategories(articles);

  let clusterSection = '';
  if (clusters.length > 0) {
    clusterSection = '\n---\n\n## Topic Clusters\n\n';
    clusterSection += clusters.map(c => {
      const heading = `### <a id="${c.slug}"></a>${c.label}`;
      const items = c.articles.map(a => `- [${a.title}](${a.url}) — ${a.domain}`).join('\n');
      return heading + '\n' + items;
    }).join('\n\n');
    clusterSection += '\n';
  }

  const markdown = `---
title: "${reviewLabel} — ${date}"
bookmarked: ${new Date().toISOString()}
domain: pullread
feed: ${feedLabel}
---

# ${reviewLabel} — ${date}

*${articles.length} articles from the past ${periodLabel}*

${review}

---

## ${articlesLabel}

${articles.map(a => `- [${a.title}](${a.url}) — ${a.domain}`).join('\n')}
${clusterSection}`;

  const dir = dirname(fullPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, markdown, 'utf-8');

  return { filename, review };
}

export async function generateBriefing(outputPath: string, days: number = 1, excludeFilenames: string[] = []): Promise<{
  briefing: string;
  articles: Array<{ title: string; filename: string; domain: string }>;
} | null> {
  const allArticles = getRecentArticles(outputPath, days);
  if (allArticles.length === 0) return null;

  // Exclude articles already surfaced elsewhere (e.g. story deck)
  const excludeSet = new Set(excludeFilenames);
  const filtered = allArticles.filter(a => !excludeSet.has(a.filename || ''));
  if (filtered.length === 0) return null;

  // Cap at 25 for context window safety
  const articles = filtered.slice(0, 25);

  // Compute trending categories (sorted by frequency)
  const catCounts = new Map<string, number>();
  for (const a of articles) {
    if (a.categories) {
      for (const cat of a.categories) {
        catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
      }
    }
  }
  const trending = [...catCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => `${cat} (${count} articles)`);

  const articleList = articles.map((a, i) => {
    let entry = `${i + 1}. "${a.title}" (${a.domain})`;
    if (a.summary) entry += `\n   Summary: ${a.summary}`;
    else if (a.excerpt) entry += `\n   Excerpt: ${a.excerpt}`;
    return entry;
  }).join('\n');

  let trendHint = '';
  if (trending.length > 0) {
    trendHint = `\n\nTrending topics today: ${trending.join(', ')}. Prioritize these themes and the unseen articles within them.\n`;
  }

  const prompt = `You are a sharp, well-read friend giving an overview of what's in the reading queue. Below are ${articles.length} articles bookmarked in the past ${days === 1 ? 'day' : days + ' days'}.

Write about two paragraphs of flowing prose with no headings — no #, no ##. Keep it concise and specific.

LINKING RULE — THIS IS CRITICAL: Every article you mention MUST be a markdown link in this exact format: [exact title](#article-N) where N is the article's number from the list below. Copy the title exactly. Example: if article 3 is "Apple Does Fusion", write [Apple Does Fusion](#article-3) in your text. Do NOT use bold, quotes, or any other format for article titles — always use this link format. This creates clickable links in the UI.

When articles share a theme, group them naturally. Name the author or publication when it adds credibility (e.g., "Om Malik digs into fusion energy in [Apple Does Fusion](#article-3)").

If there's a video, podcast, or other media item, call out the type — e.g., "there's a Daily Show clip, [Episode Title Here](#article-5)".

Tone: be somber and respectful when mentioning death, tragedy, or loss. Never sound excited about bad news.

Do NOT use generic summarizing language like "underscoring the human impact" or "highlighting broader themes." Be specific — say what the article is actually about.

Articles:
${articleList}${trendHint}

Briefing:`;

  const result = await summarizeText(prompt);

  const articleMeta = articles.map(a => ({
    title: a.title,
    filename: a.filename || '',
    domain: a.domain,
  }));

  return { briefing: result.summary, articles: articleMeta };
}
