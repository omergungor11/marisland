import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng } from '../core/rng.ts';
import { SKY_CRAFT as C } from '../content/sky-craft.ts';
import { CULTURES, type PennantCut } from '../content/cultures/index.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';
import { Acc, col, frustum, qEuler, type PartOpts } from './kit.ts';
import { Spin, finishSpin } from './office-kit.ts';
import { baseBox, bevBox, lathe, put, ropePoints, TAU, tubeAlong, V } from './parts.ts';
import { SIGN_THICK, cutShape } from './themes/signage.ts';
import { GLYPH_OF_THEME, addGlyph } from './themes/glyphs.ts';

/**
 * Sky craft, steampunk (TASK-404): patched-gore hot-air balloons with brass hoops, rope seams, a
 * wicker basket and a burner flame; a riveted airship with rib bands, a lit gondola, boiler and
 * exhaust stacks, braced tail fins and three spinning propellers (`aSpin`, hub axis z).
 * All sizes / colours / segment counts live in content/sky-craft.ts.
 */

type Col = THREE.Color | string;
const toCol = (c: Col): THREE.Color => (typeof c === 'string' ? col(c) : c);

/** Thin rod between two points (open tube: 2 * radial tris). */
function bar(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  color: Col,
  radial = 4,
  o: Partial<PartOpts> = {},
): void {
  const { geo, m } = frustum(a, b, r, r, radial, true);
  acc.add(geo, { windMul: 0, aoAmt: 0, ...o, color: toCol(color), m });
}

/** Tapered tube (stack, pod, tank) between two points, capped. */
function taper(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r0: number,
  r1: number,
  radial: number,
  color: Col,
  o: Partial<PartOpts> = {},
): void {
  const { geo, m } = frustum(a, b, r0, r1, radial, false);
  acc.add(geo, { windMul: 0, aoAmt: 0.12, ...o, color: toCol(color), m });
}

/** Torus ring; `axis` y lays it flat, z leaves it in the xy plane. */
function ring(
  acc: Acc,
  at: THREE.Vector3,
  R: number,
  r: number,
  tubular: number,
  radial: number,
  axis: 'y' | 'z',
  color: Col,
  o: Partial<PartOpts> = {},
): void {
  const geo = new THREE.TorusGeometry(R, r, radial, tubular);
  if (axis === 'y') geo.rotateX(Math.PI / 2);
  acc.add(geo, {
    windMul: 0,
    aoAmt: 0,
    ...o,
    color: toCol(color),
    m: new THREE.Matrix4().makeTranslation(at.x, at.y, at.z),
  });
}

/** Warm brightness lift baked into the shaded side (the lit program's hemisphere fill goes blue-grey there). */
function lift(c: THREE.Color, k: number): THREE.Color {
  // the shade is blue: cancel it by pulling blue / green down in the albedo (red stays)
  return new THREE.Color(
    Math.min(1, c.r * (1 + 0.1 * k)),
    c.g * (1 + 0.1 * k),
    c.b * (1 - 0.62 * k),
  );
}

const tetra = (r: number): THREE.BufferGeometry => new THREE.TetrahedronGeometry(r, 0);
const octa = (r: number): THREE.BufferGeometry => new THREE.OctahedronGeometry(r, 0);

/** Place a small solid at `at`, optionally rotated. */
function stud(
  acc: Acc,
  geo: THREE.BufferGeometry,
  at: THREE.Vector3,
  color: Col,
  q?: THREE.Quaternion,
): void {
  const m = new THREE.Matrix4().compose(at, q ?? new THREE.Quaternion(), V(1, 1, 1));
  acc.add(geo, { windMul: 0, aoAmt: 0, color: toCol(color), m });
}

/** Hang length (u) of a culture pennant cut drawn at `w` x `h` (mirrors signage pennantLine). */
function pennantHang(cut: PennantCut, w: number, h: number): number {
  return cut === 'streamer' ? h * 1.55 : cut === 'kite' ? h * 1.05 : cut === 'square' ? w : h;
}

interface PennantOpts {
  theme: ThemeId;
  /** Hoist (top edge) centre. */
  at: THREE.Vector3;
  w: number;
  h: number;
  /** Emblem on both faces: size (u) and position along the hang (fraction); null = none. */
  glyph: { size: number; at: number } | null;
}

/**
 * Culture pennant slab (cut + accent + emblem on both faces). Flag mode `dir` = +-1 trails along
 * +-x (the cut's hanging axis turned about z; emblem stays upright); dir 0 hangs down (-y) facing
 * +-x (tail string). Wind ramps from the hoist (steady) to the fly (flutters).
 */
function culturePennant(acc: Acc, o: PennantOpts, dir: -1 | 0 | 1): void {
  const P = CULTURES[o.theme].pennant;
  const hang = pennantHang(P.cut, o.w, o.h);
  const slab = new THREE.ExtrudeGeometry(cutShape(P.cut, o.w, o.h, false), {
    depth: SIGN_THICK,
    bevelEnabled: false,
    curveSegments: 1,
  }).translate(0, 0, -SIGN_THICK / 2);
  const yaw = dir === 0 ? Math.PI / 2 : 0;
  const q = dir === 0 ? qEuler(0, yaw, 0) : qEuler(0, 0, (dir * Math.PI) / 2);
  const wind =
    dir === 0
      ? (p: THREE.Vector3): number => 0.1 + 0.6 * Math.min(1, Math.max(0, (o.at.y - p.y) / hang))
      : (p: THREE.Vector3): number =>
          0.05 + 0.5 * Math.min(1, Math.max(0, Math.abs(p.x - o.at.x) / hang));
  // Balloon flags carry no wind weight: the fleet is anchor-relative (4096 u off), and the lit
  // program's gust squash scales x/z about the object origin, which would smear any wind-weighted
  // vertex tens of units across the sky (W11 streaks). Only the tail string (true origin) sways.
  // flags face +-z / +-x, away from the sun for most of the day: the flank shade would turn warm
  // accents maroon, so the baked colour is lightened a touch (hue kept)
  const hsl = { h: 0, s: 0, l: 0 };
  col(P.accent).getHSL(hsl);
  const flag = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(0.8, hsl.l * C.fleet.flagLift));
  put(acc, slab, o.at, flag, { q, aoAmt: 0, ao: () => 1, ...(dir === 0 ? { windAbs: wind } : {}) });
  if (!o.glyph || P.cut === 'streamer') return;
  const g =
    dir === 0
      ? V(o.at.x, o.at.y - hang * o.glyph.at, o.at.z)
      : V(o.at.x + dir * hang * o.glyph.at, o.at.y, o.at.z);
  const T = SIGN_THICK / 2;
  const opt = { size: o.glyph.size, color: C.fleet.cream, depth: 0.04 };
  for (const side of [1, -1]) {
    // front faces +z (flag) / +x (string), the back one the opposite way
    const base = dir === 0 ? Math.PI / 2 : 0;
    const off = dir === 0 ? V(side * T, 0, 0) : V(0, 0, side * T);
    addGlyph(acc, GLYPH_OF_THEME[o.theme], g.clone().add(off), {
      ...opt,
      q: qEuler(0, base + (side === 1 ? 0 : Math.PI), 0),
    });
  }
}

/** Hype Fleet livery of one balloon (TASK-441): its culture and the culture of its secondary gores. */
export interface BalloonLivery {
  theme: ThemeId;
  alt: ThemeId;
}

// ---------------------------------------------------------------------------------------------
// Balloon
// ---------------------------------------------------------------------------------------------

/** Control points (radius, y) of the envelope; sampled through a smooth spline. */
const ENVELOPE: Array<[number, number]> = [
  [0.95, -6.0],
  [2.2, -5.0],
  [3.6, -3.6],
  [4.6, -1.8],
  [4.9, 0.4],
  [4.4, 2.8],
  [3.2, 4.8],
  [1.6, 6.0],
  [0.001, 6.5],
];

/**
 * Hot-air balloon, pivot at the envelope centre (envelope y −6 … +6.5, ≈ 10 u across, basket at
 * y ≈ −9.3). Patched pastel gores, rope seams, brass hoops with rivets, load ring on eight lines,
 * brass burner with an emissive flame, wicker basket with sandbags and a copper-piped fuel tank.
 */
export function buildBalloonGeometry(lod = 0, livery?: BalloonLivery): THREE.BufferGeometry {
  const B = C.balloon;
  const acc = new Acc();
  const gores = lod > 0 ? B.goresLod : B.gores;
  const rings = lod > 0 ? B.ringsLod : B.rings;
  const fine = lod === 0;

  const curve = new THREE.SplineCurve(ENVELOPE.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getSpacedPoints(rings);
  const profile: Array<[number, number]> = pts.map((p, i) => [
    i === rings ? 0.001 : Math.max(0.001, p.x),
    p.y,
  ]);
  const ys = profile.map((p) => p[1]);
  const envR = (y: number): number => {
    for (let i = 0; i < profile.length - 1; i++) {
      if (y >= ys[i] && y <= ys[i + 1]) {
        const t = (y - ys[i]) / (ys[i + 1] - ys[i] || 1);
        return profile[i][0] + (profile[i + 1][0] - profile[i][0]) * t;
      }
    }
    return 0.001;
  };

  // patched fabric: a few (gore, row-band) cells become a darker patch; every cell gets a small
  // lightness offset so the quads read as cloth panels (no per-triangle jitter: `noJitter`)
  let stripes = C.stripes.map(col);
  let patches = B.patches.map(col);
  if (livery) {
    // Hype Fleet: dominant culture accent, cream, and the next member's accent; patches are darker
    // cuts of the same fabrics
    const F = C.fleet;
    // fabric = the accent eased toward cream (the pennants keep the pure accent)
    const fabric = (t: ThemeId): THREE.Color =>
      col(CULTURES[t].pennant.accent).lerp(col(F.cream), F.fabricMix);
    const dom = fabric(livery.theme);
    const alt = fabric(livery.alt);
    const cream = col(F.cream);
    const dark = (c: THREE.Color): THREE.Color => {
      const h = { h: 0, s: 0, l: 0 };
      c.getHSL(h);
      return new THREE.Color().setHSL(h.h, h.s, h.l * F.patchDark);
    };
    const pick = { d: dom, c: cream, a: alt };
    stripes = F.pattern.map((k) => pick[k]);
    patches = [dark(dom), dark(alt), dark(cream)];
  }
  const trim = col(C.trim);
  const pr = createRng(7).fork('balloon-patch');
  const bands = Math.ceil(rings / B.patchRows);
  const cells: THREE.Color[] = [];
  for (let g = 0; g < gores; g++)
    for (let b = 0; b < bands; b++) {
      const r = pr.fork('cell', g * 64 + b);
      const base =
        r.range(0, 1) < B.patchChance
          ? patches[Math.floor(r.range(0, patches.length))]
          : stripes[g % stripes.length];
      const c = base.clone();
      const hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      cells.push(c.setHSL(hsl.h, hsl.s, Math.min(0.95, hsl.l + r.range(-0.035, 0.035))));
    }
  put(
    acc,
    lathe(profile, gores),
    [0, 0, 0],
    (p) => {
      if (p.y < -4.4) return trim;
      const g = Math.floor((((Math.atan2(p.x, p.z) + TAU) % TAU) / TAU) * gores) % gores;
      let ri = 0;
      while (ri < rings - 1 && p.y > ys[ri + 1]) ri++;
      const ym = (ys[ri] + ys[ri + 1]) / 2; // ring-cell middle: both triangles of a quad agree
      const k = Math.min(1, Math.max(0, (1.5 - ym) / 6));
      const cell = cells[g * bands + Math.floor(ri / B.patchRows)];
      if (!livery) return lift(cell, k);
      // culture accents: the warm lift only where the colour is warm (cool accents would turn
      // green), plus a fixed lift because the envelope's flanks sit in the blue hemisphere fill
      const warm = Math.min(1, Math.max(0, (cell.r - cell.b) * 2));
      return lift(cell, (0.65 + 0.35 * k) * warm);
    },
    { aoAmt: 0.06, noJitter: true },
  );

  // rope seams along every gore boundary, brass hoops + rivets studded on them
  if (B.seamEvery > 0 && fine) {
    const seam: THREE.Vector3[][] = [];
    for (let g = 0; g < gores; g += B.seamEvery) {
      const phi = (g * TAU) / gores;
      const line: THREE.Vector3[] = [];
      for (let i = 1; i < rings; i += 1) {
        const [r, y] = profile[i];
        line.push(V(Math.sin(phi) * (r + 0.05), y, Math.cos(phi) * (r + 0.05)));
      }
      seam.push(line);
    }
    for (const line of seam)
      for (let i = 0; i < line.length - 1; i++) bar(acc, line[i], line[i + 1], 0.055, B.thread, 3);
  }
  for (const hy of B.hoops) {
    const hr = envR(hy) + 0.07;
    ring(acc, V(0, hy, 0), hr, 0.15, gores, 4, 'y', C.brass);
    if (fine)
      for (let k = 0; k < B.rivetsPerHoop; k++) {
        const phi = (k * TAU) / B.rivetsPerHoop;
        stud(
          acc,
          octa(0.2),
          V(Math.sin(phi) * (hr + 0.04), hy, Math.cos(phi) * (hr + 0.04)),
          C.brass,
        );
      }
  }
  // mouth collar, crown cap and vent
  ring(acc, V(0, -5.95, 0), 0.98, 0.1, gores, 3, 'y', C.brass);
  taper(acc, V(0, 6.35, 0), V(0, 6.62, 0), 0.5, 0.42, 8, C.brass);
  taper(acc, V(0, 6.62, 0), V(0, 6.95, 0), 0.16, 0.0, 6, C.copper);
  ring(acc, V(0, 6.4, 0), 0.52, 0.06, 8, 3, 'y', C.copper);

  // load ring on eight lines up to the skirt
  const lr = 1.05;
  const ly = -6.95;
  ring(acc, V(0, ly, 0), lr, 0.075, 12, 4, 'y', C.brass);
  for (let k = 0; k < 8; k++) {
    const a = (k * TAU) / 8;
    const ey = -4.7;
    const er = envR(ey);
    bar(
      acc,
      V(Math.sin(a) * lr, ly, Math.cos(a) * lr),
      V(Math.sin(a) * er, ey, Math.cos(a) * er),
      0.035,
      C.rope,
      3,
    );
  }

  // burner: crossbars between opposite poles, coil, flame (night glow)
  const rimY = -8.6;
  const rimR = 0.98;
  const posts: THREE.Vector3[] = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * TAU) / 4;
    const top = V(Math.sin(a) * lr, ly, Math.cos(a) * lr);
    const bot = V(Math.sin(a) * rimR, rimY, Math.cos(a) * rimR);
    posts.push(bot);
    bar(acc, bot, top, 0.055, C.copper, 5);
  }
  bar(acc, V(posts[0].x, -7.45, posts[0].z), V(posts[2].x, -7.45, posts[2].z), 0.05, C.brass, 4);
  bar(acc, V(posts[1].x, -7.45, posts[1].z), V(posts[3].x, -7.45, posts[3].z), 0.05, C.brass, 4);
  taper(acc, V(0, -7.55, 0), V(0, -7.1, 0), 0.26, 0.2, 8, C.brass);
  ring(acc, V(0, -7.1, 0), 0.24, 0.06, 8, 3, 'y', C.copper);
  put(acc, new THREE.ConeGeometry(0.34, 1.15, 6), [0, -6.45, 0], C.flame, {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
  put(acc, new THREE.ConeGeometry(0.17, 0.8, 5), [0, -6.62, 0], '#FFF1C2', {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });

  // wicker basket: octagonal frustum with woven bands, rim roll, leather pads
  const wk = B.wicker.map(col);
  const botY = -10.0;
  const bg = new THREE.CylinderGeometry(rimR, 0.8, rimY - botY, 8, fine ? 5 : 2, false).translate(
    0,
    (rimY + botY) / 2,
    0,
  );
  put(
    acc,
    bg,
    [0, 0, 0],
    (p) => {
      const j = Math.floor((((Math.atan2(p.x, p.z) + TAU) % TAU) / TAU) * 8);
      return wk[(Math.floor((p.y - botY) / 0.28) + j) & 1];
    },
    { aoAmt: 0.1 },
  );
  ring(acc, V(0, rimY, 0), rimR * 0.97, 0.1, 8, 4, 'y', wk[0]);
  if (fine) {
    ring(acc, V(0, -9.15, 0), 0.9, 0.05, 8, 3, 'y', wk[1]);
    ring(acc, V(0, -9.65, 0), 0.85, 0.05, 8, 3, 'y', wk[1]);
  }
  for (const p of posts) {
    const q = qEuler(0, Math.atan2(p.x, p.z), 0);
    put(acc, baseBox(0.22, 0.5, 0.22), [p.x * 1.03, rimY - 0.42, p.z * 1.03], B.leather, { q });
  }
  put(acc, baseBox(1.5, 0.08, 1.5), [0, botY - 0.02, 0], B.leather, { aoAmt: 0 });

  if (fine) {
    // sandbags hanging off the basket
    for (let k = 0; k < 4; k++) {
      const a = (k * TAU) / 4 + Math.PI / 8;
      const rr = 1.1;
      const sx = Math.sin(a) * rr;
      const sz = Math.cos(a) * rr;
      bar(acc, V(sx * 0.88, rimY - 0.05, sz * 0.88), V(sx, -9.3, sz), 0.03, C.rope, 3);
      put(acc, new THREE.SphereGeometry(0.27, 6, 4), [sx, -9.62, sz], B.sandbag[k & 1], {
        s: [1, 1.2, 1],
        aoAmt: 0.2,
      });
      put(acc, new THREE.ConeGeometry(0.1, 0.14, 5), [sx, -9.3, sz], B.sandbag[(k + 1) & 1], {
        aoAmt: 0,
      });
    }
    // fuel tank strapped on the outside, copper pipe up to the burner, gauge
    const ta = Math.PI * 0.375;
    const tx = Math.sin(ta) * 1.22;
    const tz = Math.cos(ta) * 1.22;
    taper(acc, V(tx, -9.9, tz), V(tx, -8.55, tz), 0.25, 0.25, 8, C.brass);
    taper(acc, V(tx, -8.55, tz), V(tx, -8.38, tz), 0.2, 0.08, 8, C.copper);
    bar(acc, V(tx, -8.38, tz), V(0.1, -7.5, 0.05), 0.05, C.copper, 4);
    acc.add(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 8).rotateX(Math.PI / 2), {
      windMul: 0,
      aoAmt: 0,
      color: col(C.iron),
      m: new THREE.Matrix4().compose(V(tx * 1.2, -9.3, tz * 1.2), qEuler(0, ta, 0), V(1, 1, 1)),
    });
  }
  if (livery) {
    // the culture pennant flies from a staff on each of two spars off the basket rim
    const F = C.fleet;
    const [r0, y0] = F.spar.from;
    const [r1, y1] = F.spar.to;
    const P = F.pennant;
    const mid = y1 + 0.2;
    for (const s of [1, -1] as const) {
      bar(acc, V(s * r0, y0, 0), V(s * r1, y1, 0), F.spar.r, C.brass, 4);
      bar(
        acc,
        V(s * r1, mid - P.w / 2 - 0.25, 0),
        V(s * r1, mid + P.w / 2 + 0.2, 0),
        0.07,
        C.brass,
        4,
      );
      stud(acc, octa(0.17), V(s * r1, mid + P.w / 2 + 0.3, 0), C.copper);
      culturePennant(
        acc,
        {
          theme: livery.theme,
          at: V(s * r1, mid, 0),
          w: P.w,
          h: P.h,
          glyph: fine ? { size: P.w * P.glyph, at: P.glyphAt } : null,
        },
        s,
      );
    }
  }
  return acc.finish(createRng(7).fork('balloon-faces'), false, true);
}

// ---------------------------------------------------------------------------------------------
// Airship
// ---------------------------------------------------------------------------------------------

const HULL_L = 13;
const HULL_R = 3.9;
/** Hull radius at z (tail slimmer than the nose). */
function hullR(z: number): number {
  const t = Math.max(-1, Math.min(1, z / HULL_L));
  return Math.max(0.001, HULL_R * Math.pow(1 - t * t, 0.55) * (t < 0 ? 1 + 0.12 * t : 1));
}
const hullPt = (z: number, ang: number, off = 0): THREE.Vector3 => {
  const r = hullR(z) + off;
  return V(Math.sin(ang) * r, Math.cos(ang) * r, z);
};

/** A flat propeller (blades in the xy plane at `hub`); parts are tagged for the aSpin path. */
function propeller(
  acc: Acc,
  spin: Spin,
  hub: THREE.Vector3,
  blades: number,
  len: number,
  color: Col,
  rot = 0,
): void {
  const tag = spin.tag(hub);
  for (let k = 0; k < blades; k++) {
    const q = qEuler(0, 0, rot + (k * TAU) / blades);
    const g = new THREE.BoxGeometry(len * 0.2, len, 0.07).translate(0, len / 2 + 0.12, 0);
    acc.add(g, {
      windMul: 0,
      aoAmt: 0,
      color: toCol(color),
      windAbs: tag,
      m: new THREE.Matrix4().compose(hub, q, V(1, 1, 1)),
    });
  }
  // hub cap spins with the blades (tiny, but keeps the fastening honest)
  acc.add(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 6).rotateX(Math.PI / 2), {
    windMul: 0,
    aoAmt: 0,
    color: col(C.copper),
    windAbs: tag,
    m: new THREE.Matrix4().makeTranslation(hub.x, hub.y, hub.z),
  });
}

/**
 * Airship, pivot at the hull centre, nose toward +z (hull 26 u long, 8 u across). Panelled cream
 * hull with colour bands, brass rib rings with rivets, a gondola with lit windows, boiler + angled
 * exhaust stacks, wire-braced tail fins, three spinning propellers (aSpin hubs on the z axis).
 */
export function buildAirshipGeometry(lod = 0): THREE.BufferGeometry {
  const A = C.airship;
  const acc = new Acc();
  const spin = new Spin();
  const fine = lod === 0;
  const radial = fine ? A.radial : A.radialLod;
  const stations = fine ? A.stations : A.stationsLod;
  const L = HULL_L;

  // hull: lathe about y rolled onto z (profile y = +L is the nose)
  const zs: number[] = [];
  const profile: Array<[number, number]> = [];
  for (let i = 0; i <= stations; i++) {
    const th = (1 - i / stations) * Math.PI; // tail → nose: ascending y keeps the lathe faces outward
    const z = L * Math.cos(th);
    zs.push(z);
    profile.push([i === 0 || i === stations ? 0.001 : hullR(z), z]);
  }
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const hull = col(A.hull);
  const panel = col(A.panel);
  const belly = col(A.belly);
  const band = col(A.band);
  const band2 = col(A.fins[1]);
  put(
    acc,
    lathe(profile, radial),
    [0, 0, 0],
    (p) => {
      // classify by the station cell (not the triangle centroid): both halves of a quad agree
      let zi = 0;
      while (zi < stations - 1 && p.z > zs[zi + 1]) zi++;
      const zc = (zs[zi] + zs[zi + 1]) / 2;
      const sec = Math.floor((((Math.atan2(p.x, p.y) + TAU) % TAU) / TAU) * radial);
      // 1 on the underside / lower flanks (sector middle), 0 on top: lifts the shaded half
      const k = Math.min(1, Math.max(0, 0.5 - Math.cos(((sec + 0.5) / radial) * TAU) * 0.7));
      if (Math.abs(zc - 2.2) < 1.3) return lift(band, k);
      if (Math.abs(zc + 7.2) < 0.8) return lift(band2, k);
      return lift((sec + zi) & 1 ? (k > 0.5 ? belly : panel) : hull, k);
    },
    { q, aoAmt: 0.08 },
  );

  // brass rib rings with rivets, longerons along top / bottom / flanks
  for (const f of A.ribs) {
    const z = f * L;
    const rr = hullR(z) + 0.05;
    ring(acc, V(0, 0, z), rr, 0.1, radial, 3, 'z', C.brass);
    if (fine)
      for (let k = 0; k < A.rivetsPerRib; k++) {
        const a = (k * TAU) / A.rivetsPerRib + Math.PI / A.rivetsPerRib;
        stud(acc, tetra(0.15), hullPt(z, a, 0.12), C.brass);
      }
  }
  if (fine)
    for (let k = 0; k < 4; k++) {
      const a = (k * TAU) / 4;
      for (let i = 1; i < stations - 2; i += 2) {
        bar(
          acc,
          hullPt(zs[i], a, 0.04),
          hullPt(zs[i + 2], a, 0.04),
          0.06,
          k % 2 ? C.copper : C.iron,
          3,
        );
      }
    }
  // nose cone with mooring ring, tail cap
  taper(acc, V(0, 0, L - 0.5), V(0, 0, L + 0.9), 0.7, 0.0, 8, C.brass);
  ring(acc, V(0, 0, L - 0.25), 0.7, 0.08, 8, 3, 'z', C.copper);
  taper(acc, V(0, 0, -L + 0.4), V(0, 0, -L - 0.9), 0.65, 0.18, 8, C.copper);

  // tail fins (convex slabs) with brass leading edges and wire bracing
  const tips: THREE.Vector3[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k * TAU) / 4;
    const fq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a);
    const local = (x: number, y: number, z: number): THREE.Vector3 =>
      V(x, y, z).applyQuaternion(fq);
    const pts = [
      local(-0.13, 1.7, -12.3),
      local(0.13, 1.7, -12.3),
      local(-0.13, 1.7, -7.9),
      local(0.13, 1.7, -7.9),
      local(-0.06, 5.7, -12.7),
      local(0.06, 5.7, -12.7),
      local(-0.06, 5.7, -10.7),
      local(0.06, 5.7, -10.7),
    ];
    acc.add(new ConvexGeometry(pts), {
      windMul: 0,
      aoAmt: 0.1,
      color: col(A.fins[k % 2]),
    });
    bar(acc, local(0, 1.7, -7.9), local(0, 5.7, -10.7), 0.07, C.brass, 4);
    bar(acc, local(0, 5.7, -12.7), local(0, 5.7, -10.7), 0.07, C.brass, 3);
    tips.push(local(0, 5.6, -11.6));
    if (fine) {
      // wire from the fin to the hull ahead of it
      bar(acc, local(0, 4.2, -10.8), local(0, 2.5, -6.8), 0.03, C.iron, 3);
    }
  }
  for (let k = 0; k < 4; k++) bar(acc, tips[k], tips[(k + 1) % 4], 0.045, C.iron, 3);
  if (fine) {
    bar(acc, tips[0], tips[2], 0.035, C.iron, 3);
    bar(acc, tips[1], tips[3], 0.035, C.iron, 3);
  }

  // gondola: chamfered cabin, roof rail, lit windows on both flanks and the front
  const gy = -5.95;
  const gz = 2.2;
  const gw = 2.5;
  const gl = 6.2;
  const gh = 1.7;
  const roof = gy + gh / 2;
  const planks = [col(A.cabin), col(A.cabin2)];
  put(
    acc,
    bevBox(gw, gh, gl, 0.3),
    [0, gy, gz],
    (p) => planks[Math.floor((p.y - gy + gh) / 0.28) & 1],
    { aoAmt: 0.05, ao: () => 1, noJitter: true },
  );
  put(acc, baseBox(gw + 0.22, 0.14, gl + 0.22), [0, roof - 0.04, gz], C.copper, { aoAmt: 0 });
  put(acc, baseBox(gw + 0.12, 0.12, gl + 0.12), [0, gy - gh / 2 - 0.1, gz], C.brass, { aoAmt: 0 });
  for (const sx of [-1, 1])
    for (let k = 0; k < 5; k++)
      windowAt3(
        acc,
        V(sx * (gw / 2 + 0.01), gy + 0.05, gz - 2.2 + k * 1.1),
        (sx * Math.PI) / 2,
        0.68,
        0.7,
      );
  for (const sx of [-0.6, 0.6]) windowAt3(acc, V(sx, gy + 0.05, gz + gl / 2 + 0.01), 0, 0.7, 0.7);
  if (fine) {
    // hanging struts up to the hull, rigging wires out to the flanks, roof ridge rail
    for (const sx of [-1, 1]) {
      for (const dz of [-2.4, 2.4]) {
        const z = gz + dz;
        bar(
          acc,
          V(sx * 1.0, roof + 0.1, z),
          hullPt(z, sx * (Math.PI - 0.4), 0.0),
          0.08,
          C.brass,
          4,
        );
      }
      for (const dz of [-2.6, 0, 2.6]) {
        const z = gz + dz;
        bar(acc, V(sx * 1.2, roof + 0.1, z), hullPt(z, sx * 1.9, 0.0), 0.03, C.rope, 3);
      }
    }
    bar(acc, V(0, roof + 0.2, gz - 2.6), V(0, roof + 0.2, gz + 2.6), 0.06, C.brass, 4);
  }

  // boiler under the tail half of the hull with angled exhaust stacks
  const by = -4.45;
  taper(acc, V(0, by, -5.4), V(0, by, -1.6), 0.55, 0.55, 10, C.brass);
  taper(acc, V(0, by, -1.6), V(0, by, -1.2), 0.55, 0.3, 10, C.copper);
  ring(acc, V(0, by, -4.4), 0.57, 0.06, 10, 3, 'z', C.copper);
  ring(acc, V(0, by, -2.6), 0.57, 0.06, 10, 3, 'z', C.copper);
  for (const sx of [-1, 1]) {
    const base = V(sx * 0.35, by + 0.45, -4.8);
    const top = V(sx * 2.7, -3.2, -4.8);
    bar(acc, base, top, 0.17, C.iron, 6);
    // flared cap, banded
    taper(acc, top, V(top.x + sx * 0.3, top.y + 0.38, top.z), 0.17, 0.33, 8, C.copper);
    ring(acc, base.clone().lerp(top, 0.5), 0.22, 0.06, 6, 3, 'z', C.brass, {});
    if (fine) bar(acc, V(sx * 0.5, by, -3.2), V(sx * 1.0, -3.55, -3.0), 0.05, C.copper, 3);
  }
  if (fine) {
    bar(acc, V(0, by + 0.55, -4.9), hullPt(-4.9, Math.PI, -0.1), 0.06, C.brass, 4);
    bar(acc, V(0, by + 0.55, -2.0), hullPt(-2.0, Math.PI, -0.1), 0.06, C.brass, 4);
    // pressure gauge on the boiler flank
    for (const sx of [-1, 1])
      acc.add(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 8).rotateZ(Math.PI / 2), {
        windMul: 0,
        aoAmt: 0,
        color: col(C.brass),
        m: new THREE.Matrix4().makeTranslation(sx * 0.58, by + 0.05, -3.6),
      });
  }

  // engine pods on outriggers (props face aft) + the tail propeller
  for (const sx of [-1, 1]) {
    const pod = V(sx * 5.6, -0.9, -4.4);
    bar(acc, hullPt(-3.6, sx * 1.75, -0.2), V(pod.x, pod.y + 0.1, -3.9), 0.1, C.brass, 4);
    bar(acc, hullPt(-5.4, sx * 1.75, -0.2), V(pod.x, pod.y + 0.1, -4.9), 0.1, C.brass, 4);
    taper(acc, V(pod.x, pod.y, -3.2), V(pod.x, pod.y, -5.2), 0.5, 0.42, 8, C.copper);
    taper(acc, V(pod.x, pod.y, -3.2), V(pod.x, pod.y, -2.5), 0.5, 0.0, 8, C.brass);
    ring(acc, V(pod.x, pod.y, -4.1), 0.52, 0.06, 8, 3, 'z', C.brass);
    propeller(acc, spin, V(pod.x, pod.y, -5.45), 3, 1.5, C.iron, sx * 0.4);
  }
  propeller(acc, spin, V(0, 0, -L - 1.15), 4, 2.3, C.brass, Math.PI / 4);

  // Orchestrator livery (TASK-441): the HQ bell on both flanks, a string of seven culture
  // pennants (HQ first) trailing from the top fin
  const O = C.orchestrator;
  for (const s of [1, -1] as const)
    addGlyph(acc, GLYPH_OF_THEME.hq, V(s * (hullR(O.emblem.z) - 0.6), 0, O.emblem.z), {
      size: O.emblem.size,
      color: O.emblem.color,
      depth: O.emblem.depth,
      q: qEuler(0, (s * Math.PI) / 2, 0),
    });
  const ts = O.tailString;
  const cordA = V(0, 5.7, -12.7);
  const cordB = V(0, 5.7 - ts.drop, -12.7 - ts.len);
  put(acc, tubeAlong(ropePoints(cordA, cordB, ts.sag, 8), 0.05, 3), [0, 0, 0], C.rope, {
    aoAmt: 0,
    ao: () => 1,
  });
  THEME_IDS.forEach((theme, i) => {
    const t = (i + 0.7) / (THEME_IDS.length + 0.2);
    const p = cordA.clone().lerp(cordB, t);
    p.y -= ts.sag * 4 * t * (1 - t) + 0.03;
    culturePennant(
      acc,
      { theme, at: p, w: ts.w, h: ts.h, glyph: fine ? { size: ts.w * 0.5, at: 0.42 } : null },
      0,
    );
  });

  return finishSpin(acc.finish(createRng(8).fork('airship-faces'), false, true), acc, spin);
}

/** Gondola window: brass frame + emissive pane facing the wall normal at `yaw`. */
function windowAt3(acc: Acc, at: THREE.Vector3, yaw: number, w = 0.7, h = 0.55): void {
  const wq = qEuler(0, yaw, 0);
  const frame = new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.08);
  acc.add(frame, {
    m: new THREE.Matrix4().compose(at, wq, V(1, 1, 1)),
    color: col(C.brass),
    windMul: 0,
    aoAmt: 0,
  });
  const pane = new THREE.PlaneGeometry(w, h);
  const off = V(0, 0, 0.045).applyQuaternion(wq);
  acc.add(pane, {
    m: new THREE.Matrix4().compose(at.clone().add(off), wq, V(1, 1, 1)),
    color: col(C.airship.window),
    windMul: 0,
    ao: () => 1,
    emissive: 1,
  });
}

/** The Hype Fleet as one geometry: balloon i occupies vertices `ranges[i]` (CPU-posed each frame). */
export interface FleetGeometry {
  geometry: THREE.BufferGeometry;
  ranges: Array<{ start: number; count: number }>;
}

export function buildFleetGeometry(liveries: readonly BalloonLivery[], lod = 0): FleetGeometry {
  const parts = liveries.map((l) => buildBalloonGeometry(lod, l));
  const ranges: FleetGeometry['ranges'] = [];
  let start = 0;
  for (const p of parts) {
    const count = p.getAttribute('position').count;
    ranges.push({ start, count });
    start += count;
  }
  const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  geometry.userData = { tris: start / 3 };
  for (const p of parts) if (p !== geometry) p.dispose();
  return { geometry, ranges };
}
