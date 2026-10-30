/**
 * Research "Summit Observatory" M28 signature kit geometry (TASK-525, D-106; study
 * marketing-research.md §2.3 R2 / R3 / R4). Numbers / palette: content/themes/research-m28.ts; def:
 * content/props-themes/research-m28.ts. Vertex colours only, one merged geometry per prop, pivot on
 * the ground, 1 u = 1 m. Nothing is placed here (TASK-526 places and aims them).
 *
 * New def: sundial (tier 2, Research ledger 10 -> 11). Variants of existing defs (wrappers; every
 * older variant keeps its builder):
 *   tripodTelescope 2   rim telescope deck, 3 x 2 u railed platform with the brass refractor
 *   lanternPost 3       teal Star Stair lantern, 1.95 u, one lamp slot
 *
 * Local frames (scale 1, +y up, front = +z like every prop):
 *  - sundial: the GNOMON BLADE LIES ALONG LOCAL +Z (a triangle in the plane x = 0, its high end
 *    `tip` at +z, the style sloping down to the south foot at -z). The BRASS NOON LINE is on the
 *    axis x = 0 north of the blade, running to the XII plate at +z. TASK-526 turns the prop so that
 *    local +z points away from the noon sun (north on a northern-hemisphere island); then the real
 *    shadow of the blade falls on the noon line at 12:00. The numerals run clockwise seen from
 *    above (XII +z, III at -x, VI at -z, IX at +x), 30 deg apart: a stylised clock face, only the
 *    noon line is exact. Glyphs read upright from the +z side (TASK-530), never mirrored. Hooks: dial { center, radius, y }, gnomon { axis, base, tip, height,
 *    thick }, noonLine { from, to, dir, y, width }, plates { list: [{ n, numeral, at, angleDeg }] }.
 *  - tripodTelescope v2: the deck's front (+z) is the step, its sea side is -z (rails on -z and
 *    both sides). Hooks: deck { center, size, y }, scope { at, dir, eyepiece }, bot { at, face,
 *    look, pose } (face = atan2(dx, dz), PI = looks to -z; `look` = the barrel direction, a unit
 *    vector, for the gaze), entry { at, dir } (the step foot).
 *  - lanternPost v3: lamp { at, r } (the single emissive 1 slot, in the island's lamp set), top.
 *
 * Tier note (D-096): the batcher fixes a def's effective tier from the first variant it builds.
 * The deck stays under STRUCTURE_MIN_SIZE (3 u) in both plan extents and in height, so
 * tripodTelescope never flips to T0 because of it; the sundial (a 6 u disc) is a large structure
 * and draws from T0 by size, which is intended.
 */
import * as THREE from 'three';
import { RESEARCH_M28 as F, RESEARCH_M28_PAL as P } from '../../content/themes/research-m28.ts';
import { qEuler } from '../kit.ts';
import { TAU, V, baseBox, cylB, put } from '../parts.ts';
import type { BuildOpts, PropBuilder, PropGeoDef } from '../types.ts';
import { cultureAcc } from './culture-devops.ts';
import { tripodTelescopeAt } from './culture-research.ts';
import { addHook } from './hq.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Acc } from '../kit.ts';

const PI = Math.PI;
type Pt = THREE.Vector3;
const arr3 = (p: Pt): [number, number, number] => [p.x, p.y, p.z];
const lit = { emissive: 1, ao: () => 1, aoAmt: 0 } as const;
const colorOf = (k: string): string => (P as Record<string, string>)[k];

/** Box from a to b (square section `w`). */
function bar(acc: Acc, a: Pt, b: Pt, w: number, color: string, aoAmt = 0.05): void {
  const d = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  put(acc, baseBox(w, d.length(), w), a, color, { q, aoAmt });
}

/** Flat stroke on the ground plane from (x0, z0) to (x1, z1), `w` wide, `h` high from y. */
function flatStroke(
  acc: Acc,
  y: number,
  [x0, z0]: readonly [number, number],
  [x1, z1]: readonly [number, number],
  w: number,
  h: number,
  color: string,
): void {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz) + w * 0.6;
  put(acc, baseBox(len, h, w), [(x0 + x1) / 2, y, (z0 + z1) / 2], color, {
    q: qEuler(0, -Math.atan2(dz, dx), 0),
    aoAmt: 0,
  });
}

/* ================================ sundial ================================ */

const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'] as const;

/** Stroke list of one Roman numeral in a (u right, v up) box, centred on u = 0; v in [0, 1]. */
function numeralStrokes(s: string): { w: number; strokes: [number, number, number, number][] } {
  const G = F.sundial.glyph;
  const gl: { w: number; strokes: [number, number, number, number][] }[] = [];
  for (const c of s) {
    if (c === 'I') gl.push({ w: G.narrow, strokes: [[0, 0, 0, 1]] });
    else if (c === 'V')
      gl.push({
        w: G.wide,
        strokes: [
          [-G.wide / 2, 1, 0, 0],
          [G.wide / 2, 1, 0, 0],
        ],
      });
    else
      gl.push({
        w: G.wide,
        strokes: [
          [-G.wide / 2, 1, G.wide / 2, 0],
          [G.wide / 2, 1, -G.wide / 2, 0],
        ],
      });
  }
  const total = gl.reduce((a, g) => a + g.w, 0) + G.gap * (gl.length - 1);
  const out: [number, number, number, number][] = [];
  let u = -total / 2;
  for (const g of gl) {
    const cx = u + g.w / 2;
    for (const [a, b, c, d] of g.strokes) out.push([cx + a, b, cx + c, d]);
    u += g.w + G.gap;
  }
  return { w: total, strokes: out };
}

function sundial({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const S = F.sundial;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const seg = hi ? 36 : 12;
  // stepped dial: each disc is its own plane (no coplanar faces to fight)
  for (const [r, top, key] of hi
    ? S.steps
    : S.steps.filter((_, i) => i === 0 || i === 1 || i === 3))
    put(acc, cylB(r, r, top, seg), [0, 0, 0], colorOf(key), {
      aoAmt: key === 'stoneDark' ? 0.25 : 0,
    });
  // 12 hour plates round the cream ring, numerals in ink on top (XII gilded)
  const PL = S.plate;
  const plates: Record<string, unknown>[] = [];
  const topY = S.ringTop + PL.thick;
  for (let n = 0; n < 12; n++) {
    const a = (n * TAU) / 12;
    const dir = V(-Math.sin(a), 0, Math.cos(a));
    const tan = V(-Math.cos(a), 0, -Math.sin(a));
    const at = dir.clone().multiplyScalar(PL.radius);
    put(
      acc,
      baseBox(PL.tangent, PL.thick, PL.radial),
      [at.x, S.ringTop, at.z],
      n === 0 ? P.gold : P.white,
      {
        q: qEuler(0, -Math.atan2(tan.z, tan.x), 0),
        aoAmt: 0.05,
      },
    );
    plates.push({
      n: n === 0 ? 12 : n,
      numeral: ROMAN[n],
      at: [at.x, topY, at.z],
      angleDeg: n * 30,
    });
    if (hi) {
      const { strokes } = numeralStrokes(ROMAN[n]);
      const G = S.glyph;
      // Clock-face convention (TASK-530). Every numeral reads upright for a viewer on the +z side
      // (the side the noon line points to): near half (z > 0) turns its top toward the centre, far
      // half toward the rim, the side plates (III, IX) lie flat (u = +x, top = -z). Only rotations,
      // never a mirror (u x v stays +y seen from above).
      const side = Math.abs(dir.z) <= 0.1;
      const sg = dir.z > 0.1 ? -1 : 1;
      const map = (u: number, v: number): [number, number] => {
        if (side) return [dir.x * PL.radius + u, -(v - 0.5) * G.height];
        const rr = PL.radius + sg * (v - 0.5) * G.height;
        return [dir.x * rr + tan.x * u * sg, dir.z * rr + tan.z * u * sg];
      };
      for (const [u0, v0, u1, v1] of strokes)
        flatStroke(acc, topY, map(u0, v0), map(u1, v1), G.stroke, G.thick, P.ink);
    }
  }
  // brass noon line on the axis, from the gnomon's north edge (and a little south) to the XII plate
  const N = S.noon;
  const g = S.gnomon;
  const lineBot = S.ringTop - 0.02;
  put(
    acc,
    baseBox(N.width, N.top - lineBot, N.inner - N.southZ),
    [0, lineBot, (N.inner + N.southZ) / 2],
    P.brass,
    { aoAmt: 0 },
  );
  // gnomon: stone block on the line, then the verdigris triangle blade with a brass style edge
  put(
    acc,
    baseBox(g.block.w, g.block.h, g.northZ - g.southZ + 0.3),
    [0, S.fieldTop - 0.01, (g.northZ + g.southZ) / 2],
    P.stone,
    {
      aoAmt: 0.15,
    },
  );
  const by = S.fieldTop - 0.01 + g.block.h;
  const bladeH = g.height - g.block.h + 0.01;
  const tri = new THREE.Shape();
  tri.moveTo(g.southZ, 0);
  tri.lineTo(g.northZ, 0);
  tri.lineTo(g.northZ, bladeH);
  tri.closePath();
  const blade = new THREE.ExtrudeGeometry(tri, { depth: g.thick, bevelEnabled: false });
  blade.translate(0, 0, -g.thick / 2);
  blade.rotateY(-PI / 2); // shape x -> +z, extrusion -> x
  put(acc, blade, [0, by, 0], P.copper, { aoAmt: 0.05 });
  const base = V(0, by, g.southZ);
  const tip = V(0, by + bladeH, g.northZ);
  if (hi) {
    // brass edge on the sloping style and a ball at the tip
    bar(acc, base.clone().add(V(0, 0.02, 0)), tip.clone().add(V(0, 0.02, 0)), g.edge, P.brass, 0);
    put(acc, new THREE.IcosahedronGeometry(0.075, 0), tip.clone().add(V(0, 0.05, 0)), P.gold, {
      aoAmt: 0,
    });
  } else {
    bar(acc, base, tip, g.edge * 1.4, P.brass, 0);
  }
  const geo = acc.finish(rng, false, true);
  addHook(geo, 'dial', { center: [0, S.ringTop, 0], radius: S.steps[3][0], y: S.ringTop });
  addHook(geo, 'gnomon', {
    axis: [0, 0, 1],
    base: arr3(base),
    tip: arr3(tip),
    height: g.height,
    thick: g.thick,
  });
  addHook(geo, 'noonLine', {
    from: [0, N.top, g.northZ],
    to: [0, N.top, N.inner],
    dir: [0, 0, 1],
    y: N.top,
    width: N.width,
  });
  return addHook(geo, 'plates', { list: plates });
}

/* ================================ rim telescope deck (tripodTelescope v2) ================================ */

function rimDeck(o: BuildOpts): THREE.BufferGeometry {
  const { rng, lod } = o;
  const D = F.deck;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const hw = D.w / 2;
  const hd = D.d / 2;
  const top = D.top;
  // stone footings under the corners and the middle, wooden posts, a plank deck on two joists
  const feet: [number, number][] = [
    [-hw + 0.2, -hd + 0.2],
    [hw - 0.2, -hd + 0.2],
    [-hw + 0.2, hd - 0.2],
    [hw - 0.2, hd - 0.2],
  ];
  for (const [x, z] of feet) {
    put(acc, cylB(0.2, 0.17, 0.16, hi ? 7 : 4), [x, 0, z], P.stoneDark, { aoAmt: 0.25 });
    put(acc, baseBox(0.14, top - 0.2, 0.14), [x, 0.14, z], P.woodDark, { aoAmt: 0.15 });
  }
  if (hi)
    for (const z of [-hd + 0.28, hd - 0.28])
      put(acc, baseBox(D.w - 0.1, 0.1, 0.12), [0, top - 0.2, z], P.woodDark, { aoAmt: 0.1 });
  const n = hi ? D.boards : 1;
  for (let i = 0; i < n; i++) {
    const bw = D.d / n;
    put(
      acc,
      baseBox(D.w, 0.1, bw - (hi ? 0.025 : 0)),
      [0, top - 0.1, -hd + bw * (i + 0.5)],
      i % 2 ? P.wood : P.cream,
      { aoAmt: 0.08 },
    );
  }
  // two steps at the front (+z): the upper one up to the boards' underside (no gap under the deck
  // edge), the lower one out front
  const sd = D.step.depth / 2;
  const sh = top - 0.1;
  put(acc, baseBox(D.step.w, sh, sd), [0, 0, hd + sd / 2], P.stoneDark, { aoAmt: 0.15 });
  put(acc, baseBox(D.step.w, sh / 2, sd), [0, 0, hd + sd * 1.5], P.stone, { aoAmt: 0.15 });
  // rails: back (sea, -z) and both sides full, the front open at the step
  const ex = hw - 0.08;
  const ez = hd - 0.08;
  const rh = D.rail;
  const posts: [number, number][] = [
    [-ex, -ez],
    [ex, -ez],
    [-ex, ez],
    [ex, ez],
    [0, -ez],
    [-ex, 0],
    [ex, 0],
  ];
  for (const [x, z] of hi ? posts : posts.slice(0, 4)) {
    put(acc, cylB(D.post, D.post, rh, hi ? 5 : 3), [x, top, z], P.woodDark, { aoAmt: 0.1 });
    if (hi)
      put(acc, new THREE.IcosahedronGeometry(0.075, 0), [x, top + rh + 0.03, z], P.brass, {
        aoAmt: 0,
      });
  }
  const rail = (a: Pt, b: Pt, h: number, w: number): void =>
    bar(acc, a.clone().setY(top + h), b.clone().setY(top + h), w, P.tealDeep, 0.05);
  rail(V(-ex, 0, -ez), V(ex, 0, -ez), rh, 0.07);
  rail(V(-ex, 0, -ez), V(-ex, 0, ez), rh, 0.07);
  rail(V(ex, 0, -ez), V(ex, 0, ez), rh, 0.07);
  if (hi) {
    rail(V(-ex, 0, -ez), V(ex, 0, -ez), rh * 0.45, 0.05);
    rail(V(-ex, 0, -ez), V(-ex, 0, ez), rh * 0.45, 0.05);
    rail(V(ex, 0, -ez), V(ex, 0, ez), rh * 0.45, 0.05);
  }
  // teal pennant on the pole at the back-left sea post
  const px = -ex;
  const pz = -ez;
  if (hi) {
    put(acc, cylB(0.025, 0.02, 0.55, 4), [px, top + rh, pz], P.steel, { aoAmt: 0 });
    const tri = new THREE.Shape();
    tri.moveTo(0, D.pennant.w / 2);
    tri.lineTo(0, -D.pennant.w / 2);
    tri.lineTo(D.pennant.len, 0);
    const pen = new THREE.ShapeGeometry(tri);
    put(acc, pen, [px + 0.02, top + rh + 0.42, pz], P.teal, {
      double: true,
      aoAmt: 0,
      ao: () => 1,
      windAbs: (p) => Math.min(1, Math.max(0, (p.x - px) / D.pennant.len)) * 0.9,
    });
  }
  const base = acc.finish(rng, false, true);
  // the brass refractor, aimed to -z (yaw PI), stood on the deck
  const sc = F.deck.scope;
  const scope = tripodTelescopeAt(
    { rng: rng.fork('scope'), lod, variant: 0 },
    { yaw: PI, e: sc.elev },
  );
  scope.translate(sc.x, top, sc.z);
  const merged = mergeGeometries([base, scope], false);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.userData = { tris: merged.getAttribute('position').count / 3 };
  // hooks: scope pose (the refractor's pivot is its fork at 0.85 + 0.34 high)
  const dir = V(0, Math.sin(sc.elev), -Math.cos(sc.elev));
  const head = V(sc.x, top + 1.19, sc.z);
  addHook(merged, 'deck', { center: [0, top, 0], size: [D.w, D.d], y: top });
  addHook(merged, 'scope', {
    at: [sc.x, top, sc.z],
    dir: arr3(dir),
    eyepiece: arr3(head.clone().addScaledVector(dir, -0.38)),
  });
  addHook(merged, 'bot', {
    at: [D.bot.x, top, D.bot.z],
    face: PI,
    look: arr3(dir),
    pose: 'gaze',
  });
  return addHook(merged, 'entry', { at: [0, 0, hd + D.step.depth], dir: [0, 0, 1] });
}

/* ================================ Star Stair lantern (lanternPost v3) ================================ */

function stairLantern({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const L = F.lantern;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const y0 = 0.14;
  const lampY = L.lampY;
  const cageLo = lampY - 0.23;
  const cageHi = lampY + 0.2;
  if (hi) {
    put(acc, cylB(0.19, 0.15, y0, 7), [0, 0, 0], P.stoneDark, { aoAmt: 0.25 });
    put(acc, cylB(0.062, 0.045, cageLo - y0, 6), [0, y0, 0], P.tealDeep, { aoAmt: 0.15 });
    for (const y of [y0 + 0.04, cageLo - 0.1])
      put(acc, cylB(0.085, 0.085, 0.045, 6), [0, y, 0], P.brass, { aoAmt: 0 });
    // lamp cage: bottom plate, four teal corner bars, top plate
    put(acc, cylB(0.18, 0.1, 0.05, 6), [0, cageLo - 0.04, 0], P.tealDeep, { aoAmt: 0 });
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        put(acc, baseBox(0.04, cageHi - cageLo, 0.04), [sx * L.cage, cageLo, sz * L.cage], P.teal, {
          aoAmt: 0,
        });
    put(acc, cylB(0.2, 0.2, 0.04, 6), [0, cageHi, 0], P.tealDeep, { aoAmt: 0 });
  } else {
    put(acc, baseBox(0.12, cageLo, 0.12), [0, 0, 0], P.tealDeep, { aoAmt: 0.1 });
  }
  // the single lamp slot: a warm octahedron-ish gem
  const gem = hi
    ? new THREE.OctahedronGeometry(L.lampR, 0)
    : new THREE.BoxGeometry(0.26, 0.3, 0.26);
  gem.scale(1, 1.25, 1);
  put(acc, gem, [0, lampY, 0], P.lamp, lit);
  // teal cap and a brass ball finial
  put(
    acc,
    new THREE.ConeGeometry(0.27, 0.3, hi ? 6 : 4).translate(0, 0.15, 0),
    [0, cageHi + 0.04, 0],
    P.roofTeal,
    {
      q: qEuler(0, PI / 6, 0),
      aoAmt: 0,
    },
  );
  if (hi)
    put(acc, new THREE.IcosahedronGeometry(0.05, 0), [0, cageHi + 0.37, 0], P.brass, { aoAmt: 0 });
  const geo = acc.finish(rng, false, true);
  addHook(geo, 'lamp', { at: [0, lampY, 0], r: L.lampR });
  return addHook(geo, 'top', { y: cageHi + 0.37 });
}

/* ================================ registry glue ================================ */

/** Heights of the added variants (u, measured from the finished LOD0 geometry; the geo test checks them). */
export const M28_HEIGHTS = {
  deck: F.deck.heightNominal,
  lantern: F.lantern.heightNominal,
} as const;

/** tripodTelescope 2: the rim deck. LOD1 is the deck's own (tier 2 never reaches the far merge). */
export function withRimDeck(def: PropGeoDef): PropGeoDef {
  const own = def.heights ?? Array.from({ length: def.variants }, () => def.height);
  const build: PropBuilder = (o) => (o.variant === F.deck.variant ? rimDeck(o) : def.build(o));
  return {
    ...def,
    variants: def.variants + 1,
    heights: [...own, M28_HEIGHTS.deck],
    build,
    lod1Of: { ...def.lod1Of },
  };
}

/** lanternPost 3: the teal stair lantern, as a builder wrapper for the registry's `D(...)`. */
export function withStairLantern(build: PropBuilder): PropBuilder {
  return (o) => (o.variant === F.lantern.variant ? stairLantern(o) : build(o));
}

export const RESEARCH_M28_GEO: readonly PropGeoDef[] = [
  {
    id: 'sundial',
    variants: 1,
    build: sundial,
    footprint: 3.0,
    height: F.sundial.heightNominal,
    windy: false,
  },
];
