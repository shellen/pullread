// ABOUTME: Tests for the Rundown content settings (Today's one read, wider news, Near you feeds)
// ABOUTME: Server-side validation in email.ts, and viewer/21-rundown-settings.js against a stubbed DOM and fetch

import { readFileSync } from 'fs';
import { join } from 'path';
import { sanitizeRundownContentSettings } from './email';

describe('sanitizeRundownContentSettings', () => {
  test('returns only fields that are present and valid, so partial saves never clobber others', () => {
    expect(sanitizeRundownContentSettings({ oneRead: false })).toEqual({ oneRead: false });
    expect(sanitizeRundownContentSettings({ widerNews: 'yes', oneRead: 1 })).toEqual({});
    expect(sanitizeRundownContentSettings(null)).toEqual({});
  });

  test('keeps http(s) feeds, drops junk and duplicates, names unnamed feeds by host, caps at 10', () => {
    const out = sanitizeRundownContentSettings({ regionalFeeds: [
      { name: ' KQED ', feedUrl: 'https://www.kqed.org/news/feed' },
      { name: '', feedUrl: 'https://www.sfchronicle.com/feed' },
      { name: 'Dup', feedUrl: 'https://www.kqed.org/news/feed' },
      { name: 'Bad', feedUrl: 'javascript:alert(1)' },
      { name: 'Bad', feedUrl: 'not a url' },
      'nonsense',
      ...Array.from({ length: 12 }, (_, i) => ({ name: `F${i}`, feedUrl: `https://f${i}.example/feed` })),
    ] });
    expect(out.regionalFeeds!.slice(0, 2)).toEqual([
      { name: 'KQED', feedUrl: 'https://www.kqed.org/news/feed' },
      { name: 'sfchronicle.com', feedUrl: 'https://www.sfchronicle.com/feed' },
    ]);
    expect(out.regionalFeeds).toHaveLength(10);
  });
});

describe('panelEnabled validation', () => {
  test('keeps known outlet names (deduped), drops unknown ones, and null resets to defaults', () => {
    expect(sanitizeRundownContentSettings({ panelEnabled: ['NPR', 'Made Up News', 'NPR', 42, 'Reason'] })).toEqual({ panelEnabled: ['NPR', 'Reason'] });
    expect(sanitizeRundownContentSettings({ panelEnabled: null })).toEqual({ panelEnabled: null });
  });
});

describe('viewer/21-rundown-settings.js', () => {
  function load() {
    const src = readFileSync(join(__dirname, '..', 'viewer', '21-rundown-settings.js'), 'utf-8');
    const els: Record<string, any> = {
      'sp-regional-name': { value: '' },
      'sp-regional-url': { value: '' },
      'rundown-regional-list': { innerHTML: '' },
      'rundown-regional-status': { textContent: '' },
      'rundown-outlet-list': { style: { display: 'none' }, innerHTML: '' },
    };
    const posts: any[] = [];
    const env = {
      document: { getElementById: (id: string) => els[id] || null, querySelector: () => null },
      fetch: jest.fn(async (_u: string, init: any) => { posts.push(JSON.parse(init.body)); return { json: async () => ({ ok: true }) }; }),
      escapeHtml: (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    };
    const api = new Function(...Object.keys(env), `${src}; return { renderRundownContentSettings, settingsToggleRundownContent, settingsAddRegionalFeed, settingsRemoveRegionalFeed, validateRegionalFeedUrl, settingsToggleOutletList, settingsToggleOutlet, settingsResetOutlets, outletBalanceNote };`)(...Object.values(env));
    return { api, els, posts };
  }

  const data = {
    oneRead: true, widerNews: false,
    regionalFeeds: [{ name: 'KQED', feedUrl: 'https://www.kqed.org/news/feed' }],
    panelCustom: false,
    panelCatalog: [
      { name: 'NPR', lean: 'left', scope: 'national', defaultOn: true, enabled: true },
      { name: 'ProPublica', lean: 'left', scope: 'national', defaultOn: false, enabled: false },
      { name: 'BBC News', lean: 'center', scope: 'global', defaultOn: true, enabled: true },
      { name: 'Fox News', lean: 'right', scope: 'national', defaultOn: true, enabled: true },
    ],
  };

  test('renders both toggles in their saved state, the outlets by lean, and the local feeds', () => {
    const { api } = load();
    const html: string = api.renderRundownContentSettings(data);
    expect(html).toContain('Today’s one read');
    expect(html).toMatch(/id="sp-rundown-oneread" checked/);
    expect(html).not.toMatch(/id="sp-rundown-widernews" checked/);
    expect(html).toContain('Choose outlets (3 on)');
    expect(html).toMatch(/id="sp-outlet-0" checked[^>]*>NPR/);
    expect(html).toMatch(/id="sp-outlet-1" onchange[^>]*>ProPublica/); // off by default
    expect(html).toContain('BBC News <span style="color:var(--muted);font-size:11px">world</span>');
    expect(html).toContain('KQED');
    expect(html).toContain('needs two local outlets'); // one feed isn't enough yet
  });

  test('missing settings default to on (matches the server defaults)', () => {
    const { api } = load();
    const html: string = api.renderRundownContentSettings({});
    expect(html).toMatch(/id="sp-rundown-oneread" checked/);
    expect(html).toMatch(/id="sp-rundown-widernews" checked/);
    expect(html).toContain('No local feeds yet.');
  });

  test('toggles save only the content fields', async () => {
    const { api, posts } = load();
    api.renderRundownContentSettings(data);
    await api.settingsToggleRundownContent('widerNews', true);
    expect(posts[0]).toEqual({ oneRead: true, widerNews: true, regionalFeeds: data.regionalFeeds });
  });

  test('adding a feed validates it, names it by host when unnamed, and saves; removing saves too', async () => {
    const { api, els, posts } = load();
    api.renderRundownContentSettings(data);
    els['sp-regional-url'].value = 'ftp://nope';
    expect(await api.settingsAddRegionalFeed()).toBe(false);
    expect(els['rundown-regional-status'].textContent).toMatch(/http/);
    els['sp-regional-url'].value = 'https://www.sfchronicle.com/feed';
    expect(await api.settingsAddRegionalFeed()).toBe(true);
    expect(posts[0].regionalFeeds).toEqual([...data.regionalFeeds, { name: 'sfchronicle.com', feedUrl: 'https://www.sfchronicle.com/feed' }]);
    expect(els['sp-regional-url'].value).toBe('');
    await api.settingsRemoveRegionalFeed(0);
    expect(posts[1].regionalFeeds).toEqual([{ name: 'sfchronicle.com', feedUrl: 'https://www.sfchronicle.com/feed' }]);
  });

  test('duplicate feeds are refused', () => {
    const { api } = load();
    expect(api.validateRegionalFeedUrl('https://www.kqed.org/news/feed', data.regionalFeeds)).toMatch(/already/);
  });

  test('toggling an outlet stores the full on-list; until then no list is stored', async () => {
    const { api, posts } = load();
    api.renderRundownContentSettings(data);
    await api.settingsToggleRundownContent('oneRead', false);
    expect(posts[0]).not.toHaveProperty('panelEnabled'); // defaults stay in effect
    await api.settingsToggleOutlet(1, true); // ProPublica on
    expect(posts[1].panelEnabled).toEqual(['NPR', 'ProPublica', 'BBC News', 'Fox News']);
    await api.settingsToggleOutlet(3, false); // Fox News off
    expect(posts[2].panelEnabled).toEqual(['NPR', 'ProPublica', 'BBC News']);
  });

  test('reset goes back to the defaults and clears the stored list', async () => {
    const { api, posts } = load();
    api.renderRundownContentSettings({ ...data, panelCustom: true });
    await api.settingsResetOutlets({ preventDefault() {} });
    expect(posts[0].panelEnabled).toBeNull();
  });

  test('balance note: too few outlets, one lean only, or a missing lean', () => {
    const { api } = load();
    const o = (name: string, lean: string, enabled = true) => ({ name, lean, scope: 'national', defaultOn: true, enabled });
    expect(api.outletBalanceNote([o('A', 'left'), o('B', 'center')])).toMatch(/at least 3/);
    expect(api.outletBalanceNote([o('A', 'left'), o('B', 'left'), o('C', 'left')])).toMatch(/one lean/);
    expect(api.outletBalanceNote([o('A', 'left'), o('B', 'left'), o('C', 'center')])).toMatch(/No right-leaning outlets/);
    expect(api.outletBalanceNote([o('A', 'left'), o('B', 'center'), o('C', 'right')])).toBe('');
  });

  test('"Which outlets?" toggles the list', () => {
    const { api, els } = load();
    api.settingsToggleOutletList({ preventDefault() {} });
    expect(els['rundown-outlet-list'].style.display).toBe('');
  });
});
