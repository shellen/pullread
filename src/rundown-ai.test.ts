// ABOUTME: Tests for the Rundown structured-output helpers (intro citations, model grouping, intro checks)
// ABOUTME: Model responses here are recorded samples, not live model output

import { parseFlatIntro, structuredIntroToMarkers, applyModelGroups, groupingPrompt, checkIntro, buildPerStoryIntro, unsupportedNames, mentionsToIntro, fallbackPhrase, parseIntroResponse, candidatePairs, pairsPrompt, groupingLinesFromPairs, batches, onDeviceGrouping, commonWords } from './rundown-ai';
import { groupStories } from './stories';
import type { ArticleMeta } from './email';

function article(title: string, url: string, extra: Partial<ArticleMeta> = {}): ArticleMeta {
  return { filename: `${title}.md`, title, url, domain: new URL(url).hostname.replace(/^www\./, ''), ...extra };
}

describe('structured intro', () => {
  test('turns cited phrases into markers for the existing renderer', () => {
    const intro = parseFlatIntro({
      paragraphs: ['A judge signed off on the Roundup settlement.', 'Julien Baker has a new record coming.'],
      links: ['1|2|Roundup settlement', '2|5|Julien Baker has a new record'],
    });
    const { text, dropped } = structuredIntroToMarkers(intro, 8);
    expect(text).toBe('A judge signed off on the {{Roundup settlement|2}}.\n\n{{Julien Baker has a new record|5}} coming.');
    expect(dropped).toEqual([]);
  });

  test('drops links to stories that do not exist or phrases not in the text, keeping the words', () => {
    const { text, dropped } = structuredIntroToMarkers({
      paragraphs: [{ text: 'BART went dark tonight.', links: [{ phrase: 'BART', story: 12 }, { phrase: 'Muni', story: 1 }] }],
    }, 8);
    expect(text).toBe('BART went dark tonight.');
    expect(dropped).toHaveLength(2);
  });

  test('ignores malformed link lines and stray braces from the model', () => {
    const { text } = structuredIntroToMarkers(parseFlatIntro({
      paragraphs: ['Odd {{text}} here.'], links: ['nonsense', '1|x|here'],
    }), 3);
    expect(text).toBe('Odd text here.');
  });
});

describe('per-story intro (macOS 26 shape)', () => {
  const titles = ['Chile earthquake: Dozens dead after 7.8 magnitude quake strikes near Santiago', 'Judge Approves $7 Billion Settlement Over Claims That Roundup Caused Cancer', 'Julien Baker Lines Up New Album This World or the Next'];

  test('every mentioned story gets a link, falling back to title words when the phrase is paraphrased', () => {
    const intro = mentionsToIntro([
      [{ story: 1, sentence: 'A 7.8 quake near Santiago has killed dozens.', phrase: '7.8 quake near Santiago' }],
      [{ story: 2, sentence: 'Bayer will pay $7 billion over Roundup.', phrase: 'Roundup cancer deal' },
       { story: 3, sentence: 'A new album by Julien Baker arrives in February.', phrase: '' }],
    ], titles);
    expect(intro.paragraphs.map(p => p.text)).toEqual([
      'A 7.8 quake near Santiago has killed dozens.',
      'Bayer will pay $7 billion over Roundup. A new album by Julien Baker arrives in February.',
    ]);
    expect(intro.paragraphs[1].links).toMatchObject([{ story: 2, phrase: '$7 billion' }, { story: 3, phrase: 'Julien Baker' }]);
  });

  test('a whole-sentence link is replaced by a short title-word link', () => {
    const sentence = 'Dozens dead after 7.8 magnitude quake strikes near Santiago';
    const intro = mentionsToIntro([[{ story: 1, sentence, phrase: sentence }]], titles);
    expect(intro.paragraphs[0].links[0].phrase.split(' ').length).toBeLessThanOrEqual(6);
    expect(intro.paragraphs[0].links[0].phrase).toBe('7.8 magnitude quake strikes near Santiago');
  });

  test('fallbackPhrase uses the first words when nothing matches the title', () => {
    expect(fallbackPhrase('Trains stopped across the system tonight.', 'Unrelated headline')).toBe('Trains stopped across the');
  });

  test('parseIntroResponse accepts both shapes', () => {
    expect(parseIntroResponse({ mentions: [[{ story: 1, sentence: 'Quake.', phrase: 'Quake' }]] }, titles).paragraphs).toHaveLength(1);
    expect(parseIntroResponse({ paragraphs: ['One.'], links: [] }, titles).paragraphs[0].text).toBe('One.');
  });
});

describe('buildPerStoryIntro', () => {
  const stories = [1, 2, 3, 4, 5, 6, 7].map(n => ({ title: `Story ${n}`, domain: 'x.com' }));

  test('lead gets two sentences, the second paragraph the rest, refusals skipped', async () => {
    const r = await buildPerStoryIntro(stories, p => (p.includes('Story 2') ? (() => { throw new Error('refused'); })() : { sentence: `About ${p.split('\n')[0].slice(10)}.`, phrase: 'About' }));
    expect(r!.mentions.map(p => p.map(m => m.story))).toEqual([[1, 3], [4, 5, 6]]);
    expect(r!.skipped).toBe(1);
  });

  test('keeps only the first sentence of each story', async () => {
    const ineos = [1, 2, 3].map(n => ({ title: `The BMW-Powered Ineos Grenadier Will Be Made In America (${n})`, domain: 'x.com' }));
    const r = await buildPerStoryIntro(ineos, () => ({
      sentence: 'The BMW-powered Ineos Grenadier will be built in America. This development is significant as it marks a major step.',
      phrase: 'Ineos Grenadier',
    }));
    expect(r!.mentions[0][0].sentence).toBe('The BMW-powered Ineos Grenadier will be built in America.');
  });

  test('a sentence that copies its headline is retried once, then the story is skipped', async () => {
    const real = [
      { title: "Trump Made Up to $15M on Nvidia Stock After Huang's Return", domain: 'x.com' },
      { title: 'Story B', domain: 'x.com' }, { title: 'Story C', domain: 'x.com' }, { title: 'Story D', domain: 'x.com' },
    ];
    const calls: Array<[string, boolean]> = [];
    const r = await buildPerStoryIntro(real, (p, retry) => {
      calls.push([p.split('\n')[0], retry]);
      if (p.includes('Nvidia')) return { sentence: "Trump made up to $15M on Nvidia stock after Huang's return.", phrase: 'Nvidia stock' };
      return { sentence: `Something specific happened in ${p.split('\n')[0].slice(10)} today.`, phrase: 'Something specific' };
    });
    expect(calls.filter(c => c[0].includes('Nvidia'))).toEqual([[expect.any(String), false], [expect.any(String), true]]);
    expect(r!.copied).toBe(1);
    expect(r!.mentions.flat().map(m => m.story)).toEqual([2, 3, 4]);
  });

  test('unsupportedNames catches invented names and quoted titles (real Nov 25 sentence)', async () => {
    const sentence = "John Berger appeared in 'Grand Theft Auto' as a character named 'The Philosopher' and was involved in a crime spree.";
    const source = 'Remembering John Berger, the critic who taught us how to look Ways of Seeing turns 50';
    expect(unsupportedNames(sentence, source)).toEqual(['Grand Theft Auto', 'The Philosopher']);
    expect(unsupportedNames('Bayer will pay billions to settle Roundup claims.', 'Judge Approves $7 Billion Settlement Over Claims That Roundup Caused Cancer, Bayer says')).toEqual([]);
    expect(unsupportedNames('Elsewhere, Google will open its first store in San Francisco.', 'Google to open its first retail store in San Francisco')).toEqual([]);
  });

  test('a story whose sentence keeps inventing names is skipped', async () => {
    const real = [
      { title: 'Remembering John Berger, the critic', domain: 'x.com' },
      { title: 'Story B', domain: 'x.com' }, { title: 'Story C', domain: 'x.com' }, { title: 'Story D', domain: 'x.com' },
    ];
    const r = await buildPerStoryIntro(real, p => p.includes('Berger')
      ? { sentence: 'John Berger appeared in Grand Theft Auto as The Philosopher.', phrase: 'John Berger' }
      : { sentence: `Something specific happened in ${p.split('\n')[0].slice(10)} today.`, phrase: 'Something specific' });
    expect(r!.invented).toBe(1);
    expect(r!.mentions.flat().map(m => m.story)).toEqual([2, 3, 4]);
  });

  test('returns null when fewer than three stories come back', async () => {
    expect(await buildPerStoryIntro(stories, p => (p.includes('Story 1') ? { sentence: 'One.', phrase: 'One' } : null))).toBeNull();
  });
});

describe('model grouping', () => {
  const articles = [
    article('Judge Approves $7 Billion Settlement Over Claims That Roundup Caused Cancer', 'https://www.nytimes.com/roundup', { image: 'https://img/r', excerpt: 'x' }),
    article('Weedkiller maker cleared to pay out billions to cancer claimants', 'https://www.theguardian.com/weedkiller'),
    article('BMW Recalls 286 i5 And i7 EVs Over Battery Fire Risk', 'https://electrek.co/bmw'),
  ];

  test('word overlap alone misses the reworded story', async () => {
    expect(groupStories(articles)).toHaveLength(3);
  });

  test('the model merges it, labels sections and rates importance', async () => {
    const groups = groupStories(articles);
    expect(groupingPrompt(groups).split('\n')[1]).toBe('[2] Weedkiller maker cleared to pay out billions to cancer claimants (theguardian.com)');
    const r = applyModelGroups(groups, ['1,2|Courts|4', '3|Autos|2']);
    expect(r.groups).toHaveLength(2);
    expect(r.groups[0].sources).toEqual(['nytimes.com', 'theguardian.com']);
    expect(r.groups[0].lead.domain).toBe('nytimes.com'); // the copy with an image leads
    expect(r.labels.get(r.groups[0])).toBe('Courts');
    expect(r.importance.get(r.groups[1])).toBe(2);
    expect(r.merges).toHaveLength(1);
  });

  test('refuses a merge of different events that only share a topic', async () => {
    const groups = groupStories([
      article('Why every app suddenly wants to be your daily newspaper', 'https://www.theverge.com/digest'),
      article('Bezos shrugs off blue wave, warns politicians not to make tech a villain', 'https://www.cnbc.com/bezos'),
    ]);
    const r = applyModelGroups(groups, ['1,2|Tech|2']);
    expect(r.groups).toHaveLength(2);
    expect(r.rejected).toHaveLength(1);
    expect(r.labels.get(r.groups[1])).toBe('Tech');
  });

  test('cannot split groups, ignores bad ids, and keeps groups the model skipped', async () => {
    const pair = groupStories([
      article('Julien Baker Lines Up New Album This World or the Next', 'https://pitchfork.com/baker'),
      article('Julien Baker Announces New Album This World Or The Next', 'https://stereogum.com/baker'),
      ...articles,
    ]);
    expect(pair).toHaveLength(4);
    const r = applyModelGroups(pair, ['1|Music|3', '1,9|Dup|5', 'junk']);
    expect(r.groups).toHaveLength(4);
    expect(r.groups[0].members).toHaveLength(2); // Baker pair stays together
  });
});

describe('macOS 26 tie-breaker grouping', () => {
  const groups = groupStories([
    article('Judge Approves $7 Billion Settlement Over Claims That Roundup Caused Cancer', 'https://www.nytimes.com/roundup'),
    article('Weedkiller maker cleared to pay out billions to cancer claimants', 'https://www.theguardian.com/weedkiller'),
    article('Why every app suddenly wants to be your daily newspaper', 'https://www.theverge.com/digest'),
    article('Bezos shrugs off blue wave, warns politicians not to make tech a villain', 'https://www.cnbc.com/bezos'),
  ]);

  test('only asks about groups that share a distinctive word', async () => {
    expect(candidatePairs(groups)).toEqual([[0, 1]]); // "cancer"; digest apps vs Bezos is never asked
  });

  test('numbers pairs across batches so ids stay unique', async () => {
    expect(pairsPrompt(groups, [[0, 1]], 12)).toMatch(/^P13: "Judge Approves/);
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test('does not chain merges: A~B and B~C without A~C merges only one pair', async () => {
    const pairs: Array<[number, number]> = [[0, 1], [1, 2]];
    const lines = groupingLinesFromPairs(4, pairs, ['P1', 'p2'], ['1|Courts|3', '2|Law|5', '[4] | Tech | 2', 'garbage']);
    expect(lines).toEqual(['1,2|Courts|5', '3||', '4|Tech|2']);
  });

  test('merges three when every pair is confirmed', async () => {
    const pairs: Array<[number, number]> = [[0, 1], [1, 2], [0, 2]];
    expect(groupingLinesFromPairs(3, pairs, ['P1', 'P2', 'P3'], ['1|Courts|3'])).toEqual(['1,2,3|Courts|3']);
  });

  test('common words are measured over the whole day, not the shortlist (from the real Black Friday/BMW merges)', async () => {
    const shortlist = groupStories([
      article('Acme Widget recall expands across Europe', 'https://a.com/1'),
      article('Acme Widget pricing leaks ahead of launch', 'https://b.com/2'),
    ]);
    // Within the shortlist alone, "acme" and "widget" look uncommon, so these pair up…
    expect(candidatePairs(shortlist).length).toBe(1);
    // …but if the whole day is full of Acme Widget posts (like BMW BLOG's BMW posts), they're common.
    const day = [...shortlist, ...groupStories(['colors', 'battery', 'teardown', 'accessories', 'firmware'].map((x, i) =>
      article(`Acme Widget ${x} roundup`, `https://d.com/${i}`)))];
    expect(candidatePairs(shortlist, 40, commonWords(day))).toEqual([]);
  });

  test('everyday words are not evidence (real Nov 25 merge: Berger/GTA + Life Time Grand Prix)', async () => {
    const g = groupStories([
      article("That Time John Berger Was in \u2018Grand Theft Auto\u2019", 'https://a.com/berger'),
      article('Life Time Announces a Record $800,000 Prize Purse for Its 2027 Grand Prix Series', 'https://b.com/lifetime'),
    ]);
    expect(candidatePairs(g)).toEqual([]); // "time" is everyday; "grand" alone is one word
  });

  test('a year is never evidence of the same event', async () => {
    const g = groupStories([
      article('Alpha Corp 2026 outlook raised', 'https://a.com/1'),
      article('Beta Inc 2026 outlook cut', 'https://b.com/2'),
    ]);
    expect(candidatePairs(g)).toEqual([]); // shares "2026" and "outlook" only — the year doesn't count
  });

  test('real BMW BLOG day: stories that only share the brand are never asked about', async () => {
    const bmw = groupStories([
      article('The BMW-Powered Ineos Grenadier Will Be Made In America', 'https://bmwblog.com/1'),
      article('The BMW M350 Costs Just $250 More Than The Last M340i xDrive. Here’s Which One We’d Buy While Stock Lasts', 'https://bmwblog.com/2'),
      article('Nearly 1,000 km On A Tank: The BMW 540d Touring Is The Road-Trip Wagon America Can’t Buy', 'https://bmwblog.com/3'),
      article('BMW iX3 Gets A Software Update', 'https://bmwblog.com/4'),
      article('BMW Recalls 286 i5 And i7 EVs Over Battery Fire Risk', 'https://electrek.co/bmw'),
    ]);
    // "bmw" is in all five stories, so it doesn't count; no pair shares two uncommon words.
    expect(candidatePairs(bmw)).toEqual([]);
  });

  test('can drop the importance ratings and keep labels and merges', async () => {
    expect(groupingLinesFromPairs(3, [[0, 1]], ['P1'], ['1|Courts|5', '2|Business|5', '3|Culture|5'], { useImportance: false }))
      .toEqual(['1,2|Courts|', '3|Culture|']);
  });

  test('a "no" from the model leaves groups separate', async () => {
    expect(groupingLinesFromPairs(2, [[0, 1]], [], [])).toEqual(['1||', '2||']);
  });
});

describe('onDeviceGrouping', () => {
  const groups = groupStories([
    article('Judge Approves $7 Billion Settlement Over Claims That Roundup Caused Cancer', 'https://www.nytimes.com/roundup'),
    article('Weedkiller maker cleared to pay out billions to cancer claimants', 'https://www.theguardian.com/weedkiller'),
    article('BMW Recalls 286 i5 And i7 EVs Over Battery Fire Risk', 'https://electrek.co/bmw'),
  ]);

  test('asks pairs then labels, and drops importance', async () => {
    const calls: string[] = [];
    const run = (mode: 'pairs' | 'labels') => {
      calls.push(mode);
      return mode === 'pairs' ? { same: ['P1', 'P7'] } : { stories: ['1|Courts|5', '2|Business|5', '3|Autos|5'] };
    };
    expect(await onDeviceGrouping(groups, run)).toEqual(['1,2|Courts|', '3|Autos|']);
    expect(calls).toEqual(['pairs', 'labels']);
  });

  test('a refused batch is skipped and the rest still count', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const run = (mode: 'pairs' | 'labels') => {
      if (mode === 'pairs') throw new Error('Apple Intelligence declined this request (safety guardrails)');
      return { stories: ['1|Courts|3', '3|Autos|3'] };
    };
    expect(await onDeviceGrouping(groups, run)).toEqual(['1|Courts|', '2||', '3|Autos|']);
  });

  test('throws when every call fails, so the caller reports grouping as failed', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(onDeviceGrouping(groups, () => { throw new Error('refused'); })).rejects.toThrow('every model call failed');
  });

  test('gives up if the time budget runs out before the pair questions finish', async () => {
    let t = 0;
    const clock = () => (t += 60_000);
    expect(await onDeviceGrouping(groups, () => ({ same: ['P1'] }), { budgetMs: 45_000, clock })).toBeNull();
  });

  test('keeps the merges if time runs out during labeling', async () => {
    let t = 0;
    const clock = () => (t += 30_000); // pairs at +30s, labels would start at +60s
    const run = (mode: 'pairs' | 'labels') => (mode === 'pairs' ? { same: ['P1'] } : { stories: ['1|Courts|3'] });
    expect(await onDeviceGrouping(groups, run, { budgetMs: 45_000, clock })).toEqual(['1,2||', '3||']);
  });
});

describe('checkIntro', () => {
  const now = new Date(2026, 10, 23, 18, 0); // Monday evening
  const good = 'A judge signed off on the {{Roundup settlement|1}}, closing a long fight.\n\nElsewhere, {{Julien Baker|3}} has a record coming in February.';

  test('flags the real macOS 26 on-device intro from Nov 25 (filler opener, 11 paragraphs, no links)', () => {
    const failed = checkIntro("Here are the top stories for today.\n\nA major earthquake struck Chile, causing significant damage and loss of life.\n\nA significant settlement was reached in a cancer lawsuit involving a weedkiller.\n\nPublic transportation was disrupted due to a power failure.\n\nA new album by Julien Baker is set to release.\n\nLanguage models are being used to create digest emails.\n\nPhotographer Nico Therin captured the quiet edges of Marseille.\n\nBMW is recalling EVs due to a battery fire risk.\n\nMajor road closures are planned for the Bay Bridge.\n\nJeff Bezos dismisses concerns about tech and politics.", { now, storyCount: 11 }).filter(c => !c.passed).map(c => c.rule);
    expect(failed).toEqual(['No filler opener', 'At most 3 paragraphs', 'Links at least one story']);
  });

  test('flags the second real on-device intro: copied excerpts linked as whole sentences', () => {
    const sources = [
      'Chile earthquake: Dozens dead after 7.8 magnitude quake strikes near Santiago',
      'The deal resolves tens of thousands of claims that the weedkiller caused non-Hodgkin lymphoma, and sets aside money for future cases.',
      'Trains are stopped across the system during the evening commute; AC Transit is adding buses.',
      'Digest emails are back, and this time the editor is a language model.',
      'A series shot over three winters, mostly before sunrise, of a city between shifts.',
    ];
    const failed = checkIntro("{{Dozens dead after 7.8 magnitude quake strikes near Santiago|1}}. {{Trains are stopped across the system during the evening commute|3}}.\n\n{{The deal resolves tens of thousands of claims that the weedkiller caused non-Hodgkin lymphoma|2}}. {{Digest emails are back, and this time the editor is a language model|5}}. {{A series shot over three winters, mostly before sunrise, of a city between shifts|6}}.", { now, storyCount: 8, sources }).filter(c => !c.passed).map(c => c.rule);
    expect(failed).toEqual(['Links are short (≤8 words)', 'Written in its own words']);
  });

  test('own-words check passes sentences that only borrow a few words', () => {
    const c = checkIntro("Bayer will pay out billions to end the {Roundup lawsuits|1}, though the science stays unsettled.", {
      now, storyCount: 3, sources: ['Judge Approves $7 Billion Settlement Over Claims That Roundup Caused Cancer'],
    });
    expect(c.find(x => x.rule === 'Written in its own words')!.passed).toBe(true);
  });

  test('flags the invented intro from an empty day (real macOS 26.6 output) as ungrounded', () => {
    const invented = "President Biden's administration has announced plans to invest $10 billion in the electric vehicle (EV) sector, aiming to boost domestic EV production and accelerate the transition to cleaner transportation. In a significant development, the U.S. Supreme Court ruled 6-3 in favor of affirmative action in college admissions, overturning a lower court's decision to ban race-conscious admissions practices.\n\nChina has launched a new lunar mission, Chang'e-6, with the goal of collecting and returning samples from the far side of the Moon, marking a significant milestone in China's space exploration efforts. The European Union is set to introduce new regulations on artificial intelligence, aiming to enhance transparency, accountability, and ethical standards in AI technologies. A major oil spill has occurred off the coast of California, resulting in significant environmental damage and prompting urgent response efforts from local authorities and environmental organizations.";
    const sources = ['Judge Approves $7 Billion Settlement Over Claims That Roundup Caused Cancer', 'BMW Recalls 286 i5 And i7 EVs Over Battery Fire Risk'];
    const rule = (src: string[]) => checkIntro(invented, { now, storyCount: src.length, sources: src }).find(c => c.rule === "Grounded in today's stories")!;
    expect(rule(sources).passed).toBe(false);
    expect(rule(sources).detail).toMatch(/^2 paragraph/);
    expect(rule([]).passed).toBe(false); // nothing to be about
  });

  test('a paraphrased paragraph without links is still grounded', () => {
    const c = checkIntro('Bayer agreed to pay billions over Roundup cancer claims, closing a long fight.', {
      now, storyCount: 1, sources: ['Judge Approves $7 Billion Settlement Over Claims That Roundup Caused Cancer'],
    });
    expect(c.find(x => x.rule === "Grounded in today's stories")!.passed).toBe(true);
  });

  test('flags the real text-prompt fallback intro (Nov 25) for stock filler', () => {
    const c = checkIntro("The tension is palpable as the holiday season approaches, and it's no surprise that political and cultural shifts are making headlines. On one hand, the unexpected return of Jensen Huang to Nvidia has sent ripples through Silicon Valley, as seen in \"Trump Made Up to $15M on Nvidia Stock After Huang\u2019s Return,\" where Trump's financial gain is tied to Huang's comeback.\n\nLastly, in the realm of health and wellness, a study reveals that more American women are turning to natural family planning, as reported in \"More American Women Are Turning to Natural Family Planning, Study Shows.\" As we navigate these complex issues, it's important to stay informed and engaged in the conversations that shape our communities and society as a whole.", { now, storyCount: 12 });
    const rule = c.find(x => x.rule === 'No stock filler')!;
    expect(rule.passed).toBe(false);
    expect(rule.detail).toContain('the tension is palpable');
    expect(rule.detail).toContain('as we navigate');
  });

  test('a clean intro passes every rule', () => {
    expect(checkIntro(good, { now, storyCount: 8 }).every(c => c.passed)).toBe(true);
  });

  test("catches naming today's weekday — the bug PR #121 fixed in the prompt", () => {
    const c = checkIntro("It's Monday, and the {{Roundup settlement|1}} is done.", { now, storyCount: 8 });
    expect(c.find(x => x.rule.startsWith("Doesn't name"))!.passed).toBe(false);
  });

  test('catches another day presented as today (the Nov 17 "Friday the 13th" intro)', () => {
    const c = checkIntro('It\u2019s Friday the 13th, and the {{Roundup settlement|1}} is done.', { now, storyCount: 8 });
    const rule = c.find(x => x.rule.startsWith("Doesn't name"))!;
    expect(rule.passed).toBe(false);
    expect(rule.detail).toBe('"it\'s friday the 13th"');
  });

  test('a story detail like "Monday morning closures" is not flagged', () => {
    const c = checkIntro('Caltrans plans {{Monday morning closures|7}} on the bridge.', { now: new Date(2026, 10, 25, 18), storyCount: 8 });
    expect(c.find(x => x.rule.startsWith("Doesn't name"))!.passed).toBe(true);
  });

  test('catches banned phrases, greetings and citations to missing stories', () => {
    const c = checkIntro('Good evening! Let’s dive in: the {{Roundup settlement|11}}.', { now, storyCount: 8 });
    const failed = c.filter(x => !x.passed).map(x => x.rule);
    expect(failed).toEqual(expect.arrayContaining(['No banned phrases', 'No greeting or sign-off', 'Every cited story exists']));
  });
});
