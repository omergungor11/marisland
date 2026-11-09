import { describe, expect, it } from 'vitest';
import {
  BUILDING_ROLL_NOW,
  BUILDING_ROLL_PROPOSAL,
  BUILDING_STYLES,
  BUILDING_VARIANTS,
  buildingStyle,
} from '../content/building-variants.ts';
import { FOLIAGE, ROCK, ROOFS, WALLS, WOOD } from '../content/palette.ts';
import { PROP_DEFS_BUILDINGS } from '../content/props-buildings.ts';
import { PROP_GEO, buildProp } from './index.ts';

/** First appended style index per def (everything below keeps its legacy builder, TASK-598). */
const FIRST_STYLED = { cottage: 4, stiltHut: 2, towerHouse: 3, barn: 2, logCabin: 2 } as const;
/** Measured max LOD0 tris over the legacy variants (seed 7) before TASK-598: the x1.25 budget base. */
const LEGACY_LOD0_MAX = { cottage: 232, stiltHut: 518, towerHouse: 340, barn: 244, logCabin: 496 };
const IDS = Object.keys(FIRST_STYLED) as (keyof typeof FIRST_STYLED)[];
const tris = (id: string, v: number, lod: 0 | 1): number =>
  buildProp(id, 7, v, lod).getAttribute('position').count / 3;

describe('building variants v2 (TASK-598)', () => {
  it('variant counts: geometry and prop defs agree, appended rows are styled, legacy rows are not', () => {
    for (const id of IDS) {
      expect(PROP_GEO[id].variants, id).toBe(BUILDING_VARIANTS[id]);
      const def = PROP_DEFS_BUILDINGS.find((d) => d.id === id)!;
      expect(def.variants, id).toBe(BUILDING_VARIANTS[id]);
      // rolls are pinned to the legacy count until TASK-600 flips them (the world hash stays)
      expect(def.rollVariants, id).toBe(BUILDING_ROLL_NOW[id]);
      for (let v = 0; v < BUILDING_VARIANTS[id]; v++)
        if (v < FIRST_STYLED[id] && !(id === 'cottage' && v === 3))
          expect(buildingStyle(id, v), `${id} v${v}`).toBeUndefined();
        else if (!(id === 'cottage' && v === 3))
          expect(buildingStyle(id, v), `${id} v${v}`).toBeDefined();
      expect(BUILDING_ROLL_PROPOSAL[id]).toBeGreaterThan(BUILDING_ROLL_NOW[id]);
    }
  });

  it('every colour in the table is a palette hue', () => {
    const ok = new Set<string>([
      ...WALLS,
      ...ROOFS,
      ...ROCK,
      ...Object.values(WOOD),
      ...FOLIAGE.deciduous,
    ]);
    for (const [id, rows] of Object.entries(BUILDING_STYLES))
      for (const [v, s] of Object.entries(rows))
        for (const c of [
          s.wall,
          s.roofCol,
          s.trim,
          s.doorCol,
          s.shutters,
          s.plinth,
          ...(s.awning ?? []),
        ])
          if (c) expect(ok.has(c), `${id} v${v} ${c}`).toBe(true);
  });

  it('a double door never shares a front wall with a window pair (houses: only with the wide layout)', () => {
    for (const id of ['cottage', 'stiltHut', 'logCabin'] as const)
      for (const [v, s] of Object.entries(BUILDING_STYLES[id]))
        if (s.door === 'double') expect(s.windows, `${id} v${v}`).toBe(2);
  });

  it('legacy variants are unchanged (tri counts) and styled LOD0 stays within 1.25x of the legacy max', () => {
    for (const id of IDS) {
      let legacyMax = 0;
      for (let v = 0; v < FIRST_STYLED[id]; v++) legacyMax = Math.max(legacyMax, tris(id, v, 0));
      expect(legacyMax, `${id} legacy max`).toBe(LEGACY_LOD0_MAX[id]);
      for (let v = FIRST_STYLED[id]; v < BUILDING_VARIANTS[id]; v++) {
        const n = tris(id, v, 0);
        expect(n, `${id} v${v} lod0 ${n} tris`).toBeLessThanOrEqual(Math.floor(1.25 * legacyMax));
      }
    }
  });

  it('styled LOD1 keeps the def LOD1 silhouette (same box + roof mass, <= 30 % of LOD0)', () => {
    for (const id of IDS) {
      const ref = buildProp(id, 7, 0, 1).boundingBox!;
      const rs = ref.getSize(ref.max.clone());
      for (let v = FIRST_STYLED[id]; v < BUILDING_VARIANTS[id]; v++) {
        if (id === 'cottage' && v === 3) continue;
        const bb = buildProp(id, 7, v, 1).boundingBox!;
        const sz = bb.getSize(bb.max.clone());
        for (const k of ['x', 'y', 'z'] as const)
          expect(Math.abs(sz[k] / rs[k] - 1), `${id} v${v} ${k}`).toBeLessThan(0.08);
        expect(tris(id, v, 1)).toBeLessThanOrEqual(0.3 * tris(id, v, 0));
      }
    }
  });

  it('styled variants differ from each other (distinct geometry per index)', () => {
    for (const id of IDS) {
      const seen = new Set<string>();
      for (let v = 0; v < BUILDING_VARIANTS[id]; v++) {
        const g = buildProp(id, 7, v, 0);
        const p = g.getAttribute('position').array as Float32Array;
        let h = 0;
        for (let i = 0; i < p.length; i += 7) h = (h * 31 + Math.round(p[i] * 100)) | 0;
        seen.add(`${p.length}:${h}`);
      }
      expect(seen.size, id).toBe(BUILDING_VARIANTS[id]);
    }
  });
});
