/**
 * Horseshoe Harbour moored boats and the finger pontoon (M52 TASK-660, D-170): `quayBoat` variants
 * 0-3 are a sailing yacht (furled sail, tall mast), a motor cruiser, an open day boat and a painted
 * caique; variant 4 is one pontoon segment. Numbers: content/themes/marketing-marina-look.ts.
 *
 * Frames: floating fixtures, pivot on the water line (y = 0), bow +z, the hull sinks `draft` u
 * under it. LOD0 boats bob (`tagBob`); the pontoon does not.
 */
import * as THREE from 'three';
import { MARINA_LOOK as L } from '../../content/themes/marketing-marina-look.ts';
import { hullShape } from '../coastal.ts';
import { Acc, col, qEuler, qFromTo, type PartOpts } from '../kit.ts';
import { V, baseBox, cylB, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { pennant } from './hq.ts';
import { tagBob } from './surface-tags.ts';

const P = L.pal;
const B = L.boat;
const dr = B.draft;
const flat = { aoAmt: 0, ao: () => 1 } as const;
const lit = { emissive: 1, aoAmt: 0, ao: () => 1, noJitter: true, cls: 'glass' } as const;

/** Hull slab from y0 to y1 (extruded down from y1). `t`: wall thickness (>0 makes an open ring). */
function slab(
  len: number,
  beam: number,
  y0: number,
  y1: number,
  scale = 1,
  t = 0,
): THREE.BufferGeometry {
  const shape = hullShape(len, beam);
  if (t > 0) shape.holes.push(new THREE.Path(hullShape(len - 2 * t, beam - 2 * t).getPoints()));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(Math.PI / 2).translate(0, y1, 0);
  return g.scale(scale, 1, 1);
}

function band(
  acc: Acc,
  len: number,
  beam: number,
  y0: number,
  y1: number,
  scale: number,
  color: PartOpts['color'] | string,
  t = 0,
  ao = 0.1,
): void {
  put(acc, slab(len, beam, y0, y1, scale, t), [0, 0, 0], color, { aoAmt: ao });
}

/** A short vertical fender on the hull side. */
function fender(acc: Acc, x: number, y: number, z: number, color: string): void {
  put(acc, cylB(0.06, 0.06, 0.34, 5, true), [x, y, z], color, { aoAmt: 0 });
}

/** Cylinder from a to b. */
function rod(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  color: string,
  seg = 4,
): void {
  const d = b.clone().sub(a);
  put(acc, cylB(r, r, d.length(), seg, true), a, color, {
    q: qFromTo(V(0, 1, 0), d),
    aoAmt: 0,
  });
}

function sloop(acc: Acc, hi: boolean): void {
  const S = B.sloop;
  const { len, beam, deckY } = S;
  if (hi) {
    band(acc, len, beam, -dr, 0.35, 0.9, S.boot, 0, 0.3);
    band(acc, len, beam, 0.35, 0.62, 0.99, S.side);
    band(acc, len, beam, 0.62, 0.74, 1.02, S.stripe, 0, 0);
    band(acc, len, beam, 0.74, deckY, 1.01, S.side);
    put(acc, slab(len, beam, deckY, deckY + 0.04, 0.93), [0, 0, 0], P.woodLight, {
      aoAmt: 0,
      cls: 'wood',
    });
  } else {
    band(acc, len, beam, -dr, deckY, 1.0, S.side, 0, 0.3);
  }
  const dy = deckY + (hi ? 0.04 : 0);
  put(acc, baseBox(1.0, 0.42, 1.7), [0, dy, -0.75], S.side, { aoAmt: 0.1 });
  const mz = S.mastZ;
  put(acc, cylB(0.075, 0.045, S.mastH - dy, hi ? 5 : 4, true), [0, dy, mz], P.ink, {
    aoAmt: 0,
    cls: 'metal',
  });
  // the furled mainsail on the boom, the furled genoa on the forestay
  put(acc, cylB(0.12, 0.12, 2.3, hi ? 6 : 4, !hi), [0, dy + 0.95, mz - 0.1], S.sail, {
    q: qEuler(-Math.PI / 2, 0, 0),
    aoAmt: 0.1,
    cls: 'fabric',
    noJitter: true,
  });
  if (!hi) return;
  for (const sx of [-1, 1]) {
    for (const z of [-0.45, -1.0]) {
      put(acc, new THREE.PlaneGeometry(0.4, 0.15), [sx * 0.505, dy + 0.24, z], P.window, {
        ...lit,
        q: qEuler(0, (sx * Math.PI) / 2, 0),
      });
    }
    fender(acc, sx * ((beam / 2) * 0.96), 0.3, -0.5, P.accent);
    fender(acc, sx * ((beam / 2) * 0.96), 0.3, 0.9, P.accent);
  }
  put(acc, baseBox(0.5, 0.05, 0.5), [0, dy + 0.42, -0.75], P.woodLight, { aoAmt: 0, cls: 'wood' });
  rod(acc, V(0, dy + 0.2, len / 2 - 0.55), V(0, S.mastH - 0.9, mz), 0.055, S.sail);
  rod(acc, V(0, S.mastH - 0.1, mz), V(0, dy + 0.4, -len / 2 + 0.2), 0.012, P.ink, 3);
  put(acc, baseBox(1.0, 0.04, 0.04), [0, dy + 4.1, mz], P.ink, { aoAmt: 0, cls: 'metal' });
  pennant(acc, V(0, S.mastH - 0.05, mz), 0.75, 0.24, P.accent, 0);
}

function cruiser(acc: Acc, hi: boolean): void {
  const C = B.cruiser;
  const { len, beam, deckY } = C;
  if (hi) {
    band(acc, len, beam, -dr, 0.35, 0.9, C.boot, 0, 0.3);
    band(acc, len, beam, 0.35, 0.62, 0.99, C.side);
    band(acc, len, beam, 0.62, 0.74, 1.02, C.stripe, 0, 0);
    band(acc, len, beam, 0.74, deckY, 1.01, C.side);
    put(acc, slab(len, beam, deckY, deckY + 0.04, 0.93), [0, 0, 0], P.woodLight, {
      aoAmt: 0,
      cls: 'wood',
    });
  } else {
    band(acc, len, beam, -dr, deckY, 1.0, C.side, 0, 0.3);
  }
  const dy = deckY + (hi ? 0.04 : 0);
  put(acc, baseBox(1.5, 0.62, 2.0), [0, dy, -0.5], C.side, { aoAmt: 0.1 });
  if (hi) put(acc, baseBox(1.62, 0.08, 2.15), [0, dy + 0.62, -0.5], P.trim, { aoAmt: 0 });
  put(acc, baseBox(1.1, 0.42, 1.1), [0, dy + 0.7, -0.75], C.side, { aoAmt: 0.1 });
  if (hi) put(acc, baseBox(1.22, 0.07, 1.2), [0, dy + 1.12, -0.75], P.trim, { aoAmt: 0 });
  // wheelhouse windows (emissive 1), the windscreen front
  put(acc, new THREE.PlaneGeometry(1.2, 0.3), [0, dy + 0.4, 0.505], P.window, {
    ...lit,
    q: qEuler(-0.25, 0, 0),
  });
  put(acc, new THREE.PlaneGeometry(0.9, 0.26), [0, dy + 0.92, -0.195], P.window, lit);
  if (!hi) {
    rod(acc, V(0, dy + 1.1, -1.0), V(0, 2.3, -1.0), 0.04, P.ink);
    return;
  }
  for (const sx of [-1, 1]) {
    for (const z of [-0.1, -0.7, -1.3])
      put(acc, new THREE.PlaneGeometry(0.4, 0.22), [sx * 0.755, dy + 0.32, z], P.window, {
        ...lit,
        q: qEuler(0, (sx * Math.PI) / 2, 0),
      });
    fender(acc, sx * ((beam / 2) * 0.97), 0.32, -0.9, P.accent);
    fender(acc, sx * ((beam / 2) * 0.97), 0.32, 0.7, P.accent);
    put(acc, baseBox(0.07, 0.4, 0.07), [sx * 0.42, dy + 1.19, -1.15], P.ink, {
      aoAmt: 0,
      cls: 'metal',
    });
  }
  put(acc, baseBox(1.0, 0.07, 0.07), [0, dy + 1.55, -1.15], P.ink, { aoAmt: 0, cls: 'metal' });
  put(acc, baseBox(0.34, 0.16, 0.34), [0, dy + 1.62, -1.15], P.white, { aoAmt: 0, cls: 'metal' });
  put(acc, baseBox(0.6, 0.1, 0.6), [0, dy, 1.3], P.woodLight, { aoAmt: 0, cls: 'wood' });
  // swim platform and a stern flag
  put(acc, baseBox(1.2, 0.06, 0.45), [0, 0.36, -len / 2 - 0.1], P.woodLight, {
    aoAmt: 0.1,
    cls: 'wood',
  });
  put(acc, cylB(0.025, 0.02, 0.9, 4, true), [0.6, dy, -len / 2 + 0.2], P.ink, { aoAmt: 0 });
  pennant(acc, V(0.6, dy + 0.85, -len / 2 + 0.2), 0.5, 0.2, P.accent, 0);
}

function dayBoat(acc: Acc, hi: boolean): void {
  const D = B.day;
  const { len, beam, floorY, rimY } = D;
  const deck = (p: THREE.Vector3): THREE.Color =>
    p.y > floorY - 0.01 ? col(P.woodLight) : col(D.hull);
  const rim = (p: THREE.Vector3): THREE.Color => (p.y > rimY - 0.01 ? col(D.rim) : col(D.hull));
  if (hi) {
    band(acc, len, beam, -dr, floorY, 0.92, deck, 0, 0.25);
    band(acc, len, beam, floorY, rimY, 1.03, rim, 0.07, 0.05);
  } else {
    band(acc, len, beam, -dr, rimY, 1.0, rim, 0, 0.25);
  }
  const [ca, cb] = D.canopy;
  if (!hi) {
    put(acc, baseBox(beam * 0.9, 0.08, 1.7), [0, 1.3, -0.2], ca, { aoAmt: 0, cls: 'fabric' });
    for (const sx of [-1, 1])
      put(acc, cylB(0.03, 0.03, 1.3 - rimY, 3, true), [sx * (beam / 2 - 0.1), rimY, -0.5], P.ink, {
        aoAmt: 0,
      });
    return;
  }
  for (const z of [-0.2, 0.55])
    put(acc, baseBox(beam - 0.3, 0.07, 0.28), [0, floorY + 0.2, z], P.woodLight, {
      aoAmt: 0.1,
      cls: 'wood',
    });
  put(acc, baseBox(0.24, 0.5, 0.22), [0, rimY - 0.2, -len / 2 + 0.08], P.ink, {
    aoAmt: 0.1,
    cls: 'metal',
  });
  put(acc, baseBox(0.5, 0.3, 0.34), [0.3, floorY, -0.85], P.sky, { aoAmt: 0.1 });
  for (const sx of [-1, 1]) {
    fender(acc, sx * ((beam / 2) * 1.0), 0.45, 0.35, P.accent);
    for (const z of [-0.8, 0.5])
      put(acc, cylB(0.02, 0.02, 1.3 - rimY, 3, true), [sx * (beam / 2 - 0.1), rimY, z], P.ink, {
        aoAmt: 0,
      });
  }
  // striped bimini
  const n = 4;
  const cw = (beam - 0.1) / n;
  for (let i = 0; i < n; i++)
    put(
      acc,
      new THREE.PlaneGeometry(cw, 1.45),
      [-((beam - 0.1) / 2) + cw * (i + 0.5), 1.3, -0.15],
      i % 2 ? cb : ca,
      {
        ...flat,
        double: true,
        noJitter: true,
        cls: 'fabric',
        q: qEuler(-Math.PI / 2, 0, 0),
      },
    );
}

function caique(acc: Acc, hi: boolean): void {
  const C = B.caique;
  const { len, beam, floorY, rimY } = C;
  const rim = (p: THREE.Vector3): THREE.Color => (p.y > rimY - 0.01 ? col(C.rim) : col(C.hull));
  const mid = floorY + (rimY - floorY) * 0.5;
  if (hi) {
    band(
      acc,
      len,
      beam,
      -dr,
      floorY,
      0.9,
      (p) => (p.y > floorY - 0.01 ? col(P.woodLight) : col(C.hull)),
      0,
      0.25,
    );
    band(acc, len, beam, floorY, mid, 1.03, C.hull, 0.07, 0.05);
    band(
      acc,
      len,
      beam,
      mid,
      rimY,
      1.04,
      (p) => (p.y > rimY - 0.01 ? col(C.rim) : col(C.stripe)),
      0.07,
      0,
    );
  } else {
    band(acc, len, beam, -dr, rimY, 1.0, rim, 0, 0.25);
  }
  // the high bow and the low stern post
  put(acc, baseBox(0.12, 0.95, 0.16), [0, rimY - 0.2, len / 2 - 0.1], C.hull, {
    q: qEuler(0.42, 0, 0),
    aoAmt: 0.05,
  });
  if (hi) {
    put(acc, new THREE.OctahedronGeometry(0.1, 0), [0, rimY + 0.68, len / 2 + 0.27], P.accent, {
      aoAmt: 0,
      noJitter: true,
    });
    put(acc, baseBox(0.12, 0.55, 0.16), [0, rimY - 0.15, -len / 2 + 0.1], C.hull, {
      q: qEuler(-0.25, 0, 0),
      aoAmt: 0.05,
    });
  }
  const my = floorY + 0.02;
  // cabin hood (half cylinder along z) and the foredeck
  put(
    acc,
    new THREE.CylinderGeometry(
      beam * 0.34,
      beam * 0.34,
      1.2,
      hi ? 8 : 6,
      1,
      true,
      -Math.PI / 2,
      Math.PI,
    ).rotateX(-Math.PI / 2),
    [0, rimY - 0.15, -0.45],
    P.trim,
    { double: hi, aoAmt: 0.05, cls: 'fabric', noJitter: true },
  );
  put(acc, cylB(0.04, 0.03, C.mastH - my, hi ? 5 : 4, true), [0, my, 1.0], P.wood, {
    aoAmt: 0,
    cls: 'wood',
  });
  pennant(acc, V(0, C.mastH - 0.12, 1.0), 0.6, 0.22, P.accent, 0);
  if (!hi) return;
  put(acc, baseBox(beam * 0.62, 0.06, 0.9), [0, rimY - 0.04, 0.85], P.woodLight, {
    aoAmt: 0.1,
    cls: 'wood',
  });
  put(acc, baseBox(beam - 0.3, 0.07, 0.26), [0, floorY + 0.2, -1.2], P.woodLight, {
    aoAmt: 0.1,
    cls: 'wood',
  });
  // the painted bow eyes
  for (const sx of [-1, 1]) {
    const q = qEuler(0, sx * 1.05, 0);
    put(acc, new THREE.CircleGeometry(0.13, 6), [sx * 0.68, floorY + 0.3, len / 2 - 1.1], P.white, {
      ...flat,
      q,
      noJitter: true,
    });
    put(acc, new THREE.CircleGeometry(0.06, 5), [sx * 0.69, floorY + 0.3, len / 2 - 1.09], P.ink, {
      ...flat,
      q,
      noJitter: true,
    });
  }
}

function boat({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = jitterAcc(rng, 0.012);
  [sloop, cruiser, dayBoat, caique][variant](acc, hi);
  const g = acc.finish(rng, false, true);
  if (hi && B.bob) tagBob(g);
  return g;
}

/** One finger pontoon segment: floats under a planked deck, cleats down both edges. */
function pontoon({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const K = L.pontoon;
  const hi = lod === 0;
  const acc = new Acc();
  const top = K.deckTop;
  put(acc, baseBox(K.w, K.deckThick, K.len), [0, top - K.deckThick - 0.012, 0], P.dock, {
    aoAmt: 0.1,
    cls: 'wood',
  });
  if (hi) {
    const nz = Math.round(K.len / K.plank);
    const pl = new THREE.PlaneGeometry(K.w - 0.04, K.len - 0.04, 1, nz).rotateX(-Math.PI / 2);
    put(
      acc,
      pl,
      [0, top, 0],
      (p) => col(K.tones[Math.floor((p.z + K.len / 2) / K.plank) % K.tones.length]),
      { aoAmt: 0, ao: () => 1, noJitter: true, cls: 'wood' },
    );
  } else {
    put(
      acc,
      new THREE.PlaneGeometry(K.w, K.len).rotateX(-Math.PI / 2),
      [0, top, 0],
      K.tones[0],
      flat,
    );
  }
  const fx = K.w / 2 - K.floatW / 2 - 0.03;
  if (hi)
    for (const sx of [-1, 1])
      put(
        acc,
        baseBox(K.floatW, K.floatH, K.len - 0.2),
        [sx * fx, top - K.deckThick - K.floatH + 0.04, 0],
        K.floatCol,
        { aoAmt: 0.25 },
      );
  else
    put(
      acc,
      baseBox(K.w - 0.1, K.floatH, K.len - 0.2),
      [0, top - K.deckThick - K.floatH + 0.04, 0],
      K.floatCol,
      { aoAmt: 0.25 },
    );
  if (hi)
    for (const z of K.cleats)
      for (const sx of [-1, 1]) {
        if (z > 0 === sx > 0) continue;
        put(acc, baseBox(0.24, 0.12, 0.09), [sx * (K.w / 2 - 0.1), top, z], P.ink, {
          aoAmt: 0,
          cls: 'metal',
        });
      }
  return acc.finish(rng, false, true);
}

function quayBoat(o: BuildOpts): THREE.BufferGeometry {
  return o.variant === 4 ? pontoon(o) : boat(o);
}

export const MARINA_BOATS_GEO: readonly PropGeoDef[] = [
  {
    id: 'quayBoat',
    variants: 5,
    build: quayBoat,
    footprint: 2.8,
    height: 7,
    heights: [6.57, 2.67, 1.3, 2.1, 0.46],
    windy: true,
  },
];
