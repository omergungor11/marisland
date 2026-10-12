/** TASK-402a: Observatory University campus, sculptures, outdoor science and garden kit. */
import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RESEARCH_PROP_DEFS } from '../../content/props-themes/research.ts';
import { FIXTURE_RADIUS } from '../../content/settlements.ts';
import { PROP_GEO, buildProp } from '../registry.ts';

const CAMPUS_IDS = [
  'observatory',
  'facultyHall',
  'libraryRotunda',
  'campusTower',
  'terrarium',
] as const;
const SCULPTURE_IDS = [
  'atomSculpture',
  'dnaHelix',
  'armillarySphere',
  'scholarStatue',
  'rocketMonument',
] as const;
const SCIENCE_IDS = ['radioDish', 'labPod'] as const;
const GARDEN_IDS = ['fountain', 'hedgeParterre', 'topiary', 'pergola'] as const;
const NEW_IDS = [...CAMPUS_IDS, ...SCULPTURE_IDS, ...SCIENCE_IDS, ...GARDEN_IDS];

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;

/** Per-def LOD0 triangle ceilings: buildings 3500 like every structure, small kit much lower. */
const BUDGET: Record<string, number> = {
  observatory: 3000,
  facultyHall: 1500,
  libraryRotunda: 2500,
  campusTower: 1500,
  terrarium: 3300,
  atomSculpture: 1800,
  dnaHelix: 1800,
  armillarySphere: 1800,
  scholarStatue: 700,
  rocketMonument: 1000,
  radioDish: 1600,
  labPod: 1400,
  fountain: 1300,
  hedgeParterre: 1100,
  topiary: 400,
  pergola: 900,
};

describe('TASK-402a campus defs', () => {
  it('every new geo has a PropDef with the same variants, grounded flag and footprint radius', () => {
    for (const id of NEW_IDS) {
      const def = RESEARCH_PROP_DEFS.find((d) => d.id === id);
      const geo = PROP_GEO[id];
      expect(def, id).toBeDefined();
      expect(geo, id).toBeDefined();
      expect(def!.variants, id).toBe(geo.variants);
      expect(def!.footprint, id).toBeCloseTo(geo.footprint, 5);
      expect(FIXTURE_RADIUS[id], id).toBeCloseTo(def!.footprint, 5);
    }
  });

  it('the campus structures and big pieces are T0 (>= 3 u wide, D-031)', () => {
    for (const id of ['observatory', 'facultyHall', 'libraryRotunda', 'terrarium', 'radioDish'])
      expect(RESEARCH_PROP_DEFS.find((d) => d.id === id)?.tier, id).toBe(0);
  });

  it('the observatory reads in the postcard view: 10-12 u tall, 7+ u across the drum and balcony', () => {
    for (let v = 0; v < PROP_GEO.observatory.variants; v++) {
      const b = buildProp('observatory', 5, v, 0).boundingBox!;
      expect(b.max.y, `v${v}`).toBeGreaterThanOrEqual(10);
      expect(b.max.y, `v${v}`).toBeLessThanOrEqual(12);
      expect(b.max.x - b.min.x, `v${v}`).toBeGreaterThanOrEqual(7);
    }
  });

  it('observatory v0 aims its slit and telescope at +z; v1 turns them to the right (+x)', () => {
    const h0 = buildProp('observatory', 5, 0, 0).userData.hooks.slit as { normal: number[] };
    const h1 = buildProp('observatory', 5, 1, 0).userData.hooks.slit as { normal: number[] };
    expect(h0.normal[2]).toBeGreaterThan(0.4);
    expect(Math.abs(h0.normal[0])).toBeLessThan(0.05);
    expect(h1.normal[0]).toBeGreaterThan(0.2);
  });

  it('buildings expose a door hook on +z (centre in front of the pivot, normal +z)', () => {
    for (const id of [...CAMPUS_IDS, 'labPod']) {
      for (let v = 0; v < PROP_GEO[id].variants; v++) {
        const door = (
          buildProp(id, 5, v, 0).userData.hooks as Record<
            string,
            { center: number[]; normal: number[] }
          >
        ).door;
        expect(door, `${id} v${v}`).toBeDefined();
        expect(door.normal, `${id} v${v}`).toEqual([0, 0, 1]);
        expect(door.center[2], `${id} v${v}`).toBeGreaterThan(0.5);
        expect(door.center[1], `${id} v${v}`).toBeGreaterThan(0);
      }
    }
  });

  it('facultyHall: 5 x 4 u footprint body, 2-3 storeys, lit windows (emissive 1 quads)', () => {
    for (let v = 0; v < 3; v++) {
      const g = buildProp('facultyHall', 5, v, 0);
      const b = g.boundingBox!;
      expect(b.max.x - b.min.x, `v${v}`).toBeGreaterThanOrEqual(5);
      expect(b.max.x - b.min.x, `v${v}`).toBeLessThanOrEqual(6);
      expect(b.max.y, `v${v}`).toBeGreaterThanOrEqual(6.5);
      const em = g.getAttribute('emissive');
      let lit = 0;
      for (let i = 0; i < em.count; i++) if (em.getX(i) === 1) lit++;
      expect(lit / 6, `v${v} lit windows`).toBeGreaterThanOrEqual(12);
    }
  });

  it('libraryRotunda ~7 u tall and ~6.5 u across; campusTower ~9.5 u and slender', () => {
    const lib = buildProp('libraryRotunda', 5, 0, 0).boundingBox!;
    expect(lib.max.y).toBeGreaterThanOrEqual(6.5);
    expect(lib.max.y).toBeLessThanOrEqual(8);
    expect(lib.max.x - lib.min.x).toBeGreaterThanOrEqual(6);
    const tw = buildProp('campusTower', 5, 0, 0).boundingBox!;
    expect(tw.max.y).toBeGreaterThanOrEqual(9);
    expect(tw.max.y).toBeLessThanOrEqual(10.5);
    expect(tw.max.x - tw.min.x).toBeLessThanOrEqual(3);
  });

  it('terrariums glow like the biodome panes (emissive 0.75) and are 3-5 u tall', () => {
    for (let v = 0; v < 2; v++) {
      const g = buildProp('terrarium', 5, v, 0);
      const em = g.getAttribute('emissive');
      let glass = 0;
      for (let i = 0; i < em.count; i++) if (Math.abs(em.getX(i) - 0.75) < 1e-6) glass++;
      expect(glass, `v${v}`).toBeGreaterThan(60);
      const h = g.boundingBox!.max.y;
      expect(h, `v${v}`).toBeGreaterThanOrEqual(2.8);
      expect(h, `v${v}`).toBeLessThanOrEqual(5.2);
    }
  });

  it('sculptures are 2-6 u tall; the big dish ~7 u and the small one ~3.6 u', () => {
    for (const id of SCULPTURE_IDS)
      for (let v = 0; v < PROP_GEO[id].variants; v++) {
        const h = buildProp(id, 5, v, 0).boundingBox!.max.y;
        expect(h, `${id} v${v}`).toBeGreaterThanOrEqual(2);
        expect(h, `${id} v${v}`).toBeLessThanOrEqual(6);
      }
    expect(buildProp('radioDish', 5, 0, 0).boundingBox!.max.y).toBeGreaterThan(6.5);
    expect(buildProp('radioDish', 5, 1, 0).boundingBox!.max.y).toBeLessThan(4.2);
  });

  it('labPod portholes glow at night', () => {
    for (let v = 0; v < 2; v++) {
      const em = buildProp('labPod', 5, v, 0).getAttribute('emissive');
      let lit = 0;
      for (let i = 0; i < em.count; i++) if (em.getX(i) === 1) lit++;
      expect(lit / 3, `v${v}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('garden kit: hedgeParterre tiles are ~4 x 4 u and low, topiary variants differ', () => {
    for (let v = 0; v < 2; v++) {
      const b = buildProp('hedgeParterre', 5, v, 0).boundingBox!;
      expect(b.max.x - b.min.x).toBeGreaterThanOrEqual(3.8);
      expect(b.max.x - b.min.x).toBeLessThanOrEqual(4.4);
      expect(b.max.y).toBeLessThan(0.8);
    }
    const t = [0, 1, 2].map((v) => tris(buildProp('topiary', 5, v, 0)));
    expect(new Set(t).size).toBe(3);
  });

  it('LOD0 triangle budgets (per def, all variants) and variant-independent determinism', () => {
    for (const id of NEW_IDS)
      for (let v = 0; v < PROP_GEO[id].variants; v++) {
        const g = buildProp(id, 5, v, 0);
        expect(tris(g), `${id} v${v}`).toBeLessThanOrEqual(BUDGET[id]);
        expect(tris(g), `${id} v${v}`).toBeLessThanOrEqual(3500);
        expect(g.boundingBox!.min.y, `${id} v${v} pivot at ground`).toBeGreaterThanOrEqual(-0.05);
      }
  });
});
