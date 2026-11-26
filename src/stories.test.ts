// ABOUTME: Tests for story grouping, weighing and the wider-news panel
// ABOUTME: Uses real-world-shaped headlines; the Chile quake is a made-up sample story

import { groupStories, withOtherCopies, storyMatcher, weighStories, findConsensus, pickTopStories, fetchPanelHeadlines, storyTokens, relatedStory, clusterHeadlines, PANEL_CATALOG, DEFAULT_PANEL, panelFor, wideBar, beyondBar } from './stories';
import type { PanelSource, PanelHeadline } from './stories';
import type { ArticleMeta } from './email';

function article(o: Partial<ArticleMeta> & { title: string; url: string }): ArticleMeta {
  return { filename: `${o.title}.md`, domain: new URL(o.url).hostname.replace(/^www\./, ''), ...o };
}

const PANEL: PanelSource[] = [
  { name: 'NPR', feedUrl: 'npr', lean: 'left', scope: 'national' },
  { name: 'The Guardian', feedUrl: 'guardian', lean: 'left', scope: 'global' },
  { name: 'The New York Times', feedUrl: 'nyt', lean: 'left', scope: 'national' },
  { name: 'BBC News', feedUrl: 'bbc', lean: 'center', scope: 'global' },
  { name: 'The Wall Street Journal', feedUrl: 'wsj', lean: 'center', scope: 'global' },
  { name: 'The Hill', feedUrl: 'hill', lean: 'center', scope: 'national' },
  { name: 'Fox News', feedUrl: 'fox', lean: 'right', scope: 'national' },
  { name: 'Washington Examiner', feedUrl: 'examiner', lean: 'right', scope: 'national' },
  { name: 'New York Post', feedUrl: 'post', lean: 'right', scope: 'national' },
];

function h(source: string, title: string, extra: Partial<PanelHeadline> = {}): PanelHeadline {
  const p = PANEL.find(x => x.name === source)!;
  return { title, url: `https://${p.feedUrl}.example/${encodeURIComponent(title).slice(0, 40)}`, source, lean: p.lean, scope: p.scope, ...extra };
}

const QUAKE = [
  h('BBC News', 'Chile earthquake: Dozens dead after 7.8 magnitude quake strikes near Santiago'),
  h('The Wall Street Journal', 'Powerful 7.8 Earthquake Hits Central Chile, Killing Dozens'),
  h('NPR', 'A 7.8 magnitude earthquake strikes central Chile, killing dozens'),
  h('Fox News', 'Massive 7.8 earthquake rocks Chile, dozens killed'),
  h('The Guardian', 'Chile earthquake: rescuers search rubble after 7.8 quake kills dozens'),
  h('The Hill', 'Chile hit by 7.8 earthquake; dozens dead'),
];

describe('groupStories', () => {
  test('keeps every copy of a story and counts distinct outlets', () => {
    const groups = groupStories([
      article({ title: 'Julien Baker Lines Up New Album This World or the Next', url: 'https://pitchfork.com/news/julien-baker' }),
      article({ title: 'Julien Baker Announces New Album This World Or The Next: Hear “Hound”', url: 'https://stereogum.com/2518378/julien-baker' }),
      article({ title: 'BMW Recalls 286 i5 And i7 EVs', url: 'https://electrek.co/bmw' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].members).toHaveLength(2);
    expect(groups[0].sources).toEqual(['pitchfork.com', 'stereogum.com']);
  });

  test('two links from the same outlet count as one source', () => {
    const title = 'Judge Approves $7 Billion Settlement Over Claims That Roundup Caused Cancer';
    const [g] = groupStories([
      article({ title, url: 'https://www.nytimes.com/a' }),
      article({ title, url: 'https://www.nytimes.com/b' }),
    ]);
    expect(g.members).toHaveLength(2);
    expect(g.sources).toEqual(['nytimes.com']);
  });
});

describe('cross-outlet matching', () => {
  test('matches the same news worded differently', () => {
    for (const other of QUAKE.slice(1)) {
      expect(relatedStory(storyTokens(QUAKE[0].title), storyTokens(other.title))).toBe(true);
    }
  });

  test('does not match different stories that share a subject', () => {
    expect(relatedStory(
      storyTokens('Trump lands in China with key meetings with Xi on the agenda'),
      storyTokens('Trump orders federal contractors to check with White House before responding to Congress'),
    )).toBe(false);
  });
});

describe('findConsensus', () => {
  test('a story most of the panel runs, across leans, is consensus', () => {
    const c = findConsensus([...QUAKE, h('NPR', 'Local library extends hours')], PANEL);
    expect(c).toHaveLength(1);
    expect(c[0].sources).toHaveLength(6);
    expect(c[0].strength).toBeCloseTo(6 / 9);
    expect(c[0].leans.sort()).toEqual(['center', 'left', 'right']);
  });

  test('one side covering a story alone is not consensus', () => {
    const c = findConsensus([
      h('Fox News', 'Senate probe targets border agency spending'),
      h('Washington Examiner', 'Senate probe targets border agency over spending'),
      h('New York Post', 'Border agency spending faces Senate probe'),
      h('The Hill', 'Unrelated budget story'),
    ], PANEL);
    expect(c).toHaveLength(0);
  });

  test('an outlet running a story twice still gets one vote', () => {
    const c = findConsensus([
      h('BBC News', 'Chile earthquake: Dozens dead after 7.8 magnitude quake'),
      h('BBC News', 'Chile earthquake: rescuers race to reach survivors of 7.8 quake'),
      h('BBC News', 'Chile earthquake: what we know about the 7.8 quake'),
      h('NPR', 'A 7.8 magnitude earthquake strikes central Chile'),
    ], PANEL);
    expect(c).toHaveLength(0); // 2 outlets of 9 is below the 40% bar
  });

  test('regional outlets agreeing make a regional story', () => {
    const panel: PanelSource[] = [...PANEL,
      { name: 'KQED', feedUrl: 'kqed', lean: 'center', scope: 'regional' },
      { name: 'SF Chronicle', feedUrl: 'sfchron', lean: 'center', scope: 'regional' },
    ];
    const c = findConsensus([
      { title: 'BART suspends service systemwide after power failure', url: 'https://kqed.example/bart', source: 'KQED', lean: 'center', scope: 'regional' },
      { title: 'BART service suspended across system by power failure', url: 'https://sfchron.example/bart', source: 'SF Chronicle', lean: 'center', scope: 'regional' },
    ], panel);
    expect(c).toHaveLength(1);
    expect(c[0].scope).toBe('regional');
  });
});

// Headlines from the first live panel run (Nov 25, 2026). Feeds reached 8 of 9 outlets and the
// best-covered stories had 3 outlets. Where the first headline's outlet wasn't shown, one is assumed.
describe('real headlines from the first live run', () => {
  const reached = PANEL.map(p => p.name).filter(n => n !== 'The Wall Street Journal'); // WSJ's feed didn't answer

  test('a story three outlets across two leans ran counts as widely covered', () => {
    const c = findConsensus([
      h('NPR', 'Al Gore buys local, family-owned newspaper in central Tennessee'),
      h('The Hill', 'Al Gore plans to buy Tennessee newspaper'),
      h('Fox News', "Al Gore buys hometown Tennessee newspaper, vows to preserve local outlet's 'independent voice'"),
    ], PANEL, { reached });
    expect(c).toHaveLength(1);
    expect(c[0].sources).toHaveLength(3);
    expect(c[0].strength).toBeCloseTo(3 / 8); // measured against the 8 outlets that answered
  });

  test('a headline joins a cluster by matching any member, not only the first', () => {
    const clusters = clusterHeadlines([
      h('NPR', 'Jensen Huang returns to Nvidia. And, Rep. Gomez resigns amid alleged sexual misconduct'),
      h('The New York Times', 'Jensen Huang Apologizes to Nvidia Employees, Says He Is in Therapy'),
      h('Fox News', 'Huang apologizes to employees, says he is in therapy'), // shares one word with NPR's, four with NYT's
      h('BBC News', "What Jensen Huang's return teaches China's Xi about Trump"),
    ]);
    expect(clusters).toHaveLength(1);
    expect(new Set(clusters[0].headlines.map(x => x.source)).size).toBe(4);
  });

  test('two outlets is not enough', () => {
    expect(findConsensus([
      h('The New York Times', 'Sullivan Concedes Alaska Senate Race to Peltola'),
      h('The Hill', 'Sullivan concedes to Peltola nearly a week after Alaska Senate race called'),
    ], PANEL, { reached })).toHaveLength(0);
  });
});

describe('outlet catalog and scaled thresholds', () => {
  test('the defaults are the original nine, three per lean, and every outlet is well formed', () => {
    expect(DEFAULT_PANEL.map(p => p.name)).toEqual(['NPR', 'The Guardian', 'The New York Times', 'BBC News', 'The Christian Science Monitor', 'The Hill', 'Fox News', 'Washington Examiner', 'New York Post']);
    for (const lean of ['left', 'center', 'right']) expect(DEFAULT_PANEL.filter(p => p.lean === lean)).toHaveLength(3);
    expect(new Set(PANEL_CATALOG.map(p => p.name)).size).toBe(PANEL_CATALOG.length);
    expect(PANEL_CATALOG.length).toBeGreaterThanOrEqual(20);
    for (const p of PANEL_CATALOG) expect(new URL(p.feedUrl).protocol).toBe('https:');
  });

  test('panelFor: the reader\u2019s outlets in catalog order, or the defaults', () => {
    expect(panelFor(null)).toBe(DEFAULT_PANEL);
    expect(panelFor(['Reason', 'NPR', 'Nope']).map(p => p.name)).toEqual(['NPR', 'Reason']);
  });

  test('bars scale gently with the number of outlets', () => {
    expect([wideBar(3), wideBar(9), wideBar(16), wideBar(24)]).toEqual([3, 3, 4, 5]);
    expect([beyondBar(5), beyondBar(9), beyondBar(12), beyondBar(24)]).toEqual([4, 6, 8, 8]);
  });

  test('with 24 outlets, a story run by 5 across leans is widely covered; 4 is not', () => {
    const panel = PANEL_CATALOG;
    const lean = (n: string) => panel.find(p => p.name === n)!;
    const mk = (names: string[]) => names.map(n => ({ title: 'Senate passes the farm bill after a long standoff', url: `https://x/${n}`, source: n, lean: lean(n).lean, scope: lean(n).scope }));
    expect(findConsensus(mk(['NPR', 'Vox', 'Axios', 'Reason']), panel)).toHaveLength(0);
    expect(findConsensus(mk(['NPR', 'Vox', 'Axios', 'Reason', 'Fox News']), panel)).toHaveLength(1);
  });
});

describe('weighing and Top stories', () => {
  const now = Date.parse('2026-11-25T18:00:00Z');
  const fresh = new Date(now - 3_600_000).toISOString();
  const base = (a: ArticleMeta) => (a.image ? 1 : 0) + (a.excerpt ? 1 : 0);

  test('a story several of your sources ran outweighs a single fresh story', () => {
    const groups = groupStories([
      article({ title: 'A single fresh story with a picture', url: 'https://a.com/1', image: 'https://img/1', excerpt: 'x', bookmarked: fresh }),
      article({ title: 'Julien Baker Lines Up New Album This World or the Next', url: 'https://pitchfork.com/news/julien-baker' }),
      article({ title: 'Julien Baker Announces New Album This World Or The Next', url: 'https://stereogum.com/julien-baker' }),
    ]);
    const weighed = weighStories(groups, [], base);
    expect(weighed[0].group.lead.domain).toBe('pitchfork.com');
    const { top } = pickTopStories(weighed, []);
    expect(top).toHaveLength(1);
    expect(top[0].alsoIn).toEqual([{ source: 'stereogum.com', url: 'https://stereogum.com/julien-baker' }]);
  });

  test('a major story none of your feeds had punches through', () => {
    const groups = groupStories([
      article({ title: 'The type foundry making fonts for street signs', url: 'https://itsnicethat.com/x', image: 'https://img/x', excerpt: 'x' }),
    ]);
    const consensus = findConsensus(QUAKE, PANEL);
    const { top, rest } = pickTopStories(weighStories(groups, consensus, base), consensus);
    expect(top).toHaveLength(1);
    expect(top[0].beyondFeeds).toBe(true);
    // A center outlet's copy (BBC News or the WSJ) leads.
    expect([QUAKE[0].title, QUAKE[1].title]).toContain(top[0].article.title);
    expect(top[0].wider?.sources).toHaveLength(6);
    expect(rest).toHaveLength(1);
  });

  test('a story widely covered but below the punch-through bar stays out unless you follow it', () => {
    const moderate = QUAKE.slice(0, 4); // 4 of 9 outlets: consensus, but under 60%
    const consensus = findConsensus(moderate, PANEL);
    expect(consensus).toHaveLength(1);
    const { top } = pickTopStories(weighStories([], consensus, base), consensus);
    expect(top).toHaveLength(0);
  });

  test('your copy of a widely covered story is boosted and labeled, not duplicated', () => {
    const groups = groupStories([
      article({ title: 'Chile quake: 7.8 tremor leaves dozens dead', url: 'https://apnews.com/chile' }),
      article({ title: 'Some other story with a picture', url: 'https://b.com/2', image: 'https://img/2', excerpt: 'x' }),
    ]);
    const consensus = findConsensus(QUAKE, PANEL);
    const weighed = weighStories(groups, consensus, base);
    expect(weighed[0].group.lead.domain).toBe('apnews.com');
    expect(weighed[0].wider).toBeGreaterThan(0);
    const { top } = pickTopStories(weighed, consensus);
    expect(top).toHaveLength(1);
    expect(top[0].beyondFeeds).toBe(false);
    expect(top[0].article.domain).toBe('apnews.com');
  });
});

describe('fetchPanelHeadlines', () => {
  test('skips a failing feed and headlines older than a day', async () => {
    const now = Date.parse('2026-11-25T18:00:00Z');
    const fetchFn = async (url: string) => {
      if (url === 'fox') throw new Error('503');
      return [
        { title: 'Fresh', url: `https://${url}/1`, updatedAt: '2026-11-25T12:00:00Z', contentHtml: '<p>Hello &amp; welcome</p>' },
        { title: 'Stale', url: `https://${url}/2`, updatedAt: '2026-11-23T12:00:00Z' },
      ];
    };
    const out = await fetchPanelHeadlines(PANEL.slice(5, 7), fetchFn, 24, now); // The Hill + Fox
    expect(out.map(x => [x.source, x.title])).toEqual([['The Hill', 'Fresh']]);
    expect(out[0].excerpt).toBe('Hello & welcome');
  });
});

describe('grouping real reworded copies (Nov 26)', () => {
  const at = (title: string, i: number) => article({ title, url: `https://outlet${i}.com/${i}`, domain: `outlet${i}.com`, filename: `${i}.md` });

  test('five outlets’ Andy Taylor obituaries are one story', () => {
    const g = groupStories([
      'Andy Taylor, versatile guitarist for Duran Duran, dies at 65',
      'Duran Duran’s Andy Taylor Dies at 65',
      // Matches the second headline but not the first: compared with every copy.
      'Duran Duran’s Andy Taylor Dead At 65',
      'Duran Duran guitarist Andy Taylor dies, aged 65',
      "Andy Taylor: Duran Duran's livewire guitarist who was a Wild Boy on stage and off",
    ].map(at));
    expect(g).toHaveLength(1);
    expect(g[0].sources).toHaveLength(5);
  });

  test('the result does not depend on arrival order (the BBC appreciation arrived first)', () => {
    const titles = [
      // These two share only andy/taylor/duran, so they start separate groups…
      "Andy Taylor: Duran Duran's livewire guitarist who was a Wild Boy on stage and off",
      'Duran Duran\u2019s Andy Taylor Dead At 65',
      // …and this one matches both, so it joins them into one.
      'Duran Duran guitarist Andy Taylor dies, aged 65',
    ];
    expect(groupStories(titles.map(at))).toHaveLength(1);
    expect(groupStories([...titles].reverse().map(at))).toHaveLength(1);
  });

  test('two mayor’s race stories merge; a business digest that shares the place does not', () => {
    const g = groupStories([
      'Ryan Coonerty declares victory in Santa Cruz mayor’s race as vote count nears end',
      'Ami Chen Mills concedes Santa Cruz mayor’s race after latest vote count',
      'Santa Cruz County business: Capstan completes first U.S. heart valve procedure; Driscoll’s wins injunction in legal fight',
    ].map(at));
    expect(g.map(x => x.members.length)).toEqual([2, 1]);
  });

  test('different stories about the same brand stay apart', () => {
    const g = groupStories([
      'BMW Recalls 286 i5 And i7 EVs Over Battery Fire Risk',
      'BMW i5 review: the electric 5 Series grows up',
      'BMW i7 M70 first drive: a 650-hp electric limo',
    ].map(at));
    expect(g).toHaveLength(3);
  });

  test('withOtherCopies adds every copy of a story the reader already engaged with', () => {
    const g = groupStories([
      'Duran Duran’s Andy Taylor Dies at 65',
      'Duran Duran guitarist Andy Taylor dies, aged 65',
      'What’s going on with the Riemann hypothesis?',
    ].map(at));
    expect([...withOtherCopies(g, new Set(['0.md']))].sort()).toEqual(['0.md', '1.md']);
  });
});

describe('storyMatcher', () => {
  test('matches a newer copy of an article read earlier, by its filename-derived title', () => {
    // titleFromFilename turns "2026-11-20-a-familiar-iranian-hacking-group-has-found-a-new-way-to-cause-chaos.md" into this:
    const seen = storyMatcher(['a familiar iranian hacking group has found a new way to cause chaos', 'whats going on with the riemann hypothesis']);
    expect(seen('A familiar Iranian hacking group has found a new way to cause chaos')).toBe(true);
    expect(seen('What\u2019s going on with the Riemann hypothesis?')).toBe(true);
    expect(seen('Iran\u2019s oil exports hit a new high')).toBe(false);
    expect(seen('Advocates claim AC Transit board violated the Brown Act')).toBe(false);
  });
});
