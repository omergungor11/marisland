/**
 * Prop showcase capture (TASK-465): screenshots of the `?gallery=1` scene for a set of def ids, so
 * a prop can be judged on its own (no world needed). One image per def (a row of every variant at
 * LOD0 + LOD1) and one close 3/4 view of variant 0 LOD0.
 *
 *   pnpm exec tsx scripts/gallery-shots.ts [m20|coding22|research|qa24|marina|devops25|devops26|marketing27|research28|harbours|research31|coding33|coaster|buildings|id,id,...] [--port=5199] [--out=shots/gallery-m20]
 *
 * Starts its own `vite` dev server on `--port` (killed at the end; a server already on the port is
 * reused and left alone). Software GL (swiftshader), so no GPU is needed.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { COURIER_PROP_IDS } from '../src/content/fleet-ships.ts';
import { CODING_M22_SHOWCASE_IDS } from '../src/content/props-themes/coding.ts';
import { M20_PROP_IDS } from '../src/content/props-themes/m20.ts';
import { QA_M24_PROP_IDS } from '../src/content/props-themes/qa-proving.ts';
import { QA_M30_PROP_IDS } from '../src/content/props-themes/qa-customs.ts';
import { HQ_MARINA_PROP_IDS } from '../src/content/props-themes/hq-marina.ts';
import { DEVOPS_M25_PROP_IDS } from '../src/content/props-themes/devops-m25.ts';
import { DEVOPS_M26_PROP_IDS } from '../src/content/props-themes/devops-m26.ts';
import { MARKETING_M27_PROP_IDS } from '../src/content/props-themes/marketing-m27.ts';
import { RESEARCH_M28_PROP_IDS } from '../src/content/props-themes/research-m28.ts';
import {
  HARBOURS_PROP_IDS,
  RESEARCH_M31_PROP_IDS,
} from '../src/content/props-themes/research-m31.ts';
import { HARBOUR_VARIANTS } from '../src/content/themes/harbours.ts';
import { CODING_M33_PROP_IDS } from '../src/content/props-themes/coding-m33.ts';
import { QA_COASTER_PROP_IDS } from '../src/content/props-themes/qa-coaster.ts';
import { RESEARCH_M22_PROP_IDS } from '../src/content/props-themes/research.ts';
import { buildGalleryScene } from '../src/geo/gallery.ts';
import { PROP_GEO } from '../src/geo/registry.ts';

const args = process.argv.slice(2);
const opt = (n: string): string | undefined =>
  args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const which = args.find((a) => !a.startsWith('--')) ?? 'm20';
/** TASK-598 (D-160): the defs whose variants are styled (roof / windows / door / trims). */
const BUILDINGS_V2_IDS = ['cottage', 'stiltHut', 'towerHouse', 'barn', 'logCabin'];
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
                      : which === 'harbours'
                        ? HARBOURS_PROP_IDS
                        : which === 'research31'
                          ? RESEARCH_M31_PROP_IDS
                          : which === 'coding33'
                            ? CODING_M33_PROP_IDS
                            : which === 'coaster'
                              ? QA_COASTER_PROP_IDS
                              : which === 'couriers'
                                ? COURIER_PROP_IDS
                                : which === 'buildings'
                                  ? BUILDINGS_V2_IDS
                                  : which.split(',');
const PORT = Number(opt('port') ?? 5199);
const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(
  ROOT,
  opt('out') ??
    `shots/gallery-${['m20', 'coding22', 'research', 'qa24', 'qa30', 'marina', 'devops25', 'devops26', 'marketing27', 'research28', 'harbours', 'research31', 'coding33', 'coaster', 'couriers', 'buildings'].includes(which) ? which : 'custom'}`,
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
      if (which === 'harbours') {
        // the harbour kit: only the added neutral + Research variants, side by side then each close
        const first = HARBOUR_VARIANTS[id as keyof typeof HARBOUR_VARIANTS];
        const a = row.find((r) => r.variant === first && r.lod === 0);
        const b = row.find((r) => r.variant === first + 1 && r.lod === 0);
        if (!a || !b) continue;
        const hv = def.heights?.[first] ?? def.height;
        const dv = Math.max(def.footprint * 3, hv * 1.7, 5);
        const mx = (a.x + b.x) / 2;
        await shoot(id, `${id}-pair`, [
          mx + dv * 0.3,
          hv * 0.55 + dv * 0.2,
          a.z + dv * 1.5,
          mx,
          hv * 0.45,
          a.z,
        ]);
        for (const [k, it] of [a, b].entries())
          await shoot(
            id,
            `${id}-v${first + k}-close`,
            [it.x + dv * 0.5, hv * 0.55 + dv * 0.2, it.z + dv * 0.85, it.x, hv * 0.45, it.z],
            960,
            720,
          );
        continue;
      }
      if (which === 'buildings') {
        // TASK-598: every variant as a 640x360 tile (LOD0 left, LOD1 right), then one grid per def
        const tiles: string[] = [];
        for (let v = 0; v < def.variants; v++) {
          const pair = row.filter((r) => r.variant === v);
          const mid = (pair[0].x + pair[pair.length - 1].x) / 2;
          const dd = Math.max(
            ((pair[pair.length - 1].x - pair[0].x) / 2 + def.footprint) * 1.75,
            def.height * 2.1,
          );
          const name = `${id}-v${v}`;
          await shoot(
            id,
            name,
            [
              mid + dd * 0.35,
              def.height * 0.75 + dd * 0.22,
              pair[0].z + dd,
              mid,
              def.height * 0.4,
              pair[0].z,
            ],
            640,
            360,
          );
          tiles.push(name);
        }
        const gp = await browser.newPage({
          viewport: { width: 1280, height: 360 * Math.ceil(tiles.length / 2) },
        });
        const imgs = tiles.map((t) => readFileSync(resolve(OUT, `${t}.png`)).toString('base64'));
        await gp.setContent(
          `<body style="margin:0;display:grid;grid-template-columns:640px 640px">${imgs
            .map(
              (b64, i) =>
                `<div style="position:relative"><img src="data:image/png;base64,${b64}"><b style="position:absolute;left:6px;top:4px;font:bold 18px sans-serif;color:#222">${id} v${i}</b></div>`,
            )
            .join('')}</body>`,
        );
        await gp.screenshot({ path: resolve(OUT, `${id}-grid.png`) });
        await gp.close();
        continue;
      }
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
      if (
        args.includes('--variants') ||
        which === 'marketing27' ||
        which === 'couriers' ||
        which === 'research28' ||
        which === 'research31'
      )
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
    if (which === 'couriers') {
      // P-couriers: the 7 ships (3/4 view, LOD0) as one 4 x 2 sheet
      const names = [
        'courierShip-close',
        ...[1, 2, 3, 4, 5, 6].map((v) => `courierShip-v${v}-close`),
      ];
      const cw = 640;
      const ch = 480;
      const tiles = await Promise.all(
        names.map(async (n, i) => ({
          input: await sharp(resolve(OUT, `${n}.png`))
            .resize(cw, ch)
            .toBuffer(),
          left: (i % 4) * cw,
          top: Math.floor(i / 4) * ch,
        })),
      );
      await sharp({
        create: { width: cw * 4, height: ch * 2, channels: 3, background: '#7FB6D9' },
      })
        .composite(tiles)
        .jpeg({ quality: 88 })
        .toFile(resolve(OUT, 'P-couriers.jpg'));
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
