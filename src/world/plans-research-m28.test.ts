import { describe, expect, it } from 'vitest';
import { FIXTURE_RADIUS, FLATTEN } from '../content/settlements.ts';
import { STAIR_FLIGHT } from '../content/stairs.ts';
import { RESEARCH_ANCHORS as R } from '../content/themes/research-anchors.ts';
import { RESEARCH_SITE } from '../content/themes/research.ts';
import { anchorPoints, stairOf } from './gen/plans/research-anchors.ts';
import { discShape, rectShape, shapesOverlap } from './gen/sites.ts';
import { generateWorld, heightAt, sampleGrid, type WorldData, type XZ } from './index.ts';

/** Research M28 anchors (TASK-524, D-105): Star Stair, meridian terrace, rim decks — 30 seeds. */
const SEEDS = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);
const ST = R.stair;
const O = RESEARCH_SITE.observatory;
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) {
    w = generateWorld(seed);
    cache.set(seed, w);
  }
  return w;
};

function research(seed: number) {
  const w = world(seed);
  const isl = w.islands.find((i) => i.theme === 'research');
  if (!isl) throw new Error(`seed ${seed}: no Research island`);
  const fixtures = w.fixtures.filter((f) => f.islandId === isl.id);
  const obs = fixtures.find((f) => f.defId === 'observatory');
  const quad = w.settlements.find((s) => s.islandId === isl.id)?.plaza;
  if (!obs || !quad) throw new Error(`seed ${seed}: no observatory / quad`);
  const H = (p: XZ): number => heightAt(w.height, p.x, p.z);
  const paths = w.paths.filter((p) => p.islandId === isl.id);
  return { w, isl, fixtures, obs, quad, H, paths };
}

const segDist = (p: XZ, a: XZ, b: XZ): number => {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2)) : 0;
  return Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t);
};
const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);
const polyDist = (p: XZ, pts: readonly XZ[]): number =>
  Math.min(...pts.slice(1).map((b, k) => segDist(p, pts[k], b)));
const turn = (a: XZ, b: XZ, c: XZ): number => {
  const h1 = Math.atan2(b.z - a.z, b.x - a.x);
  const h2 = Math.atan2(c.z - b.z, c.x - b.x);
  const d = Math.abs(h1 - h2) % (2 * Math.PI);
  return ((d > Math.PI ? 2 * Math.PI - d : d) * 180) / Math.PI;
};

describe('Research M28 anchors (TASK-524) — 30 seeds', { timeout: 120_000 }, () => {
  it('every seed has the Star Stair (3 legs, 2 switchbacks), 6–8 lamps, the meridian and ≥ 2 decks', () => {
    for (const seed of SEEDS) {
      const { isl } = research(seed);
      const ctx = `seed ${seed}`;
      const stair = stairOf(isl);
      expect(stair.length, `${ctx} stair`).toBe(4);
      expect(turn(stair[0], stair[1], stair[2]), `${ctx} switchback 1`).toBeGreaterThanOrEqual(
        ST.minTurn - 1e-6,
      );
      expect(turn(stair[1], stair[2], stair[3]), `${ctx} switchback 2`).toBeGreaterThanOrEqual(
        ST.minTurn - 1e-6,
      );
      const lamps = anchorPoints(isl, 'starLamp');
      expect(lamps.length, `${ctx} lamps`).toBeGreaterThanOrEqual(ST.lamps[0]);
      expect(lamps.length, `${ctx} lamps`).toBeLessThanOrEqual(ST.lamps[1]);
      expect(isl.anchors.meridian, `${ctx} meridian`).toBeDefined();
      expect(isl.anchors.meridianSize?.x, `${ctx} meridian size`).toBe(R.meridian.r);
      const decks = anchorPoints(isl, 'rimDeck');
      expect(decks.length, `${ctx} decks`).toBeGreaterThanOrEqual(R.deck.count[0]);
      expect(decks.length, `${ctx} decks`).toBeLessThanOrEqual(R.deck.count[1]);
      expect(isl.anchors.rimDeckSize, `${ctx} deck size`).toEqual({
        x: R.deck.w,
        z: R.deck.d,
        rotY: 0,
      });
    }
  });

  it('the stair climbs from the quad terrace to the observatory door at a walkable grade', () => {
    // the stair flights (TASK-485) dress a leg up to their last rise over a 2 u run
    const flight = STAIR_FLIGHT.rises[STAIR_FLIGHT.rises.length - 1] / STAIR_FLIGHT.run;
    for (const seed of SEEDS) {
      const { isl, obs, quad, H } = research(seed);
      const ctx = `seed ${seed}`;
      const st = stairOf(isl);
      const foot = st[0];
      const top = st[3];
      const len = st.slice(1).reduce((s, p, k) => s + dist(st[k], p), 0);
      expect(len, `${ctx} length`).toBeGreaterThanOrEqual(ST.length[0]);
      expect(len, `${ctx} length`).toBeLessThanOrEqual(ST.length[1]);
      // the top landing on the summit pad before the door, level with the dome's floor
      expect(dist(top, obs), `${ctx} top`).toBeGreaterThanOrEqual(ST.top[0] - 1e-6);
      expect(dist(top, obs), `${ctx} top`).toBeLessThanOrEqual(ST.top[1] + 1e-6);
      expect(H(obs) - H(top), `${ctx} top level`).toBeLessThan(0.8);
      // the foot on the terrace lawn round the quad, near its level
      const quadCore = RESEARCH_SITE.quad.radius + FLATTEN.discMargin;
      expect(dist(foot, quad), `${ctx} foot`).toBeLessThanOrEqual(quadCore + ST.footReach + 1e-6);
      expect(H(foot) - H(quad), `${ctx} foot level`).toBeLessThan(ST.footAbove + 1);
      // the grade line and every 2 u pitch on the final (carved) ground
      expect((H(top) - H(foot)) / len, `${ctx} grade`).toBeLessThanOrEqual(ST.maxGrade);
      for (let k = 0; k + 1 < st.length; k++) {
        const a = st[k];
        const b = st[k + 1];
        const l = dist(a, b);
        const n = Math.ceil(l / 0.5);
        const ys: number[] = [];
        for (let i = 0; i <= n; i++)
          ys.push(H({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n }));
        for (let i = 4; i < ys.length; i++)
          expect(Math.abs(ys[i] - ys[i - 4]) / ((4 * l) / n), `${ctx} leg ${k} pitch`).toBeLessThan(
            flight + 0.3,
          );
        expect(st[k].y, `${ctx} vertex y`).toBeCloseTo(H(a), 5);
      }
      // the summit is the crag: ≥ 6 u over the quad
      expect(H(obs) - H(quad), `${ctx} crag`).toBeGreaterThan(6);
    }
  });

  it('lamps stand on the stair every ≈ lampStep u; the stair is clear of every fixture and footpath', () => {
    for (const seed of SEEDS) {
      const { isl, fixtures, obs, quad, H, paths } = research(seed);
      const ctx = `seed ${seed}`;
      const st = stairOf(isl);
      const lamps = anchorPoints(isl, 'starLamp');
      for (const l of lamps) {
        expect(polyDist(l, st), `${ctx} lamp on the stair`).toBeLessThan(1e-6);
        expect(l.y, `${ctx} lamp y`).toBeCloseTo(H(l), 5);
      }
      for (let k = 1; k < lamps.length; k++)
        expect(dist(lamps[k], lamps[k - 1]), `${ctx} lamp spacing`).toBeLessThan(ST.lampStep * 1.6);
      for (const f of fixtures) {
        if (f.defId === 'observatory') continue;
        const r = FIXTURE_RADIUS[f.defId] ?? 0.5;
        expect(polyDist(f, st) - r, `${ctx} ${f.defId} on the stair`).toBeGreaterThan(ST.halfWidth);
      }
      // footpaths keep off the legs, but where the network meets the foot and the top (the
      // observatory door's own walk ends at the landing: the stair takes it over)
      const door = {
        x: obs.x + ((quad.x - obs.x) / dist(obs, quad)) * ST.landing.at,
        z: obs.z + ((quad.z - obs.z) / dist(obs, quad)) * ST.landing.at,
      };
      for (const p of paths) {
        if (p.points.some((q) => dist(q, door) <= ST.landing.r + ST.join)) continue;
        for (const q of p.points) {
          if (dist(q, st[0]) <= ST.join + ST.pathGap || dist(q, st[3]) <= ST.join + ST.pathGap)
            continue;
          expect(polyDist(q, st), `${ctx} footpath on the stair`).toBeGreaterThanOrEqual(
            ST.pathGap - 0.5,
          );
        }
      }
    }
  });

  it('the meridian disc is flat, its own, beside the crag and off the stair', () => {
    for (const seed of SEEDS) {
      const { isl, fixtures, obs, H } = research(seed);
      const ctx = `seed ${seed}`;
      const m = isl.anchors.meridian;
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = 0; k < 16; k++)
        for (const s of [0, 0.5, 1]) {
          const a = (k / 16) * Math.PI * 2;
          const y = H({
            x: m.x + Math.cos(a) * R.meridian.r * 0.9 * s,
            z: m.z + Math.sin(a) * R.meridian.r * 0.9 * s,
          });
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
      expect(hi - lo, `${ctx} flat dial`).toBeLessThan(0.15);
      expect(m.y, `${ctx} meridian y`).toBeCloseTo(H(m), 5);
      expect(m.rotY, `${ctx} noon side`).toBeCloseTo((R.southDeg * Math.PI) / 180, 6);
      // beside the summit, off its pad core
      const d = dist(m, obs);
      expect(d, `${ctx} off the summit core`).toBeGreaterThanOrEqual(
        O.pad + O.padMargin + R.meridian.r,
      );
      expect(d, `${ctx} beside the summit`).toBeLessThan(16);
      // nothing stands on the dial (and the noon sun, ≈ 86° high, stays on the noon line)
      const disc = discShape(m.x, m.z, R.meridian.r);
      for (const f of fixtures)
        expect(
          shapesOverlap(disc, discShape(f.x, f.z, FIXTURE_RADIUS[f.defId] ?? 0.5), 0),
          `${ctx} ${f.defId} on the dial`,
        ).toBe(false);
      expect(polyDist(m, stairOf(isl)), `${ctx} off the stair`).toBeGreaterThan(R.meridian.r);
    }
  });

  it('the rim decks stand on the earth-wall lip facing the sea, level, clear and apart', () => {
    for (const seed of SEEDS) {
      const { w, isl, fixtures, H, paths } = research(seed);
      const ctx = `seed ${seed}`;
      const decks = anchorPoints(isl, 'rimDeck');
      for (const d of decks) {
        const c = Math.cos(d.rotY);
        const s = Math.sin(d.rotY);
        const ys = [
          [0, 0],
          [1, 1.5],
          [1, -1.5],
          [-1, 1.5],
          [-1, -1.5],
        ].map(([u, v]) => H({ x: d.x + c * u - s * v, z: d.z + s * u + c * v }));
        expect(Math.max(...ys) - Math.min(...ys), `${ctx} deck level`).toBeLessThanOrEqual(
          R.deck.settleRelief + 1e-6,
        );
        expect(d.y, `${ctx} deck y`).toBeCloseTo(H(d), 5);
        // on the lip: the shore is out along rotY, the ground falls off past the deck
        const sd = (x: number, z: number): number => sampleGrid(w.height, w.shoreSdf, x, z, -99);
        expect(sd(d.x, d.z) - sd(d.x + c, d.z + s), `${ctx} faces the sea`).toBeGreaterThan(0.5);
        expect(H(d) - H({ x: d.x + c * 4, z: d.z + s * 4 }), `${ctx} on an edge`).toBeGreaterThan(
          0.2,
        );
        expect(sd(d.x, d.z), `${ctx} on land`).toBeGreaterThan(R.deck.topUp.shore[0] - 0.5);
        // (footprint discs at 80 %: the fixture obstacles are their own shapes)
        const rect = rectShape(d.x, d.z, d.rotY, R.deck.w, R.deck.d);
        for (const f of fixtures)
          expect(
            shapesOverlap(rect, discShape(f.x, f.z, (FIXTURE_RADIUS[f.defId] ?? 0.5) * 0.8), 0),
            `${ctx} ${f.defId} on a deck`,
          ).toBe(false);
        for (const p of paths)
          for (const q of p.points)
            expect(dist(q, d), `${ctx} footpath on a deck`).toBeGreaterThan(R.deck.pathGap);
        for (const e of decks)
          if (e !== d)
            expect(dist(e, d), `${ctx} decks apart`).toBeGreaterThanOrEqual(R.deck.topUp.apart);
      }
    }
  });

  it('the big dish left the summit for the headland (P2: one vertical on the crag)', () => {
    let onHead = 0;
    for (const seed of SEEDS) {
      const { isl, fixtures } = research(seed);
      const dish = fixtures.find((f) => f.defId === 'radioDish' && (f.variant ?? 0) === 0);
      if (!dish) continue;
      const s = isl.anchors.summit;
      expect(dist(dish, s), `seed ${seed} dish off the summit`).toBeGreaterThan(10);
      if (dist(dish, isl.anchors.headland) < 16) onHead++;
    }
    expect(onHead / SEEDS.length, 'big dish on the headland').toBeGreaterThanOrEqual(0.85);
  });
});
