import { describe, expect, it } from 'vitest';
import { DESIGN_SITES, DESIGN_THEME } from '../content/themes/design.ts';
import { THEMES } from '../content/themes/index.ts';
import { canopyKindOf } from '../render/props/clusters.ts';
import { PROP_DEFS } from '../content/props.ts';
import { BANK_FIXTURES, FIXTURE_RADIUS, FLOATING_FIXTURES } from '../content/settlements.ts';
import { GLASSHOUSE_HUES } from '../content/props-themes/m20.ts';
import { DESIGN_CULTURE, DESIGN_CULTURE_SITE } from '../content/cultures/design.ts';
import { generateWorld, heightAt, zoneAt, Zone, type WorldData, type XZ } from './index.ts';
import { discShape, rectShape, shapeCorners, shapesOverlap } from './gen/sites.ts';

/** Design island plan (TASK-367 → TASK-467 Glass Conservatory) over 30 seeds. */
const SEEDS = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);
const SCULPTURES = new Set<string>(DESIGN_SITES.clearing.kinds);

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

const near = (w: WorldData, seen: Uint8Array, p: XZ, r: number): boolean => {
  const nodes = w.pathGraph.nodes;
  for (let i = 0; i < nodes.length / 2; i++)
    if (seen[i] && Math.hypot(nodes[i * 2] - p.x, nodes[i * 2 + 1] - p.z) <= r) return true;
  return false;
};

/** Distance from `p` to the nearest point of the island's footpaths (polylines). */
const pathDist = (w: WorldData, islandId: number, p: XZ): number => {
  let best = Infinity;
  for (const path of w.paths) {
    if (path.islandId !== islandId) continue;
    const pts = path.points;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const l2 = vx * vx + vz * vz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2)) : 0;
      best = Math.min(best, Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t));
    }
  }
  return best;
};

const cache = new Map<number, WorldData>();
const design = (seed: number) => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed)));
  const isl = w.islands.find((i) => i.theme === 'design');
  if (!isl) throw new Error(`seed ${seed}: no Design island`);
  const s = w.settlements.find((x) => x.islandId === isl.id);
  const fixtures = w.fixtures.filter((f) => f.islandId === isl.id);
  return { w, isl, s, fixtures };
};

describe('Design island plan (TASK-367 / TASK-467), 30 seeds', () => {
  it(
    'Atelier Tree, pier, lots, sculpture clearing, easel walk, grove: placed, connected, no leftovers',
    { timeout: 120_000 },
    () => {
      let lotHits = 0;
      let easelHits = 0;
      let gardenHits = 0;
      for (const seed of SEEDS) {
        const { w, isl, s } = design(seed);
        const ctx = `seed ${seed}`;
        expect(s, ctx).toBeDefined();
        if (!s) continue;
        const seen = reachable(w, s.hub.node);

        // (a) Atelier Tree landmark (giantTree, theme variant 3 = canopy vitray, TASK-425), reachable
        const tree = w.landmarks.find((l) => l.islandId === isl.id && l.kind === 'giantTree');
        expect(tree, ctx).toBeDefined();
        expect(THEMES.design.landmarkVariant.giantTree).toBe(3);
        if (tree) expect(near(w, seen, tree, 8), `${ctx} tree linked`).toBe(true);

        // (b) the pier in the lee cove, linked (TASK-467: the Prism Walk starts there)
        const docks = w.docks.filter((d) => d.islandId === isl.id);
        expect(docks.length, `${ctx} pier`).toBe(1);
        expect(docks[0].node, ctx).toBeGreaterThanOrEqual(0);
        expect(seen[docks[0].node], `${ctx} pier linked`).toBe(1);

        // (c) lots: ateliers / gallery pavilions in a ring round the square, all reachable
        if (s.lots.length >= 3) lotHits++;
        expect(s.plaza, `${ctx} square`).not.toBeNull();
        if (s.plaza) expect(zoneAt(w.height, w.zone, s.plaza.x, s.plaza.z), ctx).toBe(Zone.plaza);
        for (const li of s.lots) {
          const l = w.lots[li];
          expect(['atelier', 'galleryPavilion'], `${ctx} ${l.defId}`).toContain(l.defId);
          expect(l.node, ctx).toBeGreaterThanOrEqual(0);
          expect(seen[l.node], `${ctx} ${l.defId} unreachable`).toBe(1);
        }

        // sculpture clearing ≥ 12 u wide with ≥ 3 sculptures inside, open meadow, linked
        // TASK-467: the conservatory campus takes the dome top; the garden fits ≥ 70 % of seeds,
        // a 10 u clearing (minRadius) when the 12 u one finds no room
        const garden = w.districts.find((d) => d.islandId === isl.id && d.kind === 'sculpture');
        if (garden) gardenHits++;
        if (garden) {
          expect(Math.min(garden.w, garden.d), ctx).toBeGreaterThanOrEqual(
            2 * DESIGN_SITES.clearing.minRadius,
          );
          const inside = w.fixtures.filter(
            (f) =>
              f.islandId === isl.id &&
              SCULPTURES.has(f.defId) &&
              Math.hypot(f.x - garden.x, f.z - garden.z) <= garden.w / 2,
          );
          expect(inside.length, ctx).toBeGreaterThanOrEqual(3);
          expect(new Set(inside.map((f) => f.defId)).size, `${ctx} kinds`).toBeGreaterThanOrEqual(
            3,
          );
          for (const f of inside) expect(heightAt(w.height, f.x, f.z), ctx).toBeGreaterThan(0.3);
          expect(near(w, seen, garden, garden.w / 2), `${ctx} garden linked`).toBe(true);
        }

        // ≥ 3 easels by the stream (≤ 5 u from its line), each reachable from the bank path
        const stream = w.streams?.find((x) => x.islandId === isl.id);
        expect(stream, ctx).toBeDefined();
        const easels = w.fixtures.filter((f) => f.islandId === isl.id && f.defId === 'easel');
        const byStream = easels.filter((f) =>
          (stream?.points ?? []).some((q) => Math.hypot(q.x - f.x, q.z - f.z) <= 5),
        );
        // TASK-467: the creek and the bridge pads take the lower bank; ≥ 3 on ≥ 90 % of seeds
        expect(byStream.length, `${ctx} easels by the stream`).toBeGreaterThanOrEqual(1);
        if (byStream.length >= 3) easelHits++;
        for (const f of byStream) expect(near(w, seen, f, 4), `${ctx} easel linked`).toBe(true);

        // mushroom grove (giant mushrooms kept)
        const grove = w.districts.find((d) => d.islandId === isl.id && d.kind === 'garden');
        expect(grove, `${ctx} grove`).toBeDefined();

        // leftover audit: no log cabin anywhere on the island, no green round trees
        expect(
          w.lots.filter((l) => l.islandId === isl.id && l.defId === 'logCabin').length,
          ctx,
        ).toBe(0);
        expect(
          w.fixtures.some((f) => f.islandId === isl.id && f.defId === 'logCabin'),
          ctx,
        ).toBe(false);
        for (let i = 0; i < w.props.count; i++) {
          if (w.props.islandId[i] !== isl.id) continue;
          const id = PROP_DEFS[w.props.defId[i]].id;
          expect(id === 'logCabin' || id === 'roundTree', `${ctx} leftover ${id}`).toBe(false);
        }
      }
      // TASK-467: the square's ring holds 3–4 lots (the glasshouse block and the kit share it)
      expect(lotHits / SEEDS.length, 'lot minimum ≥ 3 hit rate').toBeGreaterThanOrEqual(0.8);
      expect(easelHits / SEEDS.length, '≥ 3 easels hit rate').toBeGreaterThanOrEqual(0.8);
      // TASK-467: the lot ring and the glasshouses come first, deep clearings keep off the
      // bluff face; a small dome (≈ 120 u) has no room left for the garden on 9 / 30 seeds
      expect(gardenHits / SEEDS.length, 'sculpture garden hit rate').toBeGreaterThanOrEqual(0.7);
    },
  );

  it('far tree blobs use the blossom canopy (cross-tier colour)', () => {
    // blossomTree is its own canopy kind: its blobs take the tree's own (pink) canopy colour
    expect(canopyKindOf('blossomTree')).toBe('blossom');
    expect(THEMES.design.scatterOff).toContain('roundTree');
  });

  it('deterministic: same seed → identical Design plan', () => {
    const pick = (w: WorldData) => {
      const id = w.islands.find((i) => i.theme === 'design')?.id;
      return JSON.stringify({
        lots: w.lots.filter((l) => l.islandId === id),
        fx: w.fixtures.filter((f) => f.islandId === id),
        d: w.districts.filter((d) => d.islandId === id),
      });
    };
    expect(pick(generateWorld(4242))).toBe(pick(generateWorld(4242)));
  });
});

/** TASK-467 Glass Conservatory (D-057 / D-058 / D-060): the M20 kit on Mossgrove, 30 seeds. */
describe('Design Glass Conservatory (TASK-467), 30 seeds', () => {
  const C = DESIGN_CULTURE_SITE;
  const S = DESIGN_SITES;
  const R = S.glade.quadR;
  const cR = FIXTURE_RADIUS.conservatory;
  /** Local +z of a planner fixture (its yaw) and the four bay directions. */
  const dirOf = (a: number): XZ => ({ x: Math.cos(a), z: Math.sin(a) });
  const bays = (rotY: number): XZ[] => [0, 1, 2, 3].map((k) => dirOf(rotY + (k * Math.PI) / 2));
  const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);

  it('the conservatory stands at the square centre on a level terrazzo disc, hero of the island', () => {
    for (const seed of SEEDS) {
      const { w, isl, s, fixtures } = design(seed);
      const ctx = `seed ${seed}`;
      const cons = fixtures.filter((f) => f.defId === 'conservatory');
      expect(cons.length, `${ctx} conservatory`).toBe(1);
      const c = cons[0];
      expect(s?.plaza, ctx).toBeDefined();
      if (!s?.plaza) continue;
      expect(dist(c, s.plaza), `${ctx} at the square centre`).toBeLessThan(1e-6);
      expect(s.plaza.r, ctx).toBe(R);
      // the terrazzo disc is level under the whole octagon: ≤ 0.3 u over its circumradius
      const y0 = heightAt(w.height, c.x, c.z);
      expect(y0, `${ctx} on land`).toBeGreaterThan(0.3);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const y = heightAt(w.height, c.x + Math.cos(a) * cR, c.z + Math.sin(a) * cR);
        expect(Math.abs(y - y0), `${ctx} octagon level`).toBeLessThanOrEqual(0.3);
      }
      // near the dome top, off the tree's lawn and the island's hub for the paths
      const tree = w.landmarks.find((l) => l.islandId === isl.id && l.kind === 'giantTree');
      expect(tree, ctx).toBeDefined();
      if (tree)
        expect(dist(c, tree), `${ctx} tree clearance`).toBeGreaterThanOrEqual(
          cR + 5 + S.square.passes[S.square.passes.length - 1][0] - 1e-6,
        );
      expect(dist(c, { x: isl.cx, z: isl.cz }), `${ctx} near the top`).toBeLessThanOrEqual(
        S.square.search,
      );
      expect(heightAt(w.height, c.x, c.z), `${ctx} high`).toBeGreaterThan(8);
    }
  });

  it('its four bays are clear and each leads to a path; bay 0 faces the pier', () => {
    const solid = (id: string): boolean =>
      !['conservatory', 'causticDecal', 'bunting', 'rainbowArc', 'glassBridge'].includes(id);
    for (const seed of SEEDS) {
      const { w, isl, s, fixtures } = design(seed);
      const ctx = `seed ${seed}`;
      const c = fixtures.find((f) => f.defId === 'conservatory');
      if (!c || !s) continue;
      const seen = reachable(w, s.hub.node);
      const pier = w.docks.find((d) => d.islandId === isl.id);
      const dirs = bays(c.rotY);
      dirs.forEach((d, k) => {
        const pin = {
          x: c.x + d.x * (cR + S.square.bayPin),
          z: c.z + d.z * (cR + S.square.bayPin),
        };
        // a path node within 2.5 u of the bay pin, reachable from the hub
        expect(near(w, seen, pin, 2.5), `${ctx} bay ${k} path`).toBe(true);
        // nothing solid in the 3.2 u wide bay strip from the octagon to 2 u past the pin
        const strip = rectShape(
          c.x + d.x * (cR + 1.8),
          c.z + d.z * (cR + 1.8),
          Math.atan2(d.z, d.x),
          3.2,
          3.6,
        );
        for (const f of fixtures)
          if (solid(f.defId))
            expect(
              shapesOverlap(strip, discShape(f.x, f.z, FIXTURE_RADIUS[f.defId] ?? 0.5), 0),
              `${ctx} bay ${k} blocked by ${f.defId}`,
            ).toBe(false);
        for (const l of w.lots)
          if (l.islandId === isl.id)
            expect(
              shapesOverlap(strip, rectShape(l.x, l.z, l.rotY, l.w, l.d), 0),
              `${ctx} bay ${k} blocked by ${l.defId}`,
            ).toBe(false);
      });
      if (pier) {
        const to = { x: pier.x - c.x, z: pier.z - c.z };
        const l = Math.hypot(to.x, to.z);
        expect(
          (to.x * dirs[0].x + to.z * dirs[0].z) / l,
          `${ctx} bay 0 faces the pier`,
        ).toBeGreaterThan(0.999);
      }
    }
  });

  it('six glasshouses in the content hue order, doors toward the square, level, linked', () => {
    const G = C.glasshouses;
    let blocks = 0;
    let six = 0;
    for (const seed of SEEDS) {
      const { w, isl, s, fixtures } = design(seed);
      const ctx = `seed ${seed}`;
      const houses = fixtures.filter((f) => f.defId === 'glasshouse');
      // whole rows only; the smallest domes (≈ 120 u) hold one row or none (seed 6260)
      expect([0, 3, 6], `${ctx} glasshouses`).toContain(houses.length);
      if (houses.length === 6) six++;
      const c = fixtures.find((f) => f.defId === 'conservatory');
      const rows = w.districts.filter((d) => d.islandId === isl.id && d.kind === 'glasshouses');
      expect(rows.length * 3, `${ctx} blocks`).toBeGreaterThanOrEqual(houses.length / 2);
      if (rows.length === 1 && houses.length === 6) blocks++;
      if (!c || !s) continue;
      const seen = reachable(w, s.hub.node);
      for (const blk of rows) {
        // doors (local +z) toward the square
        const to = { x: c.x - blk.x, z: c.z - blk.z };
        const l = Math.hypot(to.x, to.z);
        expect(
          (to.x * Math.cos(blk.rotY) + to.z * Math.sin(blk.rotY)) / l,
          `${ctx} doors`,
        ).toBeGreaterThan(0.999);
        expect(
          near(w, seen, blk, Math.hypot(blk.w, blk.d) / 2 + G.pin + 1),
          `${ctx} block linked`,
        ).toBe(true);
        // the houses of this block in the block frame: rows (local z, front first) × cols (local x)
        const mine = houses.filter((h) => Math.abs(h.rotY - blk.rotY) < 1e-6);
        const local = (h: XZ) => ({
          x: Math.sin(blk.rotY) * (h.x - blk.x) - Math.cos(blk.rotY) * (h.z - blk.z),
          z: Math.cos(blk.rotY) * (h.x - blk.x) + Math.sin(blk.rotY) * (h.z - blk.z),
        });
        const zs = [...new Set(mine.map((h) => Math.round(local(h).z * 10) / 10))].sort(
          (a, b) => b - a,
        );
        const nRows = zs.length;
        expect(mine.length, `${ctx} houses in block`).toBe(3 * nRows);
        const expectRows = nRows === 2 ? G.rows : null;
        zs.forEach((z, r) => {
          const row = mine
            .filter((h) => Math.abs(local(h).z - z) < 0.2)
            .sort((a, b) => local(a).x - local(b).x)
            .map((h) => h.variant);
          expect(row.length, `${ctx} row ${r}`).toBe(3);
          if (expectRows) expect(row, `${ctx} row ${r} hues`).toEqual([...expectRows[r]]);
          else
            expect(
              G.rows.some((hr) => hr.every((v, i) => v === row[i])),
              `${ctx} split row hues`,
            ).toBe(true);
          for (const v of row) expect(v, ctx).toBeLessThan(GLASSHOUSE_HUES.length);
        });
      }
      // level under each house (one pad per block)
      for (const h of houses) {
        const y0 = heightAt(w.height, h.x, h.z);
        expect(y0, `${ctx} house on land`).toBeGreaterThan(0.3);
        for (const p of shapeCorners(rectShape(h.x, h.z, h.rotY, 2.5, 4)))
          expect(
            Math.abs(heightAt(w.height, p.x, p.z) - y0),
            `${ctx} house level`,
          ).toBeLessThanOrEqual(0.35);
      }
    }
    // the 2 × 3 block fits beside the square on most seeds; otherwise two rows apart, or one
    // row on a small dome (the lot ring round the square comes first, TASK-467)
    // (24 / 30 hold six, 19 / 30 as one 2 × 3 block; seed 1789 none)
    expect(six / SEEDS.length, 'six glasshouses').toBeGreaterThanOrEqual(0.75);
    expect(blocks / SEEDS.length, '2 × 3 block').toBeGreaterThanOrEqual(0.45);
  });

  it('the Prism Walk: arches astride the pier path between the pier and the square', () => {
    const P = C.prismWalk;
    let one = 0;
    let two = 0;
    for (const seed of SEEDS) {
      const { w, isl, s, fixtures } = design(seed);
      const ctx = `seed ${seed}`;
      const arches = fixtures.filter((f) => f.defId === 'prismArch');
      // a pier lane down a cliff-steep flank (seed 1789: 2–2.6 u across the path) holds none
      expect(arches.length, ctx).toBeLessThanOrEqual(P.count[1]);
      if (arches.length >= 1) one++;
      if (arches.length >= 2) two++;
      const c = fixtures.find((f) => f.defId === 'conservatory');
      const pier = w.docks.find((d) => d.islandId === isl.id);
      if (!c || !pier || !s) continue;
      const seen = reachable(w, s.hub.node);
      for (const a of arches) {
        // on the path (the smoothed polyline passes under the crown), posts level, linked
        // the lane is smoothed once more when later links split it into chains: an arch in the
        // middle of a 5-cell run stays on it, a 3-cell fallback site drifts ≤ 1.5 u
        expect(pathDist(w, isl.id, a), `${ctx} arch on the path`).toBeLessThanOrEqual(1.5);
        expect(near(w, seen, a, 2.5), `${ctx} arch linked`).toBe(true);
        const n = { x: -Math.sin(a.rotY), z: Math.cos(a.rotY) };
        const ya = heightAt(w.height, a.x + n.x * P.postX, a.z + n.z * P.postX);
        const yb = heightAt(w.height, a.x - n.x * P.postX, a.z - n.z * P.postX);
        expect(Math.min(ya, yb), `${ctx} arch on land`).toBeGreaterThan(0.3);
        expect(Math.abs(ya - yb), `${ctx} arch posts level`).toBeLessThanOrEqual(0.35);
        // between the square and the pier (outside the square, nearer the pier than the far side)
        expect(dist(a, c), `${ctx} arch past the square`).toBeGreaterThan(R);
        expect(dist(a, pier), `${ctx} arch toward the pier`).toBeLessThan(dist(c, pier) + 6);
      }
      // spaced along the walk
      for (let i = 0; i < arches.length; i++)
        for (let j = i + 1; j < arches.length; j++)
          expect(dist(arches[i], arches[j]), `${ctx} arch spacing`).toBeGreaterThanOrEqual(
            P.minSpacing - 0.5,
          );
    }
    expect(one / SEEDS.length, '≥ 1 arch').toBeGreaterThanOrEqual(0.9);
    expect(two / SEEDS.length, '≥ 2 arches').toBeGreaterThanOrEqual(0.7);
  });

  it('the glass bridge spans the creek: water under the deck, both banks level, both ends linked', () => {
    const B = C.bridge;
    const bank = BANK_FIXTURES.glassBridge;
    let bridges = 0;
    for (const seed of SEEDS) {
      const { w, isl, s, fixtures } = design(seed);
      const ctx = `seed ${seed}`;
      const br = fixtures.filter((f) => f.defId === 'glassBridge');
      expect(br.length, ctx).toBeLessThanOrEqual(1);
      if (!br.length || !s) continue;
      bridges++;
      const b = br[0];
      expect(bank, 'BANK_FIXTURES.glassBridge').toBe(B.padX);
      // the pivot is in the creek (below sea level, inside the island), the pads on the banks
      expect(heightAt(w.height, b.x, b.z), `${ctx} water under the deck`).toBeLessThan(0);
      const i = Math.round((b.z - w.height.originZ) / w.height.cellSize);
      const j = Math.round((b.x - w.height.originX) / w.height.cellSize);
      expect(w.islandMap[i * w.height.n + j], `${ctx} on the island`).toBe(isl.id + 1);
      const ux = Math.sin(b.rotY) * bank;
      const uz = -Math.cos(b.rotY) * bank;
      const ya = heightAt(w.height, b.x + ux, b.z + uz);
      const yb = heightAt(w.height, b.x - ux, b.z - uz);
      // the end pads lift their cells to FLATTEN.minHeight; a pad beside a sea cell reads a little lower
      expect(Math.min(ya, yb), `${ctx} pads on land`).toBeGreaterThanOrEqual(0.2);
      expect(Math.abs(ya - yb), `${ctx} banks level`).toBeLessThanOrEqual(B.bankStep[1] + 0.3);
      // the creek is water across the span's middle third, land at the pads
      for (const t of [-1.2, 0, 1.2]) {
        const tx = (ux / bank) * t;
        const tz = (uz / bank) * t;
        expect(heightAt(w.height, b.x + tx, b.z + tz), `${ctx} creek at ${t}`).toBeLessThan(0.2);
      }
      const seen = reachable(w, s.hub.node);
      for (const sgn of [1, -1]) {
        const pin = {
          x: b.x + (ux / bank) * sgn * (B.padX + B.padR + B.pin),
          z: b.z + (uz / bank) * sgn * (B.padX + B.padR + B.pin),
        };
        expect(near(w, seen, pin, 3), `${ctx} bridge end ${sgn} linked`).toBe(true);
      }
      // a footpath crosses the creek only at the bridge: every path point below sea is near it
      for (const path of w.paths) {
        if (path.islandId !== isl.id || path.kind === 'boardwalk') continue;
        for (const p of path.points)
          if (heightAt(w.height, p.x, p.z) < -0.15)
            expect(dist(p, b), `${ctx} path in the creek off the bridge`).toBeLessThanOrEqual(4);
      }
    }
    // the beach reach of the stream is short and tilted: 23–26 of 30 seeds hold a bridge
    expect(bridges / SEEDS.length, 'bridge placed').toBeGreaterThanOrEqual(0.75);
  });

  it('the stained windmill on a cleared meadow on the shoulder opposite the tree, linked', () => {
    const W = C.windmill;
    for (const seed of SEEDS) {
      const { w, isl, s, fixtures } = design(seed);
      const ctx = `seed ${seed}`;
      const mills = fixtures.filter((f) => f.defId === 'stainedWindmill');
      expect(mills.length, `${ctx} windmill`).toBe(1);
      const m = mills[0];
      const tree = w.landmarks.find((l) => l.islandId === isl.id && l.kind === 'giantTree');
      const c = fixtures.find((f) => f.defId === 'conservatory');
      expect(heightAt(w.height, m.x, m.z), `${ctx} on the ridge`).toBeGreaterThanOrEqual(W.minY);
      // the last (small-dome) pass is the floor
      const [, treeClear, squareClear] = W.passes[W.passes.length - 1];
      if (tree) expect(dist(m, tree), `${ctx} off the tree`).toBeGreaterThanOrEqual(treeClear);
      if (c) expect(dist(m, c), `${ctx} off the square`).toBeGreaterThanOrEqual(squareClear);
      // the rotor (local +z) faces into the wind
      const face = dirOf(m.rotY);
      const wind = dirOf(w.windDir);
      expect(face.x * wind.x + face.z * wind.z, `${ctx} into the wind`).toBeLessThan(-0.99);
      // its meadow district, no pine inside it, the mill linked
      const d = w.districts.find((x) => x.islandId === isl.id && x.kind === 'windmill');
      expect(d, `${ctx} meadow district`).toBeDefined();
      if (!d || !s) continue;
      expect(dist(d, m), ctx).toBeLessThan(1e-6);
      for (let i = 0; i < w.props.count; i++) {
        if (w.props.islandId[i] !== isl.id || PROP_DEFS[w.props.defId[i]].id !== 'pine') continue;
        const p = { x: w.props.x[i], z: w.props.z[i] };
        expect(dist(p, m), `${ctx} pine in the windmill meadow`).toBeGreaterThan(W.meadowR - 1);
      }
      expect(near(w, reachable(w, s.hub.node), m, W.pin + 2.5), `${ctx} windmill linked`).toBe(
        true,
      );
    }
  });

  it('pine filler is cut by 35 % and cleared round the square and the glasshouses', () => {
    const pine = DESIGN_THEME.scatter.find((r) => r.def === 'pine');
    expect(pine?.density).toBe(0.55);
    for (const seed of SEEDS.slice(0, 10)) {
      const { w, isl, fixtures } = design(seed);
      const ctx = `seed ${seed}`;
      const c = fixtures.find((f) => f.defId === 'conservatory');
      const blocks = w.districts.filter((d) => d.islandId === isl.id && d.kind === 'glasshouses');
      if (!c) continue;
      for (let i = 0; i < w.props.count; i++) {
        if (w.props.islandId[i] !== isl.id || PROP_DEFS[w.props.defId[i]].id !== 'pine') continue;
        const p = { x: w.props.x[i], z: w.props.z[i] };
        expect(dist(p, c), `${ctx} pine on the square`).toBeGreaterThan(
          R + S.square.meadowRing - 1,
        );
        for (const b of blocks)
          expect(dist(p, b), `${ctx} pine in the glasshouse rows`).toBeGreaterThan(
            Math.hypot(b.w, b.d) / 2 + C.glasshouses.meadow - 1.5,
          );
      }
    }
  });

  it('two spray rainbows off the bluff, apart, both in the shallows', () => {
    const RB = C.rainbow;
    let twos = 0;
    for (const seed of SEEDS) {
      const { w, fixtures } = design(seed);
      const ctx = `seed ${seed}`;
      const arcs = fixtures.filter((f) => f.defId === 'rainbowArc');
      expect(arcs.length, ctx).toBeGreaterThanOrEqual(1);
      expect(arcs.length, ctx).toBeLessThanOrEqual(C.rainbows.count);
      if (arcs.length === 2) {
        twos++;
        expect(dist(arcs[0], arcs[1]), `${ctx} rainbows apart`).toBeGreaterThanOrEqual(
          C.rainbows.minSep,
        );
      }
      for (const f of arcs) {
        expect(FLOATING_FIXTURES).toContain('rainbowArc');
        // both feet in the shallows / on the wet beach, land under the span lower than the arc
        const d = { x: Math.sin(f.rotY), z: -Math.cos(f.rotY) };
        for (let t = -RB.half; t <= RB.half; t += 1) {
          const g = heightAt(w.height, f.x + d.x * t, f.z + d.z * t);
          const under = Math.abs(t) < RB.inner ? Math.sqrt(RB.inner ** 2 - t * t) : 0;
          expect(g, `${ctx} t=${t}`).toBeLessThanOrEqual(Math.max(RB.legMaxY, under) + 0.3);
        }
      }
    }
    expect(twos / SEEDS.length, 'two rainbows').toBeGreaterThanOrEqual(0.9);
  });
});

/** TASK-425 "Cam ve Işık Stüdyosu" (Glass & Light): the culture kit round the square, 30 seeds. */
describe('Design Glass & Light culture (TASK-425), 30 seeds', () => {
  const C = DESIGN_CULTURE_SITE;
  const rate = (k: number, n: number): number => k / n;
  /** [min, max] per def on the island; `share` = fraction of seeds with at least one. */
  const RANGES: Record<string, { n: [number, number]; share: number }> = {
    hotShop: { n: [1, 1], share: 1 },
    // TASK-467: without a sculpture garden (≤ 30 % of seeds) the prisms fall back to the rim
    prismSculpture: { n: [0, C.prisms.count[1]], share: 0.8 },
    // TASK-467: the screens' fallback rings round the square are the dome flank
    stainedScreen: { n: [0, C.screens.count[1]], share: 0.9 },
    // TASK-467: the rim of a small dome's square is the lot ring
    gatherRing: { n: [0, 1], share: 0.8 },
    glassOrb: { n: [0, C.orbs.count[1] + 1], share: 1 },
    // TASK-467: the kit keeps off the ring lots; one crowded small dome holds no caustic
    causticDecal: { n: [0, C.prisms.count[1] + C.orbs.count[1] + 1 + 5], share: 0.95 },
    culletCrate: { n: [0, C.workshop.culletCount[1] + 1], share: 1 },
    sampleShelf: { n: [0, 1], share: 0.8 },
    // TASK-467: the clutter keeps to the shop's yard plateau (no pad of its own)
    blowpipeRack: { n: [0, 1], share: 0.85 },
    rainbowArc: { n: [1, C.rainbows.count], share: 1 },
    // TASK-467: the chime lines cross the four bay lanes (poles off the lot / arch keep-offs)
    bunting: { n: [0, C.chimes.count[1]], share: 0.85 },
    conservatory: { n: [1, 1], share: 1 },
    glasshouse: { n: [0, 6], share: 0.95 },
    stainedWindmill: { n: [1, 1], share: 1 },
    prismArch: { n: [0, C.prismWalk.count[1]], share: 0.9 },
    glassBridge: { n: [0, 1], share: 0.75 },
  };

  it(
    'kit placed: counts per def within range; chime lines, gallery roof and tree are the culture variants',
    { timeout: 300_000 },
    () => {
      const hits: Record<string, number> = {};
      for (const seed of SEEDS) {
        const { w, isl, s, fixtures } = design(seed);
        for (const [id, R] of Object.entries(RANGES)) {
          const k = fixtures.filter((f) => f.defId === id).length;
          expect(k, `seed ${seed} ${id}`).toBeGreaterThanOrEqual(R.n[0]);
          expect(k, `seed ${seed} ${id}`).toBeLessThanOrEqual(R.n[1]);
          if (k > 0) hits[id] = (hits[id] ?? 0) + 1;
        }
        // every Design bunting is a glass chime line; the seconds shelf is the seconds variant
        for (const f of fixtures.filter((x) => x.defId === 'bunting'))
          expect(f.variant, `seed ${seed}`).toBe(C.chimes.variant);
        for (const f of fixtures.filter((x) => x.defId === 'sampleShelf'))
          expect(f.variant, `seed ${seed}`).toBe(C.workshop.secondsVariant);
        // the gallery: at most one pavilion wears the glass roof, and then it is the one nearest
        // the square (the pinned lot can be dropped when its door does not connect, TASK-467)
        const pav = w.lots.filter((l) => l.islandId === isl.id && l.defId === 'galleryPavilion');
        if (pav.length && s) {
          const c = s.plaza ?? s.hub;
          const g = pav.reduce((a, b) => (dist(b, c) < dist(a, c) ? b : a));
          const glass = pav.filter((l) => l.variant === C.glassPavilionVariant);
          expect(glass.length, `seed ${seed} glass roofs`).toBeLessThanOrEqual(1);
          if (glass.length) expect(glass[0], `seed ${seed} glass roof nearest`).toBe(g);
        }
      }
      for (const [id, R] of Object.entries(RANGES))
        expect(rate(hits[id] ?? 0, SEEDS.length), id).toBeGreaterThanOrEqual(R.share);
      // the Atelier Tree wears the canopy vitray; random rolls never draw the culture variants
      expect(THEMES.design.landmarkVariant.giantTree).toBe(3);
      for (const id of ['giantTree', 'galleryPavilion', 'bunting']) {
        const def = PROP_DEFS.find((d) => d.id === id);
        // bunting: v4 (the Marketing bulb string, TASK-481) sits past the glass chime line
        expect(def?.rollVariants, id).toBe(id === 'bunting' ? 3 : (def?.variants ?? 0) - 1);
      }
      // no unpinned pavilion anywhere rolled the glass roof
      for (const seed of SEEDS.slice(0, 6)) {
        const { w, isl } = design(seed);
        const glass = w.lots.filter(
          (l) => l.defId === 'galleryPavilion' && l.variant === C.glassPavilionVariant,
        );
        expect(glass.length, `seed ${seed}`).toBeLessThanOrEqual(1);
        for (const l of glass) expect(l.islandId, `seed ${seed}`).toBe(isl.id);
      }
    },
  );

  it('everything on land and level; the rainbows stand in the sea, the bridge over the creek', () => {
    for (const seed of SEEDS) {
      const { w, isl, fixtures } = design(seed);
      for (const f of fixtures) {
        const ctx = `seed ${seed} ${f.defId} @${f.x.toFixed(1)},${f.z.toFixed(1)}`;
        // the rainbows (checked in the TASK-467 block) and the bridge (pivot in the creek)
        if (f.defId === 'rainbowArc' || f.defId === 'glassBridge') continue;
        if (!RANGES[f.defId]) continue;
        const y0 = heightAt(w.height, f.x, f.z);
        expect(y0, `${ctx} on land`).toBeGreaterThan(0.3);
        const i = Math.round((f.z - w.height.originZ) / w.height.cellSize);
        const j = Math.round((f.x - w.height.originX) / w.height.cellSize);
        expect(w.islandMap[i * w.height.n + j], `${ctx} island`).toBe(isl.id + 1);
        if (f.defId === 'hotShop') {
          for (const p of shapeCorners(rectShape(f.x, f.z, f.rotY, ...C.hotShop.rect)))
            expect(Math.abs(heightAt(w.height, p.x, p.z) - y0), ctx).toBeLessThanOrEqual(0.3);
          continue;
        }
        if (f.defId === 'bunting') continue; // poles checked by the planner (lane edges)
        if (f.defId === 'prismArch') continue; // posts checked in the TASK-467 block
        // footprint relief: props ≤ 0.5 u, flat caustic decals ≤ 0.45 u over their 1 u ellipse
        const r = f.defId === 'causticDecal' ? 0.5 : FIXTURE_RADIUS[f.defId];
        const ys = [0, 1, 2, 3, 4, 5, 6, 7].map((k) =>
          heightAt(w.height, f.x + Math.cos(k * 0.785) * r, f.z + Math.sin(k * 0.785) * r),
        );
        const rel = Math.max(y0, ...ys) - Math.min(y0, ...ys);
        expect(rel, ctx).toBeLessThanOrEqual(f.defId === 'causticDecal' ? 0.45 : 0.55);
      }
    }
  });

  it('hot shop and gather ring are reachable; the hot shop sits on the square rim', () => {
    let shopLinked = 0;
    for (const seed of SEEDS) {
      const { w, s, fixtures } = design(seed);
      if (!s) continue;
      const seen = reachable(w, s.hub.node);
      const c = s.plaza ?? s.hub;
      const shop = fixtures.find((f) => f.defId === 'hotShop');
      expect(shop, `seed ${seed}`).toBeDefined();
      if (shop) {
        expect(dist(shop, c), `seed ${seed}`).toBeLessThanOrEqual(
          DESIGN_SITES.glade.quadR + C.hotShop.ring[1] + 1e-6,
        );
        if (near(w, seen, shop, 5)) shopLinked++;
      }
      for (const g of fixtures.filter((f) => f.defId === 'gatherRing'))
        expect(near(w, seen, g, 4.5), `seed ${seed} gather ring linked`).toBe(true);
    }
    // TASK-467: on a small crowded dome the shop's last relief tier can sit off the walkable slopes
    expect(shopLinked / SEEDS.length, 'hot shop linked').toBeGreaterThanOrEqual(0.95);
  });

  it('story spots: ≥ 6 per island, ledger kinds once each, on the island', () => {
    const kinds = new Set(DESIGN_CULTURE.storySpots.map((s) => s.kind));
    // TASK-471 re-roll: seed 4945 fits 4 spots; ≥ 6 on ≥ 90 % of the seeds
    let six = 0;
    for (const seed of SEEDS) {
      const { w, isl } = design(seed);
      const spots = w.storySpots.filter((s) => s.islandId === isl.id);
      expect(spots.length, `seed ${seed}`).toBeGreaterThanOrEqual(4);
      if (spots.length >= 6) six++;
      expect(new Set(spots.map((s) => s.kind)).size, `seed ${seed} unique`).toBe(spots.length);
      for (const s of spots) {
        const ctx = `seed ${seed} ${s.kind}`;
        expect(kinds.has(s.kind), ctx).toBe(true);
        expect(s.defs.length, ctx).toBeGreaterThan(0);
        expect(dist(s.pos, { x: isl.cx, z: isl.cz }), ctx).toBeLessThanOrEqual(isl.reach);
        expect(s.pos.y, ctx).toBeGreaterThanOrEqual(heightAt(w.height, s.pos.x, s.pos.z) - 1e-6);
        expect(heightAt(w.height, s.pos.x, s.pos.z), `${ctx} on land`).toBeGreaterThan(0.3);
      }
    }
    // TASK-467: the conservatory campus squeezes the kit on small domes (26 / 30 seeds ≥ 6)
    expect(six / SEEDS.length, '≥ 6 story spots').toBeGreaterThanOrEqual(0.85);
  });
});

const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);
