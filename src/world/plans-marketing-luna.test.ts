import { describe, expect, it } from 'vitest';
import { HARBOURS } from '../content/harbours.ts';
import { DOCK } from '../content/settlements.ts';
import { CARNIVAL_PIER as K, LUNA_SITE as S } from '../content/themes/marketing-harbour.ts';
import { LUNA_KIT } from '../content/themes/marketing-luna.ts';
import { landSamples, voyageRoute } from '../life/courier-route.ts';
import {
  lunaDeckDist,
  lunaKeepOut,
  lunaSiteLayout,
  lunaStroll,
} from './gen/plans/marketing-luna.ts';
import { rectShape, shapeDist } from './gen/sites.ts';
import {
  generateWorld,
  heightAt,
  THEME_IDS,
  type IslandData,
  type WorldData,
  type XZ,
} from './index.ts';

/** TASK-671 (D-172): the sea-top fun park beside the Marketing ferry pier. 30 seeds + the shot seeds. */
const SEEDS = [1001, 2024, ...Array.from({ length: 30 }, (_, k) => 1000 + k * 263)];
const P = HARBOURS.marketing as NonNullable<typeof HARBOURS.marketing>;
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed)));
  return w;
};
const list = (isl: IslandData, key: string) => {
  const out: { x: number; z: number; rotY: number; y?: number }[] = [];
  for (let k = 0; isl.anchors[`${key}${k}`]; k++) out.push(isl.anchors[`${key}${k}`]);
  return out;
};
const site = (seed: number) => {
  const w = world(seed);
  const isl = w.islands.find((i) => i.theme === 'marketing');
  if (!isl) throw new Error('no Marketing island');
  const fx = w.fixtures.filter((f) => f.islandId === isl.id);
  return { w, isl, A: isl.anchors, fx, of: (id: string) => fx.filter((f) => f.defId === id) };
};
const near = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);
const LUNA_DEFS = new Set([
  'lunaDeck',
  'lunaRide',
  'lunaCoaster',
  'lunaGate',
  'lunaStand',
  'lunaDecor',
]);

/** Fit tier of a seed: the M or S platform, the small Carnival deck, or nothing. */
function tier(seed: number): 'M' | 'S' | 'small' | 'none' {
  const { A } = site(seed);
  if (A.lunaDeck) return A.lunaDeckFrame.z === 1 ? 'M' : 'S';
  return A.carnivalDeck ? 'small' : 'none';
}

/** Pier frame of a world point: u along the pier from the root, v across (any side). */
function pierFrame(isl: IslandData, p: XZ): { u: number; v: number } {
  const a = isl.anchors.harbourPier0;
  const c = Math.cos(a.rotY);
  const s = Math.sin(a.rotY);
  const dx = p.x - a.x;
  const dz = p.z - a.z;
  return { u: dx * c + dz * s, v: -dx * s + dz * c };
}

describe('TASK-671 fun park: seed fit', () => {
  it('fit table: M on seed 1001 and 1, 42; the sweep pinned', () => {
    const table = { M: 0, S: 0, small: 0, none: 0 };
    for (const seed of SEEDS) table[tier(seed)]++;
    for (const seed of [1001, 1, 42]) expect(tier(seed), `seed ${seed}`).toBe('M');
    // (pinned to today's sweep: 32 / 32 M, the S and small-deck fallbacks never reached; a regression shows)
    expect(table.M).toBeGreaterThanOrEqual(M_MIN);
    expect(table.M + table.S).toBe(SEEDS.length);
  }, 300_000);

  it('the old boardwalk and its 0.6 wheel are gone; one park wheel at scale 1', () => {
    for (const seed of SEEDS) {
      const { A, of } = site(seed);
      if (!A.lunaDeck) continue;
      const m = `seed ${seed}`;
      expect(of('sailboat').filter((f) => f.variant === K.deck.variant).length, m).toBe(0);
      const wheels = of('ferrisWheel').filter((f) => near(f, A.carnivalWheel) < 1e-6);
      expect(wheels.length, m).toBe(1);
      expect(wheels[0].scale, m).toBe(LUNA_KIT.ride.wheel.scale);
      expect(of('ferrisWheel').filter((f) => f.scale === K.wheel.scale).length, m).toBe(0);
      expect(near(A.lunaWheel, A.carnivalWheel), m).toBeLessThan(1e-6);
      expect(of('lunaDeck').length, m).toBe(1);
      expect(of('lunaRide').length, m).toBe(3);
      expect(of('lunaCoaster').length, m).toBe(1);
      expect(of('lunaGate').length, m).toBe(1);
    }
  }, 300_000);
});

describe('TASK-671 fun park: placement', () => {
  it('the platform stands over water deep enough for its piles; the coaster sea half over water', () => {
    for (const seed of SEEDS) {
      const { A, w } = site(seed);
      if (!A.lunaDeck) continue;
      const c = A.lunaDeck;
      const s = A.lunaDeckSize;
      const U = { x: Math.cos(c.rotY), z: Math.sin(c.rotY) };
      const X = { x: U.z, z: -U.x };
      const at = (x: number, z: number) =>
        heightAt(w.height, c.x + X.x * x + U.x * z, c.z + X.z * x + U.z * z);
      for (let a = -0.5; a <= 0.5 + 1e-6; a += 0.05)
        for (let b = -0.5; b <= 0.5 + 1e-6; b += 0.05)
          expect(at(a * s.x, b * s.z), `seed ${seed}`).toBeLessThan(S.seabed.deck + 0.05);
      const cw = A.lunaCoasterSize.x / 2;
      for (let x = -cw; x <= cw + 1e-6; x += 1)
        expect(at(x, -s.z / 2 - S.overhang + 0.5), `seed ${seed} coaster`).toBeLessThan(0);
    }
  }, 300_000);

  it('clear of the pier, the T-head, the ferry approach and berth, the arm and other islands', () => {
    for (const seed of SEEDS) {
      const { A, w, isl } = site(seed);
      if (!A.lunaDeck) continue;
      const m = `seed ${seed}`;
      const L = P.pier.segments * DOCK.segment;
      // the platform's corners (and its coaster side) lie outside the approach corridor's half + gap
      const c = A.lunaDeck;
      const s = A.lunaDeckSize;
      const deck = rectShape(c.x, c.z, c.rotY, s.x, s.z);
      const berth = A.ferryBerth;
      expect(lunaDeckDist(isl, berth), m).toBeGreaterThan(P.berth.approach.half);
      for (let u = L; u <= L + P.berth.out + P.berth.approach.len; u += 1) {
        const a = A.harbourPier0;
        const p = { x: a.x + Math.cos(a.rotY) * u, z: a.z + Math.sin(a.rotY) * u };
        expect(lunaDeckDist(isl, p), `${m} approach u ${u}`).toBeGreaterThan(
          P.berth.approach.half + S.approachGap - 0.01,
        );
      }
      for (let k = 0; A[`harbourArm${k}`]; k++)
        expect(lunaDeckDist(isl, A[`harbourArm${k}`]), `${m} arm ${k}`).toBeGreaterThan(2);
      // other islands' land: none within clearOther of the platform
      const n = w.height.n;
      for (let i = 0; i < n * n; i++) {
        const o = w.islandMap[i];
        if (o === 0 || o === isl.id + 1 || o > w.islands.length || w.height.data[i] <= 0) continue;
        const x = w.height.originX + (i % n) * w.height.cellSize;
        const z = w.height.originZ + Math.floor(i / n) * w.height.cellSize;
        expect(shapeDist(deck, x, z), `${m} island ${o - 1}`).toBeGreaterThan(S.clearOther - 1.5);
      }
    }
  }, 300_000);

  it('the gangway joins the T crossbar end to the gate: whole dock pieces, walkable', () => {
    for (const seed of SEEDS) {
      const { A, isl, of } = site(seed);
      if (!A.lunaDeck) continue;
      const m = `seed ${seed}`;
      const L = P.pier.segments * DOCK.segment;
      const g0 = A.lunaGangway0;
      const g1 = A.lunaGangway1;
      const f0 = pierFrame(isl, g0);
      expect(Math.abs(f0.u - L), m).toBeLessThan(1e-6);
      expect(Math.abs(Math.abs(f0.v) - P.pier.head.w / 2), m).toBeLessThan(1e-6);
      const len = near(g0, g1);
      expect(Math.abs(len / DOCK.segment - Math.round(len / DOCK.segment)), m).toBeLessThan(1e-6);
      expect(lunaDeckDist(isl, g1), m).toBeLessThan(0.01);
      // the gate stands in the platform's pier edge, at the gangway's mouth, its sign to the pier
      const gate = A.lunaGate;
      expect(near(gate, g1), m).toBeLessThan(1.31);
      const f = { x: Math.cos(gate.rotY), z: Math.sin(gate.rotY) };
      expect(f.x * (g0.x - gate.x) + f.z * (g0.z - gate.z), m).toBeGreaterThan(0);
      // the planks: a dock piece every 2 u from the crossbar to the gate
      const pieces = of('dock').filter((d) => {
        const t = ((d.x - g0.x) * (g1.x - g0.x) + (d.z - g0.z) * (g1.z - g0.z)) / len;
        const across = Math.abs(
          ((d.x - g0.x) * (g1.z - g0.z) - (d.z - g0.z) * (g1.x - g0.x)) / len,
        );
        return t > 0 && t < len && across < 0.01;
      });
      expect(pieces.length, m).toBe(Math.round(len / DOCK.segment));
      expect(len, m).toBeLessThanOrEqual(S.gangway.pieces[1] * DOCK.segment);
    }
  }, 300_000);

  it('everything on the planks stands on the platform at the deck height; nothing else there', () => {
    for (const seed of SEEDS) {
      const { A, isl, fx } = site(seed);
      if (!A.lunaDeck) continue;
      const m = `seed ${seed}`;
      const kit = new Set([...LUNA_DEFS, 'ferrisWheel', 'billboardV2', 'bunting', 'dock']);
      for (const f of fx) {
        const d = lunaDeckDist(isl, f);
        if (d < -0.3 && !kit.has(f.defId)) expect.fail(`${m}: ${f.defId} on the platform`);
        if (!LUNA_DEFS.has(f.defId)) continue;
        expect(d, `${m} ${f.defId}`).toBeLessThan(0.01);
        if (f.defId === 'lunaDeck') expect(f.y, m).toBeUndefined();
        else expect(f.y, `${m} ${f.defId}`).toBe(LUNA_KIT.deckY);
      }
      expect(A.carnivalScreen, m).toBeDefined();
      expect(lunaDeckDist(isl, A.carnivalScreen), m).toBeLessThan(-0.3);
      // the screen faces the sea (the pier heading), on the sea strip
      expect(Math.cos(A.carnivalScreen.rotY - A.lunaDeck.rotY), m).toBeGreaterThan(0.999);
      expect(A.carnivalScreen.y, m).toBe(LUNA_KIT.deckY);
      // the cannons stay on the T crossbar
      for (const k of [0, 1]) {
        const f = pierFrame(isl, A[`carnivalCannon${k}`]);
        expect(Math.abs(f.u - P.pier.segments * DOCK.segment), m).toBeLessThan(1);
      }
    }
  }, 300_000);

  it('the site layout: no piece overlaps a ride, the coaster, the gate or a stand', () => {
    for (const t of [0, 1, 2] as const) {
      const lay = lunaSiteLayout(t);
      const D = LUNA_KIT.deck[t];
      expect(
        lay.some((p) => p.key === 'screen'),
        `tier ${t}`,
      ).toBe(true);
      expect(
        lay.some((p) => p.key === 'booth'),
        `tier ${t}`,
      ).toBe(true);
      for (const p of lay) {
        expect(Math.abs(p.x), `${t} ${p.key}`).toBeLessThan(D.w / 2);
        expect(Math.abs(p.z), `${t} ${p.key}`).toBeLessThanOrEqual(D.d / 2);
      }
      // the stands' fronts are on the ring
      for (const p of lay.filter((q) => q.ref.defId === 'lunaStand')) {
        const f = p.ref.d / 2 + S.stall.front;
        const x = p.x + Math.sin(p.rotY) * f;
        const z = p.z + Math.cos(p.rotY) * f;
        expect(Math.abs(x) < D.w / 2 && Math.abs(z) < D.d / 2, `${t} ${p.key} front`).toBe(true);
        expect(Math.abs(x) > D.pool.w / 2 || Math.abs(z) > D.pool.d / 2, `${t} ${p.key}`).toBe(
          true,
        );
      }
    }
  });

  it('the stroll loop stays on the ring, off the pool, the rides and every piece', () => {
    for (const t of [0, 1, 2] as const) {
      const lay = lunaSiteLayout(t);
      const D = LUNA_KIT.deck[t];
      const loop = lunaStroll(t, lay);
      expect(loop.length, `tier ${t}`).toBeGreaterThan(12);
      for (const q of loop) {
        expect(Math.abs(q.x) < D.w / 2 - 0.5 && Math.abs(q.z) < D.d / 2 - 0.5, `${t}`).toBe(true);
        expect(Math.abs(q.x) > D.pool.w / 2 || Math.abs(q.z) > D.pool.d / 2, `${t} pool`).toBe(
          true,
        );
        for (const p of lay) {
          if (p.key === 'coaster') continue;
          const s = p.scale ?? 1;
          const sh = rectShape(p.x, p.z, Math.PI / 2 - p.rotY, p.ref.w * s, p.ref.d * s);
          const round = ['swing', 'carousel'].includes(p.key);
          const d = round
            ? Math.hypot(q.x - p.x, q.z - p.z) - Math.max(p.ref.w, p.ref.d) / 2
            : shapeDist(sh, q.x, q.z);
          expect(d, `tier ${t} ${p.key} (${q.x.toFixed(1)}, ${q.z.toFixed(1)})`).toBeGreaterThan(
            0.2,
          );
        }
        // the coaster's deck half
        const cst = lay.find((p) => p.key === 'coaster');
        if (cst) expect(q.z, `tier ${t} coaster`).toBeGreaterThan(cst.z + cst.ref.d / 2 + 0.2);
      }
    }
  });
});

describe('TASK-671 fun park: anchors', () => {
  it('the luna* contract is published on every park', () => {
    for (const seed of SEEDS) {
      const { A, isl } = site(seed);
      if (!A.lunaDeck) continue;
      const m = `seed ${seed}`;
      for (const key of [
        'lunaDeckSize',
        'lunaDeckFrame',
        'lunaPool',
        'lunaPoolSize',
        'lunaSwing',
        'lunaDrop',
        'lunaCarousel',
        'lunaWheel',
        'lunaCoaster',
        'lunaCoasterSize',
        'lunaGate',
        'lunaGangway0',
        'lunaGangway1',
        'carnivalDeck',
        'carnivalDeckSize',
        'carnivalWheel',
        'carnivalScreen',
      ])
        expect(A[key], `${m} ${key}`).toBeDefined();
      expect(list(isl, 'lunaBoat').length, m).toBe(5);
      expect(list(isl, 'lunaStall').length, m).toBeGreaterThanOrEqual(4);
      expect(list(isl, 'lunaStallKind').length, m).toBe(list(isl, 'lunaStall').length);
      const pool = A.lunaPoolSize;
      for (const b of list(isl, 'lunaBoat')) {
        const f = pierFrame(isl, b);
        const c = pierFrame(isl, A.lunaPool);
        expect(Math.abs(f.u - c.u), m).toBeLessThan(pool.z / 2);
        expect(Math.abs(f.v - c.v), m).toBeLessThan(pool.x / 2);
      }
      // the coaster's pivot on the platform's shore edge, frame = the pier heading
      const cf = pierFrame(isl, A.lunaCoaster);
      const df = pierFrame(isl, A.lunaDeck);
      expect(Math.abs(cf.u - (df.u - A.lunaDeckSize.z / 2)), m).toBeLessThan(1e-6);
      expect(Math.cos(A.lunaCoaster.rotY - A.harbourPier0.rotY), m).toBeGreaterThan(0.999);
      // the stroll: a loop on the planks
      const loop = list(isl, 'lunaStroll');
      expect(loop.length, m).toBeGreaterThan(12);
      for (const q of loop) {
        expect(lunaDeckDist(isl, q), m).toBeLessThan(-0.5);
        expect(q.y, m).toBe(LUNA_KIT.deckY);
      }
      // the carnivalDeck alias marks the platform
      expect(near(A.carnivalDeck, A.lunaDeck), m).toBeLessThan(1e-6);
      expect(A.carnivalDeckSize.x, m).toBe(A.lunaDeckSize.x);
    }
  }, 300_000);
});

describe('TASK-671 fun park: keep-outs', () => {
  it('boat routes keep off the platform and the coaster; seamarks too', () => {
    for (const seed of SEEDS) {
      const { isl, w, A } = site(seed);
      if (!A.lunaDeck) continue;
      for (const r of w.boatRoutes)
        for (let k = 0; k + 1 < r.points.length; k++) {
          const a = r.points[k];
          const b = r.points[k + 1];
          const n = Math.ceil(near(a, b));
          for (let i = 0; i <= n; i++) {
            const p = { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n };
            expect(lunaDeckDist(isl, p), `seed ${seed} ${r.kind}`).toBeGreaterThan(0.5);
          }
        }
      for (const s of [...w.seamarks, ...w.marina])
        expect(lunaDeckDist(isl, s), `seed ${seed} ${s.defId}`).toBeGreaterThan(0.5);
      expect(lunaKeepOut([isl]).length).toBeGreaterThan(20);
    }
  }, 300_000);

  it('the ferry still stops at the berth', () => {
    for (const seed of SEEDS) {
      const { isl, w, A } = site(seed);
      const di = w.docks.findIndex((d) => d.islandId === isl.id);
      const ferry = w.boatRoutes.find((r) => r.kind === 'ferry' && r.stops?.includes(di));
      expect(ferry, `seed ${seed}`).toBeDefined();
      const best = Math.min(...(ferry?.points ?? []).map((p) => near(p, A.ferryBerth)));
      expect(best, `seed ${seed}`).toBeLessThan(DOCK.basinRadius + 1);
    }
  }, 300_000);

  it('courier voyages to and from Marketing keep off the park', () => {
    for (const seed of [1001, 1, 42]) {
      const { w, isl } = site(seed);
      for (const t of THEME_IDS) {
        if (t === 'marketing') continue;
        for (const r of [voyageRoute(w, 'marketing', t), voyageRoute(w, t, 'marketing')]) {
          expect(r, `seed ${seed} ${t}`).not.toBeNull();
          if (!r) continue;
          // (the shoal under the park reads shallow to them, so they sail round it; a smoothed A* path
          // may still cut its blend band at ≈ 1 u depth: seed 1 Marketing → DevOps. Seed 1's path to
          // Coding has five samples at 1.15–1.19 u depth 175 u from the park: life's smoothing.)
          expect(landSamples(w, r.pts, r.lens), `seed ${seed} ${t} land`).toBeLessThanOrEqual(8);
          for (const p of r.pts)
            expect(lunaDeckDist(isl, { x: p.x, z: p.y }), `seed ${seed} ${t}`).toBeGreaterThan(1);
        }
      }
    }
  }, 300_000);
});

describe('TASK-671 determinism', () => {
  it('same seed, same park', () => {
    const a = generateWorld(1001);
    const b = site(1001).w;
    const pick = (w: WorldData) =>
      JSON.stringify(w.fixtures.filter((f) => LUNA_DEFS.has(f.defId) || f.defId === 'ferrisWheel'));
    expect(pick(a)).toBe(pick(b));
    const anchors = (w: WorldData) =>
      JSON.stringify(
        Object.entries(w.islands.find((i) => i.theme === 'marketing')?.anchors ?? {}).filter(
          ([k]) => k.startsWith('luna'),
        ),
      );
    expect(anchors(a)).toBe(anchors(b));
  });
});

const M_MIN = 32;
