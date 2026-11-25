// ABOUTME: A made-up day of articles and panel headlines for the Rundown demos
// ABOUTME: The Chile quake, BART outage and all model responses here are invented samples

import type { ArticleMeta } from '../../src/email';
import type { PanelHeadline, PanelSource } from '../../src/stories';
import { DEFAULT_PANEL } from '../../src/stories';

const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();
const img = (n: string) => `https://img.example/${n}.jpg`;
function A(o: Partial<ArticleMeta> & { title: string; url: string; h?: number }): ArticleMeta {
  const { h = 6, ...rest } = o;
  return { filename: `${o.title}.md`, domain: new URL(o.url).hostname.replace(/^www\./, ''), bookmarked: hoursAgo(h), ...rest };
}
const roundup = 'Judge Approves $7 Billion Settlement Over Claims That Roundup Caused Cancer';

/** Your feeds' last 24 hours. */
export const articles: ArticleMeta[] = [
  A({ title: roundup, url: 'https://www.nytimes.com/2026/11/20/business/judge-approves-7-billion-settlement.html', author: 'Emily Flitter', categories: ['Business'], image: img('roundup'), excerpt: 'The deal resolves tens of thousands of claims that the weedkiller caused non-Hodgkin lymphoma, and sets aside money for future cases.', h: 9 }),
  A({ title: roundup, url: 'https://www.nytimes.com/2026/11/20/business/bayer-settlement-roundup-cancer.html', author: 'Emily Flitter', categories: ['Bayer AG'], h: 9 }),
  A({ title: 'Bayer wins approval of $7 billion Roundup settlement over cancer claims', url: 'https://www.cnbc.com/2026/11/20/bayer-roundup-settlement.html', author: 'Dan Mangan', categories: ['Business'], h: 8 }),
  // Same news, worded so word overlap can't match it (demo 2).
  A({ title: 'Weedkiller maker cleared to pay out billions to cancer claimants', url: 'https://www.theguardian.com/business/2026/nov/20/weedkiller-cancer-claimants', author: 'Jasper Jolly', categories: ['Suits and Litigation (Civil)'], h: 7 }),
  A({ title: 'BMW Recalls 286 i5 And i7 EVs Over Battery Fire Risk', url: 'https://electrek.co/2026/11/20/bmw-recall', author: 'Fred Lambert', categories: ['Business'], excerpt: 'Owners are told to park outside until a dealer can inspect the high-voltage pack.', h: 3 }),
  A({ title: 'Julien Baker Lines Up New Album This World or the Next', url: 'https://pitchfork.com/news/julien-baker-new-album', author: 'Jazz Monroe', categories: ['Music'], image: img('baker'), excerpt: 'The record arrives in February and was produced with longtime collaborator Calvin Lauber.', h: 12 }),
  A({ title: 'Julien Baker Announces New Album This World Or The Next: Hear “Hound”', url: 'https://stereogum.com/2518378/julien-baker', author: 'Chris DeVille', categories: ['Music'], h: 11 }),
  A({ title: 'Nico Therin photographs the quiet edges of Marseille', url: 'https://www.itsnicethat.com/articles/nico-therin-photography', author: 'Ayla Angelos', categories: ['Photography'], image: img('therin'), excerpt: 'A series shot over three winters, mostly before sunrise, of a city between shifts.', h: 2 }),
  A({ title: 'The type foundry making fonts for street signs nobody reads', url: 'https://www.itsnicethat.com/articles/type-foundry-signage', author: 'Ayla Angelos', categories: ['Graphic Design'], excerpt: 'Wayfinding type has to work at 40 mph and in the rain. One studio thinks it can also be beautiful.', h: 5 }),
  A({ title: 'Monday morning closures planned on the Bay Bridge approach', url: 'https://www.sfchronicle.com/bayarea/bay-bridge-closures', author: 'Ricardo Cano', categories: ['Local'], excerpt: 'Caltrans will close two lanes from 5 a.m. to 11 a.m. for joint repairs.', h: 7 }),
  A({ title: 'Why every app suddenly wants to be your daily newspaper', url: 'https://www.theverge.com/2026/11/21/daily-digest-apps', author: 'David Pierce', categories: ['Tech'], image: img('verge'), excerpt: 'Digest emails are back, and this time the editor is a language model.', h: 1 }),
  A({ title: 'Bezos shrugs off blue wave, warns politicians not to make tech a villain', url: 'https://www.cnbc.com/2026/11/21/bezos-dealbook', author: 'Annie Palmer', categories: ['Technology'], h: 4 }),
];

export const regionalFeeds = [
  { name: 'KQED', feedUrl: 'https://www.kqed.org/news/feed' },
  { name: 'SF Chronicle', feedUrl: 'https://www.sfchronicle.com/feed' },
];

export const panel: PanelSource[] = [
  ...DEFAULT_PANEL,
  ...regionalFeeds.map(f => ({ ...f, lean: 'center' as const, scope: 'regional' as const })),
];

function P(source: string, title: string, url: string, extra: Partial<PanelHeadline> = {}): PanelHeadline {
  const p = panel.find(x => x.name === source)!;
  return { title, url, source, lean: p.lean, scope: p.scope, publishedAt: hoursAgo(2), ...extra };
}

/** The wider-news panel's last 24 hours. */
export const panelHeadlines: PanelHeadline[] = [
  P('BBC News', 'Chile earthquake: Dozens dead after 7.8 magnitude quake strikes near Santiago', 'https://www.bbc.com/news/world-latin-america-chile-quake', { image: img('quake'), excerpt: 'Rescuers are searching collapsed buildings in the capital after the strongest quake to hit the country in more than a decade.' }),
  P('The Wall Street Journal', 'Powerful 7.8 Earthquake Hits Central Chile, Killing Dozens', 'https://www.wsj.com/world/chile-quake'),
  P('NPR', 'A 7.8 magnitude earthquake strikes central Chile, killing dozens', 'https://www.npr.org/chile-quake'),
  P('Fox News', 'Massive 7.8 earthquake rocks Chile, dozens killed', 'https://www.foxnews.com/world/chile-quake'),
  P('The Guardian', 'Chile earthquake: rescuers search rubble after 7.8 quake kills dozens', 'https://www.theguardian.com/world/chile-quake'),
  P('The Hill', 'Chile hit by 7.8 earthquake; dozens dead', 'https://thehill.com/chile-quake'),
  P('The New York Times', roundup, 'https://www.nytimes.com/2026/11/20/business/judge-approves-7-billion-settlement.html'),
  P('The Wall Street Journal', 'Bayer Wins Approval for $7 Billion Roundup Cancer Settlement', 'https://www.wsj.com/business/bayer-roundup'),
  P('Fox News', 'Judge approves Bayer $7 billion Roundup cancer settlement', 'https://www.foxnews.com/roundup'),
  P('The Hill', 'Judge signs off on $7 billion Roundup settlement over cancer claims', 'https://thehill.com/roundup'),
  P('NPR', 'How a small Ohio town saved its last bookstore', 'https://www.npr.org/bookstore'),
  P('New York Post', 'Celebrity chef opens second Manhattan location', 'https://nypost.com/chef'),
  P('Fox News', 'Senate probe targets border agency spending', 'https://www.foxnews.com/border'),
  P('Washington Examiner', 'Senate probe targets border agency over spending', 'https://www.washingtonexaminer.com/border'),
  P('New York Post', 'Border agency spending faces Senate probe', 'https://nypost.com/border'),
  P('KQED', 'BART suspends service systemwide after power failure', 'https://www.kqed.org/news/bart-outage', { excerpt: 'Trains are stopped across the system during the evening commute; AC Transit is adding buses.' }),
  P('SF Chronicle', 'BART service suspended across system by power failure', 'https://www.sfchronicle.com/bayarea/bart-outage'),
];

// ---------------------------------------------------------------------------
// Recorded sample model responses (hand-written; --live replaces them with fm)
// ---------------------------------------------------------------------------

/**
 * Demo 1: what the macOS 26 intro schema returns — two paragraphs of per-story
 * sentences, each with its story number and the words to link.
 */
export const sampleIntro = {
  mentions: [
    [
      { story: 1, sentence: 'A 7.8 earthquake in central Chile has killed dozens, and rescuers are still working through collapsed buildings near Santiago.', phrase: '7.8 earthquake in central Chile' },
      { story: 2, sentence: 'A judge signed off on Bayer\u2019s $7 billion Roundup settlement, ending a long fight without settling the science.', phrase: 'Roundup settlement' },
    ],
    [
      { story: 3, sentence: 'Closer to home, BART went dark systemwide during the evening commute.', phrase: 'BART went dark systemwide' },
      { story: 4, sentence: 'Julien Baker has a new album coming in February.', phrase: 'a new record' }, // paraphrased: falls back to title words
      { story: 99, sentence: 'Nico Therin\u2019s photographs catch Marseille before sunrise.', phrase: 'Nico Therin\u2019s photographs' }, // wrong story number: dropped
    ],
  ],
};

/**
 * Demo 2: grouping response for groupingPrompt() over the sample feeds, as
 * "ids|label|importance". Ids follow groupStories(articles) order:
 * 1 Roundup (NYT+CNBC) · 2 Weedkiller (Guardian) · 3 BMW · 4 Julien Baker ·
 * 5 Therin · 6 Type foundry · 7 Bay Bridge · 8 Digest apps · 9 Bezos
 */
export const sampleGrouping = [ // macOS 27 / PCC full-list path
  '1,2|Courts|4',
  '3|Autos|2',
  '4|Music|2',
  '5|Photography|1',
  '6|Design|1',
  '7|Bay Area|3',
  '8,9|Tech|2', // a model mistake: same topic, different events — the guard refuses this merge
];

/**
 * Demo 2, macOS 26 path: answers to the "same event?" pair batch (pair ids
 * follow candidatePairs(groupStories(articles)); P1 is Roundup vs. Weedkiller,
 * which share "cancer") and to the label batch ("id|label|importance").
 */
export const sampleSamePairs = ['P1'];
export const sampleLabels = [
  '1|Courts|4',
  '2|Courts|4',
  '3|Autos|2',
  '4|Music|2',
  '5|Photography|1',
  '6|Design|1',
  '7|Bay Area|3',
  '8|Tech|2',
  '9|Tech|2',
];

/** Demo 3: intros to check — one clean, three with the kinds of mistakes we've seen. */
export const sampleIntrosToCheck: Array<{ label: string; text: string }> = [
  // Real output: the macOS 26 on-device model with the first (flat) intro schema, Nov 25, 2026.
  // Real output: per-story schema before the own-words prompt and short-link rule, Nov 25, 2026.
  { label: 'Real on-device output, per-story schema (macOS 26.6)', text: "{{Dozens dead after 7.8 magnitude quake strikes near Santiago|1}}. {{Trains are stopped across the system during the evening commute|3}}.\n\n{{The deal resolves tens of thousands of claims that the weedkiller caused non-Hodgkin lymphoma|2}}. {{Digest emails are back, and this time the editor is a language model|5}}. {{A series shot over three winters, mostly before sunrise, of a city between shifts|6}}." },
  { label: 'Real on-device output, flat schema (macOS 26.6)', text: "Here are the top stories for today.\n\nA major earthquake struck Chile, causing significant damage and loss of life.\n\nA significant settlement was reached in a cancer lawsuit involving a weedkiller.\n\nPublic transportation was disrupted due to a power failure.\n\nA new album by Julien Baker is set to release.\n\nLanguage models are being used to create digest emails.\n\nPhotographer Nico Therin captured the quiet edges of Marseille.\n\nBMW is recalling EVs due to a battery fire risk.\n\nMajor road closures are planned for the Bay Bridge.\n\nJeff Bezos dismisses concerns about tech and politics." },
  { label: 'Clean', text: 'A judge signed off on Bayer’s {{Roundup settlement|2}}, closing a long fight without settling the science.\n\nElsewhere, {{Julien Baker|4}} has a record coming in February.' },
  { label: 'Wrong day (the Nov 17 bug)', text: 'It’s Friday the 13th, and the {{Roundup settlement|2}} is finally done. Monday morning road closures are coming up on the {{Bay Bridge|7}}.' },
  { label: 'Filler and a greeting', text: 'Good evening! Let’s dive in. A judge approved the {{Roundup settlement|2}} today.\n\nThat’s the rundown — happy reading!' },
  { label: 'Cites a story that isn’t there', text: 'Bayer’s {{Roundup settlement|2}} cleared, and {{a new Pixar teaser|14}} dropped.' },
];
