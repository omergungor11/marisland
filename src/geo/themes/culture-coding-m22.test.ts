/** TASK-479 Coding M22 geometry: windsock, fairy wreath, pinwheel (kite v3), weather-vane pods, tip lamps. */
import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BLINK, MOTION_TAG } from '../../content/activity.ts';
import { CODING_M22_PROP_DEFS } from '../../content/props-themes/coding.ts';
import { PROP_DEF_INDEX } from '../../content/props.ts';
import { buildProp } from '../registry.ts';
import { PINWHEEL_VARIANT } from './culture-coding-m22.ts';

const attr = (g: THREE.BufferGeometry, n: string): Float32Array =>
  g.getAttribute(n).array as Float32Array;
const verts = (g: THREE.BufferGeometry): number => g.getAttribute('position').count;

describe('TASK-479 Coding M22 kit', () => {
  it('the new defs follow the rim post at the end of PROP_DEFS and line up with their geo', () => {
    for (const d of CODING_M22_PROP_DEFS) {
      expect(PROP_DEF_INDEX[d.id], d.id).toBeGreaterThan(0);
      const g = buildProp(d.geo, 5, 0, 0);
      expect(verts(g), d.id).toBeGreaterThan(0);
    }
    // appended as one block after the M22 rim post (later blocks, e.g. TASK-485 stairFlight, follow)
    const ids = Object.keys(PROP_DEF_INDEX);
    const at = ids.indexOf('rimPost') + 1;
    expect(ids.slice(at, at + CODING_M22_PROP_DEFS.length)).toEqual(
      CODING_M22_PROP_DEFS.map((d) => d.id),
    );
  });

  it('windsock: pole on the ground, the sock streams along +x, tail sways more than the pole', () => {
    const g = buildProp('windsock', 5, 0, 0);
    g.computeBoundingBox();
    const bb = g.boundingBox as THREE.Box3;
    expect(bb.min.y).toBeGreaterThanOrEqual(-0.05);
    expect(bb.max.x).toBeGreaterThan(1.3);
    expect(bb.min.x).toBeGreaterThan(-0.4);
    const pos = attr(g, 'position');
    const wind = attr(g, 'wind');
    let tail = 0;
    let pole = 0;
    for (let i = 0; i < verts(g); i++) {
      if (pos[i * 3] > 1.2) tail = Math.max(tail, wind[i]);
      if (Math.abs(pos[i * 3]) < 0.1 && pos[i * 3 + 1] < 1.5) pole = Math.max(pole, wind[i]);
    }
    expect(tail).toBeGreaterThan(0.5);
    expect(pole).toBeLessThan(0.1);
  });

  it('fairyWreath: bulbs only (emissive 1), each on its roundTree canopy, same rng stream', () => {
    for (let v = 0; v < 3; v++) {
      const w = buildProp('fairyWreath', 9, v, 0);
      const tree = buildProp('roundTree', 9, v, 0);
      const em = attr(w, 'emissive');
      expect(
        em.every((x) => x === 1),
        `v${v}`,
      ).toBe(true);
      expect(verts(w) / 3, `v${v}`).toBeGreaterThan(60);
      // every bulb vertex sits within 0.45 u of a canopy vertex
      const tp = attr(tree, 'position');
      const wp = attr(w, 'position');
      let far = 0;
      for (let i = 0; i < verts(w); i += 3) {
        let best = Infinity;
        for (let j = 0; j < verts(tree); j++) {
          const d = Math.hypot(
            wp[i * 3] - tp[j * 3],
            wp[i * 3 + 1] - tp[j * 3 + 1],
            wp[i * 3 + 2] - tp[j * 3 + 2],
          );
          if (d < best) best = d;
        }
        if (best > 0.45) far++;
      }
      expect(far, `v${v}`).toBe(0);
    }
  });

  it('pinwheel (kite v3): four vanes spin about one hub, the stake does not', () => {
    const g = buildProp('kite', 5, PINWHEEL_VARIANT, 0);
    const spin = attr(g, 'aSpin');
    let spinning = 0;
    for (let i = 0; i < verts(g); i++)
      if (spin[i * 4 + 3] === MOTION_TAG.spin) {
        spinning++;
        expect(spin[i * 4]).toBeCloseTo(0, 5);
        expect(spin[i * 4 + 1]).toBeGreaterThan(1);
      }
    expect(spinning).toBeGreaterThanOrEqual(24);
    expect(spinning).toBeLessThan(verts(g));
    expect((g.userData.hubs as number[][]).length).toBe(1);
  });

  it('devPod v2 / v3: a yaw-tagged weather vane on the roof centre, v0 / v1 stay untagged', () => {
    for (const v of [0, 1, 2, 3]) {
      const g = buildProp('devPod', 5, v, 0);
      const w = g.getAttribute('aSpin');
      let yaw = 0;
      let x = 0;
      let z = 0;
      for (let i = 0; w && i < verts(g); i++)
        if (w.getW(i) === MOTION_TAG.yaw) {
          yaw++;
          x = Math.max(x, Math.abs(g.getAttribute('position').getX(i)));
          z = Math.max(z, Math.abs(g.getAttribute('position').getZ(i)));
        }
      if (v < 2) expect(yaw, `v${v}`).toBe(0);
      else {
        expect(yaw, `v${v}`).toBeGreaterThan(20);
        // the arrow turns on the mast: it stays within 0.7 u of the object's y axis
        expect(Math.max(x, z), `v${v}`).toBeLessThan(0.7);
      }
      // the far proxy has no vane
      const g1 = buildProp('devPod', 5, v, 1);
      expect(g1.getAttribute('aSpin'), `v${v} lod1`).toBeUndefined();
    }
  });

  it('windTurbine: red tip lamps on every blade, blinking lamp class at both LODs', () => {
    for (const lod of [0, 1] as const) {
      const g = buildProp('windTurbine', 7, 1, lod);
      const em = attr(g, 'emissive');
      const spin = attr(g, 'aSpin');
      let lit = 0;
      for (let i = 0; i < em.length; i++)
        if (em[i] === BLINK.base + 1) {
          lit++;
          // a lamp spins with its blade (rotor tag 3 = yaw + spin)
          expect(spin[i * 4 + 3], `lod${lod}`).toBe(MOTION_TAG.yawSpin);
        }
      // 3 blades × one box (12 tris)
      expect(lit, `lod${lod}`).toBe(3 * 36);
    }
  });
});
