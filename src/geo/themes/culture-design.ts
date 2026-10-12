/**
 * Cam ve Işık Stüdyosu (Glass & Light Studio) culture kit (M19 TASK-415, ISLAND_CULTURES §2.6).
 * Geometry only; placement is the worldgen wave. Local frame: ground at y = 0, the front faces +z.
 *
 * Design glass is NOT Research glass: it is saturated (ROOFS / FLOWERS hues), faceted (pyramid
 * bullions, hex prisms, 80-face orbs), thick (>= `GLASS_T`), warm and molten (lava -> amber ->
 * colour), leaded in dark came. No flat clear panes, no aqua `#8EEBE0` (the test checks every
 * vertex colour).
 *
 *   hotShop        T2  kit prefab: brick furnace with a glowing glory hole, copper stack, annealer
 *                      with a cooling piece, marver bench + blowpipe with a molten gather, glass
 *                      awning, bull's-eye roundel; 3 variants = heat tone of the gather
 *   prismSculpture T2  twisted hex crystal column on a plinth, 3 colour families
 *   stainedScreen  T2  standing leaded stained-glass screen; 2 patterns (sunburst rose / quilt)
 *   gatherRing     T2  six blown-glass stools round a prism lamp on a terrazzo disc (chat hub)
 *   causticDecal   T3  flat ground colour patch of refracted light; 5 colours (noShadow)
 *   glassOrb       T3  faceted orb cluster on a stone cradle; 3 colours (noShadow)
 *   culletCrate    T3  crate of colour-sorted cullet shards; 5 colours (noShadow)
 *   sampleShelf    T3  mini vase shelf; variant 1 = the "seconds" shelf with a lopsided bowl
 *   blowpipeRack   T3  wall-leaning blowpipes on a peg board (noShadow)
 *   rainbowArc     T1  14 u seven-band emissive arc (the one tier-1 def; effective tier 0, see props)
 *
 * Variants of existing defs (no new ledger entries, `variants` of the base defs unchanged so every
 * existing world hash holds; buildable-but-unplaced until the placement wave bumps them):
 *   giantTree v3     `withCanopyVitray`: canopy panels + studio window; LOD1 = v2
 *   galleryPavilion v2  `withGlassPavilion`: faceted coloured glass roof; LOD1 = v1
 *   bunting v3       `withGlassChimeLine`: hanging glass drops; LOD1 = v2
 *   lanternBoat      builder for sailboat v4 (wired in geo/registry.ts, TASK-434)
 *
 * Budget rules (ISLAND_CULTURES §4.2): tier-2/3 defs stay < 3 u (isLargeStructure false); glass is
 * `emissive: 1` (switches on with the lamps ramp, staggered); molten parts are `emissive: 1.6`
 * (screen class: faint glow by day). Shared helpers are exported for the variants.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DESIGN_CULTURE_KIT as K } from '../../content/props-themes/design.ts';
import { Acc, col, qEuler, type ColorFn } from '../kit.ts';
import { TAU, V, baseBox, bevBox, cylB, lathe, put, tubeAlong } from '../parts.ts';
import type { BuildOpts, Lod, PropBuilder, PropGeoDef } from '../types.ts';
import { addGlyph } from './glyphs.ts';
import { tagStained } from './surface-tags.ts';
import { cultureAcc } from './culture-devops.ts';

/** Thickness of every glass slab (u): Design glass is chunky, never a thin pane. */
export const GLASS_T = 0.16;

const G = K.glass;
/** The saturated glass wheel, warm -> cool. */
export const GLASS_WHEEL = [
  G.ruby,
  G.orange,
  G.amber,
  G.sun,
  G.mint,
  G.sky,
  G.violet,
  G.pink,
] as const;

const WHITE = col('#FFFFFF');
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const AXZ = qEuler(Math.PI / 2, 0, 0);
const AXX = qEuler(0, 0, -Math.PI / 2);

/** Self-lit glass: no baked AO, glows with the lamps ramp (`e` = night glow mask). */
const lit = (e = 1) => ({ emissive: e, ao: () => 1, aoAmt: 0 }) as const;
/** Molten parts: screen class (>= 1.5), a faint glow even by day. */
const MOLTEN = 1.6;

/** Deterministic hash of a rounded 3D point -> [0, 1). */
function h3(x: number, y: number, z: number, salt = 0): number {
  let h = Math.imul(Math.round(x * 64) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul(Math.round(y * 64) + salt, 0xc2b2ae35);
  h ^= Math.imul(Math.round(z * 64) ^ 0x1b873593, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Facet-by-facet pick from `cols`, lightened towards the top (light caught on the upper facets). */
export function facets(cols: readonly string[], y0 = 0, span = 1, lift = 0.3, salt = 0): ColorFn {
  return (p) =>
    col(cols[Math.floor(h3(p.x, p.y, p.z, salt) * cols.length)]).lerp(
      WHITE,
      lift * clamp01((p.y - y0) / span),
    );
}

const bx = (
  acc: Acc,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: string,
  o: Parameters<typeof put>[4] = {},
): void => put(acc, baseBox(w, h, d), [x, y, z], color, { aoAmt: 0.12, ...o });

/** Square pyramid sitting on y = 0 (base w x d, height h). */
const squarePyramid = (w: number, d: number, h: number): THREE.BufferGeometry =>
  new THREE.ConeGeometry(Math.SQRT1_2, h, 4)
    .rotateY(Math.PI / 4)
    .translate(0, h / 2, 0)
    .scale(w, 1, d);

/** Lathe whose faces point outward whatever the profile direction. */
function solidLathe(pts: ReadonlyArray<readonly [number, number]>, seg: number) {
  const g = lathe(pts, seg).toNonIndexed();
  const p = g.getAttribute('position');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let best = 0;
  let sign = 1;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const rad = (a.x + b.x + c.x) / 3;
    const radz = (a.z + b.z + c.z) / 3;
    const out = n.x * rad + n.z * radz;
    if (Math.abs(out) > best) {
      best = Math.abs(out);
      sign = out > 0 ? 1 : -1;
    }
  }
  if (sign > 0) return g;
  for (let i = 0; i < p.count; i += 3) {
    const x = p.getX(i + 1);
    const y = p.getY(i + 1);
    const z = p.getZ(i + 1);
    p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
    p.setXYZ(i + 2, x, y, z);
  }
  return g;
}

/* ------------------------------- leaded panes ------------------------------- */

type Pt = readonly [number, number];

/** Convex/simple polygon in the XY plane extruded +-depth/2 about z = 0 (front faces +z). */
function polyGeo(pts: readonly Pt[], depth: number): THREE.BufferGeometry {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 1 }).translate(
    0,
    0,
    -depth / 2,
  );
}

/** Move every vertex radially from the polygon centroid by `d` (negative shrinks). */
function offsetPoly(pts: readonly Pt[], d: number): Pt[] {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of pts) {
    cx += x;
    cy += y;
  }
  cx /= pts.length;
  cy /= pts.length;
  return pts.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const l = Math.hypot(dx, dy) || 1;
    const k = (l + d) / l;
    return [cx + dx * k, cy + dy * k] as const;
  });
}

interface PaneDef {
  pts: readonly Pt[];
  color: string;
}

/** Thick glass panes (depth >= GLASS_T), a gap between them where the came backing shows. */
function panes(
  acc: Acc,
  list: readonly PaneDef[],
  at: [number, number, number],
  q?: THREE.Quaternion,
  e = 1,
  depth = GLASS_T + 0.04,
  gap = 0.024,
): void {
  for (const p of list)
    put(acc, polyGeo(offsetPoly(p.pts, -gap), depth), at, p.color, { q, ...lit(e) });
}

const polar = (cx: number, cy: number, r: number, a: number): Pt => [
  cx + Math.cos(a) * r,
  cy + Math.sin(a) * r,
];

/** Annular sector (r0 = 0: a fan wedge) from angle a0 to a1, `n` arc steps. */
function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, n = 2) {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push(polar(cx, cy, r1, a0 + ((a1 - a0) * i) / n));
  if (r0 <= 1e-6) out.push([cx, cy]);
  else for (let i = n; i >= 0; i--) out.push(polar(cx, cy, r0, a0 + ((a1 - a0) * i) / n));
  return out;
}

/**
 * Bull's-eye roundel centred on `at`, facing along `q` (+z by default): brass ring, came disc, a
 * boss and 8 thick wedges in `cols`. Radius R (0.7 u at the doors, ISLAND_CULTURES §2.6).
 */
export function roundelInto(
  acc: Acc,
  at: [number, number, number],
  R: number,
  cols: readonly string[],
  q?: THREE.Quaternion,
  hi = true,
): void {
  put(acc, new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.12, hi ? 16 : 8), at, K.came, {
    q: (q ?? new THREE.Quaternion()).clone().multiply(AXZ),
    aoAmt: 0,
  });
  put(acc, new THREE.TorusGeometry(R + 0.035, 0.05, 4, hi ? 18 : 8), at, K.brass, { q, aoAmt: 0 });
  const wedges: PaneDef[] = [];
  const n = hi ? 8 : 6;
  for (let i = 0; i < n; i++)
    wedges.push({
      pts: sector(0, 0, R * 0.3, R - 0.02, (i / n) * TAU, ((i + 1) / n) * TAU, 1),
      color: cols[i % cols.length],
    });
  wedges.push({ pts: sector(0, 0, 0, R * 0.3, 0, TAU, hi ? 7 : 4).slice(0, -1), color: G.amber });
  panes(acc, wedges, at, q, 1, GLASS_T + 0.02, 0.02);
}

/* ================================== hotShop ================================== */

/** Heat tone of the molten gather per variant: [gather, piece cooling on the annealer, glow]. */
const HEAT = [
  { gather: K.lava, piece: K.glow, mouth: K.lava, e: MOLTEN },
  { gather: K.glow, piece: G.amber, mouth: K.glow, e: MOLTEN },
  { gather: G.amber, piece: G.pink, mouth: K.lava, e: 1.2 },
] as const;

function hotShop({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  if (!hi) {
    // far proxy: pad, wall, furnace + stack, annealer, awning slab, bench (never drawn at tier 2)
    bx(acc, 2.8, 0.1, 2.46, 0, 0, 0, K.brickLight);
    bx(acc, 2.8, 2.3, 0.16, 0, 0.1, -1.12, K.cream);
    put(acc, cylB(0.7, 0.7, 1.4, 6), [-0.65, 0.1, -0.3], K.brick);
    put(acc, cylB(0.16, 0.13, 1.4, 4), [-0.7, 1.45, -0.58], K.copper);
    bx(acc, 0.86, 0.74, 0.76, 0.88, 0.1, -0.58, K.brickDark);
    put(acc, baseBox(1.1, 0.1, 1.1), [0.88, 1.65, -0.55], G.amber, {
      q: qEuler(0.4, 0, 0),
      ...lit(1),
    });
    bx(acc, 0.96, 0.7, 0.5, -0.28, 0.1, 0.82, K.steel);
    return acc.finish(rng, false, true);
  }
  const heat = HEAT[variant % 3];
  const seg = hi ? 8 : 6;
  // flagstone pad
  bx(acc, 2.8, 0.1, 2.46, 0, 0, 0.0, K.brickLight, { aoAmt: 0.2 });
  // back wall: cream, soot-stained above the furnace
  const wallH = 2.3;
  const sootAt = (p: THREE.Vector3): THREE.Color =>
    col(K.cream).lerp(
      col(K.soot),
      0.6 * clamp01(1 - Math.abs(p.x + 0.65) / 0.8) * clamp01((p.y - 0.9) / 0.9),
    );
  put(acc, baseBox(2.8, wallH, 0.16), [0, 0.1, -1.12], sootAt, { aoAmt: 0.1 });
  bx(acc, 2.92, 0.1, 0.26, 0, 0.1 + wallH, -1.12, K.woodDark, { aoAmt: 0 });
  // furnace drum (flat face to +z), dome, glory hole
  const fx = -0.65;
  const fz = -0.3;
  put(
    acc,
    new THREE.CylinderGeometry(0.7, 0.74, 1.0, 8).rotateY(Math.PI / 8).translate(0, 0.5, 0),
    [fx, 0.1, fz],
    K.brick,
    {
      aoAmt: 0.25,
    },
  );
  if (hi)
    for (const y of [0.35, 0.72])
      put(
        acc,
        new THREE.TorusGeometry(0.73, 0.03, 3, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 8),
        [fx, 0.1 + y, fz],
        K.came,
        {
          aoAmt: 0,
        },
      );
  put(
    acc,
    new THREE.SphereGeometry(0.7, seg, 3, 0, TAU, 0, Math.PI / 2)
      .rotateY(Math.PI / 8)
      .scale(1, 0.72, 1),
    [fx, 1.1, fz],
    K.brickDark,
    { aoAmt: 0.1 },
  );
  // glory hole: brick arch surround, glowing mouth, steel lip
  const ap = 0.7 * Math.cos(Math.PI / 8) + 0.01;
  const mz = fz + ap;
  const my = 0.1 + 0.44;
  put(acc, new THREE.CircleGeometry(0.25, hi ? 12 : 6), [fx, my + 0.12, mz + 0.02], heat.mouth, {
    emissive: heat.e,
    ao: () => 1,
    aoAmt: 0,
  });
  bx(acc, 0.5, 0.36, 0.03, fx, my - 0.24, mz + 0.02, heat.mouth, {
    emissive: heat.e,
    ao: () => 1,
    aoAmt: 0,
  });
  if (hi) {
    put(acc, new THREE.CircleGeometry(0.13, 8), [fx, my + 0.12, mz + 0.045], K.window, {
      emissive: MOLTEN,
      ao: () => 1,
      aoAmt: 0,
    });
    put(
      acc,
      new THREE.TorusGeometry(0.29, 0.07, 4, 10, Math.PI),
      [fx, my + 0.12, mz + 0.01],
      K.brickLight,
      {
        aoAmt: 0.05,
      },
    );
    for (const sx of [-1, 1])
      bx(acc, 0.1, 0.4, 0.13, fx + sx * 0.29, my - 0.28, mz - 0.02, K.brickLight, { aoAmt: 0.05 });
    bx(acc, 0.9, 0.07, 0.3, fx, my - 0.28, mz + 0.12, K.steel, { aoAmt: 0 });
    // iron door ring on the side of the drum
    put(acc, new THREE.TorusGeometry(0.15, 0.025, 3, 8), [fx + 0.69, 0.75, fz + 0.1], K.came, {
      q: qEuler(0, Math.PI / 2, 0),
      aoAmt: 0,
    });
  }
  // copper stack + flared cap
  put(acc, cylB(0.17, 0.13, 1.1, seg), [fx - 0.05, 1.45, fz - 0.28], K.copper, { aoAmt: 0.1 });
  put(acc, new THREE.ConeGeometry(0.22, 0.14, seg), [fx - 0.05, 2.55, fz - 0.28], K.came, {
    aoAmt: 0,
  });
  if (hi) {
    for (const y of [1.75, 2.1])
      put(acc, cylB(0.2, 0.2, 0.06, seg), [fx - 0.05, y, fz - 0.28], K.brass, { aoAmt: 0 });
    // stays from the stack to the wall
    put(
      acc,
      tubeAlong([V(fx - 0.05, 2.3, fz - 0.28), V(fx - 0.3, 2.1, -1.04)], 0.018, 3),
      [0, 0, 0],
      K.came,
      {
        aoAmt: 0,
      },
    );
  }
  // annealing oven (the cat's warm spot) with the cooling piece on top
  const ax = 0.88;
  const az = -0.58;
  bx(acc, 0.86, 0.74, 0.76, ax, 0.1, az, K.brickDark, { aoAmt: 0.25 });
  bx(acc, 0.94, 0.07, 0.84, ax, 0.84, az, K.stone, { aoAmt: 0.05 });
  put(acc, baseBox(0.5, 0.36, 0.05), [ax, 0.28, az + 0.4], K.came, { aoAmt: 0 });
  bx(acc, 0.34, 0.07, 0.04, ax, 0.5, az + 0.43, K.glow, { emissive: 1, ao: () => 1, aoAmt: 0 });
  if (hi) {
    for (const sx of [-1, 1])
      bx(acc, 0.06, 0.36, 0.08, ax + sx * 0.28, 0.28, az + 0.41, K.steel, { aoAmt: 0 });
    put(acc, new THREE.IcosahedronGeometry(0.13, 1), [ax - 0.08, 1.0, az + 0.02], heat.piece, {
      s: [1.3, 0.8, 1],
      emissive: heat.e > 1.3 ? 1.3 : 1,
      ao: () => 1,
      aoAmt: 0,
    });
    bx(acc, 0.34, 0.04, 0.2, ax - 0.08, 0.91, az + 0.02, K.steelLight, { aoAmt: 0 });
  } else
    put(
      acc,
      new THREE.IcosahedronGeometry(0.13, 0),
      [ax - 0.08, 1.0, az + 0.02],
      heat.piece,
      lit(1),
    );
  // glass awning over the annealer: faceted bullion panes on a slope, came rafters, two posts
  const aw0: [number, number, number] = [0.34, 1.52, -0.12]; // front-left eave
  const slope = Math.atan2(0.42, 0.96);
  const awC = ['#E35D6A', G.amber, G.sky, G.mint, G.violet, G.orange] as const;
  const cols = 3;
  const rows = 2;
  const pw = 1.1 / cols;
  const pd = 0.96 / Math.cos(slope) / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const cx = aw0[0] + pw * (c + 0.5);
      const t = (r + 0.5) / rows;
      const cz = aw0[2] - 0.96 * t;
      const cy = aw0[1] + 0.42 * t;
      const q = qEuler(slope, 0, 0);
      const colr = awC[(c + r * 2) % awC.length];
      put(acc, baseBox(pw - 0.05, 0.1, pd - 0.05).translate(0, -0.05, 0), [cx, cy, cz], colr, {
        q,
        ...lit(1),
      });
      if (hi)
        put(acc, squarePyramid(pw - 0.07, pd - 0.07, 0.11), [cx, cy + 0.0, cz], colr, {
          q,
          ...lit(1),
        });
    }
  if (hi) {
    // came grid under the panes
    for (let c = 0; c <= cols; c++)
      put(acc, baseBox(0.045, 0.06, 1.07), [aw0[0] + pw * c, aw0[1] + 0.2, aw0[2] - 0.48], K.came, {
        q: qEuler(slope, 0, 0),
        aoAmt: 0,
      });
  }
  for (const x of [0.34, 1.42]) bx(acc, 0.1, 1.52, 0.1, x, 0.1, -0.1, K.woodDark, { aoAmt: 0.15 });
  bx(acc, 1.2, 0.09, 0.1, 0.88, 1.5, -0.1, K.woodDark, { aoAmt: 0 });
  // roundel above the awning
  roundelInto(acc, [0.88, 2.02, -1.02], 0.3, [G.ruby, G.amber, G.sky, G.mint], undefined, hi);
  if (hi) addGlyph(acc, 'prism', V(-1.18, 1.75, -1.02), { size: 0.32, color: G.plum, depth: 0.05 });
  // marver bench with the blowpipe and the molten gather
  const bxz: [number, number] = [-0.28, 0.82];
  bx(acc, 0.96, 0.08, 0.5, bxz[0], 0.7, bxz[1], K.steel, { aoAmt: 0.05 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      bx(acc, 0.08, 0.6, 0.08, bxz[0] + sx * 0.4, 0.1, bxz[1] + sz * 0.18, K.woodDark, {
        aoAmt: 0.15,
      });
  if (hi) bx(acc, 0.9, 0.05, 0.4, bxz[0], 0.4, bxz[1], K.woodDark, { aoAmt: 0.1 });
  const pipeA = V(bxz[0] + 0.62, 0.84, bxz[1] + 0.12);
  const pipeB = V(bxz[0] - 0.68, 0.86, bxz[1] - 0.22);
  put(acc, tubeAlong([pipeA, pipeB], 0.03, hi ? 5 : 3), [0, 0, 0], K.steelLight, { aoAmt: 0 });
  put(
    acc,
    tubeAlong([pipeA.clone().add(V(0.0, 0, 0)), pipeA.clone().lerp(pipeB, 0.14)], 0.05, 5),
    [0, 0, 0],
    K.woodLight,
    { aoAmt: 0 },
  );
  put(
    acc,
    new THREE.IcosahedronGeometry(0.115, hi ? 1 : 0),
    [pipeB.x - 0.04, pipeB.y, pipeB.z - 0.01],
    heat.gather,
    {
      s: [1.15, 1, 1],
      emissive: heat.e,
      ao: () => 1,
      aoAmt: 0,
    },
  );
  if (hi) {
    // jacks (tongs) and a shaping paddle on the bench
    for (const s of [-1, 1])
      put(
        acc,
        baseBox(0.04, 0.04, 0.4),
        [bxz[0] - 0.05 + s * 0.04, 0.78, bxz[1] + 0.12],
        K.steelPale,
        {
          q: qEuler(0, s * 0.09, 0),
          aoAmt: 0,
        },
      );
    // water bucket
    put(acc, cylB(0.16, 0.13, 0.26, 8), [-1.2, 0.1, 0.78], K.wood, { aoAmt: 0.2 });
    put(acc, new THREE.CylinderGeometry(0.14, 0.14, 0.02, 8), [-1.2, 0.35, 0.78], G.sky, {
      aoAmt: 0,
      ao: () => 1,
    });
    // cullet barrel with a shard heap
    put(acc, cylB(0.26, 0.24, 0.5, 8), [1.08, 0.1, 0.62], K.woodLight, { aoAmt: 0.2 });
    put(
      acc,
      new THREE.TorusGeometry(0.25, 0.02, 3, 8).rotateX(Math.PI / 2),
      [1.08, 0.38, 0.62],
      K.came,
      { aoAmt: 0 },
    );
    const shard = rng.fork('barrel');
    for (let i = 0; i < 9; i++) {
      const a = shard.range(0, TAU);
      const rr = shard.range(0, 0.15);
      put(
        acc,
        new THREE.OctahedronGeometry(shard.range(0.05, 0.085), 0),
        [1.08 + Math.cos(a) * rr, 0.62 + shard.range(0, 0.07), 0.62 + Math.sin(a) * rr],
        GLASS_WHEEL[(i * 3 + 1) % GLASS_WHEEL.length],
        { q: qEuler(shard.range(0, 3), shard.range(0, 3), 0), ...lit(0.4) },
      );
    }
    // colour rods leaning on the wall
    for (let i = 0; i < 4; i++)
      put(acc, cylB(0.03, 0.03, 1.1, 5), [-1.28 + i * 0.07, 0.1, -1.0], GLASS_WHEEL[(i * 2) % 8], {
        q: qEuler(0.12, 0, 0.03),
        ...lit(0.5),
      });
  }
  const g = acc.finish(rng, false, true);
  g.userData.hooks = { emitter: [fx - 0.05, 2.68, fz - 0.28] };
  return g;
}

/* ============================== prismSculpture ============================== */

const PRISM_FAMILY = [
  [G.pink, G.lavender, G.sky],
  [G.amber, G.orange, G.ruby],
  [G.mint, G.sky, G.violet],
] as const;

function prismSculpture({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  if (!hi) {
    const fam0 = PRISM_FAMILY[variant % 3];
    bx(acc, 1.1, 0.28, 1.1, 0, 0, 0, K.paper);
    put(
      acc,
      new THREE.CylinderGeometry(0.2, 0.38, 1.6, 5).translate(0, 0.8, 0),
      [0, 0.28, 0],
      fam0[0],
      lit(0.4),
    );
    put(
      acc,
      new THREE.ConeGeometry(0.2, 0.42, 5).translate(0, 0.21, 0),
      [0, 1.88, 0],
      fam0[2],
      lit(0.8),
    );
    return acc.finish(rng, false, true);
  }
  const fam = PRISM_FAMILY[variant % 3];
  // stepped plinth
  put(acc, cylB(0.58, 0.54, 0.16, hi ? 8 : 6), [0, 0, 0], K.paper, { aoAmt: 0.25 });
  put(acc, cylB(0.46, 0.4, 0.12, hi ? 8 : 6), [0, 0.16, 0], K.plumDeep, { aoAmt: 0.1 });
  // twisted hex tiers: each tier a quarter turn off the last, faces coloured by sector
  const tiers: Array<[number, number, number, number]> = hi
    ? [
        [0.4, 0.36, 0.52, 0],
        [0.4, 0.3, 0.62, Math.PI / 6],
        [0.32, 0.2, 0.5, 0],
      ]
    : [[0.38, 0.2, 1.62, 0]];
  let y = 0.28;
  tiers.forEach(([rb, rt, h, rot], ti) => {
    const sector6 = (p: THREE.Vector3): THREE.Color => {
      const a = Math.atan2(p.z, p.x) - rot + Math.PI * 2;
      const k = Math.floor((a / (Math.PI / 3)) % 6);
      const c = col(fam[(k + ti) % 3]);
      return c.lerp(WHITE, 0.4 * clamp01((p.y - 0.28) / 1.9));
    };
    put(
      acc,
      new THREE.CylinderGeometry(rt, rb, h, 6).rotateY(rot).translate(0, h / 2, 0),
      [0, y, 0],
      sector6,
      {
        ...lit(0.4),
      },
    );
    y += h;
  });
  put(
    acc,
    new THREE.ConeGeometry(hi ? 0.2 : 0.2, 0.42, 6).translate(0, 0.21, 0),
    [0, y, 0],
    (p) => col(fam[Math.floor(h3(p.x, p.y, p.z, 5) * 3)]).lerp(WHITE, 0.55),
    { ...lit(0.85) },
  );
  if (hi) {
    // three leaning shards at the foot
    const shards = [
      [0.55, 0.12, 0.2, 0.52, 0.3],
      [-0.5, -0.15, 0.17, 0.42, -0.35],
      [0.12, 0.58, 0.15, 0.36, 0.25],
    ] as const;
    shards.forEach(([sx, sz, r, hh, lean], i) =>
      put(
        acc,
        new THREE.ConeGeometry(r, hh, 5).translate(0, hh / 2, 0),
        [sx, 0.05, sz],
        fam[i % 3],
        {
          q: qEuler(lean, i, lean * 0.6),
          ...lit(0.5),
        },
      ),
    );
  }
  return acc.finish(rng, false, true);
}

/* =============================== stainedScreen =============================== */

const SCREEN = { hw: 0.78, y0: 0.3, yc: 1.4 } as const;

/** Window outline (rect + arch) as a polygon, counter-clockwise from the bottom-left corner. */
function windowOutline(arc = 10): Pt[] {
  const out: Pt[] = [
    [-SCREEN.hw, SCREEN.y0],
    [SCREEN.hw, SCREEN.y0],
    [SCREEN.hw, SCREEN.yc],
  ];
  for (let i = 1; i < arc; i++) out.push(polar(0, SCREEN.yc, SCREEN.hw, (i / arc) * Math.PI));
  out.push([-SCREEN.hw, SCREEN.yc]);
  return out;
}

/** Point where the ray from the roundel centre at angle `a` leaves the window. */
function boundary(a: number): Pt {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  if (dy >= 0) return polar(0, SCREEN.yc, SCREEN.hw, a);
  const tx = SCREEN.hw / Math.max(1e-6, Math.abs(dx));
  const ty = (SCREEN.yc - SCREEN.y0) / -dy;
  const t = Math.min(tx, ty);
  return [dx * t, SCREEN.yc + dy * t];
}

function sunburstPanes(): PaneDef[] {
  const list: PaneDef[] = [];
  const cornerA = Math.atan2(-(SCREEN.yc - SCREEN.y0), SCREEN.hw);
  const n = 14;
  const wheel = [G.ruby, G.orange, G.amber, G.sky, G.violet, G.pink, G.mint];
  const inner = [G.amber, G.orange, G.sun];
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI - (i / n) * TAU;
    const a1 = Math.PI - ((i + 1) / n) * TAU;
    const lo = Math.min(a0, a1);
    const hi = Math.max(a0, a1);
    // inner ring (r 0.16 .. 0.46)
    list.push({ pts: sector(0, SCREEN.yc, 0.17, 0.44, lo, hi, 1), color: inner[i % inner.length] });
    // outer wedge from r 0.44 to the window edge; corners join the boundary polygon
    const outer: Pt[] = [polar(0, SCREEN.yc, 0.44, lo), boundary(lo)];
    for (const ca of [cornerA, Math.PI - cornerA, -Math.PI - cornerA, Math.PI + cornerA]) {
      const c = ca > Math.PI ? ca - TAU : ca;
      if (c > lo + 1e-4 && c < hi - 1e-4) outer.push(boundary(c));
    }
    if (hi > 0 && lo < 0) outer.push(boundary(0));
    if (hi > Math.PI - 1e-4 && lo < Math.PI - 1e-4) outer.push(boundary(Math.PI));
    outer.push(boundary(hi), polar(0, SCREEN.yc, 0.44, hi));
    list.push({ pts: dedupeSorted(outer, lo, hi), color: wheel[i % wheel.length] });
  }
  list.push({ pts: sector(0, SCREEN.yc, 0, 0.17, 0, TAU, 6).slice(0, -1), color: G.plum });
  return list;
}

/** Order the boundary points of a wedge by angle about the roundel centre (stable, simple polygon). */
function dedupeSorted(pts: Pt[], lo: number, hi: number): Pt[] {
  const inner = pts.filter((p) => Math.hypot(p[0], p[1] - SCREEN.yc) < 0.45);
  const outer = pts
    .filter((p) => Math.hypot(p[0], p[1] - SCREEN.yc) >= 0.45)
    .sort((a, b) => ang(a, lo, hi) - ang(b, lo, hi));
  inner.sort((a, b) => ang(b, lo, hi) - ang(a, lo, hi));
  return [...outer, ...inner];
}
function ang(p: Pt, lo: number, hi: number): number {
  let a = Math.atan2(p[1] - SCREEN.yc, p[0]);
  if (a < lo - 1e-6) a += TAU;
  if (a > hi + 1e-6 && a - TAU >= lo - 1e-6) a -= TAU;
  return a;
}

function quiltPanes(): PaneDef[] {
  const list: PaneDef[] = [];
  const w = (SCREEN.hw * 2) / 2;
  const h = (SCREEN.yc - SCREEN.y0) / 2;
  const diamond = [G.sky, G.amber, G.pink, G.mint];
  const corner = [G.violet, G.ruby, G.violet, G.ruby];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 2; c++) {
      const x0 = -SCREEN.hw + c * w;
      const y0 = SCREEN.y0 + r * h;
      const mx = x0 + w / 2;
      const my = y0 + h / 2;
      const k = r * 2 + c;
      list.push({
        pts: [
          [mx, y0 + 0.02],
          [x0 + w - 0.02, my],
          [mx, y0 + h - 0.02],
          [x0 + 0.02, my],
        ],
        color: diamond[k],
      });
      const tri = (a: Pt, b: Pt, d: Pt, i: number): void => {
        list.push({ pts: [a, b, d], color: i % 2 ? corner[k] : G.orange });
      };
      tri([x0, y0], [mx, y0 + 0.02], [x0 + 0.02, my], 0);
      tri([x0 + w, y0], [x0 + w - 0.02, my], [mx, y0 + 0.02], 1);
      tri([x0 + w, y0 + h], [mx, y0 + h - 0.02], [x0 + w - 0.02, my], 0);
      tri([x0, y0 + h], [x0 + 0.02, my], [mx, y0 + h - 0.02], 1);
    }
  const wheel = [G.sun, G.ruby, G.sky, G.mint, G.violet, G.orange];
  for (let i = 0; i < 6; i++)
    list.push({
      pts: sector(0, SCREEN.yc, 0.26, SCREEN.hw, (i / 6) * Math.PI, ((i + 1) / 6) * Math.PI, 2),
      color: wheel[i],
    });
  list.push({ pts: sector(0, SCREEN.yc, 0, 0.26, 0, Math.PI, 5), color: G.pink });
  return list;
}

function stainedScreen({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  if (!hi) {
    for (const sx of [-1, 1]) bx(acc, 0.14, 1.5, 0.2, sx * 0.86, 0.1, 0, K.wood);
    bx(acc, 1.78, 0.2, 0.74, 0, 0, 0, K.woodDark);
    put(acc, polyGeo(windowOutline(3), 0.1), [0, 0, 0], K.came, { aoAmt: 0 });
    const lo: PaneDef[] = [];
    const wheel0 =
      variant % 2 === 1 ? [G.sky, G.amber, G.pink, G.mint] : [G.ruby, G.amber, G.sky, G.violet];
    for (let i = 0; i < 4; i++) {
      const x0 = -SCREEN.hw + (i % 2) * SCREEN.hw;
      const y0 = SCREEN.y0 + Math.floor(i / 2) * 0.55;
      lo.push({
        pts: [
          [x0, y0],
          [x0 + SCREEN.hw, y0],
          [x0 + SCREEN.hw, y0 + 0.55],
          [x0, y0 + 0.55],
        ],
        color: wheel0[i],
      });
    }
    lo.push({ pts: sector(0, SCREEN.yc, 0, SCREEN.hw, 0, Math.PI, 2), color: G.orange });
    panes(acc, lo, [0, 0, 0], undefined, 1);
    return acc.finish(rng, false, true);
  }
  const quilt = variant % 2 === 1;
  // T-feet, posts, rails, arch
  for (const sx of [-1, 1]) {
    bx(acc, 0.2, 0.12, 0.74, sx * 0.76, 0, 0, K.woodDark, { aoAmt: 0.2 });
    bx(acc, 0.14, SCREEN.yc, 0.2, sx * 0.86, 0.1, 0, K.wood, { aoAmt: 0.15 });
    if (hi)
      put(acc, new THREE.IcosahedronGeometry(0.1, 0), [sx * 0.86, SCREEN.yc + 0.12, 0], K.brass, {
        aoAmt: 0,
      });
  }
  bx(acc, 1.78, 0.2, 0.22, 0, 0.1, 0, K.woodDark, { aoAmt: 0.1 });
  put(
    acc,
    new THREE.TorusGeometry(0.86, 0.07, 4, hi ? 14 : 8, Math.PI),
    [0, SCREEN.yc, 0],
    K.wood,
    {
      s: [1, 1, 1.5],
      aoAmt: 0.1,
    },
  );
  bx(acc, 1.62, 0.07, 0.2, 0, SCREEN.yc - 0.03, 0, K.wood, { aoAmt: 0 });
  // lead came backing + panes
  put(acc, polyGeo(windowOutline(hi ? 12 : 6), 0.1), [0, 0, 0], K.came, { aoAmt: 0 });
  panes(acc, quilt ? quiltPanes() : sunburstPanes(), [0, 0, 0], undefined, 1, GLASS_T + 0.04);
  if (hi) addGlyph(acc, 'prism', V(0, 0.19, 0.12), { size: 0.18, color: G.plum, depth: 0.03 });
  const g = acc.finish(rng, false, true);
  tagStained(g); // near LOD: low sun shines through the panes (TASK-440)
  return g;
}

/* ================================== gatherRing ================================ */

const STOOL_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.0],
  [0.19, 0.0],
  [0.21, 0.05],
  [0.15, 0.17],
  [0.12, 0.28],
  [0.18, 0.37],
  [0.27, 0.43],
  [0.27, 0.47],
  [0.0, 0.47],
];

function gatherRing({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  if (!hi) {
    put(acc, cylB(1.3, 1.32, 0.07, 8), [0, 0, 0], K.cream);
    put(acc, cylB(0.4, 0.36, 0.3, 5), [0, 0.07, 0], K.stone);
    const hues0 = [G.ruby, G.sky, G.amber, G.violet, G.mint, G.pink];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      put(acc, cylB(0.25, 0.25, 0.47, 4), [Math.cos(a), 0.07, Math.sin(a)], hues0[i], lit(0.6));
    }
    put(acc, new THREE.IcosahedronGeometry(0.26, 0), [0, 1.06, 0], G.amber, lit(1.3));
    return acc.finish(rng, false, true);
  }
  // terrazzo disc: cream, flecked with glass chips
  put(acc, cylB(1.3, 1.32, 0.07, hi ? 20 : 10), [0, 0, 0], K.cream, { aoAmt: 0.1 });
  if (hi) {
    const r = rng.fork('chips');
    for (let i = 0; i < 30; i++) {
      const a = r.range(0, TAU);
      const rr = 0.45 + Math.sqrt(r.next()) * 0.8;
      put(
        acc,
        new THREE.CylinderGeometry(r.range(0.05, 0.1), 0.06, 0.012, 5),
        [Math.cos(a) * rr, 0.07, Math.sin(a) * rr],
        GLASS_WHEEL[Math.floor(r.range(0, GLASS_WHEEL.length))],
        { q: qEuler(0, a, 0), aoAmt: 0, ao: () => 1 },
      );
    }
  }
  // centre: stone ring bowl, tripod and a faceted prism lamp
  put(acc, cylB(0.42, 0.36, 0.26, hi ? 10 : 6), [0, 0.07, 0], K.stone, { aoAmt: 0.25 });
  put(acc, cylB(0.34, 0.34, 0.03, hi ? 10 : 6), [0, 0.33, 0], K.stoneDark, { aoAmt: 0 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    put(acc, cylB(0.025, 0.025, 0.78, 3), [Math.cos(a) * 0.13, 0.33, Math.sin(a) * 0.13], K.came, {
      q: qEuler(Math.sin(a) * 0.16, 0, -Math.cos(a) * 0.16),
      aoAmt: 0,
    });
  }
  put(
    acc,
    new THREE.IcosahedronGeometry(0.26, hi ? 1 : 0),
    [0, 1.06, 0],
    facets([G.amber, G.sun, G.orange], 0.8, 0.5, 0.4, 1),
    {
      s: [1, 1.15, 1],
      emissive: 1.3,
      ao: () => 1,
      aoAmt: 0,
    },
  );
  if (hi) put(acc, new THREE.ConeGeometry(0.1, 0.2, 6), [0, 1.35, 0], K.brass, { aoAmt: 0 });
  // six blown-glass stools
  const hues = [G.ruby, G.sky, G.amber, G.violet, G.mint, G.pink];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    const x = Math.cos(a) * 1.0;
    const z = Math.sin(a) * 1.0;
    put(acc, solidLathe(STOOL_PROFILE, hi ? 8 : 6), [x, 0.07, z], hues[i], {
      q: qEuler(0, a, 0),
      ...lit(0.6),
    });
    if (hi) {
      put(acc, new THREE.CylinderGeometry(0.22, 0.22, 0.05, 8), [x, 0.07 + 0.47, z], K.wood, {
        aoAmt: 0,
      });
      put(
        acc,
        new THREE.TorusGeometry(0.2, 0.025, 3, 8).rotateX(Math.PI / 2),
        [x, 0.07 + 0.02, z],
        K.brass,
        { aoAmt: 0 },
      );
    }
  }
  return acc.finish(rng, false, true);
}

/* ================================ causticDecal =============================== */

const CAUSTIC = [G.ruby, G.amber, G.mint, G.sky, G.violet] as const;

function causticDecal({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const base = CAUSTIC[variant % CAUSTIC.length];
  const n = hi ? 16 : 6;
  const phase = rng.fork('caustic').range(0, TAU);
  const rim = (t: number): number =>
    1 + 0.11 * Math.sin(3 * t + phase) + 0.06 * Math.sin(5 * t + phase * 1.7);
  const at = (t: number, k: number, y: number): [number, number, number] => [
    Math.cos(t) * 0.5 * rim(t) * k,
    y,
    Math.sin(t) * 0.31 * rim(t) * k,
  ];
  const ring = (k0: number, k1: number, y0: number, y1: number, colour: THREE.Color): void => {
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * TAU;
      const t1 = ((i + 1) / n) * TAU;
      const a = at(t0, k0, y0);
      const b = at(t1, k0, y0);
      const c = at(t1, k1, y1);
      const d = at(t0, k1, y1);
      for (const tri of [
        [a, b, c],
        [a, c, d],
      ]) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
        put(acc, g, [0, 0, 0], colour, { aoAmt: 0, ao: () => 1 });
      }
    }
  };
  const c = col(base);
  ring(0.0001, 0.5, 0.06, 0.06, c.clone().lerp(WHITE, 0.5));
  if (hi) ring(0.5, 0.85, 0.06, 0.06, c.clone().lerp(WHITE, 0.22));
  ring(0.85, 1.0, 0.06, 0.05, c.clone());
  ring(1.0, 1.04, 0.05, 0.0, c.clone());
  return acc.finish(rng, false, true);
}

/* ================================== glassOrb ================================= */

const ORB_FAMILY = [
  [G.violet, G.lavender, G.pink],
  [G.sky, G.mint, G.lavender],
  [G.amber, G.orange, G.ruby],
] as const;

function glassOrb({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const fam = ORB_FAMILY[variant % 3];
  // stone cradle with a brass ring
  put(acc, cylB(0.34, 0.28, 0.3, hi ? 7 : 5), [0, 0, 0], K.stone, { aoAmt: 0.25 });
  if (hi) {
    put(acc, new THREE.DodecahedronGeometry(0.11, 0), [0.32, 0.07, 0.18], K.stoneDark, {
      aoAmt: 0.2,
    });
    put(acc, cylB(0.27, 0.27, 0.04, 10), [0, 0.3, 0], K.brass, { aoAmt: 0 });
  }
  const R = 0.3;
  const cy = 0.3 + R * 0.8;
  put(
    acc,
    new THREE.IcosahedronGeometry(R, hi ? 1 : 0),
    [0, cy, 0],
    facets(fam, cy - R, R * 2, 0.14, variant),
    {
      ...lit(0.5),
    },
  );
  if (hi) {
    // two small orbs on the ground, one with an inner orange spark (a fox's reflection)
    put(
      acc,
      new THREE.IcosahedronGeometry(0.14, 1),
      [0.5, 0.14, 0.18],
      facets([fam[1], fam[2]], 0, 0.3, 0.3, 2),
      {
        ...lit(0.5),
      },
    );
    put(
      acc,
      new THREE.IcosahedronGeometry(0.1, 0),
      [-0.45, 0.1, 0.34],
      facets([fam[2], fam[0]], 0, 0.2, 0.3, 3),
      {
        ...lit(0.5),
      },
    );
    put(acc, new THREE.IcosahedronGeometry(0.045, 0), [-0.12, cy - 0.02, R * 0.92], K.lava, {
      ...lit(MOLTEN),
    });
  }
  return acc.finish(rng, false, true);
}

/* ================================= culletCrate ================================ */

const CULLET = [G.ruby, G.amber, G.mint, G.sky, G.violet] as const;

function culletCrate({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const c = CULLET[variant % CULLET.length];
  const shades = [
    c,
    col(c).lerp(WHITE, 0.3).getStyle(),
    col(c).lerp(col('#000000'), 0.18).getStyle(),
  ];
  const hex = (s: string): string => `#${col(s).getHexString()}`;
  const tones = shades.map(hex);
  // crate: floor, four boards, corner posts
  bx(acc, 0.82, 0.05, 0.6, 0, 0, 0, K.woodDark, { aoAmt: 0.2 });
  const board = (w: number, d: number, x: number, z: number): void => {
    bx(acc, w, 0.38, d, x, 0.05, z, K.woodLight, { aoAmt: 0.2 });
  };
  board(0.82, 0.05, 0, 0.275);
  board(0.82, 0.05, 0, -0.275);
  board(0.05, 0.5, 0.385, 0);
  board(0.05, 0.5, -0.385, 0);
  if (hi) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        bx(acc, 0.07, 0.46, 0.07, sx * 0.375, 0.02, sz * 0.265, K.wood, { aoAmt: 0.1 });
    bx(acc, 0.86, 0.04, 0.04, 0, 0.42, 0.29, K.wood, { aoAmt: 0 });
  }
  // the heap
  const r = rng.fork('heap');
  put(
    acc,
    new THREE.ConeGeometry(0.34, 0.2, 6).scale(1.15, 1, 0.8).translate(0, 0.1, 0),
    [0, 0.4, 0],
    c,
    {
      ...lit(0.3),
    },
  );
  const n = hi ? 20 : 5;
  for (let i = 0; i < n; i++) {
    const a = r.range(0, TAU);
    const rr = Math.sqrt(r.next()) * 0.3;
    const s = r.range(0.05, 0.1);
    put(
      acc,
      hi ? new THREE.OctahedronGeometry(s, 0) : new THREE.TetrahedronGeometry(s * 1.4, 0),
      [Math.cos(a) * rr * 1.15, 0.5 - rr * 0.22 + r.range(0, 0.05), Math.sin(a) * rr * 0.8],
      tones[i % 3],
      { q: qEuler(r.range(0, 3), r.range(0, 3), r.range(0, 3)), ...lit(0.45), s: [1, 0.8, 1.2] },
    );
  }
  if (hi) {
    // scoop leaning on the crate
    put(acc, cylB(0.025, 0.025, 0.55, 4), [0.5, 0.0, 0.2], K.woodDark, {
      q: qEuler(0.2, 0, -0.45),
      aoAmt: 0,
    });
    put(acc, new THREE.CylinderGeometry(0.12, 0.08, 0.1, 6), [0.52, 0.5, 0.2], K.steelLight, {
      aoAmt: 0,
    });
  }
  return acc.finish(rng, false, true);
}

/* ================================== sampleShelf =============================== */

const VASES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [0, 0],
    [0.07, 0],
    [0.13, 0.09],
    [0.1, 0.2],
    [0.05, 0.27],
    [0.08, 0.33],
    [0.06, 0.33],
    [0, 0.31],
  ],
  [
    [0, 0],
    [0.06, 0],
    [0.15, 0.12],
    [0.14, 0.2],
    [0.04, 0.3],
    [0.045, 0.4],
    [0.07, 0.43],
    [0, 0.42],
  ],
  [
    [0, 0],
    [0.09, 0],
    [0.12, 0.06],
    [0.08, 0.18],
    [0.1, 0.26],
    [0.07, 0.3],
    [0, 0.29],
  ],
  [
    [0, 0],
    [0.1, 0],
    [0.16, 0.1],
    [0.08, 0.22],
    [0.12, 0.3],
    [0, 0.31],
  ],
];

function sampleShelf({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  if (!hi) {
    for (const sx of [-1, 1]) bx(acc, 0.07, 1.0, 0.42, sx * 0.52, 0, 0, K.woodDark);
    bx(acc, 1.0, 0.9, 0.04, 0, 0.05, -0.19, K.woodLight);
    for (const y of [0.05, 0.42]) bx(acc, 1.07, 0.05, 0.42, 0, y, 0, K.wood);
    bx(acc, 0.9, 0.3, 0.2, 0, 0.1, 0.02, G.violet, lit(0.4));
    bx(acc, 0.9, 0.3, 0.2, 0, 0.47, 0.02, variant % 2 === 1 ? G.orange : G.amber, lit(0.4));
    return acc.finish(rng, false, true);
  }
  const seconds = variant % 2 === 1;
  // frame: two side boards, three shelves, a back board
  for (const sx of [-1, 1]) bx(acc, 0.07, 1.0, 0.42, sx * 0.52, 0, 0, K.woodDark, { aoAmt: 0.2 });
  bx(acc, 1.0, 0.9, 0.04, 0, 0.05, -0.19, K.woodLight, { aoAmt: 0.25 });
  for (const y of [0.05, 0.42, 0.78]) bx(acc, 1.07, 0.05, 0.42, 0, y, 0, K.wood, { aoAmt: 0.1 });
  bx(acc, 1.12, 0.05, 0.46, 0, 0.98, 0, K.woodDark, { aoAmt: 0 });
  // the vases
  const r = rng.fork('vases');
  const hues = [G.violet, G.amber, G.ruby, G.mint, G.sky, G.pink, G.orange, G.lavender];
  const slots: Array<[number, number, number]> = [
    [-0.34, 0.1, 0],
    [0.0, 0.1, 1],
    [0.33, 0.1, 2],
    [-0.28, 0.47, 3],
    [0.12, 0.47, 1],
  ];
  slots.forEach(([x, y, k], i) => {
    const wob = seconds ? r.range(-0.22, 0.22) : 0;
    const prof = VASES[k % VASES.length];
    put(acc, solidLathe(prof, hi ? 8 : 5), [x, y, 0.02], hues[(i * 3 + variant) % hues.length], {
      q: qEuler(wob, 0, wob * 0.6),
      s: seconds ? [1.1, 0.88 + r.range(0, 0.1), 1.1] : 1,
      ...lit(0.4),
    });
  });
  if (!hi) return acc.finish(rng, false, true);
  // price cards
  for (const [x, y] of [
    [-0.34, 0.09],
    [0.33, 0.09],
  ] as const)
    put(acc, baseBox(0.12, 0.07, 0.02), [x, y + 0.0, 0.2], K.paper, {
      q: qEuler(-0.4, 0, 0),
      aoAmt: 0,
    });
  if (seconds) {
    // big lopsided bowl on top (the gull's landing spot) and a "2nd" board
    put(
      acc,
      solidLathe(
        [
          [0, 0],
          [0.12, 0],
          [0.3, 0.1],
          [0.42, 0.24],
          [0.38, 0.25],
          [0.26, 0.15],
          [0.0, 0.09],
        ],
        10,
      ),
      [0.02, 1.02, 0.02],
      G.orange,
      { q: qEuler(0.07, 0, 0.09), s: [1, 1, 0.85], double: true, ...lit(0.4) },
    );
    bx(acc, 0.34, 0.26, 0.05, -0.28, 0.78 + 0.05, 0.2, K.paper, {
      q: qEuler(-0.2, 0, 0.06),
      aoAmt: 0,
    });
    // a seven-segment style "2": top, upper right, middle, lower left, bottom
    const sg: Array<[number, number, number, number]> = [
      [0, 0.1, 0.16, 0.035],
      [0.07, 0.055, 0.035, 0.09],
      [0, 0.0, 0.16, 0.035],
      [-0.07, -0.055, 0.035, 0.09],
      [0, -0.1, 0.16, 0.035],
    ];
    for (const [sx, sy, sw, sh] of sg)
      put(acc, baseBox(sw, sh, 0.03), [-0.28 + sx, 0.9 + sy + 0.02, 0.236], G.ruby, {
        q: qEuler(-0.2, 0, 0.06),
        aoAmt: 0,
      });
  }
  return acc.finish(rng, false, true);
}

/* ================================== blowpipeRack ============================== */

function blowpipeRack({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  if (!hi) {
    for (const sx of [-1, 1]) bx(acc, 0.1, 1.5, 0.12, sx * 0.55, 0, -0.2, K.woodDark);
    bx(acc, 1.2, 0.1, 0.1, 0, 1.1, -0.18, K.wood);
    for (let i = 0; i < 3; i++)
      put(acc, baseBox(0.07, 1.7, 0.07), [-0.3 + i * 0.3, 0.03, 0.1], K.steelLight, {
        q: qEuler(-0.17, 0, 0),
      });
    return acc.finish(rng, false, true);
  }
  // peg board on two posts, two rails
  for (const sx of [-1, 1]) bx(acc, 0.1, 1.5, 0.12, sx * 0.55, 0, -0.2, K.woodDark, { aoAmt: 0.2 });
  bx(acc, 1.2, 0.1, 0.1, 0, 1.1, -0.18, K.wood, { aoAmt: 0.1 });
  bx(acc, 1.2, 0.1, 0.14, 0, 0.35, -0.04, K.wood, { aoAmt: 0.1 });
  if (hi) {
    for (const sx of [-1, 1])
      bx(acc, 0.14, 0.05, 0.62, sx * 0.55, 0.0, -0.05, K.woodDark, { aoAmt: 0.1 });
    for (let i = 0; i < 3; i++)
      put(acc, cylB(0.02, 0.02, 0.1, 4), [-0.3 + i * 0.3, 1.2, -0.12], K.came, {
        q: qEuler(Math.PI / 2, 0, 0),
        aoAmt: 0,
      });
  }
  // six pipes leaning back against the top rail; two have a cooled gather in colour
  const tips = [G.violet, null, G.amber, null, G.ruby, null] as const;
  for (let i = 0; i < 6; i++) {
    const x = -0.42 + i * 0.168;
    const lean = 0.17 + (i % 2) * 0.02;
    const q = qEuler(-lean, 0, 0);
    put(acc, cylB(0.03, 0.03, 1.72, hi ? 5 : 4), [x, 0.03, 0.1], K.steelLight, { q, aoAmt: 0.05 });
    put(acc, cylB(0.052, 0.052, 0.22, hi ? 6 : 4), [x, 0.03, 0.1], K.woodLight, { q, aoAmt: 0.05 });
    const tc = tips[i];
    const top = V(0, 1.72, 0)
      .applyQuaternion(q)
      .add(V(x, 0.03, 0.1));
    if (tc)
      put(acc, new THREE.IcosahedronGeometry(0.075, hi ? 1 : 0), top, tc, {
        s: [1, 1.2, 1],
        ...lit(0.5),
      });
    else if (hi)
      put(acc, cylB(0.045, 0.03, 0.08, 5), top.clone().add(V(0, -0.04, 0)), K.came, {
        q,
        aoAmt: 0,
      });
  }
  if (hi) {
    // jacks hanging from a peg
    for (const s of [-1, 1])
      put(acc, baseBox(0.035, 0.5, 0.035), [-0.46 + s * 0.035, 0.65, -0.12], K.steelPale, {
        q: qEuler(0, 0, s * 0.06),
        aoAmt: 0,
      });
  }
  return acc.finish(rng, false, true);
}

/* ================================== rainbowArc ================================ */

export const RAINBOW = { r: 14, band: 0.55, thick: 0.2 } as const;
/** Outer -> inner. */
const BANDS = [G.ruby, G.orange, G.sun, G.mint, G.sky, G.violet, G.lavender] as const;

function rainbowArc({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const n = hi ? 56 : 14;
  const hz = RAINBOW.thick / 2;
  BANDS.forEach((c, bi) => {
    const ro = RAINBOW.r - bi * RAINBOW.band;
    const ri = ro - RAINBOW.band;
    const pos: number[] = [];
    const P = (r: number, t: number, z: number): number[] => [Math.cos(t) * r, Math.sin(t) * r, z];
    const tri = (...v: number[][]): void => {
      for (const p of v) pos.push(...p);
    };
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * Math.PI;
      const t1 = ((i + 1) / n) * Math.PI;
      const A = P(ri, t0, hz);
      const B = P(ro, t0, hz);
      const C = P(ro, t0, -hz);
      const D = P(ri, t0, -hz);
      const A1 = P(ri, t1, hz);
      const B1 = P(ro, t1, hz);
      const C1 = P(ro, t1, -hz);
      const D1 = P(ri, t1, -hz);
      tri(A, B, B1, A, B1, A1); // front
      tri(D, D1, C1, D, C1, C); // back
      if (hi) {
        tri(B, C, C1, B, C1, B1); // outer
        tri(A, D1, D, A, A1, D1); // inner
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    put(acc, g, [0, 0, 0], c, { ...lit(1), double: !hi, noJitter: true });
  });
  return acc.finish(rng, false, true);
}

/* ============================== giantTree v3 (vitray) ========================= */

/** Canopy blobs of geo/landmarks.ts giantTree (x, y, z, radius) — the panels sit on their shells. */
const TREE_BLOBS = [
  [0, 14.0, 0, 4.2],
  [3.4, 12.4, 0.6, 3.1],
  [-3.2, 12.8, 1.4, 3.1],
  [0.4, 13.0, -3.3, 3.0],
  [1.0, 16.0, 0.6, 2.8],
] as const;

/** Panel placements: [blob, azimuth, elevation, size, colour index]. */
const VITRAY: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0, 1.5, 0.3, 1.5, 0],
  [0, 0.4, 0.55, 1.1, 5],
  [0, 2.6, 0.5, 1.1, 2],
  [0, 5.4, 0.35, 1.2, 4],
  [0, 3.9, 0.7, 1.0, 7],
  [1, 0.9, 0.3, 1.0, 1],
  [1, 5.9, 0.6, 0.9, 6],
  [2, 3.1, 0.35, 1.0, 3],
  [2, 1.8, 0.8, 0.9, 0],
  [3, 4.7, 0.3, 1.1, 5],
  [3, 5.4, 0.7, 0.9, 2],
  [4, 1.2, 0.55, 1.0, 4],
  [4, 3.4, 0.4, 0.9, 7],
  [1, 2.2, 0.9, 0.9, 3],
  [2, 4.6, 0.5, 1.0, 5],
  [3, 2.4, 0.5, 1.0, 1],
];

const KITE: Pt[] = [
  [0, 0.62],
  [0.36, 0.05],
  [0, -0.58],
  [-0.36, 0.05],
];

export function canopyVitrayInto(acc: Acc): void {
  VITRAY.forEach(([bi, az, el, size, ci]) => {
    const [bx0, by0, bz0, br] = TREE_BLOBS[bi];
    const d = V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const at = V(bx0, by0, bz0).addScaledVector(d, br * 0.99);
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(d, V(0, 0, 0), V(0, 1, 0)),
    );
    const s = size * 1.9;
    const pts = KITE.map(([x, y]) => [x * s, y * s] as const);
    const sway = (p: THREE.Vector3): number => clamp01((p.y / 18.2) ** 2);
    put(acc, polyGeo(offsetPoly(pts, 0.05), 0.12), at, K.came, { q, aoAmt: 0, windAbs: sway });
    // two-tone leaf: a lower and an upper half in neighbouring hues
    const c0 = GLASS_WHEEL[ci % GLASS_WHEEL.length];
    const c1 = GLASS_WHEEL[(ci + 2) % GLASS_WHEEL.length];
    const up: Pt[] = [pts[0], pts[1], [0, 0.0], pts[3]];
    const dn: Pt[] = [pts[3], [0, 0.0], pts[1], pts[2]];
    put(acc, polyGeo(offsetPoly(up, -0.025), 0.2), at, c0, { q, ...lit(1), windAbs: sway });
    put(acc, polyGeo(offsetPoly(dn, -0.025), 0.2), at, c1, { q, ...lit(1), windAbs: sway });
  });
  // studio window in the trunk hollow: arched warm window with a roundel above
  const zf = 1.38;
  put(acc, baseBox(1.1, 1.05, 0.2), [0, 0.5, zf - 0.06], K.woodDark, { aoAmt: 0.2, windAbs: 0 });
  put(
    acc,
    new THREE.CylinderGeometry(0.55, 0.55, 0.2, 10, 1, false, 0, Math.PI)
      .rotateX(Math.PI / 2)
      .rotateZ(0),
    [0, 1.55, zf - 0.06],
    K.woodDark,
    {
      aoAmt: 0.1,
      windAbs: 0,
    },
  );
  const arch: Pt[] = [
    [-0.4, 0.62],
    [0.4, 0.62],
    [0.4, 1.4],
  ];
  for (let i = 1; i < 8; i++) arch.push(polar(0, 1.4, 0.4, (i / 8) * Math.PI));
  arch.push([-0.4, 1.4]);
  put(acc, polyGeo(arch, 0.16), [0, 0, zf + 0.06], K.window, { ...lit(1), windAbs: 0 });
  for (const sx of [-0.0])
    put(acc, baseBox(0.06, 1.2, 0.2), [sx, 0.62, zf + 0.06], K.came, { aoAmt: 0, windAbs: 0 });
  put(acc, baseBox(0.9, 0.06, 0.2), [0, 1.1, zf + 0.06], K.came, { aoAmt: 0, windAbs: 0 });
}

/** `giantTree` variant `variant` (3) = the Atelier Tree (v2) plus the canopy vitray; LOD1 = v2. */
export function withCanopyVitray(base: PropBuilder, vitrayVariant = 3): PropBuilder {
  return (o) => {
    if (o.variant !== vitrayVariant) return base(o);
    const g = base({ ...o, variant: 2 });
    if (o.lod === 1) return g;
    const acc = new Acc();
    canopyVitrayInto(acc);
    const extra = acc.finish(o.rng.fork('vitray'), false, true);
    const merged = mergeGeometries([g, extra], false);
    tagStained(merged, g.getAttribute('position').count); // the vitray panels (TASK-440)
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    merged.userData = { ...g.userData, tris: merged.getAttribute('position').count / 3 };
    return merged;
  };
}

/* ======================== galleryPavilion v2 (glass roof) ===================== */

/** Faceted tri pane: flat slab + a low three-facet cap, saddled on the roof plane. */
function gemTri(
  acc: Acc,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  colour: string,
  hint: THREE.Vector3,
): void {
  const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  if (n.dot(hint) < 0) n.negate();
  const cen = a
    .clone()
    .add(b)
    .add(c)
    .multiplyScalar(1 / 3);
  const pull = (p: THREE.Vector3): THREE.Vector3 => p.clone().lerp(cen, 0.06);
  const A = pull(a);
  const B = pull(b);
  const C = pull(c);
  const apex = cen.clone().addScaledVector(n, 0.16);
  const top = (p: THREE.Vector3, d = 0.07): THREE.Vector3 => p.clone().addScaledVector(n, d);
  const down = (p: THREE.Vector3): THREE.Vector3 => p.clone().addScaledVector(n, -0.09);
  const pts: number[] = [];
  const T = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3): void => {
    // wind so the face normal agrees with the roof's outward normal
    const m = q.clone().sub(p).cross(r.clone().sub(p));
    const o = m.dot(n) >= 0 || false ? [p, q, r] : [p, r, q];
    // faces on the underside / sides are wound by their own outward guess: use the centroid test
    const mid = p
      .clone()
      .add(q)
      .add(r)
      .multiplyScalar(1 / 3);
    const outward = mid.clone().sub(cen.clone().addScaledVector(n, -0.01));
    const flip = m.dot(outward) < 0;
    const order = flip ? [p, r, q] : o;
    for (const v of order) pts.push(v.x, v.y, v.z);
  };
  // cap: apex over the three raised corners
  T(top(A), top(B), apex);
  T(top(B), top(C), apex);
  T(top(C), top(A), apex);
  // slab sides (corners raised -> lowered)
  const quad = (p: THREE.Vector3, q: THREE.Vector3): void => {
    T(top(p), down(p), down(q));
    T(top(p), down(q), top(q));
  };
  quad(A, B);
  quad(B, C);
  quad(C, A);
  // underside
  T(down(A), down(C), down(B));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  put(acc, g, [0, 0, 0], colour, { ...lit(1) });
}

function glassPavilion({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const PH = 2.5;
  const hue = [G.ruby, G.orange, G.amber, G.sky, G.violet, G.mint, G.pink, G.sun];
  if (!hi) {
    // far proxy (TASK-425): slab, back wall, posts, eaves and the hip roof as the LOD0 lattice of
    // glass panes, flat (same hues per pane, so the far colour matches)
    bx(acc, 4, 0.16, 4, 0, 0, 0, K.paper);
    bx(acc, 3.6, 2.3, 0.14, 0, 0.16, -1.85, K.cream);
    for (const x of [-1.8, 1.8])
      for (const z of [-1.8, 1.8]) put(acc, cylB(0.1, 0.1, PH, 4), [x, 0.16, z], K.plumDeep);
    const e = 2.4;
    const apex = V(0, PH + 1.15, 0);
    const cs = [V(-e, PH, e), V(e, PH, e), V(e, PH, -e), V(-e, PH, -e)];
    const n = 3;
    let k = 0;
    for (let f = 0; f < 4; f++) {
      const p0 = cs[f];
      const p1 = cs[(f + 1) % 4];
      const at = (i: number, j: number): THREE.Vector3 =>
        p0
          .clone()
          .lerp(p1, j / Math.max(1, n - i))
          .lerp(apex, i / n);
      const pane = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
        const g = new THREE.BufferGeometry();
        g.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            [a, b, c].flatMap((p) => [p.x, p.y, p.z]),
            3,
          ),
        );
        put(acc, g, [0, 0, 0], hue[k++ % hue.length], { ...lit(1), double: true });
      };
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n - i; j++) {
          pane(at(i, j), at(i, j + 1), at(i + 1, j));
          if (j < n - i - 1) pane(at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
        }
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      put(
        acc,
        baseBox(p0.distanceTo(p1) + 0.2, 0.14, 0.16),
        [mid.x, PH - 0.12, mid.z],
        K.plumDeep,
        {
          q: qEuler(0, Math.atan2(p1.x - p0.x, p1.z - p0.z) - Math.PI / 2, 0),
        },
      );
    }
    return acc.finish(rng, false, true);
  }
  bx(acc, 4, 0.16, 4, 0, 0, 0, K.paper, { aoAmt: 0.15 });
  if (hi) bx(acc, 4.2, 0.08, 4.2, 0, 0, 0, K.cream, { aoAmt: 0.2 });
  for (const x of [-1.8, 1.8])
    for (const z of [-1.8, 1.8])
      put(acc, cylB(0.1, 0.1, PH, hi ? 6 : 4), [x, 0.16, z], K.plumDeep, { aoAmt: 0.1 });
  // back wall with three roundels
  bx(acc, 3.6, 2.3, 0.14, 0, 0.16, -1.85, K.cream, { aoAmt: 0.12 });
  [-1.1, 0, 1.1].forEach((x, i) =>
    roundelInto(
      acc,
      [x, 1.35, -1.76],
      0.46,
      [
        [G.ruby, G.amber, G.sky, G.mint],
        [G.violet, G.pink, G.orange, G.sun],
        [G.sky, G.mint, G.amber, G.ruby],
      ][i],
      undefined,
      hi,
    ),
  );
  // hip roof of faceted glass over a came pyramid
  const e = 2.4;
  const apex = V(0, PH + 1.15, 0);
  const corners = [V(-e, PH, e), V(e, PH, e), V(e, PH, -e), V(-e, PH, -e)];
  put(
    acc,
    new THREE.ConeGeometry(Math.SQRT1_2 * 2 * e, 1.15, 4)
      .rotateY(Math.PI / 4)
      .translate(0, 0.575, 0),
    [0, PH - 0.12, 0],
    K.came,
    {
      double: true,
      aoAmt: 0,
    },
  );
  const nSub = hi ? 3 : 1;
  let k = 0;
  for (let f = 0; f < 4; f++) {
    const p0 = corners[f];
    const p1 = corners[(f + 1) % 4];
    const hint = p0
      .clone()
      .add(p1)
      .multiplyScalar(0.5)
      .add(V(0, 0.8, 0));
    const at = (i: number, j: number): THREE.Vector3 => {
      // triangular lattice between the eave edge (p0->p1) and the apex
      const r = i / nSub;
      const base = p0.clone().lerp(p1, j / Math.max(1, nSub - i));
      return base.lerp(apex, r);
    };
    for (let i = 0; i < nSub; i++) {
      const cnt = nSub - i;
      for (let j = 0; j < cnt; j++) {
        gemTri(acc, at(i, j), at(i, j + 1), at(i + 1, j), hue[k++ % hue.length], hint);
        if (j < cnt - 1)
          gemTri(acc, at(i, j + 1), at(i + 1, j + 1), at(i + 1, j), hue[k++ % hue.length], hint);
      }
    }
  }
  for (let f = 0; f < 4; f++) {
    const p0 = corners[f];
    const p1 = corners[(f + 1) % 4];
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const len = p0.distanceTo(p1);
    put(acc, baseBox(len + 0.2, 0.14, 0.16), [mid.x, PH - 0.12, mid.z], K.plumDeep, {
      q: qEuler(0, Math.atan2(p1.x - p0.x, p1.z - p0.z) - Math.PI / 2, 0),
      aoAmt: 0,
    });
  }
  // finial: a hex bipyramid in amber
  put(
    acc,
    new THREE.ConeGeometry(0.14, 0.3, 6).translate(0, 0.15, 0),
    [0, apex.y + 0.02, 0],
    G.sun,
    { ...lit(1.3) },
  );
  put(
    acc,
    new THREE.ConeGeometry(0.14, 0.2, 6).rotateX(Math.PI).translate(0, -0.1, 0),
    [0, apex.y + 0.02, 0],
    G.amber,
    { ...lit(1.3) },
  );
  if (hi) {
    addGlyph(acc, 'prism', V(0, PH + 0.1, 2.0), { size: 0.34, color: G.plum, depth: 0.05 });
    bx(acc, 3.6, 0.1, 0.14, 0, PH + 0.06, 1.95, K.plumDeep, { aoAmt: 0 });
  }
  return acc.finish(rng, false, true);
}

/**
 * `galleryPavilion` variant `v` = the glass-roof pavilion, both LODs (TASK-425: the shared v1 LOD1
 * kept the plain roof colour, a ΔE 43 pop at the T2 swap once the gallery was placed).
 */
export function withGlassPavilion(base: PropBuilder, glassVariant = 2): PropBuilder {
  return (o) => {
    if (o.variant !== glassVariant) return base(o);
    const g = glassPavilion(o);
    if (o.lod === 0) tagStained(g); // the glass roof (TASK-440)
    return g;
  };
}

/* ========================== bunting v3 (glass chime line) ===================== */

const DROP_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.06, 0.01],
  [0.1, 0.07],
  [0.115, 0.15],
  [0.095, 0.26],
  [0.055, 0.37],
  [0.02, 0.46],
  [0, 0.5],
];

function glassChimeLine({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = new Acc();
  const px = 3;
  const ph = 2.6;
  for (const s of [-1, 1]) {
    put(acc, cylB(0.07, 0.055, ph, 5, !hi), [s * px, 0, 0], K.wood, { aoAmt: 0.25 });
    if (hi)
      put(acc, new THREE.IcosahedronGeometry(0.1, 0), [s * px, ph + 0.02, 0], G.amber, {
        ...lit(1),
      });
  }
  const sag = 0.55;
  const a = V(-px, ph - 0.1, 0);
  const b = V(px, ph - 0.1, 0);
  const rope: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    rope.push(
      a
        .clone()
        .lerp(b, t)
        .setY(ph - 0.1 - sag * 4 * t * (1 - t)),
    );
  }
  put(acc, tubeAlong(rope, 0.025, 3), [0, 0, 0], K.woodLight, { aoAmt: 0 });
  const r = rng.fork('chime');
  const n = hi ? 9 : 4;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.6) / (n + 0.2);
    const x = -px + 2 * px * t;
    const y = ph - 0.1 - sag * 4 * t * (1 - t);
    const cord = hi ? r.range(0.1, 0.5) : 0.2;
    const c = GLASS_WHEEL[(i * 3 + 1) % GLASS_WHEEL.length];
    const sw = (p: THREE.Vector3): number => 0.15 + 0.85 * clamp01((y - p.y) / (cord + 0.55));
    if (hi)
      put(acc, tubeAlong([V(x, y, 0), V(x, y - cord, 0)], 0.012, 3), [0, 0, 0], K.came, {
        aoAmt: 0,
        windAbs: sw,
      });
    put(acc, solidLathe(DROP_PROFILE, hi ? 8 : 5), [x, y - cord - 0.5, 0], c, {
      s: hi ? 1 : 1.3,
      ...lit(0.7),
      windAbs: sw,
    });
    if (hi)
      put(acc, new THREE.TorusGeometry(0.05, 0.016, 3, 6), [x, y - cord + 0.01, 0], K.brass, {
        aoAmt: 0,
        windAbs: sw,
      });
  }
  return acc.finish(rng, false, true);
}

/** `bunting` variant `v` = the glass chime line; LOD1 = the base's variant 2. */
export function withGlassChimeLine(base: PropBuilder, chimeVariant = 3): PropBuilder {
  return (o) => {
    if (o.variant !== chimeVariant) return base(o);
    return o.lod === 1 ? base({ ...o, variant: 2 }) : glassChimeLine(o);
  };
}

/* =============================== lantern boat hull ============================ */

const HULL: Pt[] = [
  [-0.68, -2.5],
  [0.68, -2.5],
  [0.9, -0.9],
  [0.8, 1.0],
  [0.34, 2.0],
  [0, 2.55],
  [-0.34, 2.0],
  [-0.8, 1.0],
  [-0.9, -0.9],
];

/** Sailboat v5 "fener kayığı": dark violet hull, six glass lanterns on the rails, a lateen sail. */
export function lanternBoat({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = new Acc();
  const hullH = 0.75;
  const ext = (depth: number, s = 1): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(
      new THREE.Shape(HULL.map(([x, y]) => new THREE.Vector2(x * s, y * (s > 0.95 ? 1 : 0.96)))),
      {
        depth,
        bevelEnabled: false,
      },
    ).rotateX(Math.PI / 2);
  if (hi) {
    put(acc, ext(0.4, 0.88), [0, 0.4, 0], K.plumDeep, { aoAmt: 0.25, windAbs: 0 });
    put(
      acc,
      ext(0.35, 1.04),
      [0, hullH, 0],
      (p) => (p.y > hullH - 0.01 ? col(K.woodLight) : col(G.plum)),
      {
        aoAmt: 0.1,
        windAbs: 0,
      },
    );
  } else
    put(
      acc,
      ext(hullH),
      [0, hullH, 0],
      (p) => (p.y > hullH * 0.5 ? col(G.plum) : col(K.plumDeep)),
      { aoAmt: 0.2, windAbs: 0 },
    );
  // rails and lantern arms
  const lanterns: Array<[number, number, number]> = [
    [-0.84, 0.9, 0],
    [0.84, 0.9, 1],
    [-0.9, -0.5, 2],
    [0.9, -0.5, 3],
    [-0.7, -1.9, 4],
    [0.7, -1.9, 5],
  ];
  for (const [lx, lz, i] of lanterns) {
    const sx = Math.sign(lx);
    if (hi) {
      put(acc, cylB(0.04, 0.04, 0.7, 4), [lx, hullH, lz], K.came, { aoAmt: 0, windAbs: 0 });
      put(acc, baseBox(0.34, 0.04, 0.04), [lx + sx * 0.14, hullH + 0.7, lz], K.came, {
        aoAmt: 0,
        windAbs: 0,
      });
    }
    const hx = lx + sx * 0.3;
    const colr = GLASS_WHEEL[(i * 3 + 1) % GLASS_WHEEL.length];
    put(
      acc,
      new THREE.CylinderGeometry(0.15, 0.2, 0.36, hi ? 6 : 4).translate(0, 0.18, 0),
      [hx, hullH + 0.2 + (hi ? 0 : 0.4), lz],
      colr,
      {
        ...lit(1),
        windAbs: 0,
      },
    );
    if (hi)
      put(acc, new THREE.ConeGeometry(0.22, 0.14, 6), [hx, hullH + 0.2 + 0.43, lz], K.came, {
        aoAmt: 0,
        windAbs: 0,
      });
  }
  // mast, masthead lantern, lateen sail (cream with a violet stripe)
  const mastZ = 0.35;
  put(acc, cylB(0.09, 0.06, 4.3, hi ? 5 : 4), [0, hullH - 0.1, mastZ], K.woodDark, {
    aoAmt: 0.1,
    windAbs: 0,
  });
  put(
    acc,
    new THREE.IcosahedronGeometry(0.2, hi ? 1 : 0),
    [0, hullH + 4.35, mastZ],
    facets([G.amber, G.sun, G.orange], hullH + 4.1, 0.5, 0.4, 3),
    {
      ...lit(1.2),
      windAbs: 0,
    },
  );
  const Ls = 2.1;
  const H = 3.4;
  const y0 = hullH + 0.8;
  const pos: number[] = [];
  const grid = (u: number, v: number): number[] => [
    0.38 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v) + 0.04,
    y0 + v * H * (1 - 0.92 * u),
    mastZ - 0.06 - u * Ls,
  ];
  const nu = hi ? 4 : 1;
  const nv = hi ? 4 : 1;
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = grid(i / nu, j / nv);
      const b = grid((i + 1) / nu, j / nv);
      const c = grid((i + 1) / nu, (j + 1) / nv);
      const d = grid(i / nu, (j + 1) / nv);
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  const sailG = new THREE.BufferGeometry();
  sailG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  put(
    acc,
    sailG,
    [0, 0, 0],
    (p) =>
      Math.abs(p.y - (y0 + 1.5 * (1 - 0.5 * ((mastZ - p.z) / Ls)))) < 0.32
        ? col(G.plum)
        : col(K.cream),
    {
      double: true,
      aoAmt: 0,
      ao: () => 1,
      windAbs: (p) => clamp01((mastZ - p.z) / Ls),
    },
  );
  void rng;
  return acc.finish(rng, false, true);
}

/* ---------------------------------- registry --------------------------------- */

export const CULTURE_DESIGN_GEO: readonly PropGeoDef[] = [
  { id: 'hotShop', variants: 3, build: hotShop, footprint: 1.6, height: 2.75, windy: false },
  {
    id: 'prismSculpture',
    variants: 3,
    build: prismSculpture,
    footprint: 0.7,
    height: 2.3,
    windy: false,
  },
  {
    id: 'stainedScreen',
    variants: 2,
    build: stainedScreen,
    footprint: 1.0,
    height: 2.3,
    windy: false,
  },
  { id: 'gatherRing', variants: 1, build: gatherRing, footprint: 1.5, height: 1.5, windy: false },
  {
    id: 'causticDecal',
    variants: 5,
    build: causticDecal,
    footprint: 0.5,
    height: 0.06,
    windy: false,
  },
  { id: 'glassOrb', variants: 3, build: glassOrb, footprint: 0.5, height: 0.9, windy: false },
  { id: 'culletCrate', variants: 5, build: culletCrate, footprint: 0.5, height: 0.6, windy: false },
  { id: 'sampleShelf', variants: 2, build: sampleShelf, footprint: 0.7, height: 1.3, windy: false },
  {
    id: 'blowpipeRack',
    variants: 1,
    build: blowpipeRack,
    footprint: 0.7,
    height: 1.7,
    windy: false,
  },
  {
    id: 'rainbowArc',
    variants: 1,
    build: rainbowArc,
    footprint: RAINBOW.r,
    height: RAINBOW.r,
    windy: false,
  },
];

export type { Lod };
void bevBox;
void AXX;
void TAU;
