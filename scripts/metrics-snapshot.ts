// ABOUTME: Appends a dated snapshot of download/usage metrics to data/metrics.csv.
// ABOUTME: Run weekly by .github/workflows/metrics-snapshot.yml; see issue #111.
//
// GitHub's counters are ephemeral (traffic stats cover a rolling 14 days; the
// rolling `latest` prerelease DMG counter resets every time CI clobbers the
// asset), so this snapshot is what turns them into trend lines.
//
// Env:
//   GITHUB_TOKEN  - token with repo read (traffic API needs push access)
//   REPO          - owner/name, default shellen/pullread
//   STATS_URL     - optional, worker stats endpoint (e.g. https://pullread.com/api/stats)
//   STATS_KEY     - optional, ADMIN_KEY for the stats endpoint

import { existsSync, mkdirSync, appendFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const REPO = process.env.REPO || 'shellen/pullread';
const TOKEN = process.env.GITHUB_TOKEN || '';
const CSV_PATH = join(import.meta.dir, '..', 'data', 'metrics.csv');
const HEADER = 'date,metric,label,value\n';

const today = new Date().toISOString().slice(0, 10);
const rows: string[] = [];

function addRow(metric: string, label: string, value: number | null | undefined) {
  if (value === null || value === undefined) return;
  // Labels are constrained (tags, asset names, source/platform enums) but
  // quote anything with a comma just in case.
  const safeLabel = label.includes(',') ? `"${label.replace(/"/g, '""')}"` : label;
  rows.push(`${today},${metric},${safeLabel},${value}`);
}

async function gh(path: string): Promise<any | null> {
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
    });
    if (!res.ok) {
      console.warn(`[metrics] GET ${path} -> ${res.status} (skipping)`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[metrics] GET ${path} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// 1. Release asset download counts (tagged releases + the rolling `latest`)
const releases = await gh(`/repos/${REPO}/releases?per_page=100`);
if (Array.isArray(releases)) {
  for (const rel of releases) {
    for (const asset of rel.assets || []) {
      if (!/\.dmg$|\.tar\.gz$|^latest\.json$/.test(asset.name)) continue;
      if (rel.tag_name === 'latest') {
        addRow('rolling_asset_downloads', asset.name, asset.download_count);
      } else {
        addRow('release_asset_downloads', `${rel.tag_name}/${asset.name}`, asset.download_count);
      }
    }
  }
}

// 2. Repo traffic (rolling 14-day window — snapshotting is the only way to keep it)
const views = await gh(`/repos/${REPO}/traffic/views`);
addRow('traffic_views_14d', 'total', views?.count);
addRow('traffic_views_14d', 'unique', views?.uniques);
const clones = await gh(`/repos/${REPO}/traffic/clones`);
addRow('traffic_clones_14d', 'total', clones?.count);
addRow('traffic_clones_14d', 'unique', clones?.uniques);

// 3. Download-gate subscriber counts from the worker (optional — needs STATS_KEY)
if (process.env.STATS_KEY) {
  const statsUrl = process.env.STATS_URL || 'https://pullread.com/api/stats';
  try {
    const res = await fetch(`${statsUrl}?key=${encodeURIComponent(process.env.STATS_KEY)}`);
    if (res.ok) {
      const stats: any = await res.json();
      addRow('subscribers', 'total', stats.totals?.total);
      addRow('subscribers', 'active', stats.totals?.active);
      for (const g of stats.active_by_source_platform || []) {
        addRow('subscribers_active', `${g.source}/${g.platform || 'none'}`, g.count);
      }
    } else {
      console.warn(`[metrics] stats endpoint -> ${res.status} (skipping subscriber counts)`);
    }
  } catch (err) {
    console.warn('[metrics] stats endpoint failed:', err instanceof Error ? err.message : err);
  }
} else {
  console.warn('[metrics] STATS_KEY not set — skipping subscriber counts');
}

if (rows.length === 0) {
  console.error('[metrics] No metrics collected — refusing to write an empty snapshot');
  process.exit(1);
}

mkdirSync(dirname(CSV_PATH), { recursive: true });
if (!existsSync(CSV_PATH)) writeFileSync(CSV_PATH, HEADER);
appendFileSync(CSV_PATH, rows.join('\n') + '\n');
console.log(`[metrics] Appended ${rows.length} rows to data/metrics.csv for ${today}`);
