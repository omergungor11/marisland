/**
 * coding theme structure geometry (M14b, TASK-376); defs: content/props-themes/coding.ts.
 *
 * windTurbine (T0 signature, aSpin blades), solarRow, hedge, bikeRack, reflectingPoolEdge. Every
 * builder has a LOD1 from the SAME palette + silhouette (D-031/D-032) and emits the cottage attribute
 * set (position / normal / color / wind / ao / emissive, + aSpin on the turbine).
 *
 * Animation hooks for TASK-384 (all in `geometry.userData.hooks`, vertex indices of the non-indexed
 * geometry, identical at LOD0 and LOD1 apart from counts; see `Hooks` below):
 * - windTurbine: `yaw` = the head (nacelle, nose, blades) as the vertex range [first, first+count),
 *   pivot on the tower axis at the tower top; the blades already spin through aSpin (hub +
 *   `spinAxis` z in the head's frame, so a yaw rotation about y must also rotate the hub/axis).
 * - solarRow: `tilt` = one range per panel (panel + cells), rotation about the x axis through `pivot`.
 */
import * as THREE from 'three';
import { CODING_COLORS as K, TURBINE_HEIGHTS } from '../../content/props-themes/coding.ts';
import { Acc, col, createNoise, qEuler } from '../kit.ts';
import { Spin, finishSpin } from '../office-kit.ts';
import { TAU, V, V2, baseBox, bevBox, cylB, jitterAcc, lathe, prism, put } from '../parts.ts';
import type { BuildOpts, PropGeoDef } from '../types.ts';

/** Vertices emitted so far (Acc keeps its buffers private; ranges are exact, degenerate tris never land). */
export const accVerts = (acc: Acc): number => (acc as unknown as { pos: number[] }).pos.length / 3;

export interface VertexRange {
  first: number;
  count: number;
}

const finish = (acc: Acc, rng: BuildOpts['rng']): THREE.BufferGeometry =>
  acc.finish(rng, false, true);

/** Blade split at `cut` (fraction of the length) into a white body and an accent tip. */
function bladeParts(r0: number, len: number, chord: number, thick: number, lod: 0 | 1) {
  const cutY = r0 + (len - r0) * 0.74;
  const wpt = (y: number): [number, number] => {
    // outline half-widths (leading, trailing) at height y, same polygon as bladeProfile
    const t = (y - r0) / (len - r0);
    const lead = -chord * (0.28 - 0.16 * t);
    const trail = chord * (0.72 - 0.62 * t);
    return [lead, trail];
  };
  if (lod === 1) {
    const [l0, t0] = wpt(r0);
    const [l1, t1] = wpt(cutY);
    const [l2, t2] = wpt(len);
    return {
      body: prism([V2(l0, r0), V2(t0, r0), V2(t1, cutY), V2(l1, cutY)], thick),
      tip: prism([V2(l1, cutY), V2(t1, cutY), V2((l2 + t2) / 2, len)], thick),
    };
  }
  const [l0, t0] = wpt(r0);
  const [l1, t1] = wpt(cutY);
  const [l2, t2] = wpt(len);
  const mid = r0 + (cutY - r0) * 0.5;
  const [lm, tm] = wpt(mid);
  return {
    body: prism(
      [V2(l0, r0), V2(t0, r0), V2(tm, mid), V2(t1, cutY), V2(l1, cutY), V2(lm, mid)],
      thick,
    ),
    tip: prism([V2(l1, cutY), V2(t1, cutY), V2(t2 + chord * 0.1, len), V2(l2, len)], thick),
  };
}

export function windTurbine({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('turbine');
  const H = TURBINE_HEIGHTS[variant % TURBINE_HEIGHTS.length];
  const hubY = H * 0.73;
  const bladeLen = H * 0.27;
  const k = 0.6 + 0.4 * (H / 15);
  const towerTop = hubY - 0.34 * k;
  const r0 = 0.5 * k;
  const r1 = 0.22 * k;
  const seg = lod === 0 ? 14 : 5;
  const acc = new Acc();
  const spin = new Spin();
  const foot = col(K.towerFoot);
  const white = col(K.white);
  const accent = col(K.accent);
  // tower: foot band, white shaft, accent collar under the nacelle
  const yA = 0.3;
  const yB = 0.9 + 0.12 * H * 0.15;
  const yC = towerTop - 0.55 * k;
  const rad = (y: number): number => r0 + (r1 - r0) * ((y - yA) / (towerTop - yA));
  const ringYs =
    lod === 0
      ? [yA, yB, yB + (yC - yB) * 0.33, yB + (yC - yB) * 0.66, yC, towerTop]
      : [yA, yB, yC, towerTop];
  const tower = lathe(
    ringYs.map((y) => [rad(y), y] as const),
    seg,
  ).rotateY(r.range(0, TAU));
  put(acc, tower, [0, 0, 0], (p) => (p.y < yB ? foot : p.y > yC ? accent : white), {
    aoAmt: 0.2,
  });
  put(acc, cylB(r0 * 1.45, r0 * 1.3, yA, seg), [0, 0, 0], col(K.steel), { aoAmt: 0.25 });
  if (lod === 0) {
    // service door (dark) with a lamp over it
    put(acc, baseBox(0.34 * k, 0.62 * k, 0.1), [0, yA, r0 * 1.0], col(K.dark), { aoAmt: 0 });
    put(acc, baseBox(0.12 * k, 0.1 * k, 0.1), [0, yA + 0.72 * k, r0 * 0.99], col(K.accent), {
      emissive: 0.8,
      ao: () => 1,
      aoAmt: 0,
    });
  }
  // head: everything from here yaws as one piece (hook)
  const headFirst = accVerts(acc);
  // yaw 0 at rest: aSpin rotates in the object xy plane, so the rotor plane must face +z
  const yaw = 0;
  const qh = qEuler(0, yaw, 0);
  const at = (x: number, y: number, z: number): THREE.Vector3 => V(x, y, z).applyQuaternion(qh);
  const nacelle =
    lod === 0
      ? bevBox(0.72 * k, 0.7 * k, 1.9 * k, 0.1 * k)
      : new THREE.BoxGeometry(0.72 * k, 0.7 * k, 1.9 * k);
  put(acc, nacelle, at(0, hubY - 0.02 * k, -0.1 * k), col(K.nacelle), { q: qh, aoAmt: 0.1 });
  if (lod === 0) {
    // accent stripe along the nacelle sides + red aviation lamp on top (night glow)
    for (const sx of [-1, 1])
      put(
        acc,
        baseBox(0.03, 0.12 * k, 1.5 * k),
        at(sx * 0.37 * k, hubY - 0.08 * k, -0.15 * k),
        accent,
        {
          q: qh,
          aoAmt: 0,
        },
      );
    put(
      acc,
      new THREE.IcosahedronGeometry(0.09 * k, 0),
      at(0, hubY + 0.4 * k, -0.55 * k),
      col(K.lamp),
      {
        emissive: 1,
        ao: () => 1,
        aoAmt: 0,
      },
    );
  }
  const hubZ = 0.98 * k;
  const hub = at(0, hubY, hubZ);
  const tag = spin.tag(hub);
  const nose = new THREE.ConeGeometry(0.3 * k, 0.55 * k, lod === 0 ? 8 : 4).rotateX(Math.PI / 2);
  put(acc, nose, at(0, hubY, hubZ + 0.2 * k), accent, {
    q: qh,
    windAbs: tag,
    aoAmt: 0,
    ao: () => 0.97,
  });
  if (lod === 0) {
    put(acc, new THREE.IcosahedronGeometry(0.2 * k, 1), at(0, hubY, hubZ + 0.04 * k), white, {
      q: qh,
      windAbs: tag,
      aoAmt: 0,
      ao: () => 0.97,
    });
    // rear cooling vents (static head parts)
    for (let i = 0; i < 3; i++)
      put(
        acc,
        baseBox(0.4 * k, 0.04 * k, 0.05),
        at(0, hubY - 0.2 * k + i * 0.17 * k, -1.07 * k),
        col(K.dark),
        {
          q: qh,
          aoAmt: 0,
        },
      );
  }
  const a0 = r.range(0, TAU / 3);
  const chord = 0.5 * k * (H >= 12 ? 1 : 0.9);
  const { body, tip } = bladeParts(0.22 * k, bladeLen, chord, 0.07 * k, lod);
  for (let b = 0; b < 3; b++) {
    const q = qh.clone().multiply(qEuler(0, 0, a0 + (b * TAU) / 3));
    const bp = hub.clone().add(V(0, 0, 0.1 * k).applyQuaternion(qh));
    put(acc, body.clone(), bp, white, { q, windAbs: tag, aoAmt: 0, ao: () => 0.97 });
    put(acc, tip.clone(), bp, accent, { q, windAbs: tag, aoAmt: 0, ao: () => 0.97 });
  }
  const headCount = accVerts(acc) - headFirst;
  const g = finishSpin(finish(acc, rng), acc, spin);
  g.userData.hooks = {
    yaw: { first: headFirst, count: headCount, pivot: [0, towerTop, 0] },
  };
  return g;
}

const PANEL_W = 1.1;
const PANEL_D = 1.25;
const PANEL_TILT = 0.45;
const PANEL_Y = 0.55;

export function solarRow({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.03);
  const n = variant % 2 === 0 ? 3 : 4;
  const gap = 0.1;
  const x0 = -((n - 1) * (PANEL_W + gap)) / 2;
  const q = qEuler(PANEL_TILT, 0, 0);
  const tilt: Array<VertexRange & { pivot: number[] }> = [];
  const frameCol = variant === 0 ? K.white : K.accent;
  for (let i = 0; i < n; i++) {
    const cx = x0 + i * (PANEL_W + gap);
    const first = accVerts(acc);
    put(
      acc,
      new THREE.BoxGeometry(PANEL_W, 0.06, PANEL_D),
      [cx, PANEL_Y, 0],
      lod === 0 ? col(K.solar) : col(K.solar).lerp(col(K.solarLine), 0.2),
      {
        q,
        aoAmt: 0,
      },
    );
    if (lod === 0) {
      // frame rim under the glass + cell grid lines on top
      put(
        acc,
        new THREE.BoxGeometry(PANEL_W + 0.08, 0.04, PANEL_D + 0.08),
        [cx, PANEL_Y - 0.03 * Math.cos(PANEL_TILT), 0.03 * Math.sin(PANEL_TILT)],
        col(frameCol),
        { q, aoAmt: 0 },
      );
      const up = V(0, 0.034, 0).applyQuaternion(q);
      for (const f of [-1 / 3, 0, 1 / 3])
        // lines at +-W/6 and 0
        put(
          acc,
          new THREE.BoxGeometry(0.02, 0.01, PANEL_D * 0.96),
          [cx + f * PANEL_W * 0.5, PANEL_Y + up.y, up.z],
          col(K.solarLine),
          {
            q,
            aoAmt: 0,
          },
        );
      for (const f of [-0.3, -0.1, 0.1, 0.3]) {
        const o = V(0, 0.034, f * PANEL_D).applyQuaternion(q);
        put(
          acc,
          new THREE.BoxGeometry(PANEL_W * 0.94, 0.01, 0.02),
          [cx, PANEL_Y + o.y, o.z],
          col(K.solarLine),
          {
            q,
            aoAmt: 0,
          },
        );
      }
    }
    tilt.push({ first, count: accVerts(acc) - first, pivot: [cx, PANEL_Y, 0] });
  }
  // supports: posts at the panel boundaries + a rear rail
  const posts = n + 1;
  for (let i = 0; i < posts; i += lod === 0 ? 1 : n) {
    const px = x0 - (PANEL_W + gap) / 2 + i * (PANEL_W + gap);
    put(
      acc,
      cylB(0.035, 0.035, PANEL_Y + 0.05, lod === 0 ? 4 : 3, true),
      [px, 0, 0.05],
      col(K.steel),
      {
        aoAmt: 0.1,
      },
    );
  }
  if (lod === 0)
    put(acc, baseBox(n * (PANEL_W + gap), 0.05, 0.08), [0, 0.18, 0.05], col(K.rack), { aoAmt: 0 });
  const g = finish(acc, rng);
  g.userData.hooks = { tilt };
  return g;
}

/** Displaced segmented box = clipped hedge block (noise only on the top + sides, never the base). */
function hedgeBlock(
  w: number,
  h: number,
  d: number,
  noise: ReturnType<typeof createNoise>,
  off: number,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(2, Math.round(w / 0.3)), 2, 2).translate(
    0,
    h / 2,
    0,
  );
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0.02) continue;
    const a = 0.045 * noise.n3(p.getX(i) * 2.2 + off, y * 2.2, p.getZ(i) * 2.2 - off);
    p.setXYZ(i, p.getX(i) + a, y + a * 0.8, p.getZ(i) + a);
  }
  return g;
}

export function hedge({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.04);
  const noise = createNoise(rng.fork('hedge'));
  const h = 0.8;
  const body = col(K.hedge);
  const top = col(K.hedgeTop);
  const colorFn = (p: THREE.Vector3): THREE.Color => (p.y > h - 0.1 ? top : body);
  const arms: Array<[number, number, number, number]> =
    variant % 2 === 0
      ? [[0, 0, 2.0, 0.7]]
      : [
          [-0.55, 0, 1.4, 0.7],
          [0.35, 0.55, 0.7, 1.3],
        ];
  arms.forEach(([x, z, w, d], i) => {
    const geo =
      lod === 0
        ? hedgeBlock(w, h, d, noise, i * 3.1)
        : new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    put(acc, geo, [x, 0, z], colorFn, { aoAmt: 0.25 });
  });
  return finish(acc, rng);
}

export function bikeRack({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.03);
  const n = 4;
  const sp = 0.42;
  const x0 = -((n - 1) * sp) / 2;
  const hi = lod === 0;
  const steel = col(K.rack);
  if (hi) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * sp;
      put(acc, new THREE.TorusGeometry(0.16, 0.022, 4, 8, Math.PI), [x, 0.3, 0], steel, {
        q: qEuler(0, Math.PI / 2, 0),
        aoAmt: 0.1,
      });
      for (const sz of [-1, 1])
        put(acc, cylB(0.022, 0.022, 0.3, 4, true), [x, 0, sz * 0.16], steel, { aoAmt: 0.1 });
    }
    put(acc, baseBox(n * sp, 0.03, 0.46), [0, 0, 0], col(K.kerb), { aoAmt: 0.1 });
  } else {
    put(acc, baseBox(n * sp, 0.03, 0.46), [0, 0, 0], col(K.kerb), { aoAmt: 0.1 });
    put(acc, baseBox(n * sp, 0.04, 0.05), [0, 0.42, 0], steel, { aoAmt: 0 });
    for (const x of [x0 - 0.1, x0 + (n - 1) * sp + 0.1])
      put(acc, cylB(0.04, 0.04, 0.42, 3, true), [x, 0, 0], steel, { aoAmt: 0 });
  }
  if (variant % 2 === 1) {
    // one parked bike (accent frame) leaning in slot 2, seen side-on across the rack
    const x = x0 + 1.5 * sp;
    const tyre = col(K.tyre);
    const frame = col(K.bikeFrame);
    const wheel = hi
      ? new THREE.TorusGeometry(0.2, 0.02, 4, 10)
      : new THREE.CylinderGeometry(0.2, 0.2, 0.04, 5).rotateZ(Math.PI / 2);
    for (const wz of [-0.3, 0.3])
      put(acc, wheel.clone(), [x, 0.22, wz], tyre, {
        q: hi ? qEuler(0, Math.PI / 2, 0) : undefined,
        aoAmt: 0,
      });
    put(acc, new THREE.BoxGeometry(0.04, 0.04, 0.64), [x, 0.34, 0], frame, { aoAmt: 0 });
    if (hi) {
      put(acc, new THREE.BoxGeometry(0.04, 0.3, 0.04), [x, 0.4, 0.28], frame, { aoAmt: 0 });
      put(acc, new THREE.BoxGeometry(0.2, 0.03, 0.04), [x, 0.56, 0.3], tyre, { aoAmt: 0 });
      put(acc, new THREE.BoxGeometry(0.08, 0.03, 0.16), [x, 0.47, -0.22], tyre, { aoAmt: 0 });
    }
  }
  return finish(acc, rng);
}

export function reflectingPoolEdge({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.02);
  const kerb = col(K.kerb);
  const inlay = col(K.kerbTop);
  const accent = col(K.accent);
  const h = 0.22;
  const t = 0.34;
  // straight: 2 u along x (pool to -z); corner: two 1.2 u arms (-x and -z) meeting at a post on the origin
  const pieces: Array<[number, number, number, number]> =
    variant % 2 === 0
      ? [[0, 0, 2.0, t]]
      : [
          [-0.6, 0, 1.2, t],
          [0, -0.6, t, 1.2],
        ];
  for (const [x, z, w, d] of pieces) {
    const long = w > d;
    if (lod === 0) {
      put(acc, bevBox(w, h, d, 0.04).translate(0, h / 2, 0), [x, 0, z], kerb, { aoAmt: 0.2 });
      put(
        acc,
        baseBox(long ? w * 0.9 : w * 0.5, 0.02, long ? d * 0.5 : d * 0.9),
        [x, h, z],
        inlay,
        {
          aoAmt: 0,
        },
      );
      // accent light line along the pool side
      const len = (long ? w : d) * 0.9;
      put(
        acc,
        baseBox(long ? len : 0.025, 0.012, long ? 0.025 : len),
        [x + (long ? 0 : -w * 0.28), h + 0.02, z + (long ? -d * 0.28 : 0)],
        accent,
        { aoAmt: 0, emissive: 0.5, ao: () => 1 },
      );
    } else {
      put(acc, baseBox(w, h, d), [x, 0, z], kerb, { aoAmt: 0.2 });
    }
  }
  if (variant % 2 === 1)
    put(acc, cylB(0.2, 0.18, 0.34, lod === 0 ? 6 : 4), [0, 0, 0], kerb, { aoAmt: 0.15 });
  return finish(acc, rng);
}

export const CODING_GEO: readonly PropGeoDef[] = [
  {
    id: 'windTurbine',
    variants: 3,
    build: windTurbine,
    footprint: 1.3,
    height: 15,
    heights: TURBINE_HEIGHTS,
    windy: false,
  },
  { id: 'solarRow', variants: 2, build: solarRow, footprint: 2.35, height: 0.85, windy: false },
  { id: 'hedge', variants: 2, build: hedge, footprint: 1.1, height: 0.8, windy: false },
  {
    id: 'bikeRack',
    variants: 2,
    build: bikeRack,
    footprint: 0.9,
    height: 0.5,
    windy: false,
  },
  {
    id: 'reflectingPoolEdge',
    variants: 2,
    build: reflectingPoolEdge,
    footprint: 1.1,
    height: 0.25,
    heights: [0.25, 0.34],
    windy: false,
  },
];
