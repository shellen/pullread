// ABOUTME: Three Rundown demos from docs/plans/2026-11-25-rundown-stories-and-apple-intelligence-plan.md
// ABOUTME: Sample mode runs anywhere; --live asks Apple's `fm` CLI (macOS 27) for the model parts

/*
 * bun scripts/demos/rundown-demos.ts [--out dir] [--live] [--on-device]
 *
 *   Demo 1  Structured intro: the model returns paragraphs + cited story numbers
 *           (guided generation), so links are exact instead of title-matched.
 *   Demo 2  Model-assisted grouping: the model merges stories word overlap
 *           missed, labels sections, and rates importance. On macOS 26 the
 *           on-device model is a tie-breaker: "same event?" for candidate
 *           pairs, then labels in batches. On macOS 27 PCC gets the full list.
 *   Demo 3  Intro checks: rule checks on generated intros (Evaluations-style).
 *
 * Without --live, the model responses are recorded samples from sample-day.ts.
 * With --live they come from Apple's model: on macOS 27 through `fm respond`
 * (demo 2 uses --model pcc unless --on-device is passed); on macOS 26, where
 * there's no `fm`, through fm-structured.swift (compiled once with swiftc,
 * on-device model only — Private Cloud Compute needs macOS 27).
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { buildRoundupHtml, curateWithStories, scoreArticle, escapeHtml, issueDateLine } from '../../src/email';
import type { ArticleMeta } from '../../src/email';
import { groupStories } from '../../src/stories';
import { parseFlatIntro, structuredIntroToMarkers, groupingPrompt, GROUPING_INSTRUCTIONS, checkIntro, applyModelGroups, candidatePairs, pairsPrompt, PAIR_INSTRUCTIONS, labelPrompt, LABEL_INSTRUCTIONS, batches, groupingLinesFromPairs } from '../../src/rundown-ai';
import { articles, panel, panelHeadlines, regionalFeeds, sampleIntro, sampleGrouping, sampleSamePairs, sampleLabels, sampleIntrosToCheck } from './sample-day';

const args = process.argv.slice(2);
const live = args.includes('--live');
const onDevice = args.includes('--on-device');
const outDir = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : 'demo-out');
mkdirSync(outDir, { recursive: true });

const cfg = { widerNews: true, regionalFeeds };
const score = (a: ArticleMeta) => scoreArticle(a, { now: Date.now() });
const hasFm = !!Bun.which('fm');
const macVersion = process.platform === 'darwin'
  ? Bun.spawnSync(['sw_vers', '-productVersion']).stdout.toString().trim() : '';
if (live && !hasFm) {
  if (process.platform !== 'darwin') throw new Error('--live needs a Mac with Apple Intelligence.');
  console.log(`No \`fm\` command (it ships with macOS 27; this Mac is on macOS ${macVersion}).`
    + ' Using the on-device model through a compiled Swift helper instead.');
}
const usePcc = live && hasFm && !onDevice;
const source = !live ? 'recorded sample'
  : hasFm ? `live fm (${usePcc ? 'PCC' : 'on-device'})` : `live, on-device via Swift helper (macOS ${macVersion})`;

// --- fm helpers (macOS 27) -------------------------------------------------

function run(cmd: string[], stdoutFile?: string): string {
  const p = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' });
  if (p.exitCode !== 0) {
    throw new Error(`${cmd.slice(0, 3).join(' ')} failed (${p.exitCode}): ${p.stderr.toString().trim()}\n`
      + (cmd[0] === 'swiftc' ? 'swiftc needs the Xcode command line tools: xcode-select --install'
        : cmd[0] === 'fm' ? 'Check `fm respond --help` and `fm schema object --help` for the flags on this macOS.'
        : 'Is Apple Intelligence turned on in System Settings?'));
  }
  const out = p.stdout.toString();
  if (stdoutFile) writeFileSync(stdoutFile, out);
  return out;
}

/** Build a flat schema of string arrays with `fm schema object` and return its path. */
function fmSchema(name: string, arrays: string[]): string {
  const path = join(tmpdir(), `pullread-${name}.json`);
  run(['fm', 'schema', 'object', '--name', name, ...arrays.flatMap(f => ['--string', f, '--array'])], path);
  return path;
}

function parseJson(out: string): any {
  return JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
}

/** Compile fm-structured.swift once (cached by source contents) and return the binary path. */
function swiftHelper(): string {
  const src = join(import.meta.dir, 'fm-structured.swift');
  const code = readFileSync(src, 'utf8');
  const bin = join(tmpdir(), `pullread-fm-structured-${Bun.hash(code).toString(16)}`);
  if (!existsSync(bin)) {
    console.log('Compiling the Swift helper (first run only)…');
    run(['swiftc', '-parse-as-library', '-O', src, '-o', bin]);
  }
  return bin;
}

/** Structured output from Apple's model: `fm` on macOS 27, the Swift helper on macOS 26. */
function structured(mode: 'intro' | 'groups', prompt: string, instructions: string, arrays: string[]): any {
  if (hasFm) {
    const schema = fmSchema(mode === 'intro' ? 'RundownIntro' : 'StoryGroups', arrays);
    return parseJson(run(['fm', 'respond', ...(usePcc ? ['--model', 'pcc'] : []), '--instructions', instructions, '--schema', schema, prompt]));
  }
  const instFile = join(tmpdir(), 'pullread-demo-instructions.txt');
  const promptFile = join(tmpdir(), 'pullread-demo-prompt.txt');
  writeFileSync(instFile, instructions);
  writeFileSync(promptFile, prompt);
  return parseJson(run([swiftHelper(), mode, instFile, promptFile]));
}

const storyList = (list: ArticleMeta[]) => list.map((a, i) => `${i + 1}. ${a.title} (${a.domain})${a.excerpt ? ` — ${a.excerpt}` : ''}`).join('\n');

const INTRO_INSTRUCTIONS = `You write the opening note for a daily reading rundown email: 2-3 SHORT paragraphs, plain and specific, opinions welcome, no clichés.
This note goes out on ${issueDateLine()}. Stories may mention other days; those are not today. Don't name today's weekday or date.
No greetings, no sign-offs, never "dive in", "buckle up", "welcome to", "in today's rundown".
Return "paragraphs" (one string per paragraph) and "links": for each story you mention, "paragraph|story|phrase" where paragraph is the 1-based paragraph, story is the story number from the list, and phrase is the exact words in that paragraph to link.`;

// --- Demo 1 ------------------------------------------------------------------

const curated = await curateWithStories(articles, cfg, score, undefined, undefined, { panelHeadlines, panel });
const introRaw = live
  ? structured('intro', `Stories:\n${storyList(curated)}`, INTRO_INSTRUCTIONS, ['paragraphs', 'links'])
  : sampleIntro;
const { text: introText, dropped } = structuredIntroToMarkers(parseFlatIntro(introRaw), curated.length);
writeFileSync(join(outDir, 'demo1-intro.html'), buildRoundupHtml(curated, 1, introText, live ? 'Apple Intelligence' : 'Sample', score));
if (live) writeFileSync(join(outDir, 'demo1-raw.json'), JSON.stringify(introRaw, null, 2));
console.log(`\n=== Demo 1: structured intro (${source}) ===`);
console.log(introText);
console.log(dropped.length ? `Dropped links: ${dropped.join('; ')}` : 'All links kept.');

// --- Demo 2 ------------------------------------------------------------------

const groups = groupStories(articles);
console.log(`\n=== Demo 2: model-assisted grouping (${source}) ===`);
let groupingRaw: string[];
if (usePcc) {
  // macOS 27 + PCC: the whole day fits in 32K, so send the full list once.
  console.log('Sent to the model (full list):\n' + groupingPrompt(groups));
  groupingRaw = structured('groups', groupingPrompt(groups), GROUPING_INSTRUCTIONS, ['stories']).stories;
} else {
  // macOS 26 / on-device: narrow questions in small batches.
  const pairs = candidatePairs(groups);
  const same: string[] = [];
  const pairBatches = batches(pairs, 12);
  pairBatches.forEach((b, bi) => {
    const prompt = pairsPrompt(groups, b, bi * 12);
    console.log(`Asked "same event?" (batch ${bi + 1}/${pairBatches.length}):\n${prompt}`);
    same.push(...(live ? structured('pairs', prompt, PAIR_INSTRUCTIONS, ['same']).same : sampleSamePairs));
  });
  console.log(`Model said same event: ${same.join(', ') || 'none'}`);
  const labelLines: string[] = [];
  for (const ids of batches(groups.map((_, i) => i), 20)) {
    labelLines.push(...(live ? structured('groups', labelPrompt(groups, ids), LABEL_INSTRUCTIONS, ['stories']).stories : sampleLabels));
  }
  console.log('Labels:\n' + labelLines.join('\n'));
  groupingRaw = groupingLinesFromPairs(groups.length, pairs, same, labelLines);
}
const before = await curateWithStories(articles, cfg, score, undefined, undefined, { panelHeadlines, panel });
const after = await curateWithStories(articles, cfg, score, undefined, undefined, { panelHeadlines, panel, modelGroups: groupingRaw });
writeFileSync(join(outDir, 'demo2-before.html'), buildRoundupHtml(before, 1, null, null, score));
writeFileSync(join(outDir, 'demo2-after.html'), buildRoundupHtml(after, 1, null, null, score));
console.log('\nCombined:\n' + groupingRaw.join('\n'));
const check = applyModelGroups(groups, groupingRaw);
console.log('\nMerged: ' + (check.merges.join('; ') || 'none'));
console.log('Refused (no shared words): ' + (check.rejected.join('; ') || 'none'));
const line = (a: ArticleMeta) => `${a.story?.top ? 'TOP ' : '    '}[${a.categories?.[0] || 'More'}] ${a.title.slice(0, 64)}${a.story?.alsoIn.length ? `  (+${a.story.alsoIn.map(x => x.source).join(', ')})` : ''}`;
console.log('\nBefore:\n' + before.map(line).join('\n'));
console.log('\nAfter:\n' + after.map(line).join('\n'));

// --- Demo 3 ------------------------------------------------------------------

const toCheck = [...sampleIntrosToCheck];
if (live) toCheck.unshift({ label: 'Live intro from demo 1', text: introText });
const now = new Date();
const results = toCheck.map(s => ({ ...s, checks: checkIntro(s.text, { now, storyCount: curated.length }) }));
console.log('\n=== Demo 3: intro checks ===');
for (const r of results) {
  const failed = r.checks.filter(c => !c.passed);
  console.log(`${failed.length ? 'FAIL' : 'PASS'}  ${r.label}${failed.map(f => `\n      ✗ ${f.rule}${f.detail ? ` — ${f.detail}` : ''}`).join('')}`);
}

const rows = results.map(r => `<section><h2>${escapeHtml(r.label)} <span class="${r.checks.every(c => c.passed) ? 'pass' : 'fail'}">${r.checks.every(c => c.passed) ? 'PASS' : 'FAIL'}</span></h2>
<blockquote>${escapeHtml(r.text).replace(/\n\n/g, '<br><br>')}</blockquote>
<ul>${r.checks.map(c => `<li class="${c.passed ? 'ok' : 'bad'}">${c.passed ? '✓' : '✗'} ${escapeHtml(c.rule)}${c.detail ? ` <em>${escapeHtml(c.detail)}</em>` : ''}</li>`).join('')}</ul></section>`).join('\n');
writeFileSync(join(outDir, 'demo3-checks.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Rundown intro checks</title>
<style>body{font:15px/1.5 -apple-system,system-ui,sans-serif;max-width:680px;margin:24px auto;padding:0 16px;color:#1a1a1a;background:#f7f5f3}
section{background:#fff;border:1px solid #ebe5df;border-radius:12px;padding:18px 20px;margin:14px 0}h1{font:600 24px Georgia,serif}h2{font-size:16px;margin:0 0 8px}
blockquote{margin:0 0 10px;padding:10px 14px;background:#faf8f6;border-left:3px solid #e2d9d0;color:#4a4540;font-size:14px}ul{list-style:none;padding:0;margin:0}li{font-size:13.5px;padding:2px 0}
.ok{color:#4f7a4a}.bad{color:#b4352e}em{color:#7d746b}.pass,.fail{font-size:11px;padding:2px 8px;border-radius:99px;margin-left:6px;vertical-align:2px}.pass{background:#e6f0e3;color:#3d6a37}.fail{background:#f6e2df;color:#a3322a}</style>
<h1>Rundown intro checks</h1><p style="color:#7d746b;font-size:13px">Rules from the intro prompt, checked on the raw model text. Issue date: ${escapeHtml(issueDateLine(now))}.</p>
${rows}`);

console.log(`\nWrote ${outDir}/demo1-intro.html, demo2-before.html, demo2-after.html, demo3-checks.html`);
