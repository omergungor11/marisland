/**
 * Vegetation, rock and shore-litter v2 (TASK-599, D-174): `canopyTree`, `leanPalm`, `floraBush`,
 * `boulder`, `kelp`, `driftLog`. New defs (the old ones stay byte-identical); the island colour set
 * and the shape ride in the variant index (content/biomes.ts). Pivot on the ground, 1 u = 1 m.
 */
import * as THREE from 'three';
import {
  BIOME_IDS,
  BIOMES,
  BOULDER,
  BOULDER_VARIANTS_PER_SET,
  KELP,
  splitVariant,
} from '../content/biomes.ts';
import { GRASS, ROCK, WALLS, WOOD } from '../content/palette.ts';
import type { Rng } from '../core/rng.ts';
import { Acc, blob, col, createNoise, frustum, gradY, mat, qEuler } from './kit.ts';
import { leaf } from './trees.ts';
import type { BuildOpts } from './types.ts';

const TAU = Math.PI * 2;
const V3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Fruit / blossom dots on an ellipsoid canopy (centre `c`, semi-axes `rad`), upper half only. */
function canopyDots(
  acc: Acc,
  r: Rng,
  hex: string | null,
  c: THREE.Vector3,
  rad: THREE.Vector3,
  n: number,
): void {
  if (!hex) return;
  const g = new THREE.TetrahedronGeometry(0.12, 0);
  for (let i = 0; i < n; i++) {
    const a = r.range(0, TAU);
    const el = r.range(0.1, 1.1);
    const d = V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    acc.add(g, {
      m: mat(
        c.clone().add(d.multiply(rad).multiplyScalar(0.98)),
        qEuler(r.range(0, 3), r.range(0, 3), 0),
      ),
      color: col(hex),
      aoAmt: 0,
    });
  }
}

/** Nominal heights of the three canopy silhouettes (tall oval, umbrella, layered). */
export const CANOPY_HEIGHTS = [6.6, 5.0, 5.6] as const;

/** Canopy v2: 0 tall oval (poplar / cypress), 1 umbrella (acacia / stone pine), 2 layered tiers. */
export function canopyTree({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const { biome, shape } = splitVariant('canopyTree', variant);
  const r = rng.fork('canopy');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const H = CANOPY_HEIGHTS[shape] * r.range(0.96, 1.04);
  const dec = biome.deciduous;
  const fn = gradY([dec[2], dec[1], dec[0]], H * 0.2, H);
  const radial = lod === 0 ? 7 : 4;
  const d = lod === 0 ? 1 : 0;
  const bark = shape === 0 ? WOOD.dark : WOOD.logs;
  const wood = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number): void => {
    const t = frustum(a, b, r0, r1, radial);
    acc.add(t.geo, { m: t.m, color: col(bark), windMul: 0.8, aoAmt: 0.25, cls: 'wood' });
  };
  const lump = (
    rr: number,
    at: [number, number, number],
    s: [number, number, number],
    i: number,
  ): void => {
    acc.add(blob(rr, d, noise, 0.1, 1.2, i * 3.1), {
      m: mat(at, null, s),
      color: fn,
      windMul: 1,
      aoAmt: 0.22,
    });
  };
  const dots = (c: [number, number, number], rad: [number, number, number], n: number): void => {
    if (lod === 0) canopyDots(acc, r.fork('dots'), biome.dots, V3(...c), V3(...rad), n);
  };
  if (shape === 0) {
    // tall oval: short trunk, a long ellipsoid crown with a smaller one on its shoulder
    wood(V3(0, 0, 0), V3(0, H * 0.34, 0), 0.24, 0.14);
    lump(1.15, [0, H * 0.62, 0], [0.85, 1.75, 0.85], 0);
    lump(0.8, [r.range(-0.2, 0.2), H * 0.9, r.range(-0.2, 0.2)], [0.85, 1.2, 0.85], 1);
    dots([0, H * 0.62, 0], [1, 2, 1], 7);
  } else if (shape === 1) {
    // umbrella: forked trunk under a wide flat crown of three squashed lumps
    const lean = r.range(-0.3, 0.3);
    wood(V3(0, 0, 0), V3(lean, H * 0.66, 0), 0.28, 0.15);
    wood(V3(lean * 0.4, H * 0.4, 0), V3(1, H * 0.72, 0.3), 0.14, 0.08);
    wood(V3(lean * 0.4, H * 0.42, 0), V3(-0.95, H * 0.7, -0.35), 0.14, 0.08);
    lump(1.55, [lean, H * 0.8, 0], [1, 0.42, 1], 0);
    lump(1.05, [1.15, H * 0.76, 0.3], [1, 0.42, 1], 1);
    lump(1, [-1.05, H * 0.74, -0.3], [1, 0.42, 1], 2);
    dots([lean, H * 0.8, 0], [1.5, 0.7, 1.5], 7);
  } else {
    // layered: three flattened tiers on a straight trunk, each narrower than the last
    wood(V3(0, 0, 0), V3(0, H * 0.82, 0), 0.22, 0.1);
    const tiers: Array<[number, number]> = [
      [1.45, H * 0.38],
      [1.1, H * 0.6],
      [0.75, H * 0.8],
    ];
    tiers.forEach(([rr, y], i) =>
      lump(rr, [r.range(-0.08, 0.08), y, r.range(-0.08, 0.08)], [1, 0.5, 1], i),
    );
    dots([0, H * 0.6, 0], [1.1, 1.8, 1.1], 7);
  }
  return acc.finish(rng, true);
}

/** Nominal heights of the three palm shapes (leaning, twin, grove). */
export const LEAN_PALM_HEIGHTS = [6.4, 6.6, 4.4] as const;

/** Palm v2: 0 strongly leaning trunk, 1 twin trunk (two crowns), 2 grove of three short trunks. */
export function leanPalm({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const { biome, shape } = splitVariant('leanPalm', variant);
  const r = rng.fork('lpalm');
  const acc = new Acc();
  const noise = createNoise(r.fork('nut'));
  const N = lod === 0 ? 4 : 2;
  const radial = lod === 0 ? 7 : 4;
  const crown = (top: THREE.Vector3, fronds: number, lenMul: number, segs0 = 3): void => {
    if (lod === 0)
      acc.add(blob(0.24, 0, noise, 0.1, 2, 9), {
        m: mat(top.clone().add(V3(0, 0.05, 0)), null, [1, 0.8, 1]),
        color: col(WOOD.dark).multiplyScalar(0.8),
        windMul: 0.5,
        aoAmt: 0.2,
      });
    // leafy heart: a squashed green mass under the fronds so the crown is a volume, not a flat star
    acc.add(blob(0.55 * Math.sqrt(lenMul), 0, noise, 0.12, 1.6, 4), {
      m: mat(top.clone().add(V3(0, 0.16, 0)), null, [1, 0.62, 1]),
      color: col(biome.palm[1]),
      windMul: 0.8,
      aoAmt: 0.15,
    });
    const ph = r.range(0, TAU);
    const n = lod === 0 ? fronds : fronds + 1;
    for (let i = 0; i < n; i++) {
      // LOD0: every third frond stands up (young leaf), the rest arch and hang; LOD1: one segment,
      // alternating raised / drooping so the far crown keeps a dome profile from the side
      const up = i % 3 === 1;
      leaf(acc, {
        origin: top.clone().add(V3(0, 0.12, 0)),
        az: ph + (i / n) * TAU + r.range(-0.15, 0.15),
        len: r.range(2.4, 3.1) * lenMul * (up ? (lod === 0 ? 0.85 : 0.7) : 1),
        segs: lod === 0 ? segs0 : 1,
        width: r.range(0.72, 0.86) * (lod === 0 ? 1.15 : 1.7),
        greens: [biome.palm[0], biome.palm[1]],
        ribHex: biome.palm[1],
        pitch: lod === 0 ? (up ? 0.38 : r.range(-0.12, 0.06)) : up ? 0.3 : -0.3,
      });
    }
    if (lod === 0)
      for (let i = 0; i < 2; i++) {
        const a = ph + i * Math.PI + 0.5;
        acc.add(blob(0.11, 0, noise, 0.05, 2, i), {
          m: mat(top.clone().add(V3(Math.cos(a) * 0.2, -0.08, Math.sin(a) * 0.2))),
          color: col(WOOD.dark),
          windMul: 0.6,
          aoAmt: 0.2,
        });
      }
  };
  /** Curved trunk from `base` bending toward `dir` by `lean` rad; returns its top. */
  const trunk = (
    base: THREE.Vector3,
    H: number,
    dir: THREE.Vector3,
    lean: number,
    r0: number,
  ): THREE.Vector3 => {
    const k = Math.tan(lean) / 2;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push(
        base
          .clone()
          .addScaledVector(dir, k * H * t * t)
          .setY(base.y + H * 0.97 * t),
      );
    }
    for (let i = 0; i < N; i++) {
      const a = r0 + (0.2 - r0) * (i / N);
      const b = r0 + (0.2 - r0) * ((i + 1) / N);
      const f = frustum(pts[i], pts[i + 1], a * 1.1, b * 0.9, radial);
      acc.add(f.geo, {
        m: f.m,
        color: col(i % 2 === 0 ? WOOD.logs : WOOD.dark),
        cls: 'wood',
        windMul: 0.5,
        aoAmt: 0.22,
        groundClamp: true,
      });
    }
    return pts[N];
  };
  // the lean points across the view (+-x, a little spread): every colour set leans like the others
  const az = (r.chance(0.5) ? 0 : Math.PI) + r.range(-0.45, 0.45);
  const dir = V3(Math.cos(az), 0, Math.sin(az));
  if (shape === 0) {
    crown(trunk(V3(0, 0, 0), 6.4 * r.range(0.96, 1.04), dir, r.range(0.5, 0.62), 0.36), 8, 1);
  } else if (shape === 1) {
    crown(trunk(V3(0, 0, 0), 6.6 * r.range(0.97, 1.03), dir, 0.38, 0.34), 6, 1, 2);
    crown(
      trunk(V3(0.15, 0, 0.1), 5.2 * r.range(0.97, 1.03), dir.clone().negate(), 0.34, 0.3),
      6,
      0.92,
      2,
    );
  } else {
    const Hs = [4.4, 3.6, 3];
    for (let i = 0; i < 3; i++) {
      const a = az + (i / 3) * TAU;
      const out = V3(Math.cos(a), 0, Math.sin(a));
      crown(
        trunk(
          out.clone().multiplyScalar(0.45),
          Hs[i] * r.range(0.96, 1.04),
          out,
          r.range(0.2, 0.34),
          0.26,
        ),
        4,
        0.8,
        2,
      );
    }
  }
  return acc.finish(rng, true);
}

/** Nominal heights of the two bush shapes. */
export const FLORA_BUSH_HEIGHTS = [1.15, 0.8] as const;

/** Flowering bush v2: 0 tall mound with flower sprays, 1 low spreading mound; blossom hues by island. */
export function floraBush({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const { biome, shape } = splitVariant('floraBush', variant);
  const r = rng.fork('flora');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const dec = biome.deciduous;
  const fn = gradY([dec[2], dec[1], dec[0]], 0, 1);
  const blobs: Array<{ p: THREE.Vector3; r: number; s: [number, number, number]; d: number }> =
    shape === 0
      ? [
          { p: V3(-0.12, 0.46, 0), r: 0.55, s: [1, 1.1, 1], d: 1 },
          { p: V3(0.3, 0.34, 0.08), r: 0.4, s: [1, 1, 1], d: 0 },
        ]
      : [
          { p: V3(0, 0.26, 0), r: 0.5, s: [1.3, 0.62, 1.2], d: 1 },
          { p: V3(0.55, 0.2, 0.2), r: 0.34, s: [1.2, 0.6, 1.1], d: 0 },
          { p: V3(-0.5, 0.2, -0.22), r: 0.34, s: [1.2, 0.6, 1.1], d: 0 },
        ];
  const used = lod === 0 ? blobs : blobs.slice(0, 1);
  used.forEach((b, i) =>
    acc.add(blob(b.r * r.range(0.95, 1.05), lod === 0 ? b.d : 0, noise, 0.1, 1.3, i * 2.3), {
      m: mat(b.p, null, b.s),
      color: fn,
      cullY: 0.04,
      groundClamp: true,
      aoAmt: 0.22,
    }),
  );
  const nf = lod === 0 ? (shape === 0 ? 9 : 10) : 3;
  const head = new THREE.TetrahedronGeometry(lod === 0 ? 0.11 : 0.16, 0);
  for (let i = 0; i < nf; i++) {
    const b = blobs[i % used.length];
    const a = r.range(0, TAU);
    const el = r.range(0.3, 1.1);
    const dir = V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    acc.add(head, {
      m: mat(
        b.p.clone().add(dir.multiply(V3(...b.s)).multiplyScalar(b.r * 1.02)),
        qEuler(r.range(0, 3), r.range(0, 3), 0),
      ),
      color: col(biome.flowers[i % 2]),
      aoAmt: 0,
    });
  }
  return acc.finish(rng, true);
}

interface Part {
  /** LOD1 stand-in for part 0 when the far shape must keep the full height (stack). */
  l1?: { r: number; at: [number, number, number]; s: [number, number, number] };
  /** 'cyl': tapered column (rb, rt, h), else a noisy blob of radius `r`. */
  cyl?: [number, number, number];
  r: number;
  at: [number, number, number];
  s: [number, number, number];
  d: number;
}

/** The five boulder silhouettes (part 0 is the LOD1 shape). */
const BOULDER_PARTS: readonly (readonly Part[])[] = [
  // 0 pebble group
  [
    { r: 0.42, at: [0, 0.15, 0], s: [1.1, 0.75, 1], d: 1 },
    { r: 0.3, at: [0.6, 0.1, 0.3], s: [1, 0.7, 1], d: 0 },
    { r: 0.25, at: [-0.4, 0.08, 0.5], s: [1, 0.7, 1], d: 0 },
  ],
  // 1 menhir
  [
    { cyl: [0.62, 0.36, 1.9], r: 0.62, at: [0, 0, 0], s: [1, 1, 1], d: 1 },
    { r: 0.34, at: [0.55, 0.12, 0.25], s: [1, 0.7, 1], d: 0 },
  ],
  // 2 slab
  [
    { r: 1, at: [0, 0.14, 0], s: [1.5, 0.28, 1.2], d: 1 },
    { r: 0.55, at: [0.9, 0.1, -0.5], s: [1.2, 0.35, 1], d: 0 },
    { r: 0.28, at: [-0.9, 0.08, 0.6], s: [1, 0.6, 1], d: 0 },
  ],
  // 3 twin boulders leaning on each other
  [
    { r: 0.7, at: [0, 0.4, 0], s: [1, 1.25, 0.95], d: 1 },
    { r: 0.55, at: [0.85, 0.3, 0.1], s: [1, 1.1, 1], d: 0 },
  ],
  // 4 balanced stack
  [
    {
      r: 0.6,
      at: [0, 0.2, 0],
      s: [1.2, 0.6, 1.1],
      d: 1,
      l1: { r: 0.5, at: [0, 0.1, 0], s: [1.1, 1.6, 1] },
    },
    { r: 0.45, at: [0.05, 0.62, 0], s: [1, 0.7, 1], d: 0 },
    { r: 0.3, at: [-0.04, 0.95, 0.04], s: [1, 0.75, 1], d: 0 },
  ],
];

/** Boulder v2: 5 silhouettes x (bare | moss cap | lichen cap), strata bands and a pale strata line. */
export function boulder({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const sil = variant % BOULDER.silhouettes;
  const cap = Math.floor(variant / BOULDER.silhouettes) % BOULDER.caps;
  // variants >= 15 carry an island colour set (`boulderVariant`); 0..14 stay neutral (TASK-680)
  const biomeId = BIOME_IDS[Math.floor(variant / BOULDER_VARIANTS_PER_SET) % BIOME_IDS.length];
  const r = rng.fork('boulder');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const H = BOULDER.heights[sil];
  const bands = [ROCK[2], ROCK[1], ROCK[0]].map(col);
  const line = col(BOULDER.strataLine);
  const moss = (biomeId === 'neutral' ? [GRASS[2], GRASS[3]] : BIOMES[biomeId].moss).map(col);
  const lichen = BOULDER.lichen.map(col);
  const lineY = 0.5 + r.range(-0.05, 0.05);
  const colour = (p: THREE.Vector3): THREE.Color => {
    const t = Math.max(0, p.y) / H;
    const wob = 0.2 * Math.sin(p.x * 3 + p.z * 2);
    if (Math.abs(t - lineY) < 0.045) return line.clone();
    if (cap > 0) {
      const edge = 0.7 + 0.1 * noise.n3(p.x * 2.2, 3.1, p.z * 2.2);
      if (t > edge) {
        if (cap === 1) return moss[noise.n3(p.x * 4, p.y * 4, p.z * 4) > 0 ? 0 : 1].clone();
        return lichen[noise.n3(p.x * 6 + 9, p.y * 6, p.z * 6) > 0.15 ? 1 : 0].clone();
      }
    }
    return bands[Math.max(0, Math.min(2, Math.floor(t * 2.2 + wob)))].clone();
  };
  // LOD1 keeps the whole cluster of the pebble group and the twin boulders as 8-tri octahedra
  const cluster = lod === 1 && (sil === 0 || sil === 3);
  const parts = lod === 0 || cluster ? BOULDER_PARTS[sil] : BOULDER_PARTS[sil].slice(0, 1);
  const lean = sil === 1 ? r.range(-0.08, 0.08) : 0;
  parts.forEach((p, i) => {
    const q = qEuler(i === 0 ? lean : 0, r.range(0, TAU), i === 0 ? lean : 0);
    if (p.cyl) {
      const g = new THREE.CylinderGeometry(
        p.cyl[1],
        p.cyl[0],
        p.cyl[2],
        lod === 0 ? 8 : 5,
        lod === 0 ? 4 : 1,
      );
      const pos = g.getAttribute('position');
      if (lod === 0)
        for (let k = 0; k < pos.count; k++) {
          const w = 1 + 0.16 * noise.n3(pos.getX(k) * 2.1, pos.getY(k) * 2.1, pos.getZ(k) * 2.1);
          pos.setX(k, pos.getX(k) * w);
          pos.setZ(k, pos.getZ(k) * w);
        }
      acc.add(g, {
        m: mat([p.at[0], p.cyl[2] / 2, p.at[2]], q),
        color: colour,
        windMul: 0,
        cullY: 0.01,
        groundClamp: true,
        aoAmt: 0.22,
      });
      return;
    }
    acc.add(
      cluster
        ? new THREE.OctahedronGeometry(p.r * 1.12 * r.range(0.95, 1.05), 0)
        : blob(
            ((lod === 1 && p.l1) || p).r * r.range(0.95, 1.05),
            lod === 0 ? p.d : 0,
            noise,
            0.2,
            1.1,
            i * 5.5,
          ),
      {
        m: mat(
          ...((lod === 1 && p.l1 ? [p.l1.at, q, p.l1.s] : [p.at, q, p.s]) as Parameters<
            typeof mat
          >),
        ),
        color: colour,
        windMul: 0,
        cullY: 0.01,
        groundClamp: true,
        aoAmt: 0.22,
      },
    );
  });
  return acc.finish(rng, false);
}

/** Kelp v2 (tier 3): `variant` 0 tall strands, 1 short tuft, 2 wide fronds with bladders. Seabed pivot. */
export function kelp({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('kelp');
  const acc = new Acc();
  const v = variant % KELP.variants;
  const H = KELP.heights[v];
  const blades = lod === 0 ? [5, 7, 3][v] : [3, 3, 2][v];
  const segs = lod === 0 ? 4 : 1;
  const w0 = [0.14, 0.12, 0.26][v];
  const fn = gradY(KELP.blades, 0, H);
  const up = V3(0, 1, 0);
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * TAU + r.range(-0.4, 0.4);
    const base = V3(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14);
    const h = H * r.range(0.8, 1.05);
    const lean = V3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(r.range(0.1, 0.35));
    const side = V3(-Math.sin(a), 0, Math.cos(a));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push(
        base
          .clone()
          .addScaledVector(lean, t * t * h * 0.5)
          .addScaledVector(side, 0.12 * Math.sin(t * 5 + b))
          .setY(h * t),
      );
    }
    for (let i = 0; i < segs; i++) {
      const wa = w0 * (1 - 0.8 * (i / segs));
      const wb = w0 * (1 - 0.8 * ((i + 1) / segs));
      acc.addPoly(
        [
          pts[i].clone().addScaledVector(side, -wa),
          pts[i].clone().addScaledVector(side, wa),
          pts[i + 1].clone().addScaledVector(side, wb),
          pts[i + 1].clone().addScaledVector(side, -wb),
        ],
        up,
        { color: fn, windMul: 1, aoAmt: 0.2, double: true },
      );
    }
    if (v === 2 && lod === 0)
      acc.add(blob(0.1, 0, createNoise(r.fork(`b${b}`)), 0.1), {
        m: mat(pts[2].clone().addScaledVector(side, 0.04)),
        color: col(KELP.blades[1]),
        windMul: 1,
        aoAmt: 0.1,
      });
  }
  return acc.finish(rng, true);
}

/** Driftwood v2 (tier 3): 0 long bleached log with a root stub, 1 forked trunk, 2 two crossed pieces. */
export function driftLog({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('dlog');
  const acc = new Acc();
  const v = variant % 3;
  const radial = lod === 0 ? 7 : 3;
  const bleach = col(WOOD.dock).lerp(col(WALLS[0]), 0.35);
  const grain = col(WOOD.dock).lerp(col(WOOD.logs), 0.3);
  let logs = 0;
  const log = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, cap: boolean): void => {
    // LOD1 keeps the main log only
    if (lod === 1 && logs++ > 0) return;
    const f = frustum(a, b, r0, r1, radial, !cap);
    acc.add(f.geo, {
      m: f.m,
      color: (p) => (p.y > 0.2 && ((p.x * 7 + p.z * 5) | 0) % 2 === 0 ? bleach : grain),
      windMul: 0,
      aoAmt: 0.25,
      cls: 'wood',
    });
  };
  const az = r.range(0, TAU);
  const dir = V3(Math.cos(az), 0, Math.sin(az));
  const perp = V3(-dir.z, 0, dir.x);
  const at = (s: number, y: number, o = 0): THREE.Vector3 =>
    dir.clone().multiplyScalar(s).addScaledVector(perp, o).setY(y);
  if (v === 0) {
    log(at(-1, 0.2), at(1, 0.26), 0.2, 0.14, true);
    // root stub: three short spurs at the thick end
    if (lod === 0)
      for (let k = 0; k < 3; k++)
        log(at(-1, 0.2), at(-1.3, 0.2 + 0.18 * k, (k - 1) * 0.28), 0.07, 0.03, true);
  } else if (v === 1) {
    log(at(-0.9, 0.16), at(0.6, 0.3), 0.19, 0.13, true);
    log(at(0.2, 0.28), at(0.95, 0.5, 0.45), 0.1, 0.05, true);
    if (lod === 0) log(at(-0.2, 0.24), at(-0.1, 0.46, -0.4), 0.07, 0.03, true);
  } else {
    log(at(-0.9, 0.15, 0.1), at(0.8, 0.2, 0.1), 0.15, 0.12, true);
    log(at(-0.3, 0.38, -0.55), at(0.4, 0.3, 0.55), 0.12, 0.1, true);
  }
  return acc.finish(rng, false);
}
