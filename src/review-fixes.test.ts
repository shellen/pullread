// ABOUTME: Regression tests for the five code-review findings fixed on the 0.6 branch (PR #124)
// ABOUTME: Near you needs two outlets, intro links stay in their sentence, reading API is same-origin, weekday rule, Near you without Wider news

jest.mock('./feed', () => ({
  // Two local outlets agree on one story; nothing else answers.
  fetchFeed: jest.fn(async (url: string) => {
    const at = new Date().toISOString();
    if (url.includes('kqed')) return [{ title: 'BART suspends service systemwide after power failure', url: 'https://kqed.example/bart', updatedAt: at }];
    if (url.includes('sfchron')) return [{ title: 'BART service suspended across system by power failure', url: 'https://sfchron.example/bart', updatedAt: at }];
    throw new Error('offline');
  }),
}));

import { findConsensus } from './stories';
import type { PanelSource, PanelHeadline } from './stories';
import { mentionsToIntro, structuredIntroToMarkers, checkIntro, blockingFailures } from './rundown-ai';
import { isSameOrigin } from './viewer';
import { curateWithStories } from './email';
import { fetchFeed } from './feed';
import type { ArticleMeta } from './email';

const regional = (name: string): PanelSource => ({ name, feedUrl: name.toLowerCase(), lean: 'center', scope: 'regional' });
const rh = (source: string, title: string): PanelHeadline => ({ title, url: `https://${source}.example/${encodeURIComponent(title)}`, source, lean: 'center', scope: 'regional' });

describe('1. Near you needs two agreeing local outlets', () => {
  test('one local feed never produces a regional story', () => {
    expect(findConsensus([rh('KQED', 'BART suspends service'), rh('KQED', 'Muni fares rise')], [regional('KQED')])).toEqual([]);
  });

  test('two configured but only one answering is not enough either', () => {
    const panel = [regional('KQED'), regional('SF Chronicle')];
    expect(findConsensus([rh('KQED', 'BART suspends service systemwide after power failure')], panel, { reached: ['KQED'] })).toEqual([]);
  });

  test('two agreeing outlets still make a regional story', () => {
    const panel = [regional('KQED'), regional('SF Chronicle')];
    const c = findConsensus([rh('KQED', 'BART suspends service systemwide after power failure'), rh('SF Chronicle', 'BART service suspended across system by power failure')], panel);
    expect(c.map(x => x.scope)).toEqual(['regional']);
  });
});

describe('2. intro links stay in their own sentence', () => {
  test('a phrase also present in an earlier sentence links in its own sentence', () => {
    const intro = mentionsToIntro([[
      { story: 1, sentence: 'Trump earned millions from Nvidia shares after the reinstatement.', phrase: 'Trump earned millions' },
      { story: 2, sentence: 'Nvidia brought back its chief executive this week.', phrase: 'Nvidia' },
    ]], ['Trump made up to $15M on Nvidia stock', 'Nvidia board reinstates Jensen Huang']);
    expect(structuredIntroToMarkers(intro, 2).text).toBe(
      '{{Trump earned millions|1}} from Nvidia shares after the reinstatement. {{Nvidia|2}} brought back its chief executive this week.');
  });
});

describe('3. reading API is same-origin only', () => {
  test('the viewer’s own origins (and no Origin) pass; other sites do not', () => {
    expect(isSameOrigin(undefined, 7777)).toBe(true);
    expect(isSameOrigin('http://localhost:7777', 7777)).toBe(true);
    expect(isSameOrigin('http://127.0.0.1:7777', 7777)).toBe(true);
    expect(isSameOrigin('https://evil.example', 7777)).toBe(false);
    expect(isSameOrigin('http://localhost:8080', 7777)).toBe(false);
  });
});

describe('4. weekday rule blocks only a day presented as today', () => {
  const tuesday = new Date(2026, 10, 24, 18);
  test('"Tuesday’s count" on a Tuesday is not blocking (real case from review)', () => {
    const t = "Alaska's Senate race was called on {{Tuesday's count|1}}, with Peltola ahead.";
    const checks = checkIntro(t, { now: tuesday, storyCount: 3, sources: ['Peltola wins Alaska Senate race after Tuesday count'] });
    expect(blockingFailures(checks)).toEqual([]);
    expect(checks.find(c => c.rule === "Doesn't mention today's weekday or date")!.passed).toBe(false); // still logged
  });

  test('"It’s Friday the 13th" and "Happy Tuesday" are still blocked', () => {
    for (const t of ["It's Friday the 13th, and the {{Roundup settlement|1}} is done.", 'Happy Tuesday! The {{Roundup settlement|1}} is done.']) {
      expect(blockingFailures(checkIntro(t, { now: tuesday, storyCount: 3 }))[0]).toMatch(/^Doesn't name a day or date as today/);
    }
  });
});

describe('5. Near you works with Wider news off', () => {
  test('local feeds are fetched and agree into a regional top story without the wider panel', async () => {
    const mine: ArticleMeta[] = [{ filename: 'a.md', title: 'A gardening column', url: 'https://garden.example/a', domain: 'garden.example' }];
    let report: any;
    const out = await curateWithStories(mine, {
      widerNews: false,
      regionalFeeds: [{ name: 'KQED', feedUrl: 'https://kqed.example/feed' }, { name: 'SF Chronicle', feedUrl: 'https://sfchron.example/feed' }],
    }, () => 0, undefined, undefined, { onReport: r => { report = r; } });
    const called = (fetchFeed as jest.Mock).mock.calls.map(c => c[0]);
    expect(called).toEqual(['https://kqed.example/feed', 'https://sfchron.example/feed']); // only the local feeds
    expect(out[0].story?.beyondFeeds).toBe(true);
    expect(out[0].story?.wider?.scope).toBe('regional');
    expect(report.panelFeeds).toBe(2);
  });
});
