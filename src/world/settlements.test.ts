import { perfLimit } from '../test/perf.ts';
import { describe, expect, it } from 'vitest';
import { DOCK, LANDMARKS, LOT_ROOFS, OUTPOSTS, VILLAGE } from '../content/settlements.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import { FIELDS } from '../content/palette.ts';
import {
  generateWorld,
  heightAt,
  sampleGrid,
  zoneAt,
  Zone,
  type WorldData,
  type XZ,
} from './index.ts';
import { PropFlag } from './prop-store.ts';
import {
  discShape,
  lotRoof,
  lotShape,
  rectShape,
  roofNeighbours,
  shapeCorners,
  shapeDist,
  shapesOverlap,
} from './gen/settlements.ts';

// Tests measure wall time; generation itself never reads a clock.
// eslint-disable-next-line no-restricted-properties
const now = (): number => performance.now();

const SEEDS = Array.from({ length: 20 }, (_, k) => 1000 + k * 263);
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) {
    w = generateWorld(seed, { now });
    cache.set(seed, w);
  }
  return w;
};

/** BFS over the path graph from `start`. */
function reachable(w: WorldData, start: number): Uint8Array {
  const n = w.pathGraph.nodes.length / 2;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const e = w.pathGraph.edges;
  for (let i = 0; i < e.length; i += 2) {
    adj[e[i]].push(e[i + 1]);
    adj[e[i + 1]].push(e[i]);
  }
  const seen = new Uint8Array(n);
  if (start < 0) return seen;
  const q = [start];
  seen[start] = 1;
  while (q.length > 0) {
    const c = q.pop() as number;
    for (const m of adj[c])
      if (!seen[m]) {
        seen[m] = 1;
        q.push(m);
      }
  }
  return seen;
}

const dockEnd = (d: { x: number; z: number; rotY: number; segments: number }): XZ => ({
  x: d.x + Math.cos(d.rotY) * d.segments * 2,
  z: d.z + Math.sin(d.rotY) * d.segments * 2,
});

describe('settlements — 20-seed sweep', () => {
  it(
    'every lot sits on flattened ground: 4 corners within 0.25 u, ≥ 0.3 u above sea',
    { timeout: 30_000 },
    () => {
      let lots = 0;
      let worst = 0;
      for (const seed of SEEDS) {
        const w = world(seed);
        for (const l of w.lots) {
          const ctx = `seed ${seed} ${l.defId} @${l.x.toFixed(1)},${l.z.toFixed(1)}`;
          if (l.kind === 'hut') {
            expect(heightAt(w.height, l.x, l.z), ctx).toBeLessThan(-0.3);
            continue;
          }
          lots++;
          const yc = heightAt(w.height, l.x, l.z);
          for (const c of shapeCorners(lotShape(l))) {
            const y = heightAt(w.height, c.x, c.z);
            worst = Math.max(worst, Math.abs(y - yc));
            expect(Math.abs(y - yc), ctx).toBeLessThanOrEqual(0.25);
            expect(y, ctx).toBeGreaterThanOrEqual(0.3);
          }
        }
      }
      console.info(`flattened lots: ${lots}, worst corner deviation ${worst.toFixed(3)} u`);
      expect(lots).toBeGreaterThan(20 * 12);
    },
  );

  it('every lot is reachable from its settlement hub through the path graph', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      for (const s of w.settlements) {
        const ctx = `seed ${seed} ${w.islands[s.islandId].archetype}`;
        expect(s.hub.node, ctx).toBeGreaterThanOrEqual(0);
        const seen = reachable(w, s.hub.node);
        for (const li of s.lots) {
          const l = w.lots[li];
          expect(l.node, `${ctx} ${l.defId}`).toBeGreaterThanOrEqual(0);
          expect(seen[l.node], `${ctx} ${l.defId} unreachable`).toBe(1);
        }
        for (const di of s.docks)
          if (w.docks[di].node >= 0) expect(seen[w.docks[di].node], `${ctx} dock`).toBe(1);
      }
      // every lot belongs to exactly one settlement
      const owned = w.settlements.flatMap((s) => s.lots).sort((a, b) => a - b);
      expect(owned).toEqual(w.lots.map((_, i) => i));
    }
  });

  it('Hearthholm: plaza, 10–16 cottages, stalls, well, tower, stilt huts, clocktower, dock with boats', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const hh = w.islands.find((i) => i.archetype === 'hearthholm');
      const s = w.settlements.find((x) => x.islandId === hh?.id);
      const ctx = `seed ${seed}`;
      expect(s?.kind, ctx).toBe('village');
      if (!s || !hh) continue;
      expect(s.plaza, ctx).not.toBeNull();
      if (s.plaza) expect(zoneAt(w.height, w.zone, s.plaza.x, s.plaza.z), ctx).toBe(Zone.plaza);
      const count = (def: string): number => s.lots.filter((i) => w.lots[i].defId === def).length;
      expect(count('cottage'), ctx).toBeGreaterThanOrEqual(10);
      expect(count('cottage'), ctx).toBeLessThanOrEqual(16);
      expect(count('towerHouse'), ctx).toBe(1);
      expect(count('marketStall'), ctx).toBeGreaterThanOrEqual(1);
      expect(count('stiltHut'), ctx).toBeGreaterThanOrEqual(1);
      expect(w.fixtures.filter((f) => f.defId === 'well' && f.islandId === hh.id).length).toBe(1);
      expect(
        s.landmarks.map((i) => w.landmarks[i].kind),
        ctx,
      ).toContain('clocktower');
      expect(s.docks.length, ctx).toBe(1);
      const boats = w.moorings.filter((m) => m.dock === s.docks[0]);
      expect(boats.filter((b) => b.defId === 'rowboat').length, ctx).toBeGreaterThanOrEqual(3);
      expect(boats.filter((b) => b.defId === 'sailboat').length, ctx).toBeGreaterThanOrEqual(1);
      for (const b of boats)
        expect(heightAt(w.height, b.x, b.z), ctx).toBeLessThanOrEqual(
          b.defId === 'rowboat' ? -0.8 : -1.5,
        );
    }
  });

  it('archetype landmarks are present', () => {
    const want: Record<string, string[]> = {
      hearthholm: ['clocktower'],
      beaconrock: ['lighthouse'],
      millbrook: ['windmill', 'windmill'],
      emberpeak: ['volcanoCrater', 'hotSpring'],
      palmlagoon: ['sunkenShip'],
      mossgrove: ['giantTree'],
      lonelypalm: ['lonelyPalm'],
    };
    for (const seed of SEEDS) {
      const w = world(seed);
      for (const isl of w.islands) {
        const kinds = w.landmarks.filter((l) => l.islandId === isl.id).map((l) => l.kind);
        for (const k of new Set(want[isl.archetype]))
          expect(
            kinds.filter((x) => x === k).length,
            `seed ${seed} ${isl.archetype} ${k}`,
          ).toBeGreaterThanOrEqual(want[isl.archetype].filter((x) => x === k).length);
      }
    }
  });

  it('every dock ends in water ≥ 2 u deep and starts at the shore', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      for (const d of w.docks) {
        n++;
        const e = dockEnd(d);
        expect(heightAt(w.height, e.x, e.z), `seed ${seed} dock ${n}`).toBeLessThanOrEqual(-2);
        expect(Math.abs(sampleGrid(w.height, w.shoreSdf, d.x, d.z, -99))).toBeLessThan(2.5);
        for (let k = 1; k <= d.segments; k++) {
          const y = heightAt(
            w.height,
            d.x + Math.cos(d.rotY) * 2 * k,
            d.z + Math.sin(d.rotY) * 2 * k,
          );
          expect(y, `seed ${seed} dock over land`).toBeLessThan(0);
        }
      }
    }
    expect(n).toBeGreaterThanOrEqual(40);
  });

  it('D8: piers reach DOCK.endDepth; Hearthholm piers end past the turquoise band, away from the shore', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      for (const d of w.docks) {
        const isl = w.islands[d.islandId];
        const want = isl.archetype === 'palmlagoon' ? DOCK.lagoonEndDepth : DOCK.endDepth;
        const e = dockEnd(d);
        const ctx = `seed ${seed} ${isl.archetype} dock`;
        expect(heightAt(w.height, e.x, e.z), ctx).toBeLessThanOrEqual(-want + 1e-3);
        if (isl.archetype === 'hearthholm') {
          n++;
          expect([Zone.mid, Zone.deep], ctx).toContain(zoneAt(w.height, w.zone, e.x, e.z));
        }
        // never runs along the shore: shore distance grows with the pier
        for (let k = 1; k <= d.segments; k++) {
          const t = DOCK.segment * k;
          const s = sampleGrid(
            w.height,
            w.shoreSdf,
            d.x + Math.cos(d.rotY) * t,
            d.z + Math.sin(d.rotY) * t,
            -99,
          );
          expect(-s, `${ctx} segment ${k}`).toBeGreaterThanOrEqual(
            DOCK.awayRate * t - DOCK.awaySlack - 1e-3,
          );
        }
      }
    }
    expect(n).toBe(SEEDS.length);
  });

  it('D8: stilt huts never overlap, keep VILLAGE.stiltSpacing apart and clear of piers', () => {
    let huts = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const hs = w.lots.filter((l) => l.kind === 'hut');
      huts += hs.length;
      for (let a = 0; a < hs.length; a++) {
        const ctx = `seed ${seed} hut @${hs[a].x.toFixed(1)},${hs[a].z.toFixed(1)}`;
        for (let b = a + 1; b < hs.length; b++) {
          expect(shapesOverlap(lotShape(hs[a]), lotShape(hs[b]), 2), ctx).toBe(false);
          expect(Math.hypot(hs[a].x - hs[b].x, hs[a].z - hs[b].z), ctx).toBeGreaterThanOrEqual(
            VILLAGE.stiltSpacing,
          );
        }
        for (const d of w.docks) {
          if (d.islandId !== hs[a].islandId) continue;
          const L = d.segments * DOCK.segment;
          const pier = rectShape(
            d.x + (Math.cos(d.rotY) * L) / 2,
            d.z + (Math.sin(d.rotY) * L) / 2,
            d.rotY,
            0,
            L,
          );
          expect(shapeDist(pier, hs[a].x, hs[a].z), ctx).toBeGreaterThanOrEqual(
            VILLAGE.stiltDockClear - 1e-3,
          );
        }
      }
    }
    expect(huts).toBeGreaterThanOrEqual(SEEDS.length);
  });

  it('D9: Hearthholm is one landmass (no stray islet in the bay)', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const hh = w.islands.find((i) => i.archetype === 'hearthholm');
      if (!hh) continue;
      const n = w.height.n;
      const seen = new Uint8Array(n * n);
      let parts = 0;
      for (let i0 = 0; i0 < n * n; i0++) {
        if (seen[i0] || w.islandMap[i0] !== hh.id + 1 || w.height.data[i0] <= 0) continue;
        parts++;
        const st = [i0];
        seen[i0] = 1;
        while (st.length > 0) {
          const c = st.pop() as number;
          const x = c % n;
          for (const j of [x > 0 ? c - 1 : -1, x < n - 1 ? c + 1 : -1, c - n, c + n]) {
            if (j < 0 || j >= n * n || seen[j] || w.height.data[j] <= 0) continue;
            seen[j] = 1;
            st.push(j);
          }
        }
      }
      expect(parts, `seed ${seed}`).toBe(1);
    }
  });

  it('D12: neighbouring lots never share a roof colour; variants match the prop defs', () => {
    for (const [def, roofs] of Object.entries(LOT_ROOFS))
      expect(roofs.length, def).toBe(PROP_DEFS[PROP_DEF_INDEX[def]].variants);
    let pairs = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const nb = roofNeighbours(w.lots);
      w.lots.forEach((l, a) => {
        expect(l.variant).toBeLessThan(PROP_DEFS[PROP_DEF_INDEX[l.defId]].variants);
        for (const b of nb[a]) {
          if (b < a) continue;
          pairs++;
          expect(lotRoof(w.lots[b]), `seed ${seed} lots ${a}/${b}`).not.toBe(lotRoof(l));
        }
      });
    }
    expect(pairs).toBeGreaterThan(SEEDS.length * 5);
  });

  it('D11: Millbrook fields show ≥ 4 colours; fences run along field-patch edges', () => {
    let islands = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const mb = w.islands.find((i) => i.archetype === 'millbrook');
      if (!mb) continue;
      islands++;
      const hues = new Set<number>();
      for (let i = 0; i < w.zone.length; i++) {
        if (w.islandMap[i] !== mb.id + 1) continue;
        if (w.zone[i] === Zone.field) {
          expect(w.fieldColor[i], `seed ${seed}`).toBeGreaterThan(0);
          expect(w.fieldColor[i]).toBeLessThanOrEqual(FIELDS.length);
          hues.add(w.fieldColor[i]);
        } else expect(w.fieldColor[i]).toBe(0);
      }
      expect(hues.size, `seed ${seed} field hues`).toBeGreaterThanOrEqual(4);
      const rects = w.fields
        .filter((f) => f.islandId === mb.id)
        .map((f) => rectShape(f.x, f.z, f.rotY, f.w, f.d));
      const fences = w.fences.filter((f) => f.islandId === mb.id);
      expect(fences.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const f of fences) {
        expect(f.points.length, `seed ${seed} fence run`).toBeGreaterThanOrEqual(
          OUTPOSTS.fenceMinRun,
        );
        for (const p of f.points) {
          const edge = Math.min(...rects.map((r) => Math.abs(shapeDist(r, p.x, p.z))));
          expect(edge, `seed ${seed} fence post off a patch edge`).toBeLessThan(0.05);
        }
      }
    }
    expect(islands).toBeGreaterThan(5);
  });

  it('boat routes: 2–4 closed loops, every sample ≥ 1.5 u deep and ≥ 2 u from land, docks visited', () => {
    let samples = 0;
    let visited = 0;
    let docks = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      expect(w.boatRoutes.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(w.boatRoutes.length, `seed ${seed}`).toBeLessThanOrEqual(4);
      const seen = new Set<number>();
      for (const r of w.boatRoutes) {
        expect(r.closed).toBe(true);
        const pts = r.points;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(2.6);
          for (const t of [0, 0.5]) {
            const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
            samples++;
            const ctx = `seed ${seed} route sample ${p.x.toFixed(1)},${p.z.toFixed(1)}`;
            expect(heightAt(w.height, p.x, p.z), ctx).toBeLessThanOrEqual(-1.5);
            expect(sampleGrid(w.height, w.shoreSdf, p.x, p.z, -99), ctx).toBeLessThanOrEqual(-2);
          }
        }
        for (const di of r.stops ?? []) {
          const e = dockEnd(w.docks[di]);
          const near = Math.min(...pts.map((p) => Math.hypot(p.x - e.x, p.z - e.z)));
          expect(near, `seed ${seed} stop ${di}`).toBeLessThanOrEqual(6);
          seen.add(di);
        }
      }
      docks += w.docks.length;
      visited += seen.size;
    }
    console.info(`route samples checked: ${samples}; docks on a route: ${visited}/${docks}`);
    expect(visited / docks).toBeGreaterThan(0.75);
  });

  it('no lot overlaps another lot or a landmark', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const shapes = w.lots.map(lotShape);
      for (let a = 0; a < shapes.length; a++) {
        for (let b = a + 1; b < shapes.length; b++)
          expect(shapesOverlap(shapes[a], shapes[b], 0), `seed ${seed} lots ${a}/${b}`).toBe(false);
        for (const lm of w.landmarks) {
          const r = LANDMARKS[lm.kind]?.radius;
          if (!r || lm.islandId !== w.lots[a].islandId) continue;
          expect(
            shapesOverlap(shapes[a], discShape(lm.x, lm.z, r), 0),
            `seed ${seed} lot ${a} × ${lm.kind}`,
          ).toBe(false);
        }
      }
    }
  });

  it('scatter avoids lots, plaza and paths; Lonely Palm palm is a landmark', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const w = world(seed);
      const p = w.props;
      const shapes = w.lots.filter((l) => l.kind !== 'hut').map(lotShape);
      for (let i = 0; i < p.count; i++) {
        const z = zoneAt(w.height, w.zone, p.x[i], p.z[i]);
        expect(z === Zone.path || z === Zone.plaza, `seed ${seed} prop on path/plaza`).toBe(false);
        const r =
          (p.flags[i] & PropFlag.groundCover) !== 0 ? 0 : PROP_DEFS[p.defId[i]].footprint * 0.5;
        for (const sh of shapes)
          expect(shapeDist(sh, p.x[i], p.z[i]), `seed ${seed} prop in lot`).toBeGreaterThan(r);
      }
      const lp = w.islands.find((i) => i.archetype === 'lonelypalm');
      if (lp) {
        let palms = 0;
        for (let i = 0; i < p.count; i++)
          if (p.islandId[i] === lp.id && PROP_DEFS[p.defId[i]].id === 'palm') palms++;
        expect(palms).toBe(0);
        expect(w.landmarks.some((l) => l.kind === 'lonelyPalm' && l.islandId === lp.id)).toBe(true);
      }
    }
  });

  it('paths: Zone.path along footpaths; land mask unchanged by flattening and carving', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const w = world(seed);
      let onPath = 0;
      let total = 0;
      for (const pl of w.paths) {
        if (pl.kind === 'boardwalk') continue;
        for (const q of pl.points) {
          total++;
          const z = zoneAt(w.height, w.zone, q.x, q.z);
          if (z === Zone.path || z === Zone.plaza) onPath++;
        }
      }
      expect(onPath / total, `seed ${seed}`).toBeGreaterThan(0.85);
      for (let i = 0; i < w.shoreSdf.length; i++)
        if (w.height.data[i] > 0 !== w.shoreSdf[i] > 0)
          expect.fail(`seed ${seed} land mask changed at ${i}`);
      expect(Math.max(...w.pathGraph.edges)).toBeLessThan(w.pathGraph.nodes.length / 2);
    }
  });

  it('deterministic: same seed → identical sites, routes and props', () => {
    const a = generateWorld(2024);
    const b = generateWorld(2024);
    expect(a.hashes.sites).toBe(b.hashes.sites);
    expect(a.hashes.routes).toBe(b.hashes.routes);
    expect(a.hashes.props).toBe(b.hashes.props);
    expect(a.lots).toEqual(b.lots);
    expect(a.boatRoutes).toEqual(b.boatRoutes);
  });

  it('full world generation time (warm, incl. settlements, routes, scatter)', () => {
    generateWorld(7, { now });
    const seeds = [1001, 42, 1002, 2024, 3003];
    // Best of 2 per seed: the limit is about the code, not about vitest's worker contention.
    const runs = seeds.map((s) => {
      const a = generateWorld(s, { now }).timings;
      const b = generateWorld(s, { now }).timings;
      return a.total <= b.total ? a : b;
    });
    console.info(
      `full gen ms (warm) ${seeds.join('/')}: ${runs.map((t) => t.total.toFixed(0)).join(' / ')}`,
    );
    console.info(
      `stage ms sites/routes/props: ${runs.map((t) => `${t.sites.toFixed(0)}/${t.routes.toFixed(0)}/${t.props.toFixed(0)}`).join('  ')}`,
    );
    const sorted = runs.map((t) => t.total).sort((x, y) => x - y);
    expect(sorted[2]).toBeLessThan(perfLimit(400));
  });
});
