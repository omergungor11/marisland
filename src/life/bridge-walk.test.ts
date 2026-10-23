import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import { GLASS_BRIDGE, glassBridgeDeckY } from '../content/props-themes/m20.ts';
import { generateWorld, type WorldData } from '../world/index.ts';
import { createLife } from './index.ts';
import { makeCtx } from './ctx.ts';
import { buildWalkGraph } from './land-world.ts';
import type { Workers } from './workers.ts';

/** Seeds whose Design island holds a glass bridge (1001 and 7 do; checked per seed below). */
const SEEDS = [1001, 7, 42];

const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(seed)));
  return w;
};
const bridgeOf = (w: WorldData) => w.fixtures.find((f) => f.defId === 'glassBridge');

describe('glass bridge walk (TASK-469, hooks.walk)', () => {
  it('a chain of deck nodes follows the arched deck and joins both banks', () => {
    let seen = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const br = bridgeOf(w);
      if (!br) continue;
      seen++;
      const ctx = makeCtx({
        world: w,
        scope: new Scope('bridge'),
        seed,
        quality: 'medium',
        water: { splat: () => undefined },
        counters: { agents: 0 } as never,
        getTier: () => 2,
        cameraPos: new THREE.Vector3(),
      });
      const g = buildWalkGraph(ctx);
      const ux = Math.sin(br.rotY);
      const uz = -Math.cos(br.rotY);
      const deck: { lx: number; i: number }[] = [];
      for (let i = 0; i < g.n; i++) {
        if (Number.isNaN(g.deckY[i])) continue;
        const dx = g.x[i] - br.x;
        const dz = g.z[i] - br.z;
        const lx = dx * ux + dz * uz;
        if (Math.abs(lx) <= GLASS_BRIDGE.length / 2 + 1e-3 && Math.abs(-dx * uz + dz * ux) < 0.05)
          deck.push({ lx, i });
      }
      deck.sort((a, b) => a.lx - b.lx);
      const ctxName = `seed ${seed}`;
      expect(deck.length, ctxName).toBeGreaterThanOrEqual(8);
      // one connected piece, spacing <= 1 u, feet on the deck top (pivot = bank mean) not the creek bed
      const bank =
        (ctx.h(br.x + ux * 3.9, br.z + uz * 3.9) + ctx.h(br.x - ux * 3.9, br.z - uz * 3.9)) / 2;
      for (let k = 0; k < deck.length; k++) {
        expect(g.comp[deck[k].i], ctxName).toBe(g.comp[deck[0].i]);
        expect(g.deckY[deck[k].i], ctxName).toBeCloseTo(bank + glassBridgeDeckY(deck[k].lx), 4);
        expect(g.deckY[deck[k].i], `${ctxName} above the creek`).toBeGreaterThan(0.3);
        if (k > 0) expect(deck[k].lx - deck[k - 1].lx, ctxName).toBeLessThanOrEqual(1);
      }
      const mid = deck.reduce((a, d) => (Math.abs(d.lx) < Math.abs(a.lx) ? d : a));
      expect(g.deckY[mid.i]).toBeGreaterThan(g.deckY[deck[0].i] + 0.3);
      // both ends join land nodes of the same component (the creek between them is sea)
      for (const end of [deck[0].i, deck[deck.length - 1].i]) {
        const land = g.adj[end].filter((j) => Number.isNaN(g.deckY[j]));
        expect(land.length, `${ctxName} bank link`).toBeGreaterThan(0);
        expect(g.comp[land[0]], ctxName).toBe(g.comp[deck[0].i]);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(2);
  });

  it('Design bots cross the creek on the deck, never through the creek bed', () => {
    const seed = 1001;
    const w = world(seed);
    const br = bridgeOf(w)!;
    expect(br).toBeDefined();
    const life = createLife({
      world: w,
      scope: new Scope('bridge-life'),
      seed,
      quality: 'medium',
      water: { splat: () => undefined },
      counters: { agents: 0 } as never,
      getTier: () => 2,
      cameraPos: new THREE.Vector3(br.x, 40, br.z),
      cameraTarget: new THREE.Vector3(br.x, 0, br.z),
    });
    life.onTier(2);
    const wk = life.kinds.workers as Workers;
    const ux = Math.sin(br.rotY);
    const uz = -Math.cos(br.rotY);
    let onSpan = 0;
    let lowest = Infinity;
    let crossed = 0;
    const side = new Map<number, number>();
    for (let s = 0; s < 30 * 120; s++) {
      life.fixedUpdate(FIXED_STEP);
      for (let i = 0; i < wk.capacity; i++) {
        const dx = wk.x[i] - br.x;
        const dz = wk.z[i] - br.z;
        const lx = dx * ux + dz * uz;
        const across = Math.abs(-dx * uz + dz * ux);
        if (Math.abs(lx) < 3.3 && across < 1.2) {
          onSpan++;
          lowest = Math.min(lowest, wk.y[i]);
        }
        if (across < 1.2 && Math.abs(lx) < 8) {
          const sgn = lx < 0 ? -1 : 1;
          const was = side.get(i);
          if (was !== undefined && was !== sgn && Math.abs(lx) > 3.3) crossed++;
          if (Math.abs(lx) > 3.3) side.set(i, sgn);
        }
      }
    }
    expect(onSpan, 'bots on the span').toBeGreaterThan(0);
    expect(crossed, 'bank-to-bank crossings').toBeGreaterThan(0);
    // feet on the deck (>= bank + endY), not in the creek (the bed is at -0.6, the sea at 0)
    expect(lowest).toBeGreaterThan(0.5);
  });
});
