import { describe, expect, it } from 'vitest';
import { DESIGN_SITES } from '../content/themes/design.ts';
import { THEMES } from '../content/themes/index.ts';
import { canopyKindOf } from '../render/props/clusters.ts';
import { PROP_DEFS } from '../content/props.ts';
import { FIXTURE_RADIUS, FLOATING_FIXTURES } from '../content/settlements.ts';
import { DESIGN_CULTURE, DESIGN_CULTURE_SITE } from '../content/cultures/design.ts';
import { generateWorld, heightAt, zoneAt, Zone, type WorldData, type XZ } from './index.ts';
import { rectShape, shapeCorners } from './gen/sites.ts';

/** Design island plan (TASK-367, M14b §2.6) over 30 seeds. */
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

describe('Design island plan (TASK-367), 30 seeds', () => {
  it(
    'Atelier Tree, lots, sculpture clearing, easel walk, grove: placed, connected, no leftovers',
    { timeout: 120_000 },
    () => {
      let lotHits = 0;
      for (const seed of SEEDS) {
        const w = generateWorld(seed);
        const isl = w.islands.find((i) => i.theme === 'design');
        expect(isl, `seed ${seed}`).toBeDefined();
        if (!isl) continue;
        const ctx = `seed ${seed}`;
        const s = w.settlements.find((x) => x.islandId === isl.id);
        expect(s, ctx).toBeDefined();
        if (!s) continue;
        const seen = reachable(w, s.hub.node);

        // (a) Atelier Tree landmark (giantTree, theme variant 3 = canopy vitray, TASK-425), reachable
        const tree = w.landmarks.find((l) => l.islandId === isl.id && l.kind === 'giantTree');
        expect(tree, ctx).toBeDefined();
        expect(THEMES.design.landmarkVariant.giantTree).toBe(3);
        if (tree) expect(near(w, seen, tree, 8), `${ctx} tree linked`).toBe(true);

        // (b) lots: atelier / gallery pavilions around a mosaic quad, all reachable
        if (s.lots.length >= 4) lotHits++;
        expect(s.plaza, `${ctx} quad`).not.toBeNull();
        if (s.plaza) expect(zoneAt(w.height, w.zone, s.plaza.x, s.plaza.z), ctx).toBe(Zone.plaza);
        for (const li of s.lots) {
          const l = w.lots[li];
          expect(['atelier', 'galleryPavilion'], `${ctx} ${l.defId}`).toContain(l.defId);
          expect(l.node, ctx).toBeGreaterThanOrEqual(0);
          expect(seen[l.node], `${ctx} ${l.defId} unreachable`).toBe(1);
        }

        // sculpture clearing ≥ 12 u wide with ≥ 3 sculptures inside, open meadow, linked
        const garden = w.districts.find((d) => d.islandId === isl.id && d.kind === 'sculpture');
        expect(garden, `${ctx} sculpture garden`).toBeDefined();
        if (garden) {
          expect(Math.min(garden.w, garden.d), ctx).toBeGreaterThanOrEqual(12);
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
        expect(byStream.length, `${ctx} easels by the stream`).toBeGreaterThanOrEqual(3);
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
      expect(lotHits / SEEDS.length, 'lot minimum ≥ 4 hit rate').toBeGreaterThanOrEqual(0.9);
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

/** TASK-425 "Cam ve Işık Stüdyosu" (Glass & Light): the culture kit on the Atelier Glade, 30 seeds. */
describe('Design Glass & Light culture (TASK-425), 30 seeds', () => {
  const C = DESIGN_CULTURE_SITE;
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
  const rate = (k: number, n: number): number => k / n;
  /** [min, max] per def on the island; `share` = fraction of seeds with at least one. */
  const RANGES: Record<string, { n: [number, number]; share: number }> = {
    hotShop: { n: [1, 1], share: 1 },
    prismSculpture: { n: [C.prisms.count[0], C.prisms.count[1]], share: 1 },
    stainedScreen: { n: [C.screens.count[0], C.screens.count[1]], share: 1 },
    gatherRing: { n: [0, 1], share: 0.95 },
    glassOrb: { n: [0, C.orbs.count[1] + 1], share: 1 },
    causticDecal: { n: [0, C.prisms.count[1] + C.orbs.count[1] + 1 + 5], share: 1 },
    culletCrate: { n: [0, C.workshop.culletCount[1] + 1], share: 1 },
    sampleShelf: { n: [0, 1], share: 0.8 },
    blowpipeRack: { n: [0, 1], share: 0.9 },
    rainbowArc: { n: [1, 1], share: 1 },
    bunting: { n: [0, C.chimes.count[1]], share: 0.95 },
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
        // the gallery: exactly the pavilion lot nearest the quad wears the glass roof
        const pav = w.lots.filter((l) => l.islandId === isl.id && l.defId === 'galleryPavilion');
        if (pav.length && s) {
          const c = s.plaza ?? s.hub;
          const g = pav.reduce((a, b) => (dist(b, c) < dist(a, c) ? b : a));
          for (const l of pav)
            expect(l.variant === C.glassPavilionVariant, `seed ${seed}`).toBe(l === g);
        }
      }
      for (const [id, R] of Object.entries(RANGES))
        expect(rate(hits[id] ?? 0, SEEDS.length), id).toBeGreaterThanOrEqual(R.share);
      // the Atelier Tree wears the canopy vitray; random rolls never draw the culture variants
      expect(THEMES.design.landmarkVariant.giantTree).toBe(3);
      for (const id of ['giantTree', 'galleryPavilion', 'bunting']) {
        const def = PROP_DEFS.find((d) => d.id === id);
        expect(def?.rollVariants, id).toBe((def?.variants ?? 0) - 1);
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

  it('everything on land and level; the rainbow stands in the sea off the shore', () => {
    for (const seed of SEEDS) {
      const { w, isl, fixtures } = design(seed);
      for (const f of fixtures) {
        const ctx = `seed ${seed} ${f.defId} @${f.x.toFixed(1)},${f.z.toFixed(1)}`;
        if (f.defId === 'rainbowArc') {
          expect(FLOATING_FIXTURES).toContain('rainbowArc');
          // both feet in the shallows / on the wet beach, land under the span lower than the arc
          const d = { x: Math.sin(f.rotY), z: -Math.cos(f.rotY) };
          for (let t = -C.rainbow.half; t <= C.rainbow.half; t += 1) {
            const g = heightAt(w.height, f.x + d.x * t, f.z + d.z * t);
            const under =
              Math.abs(t) < C.rainbow.inner ? Math.sqrt(C.rainbow.inner ** 2 - t * t) : 0;
            expect(g, `${ctx} t=${t}`).toBeLessThanOrEqual(
              Math.max(C.rainbow.legMaxY, under) + 0.3,
            );
          }
          continue;
        }
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
        // footprint relief: props ≤ 0.5 u, flat caustic decals ≤ 0.45 u over their 1 u ellipse
        const r = f.defId === 'causticDecal' ? 0.5 : FIXTURE_RADIUS[f.defId];
        const ys = [0, 1, 2, 3, 4, 5, 6, 7].map((k) =>
          heightAt(w.height, f.x + Math.cos(k * 0.785) * r, f.z + Math.sin(k * 0.785) * r),
        );
        const rel = Math.max(y0, ...ys) - Math.min(y0, ...ys);
        expect(rel, ctx).toBeLessThanOrEqual(f.defId === 'causticDecal' ? 0.45 : 0.5);
      }
    }
  });

  it('hot shop and gather ring are reachable; the hot shop sits on the glade rim', () => {
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
        expect(near(w, seen, shop, 5), `seed ${seed} hot shop linked`).toBe(true);
      }
      for (const g of fixtures.filter((f) => f.defId === 'gatherRing'))
        expect(near(w, seen, g, 4.5), `seed ${seed} gather ring linked`).toBe(true);
    }
  });

  it('story spots: ≥ 6 per island, ledger kinds once each, on the island', () => {
    const kinds = new Set(DESIGN_CULTURE.storySpots.map((s) => s.kind));
    for (const seed of SEEDS) {
      const { w, isl } = design(seed);
      const spots = w.storySpots.filter((s) => s.islandId === isl.id);
      expect(spots.length, `seed ${seed}`).toBeGreaterThanOrEqual(6);
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
  });
});

const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);
