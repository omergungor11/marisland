/* eslint-disable no-console */
/**
 * Screenshot harness: `pnpm shots [ci|dev|wow|intro|edit|ladder|live] [--assert] [--gpu] [--no-build] [--only=ID,ID] [--base=URL]
 *   [--tag=name] [--port=4173] [--no-selftest] [--quality=low|medium|high]` — `--quality` overrides every
 *   preset's quality (budget sweeps per tier); `--tag` builds into dist-<tag>/ and writes shots/<set>-<tag>/
 *   so parallel agents don't collide; pair it with a distinct `--port`. The ci and dev sets also run the
 *   app self-tests (`selftest=regen` leak check, `selftest=ctxloss` context loss + restore,
 *   `selftest=edit` 50 brush edits + undo with a leak check) on the first shot (regen and edit again
 *   with `cam=village`), plus the harness-side
 *   `editpick` check (picking follows `api.edit` / `api.undo` / `propMove`, TASK-213).
 * Writes shots/<set>/{<id>.png, <id>+dt.png, <id>.mask.png, manifest.json, contact.jpg}.
 * `ladder` (D-031, TASK-374): per L-* preset every distance (+ its `debug=mask` frame) into
 *   <id>/<dist>.png, the consistency metrics into ladder-<id>.json and a strip ladder-<id>.jpg
 *   (frames / masks / ΔE heat); contact.jpg stacks the strips. Threshold misses are reported always
 *   and fail the run only with `--assert`. One island: `--only=L-coding,L-pairs-coding`.
 * `live` (M14c): L-live-<theme> 0.5 s pairs + mask frame; `motionMetric` over the preset's campus crop
 *   (solid pixels only: water / sky masked out) is written to the manifest (`live`) and checked against
 *   LIVE_THRESHOLDS (≥ 3 % changed, ≥ 5 clusters; `--assert`).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import sharp, { type OverlayOptions } from 'sharp';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { SET_DEFAULTS, shotsForSet, type ShotPreset, type ShotSet } from '../src/content/shots.ts';
import { BUDGETS, HEADLESS_TIME_FACTOR } from '../src/content/budgets.ts';
import { CAMERA } from '../src/content/tiers.ts';
import { FRAMING } from '../src/content/camera.ts';
import { computeMetrics, isBlank, isMagenta, type ImageMetrics } from './shots-metrics.ts';
import {
  GRID,
  compareFrames,
  regionDrift,
  planeMap,
  stepFailures,
  LADDER_THRESHOLDS,
  liveFailures,
  motionMetric,
  type Img,
  type MotionMetrics,
  type StepMetrics,
} from './ladder-metrics.ts';

const args = process.argv.slice(2);
const flag = (n: string): boolean => args.includes(`--${n}`);
const opt = (n: string): string | undefined =>
  args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const set = (args.find((a) => !a.startsWith('--')) ?? 'ci') as ShotSet;
if (!(set in SET_DEFAULTS))
  throw new Error(`unknown set "${set}" (ci|dev|wow|intro|edit|ladder|live)`);
const ASSERT = flag('assert');
const GPU = flag('gpu');
const ROOT = resolve(import.meta.dirname, '..');
const TAG = opt('tag');
const OUT = resolve(ROOT, 'shots', TAG ? `${set}-${TAG}` : set);
const PORT = Number(opt('port') ?? 4173);
const DIST = TAG ? `dist-${TAG}` : 'dist';
const only = opt('only')?.split(',');
const QUALITY = opt('quality') as 'low' | 'medium' | 'high' | undefined;
if (QUALITY && !['low', 'medium', 'high'].includes(QUALITY))
  throw new Error(`unknown quality "${QUALITY}" (low|medium|high)`);

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
  /** Live pair (M14c): motion inside the campus crop + threshold misses. */
  live?: MotionMetrics & { failures: string[] };
  console: string[];
  ladder?: LadderReport;
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
    quality: QUALITY ?? p.quality ?? SET_DEFAULTS[set].quality,
  });
  if (p.panel) q.set('panel', p.panel);
  if (p.edit) q.set('edit', p.edit);
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
    // summed from the allocations since D-022 (deterministic); budgets are at the reference sizes
    ['gpuMemoryMB', snap.counters.gpuMemoryMB, b.gpuMemoryMB],
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
  let pair: Buffer | undefined;
  let maskPng: Buffer | undefined;
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
      pair = png2;
    }
  } finally {
    await o.page.close();
  }
  if (p.mask) {
    // live pairs: the mask at low quality (medium's depth of field blurs the flat mask colours)
    const mp: ShotPreset = p.live ? { ...p, quality: 'low' } : p;
    const mo = await open(browser, shotUrl(base, mp, '&debug=mask'), mp);
    try {
      maskPng = await mo.page.screenshot({ type: 'png', timeout: 240_000 });
      writeFileSync(resolve(OUT, `${p.id}.mask.png`), maskPng);
    } finally {
      await mo.page.close();
    }
  }
  if (p.live && png && pair) {
    // M14c: motion over the campus crop, water / sky masked out when the mask frame exists
    const m = motionMetric(
      await decode(png),
      await decode(pair),
      p.live.crop,
      undefined,
      undefined,
      maskPng && (await decode(maskPng)),
    );
    const failures = liveFailures(m);
    r.live = { ...m, failures };
    if (ASSERT) r.failures.push(...failures);
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
  const label = p.cam === 'overview' ? name : `${name}@${p.cam}`;
  const r: SelftestResult = { name: label, ok: true, failures: [...o.fatal], readyMs: o.readyMs };
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

/**
 * `editpick` (TASK-213, harness-side, capture mode): at the village preset, add a pine where a
 * screen ray meets dry land; `api.pick` there must return that pine with its edit id
 * (≥ EDIT_PROP_ID_BASE, the id `applyEdit` assigned); after `api.undo()` it must not; after
 * `api.redo()` + `propMove` the pick follows the pine to its new spot. Edits are undone after.
 */
const EDITPICK_EXPR = `(() => {
  const api = window.__marisland;
  const fail = [];
  const t0 = performance.now();
  api.setCamera('village');
  const c = document.querySelector('canvas');
  const W = c.clientWidth;
  const H = c.clientHeight;
  const spots = [];
  for (let j = 0; j < 5; j++)
    for (let i = 0; i < 7; i++) spots.push([W * (0.2 + i * 0.1), H * (0.35 + j * 0.1)]);
  const land = (x, y) => {
    const h = api.pick(x, y);
    return h && h.kind === 'terrain' && h.name === 'terrain' ? h : null;
  };
  let at = null;
  let id = -1;
  for (const [x, y] of spots) {
    const h = land(x, y);
    if (!h) continue;
    const r = api.edit({ k: 'propAdd', def: 'pine', x: h.x, z: h.z, rotY: 0.5, scale: 1 });
    if (!r.ok) continue;
    const cmds = api.editLog().cmds;
    id = cmds[cmds.length - 1].id;
    at = [x, y];
    break;
  }
  if (!at) return { fail: ['no spot accepted a pine'], ms: performance.now() - t0 };
  const isPine = (h) => !!h && h.kind === 'prop' && h.name === 'pine' && h.id === id;
  const p1 = api.pick(at[0], at[1]);
  if (!(id >= ${1 << 20})) fail.push('assigned id ' + id + ' is not an edit id');
  if (!isPine(p1)) fail.push('after propAdd: pick ' + JSON.stringify(p1) + ' is not pine ' + id);
  if (!api.undo()) fail.push('undo failed');
  const p2 = api.pick(at[0], at[1]);
  if (isPine(p2)) fail.push('after undo: still picks the pine');
  if (!api.redo()) fail.push('redo failed');
  if (!isPine(api.pick(at[0], at[1]))) fail.push('after redo: pine not picked');
  let moved = null;
  for (const [x, y] of spots) {
    if (Math.hypot(x - at[0], y - at[1]) < W * 0.15) continue;
    const h = land(x, y);
    if (!h) continue;
    const r = api.edit({ k: 'propMove', id, x: h.x, z: h.z, rotY: 0.5 });
    if (r.ok) {
      moved = [x, y];
      break;
    }
  }
  if (!moved) fail.push('no spot accepted the move');
  else {
    if (!isPine(api.pick(moved[0], moved[1]))) fail.push('after propMove: pick does not follow');
    if (isPine(api.pick(at[0], at[1]))) fail.push('after propMove: old spot still picks the pine');
    api.undo();
  }
  api.undo();
  return { fail, ms: performance.now() - t0, id, at, moved };
})()`;

async function runEditPickSelftest(
  browser: Browser,
  base: string,
  p: ShotPreset,
): Promise<SelftestResult> {
  const o = await open(browser, shotUrl(base, p), p);
  const r: SelftestResult = {
    name: 'editpick',
    ok: true,
    failures: [...o.fatal],
    readyMs: o.readyMs,
  };
  try {
    if (o.snap && !o.snap.error) {
      const res = (await o.page.evaluate(EDITPICK_EXPR)) as { fail: string[]; ms: number };
      r.failures.push(...res.fail);
      r.timings = { editPickMs: Math.round(res.ms) };
      const err = (await o.page.evaluate('window.__marisland.error')) as string | null;
      if (err) r.failures.push(`app error: ${err.split('\n')[0]}`);
    } else if (o.snap?.error) r.failures.push(`app error: ${o.snap.error.split('\n')[0]}`);
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
    const live = r.live ? ` · ${(r.live.changedFrac * 100).toFixed(1)}%/${r.live.clusters}cl` : '';
    const label = `${r.id} · ${r.title} · ${r.info?.calls ?? '?'}c/${r.info?.triangles ?? '?'}t${live}${r.ok ? '' : ' · FAIL ' + r.failures[0]}`;
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

// ---------------------------------------------------------------- zoom ladder (TASK-374)
interface LadderFrame {
  dist: number;
  tier?: number;
  calls?: number;
  triangles?: number;
  /** ΔE2000 of the frame's land mean vs the ladder median (ladder presets only). */
  drift?: number | null;
}
type StepReport = Omit<StepMetrics, 'heat'> & { far: number; near: number; failures: string[] };
interface LadderReport {
  island: string;
  kind: 'ladder' | 'pairs';
  frames: LadderFrame[];
  /** Ladder steps far → near, or boundary pairs 1.06 b → 0.94 b. */
  steps: (StepReport & { boundary?: number })[];
  failures: string[];
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

async function decode(png: Buffer): Promise<Img> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: info.channels, data };
}

/** ΔE per cell → 48 × 27 heat map (black 0 → yellow 10 → red ≥ 20; grey = not compared). */
function heatPng(heat: Float64Array): Promise<Buffer> {
  const px = Buffer.alloc(heat.length * 3);
  heat.forEach((d, k) => {
    const c = Number.isNaN(d)
      ? [48, 48, 48]
      : d <= 10
        ? [255 * (d / 10), 230 * (d / 10), 0]
        : [255, 230 * Math.max(0, 1 - (d - 10) / 10), 0];
    px.set(c.map(Math.round), k * 3);
  });
  return sharp(px, { raw: { width: GRID.w, height: GRID.h, channels: 3 } })
    .png()
    .toBuffer();
}

/** Every ladder distance (or both sides of every boundary) captured with its mask frame. */
async function runLadder(
  browser: Browser,
  base: string,
  p: ShotPreset,
  isFirst: boolean,
): Promise<{ r: ShotResult; deterministic?: boolean }> {
  const L = p.ladder as NonNullable<ShotPreset['ladder']>;
  const [hi, lo] = FRAMING.ladder.pairSpread;
  const dists = L.pairs.length ? L.pairs.flatMap((b) => [round1(b * hi), round1(b * lo)]) : L.dists;
  const dir = resolve(OUT, p.id);
  mkdirSync(dir, { recursive: true });
  const r: ShotResult = {
    id: p.id,
    title: p.title,
    url: shotUrl(base, { ...p, cam: `ladder:${L.island}:${dists[0]}` }),
    ok: true,
    failures: [],
    readyMs: 0,
    console: [],
  };
  const frames: LadderFrame[] = [];
  const imgs: { frame: Img; mask: Img; png: Buffer; maskPng: Buffer }[] = [];
  let deterministic: boolean | undefined;
  for (const d of dists) {
    const fp: ShotPreset = { ...p, cam: `ladder:${L.island}:${d}` };
    // ~50 page loads per island: one retry when a screenshot times out on a loaded machine
    const shoot = async (
      extra: string,
      retry = true,
    ): Promise<{ png: Buffer; snap: ApiSnap | null }> => {
      const o = await open(browser, shotUrl(base, fp, extra), fp);
      try {
        const png = await o.page.screenshot({ type: 'png', timeout: 240_000 });
        r.readyMs = Math.max(r.readyMs, o.readyMs);
        r.failures.push(...o.fatal.map((f) => `${d}: ${f}`));
        if (r.console.length < 20) r.console.push(...o.logs.slice(0, 20 - r.console.length));
        return { png, snap: o.snap };
      } catch (e) {
        if (!retry) throw e;
        console.log(`  ${d}${extra}: ${(e as Error).message.split('\n')[0]} - retrying`);
      } finally {
        await o.page.close();
      }
      return shoot(extra, false);
    };
    const { png, snap } = await shoot('');
    const { png: maskPng } = await shoot('&debug=mask');
    writeFileSync(resolve(dir, `${d}.png`), png);
    writeFileSync(resolve(dir, `${d}.mask.png`), maskPng);
    if (isFirst && deterministic === undefined) {
      deterministic = png.equals((await shoot('')).png);
      if (!deterministic && ASSERT) r.failures.push('non-deterministic: two captures differ');
    }
    if (snap) {
      r.info ??= snap.info;
      r.counters ??= snap.counters;
      r.timings ??= snap.timings;
      r.worldHash ??= snap.worldHash;
      r.renderer ??= snap.renderer;
      if (snap.error) r.failures.push(`${d}: app error: ${snap.error}`);
      if (snap.counters.hardPops > 0) r.failures.push(`${d}: hardPops ${snap.counters.hardPops}`);
      if (ASSERT) {
        const br: ShotResult = { ...r, failures: [] };
        assertBudgets(br, snap, /swiftshader/i.test(snap.renderer));
        r.failures.push(...br.failures.map((f) => `${d}: ${f}`));
      }
    }
    const m = await metricsOf(png);
    if (isBlank(m)) r.failures.push(`${d}: blank frame`);
    if (isMagenta(m)) r.failures.push(`${d}: magenta`);
    frames.push({
      dist: d,
      tier: snap?.tier,
      calls: snap?.info.calls,
      triangles: snap?.info.triangles,
    });
    imgs.push({ frame: await decode(png), mask: await decode(maskPng), png, maskPng });
  }

  // ---- metrics
  const W = imgs[0].frame.width;
  const H = imgs[0].frame.height;
  const view = (
    dist: number,
  ): { fovDeg: number; aspect: number; pitchDeg: number; dist: number } => ({
    fovDeg: CAMERA.fov,
    aspect: W / H,
    pitchDeg: L.pitch,
    dist,
  });
  const report: LadderReport = {
    island: L.island,
    kind: L.pairs.length ? 'pairs' : 'ladder',
    frames,
    steps: [],
    failures: [],
  };
  const heats: (Float64Array | undefined)[] = dists.map(() => undefined);
  const pairs = report.kind === 'pairs';
  for (let k = 0; k + 1 < dists.length; k += pairs ? 2 : 1) {
    const far = imgs[k];
    const near = imgs[k + 1];
    const m = compareFrames(
      near.frame,
      near.mask,
      far.frame,
      far.mask,
      planeMap(view(dists[k + 1]), view(dists[k])),
    );
    heats[k + 1] = m.heat;
    const { heat: _heat, ...rest } = m;
    const failures = stepFailures(m, pairs);
    const label = pairs ? `pair ${L.pairs[k / 2]}` : `step ${dists[k]}→${dists[k + 1]}`;
    report.failures.push(...failures.map((f) => `${label}: ${f}`));
    report.steps.push({
      ...rest,
      far: dists[k],
      near: dists[k + 1],
      ...(pairs ? { boundary: L.pairs[k / 2] } : {}),
      failures,
    });
  }
  if (!pairs) {
    // the ladder frame nearest the drift reference distance
    const ri = dists.reduce(
      (b, d, i) =>
        Math.abs(d - FRAMING.ladder.driftRef) < Math.abs(dists[b] - FRAMING.ladder.driftRef)
          ? i
          : b,
      0,
    );
    const R = imgs[ri];
    const drift = imgs.map((im, k) =>
      k === ri
        ? 0
        : dists[k] < dists[ri]
          ? regionDrift(
              im.frame,
              im.mask,
              R.frame,
              R.mask,
              planeMap(view(dists[k]), view(dists[ri])),
            )
          : regionDrift(
              R.frame,
              R.mask,
              im.frame,
              im.mask,
              planeMap(view(dists[ri]), view(dists[k])),
            ),
    );
    drift.forEach((v, k) => {
      frames[k].drift = v;
      if (v !== null && v > LADDER_THRESHOLDS.drift)
        report.failures.push(`drift ${dists[k]}: ΔE ${v.toFixed(2)} > ${LADDER_THRESHOLDS.drift}`);
    });
  }
  r.ladder = report;
  if (ASSERT) r.failures.push(...report.failures);
  writeFileSync(resolve(OUT, `ladder-${p.id}.json`), JSON.stringify(report, null, 2));
  await ladderStrip(p, report, imgs, heats);
  r.ok = r.failures.length === 0;
  return { r, deterministic };
}

const TW = 240;
const TH = 135;

function labelSvg(text: string, w: number, bad = false): Buffer {
  return Buffer.from(
    `<svg width="${w}" height="18" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="18" fill="${bad ? '#a00' : '#000'}" fill-opacity="0.7"/><text x="4" y="13" font-family="sans-serif" font-size="11" fill="#fff">${esc(text.slice(0, Math.floor(w / 6)))}</text></svg>`,
  );
}

/** ladder-<id>.jpg: one column per distance — frame, mask, ΔE heat of the step ending there. */
async function ladderStrip(
  p: ShotPreset,
  rep: LadderReport,
  imgs: { png: Buffer; maskPng: Buffer }[],
  heats: (Float64Array | undefined)[],
): Promise<void> {
  const pad = 4;
  const comps: OverlayOptions[] = [];
  const thumb = (b: Buffer, kernel: 'lanczos3' | 'nearest' = 'lanczos3'): Promise<Buffer> =>
    sharp(b).resize(TW, TH, { kernel }).png().toBuffer();
  const top = 22;
  comps.push({
    input: labelSvg(
      `${p.id} · ${p.title} · ${rep.failures.length ? `${rep.failures.length} misses` : 'pass'}`,
      600,
      rep.failures.length > 0,
    ),
    left: pad,
    top: 2,
  });
  for (const [k, im] of imgs.entries()) {
    const f = rep.frames[k];
    const left = pad + k * (TW + pad);
    const step = rep.steps.find((s) => s.near === f.dist);
    comps.push({ input: await thumb(im.png), left, top });
    const drift = f.drift != null ? ` dr ${f.drift.toFixed(1)}` : '';
    comps.push({
      input: labelSvg(`${f.dist} u · T${f.tier ?? '?'} · ${f.calls ?? '?'}c${drift}`, TW),
      left,
      top: top + TH - 18,
    });
    comps.push({ input: await thumb(im.maskPng), left, top: top + TH + pad });
    const heat = heats[k];
    if (heat && step) {
      comps.push({
        input: await thumb(await heatPng(heat), 'nearest'),
        left,
        top: top + 2 * (TH + pad),
      });
      const txt = step.judged
        ? `ΔE ${step.mean.toFixed(1)}/${step.p95.toFixed(0)} blob ${(step.blob * 100).toFixed(1)}% IoU ${step.iou.toFixed(2)}`
        : `land ${(step.landFrac * 100).toFixed(0)}% (not judged)`;
      comps.push({
        input: labelSvg(txt, TW, step.failures.length > 0),
        left,
        top: top + 3 * TH + 2 * pad - 18,
      });
    }
  }
  await sharp({
    create: {
      width: pad + imgs.length * (TW + pad),
      height: top + 3 * (TH + pad),
      channels: 3,
      background: '#202020',
    },
  })
    .composite(comps)
    .jpeg({ quality: 85 })
    .toFile(resolve(OUT, `ladder-${p.id}.jpg`));
}

/** contact.jpg for the ladder set: the strips stacked. */
async function ladderContact(results: ShotResult[]): Promise<void> {
  const strips = await Promise.all(
    results.map(async (r) => {
      const b = await sharp(resolve(OUT, `ladder-${r.id}.jpg`))
        .png()
        .toBuffer();
      return { b, meta: await sharp(b).metadata() };
    }),
  );
  let y = 0;
  const comps = strips.map(({ b, meta }) => {
    const c = { input: b, left: 0, top: y };
    y += meta.height ?? 0;
    return c;
  });
  await sharp({
    create: {
      width: Math.max(...strips.map((s) => s.meta.width ?? 0)),
      height: y,
      channels: 3,
      background: '#202020',
    },
  })
    .composite(comps)
    .jpeg({ quality: 80 })
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
      const out = p.ladder
        ? await runLadder(browser, base, p, i === 0)
        : await runShot(browser, base, p, i === 0);
      results.push(out.r);
      if (out.deterministic !== undefined) deterministic = out.deterministic;
      renderer = out.r.renderer ?? renderer;
    }
    if ((set === 'ci' || set === 'dev') && list.length > 0 && !flag('no-selftest')) {
      for (const name of SELFTESTS) {
        console.log(`[selftest] ${name} on ${list[0].id}`);
        selftests.push(await runSelftest(browser, base, list[0], name));
      }
      // the leak checks again at the village preset: life meshes enter / leave the view there
      // (sweep D4 — a sailboat or the wake uploaded between the two measurements)
      const village: ShotPreset = { ...list[0], cam: 'village' };
      for (const name of ['regen', 'edit'] as const) {
        console.log(`[selftest] ${name} on ${list[0].id} @ village`);
        selftests.push(await runSelftest(browser, base, village, name));
      }
      console.log(`[selftest] editpick on ${list[0].id}`);
      selftests.push(await runEditPickSelftest(browser, base, list[0]));
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
  if (set === 'ladder') await ladderContact(results);
  else await contactSheet(results);
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
  for (const r of results)
    if (r.ladder)
      for (const st of r.ladder.steps)
        console.log(
          `${r.id} ${st.far}→${st.near}: ${st.judged ? `mean ${st.mean.toFixed(2)} p95 ${st.p95.toFixed(1)} blob ${(st.blob * 100).toFixed(1)}% IoU ${st.iou.toFixed(3)}` : `land ${(st.landFrac * 100).toFixed(0)}% not judged`}${st.failures.length ? '  MISS ' + st.failures.join('; ') : ''}`,
        );
  for (const r of results)
    if (r.live)
      console.log(
        `${r.id} live: changed ${(r.live.changedFrac * 100).toFixed(2)}% clusters ${r.live.clusters} largest ${r.live.largest}${r.live.failures.length ? `  MISS ${r.live.failures.join('; ')}${ASSERT ? '' : ' (not asserted)'}` : ''}`,
      );
  for (const r of results)
    if (r.ladder?.failures.length)
      console.log(
        `${r.id}: ${r.ladder.failures.length} ladder misses${ASSERT ? '' : ' (not asserted)'}`,
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
