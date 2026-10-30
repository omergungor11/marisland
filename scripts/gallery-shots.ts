/**
 * Prop showcase capture (TASK-465): screenshots of the `?gallery=1` scene for a set of def ids, so
 * a prop can be judged on its own (no world needed). One image per def (a row of every variant at
 * LOD0 + LOD1) and one close 3/4 view of variant 0 LOD0.
 *
 *   pnpm exec tsx scripts/gallery-shots.ts [m20|coding22|research|qa24|marina|devops25|devops26|marketing27|research28|id,id,...] [--port=5199] [--out=shots/gallery-m20]
 *
 * Starts its own `vite` dev server on `--port` (killed at the end; a server already on the port is
 * reused and left alone). Software GL (swiftshader), so no GPU is needed.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { CODING_M22_SHOWCASE_IDS } from '../src/content/props-themes/coding.ts';
import { M20_PROP_IDS } from '../src/content/props-themes/m20.ts';
import { QA_M24_PROP_IDS } from '../src/content/props-themes/qa-proving.ts';
import { QA_M30_PROP_IDS } from '../src/content/props-themes/qa-customs.ts';
import { HQ_MARINA_PROP_IDS } from '../src/content/props-themes/hq-marina.ts';
import { DEVOPS_M25_PROP_IDS } from '../src/content/props-themes/devops-m25.ts';
import { DEVOPS_M26_PROP_IDS } from '../src/content/props-themes/devops-m26.ts';
import { MARKETING_M27_PROP_IDS } from '../src/content/props-themes/marketing-m27.ts';
import { RESEARCH_M28_PROP_IDS } from '../src/content/props-themes/research-m28.ts';
import { CODING_M33_PROP_IDS } from '../src/content/props-themes/coding-m33.ts';
import { RESEARCH_M22_PROP_IDS } from '../src/content/props-themes/research.ts';
import { buildGalleryScene } from '../src/geo/gallery.ts';
import { PROP_GEO } from '../src/geo/registry.ts';

const args = process.argv.slice(2);
const opt = (n: string): string | undefined =>
  args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const which = args.find((a) => !a.startsWith('--')) ?? 'm20';
const ids =
  which === 'm20'
    ? M20_PROP_IDS
    : which === 'coding22'
      ? CODING_M22_SHOWCASE_IDS
      : which === 'research'
        ? RESEARCH_M22_PROP_IDS
        : which === 'qa24'
          ? QA_M24_PROP_IDS
          : which === 'qa30'
            ? QA_M30_PROP_IDS
            : which === 'marina'
              ? HQ_MARINA_PROP_IDS
              : which === 'devops25'
                ? DEVOPS_M25_PROP_IDS
                : which === 'devops26'
                  ? DEVOPS_M26_PROP_IDS
                  : which === 'marketing27'
                    ? MARKETING_M27_PROP_IDS
                    : which === 'research28'
                      ? RESEARCH_M28_PROP_IDS
                      : which === 'coding33'
                        ? CODING_M33_PROP_IDS
                        : which.split(',');
const PORT = Number(opt('port') ?? 5199);
const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(
  ROOT,
  opt('out') ??
    `shots/gallery-${['m20', 'coding22', 'research', 'qa24', 'qa30', 'marina', 'devops25', 'devops26', 'marketing27', 'research28', 'coding33'].includes(which) ? which : 'custom'}`,
);
const BASE = `http://localhost:${PORT}/`;

let server: ChildProcess | undefined;
const stop = (): void => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
  server = undefined;
};
process.on('exit', stop);

async function up(): Promise<boolean> {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!(await up())) {
    server = spawn(
      resolve(ROOT, 'node_modules/.bin/vite'),
      ['--port', String(PORT), '--strictPort'],
      { cwd: ROOT, stdio: 'ignore', detached: true },
    );
    for (let i = 0; i < 100 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
    if (!(await up())) throw new Error('vite did not come up');
  }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const shoot = async (
    only: string,
    name: string,
    cam: number[],
    w = 1280,
    h = 720,
  ): Promise<void> => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const q = new URLSearchParams({
      gallery: '1',
      ids: only,
      cam: cam.map((n) => n.toFixed(2)).join(','),
      freeze: '1',
      hud: '0',
      dpr: '1',
      quality: 'low',
      time: '12',
    });
    await page.goto(`${BASE}?${q}`, { waitUntil: 'load' });
    await page.waitForFunction(
      '(() => { const m = window.__marisland; return !!(m && (m.ready || m.error)); })()',
      null,
      { timeout: 120_000 },
    );
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, `${name}.png`) });
    await page.close();
    console.info(name, errors.length ? `ERRORS ${errors.join('; ')}` : 'ok');
  };
  try {
    for (const id of ids) {
      const row = buildGalleryScene([id]).items;
      if (!row.length) continue;
      const def = PROP_GEO[id];
      const x0 = row[0].x;
      const x1 = row[row.length - 1].x;
      const z = row[0].z;
      const cx = (x0 + x1) / 2;
      const half = Math.max((x1 - x0) / 2 + def.footprint, def.footprint * 1.6);
      const dist = Math.max(half * 1.9, def.height * 2.2, 8);
      await shoot(id, `${id}-row`, [
        cx,
        def.height * 0.9 + dist * 0.25,
        z + dist,
        cx,
        def.height * 0.4,
        z,
      ]);
      const h = def.height;
      const d = Math.max(def.footprint * 2.6, h * 1.8, 6);
      await shoot(
        id,
        `${id}-close`,
        [x0 + d * 0.55, h * 0.55 + d * 0.3, z + d * 0.85, x0, h * 0.45, z],
        960,
        720,
      );
      // a close 3/4 view of every other variant (`--variants`, default for marketing27: the cable car,
      // the sea signs and the guyed mast are variants of old defs)
      if (args.includes('--variants') || which === 'marketing27' || which === 'research28')
        for (let v = 1; v < def.variants; v++) {
          const it = row.find((r) => r.variant === v && r.lod === 0);
          if (!it) continue;
          const hv = def.heights?.[v] ?? def.height;
          const dv = Math.max(def.footprint * 2.6, hv * 1.6, 6);
          await shoot(
            id,
            `${id}-v${v}-close`,
            [it.x + dv * 0.55, hv * 0.55 + dv * 0.2, z + dv * 0.9, it.x, hv * 0.5, z],
            960,
            720,
          );
        }
      // straight-on from +z (the front: gate passage, stall counter, bay doorway) at eye height
      await shoot(
        id,
        `${id}-front`,
        [x0, Math.min(1.6, h * 0.5), z + Math.max(d * 1.1, 8), x0, Math.min(1.4, h * 0.45), z],
        960,
        720,
      );
    }
  } finally {
    await browser.close();
    stop();
  }
}

main().catch((e) => {
  console.error(e);
  stop();
  process.exit(1);
});
