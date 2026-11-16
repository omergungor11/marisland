/**
 * Coast kit (TASK-604, D-180): `rockArch`, `tidePoolField`, `duneGrass`, `ledgeShrub` (the `kelp`
 * def stays in vegetation-v2.ts). New defs appended at the tail of PROP_DEFS; pivot on the ground,
 * 1 u = 1 m, merged vertex-coloured geometry, no textures.
 */
import * as THREE from 'three';
import {
  ARCH_STONE,
  DUNE_GRASS,
  LEDGE_SHRUB,
  ROCK_ARCH,
  TIDE_POOL_FIELD,
  splitVariant,
} from '../content/biomes.ts';
import { SAND } from '../content/palette.ts';
import type { Rng } from '../core/rng.ts';
import { Acc, blob, col, createNoise, gradY, mat, qEuler } from './kit.ts';
import { TINT } from './parts.ts';
import type { BuildOpts } from './types.ts';

const TAU = Math.PI * 2;
const V3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** A noisy tube swept along `path` (xy plane), fatter at the feet; open ends, depth stretched in z. */
function sweep(
  path: THREE.Vector3[],
  radius: (t: number) => number,
  depth: number,
  ring: number,
  noise: ReturnType<typeof createNoise>,
  off: number,
): THREE.BufferGeometry {
  const n = path.length;
  const pos: number[] = [];
  const at = (i: number, k: number): THREE.Vector3 => {
    const t = i / (n - 1);
    const a = path[Math.min(n - 1, i + 1)]
      .clone()
      .sub(path[Math.max(0, i - 1)])
      .normalize();
    const nrm = V3(-a.y, a.x, 0);
    const ang = (k / ring) * TAU;
    const base = path[i];
    const rr =
      radius(t) *
      (1 + 0.28 * noise.n3(base.x * 1.1 + off, base.y * 1.1 + Math.cos(ang), Math.sin(ang) + off));
    return base
      .clone()
      .addScaledVector(nrm, Math.cos(ang) * rr)
      .add(V3(0, 0, Math.sin(ang) * rr * depth));
  };
  for (let i = 0; i < n - 1; i++)
    for (let k = 0; k < ring; k++) {
      const a = at(i, k);
      const b = at(i + 1, k);
      const c = at(i + 1, k + 1);
      const d = at(i, k + 1);
      pos.push(
        a.x,
        a.y,
        a.z,
        c.x,
        c.y,
        c.z,
        b.x,
        b.y,
        b.z,
        a.x,
        a.y,
        a.z,
        d.x,
        d.y,
        d.z,
        c.x,
        c.y,
        c.z,
      );
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Leg - semi-ellipse - leg centreline from (x0 - R) to (x0 + R), `n` samples (uniform in angle). */
function archPath(x0: number, R: number, leg: number, rise: number, n: number): THREE.Vector3[] {
  const legN = Math.max(1, Math.round(n * 0.22));
  const arcN = n - 2 * legN;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= legN; i++) pts.push(V3(x0 - R, (leg * i) / legN, 0));
  for (let i = 1; i < arcN; i++) {
    const a = Math.PI - (i / arcN) * Math.PI;
    pts.push(V3(x0 + Math.cos(a) * R, leg + Math.sin(a) * R * rise, 0));
  }
  for (let i = 0; i <= legN; i++) pts.push(V3(x0 + R, leg * (1 - i / legN), 0));
  return pts;
}

/** Rock arch: 0 sea arch, 1 low mossy bridge, 2 double arch (a small span sharing the right leg). */
export function rockArch({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const { biomeId, shape } = splitVariant('rockArch', variant);
  const r = rng.fork('arch');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const A = ROCK_ARCH;
  const H = A.heights[shape];
  const stone = ARCH_STONE[biomeId];
  const bands = stone.bands.map(col);
  const wet = col(A.wet).lerp(bands[0], 0.5);
  const moss = A.moss.map(col);
  const line = col(stone.line).lerp(new THREE.Color('#FFFFFF'), 0.3);
  const lineY = 0.55 + r.range(-0.04, 0.04);
  const colour = (p: THREE.Vector3): THREE.Color => {
    const t = Math.max(0, p.y) / H;
    if (shape === 1 && t > 0.8)
      return moss[noise.n3(p.x * 3, p.y * 3, p.z * 3) > 0 ? 0 : 1].clone();
    if (Math.abs(t - lineY) < 0.035) return line.clone();
    const w = t * 2.6 + 0.25 * Math.sin(p.x * 3 + p.z * 2);
    const c = bands[Math.max(0, Math.min(2, Math.floor(w)))].clone();
    // fine horizontal banding echoing the cliff strata
    c.offsetHSL(0, 0, Math.floor(t * 9 + 0.4 * Math.sin(p.x * 2.5 - p.z * 2)) % 2 ? 0.035 : -0.025);
    return p.y < A.wetY ? c.lerp(wet, 0.5 * (1 - p.y / A.wetY)) : c;
  };
  const N = lod === 0 ? 22 : 11;
  const ring = lod === 0 ? 8 : 4;
  const span = (
    x0: number,
    R: number,
    leg: number,
    rise: number,
    tube: number,
    depth: number,
    o: number,
  ): void => {
    const g = sweep(
      archPath(x0, R, leg, rise, N),
      (t) => tube * (1.4 - 0.55 * Math.sin(Math.PI * t)),
      depth,
      ring,
      noise,
      o,
    );
    acc.add(g, { color: colour, windMul: 0, cullY: 0.01, groundClamp: true, aoAmt: 0.22 });
  };
  const R = A.span[shape] * r.range(0.97, 1.03);
  // the double arch is re-centred so the pivot stays the middle of the whole group
  const sx = shape === 2 ? -1.15 : 0;
  span(sx, R, A.leg[shape], A.rise[shape], A.tube[shape], 1.25, 0);
  if (shape === 2) span(sx + R + 1.15, 1.05, 0.55, 0.9, 0.5, 1.2, 4);
  // foot rubble: the arch stands in a ring of fallen blocks
  const feet: Array<[number, number, number]> = [
    [-R - 0.15, 0.3, 0.2],
    [R + (shape === 2 ? 1.15 + 1.1 : 0.2), 0.26, -0.2],
    [shape === 2 ? R + 0.6 : R * 0.15, 0.2, 0.9],
  ];
  feet.slice(0, lod === 0 ? 3 : 2).forEach(([x, rr, z], i) =>
    acc.add(
      lod === 0
        ? blob(rr * 1.4, 0, noise, 0.25, 1.2, i * 4)
        : new THREE.OctahedronGeometry(rr * 1.4, 0),
      {
        m: mat([x + sx, rr * 0.5, z], qEuler(0, r.range(0, TAU), 0), [1.2, 0.8, 1]),
        color: colour,
        windMul: 0,
        cullY: 0.01,
        groundClamp: true,
        aoAmt: 0.22,
      },
    ),
  );
  return acc.finish(rng, false);
}

/** A flat water disc with a pale rim, y above the shelf. */
function pool(acc: Acc, x: number, z: number, rad: number, y: number, lod: number): void {
  const disc = new THREE.CircleGeometry(rad, lod === 0 ? 9 : 5).rotateX(-Math.PI / 2);
  acc.add(disc, {
    m: mat([x, y, z]),
    color: (p) =>
      col(TINT.pool).lerp(
        col(SAND.wet),
        Math.min(1, Math.max(0, (Math.hypot(p.x - x, p.z - z) / rad - 0.55) / 0.45)) * 0.35,
      ),
    windMul: 0,
    aoAmt: 0,
    ao: () => 1,
  });
}

/** Tide-pool field: a low rock shelf, three pools ringed with rocks, starfish, urchins and weed. */
export function tidePoolField({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const T = TIDE_POOL_FIELD;
  const v = variant % T.variants;
  const r = rng.fork('field');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const rock = T.rock[v].map(col);
  const wetRock = (p: THREE.Vector3): THREE.Color =>
    rock[
      Math.min(2, Math.floor(Math.max(0, p.y) * 5 + 0.3 * noise.n3(p.x * 2, 1, p.z * 2) + 0.35))
    ].clone();
  // the shelf: a squashed noisy mound, a smaller shoulder on one side
  acc.add(blob(2.7, lod === 0 ? 1 : 0, noise, 0.1, 0.9, 1), {
    m: mat([0, 0.02, 0], qEuler(0, r.range(0, TAU), 0), [1.1, 0.1, 0.92]),
    color: wetRock,
    windMul: 0,
    cullY: 0,
    groundClamp: true,
    aoAmt: 0.2,
  });
  const ph = r.range(0, TAU);
  const pools: Array<[number, number, number]> = [];
  for (let i = 0; i < 3; i++) {
    const a = ph + (i / 3) * TAU + r.range(-0.25, 0.25);
    const d = i === 0 ? r.range(0.2, 0.6) : r.range(1.2, 1.55);
    pools.push([
      Math.cos(a) * d,
      Math.sin(a) * d * 0.85,
      [0.82, 0.55, 0.45][i] * r.range(0.95, 1.05),
    ]);
  }
  const top = 0.28;
  pools.forEach(([x, z, rad], i) => {
    pool(acc, x, z, rad, top, lod);
    const n = lod === 0 ? 5 : 3;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + r.range(-0.3, 0.3);
      const rr = r.range(0.2, 0.3) * (0.6 + rad);
      acc.add(
        lod === 0
          ? blob(rr, 0, noise, 0.25, 1.4, k + i * 7)
          : new THREE.TetrahedronGeometry(rr * 1.2, 0),
        {
          m: mat(
            [
              x + Math.cos(a) * (rad + rr * 0.35),
              top + rr * 0.1,
              z + Math.sin(a) * (rad + rr * 0.35),
            ],
            qEuler(0, r.range(0, TAU), 0),
            [1.1, 0.7, 1.1],
          ),
          color: wetRock,
          windMul: 0,
          groundClamp: true,
          cullY: 0.0,
          aoAmt: 0.25,
        },
      );
    }
  });
  if (lod === 0) {
    // starfish (flat 5-point, one per pool), urchins and a tuft of weed in the biggest pool
    pools.forEach(([x, z, rad], i) => {
      const star = new THREE.CylinderGeometry(0.17, 0.17, 0.03, 5, 1);
      acc.add(star, {
        m: mat([x + rad * 0.2, top + 0.025, z - rad * 0.15], qEuler(0, r.range(0, TAU), 0)),
        color: col(T.creatures[i % 2 === 0 ? 0 : 2]),
        windMul: 0,
        aoAmt: 0,
      });
      const u = new THREE.TetrahedronGeometry(0.07, 0);
      for (let k = 0; k < 2; k++) {
        const a = r.range(0, TAU);
        acc.add(u, {
          m: mat(
            [x + Math.cos(a) * rad * 0.5, top + 0.05, z + Math.sin(a) * rad * 0.5],
            qEuler(r.range(0, 3), r.range(0, 3), 0),
          ),
          color: col(T.creatures[(i + k + 1) % T.creatures.length]),
          windMul: 0,
          aoAmt: 0,
        });
      }
    });
    const [wx, wz, wr] = pools[0];
    for (let k = 0; k < 3; k++) {
      const a = r.range(0, TAU);
      const base = V3(wx + Math.cos(a) * wr * 0.5, top, wz + Math.sin(a) * wr * 0.5);
      const side = V3(Math.cos(a + 1.57) * 0.05, 0, Math.sin(a + 1.57) * 0.05);
      acc.addPoly(
        [
          base.clone().sub(side),
          base.clone().add(side),
          base
            .clone()
            .add(side)
            .add(V3(0.04, 0.3, 0)),
          base
            .clone()
            .sub(side)
            .add(V3(0.04, 0.3, 0)),
        ],
        V3(Math.sin(a), 0, -Math.cos(a)),
        {
          color: gradY([TINT.seaweed, '#6FBF7A'], top, top + 0.3),
          windMul: 0.6,
          aoAmt: 0.1,
          double: true,
        },
      );
    }
  }
  return acc.finish(rng, false);
}

/** Dune grass: 0 marram clump, 1 sea oats with seed heads, 2 low mat on a sand hump. Windy blades. */
export function duneGrass({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const D = DUNE_GRASS;
  const shape = variant % D.variants;
  const r = rng.fork('dune');
  const acc = new Acc();
  const H = D.heights[shape];
  const fn = gradY(D.blades, 0, H);
  const blades = lod === 0 ? [18, 12, 14][shape] : [6, 5, 5][shape];
  const segs = lod === 0 ? 3 : 1;
  const w0 = [0.1, 0.065, 0.085][shape];
  const up = V3(0, 1, 0);
  const noise = createNoise(r.fork('n'));
  if (shape === 2) {
    // a sand hump the mat grows from
    acc.add(blob(0.55, lod === 0 ? 1 : 0, noise, 0.1, 1.2, 3), {
      m: mat([0, 0.04, 0], null, [1.2, 0.34, 1.1]),
      color: gradY([SAND.wet, SAND.dry], 0, 0.2),
      windMul: 0,
      cullY: 0,
      groundClamp: true,
      aoAmt: 0.2,
    });
  }
  const heads: Array<[THREE.Vector3, THREE.Vector3]> = [];
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * TAU + r.range(-0.3, 0.3);
    const out = V3(Math.cos(a), 0, Math.sin(a));
    const side = V3(-out.z, 0, out.x);
    const base = out
      .clone()
      .multiplyScalar(r.range(0.04, shape === 2 ? 0.35 : 0.14))
      .setY(shape === 2 ? 0.1 : 0);
    const h = H * r.range(0.72, 1.05);
    // arching: rises, then falls outward (marram) / stays upright with a lean (oats)
    const reach = (shape === 1 ? 0.28 : shape === 2 ? 0.5 : 0.62) * h * r.range(0.7, 1.15);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push(
        base
          .clone()
          .addScaledVector(out, reach * t * t)
          .setY(base.y + h * (t - 0.18 * t * t * (shape === 1 ? 0.3 : 1))),
      );
    }
    for (let i = 0; i < segs; i++) {
      const wa = w0 * (1 - 0.85 * (i / segs));
      const wb = w0 * (1 - 0.85 * ((i + 1) / segs));
      acc.addPoly(
        [
          pts[i].clone().addScaledVector(side, -wa),
          pts[i].clone().addScaledVector(side, wa),
          pts[i + 1].clone().addScaledVector(side, wb),
          pts[i + 1].clone().addScaledVector(side, -wb),
        ],
        up,
        { color: fn, windMul: 1, aoAmt: 0.25, double: true },
      );
    }
    if (shape === 1 && b % 3 === 0) heads.push([pts[segs], out]);
  }
  if (lod === 0)
    for (const [tip] of heads)
      acc.add(new THREE.OctahedronGeometry(0.07, 0), {
        m: mat(tip, null, [0.8, 2.2, 0.8]),
        color: col(D.seed),
        windMul: 1,
        aoAmt: 0,
      });
  return acc.finish(rng, true);
}

/** Ledge shrub: biome-coloured, back flat to the wall (-z), growing toward +z. */
export function ledgeShrub({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const { biome, shape } = splitVariant('ledgeShrub', variant);
  const r: Rng = rng.fork('ledge');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const dec = biome.deciduous;
  const H = LEDGE_SHRUB.heights[shape];
  const fn = gradY([dec[2], dec[1], dec[0]], 0, H);
  const d = lod === 0 ? 1 : 0;
  const lump = (
    rr: number,
    at: [number, number, number],
    s: [number, number, number],
    i: number,
  ): void => {
    acc.add(blob(rr * r.range(0.95, 1.05), d, noise, 0.12, 1.3, i * 2.7), {
      m: mat(at, null, s),
      color: fn,
      windMul: 1,
      cullY: 0.04,
      groundClamp: true,
      aoAmt: 0.25,
    });
  };
  const lumps: Array<[number, [number, number, number], [number, number, number]]> =
    shape === 0
      ? [
          [0.55, [0, 0.32, 0.05], [1.35, 0.8, 0.9]],
          [0.38, [0.55, 0.24, 0.3], [1.2, 0.75, 1]],
          [0.3, [-0.55, 0.2, 0.25], [1.2, 0.7, 1]],
        ]
      : shape === 1
        ? [
            [0.5, [0, 0.4, 0.1], [1.4, 0.8, 0.8]],
            [0.34, [0.1, 0.12, 0.55], [1.1, 1.5, 0.7]],
            [0.28, [-0.5, 0.15, 0.5], [0.9, 1.5, 0.7]],
          ]
        : [
            [0.46, [0, 0.78, 0.1], [1.1, 0.85, 1]],
            [0.34, [0.4, 0.55, 0.25], [1, 0.8, 1]],
            [0.3, [-0.38, 0.5, 0.2], [1, 0.8, 1]],
          ];
  lumps.slice(0, lod === 0 ? 3 : 1).forEach(([rr, at, s], i) => lump(rr, at, s, i));
  if (shape === 2 && lod === 0)
    for (let i = 0; i < 2; i++)
      acc.add(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 5, 1, true), {
        m: mat([(i - 0.5) * 0.14, 0.3, 0.06], qEuler(0.1 * (i - 0.5), 0, 0.15 * (i - 0.5))),
        color: col('#7A5A3E'),
        windMul: 0.3,
        aoAmt: 0.2,
        cls: 'wood',
      });
  const nf = lod === 0 ? 8 : 0;
  const head = new THREE.TetrahedronGeometry(0.09, 0);
  for (let i = 0; i < nf; i++) {
    const [rr, at, s] = lumps[i % lumps.length];
    const a = r.range(0, TAU);
    const el = r.range(0.2, 1.1);
    const dir = V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.abs(Math.sin(a)) * Math.cos(el));
    acc.add(head, {
      m: mat(
        V3(...at).add(dir.multiply(V3(...s)).multiplyScalar(rr * 1.02)),
        qEuler(r.range(0, 3), r.range(0, 3), 0),
      ),
      color: col(biome.flowers[i % 2]),
      windMul: 1,
      aoAmt: 0,
    });
  }
  return acc.finish(rng, true);
}
