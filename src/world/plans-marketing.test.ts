import { describe, expect, it } from 'vitest';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import { MARKETING_CULTURE_SITES as CS } from '../content/cultures/marketing.ts';
import { MARKETING_CULTURE_PROP_DEFS } from '../content/props-themes/marketing.ts';
import { FIXTURE_RADIUS } from '../content/settlements.ts';
import { THEMES } from '../content/themes/index.ts';
import { MARKETING_PLAN } from '../content/themes/marketing.ts';
import { StageHash } from './gen/hash.ts';
import { discShape, rectShape, shapeCorners, shapeDist, type Shape } from './gen/sites.ts';
import { generateWorld, heightAt, zoneAt, Zone, type WorldData } from './index.ts';

// TASK-403: the Marketing "Media Rock" plan (Beacon Rock stack + lee terraces), 30 seeds
// (replaces the TASK-365 sea-stack plan tests).
const SEEDS = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed)));
  return w;
};
const mktOf = (w: WorldData) => {
  const isl = w.islands.find((i) => i.theme === 'marketing');
  if (!isl) throw new Error('no Marketing island');
  const s = w.settlements.find((x) => x.islandId === isl.id);
  const fx = w.fixtures.filter((f) => f.islandId === isl.id);
  const lh = w.landmarks.find((m) => m.islandId === isl.id && m.kind === 'lighthouse');
  return {
    isl,
    s,
    lh,
    lots: (s?.lots ?? []).map((i) => w.lots[i]),
    fx,
    of: (defId: string) => fx.filter((f) => f.defId === defId),
    /** Shelf heights at the profile's ledge anchors (upper, middle, fair). */
    levels: [0, 1, 2].map((k) => {
      const a = isl.anchors[`ledge${k}`];
      return a ? heightAt(w.height, a.x, a.z) : NaN;
    }),
  };
};
function reachable(w: WorldData, start: number): Uint8Array {
  const n = w.pathGraph.nodes.length / 2;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const e = w.pathGraph.edges;
  for (let i = 0; i < e.length; i += 2) {
    adj[e[i]].push(e[i + 1]);
    adj[e[i + 1]].push(e[i]);
  }
  const seen = new Uint8Array(n);
  const q = [start];
  seen[start] = 1;
  while (q.length)
    for (const m of adj[q.pop() as number])
      if (!seen[m]) {
        seen[m] = 1;
        q.push(m);
      }
  return seen;
}
function islandHash(w: WorldData, id: number): string {
  const h = new StageHash();
  for (const l of w.lots.filter((x) => x.islandId === id))
    h.str(l.defId).float(l.x).float(l.z).float(l.rotY).u32(l.variant);
  for (const m of w.landmarks.filter((x) => x.islandId === id)) h.str(m.kind).float(m.x).float(m.z);
  for (const f of w.fixtures.filter((x) => x.islandId === id))
    h.str(f.defId).float(f.x).float(f.z).float(f.rotY);
  for (const d of w.docks.filter((x) => x.islandId === id)) h.float(d.x).float(d.z).u32(d.segments);
  for (const p of w.paths.filter((x) => x.islandId === id))
    for (const q of p.points) h.float(q.x).float(q.z);
  return h.hex();
}
/** At least `frac` of the seeds pass `ok`. */
function most(frac: number, ok: (w: WorldData, seed: number) => boolean): void {
  const bad = SEEDS.filter((seed) => !ok(world(seed), seed));
  expect(1 - bad.length / SEEDS.length, `failing seeds ${bad.join(' ')}`).toBeGreaterThanOrEqual(
    frac,
  );
}

describe('Marketing Media Rock plan (TASK-403), 30 seeds', () => {
  it('terraces: three shelves stepping down to leeward, earth walls between them', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl, levels } = mktOf(w);
      const ctx = `seed ${seed}`;
      const [l0, l1, l2] = levels;
      // the stack (≈ 25 u) > upper ledge > middle ledge > fair ground > the sea
      expect(isl.peakY - l0, ctx).toBeGreaterThan(5);
      expect(l0 - l1, ctx).toBeGreaterThan(3.5);
      expect(l1 - l2, ctx).toBeGreaterThan(3.5);
      expect(l2, ctx).toBeGreaterThan(2.5);
      // walls: cliff cells between the shelf levels
      let walls = 0;
      for (let i = 0; i < w.zone.length; i++)
        if (w.islandMap[i] === isl.id + 1 && w.zone[i] === Zone.cliff) {
          const y = w.height.data[i];
          if (y > l2 + 1 && y < l0 - 1) walls++;
        }
      expect(walls, ctx).toBeGreaterThan(20);
    }
  });

  it('the Broadcast Tower (lighthouse variant 2) is the landmark and the tallest top', () => {
    expect(THEMES.marketing.landmarkVariant.lighthouse).toBe(2);
    expect(PROP_DEFS[PROP_DEF_INDEX.lighthouse].tier).toBe(0);
    for (const seed of SEEDS) {
      const w = world(seed);
      const { s, lh, of } = mktOf(w);
      expect(
        s?.landmarks.map((i) => w.landmarks[i].kind),
        `seed ${seed}`,
      ).toEqual(['lighthouse']);
      if (!lh) continue;
      const top = heightAt(w.height, lh.x, lh.z) + MARKETING_PLAN.towerHeight;
      // the antenna tower (16.3 u with its whip) and the giant screen stay below it
      for (const f of [...of('antennaTower').filter((x) => x.variant !== 1), ...of('giantScreen')])
        expect(heightAt(w.height, f.x, f.z) + 16.3, `seed ${seed} ${f.defId}`).toBeLessThan(top);
    }
  });

  it('Ad Boulevard: giant screen on the summit, the street hub (Zone.plaza), billboards and a café', () => {
    most(0.9, (w) => {
      const { isl, s, of } = mktOf(w);
      const scr = of('giantScreen');
      if (!s?.plaza || scr.length !== 1) return false;
      if (heightAt(w.height, scr[0].x, scr[0].z) < isl.peakY - 6) return false;
      if (zoneAt(w.height, w.zone, s.plaza.x, s.plaza.z) !== Zone.plaza) return false;
      const cafe = of('fairBooth').some((f) => f.variant === 1);
      return of('billboardV2').length >= 1 && cafe;
    });
  });

  it('lots: broadcast studios + the billboard office in >= 90 %, all connected', () => {
    let ok = 0;
    const counts: number[] = [];
    for (const seed of SEEDS) {
      const w = world(seed);
      const { s, lots } = mktOf(w);
      if (!s) continue;
      counts.push(lots.length);
      const defs = lots.map((l) => l.defId);
      if (lots.length >= 2 && defs.includes('broadcastStudio') && defs.includes('billboard')) ok++;
      const seen = reachable(w, s.hub.node);
      for (const l of lots) expect(seen[l.node], `seed ${seed} ${l.defId}`).toBe(1);
      for (const di of s.docks)
        if (w.docks[di].node >= 0) expect(seen[w.docks[di].node], `seed ${seed} dock`).toBe(1);
    }
    console.info(`Marketing lots per seed: ${counts.join(' ')}`);
    expect(ok / SEEDS.length).toBeGreaterThanOrEqual(0.9);
  });

  it('media campus on the ledges: antenna tower, a layered office, a shop', () => {
    most(0.9, (w) => {
      const { levels, of } = mktOf(w);
      const onLedge = (f: { x: number; z: number }): boolean => {
        const y = heightAt(w.height, f.x, f.z);
        return levels.slice(0, 2).some((l) => Math.abs(y - l) < 1.6);
      };
      // v1 / v2 = the transmitters on the sea stacks (TASK-481 / TASK-518), not the campus tower
      const ant = of('antennaTower').filter((f) => f.variant !== 1 && f.variant !== 2);
      return (
        ant.length === 1 &&
        onLedge(ant[0]) &&
        of('mediaOffice').length >= 1 &&
        of('mediaOffice').every(onLedge) &&
        of('mediaShop').length >= 1 &&
        of('mediaShop').every(onLedge)
      );
    });
  });

  it('fair ground on the low shelf: ferris wheel, stage, tents and booths round a paved disc', () => {
    most(0.9, (w) => {
      const { levels, of } = mktOf(w);
      const low = (f: { x: number; z: number }): boolean =>
        Math.abs(heightAt(w.height, f.x, f.z) - levels[2]) < 1.6;
      const wheel = of('ferrisWheel');
      const stage = of('stage');
      const games = of('fairBooth').filter((f) => f.variant === 0);
      return (
        wheel.length === 1 &&
        low(wheel[0]) &&
        stage.length === 1 &&
        low(stage[0]) &&
        of('fairTent').length >= 2 &&
        of('fairTent').every(low) &&
        games.length >= 1
      );
    });
  });

  it('landing: one pier, the megaphone kiosk on land; ad buoys, no keeper cottage', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl, s, of, fx } = mktOf(w);
      const ctx = `seed ${seed}`;
      expect(s?.docks.length, ctx).toBe(1);
      const kiosk = of('megaphoneKiosk');
      expect(kiosk.length, `${ctx} kiosk`).toBe(1);
      expect(heightAt(w.height, kiosk[0].x, kiosk[0].z), ctx).toBeGreaterThan(0.3);
      const defs = w.lots.filter((l) => l.islandId === isl.id).map((l) => l.defId);
      for (const d of ['cottage', 'stiltHut', 'logCabin', 'towerHouse', 'barn'])
        expect(defs, ctx).not.toContain(d);
      expect(
        fx.map((f) => f.defId),
        ctx,
      ).not.toContain('buoy');
      expect(of('adBuoy').length, ctx).toBeGreaterThanOrEqual(1);
    }
  });

  it('the summit reads as brand lawn, not bare rock', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = mktOf(w);
      let lawn = 0;
      let top = 0;
      const n = w.height.n;
      for (let i = 0; i < n * n; i++) {
        if (w.islandMap[i] !== isl.id + 1 || w.height.data[i] < isl.peakY * 0.8) continue;
        top++;
        if (w.zone[i] === Zone.grass || w.zone[i] === Zone.meadow) lawn++;
      }
      expect(lawn / Math.max(1, top), `seed ${seed}`).toBeGreaterThan(0.4);
    }
  });

  it('deterministic: per-island snapshot', () => {
    const got = [1, 42, 1337].map((seed) => {
      const w = generateWorld(seed);
      const h = islandHash(w, mktOf(w).isl.id);
      expect(islandHash(generateWorld(seed), mktOf(w).isl.id)).toBe(h);
      return h;
    });
    expect(got).toMatchInlineSnapshot(`
      [
        "5ed3130f9579e15f",
        "15d6b1c5388c1927",
        "8cc31f2e2217ca30",
      ]
    `);
  });
});

/** Count range per culture def on the Marketing island (30 seeds). */
const KIT_COUNTS: Record<string, readonly [number, number]> = {
  mascotStatue: [1, 1],
  // TASK-471 re-roll: seed 1526 fits one
  marqueeSign: [1, 3],
  popcornCart: [0, 2],
  balloonMast: [0, 3],
  confettiCannon: [0, 2],
  searchlightPair: [0, 1],
  prizeBooth: [0, 2],
  selfieSpot: [0, 1],
  posterRoll: [0, 4],
  megaphoneStand: [0, 2],
};
const CULTURE_DEFS = new Set(MARKETING_CULTURE_PROP_DEFS.map((d) => d.id));

describe(
  'Marketing Carnival Broadcasters culture (TASK-423), 30 seeds',
  { timeout: 120_000 },
  () => {
    it('kit placed in range, ≥ 5 story spots, every piece on levelled land clear of lots', () => {
      for (const seed of SEEDS) {
        const w = world(seed);
        const { isl, of } = mktOf(w);
        const ctx = `seed ${seed}`;
        for (const [def, [lo, hi]] of Object.entries(KIT_COUNTS)) {
          const n = of(def).length;
          expect(n, `${ctx} ${def}`).toBeGreaterThanOrEqual(lo);
          expect(n, `${ctx} ${def}`).toBeLessThanOrEqual(hi);
        }
        // story spots: ≥ 5 distinct kinds on this island's land
        const st = w.storySpots.filter((s) => s.islandId === isl.id);
        expect(st.length, ctx).toBeGreaterThanOrEqual(5);
        expect(new Set(st.map((s) => s.kind)).size, ctx).toBe(st.length);
        for (const s of st) expect(s.pos.y, `${ctx} ${s.kind}`).toBeGreaterThan(0.3);
        const lots = w.lots
          .filter((l) => l.islandId === isl.id)
          .map((l) => rectShape(l.x, l.z, l.rotY, l.w, l.d));
        const rects = CS.rect as Record<string, readonly [number, number]>;
        for (const f of w.fixtures.filter(
          (x) => x.islandId === isl.id && CULTURE_DEFS.has(x.defId),
        )) {
          const r = rects[f.defId];
          const sh: Shape = r
            ? rectShape(f.x, f.z, f.rotY, r[0], r[1])
            : discShape(f.x, f.z, FIXTURE_RADIUS[f.defId]);
          const pts = r
            ? [{ x: f.x, z: f.z }, ...shapeCorners(sh)]
            : [0, 1, 2, 3, 4, 5].map((k) => ({
                x: f.x + Math.cos(k * 1.047) * sh.r,
                z: f.z + Math.sin(k * 1.047) * sh.r,
              }));
          const ys = pts.map((p) => heightAt(w.height, p.x, p.z));
          const at = `${ctx} ${f.defId}@${f.x.toFixed(1)},${f.z.toFixed(1)}`;
          // on land, level (nothing floats off a shelf rim or sinks into a wall)
          expect(Math.min(...ys), at).toBeGreaterThan(0.3);
          expect(Math.max(...ys) - Math.min(...ys), at).toBeLessThanOrEqual(r ? 0.45 : 0.6);
          for (const l of lots)
            for (const p of pts) expect(shapeDist(l, p.x, p.z), at).toBeGreaterThan(0);
          expect(f.variant, at).toBeDefined();
        }
      }
    });

    it('the fair carries the show: confetti, masts (launch anchor), searchlights, popcorn, prize duck', () => {
      most(0.9, (w) => {
        const { isl, of } = mktOf(w);
        const st = new Set(w.storySpots.filter((s) => s.islandId === isl.id).map((s) => s.kind));
        return (
          of('confettiCannon').length >= 1 &&
          of('balloonMast').length >= 2 &&
          of('selfieSpot').length === 1 &&
          st.has('balloonLaunch') &&
          st.has('mascotWave')
        );
      });
      most(0.85, (w) => mktOf(w).of('searchlightPair').length === 1);
      most(0.85, (w) => mktOf(w).of('popcornCart').length >= 1);
      // the fair shelf is often full: the giant plush duck finds a booth spot in most seeds
      most(0.7, (w) =>
        mktOf(w)
          .of('prizeBooth')
          .some((f) => f.variant === 1),
      );
      // the launch mast is the pennant mast (v0), one per island
      for (const seed of SEEDS.slice(0, 10)) {
        const w = world(seed);
        const { isl, of } = mktOf(w);
        const launch = w.storySpots.filter(
          (s) => s.islandId === isl.id && s.kind === 'balloonLaunch',
        );
        if (!launch.length) continue;
        expect(launch.length).toBe(1);
        const m = of('balloonMast').find(
          (f) => Math.hypot(f.x - launch[0].pos.x, f.z - launch[0].pos.z) < 1e-6,
        );
        expect(m?.variant, `seed ${seed}`).toBe(0);
      }
    });

    it('culture defs stay on the Marketing island', () => {
      for (const seed of SEEDS.slice(0, 6)) {
        const w = world(seed);
        const id = mktOf(w).isl.id;
        for (const f of w.fixtures)
          if (CULTURE_DEFS.has(f.defId)) expect(f.islandId, `seed ${seed}`).toBe(id);
      }
    });
  },
);
