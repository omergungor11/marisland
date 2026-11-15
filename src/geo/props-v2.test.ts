import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BIOME_DEF_VARIANTS,
  BIOME_IDS,
  BIOMES,
  BOAT_SETS,
  BOULDER_VARIANTS,
  BUOY_V2,
  HARBOUR_BOAT_VARIANTS,
  SHAPES,
  biomeTreePalette,
  biomeVariant,
  boatVariant,
  boulderVariant,
  splitBoatVariant,
  splitVariant,
  themeVariants,
} from '../content/biomes.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import { PROP_GEO, buildProp } from './index.ts';

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
const meanColor = (g: THREE.BufferGeometry): THREE.Color => {
  const a = g.getAttribute('color');
  const c = new THREE.Color(0, 0, 0);
  for (let i = 0; i < a.count; i++) {
    c.r += a.getX(i);
    c.g += a.getY(i);
    c.b += a.getZ(i);
  }
  return c.multiplyScalar(1 / a.count);
};

/** LOD0 triangle budgets per def (TASK-599 / TASK-601); LOD1 <= 30 % is pinned by geo.test.ts. */
const BUDGET: Record<string, number> = {
  canopyTree: 500,
  leanPalm: 700,
  floraBush: 200,
  boulder: 300,
  kelp: 150,
  driftLog: 150,
  harbourBoat: 600,
  dockDressing: 300,
};
const V2_IDS = Object.keys(BUDGET);

/** The pre-v2 vegetation / boat defs: scatter rolls `rng.int(0, variants - 1)`, so these must not move. */
const OLD_VARIANTS: Record<string, number> = {
  palm: 3,
  roundTree: 3,
  pine: 3,
  giantMushroom: 2,
  bush: 2,
  rockCluster: 3,
  treeBlob: 3,
  rowboat: 2,
  sailboat: 11,
  driftwood: 2,
};

describe('vegetation, rock and boat v2 (TASK-599 / TASK-601)', () => {
  it('old scatter defs keep their variant counts and sit before every v2 def', () => {
    for (const [id, n] of Object.entries(OLD_VARIANTS)) {
      expect(PROP_DEFS[PROP_DEF_INDEX[id]].variants, id).toBe(n);
      expect(PROP_GEO[id].variants, id).toBe(n);
    }
    const last = PROP_DEFS.length - 1;
    // the v2 defs are the tail of the list: no defId shifts
    for (const id of V2_IDS) expect(PROP_DEF_INDEX[id], id).toBeGreaterThan(last - V2_IDS.length);
  });

  it('prop defs and geometry agree on variant counts, rolls stay inside the neutral block', () => {
    for (const id of V2_IDS) {
      const d = PROP_DEFS[PROP_DEF_INDEX[id]];
      expect(PROP_GEO[id].variants, id).toBe(d.variants);
      expect(PROP_GEO[id].heights, id).toHaveLength(d.variants);
      if (d.rollVariants) expect(d.rollVariants, id).toBeLessThanOrEqual(d.variants);
    }
    expect(PROP_DEFS[PROP_DEF_INDEX.canopyTree].variants).toBe(BIOME_DEF_VARIANTS.canopyTree);
    expect(PROP_DEFS[PROP_DEF_INDEX.boulder].variants).toBe(BOULDER_VARIANTS * BIOME_IDS.length); // per-island moss sets (TASK-600)
    expect(PROP_DEFS[PROP_DEF_INDEX.harbourBoat].variants).toBe(HARBOUR_BOAT_VARIANTS);
    expect(PROP_DEFS[PROP_DEF_INDEX.buoy].variants).toBe(BUOY_V2.first + BUOY_V2.names.length);
  });

  it('variant encoding round-trips and each theme owns a consecutive block', () => {
    for (const def of Object.keys(SHAPES) as (keyof typeof SHAPES)[])
      BIOME_IDS.forEach((id, bi) => {
        const block = themeVariants(def, id);
        expect(block).toHaveLength(SHAPES[def]);
        block.forEach((v, s) => {
          expect(v).toBe(bi * SHAPES[def] + s);
          expect(splitVariant(def, v)).toMatchObject({ biomeId: id, shape: s });
          expect(biomeVariant(def, id, s)).toBe(v);
        });
      });
    BIOME_IDS.forEach((id) => {
      for (let h = 0; h < 3; h++) expect(splitBoatVariant(boatVariant(id, h)).hull).toBe(h);
      expect(splitBoatVariant(boatVariant(id, 0)).set).toBe(BOAT_SETS[id]);
    });
  });

  it('biome tree palettes keep the FOLIAGE shape the far blobs read', () => {
    for (const id of BIOME_IDS) {
      const p = biomeTreePalette(id);
      expect(p.deciduous).toHaveLength(3);
      expect(p.pine).toHaveLength(2);
      expect(p.palm).toHaveLength(2);
      expect(BIOMES[id].flowers).toHaveLength(2);
    }
  });

  for (const id of V2_IDS) {
    const def = PROP_GEO[id];
    it(`${id}: every variant is inside its LOD0 budget (${BUDGET[id]} tris), LOD1 is deterministic`, () => {
      for (let v = 0; v < def.variants; v++) {
        const g = buildProp(id, 11, v, 0);
        expect(tris(g), `${id} v${v}`).toBeLessThanOrEqual(BUDGET[id]);
        const again = buildProp(id, 11, v, 1).getAttribute('position').array;
        expect(Array.from(again)).toEqual(
          Array.from(buildProp(id, 11, v, 1).getAttribute('position').array),
        );
      }
    });
  }

  it('the island colour sets read apart: canopy, palm and bush means differ across biomes', () => {
    for (const [id, def] of [
      ['canopyTree', 'canopyTree'],
      ['leanPalm', 'leanPalm'],
      ['floraBush', 'floraBush'],
    ] as const) {
      const means = BIOME_IDS.map((b) => meanColor(buildProp(id, 5, biomeVariant(def, b, 0), 0)));
      // Hearthholm keeps the neutral greens on purpose (its orchard is the fruit dots)
      for (let i = 0; i < means.length; i++)
        for (let j = i + 1; j < means.length; j++) {
          if (BIOME_IDS[i] === 'neutral' && BIOME_IDS[j] === 'hq' && id !== 'canopyTree') continue;
          const d = Math.hypot(
            means[i].r - means[j].r,
            means[i].g - means[j].g,
            means[i].b - means[j].b,
          );
          expect(d, `${id} ${BIOME_IDS[i]} vs ${BIOME_IDS[j]}`).toBeGreaterThan(0.004);
        }
    }
  });

  it('boat sets differ per island and the three hulls differ in size', () => {
    const hulls = [0, 1, 2].map((h) => {
      const g = buildProp('harbourBoat', 3, boatVariant('neutral', h), 0);
      g.computeBoundingBox();
      return g.boundingBox!.getSize(new THREE.Vector3());
    });
    expect(hulls[0].z).toBeLessThan(hulls[1].z);
    expect(hulls[1].z).toBeLessThan(hulls[2].z);
    expect(hulls[0].y).toBeLessThan(hulls[2].y);
    const sets = new Set(BIOME_IDS.map((b) => BOAT_SETS[b].hull));
    expect(sets.size).toBe(BIOME_IDS.length);
  });

  it('the five boulder silhouettes differ in bounds and the caps recolour the top', () => {
    const size = (v: number): THREE.Vector3 => {
      const g = buildProp('boulder', 2, v, 0);
      g.computeBoundingBox();
      return g.boundingBox!.getSize(new THREE.Vector3());
    };
    const keys = new Set(
      [0, 1, 2, 3, 4].map((v) => {
        const s = size(v);
        return `${s.x.toFixed(1)}x${s.y.toFixed(1)}x${s.z.toFixed(1)}`;
      }),
    );
    expect(keys.size).toBe(5);
    for (let s = 0; s < 5; s++) {
      const bare = meanColor(buildProp('boulder', 2, s, 0));
      for (const cap of [1, 2]) {
        const c = meanColor(buildProp('boulder', 2, cap * 5 + s, 0));
        expect(
          Math.hypot(c.r - bare.r, c.g - bare.g, c.b - bare.b),
          `cap ${cap} sil ${s}`,
        ).toBeGreaterThan(0.003);
      }
    }
  });

  it('TASK-680: boat LOD1 keeps the LOD0 colours, the dinghy is not a toy, the moss follows the island', () => {
    const share = (g: THREE.BufferGeometry, hex: string): number => {
      const want = new THREE.Color(hex);
      const a = g.getAttribute('color');
      let n = 0;
      for (let i = 0; i < a.count; i += 3)
        if (Math.hypot(a.getX(i) - want.r, a.getY(i) - want.g, a.getZ(i) - want.b) < 0.12) n++;
      return n / (a.count / 3);
    };
    for (const b of BIOME_IDS)
      for (const h of [0, 1, 2]) {
        const v = boatVariant(b, h);
        // the hull colour is a real share of the far boat (it used to be the stripe above 45 % of the freeboard)
        expect(
          share(buildProp('harbourBoat', 3, v, 1), BOAT_SETS[b].hull),
          `${b} hull ${h}`,
        ).toBeGreaterThan(0.2);
      }
    const top = (h: number): number => {
      const g = buildProp('harbourBoat', 3, boatVariant('neutral', h), 0);
      return g.boundingBox!.max.y;
    };
    expect(top(0) / top(2)).toBeGreaterThan(0.35);
    const moss = (b: (typeof BIOME_IDS)[number]): THREE.Color =>
      meanColor(buildProp('boulder', 2, boulderVariant(b, 1, 0), 0));
    expect(moss('neutral').equals(moss('design'))).toBe(false);
    expect(moss('marketing').equals(moss('devops'))).toBe(false);
  });

  it('TASK-680: LOD1 palms are a volume and the pebble / twin boulders keep their clusters', () => {
    for (const v of [0, 1, 2]) {
      const g = buildProp('leanPalm', 2, v, 1);
      g.computeBoundingBox();
      const crown = g.boundingBox!.getSize(new THREE.Vector3());
      expect(crown.y).toBeGreaterThan(3);
    }
    const w = (v: number, lod: 0 | 1): number => {
      const g = buildProp('boulder', 2, v, lod);
      return g.boundingBox!.getSize(new THREE.Vector3()).x;
    };
    // the far outline spans the cluster, not just its first rock
    expect(w(0, 1)).toBeGreaterThan(w(0, 0) * 0.8);
    expect(w(3, 1)).toBeGreaterThan(w(3, 0) * 0.8);
  });
});
