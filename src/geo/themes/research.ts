/**
 * research theme structure geometry (M14b TASK-375): weatherMast, observatory, instrumentBuoy.
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
import { col, qEuler } from '../kit.ts';
import { Spin, domeCap, dish, finishSpin } from '../office-kit.ts';
import { TAU, V, baseBox, cylB, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addHook, stripedBuoy } from './hq.ts';

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
];
