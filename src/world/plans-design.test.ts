import { describe, expect, it } from 'vitest';
import { DESIGN_SITES } from '../content/themes/design.ts';
import { THEMES } from '../content/themes/index.ts';
import { BLOSSOM_CANOPY } from '../content/props-themes/design.ts';
import { PROP_DEFS } from '../content/props.ts';
import { generateWorld, heightAt, zoneAt, Zone, type WorldData, type XZ } from './index.ts';

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

        // (a) Atelier Tree landmark (giantTree, theme variant 2), reachable
        const tree = w.landmarks.find((l) => l.islandId === isl.id && l.kind === 'giantTree');
        expect(tree, ctx).toBeDefined();
        expect(THEMES.design.landmarkVariant.giantTree).toBe(2);
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
    for (const hex of BLOSSOM_CANOPY) expect(THEMES.design.treePalette.deciduous).toContain(hex);
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
