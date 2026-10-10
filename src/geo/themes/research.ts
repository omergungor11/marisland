/**
 * research theme structure geometry (M14b TASK-375): weatherMast, observatory, instrumentBuoy;
 * TASK-400 "Biodome Lab": biodomeHero, biodome, crystalCluster, researchVessel (the weather
 * mast and observatory stay in the catalogue for edit mode but are no longer planned).
 * Defs: content/props-themes/research.ts.
 *
 * Hooks (userData.hooks):
 *  - weatherMast.anemometer: the cup rotor spins via aSpin (hub in userData.hub, axis z), the
 *    same branch as the windmill blades.
 *  - observatory.slit: the dome slit quad (centre + normal) where a work spot / scope can point.
 */
import * as THREE from 'three';
import { OFFICE_COLORS as C, OFFICE_PAL } from '../../content/palette-offices.ts';
import { THEMES } from '../../content/themes.ts';
import { BIODOME_PALETTE } from '../../content/themes/research.ts';
import { hashInts } from '../../core/hash.ts';
import { col, qEuler, type Acc } from '../kit.ts';
import { Spin, domeCap, dish, finishSpin } from '../office-kit.ts';
import { TAU, V, baseBox, cylB, jitterAcc, lathe, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addHook, stripedBuoy } from './hq.ts';
import { tagScreens } from './surface-tags.ts';

const RS = THEMES.research.accent;
const DOME = '#F4F2EC';
const TEAL = '#4FC3C9';
const PAL = OFFICE_PAL.research;

/* ------------------------------- weatherMast ------------------------------- */

/** Instrument mast: 3-leg lattice, spinning anemometer rotor, vane, solar panel, base cabinet. */
function weatherMast({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const spin = new Spin();
  const hi = lod === 0;
  const H = 5.2;
  // base cabinet + plinth
  put(acc, cylB(0.62, 0.55, 0.14, hi ? 8 : 5), [0, 0, 0], C.plinth, { aoAmt: 0.25 });
  put(acc, baseBox(0.7, 0.62, 0.5), [0.45, 0.14, 0.3], DOME, { aoAmt: 0.15 });
  put(acc, baseBox(0.72, 0.1, 0.52), [0.45, 0.76, 0.3], TEAL, { aoAmt: 0 });
  // lattice legs, tapering inward
  const legs: THREE.Vector3[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.5;
    legs.push(V(Math.cos(a) * 0.34, 0.14, Math.sin(a) * 0.34));
  }
  const top = V(0, H, 0);
  for (const b of legs) {
    const d = top.clone().sub(b);
    const len = d.length();
    put(
      acc,
      new THREE.CylinderGeometry(0.035, 0.05, len, hi ? 4 : 3, 1, true),
      b.clone().add(top).multiplyScalar(0.5),
      C.steelLight,
      {
        q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()),
        aoAmt: 0.1,
      },
    );
  }
  put(acc, cylB(0.05, 0.04, 0.5, hi ? 5 : 4, true), [0, H, 0], C.steel, { aoAmt: 0 });
  if (hi) {
    // diagonal bracing between the legs
    for (const y0 of [0.6, 1.8, 3.0]) {
      for (let k = 0; k < 3; k++) {
        const r0 = 0.34 * (1 - (y0 / H) * 0.82);
        const r1 = 0.34 * (1 - ((y0 + 1.1) / H) * 0.82);
        const a0 = (k / 3) * TAU + 0.5;
        const a1 = ((k + 1) / 3) * TAU + 0.5;
        const p0 = V(Math.cos(a0) * r0, y0, Math.sin(a0) * r0);
        const p1 = V(Math.cos(a1) * r1, y0 + 1.1, Math.sin(a1) * r1);
        const d = p1.clone().sub(p0);
        put(
          acc,
          new THREE.CylinderGeometry(0.014, 0.014, d.length(), 3, 1, true),
          p0.clone().add(p1).multiplyScalar(0.5),
          C.steel,
          {
            q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()),
            aoAmt: 0,
          },
        );
      }
    }
    // red/white aviation bands + cross rings
    for (const y of [1.0, 2.1, 3.2, 4.3]) {
      const r = 0.34 * (1 - (y / H) * 0.82) + 0.02;
      put(acc, new THREE.TorusGeometry(r, 0.018, 3, 6), [0, y, 0], y < 2.5 ? C.red : C.white, {
        q: qEuler(Math.PI / 2, 0, 0),
        aoAmt: 0,
      });
    }
  }
  // instrument arm with the cup rotor (spins about z, like the research hut pinwheel)
  const hubY = H + 0.35;
  const hub = V(0, hubY, 0.12);
  const tag = spin.tag(hub);
  const arms = hi ? 2 : 1;
  for (let k = 0; k < arms; k++)
    put(acc, new THREE.BoxGeometry(1.0, 0.06, 0.05), hub, C.steelLight, {
      q: qEuler(0, 0, k * (Math.PI / 2) + 0.4),
      windAbs: tag,
      aoAmt: 0,
      ao: () => 0.97,
    });
  const cups = hi ? 4 : 2;
  for (let k = 0; k < cups; k++) {
    const a = (cups === 4 ? k * (Math.PI / 2) : k * Math.PI) + 0.4;
    put(
      acc,
      new THREE.SphereGeometry(0.14, hi ? 6 : 4, hi ? 3 : 2, 0, TAU, 0, Math.PI / 2),
      hub.clone().add(V(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0)),
      k === 0 ? C.red : TEAL,
      { q: qEuler(Math.PI / 2, 0, 0), windAbs: tag, aoAmt: 0, double: true },
    );
  }
  put(acc, new THREE.IcosahedronGeometry(0.1, 0), hub, C.gold, { windAbs: tag, aoAmt: 0 });
  // warning lamp on top
  put(acc, new THREE.IcosahedronGeometry(0.09, hi ? 1 : 0), [0, hubY + 0.42, 0], C.onAir, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  // wind vane arm + arrow, one level lower
  put(acc, cylB(0.02, 0.02, 0.5, 3, true), [0, H - 1.0, 0], C.steelLight, { aoAmt: 0 });
  put(acc, baseBox(1.0, 0.04, 0.04), [0, H - 0.6, 0], C.steelLight, { aoAmt: 0 });
  put(acc, new THREE.ConeGeometry(0.08, 0.26, 4), [0.56, H - 0.6, 0], RS, {
    q: qEuler(0, 0, -Math.PI / 2),
    aoAmt: 0,
  });
  put(acc, baseBox(0.28, 0.2, 0.03), [-0.46, H - 0.6, 0], RS, { aoAmt: 0 });
  // solar panel on a bracket
  put(acc, baseBox(0.8, 0.04, 0.5), [-0.15, 2.7, 0.55], C.solar, {
    q: qEuler(-0.55, 0, 0),
    aoAmt: 0,
  });
  if (hi) {
    put(acc, new THREE.BoxGeometry(0.72, 0.012, 0.06), [-0.15, 2.78, 0.5], C.solarLine, {
      q: qEuler(-0.55, 0, 0),
      aoAmt: 0,
    });
    // LOD0-only variation: v0 = rain gauge + stool, v1 = small dish
    if (variant === 0) {
      put(acc, cylB(0.1, 0.1, 0.34, 6), [-0.7, 0, 0.2], C.glass, { aoAmt: 0.1 });
      put(acc, cylB(0.12, 0.1, 0.05, 6), [-0.7, 0.34, 0.2], TEAL, { aoAmt: 0 });
      put(acc, baseBox(0.2, 0.28, 0.2), [0.45, 0.14, 0.9], C.deskDark, { aoAmt: 0.1 });
    } else {
      dish(acc, V(-0.2, 3.2, -0.3), { r: 0.32, yaw: 0.6, elev: 0.5, color: DOME, mast: 0.2, lod });
    }
    // cabinet door glow + latch
    put(acc, new THREE.PlaneGeometry(0.28, 0.2), [0.45, 0.58, 0.56], C.screen, {
      emissive: 2,
      aoAmt: 0,
      ao: () => 1,
    });
  }
  const g = finishSpin(acc.finish(rng, false, true), acc, spin);
  tagScreens(g, 'spectrum'); // TASK-384: cabinet door readout
  return addHook(g, 'anemometer', { hub: [hub.x, hub.y, hub.z], axis: [0, 0, 1] });
}

/* -------------------------------- observatory -------------------------------- */

/** Standalone observatory: drum + white dome with a teal slit, balcony, door and steps. */
function observatory({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const R = 1.55;
  const DH = 1.9;
  const seg = hi ? 14 : 8;
  put(acc, cylB(R + 0.2, R + 0.2, 0.2, seg), [0, 0, 0], C.plinth, { aoAmt: 0.25 });
  put(acc, cylB(R, R, DH, seg, true), [0, 0.2, 0], DOME, { aoAmt: 0.18 });
  // teal band under the dome + sill band
  put(acc, cylB(R + 0.06, R + 0.06, 0.16, seg), [0, 0.2 + DH - 0.14, 0], TEAL, { aoAmt: 0 });
  const dy = 0.2 + DH + 0.02;
  put(acc, cylB(R + 0.12, R + 0.12, 0.08, seg), [0, dy - 0.04, 0], PAL[0].trim, { aoAmt: 0 });
  domeCap(acc, V(0, dy, 0), R + 0.08, DOME, lod);
  // slit: teal vertical slot on the +z face of the dome, glowing a little at night
  const sy = dy + (R + 0.08) * 0.52;
  const sz = (R + 0.08) * 0.84;
  put(acc, new THREE.BoxGeometry(0.46, (R + 0.08) * 1.05, 0.07), [0, sy, sz], TEAL, {
    q: qEuler(-0.55, 0, 0),
    emissive: 0.3,
    aoAmt: 0,
    ao: () => 1,
  });
  // door + steps on the +z drum face
  put(acc, baseBox(0.8, 1.4, 0.1), [0, 0.2, R - 0.02], WOODDOOR, { aoAmt: 0.05 });
  put(acc, baseBox(1.3, 0.12, 0.5), [0, 0.2, R + 0.28], C.plinth, { aoAmt: 0.2 });
  // windows (glow)
  for (const a of hi ? [0.9, 2.3, 4.0, 5.3] : [2.3, 5.3]) {
    const p = V(Math.sin(a) * (R + 0.01), 1.2, Math.cos(a) * (R + 0.01));
    put(acc, new THREE.PlaneGeometry(0.42, 0.55), p, C.screenWarm, {
      q: qEuler(0, a, 0),
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
  }
  put(acc, cylB(R + 0.42, R + 0.42, 0.06, hi ? 14 : 8), [0, 0.2 + 0.7, 0], C.deskDark, {
    aoAmt: 0.1,
  });
  if (hi) {
    // balcony ring + posts
    put(acc, new THREE.TorusGeometry(R + 0.35, 0.04, 4, 20), [0, 1.0, 0], C.steelLight, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      put(
        acc,
        cylB(0.03, 0.03, 0.5, 3, true),
        [Math.sin(a) * (R + 0.35), 0.9, Math.cos(a) * (R + 0.35)],
        C.steelLight,
        { aoAmt: 0 },
      );
    }
    // dome rib stripes
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      put(acc, new THREE.TorusGeometry(R + 0.1, 0.022, 3, 10, Math.PI), [0, dy, 0], PAL[0].trim, {
        q: qEuler(0, a, 0),
        aoAmt: 0,
      });
    }
    // LOD0-only variation: v0 = telescope tube out of the slit, v1 = solar panels on the plinth
    if (variant === 0)
      put(acc, new THREE.CylinderGeometry(0.1, 0.12, 0.9, 6), [0, sy + 0.2, sz + 0.22], DOME, {
        q: qEuler(Math.PI / 2 - 0.65, 0, 0),
        aoAmt: 0.05,
      });
    else
      for (const x of [-1.2, 1.2])
        put(acc, baseBox(0.8, 0.04, 0.5), [x, 0.35, R + 0.9], C.solar, {
          q: qEuler(-0.4, 0, 0),
          aoAmt: 0,
        });
    // lamp over the door
    put(acc, new THREE.IcosahedronGeometry(0.1, 0), [0.0, 1.78, R + 0.1], C.screenWarm, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'slit', { center: [0, sy, sz], normal: [0, 0.57, 0.82] });
}
const WOODDOOR = col('#A8754F').getStyle();

/* ------------------------------- instrumentBuoy ------------------------------- */

/** Research buoy: banded float, instrument frame, solar panel, warning lamp. Pivot = water level. */
function instrumentBuoy({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.03);
  const hi = lod === 0;
  const a = variant === 0 ? C.gold : DOME;
  stripedBuoy(acc, V(0, 0, 0), 0.36, 0.2, a, TEAL, lod, 3);
  put(acc, cylB(0.4, 0.4, 0.06, hi ? 10 : 6), [0, 0.56, 0], C.steelLight, { aoAmt: 0.1 });
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * TAU + 0.5;
    put(
      acc,
      cylB(0.025, 0.02, 0.9, 3, true),
      [Math.cos(ang) * 0.28, 0.6, Math.sin(ang) * 0.28],
      C.steel,
      {
        q: qEuler(Math.sin(ang) * 0.18, 0, -Math.cos(ang) * 0.18),
        aoAmt: 0,
      },
    );
  }
  put(acc, baseBox(0.7, 0.04, 0.5), [0, 1.35, 0.1], C.solar, { q: qEuler(-0.4, 0, 0), aoAmt: 0 });
  put(acc, cylB(0.025, 0.02, 0.5, 3, true), [0, 1.4, -0.12], C.steelLight, { aoAmt: 0 });
  put(acc, new THREE.IcosahedronGeometry(0.075, hi ? 1 : 0), [0, 1.95, -0.12], C.onAir, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  if (hi) {
    put(acc, baseBox(0.2, 0.24, 0.2), [0, 0.62, 0], DOME, { aoAmt: 0.1 });
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * TAU + 0.8;
      put(
        acc,
        cylB(0.03, 0.03, 0.12, 4),
        [Math.cos(ang) * 0.38, 0.36, Math.sin(ang) * 0.38],
        C.steel,
        { aoAmt: 0 },
      );
      put(
        acc,
        new THREE.IcosahedronGeometry(0.035, 0),
        [Math.cos(ang) * 0.33, 0.62, Math.sin(ang) * 0.33],
        C.dark,
        { aoAmt: 0 },
      );
    }
    put(acc, new THREE.TorusGeometry(0.3, 0.025, 3, 12), [0, 0.38, 0], C.steelLight, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    });
    put(acc, new THREE.BoxGeometry(0.4, 0.03, 0.03), [0, 1.62, -0.12], C.steelLight, { aoAmt: 0 });
    put(acc, new THREE.IcosahedronGeometry(0.05, 0), [0.22, 1.62, -0.12], TEAL, { aoAmt: 0 });
    put(acc, new THREE.IcosahedronGeometry(0.05, 0), [-0.22, 1.62, -0.12], C.red, { aoAmt: 0 });
  }
  return acc.finish(rng, false, true);
}

/* --------------------------------- biodomes --------------------------------- */

const P = BIODOME_PALETTE;

/** Stable pick from a list by a point (per-face tint without consuming the rng). */
const pickAt = <T>(list: readonly T[], p: THREE.Vector3, salt: number): T =>
  list[
    hashInts(Math.round(p.x * 97), Math.round(p.y * 97), Math.round(p.z * 97), salt) % list.length
  ];

/**
 * Geodesic glass dome on `at` (icosahedron upper half, flat-bottomed): every face is a tinted
 * opaque pane (low band = plants behind glass, upper band = aqua / lilac glass, both glowing at
 * night) inside a white frame (LOD0; LOD1 blends the frame into the pane colour). Faces above
 * `oculus` (fraction of R) are left open.
 */
function geodesic(
  acc: Acc,
  at: THREE.Vector3,
  R: number,
  o: { detail: number; lod: 0 | 1; squash?: number; oculus?: number; salt: number },
): void {
  const ico = new THREE.IcosahedronGeometry(R, o.detail);
  const src = ico.getAttribute('position');
  const sq = o.squash ?? 1;
  const frames: number[] = [];
  const panes: number[] = [];
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const cen = new THREE.Vector3();
  const k = 0.84;
  for (let i = 0; i < src.count; i += 3) {
    for (let j = 0; j < 3; j++) v[j].fromBufferAttribute(src, i + j);
    cen
      .copy(v[0])
      .add(v[1])
      .add(v[2])
      .multiplyScalar(1 / 3);
    if (cen.y < -0.02 * R) continue;
    if (o.oculus !== undefined && cen.y > o.oculus * R) continue;
    for (const p of v) p.set(p.x, Math.max(0, p.y) * sq, p.z).add(at);
    cen
      .copy(v[0])
      .add(v[1])
      .add(v[2])
      .multiplyScalar(1 / 3);
    if (o.lod === 1) {
      for (const p of v) panes.push(p.x, p.y, p.z);
      continue;
    }
    const w = v.map((p) => cen.clone().lerp(p, k));
    panes.push(...w.flatMap((p) => [p.x, p.y, p.z]));
    for (let j = 0; j < 3; j++) {
      const a = v[j];
      const b = v[(j + 1) % 3];
      const a2 = w[j];
      const b2 = w[(j + 1) % 3];
      frames.push(a.x, a.y, a.z, b.x, b.y, b.z, b2.x, b2.y, b2.z);
      frames.push(a.x, a.y, a.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z);
    }
  }
  const split = at.y + P.paneSplit * R * sq;
  const paneColor = (p: THREE.Vector3): THREE.Color => {
    const c = col(pickAt(p.y < split ? P.paneLow : P.paneHigh, p, o.salt));
    // LOD1 has no frame: carry its share (1 − k² ≈ 0.3) in the pane colour, so far domes keep the palette
    return o.lod === 1 ? c.lerp(col(P.frame), 0.28) : c;
  };
  const geo = (arr: number[]): THREE.BufferGeometry =>
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  acc.add(geo(panes), { color: paneColor, emissive: P.paneGlow, aoAmt: 0.05, windMul: 0 });
  if (frames.length > 0) acc.add(geo(frames), { color: col(P.frame), aoAmt: 0.05, windMul: 0 });
}

/** Stone plinth with the teal band. */
function domePlinth(acc: Acc, R: number, h: number, seg: number): void {
  put(acc, cylB(R + 0.3, R + 0.18, h, seg), [0, 0, 0], P.plinth, { aoAmt: 0.25 });
  put(acc, cylB(R + 0.22, R + 0.22, 0.12, seg), [0, h - 0.18, 0], P.band, { aoAmt: 0 });
}

/** Door porch on the +z face at radius `r`: arch tunnel stub, teal door, warm lamp above. */
function domeDoor(acc: Acc, r: number, y: number, s: number, lod: 0 | 1): void {
  const hi = lod === 0;
  const d = 1.1 * s;
  const z = r + d / 2 - 0.2;
  // short tunnel: white walls, glass barrel roof (half cylinder along z, arch up)
  put(acc, baseBox(1.0 * s, 0.85 * s, d), [0, y, z], P.frame, { aoAmt: 0.15 });
  put(
    acc,
    new THREE.CylinderGeometry(0.5 * s, 0.5 * s, d, hi ? 8 : 4, 1, false, -Math.PI / 2, Math.PI),
    [0, y + 0.85 * s, z],
    P.paneHigh[1],
    { q: qEuler(-Math.PI / 2, 0, 0), emissive: P.paneGlow, aoAmt: 0.05 },
  );
  put(acc, baseBox(0.6 * s, 0.8 * s, 0.06), [0, y, z + d / 2], P.door, { aoAmt: 0 });
  put(
    acc,
    new THREE.IcosahedronGeometry(0.1 * s, hi ? 1 : 0),
    [0, y + 1.0 * s, z + d / 2 + 0.06],
    P.lamp,
    {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    },
  );
}

/** Pinwheel vent on a short mast (3 blades spin about +z through `hub`). */
function pinwheel(
  acc: Acc,
  spin: Spin,
  hub: THREE.Vector3,
  r: number,
  mast: number,
  lod: 0 | 1,
): void {
  const hi = lod === 0;
  put(acc, cylB(0.05, 0.04, mast, hi ? 5 : 3, true), [hub.x, hub.y - mast, hub.z - 0.08], P.frame, {
    aoAmt: 0,
  });
  const tag = spin.tag(hub);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.3;
    put(
      acc,
      new THREE.BoxGeometry(r, 0.22 * (r / 0.6), 0.04),
      hub.clone().add(V(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 0)),
      P.blades[k],
      {
        q: qEuler(0, 0.35, a),
        windAbs: tag,
        aoAmt: 0,
        ao: () => 1,
      },
    );
  }
  put(acc, new THREE.IcosahedronGeometry(0.09, 0), hub, P.frame, { windAbs: tag, aoAmt: 0 });
}

/**
 * Hero biodome (T0 landmark of the Research island): a tall geodesic glass dome whose garden
 * bursts out of an open oculus, an annex dome with a pinwheel vent, a door porch on +z.
 */
function biodomeHero({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.01);
  const spin = new Spin();
  const hi = lod === 0;
  const R = 2.95;
  const base = 0.45;
  const sq = 1.28;
  domePlinth(acc, R, base, hi ? 20 : 10);
  geodesic(acc, V(0, base, 0), R, { detail: hi ? 3 : 1, lod, squash: sq, oculus: 0.86, salt: 1 });
  // the garden canopy fills the oculus and bulges out of the top
  const top = base + R * sq;
  const blobs: [number, number, number, number][] = hi
    ? [
        [0, top - 0.75, 0, 1.45],
        [0.75, top - 0.35, 0.35, 0.95],
        [-0.65, top - 0.25, -0.4, 1.0],
        [0.1, top + 0.3, -0.05, 0.85],
        [-0.3, top - 0.3, 0.75, 0.75],
      ]
    : [
        [0, top - 0.7, 0, 1.5],
        [0.1, top + 0.2, -0.05, 1.0],
      ];
  blobs.forEach(([x, y, z, r], k) =>
    put(
      acc,
      new THREE.IcosahedronGeometry(r, hi ? 1 : 0),
      [x, y, z],
      P.canopy[k % P.canopy.length],
      {
        aoAmt: 0.12,
      },
    ),
  );
  // oculus ring
  put(
    acc,
    new THREE.TorusGeometry(R * 0.5, 0.09, hi ? 4 : 3, hi ? 14 : 6),
    [0, base + R * 0.86 * sq + 0.02, 0],
    P.frame,
    {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    },
  );
  // annex dome on the side (−x, a little behind), with the pinwheel vent on top
  const AR = 1.35;
  const ax = V(-R * 0.98, 0, -R * 0.3);
  put(acc, cylB(AR + 0.2, AR + 0.12, base, hi ? 12 : 6), [ax.x, 0, ax.z], P.plinth, {
    aoAmt: 0.25,
  });
  geodesic(acc, V(ax.x, base, ax.z), AR, { detail: hi ? 2 : 0, lod, squash: 1.05, salt: 2 });
  pinwheel(acc, spin, V(ax.x, base + AR * 1.05 + 0.75, ax.z + 0.1), 0.62, 0.75, lod);
  domeDoor(acc, R - 0.15, 0, 1, lod);
  if (hi) {
    // planters and a crate by the porch, a sign post with the theme flask colour
    for (const [x, z] of [
      [1.1, R + 0.5],
      [-1.1, R + 0.5],
    ]) {
      put(acc, baseBox(0.6, 0.35, 0.4), [x, 0, z], C.deskDark, { aoAmt: 0.2 });
      put(acc, new THREE.IcosahedronGeometry(0.3, 0), [x, 0.5, z], P.canopy[1], { aoAmt: 0.1 });
    }
  }
  return finishSpin(acc.finish(rng, false, true), acc, spin);
}

/** Small biodome: geodesic glass on a plinth, a door porch and a pinwheel vent on top. */
function biodome({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const spin = new Spin();
  const hi = lod === 0;
  const R = 1.6;
  const base = 0.35;
  domePlinth(acc, R, base, hi ? 14 : 7);
  geodesic(acc, V(0, base, 0), R, { detail: hi ? 2 : 0, lod, squash: 1.05, salt: 3 });
  pinwheel(acc, spin, V(0, base + R * 1.05 + 0.6, 0.1), 0.5, 0.65, lod);
  domeDoor(acc, R - 0.12, 0, 0.75, lod);
  return finishSpin(acc.finish(rng, false, true), acc, spin);
}

/* -------------------------------- crystalCluster -------------------------------- */

/** Pastel crystal outcrop: faceted hex shards (teal / lilac, glowing a little at night) on a rock. */
function crystalCluster({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.05);
  const hi = lod === 0;
  put(acc, new THREE.IcosahedronGeometry(0.62, hi ? 1 : 0), [0, 0.32, 0], P.rock[0], {
    s: [1, 0.55, 0.9],
    aoAmt: 0.25,
  });
  // [x, z, height, radius, tilt x, tilt z, colour]
  const shards: [number, number, number, number, number, number, number][] = [
    [0, 0, 1.7, 0.24, 0, 0, 0],
    [0.32, 0.12, 1.15, 0.19, 0.1, -0.42, 2],
    [-0.3, 0.05, 1.25, 0.2, -0.05, 0.4, 1],
    [0.05, -0.3, 0.95, 0.17, -0.45, 0.05, 3],
    [-0.12, 0.34, 0.8, 0.15, 0.5, 0.15, 2],
    [0.38, -0.25, 0.6, 0.13, -0.35, -0.4, 0],
    [-0.42, -0.28, 0.55, 0.12, -0.3, 0.45, 3],
  ];
  const n = hi ? shards.length : 3;
  for (let k = 0; k < n; k++) {
    const [x, z, h, r, tx, tz, c] = shards[k];
    const g = lathe(
      [
        [0, 0],
        [r, 0],
        [r * 0.92, h * 0.72],
        [0, h],
      ],
      hi ? 6 : 4,
    );
    put(acc, g, [x, 0.16, z], P.crystal[c], {
      q: qEuler(tx, k * 0.9, tz),
      emissive: P.crystalGlow,
      aoAmt: 0.1,
    });
  }
  return acc.finish(rng, false, true);
}

/* -------------------------------- researchVessel -------------------------------- */

/**
 * Research vessel (bow +z, pivot = waterline): white hull with a teal band, wooden deck, bridge
 * with glowing windows, funnel, radar mast with a pinwheel anemometer, stern A-frame crane over a
 * yellow mini-sub.
 */
function researchVessel({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.01);
  const spin = new Spin();
  const hi = lod === 0;
  const L = 3.3;
  const B = 1.15;
  // deck outline: square-ish stern, pointed bow (xz), as an extruded shape
  const outline = (s: number): THREE.Shape => {
    const pts: [number, number][] = [
      [-B * 0.85, -L],
      [B * 0.85, -L],
      [B, -L * 0.6],
      [B, L * 0.25],
      [B * 0.7, L * 0.7],
      [0, L * 1.02],
      [-B * 0.7, L * 0.7],
      [-B, L * 0.25],
      [-B, -L * 0.6],
    ];
    // shape y = −z so that rotateX(−π/2) maps it back onto +z
    return new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x * s, -z * s)));
  };
  const slab = (s: number, h: number): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(outline(s), { depth: h, bevelEnabled: false, steps: 1 }).rotateX(
      -Math.PI / 2,
    );
  put(acc, slab(1, 0.85), [0, 0, 0], P.hull, { aoAmt: 0.1 });
  put(acc, slab(1.02, 0.2), [0, 0, 0], P.door, { aoAmt: 0 });
  if (hi) put(acc, slab(1.025, 0.12), [0, 0.52, 0], P.hullBand, { aoAmt: 0 });
  put(acc, slab(0.9, 0.06), [0, 0.85, 0], P.deck, { aoAmt: 0.05 });
  // bridge
  put(acc, baseBox(1.6, 1.05, 1.6), [0, 0.89, 0.5], P.hull, { aoAmt: 0.15 });
  put(acc, baseBox(1.8, 0.12, 1.85), [0, 1.94, 0.45], P.hullBand, { aoAmt: 0 });
  put(acc, baseBox(1.3, 0.38, 0.05), [0, 1.42, 1.31], P.bridgeGlass, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  for (const sx of hi ? [-1, 1] : [])
    put(acc, baseBox(0.05, 0.34, 1.0), [sx * 0.81, 1.44, 0.5], C.screenWarm, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
  // funnel
  put(acc, cylB(0.3, 0.25, 0.75, hi ? 8 : 5), [0, 0.89, -0.65], P.hullBand, { aoAmt: 0.1 });
  put(acc, cylB(0.26, 0.26, 0.14, hi ? 8 : 5), [0, 1.52, -0.65], P.hull, { aoAmt: 0 });
  // radar mast + pinwheel anemometer + top lamp
  put(acc, cylB(0.06, 0.05, 1.4, hi ? 5 : 3, true), [0, 2.02, 0.3], C.steelLight, { aoAmt: 0 });
  if (hi)
    dish(acc, V(0.45, 2.02, 0.2), { r: 0.3, yaw: 0.6, elev: 0.6, color: P.hull, mast: 0.35, lod });
  if (hi) pinwheel(acc, spin, V(0, 3.12, 0.42), 0.48, 0.2, lod);
  put(acc, new THREE.IcosahedronGeometry(0.08, hi ? 1 : 0), [0, 3.47, 0.3], C.onAir, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  // stern A-frame crane over the mini-sub
  for (const sx of [-1, 1])
    put(acc, cylB(0.07, 0.06, 2.1, hi ? 5 : 3), [sx * 0.85, 0.87, -2.6], P.crane, {
      q: qEuler(-0.32, 0, 0),
      aoAmt: 0.05,
    });
  put(acc, new THREE.BoxGeometry(1.85, 0.14, 0.14), [0, 2.85, -3.25], P.crane, { aoAmt: 0 });
  const sub = new THREE.CapsuleGeometry(0.34, 0.7, hi ? 3 : 1, hi ? 8 : 5).rotateX(Math.PI / 2);
  put(acc, sub, [0, 1.25, -2.15], P.sub, { aoAmt: 0.1 });
  if (hi) {
    // sub fin, porthole, crane wire
    put(acc, baseBox(0.06, 0.32, 0.3), [0, 1.47, -2.75], P.sub, { aoAmt: 0 });
    put(acc, new THREE.CylinderGeometry(0.17, 0.17, 0.08, 8), [0, 1.25, -1.5], P.bridgeGlass, {
      q: qEuler(Math.PI / 2, 0, 0),
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
    put(acc, cylB(0.02, 0.02, 0.9, 3, true), [0, 1.95, -3.2], C.steel, { aoAmt: 0 });
    // lifebuoy on the bridge side, deck rail posts
    put(acc, new THREE.TorusGeometry(0.22, 0.07, 4, 10), [0.83, 1.22, 0.15], C.red, {
      q: qEuler(0, Math.PI / 2, 0),
      aoAmt: 0,
    });
    for (let k = 0; k < 6; k++) {
      const z = -1.6 + k * 0.85;
      for (const sx of [-1, 1])
        put(
          acc,
          cylB(0.025, 0.025, 0.35, 3, true),
          [sx * (z > 1 ? 0.75 : 0.95), 0.89, z],
          P.frame,
          {
            aoAmt: 0,
          },
        );
    }
  }
  return finishSpin(acc.finish(rng, false, true), acc, spin);
}

export const RESEARCH_GEO: readonly PropGeoDef[] = [
  { id: 'weatherMast', variants: 2, build: weatherMast, footprint: 0.9, height: 6.2, windy: false },
  { id: 'observatory', variants: 2, build: observatory, footprint: 2.1, height: 3.8, windy: false },
  {
    id: 'instrumentBuoy',
    variants: 2,
    build: instrumentBuoy,
    footprint: 0.5,
    height: 2.0,
    windy: false,
  },
  { id: 'biodomeHero', variants: 1, build: biodomeHero, footprint: 3.2, height: 5.4, windy: false },
  { id: 'biodome', variants: 1, build: biodome, footprint: 1.8, height: 3.3, windy: false },
  {
    id: 'crystalCluster',
    variants: 1,
    build: crystalCluster,
    footprint: 0.7,
    height: 1.7,
    windy: false,
  },
  {
    id: 'researchVessel',
    variants: 1,
    build: researchVessel,
    footprint: 1.3,
    height: 3.3,
    windy: false,
  },
];
