/** TASK-405 "Ember Works" structures and mover routes (budgets, LOD1 consistency, closed forms). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEVOPS_MOVERS } from '../../content/themes/devops.ts';
import { FIXTURE_EMITTERS } from '../../content/offices.ts';
import { PROP_DEFS } from '../../content/props.ts';
import { DEVOPS_WORKS } from '../../content/props-themes/devops.ts';
import { loopPose, shipPose, trainAt, type Loop } from '../../render/harbour-routes.ts';
import { buildProp } from '../registry.ts';
import { DEVOPS_WORKS_GEO, buildCargoShip } from './devops-works.ts';

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

describe('TASK-405 Ember Works structures', () => {
  it('one variant each; the ≥ 3 u structures read from T0, the smithy from T2', () => {
    for (const g of DEVOPS_WORKS_GEO) {
      const d = PROP_DEFS.find((p) => p.id === g.id);
      expect(d?.variants, g.id).toBe(1);
    }
    for (const id of ['containerYard', 'foundry'])
      expect(PROP_DEFS.find((p) => p.id === id)?.tier, id).toBe(0);
    expect(PROP_DEFS.find((p) => p.id === 'smithy')?.tier).toBe(2);
  });

  for (const def of DEVOPS_WORKS_GEO.filter((d) => d.id !== 'railTrack')) {
    it(`${def.id}: LOD1 keeps the LOD0 palette and silhouette`, () => {
      const g0 = buildProp(def.id, 5, 0, 0);
      const g1 = buildProp(def.id, 5, 0, 1);
      expect(tris(g1)).toBeLessThanOrEqual(0.3 * tris(g0));
      const m0 = meanColor(g0);
      const m1 = meanColor(g1);
      for (const k of ['r', 'g', 'b'] as const)
        expect(Math.abs(m0[k] - m1[k]), `${def.id} ${k}`).toBeLessThan(0.09);
      const s0 = g0.boundingBox!.getSize(new THREE.Vector3());
      const s1 = g1.boundingBox!.getSize(new THREE.Vector3());
      expect(Math.abs(s1.y / s0.y - 1), `${def.id} height`).toBeLessThan(0.15);
      expect(Math.abs(s1.x - s0.x) / Math.max(s0.x, 1), `${def.id} width`).toBeLessThan(0.3);
      expect(Math.abs(s1.z - s0.z) / Math.max(s0.z, 2), `${def.id} depth`).toBeLessThan(0.4);
    });
  }

  it('the yard stays inside its planner footprint (the boom may overhang the quay at +z)', () => {
    const bb = buildProp('containerYard', 5, 0, 0).boundingBox!;
    const [w, d] = DEVOPS_WORKS.yard.footprint;
    expect(bb.min.x).toBeGreaterThanOrEqual(-w / 2 - 0.3);
    expect(bb.max.x).toBeLessThanOrEqual(w / 2 + 0.3);
    expect(bb.min.z).toBeGreaterThanOrEqual(-d / 2 - 0.3);
    // the control tower's pinwheel spins (aSpin), nothing else does
    const g = buildProp('containerYard', 5, 0, 0);
    const spin = g.getAttribute('aSpin').array as Float32Array;
    let n = 0;
    for (let i = 3; i < spin.length; i += 4) if (spin[i] === 1) n++;
    expect(n).toBeGreaterThan(0);
  });

  it('foundry and smithy smoke leaves their chimney tops', () => {
    for (const id of ['foundry', 'smithy']) {
      const bb = buildProp(id, 5, 0, 0).boundingBox!;
      for (const e of FIXTURE_EMITTERS[id][0]) {
        expect(e.y, id).toBeGreaterThan(bb.max.y - 0.6);
        expect(e.x, id).toBeGreaterThan(bb.min.x);
        expect(e.x, id).toBeLessThan(bb.max.x);
      }
    }
  });

  it('the cargo ship floats: hull below the waterline, bow at +z', () => {
    const g = buildCargoShip();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.y).toBeLessThan(0);
    expect(bb.max.z).toBeCloseTo(DEVOPS_WORKS.ship.l / 2, 1);
    expect(tris(g)).toBeLessThan(800);
  });
});

describe('TASK-405 mover routes (closed form)', () => {
  const L: Loop = {
    a: { x: 0, z: 0 },
    t: { x: 1, z: 0 },
    f: { x: 0, z: 1 },
    len: 20,
    r: 8,
    P: 40 + 16 * Math.PI,
    s0: 10,
  };

  it('the stadium loop is closed and continuous, its heading the unit tangent', () => {
    const a = loopPose(L, 0);
    const b = loopPose(L, L.P - 1e-6);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-3);
    let prev = loopPose(L, 0);
    for (let s = 0.25; s < L.P; s += 0.25) {
      const p = loopPose(L, s);
      expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThan(0.26);
      expect(Math.hypot(p.hx, p.hz)).toBeCloseTo(1, 5);
      prev = p;
    }
    // the far straight runs 2r out to sea
    expect(loopPose(L, L.len + Math.PI * L.r + 5).z).toBeCloseTo(2 * L.r, 5);
  });

  it('ships stop at the pier head for the dwell, spread over the cycle', () => {
    const S = DEVOPS_MOVERS.ship;
    for (const t of [0, S.dwell * 0.5, S.dwell - 0.01]) {
      const p = shipPose(L, t, 0, 2);
      expect(p.x).toBeCloseTo(L.s0, 5);
      expect(p.z).toBeCloseTo(0, 5);
    }
    const a = shipPose(L, 1, 0, 2);
    const b = shipPose(L, 1, 1, 2);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(5);
  });

  it('the ore train stays on its rail and dwells at both ends', () => {
    const T = DEVOPS_MOVERS.train;
    const len = 20;
    for (let t = 0; t < 200; t += 0.37) {
      const [s] = trainAt(len, t);
      expect(s).toBeGreaterThanOrEqual(0.8 - 1e-9);
      expect(s + (T.cars - 1) * T.gap).toBeLessThanOrEqual(len - 0.8 + 1e-9);
    }
    expect(trainAt(len, 0)[0]).toBeCloseTo(0.8, 6);
  });
});
