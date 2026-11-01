import { describe, expect, it } from 'vitest';
import { RESEARCH_CULTURE_SITES as CS } from '../content/cultures/research.ts';
import { HARBOURS } from '../content/harbours.ts';
import { RESEARCH_HARBOUR as R } from '../content/themes/research-harbour.ts';
import { RESEARCH_HARBOUR_SITE as K } from '../content/themes/research-harbour-site.ts';
import { RESEARCH_M31 } from '../content/themes/research-m31.ts';
import { DOCK } from '../content/settlements.ts';
import { anchorPoints } from './gen/plans/research-anchors.ts';
import { RUIN_KINDS } from './gen/plans/research-harbour.ts';
import {
  generateWorld,
  heightAt,
  sampleGrid,
  type FixtureData,
  type WorldData,
  type XZ,
} from './index.ts';

/** Research Tide-Lab kit on its anchors (TASK-534, D-118) — 30 seeds + the default. */
const SEEDS = [1001, ...Array.from({ length: 30 }, (_, k) => 1000 + k * 263)];
const P = HARBOURS.research as NonNullable<typeof HARBOURS.research>;
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) {
    w = generateWorld(seed);
    cache.set(seed, w);
  }
  return w;
};

function site(seed: number) {
  const w = world(seed);
  const isl = w.islands.find((i) => i.theme === 'research');
  if (!isl) throw new Error(`seed ${seed}: no Research island`);
  const fx = w.fixtures.filter((f) => f.islandId === isl.id);
  const at = (p: XZ, def: string, variant?: number): FixtureData | undefined =>
    fx.find(
      (f) =>
        f.defId === def &&
        (variant === undefined || f.variant === variant) &&
        Math.hypot(f.x - p.x, f.z - p.z) < 0.01,
    );
  return { w, isl, A: isl.anchors, fx, at };
}

describe('Research harbour kit (TASK-534)', () => {
  it('every seed places the whole shared kit on its anchors', { timeout: 60_000 }, () => {
    for (const seed of SEEDS) {
      const { A, at } = site(seed);
      const m = `seed ${seed}`;
      expect(at(A.harbourLight, 'lighthouse', P.kit.light), `${m} light`).toBeDefined();
      expect(at(A.harbourShelter, 'marketStall', P.kit.shelter), `${m} shelter`).toBeDefined();
      expect(at(A.harbourBooth, 'dock', P.kit.booth), `${m} booth`).toBeDefined();
      expect(at(A.harbourBoard, 'pierSignpost', P.kit.board), `${m} board`).toBeDefined();
    }
  });

  it('the kiosks stand on level pads', () => {
    for (const seed of SEEDS) {
      const { w, A } = site(seed);
      for (const [key, k] of [
        ['harbourShelter', P.kiosks.shelter],
        ['harbourBooth', P.kiosks.booth],
        ['harbourBoard', P.kiosks.board],
      ] as const) {
        const a = A[key];
        const c = Math.cos(a.rotY);
        const s = Math.sin(a.rotY);
        const ys: number[] = [];
        for (const u of [-1, 1])
          for (const v of [-1, 1]) {
            const du = (u * k.size[1]) / 2;
            const dv = (v * k.size[0]) / 2;
            ys.push(heightAt(w.height, a.x + c * du - s * dv, a.z + s * du + c * dv));
          }
        const relief = Math.max(...ys) - Math.min(...ys);
        expect(relief, `seed ${seed} ${key} relief`).toBeLessThan(0.7);
        expect(Math.min(...ys), `seed ${seed} ${key} dry`).toBeGreaterThan(0);
      }
    }
  });

  it('the T crossbar is laid at harbourPier1, wide × deep as published', () => {
    for (const seed of SEEDS) {
      const { A, fx } = site(seed);
      const end = A.harbourPier1;
      const u = { x: Math.cos(end.rotY), z: Math.sin(end.rotY) };
      const lift = P.kit.head.lift;
      const pieces = fx
        .filter((f) => f.defId === 'dock' && f.y === lift)
        .map((f) => {
          const dx = f.x - end.x;
          const dz = f.z - end.z;
          return { along: dx * u.x + dz * u.z, across: -dx * u.z + dz * u.x };
        });
      const { w: W, d: D } = P.pier.head;
      expect(pieces.length, `seed ${seed} pieces`).toBe(
        Math.round(W / DOCK.segment) * Math.round(D / P.kit.head.plank),
      );
      for (const q of pieces) {
        expect(Math.abs(q.across), `seed ${seed} across`).toBeLessThanOrEqual(W / 2);
        expect(Math.abs(q.along), `seed ${seed} along`).toBeLessThanOrEqual(D / 2);
      }
    }
  });

  it('the seal sleeps on the crossbar deck, not inside it', () => {
    for (const seed of SEEDS) {
      const { w, isl, A } = site(seed);
      const seal = w.storySpots.find((s) => s.islandId === isl.id && s.kind === 'sealPier');
      expect(seal, `seed ${seed}`).toBeDefined();
      const end = A.harbourPier1;
      const u = { x: Math.cos(end.rotY), z: Math.sin(end.rotY) };
      const dx = seal!.pos.x - end.x;
      const dz = seal!.pos.z - end.z;
      expect(Math.abs(dx * u.x + dz * u.z), `seed ${seed} along`).toBeLessThan(P.pier.head.d / 2);
      const across = -dx * u.z + dz * u.x;
      expect(Math.abs(across), `seed ${seed} across`).toBeLessThan(P.pier.head.w / 2);
      expect(Math.abs(across), `seed ${seed} off the pier`).toBeGreaterThan(0.8);
      // away from the basin (the moored boats)
      const b = A.harbourBasin;
      const bx = -(b.x - end.x) * u.z + (b.z - end.z) * u.x;
      expect(across * bx, `seed ${seed} open wing`).toBeLessThan(0);
      expect(seal!.pos.y, `seed ${seed} deck`).toBeCloseTo(CS.seal.deckY, 2);
    }
  });

  it('the city: a piece per slot; tops above the water, the streets under it', () => {
    const spec = RESEARCH_M31.city.spec;
    for (const seed of SEEDS) {
      const { w, isl, fx, at } = site(seed);
      let under = 0;
      let all = 0;
      for (const kind of RUIN_KINDS)
        for (const p of anchorPoints(isl, kind)) {
          const f = at(p, 'sunkenCity');
          expect(f, `seed ${seed} ${kind}`).toBeDefined();
          const sp = spec[f!.variant as number];
          const top = (f!.y as number) + sp.h;
          const m = `seed ${seed} ${kind} v${f!.variant}`;
          all++;
          if (top < 0) under++;
          if (kind === 'ruinTop') expect(top, m).toBeGreaterThan(0.8);
          // (the flat slabs lie under the water, a stair fragment's top step may just break it)
          if (kind === 'ruinPaving') expect(top, m).toBeLessThan(f!.variant === 4 ? -0.5 : 0.25);
          if (kind === 'ruinColumn') expect(top, m).toBeLessThan(0.25);
          // the foot never hangs over the bed
          expect(f!.y as number, m).toBeLessThanOrEqual(heightAt(w.height, f!.x, f!.z) + 0.02);
        }
      expect(fx.filter((f) => f.defId === 'sunkenCity').length, `seed ${seed}`).toBe(all);
      expect(under / all, `seed ${seed} under water`).toBeGreaterThan(0.5);
    }
  });

  it('the lab stands on its anchor facing its pier, the pier planks level with the deck', () => {
    for (const seed of SEEDS) {
      const { A, fx, at } = site(seed);
      const lab = at(A.tideLab, 'tideLab');
      expect(lab, `seed ${seed}`).toBeDefined();
      // local +z = the pier side: toward the shore, against the anchor's sea heading
      expect(Math.cos(lab!.rotY - A.tideLab.rotY), `seed ${seed} door`).toBeCloseTo(-1, 5);
      const a = A.tideLabPier0;
      const b = A.tideLabPier1;
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const u = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
      const pier = fx.filter((f) => f.defId === 'dock' && f.scale === K.lab.pierScale);
      expect(pier.length, `seed ${seed} pieces`).toBeGreaterThan(0);
      const piece = DOCK.segment * K.lab.pierScale;
      const ss = pier.map((f) => (f.x - a.x) * u.x + (f.z - a.z) * u.z).sort((p, q) => p - q);
      expect(ss[0] - piece / 2, `seed ${seed} root end`).toBeLessThanOrEqual(0.01);
      expect(ss[ss.length - 1] + piece / 2, `seed ${seed} lab end`).toBeGreaterThanOrEqual(
        L - 0.01,
      );
      for (let k = 1; k < ss.length; k++)
        expect(ss[k] - ss[k - 1], `seed ${seed} gap`).toBeLessThanOrEqual(piece + 1e-6);
      expect(0.7 * K.lab.pierScale).toBeCloseTo(RESEARCH_M31.lab.deck.y, 1);
      expect(at(A.tideGauge, 'tideGauge', K.gauge.variant), `seed ${seed} gauge`).toBeDefined();
    }
  });

  it('the sub has a water way from its mooring round the arm tip to the dive point', () => {
    for (const seed of SEEDS) {
      const { w, isl, A } = site(seed);
      const path = anchorPoints(isl, 'subPath');
      const m = `seed ${seed}`;
      expect(path.length, m).toBeGreaterThan(3);
      expect(Math.hypot(path[0].x - A.subMooring.x, path[0].z - A.subMooring.z), m).toBeLessThan(
        0.01,
      );
      const end = path[path.length - 1];
      expect(Math.hypot(end.x - A.subDive.x, end.z - A.subDive.z), m).toBeLessThan(0.01);
      const head = A.harbourPier1;
      const ux = Math.cos(head.rotY);
      const uz = Math.sin(head.rotY);
      const sdfAt = (x: number, z: number): number => sampleGrid(w.height, w.shoreSdf, x, z, -999);
      for (let k = 0; k + 1 < path.length; k++) {
        const a = path[k];
        const b = path[k + 1];
        const l = Math.hypot(b.x - a.x, b.z - a.z);
        expect(l, `${m} step`).toBeLessThan(K.subPath.step * 2);
        for (let t = 0; t <= 1; t += 0.25) {
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          expect(heightAt(w.height, x, z), `${m} afloat ${x},${z}`).toBeLessThan(-0.7);
          expect(sdfAt(x, z), `${m} off land`).toBeLessThan(-0.4);
          // off the T crossbar
          const dx = x - head.x;
          const dz = z - head.z;
          const along = Math.abs(dx * ux + dz * uz);
          const across = Math.abs(-dx * uz + dz * ux);
          expect(
            along > P.pier.head.d / 2 + 0.4 || across > P.pier.head.w / 2 + 0.4,
            `${m} T-head`,
          ).toBe(true);
        }
      }
      // past the tip: the arm stands between the far end and the city, never crossed
      const tip = A.harbourArm0;
      const near = Math.min(...path.map((p) => Math.hypot(p.x - tip.x, p.z - tip.z)));
      expect(near, `${m} rounds the tip`).toBeLessThan(R.dive.out[1] + P.arm.mouth);
    }
  });

  it('is deterministic', () => {
    const a = generateWorld(1001);
    const b = generateWorld(1001);
    const isl = a.islands.find((i) => i.theme === 'research') as (typeof a.islands)[number];
    const pick = (w: WorldData): FixtureData[] => w.fixtures.filter((f) => f.islandId === isl.id);
    expect(pick(a)).toEqual(pick(b));
    expect(anchorPoints(a.islands[isl.id], 'subPath')).toEqual(
      anchorPoints(b.islands[isl.id], 'subPath'),
    );
  });
});
