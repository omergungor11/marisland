/**
 * Research "Tide-Lab" M31 signature kit geometry (TASK-533, D-114; study harbours.html,
 * marketing-research.md §2.3 R5 / R6 / R7 / R19). Numbers / palette: content/themes/research-m31.ts;
 * defs: content/props-themes/research-m31.ts. Vertex colours only, one merged geometry per prop,
 * 1 u = 1 m. Nothing is placed here (TASK-534 places and moves them).
 *
 *   tideLab     tier 1  stilt marine lab: teal / white cabin on piles, roof dish, a louvred glass tide
 *                       tank on the same deck, portholes, window + tank glow slots. Pivot = waterline.
 *   tideSub     geo only (no PropDef): the yellow submersible, a MOVER mesh, ~3 u, bow +z, keel y = 0.
 *   tideGauge   tier 2  striped 2.5 u pole, v0 with its float, v1 pole only, v2 the float alone.
 *   sunkenCity  tier 2  8 variants of weathered sandstone ruin (column, broken column, arch, broken
 *                       arch, paving cluster, stair fragment, tower top, fallen statue).
 *
 * Local frames (scale 1, +y up, front = +z like every prop):
 *  - tideLab: deck top y = 1.0, pile feet y = -1.0; +z = pier side. Hooks deck { center, size, y },
 *    door { at, dir } (the cabin door threshold, dir = +z), entry { at, dir } (landing end on the
 *    pier side), tank { center, size, surfaceY } (swimmable inner volume of the tide tank, open top),
 *    piles { list [[x, z]], footY, topY }, lamp { at, r }, dish { at }, glow { window, tank, lamp }.
 *  - tideSub: hooks hatch { at, r, axis }, bubbles { at } (emit point, aft vent), waterline { y }
 *    (local y at sea level when surfaced: place at seaY - y), prop { at, axis }, lamp { at, r }.
 *  - tideGauge: hooks gauge { pole, top, ticks }, float { rest, travel [dy0, dy1], axis, start, count }
 *    (v0 only: the float is the LAST `count` vertices from `start`; v1 has no float and v2 is the
 *    float alone with its centre at the origin: a separate mesh can ride the swell).
 *  - sunkenCity: hooks ruin { name, sit: 'sea' | 'floor', waterline, height }. 'sea': instance y =
 *    seaY - waterline (the piece stands on a lagoon floor at least `waterline` deep; deeper floor =
 *    buried foot, fine); 'floor': instance y = floor y.
 *
 * Tier note (D-096): every sunkenCity variant stays under STRUCTURE_MIN_SIZE (3 u) in height and in
 * at least one plan extent, so the def stays tier 2 whichever variant the batcher builds first.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RESEARCH_M31 as F, RESEARCH_M31_PAL as P } from '../../content/themes/research-m31.ts';
import { col, createNoise, qEuler, type Acc, type ColorFn } from '../kit.ts';
import { TAU, V, V2, baseBox, bevBox, cylB, gableRoof, lathe, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';
import { cultureAcc } from './culture-devops.ts';
import { addHook } from './hq.ts';

const PI = Math.PI;
const lit = { emissive: 1, ao: () => 1, aoAmt: 0, noJitter: true } as const;
const windowGlow = { emissive: 0.75, ao: () => 1, aoAmt: 0, noJitter: true } as const;
const tankGlow = { emissive: 0.55, ao: () => 1, aoAmt: 0.05, noJitter: true } as const;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/* ================================ stilt lab ================================ */

function tideLab({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const L = F.lab;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const dy = L.deck.y;
  const hw = L.deck.w / 2;
  const hd = L.deck.d / 2;
  // piles: a 4 x 3 grid under the deck (feet below the waterline), barnacle weed band at the waterline
  const px = [-hw + 0.4, -1.0, 1.0, hw - 0.4];
  const pz = [-hd + 0.3, 0, hd - 0.3];
  const piles: [number, number][] = [];
  for (const x of px) for (const z of pz) piles.push([x, z]);
  for (const [x, z] of hi ? piles : piles.filter(([x2]) => Math.abs(x2) > 2)) {
    put(
      acc,
      cylB(L.pileR, L.pileR * 0.88, dy - L.deck.thick + L.pileDepth, hi ? 6 : 4),
      [x, -L.pileDepth, z],
      P.woodDark,
      { aoAmt: 0.3 },
    );
    if (hi)
      put(acc, cylB(L.pileR + 0.03, L.pileR + 0.03, 0.34, 6), [x, -0.22, z], P.algae[0], {
        aoAmt: 0,
      });
  }
  if (hi) {
    // cross braces under the deck, front and back rows
    for (const z of [-hd + 0.3, hd - 0.3])
      put(acc, baseBox(L.deck.w - 0.8, 0.09, 0.09), [0, 0.35, z], P.woodDeep, { aoAmt: 0.1 });
    for (const x of [-hw + 0.4, hw - 0.4])
      put(acc, baseBox(0.09, 0.09, L.deck.d - 0.6), [x, 0.35, 0], P.woodDeep, { aoAmt: 0.1 });
  }
  // deck slab + plank seams
  put(acc, baseBox(L.deck.w, L.deck.thick, L.deck.d), [0, dy - L.deck.thick, 0], P.wood, {
    aoAmt: 0.15,
  });
  if (hi)
    for (let i = 1; i < 9; i++)
      put(
        acc,
        baseBox(L.deck.w - 0.04, 0.014, 0.025),
        [0, dy, -hd + (i * L.deck.d) / 9],
        P.woodDark,
        {
          aoAmt: 0,
          noJitter: true,
        },
      );
  // landing out the front (+z), where the pier meets the deck
  const C = L.cabin;
  const landX = C.x;
  put(
    acc,
    baseBox(L.landing.w, L.deck.thick, L.landing.depth),
    [landX, dy - L.deck.thick, hd + L.landing.depth / 2 - 0.02],
    P.wood,
    {
      aoAmt: 0.1,
    },
  );
  // cabin: white walls, teal skirt, low gable roof along x, door, portholes
  put(acc, baseBox(C.w, C.wallH, C.d), [C.x, dy, C.z], P.white, { aoAmt: 0.12 });
  put(acc, baseBox(C.w + 0.05, 0.4, C.d + 0.05), [C.x, dy, C.z], P.tealDeep, { aoAmt: 0.1 });
  put(acc, baseBox(C.w + 0.05, 0.1, C.d + 0.05), [C.x, dy + C.wallH - 0.34, C.z], P.teal, {
    aoAmt: 0,
  });
  const roofY = dy + C.wallH;
  put(acc, gableRoof(C.d / 2 + 0.28, L.roofRise, C.w + 0.5), [C.x, roofY, C.z], P.roofTeal, {
    q: qEuler(0, PI / 2, 0),
    aoAmt: 0,
  });
  const fz = C.z + C.d / 2;
  put(acc, baseBox(L.door.w, L.door.h, 0.07), [C.x, dy, fz + 0.0], P.tealDeep, { aoAmt: 0 });
  if (hi) {
    put(acc, baseBox(L.door.w + 0.14, 0.08, 0.08), [C.x, dy + L.door.h, fz], P.white, { aoAmt: 0 });
    put(acc, new THREE.IcosahedronGeometry(0.04, 0), [C.x + 0.24, dy + 0.7, fz + 0.05], P.brass, {
      aoAmt: 0,
      noJitter: true,
    });
  }
  // portholes on the front (flanking the door) and on both short sides
  const ph = (x: number, y: number, z: number, axis: 'z' | 'x'): void => {
    const q = axis === 'z' ? qEuler(PI / 2, 0, 0) : qEuler(0, 0, PI / 2);
    put(
      acc,
      new THREE.CylinderGeometry(L.porthole.r, L.porthole.r, 0.07, hi ? 8 : 5),
      [x, y, z],
      P.window,
      {
        q,
        ...windowGlow,
      },
    );
    if (hi)
      put(
        acc,
        new THREE.TorusGeometry(L.porthole.r + 0.02, 0.04, 3, 8),
        [x, y, z + (axis === 'z' ? 0.03 : 0)],
        P.brass,
        {
          q: axis === 'z' ? qEuler(0, 0, 0) : qEuler(0, PI / 2, 0),
          aoAmt: 0,
          noJitter: true,
        },
      );
  };
  for (const sx of [-1, 1]) ph(C.x + sx * 1.0, dy + L.porthole.y, fz + 0.02, 'z');
  if (hi) {
    ph(C.x - C.w / 2 - 0.02, dy + L.porthole.y, C.z, 'x');
    ph(C.x + C.w / 2 + 0.02, dy + L.porthole.y, C.z + 0.2, 'x');
  }
  // lamp by the door
  put(
    acc,
    hi ? new THREE.IcosahedronGeometry(0.1, 0) : new THREE.OctahedronGeometry(0.1, 0),
    [C.x + 0.6, dy + 1.6, fz + 0.14],
    P.lamp,
    lit,
  );
  // roof dish
  const dishAt = V(L.dish.at[0], roofY + 0.34, L.dish.at[1]);
  dishOnRoof(acc, dishAt, hi);
  // railings on the back and sides, front with a gap at the landing
  const rail = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    put(acc, baseBox(0.06, 0.05, len), [(x0 + x1) / 2, dy + 0.78, (z0 + z1) / 2], P.tealDeep, {
      q: qEuler(0, yaw, 0),
      aoAmt: 0,
    });
    if (hi)
      put(acc, baseBox(0.05, 0.04, len), [(x0 + x1) / 2, dy + 0.4, (z0 + z1) / 2], P.tealDeep, {
        q: qEuler(0, yaw, 0),
        aoAmt: 0,
      });
  };
  const post = (x: number, z: number): void =>
    put(acc, baseBox(0.07, 0.8, 0.07), [x, dy, z], P.white, { aoAmt: 0.1 });
  const e = 0.08;
  rail(-hw + e, -hd + e, hw - e, -hd + e);
  rail(-hw + e, -hd + e, -hw + e, hd - e);
  rail(hw - e, -hd + e, hw - e, hd - e);
  rail(-hw + e, hd - e, landX - L.landing.w / 2, hd - e);
  rail(landX + L.landing.w / 2, hd - e, hw - e, hd - e);
  const postXZ: [number, number][] = [
    [-hw + e, -hd + e],
    [hw - e, -hd + e],
    [-hw + e, hd - e],
    [hw - e, hd - e],
    [landX - L.landing.w / 2, hd - e],
    [landX + L.landing.w / 2, hd - e],
    [0, -hd + e],
    [-hw + e, 0],
    [hw - e, 0],
  ];
  for (const [x, z] of hi ? postXZ : postXZ.slice(0, 4)) post(x, z);
  // deck clutter: crates + a barrel by the cabin, a ladder into the water at the -x edge
  if (hi) {
    put(acc, bevBox(0.46, 0.4, 0.46, 0.04), [C.x - 1.0, dy + 0.2, hd - 0.55], P.wood, {
      aoAmt: 0.1,
    });
    put(acc, bevBox(0.36, 0.32, 0.36, 0.04), [C.x - 0.55, dy + 0.16, hd - 0.5], P.woodDark, {
      aoAmt: 0.1,
    });
    put(acc, cylB(0.17, 0.17, 0.42, 7), [-hw + 0.6, dy, -hd + 0.7], P.teal, { aoAmt: 0.15 });
    for (const sz of [-0.2, 0.2])
      put(acc, baseBox(0.05, dy + 0.8, 0.05), [-hw - 0.04, -0.8, 0.6 + sz], P.steel, {
        aoAmt: 0.1,
      });
    for (let k = 0; k < 6; k++)
      put(acc, baseBox(0.05, 0.04, 0.44), [-hw - 0.04, -0.7 + k * 0.38, 0.6], P.steel, {
        aoAmt: 0,
      });
  }
  // glass tide tank on the deck, +x of the cabin: pipe from the cabin, floor, frame, louvred panes
  const T = L.tank;
  const tankTop = dy + 0.12 + T.h;
  put(
    acc,
    cylB(0.07, 0.07, T.x - T.w / 2 - (C.x + C.w / 2) + 0.1, 5, true),
    [C.x + C.w / 2 - 0.05, dy + 1.35, T.z],
    P.steel,
    {
      q: qEuler(0, 0, -PI / 2),
      aoAmt: 0,
    },
  );
  put(acc, baseBox(T.w + 0.16, 0.12, T.d + 0.16), [T.x, dy, T.z], P.white, { aoAmt: 0.15 });
  put(acc, baseBox(T.w - 0.1, 0.03, T.d - 0.1), [T.x, dy + 0.12, T.z], P.tankFloor, tankGlow);
  const cx = T.w / 2;
  const cz = T.d / 2;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      put(acc, baseBox(0.1, T.h, 0.1), [T.x + sx * cx, dy + 0.12, T.z + sz * cz], P.white, {
        aoAmt: 0.05,
      });
  for (const sy of hi ? [tankTop - 0.1, dy + 0.12 + 0.6] : [tankTop - 0.1]) {
    for (const sz of [-1, 1])
      put(acc, baseBox(T.w, 0.08, 0.08), [T.x, sy, T.z + sz * cz], P.teal, { aoAmt: 0 });
    for (const sx of [-1, 1])
      put(acc, baseBox(0.08, 0.08, T.d), [T.x + sx * cx, sy, T.z], P.teal, { aoAmt: 0 });
  }
  // glass: a continuous pale band low (the water you see from outside), louvred strips above with
  // gaps, so a fish school stays visible through the glass
  const band = 0.42;
  const strips = hi ? T.strips : 1;
  const sh = T.h - 0.3 - band;
  for (const [horiz, len] of [
    [true, T.w],
    [false, T.d],
  ] as const)
    for (const s of [-1, 1]) {
      put(
        acc,
        baseBox(horiz ? len - 0.1 : 0.035, band, horiz ? 0.035 : len - 0.1),
        horiz ? [T.x, dy + 0.15, T.z + s * cz] : [T.x + s * cx, dy + 0.15, T.z],
        P.tankFloor,
        tankGlow,
      );
      for (let i = 0; i < strips; i++) {
        const u = -len / 2 + (len * (i + 0.5)) / strips;
        const w = (len / strips) * 0.7;
        put(
          acc,
          baseBox(horiz ? w : 0.03, sh, horiz ? 0.03 : w),
          horiz
            ? [T.x + u, dy + 0.15 + band, T.z + s * cz]
            : [T.x + s * cx, dy + 0.15 + band, T.z + u],
          P.tankGlass[(i + (s > 0 ? 1 : 0)) % P.tankGlass.length],
          tankGlow,
        );
      }
    }
  if (hi) {
    // rockwork and weed in the tank (reads through the gaps)
    put(
      acc,
      new THREE.IcosahedronGeometry(0.34, 0),
      [T.x - 0.3, dy + 0.2, T.z + 0.1],
      P.stoneDark,
      { aoAmt: 0.1 },
    );
    put(
      acc,
      new THREE.ConeGeometry(0.1, 0.65, 4).translate(0, 0.32, 0),
      [T.x + 0.35, dy + 0.12, T.z - 0.25],
      P.weed,
      { aoAmt: 0 },
    );
    put(
      acc,
      new THREE.ConeGeometry(0.08, 0.5, 4).translate(0, 0.25, 0),
      [T.x + 0.5, dy + 0.12, T.z + 0.2],
      P.algae[2],
      { aoAmt: 0 },
    );
  }
  const geo = acc.finish(rng, false, true);
  addHook(geo, 'deck', { center: [0, dy, 0], size: [L.deck.w, L.deck.d], y: dy });
  addHook(geo, 'door', { at: [C.x, dy, fz + 0.04], dir: [0, 0, 1] });
  addHook(geo, 'entry', { at: [landX, dy, hd + L.landing.depth], dir: [0, 0, 1] });
  addHook(geo, 'tank', {
    center: [T.x, dy + 0.15 + 0.42 + (T.h - 0.3 - 0.42) / 2, T.z],
    size: [T.w - 0.24, T.h - 0.3 - 0.42, T.d - 0.24],
    surfaceY: dy + 0.12 + T.h - 0.25,
  });
  addHook(geo, 'piles', { list: piles, footY: -L.pileDepth, topY: dy - L.deck.thick });
  addHook(geo, 'lamp', { at: [C.x + 0.6, dy + 1.6, fz + 0.14], r: 0.1 });
  addHook(geo, 'dish', { at: arr3(dishAt) });
  return addHook(geo, 'glow', { window: 0.75, tank: 0.55, lamp: 1 });
}
const arr3 = (p: THREE.Vector3): [number, number, number] => [p.x, p.y, p.z];

/** Small roof dish (a bowl on a mast), faces the sea at -z, tilted up. */
function dishOnRoof(acc: Acc, at: THREE.Vector3, hi: boolean): void {
  const D = F.lab.dish;
  put(acc, cylB(0.07, 0.06, D.mast, hi ? 5 : 3, true), [at.x, at.y, at.z], P.steel, { aoAmt: 0 });
  const R = D.r / Math.sin(1.05);
  const bowl = new THREE.SphereGeometry(R, hi ? 9 : 6, hi ? 3 : 2, 0, TAU, PI - 1.05, 1.05);
  bowl.translate(0, R * Math.cos(1.05), 0);
  put(acc, bowl, [at.x, at.y + D.mast + 0.1, at.z], P.white, {
    q: qEuler(PI / 2 - 0.65, 0, 0),
    double: true,
    aoAmt: 0.05,
  });
  if (hi)
    put(acc, cylB(0.02, 0.02, D.r * 0.9, 3), [at.x, at.y + D.mast + 0.2, at.z + 0.2], P.steelDark, {
      q: qEuler(1.0, 0, 0),
      aoAmt: 0,
    });
}

/* ================================ yellow submersible ================================ */

function tideSub({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const S = F.sub;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const y = S.hullY;
  // hull: a capsule along z, belly a shade darker, a teal band amidships
  const body = S.length - 2 * S.r;
  const hull = new THREE.CapsuleGeometry(S.r, body, hi ? 4 : 2, hi ? 12 : 6).rotateX(PI / 2);
  put(
    acc,
    hull,
    [0, y, 0],
    (p) => col(p.z > -0.18 && p.z < 0.06 ? P.teal : p.y < y - 0.3 ? P.subDeep : P.sub),
    { aoAmt: 0.12 },
  );
  // conning tower with the hatch and a periscope
  const T = S.tower;
  const ty = y + 0.38;
  put(
    acc,
    hi ? bevBox(T.w, T.h, T.d, 0.09) : new THREE.BoxGeometry(T.w, T.h, T.d),
    [0, ty + T.h / 2, T.z],
    P.sub,
    { aoAmt: 0.12 },
  );
  put(acc, baseBox(T.w + 0.06, 0.06, T.d + 0.06), [0, ty + T.h - 0.02, T.z], P.teal, { aoAmt: 0 });
  const hatchY = ty + T.h + 0.04;
  put(acc, cylB(0.17, 0.17, 0.06, hi ? 8 : 5), [0, hatchY - 0.04, T.z + 0.06], P.tealDeep, {
    aoAmt: 0,
  });
  if (hi) {
    put(acc, new THREE.TorusGeometry(0.17, 0.025, 3, 10), [0, hatchY + 0.03, T.z + 0.06], P.brass, {
      q: qEuler(PI / 2, 0, 0),
      aoAmt: 0,
    });
    put(acc, cylB(0.025, 0.025, 0.45, 4), [0, hatchY - 0.02, T.z - 0.24], P.steel, { aoAmt: 0 });
    put(acc, baseBox(0.04, 0.04, 0.16), [0, hatchY + 0.4, T.z - 0.18], P.steel, { aoAmt: 0 });
    // tower portholes
    for (const sx of [-1, 1])
      put(
        acc,
        new THREE.CylinderGeometry(0.07, 0.07, 0.04, 6),
        [sx * (T.w / 2 + 0.005), ty + T.h * 0.55, T.z + 0.05],
        P.window,
        {
          q: qEuler(0, 0, PI / 2),
          ...windowGlow,
        },
      );
  }
  // bow viewport dome and a headlight
  const bz = S.length / 2 - 0.2;
  const dome = new THREE.SphereGeometry(0.26, hi ? 8 : 5, hi ? 4 : 3, 0, TAU, 0, PI / 2).rotateX(
    PI / 2,
  );
  put(acc, dome, [0, y + 0.06, bz - 0.04], P.window, { ...windowGlow, aoAmt: 0 });
  if (hi) {
    put(acc, new THREE.TorusGeometry(0.27, 0.04, 3, 10), [0, y + 0.06, bz - 0.04], P.subTrim, {
      aoAmt: 0,
      noJitter: true,
    });
  }
  put(
    acc,
    hi ? new THREE.IcosahedronGeometry(0.07, 0) : new THREE.OctahedronGeometry(0.07, 0),
    [0, y + 0.4, bz + 0.1],
    P.lamp,
    lit,
  );
  // side portholes along the hull
  if (hi)
    for (const sx of [-1, 1])
      for (const z of [-0.6, -0.2 + 0.0, 0.5]) {
        put(
          acc,
          new THREE.CylinderGeometry(0.1, 0.1, 0.05, 7),
          [sx * (S.r - 0.015), y + 0.05, z - 0.0],
          P.window,
          {
            q: qEuler(0, 0, PI / 2),
            ...windowGlow,
          },
        );
        put(
          acc,
          new THREE.TorusGeometry(0.11, 0.025, 3, 7),
          [sx * (S.r - 0.005), y + 0.05, z],
          P.subTrim,
          {
            q: qEuler(0, PI / 2, 0),
            aoAmt: 0,
            noJitter: true,
          },
        );
      }
  // tail: fins (vertical + horizontal), shroud ring and a three-blade propeller
  const sz = -S.length / 2 + 0.38;
  put(acc, baseBox(0.05, 0.9, 0.34), [0, y - 0.45, sz], P.teal, { aoAmt: 0 });
  put(acc, baseBox(0.9, 0.05, 0.3), [0, y - 0.025, sz], P.teal, { aoAmt: 0 });
  const pz = -S.length / 2 - 0.04;
  put(acc, cylB(0.09, 0.07, 0.12, hi ? 6 : 4), [0, y, pz], P.steelDark, {
    q: qEuler(-PI / 2, 0, 0),
    aoAmt: 0,
  });
  if (hi)
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.4;
      put(
        acc,
        baseBox(0.07, 0.3, 0.025),
        [Math.sin(a) * 0.12, y - 0.0 + Math.cos(a) * 0.12 - 0.15, pz - 0.08],
        P.brass,
        {
          q: qEuler(0, 0, -a),
          aoAmt: 0,
        },
      );
    }
  // ballast tank strakes on the belly (LOD0)
  if (hi)
    for (const sx of [-1, 1])
      put(acc, baseBox(0.09, 0.09, 1.3), [sx * 0.3, 0.03, 0.15], P.subDeep, { aoAmt: 0 });
  const geo = acc.finish(rng, false, true);
  addHook(geo, 'hatch', { at: [0, hatchY + 0.0, T.z + 0.06], r: 0.17, axis: [0, 1, 0] });
  addHook(geo, 'bubbles', { at: [0, y + 0.48, -S.length / 2 + 0.55] });
  addHook(geo, 'waterline', { y: S.waterline });
  addHook(geo, 'prop', { at: [0, y, pz], axis: [0, 0, -1] });
  return addHook(geo, 'lamp', { at: [0, y + 0.4, bz + 0.1], r: 0.07 });
}

/* ================================ tide gauge ================================ */

function gaugeBase(o: BuildOpts, withRail: boolean): { acc: Acc; hi: boolean } {
  const G = F.gauge;
  const hi = o.lod === 0;
  const acc = cultureAcc(o.rng, o.lod);
  put(acc, cylB(G.base.r, G.base.r * 0.84, G.base.h, hi ? 7 : 5), [0, 0, 0], P.stoneDark, {
    aoAmt: 0.25,
  });
  if (hi)
    put(acc, cylB(G.base.r + 0.04, G.base.r + 0.04, 0.12, 7), [0, 0.26, 0], P.algae[1], {
      aoAmt: 0,
    });
  const ns = hi ? G.stripes : 6;
  const sh = (G.poleH - G.base.h) / ns;
  for (let i = 0; i < ns; i++)
    put(
      acc,
      cylB(G.poleR, G.poleR, sh, hi ? 6 : 3),
      [0, G.base.h + i * sh, 0],
      i % 2 === 0 ? P.gaugeRed : P.white,
      { aoAmt: i === 0 ? 0.2 : 0 },
    );
  if (hi) {
    // tick marks on the +z face and a brass cap
    for (let i = 1; i < G.stripes; i++)
      put(
        acc,
        baseBox(i % 5 === 0 ? 0.26 : 0.16, 0.025, 0.03),
        [0, G.base.h + i * sh, G.poleR],
        P.stoneDark,
        { aoAmt: 0, noJitter: true },
      );
    put(acc, new THREE.IcosahedronGeometry(0.1, 0), [0, G.poleH + 0.07, 0], P.brass, {
      aoAmt: 0,
      noJitter: true,
    });
    put(acc, cylB(0.012, 0.012, 0.2, 3), [0, G.poleH + 0.05, 0], P.steel, { aoAmt: 0 });
    put(
      acc,
      new THREE.ShapeGeometry(new THREE.Shape([V2(0, 0.14), V2(0, 0), V2(0.28, 0.07)])),
      [0, G.poleH + 0.1, 0],
      P.teal,
      {
        double: true,
        aoAmt: 0,
        ao: () => 1,
      },
    );
  }
  if (withRail) {
    const arm = G.float.arm;
    put(acc, cylB(0.02, 0.02, G.poleH - 0.55, 3), [arm, 0.5, 0], P.steel, { aoAmt: 0 });
    if (hi)
      for (const y of [0.7, G.poleH - 0.3])
        put(acc, baseBox(arm, 0.03, 0.03), [arm / 2, y, 0], P.steel, { aoAmt: 0 });
  }
  return { acc, hi };
}

function floatGeo(o: BuildOpts, at: [number, number, number]): THREE.BufferGeometry {
  const G = F.gauge.float;
  const hi = o.lod === 0;
  const acc = cultureAcc(o.rng.fork('float'), o.lod);
  put(acc, new THREE.SphereGeometry(G.r, hi ? 8 : 5, hi ? 5 : 3), at, P.floatOrange, {
    aoAmt: 0.05,
  });
  if (hi) {
    put(acc, new THREE.TorusGeometry(G.r + 0.005, 0.03, 3, 8), at, P.white, {
      q: qEuler(PI / 2, 0, 0),
      aoAmt: 0,
      noJitter: true,
    });
    put(acc, baseBox(0.04, 0.04, 0.04), [at[0] - G.r - 0.02, at[1], at[2]], P.steel, { aoAmt: 0 });
  }
  return acc.finish(o.rng.fork('float'), false, true);
}

function tideGauge(o: BuildOpts): THREE.BufferGeometry {
  const G = F.gauge;
  const v = o.variant;
  if (v === 2) {
    const g = floatGeo(o, [0, G.float.r, 0]);
    return addHook(g, 'float', {
      rest: [0, G.float.r, 0],
      travel: [...G.float.travel],
      axis: [0, 1, 0],
      start: 0,
      count: g.getAttribute('position').count,
    });
  }
  const { acc } = gaugeBase(o, true);
  const base = acc.finish(o.rng, false, true);
  const hooks = { pole: [0, G.poleH], top: G.poleH + 0.25, ticks: G.stripes };
  if (v === 1) return addHook(base, 'gauge', hooks);
  const fl = floatGeo(o, [G.float.arm, G.float.restY, 0]);
  const merged = mergeGeometries([base, fl], false);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.userData = { tris: merged.getAttribute('position').count / 3 };
  addHook(merged, 'gauge', hooks);
  return addHook(merged, 'float', {
    rest: [G.float.arm, G.float.restY, 0],
    travel: [...G.float.travel],
    axis: [0, 1, 0],
    start: base.getAttribute('position').count,
    count: fl.getAttribute('position').count,
  });
}

/* ================================ sunken city ================================ */

type Noise = ReturnType<typeof createNoise>;

/** Hewn block: a box (base on y = 0) whose corners are pushed by noise; shared corners move alike. */
function chunk(
  w: number,
  h: number,
  d: number,
  n: Noise,
  amp = 0.07,
  off = 0,
  seg = 1,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg).translate(0, h / 2, 0);
  const p = g.getAttribute('position');
  const s = Math.min(w, h, d);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = amp * s;
    p.setXYZ(
      i,
      x + k * n.n3(x * 2.1 + off, y * 2.1, z * 2.1),
      y + (y > 0.01 ? k * 0.8 * n.n3(x * 2.3, y * 2.3 + off, z * 2.3 + 5) : 0),
      z + k * n.n3(x * 1.9 + 9, y * 1.9, z * 1.9 + off),
    );
  }
  g.computeVertexNormals();
  return g;
}

/** Drum / shaft with a noisy broken top (tilted cut). */
function cutDrum(
  rb: number,
  rt: number,
  h: number,
  n: Noise,
  cut: number,
  tilt: number,
  seg: number,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1).translate(0, h / 2, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    if (p.getY(i) > h * 0.5) p.setY(i, h - cut * (0.5 + 0.5 * n.n3(x * 3, 0.5, z * 3)) + tilt * x);
  }
  g.computeVertexNormals();
  return g;
}

function weathering(wl: number, base: THREE.Color): ColorFn {
  const algae = [col(P.algae[0]), col(P.algae[1]), col(P.algae[2])];
  const bleach = col(P.bleach);
  return (p) => {
    const c = base.clone();
    // algae strongest at the foot, gone a little above the waterline
    const a = clamp01((wl + 0.25 - p.y) / (wl + 0.25 + 0.001)) ** 1.3 * 0.55;
    const alg = algae[Math.abs(Math.round(p.x * 7 + p.z * 5)) % 3];
    c.lerp(alg, a);
    // sun-bleached stone high above the water
    c.lerp(bleach, clamp01((p.y - wl - 0.35) / 1.6) * 0.3);
    return c;
  };
}

function sunkenCity({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const C = F.city;
  const spec = C.spec[variant];
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const noise = createNoise(rng);
  const wl = spec.waterline;
  const stoneAt = (i: number): ColorFn => weathering(wl, col(P.sandstone[i % P.sandstone.length]));
  const dark = weathering(wl, col(P.sandstoneDark));
  const seg = hi ? 8 : 6;
  const r = rng.fork('city');
  /** Block with its base at pos. */
  const blk = (
    w: number,
    h: number,
    d: number,
    pos: [number, number, number],
    i: number,
    q?: THREE.Quaternion,
    amp = 0.07,
  ): void =>
    put(
      acc,
      chunk(w, h, d, noise, hi ? amp : 0.04, i, hi && Math.min(w, h, d) >= 0.5 ? 2 : 1),
      pos,
      stoneAt(i),
      {
        q,
        aoAmt: 0.18,
      },
    );
  /** Block centred on pos (arch voussoirs, fallen stones). */
  const blkC = (
    w: number,
    h: number,
    d: number,
    pos: [number, number, number],
    i: number,
    q?: THREE.Quaternion,
  ): void =>
    put(acc, chunk(w, h, d, noise, hi ? 0.08 : 0.04, i).translate(0, -h / 2, 0), pos, stoneAt(i), {
      q,
      aoAmt: 0.15,
    });
  const moss = (x: number, y: number, z: number, rad: number): void => {
    if (!hi) return;
    put(
      acc,
      new THREE.IcosahedronGeometry(rad * 1.5, 0),
      [x, y - rad * 0.3, z],
      P.moss[Math.floor(r.next() * 2)],
      {
        s: [1, 0.35, 1],
        aoAmt: 0,
        noJitter: true,
      },
    );
  };
  const drum = (
    x: number,
    y: number,
    z: number,
    rb: number,
    rt: number,
    h: number,
    i: number,
  ): void =>
    put(
      acc,
      cylB(rb, rt, h, seg),
      [x + r.range(-0.02, 0.02), y, z + r.range(-0.02, 0.02)],
      stoneAt(i),
      {
        q: hi ? qEuler(r.range(-0.03, 0.03), r.range(0, TAU), r.range(-0.03, 0.03)) : undefined,
        aoAmt: 0.12,
      },
    );
  /** Voussoir k of n on a semicircle (th = 0 right springing, PI left) around (0, cy). */
  const voussoir = (k: number, n: number, cy: number, R: number): void => {
    const th = ((k + 0.5) / n) * PI;
    const rr = R + 0.18;
    const key = k === (n - 1) / 2;
    const tw = ((PI * rr) / n) * 0.97;
    blkC(
      key ? tw + 0.04 : tw,
      key ? 0.42 : 0.36,
      0.56,
      [Math.cos(th) * rr, cy + Math.sin(th) * rr, 0],
      k,
      qEuler(0, 0, th - PI / 2),
    );
  };
  const R = 0.95;
  const px = R + 0.3;
  const ph = 1.15;

  switch (variant) {
    case 0: {
      // whole column: plinth, 6 drums, flared capital, abacus
      blk(1.05, 0.26, 1.05, [0, 0, 0], 0);
      let y = 0.26;
      const nd = hi ? 6 : 1;
      const dh = hi ? 0.36 : 2.16;
      for (let k = 0; k < nd; k++) {
        drum(0, y, 0, hi ? 0.4 - 0.02 * k : 0.4, hi ? 0.4 - 0.02 * (k + 1) : 0.3, dh, k);
        y += dh;
      }
      put(acc, cylB(0.3, 0.5, 0.22, seg), [0, y, 0], dark, { aoAmt: 0.05 });
      blk(0.98, 0.14, 0.98, [0, y + 0.22, 0], 2);
      break;
    }
    case 1: {
      // broken column: plinth, 3 drums, a splintered stump; a fallen drum + capital in the lee
      blk(1.05, 0.26, 1.05, [0, 0, 0], 1);
      let y = 0.26;
      const nd = hi ? 3 : 1;
      const dh = hi ? 0.4 : 1.2;
      for (let k = 0; k < nd; k++) {
        drum(0, y, 0, 0.4 - 0.015 * k, 0.4 - 0.015 * (k + 1), dh, k);
        y += dh;
      }
      put(acc, cutDrum(0.37, 0.34, 0.5, noise, 0.3, 0.24, seg), [0, y, 0], stoneAt(3), {
        aoAmt: 0.05,
      });
      if (hi) {
        put(acc, cylB(0.36, 0.34, 0.42, seg), [0.9, 0.36, 0.55], stoneAt(0), {
          q: qEuler(0, 0.5, PI / 2),
          aoAmt: 0.15,
        });
        put(acc, cylB(0.3, 0.48, 0.22, seg), [-0.75, 0.5, 0.7], stoneAt(1), {
          q: qEuler(0.1, 1.2, PI / 2 - 0.1),
          aoAmt: 0.15,
        });
        blk(0.5, 0.16, 0.42, [-0.1, 0, 1.0], 2, qEuler(0, 0.6, 0));
        moss(0.04, y + 0.36, 0.02, 0.15);
      }
      break;
    }
    case 2: {
      // whole arch: two piers on plinths, impost blocks, a semicircle of voussoirs and a keystone
      for (const s of [-1, 1]) {
        if (hi) blk(0.92, 0.2, 0.84, [s * px, 0, 0], s > 0 ? 0 : 1);
        blk(0.62, hi ? ph - 0.2 : ph, 0.6, [s * px, hi ? 0.2 : 0, 0], s > 0 ? 2 : 3);
        if (hi) blk(0.78, 0.14, 0.7, [s * px, ph, 0], 1);
      }
      const n = hi ? 7 : 3;
      for (let k = 0; k < n; k++) voussoir(k, n, ph + 0.14, R);
      moss(0, ph + 0.14 + R + 0.45, 0, 0.17);
      break;
    }
    case 3: {
      // broken arch: left pier and the left springing of the arch stand, right pier a stump,
      // fallen voussoirs on the bed
      if (hi) blk(0.92, 0.2, 0.84, [-px, 0, 0], 1);
      blk(0.62, hi ? ph - 0.2 : ph, 0.6, [-px, hi ? 0.2 : 0, 0], 3);
      if (hi) blk(0.78, 0.14, 0.7, [-px, ph, 0], 1);
      const n = hi ? 7 : 3;
      for (let k = Math.ceil(n * 0.55); k < n; k++) voussoir(k, n, ph + 0.14, R);
      if (hi) blk(0.92, 0.2, 0.84, [px, 0, 0], 0);
      put(acc, chunk(0.62, 0.6, 0.6, noise, 0.14, 4), [px, hi ? 0.2 : 0, 0], stoneAt(2), {
        aoAmt: 0.18,
      });
      if (hi) {
        blkC(0.35, 0.36, 0.56, [0.35, 0.3, 0.85], 3, qEuler(0.3, 0.9, 0.2));
        blkC(0.42, 0.42, 0.56, [-0.2, 0.32, 0.9], 5, qEuler(0, 0.4, 1.1));
        blk(0.5, 0.2, 0.5, [0.55, 0, -0.75], 1, qEuler(0, 0.5, 0));
        moss(-px, ph + 0.3, 0, 0.14);
      }
      break;
    }
    case 4: {
      // paving slab cluster: a 3 x 2 patch (plan extent < 3 u in z, see the tier note), some slabs missing / sunk / tilted, a curb on one side
      const cell = 0.92;
      if (!hi) {
        for (const [x, z, w, d] of [
          [-0.2, -0.45, 2.6, 1.2],
          [-0.4, 0.55, 1.4, 0.7],
        ] as const)
          put(acc, chunk(w, 0.13, d, noise, 0.04, 1), [x, 0, z], stoneAt(1), { aoAmt: 0.15 });
      } else
        for (let i = -1; i <= 1; i++)
          for (let j = -1; j <= 0; j++) {
            if (!(i === 0 && j === 0) && r.chance(0.2)) continue;
            const h = 0.1 + r.range(0, 0.07);
            put(
              acc,
              chunk(0.84, h, 0.84, noise, hi ? 0.1 : 0.04, i * 3 + j),
              [i * cell, r.range(-0.03, 0.02), j * cell],
              stoneAt(i * 3 + j + 4),
              {
                q: qEuler(r.range(-0.05, 0.05), r.range(-0.1, 0.1), r.range(-0.05, 0.05)),
                aoAmt: 0.15,
              },
            );
          }
      if (hi) {
        blk(2.6, 0.2, 0.2, [0, 0, -1.5], 2);
        blk(0.42, 0.14, 0.34, [1.0, 0, 0.45], 3, qEuler(0, 0.7, 0));
      }
      break;
    }
    case 5: {
      // stair fragment: five steps, one corner broken off, a stepped side wall, a foot slab
      if (hi) blk(1.8, 0.1, 2.4, [0, 0, 0.8], 2);
      for (let k = 0; k < 5; k += hi ? 1 : 2) {
        const w = k === 3 ? 0.95 : 1.4;
        blk(w, 0.1 + 0.2 * (k + 1), 0.42, [k === 3 ? 0.22 : 0, 0, k * 0.4], k);
      }
      if (hi) {
        for (let k = 0; k < 3; k++) blk(0.2, 0.55 + 0.2 * k, 0.42, [-0.8, 0, k * 0.4], k + 1);
        blkC(0.4, 0.28, 0.36, [1.0, 0.14, 1.3], 4, qEuler(0, 0.6, 0.2));
        moss(0, 1.12, 1.6, 0.14);
      }
      break;
    }
    case 6: {
      // broken tower top: round stump with a jagged crown, bands, a few merlons, an arrow slit
      const rb = 0.95;
      put(acc, cylB(rb, 0.88, 1.6, hi ? 10 : 7), [0, 0, 0], stoneAt(0), { aoAmt: 0.15 });
      put(acc, cutDrum(0.88, 0.86, 0.62, noise, 0.4, 0.18, hi ? 10 : 7), [0, 1.6, 0], stoneAt(2), {
        aoAmt: 0.05,
      });
      if (hi) {
        for (const y of [0.55, 1.3])
          put(acc, cylB(0.98, 0.98, 0.1, 10), [0, y, 0], dark, { aoAmt: 0 });
        for (const k of [0, 1, 2, 6, 7]) {
          const a = (k / 8) * TAU;
          blk(0.36, 0.3, 0.24, [Math.sin(a) * 0.88, 2.16, Math.cos(a) * 0.88], k, qEuler(0, a, 0));
        }
        put(acc, baseBox(0.1, 0.36, 0.1), [0, 0.95, 0.9], P.shadow, { aoAmt: 0, noJitter: true });
        put(acc, baseBox(0.5, 0.62, 0.1), [0.75, 0, -0.6], P.shadow, {
          q: qEuler(0, 2.3, 0),
          aoAmt: 0,
          noJitter: true,
        });
        blkC(0.6, 0.4, 0.45, [1.05, 0.3, 0.7], 3, qEuler(0, 0.6, 0.15));
        blkC(0.5, 0.35, 0.4, [-1.05, 0.27, 0.5], 1, qEuler(0, 2.2, -0.2));
        blkC(0.45, 0.3, 0.38, [0.3, 0.25, 1.2], 4, qEuler(0.2, 1.0, 0));
        moss(0.3, 2.2, 0.2, 0.2);
        moss(-0.4, 2.12, -0.3, 0.16);
      } else {
        blk(0.36, 0.3, 0.24, [0, 2.1, 0.88], 1);
      }
      break;
    }
    default: {
      // fallen statue: a broken pedestal, a robed body lying on its side, the head rolled apart
      if (hi) blk(1.0, 0.3, 0.8, [-0.5, 0, -0.35], 2);
      put(
        acc,
        lathe(
          hi
            ? [
                [0, 0],
                [0.3, 0],
                [0.32, 0.12],
                [0.24, 0.5],
                [0.2, 0.62],
                [0.27, 0.78],
                [0.21, 0.95],
                [0.13, 1.04],
                [0, 1.06],
              ]
            : [
                [0, 0],
                [0.32, 0.1],
                [0.25, 0.7],
                [0.13, 1.04],
                [0, 1.06],
              ],
          hi ? 8 : 4,
        ),
        [0.95, 0.31, 0.45],
        stoneAt(0),
        { q: qEuler(0, 0.15, PI / 2), aoAmt: 0.15 },
      );
      put(acc, blobHead(noise, hi), [-0.32, 0.2, 0.78], stoneAt(1), { aoAmt: 0.12 });
      if (hi) {
        blkC(0.55, 0.16, 0.2, [0.2, 0.1, 1.1], 3, qEuler(0, 0.4, 0.15));
        moss(0.5, 0.58, 0.45, 0.12);
      }
      break;
    }
  }
  const geo = acc.finish(rng, false, true);
  return addHook(geo, 'ruin', {
    name: C.variants[variant],
    sit: spec.sit,
    waterline: wl,
    height: spec.h,
  });
}

/** A noisy stone head (a lumpy icosphere) for the fallen statue. */
function blobHead(noise: Noise, hi: boolean): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.2, hi ? 1 : 0);
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.12 * noise.n3(v.x * 6, v.y * 6, v.z * 6);
    p.setXYZ(i, v.x * k, v.y * k * 1.15, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

/* ================================ registry glue ================================ */

export const RESEARCH_M31_GEO: readonly PropGeoDef[] = [
  {
    id: 'tideLab',
    variants: 1,
    build: tideLab,
    footprint: F.lab.footprint,
    height: F.lab.heightNominal,
    windy: false,
  },
  {
    id: 'tideSub',
    variants: 1,
    build: tideSub,
    footprint: F.sub.footprint,
    height: F.sub.heightNominal,
    windy: false,
  },
  {
    id: 'tideGauge',
    variants: 3,
    build: tideGauge,
    footprint: F.gauge.footprint,
    height: F.gauge.heightNominal,
    heights: [F.gauge.heightNominal, F.gauge.heightNominal, F.gauge.float.r * 2],
    windy: false,
  },
  {
    id: 'sunkenCity',
    variants: F.city.variants.length,
    build: sunkenCity,
    footprint: F.city.footprint,
    height: 2.7,
    heights: F.city.spec.map((s) => s.h),
    windy: false,
  },
];
