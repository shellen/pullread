// ABOUTME: Tests for story grouping, weighing and the wider-news panel
// ABOUTME: Uses real-world-shaped headlines; the Chile quake is a made-up sample story

import { groupStories, weighStories, findConsensus, pickTopStories, fetchPanelHeadlines, storyTokens, relatedStory } from './stories';
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
