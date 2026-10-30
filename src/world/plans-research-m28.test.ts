import { describe, expect, it } from 'vitest';
import { FIXTURE_RADIUS, FLATTEN } from '../content/settlements.ts';
import { STAIR_FLIGHT } from '../content/stairs.ts';
import { RESEARCH_ANCHORS as R } from '../content/themes/research-anchors.ts';
import { RESEARCH_SITE } from '../content/themes/research.ts';
import { createEnvState, sampleEnv } from '../env/env-state.ts';
import { RESEARCH_M28 } from '../content/themes/research-m28.ts';
import { RESEARCH_M28_SITE } from '../content/themes/research-m28-site.ts';
import { anchorPoints, stairOf } from './gen/plans/research-anchors.ts';
import { isSummitKit } from './gen/plans/research-m28.ts';
import { discShape, rectShape, shapesOverlap } from './gen/sites.ts';
import {
  generateWorld,
  heightAt,
  sampleGrid,
  slopeAtCell,
  Zone,
  type WorldData,
  type XZ,
} from './index.ts';

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
  const all = w.fixtures.filter((f) => f.islandId === isl.id);
  // (the anchors keep off everything but the kit TASK-526 placed on them; the Star Stair is a
  // path of its own)
  const fixtures = all.filter((f) => !isSummitKit(f));
  const kit = all.filter(isSummitKit);
  const obs = fixtures.find((f) => f.defId === 'observatory');
  const quad = w.settlements.find((s) => s.islandId === isl.id)?.plaza;
  if (!obs || !quad) throw new Error(`seed ${seed}: no observatory / quad`);
  const H = (p: XZ): number => heightAt(w.height, p.x, p.z);
  const island = w.paths.filter((p) => p.islandId === isl.id);
  const paths = island.filter((p) => p.kind !== 'stair');
  const stairPath = island.filter((p) => p.kind === 'stair');
  return { w, isl, fixtures, kit, obs, quad, H, paths, stairPath };
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

/** The M28 kit on the anchors (TASK-526, D-107) — the 30 seeds and the shot seed 1001. */
const KIT_SEEDS = [...SEEDS, 1001];
const KS = RESEARCH_M28_SITE;

/** Walk-graph node nearest `p` (and its distance). */
function nodeAt(w: WorldData, p: XZ): { node: number; d: number } {
  const g = w.pathGraph.nodes;
  let node = -1;
  let d = Infinity;
  for (let i = 0; i < g.length / 2; i++) {
    const e = Math.hypot(g[i * 2] - p.x, g[i * 2 + 1] - p.z);
    if (e < d) {
      d = e;
      node = i;
    }
  }
  return { node, d };
}

describe('Research M28 kit on the anchors (TASK-526)', { timeout: 120_000 }, () => {
  it('the big dish stands on every seed (TASK-524 lost it on 1001 / 1263 / 4945)', () => {
    for (const seed of KIT_SEEDS) {
      const { isl, fixtures } = research(seed);
      const dish = fixtures.find((f) => f.defId === 'radioDish' && (f.variant ?? 0) === 0);
      expect(dish, `seed ${seed} big dish`).toBeDefined();
      // (the yard dish keeps the TASK-524 bound; the fallback tiers their own, ≥ 12)
      expect(dist(dish!, isl.anchors.summit), `seed ${seed} dish off the summit`).toBeGreaterThan(
        10,
      );
      expect(dish!.scale ?? 1, `seed ${seed} dish scale`).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('the Star Stair is one stair path over the anchors, joined to the campus walk graph', () => {
    for (const seed of KIT_SEEDS) {
      const { w, isl, stairPath } = research(seed);
      const ctx = `seed ${seed}`;
      expect(stairPath.length, `${ctx} one stair path`).toBe(1);
      const pts = stairPath[0].points;
      const st = stairOf(isl);
      // every anchor vertex is a path point, in order; the legs in ≈ 2 u pieces
      let at = -1;
      for (const v of st) {
        const k = pts.findIndex((q) => dist(q, v) < 1e-6);
        expect(k, `${ctx} vertex on the path`).toBeGreaterThan(at);
        at = k;
      }
      const iFoot = pts.findIndex((q) => dist(q, st[0]) < 1e-6);
      const iTop = pts.findIndex((q) => dist(q, st[3]) < 1e-6);
      for (let k = iFoot; k < iTop; k++)
        expect(dist(pts[k], pts[k + 1]), `${ctx} piece`).toBeLessThanOrEqual(KS.stair.step * 1.5);
      // the foot is linked to the network: the path starts on a node of another path
      expect(iFoot, `${ctx} foot linked`).toBeGreaterThan(0);
      // and the hub reaches the top landing over the graph
      const hub = w.settlements.find((s) => s.islandId === isl.id)!.hub.node;
      const top = nodeAt(w, st[3]);
      expect(top.d, `${ctx} top node`).toBeLessThan(1e-3);
      const n = w.pathGraph.nodes.length / 2;
      const adj: number[][] = Array.from({ length: n }, () => []);
      const e = w.pathGraph.edges;
      for (let i = 0; i < e.length; i += 2) {
        adj[e[i]].push(e[i + 1]);
        adj[e[i + 1]].push(e[i]);
      }
      const seen = new Uint8Array(n);
      const q = [hub];
      seen[hub] = 1;
      while (q.length > 0)
        for (const m of adj[q.pop()!])
          if (!seen[m]) {
            seen[m] = 1;
            q.push(m);
          }
      expect(seen[top.node], `${ctx} hub → top landing`).toBe(1);
    }
  });

  it('every stair piece steeper than the look threshold carries a stone flight', () => {
    const look = STAIR_FLIGHT.byTheme.research;
    const min = STAIR_FLIGHT.looks[look].minGrade ?? STAIR_FLIGHT.minGrade;
    for (const seed of KIT_SEEDS) {
      const { kit, stairPath, H } = research(seed);
      const flights = kit.filter((f) => f.defId === 'stairFlight');
      const pts = stairPath[0].points;
      let crag = 0;
      for (let k = 0; k + 1 < pts.length; k++) {
        const [a, b] = [pts[k], pts[k + 1]];
        const g = Math.abs(H(b) - H(a)) / dist(a, b);
        if (g <= min) continue;
        crag++;
        const lo = H(a) <= H(b) ? a : b;
        const f = flights.find((q) => dist(q, lo) < 1e-6);
        expect(f, `seed ${seed} flight at piece ${k}`).toBeDefined();
        expect(Math.floor((f!.variant ?? 0) / STAIR_FLIGHT.rises.length), 'stone look').toBe(look);
      }
      expect(crag, `seed ${seed} flights up the crag`).toBeGreaterThanOrEqual(5);
    }
  });

  it('6–8 teal lanterns stand beside the flights on the lamp stations (one variant: one group)', () => {
    for (const seed of KIT_SEEDS) {
      const { isl, kit, stairPath, H } = research(seed);
      const ctx = `seed ${seed}`;
      const st = stairOf(isl);
      const lamps = kit.filter((f) => f.defId === 'lanternPost');
      expect(lamps.length, `${ctx} lamps`).toBeGreaterThanOrEqual(6);
      expect(lamps.length, `${ctx} lamps`).toBeLessThanOrEqual(8);
      expect(lamps.length, `${ctx} one per station`).toBe(anchorPoints(isl, 'starLamp').length);
      const half = STAIR_FLIGHT.looks[STAIR_FLIGHT.byTheme.research].width / 2;
      for (const l of lamps) {
        expect(l.variant, `${ctx} teal stair lantern`).toBe(KS.stair.lamp.variant);
        // on the flight's tread edge (inside the 1.5 u flight), never on another leg
        expect(polyDist(l, st), `${ctx} on the stair's edge`).toBeCloseTo(KS.stair.lamp.side, 3);
        expect(KS.stair.lamp.side, 'inside the flight').toBeLessThan(half);
        // level with the treads: each flight runs straight between its path points (the crag
        // face's ground beside the carved line falls away or rises)
        const pts = stairPath[0].points;
        const level = pts.slice(1).some((b, k) => {
          const a = pts[k];
          if (segDist(l, a, b) > KS.stair.lamp.side + 0.05) return false;
          const t = Math.max(
            0,
            Math.min(1, ((l.x - a.x) * (b.x - a.x) + (l.z - a.z) * (b.z - a.z)) / dist(a, b) ** 2),
          );
          return Math.abs(l.y! - (H(a) + (H(b) - H(a)) * t)) < 1e-3;
        });
        expect(l.y, `${ctx} lamp pivot planned`).toBeDefined();
        expect(level, `${ctx} lamp level with the steps beside it`).toBe(true);
      }
    }
  });

  it('the sundial gnomon casts its real 12:00 shadow onto the brass noon line (±3°)', () => {
    const sun = sampleEnv(12, createEnvState()).sunDir;
    const D = RESEARCH_M28.sundial;
    // the content heading is the sim's own (re-derived)
    const shadowDeg = (Math.atan2(-sun.z, -sun.x) * 180) / Math.PI;
    expect(Math.abs(shadowDeg - KS.sundial.noonShadowDeg)).toBeLessThan(0.5);
    for (const seed of KIT_SEEDS) {
      const { isl, kit } = research(seed);
      const ctx = `seed ${seed}`;
      const dials = kit.filter((f) => f.defId === 'sundial');
      expect(dials.length, `${ctx} one dial`).toBe(1);
      const f = dials[0];
      const m = isl.anchors.meridian;
      expect(dist(f, m), `${ctx} on the meridian`).toBeLessThan(1e-6);
      // local +z (blade, XII, noon line) in world: (cos rotY, sin rotY); local +x: (sin, −cos)
      const z = { x: Math.cos(f.rotY), z: Math.sin(f.rotY) };
      const xAxis = { x: Math.sin(f.rotY), z: -Math.cos(f.rotY) };
      const sh = { x: -sun.x, z: -sun.z };
      const off = Math.atan2(sh.x * z.z - sh.z * z.x, sh.x * z.x + sh.z * z.z);
      expect(
        Math.abs((off * 180) / Math.PI),
        `${ctx} shadow along the noon line`,
      ).toBeLessThanOrEqual(3);
      // the gnomon tip's shadow on the line's top lands on the brass strip
      const tipY = D.fieldTop + D.gnomon.height;
      const t = (tipY - D.noon.top) / sun.y;
      const tip = { x: f.x + z.x * D.gnomon.northZ, z: f.z + z.z * D.gnomon.northZ };
      const hit = { x: tip.x - sun.x * t, z: tip.z - sun.z * t };
      const lx = (hit.x - f.x) * xAxis.x + (hit.z - f.z) * xAxis.z;
      const lz = (hit.x - f.x) * z.x + (hit.z - f.z) * z.z;
      expect(Math.abs(lx), `${ctx} shadow on the strip`).toBeLessThanOrEqual(D.noon.width / 2);
      expect(lz, `${ctx} shadow past the blade`).toBeGreaterThanOrEqual(D.gnomon.northZ);
      expect(lz, `${ctx} shadow before XII`).toBeLessThanOrEqual(D.noon.inner);
    }
  });

  it('a rim telescope deck on every deck site, its sea side out', () => {
    for (const seed of KIT_SEEDS) {
      const { isl, kit } = research(seed);
      const ctx = `seed ${seed}`;
      const sites = anchorPoints(isl, 'rimDeck');
      const decks = kit.filter((f) => f.defId === 'tripodTelescope');
      expect(decks.length, `${ctx} decks`).toBe(sites.length);
      for (const d of sites) {
        const f = decks.find((q) => dist(q, d) < 1e-6);
        expect(f, `${ctx} deck on the site`).toBeDefined();
        expect(f!.variant, `${ctx} deck variant`).toBe(KS.deck.variant);
        // local −z (the railed sea side) = the anchor's outward heading
        expect(Math.cos(f!.rotY + Math.PI - d.rotY), `${ctx} faces the sea`).toBeCloseTo(1, 6);
      }
    }
  });

  it('the carved groove up the crag reads as rock / path, not lawn', () => {
    for (const seed of KIT_SEEDS) {
      const { w, isl, H } = research(seed);
      const st = stairOf(isl);
      const h = w.height;
      const lawn = new Set<number>();
      const all = new Set<number>();
      // the crag legs (1, 2): cells within 1.5 u of their centre line, above the foot
      for (const [a, b] of [
        [st[1], st[2]],
        [st[2], st[3]],
      ])
        for (let iz = 0; iz < h.n; iz++) {
          const z = h.originZ + iz * h.cellSize;
          if (Math.abs(z - (a.z + b.z) / 2) > dist(a, b) / 2 + 2) continue;
          for (let ix = 0; ix < h.n; ix++) {
            const x = h.originX + ix * h.cellSize;
            const p = { x, z };
            if (segDist(p, a, b) > 1.5 || H(p) < st[0].y + 1) continue;
            all.add(iz * h.n + ix);
            const zn = w.zone[iz * h.n + ix];
            if (zn === Zone.grass || zn === Zone.meadow) lawn.add(iz * h.n + ix);
          }
        }
      expect(
        lawn.size / Math.max(1, all.size),
        `seed ${seed} lawn in the groove`,
      ).toBeLessThanOrEqual(0.15);
    }
  });

  it('no lawn on the steep crag round the summit; the dial and deck sites keep theirs (TASK-529)', () => {
    const F = KS.stair.cragFoot;
    const soft: number[] = [Zone.grass, Zone.meadow, Zone.field, Zone.forest];
    let dialLawn = 0;
    let dialCells = 0;
    for (const seed of KIT_SEEDS) {
      const { w, isl } = research(seed);
      const st = stairOf(isl);
      const top = st[st.length - 1];
      const h = w.height;
      const n = h.n;
      const steep: string[] = [];
      for (let iz = 1; iz < n - 1; iz++) {
        const z = h.originZ + iz * h.cellSize;
        if (Math.abs(z - top.z) > F.reach) continue;
        for (let ix = 1; ix < n - 1; ix++) {
          const x = h.originX + ix * h.cellSize;
          const i = iz * n + ix;
          if (w.islandMap[i] !== isl.id + 1 || !soft.includes(w.zone[i])) continue;
          if (dist({ x, z }, top) > F.reach) continue;
          // (the dial disc and the decks stand on their own lawn)
          const m = isl.anchors.meridian;
          if (m && dist({ x, z }, m) <= R.meridian.r) continue;
          if (anchorPoints(isl, 'rimDeck').some((d) => dist({ x, z }, d) <= R.deck.w / 2)) continue;
          if (slopeAtCell(h, ix, iz) > F.steep) steep.push(`${x},${z}`);
        }
      }
      expect(steep, `seed ${seed} lawn on the steep crag`).toEqual([]);
      // the dial's own disc keeps its lawn (the pad core is flat: nothing there is steep)
      const m = isl.anchors.meridian;
      if (!m) continue;
      for (let iz = 0; iz < n; iz++)
        for (let ix = 0; ix < n; ix++) {
          const p = { x: h.originX + ix * h.cellSize, z: h.originZ + iz * h.cellSize };
          if (dist(p, m) > R.meridian.r) continue;
          dialCells++;
          if (soft.includes(w.zone[iz * n + ix])) dialLawn++;
        }
    }
    expect(dialLawn / dialCells, 'lawn under the dial discs').toBeGreaterThanOrEqual(0.5);
  });
});
