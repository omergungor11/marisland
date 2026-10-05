import { describe, expect, it } from 'vitest';
import { lotFaceToWorldYaw, lotLocalToWorld, lotYaw } from './lot-frame.ts';
import { OFFICE_DEFS, WORK_SPOTS } from '../content/offices.ts';

/** three's rotation.y applied to a local (x, z) offset. */
const rotY = (yaw: number, x: number, z: number) => ({
  x: x * Math.cos(yaw) + z * Math.sin(yaw),
  z: -x * Math.sin(yaw) + z * Math.cos(yaw),
});

describe('lot frame', () => {
  const lots = [0, 0.7, 2.1, -1.3, Math.PI].map((r) => ({ x: 10, z: -4, rotY: r }));

  it('matches three rotation.y with lotYaw (render convention)', () => {
    for (const lot of lots) {
      for (const [lx, lz] of [
        [1, 0],
        [0, 1],
        [-0.9, 0.4],
        [2.5, -1.5],
      ]) {
        const w = lotLocalToWorld(lot, lx, lz);
        const r = rotY(lotYaw(lot), lx, lz);
        expect(w.x).toBeCloseTo(lot.x + r.x, 9);
        expect(w.z).toBeCloseTo(lot.z + r.z, 9);
      }
    }
  });

  it('local +z is the facing direction', () => {
    for (const lot of lots) {
      const w = lotLocalToWorld(lot, 0, 1);
      expect(w.x - lot.x).toBeCloseTo(Math.cos(lot.rotY), 9);
      expect(w.z - lot.z).toBeCloseTo(Math.sin(lot.rotY), 9);
    }
  });

  it('reproduces the legacy chimney offset of settlement-props', () => {
    for (const lot of lots) {
      const fx = Math.cos(lot.rotY);
      const fz = Math.sin(lot.rotY);
      const w = lotLocalToWorld(lot, -0.9, 0.4);
      expect(w.x).toBeCloseTo(lot.x - fz * 0.9 + fx * 0.4, 9);
      expect(w.z).toBeCloseTo(lot.z + fx * 0.9 + fz * 0.4, 9);
    }
  });

  it('face 0 looks along the facing in world space', () => {
    for (const lot of lots) {
      const yaw = lotFaceToWorldYaw(lot, 0);
      // three object looking down local +z after rotation.y = yaw
      expect(Math.sin(yaw)).toBeCloseTo(Math.cos(lot.rotY), 9);
      expect(Math.cos(yaw)).toBeCloseTo(Math.sin(lot.rotY), 9);
    }
  });
});

describe('office work spots', () => {
  it('every themed spot lies inside its footprint, ≥ 0.4 u from the edges', () => {
    for (const [def, o] of Object.entries(OFFICE_DEFS)) {
      const spots = WORK_SPOTS[def];
      expect(spots, def).toBeDefined();
      for (const s of spots) {
        expect(Math.abs(s.x), `${def} x`).toBeLessThanOrEqual(o.w / 2 - 0.4 + 1e-9);
        expect(Math.abs(s.z), `${def} z`).toBeLessThanOrEqual(o.d / 2 - 0.4 + 1e-9);
      }
    }
  });
});
