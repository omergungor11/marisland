import * as THREE from 'three';
import {
  CLIFF_STRATA,
  EMISSIVE,
  FOLIAGE,
  GRASS,
  ROCK,
  ROOFS,
  SAND,
  WALLS,
  WOOD,
} from '../content/palette.ts';
import { Acc, blob, col, createNoise, frustum, mat, qEuler } from './kit.ts';
import { TAU, TINT, V, V2, baseBox, cylB, jitterAcc, lathe, put, tubeAlong } from './parts.ts';
import { THEMES } from '../content/themes.ts';
import type { BuildOpts } from './types.ts';
import type { Rng } from '../core/rng.ts';

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

/** Half-width of the ferry hull (`hullShape(6, 2.2)`) at z, for rails and benches. */
function ferryHalf(z: number): number {
  if (z < -1.2) return 0.77 + ((z + 3) / 1.8) * 0.33;
  if (z < 1.05) return 1.1 - ((z + 1.2) / 2.25) * 0.066;
  return Math.max(0, 1.034 * (1 - (z - 1.05) / 1.95));
}

/**
 * Harbour Guild ferry (sailboat variant 2, M19 TASK-410): 6 u white hull with coral boot-top and
 * sheer stripe, aft cabin + wheelhouse with a swallowtail HQ pennant, forward passenger deck under a
 * coral/cream striped awning with benches, rails, lifebuoys and a bow lantern. Bow +z, same pivot
 * as the sailboat (keel at y = 0). LOD1: hull, cabin, wheelhouse, awning slab, mast, flag.
 */
function ferry({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const hi = lod === 0;
  const hullH = 0.78;
  const CORAL = ROOFS[0];
  const L = 6;
  const W = 2.2;
  const ext = (depth: number): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(hullShape(L, W), { depth, bevelEnabled: false }).rotateX(Math.PI / 2);
  // stacked bands (flat side faces: a colour fn on the big triangles would split them diagonally)
  const bands: ReadonlyArray<readonly [number, number, string]> = hi
    ? [
        [0, 0.26, CORAL],
        [0.26, 0.52, WALLS[1]],
        [0.52, 0.64, CORAL],
        [0.64, hullH, WALLS[1]],
      ]
    : [
        [0, 0.3, CORAL],
        [0.3, hullH, WALLS[1]],
      ];
  for (const [y0, y1, c] of bands)
    put(
      acc,
      ext(y1 - y0),
      [0, y1, 0],
      (p) => (y1 === hullH && p.y > hullH - 0.01 ? col(WOOD.planks) : col(c)),
      { aoAmt: 0.2, noJitter: true },
    );
  const deck = hullH;
  // aft cabin + wheelhouse
  put(
    acc,
    new THREE.BoxGeometry(1.55, 0.95, 1.8).translate(0, 0.475, 0),
    [0, deck, -1.95],
    col(WALLS[0]),
    {
      aoAmt: 0.15,
    },
  );
  put(
    acc,
    new THREE.BoxGeometry(1.8, 0.1, 2.05).translate(0, 0.05, 0),
    [0, deck + 0.95, -1.95],
    col(CORAL),
    {
      aoAmt: 0.05,
    },
  );
  put(
    acc,
    new THREE.BoxGeometry(1.1, 0.7, 1.0).translate(0, 0.35, 0),
    [0, deck + 1.05, -1.7],
    col(WALLS[0]),
    {
      aoAmt: 0.1,
    },
  );
  put(
    acc,
    new THREE.BoxGeometry(1.34, 0.1, 1.24).translate(0, 0.05, 0),
    [0, deck + 1.75, -1.7],
    col(CORAL),
    {
      aoAmt: 0.05,
    },
  );
  const mastTop = deck + 1.85 + 1.25;
  put(acc, cylB(0.05, 0.04, 1.25, hi ? 5 : 3, true), [0, deck + 1.85, -1.7], col(WOOD.dark), {
    aoAmt: 0,
  });
  // swallowtail pennant streaming aft (-z)
  const fy = mastTop - 0.18;
  const flag = new THREE.ShapeGeometry(
    new THREE.Shape([
      new THREE.Vector2(0, 0.2),
      new THREE.Vector2(0.85, 0.2),
      new THREE.Vector2(0.62, 0),
      new THREE.Vector2(0.85, -0.2),
      new THREE.Vector2(0, -0.2),
    ]),
  );
  put(acc, flag, [0, fy, -1.7], col(CORAL), {
    q: qEuler(0, Math.PI / 2, 0),
    double: true,
    aoAmt: 0,
    ao: () => 1,
    windAbs: (p) => clamp01((-1.7 - p.z) / 0.85) * 0.9 + 0.1,
  });
  // awning over the passenger deck
  const aw = 2.0;
  const ad = 2.3;
  const ay = deck + 1.45;
  const az = 0.0;
  if (hi) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const sw = aw / n;
      put(
        acc,
        new THREE.BoxGeometry(sw, 0.08, ad),
        [-aw / 2 + (i + 0.5) * sw, ay, az],
        col(i % 2 === 0 ? CORAL : WALLS[0]),
        { q: qEuler(0.06, 0, 0), aoAmt: 0.05 },
      );
    }
    for (const sx of [-1, 1])
      for (const z of [-1.0, 1.0])
        put(
          acc,
          cylB(0.05, 0.045, 1.4, 5, true),
          [sx * Math.min(0.85, ferryHalf(z) - 0.2), deck, z],
          col(WOOD.dark),
          {
            aoAmt: 0.1,
          },
        );
    // benches along both sides
    for (const sx of [-1, 1]) {
      put(
        acc,
        new THREE.BoxGeometry(0.3, 0.07, 1.5),
        [sx * 0.68, deck + 0.34, 0.0],
        col(WOOD.planks),
        { aoAmt: 0.1 },
      );
      for (const z of [-0.6, 0.6])
        put(
          acc,
          new THREE.BoxGeometry(0.26, 0.34, 0.07),
          [sx * 0.68, deck + 0.17, z],
          col(WOOD.dark),
          { aoAmt: 0.15 },
        );
    }
    // rails: posts + top rope each side
    for (const sx of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (const z of [-2.6, -1.1, 0.4, 1.5, 2.2]) {
        const x = sx * ferryHalf(z) * 0.93;
        put(acc, cylB(0.025, 0.025, 0.34, 3, true), [x, deck, z], col(WOOD.dark), { aoAmt: 0 });
        pts.push(V(x, deck + 0.34, z));
      }
      put(acc, tubeAlong(pts, 0.022, 3), [0, 0, 0], col(WALLS[1]), { aoAmt: 0 });
    }
    // windows (warm at night) on the cabin sides and the wheelhouse front
    for (const sx of [-1, 1])
      for (const z of [-2.5, -1.95, -1.4])
        put(
          acc,
          new THREE.BoxGeometry(0.05, 0.3, 0.38),
          [sx * 0.78, deck + 0.55, z],
          col(EMISSIVE.window),
          {
            emissive: 1,
            aoAmt: 0,
            ao: () => 1,
          },
        );
    put(acc, new THREE.BoxGeometry(0.8, 0.3, 0.05), [0, deck + 1.4, -1.2], col(EMISSIVE.window), {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
    // lifebuoys on the cabin sides
    for (const sx of [-1, 1])
      put(
        acc,
        new THREE.TorusGeometry(0.2, 0.065, 4, 9),
        [sx * 0.8, deck + 0.52, -2.45],
        col(ROOFS[1]),
        {
          q: qEuler(0, Math.PI / 2, 0),
          aoAmt: 0,
        },
      );
    // funnel
    put(acc, cylB(0.2, 0.17, 0.55, 7), [0, deck + 1.05, -2.5], col(WALLS[1]), { aoAmt: 0.1 });
    put(acc, cylB(0.21, 0.21, 0.14, 7), [0, deck + 1.5, -2.5], col(CORAL), { aoAmt: 0 });
    // bow bollard + lantern
    put(acc, cylB(0.1, 0.09, 0.26, 6), [0, deck, 2.55], col(ROCK[2]), { aoAmt: 0.1 });
    put(acc, new THREE.IcosahedronGeometry(0.1, 0), [0, deck + 0.4, 2.55], col(EMISSIVE.lantern), {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
    put(acc, cylB(0.02, 0.02, 0.18, 3, true), [0, deck + 0.26, 2.55], col(ROCK[2]), { aoAmt: 0 });
  } else {
    put(acc, new THREE.BoxGeometry(aw, 0.12, ad), [0, ay, az], col(CORAL), {
      aoAmt: 0.05,
      q: qEuler(0.06, 0, 0),
    });
    put(acc, new THREE.BoxGeometry(0.1, 1.4, 0.1), [0, deck + 0.7, 0], col(WOOD.dark), {
      aoAmt: 0.1,
    });
  }
  return acc.finish(rng, true, true);
}

/** Half-width of the inspection-boat hull (`hullShape(5.5, 2)`) at z, for fenders and rails. */
function inspectionHalf(z: number): number {
  if (z < -1.1) return 0.7 + ((z + 2.75) / 1.65) * 0.3;
  if (z < 0.9625) return 1 - ((z + 1.1) / 2.0625) * 0.06;
  return Math.max(0, 0.94 * (1 - (z - 0.9625) / 1.7875));
}

/** Window-light plate (warm at night). */
function litPane(acc: Acc, w: number, h: number, d: number, at: [number, number, number]): void {
  put(acc, new THREE.BoxGeometry(w, h, d), at, col(EMISSIVE.window), {
    emissive: 1,
    aoAmt: 0,
    ao: () => 1,
  });
}

/**
 * Inspectors' patrol boat (sailboat variant 3, M19 TASK-414): 5.5 u white hull with QA-green boot-top
 * and sheer stripe and a magnifier badge on each side, aft wheelhouse with lit windows, green roof,
 * a tick shield on each cabin side, a bridge deck with an amber beacon (hook `beacon`) and a chevron
 * pennant mast, fenders, a rope rail and a stack of ticked "approved" crates on the foredeck.
 * Bow +z, keel at y = 0. LOD1: hull, cabin, roof, bridge, beacon, pennant.
 */
function inspectionBoat({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const hi = lod === 0;
  const hullH = 0.74;
  const G = THEMES.qa.accent;
  const GD = '#2E9E74';
  const L = 5.5;
  const W = 2.0;
  const ext = (depth: number): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(hullShape(L, W), { depth, bevelEnabled: false }).rotateX(Math.PI / 2);
  const bands: ReadonlyArray<readonly [number, number, string]> = hi
    ? [
        [0, 0.22, GD],
        [0.22, 0.5, WALLS[1]],
        [0.5, 0.62, G],
        [0.62, hullH, WALLS[1]],
      ]
    : [
        [0, 0.3, GD],
        [0.3, hullH, WALLS[1]],
      ];
  for (const [y0, y1, c] of bands)
    put(
      acc,
      ext(y1 - y0),
      [0, y1, 0],
      (p) => (y1 === hullH && p.y > hullH - 0.01 ? col(WOOD.planks) : col(c)),
      { aoAmt: 0.2, noJitter: true },
    );
  const deck = hullH;
  // aft wheelhouse, green roof, bridge deck
  put(
    acc,
    new THREE.BoxGeometry(1.45, 1.0, 1.7).translate(0, 0.5, 0),
    [0, deck, -1.25],
    col(WALLS[0]),
    { aoAmt: 0.15 },
  );
  put(
    acc,
    new THREE.BoxGeometry(1.7, 0.1, 1.95).translate(0, 0.05, 0),
    [0, deck + 1.0, -1.25],
    col(G),
    { aoAmt: 0.05 },
  );
  put(
    acc,
    new THREE.BoxGeometry(1.0, 0.55, 0.9).translate(0, 0.275, 0),
    [0, deck + 1.1, -1.0],
    col(WALLS[1]),
    { aoAmt: 0.1 },
  );
  put(
    acc,
    new THREE.BoxGeometry(1.2, 0.08, 1.1).translate(0, 0.04, 0),
    [0, deck + 1.65, -1.0],
    col(GD),
    { aoAmt: 0.05 },
  );
  // beacon on the bridge roof: dark base, amber lens (lit at night)
  const by = deck + 1.73;
  put(acc, cylB(0.17, 0.14, 0.1, hi ? 8 : 5), [0.28, by, -1.15], col(ROCK[2]), { aoAmt: 0 });
  put(
    acc,
    new THREE.IcosahedronGeometry(0.14, hi ? 1 : 0),
    [0.28, by + 0.22, -1.15],
    col(EMISSIVE.lantern),
    { emissive: 1, aoAmt: 0, ao: () => 1 },
  );
  // pennant mast aft of the bridge, QA chevron streaming aft
  const mTop = by + 1.05;
  put(acc, cylB(0.045, 0.035, 1.05, hi ? 5 : 3, true), [-0.28, by, -1.3], col(WALLS[1]), {
    aoAmt: 0,
  });
  const pen = new THREE.ShapeGeometry(
    new THREE.Shape([
      new THREE.Vector2(0, 0.17),
      new THREE.Vector2(0.78, 0.17),
      new THREE.Vector2(0.55, 0),
      new THREE.Vector2(0.78, -0.17),
      new THREE.Vector2(0, -0.17),
    ]),
  );
  put(acc, pen, [-0.28, mTop - 0.2, -1.3], col(G), {
    q: qEuler(0, -Math.PI / 2, 0),
    double: true,
    aoAmt: 0,
    ao: () => 1,
    windAbs: (p) => clamp01((-1.3 - p.z) / 0.78) * 0.9 + 0.1,
  });
  if (hi) {
    // windows: bridge front and sides, cabin front
    litPane(acc, 0.9, 0.3, 0.05, [0, deck + 1.38, -0.54]);
    litPane(acc, 0.95, 0.3, 0.05, [0, deck + 0.62, -0.39]);
    for (const sx of [-1, 1]) litPane(acc, 0.05, 0.32, 0.5, [sx * 0.52, deck + 1.38, -1.0]);
    for (const sx of [-1, 1]) {
      const q = qEuler(0, (sx * Math.PI) / 2, 0);
      // cabin side: green tick plate with a white tick (bars)
      put(acc, new THREE.BoxGeometry(0.66, 0.66, 0.05), [sx * 0.74, deck + 0.52, -1.5], col(G), {
        q,
        aoAmt: 0,
      });
      const tk = (ax: number, ay: number, bx: number, by2: number): void => {
        const len = Math.hypot(bx - ax, by2 - ay) + 0.07;
        put(
          acc,
          new THREE.BoxGeometry(len, 0.075, 0.04),
          [sx * 0.78, deck + 0.52 + (ay + by2) / 2, -1.5 - sx * ((ax + bx) / 2)],
          col(WALLS[1]),
          { q: q.clone().multiply(qEuler(0, 0, Math.atan2(by2 - ay, bx - ax))), aoAmt: 0 },
        );
      };
      tk(-0.18, 0.0, -0.05, -0.14);
      tk(-0.05, -0.14, 0.2, 0.16);
      // magnifier badge on the white hull band: ring + handle
      const mz = 0.25;
      const hx = sx * (inspectionHalf(mz) + 0.01);
      put(acc, new THREE.TorusGeometry(0.1, 0.035, 4, 10), [hx, 0.4, mz], col(G), { q, aoAmt: 0 });
      put(acc, new THREE.BoxGeometry(0.2, 0.05, 0.04), [hx, 0.3, mz - 0.14], col(G), {
        q: q.clone().multiply(qEuler(0, 0, 0.9)),
        aoAmt: 0,
      });
    }
    // fenders and a rope rail on the foredeck
    for (const sx of [-1, 1]) {
      for (const z of [-0.6, 0.8, 1.4])
        put(
          acc,
          new THREE.IcosahedronGeometry(0.09, 0),
          [sx * (inspectionHalf(z) + 0.02), 0.52, z],
          col(ROCK[2]),
          { aoAmt: 0 },
        );
      const pts: THREE.Vector3[] = [];
      for (const z of [0.1, 1.0, 1.9]) {
        const x = sx * inspectionHalf(z) * 0.92;
        put(acc, cylB(0.025, 0.025, 0.34, 3, true), [x, deck, z], col(WOOD.dark), { aoAmt: 0 });
        pts.push(V(x, deck + 0.34, z));
      }
      put(acc, tubeAlong(pts, 0.022, 3), [0, 0, 0], col(WALLS[1]), { aoAmt: 0 });
    }
    // ticked crates on the foredeck
    for (const [x, y, z, r] of [
      [-0.3, 0, 0.75, 0.1],
      [0.28, 0, 0.8, -0.15],
      [0.0, 0.3, 0.78, 0.05],
    ] as const) {
      put(
        acc,
        new THREE.BoxGeometry(0.46, 0.3, 0.42).translate(0, 0.15, 0),
        [x, deck + y, z],
        col(WOOD.planks),
        { q: qEuler(0, r, 0), aoAmt: 0.15 },
      );
      put(acc, new THREE.BoxGeometry(0.2, 0.2, 0.02), [x, deck + y + 0.17, z + 0.22], col(G), {
        q: qEuler(0, r, 0),
        aoAmt: 0,
      });
    }
    // bow bollard + lantern
    put(acc, cylB(0.1, 0.09, 0.22, 6), [0, deck, 2.35], col(ROCK[2]), { aoAmt: 0.1 });
    put(
      acc,
      new THREE.IcosahedronGeometry(0.09, 0),
      [0, deck + 0.34, 2.35],
      col(EMISSIVE.lantern),
      {
        emissive: 1,
        aoAmt: 0,
        ao: () => 1,
      },
    );
  } else {
    put(acc, new THREE.BoxGeometry(0.6, 0.6, 0.6), [0, deck + 0.3, 0.8], col(WOOD.planks), {
      aoAmt: 0.15,
    });
  }
  const g = acc.finish(rng, true, true);
  g.userData.hooks = { beacon: { pivot: [0.28, by + 0.22, -1.15] } };
  return g;
}

export function sailboat({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  if (variant === 2) return ferry({ rng, lod, variant });
  if (variant === 3) return inspectionBoat({ rng, lod, variant });
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

/**
 * One rock tower of height H / foot radius R at `at` (strata bands, a grass cap at LOD0; the
 * `lean` factor tilts the top). `radial` / `hseg` are the cylinder resolutions.
 */
function stackTower(
  acc: Acc,
  r: Rng,
  noise: ReturnType<typeof createNoise>,
  lod: number,
  H: number,
  R: number,
  at: [number, number, number],
  leanMul: number,
  radial: number,
  hseg: number,
): void {
  const g = new THREE.CylinderGeometry(1, 1, H, radial, hseg, false).translate(0, H / 2, 0);
  const pos = g.getAttribute('position');
  const lean = r.range(-0.4, 0.4) * leanMul;
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
    const t = (p.y - at[1]) / H;
    if (t > 0.9) return col(GRASS[2]);
    if (t < 0.1) return col(ROCK[1]);
    const i = Math.floor(t * 6 + 0.3 * noise.n3(p.x * 0.5, p.y, p.z * 0.5));
    return col(CLIFF_STRATA[((i % 2) + 2) % 2]);
  };
  acc.add(g, { m: mat(at), color: bands, windMul: 0, aoAmt: 0.3 });
  if (lod === 0) {
    put(
      acc,
      blob(R * 0.75, 0, noise, 0.15, 1.2, 3),
      [at[0] + lean * H * 0.25, at[1] + H + 0.05, at[2]],
      gradYGrass(at[1] + H),
      { aoAmt: 0.1, s: [1, 0.55, 1] },
    );
  }
}

/**
 * Sea stack: variants 0–2 are the 6 / 10 / 15 u size classes; variant 3 (TASK-474 `W:D3`) is the
 * arch — two 9 u towers 2.6 u either side of the pivot (local x) joined by a rock lintel.
 */
export function seaStack({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('stack');
  const acc = new Acc();
  const noise = createNoise(r.fork('n'));
  if (variant === 3) {
    const H = 9;
    const R = 1.9 * r.range(0.95, 1.05);
    const radial = lod === 0 ? 10 : 6;
    const hseg = lod === 0 ? 6 : 2;
    for (const sx of [-2.6, 2.6])
      stackTower(acc, r.fork('tower', sx), noise, lod, H, R, [sx, 0, 0], 0.15, radial, hseg);
    // the lintel: a noisy block across the top of both towers, grass on its back at LOD0
    const lint = new THREE.BoxGeometry(6.6, 1.7, 2.4, lod === 0 ? 4 : 1, 1, 1).translate(0, 7.1, 0);
    const lp = lint.getAttribute('position');
    for (let i = 0; i < lp.count; i++) {
      const x = lp.getX(i);
      const y = lp.getY(i);
      const z = lp.getZ(i);
      const n = 0.22 * noise.n3(x * 0.9 + 5, y * 0.9, z * 0.9 - 5);
      lp.setXYZ(i, x * (1 + n), y + n * 0.6, z * (1 + n));
    }
    acc.add(lint, {
      m: mat([0, 0, 0]),
      color: (p) => col(p.y > 7.75 ? GRASS[2] : CLIFF_STRATA[p.y > 6.9 ? 0 : 1]),
      windMul: 0,
      aoAmt: 0.25,
    });
    return acc.finish(rng, false, true);
  }
  const cls = variant % 3;
  const H = [6, 10, 15][cls];
  const R = [1.6, 2.1, 2.7][cls] * r.range(0.95, 1.05);
  const radial = lod === 0 ? 12 : 6;
  const hseg = lod === 0 ? 8 : 3;
  stackTower(acc, r, noise, lod, H, R, [0, 0, 0], (cls + 1) * 0.35, radial, hseg);
  return acc.finish(rng, false, true);
}
const gradYGrass =
  (H: number) =>
  (p: THREE.Vector3): THREE.Color =>
    col(GRASS[2]).lerp(col(GRASS[1]), clamp01((p.y - H) / 1.2));

/**
 * Buoy: variant 0 the striped harbour buoy; variants 1 (red, port) / 2 (green, starboard) are the
 * channel markers of the ferry routes (TASK-474 `W:D8`): a taller banded body, a short mast and a
 * lamp (emissive 1, the sea lamp set) that reads as a light dot from the overview. The whole body
 * carries a fixed wind weight: the `windy` sway is its gentle bob. LOD1 is one shared geometry.
 */
export function buoy({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng);
  const bob = { windAbs: 0.5 };
  if (lod === 1) {
    // one LOD1 for every variant (no jitter, same colours → the batcher collapses the variants
    // into one instanced group, D-032): a red body and the lamp dot
    const cap = new THREE.CapsuleGeometry(0.2, 0.42, 1, 4).translate(0, 0.38, 0);
    put(acc, cap, [0, 0, 0], col(ROOFS[1]), { aoAmt: 0.15, noJitter: true, ...bob });
    // (a big lamp: at LOD1 distances it is the light dot of the W15 dotted lines)
    put(acc, new THREE.SphereGeometry(0.32, 4, 2), [0, 1.1, 0], col(EMISSIVE.lantern), {
      aoAmt: 0,
      emissive: 1,
      noJitter: true,
      ...bob,
    });
    return acc.finish(rng, false, true);
  }
  if (variant === 1 || variant === 2) {
    const body = variant === 1 ? ROOFS[1] : FOLIAGE.deciduous[1];
    const cap = new THREE.CapsuleGeometry(0.2, 0.42, 2, 8).translate(0, 0.38, 0);
    put(acc, cap, [0, 0, 0], (p) => (p.y > 0.3 && p.y < 0.46 ? col(WALLS[1]) : col(body)), {
      aoAmt: 0.15,
      ...bob,
    });
    put(acc, cylB(0.03, 0.03, 0.34, 3, true), [0, 0.74, 0], col(WOOD.dark), { aoAmt: 0, ...bob });
    put(acc, new THREE.SphereGeometry(0.2, 7, 4), [0, 1.1, 0], col(EMISSIVE.lantern), {
      aoAmt: 0,
      emissive: 1,
      noJitter: true,
      ...bob,
    });
    return acc.finish(rng, false, true);
  }
  const cap = new THREE.CapsuleGeometry(0.17, 0.3, 2, 8).translate(0, 0.32, 0);
  put(
    acc,
    cap,
    [0, 0, 0],
    (p) => (Math.floor(p.y / 0.2) % 2 === 0 ? col(ROOFS[1]) : col(WALLS[1])),
    { aoAmt: 0.15, cullY: 0, ...bob },
  );
  put(acc, cylB(0.025, 0.025, 0.2, 3, true), [0, 0.6, 0], col(WOOD.dark), { aoAmt: 0, ...bob });
  put(acc, new THREE.ConeGeometry(0.08, 0.12, 5), [0, 0.82, 0], col(ROOFS[3]), {
    aoAmt: 0,
    ...bob,
  });
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
