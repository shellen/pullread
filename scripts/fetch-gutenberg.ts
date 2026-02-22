// ABOUTME: Downloads Project Gutenberg books and converts them to PullRead markdown
// ABOUTME: Strips Gutenberg headers/footers and adds YAML frontmatter

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const BOOKS = [
  { id: 5200, title: 'The Metamorphosis', author: 'Franz Kafka', slug: 'the-metamorphosis' },
  { id: 215, title: 'The Call of the Wild', author: 'Jack London', slug: 'the-call-of-the-wild' },
  { id: 1952, title: 'The Yellow Wallpaper', author: 'Charlotte Perkins Gilman', slug: 'the-yellow-wallpaper' },
  { id: 43, title: 'The Strange Case of Dr Jekyll and Mr Hyde', author: 'Robert Louis Stevenson', slug: 'dr-jekyll-and-mr-hyde' },
  { id: 2680, title: 'Meditations', author: 'Marcus Aurelius', slug: 'meditations' },
];

const OUTPUT_DIR = join(import.meta.dir, '..', 'data', 'books');

async function fetchBook(id: number): Promise<string> {
  const url = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

function stripGutenbergWrapper(text: string): string {
  // Remove BOM
  text = text.replace(/^\uFEFF/, '');

  // Find start marker
  const startPatterns = [
    /\*\*\*\s*START OF TH(IS|E) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i,
    /\*\*\*\s*START OF THE PROJECT GUTENBERG[^\n]*/i,
  ];
  for (const pat of startPatterns) {
    const match = text.match(pat);
    if (match) {
      text = text.slice(match.index! + match[0].length);
      break;
    }
  }

  // Find end marker
  const endPatterns = [
    /\*\*\*\s*END OF TH(IS|E) PROJECT GUTENBERG EBOOK[^\n]*/i,
    /\*\*\*\s*END OF THE PROJECT GUTENBERG[^\n]*/i,
    /End of the Project Gutenberg EBook/i,
    /End of Project Gutenberg/i,
  ];
  for (const pat of endPatterns) {
    const match = text.match(pat);
    if (match) {
      text = text.slice(0, match.index!);
      break;
    }
  }

  return text.trim();
}

function convertToMarkdown(text: string): string {
  const lines = text.split(/\r?\n/);
  const output: string[] = [];
  let inParagraph = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect chapter headings (all caps, short lines, or "CHAPTER X" / "Chapter X")
    if (/^(CHAPTER|Chapter|BOOK|Book|PART|Part)\s+[IVXLCDM\d]+/i.test(trimmed) && trimmed.length < 80) {
      if (inParagraph) { output.push(''); inParagraph = false; }
      output.push('');
      output.push('## ' + trimmed);
      output.push('');
      continue;
    }

    // All-caps short lines are likely section headings
    if (trimmed.length > 0 && trimmed.length < 60 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && !/^\d+$/.test(trimmed)) {
      // Check it's not just a Roman numeral alone
      if (!/^[IVXLCDM]+\.?$/.test(trimmed)) {
        if (inParagraph) { output.push(''); inParagraph = false; }
        output.push('');
        output.push('## ' + trimmed.charAt(0) + trimmed.slice(1).toLowerCase());
        output.push('');
        continue;
      }
    }

    if (trimmed === '') {
      if (inParagraph) {
        output.push('');
        inParagraph = false;
      }
    } else {
      if (inParagraph) {
        // Continue paragraph — append to previous line
        output[output.length - 1] += ' ' + trimmed;
      } else {
        output.push(trimmed);
        inParagraph = true;
      }
    }
  }

  // Clean up multiple blank lines
  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const book of BOOKS) {
    console.log(`Fetching: ${book.title} (ID ${book.id})...`);
    const raw = await fetchBook(book.id);
    const stripped = stripGutenbergWrapper(raw);
    const markdown = convertToMarkdown(stripped);

    const date = new Date().toISOString().slice(0, 10);
    const filename = `${book.slug}.md`;
    const frontmatter = [
      '---',
      `title: "${book.title}"`,
      `url: https://www.gutenberg.org/ebooks/${book.id}`,
      `bookmarked: ${date}`,
      `domain: gutenberg.org`,
      `feed: classic-books`,
      `author: "${book.author}"`,
      `tags: classicbooks`,
      '---',
    ].join('\n');

    const content = `${frontmatter}\n\n${markdown}\n`;
    writeFileSync(join(OUTPUT_DIR, filename), content);
    console.log(`  Saved: ${filename} (${(content.length / 1024).toFixed(0)}KB)`);
  }

  console.log('\nDone! Books saved to data/books/');
}

main().catch(e => { console.error(e); process.exit(1); });
