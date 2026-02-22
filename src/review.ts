// ABOUTME: Weekly review generation — thematic overview of recently bookmarked articles
// ABOUTME: Uses configured LLM (or Apple Intelligence) to produce a digest

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';
import { summarizeText } from './summarizer';
import { listMarkdownFiles, resolveFilePath } from './writer';

interface ArticleMeta {
  title: string;
  url: string;
  bookmarked: string;
  domain: string;
  feed?: string;
  summary?: string;
  excerpt?: string;
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
  return meta as ArticleMeta;
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

  const prompt = `You are a reading digest assistant. Below is a list of ${articles.length} articles bookmarked in the past ${periodLabel}.

Write a thematic ${reviewType} review in two sections:

**Review** (3-5 paragraphs): Identify the main themes, notable findings, and interesting connections between articles. Group related articles together. Use a conversational but informative tone. Do not list every article — synthesize the key ideas.

**Open Questions** (3-5 questions): Based on these readings, what questions remain unanswered or deserve further exploration? Be Socratic — frame questions that challenge assumptions, probe implications, or connect ideas across domains. Each question should briefly reference the article(s) that prompted it.

Format the output with ## Review and ## Open Questions headers.

Articles:
${articleList}

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
`;

  const dir = dirname(fullPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, markdown, 'utf-8');

  return { filename, review };
}
