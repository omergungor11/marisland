import { describe, expect, it } from 'vitest';
import { HARBOURS } from '../content/harbours.ts';
import { DOCK } from '../content/settlements.ts';
import { CARNIVAL_PIER as K } from '../content/themes/marketing-harbour.ts';
import { beaconTracks } from './gen/plans/marketing-anchors.ts';
import { carnivalDeckDist, carnivalKeepOut } from './gen/plans/marketing-harbour.ts';
import { inMarina } from './gen/plans/marketing-marina.ts';
import { generateWorld, heightAt, type WorldData } from './index.ts';

/** TASK-536 (D-126): the Carnival Pier on the Marketing Rock, 30 seeds + the shot seeds. */
const SEEDS = [1001, 2024, ...Array.from({ length: 30 }, (_, k) => 1000 + k * 263)];
const P = HARBOURS.marketing as NonNullable<typeof HARBOURS.marketing>;
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed)));
  return w;
};
const site = (seed: number) => {
  const w = world(seed);
  const isl = w.islands.find((i) => i.theme === 'marketing');
  if (!isl) throw new Error('no Marketing island');
  // (the marina town's pieces have their own test: plans-marketing-marina.test)
  const fx = w.fixtures.filter((f) => f.islandId === isl.id && !inMarina(isl, f));
  return { w, isl, A: isl.anchors, fx, of: (id: string) => fx.filter((f) => f.defId === id) };
};
const near = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

/** Distance from `p` to the segment a-b, xz. */
function segDist(
  p: { x: number; z: number },
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t);
}

describe('TASK-536 Carnival Pier: seed fit', () => {
  it('harbour, boardwalk, wheel, screen and the kiosk fit on every seed', () => {
    for (const seed of SEEDS) {
      const { A, of, w, isl } = site(seed);
      const m = `seed ${seed}`;
      expect(A.harbourPier1, m).toBeDefined();
      expect(A.harbourLight, m).toBeDefined();
      expect(w.docks.find((d) => d.islandId === isl.id)?.segments, m).toBe(P.pier.segments);
      expect(A.carnivalDeck, m).toBeDefined();
      expect(A.carnivalWheel, m).toBeDefined();
      expect(A.carnivalScreen, m).toBeDefined();
      expect(A.carnivalCannon0 && A.carnivalCannon1, m).toBeDefined();
      expect(of('ferrisWheel').length, m).toBe(2);
      expect(of('megaphoneKiosk').length, m).toBe(1);
      expect(A.harbourBooth, m).toBeDefined();
      expect(near(of('megaphoneKiosk')[0], A.harbourBooth), m).toBeLessThan(1e-6);
      expect(A.harbourBoard, m).toBeDefined();
    }
  }, 240_000);

  it('the shelter fits where the cove has room (fallback: no shelter)', () => {
    const fit = SEEDS.filter((s) => site(s).A.harbourShelter);
    // (the Rock's cove is narrow: pinned, so a drop is seen; a missing shelter only loses the bench)
    expect(fit.length).toBeGreaterThanOrEqual(SHELTER_MIN);
    for (const seed of fit) {
      const { A, of } = site(seed);
      expect(of('marketStall').some((f) => near(f, A.harbourShelter) < 1e-6)).toBe(true);
    }
  }, 240_000);
});

describe('TASK-536 Carnival Pier: placement', () => {
  it('the boardwalk stands over water on the final ground', () => {
    for (const seed of SEEDS) {
      const { A, w } = site(seed);
      const c = A.carnivalDeck;
      const s = A.carnivalDeckSize;
      const side = { x: Math.sin(c.rotY), z: -Math.cos(c.rotY) };
      const u = { x: Math.cos(c.rotY), z: Math.sin(c.rotY) };
      for (let a = -0.5; a <= 0.5 + 1e-6; a += 0.1)
        for (let b = -0.5; b <= 0.5 + 1e-6; b += 0.25) {
          const x = c.x + side.x * a * s.x + u.x * b * s.z;
          const z = c.z + side.z * a * s.x + u.z * b * s.z;
          expect(heightAt(w.height, x, z), `seed ${seed}`).toBeLessThan(K.deck.maxGround + 0.05);
        }
    }
  }, 240_000);

  it('wheel, screen, cannons and arches stand at the deck height, the wheel small', () => {
    expect(K.deck.top).toBe(P.kit.deckY);
    for (const seed of SEEDS) {
      const { A, of } = site(seed);
      const y = P.kit.deckY;
      const wheel = of('ferrisWheel').find((f) => near(f, A.carnivalWheel) < 1e-6);
      expect(wheel?.scale).toBe(K.wheel.scale);
      expect(wheel?.y).toBe(y);
      const scr = of('billboardV2').find((f) => near(f, A.carnivalScreen) < 1e-6);
      expect(scr?.variant).toBe(K.screen.variant);
      expect(scr?.y).toBe(y);
      for (const f of of('bunting').filter((b) => b.variant === K.arch.variant))
        expect(f.y).toBe(y);
      expect(of('bunting').filter((b) => b.variant === K.arch.variant).length).toBeGreaterThan(3);
    }
  }, 240_000);

  it('nothing but the kit stands on the boardwalk; pontoon and buoys keep off its front', () => {
    const kit = new Set(['sailboat', 'bunting', 'lanternPost', 'ferrisWheel', 'billboardV2']);
    let pontoons = 0;
    for (const seed of SEEDS) {
      const { isl, fx, A } = site(seed);
      for (const f of fx)
        if (carnivalDeckDist(isl, f) < 0.3 && !kit.has(f.defId))
          expect.fail(`seed ${seed}: ${f.defId} on the boardwalk`);
      const pontoon = (f: { defId: string; variant?: number }): boolean =>
        f.defId === 'sailboat' && f.variant === 5;
      const c = A.harbourPier1;
      const u = { x: Math.cos(c.rotY), z: Math.sin(c.rotY) };
      const berth = A.ferryBerth;
      for (const f of fx) {
        if (pontoon(f)) pontoons++;
        if (!pontoon(f) && f.defId !== 'adBuoy') continue;
        // the ferry's corridor: berth → open sea
        const dx = f.x - berth.x;
        const dz = f.z - berth.z;
        const along = dx * u.x + dz * u.z;
        const across = Math.abs(dx * -u.z + dz * u.x);
        const out = along < -1 || along > P.berth.approach.len || across > P.berth.approach.half;
        expect(out, `seed ${seed}: ${f.defId} in the ferry's approach`).toBe(true);
      }
    }
    // (the pontoon is optional: past the boardwalk's far end when the water is there)
    expect(pontoons).toBeGreaterThanOrEqual(PONTOON_MIN);
  }, 240_000);

  it('the harbour keeps clear of the cable car and ON AIR', () => {
    let min = Infinity;
    for (const seed of SEEDS) {
      const { A, isl, fx } = site(seed);
      const [t0] = beaconTracks(isl);
      const kit = fx.filter(
        (f) =>
          carnivalDeckDist(isl, f) < 0.5 ||
          f.defId === 'confettiCannon' ||
          (f.defId === 'lighthouse' && (f.variant ?? 0) >= 3),
      );
      const arm: { x: number; z: number }[] = [];
      for (let k = 0; A[`harbourArm${k}`]; k++) arm.push(A[`harbourArm${k}`]);
      const pts = [...kit, ...arm, A.harbourPier1, A.ferryBerth];
      for (const p of pts) {
        for (let k = 0; k + 1 < t0.length; k++) min = Math.min(min, segDist(p, t0[k], t0[k + 1]));
        if (A.onAir) min = Math.min(min, near(p, A.onAir));
      }
    }
    expect(min).toBeGreaterThan(CABLE_CLEAR);
  }, 240_000);

  it('boat routes keep off the boardwalk', () => {
    for (const seed of SEEDS) {
      const { isl, w, A } = site(seed);
      for (const r of w.boatRoutes)
        for (let k = 0; k + 1 < r.points.length; k++) {
          const a = r.points[k];
          const b = r.points[k + 1];
          const n = Math.ceil(near(a, b) / 1);
          for (let i = 0; i <= n; i++) {
            const p = { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n };
            expect(carnivalDeckDist(isl, p), `seed ${seed} ${r.kind}`).toBeGreaterThan(0.5);
          }
        }
      expect(carnivalKeepOut([isl]).length).toBeGreaterThan(0);
      expect(A.ferryBerth).toBeDefined();
    }
  }, 240_000);

  it('the pier reaches the ferry: the route stops at the berth', () => {
    for (const seed of SEEDS) {
      const { isl, w, A } = site(seed);
      const di = w.docks.findIndex((d) => d.islandId === isl.id);
      const ferry = w.boatRoutes.find((r) => r.kind === 'ferry' && r.stops?.includes(di));
      expect(ferry, `seed ${seed}`).toBeDefined();
      const best = Math.min(...(ferry?.points ?? []).map((p) => near(p, A.ferryBerth)));
      expect(best, `seed ${seed}`).toBeLessThan(DOCK.basinRadius + 1);
    }
  }, 240_000);
});

describe('TASK-536 determinism', () => {
  it('same seed, same kit', () => {
    const a = generateWorld(1001);
    const b = site(1001).w;
    const pick = (w: WorldData) =>
      JSON.stringify(w.fixtures.filter((f) => f.defId === 'bunting' || f.defId === 'ferrisWheel'));
    expect(pick(a)).toBe(pick(b));
  });
});

const SHELTER_MIN = 28;
const PONTOON_MIN = 30;
const CABLE_CLEAR = 20;
