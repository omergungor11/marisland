/* eslint-disable no-console */
/**
 * Screenshot harness: `pnpm shots [ci|dev|wow|intro] [--assert] [--gpu] [--no-build] [--only=ID,ID] [--base=URL]
 *   [--tag=name] [--port=4173] [--no-selftest]` — `--tag` builds into dist-<tag>/ and writes shots/<set>-<tag>/
 *   so parallel agents don't collide; pair it with a distinct `--port`. The ci and dev sets also run the
 *   app self-tests (`selftest=regen` leak check, `selftest=ctxloss` context loss + restore,
 *   `selftest=edit` 50 brush edits + undo with a leak check) on the first shot.
 * Writes shots/<set>/{<id>.png, <id>+dt.png, <id>.mask.png, manifest.json, contact.jpg}.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { SET_DEFAULTS, shotsForSet, type ShotPreset, type ShotSet } from '../src/content/shots.ts';
import { BUDGETS, HEADLESS_TIME_FACTOR } from '../src/content/budgets.ts';
import { computeMetrics, isBlank, isMagenta, type ImageMetrics } from './shots-metrics.ts';

const args = process.argv.slice(2);
const flag = (n: string): boolean => args.includes(`--${n}`);
const opt = (n: string): string | undefined =>
  args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const set = (args.find((a) => !a.startsWith('--')) ?? 'ci') as ShotSet;
if (!(set in SET_DEFAULTS)) throw new Error(`unknown set "${set}" (ci|dev|wow|intro)`);
const ASSERT = flag('assert');
const GPU = flag('gpu');
const ROOT = resolve(import.meta.dirname, '..');
const TAG = opt('tag');
const OUT = resolve(ROOT, 'shots', TAG ? `${set}-${TAG}` : set);
const PORT = Number(opt('port') ?? 4173);
const DIST = TAG ? `dist-${TAG}` : 'dist';
const only = opt('only')?.split(',');

type Json = Record<string, number>;
interface ApiSnap {
  error: string | null;
  renderer: string;
  quality: 'low' | 'medium' | 'high';
  tier: number;
  worldHash: string;
  info: Json;
  counters: Json;
  timings: Json;
}
interface ShotResult {
  id: string;
  title: string;
  url: string;
  ok: boolean;
  failures: string[];
  metrics?: ImageMetrics;
  info?: Json;
  counters?: Json;
  timings?: Json;
  worldHash?: string;
  renderer?: string;
  readyMs: number;
  motion?: number;
  console: string[];
}

// ---------------------------------------------------------------- preview server
let server: ChildProcess | undefined;
function stopServer(): void {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
  server = undefined;
}
process.on('exit', stopServer);
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    stopServer();
    process.exit(130);
  });
process.on('uncaughtException', (e) => {
  console.error(e);
  stopServer();
  process.exit(1);
});

async function startServer(): Promise<string> {
  const base = `http://localhost:${PORT}/`;
  if (!flag('no-build')) {
    const r = spawnSync('pnpm', ['build', '--outDir', DIST], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) throw new Error('pnpm build failed');
  }
  const up = async (): Promise<boolean> => {
    try {
      return (await fetch(base)).ok;
    } catch {
      return false;
    }
  };
  if (await up()) {
    console.log(`port ${PORT} already served (not ours) - reusing it; dist/ was just rebuilt`);
    return base;
  }
  server = spawn(
    resolve(ROOT, 'node_modules/.bin/vite'),
    ['preview', '--port', String(PORT), '--strictPort', '--outDir', DIST],
    { cwd: ROOT, stdio: 'ignore', detached: true },
  );
  server.on('exit', (c) => server && c && console.error(`vite preview exited with ${c}`));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) return base;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('vite preview did not come up');
}

// ---------------------------------------------------------------- helpers
const readyExpr =
  '(() => { const m = window.__marisland; return !!(m && (m.ready || m.error)); })()';
const snapExpr = `(() => { const m = window.__marisland; return {
  error: m.error, renderer: m.renderer, quality: m.quality, tier: m.tier, worldHash: m.worldHash,
  info: { ...m.info }, counters: { ...m.counters }, timings: { ...m.timings } }; })()`;

function shotUrl(base: string, p: ShotPreset, extra = ''): string {
  const q = new URLSearchParams({
    shot: p.id,
    seed: String(p.seed),
    cam: p.cam,
    time: String(p.time),
    weather: p.weather ?? 'clear',
    simt: String(p.simt ?? 0),
    freeze: '1',
    hud: p.hud ? '1' : '0',
    dpr: '1',
    quality: p.quality ?? SET_DEFAULTS[set].quality,
  });
  if (p.panel) q.set('panel', p.panel);
  if (p.introt !== undefined) q.set('introt', String(p.introt));
  return `${base}?${q.toString()}${extra}`;
}

interface Opened {
  page: Page;
  snap: ApiSnap | null;
  readyMs: number;
  logs: string[];
  fatal: string[];
}

async function open(browser: Browser, url: string, p: ShotPreset): Promise<Opened> {
  const page = await browser.newPage({
    viewport: {
      width: p.width ?? SET_DEFAULTS[set].width,
      height: p.height ?? SET_DEFAULTS[set].height,
    },
    deviceScaleFactor: 1,
  });
  const logs: string[] = [];
  const fatal: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    logs.push(`${m.type()}: ${m.text()}`);
    if (m.type() === 'error' && /THREE\.WebGLProgram|WebGL/.test(m.text()))
      fatal.push(`console: ${m.text().slice(0, 120)}`);
  });
  page.on('pageerror', (e) => {
    logs.push(`pageerror: ${e.message}`);
    fatal.push(`pageerror: ${e.message.slice(0, 120)}`);
  });
  const t0 = performance.now();
  await page.goto(url, { waitUntil: 'load' });
  let snap: ApiSnap | null = null;
  try {
    await page.waitForFunction(readyExpr, null, { timeout: 180_000 });
    if (p.dollyFrom && p.dollySeconds) {
      // W8: dolly in from far; hardPops must stay 0 (checked from the snapshot below).
      await page.evaluate(`window.__marisland.dolly(${p.dollyFrom}, ${p.dollySeconds})`);
    }
    snap = (await page.evaluate(snapExpr)) as ApiSnap;
  } catch (e) {
    fatal.push(`not ready: ${(e as Error).message.split('\n')[0]}`);
  }
  return { page, snap, readyMs: Math.round(performance.now() - t0), logs, fatal };
}

async function metricsOf(png: Buffer): Promise<ImageMetrics> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return computeMetrics(data, info.channels);
}

function changedFraction(a: Buffer, b: Buffer): number {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  const n = pixelmatch(pa.data, pb.data, undefined, pa.width, pa.height, { threshold: 0.1 });
  return n / (pa.width * pa.height);
}

function assertBudgets(r: ShotResult, snap: ApiSnap, headless: boolean): void {
  const b = BUDGETS[snap.quality];
  const checks: [string, number | undefined, number][] = [
    ['calls', snap.info.calls, b.drawCalls],
    ['triangles', snap.info.triangles, b.triangles],
    ['programs', snap.info.programs, b.programs],
    ['instances', snap.counters.instances, b.instances],
    ['groundCover', snap.counters.groundCover, b.groundCover],
    ['agents', snap.counters.agents, b.agents],
    ['particles', snap.counters.particles, b.particles],
  ];
  for (const [name, v, max] of checks)
    if (v !== undefined && v > max) r.failures.push(`budget ${name} ${v} > ${max}`);
  const gen = (snap.timings.gen ?? 0) + (snap.timings.build ?? 0);
  const maxMs = b.newSeedMs * (headless ? HEADLESS_TIME_FACTOR : 1);
  if (gen > maxMs) r.failures.push(`budget gen+build ${Math.round(gen)}ms > ${maxMs}ms`);
}

// ---------------------------------------------------------------- one shot
async function runShot(
  browser: Browser,
  base: string,
  p: ShotPreset,
  isFirst: boolean,
): Promise<{ r: ShotResult; png?: Buffer; deterministic?: boolean }> {
  const url = shotUrl(base, p);
  const r: ShotResult = {
    id: p.id,
    title: p.title,
    url,
    ok: true,
    failures: [],
    readyMs: 0,
    console: [],
  };
  const o = await open(browser, url, p);
  r.readyMs = o.readyMs;
  r.console = o.logs.slice(0, 20);
  r.failures.push(...o.fatal);
  let png: Buffer | undefined;
  try {
    const snap = o.snap;
    if (snap) {
      r.info = snap.info;
      r.counters = snap.counters;
      r.timings = snap.timings;
      r.worldHash = snap.worldHash;
      r.renderer = snap.renderer;
      if (snap.error) r.failures.push(`app error: ${snap.error}`);
      if (snap.counters.hardPops > 0) r.failures.push(`hardPops ${snap.counters.hardPops}`);
      if (ASSERT) assertBudgets(r, snap, /swiftshader/i.test(snap.renderer));
    }
    mkdirSync(OUT, { recursive: true });
    png = await o.page.screenshot({ type: 'png', timeout: 240_000 });
    writeFileSync(resolve(OUT, `${p.id}.png`), png);
    const m = await metricsOf(png);
    r.metrics = m;
    if (isBlank(m)) r.failures.push(`blank frame (sigma ${m.lumSigma.toFixed(4)})`);
    if (isMagenta(m)) r.failures.push(`magenta ${(m.magentaFrac * 100).toFixed(1)}%`);
    if (p.deltaT && snap && !snap.error) {
      await o.page.evaluate(`window.__marisland.step(1/30, ${Math.round(p.deltaT * 30)})`);
      const png2 = await o.page.screenshot({ type: 'png', timeout: 240_000 });
      writeFileSync(resolve(OUT, `${p.id}+dt.png`), png2);
      r.motion = changedFraction(png, png2);
    }
  } finally {
    await o.page.close();
  }
  if (p.mask) {
    const mo = await open(browser, shotUrl(base, p, '&debug=mask'), p);
    try {
      writeFileSync(
        resolve(OUT, `${p.id}.mask.png`),
        await mo.page.screenshot({ type: 'png', timeout: 240_000 }),
      );
    } finally {
      await mo.page.close();
    }
  }
  let deterministic: boolean | undefined;
  if (isFirst && png) {
    const again = await open(browser, url, p);
    try {
      deterministic = png.equals(await again.page.screenshot({ type: 'png', timeout: 240_000 }));
    } finally {
      await again.page.close();
    }
    if (!deterministic && ASSERT) r.failures.push('non-deterministic: two captures differ');
  }
  r.ok = r.failures.length === 0;
  return { r, png, deterministic };
}

// ---------------------------------------------------------------- self-tests
interface SelftestResult {
  name: string;
  ok: boolean;
  failures: string[];
  readyMs: number;
  timings?: Json;
}
const SELFTESTS = ['regen', 'ctxloss', 'edit'] as const;

/** `selftest=regen|ctxloss|edit` on preset `p`: the app throws (api.error) when a check fails. */
async function runSelftest(
  browser: Browser,
  base: string,
  p: ShotPreset,
  name: (typeof SELFTESTS)[number],
): Promise<SelftestResult> {
  const o = await open(browser, shotUrl(base, p, `&selftest=${name}`), p);
  const r: SelftestResult = { name, ok: true, failures: [...o.fatal], readyMs: o.readyMs };
  try {
    const snap = o.snap;
    if (snap) {
      r.timings = snap.timings;
      if (snap.error) r.failures.push(`app error: ${snap.error.split('\n')[0]}`);
      if (!(snap.info.calls > 0)) r.failures.push(`no draw calls (${snap.info.calls})`);
      // the restored context must draw the world, not a cleared canvas
      const m = await metricsOf(await o.page.screenshot({ type: 'png', timeout: 240_000 }));
      if (isBlank(m))
        r.failures.push(`blank frame after selftest (sigma ${m.lumSigma.toFixed(4)})`);
    }
  } finally {
    await o.page.close();
  }
  r.ok = r.failures.length === 0;
  return r;
}

// ---------------------------------------------------------------- contact sheet
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function contactSheet(results: ShotResult[]): Promise<void> {
  const cols = set === 'ci' ? 2 : 3;
  const tiles: { input: Buffer; w: number; h: number }[] = [];
  for (const r of results) {
    const raw = sharp(resolve(OUT, `${r.id}.png`));
    const meta = await raw.metadata();
    const w = Math.min(480, meta.width ?? 480);
    const buf = await raw.resize({ width: w }).png().toBuffer();
    const h = (await sharp(buf).metadata()).height ?? 270;
    const label = `${r.id} · ${r.title} · ${r.info?.calls ?? '?'}c/${r.info?.triangles ?? '?'}t${r.ok ? '' : ' · FAIL ' + r.failures[0]}`;
    const svg = `<svg width="${w}" height="22" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="22" fill="${r.ok ? '#000' : '#a00'}" fill-opacity="0.7"/><text x="6" y="15" font-family="sans-serif" font-size="12" fill="#fff">${esc(label.slice(0, Math.floor(w / 6.5)))}</text></svg>`;
    const input = await sharp(buf)
      .composite([{ input: Buffer.from(svg), top: h - 22, left: 0 }])
      .png()
      .toBuffer();
    tiles.push({ input, w, h });
  }
  const colW = Math.max(...tiles.map((t) => t.w));
  const pad = 4;
  const rows = Math.ceil(tiles.length / cols);
  const rowH = Array.from({ length: rows }, (_, i) =>
    Math.max(...tiles.slice(i * cols, i * cols + cols).map((t) => t.h)),
  );
  const comps = tiles.map((t, i) => ({
    input: t.input,
    left: pad + (i % cols) * (colW + pad),
    top: pad + rowH.slice(0, Math.floor(i / cols)).reduce((a, h) => a + h + pad, 0),
  }));
  await sharp({
    create: {
      width: cols * (colW + pad) + pad,
      height: rowH.reduce((a, h) => a + h + pad, pad),
      channels: 3,
      background: '#202020',
    },
  })
    .composite(comps)
    .jpeg({ quality: 85 })
    .toFile(resolve(OUT, 'contact.jpg'));
}

// ---------------------------------------------------------------- main
async function main(): Promise<void> {
  const t0 = Date.now();
  const base = opt('base') ?? (await startServer());
  let list = shotsForSet(set);
  if (only) list = list.filter((s) => only.includes(s.id));
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: GPU
      ? []
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const results: ShotResult[] = [];
  const selftests: SelftestResult[] = [];
  let deterministic: boolean | null = null;
  let renderer = 'unknown';
  try {
    for (const [i, p] of list.entries()) {
      console.log(`[${i + 1}/${list.length}] ${p.id} ${p.title}`);
      const out = await runShot(browser, base, p, i === 0);
      results.push(out.r);
      if (out.deterministic !== undefined) deterministic = out.deterministic;
      renderer = out.r.renderer ?? renderer;
    }
    if ((set === 'ci' || set === 'dev') && list.length > 0 && !flag('no-selftest')) {
      for (const name of SELFTESTS) {
        console.log(`[selftest] ${name} on ${list[0].id}`);
        selftests.push(await runSelftest(browser, base, list[0], name));
      }
    }
  } finally {
    await browser.close();
    stopServer();
  }
  const failed = results.filter((r) => !r.ok).length;
  const selftestsFailed = selftests.filter((r) => !r.ok).length;
  const manifest = {
    set,
    date: new Date().toISOString(),
    base,
    renderer,
    shots: results,
    selftests,
    summary: { total: results.length, failed, deterministic, selftestsFailed },
  };
  writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await contactSheet(results);
  console.table(
    results.map((r) => ({
      id: r.id,
      ok: r.ok,
      calls: r.info?.calls,
      tris: r.info?.triangles,
      programs: r.info?.programs,
      readyMs: r.readyMs,
      failures: r.failures.join('; '),
    })),
  );
  for (const t of selftests)
    console.log(
      `selftest ${t.name}: ${t.ok ? 'ok' : 'FAIL ' + t.failures.join('; ')} (${t.readyMs} ms)`,
    );
  console.log(`deterministic: ${String(deterministic)}  renderer: ${renderer}`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  for (const f of ['manifest.json', 'contact.jpg']) console.log(resolve(OUT, f));
  console.log(OUT);
  process.exitCode = failed > 0 || selftestsFailed > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  stopServer();
  process.exit(1);
});
