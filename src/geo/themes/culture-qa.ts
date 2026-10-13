/**
 * QA "Müfettişler Adası / Inspectors' Island" kit (M19 TASK-414, ISLAND_CULTURES §2.5): the
 * cozy-bureaucratic props of Palmlagoon - stamps, hazard stripes, green ticks, ladybug jars and
 * purple UV lamps for the night bug hunt. Defs: content/props-themes/qa.ts (appended), ledger:
 * content/cultures/qa.ts (priority order). Geometry only; the placer (wave 2) puts them down.
 *
 *   dummyBench       bench with a crash-test dummy taking a coffee break              tier 2
 *   inspectionBooth  kit prefab: glass booth, counter, barrier boom, cones on a slab  tier 2
 *   uvLampPost       post with a hooded UV tube (emissive purple #B39DFF)             tier 2
 *   scoreboard       "BUGS" scoreboard, v0 digit 0 (green), v1 digit 1 (red)          tier 2
 *   bugJar           tray of three ladybug jars (faint green glow at night)           tier 3 noShadow
 *   conePyramid      traffic cones balanced in a pyramid (somebody's art)             tier 3 noShadow
 *   flagMast         flag mast with the green chevron pennant and a status light      tier 2
 *   stampDesk        desk with stamp, ink pad, approved papers, lamp and chair         tier 3 noShadow
 *   clipboardWall    frame with six hanging clipboards (ticks and one cross)           tier 3 noShadow
 *
 *   hallOfChecks     `testHangar` variant 1 (qa-factory.ts): 12 green tick badges on the front
 *   bugZoo           `terrarium` variant 2 (`withBugZoo`): green frame, giant ladybug, leaves
 *
 * Budget rules (ISLAND_CULTURES §4): every def stays under STRUCTURE_MIN_SIZE (3 u) in height and
 * in one plan extent (else the batcher promotes it to tier 0, `isLargeStructure`). Colours come from
 * the palette tables only. No bound thinner than 0.12 u.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EMISSIVE, FLOWERS, GRASS, ROCK, ROOFS, WALLS, WOOD } from '../../content/palette.ts';
import { OFFICE_COLORS as C, OFFICE_PAL } from '../../content/palette-offices.ts';
import { THEMES } from '../../content/themes.ts';
import type { Acc } from '../kit.ts';
import { col, qEuler, qFromTo } from '../kit.ts';
import { V, baseBox, bevBox, cylB, jitterAcc, put } from '../parts.ts';
import type { BuildOpts, PropBuilder, PropGeoDef } from '../types.ts';
import { addGlyph } from './glyphs.ts';
import { addHook, clamp01 } from './hq.ts';
import { cutShape } from './signage.ts';

const GREEN = THEMES.qa.accent;
const GREEN_L = ROOFS[6];
const GREEN_D = OFFICE_PAL.qa[0].trim;
const CREAM = WALLS[0];
const WHITE = WALLS[1];
const HAZ = C.gold;
const HAZ_K = ROCK[2];
const RED = C.red;
const UV = FLOWERS[3];
const INK = C.dark;

/** The `terrarium` variant index of the Bug Zoo (placed by the QA plan, TASK-424). */
export const BUG_ZOO_VARIANT = 2;

/* --------------------------------- helpers --------------------------------- */

/** Round rod between two points. */
function rod(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  color: string,
  seg: number,
  open = false,
): void {
  const dir = b.clone().sub(a);
  put(
    acc,
    new THREE.CylinderGeometry(r, r, dir.length(), seg, 1, open),
    a.clone().add(b).multiplyScalar(0.5),
    color,
    { q: qFromTo(V(0, 1, 0), dir), aoAmt: 0.05 },
  );
}

const blobGeo = (r: number, detail = 0): THREE.BufferGeometry =>
  new THREE.IcosahedronGeometry(r, detail);

/** Hazard bars along +x: `n` boxes between x0 and x1, alternating colours (yellow first). */
function hazardBars(
  acc: Acc,
  x0: number,
  x1: number,
  y: number,
  z: number,
  h: number,
  d: number,
  n: number,
): void {
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++)
    put(acc, baseBox(w, h, d), [x0 + (i + 0.5) * w, y, z], i % 2 === 0 ? HAZ : HAZ_K, { aoAmt: 0 });
}

/** Green tick made of two bars, facing +z turned by `q`; `s` = edge length. */
function tick(
  acc: Acc,
  at: THREE.Vector3,
  s: number,
  color: string,
  q: THREE.Quaternion = new THREE.Quaternion(),
  depth = 0.05,
  emissive?: number,
): void {
  const legs: ReadonlyArray<readonly [number, number, number, number]> = [
    [-0.36, 0.02, -0.12, -0.3],
    [-0.12, -0.3, 0.38, 0.34],
  ];
  for (const [ax, ay, bx, by] of legs) {
    const len = Math.hypot(bx - ax, by - ay) + 0.15;
    const local = V(((ax + bx) / 2) * s, ((ay + by) / 2) * s, 0).applyQuaternion(q);
    put(acc, new THREE.BoxGeometry(len * s, 0.16 * s, depth), local.add(at), color, {
      q: q.clone().multiply(qEuler(0, 0, Math.atan2(by - ay, bx - ax))),
      aoAmt: 0,
      emissive,
      ao: emissive ? () => 1 : undefined,
    });
  }
}

/** Chevron shield slab (QA "tick in a shield" emblem plate) hanging from `y = 0` at `at`, front +z. */
function shield(
  acc: Acc,
  at: THREE.Vector3,
  w: number,
  h: number,
  color: string,
  mark: string,
  hi: boolean,
): void {
  const g = new THREE.ExtrudeGeometry(cutShape('chevron', w, h, hi), {
    depth: 0.08,
    bevelEnabled: false,
    curveSegments: 1,
  }).translate(0, 0, -0.04);
  put(acc, g, at, color, { aoAmt: 0 });
  if (hi) tick(acc, at.clone().add(V(0, -h * 0.4, 0.05)), w * 0.55, mark, undefined, 0.04);
}

/** Ladybug on a surface at `at` (facing yaw): domed red back, black head, seam and spots. */
function ladybug(acc: Acc, at: THREE.Vector3, r: number, yaw: number, hi: boolean): void {
  const q = qEuler(0, yaw, 0);
  put(acc, blobGeo(r), at.clone().add(V(0, r * 0.28, 0)), RED, {
    q,
    s: [1, 0.62, 1.18],
    aoAmt: 0.05,
  });
  put(acc, blobGeo(r * 0.5), at.clone().add(V(0, r * 0.22, r * 1.05).applyQuaternion(q)), INK, {
    q,
    aoAmt: 0,
  });
  if (!hi) return;
  put(acc, baseBox(r * 0.12, r * 0.12, r * 2.1), at.clone().add(V(0, r * 0.74, 0)), INK, {
    q,
    aoAmt: 0,
  });
  for (const [sx, sz] of [
    [-0.45, -0.3],
    [0.45, 0.2],
  ] as const)
    put(acc, blobGeo(r * 0.2), at.clone().add(V(sx * r, r * 0.6, sz * r).applyQuaternion(q)), INK, {
      aoAmt: 0,
    });
}

/** Quartered crash-test target (yellow disc, two black quarters) facing +z turned by `q`. */
function target(acc: Acc, at: THREE.Vector3, r: number, q: THREE.Quaternion, seg: number): void {
  const flip = (a: number): THREE.BufferGeometry =>
    new THREE.CircleGeometry(r, seg, a, Math.PI / 2);
  put(acc, new THREE.CircleGeometry(r, seg), at, HAZ, { q, aoAmt: 0 });
  for (const a of [0, Math.PI])
    put(acc, flip(a), at.clone().add(V(0, 0, 0.012).applyQuaternion(q)), INK, { q, aoAmt: 0 });
}

/** Jointed limb: rod from a to b with black joint balls at both ends. */
function limb(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  hi: boolean,
  joint: boolean,
): void {
  if (hi) rod(acc, a, b, r, HAZ, 6);
  else rod(acc, a, b, r * 1.1, HAZ, 3, true);
  if (hi && joint) put(acc, blobGeo(r * 1.25), b, INK, { aoAmt: 0 });
}

/* ------------------------------- dummyBench ------------------------------- */

/**
 * Park bench (green slats, dark frame) with a crash-test dummy taking a coffee break: yellow limbs
 * and torso, black joints and quartered target marks, a friendly pair of eyes, paper cup in the
 * right hand and a second one beside him. Front +z, 1.9 u long, head at 1.5 u.
 */
function dummyBench({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const L = 1.9;
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 - 0.1);
    put(acc, baseBox(0.09, 0.45, 0.5), [x, 0, 0], INK, { aoAmt: 0.15 });
    put(acc, baseBox(0.09, 0.92, 0.08), [x, 0, -0.24], INK, { aoAmt: 0.15 });
  }
  if (hi) {
    for (const z of [-0.17, 0, 0.17])
      put(acc, baseBox(L, 0.06, 0.14), [0, 0.43, z], z === 0 ? GREEN_L : GREEN, { aoAmt: 0.1 });
    for (const y of [0.58, 0.72, 0.86])
      put(acc, baseBox(L, 0.11, 0.05), [0, y, -0.27], GREEN, {
        q: qEuler(-0.1, 0, 0),
        aoAmt: 0.05,
      });
  } else {
    put(acc, baseBox(L, 0.06, 0.46), [0, 0.43, 0], GREEN, { aoAmt: 0.1 });
    put(acc, baseBox(L, 0.4, 0.05), [0, 0.55, -0.27], GREEN, { aoAmt: 0.05 });
  }
  const x0 = -0.38;
  const seatY = 0.49;
  // pelvis + torso (leaning back against the slats)
  put(acc, baseBox(0.36, 0.17, 0.28), [x0, seatY, -0.08], HAZ, { aoAmt: 0.1 });
  const bt = qEuler(-0.1, 0, 0);
  const torso = hi
    ? bevBox(0.38, 0.54, 0.22, 0.045).translate(0, 0.27, 0)
    : baseBox(0.38, 0.54, 0.22);
  put(acc, torso, [x0, seatY + 0.12, -0.14], HAZ, { q: bt, aoAmt: 0.1 });
  if (hi) put(acc, cylB(0.05, 0.045, 0.12, 6), [x0, seatY + 0.64, -0.17], INK, { aoAmt: 0 });
  // head with side targets and eyes
  const hy = seatY + 0.9;
  put(acc, blobGeo(0.17, hi ? 1 : 0), [x0, hy, -0.15], HAZ, { aoAmt: 0.05 });
  if (hi) {
    target(acc, V(x0 + 0.169, hy, -0.15), 0.085, qEuler(0, Math.PI / 2, 0), 10);
    target(acc, V(x0 - 0.169, hy, -0.15), 0.085, qEuler(0, -Math.PI / 2, 0), 10);
    for (const sx of [-1, 1])
      put(acc, blobGeo(0.026), [x0 + sx * 0.066, hy + 0.01, 0.015], INK, { aoAmt: 0 });
    target(acc, V(x0, seatY + 0.52, -0.027), 0.1, new THREE.Quaternion(), 10);
  }
  // legs: thigh forward, shin down, boot
  for (const sx of [-1, 1]) {
    const hip = V(x0 + sx * 0.1, seatY + 0.08, -0.08);
    const knee = V(x0 + sx * 0.1, seatY + 0.1, 0.34);
    const ankle = V(x0 + sx * 0.1, 0.1, 0.38);
    limb(acc, hip, knee, 0.068, hi, true);
    limb(acc, knee, ankle, 0.058, hi, false);
    put(acc, baseBox(0.13, 0.07, 0.24), [x0 + sx * 0.1, 0.0, 0.43], INK, { aoAmt: 0.1 });
  }
  // arms: left in the lap, right lifts a coffee
  const shL = V(x0 - 0.23, seatY + 0.6, -0.13);
  const elL = V(x0 - 0.27, seatY + 0.3, -0.02);
  limb(acc, shL, elL, 0.052, hi, true);
  limb(acc, elL, V(x0 - 0.16, seatY + 0.2, 0.2), 0.048, hi, false);
  const shR = V(x0 + 0.23, seatY + 0.6, -0.13);
  const elR = V(x0 + 0.27, seatY + 0.32, 0.0);
  limb(acc, shR, elR, 0.052, hi, true);
  const hand = V(x0 + 0.2, seatY + 0.5, 0.26);
  limb(acc, elR, hand, 0.048, hi, false);
  if (hi) {
    put(acc, blobGeo(0.06), shL, INK, { aoAmt: 0 });
    put(acc, blobGeo(0.06), shR, INK, { aoAmt: 0 });
    put(acc, blobGeo(0.055), hand, INK, { aoAmt: 0 });
  }
  cup(acc, hand.clone().add(V(0, 0.02, 0.05)), hi);
  // second cup, a thermos and a QA label on the bench
  cup(acc, V(0.55, seatY, 0.0), hi);
  if (hi) {
    put(acc, cylB(0.06, 0.06, 0.32, 8), [0.82, seatY, 0.0], GREEN_L, { aoAmt: 0.1 });
    put(acc, cylB(0.062, 0.062, 0.07, 8), [0.82, seatY + 0.32, 0.0], INK, { aoAmt: 0 });
    put(acc, baseBox(0.34, 0.2, 0.03), [0.5, 0.64, -0.3], CREAM, { aoAmt: 0 });
    tick(acc, V(0.5, 0.74, -0.27), 0.17, GREEN, undefined, 0.03);
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'seat', { center: [x0, seatY, -0.02], normal: [0, 0, 1] });
}

/** Paper cup with a green sleeve and a dark lid, base at `at`. */
function cup(acc: Acc, at: THREE.Vector3, hi: boolean): void {
  put(acc, cylB(0.045, 0.058, 0.13, hi ? 6 : 4), at, WHITE, { aoAmt: 0.05 });
  if (hi) {
    put(acc, cylB(0.05, 0.055, 0.05, 6), at.clone().add(V(0, 0.04, 0)), GREEN, { aoAmt: 0 });
    put(acc, cylB(0.062, 0.062, 0.025, 6), at.clone().add(V(0, 0.13, 0)), INK, { aoAmt: 0 });
  }
}

/* ----------------------------- inspectionBooth ----------------------------- */

/**
 * Checkpoint kit prefab on a 2.6 x 2.6 slab: glass-sided guard booth (green roof with a shield
 * plaque and beacon, counter window with a monitor and a stamp), a hazard-striped barrier post with
 * a boom across the front and its rest, two cones. Door side +z.
 */
function inspectionBooth({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const S = 2.6;
  const y0 = 0.12;
  put(acc, baseBox(S, y0, S), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
  if (hi) hazardBars(acc, -S / 2, S / 2, y0, S / 2 - 0.07, 0.02, 0.12, 12);
  // booth cabin (left-back), 1.6 x 1.5
  const bx = -0.35;
  const bz = -0.5;
  const bw = 1.6;
  const bd = 1.5;
  const wallH = 0.95;
  const top = 2.0;
  if (hi) put(acc, baseBox(bw, 0.06, bd), [bx, y0, bz], CREAM, { aoAmt: 0.05 });
  // lower walls (back, sides) and corner posts
  put(acc, baseBox(bw, wallH, 0.1), [bx, y0, bz - bd / 2 + 0.05], WHITE, { aoAmt: 0.15 });
  for (const sx of [-1, 1])
    put(acc, baseBox(0.1, wallH, bd), [bx + sx * (bw / 2 - 0.05), y0, bz], WHITE, { aoAmt: 0.15 });
  if (hi)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        put(
          acc,
          baseBox(0.12, top - y0, 0.12),
          [bx + sx * (bw / 2 - 0.06), y0, bz + sz * (bd / 2 - 0.06)],
          GREEN,
          { aoAmt: 0.1 },
        );
  // glass above the lower walls: back + both sides (lit at night)
  const gh = top - y0 - wallH - 0.1;
  const glass = { emissive: 0.4, aoAmt: 0.05 } as const;
  put(acc, baseBox(bw - 0.2, gh, 0.06), [bx, y0 + wallH, bz - bd / 2 + 0.05], C.glass, glass);
  for (const sx of [-1, 1])
    put(
      acc,
      baseBox(0.06, gh, bd - 0.2),
      [bx + sx * (bw / 2 - 0.05), y0 + wallH, bz],
      C.glass,
      glass,
    );
  // front: counter ledge with monitor + stamp, open window above
  put(acc, baseBox(bw, 0.95 - 0.1, 0.1), [bx, y0, bz + bd / 2 - 0.05], WHITE, { aoAmt: 0.15 });
  put(acc, baseBox(bw + 0.14, 0.07, 0.4), [bx, y0 + 0.9, bz + bd / 2 + 0.05], WOOD.planks, {
    aoAmt: 0.1,
  });
  if (hi) {
    put(acc, baseBox(0.42, 0.28, 0.05), [bx - 0.3, y0 + 0.97 + 0.09, bz + bd / 2 - 0.15], C.bezel, {
      aoAmt: 0,
    });
    put(acc, baseBox(0.34, 0.2, 0.03), [bx - 0.3, y0 + 0.97 + 0.13, bz + bd / 2 - 0.12], C.screen, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
    // stamp + pad on the ledge
    put(acc, baseBox(0.22, 0.04, 0.16), [bx + 0.35, y0 + 0.97, bz + bd / 2 + 0.08], GREEN_D, {
      aoAmt: 0,
    });
    put(acc, cylB(0.05, 0.035, 0.16, 6), [bx + 0.35, y0 + 1.01, bz + bd / 2 + 0.08], WOOD.logs, {
      aoAmt: 0,
    });
    // inside: stool
    put(acc, cylB(0.17, 0.2, 0.46, 6), [bx + 0.1, y0 + 0.06, bz - 0.2], GREEN_D, { aoAmt: 0.1 });
  }
  // roof + lintel + shield plaque + beacon
  put(acc, baseBox(bw + 0.4, 0.1, bd + 0.4), [bx, top, bz], GREEN, { aoAmt: 0.05 });
  put(acc, baseBox(bw + 0.4, 0.12, 0.1), [bx, top - 0.02, bz + bd / 2 + 0.2], WHITE, { aoAmt: 0 });
  shield(acc, V(bx, top - 0.06, bz + bd / 2 + 0.28), 0.62, 0.74, CREAM, GREEN, hi);
  if (hi) put(acc, cylB(0.09, 0.07, 0.07, 6), [bx + 0.5, top + 0.1, bz - 0.2], INK, { aoAmt: 0 });
  put(acc, blobGeo(0.11, hi ? 1 : 0), [bx + 0.5, top + 0.24, bz - 0.2], GREEN_L, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  // barrier: post right-front, boom across the front lane, rest on the left
  const px = 1.0;
  const pz = 0.75;
  put(acc, baseBox(0.3, 0.95, 0.3), [px, y0, pz], HAZ, { aoAmt: 0.15 });
  if (hi) {
    for (const y of [0.25, 0.55])
      put(acc, baseBox(0.32, 0.11, 0.32), [px, y0 + y, pz], HAZ_K, { aoAmt: 0 });
    put(acc, blobGeo(0.1), [px, y0 + 1.0, pz], RED, { emissive: 1, aoAmt: 0, ao: () => 1 });
  }
  const armY = y0 + 0.78;
  const n = hi ? 8 : 2;
  const x1 = px - 0.15;
  const x2 = -1.15;
  for (let i = 0; i < n; i++) {
    const a = x1 + ((x2 - x1) * i) / n;
    const b = x1 + ((x2 - x1) * (i + 1)) / n;
    put(
      acc,
      baseBox(Math.abs(b - a), 0.12, 0.12),
      [(a + b) / 2, armY, pz],
      i % 2 === 0 ? WHITE : RED,
      {
        aoAmt: 0,
      },
    );
  }
  put(acc, baseBox(0.16, 0.5, 0.16), [x2 - 0.1, y0, pz], HAZ_K, { aoAmt: 0.1 });
  // cones in front of the slab corners
  if (hi)
    for (const [cx, cz] of [
      [-1.0, 1.0],
      [0.1, 1.05],
    ] as const) {
      put(acc, baseBox(0.28, 0.03, 0.28), [cx, y0, cz], INK, { aoAmt: 0 });
      put(
        acc,
        new THREE.ConeGeometry(0.1, 0.42, 8).translate(0, 0.21, 0),
        [cx, y0 + 0.03, cz],
        C.cone,
        {
          aoAmt: 0.1,
        },
      );
      put(acc, cylB(0.07, 0.06, 0.09, 8), [cx, y0 + 0.17, cz], WHITE, { aoAmt: 0 });
    }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'gate', { center: [0.0, y0 + 0.78, pz], axis: [1, 0, 0] });
}

/* ------------------------------- uvLampPost ------------------------------- */

/**
 * Yard lamp for the night bug hunt: green-collared post, swan-neck arm and a hooded UV tube in a
 * safety cage that glows purple (UV `#B39DFF`, emissive 1). 2.7 u tall; a ladybug rides the post.
 */
function uvLampPost({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const hi = lod === 0;
  if (!hi) {
    // far proxy: base, pole, arm, hood and the glowing tube
    put(acc, cylB(0.3, 0.24, 0.16, 5), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
    put(acc, cylB(0.075, 0.06, 2.3, 4), [0, 0.16, 0], C.steel, { aoAmt: 0.15 });
    rod(acc, V(0, 2.4, 0), V(0.55, 2.56, 0), 0.06, C.steel, 3, true);
    put(
      acc,
      new THREE.CylinderGeometry(0.1, 0.34, 0.26, 5, 1, true).translate(0, 0.13, 0),
      [0.62, 2.32, 0],
      INK,
      {
        aoAmt: 0.05,
      },
    );
    put(acc, new THREE.CylinderGeometry(0.075, 0.075, 0.62, 5), [0.62, 2.24, 0], UV, {
      q: qEuler(0, 0, Math.PI / 2),
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
    return acc.finish(rng, false, true);
  }
  const seg = 7;
  put(acc, cylB(0.3, 0.24, 0.16, 8), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
  put(acc, cylB(0.13, 0.12, 0.16, seg), [0, 0.16, 0], HAZ, { aoAmt: 0.05 });
  if (hi) put(acc, cylB(0.135, 0.135, 0.06, seg), [0, 0.22, 0], HAZ_K, { aoAmt: 0 });
  put(acc, cylB(0.075, 0.06, 2.1, seg), [0, 0.32, 0], C.steel, { aoAmt: 0.15 });
  put(acc, cylB(0.1, 0.075, 0.08, seg), [0, 1.2, 0], GREEN, { aoAmt: 0 });
  // swan neck: up, over, down to the hood at x = +0.62
  const a = V(0, 2.4, 0);
  const b = V(0.18, 2.52, 0);
  const c = V(0.55, 2.56, 0);
  rod(acc, V(0, 2.3, 0), a, 0.06, C.steel, seg);
  rod(acc, a, b, 0.055, C.steel, seg);
  rod(acc, b, c, 0.05, C.steel, seg);
  put(acc, blobGeo(0.07), a, C.steel, { aoAmt: 0 });
  // hood (cone frustum open at the bottom), tube, cage
  const hx = 0.62;
  const hy = 2.2;
  put(
    acc,
    new THREE.CylinderGeometry(0.1, 0.34, 0.26, hi ? 8 : 5, 1, true).translate(0, 0.13, 0),
    [hx, hy + 0.12, 0],
    INK,
    {
      aoAmt: 0.05,
    },
  );
  put(acc, cylB(0.1, 0.09, 0.07, hi ? 8 : 5), [hx, hy + 0.37, 0], C.steel, { aoAmt: 0 });
  put(acc, new THREE.CylinderGeometry(0.075, 0.075, 0.62, hi ? 8 : 5), [hx, hy + 0.04, 0], UV, {
    q: qEuler(0, 0, Math.PI / 2),
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  if (hi) {
    for (const sx of [-1, 1]) {
      put(acc, cylB(0.09, 0.09, 0.05, 8), [hx + sx * 0.33, hy - 0.04, 0], INK, { aoAmt: 0 });
      put(acc, blobGeo(0.06), [hx + sx * 0.37, hy + 0.04, 0], UV, {
        emissive: 1,
        aoAmt: 0,
        ao: () => 1,
      });
    }
    for (const z of [-0.14, 0.14])
      put(acc, baseBox(0.66, 0.025, 0.025), [hx, hy - 0.06, z], C.steelLight, { aoAmt: 0 });
    ladybug(acc, V(0.08, 1.6, 0.0), 0.075, 0, true);
    shield(acc, V(0, 1.1, 0.11), 0.2, 0.26, CREAM, GREEN, false);
  }
  const g = acc.finish(rng, false, true);
  return addHook(g, 'lamp', { center: [hx, hy + 0.04, 0], color: UV });
}

/* -------------------------------- scoreboard -------------------------------- */

/** Seven-segment bit masks (a b c d e f g) for the digits the board shows. */
const SEG: Readonly<Record<number, readonly boolean[]>> = {
  0: [true, true, true, true, true, true, false],
  1: [false, true, true, false, false, false, false],
};

/**
 * "BUGS" scoreboard on two posts: ladybug emblem on the left, one seven-segment digit on the right,
 * a row of status LEDs on top. v0 = "0" lit green with all-green LEDs; v1 = "1" lit red, one red LED
 * and a ladybug that has escaped onto the frame. LOD1 (far) is identical for both variants.
 */
function scoreboard({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const one = variant === 1;
  for (const sx of [-1, 1])
    put(acc, baseBox(0.16, 0.85, 0.16), [sx * 0.9, 0, -0.02], INK, { aoAmt: 0.2 });
  put(acc, baseBox(2.5, 1.85, 0.2), [0, 0.7, 0], GREEN_D, { aoAmt: 0.1 });
  put(acc, baseBox(2.28, 1.63, 0.06), [0, 0.8, 0.1], INK, { aoAmt: 0 });
  const fz = 0.14;
  if (!hi) {
    put(acc, baseBox(0.6, 1.0, 0.05), [0.55, 1.1, fz], GREEN_L, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
    put(acc, cylB(0.4, 0.4, 0.05, 6), [-0.62, 1.1, fz], RED, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0,
    });
    return acc.finish(rng, false, true);
  }
  // LED row
  for (let i = 0; i < 8; i++) {
    const bad = one && i === 7;
    put(acc, blobGeo(0.065), [-0.9 + i * 0.257, 2.28, fz], bad ? RED : GREEN_L, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
  }
  // ladybug emblem: green disc, red back, black head/seam/spots
  const ex = -0.62;
  const ey = 1.4;
  const flat = qEuler(Math.PI / 2, 0, 0);
  put(acc, new THREE.CylinderGeometry(0.46, 0.46, 0.04, 12), [ex, ey, fz], GREEN, {
    q: flat,
    aoAmt: 0,
  });
  put(acc, new THREE.CylinderGeometry(0.32, 0.32, 0.04, 10), [ex, ey - 0.03, fz + 0.03], RED, {
    q: flat,
    aoAmt: 0,
  });
  put(acc, new THREE.CylinderGeometry(0.13, 0.13, 0.04, 8), [ex, ey + 0.34, fz + 0.03], INK, {
    q: flat,
    aoAmt: 0,
  });
  put(acc, baseBox(0.05, 0.62, 0.03), [ex, ey - 0.33, fz + 0.04], INK, { aoAmt: 0 });
  for (const [sx, sy] of [
    [-0.15, 0.1],
    [0.15, 0.1],
    [-0.12, -0.16],
    [0.12, -0.16],
  ] as const)
    put(
      acc,
      new THREE.CylinderGeometry(0.055, 0.055, 0.04, 6),
      [ex + sx, ey + sy, fz + 0.05],
      INK,
      {
        q: flat,
        aoAmt: 0,
      },
    );
  // seven-segment digit
  const lit = one ? RED : GREEN_L;
  const sl = 0.38;
  const w = 0.1;
  const cx = 0.55;
  const cy = 1.4;
  const o = sl / 2 + w / 2;
  const segs: ReadonlyArray<readonly [number, number, boolean]> = [
    [0, sl + w, true],
    [o, o, false],
    [o, -o, false],
    [0, -(sl + w), true],
    [-o, -o, false],
    [-o, o, false],
    [0, 0, true],
  ];
  const mask = SEG[one ? 1 : 0];
  segs.forEach(([dx, dy, horiz], i) => {
    const on = mask[i];
    put(
      acc,
      new THREE.BoxGeometry(horiz ? sl : w, horiz ? w : sl, on ? 0.06 : 0.03),
      [cx + dx, cy + dy, fz + (on ? 0.03 : 0.015)],
      on ? lit : C.bezel,
      { emissive: on ? 1 : 0, aoAmt: 0, ao: on ? () => 1 : undefined },
    );
  });
  if (one) ladybug(acc, V(1.0, 2.55, 0.0), 0.1, 0.6, true);
  const g = acc.finish(rng, false, true);
  return addHook(g, 'digit', { center: [cx, cy, fz], size: [0.58, 1.06], normal: [0, 0, 1] });
}

/* --------------------------------- bugJar --------------------------------- */

/**
 * Tray of three glass jars with ladybugs, lids with a green tick label. The glass is a cage of ribs
 * (opaque glass would hide the bugs); ribs and rings glow faintly green at night.
 */
function bugJar({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.02);
  const hi = lod === 0;
  const ty = 0.07;
  put(acc, baseBox(1.15, ty, 0.5), [0, 0, 0], WOOD.planks, { aoAmt: 0.15 });
  const glow = { emissive: 0.45, aoAmt: 0, ao: () => 1 } as const;
  const jars: ReadonlyArray<readonly [number, number, number, number]> = [
    [-0.34, 0.13, 0.36, 1],
    [0.0, 0.16, 0.48, 2],
    [0.35, 0.12, 0.3, 1],
  ];
  for (const [x, r, h, bugs] of jars) {
    if (!hi) {
      // far proxy: one glowing glass column, lid, a bug
      put(acc, cylB(r, r, h, 4), [x, ty, 0], C.glass, glow);
      put(acc, baseBox(r * 2.1, 0.05, r * 2.1), [x, ty + h, 0], GREEN, { aoAmt: 0.05 });
      continue;
    }
    put(acc, cylB(r + 0.015, r + 0.015, 0.05, 6), [x, ty, 0], GREEN_D, { aoAmt: 0.1 });
    // glass cage
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      put(
        acc,
        baseBox(0.04, h, 0.04),
        [x + Math.cos(a) * r, ty + 0.05, Math.sin(a) * r],
        C.glass,
        glow,
      );
    }
    // leaf + bugs inside
    put(acc, blobGeo(r * 0.7), [x, ty + 0.1, 0.02], GRASS[3], { s: [1, 0.2, 0.7], aoAmt: 0 });
    for (let b = 0; b < bugs; b++)
      ladybug(
        acc,
        V(x + (b - (bugs - 1) / 2) * r * 0.55, ty + 0.12 + b * h * 0.28, 0.0),
        r * 0.32,
        b * 1.1,
        false,
      );
    // lid with a tick label on the jar
    put(acc, cylB(r + 0.03, r + 0.03, 0.05, 6), [x, ty + 0.05 + h, 0], GREEN, { aoAmt: 0.05 });
    if (x === 0) {
      put(acc, baseBox(r * 0.9, r * 0.8, 0.02), [x, ty + 0.15 + h * 0.2, r + 0.02], CREAM, {
        aoAmt: 0,
      });
      tick(acc, V(x, ty + 0.15 + h * 0.2, r + 0.04), r * 0.7, GREEN, undefined, 0.02);
    }
  }
  ladybug(acc, V(0.0, ty, 0.2), 0.045, 0.4, false);
  return acc.finish(rng, false, true);
}

/* ------------------------------- conePyramid ------------------------------- */

/**
 * Six traffic cones in a 3-2-1 pyramid, each tier a plank on the tips of the one below, standing on
 * a pallet; a tiny green pennant on top and an "ART" placard with a star in front.
 */
function conePyramid({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.03);
  const hi = lod === 0;
  const cone = (x: number, y: number): void => {
    if (hi) put(acc, baseBox(0.34, 0.03, 0.34), [x, y, 0], INK, { aoAmt: 0.1 });
    put(
      acc,
      new THREE.ConeGeometry(0.16, 0.62, hi ? 8 : 4, 1, true).translate(0, 0.31, 0),
      [x, y + 0.03, 0],
      C.cone,
      { aoAmt: 0.1 },
    );
    if (hi)
      put(acc, cylB(0.1, 0.075, 0.17, 8, true), [x, y + 0.25, 0], WHITE, {
        aoAmt: 0,
        s: [1.02, 1, 1.02],
      });
  };
  put(acc, baseBox(1.5, 0.1, 0.6), [0, 0, 0], WOOD.logs, { aoAmt: 0.2 });
  const y1 = 0.1;
  for (const x of [-0.45, 0, 0.45]) cone(x, y1);
  const p1 = y1 + 0.65;
  put(acc, baseBox(1.25, 0.07, 0.42), [0, p1, 0], WOOD.planks, { aoAmt: 0.1 });
  const y2 = p1 + 0.07;
  for (const x of [-0.24, 0.24]) cone(x, y2);
  const p2 = y2 + 0.65;
  put(acc, baseBox(0.85, 0.07, 0.42), [0, p2, 0], WOOD.planks, { aoAmt: 0.1 });
  const y3 = p2 + 0.07;
  cone(0, y3);
  const tip = y3 + 0.65;
  if (hi) {
    rod(acc, V(0, tip - 0.05, 0), V(0, tip + 0.3, 0), 0.015, C.steelLight, 3);
    const fl = new THREE.ExtrudeGeometry(cutShape('chevron', 0.26, 0.2, false), {
      depth: 0.04,
      bevelEnabled: false,
      curveSegments: 1,
    }).translate(0, 0, -0.02);
    put(acc, fl, [0, tip + 0.3, 0], GREEN, {
      q: qEuler(0, Math.PI / 2, 0),
      aoAmt: 0,
      ao: () => 1,
      windAbs: 0,
    });
  }
  // "ART" placard on a stick, a star on it
  if (hi) put(acc, cylB(0.03, 0.03, 0.55, 4), [0.95, 0, 0.5], WOOD.dark, { aoAmt: 0.1 });
  if (hi) put(acc, baseBox(0.55, 0.38, 0.06), [0.95, 0.55, 0.5], CREAM, { aoAmt: 0.05 });
  if (hi) addGlyph(acc, 'star', V(0.95, 0.74, 0.55), { size: 0.26, color: HAZ, depth: 0.03 });
  const g = acc.finish(rng, false, true);
  return addHook(g, 'perch', { center: [0, tip + 0.02, 0] });
}

/* -------------------------------- flagMast -------------------------------- */

/**
 * Test-round flag mast: hazard plinth, white pole with a gold truck, the QA chevron pennant (tick on
 * both faces) flying from the top, a signal box with a status lamp at the foot. 2.8 u tall.
 */
function flagMast({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const seg = hi ? 6 : 4;
  put(acc, cylB(0.55, 0.52, 0.1, hi ? 8 : 5), [0, 0, 0], C.plinth, { aoAmt: 0.2 });
  if (hi) put(acc, cylB(0.52, 0.5, 0.06, 8), [0, 0.1, 0], HAZ, { aoAmt: 0 });
  const topY = 2.45;
  put(acc, cylB(0.075, 0.045, topY - 0.16, seg), [0, 0.16, 0], WHITE, { aoAmt: 0.1 });
  if (hi) {
    put(acc, blobGeo(0.075), [0, topY + 0.04, 0], C.gold, { aoAmt: 0 });
    // hazard sleeve at the foot
    put(acc, cylB(0.1, 0.09, 0.1, seg), [0, 0.2, 0], HAZ, { aoAmt: 0 });
    put(acc, cylB(0.095, 0.09, 0.1, seg), [0, 0.3, 0], HAZ_K, { aoAmt: 0 });
  }
  // pennant flying toward +x from just under the truck, tick on both faces
  const fl = V(0, topY - 0.1, 0);
  const len = 0.95;
  const q = qEuler(0, 0, Math.PI / 2);
  const shape = new THREE.ExtrudeGeometry(cutShape('chevron', len * 0.66, len, hi), {
    depth: 0.08,
    bevelEnabled: false,
    curveSegments: 1,
  }).translate(0, 0, -0.04);
  put(acc, shape, fl, GREEN, {
    q,
    aoAmt: 0,
    ao: () => 1,
    windAbs: (p) => 0.15 + 0.85 * clamp01(Math.hypot(p.x - fl.x, p.z - fl.z) / len),
  });
  if (hi) {
    for (const sz of [-1, 1])
      tick(
        acc,
        V(len * 0.36, topY - 0.1, sz * 0.05),
        0.3,
        WHITE,
        qEuler(0, sz < 0 ? Math.PI : 0, 0),
        0.03,
      );
  }
  // signal box: hazard base band, green lamp
  put(acc, baseBox(0.34, 0.6, 0.28), [0.65, 0, 0.1], GREEN_D, { aoAmt: 0.15 });
  if (hi) put(acc, baseBox(0.36, 0.1, 0.3), [0.65, 0, 0.1], HAZ, { aoAmt: 0 });
  put(acc, blobGeo(0.07, 0), [0.65, 0.68, 0.1], GREEN_L, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  if (hi) put(acc, baseBox(0.2, 0.2, 0.03), [0.65, 0.3, 0.26], CREAM, { aoAmt: 0 });
  if (hi) tick(acc, V(0.65, 0.4, 0.285), 0.16, GREEN, undefined, 0.02);
  const g = acc.finish(rng, true, true);
  return addHook(g, 'flag', { pole: [0, 0.16, 0], top: [0, topY, 0], len });
}

/* -------------------------------- stampDesk -------------------------------- */

/**
 * Approval desk: stamp on an ink pad, stack of papers with fresh ticks, out tray, mug, green lamp,
 * a green "approved" front panel with a tick, and the inspector's chair behind it (-z).
 */
function stampDesk({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.015);
  const hi = lod === 0;
  const ty = 0.72;
  put(acc, baseBox(1.3, 0.08, 0.72), [0, ty, 0], WOOD.planks, { aoAmt: 0.05 });
  for (const sx of [-1, 1])
    put(acc, baseBox(0.08, ty, 0.62), [sx * 0.6, 0, 0], WOOD.dark, { aoAmt: 0.2 });
  put(acc, baseBox(1.1, 0.5, 0.05), [0, 0.2, 0.31], GREEN, { aoAmt: 0.1 });
  if (hi) {
    tick(acc, V(0, 0.46, 0.35), 0.3, WHITE, undefined, 0.03);
    put(acc, baseBox(0.4, 0.5, 0.6), [0.38, 0.22, -0.02], WOOD.logs, { aoAmt: 0.15 });
    put(acc, blobGeo(0.03), [0.38, 0.5, 0.3], C.gold, { aoAmt: 0 });
  }
  const top = ty + 0.08;
  // ink pad + stamp
  put(acc, baseBox(0.24, 0.04, 0.18), [-0.35, top, 0.12], GREEN_D, { aoAmt: 0 });
  if (hi) {
    put(acc, cylB(0.075, 0.075, 0.05, 8), [-0.35, top + 0.04, 0.12], WOOD.logs, { aoAmt: 0.05 });
    put(acc, cylB(0.045, 0.035, 0.12, 6), [-0.35, top + 0.09, 0.12], WOOD.planks, { aoAmt: 0.05 });
    put(acc, blobGeo(0.055), [-0.35, top + 0.24, 0.12], WOOD.planks, { aoAmt: 0 });
  }
  // paper stack with a stamped sheet, out tray
  put(acc, baseBox(0.36, 0.07, 0.27), [0.05, top, 0.08], WHITE, { aoAmt: 0.05 });
  put(acc, baseBox(0.36, 0.03, 0.27), [0.1, top + 0.07, 0.02], CREAM, {
    q: qEuler(0, 0.2, 0),
    aoAmt: 0,
  });
  if (hi) {
    tick(acc, V(0.1, top + 0.11, 0.04), 0.2, GREEN, qEuler(-Math.PI / 2, 0.2, 0), 0.01);
    put(acc, baseBox(0.34, 0.05, 0.26), [-0.05, top, -0.22], C.steel, { aoAmt: 0.1 });
    put(acc, baseBox(0.3, 0.025, 0.2), [-0.05, top + 0.05, -0.22], WHITE, { aoAmt: 0 });
    // mug + lamp
    put(acc, cylB(0.05, 0.055, 0.1, 8), [0.5, top, 0.15], WHITE, { aoAmt: 0.05 });
    put(acc, baseBox(0.04, 0.05, 0.02), [0.55, top + 0.03, 0.15], WHITE, { aoAmt: 0 });
    put(acc, cylB(0.09, 0.09, 0.03, 8), [0.45, top, -0.22], GREEN_D, { aoAmt: 0 });
    rod(acc, V(0.45, top + 0.03, -0.22), V(0.38, top + 0.4, -0.2), 0.012, C.steel, 3);
    rod(acc, V(0.38, top + 0.4, -0.2), V(0.28, top + 0.46, -0.12), 0.012, C.steel, 3);
    put(
      acc,
      new THREE.ConeGeometry(0.1, 0.12, 8, 1, true).translate(0, -0.06, 0),
      [0.28, top + 0.5, -0.12],
      GREEN,
      {
        q: qEuler(0.4, 0, 0.2),
        aoAmt: 0,
        double: true,
      },
    );
    put(acc, blobGeo(0.035), [0.275, top + 0.4, -0.1], EMISSIVE.window, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
  }
  // chair behind the desk
  const cz = -0.78;
  put(acc, baseBox(0.46, 0.06, 0.46), [0, 0.42, cz], GREEN_D, { aoAmt: 0.1 });
  if (hi)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        put(acc, baseBox(0.05, 0.42, 0.05), [sx * 0.19, 0, cz + sz * 0.19], C.steel, {
          aoAmt: 0.2,
        });
  put(acc, baseBox(0.46, 0.4, 0.05), [0, 0.5, cz - 0.22], GREEN_D, {
    q: qEuler(-0.08, 0, 0),
    aoAmt: 0.1,
  });
  const g = acc.finish(rng, false, true);
  return addHook(g, 'seat', { center: [0, 0.48, cz], normal: [0, 0, 1] });
}

/* ------------------------------ clipboardWall ------------------------------ */

/**
 * Notice frame with six hanging clipboards (3 x 2): five ticked, one red cross; two posts, a tick
 * header plate. 2.6 u wide, 2.3 u tall.
 */
function clipboardWall({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.012);
  const hi = lod === 0;
  const r = rng.fork('boards');
  for (const sx of [-1, 1])
    put(acc, baseBox(0.15, 2.1, 0.15), [sx * 1.2, 0, -0.02], WOOD.dark, { aoAmt: 0.2 });
  put(acc, baseBox(2.5, 1.55, 0.1), [0, 0.38, 0], WOOD.planks, { aoAmt: 0.1 });
  put(acc, baseBox(2.7, 0.3, 0.2), [0, 1.98, 0], GREEN, { aoAmt: 0.05 });
  if (hi) {
    addGlyph(acc, 'check', V(-0.9, 2.13, 0.1), { size: 0.24, color: WHITE, depth: 0.04 });
    for (let i = 0; i < 4; i++)
      put(acc, baseBox(0.34, 0.08, 0.03), [-0.4 + i * 0.5, 2.13, 0.11], i % 2 ? WHITE : GREEN_L, {
        aoAmt: 0,
      });
    put(acc, baseBox(2.6, 0.08, 0.16), [0, 0.34, 0.03], WOOD.logs, { aoAmt: 0 });
  }
  if (!hi) {
    // far proxy: a paper strip per row with the red cross as one block
    for (let row = 0; row < 2; row++)
      put(acc, baseBox(2.3, 0.6, 0.04), [0, 0.5 + (1 - row) * 0.72, 0.08], WHITE, { aoAmt: 0 });
    put(acc, baseBox(0.3, 0.3, 0.04), [0.8, 0.65, 0.11], RED, { aoAmt: 0 });
    return acc.finish(rng, false, true);
  }
  for (let row = 0; row < 2; row++)
    for (let c = 0; c < 3; c++) {
      const x = (c - 1) * 0.8;
      const y = 0.52 + (1 - row) * 0.72 + 0.34;
      const roll = r.range(-0.07, 0.07);
      const q = qEuler(0, 0, roll);
      put(acc, baseBox(0.54, 0.64, 0.04), [x, y - 0.32, 0.07], WOOD.logs, { q, aoAmt: 0.05 });
      put(acc, baseBox(0.44, 0.52, 0.02), [x, y - 0.29, 0.1], WHITE, { q, aoAmt: 0 });
      put(acc, baseBox(0.22, 0.08, 0.06), [x, y + 0.24, 0.09], GREEN_D, { q, aoAmt: 0 });
      if (row === 1 && c === 2)
        for (const s of [-1, 1])
          put(acc, new THREE.BoxGeometry(0.34, 0.06, 0.02), [x, y - 0.05, 0.12], RED, {
            q: q.clone().multiply(qEuler(0, 0, s * 0.8)),
            aoAmt: 0,
          });
      else tick(acc, V(x, y - 0.06, 0.115), 0.34, GREEN, q, 0.02);
    }
  return acc.finish(rng, false, true);
}

/* ------------------------- bugZoo (terrarium v2) ------------------------- */

const TRIM_LIN = col(WHITE);

/**
 * `terrarium` variant 2 = the Bug Zoo. LOD1 is the existing barrel-vault terrarium v1 (the
 * registry maps it through `PropGeoDef.lod1Of`, so the far silhouette is bit-identical, B2). LOD0 =
 * terrarium v1 with the white glazing frame recoloured QA green plus a giant ladybug on the roof,
 * a tick-in-shield plaque over the door, ladybugs on leaves at the entrance and a hazard-striped
 * front step lip.
 */
function bugZoo(base: PropBuilder, { rng, lod }: BuildOpts): THREE.BufferGeometry {
  const g = base({ rng, lod, variant: 1 });
  if (lod === 1) return g;
  const colr = g.getAttribute('color');
  const green = col(GREEN_D);
  for (let i = 0; i < colr.count; i++) {
    const r = colr.getX(i);
    const gg = colr.getY(i);
    const b = colr.getZ(i);
    if (r > 0.8 && gg > 0.8 && b > 0.75) {
      const f = (r + gg + b) / 3 / ((TRIM_LIN.r + TRIM_LIN.g + TRIM_LIN.b) / 3);
      colr.setXYZ(i, green.r * f, green.g * f, green.b * f);
    }
  }
  const acc = jitterAcc(rng, 0.015);
  const L = 5;
  const ridge = 2.5;
  // giant ladybug on the roof (middle bay, between the hatches), `zs` in from the gable end so
  // its tail stays on the roof (TASK-453c: it hung past the end)
  const zs = 0.3;
  put(acc, blobGeo(0.5, 1), [0, ridge + 0.1, -2.0 + zs], RED, { s: [1, 0.62, 1.2], aoAmt: 0.05 });
  put(acc, blobGeo(0.24, 0), [0, ridge + 0.12, -1.34 + zs], INK, { aoAmt: 0 });
  put(acc, baseBox(0.07, 0.07, 1.1), [0, ridge + 0.4, -2.05 + zs], INK, { aoAmt: 0 });
  for (const [sx, sz] of [
    [-0.27, -0.25],
    [0.27, -0.25],
    [-0.25, 0.25],
    [0.25, 0.25],
  ] as const)
    put(acc, blobGeo(0.09), [sx, ridge + 0.34, sz - 2 + zs], INK, { s: [1, 0.5, 1], aoAmt: 0 });
  for (const sx of [-1, 1])
    rod(
      acc,
      V(sx * 0.1, ridge + 0.2, -1.2 + zs),
      V(sx * 0.25, ridge + 0.45, -0.9 + zs),
      0.03,
      INK,
      3,
      true,
    );
  // shield plaque over the door arch (front, +z), standing on the step
  shield(acc, V(0, 3.05, L / 2 + 0.1), 0.9, 1.0, CREAM, GREEN, true);
  // hazard strip along the step lip, ladybugs on leaves flanking the door
  hazardBars(acc, -1.0, 1.0, 0.14, L / 2 + 0.55, 0.02, 0.1, 6);
  for (const sx of [-1, 1]) {
    put(acc, blobGeo(0.34), [sx * 1.0, 0.1, L / 2 + 0.55], GRASS[2], {
      s: [1, 0.16, 0.7],
      aoAmt: 0,
    });
    ladybug(acc, V(sx * 1.0, 0.18, L / 2 + 0.55), 0.1, sx * 0.8, false);
  }
  const extra = acc.finish(rng, true, true);
  const merged = mergeGeometries([g, extra], false);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.userData = { ...g.userData, tris: merged.getAttribute('position').count / 3 };
  return merged;
}

/** Wraps a terrarium geo def so variant `BUG_ZOO_VARIANT` builds the Bug Zoo (LOD1 = variant 1). */
export function withBugZoo(def: PropGeoDef): PropGeoDef {
  const build: PropBuilder = (o) =>
    o.variant === BUG_ZOO_VARIANT ? bugZoo(def.build, o) : def.build(o);
  return { ...def, build, lod1Of: { ...def.lod1Of, [BUG_ZOO_VARIANT]: 1 } };
}

export const CULTURE_QA_GEO: readonly PropGeoDef[] = [
  { id: 'dummyBench', variants: 1, build: dummyBench, footprint: 1.0, height: 1.5, windy: false },
  {
    id: 'inspectionBooth',
    variants: 1,
    build: inspectionBooth,
    footprint: 1.8,
    height: 2.4,
    windy: false,
  },
  { id: 'uvLampPost', variants: 1, build: uvLampPost, footprint: 0.5, height: 2.7, windy: false },
  {
    id: 'scoreboard',
    variants: 2,
    build: scoreboard,
    footprint: 1.3,
    height: 2.6,
    windy: false,
    lod1Of: { 1: 0 },
  },
  { id: 'bugJar', variants: 1, build: bugJar, footprint: 0.7, height: 0.7, windy: false },
  { id: 'conePyramid', variants: 1, build: conePyramid, footprint: 0.9, height: 2.4, windy: false },
  { id: 'flagMast', variants: 1, build: flagMast, footprint: 0.9, height: 2.8, windy: true },
  { id: 'stampDesk', variants: 1, build: stampDesk, footprint: 0.9, height: 1.3, windy: false },
  {
    id: 'clipboardWall',
    variants: 1,
    build: clipboardWall,
    footprint: 1.5,
    height: 2.3,
    windy: false,
  },
];
