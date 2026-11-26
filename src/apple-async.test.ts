// ABOUTME: Tests that Apple Intelligence helper calls don't block the sidecar's event loop
// ABOUTME: Covers the one-at-a-time model queue, shared/cached helper compiles, and unique temp files

import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let fakeHome = '';
jest.mock('os', () => {
  const real = jest.requireActual('os');
  return { ...real, homedir: () => fakeHome || real.homedir() };
});

import { withAppleModel, runProcess, ensureAppleBinary, appleTempPath } from './summarizer';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('withAppleModel', () => {
  test('runs calls one at a time, in order', async () => {
    const log: string[] = [];
    const job = (name: string, ms: number) => withAppleModel(async () => {
      log.push(`${name} start`);
      await sleep(ms);
      log.push(`${name} end`);
      return name;
    });
    const results = await Promise.all([job('a', 40), job('b', 5), job('c', 5)]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['a start', 'a end', 'b start', 'b end', 'c start', 'c end']);
  });

  test('a failed call does not block the next one', async () => {
    const failed = withAppleModel(async () => { throw new Error('refused'); });
    const next = withAppleModel(async () => 'ok');
    await expect(failed).rejects.toThrow('refused');
    await expect(next).resolves.toBe('ok');
  });
});

describe('runProcess', () => {
  test('leaves the event loop free while the helper runs', async () => {
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 10);
    try {
      await runProcess('sleep', ['0.3'], { timeout: 5_000 });
    } finally {
      clearInterval(timer);
    }
    // A synchronous call (the old execFileSync) would leave this at 0.
    expect(ticks).toBeGreaterThan(5);
  });

  test('rejects with the helper stderr attached', async () => {
    await expect(runProcess('sh', ['-c', 'echo REFUSAL: nope >&2; exit 3'], { timeout: 5_000 }))
      .rejects.toMatchObject({ stderr: expect.stringContaining('REFUSAL: nope') });
  });
});

describe('ensureAppleBinary compile fallback', () => {
  const origPath = process.env.PATH;
  afterEach(() => {
    fakeHome = '';
    process.env.PATH = origPath;
  });

  test('concurrent calls share one compile, and a failed compile is not retried', async () => {
    const home = mkdtempSync(join(tmpdir(), 'pr-home-'));
    mkdirSync(join(home, '.config', 'pullread'), { recursive: true });
    const bin = mkdtempSync(join(tmpdir(), 'pr-bin-'));
    const count = join(bin, 'count');
    // A swiftc that takes a moment and then fails (no Xcode tools installed).
    writeFileSync(join(bin, 'swiftc'), `#!/bin/sh\necho x >> "${count}"\nsleep 0.2\nexit 1\n`);
    chmodSync(join(bin, 'swiftc'), 0o755);
    fakeHome = home;
    process.env.PATH = `${bin}:${origPath}`;

    const source = `// unique ${Date.now()}`;
    const [a, b] = await Promise.all([
      ensureAppleBinary(source, '.apple-test-only'),
      ensureAppleBinary(source, '.apple-test-only'),
    ]);
    expect([a, b]).toEqual([null, null]);
    expect(await ensureAppleBinary(source, '.apple-test-only')).toBeNull();
    expect(readFileSync(count, 'utf-8').trim().split('\n')).toHaveLength(1);
  });

  test('a successful compile returns the cached binary path', async () => {
    const home = mkdtempSync(join(tmpdir(), 'pr-home-'));
    mkdirSync(join(home, '.config', 'pullread'), { recursive: true });
    const bin = mkdtempSync(join(tmpdir(), 'pr-bin-'));
    // swiftc -parse-as-library <src> -o <out>: write the output file.
    writeFileSync(join(bin, 'swiftc'), '#!/bin/sh\necho "#!/bin/sh" > "$4"\n');
    chmodSync(join(bin, 'swiftc'), 0o755);
    fakeHome = home;
    process.env.PATH = `${bin}:${origPath}`;

    const path = await ensureAppleBinary(`// ok ${Date.now()}`, '.apple-test-ok');
    expect(path).toBe(join(home, '.config', 'pullread', '.apple-test-ok'));
    expect(existsSync(path!)).toBe(true);
  });
});

describe('appleTempPath', () => {
  test('never repeats, so overlapping calls cannot overwrite each other', () => {
    const paths = new Set(Array.from({ length: 200 }, () => appleTempPath('.apple-prompt')));
    expect(paths.size).toBe(200);
  });
});
