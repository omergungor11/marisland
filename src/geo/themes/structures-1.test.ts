/** TASK-375: HQ, Marketing and Research structures (budgets, LOD1 consistency, hooks). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HQ_PROP_DEFS } from '../../content/props-themes/hq.ts';
import { MARKETING_PROP_DEFS } from '../../content/props-themes/marketing.ts';
import { RESEARCH_PROP_DEFS } from '../../content/props-themes/research.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { PROP_GEO, buildProp } from '../registry.ts';
import { HQ_GEO } from './hq.ts';
import { MARKETING_GEO } from './marketing.ts';
import { RESEARCH_GEO } from './research.ts';

const DEFS = [...HQ_PROP_DEFS, ...MARKETING_PROP_DEFS, ...RESEARCH_PROP_DEFS];
const GEO = [...HQ_GEO, ...MARKETING_GEO, ...RESEARCH_GEO];
const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;

/** Area-weighted mean linear colour of a geometry. */
function meanColor(g: THREE.BufferGeometry): THREE.Color {
  const p = g.getAttribute('position');
  const c = g.getAttribute('color');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  let r = 0;
  let gg = 0;
  let bb = 0;
  let w = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1).sub(a);
    d.fromBufferAttribute(p, i + 2).sub(a);
    const area = b.cross(d).length() / 2;
    r += c.getX(i) * area;
    gg += c.getY(i) * area;
    bb += c.getZ(i) * area;
    w += area;
  }
  return new THREE.Color(r / w, gg / w, bb / w);
}

describe('TASK-375 structures', () => {
  it('every geo has a PropDef (and vice versa) with matching variants and windy flag', () => {
    expect(DEFS.map((d) => d.id).sort()).toEqual(GEO.map((d) => d.id).sort());
    for (const d of DEFS) {
      const g = PROP_GEO[d.geo];
      expect(g, d.id).toBeDefined();
      expect(d.variants, d.id).toBe(g.variants);
      expect((d.flags & PropFlag.windy) !== 0, d.id).toBe(g.windy);
    }
  });

  it('structures >= 3 u wide read from T0 (D-031)', () => {
    for (const id of ['ferryOffice', 'billboardV2', 'stage', 'observatory'])
      expect(DEFS.find((d) => d.id === id)?.tier, id).toBe(0);
  });

  for (const def of GEO) {
    for (let v = 0; v < def.variants; v++) {
      it(`${def.id} v${v}: budget, LOD1 share and cross-tier colour`, () => {
        const g0 = buildProp(def.id, 5, v, 0);
        const g1 = buildProp(def.id, 5, v, 1);
        expect(tris(g0)).toBeLessThanOrEqual(3500);
        expect(tris(g1)).toBeLessThanOrEqual(0.3 * tris(g0));
        // same palette: area-weighted mean colour within 0.09 per channel (linear)
        const m0 = meanColor(g0);
        const m1 = meanColor(g1);
        expect(Math.abs(m0.r - m1.r), `${def.id} r`).toBeLessThan(0.09);
        expect(Math.abs(m0.g - m1.g), `${def.id} g`).toBeLessThan(0.09);
        expect(Math.abs(m0.b - m1.b), `${def.id} b`).toBeLessThan(0.09);
        // same silhouette: bounds within 15 %
        const b0 = g0.boundingBox!;
        const b1 = g1.boundingBox!;
        expect(b0.min.y).toBeGreaterThanOrEqual(-0.05);
        expect(b1.min.y).toBeGreaterThanOrEqual(-0.05);
        const s0 = b0.getSize(new THREE.Vector3());
        const s1 = b1.getSize(new THREE.Vector3());
        expect(Math.abs(s1.y / s0.y - 1), `${def.id} height`).toBeLessThan(0.15);
        expect(Math.abs(s1.x / s0.x - 1), `${def.id} width`).toBeLessThan(0.25);
        expect(Math.abs(s1.z / s0.z - 1), `${def.id} depth`).toBeLessThan(0.4);
        expect(g0.getAttribute('emissive')).toBeDefined();
        expect(g1.getAttribute('emissive')).toBeDefined();
      });
    }
  }

  it('structure variants share one palette (LOD1 is variant-independent in colour)', () => {
    for (const id of ['ferryOffice', 'billboardV2', 'stage', 'observatory']) {
      const a = meanColor(buildProp(id, 5, 0, 1));
      const b = meanColor(buildProp(id, 5, 1, 1));
      for (const k of ['r', 'g', 'b'] as const)
        expect(Math.abs(a[k] - b[k]), id).toBeLessThan(0.02);
    }
  });

  it('billboardV2 face is an emissive-2 screen with a hook', () => {
    for (const lod of [0, 1] as const) {
      const g = buildProp('billboardV2', 5, 0, lod);
      const em = g.getAttribute('emissive');
      const pos = g.getAttribute('position');
      let big = 0;
      for (let i = 0; i < pos.count; i++) if (em.getX(i) === 2) big++;
      expect(big).toBeGreaterThan(0);
      const hook = (g.userData.hooks as Record<string, { size: number[] }>).screen;
      expect(hook.size[0]).toBeGreaterThanOrEqual(4);
      expect(hook.size[0]).toBeLessThanOrEqual(6);
    }
  });

  it('weatherMast anemometer spins via aSpin and carries no sway on spinner vertices', () => {
    for (const lod of [0, 1] as const) {
      const g = buildProp('weatherMast', 5, 0, lod);
      const hub = g.userData.hub as number[];
      expect(hub).toHaveLength(3);
      const spin = g.getAttribute('aSpin');
      expect(spin.itemSize).toBe(4);
      let spun = 0;
      for (let i = 0; i < spin.count; i++) if (spin.getW(i) === 1) spun++;
      expect(spun).toBeGreaterThan(0);
      expect(spun).toBeLessThan(spin.count);
    }
  });

  it('cloth props sway (wind weights baked)', () => {
    for (const id of ['banner', 'bannerPole', 'stage', 'ferryOffice']) {
      const w = buildProp(id, 5, 0, 0).getAttribute('wind');
      let max = 0;
      for (let i = 0; i < w.count; i++) max = Math.max(max, w.getX(i));
      expect(max, id).toBeGreaterThan(0);
    }
  });
});
