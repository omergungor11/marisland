/**
 * Marketing quick-win variants (M22 TASK-481, ART_BIBLE §11 "Beacon Rock" night): geometry only,
 * placement in world/gen/plans/marketing.ts, numbers in content/themes/marketing.ts MARKETING_QUICK.
 * No new defs; each builder is one variant of an existing def (wired in geo/registry.ts and
 * geo/themes/marketing.ts):
 *
 *   bulbString       bunting v4        two poles and a sagging cable of chasing marquee bulbs (M5)
 *   transmitterMast  antennaTower v1   short red / white lattice, dish, whip, blinking red tip (M2)
 *   chainBuoy        adBuoy v2        striped float, blinking lamp mast, a rope to the next buoy (M17)
 *   pontoon          sailboat v5       flat party raft: bulb rails, DJ booth, streamer mast (M8)
 *
 * Marquee bulbs carry the `marquee` surface tag and the lamps the `beacon` tag, LOD0 only (a tagged
 * LOD1 would keep its group out of the far merge, D-049). Pivots on the ground (floating props: the
 * waterline); 1 u = 1 m.
 */
import * as THREE from 'three';
import { EMISSIVE, FLOWERS, ROCK, WOOD } from '../../content/palette.ts';
import { MARKETING_QUICK as Q, MEDIA_ROCK } from '../../content/themes/marketing.ts';
import { THEMES } from '../../content/themes.ts';
import { Acc, col, qFromTo } from '../kit.ts';
import { dish } from '../office-kit.ts';
import { V, baseBox, cylB, put, ropePoints, tubeAlong } from '../parts.ts';
import type { BuildOpts } from '../types.ts';
import { accVerts } from './coding.ts';
import { addGlyph } from './glyphs.ts';
import { stripedBuoy } from './hq.ts';
import { tagBeacon, tagBob, tagMarquee } from './surface-tags.ts';
import { beam } from './culture-hq.ts';

const K = MEDIA_ROCK.colors;
const RED = K.accent;
const CREAM = K.cream;
const GOLD = K.gold;
const DARK = K.bezel;
const STEEL = K.steel;
const AMBER = EMISSIVE.lantern;
const PINK = FLOWERS[0];
const ROPE = '#D9C3A0';
const lit = { emissive: 1, aoAmt: 0, ao: () => 1 } as const;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const BULB_COLORS = [AMBER, CREAM, PINK] as const;

/** Lit bulb (emissive 1): an octahedron at LOD0 detail, a tetrahedron where `small`. */
function bulb(
  acc: Acc,
  at: THREE.Vector3,
  r: number,
  color: string,
  o: { small?: boolean; windAbs?: number } = {},
): void {
  const g = o.small
    ? new THREE.TetrahedronGeometry(r * 1.25, 0)
    : new THREE.OctahedronGeometry(r, 0);
  put(acc, g, at, color, { ...lit, ...(o.windAbs !== undefined ? { windAbs: o.windAbs } : {}) });
}

/* ------------------------------ bulbString (bunting v4) ------------------------------ */

/**
 * Marquee bulb string across the boulevard: two dark poles with gold finials, a cable sagging
 * `sag` between them (poles at ± `poleX`, = the bunting span) and `bulbs` chasing bulbs hanging
 * from it (alternating amber / cream / pink). LOD1: poles, one cable slab, three bulbs.
 */
export function bulbString({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const B = Q.bulbString;
  const hi = lod === 0;
  const acc = new Acc();
  const px = B.poleX;
  const top = B.poleH - 0.12;
  for (const s of [-1, 1]) {
    put(acc, cylB(0.07, 0.055, B.poleH, hi ? 6 : 4), [s * px, 0, 0], DARK, { aoAmt: 0.2 });
    if (hi) {
      put(acc, baseBox(0.34, 0.1, 0.34), [s * px, 0, 0], ROCK[1], { aoAmt: 0.2 });
      put(acc, new THREE.IcosahedronGeometry(0.1, 0), [s * px, B.poleH + 0.06, 0], GOLD, {
        aoAmt: 0,
      });
    }
  }
  // the span flutters mid-way, never at the poles
  const sway = (p: THREE.Vector3): number => B.wind * clamp01(1 - (p.x / px) ** 2);
  const a = V(-px, top, 0);
  const b = V(px, top, 0);
  const at = (t: number): THREE.Vector3 => V(-px + 2 * px * t, top - B.sag * 4 * t * (1 - t), 0);
  if (!hi) {
    put(acc, new THREE.BoxGeometry(2 * px, 0.05, 0.05), [0, top - B.sag * 0.78, 0], DARK, {
      aoAmt: 0,
    });
    for (const t of [0.2, 0.5, 0.8]) bulb(acc, at(t).setY(at(t).y - 0.1), 0.12, AMBER);
    return acc.finish(rng, false, true);
  }
  put(acc, tubeAlong(ropePoints(a, b, B.sag, 10), 0.02, 3), [0, 0, 0], DARK, {
    aoAmt: 0,
    windAbs: sway,
  });
  const chase: THREE.Vector3[] = [];
  for (let i = 0; i < B.bulbs; i++) {
    const p = at((i + 0.5) / B.bulbs);
    p.y -= 0.09;
    bulb(acc, p, B.bulbR, BULB_COLORS[i % BULB_COLORS.length], { windAbs: sway(p) });
    chase.push(p);
  }
  const g = acc.finish(rng, false, true);
  tagMarquee(g, chase, B.bulbR * 1.4);
  return g;
}

/* --------------------------- transmitterMast (antennaTower v1) --------------------------- */

/**
 * Sea-stack transmitter: a stone plinth, a four-legged lattice in red / white bands (X-braces at
 * LOD0), a platform with a dish and a drum, a whip mast and the red tip lamp that blinks
 * (`beacon` tag, LOD0). Short enough for a 6 u rock top (`transmitter.height`).
 */
export function transmitterMast(
  { rng, lod }: BuildOpts,
  T: { height: number; foot: number; top: number } = Q.transmitter,
  /** TASK-517 (antennaTower v2): guy wires and the tip-lamp hook, added before the geometry is finished. */
  extras?: (acc: Acc, H: number) => void,
): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = new Acc();
  const H = T.height;
  const half = (y: number): number => T.foot + (T.top - T.foot) * (y / H);
  put(acc, baseBox(2.0, 0.28, 2.0), [0, 0, 0], ROCK[0], { aoAmt: 0.2 });
  const bands = (p: THREE.Vector3): THREE.Color =>
    col(Math.floor((p.y / H) * 6) % 2 === 0 ? RED : CREAM);
  const corners = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ] as const;
  for (const [sx, sz] of corners) {
    const a = V(sx * T.foot, 0.28, sz * T.foot);
    const b = V(sx * T.top, H, sz * T.top);
    const d = b.clone().sub(a);
    put(acc, baseBox(0.13, d.length(), 0.13), a, bands, { q: qFromTo(V(0, 1, 0), d), aoAmt: 0.05 });
  }
  if (hi) {
    const bays = 5;
    for (let k = 0; k < bays; k++) {
      const y0 = 0.28 + (k * (H - 0.28)) / bays;
      const y1 = 0.28 + ((k + 1) * (H - 0.28)) / bays;
      for (let f = 0; f < 4; f++) {
        const [ax, az] = corners[f];
        const [bx, bz] = corners[(f + 1) % 4];
        const p = (x: number, z: number, y: number): THREE.Vector3 =>
          V(x * half(y), y, z * half(y));
        const c = k % 2 === 0 ? CREAM : RED;
        beam(acc, p(ax, az, y0), p(bx, bz, y1), 0.045, c);
        beam(acc, p(bx, bz, y0), p(ax, az, y1), 0.045, c);
      }
    }
  }
  // platform with a dish and a drum antenna
  const py = H * 0.62;
  const pw = half(py) * 2 + 0.7;
  put(acc, baseBox(pw, 0.12, pw), [0, py, 0], STEEL, { aoAmt: 0.05 });
  dish(acc, V(Math.sin(0.5) * (pw / 2 - 0.2), py + 0.12, Math.cos(0.5) * (pw / 2 - 0.2)), {
    r: 0.5,
    yaw: 0.5,
    elev: 0.3,
    color: CREAM,
    mast: 0.12,
    lod,
  });
  if (hi)
    put(acc, cylB(0.12, 0.12, 0.7, 7), [-(pw / 2 - 0.2), py + 0.12, -0.2], CREAM, { aoAmt: 0.05 });
  // equipment cabinet at the foot
  put(acc, baseBox(0.9, 0.8, 0.6), [0.55, 0.28, 0.55], CREAM, { aoAmt: 0.15 });
  put(acc, baseBox(1.0, 0.1, 0.7), [0.55, 1.08, 0.55], RED, { aoAmt: 0 });
  // whip mast and the blinking red tip lamp
  put(acc, cylB(0.07, 0.04, 1.5, hi ? 5 : 4, true), [0, H, 0], STEEL, { aoAmt: 0 });
  const first = accVerts(acc);
  put(acc, new THREE.IcosahedronGeometry(hi ? 0.17 : 0.2, 0), [0, H + 1.55, 0], K.redLamp, lit);
  const count = accVerts(acc) - first;
  extras?.(acc, H);
  const g = acc.finish(rng, false, true);
  if (hi) tagBeacon(g, { first, count });
  return g;
}

/* -------------------------------- chainBuoy (adBuoy v2) -------------------------------- */

/**
 * Lit ad buoy of the bay-mouth chain: a striped coral / cream float, a ring,
 * a short mast with a lantern whose lamp blinks, and a rope `buoyChain.spacing` u long along local
 * +z to the next buoy (the planner turns each buoy toward its neighbour). Pivot = water level.
 */
export function chainBuoy({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const C = Q.buoyChain;
  const hi = lod === 0;
  const acc = new Acc();
  stripedBuoy(acc, V(0, 0, 0), 0.34, 0.4, RED, CREAM, lod, 5);
  put(acc, cylB(0.04, 0.035, 0.85, 4, true), [0, 1.0, 0], STEEL, { aoAmt: 0 });
  if (hi) {
    put(acc, new THREE.TorusGeometry(0.36, 0.05, 4, 12), [0, 0.5, 0], STEEL, {
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
      aoAmt: 0,
    });
    // lantern cage: cap over the lamp
    put(acc, new THREE.ConeGeometry(0.17, 0.16, 5), [0, 2.0, 0], DARK, { aoAmt: 0 });
  }
  const first = accVerts(acc);
  put(acc, new THREE.IcosahedronGeometry(hi ? 0.11 : 0.15, 0), [0, 1.9, 0], AMBER, lit);
  const count = accVerts(acc) - first;
  const R = C.rope;
  const s = C.spacing;
  if (!hi) {
    // far: the rope as one thin slab (the silhouette and the mean colour stay those of LOD0)
    put(acc, new THREE.BoxGeometry(0.06, 0.05, s - 0.7), [0, R.y - R.sag * 0.7, s / 2], ROPE, {
      aoAmt: 0,
    });
  } else {
    // the rope to the next buoy, with three lit beads
    const p0 = V(0, R.y, 0.36);
    const p1 = V(0, R.y, s - 0.36);
    put(acc, tubeAlong(ropePoints(p0, p1, R.sag, 8), R.r, 3), [0, 0, 0], ROPE, { aoAmt: 0 });
    for (const t of [0.25, 0.5, 0.75])
      bulb(acc, V(0, R.y - R.sag * 4 * t * (1 - t) - 0.05, 0.36 + (s - 0.72) * t), 0.045, AMBER, {
        small: true,
      });
  }
  const g = acc.finish(rng, false, true);
  if (hi) {
    tagBeacon(g, { first, count });
    tagBob(g);
  }
  return g;
}

/* -------------------------------- pontoon (sailboat v5) -------------------------------- */

/** The raft's plan outline (x across, z along; bow +z): a chamfered rectangle. */
function outline(w: number, l: number): THREE.Vector2[] {
  const hw = w / 2;
  const hl = l / 2;
  return [
    new THREE.Vector2(-hw, -hl + 0.6),
    new THREE.Vector2(-hw, hl - 1.1),
    new THREE.Vector2(-hw + 0.8, hl),
    new THREE.Vector2(hw - 0.8, hl),
    new THREE.Vector2(hw, hl - 1.1),
    new THREE.Vector2(hw, -hl + 0.6),
    new THREE.Vector2(hw - 0.5, -hl),
    new THREE.Vector2(-hw + 0.5, -hl),
  ];
}

/**
 * Party pontoon: a flat raft (cream hull, coral waterline, plank deck), a rail of bulb strings
 * round the deck on eight posts (the bulbs chase round it), a DJ booth with a megaphone plaque at
 * the stern, a mast with streamers and a gold star lamp. It bobs (FLOAT_BOB) as a whole. Bow +z,
 * deck at y = 0.7 above the waterline (the keel at y = 0, like every boat). LOD1: hull, booth slab, mast, four lamps.
 */
export function pontoon({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const P = Q.pontoon;
  const hi = lod === 0;
  const acc = new Acc();
  const deck = 0.7;
  const poly = outline(P.w, P.l);
  // two extrusions (a cream topsides band over a coral waterline band) keep every side quad one
  // colour; the cap of the upper one is the plank deck
  const shape = new THREE.Shape(poly);
  const ext = (depth: number): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).rotateX(Math.PI / 2);
  put(acc, ext(0.4), [0, deck, 0], (p) => col(p.y > deck - 0.02 ? WOOD.planks : CREAM), {
    aoAmt: 0.1,
  });
  put(acc, ext(0.3), [0, deck - 0.4, 0], RED, { aoAmt: 0.25 });
  // booth + speakers at the stern, mast amidships
  const bz = -P.l / 2 + 1.0;
  put(acc, baseBox(1.6, 0.75, 0.8), [0, deck, bz], DARK, { aoAmt: 0.15 });
  put(acc, baseBox(1.8, 0.1, 1.0), [0, deck + 0.75, bz], CREAM, { aoAmt: 0 });
  const mz = 0.5;
  put(acc, cylB(0.06, 0.045, 3.3, hi ? 5 : 4), [0, deck, mz], STEEL, { aoAmt: 0.1 });
  if (!hi) {
    for (const [x, z] of [
      [-1.2, 1.2],
      [1.2, 1.2],
      [-1.2, -1.2],
      [1.2, -1.2],
    ])
      bulb(acc, V(x, deck + 1.1, z), 0.12, AMBER);
    bulb(acc, V(0, deck + 3.4, mz), 0.2, GOLD);
    return acc.finish(rng, false, true);
  }
  for (const sx of [-1, 1]) {
    put(acc, baseBox(0.3, 0.55, 0.28), [sx * 0.95, deck, bz + 0.1], DARK, { aoAmt: 0.1 });
    put(acc, cylB(0.09, 0.09, 0.05, 6), [sx * 0.95, deck + 0.3, bz + 0.25], STEEL, {
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
      aoAmt: 0,
    });
  }
  addGlyph(acc, 'megaphone', V(0, deck + 0.18, bz + 0.42), {
    size: 0.4,
    color: GOLD,
    depth: 0.05,
  });
  // gold star lamp on the mast top, streamers hanging from a cross arm
  put(acc, new THREE.IcosahedronGeometry(0.16, 0), [0, deck + 3.4, mz], GOLD, lit);
  put(acc, baseBox(1.1, 0.05, 0.05), [0, deck + 3.0, mz], STEEL, { aoAmt: 0 });
  const ribbons = [RED, GOLD, K.sky, K.mint, K.lilac, THEMES.marketing.accent];
  ribbons.forEach((c, i) => {
    const x = -0.5 + (i / (ribbons.length - 1)) * 1.0;
    const len = 0.9 + 0.2 * ((i * 7) % 3);
    const g = new THREE.PlaneGeometry(0.1, len).translate(0, -len / 2, 0);
    put(acc, g, [x, deck + 3.0, mz], c, {
      double: true,
      aoAmt: 0,
      ao: () => 1,
      windAbs: (p) => clamp01(0.15 + 0.85 * ((deck + 3.0 - p.y) / len)) * 0.9,
    });
  });
  // the rail: eight posts at the outline corners (inset), bulb strings between them
  const inset = 0.16;
  const posts = poly.map((p) => {
    const m = Math.hypot(p.x, p.y) || 1;
    return V(p.x - (p.x / m) * inset, deck, p.y - (p.y / m) * inset);
  });
  const railH = 1.1;
  for (const p of posts) put(acc, cylB(0.04, 0.035, railH, 4), p, STEEL, { aoAmt: 0.1 });
  const chase: THREE.Vector3[] = [];
  for (let k = 0; k < posts.length; k++) {
    const a = posts[k].clone().setY(deck + railH - 0.05);
    const b = posts[(k + 1) % posts.length].clone().setY(deck + railH - 0.05);
    const len = a.distanceTo(b);
    const sag = Math.min(0.32, 0.07 * len);
    put(acc, tubeAlong(ropePoints(a, b, sag, 4), 0.014, 3), [0, 0, 0], DARK, { aoAmt: 0 });
    const n = Math.max(2, Math.round(len / 0.5));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = a.clone().lerp(b, t);
      p.y -= sag * 4 * t * (1 - t) + 0.06;
      bulb(acc, p, 0.045, BULB_COLORS[(i + k) % BULB_COLORS.length], { small: true });
      chase.push(p);
    }
  }
  const g = acc.finish(rng, false, true);
  tagMarquee(g, chase, 0.06);
  tagBob(g);
  return g;
}
