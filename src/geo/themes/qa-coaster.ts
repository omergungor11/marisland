/**
 * QA Thrill Test Park coaster kit geometry (TASK-540, D-120; D-115 plan, study lunapark.html).
 * Numbers / palette / the fixture spline: content/themes/qa-coaster.ts; defs: content/props-themes/
 * qa-coaster.ts. Vertex colours only, one merged geometry per prop variant, 1 u = 1 m, front = +z.
 * Nothing is placed here (TASK-539 owns the real spline, TASK-541 places and moves things).
 *
 *   coasterTrack    tier 1 (QA's second). `buildCoasterTrack` sweeps rails + ties + spine + columns
 *                   along any closed or open spline (world/coaster-spline.ts). The def builds the
 *                   fixture spline (station, chain lift, camelback, one loop). Site-local frame:
 *                   the geometry is in the SAME frame as the control points (origin = site origin),
 *                   so the placer puts the instance at the site origin and the track is where
 *                   the spline says. Columns end at `groundY` (the def uses y = 0).
 *   coasterStation  tier 2 (large by size). Boarding platform + canopy + queue rail + check lamp.
 *                   Track runs along local +x at z = 0, rail top at y = station.railY.
 *   coasterCar      geo only (mover mesh): v0 mint, v1 yellow. Origin = rail-top centre, front +z.
 *   coasterRider    geo only (mover mesh): v0 crash dummy, v1 bot with mint cap, v2 bot with yellow
 *                   cap. Origin = hips on the seat surface, facing +z, arms up.
 *   bumperCar       geo only (mover mesh, the test cart's chassis): v0 mint, v1 yellow, v2 pink.
 *   checklistBoard  v2 = the TESTED board (variant of an old def; check lamp slot on top).
 *   inspectionBooth v1 = the cotton-candy cart (variant of an old def).
 *
 * Hooks (g.userData.hooks):
 *  - coasterTrack: track { length, closed, gauge, tieEvery, chain: [[s0, s1]], tris }.
 *  - coasterStation: track { x0, x1, z, y }, platform { y, z0, z1, x0, x1 }, lamp { at, r }, board { at }.
 *  - coasterCar: seats { list: [[x, y, z]], rider: 'hips' }, headlamp { at, r }, coupler { front, back }.
 *  - checklistBoard v2: lamp { at, r }, board { center, size }.
 *  - cotton cart: handle { at }, drum { at, r }.
 *
 * Tier note (D-096): the new variants of old defs stay under STRUCTURE_MIN_SIZE (3 u) in height and
 * in one plan extent; coasterTrack / coasterStation are large in every variant (one variant each).
 */
import * as THREE from 'three';
import {
  COASTER_PAL as P,
  QA_COASTER as F,
  QA_COASTER_FIXTURE as FIXTURE,
} from '../../content/themes/qa-coaster.ts';
import { QA_FACTORY } from '../../content/themes/qa.ts';
import { createRng, type Rng } from '../../core/rng.ts';
import {
  createCoasterSpline,
  newCoasterSample,
  sampleCoaster,
  type CoasterSample,
  type CoasterSpline,
} from '../../world/coaster-spline.ts';
import type { CoasterKit } from '../../world/coaster-kit.ts';
import { Acc, createNoise, blob, frustum, qEuler } from '../kit.ts';
import { TAU, V, baseBox, bevBox, cylB, put } from '../parts.ts';
import type { BuildOpts, Lod, PropBuilder, PropGeoDef } from '../types.ts';
import { FlatAcc, cultureAcc } from './culture-devops.ts';
import { addGlyph } from './glyphs.ts';
import { addHook } from './hq.ts';

type V3 = readonly [number, number, number];
const lit = { emissive: 1, ao: () => 1, aoAmt: 0, noJitter: true } as const;
const K = F.track;

/* =============================== track builder =============================== */

export interface CoasterTrackOpts {
  /** Control points in the site's local frame (u), y = absolute height of the rail top. */
  points: ReadonlyArray<V3>;
  closed: boolean;
  /** Ground height under (x, z); columns end `sink` below it. */
  groundY: (x: number, z: number) => number;
  /** 0 = full, 1 = far proxy (rails + spine + sparse columns). Default 0. */
  lod?: Lod;
  /** Tone jitter stream (per-face HSL). Default `createRng(540)`. */
  rng?: Rng;
  /** Chain-lift ranges as arc lengths (u) along the spline. */
  chain?: ReadonlyArray<readonly [s0: number, s1: number]>;
  /** A prebuilt spline for `points` (saves a second table). */
  spline?: CoasterSpline;
  /** Bumper rink in the same frame, built into the same geometry (no def, no draw call of its own). */
  rink?: { x: number; z: number; w: number; d: number; y: number };
}

/** Stations along the spline: advance until the tangent turned `maxTurn` rad or `maxStep` u. */
function adaptiveStations(sp: CoasterSpline, maxStep: number, minStep: number, maxTurn: number) {
  const out = [0];
  let last = 0;
  let li = 0;
  for (let i = 1; i < sp.n; i++) {
    const s = i * sp.ds;
    const d = s - last;
    if (d < minStep) continue;
    const c =
      sp.tan[li * 3] * sp.tan[i * 3] +
      sp.tan[li * 3 + 1] * sp.tan[i * 3 + 1] +
      sp.tan[li * 3 + 2] * sp.tan[i * 3 + 2];
    if (d >= maxStep || Math.acos(Math.min(1, c)) >= maxTurn) {
      out.push(s);
      last = s;
      li = i;
    }
  }
  if (sp.length - last < minStep * 0.5 && out.length > 1) out.pop();
  out.push(sp.length);
  return out;
}

/** A ring of `sides` points (side, up) round (cx, cy), counter-clockwise from side towards up. */
const ring = (cx: number, cy: number, r: number, sides: number): Array<[number, number]> =>
  Array.from({ length: sides }, (_, k) => [
    cx + r * Math.cos((k / sides) * TAU),
    cy + r * Math.sin((k / sides) * TAU),
  ]);

/** Sweep a ring along frames `a .. b` (inclusive); open ends (tubes are capped by their neighbours). */
function sweep(
  acc: Acc,
  frames: CoasterSample[],
  rg: Array<[number, number]>,
  color: string,
  o: { aoAmt?: number; windMul?: number } = {},
): void {
  if (frames.length < 2) return;
  const pos: number[] = [];
  const at = (f: CoasterSample, k: number): V3 => [
    f.pos[0] + f.side[0] * rg[k][0] + f.up[0] * rg[k][1],
    f.pos[1] + f.side[1] * rg[k][0] + f.up[1] * rg[k][1],
    f.pos[2] + f.side[2] * rg[k][0] + f.up[2] * rg[k][1],
  ];
  for (let i = 0; i + 1 < frames.length; i++) {
    for (let k = 0; k < rg.length; k++) {
      const k1 = (k + 1) % rg.length;
      const a0 = at(frames[i], k);
      const a1 = at(frames[i], k1);
      const b0 = at(frames[i + 1], k);
      const b1 = at(frames[i + 1], k1);
      pos.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  acc.add(g, { color: new THREE.Color(color), aoAmt: o.aoAmt ?? 0.05, windMul: 0 });
}

/** Box without its underside (10 tris), centre at the origin. */
function boxNoBottom(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.getAttribute('position');
  const keep: number[] = [];
  // face order +x -x +y -y +z -z, 6 vertices each: drop the -y face (vertices 18..23)
  for (let v = 0; v < p.count; v++) {
    if (v >= 18 && v < 24) continue;
    keep.push(p.getX(v), p.getY(v), p.getZ(v));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  return out;
}

const basis = (f: CoasterSample, off: V3 = [0, 0, 0]): THREE.Matrix4 => {
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...f.side),
    new THREE.Vector3(...f.up),
    new THREE.Vector3(...f.tangent),
  );
  m.setPosition(
    f.pos[0] + f.side[0] * off[0] + f.up[0] * off[1] + f.tangent[0] * off[2],
    f.pos[1] + f.side[1] * off[0] + f.up[1] * off[1] + f.tangent[1] * off[2],
    f.pos[2] + f.side[2] * off[0] + f.up[2] * off[1] + f.tangent[2] * off[2],
  );
  return m;
};

/**
 * Track mesh along a spline: two rails, mint ties, a spine beam under them (yellow while inverted),
 * a chain between the rails on `chain` ranges and a column every `supportEvery` u down to `groundY`.
 * The geometry lives in the control points' frame; hooks.track carries the numbers TASK-541 needs.
 */
export function buildCoasterTrack(o: CoasterTrackOpts): THREE.BufferGeometry {
  const lod = o.lod ?? 0;
  const hi = lod === 0;
  const sp = o.spline ?? createCoasterSpline(o.points, { closed: o.closed, step: hi ? 0.25 : 0.5 });
  const acc: Acc = hi ? new Acc() : new FlatAcc();
  const L = K.lod1;
  const st = adaptiveStations(
    sp,
    hi ? K.maxStep : L.maxStep,
    hi ? K.minStep : K.minStep * 2,
    hi ? K.maxTurn : L.maxTurn,
  );
  const frames = st.map((s) => sampleCoaster(sp, s, newCoasterSample()));
  // rails (3-sided tubes, tops at the spline) and the spine in colour runs
  const railR = hi ? K.railR : L.railR;
  for (const sx of [-1, 1])
    sweep(acc, frames, ring(sx * K.gauge * 0.5, -railR, railR, 3), K.rail, {
      aoAmt: 0,
    });
  const spineRing = ring(0, -K.spineDrop, hi ? K.spineR : L.spineR, hi ? 4 : 3);
  let run: CoasterSample[] = [];
  let runInv = frames[0].up[1] < K.invertedUp;
  for (const f of frames) {
    const inv = f.up[1] < K.invertedUp;
    if (inv !== runInv) {
      run.push(f);
      sweep(acc, run, spineRing, runInv ? K.spineLoop : K.spine, { aoAmt: 0.08 });
      run = [f];
      runInv = inv;
    } else run.push(f);
  }
  sweep(acc, run, spineRing, runInv ? K.spineLoop : K.spine, { aoAmt: 0.08 });
  const tmp = newCoasterSample();
  if (hi) {
    // ties: a flat mint slat under the rails every `tieEvery`
    // (seeded: each tie a few percent longer / shorter and a hair off square)
    const tr = (o.rng ?? createRng(540)).fork('ties', lod);
    for (let s = K.tieEvery * 0.5; s < sp.length; s += K.tieEvery) {
      sampleCoaster(sp, s, tmp);
      const m = basis(tmp, [0, -K.railR * 2 - K.tieH / 2, 0]);
      m.multiply(new THREE.Matrix4().makeRotationY(tr.range(-0.03, 0.03)));
      m.multiply(new THREE.Matrix4().makeScale(tr.range(0.94, 1.06), 1, 1));
      acc.add(boxNoBottom(K.tieLen, K.tieH, K.tieW), {
        m,
        color: new THREE.Color(K.tie),
        aoAmt: 0.05,
        windMul: 0,
      });
    }
    // chain lift: two alternating greys, one link per `link` u
    for (const [s0, s1] of o.chain ?? []) {
      const links = Math.max(1, Math.round((s1 - s0) / K.chain.link));
      const cring = ring(0, -K.chain.drop, K.chain.r, 3);
      for (let k = 0; k < links; k++) {
        const a = sampleCoaster(sp, s0 + ((s1 - s0) * k) / links, newCoasterSample());
        const b = sampleCoaster(sp, s0 + ((s1 - s0) * (k + 1)) / links, newCoasterSample());
        sweep(acc, [a, b], cring, k % 2 ? K.chainA : K.chainB, { aoAmt: 0 });
      }
    }
  }
  // columns
  const every = hi ? K.supportEvery : L.supportEvery;
  const ground = o.groundY;
  const column = (x: number, z: number, yTop: number, r0: number, r1: number): void => {
    const g0 = ground(x, z) - K.sink;
    if (yTop - g0 < 0.2) return;
    const f = frustum(V(x, g0, z), V(x, yTop, z), r0, r1, hi ? 6 : 4, true);
    acc.add(f.geo, { m: f.m, color: new THREE.Color(K.column), aoAmt: 0.25, windMul: 0 });
    if (hi) {
      const fm = new THREE.Matrix4().makeTranslation(x, g0 + K.sink - 0.04 + K.foot.h / 2, z);
      acc.add(boxNoBottom(K.foot.w, K.foot.h, K.foot.w), {
        m: fm,
        color: new THREE.Color(K.foot0),
        aoAmt: 0.1,
        windMul: 0,
      });
    }
  };
  for (let s = every * 0.5; s < sp.length; s += every) {
    const f = sampleCoaster(sp, s, newCoasterSample());
    const steep = Math.abs(f.tangent[1]) > K.steepY;
    if (f.up[1] < K.invertedUp) {
      // vertical sides of a loop: one column just outside the rail; the inverted top has none
      const hl = Math.hypot(f.up[0], f.up[2]);
      if (!steep || f.up[1] < -0.5 || hl < 0.3) continue;
      const x = f.pos[0] - (f.up[0] / hl) * 0.8;
      const z = f.pos[2] - (f.up[2] / hl) * 0.8;
      column(x, z, f.pos[1] - 0.3, K.colR0 + 0.04, K.colR0 + 0.02);
      continue;
    }
    const off = -(K.spineDrop + K.spineR + K.saddle.h / 2);
    const cx = f.pos[0] + f.up[0] * off;
    const cy = f.pos[1] + f.up[1] * off;
    const cz = f.pos[2] + f.up[2] * off;
    const top = cy - K.saddle.h / 2;
    const clear = top - ground(cx, cz);
    if (clear < K.minClear) continue;
    const rBase = Math.min(K.colRmax, K.colR0 + K.colRk * clear);
    if (hi)
      acc.add(boxNoBottom(K.saddle.w, K.saddle.h, K.saddle.d), {
        m: basis(f, [0, off, 0]),
        color: new THREE.Color(K.saddleCol),
        aoAmt: 0.05,
        windMul: 0,
      });
    if (clear > K.aFrame && hi) {
      // A-frame: two raked legs and a cross bar
      const hl = Math.hypot(f.side[0], f.side[2]) || 1;
      const hx = f.side[0] / hl;
      const hz = f.side[2] / hl;
      const spread = 0.62 + 0.09 * clear;
      for (const sg of [-1, 1]) {
        const x0 = cx + sg * hx * 0.5;
        const z0 = cz + sg * hz * 0.5;
        const x1 = cx + sg * hx * spread;
        const z1 = cz + sg * hz * spread;
        const g0 = ground(x1, z1) - K.sink;
        const fr = frustum(V(x1, g0, z1), V(x0, top, z0), rBase * 0.8, rBase * 0.6, 5, true);
        acc.add(fr.geo, { m: fr.m, color: new THREE.Color(K.column), aoAmt: 0.25, windMul: 0 });
        const fm = new THREE.Matrix4().makeTranslation(x1, g0 + K.sink - 0.04 + K.foot.h / 2, z1);
        acc.add(boxNoBottom(K.foot.w, K.foot.h, K.foot.w), {
          m: fm,
          color: new THREE.Color(K.foot0),
          aoAmt: 0.1,
          windMul: 0,
        });
      }
      const mid = top - clear * 0.45;
      const wMid = (spread - 0.5) * 0.55 + 0.5;
      acc.add(boxNoBottom(wMid * 2, 0.09, 0.09), {
        m: new THREE.Matrix4().compose(
          new THREE.Vector3(cx, mid, cz),
          new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(-hz, hx)),
          new THREE.Vector3(1, 1, 1),
        ),
        color: new THREE.Color(K.column),
        aoAmt: 0.1,
        windMul: 0,
      });
    } else column(cx, cz, top, rBase, rBase * 0.75);
  }
  if (o.rink) addRink(acc, o.rink, hi);
  const g = acc.finish(o.rng ?? createRng(540).fork('track', lod), false, true);
  return addHook(g, 'track', {
    length: sp.length,
    closed: sp.closed,
    gauge: K.gauge,
    tieEvery: K.tieEvery,
    chain: (o.chain ?? []).map(([a, b]) => [a, b]),
    tris: g.userData.tris,
  });
}

/** Rink floor (checker), rubber curb, four posts and a light frame (bulbs glow at dusk). */
function addRink(acc: Acc, r: NonNullable<CoasterTrackOpts['rink']>, hi: boolean): void {
  const Q = F.rink;
  const white = (a: THREE.BufferGeometry, m: THREE.Matrix4, c: string, ao = 0.08): void =>
    acc.add(a, { m, color: new THREE.Color(c), aoAmt: ao, windMul: 0 });
  const at = (x: number, y: number, z: number): THREE.Matrix4 =>
    new THREE.Matrix4().makeTranslation(r.x + x, r.y + y, r.z + z);
  const hw = r.w / 2;
  const hd = r.d / 2;
  // floor: skirt sunk into the pad, the checker on top (one slab at LOD1)
  white(boxNoBottom(r.w, Q.floorH + 0.3, r.d), at(0, Q.floorH / 2 - 0.15 - 0.005, 0), Q.tileA, 0.2);
  if (hi) {
    const [nx, nz] = Q.tiles;
    const tw = r.w / nx;
    const td = r.d / nz;
    for (let ix = 0; ix < nx; ix++)
      for (let iz = 0; iz < nz; iz++) {
        if ((ix + iz) % 2 === 0) continue;
        const pg = new THREE.PlaneGeometry(tw, td);
        pg.rotateX(-Math.PI / 2);
        white(pg, at(-hw + (ix + 0.5) * tw, Q.floorH, -hd + (iz + 0.5) * td), Q.tileB, 0);
      }
  }
  // curb: four rubber bars with a yellow cap
  const C = Q.curb;
  for (const [cx, cz, w, d] of [
    [0, -hd, r.w + C.w, C.w],
    [0, hd, r.w + C.w, C.w],
    [-hw, 0, C.w, r.d],
    [hw, 0, C.w, r.d],
  ] as const) {
    white(boxNoBottom(w, C.h, d), at(cx, C.h / 2, cz), C.color, 0.15);
    if (hi) white(boxNoBottom(w, 0.03, d), at(cx, C.h + 0.015, cz), C.top, 0);
  }
  // posts + frame
  const Po = Q.post;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const f = frustum(
        V(r.x + sx * hw, r.y, r.z + sz * hd),
        V(r.x + sx * hw, r.y + Po.h, r.z + sz * hd),
        Po.r,
        Po.r,
        hi ? 6 : 4,
        true,
      );
      acc.add(f.geo, { m: f.m, color: new THREE.Color(Po.color), aoAmt: 0.15, windMul: 0 });
    }
  const By = Po.h + Q.beam.h / 2;
  for (const [cx, cz, w, d] of [
    [0, -hd, r.w, Q.beam.h],
    [0, hd, r.w, Q.beam.h],
    [-hw, 0, Q.beam.h, r.d],
    [hw, 0, Q.beam.h, r.d],
  ] as const)
    white(boxNoBottom(w, Q.beam.h, d), at(cx, By, cz), Q.beam.color, 0);
  if (!hi) return;
  // bulbs along the long beams: baked emissive, the shader lights them at dusk only
  const n = Q.bulbs.perSide;
  for (const sx of [-1, 1])
    for (let k = 0; k < n; k++) {
      const z = -hd + ((k + 0.5) * r.d) / n;
      acc.add(new THREE.IcosahedronGeometry(Q.bulbs.r, 0), {
        m: at(sx * hw, By - 0.1, z),
        color: new THREE.Color(Q.bulbs.color),
        ...lit,
        windMul: 0,
      });
    }
}

/**
 * The real track + rink of a site, in the kit frame (world/coaster-kit.ts): the prop stands at the site
 * origin at the site's scale. render/coaster-track.ts hands this to the batcher for the `coasterTrack` def.
 */
export function buildCoasterSiteTrack(o: {
  kit: CoasterKit;
  lod: Lod;
  rng: Rng;
  groundY: (x: number, z: number) => number;
}): THREE.BufferGeometry {
  return buildCoasterTrack({
    points: o.kit.points,
    closed: true,
    groundY: o.groundY,
    lod: o.lod,
    rng: o.rng,
    chain: o.kit.chain,
    spline: o.kit.spline,
    rink: o.kit.rink,
  });
}

/** The def builder: the fixture spline on flat ground (the real one is built through `buildCoasterTrack`). */
function coasterTrackDef({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  return buildCoasterTrack({
    points: FIXTURE.points,
    closed: FIXTURE.closed,
    groundY: () => 0,
    lod,
    rng,
    chain: fixtureChain(),
  });
}

let fxSpline: CoasterSpline | null = null;
/** The fixture spline (cached). */
export function fixtureSpline(): CoasterSpline {
  return (fxSpline ??= createCoasterSpline(FIXTURE.points, { closed: FIXTURE.closed }));
}
/** The fixture's chain lift as arc-length ranges. */
export function fixtureChain(): Array<[number, number]> {
  const sp = fixtureSpline();
  return FIXTURE.chainPoints.map(([a, b]) => [sp.controlS[a], sp.controlS[b]]);
}

/* ================================== helpers ================================== */

type Pt = [number, number, number];
function bx(acc: Acc, size: Pt, at: Pt, color: string, aoAmt = 0.1, q?: THREE.Quaternion): void {
  put(acc, baseBox(...size), at, color, { aoAmt, ...(q ? { q } : {}) });
}
/** Cylinder lying along local x or z, centred on `at`. */
function cylAxis(
  acc: Acc,
  axis: 'x' | 'z',
  r: number,
  len: number,
  at: Pt,
  color: string,
  seg: number,
  aoAmt = 0.05,
): void {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  put(acc, g, at, color, { aoAmt });
}
const ball = (r: number, hi: boolean): THREE.BufferGeometry =>
  new THREE.IcosahedronGeometry(r, hi ? 1 : 0);
/** Rod between two points. */
function rod(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  color: string,
  seg = 4,
): void {
  const d = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  put(
    acc,
    new THREE.CylinderGeometry(r, r, d.length(), seg, 1, true),
    a.clone().add(b).multiplyScalar(0.5),
    color,
    {
      q,
      aoAmt: 0.05,
    },
  );
}
/** Seeded +-1.2 % scale jitter at LOD0 (like every kit), flat tones at LOD1. */
const mk = (rng: BuildOpts['rng'], lod: Lod): Acc => cultureAcc(rng, lod);
const done = (acc: Acc, rng: BuildOpts['rng']): THREE.BufferGeometry =>
  acc.finish(rng, false, true);

/* ================================== station ================================== */

/** The ✓ lamps' lens while dark: the same colour family, no emissive. */
const LENS_OFF = '#5C8A78';
/** Station ✓ lamp (station-local), shared with the glow scene. */
export const stationLampAt = (): Pt => [
  -F.station.length / 2 + F.station.lamp.x,
  F.station.deckY + F.station.lamp.mast,
  F.station.deckZ0 + F.station.depth - F.station.lamp.z,
];
/** TESTED board ✓ lamp (board-local), shared with the glow scene. */
export const boardLampAt = (): Pt => [0, F.board.lamp.y, F.board.lamp.z];

function station({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const S = F.station;
  const hi = lod === 0;
  const acc = mk(rng, lod);
  const hl = S.length / 2;
  const z0 = S.deckZ0;
  const z1 = S.deckZ0 + S.depth;
  // foundation slab under the platform and the track bed
  bx(acc, [S.length + 0.8, 0.12, S.depth + 2.0], [0, 0, (z0 + z1) / 2 - 0.9], P.concrete, 0.2);
  // deck: mint boards on a white plinth
  bx(acc, [S.length, S.deckY - 0.12, S.depth], [0, 0.12, (z0 + z1) / 2], P.white, 0.2);
  bx(acc, [S.length, 0.06, S.depth], [0, S.deckY - 0.06, (z0 + z1) / 2], P.mint, 0.05);
  if (hi) {
    // plank seams
    for (let i = 1; i < 10; i++)
      bx(
        acc,
        [0.04, 0.012, S.depth],
        [-hl + (i * S.length) / 10, S.deckY, (z0 + z1) / 2],
        P.mintMid,
        0,
      );
    // yellow edge strip along the track side
    bx(acc, [S.length, 0.02, 0.14], [0, S.deckY, z0 + 0.07], P.yellow, 0);
  }
  // canopy: 6 posts (3 per long side), mint roof with a yellow scalloped fringe
  const px = [-hl + 0.4, 0, hl - 0.4];
  for (const x of px)
    for (const zz of [z0 + 0.25, z1 - 0.25])
      put(acc, cylB(0.09, 0.09, S.postH - S.deckY, hi ? 6 : 4, true), [x, S.deckY, zz], P.white, {
        aoAmt: 0.15,
      });
  const zc = (z0 + z1) / 2;
  const roofD = S.depth + 1.6;
  // gable roof: two sloped slabs meeting over the platform's middle (ridge along x)
  const rise = S.roofRise;
  const ang = Math.atan2(rise, roofD / 2);
  const slabL = Math.hypot(roofD / 2, rise) + 0.05;
  for (const sg of [-1, 1])
    put(
      acc,
      new THREE.BoxGeometry(S.length + 1.0, 0.1, slabL),
      [0, S.postH + rise / 2, zc + (sg * roofD) / 4],
      P.mint,
      {
        q: qEuler(sg * ang, 0, 0),
        aoAmt: 0.05,
      },
    );
  bx(acc, [S.length + 1.0, 0.1, 0.2], [0, S.postH + rise - 0.05, zc], P.mintDeep, 0);
  if (hi) {
    // valance: alternating yellow / white flags hanging from both eaves
    const n = 20;
    const w = (S.length + 0.9) / n;
    for (const sg of [-1, 1])
      for (let i = 0; i < n; i++)
        bx(
          acc,
          [w * 0.92, 0.22, 0.04],
          [-hl - 0.45 + (i + 0.5) * w, S.postH - 0.22, zc + sg * (roofD / 2 - 0.03)],
          i % 2 ? P.yellow : P.white,
          0,
        );
  } else {
    bx(acc, [S.length + 1.0, 0.08, 0.14], [0, S.postH - 0.05, zc - roofD / 2], P.yellow, 0);
    bx(acc, [S.length + 1.0, 0.08, 0.14], [0, S.postH - 0.05, zc + roofD / 2], P.yellow, 0);
  }
  // gable-end sign discs with the QA check
  for (const sx of [-1, 1]) {
    const x = sx * (hl + 0.55);
    put(acc, cylB(0.5, 0.5, 0.08, hi ? 12 : 8), [x, S.postH + 0.1, zc], P.yellow, {
      q: qEuler(0, 0, (sx * Math.PI) / 2),
      aoAmt: 0,
    });
    if (hi)
      addGlyph(acc, 'check', V(x + sx * 0.05, S.postH + 0.55, zc), {
        size: 0.6,
        color: P.mintDeep,
        depth: 0.05,
        q: qEuler(0, (sx * Math.PI) / 2, 0),
      });
  }
  // queue rail along the back of the platform (mint posts + a white rail), a gap for the ramp
  const zr = z1 - 0.12;
  put(acc, baseBox(S.length - 2.4, 0.06, 0.06), [0.0, S.deckY + 0.95, zr], P.white, { aoAmt: 0 });
  put(acc, baseBox(S.length - 2.4, 0.05, 0.05), [0.0, S.deckY + 0.5, zr], P.mint, { aoAmt: 0 });
  for (let i = 0; i <= (hi ? 6 : 2); i++)
    bx(
      acc,
      [0.07, 0.95, 0.07],
      [-(S.length - 2.4) / 2 + (i * (S.length - 2.4)) / (hi ? 6 : 2), S.deckY, zr],
      P.mintMid,
      0.05,
    );
  // steps at the +x end
  for (let k = 0; k < (hi ? 3 : 1); k++)
    bx(
      acc,
      [0.4, S.deckY * ((3 - k) / 4) - 0.02, 1.2],
      [hl + 0.2 + k * 0.4, 0.12, zc],
      k % 2 ? P.white : P.mint,
      0.15,
    );
  // the check lamp on a short mast at the track end of the platform: a dark lens here, the lit glow is a
  // culture mover at the `lamp` hook (coasterLampScene) from the dummy's return until the bots are off
  const LA = S.lamp;
  const lampAt: Pt = stationLampAt();
  bx(acc, [0.1, LA.mast - LA.r, 0.1], [lampAt[0], S.deckY, lampAt[2]], P.steelDark, 0.1);
  put(acc, ball(LA.r, hi), lampAt, LENS_OFF, { aoAmt: 0 });
  if (hi)
    put(
      acc,
      new THREE.CylinderGeometry(0.26, 0.2, 0.07, 8),
      [lampAt[0], lampAt[1] - 0.2, lampAt[2]],
      P.steelDark,
      { aoAmt: 0 },
    );
  const g = done(acc, rng);
  addHook(g, 'track', { x0: -hl, x1: hl, z: S.trackZ, y: S.railY });
  addHook(g, 'platform', { y: S.deckY, z0, z1, x0: -hl, x1: hl });
  addHook(g, 'lamp', { at: lampAt, r: LA.r });
  return addHook(g, 'board', { at: [hl - 1.2, S.deckY, z1 + 0.9] });
}

/* ================================ cars / riders ================================ */

function car({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const C = F.car;
  const hi = lod === 0;
  const acc = mk(rng, lod);
  const body = variant === 0 ? C.mint : C.yellow;
  const alt = variant === 0 ? C.yellow : C.mint;
  const hw = F.track.gauge / 2;
  const wz = C.wheelBase / 2;
  // wheels on the rails + axle bars + an underframe
  if (hi) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        cylAxis(acc, 'x', C.wheelR, 0.1, [sx * hw, C.wheelR, sz * wz], P.steelDark, 8);
    for (const sz of [-1, 1])
      bx(acc, [hw * 2, 0.07, 0.09], [0, C.wheelR - 0.035, sz * wz], P.steel, 0);
  } else
    for (const sx of [-1, 1])
      bx(acc, [0.1, C.wheelR * 2, C.wheelBase + 0.3], [sx * hw, 0, 0], P.steelDark, 0);
  if (hi) bx(acc, [1.0, 0.12, C.length - 0.5], [0, 0.2, 0], P.white, 0.2);
  // tub (main colour), cockpit inset, rim
  if (hi) put(acc, bevBox(C.width, 0.52, C.length - 0.2, 0.08), [0, 0.6, 0], body, { aoAmt: 0.2 });
  else bx(acc, [C.width, 0.52, C.length - 0.2], [0, 0.34, 0], body, 0.2);
  // nose: a rounded bump forward, tail fin behind
  put(acc, ball(0.4, hi), [0, 0.54, C.length / 2 - 0.1], body, {
    s: [1.35, 0.75, 1.0],
    aoAmt: 0.1,
  });
  bx(acc, [0.08, 0.34, 0.5], [0, 0.82, -C.length / 2 + 0.28], alt, 0.1);
  // cockpit floor (dark), two seats with backrests (far: one block)
  if (hi) {
    bx(acc, [C.width - 0.2, 0.02, 1.15], [0, 0.86, C.seatZ - 0.05], P.mintDeep, 0);
    for (const sx of [-1, 1]) {
      bx(acc, [0.4, 0.1, 0.42], [sx * C.seatX, 0.86, C.seatZ], P.cream, 0.1);
      bx(acc, [0.4, 0.5, 0.1], [sx * C.seatX, 0.86, C.seatZ - 0.28], P.cream, 0.1);
    }
  } else bx(acc, [C.width - 0.2, 0.55, 0.2], [0, 0.86, C.seatZ - 0.28], P.cream, 0.1);
  // side stripe and nose stripe in the other colour
  if (hi) {
    for (const sx of [-1, 1])
      bx(acc, [0.03, 0.1, C.length - 0.5], [sx * (C.width / 2 + 0.005), 0.5, -0.05], alt, 0);
    // lap bar: two uprights and a white bar
    for (const sx of [-1, 1])
      bx(acc, [0.05, 0.38, 0.05], [sx * 0.46, 0.86, C.seatZ + 0.28], P.white, 0);
    bx(acc, [0.96, 0.06, 0.06], [0, 1.2, C.seatZ + 0.28], P.white, 0);
    // couplers
    for (const sz of [-1, 1])
      bx(acc, [0.1, 0.08, 0.3], [0, 0.26, sz * (C.length / 2 + 0.05)], P.steelDark, 0);
  }
  // headlamp
  const lampAt: Pt = [0, 0.62, C.length / 2 + 0.3];
  put(acc, ball(0.08, hi), lampAt, P.white, { ...lit });
  const g = done(acc, rng);
  addHook(g, 'seats', {
    list: [-1, 1].map((sx) => [sx * C.seatX, C.seatY, C.seatZ]),
    rider: 'hips',
  });
  addHook(g, 'headlamp', { at: lampAt, r: 0.08 });
  return addHook(g, 'coupler', {
    front: [0, 0.26, C.length / 2 + 0.2],
    back: [0, 0.26, -C.length / 2 - 0.2],
  });
}

function rider({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = mk(rng, lod);
  const dummy = variant === 0;
  const skin = dummy ? P.yellow : P.white;
  const limb = dummy ? P.yellow : P.mintMid;
  const cap = variant === 1 ? P.mint : P.yellow;
  // hips + torso + thighs on the seat + shins down
  bx(acc, [0.34, 0.14, 0.3], [0, 0, 0], limb, 0.1);
  put(
    acc,
    hi ? bevBox(0.34, 0.5, 0.24, 0.05) : new THREE.BoxGeometry(0.34, 0.5, 0.24),
    [0, 0.34, -0.02],
    skin,
    { aoAmt: 0.1 },
  );
  if (!hi) {
    put(acc, ball(0.17, false), [0, 0.74, 0], skin, { aoAmt: 0 });
    return done(acc, rng);
  }
  for (const sx of [-1, 1]) {
    rod(acc, V(sx * 0.1, 0.06, 0.02), V(sx * 0.1, 0.1, 0.36), 0.065, limb);
    rod(acc, V(sx * 0.1, 0.1, 0.36), V(sx * 0.1, -0.22, 0.4), 0.055, limb);
    bx(acc, [0.12, 0.07, 0.2], [sx * 0.1, -0.28, 0.44], P.ink, 0.05);
    // arms up in a V (hands in the air)
    rod(acc, V(sx * 0.2, 0.52, -0.02), V(sx * 0.34, 1.05, 0.08), 0.05, limb);
    put(acc, ball(0.055, true), [sx * 0.34, 1.07, 0.08], skin, { aoAmt: 0 });
  }
  // head: dummy ball with a target mark and a stripe, bots a cube-ish head with eyes, antenna and a cap
  if (dummy) {
    put(acc, ball(0.17, true), [0, 0.76, 0.0], P.yellow, { aoAmt: 0.05 });
    for (const sx of [-1, 1]) {
      put(
        acc,
        new THREE.CylinderGeometry(0.075, 0.075, 0.02, 10),
        [sx * 0.168, 0.76, 0.02],
        P.ink,
        { q: qEuler(0, 0, Math.PI / 2), aoAmt: 0 },
      );
      put(
        acc,
        new THREE.CylinderGeometry(0.04, 0.04, 0.024, 8),
        [sx * 0.172, 0.76, 0.02],
        P.yellow,
        { q: qEuler(0, 0, Math.PI / 2), aoAmt: 0 },
      );
    }
    put(acc, new THREE.BoxGeometry(0.2, 0.05, 0.02), [0, 0.8, 0.165], P.ink, { aoAmt: 0 });
  } else {
    put(acc, bevBox(0.34, 0.3, 0.3, 0.06), [0, 0.8, 0], P.cream, { aoAmt: 0.08 });
    for (const sx of [-1, 1]) bx(acc, [0.06, 0.08, 0.02], [sx * 0.08, 0.78, 0.152], P.ink, 0);
    // cap: a half dome and a brim
    put(acc, new THREE.SphereGeometry(0.2, 8, 4, 0, TAU, 0, Math.PI / 2), [0, 0.93, 0], cap, {
      aoAmt: 0.05,
    });
    bx(acc, [0.3, 0.03, 0.18], [0, 0.93, 0.19], P.white, 0);
    bx(acc, [0.02, 0.2, 0.02], [0, 0.95, -0.02], P.steelDark, 0);
    put(acc, ball(0.04, false), [0, 1.17, -0.02], cap, { ...lit, emissive: 0.5 });
  }
  return done(acc, rng);
}

/* ================================ bumper cars ================================ */

function bumper({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const B = F.bumper;
  const Q = QA_FACTORY.crate;
  const hi = lod === 0;
  const acc = mk(rng, lod);
  const body = [P.mint, P.yellow, P.pink][variant % 3];
  // the test cart's running gear: frame plate and four small wheels (QA_FACTORY.crate)
  bx(acc, [0.9, 0.07, 0.9], [0, 0.1, 0], Q.frame, 0);
  if (hi)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        cylAxis(acc, 'x', 0.085, 0.08, [sx * 0.4, 0.085, sz * 0.34], Q.wheel, 8, 0);
  else for (const sx of [-1, 1]) bx(acc, [0.08, 0.17, 0.8], [sx * 0.4, 0, 0], Q.wheel, 0);
  // round tub, rubber bumper ring, seat + back, steering wheel, a lamp stub
  put(
    acc,
    new THREE.CylinderGeometry(B.r * 0.85, B.r * 0.95, 0.4, hi ? 12 : 7),
    [0, 0.31, 0],
    body,
    { aoAmt: 0.2 },
  );
  if (hi)
    put(acc, new THREE.TorusGeometry(B.r + 0.02, 0.065, 5, 14), [0, 0.22, 0], P.rubber, {
      q: qEuler(Math.PI / 2, 0, 0),
      aoAmt: 0.1,
    });
  put(
    acc,
    new THREE.CylinderGeometry(B.r * 0.78, B.r * 0.85, 0.08, hi ? 12 : 7),
    [0, 0.5, 0],
    body,
    { aoAmt: 0 },
  );
  bx(acc, [0.5, 0.1, 0.36], [0, 0.46, -0.08], P.cream, 0.05);
  bx(acc, [0.5, 0.38, 0.1], [0, 0.46, -0.3], P.cream, 0.1);
  if (hi) {
    rod(acc, V(0, 0.5, 0.26), V(0, 0.78, 0.18), 0.03, P.steelDark);
    put(acc, new THREE.TorusGeometry(0.13, 0.025, 4, 8), [0, 0.8, 0.17], P.ink, {
      q: qEuler(0.9, 0, 0),
      aoAmt: 0,
    });
    for (const sx of [-1, 1])
      put(acc, ball(0.07, true), [sx * 0.28, 0.5, B.r * 0.72], P.white, { ...lit, emissive: 0.6 });
    // contact pole
    rod(acc, V(0, 0.5, -0.4), V(0, 1.9, -0.55), 0.025, P.steel);
    put(acc, ball(0.06, false), [0, 1.93, -0.55], P.yellow, { aoAmt: 0 });
    // sticker on the nose
    put(acc, new THREE.PlaneGeometry(0.28, 0.16), [0, 0.32, B.r * 0.88], Q.sticker, {
      q: qEuler(0, 0, 0),
      aoAmt: 0,
      ao: () => 1,
    });
  } else bx(acc, [0.05, 1.4, 0.05], [0, 0.5, -0.45], P.steel, 0);
  return done(acc, rng);
}

/* ============================ TESTED board (checklistBoard v2) ============================ */

// 3x5 pixel letters of TESTED, one row string per line
const GLYPHS: Record<string, string[]> = {
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  E: ['###', '#..', '##.', '#..', '###'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
};

function testedBoard({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = mk(rng, lod);
  const W = F.board.w;
  const H = 1.45;
  const y0 = 0.55;
  for (const sx of [-1, 1]) {
    put(
      acc,
      cylB(0.07, 0.07, y0 + H + 0.3, hi ? 6 : 4, true),
      [sx * (W / 2 - 0.2), 0, 0],
      P.white,
      { aoAmt: 0.2 },
    );
    if (hi) bx(acc, [0.4, 0.06, 0.5], [sx * (W / 2 - 0.2), 0, 0.05], P.concrete, 0.2);
  }
  bx(acc, [W, H, 0.14], [0, y0, 0], P.mintDeep, 0.1);
  put(acc, new THREE.PlaneGeometry(W - 0.16, H - 0.16), [0, y0 + H / 2, 0.075], P.white, {
    aoAmt: 0,
    ao: () => 1,
  });
  put(acc, new THREE.PlaneGeometry(W - 0.16, 0.32), [0, y0 + H - 0.24, 0.08], P.yellow, {
    aoAmt: 0,
    ao: () => 1,
  });
  if (hi) {
    // "TESTED" in 3x5 pixels on the yellow band: one plane per lit pixel
    const px = 0.052;
    const word = 'TESTED';
    const total = word.length * 4 - 1;
    let ix = 0;
    for (const ch of word) {
      GLYPHS[ch].forEach((row, r) =>
        [...row].forEach((c, k) => {
          if (c !== '#') return;
          put(
            acc,
            new THREE.PlaneGeometry(px * 0.92, px * 0.92),
            [(ix + k - (total - 1) / 2) * px, y0 + H - 0.24 + (2 - r) * px, 0.085],
            P.ink,
            { aoAmt: 0, ao: () => 1 },
          );
        }),
      );
      ix += 4;
    }
    // a big check mark in a ring and three result bars
    addGlyph(acc, 'check', V(-W * 0.24, y0 + 0.52, 0.09), {
      size: 0.7,
      color: P.mintMid,
      depth: 0.05,
    });
    for (let i = 0; i < 3; i++) {
      put(
        acc,
        new THREE.PlaneGeometry(W * 0.4, 0.09),
        [W * 0.17, y0 + 0.78 - i * 0.24, 0.085],
        i === 2 ? P.yellowDeep : P.steel,
        { aoAmt: 0, ao: () => 1 },
      );
      put(
        acc,
        new THREE.PlaneGeometry(0.11, 0.11),
        [W * 0.17 - W * 0.23, y0 + 0.78 - i * 0.24, 0.085],
        P.mintMid,
        { aoAmt: 0, ao: () => 1 },
      );
    }
  } else {
    addGlyph(acc, 'check', V(0, y0 + 0.55, 0.09), { size: 0.8, color: P.mintMid, depth: 0.05 });
  }
  // the lamp: a drum lens on top of the board between the posts
  const lampAt: Pt = boardLampAt();
  const LR = F.board.lamp.r;
  bx(acc, [0.34, 0.1, 0.3], [0, y0 + H, 0.02], P.steelDark, 0.1);
  put(acc, hi ? new THREE.SphereGeometry(LR, 10, 6) : ball(LR, false), lampAt, LENS_OFF, {
    aoAmt: 0,
  });
  const g = done(acc, rng);
  addHook(g, 'lamp', { at: lampAt, r: LR });
  return addHook(g, 'board', { center: [0, y0 + H / 2, 0.08], size: [W, H] });
}

/* ============================ cotton-candy cart (inspectionBooth v1) ============================ */

function cottonCart({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = mk(rng, lod);
  const noise = createNoise(rng.fork('fluff'));
  // cabinet on two big wheels, a handle behind, front prop leg
  bx(acc, [1.3, 0.78, 0.9], [0, 0.34, 0], P.white, 0.2);
  bx(acc, [1.34, 0.12, 0.94], [0, 0.34, 0], P.mint, 0.05);
  bx(acc, [1.34, 0.1, 0.94], [0, 1.0, 0], P.mintDeep, 0.05);
  for (const sx of [-1, 1])
    cylAxis(acc, 'x', 0.34, 0.1, [sx * 0.72, 0.34, -0.1], P.steelDark, hi ? 10 : 6);
  if (hi)
    for (const sx of [-1, 1]) cylAxis(acc, 'x', 0.1, 0.14, [sx * 0.72, 0.34, -0.1], P.yellow, 6, 0);
  rod(acc, V(0.45, 0.8, -0.45), V(0.45, 0.9, -1.0), 0.035, P.steelDark);
  rod(acc, V(-0.45, 0.8, -0.45), V(-0.45, 0.9, -1.0), 0.035, P.steelDark);
  bx(acc, [1.0, 0.05, 0.05], [0, 0.9, -1.0], P.steelDark, 0);
  bx(acc, [0.1, 0.34, 0.1], [0, 0.0, 0.5], P.steel, 0.2);
  // front panel: a pink stripe and a serving window
  bx(acc, [1.3, 0.1, 0.02], [0, 0.55, 0.46], P.pink, 0);
  // the spinning drum (steel bowl + glass rim) and fluffy candy on the top
  put(acc, new THREE.CylinderGeometry(0.46, 0.4, 0.2, hi ? 12 : 7), [0, 1.14, 0], P.steel, {
    aoAmt: 0.1,
  });
  put(acc, new THREE.CylinderGeometry(0.5, 0.46, 0.05, hi ? 12 : 7), [0, 1.26, 0], P.sky, {
    aoAmt: 0,
  });
  const fluff = (x: number, y: number, z: number, r: number, c: string, off: number): void => {
    put(acc, hi ? blob(r, 1, noise, 0.18, 1.8, off) : ball(r, false), [x, y, z], c, {
      aoAmt: 0.05,
    });
  };
  fluff(0, 1.42, 0, 0.3, P.pink, 1);
  if (hi) {
    fluff(-0.2, 1.38, 0.16, 0.2, P.sky, 2);
    fluff(0.22, 1.36, -0.12, 0.19, P.pink, 3);
  }
  // parasol: pole, a striped cone (mint / white) with a yellow ball finial
  const poleX = -0.5;
  rod(acc, V(poleX, 1.05, -0.35), V(poleX, 2.2, -0.35), 0.03, P.white);
  const seg = hi ? 8 : 4;
  for (let i = 0; i < seg; i++) {
    put(
      acc,
      new THREE.ConeGeometry(0.95, 0.4, seg, 1, true, (i / seg) * TAU, TAU / seg),
      [poleX, 2.4, -0.35],
      i % 2 ? P.white : P.mint,
      { aoAmt: 0, double: true },
    );
  }
  put(acc, ball(0.06, hi), [poleX, 2.64, -0.35], P.yellow, { aoAmt: 0 });
  if (hi) {
    // little candy cones on a rack at the side
    for (let k = 0; k < 3; k++) {
      put(
        acc,
        new THREE.ConeGeometry(0.06, 0.2, 5),
        [0.5 + k * 0.0, 1.1, 0.18 - k * 0.18],
        P.white,
        { q: qEuler(Math.PI, 0, 0), aoAmt: 0 },
      );
      fluff(0.5, 1.28, 0.18 - k * 0.18, 0.1, k === 1 ? P.sky : P.pink, 4 + k);
    }
  }
  const g = done(acc, rng);
  addHook(g, 'handle', { at: [0, 0.9, -1.0] });
  return addHook(g, 'drum', { at: [0, 1.4, 0], r: 0.46 });
}

/* =============================== variant wrapper =============================== */

/** TESTED board variant index on `checklistBoard`; cotton-candy cart variant index on `inspectionBooth`. */
export const COASTER_VARIANTS = { checklistBoard: 2, inspectionBooth: 1 } as const;

/** Adds the two variants of old defs (the TESTED board, the cotton-candy cart). */
export function withCoasterKit(def: PropGeoDef): PropGeoDef {
  const first = COASTER_VARIANTS[def.id as keyof typeof COASTER_VARIANTS];
  if (first === undefined) return def;
  if (def.variants !== first)
    throw new Error(`coaster kit: ${def.id} has ${def.variants} variants, want ${first}`);
  const own = def.heights ?? Array.from({ length: def.variants }, () => def.height);
  const add: PropBuilder = def.id === 'checklistBoard' ? testedBoard : cottonCart;
  const build: PropBuilder = (o) => (o.variant === first ? add(o) : def.build(o));
  return {
    ...def,
    variants: def.variants + 1,
    heights: [...own, def.id === 'checklistBoard' ? 2.5 : 2.7],
    build,
  };
}

/* ================================== registry ================================== */

export const QA_COASTER_GEO: readonly PropGeoDef[] = [
  {
    id: 'coasterTrack',
    variants: 1,
    build: coasterTrackDef,
    footprint: 45,
    height: 14,
    windy: false,
  },
  {
    id: 'coasterStation',
    variants: 1,
    build: station,
    footprint: F.station.footprint,
    height: F.station.postH + F.station.roofRise + 0.4,
    windy: false,
  },
  // mover meshes (no PropDef)
  {
    id: 'coasterCar',
    variants: 2,
    build: car,
    footprint: F.car.footprint,
    height: 1.3,
    windy: false,
  },
  {
    id: 'coasterRider',
    variants: 3,
    build: rider,
    footprint: F.rider.footprint,
    height: F.rider.height,
    windy: false,
  },
  {
    id: 'bumperCar',
    variants: 3,
    build: bumper,
    footprint: F.bumper.footprint,
    height: 1.9,
    windy: false,
  },
];
