/** TASK-377: QA and Design structures (budgets, LOD1 consistency, hooks). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DESIGN_PROP_DEFS } from '../../content/props-themes/design.ts';
import { QA_PROP_DEFS } from '../../content/props-themes/qa.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { PROP_GEO, buildProp } from '../registry.ts';
import { DESIGN_GEO } from './design.ts';
import { QA_GEO } from './qa.ts';

const DEFS = [...QA_PROP_DEFS, ...DESIGN_PROP_DEFS];
const GEO = [...QA_GEO, ...DESIGN_GEO];
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

describe('TASK-377 structures', () => {
  it('every geo has a PropDef (and vice versa) with matching variants and windy flag', () => {
    expect(DEFS.map((d) => d.id).sort()).toEqual(GEO.map((d) => d.id).sort());
    for (const d of DEFS) {
      const g = PROP_GEO[d.geo];
      expect(g, d.id).toBeDefined();
      expect(d.variants, d.id).toBe(g.variants);
      expect((d.flags & PropFlag.windy) !== 0, d.id).toBe(g.windy);
    }
  });

  it('sculptures (3-5 u) and the barrier gate read from T0 (D-031)', () => {
    for (const id of ['sculptureTorus', 'sculptureStack', 'sculptureArch', 'barrierGate'])
      expect(DEFS.find((d) => d.id === id)?.tier, id).toBe(0);
    for (const id of ['sculptureTorus', 'sculptureStack', 'sculptureArch']) {
      const h = buildProp(id, 5, 0, 0).boundingBox!.max.y;
      expect(h, id).toBeGreaterThanOrEqual(3);
      expect(h, id).toBeLessThanOrEqual(5);
    }
  });

  it('blossomTree is a clusterable tree and uses the blossom canopy ramp', () => {
    const d = DEFS.find((x) => x.id === 'blossomTree')!;
    expect(d.flags & PropFlag.clusterable).toBeTruthy();
    const m = meanColor(buildProp('blossomTree', 5, 1, 1));
    // pink: red dominant over green and blue
    expect(m.r).toBeGreaterThan(m.g);
    expect(m.r).toBeGreaterThan(m.b);
  });

  for (const def of GEO) {
    for (let v = 0; v < def.variants; v++) {
      it(`${def.id} v${v}: budget, LOD1 share and cross-tier colour`, () => {
        const g0 = buildProp(def.id, 5, v, 0);
        const g1 = buildProp(def.id, 5, v, 1);
        expect(tris(g0)).toBeLessThanOrEqual(3500);
        expect(tris(g1)).toBeLessThanOrEqual(0.3 * tris(g0));
        const m0 = meanColor(g0);
        const m1 = meanColor(g1);
        expect(Math.abs(m0.r - m1.r), `${def.id} r`).toBeLessThan(0.09);
        expect(Math.abs(m0.g - m1.g), `${def.id} g`).toBeLessThan(0.09);
        expect(Math.abs(m0.b - m1.b), `${def.id} b`).toBeLessThan(0.09);
        const b0 = g0.boundingBox!;
        const b1 = g1.boundingBox!;
        expect(b0.min.y).toBeGreaterThanOrEqual(-0.05);
        expect(b1.min.y).toBeGreaterThanOrEqual(-0.05);
        const s0 = b0.getSize(new THREE.Vector3());
        const s1 = b1.getSize(new THREE.Vector3());
        expect(Math.abs(s1.y / s0.y - 1), `${def.id} height`).toBeLessThan(0.15);
        expect(Math.abs(s1.x - s0.x) / Math.max(s0.x, 1), `${def.id} width`).toBeLessThan(0.3);
        expect(Math.abs(s1.z - s0.z) / Math.max(s0.z, 2), `${def.id} depth`).toBeLessThan(0.4);
        expect(g0.getAttribute('emissive')).toBeDefined();
        expect(g1.getAttribute('emissive')).toBeDefined();
      });
    }
  }

  it('easel and checklistBoard expose their face hooks; sculptures expose a standing ring', () => {
    const hooks = (id: string): Record<string, { size?: number[] }> =>
      buildProp(id, 5, 0, 0).userData.hooks as Record<string, { size?: number[] }>;
    expect(hooks('easel').canvas.size).toHaveLength(2);
    expect(hooks('checklistBoard').board.size).toHaveLength(2);
    for (const id of ['sculptureTorus', 'sculptureStack', 'sculptureArch'])
      expect(hooks(id).sculpture).toBeDefined();
    expect(hooks('barrierGate').gate).toBeDefined();
  });

  it('blossom trees and planters sway', () => {
    for (const id of ['blossomTree', 'paintPotPlanter']) {
      const w = buildProp(id, 5, 0, 0).getAttribute('wind');
      let max = 0;
      for (let i = 0; i < w.count; i++) max = Math.max(max, w.getX(i));
      expect(max, id).toBeGreaterThan(0);
    }
  });
});
