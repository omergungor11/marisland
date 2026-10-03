import * as THREE from 'three';
import { CLIFF_STRATA, GRASS, ROCK, ROOFS, SAND, WALLS, WOOD } from '../content/palette.ts';
import { Acc, blob, col, createNoise, frustum, mat, qEuler } from './kit.ts';
import { TAU, TINT, V, V2, baseBox, cylB, jitterAcc, lathe, put, tubeAlong } from './parts.ts';
import type { BuildOpts } from './types.ts';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function dock({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = new Acc();
  const r = rng.fork('dock');
  const n = lod === 0 ? 4 : 1;
  const pw = lod === 0 ? 0.35 : 2.0;
  const gap = 0.2;
  const y = 0.55;
  for (let i = 0; i < n; i++) {
    const x = -1 + pw / 2 + i * (pw + gap);
    put(
      acc,
      new THREE.BoxGeometry(pw, 0.15, 1.2),
      [x, y + 0.075, r.range(-0.01, 0.01)],
      col(WOOD.dock),
      {
        aoAmt: 0.1,
        q: lod === 0 ? qEuler(0, r.range(-0.03, 0.03), 0) : undefined,
      },
    );
  }
  if (lod === 0) {
    for (const z of [-0.45, 0.45])
      put(acc, new THREE.BoxGeometry(2.0, 0.1, 0.12), [0, y - 0.05, z], col(WOOD.dark), {
        aoAmt: 0.2,
      });
  }
  for (const z of [-0.5, 0.5]) {
    put(acc, cylB(0.13, 0.11, y + 0.18, lod === 0 ? 6 : 4, lod === 1), [0, 0, z], col(WOOD.logs), {
      aoAmt: 0.3,
    });
  }
  if (variant % 2 === 1) {
    const bx = lod === 0 ? 0.75 : 0.8;
    put(
      acc,
      cylB(0.1, 0.1, 0.32, lod === 0 ? 6 : 4, lod === 1),
      [bx, y + 0.15, 0.45],
      col(WOOD.dark),
      { aoAmt: 0.15 },
    );
    if (lod === 0)
      put(acc, new THREE.IcosahedronGeometry(0.12, 0), [bx, y + 0.5, 0.45], col(WOOD.dark), {
        aoAmt: 0,
      });
  }
  return acc.finish(rng, false, true);
}

export function rowboat({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const seg = lod === 0 ? 12 : 6;
  const hullCol = variant % 2 === 0 ? ROOFS[5] : ROOFS[0];
  const prof: Array<[number, number]> =
    lod === 0
      ? [
          [0, 0.02],
          [0.3, 0.04],
          [0.46, 0.22],
          [0.485, 0.33],
          [0.5, 0.42],
          [0.43, 0.42],
          [0.26, 0.12],
          [0, 0.1],
        ]
      : [
          [0, 0.02],
          [0.46, 0.2],
          [0.5, 0.42],
          [0, 0.1],
        ];
  const g = lathe(prof, seg);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const zn = p.getZ(i);
    const zz = zn * 2.4;
    const pinch = 1 - 0.55 * Math.pow(Math.abs(zz / 1.2), 3);
    const lift = 0.14 * Math.pow(Math.abs(zz / 1.2), 2.2);
    p.setXYZ(
      i,
      p.getX(i) * Math.max(0.12, pinch),
      p.getY(i) + lift * Math.min(1, p.getY(i) / 0.42),
      zz,
    );
  }
  put(
    acc,
    g,
    [0, 0, 0],
    (q) =>
      q.y - 0.12 * Math.pow(Math.min(1, Math.abs(q.z) / 1.2), 2.2) > 0.37
        ? col(WALLS[1])
        : col(hullCol),
    { aoAmt: 0.2 },
  );
  if (lod === 0) {
    for (const z of [-0.35, 0.4])
      put(acc, new THREE.BoxGeometry(0.95, 0.06, 0.26), [0, 0.3, z], col(WOOD.planks), {
        aoAmt: 0.1,
      });
    for (const s of [-1, 1]) {
      const a = V(s * 0.38, 0.52, 0.05);
      const b = V(s * 0.95, 0.3, -0.35);
      const sh = frustum(a, b, 0.025, 0.025, 4);
      acc.add(sh.geo, { m: sh.m, color: col(WOOD.dark), windMul: 0, aoAmt: 0 });
      put(
        acc,
        new THREE.BoxGeometry(0.1, 0.03, 0.3),
        b.clone().add(V(s * 0.03, -0.02, -0.14)),
        col(WOOD.planks),
        { aoAmt: 0, q: qEuler(0, s * 0.3, 0) },
      );
    }
  }
  return acc.finish(rng, false, true);
}

/** Grid surface from a parametric function (u across, v up). */
export function gridSurface(
  nu: number,
  nv: number,
  f: (u: number, v: number) => THREE.Vector3,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const P = (u: number, v: number): THREE.Vector3 => f(u / nu, v / nv);
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = P(i, j);
      const b = P(i + 1, j);
      const c = P(i + 1, j + 1);
      const d = P(i, j + 1);
      pos.push(
        a.x,
        a.y,
        a.z,
        b.x,
        b.y,
        b.z,
        c.x,
        c.y,
        c.z,
        a.x,
        a.y,
        a.z,
        c.x,
        c.y,
        c.z,
        d.x,
        d.y,
        d.z,
      );
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function hullShape(L: number, W: number): THREE.Shape {
  const s = new THREE.Shape();
  const h = L / 2;
  const w = W / 2;
  s.moveTo(-w * 0.7, -h);
  s.lineTo(w * 0.7, -h);
  s.lineTo(w, -h * 0.4);
  s.lineTo(w * 0.94, h * 0.35);
  s.lineTo(0, h);
  s.lineTo(-w * 0.94, h * 0.35);
  s.lineTo(-w, -h * 0.4);
  s.closePath();
  return s;
}

export function sailboat({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const sailHex = variant % 2 === 0 ? WALLS[1] : ROOFS[3];
  const hullH = 0.75;
  const hullCol0 = col(ROOFS[variant % 2 === 0 ? 5 : 1]);
  const ext = (depth: number): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(hullShape(5, 1.8), { depth, bevelEnabled: false }).rotateX(
      Math.PI / 2,
    ); // shape y -> +z (bow), extrusion -> down
  if (lod === 1) {
    put(acc, ext(hullH), [0, hullH, 0], (p) => (p.y > hullH * 0.5 ? col(WALLS[1]) : hullCol0), {
      aoAmt: 0.2,
    });
  } else {
    const lowH = hullH * 0.5;
    const topH = hullH - lowH;
    // lower band narrower, upper band flares out (sheer) and carries the planked deck
    put(acc, ext(lowH).scale(0.88, 1, 0.95), [0, lowH, 0], hullCol0, { aoAmt: 0.25 });
    put(
      acc,
      ext(topH).scale(1.04, 1, 1.0),
      [0, hullH, 0],
      (p) => (p.y > hullH - 0.01 ? col(WOOD.planks) : col(WALLS[1])),
      { aoAmt: 0.1 },
    );
  }
  const mastZ = 0.35;
  const mastH = 4.5;
  put(
    acc,
    cylB(0.09, 0.06, mastH, lod === 0 ? 5 : 4, true),
    [0, hullH - 0.1, mastZ],
    col(WOOD.dark),
    { aoAmt: 0.1 },
  );
  if (lod === 0)
    put(
      acc,
      new THREE.BoxGeometry(0.08, 0.08, 2.1),
      [0, hullH + 0.55, mastZ - 1.05],
      col(WOOD.dark),
      { aoAmt: 0 },
    );
  const y0 = hullH + 0.65;
  const H = 3.5;
  const Ls = 2.0;
  const nu = lod === 0 ? 4 : 1;
  const nv = lod === 0 ? 4 : 1;
  const main = gridSurface(nu, nv, (u, v) =>
    V(
      0.4 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * (variant % 2 ? -1 : 1) + 0.04,
      y0 + v * H * (1 - 0.92 * u),
      mastZ - 0.06 - u * Ls,
    ),
  );
  put(acc, main, [0, 0, 0], col(sailHex), {
    double: true,
    aoAmt: 0,
    windAbs: (p) => clamp01((mastZ - p.z) / Ls),
    ao: () => 1,
  });
  if (lod === 0) {
    const jib = gridSurface(2, 3, (u, v) =>
      V(
        0.2 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v),
        y0 + 0.2 + v * 2.8 * (1 - u),
        mastZ + 0.08 + u * 1.6,
      ),
    );
    put(acc, jib, [0, 0, 0], col(ROOFS[0]), {
      double: true,
      aoAmt: 0,
      windAbs: (p) => clamp01((p.z - mastZ) / 1.6),
      ao: () => 1,
    });
    const flag = gridSurface(2, 1, (u, v) =>
      V(0, hullH - 0.1 + mastH - 0.35 + v * 0.3 - u * 0.1 * v, mastZ - u * 0.55),
    );
    put(acc, flag, [0, 0, 0], col(ROOFS[1]), {
      double: true,
      aoAmt: 0,
      windAbs: (p) => clamp01((mastZ - p.z) / 0.55),
      ao: () => 1,
    });
  }
  return acc.finish(rng, false, true);
}

export function seaStack({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('stack');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const cls = variant % 3;
  const H = [6, 10, 15][cls];
  const R = [1.6, 2.1, 2.7][cls] * r.range(0.95, 1.05);
  const radial = lod === 0 ? 12 : 6;
  const hseg = lod === 0 ? 8 : 3;
  const g = new THREE.CylinderGeometry(1, 1, H, radial, hseg, false).translate(0, H / 2, 0);
  const pos = g.getAttribute('position');
  const lean = r.range(-0.4, 0.4) * (cls + 1) * 0.35;
  const ph = r.range(0, 10);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = y / H;
    const base = 1 + 0.55 * Math.pow(1 - t, 2.4);
    const top = 0.14 * clamp01((t - 0.82) / 0.18);
    const waist = -0.12 * Math.sin(Math.PI * t * 1.6);
    const n = 1 + 0.2 * noise.n3(x * 1.3 + ph, y * 0.3, z * 1.3 - ph);
    const k = R * (base + top + waist) * n;
    const edge = Math.hypot(x, z) > 0.01 ? 1 : 0;
    pos.setXYZ(i, x * k * edge + lean * t * t * H * 0.25, y, z * k * edge);
  }
  const bands = (p: THREE.Vector3): THREE.Color => {
    const t = p.y / H;
    if (t > 0.9) return col(GRASS[2]);
    if (t < 0.1) return col(ROCK[1]);
    const i = Math.floor(t * 6 + 0.3 * noise.n3(p.x * 0.5, p.y, p.z * 0.5));
    return col(CLIFF_STRATA[((i % 2) + 2) % 2]);
  };
  acc.add(g, { m: mat([0, 0, 0]), color: bands, windMul: 0, aoAmt: 0.3 });
  if (lod === 0) {
    put(
      acc,
      blob(R * 0.75, 0, noise, 0.15, 1.2, 3),
      [lean * H * 0.25, H + 0.05, 0],
      gradYGrass(H),
      { aoAmt: 0.1, s: [1, 0.55, 1] },
    );
  }
  return acc.finish(rng, false, true);
}
const gradYGrass =
  (H: number) =>
  (p: THREE.Vector3): THREE.Color =>
    col(GRASS[2]).lerp(col(GRASS[1]), clamp01((p.y - H) / 1.2));

export function buoy({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const cap = new THREE.CapsuleGeometry(0.17, 0.3, lod === 0 ? 2 : 1, lod === 0 ? 8 : 5).translate(
    0,
    0.32,
    0,
  );
  put(
    acc,
    cap,
    [0, 0, 0],
    (p) => (Math.floor(p.y / 0.2) % 2 === 0 ? col(ROOFS[1]) : col(WALLS[1])),
    { aoAmt: 0.15, cullY: lod === 0 ? 0.0 : 0 },
  );
  if (lod === 0) {
    put(acc, cylB(0.025, 0.025, 0.2, 3, true), [0, 0.6, 0], col(WOOD.dark), { aoAmt: 0 });
    put(acc, new THREE.ConeGeometry(0.08, 0.12, 5), [0, 0.82, 0], col(ROOFS[3]), { aoAmt: 0 });
  }
  return acc.finish(rng, false, true);
}

export function driftwood({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('drift');
  const acc = new Acc();
  const n = lod === 0 ? 6 : 2;
  const sweep = (variant % 2 === 0 ? 0.55 : 0.8) * (r.chance(0.5) ? 1 : -1);
  const Rr = 1.5 / ((2 * Math.abs(sweep)) / 1) / 1.2;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -sweep + (2 * sweep * i) / n;
    pts.push(
      V(Math.sin(a) * Rr, 0.13 + 0.05 * Math.sin((i / n) * Math.PI), (1 - Math.cos(a)) * Rr),
    );
  }
  for (let i = 0; i < n; i++) {
    const w0 = 0.12 - 0.03 * (i / n);
    const w1 = 0.12 - 0.03 * ((i + 1) / n);
    const s = frustum(pts[i], pts[i + 1], w0, w1, 5, !(lod === 0 && (i === 0 || i === n - 1)));
    acc.add(s.geo, {
      m: s.m,
      color: col(i === n - 1 || i === 0 ? WOOD.planks : WOOD.dock),
      windMul: 0,
      aoAmt: 0.25,
    });
  }
  if (lod === 0) {
    for (let k = 0; k < 3; k++) {
      const base = pts[1 + k].clone();
      const dir = V(r.range(-0.4, 0.4), 1, r.range(-0.6, 0.6)).normalize();
      const s = frustum(base, base.clone().addScaledVector(dir, 0.3), 0.045, 0.02, 4, false);
      acc.add(s.geo, { m: s.m, color: col(WOOD.dock), windMul: 0, aoAmt: 0.1 });
    }
  }
  return acc.finish(rng, false, true);
}

export function starGeo(R: number, rIn: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2;
    const rr = i % 2 === 0 ? R : rIn;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).rotateX(-Math.PI / 2);
}

export function tidePool({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('pool');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  const n = lod === 0 ? 5 : 4;
  const ph = r.range(0, TAU);
  const grey = [ROCK[0], ROCK[1], ROCK[2]];
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * TAU + r.range(-0.2, 0.2);
    const rr = r.range(0.3, 0.42);
    const geo =
      lod === 0 ? blob(rr, 0, noise, 0.2, 1.1, i * 3) : new THREE.TetrahedronGeometry(rr * 1.1, 0);
    put(
      acc,
      geo,
      [Math.cos(a) * 0.72, rr * 0.35, Math.sin(a) * 0.72],
      col(grey[(i + variant) % 3]),
      {
        s: [1, 0.75, 1],
        q: qEuler(0, r.range(0, TAU), 0),
        groundClamp: true,
        cullY: 0.0,
        aoAmt: 0.25,
      },
    );
  }
  const disc = new THREE.CircleGeometry(0.78, lod === 0 ? 10 : 5).rotateX(-Math.PI / 2);
  put(
    acc,
    disc,
    [0, 0.08, 0],
    (p) => col(TINT.pool).lerp(col(SAND.wet), clamp01((Math.hypot(p.x, p.z) - 0.4) / 0.6) * 0.3),
    { aoAmt: 0, ao: () => 1 },
  );
  if (lod === 0)
    put(
      acc,
      starGeo(0.16, 0.07, 0.04),
      [0.05, 0.08, -0.05],
      col(ROOFS[variant % 2 === 0 ? 0 : 3]),
      { q: qEuler(0, r.range(0, TAU), 0), aoAmt: 0 },
    );
  return acc.finish(rng, false, true);
}

export function shell({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('shell');
  const acc = new Acc();
  const g =
    lod === 0
      ? lathe(
          [
            [0.0, 0],
            [0.07, 0.015],
            [0.085, 0.06],
            [0.06, 0.12],
            [0.03, 0.17],
            [0, 0.2],
          ],
          8,
        )
      : new THREE.ConeGeometry(0.07, 0.16, 3, 1, true).translate(0, 0.08, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const tw = y * 16;
    const ridge = lod === 0 ? 1 + 0.18 * Math.cos(Math.atan2(z, x) * 3 + tw) : 1;
    const c = Math.cos(tw);
    const s = Math.sin(tw);
    p.setXYZ(i, (x * c - z * s) * ridge, y, (x * s + z * c) * ridge);
  }
  const tint = [WALLS[2], WALLS[0], ROOFS[0]][variant % 3];
  put(acc, g, [0, 0.07, 0], (q) => col(tint).lerp(col(ROOFS[0]), clamp01(q.y / 0.25) * 0.35), {
    q: qEuler(0, r.range(0, TAU), 1.35),
    aoAmt: 0.1,
    groundClamp: true,
  });
  return acc.finish(rng, false, true);
}

export function starfish({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = new Acc();
  const c = col([ROOFS[0], ROOFS[3], ROOFS[1]][variant % 3]);
  const g =
    lod === 0
      ? starGeo(0.13, 0.055, 0.035)
      : new THREE.CircleGeometry(0.1, 5).rotateX(-Math.PI / 2).translate(0, 0.03, 0);
  put(acc, g, [0, 0, 0], c, { q: qEuler(0, rng.range(0, TAU), 0), aoAmt: 0, ao: () => 0.96 });
  if (lod === 0)
    put(acc, new THREE.TetrahedronGeometry(0.02, 0), [0, 0.04, 0], col(WALLS[0]), { aoAmt: 0 });
  return acc.finish(rng, false, true);
}

export function messageBottle({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = new Acc();
  const g =
    lod === 0
      ? lathe(
          [
            [0, 0],
            [0.05, 0],
            [0.056, 0.03],
            [0.056, 0.14],
            [0.03, 0.2],
            [0.02, 0.26],
            [0.02, 0.3],
          ],
          6,
        )
      : lathe(
          [
            [0, 0],
            [0.056, 0.02],
            [0.056, 0.14],
            [0.02, 0.3],
          ],
          4,
        );
  const q = qEuler(0, rng.range(0, TAU), Math.PI / 2 - 0.08);
  put(acc, g, [0, 0.056, 0], col(TINT.bottle), { q, aoAmt: 0.1 });
  if (lod === 0) {
    const neck = V(0, 0.296, 0)
      .applyQuaternion(q)
      .add(V(0, 0.056, 0));
    put(acc, cylB(0.024, 0.024, 0.05, 5), neck, col(TINT.cork), { q, aoAmt: 0 });
  }
  return acc.finish(rng, false, true);
}

void V2;
void baseBox;
void tubeAlong;
