import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildActivity } from './aggregate/activity';
import { collectionYear, type CollectionOut } from './aggregate/collections';
import { buildKeepers } from './aggregate/keepers';
import { buildTimeline } from './aggregate/timeline';
import { buildCollectionOutputs } from './aggregate/outputs';
import type { TokenOut } from './aggregate/tokens';
import { loadConfig } from './config';
import { createFetchJson } from './http';
import { createDownloader, gcMedia, type ManifestEntry } from './media';
import { createOpenSea } from './opensea';
import { processCollection, type CollectionState } from './pipeline/collection';
import { nextStaleSince } from './pipeline/status';
import { ethUsd } from './prices';
import { readJson, recoverDir, swapDir, writeJsonAtomic } from './store';
import { createRpc } from './tokenuri';
import { parseAcceptDrop, validateSnapshot } from './validate';

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};

const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);

async function main() {
  const config = loadConfig();
  const only = arg('only')?.split(',').map((s) => s.trim().toUpperCase()) ?? null;
  if (only && !arg('out')) {
    console.error('[inventory] --only requires an explicit --out <dir> so a partial run can never overwrite data/catalog');
    process.exit(1);
  }
  const outDir = arg('out') ?? 'data/catalog';
  const acceptDrop = new Set([...parseAcceptDrop(arg('accept-drop')), ...parseAcceptDrop(process.env.ACCEPT_DROP)]);
  const excludeHolders = new Set(config.excludeHolders);
  const stageDir = `${outDir}.tmp`;
  recoverDir(outDir);
  const rawDir = 'data/raw';
  const mediaDir = 'public/media';
  const log = (m: string) => console.log(`[inventory] ${m}`);

  const fetchJson = createFetchJson();
  const apiKey = process.env.OPENSEA_API_KEY;
  const os = apiKey ? createOpenSea(createFetchJson({ minIntervalMs: 500 }), apiKey) : null;
  const rpc = createRpc();
  const download = createDownloader();
  const manifestPath = join(rawDir, 'media-manifest.json');
  const txValuesPath = join(rawDir, 'tx-values.json');
  const manifest = readJson<Record<string, ManifestEntry>>(manifestPath, {});
  const txValues = readJson<Record<string, string>>(txValuesPath, {});

  const selected = config.collections.filter((c) => !only || only.includes(c.code));
  const prevCollectionsAll = readJson<CollectionOut[] | null>(join(outDir, 'collections.json'), null);
  const prevCollections = prevCollectionsAll?.filter((p) => selected.some((c) => c.slug === p.slug)) ?? null;
  const prevTokens: Record<string, TokenOut[]> = {};
  for (const c of selected) prevTokens[c.slug] = readJson<TokenOut[]>(join(outDir, 'tokens', `${c.slug}.json`), []);

  const states: CollectionState[] = [];
  const skipIds: Record<string, Set<string>> = {};
  const placeholderFiles: Record<string, Set<string>> = {};
  const collections: CollectionOut[] = [];
  const tokensBySlug: Record<string, TokenOut[]> = {};
  const ens = new Map<string, string>();

  for (const cfg of selected) {
    log(`${cfg.code} ${cfg.title}`);
    const st = await processCollection(cfg, {
      fetchJson,
      os,
      rpc,
      mediaDeps: { download, outDir: mediaDir, publicPrefix: '/media' },
      manifest,
      txValues,
      rawDir,
      log,
    });
    writeJsonAtomic(manifestPath, manifest);
    writeJsonAtomic(txValuesPath, txValues);
    for (const [a, n] of st.ens) ens.set(a, n);

    const year = collectionYear(st.mints);
    const prev = prevCollectionsAll?.find((p) => p.slug === cfg.slug);
    const staleSince = nextStaleSince(st.bsStatus, st.osStatus, prev?.staleSince, new Date());
    const { tokens, collection } = buildCollectionOutputs({ cfg, artist: config.artist, year, st, prevTokens: prevTokens[cfg.slug], staleSince, excludeHolders });
    collections.push(collection);
    tokensBySlug[cfg.slug] = tokens;
    skipIds[cfg.slug] = st.placeholderIds;
    placeholderFiles[cfg.slug] = st.placeholderFiles;
    states.push(st);
  }

  const { errors, warnings, accepted, missingMedia } = validateSnapshot(prevCollections, collections, prevTokens, tokensBySlug, skipIds, placeholderFiles, acceptDrop);
  for (const w of warnings) console.warn(`[inventory] ! accepted drop: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`[inventory] ✗ ${e}`);
    process.exitCode = 1;
    return;
  }

  const indexOrder = collections
    .filter((c) => c.section === 'index')
    .sort((a, b) => (a.firstMint ?? '9999').localeCompare(b.firstMint ?? '9999'))
    .map((c) => c.code);
  const keepers = buildKeepers({
    artist: config.artist,
    ens,
    indexOrder,
    excludeHolders,
    collections: states.map((s) => ({ cfg: s.cfg, transfers: s.transfers, balances: s.balances, events: s.events, tokens: tokensBySlug[s.cfg.slug] })),
  });
  const now = new Date();
  const timeline = buildTimeline({
    artist: config.artist,
    from: '2023-01',
    to: now.toISOString().slice(0, 7),
    collections: states.map((s) => ({ code: s.cfg.code, transfers: s.transfers })),
    excludeHolders,
  });
  const activity = buildActivity(states.map((s) => ({ slug: s.cfg.slug, code: s.cfg.code, events: s.events, tokens: tokensBySlug[s.cfg.slug], ens })));

  rmSync(stageDir, { recursive: true, force: true });
  writeJsonAtomic(join(stageDir, 'collections.json'), collections);
  for (const [slug, tokens] of Object.entries(tokensBySlug)) writeJsonAtomic(join(stageDir, 'tokens', `${slug}.json`), tokens);
  writeJsonAtomic(join(stageDir, 'keepers.json'), keepers);
  writeJsonAtomic(join(stageDir, 'timeline.json'), timeline);
  writeJsonAtomic(join(stageDir, 'activity', 'latest.json'), activity.latest);
  for (const [month, rows] of Object.entries(activity.months)) writeJsonAtomic(join(stageDir, 'activity', `${month}.json`), rows);
  writeJsonAtomic(join(stageDir, 'meta.json'), {
    lastInventory: now.toISOString(),
    ethUsd: await ethUsd(fetchJson, readJson<{ ethUsd?: number | null } | null>(join(outDir, 'meta.json'), null)?.ethUsd ?? null),
    sources: { blockscout: states.some((s) => s.bsStatus === 'error') ? 'partial' : 'ok', opensea: !os ? 'skipped' : states.some((s) => s.osStatus === 'error') ? 'partial' : 'ok' },
    missingMedia,
    indexOrder,
    acceptedDrops: accepted,
    partial: Boolean(only),
  });
  swapDir(stageDir, outDir);

  if (!only) {
    const referenced = new Set<string>();
    for (const tokens of Object.values(tokensBySlug))
      for (const t of tokens) for (const p of [t.image?.thumb, t.image?.large, t.image?.file, t.animation?.file]) if (p) referenced.add(basename(p));
    const removed = gcMedia(mediaDir, referenced, manifest);
    writeJsonAtomic(manifestPath, manifest);
    log(`media gc removed ${removed} files`);
  }
  log(`done: ${collections.length} collections, ${keepers.length} keepers, ${missingMedia.length} tokens without media`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
