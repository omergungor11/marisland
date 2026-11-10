/**
 * Shared parts of the Deniz Üstü Lunapark kit (M53 TASK-670, D-170 family): lit bulbs, striped
 * wedges and cylinders, rods. Every colour and size comes from content/themes/marketing-luna-look.ts.
 */
import * as THREE from 'three';
import { LUNA_LOOK } from '../../content/themes/marketing-luna-look.ts';
import { col, qEuler, qFromTo, type Acc } from '../kit.ts';
import { TAU, V, baseBox, cylB, put } from '../parts.ts';

export const P = LUNA_LOOK.pal;
/** Lamp class (night ramp, emissive 1): bulbs, neon, lit panes. */
export const lit = { emissive: 1, aoAmt: 0, ao: () => 1, noJitter: true } as const;
export const flat = { aoAmt: 0, ao: () => 1 } as const;
/** Cloth: canopy, awning (fabric class). */
export const cloth = { aoAmt: 0, ao: () => 1, noJitter: true, cls: 'fabric' } as const;

/** A lit bulb (octahedron, 8 tris). */
export function bulb(
  acc: Acc,
  at: THREE.Vector3 | [number, number, number],
  r: number,
  color: string,
): void {
  put(acc, new THREE.OctahedronGeometry(r, 0), at, color, lit);
}

/** Pole / rod from a to b. */
export function rod(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  color: string,
  seg = 4,
  cls?: 'metal' | 'wood',
): void {
  const d = b.clone().sub(a);
  put(acc, cylB(r, r, d.length(), seg, true), a, color, {
    q: qFromTo(V(0, 1, 0), d),
    aoAmt: 0,
    cls,
  });
}

/** Square-section beam from a to b. */
export function beam(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  th: number,
  color: string,
  cls?: 'metal' | 'wood',
): void {
  const d = b.clone().sub(a);
  put(acc, baseBox(th, d.length(), th), a, color, { q: qFromTo(V(0, 1, 0), d), aoAmt: 0, cls });
}

/** Colour of wedge `k` of `n` round (cx, cz), alternating between the colours of `set`. */
export function wedge(
  cx: number,
  cz: number,
  n: number,
  set: readonly string[],
): (p: THREE.Vector3) => THREE.Color {
  const cs = set.map(col);
  return (p) => {
    const k = Math.floor(((Math.atan2(p.z - cz, p.x - cx) + Math.PI) / TAU) * n) % n;
    return cs[k % cs.length];
  };
}

/** A cone / frustum canopy: alternating wedges, double sided cloth. `y` = rim height. */
export function canopy(
  acc: Acc,
  at: [number, number, number],
  r: number,
  rise: number,
  segs: number,
  set: readonly string[],
  top = 0.02,
  double = true,
): void {
  put(
    acc,
    new THREE.CylinderGeometry(top, r, rise, segs, 1, true).translate(0, rise / 2, 0),
    at,
    wedge(at[0], at[2], segs, set),
    { ...cloth, double },
  );
}

/** Stack of `bands` coloured cylinders (candy pole) from y0 to y0 + h, radius r0 -> r1. */
export function candyPole(
  acc: Acc,
  at: [number, number, number],
  r0: number,
  r1: number,
  h: number,
  bands: number,
  set: readonly string[],
  seg: number,
  cls?: 'metal' | 'wood',
): void {
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    put(
      acc,
      cylB(r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, h / bands, seg, i > 0 && i < bands - 1),
      [at[0], at[1] + h * t0, at[2]],
      set[i % set.length],
      { aoAmt: 0.1, cls },
    );
  }
}

/** Flat panel of lit colour facing +z at `at`, rotated about y by `yaw`. */
export function pane(
  acc: Acc,
  at: [number, number, number],
  w: number,
  h: number,
  color: string,
  yaw = 0,
  emissive = 1,
): void {
  put(acc, new THREE.PlaneGeometry(w, h), at, color, {
    q: qEuler(0, yaw, 0),
    emissive,
    aoAmt: 0,
    ao: () => 1,
    noJitter: true,
  });
}
