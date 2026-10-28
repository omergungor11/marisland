/**
 * Coding Wind Tunnel geometry (M24 TASK-498, `CO:C1`; D-088): `windTunnel` (tier 1, a 14 u lattice half
 * tube with five windsocks inside) and `tunnelFan` (tier 2, the 3 u fan at the upwind mouth).
 * Numbers and palette: content/themes/coding-tunnel.ts; defs: content/props-themes/coding-tunnel.ts.
 *
 * Frames. The tunnel runs along local +x (= downwind, like the windsock def: the plan turns the
 * fixture to rotY = anchor.rotY + pi/2), centred on the origin, the floor at y 0 and the arch springing
 * from `floorY`. The fan faces local +z (the testFan convention): its fixture takes rotY = anchor.rotY,
 * so +z is downwind there too. The blades are the shared spin tag (turn with the wind, gust boost).
 *
 * Windsocks (userData.hooks.socks): rigid bands that carry the lift tag `aSpin = (ring xyz, 5 + k / 16)`;
 * the vertex shader tips them about the ring from a droop up to horizontal as a gust passes, the
 * k-th one `SOCK_LIFT.lag` s after the (k-1)-th (render/materials/activity-glsl.ts). Wind weight is 0.
 *
 * Night: a blue server-light strip along each floor edge and the ridge (accent, glow mask) and two warm
 * lantern posts at the downwind mouth; the warm park comes from the island's own lamps.
 */
import * as THREE from 'three';
import { SOCK_LIFT } from '../../content/activity.ts';
import {
  TUNNEL_FAN as F,
  TUNNEL_PAL as P,
  WIND_TUNNEL as T,
} from '../../content/themes/coding-tunnel.ts';
import { type Acc, qEuler } from '../kit.ts';
import { Spin, finishSpin } from '../office-kit.ts';
import { V, baseBox, cylB, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { addHook } from './hq.ts';
import { beam, seedAcc } from './qa-proving.ts';

type Pt = THREE.Vector3;

/** `windAbs` marker of a sock vertex before the tag pass (`SOCK_MARK + k`). */
const SOCK_MARK = 100;

/** Point on the arch (cross-section in the yz plane): angle 0 = +z floor edge, 90 = ridge, 180 = -z. */
function arch(x: number, deg: number, r = T.radius): Pt {
  const a = (deg * Math.PI) / 180;
  return V(x, T.floorY + Math.sin(a) * r, Math.cos(a) * r);
}

/* ------------------------------- windTunnel ------------------------------- */

function windsocks(acc: Acc, hi: boolean): Pt[] {
  const S = T.socks;
  const rings: Pt[] = [];
  const ridge = T.floorY + T.radius;
  S.xs.forEach((x0, k) => {
    const set = S.colors[k % S.colors.length];
    const yRing = ridge - S.drop - S.rNear;
    const ringX = x0 + 0.12;
    // the arm from the ridge rail down to the ring top
    put(acc, baseBox(0.07, S.drop + 0.04, 0.07), [x0, yRing + S.rNear, 0], P.rail, { aoAmt: 0 });
    put(acc, baseBox(0.28, 0.06, 0.06), [x0 + 0.1, yRing + S.rNear, 0], P.rail, { aoAmt: 0 });
    // ring and bands: rigid, tagged (windAbs marker) for the lift shader branch
    const mark = SOCK_MARK + k;
    if (hi)
      put(
        acc,
        new THREE.TorusGeometry(S.rNear + 0.02, 0.03, 4, 10).rotateY(Math.PI / 2),
        [ringX, yRing, 0],
        P.rail,
        {
          aoAmt: 0,
          windAbs: mark,
        },
      );
    const n = hi ? S.bands : 2;
    const len = S.length / n;
    for (let i = 0; i < n; i++) {
      const r0 = S.rNear + ((S.rFar - S.rNear) * i) / n;
      const r1 = S.rNear + ((S.rFar - S.rNear) * (i + 1)) / n;
      // CylinderGeometry(top, bottom): rotateZ(-pi/2) turns +y into +x, so `top` is the far end
      const g = new THREE.CylinderGeometry(r1, r0, len * 1.02, hi ? 6 : 4, 1, true).rotateZ(
        -Math.PI / 2,
      );
      put(acc, g, [ringX + len * (i + 0.5), yRing, 0], i % 2 === 0 ? set[0] : set[1], {
        aoAmt: 0,
        double: true,
        noJitter: true,
        windAbs: mark,
      });
    }
    rings.push(V(ringX, yRing, 0));
  });
  return rings;
}

/** Tag pass: `windAbs` markers -> `aSpin = (ring, 5 + k / 16)` and zero wind. */
function tagSocks(g: THREE.BufferGeometry, rings: readonly Pt[]): THREE.BufferGeometry {
  const wind = g.getAttribute('wind') as THREE.BufferAttribute;
  const a = new Float32Array(wind.count * 4);
  for (let i = 0; i < wind.count; i++) {
    const w = wind.getX(i);
    if (w < SOCK_MARK - 0.5) continue;
    const k = Math.round(w - SOCK_MARK);
    const ring = rings[Math.min(rings.length - 1, k)];
    a.set([ring.x, ring.y, ring.z, 5 + k * SOCK_LIFT.step], i * 4);
    wind.setX(i, 0);
  }
  g.setAttribute('aSpin', new THREE.BufferAttribute(a, 4));
  return g;
}

function windTunnel({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = seedAcc(rng, 0.008);
  const L = T.length;
  const half = L / 2;
  const R = T.radius;
  // the floor deck: a light slab with a kerb strip on both long sides
  put(acc, baseBox(L + 0.5, T.floorY, T.deckHalf * 2), [0, 0, 0], P.floor, { aoAmt: 0.2 });
  if (hi) {
    put(acc, baseBox(L + 0.5, 0.03, T.deckHalf * 2 - 0.4), [0, T.floorY, 0], P.floorTop, {
      aoAmt: 0,
    });
    for (const sz of [-1, 1])
      put(acc, baseBox(L + 0.6, 0.12, 0.2), [0, T.floorY, sz * (T.deckHalf - 0.1)], P.curb, {
        aoAmt: 0.1,
      });
  }
  // arch ribs, end to end, each a polyline of square beams
  const segs = hi ? 14 : 6;
  for (let i = 0; i < T.ribs; i++) {
    const x = -half + (L * i) / (T.ribs - 1);
    for (let s = 0; s < segs; s++) {
      const a = arch(x, (s / segs) * 180);
      const b = arch(x, ((s + 1) / segs) * 180);
      beam(acc, a, b, hi ? T.ribTh : T.ribTh * 1.6, P.frame);
    }
  }
  // rails along the length: flank rails at the springs, the ridge rail on top
  const degs = hi ? T.railDeg : [0, 90, 180];
  for (const d of degs)
    beam(acc, arch(-half, d), arch(half, d), hi ? T.railTh : T.railTh * 1.5, P.rail);
  // zig-zag braces in every bay between the rails (alternating), the lattice read of the half tube
  if (hi)
    for (let i = 0; i < T.ribs - 1; i++) {
      const xa = -half + (L * i) / (T.ribs - 1);
      const xb = -half + (L * (i + 1)) / (T.ribs - 1);
      for (let j = 0; j < T.railDeg.length - 1; j++) {
        const d0 = T.railDeg[j];
        const d1 = T.railDeg[j + 1];
        if ((i + j) % 2 === 0) beam(acc, arch(xa, d0), arch(xb, d1), 0.07, P.brace);
        else beam(acc, arch(xa, d1), arch(xb, d0), 0.07, P.brace);
      }
    }
  // end hoops: slightly proud rings at both mouths (a mint of yellow cap on the rib feet)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      put(acc, baseBox(0.34, 0.22, 0.34), [sx * half, T.floorY + 0.11, sz * R], P.yellow, {
        aoAmt: 0.1,
      });
  // blue server light: strips along the floor edges and the ridge (glow mask), no day change
  const Lg = T.light;
  for (const sz of [-1, 1])
    put(acc, baseBox(L - 0.5, 0.05, Lg.edgeW), [0, T.floorY + 0.03, sz * (R - 0.55)], P.server, {
      emissive: Lg.edge,
      ao: () => 1,
      aoAmt: 0,
      noJitter: true,
    });
  put(acc, baseBox(L - 0.6, 0.05, Lg.ridgeW), [0, T.floorY + R + 0.12, 0], P.server, {
    emissive: Lg.ridge,
    ao: () => 1,
    aoAmt: 0,
    noJitter: true,
  });
  // two warm lantern posts at the downwind mouth: the park light the tunnel stands in
  for (const sz of [-1, 1]) {
    const x = half + Lg.lanternX;
    const z = sz * Lg.lanternZ;
    put(acc, cylB(0.07, 0.05, Lg.lanternH, hi ? 5 : 3), [x, 0, z], P.rail, { aoAmt: 0.2 });
    put(
      acc,
      new THREE.IcosahedronGeometry(hi ? 0.17 : 0.2, hi ? 1 : 0),
      [x, Lg.lanternH + 0.12, z],
      P.warm,
      {
        emissive: Lg.lanternMask,
        ao: () => 1,
        aoAmt: 0,
      },
    );
  }
  // five windsocks inside (LOD0 only; the far proxy keeps the frame)
  const rings = hi ? windsocks(acc, true) : [];
  const g = acc.finish(rng, false, true);
  if (hi)
    tagSocks(
      g,
      rings.map((r) => (acc.xf ? r.clone().applyMatrix4(acc.xf) : r)),
    );
  addHook(g, 'socks', { rings: rings.map((r) => [r.x, r.y, r.z]) });
  return addHook(g, 'mouth', { upwind: [-half, 0, 0], downwind: [half, 0, 0] });
}

/* -------------------------------- tunnelFan -------------------------------- */

/** The 3 u fan facing +z: a frame on two feet, a motor drum, a cage and five blades on the spin tag. */
function tunnelFan({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = seedAcc(rng, 0.01);
  const spin = new Spin();
  const hub = V(0, F.hubY, 0);
  const tag = spin.tag(hub);
  // two feet and a cross bar under the hub, the motor drum behind the blades
  for (const sx of hi ? [-1, 1] : []) {
    put(acc, baseBox(0.24, 0.16, 1.1), [sx * (F.cageR - 0.1), 0, 0.05], F.foot, { aoAmt: 0.15 });
    beam(
      acc,
      V(sx * (F.cageR - 0.1), 0.1, 0.05),
      V(sx * (F.cageR - 0.1), F.hubY - 0.2, -0.05),
      0.14,
      F.body,
    );
  }
  put(acc, baseBox(F.cageR * 2 - 0.2, hi ? 0.12 : 0.5, 0.14), [0, hi ? 0.9 : 0.3, -0.05], F.body, {
    aoAmt: 0.1,
  });
  if (hi)
    put(acc, cylB(0.5, 0.46, 0.7, 10), [0, F.hubY, -0.55], F.body, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0.05,
    });
  const ring = (r: number, z: number, th: number): void =>
    put(acc, new THREE.TorusGeometry(r, th, 3, hi ? 20 : 8), [0, F.hubY, z], F.cage, { aoAmt: 0 });
  if (hi) ring(F.cageR, -0.3, 0.06);
  ring(F.cageR, 0.4, 0.06);
  if (hi) ring(F.cageR * 0.55, 0.4, 0.04);
  const spokes = hi ? 8 : 2;
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * Math.PI * 2 + 0.2;
    const c = V(Math.cos(a), Math.sin(a), 0);
    beam(
      acc,
      V(c.x * 0.3, F.hubY + c.y * 0.3, 0.4),
      V(c.x * F.cageR, F.hubY + c.y * F.cageR, 0.4),
      0.05,
      F.cage,
    );
    if (hi)
      beam(
        acc,
        V(c.x * F.cageR, F.hubY + c.y * F.cageR, -0.3),
        V(c.x * F.cageR, F.hubY + c.y * F.cageR, 0.4),
        0.06,
        F.cage,
      );
  }
  // blades (turn about the hub on the z axis) and a nose cone
  const n = hi ? F.blades : 2;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const dir = V(Math.cos(a), Math.sin(a), 0);
    const q = new THREE.Quaternion()
      .setFromAxisAngle(V(0, 0, 1), a - Math.PI / 2)
      .multiply(qEuler(0, 0.35, 0));
    put(
      acc,
      new THREE.BoxGeometry(F.bladeW, F.bladeR - 0.25, 0.06),
      hub
        .clone()
        .add(dir.multiplyScalar(0.25 + (F.bladeR - 0.25) / 2))
        .add(V(0, 0, 0.08)),
      F.blade,
      { q, windAbs: tag, aoAmt: 0 },
    );
  }
  put(
    acc,
    new THREE.ConeGeometry(0.3, 0.4, hi ? 8 : 3).rotateX(Math.PI / 2),
    hub.clone().add(V(0, 0, 0.28)),
    F.body,
    {
      windAbs: tag,
      aoAmt: 0,
    },
  );
  const g = finishSpin(acc.finish(rng, false, true), acc, spin);
  return addHook(g, 'hub', { center: [hub.x, hub.y, hub.z], axis: [0, 0, 1] });
}

export const CODING_TUNNEL_GEO: readonly PropGeoDef[] = [
  { id: 'windTunnel', variants: 1, build: windTunnel, footprint: 3.2, height: 3.2, windy: false },
  { id: 'tunnelFan', variants: 1, build: tunnelFan, footprint: 1.4, height: 3.3, windy: false },
];
