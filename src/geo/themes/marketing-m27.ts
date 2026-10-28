/**
 * Marketing M27 signature kit geometry (TASK-517, D-096; the marketing study's direction A "Cable
 * Carnival"). Numbers / palette: content/themes/marketing-m27.ts; def: content/props-themes/
 * marketing-m27.ts. Vertex colours only, one merged geometry per prop, pivot on the ground,
 * 1 u = 1 m. Nothing is placed here (TASK-518 places and moves them).
 *
 * New def: diveTower. Variants of existing defs (wrappers; every older variant keeps its builder):
 *   mailLine 4      sea pylon 9 u (red / white lattice, crossarm over the two tracks, a sheave each)
 *   mailLine 5 / 6  gondola cabin, red / cream livery (a mover mesh: pivot on the cabin floor)
 *   mailLine 7      terminal (TASK-518): the pylon with a bullwheel and a landing beside the +x track
 *   billboardV2 2   sea billboard 6 x 3 u, standing at a rock face and tied back to it
 *   billboardV2 3   vertical ON AIR neon, 5 lit letters on dark plates, spine tied back to a cliff
 *   antennaTower 2  guyed stack transmitter (the v1 lattice, taller, two guy tiers, blinking tip)
 *
 * Why ON AIR is a billboardV2 variant and not marqueeSign v3 (D-094 / the study): the batcher
 * decides a def's effective tier once per def (render/props/batcher.ts effDef), and marqueeSign is a
 * tier-2 def of 2.5 u signs; a 9 u cliff sign there would be hidden beyond ~160 u (the W4 camera is at 160 u)
 * or, if it were seen first, drag every boulevard sign to T0. billboardV2 is a tier-0 def.
 *
 * Hooks (userData.hooks, local frame, scale 1):
 *  - mailLine v4 / v7: cable { right, left, terminal } (the two track seats at x = ±track),
 *    sheaves [[x,y,z]...] (v4), landing { at, size [x, z], y } (v7 only).
 *  - mailLine v5 / v6: gondola { grip, pivot, axis, swingDeg, height }: `grip` = carrier wheel
 *    centre on the cable, `pivot` = hanger pin the cabin swings about, `axis` = the cable direction
 *    (the swing axis), `floor` = cabin floor centre; lamps { list } = the roof bulbs.
 *  - billboardV2 v2: screen { center, size, normal } (the SURFACE.slides rect), mount { face,
 *    normal, reach } (a point on the rock face plane behind the board centre; `reach` = distance
 *    from the pivot plane to it).
 *  - billboardV2 v3: letters [{ index, char, first, count, center, size, slot }] top to bottom (the
 *    lit stroke vertices of letter k are `first .. first + count`, emissive = slot), glow
 *    { slotBase, slotStep }, mount { face, normal, reach }, size [w, h].
 *  - diveTower: board { tip, from, len }, ladder { foot, top }, splash { dir, ahead }, deck
 *    { center, size, y }, flag { at }, lamps { list }.
 *  - antennaTower v2: lamp { at, r } (the blinking red tip; SURFACE.beacon tag, LOD0), guys
 *    { eyes: [[x,y,z]...], radius }, top = lamp height.
 */
import * as THREE from 'three';
import { ROCK, WOOD } from '../../content/palette.ts';
import { OFFICE_COLORS as C, OFFICE_PAL } from '../../content/palette-offices.ts';
import { THEMES } from '../../content/themes.ts';
import { MARKETING_M27 as F, M27_PAL as P } from '../../content/themes/marketing-m27.ts';
import { Acc, mat, qEuler, qFromTo } from '../kit.ts';
import { glyph } from '../office-kit.ts';
import { V, baseBox, bevBox, cylB, put, tubeAlong } from '../parts.ts';
import type { BuildOpts, PropBuilder, PropGeoDef } from '../types.ts';
import { accVerts } from './coding.ts';
import { beam } from './culture-hq.ts';
import { addHook } from './hq.ts';
import { transmitterMast } from './marketing-quick.ts';
import { tagBeacon, tagRange, tagSlides } from './surface-tags.ts';
import { SURFACE } from '../../content/activity.ts';

const Y = V(0, 1, 0);
type Pt = THREE.Vector3;
const MK = THEMES.marketing.accent;
const CREAM = OFFICE_PAL.marketing[0].wall;
const lit = { aoAmt: 0, ao: () => 1 } as const;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const arr3 = (p: Pt): [number, number, number] => [p.x, p.y, p.z];

/** Box from a to b, `w` thick (square section). */
function bar(acc: Acc, a: Pt, b: Pt, w: number, color: string, aoAmt = 0.05): void {
  beam(acc, a, b, w, color, w, aoAmt);
}

/** Red / white bands over the height `H` (the broadcast livery of the media rock). */
const bandsOf =
  (H: number, n: number, c0: string = P.red, c1: string = P.cream) =>
  (p: Pt): THREE.Color =>
    new THREE.Color(Math.floor(clamp01(p.y / H) * n * 0.9999) % 2 === 0 ? c0 : c1);

/* ================================ cable car: sea pylon (mailLine v4) ================================ */

/**
 * Tall pylon for the sea spans: four tapering legs in red / white bands on a stone plinth, a red
 * cap, a crossarm along z with two sheaves (the cable arrives in front at `anchor`, leaves behind at
 * `back`, so it works as an end tower and as a mid tower), and a boarding landing with rails beside
 * the line, flush with the gondola floor, reached by a ladder. Front = +z.
 */
function seaPylon({ rng, lod }: BuildOpts, terminal: boolean): THREE.BufferGeometry {
  const S = F.pylon;
  const hi = lod === 0;
  const H = S.height;
  const acc = new Acc(); // no scale jitter: the anchors match content exactly
  const jit = rng.fork('jit');
  const half = (y: number): number => S.foot + (S.top - S.foot) * clamp01((y - 0.2) / (H - 0.3));
  const corner = (sx: number, sz: number, y: number): Pt => V(sx * half(y), y, sz * half(y));
  put(acc, baseBox(2.5, 0.25, 2.5), [0, 0, 0], ROCK[0], { aoAmt: 0.25 });
  const corners = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ] as const;
  for (const [sx, sz] of corners) {
    const a = corner(sx, sz, 0.2);
    const b = corner(sx, sz, H - 0.1);
    const d = b.clone().sub(a);
    put(
      acc,
      baseBox((hi ? 0.18 : 0.26) + jit.range(-0.012, 0.012), d.length(), 0.18),
      a,
      bandsOf(H, 6),
      {
        q: qFromTo(Y, d),
        aoAmt: 0.05,
      },
    );
  }
  if (hi) {
    const bays = 5;
    for (let k = 0; k < bays; k++) {
      const y0 = 0.2 + (k * (H - 0.3)) / bays;
      const y1 = 0.2 + ((k + 1) * (H - 0.3)) / bays;
      const c = k % 2 === 0 ? P.cream : P.red;
      for (let f = 0; f < 4; f++) {
        const [ax, az] = corners[f];
        const [bx, bz] = corners[(f + 1) % 4];
        bar(acc, corner(ax, az, y1), corner(bx, bz, y1), 0.09, c, 0);
        bar(acc, corner(ax, az, y0), corner(bx, bz, y1), 0.07, c, 0);
      }
    }
  }
  // head: red block and hip cap, a crossarm along x OVER the cable (the grips pass under it), one
  // sheave per track hung on an outer bracket (v4) or a horizontal bullwheel (v7), a gold finial
  const sy = S.anchorY;
  const tr = S.track;
  const armY = sy + S.armOver;
  put(acc, baseBox(0.62, 0.32, 0.62), [0, H - 0.2, 0], P.red, { aoAmt: 0.05 });
  put(acc, new THREE.ConeGeometry(0.42, 0.36, 4).translate(0, 0.18, 0), [0, H + 0.12, 0], P.red, {
    q: qEuler(0, Math.PI / 4, 0),
    aoAmt: 0,
  });
  // king post up to the crossarm
  put(acc, baseBox(0.22, armY - H, 0.22), [0, H, 0], P.cream, { aoAmt: 0 });
  const sheaves: [number, number, number][] = [];
  if (!terminal) {
    put(acc, baseBox(2 * tr + 0.7, 0.22, 0.26), [0, armY, 0], P.cream, { aoAmt: 0 });
    for (const sx of [1, -1]) {
      const x = sx * tr;
      // bracket down the outer side to the sheave axle
      put(acc, baseBox(0.08, armY - sy + 0.04, 0.16), [x + sx * 0.2, sy, 0], P.steel, { aoAmt: 0 });
      put(
        acc,
        new THREE.CylinderGeometry(S.sheaveR, S.sheaveR, 0.1, hi ? 10 : 6).rotateZ(Math.PI / 2),
        [x, sy - S.sheaveR, 0],
        P.steel,
        { aoAmt: 0 },
      );
      if (hi)
        put(
          acc,
          new THREE.CylinderGeometry(0.07, 0.07, 0.42, 5).rotateZ(Math.PI / 2),
          [x + sx * 0.1, sy - S.sheaveR, 0],
          P.gold,
          { aoAmt: 0 },
        );
      sheaves.push([x, sy, 0]);
    }
  } else {
    // bullwheel: a rim at the seat height, spokes to a drum on the king post
    const rim = new THREE.TorusGeometry(tr, hi ? 0.07 : 0.1, hi ? 4 : 3, hi ? 20 : 10).rotateX(
      Math.PI / 2,
    );
    put(acc, rim, [0, sy, 0], P.red, { aoAmt: 0 });
    const spokes = hi ? 4 : 2;
    for (let k = 0; k < spokes; k++) {
      const a = (k * Math.PI) / spokes;
      const d = V(Math.cos(a) * tr, 0, Math.sin(a) * tr);
      bar(acc, V(0, sy + 0.05, 0).sub(d), V(0, sy + 0.05, 0).add(d), 0.07, P.cream, 0);
    }
    put(acc, cylB(0.3, 0.3, armY - sy + 0.1, hi ? 8 : 5), [0, sy - 0.05, 0], P.red, { aoAmt: 0 });
    put(acc, baseBox(0.9, 0.2, 0.9), [0, armY, 0], P.cream, { aoAmt: 0 });
  }
  // the red aviation lamp on top blinks (beacon tag, LOD0) like the M22 stack masts it replaces
  if (hi) put(acc, cylB(0.03, 0.03, 0.32, 4), [0, armY + 0.12, 0], P.steel, { aoAmt: 0 });
  const lamp0 = accVerts(acc);
  put(acc, new THREE.IcosahedronGeometry(hi ? 0.13 : 0.16, 0), [0, armY + 0.45, 0], P.neon, {
    ...lit,
    emissive: 1,
  });
  const lampN = accVerts(acc) - lamp0;
  // terminal: boarding landing beside the +x track, a slab on two brackets from the leg, rails,
  // ladder down
  const L = S.landing;
  const lx = (L.x0 + L.x1) / 2;
  const lw = L.x1 - L.x0;
  if (terminal) {
    put(acc, baseBox(lw, 0.14, L.depth), [lx, L.y - 0.14, 0], WOOD.planks, { aoAmt: 0.1 });
    put(acc, baseBox(lw, 0.06, L.depth + 0.08), [lx, L.y - 0.2, 0], P.red, { aoAmt: 0 });
    for (const z of [-1, 1])
      bar(
        acc,
        V(half(L.y - 1.6) * 0.9, L.y - 1.55, z * (L.depth / 2 - 0.1)),
        V(L.x0 + 0.25, L.y - 0.2, z * (L.depth / 2 - 0.1)),
        hi ? 0.09 : 0.14,
        P.steel,
      );
    const railY = L.y + 0.92;
    if (hi) {
      for (const [x, z] of [
        [L.x1 - 0.06, L.depth / 2 - 0.06],
        [L.x1 - 0.06, -L.depth / 2 + 0.06],
        [L.x0 + 0.1, L.depth / 2 - 0.06],
        [L.x0 + 0.1, -L.depth / 2 + 0.06],
      ])
        put(acc, cylB(0.04, 0.04, 0.92, 4), [x, L.y, z], P.steel, { aoAmt: 0 });
      bar(
        acc,
        V(L.x1 - 0.06, railY, L.depth / 2 - 0.06),
        V(L.x1 - 0.06, railY, -L.depth / 2 + 0.06),
        0.05,
        P.cream,
        0,
      );
      for (const z of [-1, 1])
        bar(
          acc,
          V(L.x0 + 0.1, railY, z * (L.depth / 2 - 0.06)),
          V(L.x1 - 0.06, railY, z * (L.depth / 2 - 0.06)),
          0.05,
          P.cream,
          0,
        );
      // ladder from the landing's outer edge to the plinth
      const lxl = L.x1 + 0.02;
      for (const z of [-0.24, 0.24])
        bar(acc, V(lxl, 0.25, z), V(lxl, L.y - 0.1, z), 0.05, P.steel, 0);
      for (let y = 0.6; y < L.y - 0.2; y += 0.42)
        bar(acc, V(lxl, y, -0.24), V(lxl, y, 0.24), 0.04, P.steel, 0);
    } else {
      put(acc, baseBox(0.12, 0.92, L.depth), [L.x1 - 0.06, L.y, 0], P.cream, { aoAmt: 0 });
      put(acc, baseBox(0.1, L.y - 0.2, 0.6), [L.x1 + 0.02, 0.2, 0], P.steel, { aoAmt: 0 });
    }
  }
  const g = acc.finish(rng, false, true);
  if (hi) tagBeacon(g, { first: lamp0, count: lampN });
  addHook(g, 'lamp', { at: [0, armY + 0.45, 0] });
  // the two tracks' seats (right = +x, left = -x); a terminal's cable turns round the bullwheel
  addHook(g, 'cable', { right: [tr, sy, 0], left: [-tr, sy, 0], terminal });
  if (terminal) addHook(g, 'landing', { at: [lx, L.y, 0], size: [lw, L.depth], y: L.y });
  return addHook(g, 'sheaves', { list: sheaves });
}

/* ================================ cable car: gondola (mailLine v5 / v6) ================================ */

/**
 * Gondola cabin on the cable: a rounded two-tone cabin (lower band + roof one colour, upper band the
 * other) with lit panes, a gold belt and roof bulbs, a hanger of two struts to a carrier bar with two
 * sheave wheels and a clamp. Pivot on the cabin floor; the cable runs along local z through the
 * wheels at `grip`; the cabin swings about z through the pin.
 */
function gondola({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const G = F.gondola;
  const hi = lod === 0;
  const [cLow, cUp] = G.livery[variant - G.variants[0]];
  const acc = new Acc();
  // seed variety in x / z only (cabin width and length): the y hooks stay exact
  const jr = rng.fork('jit');
  acc.xf = mat([0, 0, 0], null, [1 + jr.range(-0.04, 0.04), 1, 1 + jr.range(-0.04, 0.04)]);
  const hb = G.h * G.band;
  const hu = G.h - hb;
  const b = G.bevel;
  const box = (w: number, h: number, d: number): THREE.BufferGeometry =>
    hi ? bevBox(w, h, d, b).translate(0, h / 2, 0) : baseBox(w, h, d);
  put(acc, box(G.w, hb, G.d), [0, 0, 0], cLow, { aoAmt: 0.2 });
  put(acc, box(G.w - 0.06, hu, G.d - 0.06), [0, hb, 0], cUp, { aoAmt: 0.1 });
  if (hi) put(acc, baseBox(G.w + 0.05, 0.05, G.d + 0.05), [0, hb - 0.02, 0], P.gold, { aoAmt: 0 });
  // lit panes on the long sides (two each) and the ends (one each)
  const py = hb + hu * 0.52;
  const wx = (G.w - 0.06) / 2 + 0.012;
  const wz = (G.d - 0.06) / 2 + 0.012;
  const pane = (w: number, h: number): THREE.BufferGeometry => new THREE.PlaneGeometry(w, h);
  const paneOpt = { ...lit, emissive: 1 };
  if (hi) {
    for (const sx of [-1, 1])
      for (const z of [-0.19, 0.19])
        put(acc, pane((G.d - 0.26) / 2, G.pane.h), [sx * wx, py, z], P.warm, {
          q: qEuler(0, sx * (Math.PI / 2), 0),
          ...paneOpt,
        });
    for (const sz of [-1, 1])
      put(acc, pane(G.pane.w, G.pane.h), [0, py, sz * wz], P.warm, {
        q: qEuler(0, sz > 0 ? 0 : Math.PI, 0),
        ...paneOpt,
      });
  } else {
    for (const sx of [-1, 1])
      put(acc, pane(G.d * 0.7, G.pane.h), [sx * wx, py, 0], P.warm, {
        q: qEuler(0, sx * (Math.PI / 2), 0),
        ...paneOpt,
      });
  }
  // rounded roof in the lower-band colour
  const roofY = G.h;
  const roof = new THREE.SphereGeometry(
    0.5,
    hi ? 8 : 5,
    hi ? 4 : 2,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  put(acc, roof, [0, roofY, 0], cLow, { s: [G.w * 1.06, G.roof * 2, G.d * 1.06], aoAmt: 0.05 });
  const top = roofY + G.roof;
  // hanger: two struts up to the carrier bar at the pin, the bar, two sheave wheels, a clamp block
  // (far: one strut and the bar, the wheels are too small to read)
  for (const z of hi ? [-0.2, 0.2] : [0])
    bar(acc, V(0, top - 0.04, z), V(0, G.pin, z * 0.55), hi ? 0.07 : 0.12, P.steel, 0);
  put(acc, baseBox(0.16, 0.1, 0.62), [0, G.pin - 0.05, 0], P.steel, { aoAmt: 0 });
  for (const z of hi ? [-0.24, 0.24] : []) {
    put(
      acc,
      new THREE.CylinderGeometry(0.15, 0.15, 0.09, hi ? 8 : 5).rotateZ(Math.PI / 2),
      [0, G.grip, z],
      P.bezel,
      {
        aoAmt: 0,
      },
    );
    if (hi)
      put(
        acc,
        new THREE.CylinderGeometry(0.05, 0.05, 0.14, 4).rotateZ(Math.PI / 2),
        [0, G.grip, z],
        P.gold,
        {
          aoAmt: 0,
        },
      );
  }
  if (hi) put(acc, baseBox(0.12, 0.16, 0.22), [0, G.grip - 0.02, 0], P.steel, { aoAmt: 0 });
  // roof bulbs at both ends
  const bulbs: Pt[] = [];
  if (hi)
    for (const z of [-0.42, 0.42]) {
      const p = V(0, roofY + G.roof + 0.04, z);
      put(acc, new THREE.IcosahedronGeometry(0.06, 0), p, P.gold, { ...lit, emissive: 1 });
      bulbs.push(p);
    }
  const g = acc.finish(rng, false, true);
  addHook(g, 'gondola', {
    grip: [0, G.grip, 0],
    pivot: [0, G.pin, 0],
    axis: [0, 0, 1],
    swingDeg: G.swingDeg,
    height: G.grip + 0.15,
    floor: [0, 0, 0],
  });
  return addHook(g, 'lamps', { list: bulbs.map(arr3) });
}

/* ================================ sea billboard (billboardV2 v2) ================================ */

/**
 * 6 x 3 u billboard facing the sea (+z), the screen face on the SURFACE.slides cycle like the other
 * billboards. It stands on a footing with two short posts and is tied back with four steel rods to
 * wall plates on the rock face at z = -reach.
 */
function seaBillboard({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const B = F.seaBoard;
  const hi = lod === 0;
  const acc = new Acc();
  const cy = B.y + B.h / 2;
  const px = B.w / 2 - 0.75;
  put(acc, baseBox(B.w + 0.4, 0.3, B.reach + 0.7), [0, 0, -B.reach / 2 + 0.15], C.plinth, {
    aoAmt: 0.25,
  });
  for (const x of [-px, px])
    put(acc, cylB(0.17, 0.13, B.y + 0.35, hi ? 8 : 4, true), [x, 0.3, 0], C.deskDark, {
      aoAmt: 0.2,
    });
  put(acc, baseBox(B.w + 0.34, B.h + 0.34, 0.2), [0, B.y - 0.17, -0.03], CREAM, { aoAmt: 0.1 });
  const board0 = accVerts(acc);
  put(acc, new THREE.PlaneGeometry(B.w, B.h), [0, cy, 0.085], MK, {
    emissive: 2,
    aoAmt: 0,
    ao: () => 1,
  });
  const art0 = accVerts(acc);
  const art = (g: THREE.BufferGeometry, p: Pt): void =>
    put(acc, g, p, '#FFFFFF', { emissive: 2, aoAmt: 0, ao: () => 1 });
  if (hi) glyph(acc, 'marketing', V(-1.9, cy, 0.1), 0, 2.0, '#FFFFFF', 2);
  else art(new THREE.PlaneGeometry(1.8, 1.4), V(-1.9, cy, 0.095));
  if (hi) {
    const bars: ReadonlyArray<readonly [number, number, number]> = [
      [2.5, 0.42, 0.7],
      [1.9, 0.26, 0.2],
      [2.2, 0.26, -0.28],
    ];
    bars.forEach(([w, h, dy]) =>
      art(new THREE.PlaneGeometry(w, h), V(0.75 + (w - 2.5) / 2 + 0.2, cy + dy - 0.1, 0.095)),
    );
  } else art(new THREE.PlaneGeometry(2.4, 0.9), V(1.0, cy, 0.095));
  const art1 = accVerts(acc);
  // tie rods and wall plates on the rock face
  const rods = hi ? [0.25, 0.8] : [0.5];
  for (const x of [-px, px])
    for (const f of rods) {
      const y = B.y + B.h * f;
      bar(acc, V(x, y, -0.13), V(x, y, -B.reach + 0.05), hi ? 0.1 : 0.16, C.steelLight);
      put(acc, baseBox(0.7, 0.7, 0.12), [x, y - 0.35, -B.reach - 0.02], C.steel, { aoAmt: 0.1 });
    }
  if (hi) {
    // catwalk plank behind the face, a lamp row on arms
    put(acc, baseBox(B.w, 0.07, 0.5), [0, B.y - 0.55, -0.4], C.steelLight, { aoAmt: 0.05 });
    for (const x of [-2.3, -0.8, 0.8, 2.3]) {
      put(acc, cylB(0.025, 0.025, 0.5, 3, true), [x, B.y + B.h + 0.12, 0.05], C.steel, {
        q: qEuler(0.9, 0, 0),
        aoAmt: 0,
      });
      put(acc, new THREE.ConeGeometry(0.13, 0.2, 5), [x, B.y + B.h + 0.5, 0.38], C.dark, {
        q: qEuler(Math.PI - 0.3, 0, 0),
        aoAmt: 0,
      });
      put(acc, new THREE.IcosahedronGeometry(0.06, 0), [x, B.y + B.h + 0.4, 0.46], C.screenWarm, {
        ...lit,
        emissive: 1,
      });
    }
  }
  const g = acc.finish(rng, false, true);
  tagSlides(g, { first: board0, count: art0 - board0 }, { first: art0, count: art1 - art0 });
  addHook(g, 'screen', { center: [0, cy, 0.085], size: [B.w, B.h], normal: [0, 0, 1] });
  return addHook(g, 'mount', { face: [0, cy, -B.reach], normal: [0, 0, 1], reach: B.reach });
}

/* ================================ ON AIR neon (billboardV2 v3) ================================ */

type Pt2 = readonly [number, number];
/** Stroke font of the neon letters: polylines in the unit box (x right, y up). */
const NEON_FONT: Readonly<Record<string, readonly (readonly Pt2[])[]>> = {
  O: [
    [
      [0.22, 0],
      [0.78, 0],
      [1, 0.2],
      [1, 0.8],
      [0.78, 1],
      [0.22, 1],
      [0, 0.8],
      [0, 0.2],
      [0.22, 0],
    ],
  ],
  N: [
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
  ],
  A: [
    [
      [0, 0],
      [0.5, 1],
      [1, 0],
    ],
    [
      [0.2, 0.36],
      [0.8, 0.36],
    ],
  ],
  I: [
    [
      [0.12, 1],
      [0.88, 1],
    ],
    [
      [0.5, 1],
      [0.5, 0],
    ],
    [
      [0.12, 0],
      [0.88, 0],
    ],
  ],
  R: [
    [
      [0, 0],
      [0, 1],
      [0.78, 1],
      [1, 0.84],
      [1, 0.64],
      [0.78, 0.5],
      [0, 0.5],
    ],
    [
      [0.5, 0.5],
      [1, 0],
    ],
  ],
};

/**
 * Vertical ON AIR sign for a cliff face: five dark plates top to bottom (O N, a gap, A I R), each with
 * its neon letter as a separate emissive slot (letter k glows at `slot.base + k * slot.step`, a lamp
 * class value; the letter's vertices are one contiguous range in the `letters` hook), a steel spine
 * behind the plates tied back to wall plates at z = -reach. Front = +z (out to sea), pivot at the
 * footing's foot.
 */
function onAirSign({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const O = F.onAir;
  const hi = lod === 0;
  const acc = new Acc();
  const n = O.word.length;
  const pitch = O.plate.h + O.gap;
  const total = n * O.plate.h + (n - 1) * O.gap + O.wordGap;
  const top = O.foot + total;
  put(acc, baseBox(1.9, O.foot - 0.1, O.reach + 0.9), [0, 0, -O.reach / 2 + 0.2], ROCK[0], {
    aoAmt: 0.25,
  });
  // spine behind the plates and the stand-off arms to the wall plates
  const sz = -O.plate.d / 2 - 0.2;
  put(acc, baseBox(0.26, top - O.foot + 0.3, 0.22), [0, O.foot - 0.1, sz], P.steel, {
    aoAmt: 0.05,
  });
  for (const f of hi ? [0.12, 0.4, 0.68, 0.94] : [0.2, 0.8]) {
    const y = O.foot + total * f;
    bar(acc, V(0, y, sz), V(0, y, -O.reach + 0.05), hi ? 0.14 : 0.2, P.steel);
    put(acc, baseBox(0.8, 0.8, 0.12), [0, y - 0.4, -O.reach - 0.02], C.steelLight, { aoAmt: 0.1 });
  }
  const letters: Record<string, unknown>[] = [];
  const { letter: L, plate: pl } = O;
  let yTop = top;
  for (let k = 0; k < n; k++) {
    if (k === O.wordGapAfter + 1) yTop -= O.wordGap;
    const cy = yTop - pl.h / 2;
    const ch = O.word[k];
    // plate: chrome rim (near LOD only) behind a dark face
    if (hi)
      put(
        acc,
        baseBox(pl.w + 0.12, pl.h + 0.12, 0.14),
        [0, cy - (pl.h + 0.12) / 2, -0.03],
        P.steel,
        { aoAmt: 0.05 },
      );
    put(acc, baseBox(pl.w, pl.h, pl.d), [0, cy - pl.h / 2, 0], P.bezel, { aoAmt: 0.05 });
    for (const sy of hi ? [-1, 1] : [])
      put(acc, baseBox(0.12, 0.12, 0.16), [0.2 * sy, cy - 0.06, -pl.d / 2 - 0.08], P.steel, {
        aoAmt: 0,
      });
    const slot = O.slot.base + k * O.slot.step;
    const first = accVerts(acc);
    const z = pl.d / 2 + L.d / 2;
    if (hi) {
      for (const line of NEON_FONT[ch])
        for (let s = 0; s + 1 < line.length; s++) {
          const a = V((line[s][0] - 0.5) * L.w, cy + (line[s][1] - 0.5) * L.h, z);
          const b2 = V((line[s + 1][0] - 0.5) * L.w, cy + (line[s + 1][1] - 0.5) * L.h, z);
          const d = b2.clone().sub(a);
          put(
            acc,
            new THREE.BoxGeometry(L.th, d.length() + L.th * 0.9, L.d),
            a.clone().add(b2).multiplyScalar(0.5),
            P.neon,
            {
              q: qEuler(0, 0, Math.atan2(-d.x, d.y)),
              ...lit,
              emissive: slot,
            },
          );
        }
    } else {
      // far: the letter as one lit slab with the letter's width share
      put(acc, baseBox(L.w * 0.7, L.h * 0.7, L.d), [0, cy - L.h * 0.35, z - L.d / 2], P.neon, {
        ...lit,
        emissive: slot,
      });
    }
    letters.push({
      index: k,
      char: ch,
      first,
      count: accVerts(acc) - first,
      center: [0, cy, z],
      size: [L.w, L.h],
      slot,
    });
    yTop -= pitch;
  }
  const g = acc.finish(rng, false, true);
  // spell-out (TASK-518): each letter's strokes carry (index, count, 0, -SURFACE.neon)
  for (const l of letters)
    tagRange(g, { first: l.first as number, count: l.count as number }, [
      l.index as number,
      n,
      0,
      -SURFACE.neon,
    ]);
  addHook(g, 'letters', { list: letters });
  addHook(g, 'glow', { slotBase: O.slot.base, slotStep: O.slot.step });
  addHook(g, 'mount', {
    face: [0, O.foot + total / 2, -O.reach],
    normal: [0, 0, 1],
    reach: O.reach,
  });
  return addHook(g, 'size', { w: pl.w, h: total });
}

/* ================================ guyed transmitter (antennaTower v2) ================================ */

/**
 * The stack-1 transmitter: the v1 lattice (red / white bands, dish, drum, cabinet, whip) 8.2 u tall,
 * with two tiers of three guy wires tied to eye blocks `radius` out, and the blinking red tip lamp
 * (hook `lamp`, tagged SURFACE.beacon at LOD0 like v1). Guy wires are LOD0 only.
 */
function guyedMast(o: BuildOpts): THREE.BufferGeometry {
  const G = F.guyed;
  const eyes: Pt[] = [];
  const hi = o.lod === 0;
  const g = transmitterMast(o, G, (acc, H) => {
    for (const t of G.tiers) {
      const y = 0.28 + (H - 0.28) * t;
      const r = G.foot + (G.top - G.foot) * (y / H);
      for (let k = 0; k < G.count; k++) {
        const a = (k / G.count) * Math.PI * 2 + 0.5;
        const at = V(Math.sin(a) * r, y, Math.cos(a) * r);
        const eye = V(Math.sin(a) * G.radius, 0.12, Math.cos(a) * G.radius);
        if (t === G.tiers[0]) {
          eyes.push(eye);
          put(acc, baseBox(0.34, 0.24, 0.34), eye.clone().setY(0), ROCK[1], { aoAmt: 0.2 });
        }
        if (hi)
          put(acc, tubeAlong([at, eye], G.wire, 3), [0, 0, 0], P.steel, { aoAmt: 0, ao: () => 1 });
      }
    }
  });
  const H = G.height;
  addHook(g, 'lamp', { at: [0, H + 1.55, 0], r: 0.17 });
  return addHook(g, 'guys', { eyes: eyes.map(arr3), radius: G.radius });
}

/* ================================ dive tower (def diveTower) ================================ */

/**
 * Dive tower for a sea stack: a stone footing, four tapering legs braced in red / cream, a plank deck
 * `deckY` up with rails on three sides (gaps at the board and at the ladder), a ladder up the back
 * (-z), a gold springboard cantilevered out front (+z) with a fulcrum block, a pennant on a pole and
 * a lamp. LOD1 keeps legs, deck, rail slab, ladder rails, board and pole.
 */
function diveTower({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const D = F.dive;
  const hi = lod === 0;
  const acc = new Acc();
  const dy = D.deckY;
  const hd = D.deck / 2;
  // seed variety: the stone footing and the pennant length (the hooks stay exact)
  const jr = rng.fork('jit');
  put(
    acc,
    baseBox(2.9 + jr.range(-0.15, 0.15), 0.22, 2.9 + jr.range(-0.15, 0.15)),
    [0, 0, 0],
    ROCK[0],
    {
      aoAmt: 0.25,
    },
  );
  const corners = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ] as const;
  const leg = (sx: number, sz: number, y: number): Pt => {
    const h = D.legFoot + (D.legTop - D.legFoot) * ((y - 0.2) / (dy - 0.2));
    return V(sx * h, y, sz * h);
  };
  for (const [sx, sz] of corners)
    bar(acc, leg(sx, sz, 0.2), leg(sx, sz, dy - 0.1), hi ? 0.2 : 0.28, P.cream, 0.1);
  const bays = hi ? [0.2, 2.1, 3.9, dy - 0.1] : [0.2, dy - 0.1];
  for (let k = 0; k + 1 < bays.length; k++)
    for (let f = 0; f < 4; f++) {
      const [ax, az] = corners[f];
      const [bx, bz] = corners[(f + 1) % 4];
      if (hi) bar(acc, leg(ax, az, bays[k + 1]), leg(bx, bz, bays[k + 1]), 0.1, P.cream, 0);
      if (hi || f % 2 === 0)
        bar(acc, leg(ax, az, bays[k]), leg(bx, bz, bays[k + 1]), hi ? 0.08 : 0.12, P.red, 0);
    }
  // deck slab with plank lines and an edge band
  put(acc, baseBox(D.deck + 0.5, 0.14, D.deck + 0.5), [0, dy - 0.14, 0], WOOD.planks, {
    aoAmt: 0.1,
  });
  put(acc, baseBox(D.deck + 0.56, 0.07, D.deck + 0.56), [0, dy - 0.2, 0], P.red, { aoAmt: 0 });
  // rails: back with a gap for the ladder, sides full, front with a gap for the board
  const rh = D.rail;
  const gapZ = 0.38;
  const ex = hd + 0.16;
  const rail = (a: Pt, b: Pt): void =>
    bar(acc, a.clone().setY(dy + rh), b.clone().setY(dy + rh), 0.07, P.red, 0);
  if (hi) {
    const posts: [number, number][] = [
      [-ex, ex],
      [ex, ex],
      [-ex, -ex],
      [ex, -ex],
      [-ex, 0],
      [ex, 0],
      [-gapZ, ex],
      [gapZ, ex],
      [-gapZ, -ex],
      [gapZ, -ex],
    ];
    for (const [x, z] of posts)
      put(acc, cylB(0.04, 0.04, rh, 4), [x, dy, z], P.cream, { aoAmt: 0 });
    rail(V(-ex, 0, ex), V(-ex, 0, -ex));
    rail(V(ex, 0, ex), V(ex, 0, -ex));
    rail(V(-ex, 0, ex), V(-gapZ, 0, ex));
    rail(V(gapZ, 0, ex), V(ex, 0, ex));
    rail(V(-ex, 0, -ex), V(-gapZ, 0, -ex));
    rail(V(gapZ, 0, -ex), V(ex, 0, -ex));
    for (const sx of [-1, 1])
      bar(acc, V(sx * ex, dy + rh * 0.5, ex), V(sx * ex, dy + rh * 0.5, -ex), 0.04, P.cream, 0);
  } else {
    for (const sx of [-1, 1])
      put(acc, baseBox(0.08, rh * 0.35, 2 * ex), [sx * ex, dy + rh * 0.55, 0], P.red, { aoAmt: 0 });
  }
  // ladder up the back, leaning on the legs
  const lz0 = D.ladder.z;
  const foot = V(0, 0.22, lz0);
  const lTop = V(0, dy + 0.55, -hd - 0.16);
  for (const x of [-D.ladder.w / 2, D.ladder.w / 2])
    bar(
      acc,
      foot.clone().add(V(x, 0, 0)),
      lTop.clone().add(V(x, 0, 0)),
      hi ? 0.06 : 0.1,
      P.steel,
      0,
    );
  if (hi) {
    const len = lTop.distanceTo(foot);
    const steps = Math.floor(len / D.ladder.rungEvery);
    for (let i = 1; i <= steps; i++) {
      const p = foot.clone().lerp(lTop, i / (steps + 1));
      bar(
        acc,
        p.clone().add(V(-D.ladder.w / 2, 0, 0)),
        p.clone().add(V(D.ladder.w / 2, 0, 0)),
        0.045,
        P.steel,
        0,
      );
    }
  }
  // springboard: fulcrum block and a gold plank rising a little to the tip
  const B = D.board;
  const z0 = hd - B.from;
  const z1 = z0 + B.len;
  put(acc, baseBox(0.62, 0.22, 0.28), [0, dy, z0 + 0.6], P.red, { aoAmt: 0.1 });
  const bd = V(0, B.rise, z1 - z0);
  put(acc, baseBox(B.w, B.thick, bd.length()), [0, dy + 0.22, z0 + (z1 - z0) / 2], P.gold, {
    q: qEuler(-Math.atan2(B.rise, z1 - z0), 0, 0),
    aoAmt: 0,
    s: 1,
  });
  put(acc, baseBox(B.w + 0.04, 0.04, 0.24), [0, dy + 0.22 + B.rise + 0.1, z1 - 0.06], P.cream, {
    aoAmt: 0,
  });
  // pennant on a pole at the back-right corner
  const fx = hd - 0.05;
  const fz = -hd + 0.05;
  put(acc, cylB(0.04, 0.03, D.flag.h, 4), [fx, dy, fz], P.steel, { aoAmt: 0 });
  const pen = new THREE.PlaneGeometry(D.flag.len, D.flag.w * 0.55).translate(D.flag.len / 2, 0, 0);
  pen.scale(1 + jr.range(-0.12, 0.12), 1, 1);
  put(acc, pen, [fx, dy + D.flag.h - 0.3, fz], P.red, {
    double: true,
    aoAmt: 0,
    ao: () => 1,
    windAbs: (p) => clamp01((p.x - fx) / D.flag.len) * 0.9,
  });
  // a lantern on the front-left post
  const lampAt = V(-ex, dy + rh + 0.2, ex);
  const bulbs: Pt[] = [];
  if (hi) {
    put(acc, cylB(0.04, 0.04, 0.2, 4), [lampAt.x, dy + rh, lampAt.z], P.steel, { aoAmt: 0 });
    put(acc, new THREE.IcosahedronGeometry(0.1, 0), lampAt, P.gold, { ...lit, emissive: 1 });
    bulbs.push(lampAt);
    // life ring on the back rail
    put(acc, new THREE.TorusGeometry(0.2, 0.06, 4, 10), [ex + 0.01, dy + 0.6, 0.5], P.red, {
      q: qEuler(0, Math.PI / 2, 0),
      aoAmt: 0,
    });
  }
  const g = acc.finish(rng, true, true);
  const tip: [number, number, number] = [0, dy + 0.22 + B.rise + 0.05, z1];
  addHook(g, 'board', { tip, from: [0, dy + 0.22, z0], len: B.len });
  addHook(g, 'ladder', { foot: arr3(foot), top: arr3(lTop) });
  addHook(g, 'splash', { dir: [0, 0, 1], ahead: D.splashAhead });
  addHook(g, 'deck', { center: [0, dy, 0], size: [D.deck, D.deck], y: dy });
  addHook(g, 'flag', { at: [fx, dy + D.flag.h - 0.3, fz] });
  return addHook(g, 'lamps', { list: bulbs.map(arr3) });
}

/* ================================ registry glue ================================ */

function extend(
  def: PropGeoDef,
  variants: number,
  heights: readonly number[],
  build: PropBuilder,
): PropGeoDef {
  const own = def.heights ?? Array.from({ length: def.variants }, () => def.height);
  return { ...def, variants, heights: [...own, ...heights], build, lod1Of: { ...def.lod1Of } };
}

/** Heights of the added variants (u, measured from the finished LOD0 geometry; the geo test checks them). */
export const M27_HEIGHTS = {
  pylon: 10.35,
  gondola: 2.65,
  seaBoard: 5.2,
  onAir: 9.3,
  guyed: 9.9,
} as const;

/** mailLine 4 / 5 / 6 / 7: the cable car pylon, the two gondolas, the terminal (TASK-518). */
export function withCableCar(def: PropGeoDef): PropGeoDef {
  const [g0, g1] = F.gondola.variants;
  return extend(
    def,
    def.variants + 4,
    [M27_HEIGHTS.pylon, M27_HEIGHTS.gondola, M27_HEIGHTS.gondola, M27_HEIGHTS.pylon],
    (o) =>
      o.variant === F.pylon.variant || o.variant === F.pylon.terminal
        ? seaPylon(o, o.variant === F.pylon.terminal)
        : o.variant === g0 || o.variant === g1
          ? gondola(o)
          : def.build(o),
  );
}

/** billboardV2 2 / 3: the sea billboard and the vertical ON AIR neon. */
export function withSeaSigns(def: PropGeoDef): PropGeoDef {
  return extend(def, def.variants + 2, [M27_HEIGHTS.seaBoard, M27_HEIGHTS.onAir], (o) =>
    o.variant === F.seaBoard.variant
      ? seaBillboard(o)
      : o.variant === F.onAir.variant
        ? onAirSign(o)
        : def.build(o),
  );
}

/** antennaTower 2: the guyed stack transmitter. */
export function withGuyedMast(def: PropGeoDef): PropGeoDef {
  return extend(def, def.variants + 1, [M27_HEIGHTS.guyed], (o) =>
    o.variant === F.guyed.variant ? guyedMast(o) : def.build(o),
  );
}

export const MARKETING_M27_GEO: readonly PropGeoDef[] = [
  { id: 'diveTower', variants: 1, build: diveTower, footprint: 1.6, height: 6.5, windy: true },
];
