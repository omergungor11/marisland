/**
 * Kor Demircileri (Ember Smiths) culture kit (M19 TASK-412, ISLAND_CULTURES §2.3). Cozy-industrial,
 * chunky, built from boxes / cylinders / lathes with vertex colours from the palette tables
 * (content/props-themes/devops.ts DEVOPS_CULTURE_KIT). Geometry only; placement is the worldgen
 * wave. Local frame: ground at y = 0, the front faces +z.
 *
 *   lavaLantern    T2  basalt-footed iron post with a hexagonal lava-glass lantern (glows at night)
 *   ingotStack     T2  pallet pyramid of ingots; 3 variants = heat tone: hot / warm / cooled
 *   incidentSign   T2  "days since incident" board with 7-segment digits; v0 = 42, v1 = 0 (scorched)
 *   pipeValveWheel T2  copper pipe run with a red wheel valve (spins about its hub), gauge, stack
 *   signalHorn     T2  harbour siren: two red horns on a mast (a beacon lamp on top)
 *   serverShrine   T2  "the first server" on a stepped plinth under a roof, candles, a hard hat
 *   onsenDeck      T2  hot spring deck prefab: planks, towel rack, bench, lanterns, duck
 *   anvil          T3  anvil on a stump with a glowing workpiece (noShadow)
 *   pagerRock      T3  "on-call" rock with a blinking pager and a flag (noShadow)
 *   onsenHouse     T1  small bath house: barrel-vault steel roof, noren, glowing door and portholes
 *
 * Budget rules (ISLAND_CULTURES §4.2): no def reaches `isLargeStructure` (height < 3 u and the
 * smaller plan extent < 3 u) so the tier-2/3 defs never draw from T0; only the one tier-1 def
 * (onsenHouse) has a far group. Emissive: `emissive: 1` parts glow at night with the lamps ramp
 * (lantern glass, ingots, candles), `emissive: 2` quads are LED surfaces (tagged `led`).
 * Shared with the foundry variant (devops-works.ts): `lavaLanternInto`, `forgeBellInto`,
 * `forgeMedallionInto`, `cultureAcc`.
 */
import * as THREE from 'three';
import { DEVOPS_CULTURE_KIT as K } from '../../content/props-themes/devops.ts';
import type { Rng } from '../../core/rng.ts';
import { Acc, blob, col, createNoise, qEuler } from '../kit.ts';
import { Spin, finishSpin } from '../office-kit.ts';
import {
  TAU,
  V,
  baseBox,
  bevBox,
  cylB,
  jitterAcc,
  lathe,
  prism,
  put,
  tubeAlong,
} from '../parts.ts';
import type { BuildOpts, Lod, PropGeoDef } from '../types.ts';
import { addGlyph } from './glyphs.ts';
import { tagScreens } from './surface-tags.ts';

/** Acc that never jitters faces: LOD1 geometry must not depend on the per-variant rng stream. */
export class FlatAcc extends Acc {
  override add(geo: THREE.BufferGeometry, o: Parameters<Acc['add']>[1]): void {
    super.add(geo, { ...o, noJitter: true });
  }
}

/** LOD0: seeded scale jitter + per-face tone; LOD1: flat (identical across variants and seeds). */
export const cultureAcc = (rng: Rng, lod: Lod): Acc =>
  lod === 0 ? jitterAcc(rng, 0.012) : new FlatAcc();

const finish = (acc: Acc, rng: Rng): THREE.BufferGeometry => acc.finish(rng, false, true);
const lit = { emissive: 1, ao: () => 1, aoAmt: 0 } as const;
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
const AX = {
  /** Cylinder axis (+y) turned to +z / +x. */
  z: qEuler(Math.PI / 2, 0, 0),
  x: qEuler(0, 0, -Math.PI / 2),
};

/* ------------------------------ shared pieces ------------------------------ */

/**
 * Lava-glass lantern with its base cap at (x, y, z): hexagonal glass in an iron cage under a
 * copper roof (1.2 u tall at s = 1). The glass is emissive 1 (night glow).
 */
export function lavaLanternInto(acc: Acc, x: number, y: number, z: number, lod: Lod, s = 1): void {
  const hi = lod === 0;
  const at = (dy: number): [number, number, number] => [x, y + dy * s, z];
  const seg = hi ? 6 : 4;
  if (hi) put(acc, cylB(0.34, 0.3, 0.1, 6), at(0), K.iron, { s, aoAmt: 0.1 });
  put(acc, new THREE.CylinderGeometry(0.27, 0.33, 0.6, seg).translate(0, 0.3, 0), at(0.1), K.lava, {
    s,
    ...lit,
  });
  if (hi) put(acc, cylB(0.36, 0.36, 0.07, 6), at(0.7), K.iron, { s, aoAmt: 0 });
  put(acc, new THREE.ConeGeometry(0.44, 0.32, seg).translate(0, 0.16, 0), at(0.77), K.copper, {
    s,
    aoAmt: 0.1,
  });
  if (!hi) return;
  put(acc, new THREE.IcosahedronGeometry(0.075, 0), at(1.12), K.orange, { s, aoAmt: 0 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + TAU / 12;
    put(
      acc,
      baseBox(0.07, 0.62, 0.07),
      [x + Math.cos(a) * 0.31 * s, y + 0.1 * s, z + Math.sin(a) * 0.31 * s],
      K.iron,
      { s, aoAmt: 0 },
    );
  }
  put(acc, new THREE.TorusGeometry(0.1, 0.03, 4, 8), at(1.2), K.iron, { s, aoAmt: 0 });
}

/**
 * Forge bell belfry (foundry variant 1): four posts on the monitor ridge at (x, y, z), a copper
 * pyramid roof with a lava lantern on its apex, a brass bell on a cross-bar. ~1.9 u tall.
 */
export function forgeBellInto(acc: Acc, x: number, y: number, z: number): void {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      put(acc, baseBox(0.13, 1.75, 0.13), [x + sx * 0.44, y - 0.3, z + sz * 0.44], K.iron, {
        aoAmt: 0.1,
      });
  for (const sz of [-1, 1])
    bx(acc, 1.12, 0.1, 0.12, x, y + 0.45, z + sz * 0.44, K.orange, { aoAmt: 0 });
  bx(acc, 1.3, 0.12, 1.3, x, y + 1.4, z, K.orangeDeep, { aoAmt: 0.05 });
  put(
    acc,
    new THREE.ConeGeometry(0.95, 0.5, 4).rotateY(Math.PI / 4).translate(0, 0.25, 0),
    [x, y + 1.52, z],
    K.copper,
    { aoAmt: 0.1 },
  );
  lavaLanternInto(acc, x, y + 2.0, z, 0, 0.5);
  // bell: lathe, brass, hung from a bar under the roof
  bx(acc, 0.95, 0.1, 0.1, x, y + 1.25, z, K.iron, { aoAmt: 0 });
  put(
    acc,
    lathe(
      [
        [0.0, 0.6],
        [0.1, 0.58],
        [0.17, 0.48],
        [0.21, 0.3],
        [0.31, 0.1],
        [0.38, 0.0],
      ],
      9,
    ),
    [x, y + 0.64, z],
    K.brass,
    { aoAmt: 0.1 },
  );
  put(acc, new THREE.IcosahedronGeometry(0.09, 0), [x, y + 0.6, z], K.iron, { aoAmt: 0 });
  put(
    acc,
    tubeAlong([V(x, y + 0.6, z), V(x + 0.06, y + 0.25, z + 0.05)], 0.025, 3),
    [0, 0, 0],
    K.cream,
    {
      aoAmt: 0,
    },
  );
}

/**
 * Hammer-and-gear medallion on a wall facing +z with its back at z (foundry brow, variant 1):
 * glowing lava ring, dark disc, orange gear, cream hammer, a lava torch flame on each side.
 */
export function forgeMedallionInto(acc: Acc, x: number, y: number, z: number): void {
  put(acc, new THREE.CylinderGeometry(0.42, 0.42, 0.1, 14), [x, y, z + 0.04], K.lava, {
    q: AX.z,
    ...lit,
  });
  put(acc, new THREE.CylinderGeometry(0.34, 0.34, 0.12, 14), [x, y, z + 0.06], K.iron, {
    q: AX.z,
    aoAmt: 0,
  });
  addGlyph(acc, 'gear', V(x, y, z + 0.12), { size: 0.56, color: K.orange, depth: 0.05 });
  addGlyph(acc, 'hammer', V(x, y, z + 0.17), { size: 0.42, color: K.cream, depth: 0.05 });
  for (const sx of [-1, 1]) {
    bx(acc, 0.12, 0.34, 0.12, x + sx * 0.72, y - 0.4, z + 0.06, K.iron, { aoAmt: 0 });
    put(acc, new THREE.ConeGeometry(0.13, 0.3, 5), [x + sx * 0.72, y - 0.02, z + 0.06], K.lava, {
      q: qEuler(0, 0, sx * 0.12),
      ...lit,
    });
  }
}

/* -------------------------------- lavaLantern -------------------------------- */

function lavaLantern({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  put(acc, cylB(0.5, 0.42, 0.32, hi ? 7 : 5), [0, 0, 0], K.basalt, { aoAmt: 0.25 });
  if (hi) {
    put(acc, cylB(0.34, 0.3, 0.07, 7), [0, 0.32, 0], K.basaltLight, { aoAmt: 0 });
    put(acc, new THREE.DodecahedronGeometry(0.17, 0), [0.4, 0.15, 0.22], K.basaltLight, {
      aoAmt: 0.2,
    });
    put(acc, new THREE.DodecahedronGeometry(0.12, 0), [-0.36, 0.11, 0.3], K.basaltDark, {
      aoAmt: 0.2,
    });
  }
  put(acc, cylB(0.19, 0.14, 1.0, hi ? 6 : 4), [0, 0.32, 0], K.iron, { aoAmt: 0.2 });
  if (hi) {
    put(acc, cylB(0.17, 0.17, 0.1, 6), [0, 0.95, 0], K.orange, { aoAmt: 0 });
    for (const sx of [-1, 1])
      put(acc, baseBox(0.08, 0.5, 0.08), [sx * 0.2, 1.0, 0], K.iron, {
        q: qEuler(0, 0, sx * 0.62),
        aoAmt: 0,
      });
  }
  put(acc, cylB(0.34, 0.34, 0.08, hi ? 6 : 4), [0, 1.32, 0], K.iron, { aoAmt: 0 });
  lavaLanternInto(acc, 0, 1.4, 0, lod, 1);
  return finish(acc, rng);
}

/* --------------------------------- ingotStack -------------------------------- */

const INGOT_PROFILE = [
  new THREE.Vector2(-0.5, 0),
  new THREE.Vector2(0.5, 0),
  new THREE.Vector2(0.37, 0.26),
  new THREE.Vector2(-0.37, 0.26),
];
/** Emissive per layer (bottom -> top) and for the loose ingot, per heat variant. */
const INGOT_GLOW = [
  { rows: [0.5, 0.8, 1], loose: 1 },
  { rows: [0, 0.2, 0.75], loose: 0.45 },
  { rows: [0, 0, 0.12], loose: 0 },
] as const;

function ingotStack({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const v = variant % 3;
  const acc = cultureAcc(rng, lod);
  const heat = K.ingotHeat[v];
  const glow = INGOT_GLOW[v];
  // pallet
  if (hi) {
    for (const z of [-0.58, 0, 0.58]) bx(acc, 1.3, 0.14, 0.16, 0, 0, z, K.woodDark);
    for (const z of [-0.55, -0.18, 0.18, 0.55])
      bx(acc, 1.3, 0.06, 0.3, 0, 0.14, z, K.woodLight, { aoAmt: 0.05 });
  } else bx(acc, 1.3, 0.2, 1.5, 0, 0, 0, K.woodLight);
  const y0 = 0.2;
  const rows: Array<readonly number[]> = [[-0.46, 0, 0.46], [-0.23, 0.23], [0]];
  if (hi) {
    const ingot = (colour: string, e: number, x: number, y: number, z: number, yaw: number) => {
      const base = col(colour);
      const top = base.clone().lerp(col('#FFFFFF'), e > 0 ? 0.28 : 0.18);
      put(
        acc,
        prism(INGOT_PROFILE, 0.42),
        [x, y, z],
        (p) => base.clone().lerp(top, Math.min(1, Math.max(0, (p.y - y) / 0.26))),
        { q: qEuler(0, yaw, 0), aoAmt: 0.1, ...(e > 0 ? { emissive: e, ao: () => 1 } : {}) },
      );
    };
    rows.forEach((zs, r) =>
      zs.forEach((z, i) =>
        ingot(heat[r], glow.rows[r], ((i + r) % 2) * 0.04 - 0.02, y0 + r * 0.26, z, (i - 1) * 0.02),
      ),
    );
    ingot(heat[2], glow.loose, 0.15, 0, 1.05, 0.35);
    // tongs lying beside the loose ingot
    for (const s of [-1, 1])
      put(acc, baseBox(0.07, 0.07, 0.8), [-0.55 + s * 0.05, 0, 0.9], K.iron, {
        q: qEuler(0, s * 0.1 - 0.3, 0),
        aoAmt: 0,
      });
  } else {
    rows.forEach((zs, r) => {
      const d = zs.length * 0.46;
      bx(
        acc,
        1,
        0.26,
        d,
        0,
        y0 + r * 0.26,
        0,
        heat[r],
        glow.rows[r] > 0 ? { emissive: glow.rows[r], ao: () => 1 } : {},
      );
    });
  }
  return finish(acc, rng);
}

/* --------------------------------- incidentSign ------------------------------ */

/** Segments a..g of a seven-segment digit: top, top-right, bottom-right, bottom, bottom-left, top-left, middle. */
const SEGMENTS: Readonly<Record<string, string>> = { '0': 'abcdef', '2': 'abdeg', '4': 'bcfg' };

function digit(acc: Acc, ch: string, cx: number, cy: number, z: number, colour: string): void {
  const w = 0.4;
  const h = 0.74;
  const t = 0.12;
  const on = SEGMENTS[ch];
  const hz = (y: number): void => bx(acc, w - t, t, 0.07, cx, y - t / 2, z, colour, lit);
  const vt = (x: number, y0: number): void =>
    bx(acc, t, h / 2 - t, 0.07, cx + x, y0, z, colour, lit);
  if (on.includes('a')) hz(cy + h / 2);
  if (on.includes('g')) hz(cy);
  if (on.includes('d')) hz(cy - h / 2 + t);
  if (on.includes('f')) vt(-(w - t) / 2, cy + t / 2);
  if (on.includes('b')) vt((w - t) / 2, cy + t / 2);
  if (on.includes('e')) vt(-(w - t) / 2, cy - h / 2 + t + 0.01);
  if (on.includes('c')) vt((w - t) / 2, cy - h / 2 + t + 0.01);
}

function incidentSign({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const zero = variant % 2 === 1;
  const acc = cultureAcc(rng, lod);
  const tilt = zero ? 0.045 : 0;
  // posts and cross-brace
  for (const sx of [-1, 1]) {
    put(acc, baseBox(0.17, 2.3, 0.17), [sx * 1.0, 0, 0], K.wood, { aoAmt: 0.25 });
    if (hi) put(acc, baseBox(0.25, 0.1, 0.25), [sx * 1.0, 2.3, 0], K.woodDark, { aoAmt: 0 });
  }
  // the board (tilted a little when it just went to zero)
  const q = qEuler(0, 0, tilt);
  put(
    acc,
    hi ? bevBox(2.2, 1.5, 0.14, 0.03).translate(0, 0.75, 0) : baseBox(2.2, 1.5, 0.14),
    [0, 0.65, 0],
    K.iron,
    {
      q,
      aoAmt: 0.1,
    },
  );
  const at = (x: number, y: number): THREE.Vector3 =>
    V(x, y - 1.4, 0)
      .applyQuaternion(q)
      .add(V(0, 1.4, 0));
  const zf = 0.1;
  if (hi) {
    // hazard stripes along the bottom edge
    for (let i = 0; i < 8; i++) {
      const p = at(-0.96 + i * 0.275, 0.72);
      put(acc, baseBox(0.13, 0.14, 0.06), [p.x, p.y - 0.07, zf], i % 2 ? K.iron : K.hazard, {
        q,
        aoAmt: 0,
      });
    }
    // warning triangle + pseudo text rows ("DAYS SINCE LAST INCIDENT")
    const tri = new THREE.Shape([
      new THREE.Vector2(-0.5, -0.4),
      new THREE.Vector2(0.5, -0.4),
      new THREE.Vector2(0, 0.45),
    ]);
    const tp = at(-0.72, 1.92);
    put(
      acc,
      new THREE.ExtrudeGeometry(tri, { depth: 0.05, bevelEnabled: false }),
      [tp.x, tp.y, zf],
      K.hazard,
      {
        q,
        s: [0.36, 0.36, 1],
        aoAmt: 0,
      },
    );
    bx(acc, 0.06, 0.16, 0.06, tp.x, tp.y - 0.12, zf + 0.05, K.iron, { aoAmt: 0, q });
    bx(acc, 0.06, 0.06, 0.06, tp.x, tp.y - 0.2, zf + 0.05, K.iron, { aoAmt: 0, q });
    const lens = [0.22, 0.14, 0.3, 0.18, 0.26, 0.12, 0.2, 0.16];
    for (const [row, y] of [
      [0, 2.0],
      [1, 1.82],
    ] as const) {
      let x = -0.35;
      for (let i = 0; i < 4; i++) {
        const l = lens[(i + row * 4) % lens.length];
        const p = at(x + l / 2, y);
        put(acc, baseBox(l, 0.12, 0.05), [p.x, p.y, zf], K.cream, { q, aoAmt: 0 });
        x += l + 0.1;
      }
    }
  }
  const dc = zero ? K.red : K.window;
  const digits = zero ? ['0'] : ['4', '2'];
  digits.forEach((ch, i) => {
    const cx = (i - (digits.length - 1) / 2) * 0.62;
    const p = at(cx, 1.25);
    if (hi) digit(acc, ch, p.x, p.y, zf, dc);
    else bx(acc, 0.4, 0.74, 0.07, p.x, p.y - 0.37, zf, dc, lit);
  });
  if (zero && hi) {
    // scorch marks and a little flame on the corner
    for (const [x, y, w] of [
      [0.9, 2.02, 0.3],
      [0.62, 2.1, 0.2],
    ] as const) {
      const p = at(x, y);
      bx(acc, w, 0.1, 0.05, p.x, p.y, zf, K.basalt, { q, aoAmt: 0 });
    }
    const f = at(1.0, 2.2);
    put(acc, new THREE.ConeGeometry(0.14, 0.34, 5), [f.x, f.y, 0.04], K.lava, lit);
    put(acc, new THREE.ConeGeometry(0.07, 0.2, 4), [f.x - 0.12, f.y - 0.04, 0.04], K.glow, lit);
  } else if (hi) {
    // a daisy that grew up at the foot of the post
    put(acc, baseBox(0.05, 0.28, 0.05), [-1.28, 0, 0.18], K.basaltDark, { aoAmt: 0 });
    put(acc, new THREE.IcosahedronGeometry(0.11, 0), [-1.28, 0.3, 0.18], K.flowers[2], {
      aoAmt: 0,
    });
    put(acc, new THREE.IcosahedronGeometry(0.06, 0), [-1.28, 0.34, 0.27], K.flowers[1], {
      aoAmt: 0,
    });
  }
  return finish(acc, rng);
}

/* ------------------------------- pipeValveWheel ------------------------------ */

function pipeValveWheel({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const spin = new Spin();
  const seg = hi ? 8 : 5;
  const hub = V(0, 0.55, 0.92);
  // pipe run along x on two basalt saddles
  put(acc, cylB(0.2, 0.2, 2.1, seg), [-1.05, 0.55, 0], K.copper, { q: AX.x, aoAmt: 0.1 });
  if (hi) {
    for (const x of [-0.65, 0.65]) bx(acc, 0.34, 0.4, 0.4, x, 0, 0, K.basalt, { aoAmt: 0.3 });
    for (const x of [-0.98, -0.3, 0.3, 0.98])
      put(acc, cylB(0.29, 0.29, 0.12, seg), [x - 0.06, 0.55, 0], K.steelLight, {
        q: AX.x,
        aoAmt: 0,
      });
  } else bx(acc, 1.5, 0.3, 0.4, 0, 0, 0, K.basalt, { aoAmt: 0.3 });
  // tee branch to +z: stem, bonnet, hand wheel at the hub
  put(acc, cylB(0.17, 0.17, 0.72, seg), [0, 0.55, 0], K.copper, { q: AX.z, aoAmt: 0.05 });
  if (hi) {
    put(acc, cylB(0.27, 0.27, 0.22, seg), [0, 0.55, 0.38], K.steel, { q: AX.z, aoAmt: 0 });
    put(acc, cylB(0.07, 0.07, 0.3, 5), [0, 0.55, 0.62], K.steelLight, { q: AX.z, aoAmt: 0 });
  }
  const tag = spin.tag(hub);
  const wheel = { windAbs: tag, aoAmt: 0, ao: () => 0.97 } as const;
  put(acc, new THREE.TorusGeometry(0.5, 0.075, hi ? 5 : 3, hi ? 14 : 8), hub, K.red, wheel);
  for (let k = 0; k < (hi ? 2 : 1); k++)
    put(acc, baseBox(0.09, 1.0, 0.09).translate(0, -0.5, 0), hub, K.red, {
      q: qEuler(0, 0, k * (Math.PI / 2) + 0.2),
      ...wheel,
    });
  if (hi) {
    put(
      acc,
      new THREE.IcosahedronGeometry(0.13, 0),
      hub.clone().add(V(0, 0, 0.04)),
      K.brass,
      wheel,
    );
    // pressure gauge on a standpipe
    put(acc, cylB(0.05, 0.05, 0.4, 5), [-0.62, 0.7, 0], K.steelLight, { aoAmt: 0 });
    put(acc, cylB(0.21, 0.21, 0.12, 10), [-0.62, 1.2, 0], K.steel, { q: AX.z, aoAmt: 0 });
    put(acc, new THREE.CylinderGeometry(0.17, 0.17, 0.02, 10), [-0.62, 1.2, 0.13], K.paper, {
      q: AX.z,
      aoAmt: 0,
    });
    put(acc, baseBox(0.04, 0.15, 0.03), [-0.62, 1.2, 0.15], K.red, {
      q: qEuler(0, 0, -0.7),
      aoAmt: 0,
    });
  }
  // vertical stack with a flange band and a cap
  put(acc, cylB(0.18, 0.16, 1.55, seg), [0.78, 0.7, 0], K.copper, { aoAmt: 0.15 });
  put(acc, new THREE.ConeGeometry(0.24, 0.22, seg), [0.78, 2.25, 0], K.iron, {
    aoAmt: 0,
    s: [1, 1, 1],
  });
  if (hi) {
    put(acc, cylB(0.26, 0.26, 0.12, seg), [0.78, 1.15, 0], K.steelLight, { aoAmt: 0 });
    put(acc, cylB(0.22, 0.22, 0.1, seg), [0.78, 1.55, 0], K.hazard, { aoAmt: 0 });
  }
  return finishSpin(finish(acc, rng), acc, spin);
}

/* ----------------------------------- signalHorn ------------------------------ */

/** Horn flare (r, y) along its axis: 1.45 u long, 0.5 u mouth radius. */
const HORN_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.09, 0],
  [0.1, 0.2],
  [0.13, 0.5],
  [0.2, 0.85],
  [0.32, 1.15],
  [0.46, 1.38],
  [0.5, 1.45],
];
const HORN_LEN = 1.45;

function signalHorn({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  bx(acc, 1.0, 0.45, 1.0, 0, 0, 0, K.basaltLight, { aoAmt: 0.25 });
  bx(acc, 0.66, 0.1, 0.66, 0, 0.45, 0, K.iron, { aoAmt: 0 });
  put(acc, cylB(0.19, 0.16, 1.05, hi ? 7 : 4), [0, 0.55, 0], K.steel, { aoAmt: 0.2 });
  // swivel head; two horns fan out in a V, the treble one smaller
  put(acc, cylB(0.34, 0.34, 0.34, hi ? 8 : 5), [0, 1.5, 0], K.red, { aoAmt: 0.1 });
  if (hi) put(acc, cylB(0.37, 0.37, 0.07, 8), [0, 1.78, 0], K.iron, { aoAmt: 0 });
  const elev = 0.26;
  const horn = (k: number, yaw: number): void => {
    const q = qEuler(0, yaw, 0).multiply(qEuler(Math.PI / 2 - elev, 0, 0));
    const root = V(0, 0.0, 0.12 * k).applyQuaternion(qEuler(0, yaw, 0));
    const at: [number, number, number] = [root.x, 1.68, root.z];
    const profile = hi ? HORN_PROFILE : [HORN_PROFILE[0], HORN_PROFILE[3], HORN_PROFILE[6]];
    put(acc, lathe(profile, hi ? 10 : 5), at, K.red, { q, s: k, aoAmt: 0.1, double: hi });
    if (!hi) return;
    const rim = [
      [0.46, 1.3],
      [0.54, 1.34],
      [0.54, 1.45],
      [0.5, 1.45],
    ] as const;
    put(acc, lathe(rim, 10), at, K.brass, { q, s: k, aoAmt: 0, double: true });
    const throat = V(0, (HORN_LEN - 0.3) * k, 0).applyQuaternion(q);
    put(
      acc,
      new THREE.CylinderGeometry(0.45 * k, 0.45 * k, 0.03, 10),
      [at[0] + throat.x, at[1] + throat.y, at[2] + throat.z],
      K.iron,
      { q, aoAmt: 0 },
    );
  };
  horn(1, 0.7);
  horn(0.78, -0.7);
  if (hi) {
    // beacon lamp, pressure tank with a pipe up the mast, pull lever
    put(acc, cylB(0.12, 0.12, 0.12, 7), [0, 1.85, 0], K.iron, { aoAmt: 0 });
    put(acc, new THREE.IcosahedronGeometry(0.17, 0), [0, 2.12, 0], K.window, lit);
    put(acc, cylB(0.26, 0.26, 0.8, 8), [-0.4, 0.71, -0.15], K.copper, { q: AX.x, aoAmt: 0.1 });
    bx(acc, 0.28, 0.5, 0.24, 0.55, 0.45, 0.22, K.iron, { aoAmt: 0.1 });
    put(acc, baseBox(0.07, 0.5, 0.07), [0.55, 0.95, 0.36], K.orange, {
      q: qEuler(0.6, 0, 0),
      aoAmt: 0,
    });
    put(acc, new THREE.IcosahedronGeometry(0.09, 0), [0.55, 1.4, 0.55], K.red, { aoAmt: 0 });
  }
  return finish(acc, rng);
}

/* ---------------------------------- serverShrine ----------------------------- */

function serverShrine({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  bx(acc, 1.5, 0.2, 1.5, 0, 0, 0, K.basalt, { aoAmt: 0.25 });
  bx(acc, 1.16, 0.2, 1.16, 0, 0.2, 0, K.basaltLight, { aoAmt: 0.1 });
  // canopy: four posts, a steel pyramid roof with orange trim
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      put(acc, baseBox(0.12, 1.7, 0.12), [sx * 0.52, 0.4, sz * 0.52], K.woodDark, { aoAmt: 0.15 });
  bx(acc, 1.34, 0.12, 1.34, 0, 2.05, 0, K.orange, { aoAmt: 0 });
  put(
    acc,
    new THREE.ConeGeometry(1.1, 0.5, 4).rotateY(Math.PI / 4).translate(0, 0.25, 0),
    [0, 2.17, 0],
    K.steel,
    {
      aoAmt: 0.1,
    },
  );
  put(acc, new THREE.IcosahedronGeometry(0.1, 0), [0, 2.7, 0], K.orange, { aoAmt: 0 });
  // the first server: pale tower, drive bays, blinking LEDs, a hard hat on top
  put(
    acc,
    hi ? bevBox(0.7, 1.0, 0.54, 0.04).translate(0, 0.5, 0) : baseBox(0.7, 1.0, 0.54),
    [0, 0.4, 0],
    K.steelPale,
    {
      aoAmt: 0.15,
    },
  );
  if (hi) {
    for (let i = 0; i < 4; i++)
      bx(acc, 0.5, 0.07, 0.04, 0, 0.68 + i * 0.13, 0.28, K.iron, { aoAmt: 0 });
    put(acc, new THREE.PlaneGeometry(0.46, 0.09), [0, 1.3, 0.285], K.led[0], {
      emissive: 2,
      ao: () => 1,
      aoAmt: 0,
    });
    put(acc, new THREE.IcosahedronGeometry(0.045, 0), [0.26, 0.55, 0.29], K.led[1], lit);
    put(
      acc,
      new THREE.SphereGeometry(0.22, 8, 4, 0, TAU, 0, Math.PI / 2),
      [0.04, 1.4, 0.0],
      K.hazard,
      {
        aoAmt: 0.1,
        q: qEuler(0.15, 0.3, 0.1),
      },
    );
    put(acc, cylB(0.27, 0.27, 0.04, 8), [0.04, 1.4, 0.0], K.hazard, {
      q: qEuler(0.15, 0.3, 0.1),
      aoAmt: 0,
    });
    // cable garland to the front-left, plaque, candles, flowers, offering
    put(
      acc,
      tubeAlong(
        [V(0.2, 0.55, -0.3), V(0.5, 0.45, -0.1), V(0.55, 0.4, 0.45), V(0.35, 0.4, 0.62)],
        0.045,
        4,
      ),
      [0, 0, 0],
      K.orange,
      { aoAmt: 0 },
    );
    bx(acc, 0.34, 0.12, 0.04, 0, 0.42, 0.58, K.brass, { aoAmt: 0 });
    addGlyph(acc, 'gear', V(0, 0.48, 0.61), { size: 0.12, color: K.iron, depth: 0.03 });
    for (const sx of [-1, 1]) {
      put(acc, cylB(0.09, 0.09, 0.28, 6), [sx * 0.46, 0.4, 0.46], K.cream, { aoAmt: 0.1 });
      put(acc, new THREE.ConeGeometry(0.06, 0.16, 5), [sx * 0.46, 0.76, 0.46], K.glow, lit);
    }
    put(acc, cylB(0.13, 0.1, 0.16, 7), [-0.45, 0.4, -0.3], K.coral, { aoAmt: 0.1 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      put(
        acc,
        new THREE.IcosahedronGeometry(0.07, 0),
        [-0.45 + Math.cos(a) * 0.08, 0.64 + (i % 2) * 0.05, -0.3 + Math.sin(a) * 0.08],
        K.flowers[i % 3],
        {
          aoAmt: 0,
        },
      );
    }
    put(acc, cylB(0.13, 0.09, 0.08, 7), [0.45, 0.4, -0.3], K.woodLight, { aoAmt: 0.1 });
    put(acc, new THREE.IcosahedronGeometry(0.09, 0), [0.45, 0.52, -0.3], K.orange, { aoAmt: 0 });
  }
  const g = finish(acc, rng);
  if (hi) tagScreens(g, 'led');
  return g;
}

/* ------------------------------------ anvil ---------------------------------- */

function anvil({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  put(acc, cylB(0.5, 0.46, 0.5, hi ? 8 : 5), [0, 0, 0], K.wood, { aoAmt: 0.25 });
  if (hi)
    put(acc, new THREE.CylinderGeometry(0.43, 0.43, 0.03, 8), [0, 0.5, 0], K.woodLight, {
      aoAmt: 0,
    });
  if (hi) bx(acc, 0.72, 0.14, 0.42, 0, 0.5, 0, K.iron, { aoAmt: 0.15 });
  bx(acc, 0.36, 0.22, 0.28, 0, 0.64, 0, K.steel, { aoAmt: 0.1 });
  bx(acc, 0.98, 0.16, 0.44, 0, 0.86, 0, K.steel, { aoAmt: 0.05 });
  if (hi) bx(acc, 0.98, 0.04, 0.44, 0, 1.02, 0, K.steelLight, { aoAmt: 0 });
  put(acc, new THREE.ConeGeometry(0.2, 0.55, hi ? 6 : 4), [0.73, 0.94, 0], K.steel, {
    q: qEuler(0, 0, -Math.PI / 2),
    aoAmt: 0.05,
  });
  if (hi) bx(acc, 0.2, 0.1, 0.3, -0.57, 0.86, 0, K.iron, { aoAmt: 0 });
  // the workpiece on the face
  bx(acc, 0.34, 0.07, 0.14, 0.15, 1.06, 0.02, K.lava, lit);
  if (!hi) return finish(acc, rng);
  // hammer on the stump, bucket, sparks
  put(acc, baseBox(0.5, 0.08, 0.08), [-0.1, 0.53, 0.3], K.woodDark, {
    q: qEuler(0, 0.5, 0),
    aoAmt: 0,
  });
  put(acc, baseBox(0.14, 0.13, 0.2), [0.12, 0.53, 0.18], K.iron, {
    q: qEuler(0, 0.5, 0),
    aoAmt: 0,
  });
  put(acc, cylB(0.2, 0.17, 0.28, 8), [0.82, 0, 0.35], K.woodLight, { aoAmt: 0.2 });
  put(acc, new THREE.CylinderGeometry(0.17, 0.17, 0.02, 8), [0.82, 0.27, 0.35], K.teal, {
    aoAmt: 0,
  });
  for (const [x, y, z] of [
    [0.1, 1.28, 0.04],
    [0.3, 1.42, -0.06],
    [0.0, 1.5, 0.12],
  ] as const)
    put(acc, new THREE.IcosahedronGeometry(0.035, 0), [x, y, z], K.glow, lit);
  return finish(acc, rng);
}

/* ---------------------------------- pagerRock -------------------------------- */

function pagerRock({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const noise = createNoise(rng.fork('rock'));
  const dark = col(K.basalt);
  const light = col(K.basaltLight);
  acc.add(blob(0.85, hi ? 1 : 0, noise, 0.14, 1.2, 0.7), {
    m: new THREE.Matrix4().compose(V(0, 0.28, 0), qEuler(0, 0.6, 0), V(1, 0.62, 0.9)),
    color: (p) => (p.y > 0.5 ? light : dark),
    windMul: 0,
    cullY: 0.01,
    groundClamp: true,
    aoAmt: 0.25,
  });
  put(acc, cylB(0.5, 0.52, 0.1, hi ? 7 : 5), [0, 0.6, 0], K.basaltLight, { aoAmt: 0 });
  // the pager, leaning back a little
  const q = qEuler(-0.22, 0.1, 0);
  const at = (x: number, y: number, z: number): THREE.Vector3 =>
    V(x, y, z)
      .applyQuaternion(q)
      .add(V(0, 0.7, 0.05));
  put(
    acc,
    hi ? bevBox(0.66, 0.46, 0.2, 0.04) : new THREE.BoxGeometry(0.66, 0.46, 0.2),
    at(0, 0.23, 0),
    K.iron,
    { q, aoAmt: 0.1 },
  );
  put(acc, new THREE.PlaneGeometry(0.44, 0.2), at(-0.05, 0.3, 0.103), K.window, {
    q,
    emissive: 2,
    ao: () => 1,
    aoAmt: 0,
  });
  if (hi) {
    const band = at(0, 0.06, 0.1);
    bx(acc, 0.66, 0.08, 0.05, band.x, band.y, band.z, K.orange, { q, aoAmt: 0 });
    for (const x of [-0.18, 0.04])
      put(acc, new THREE.BoxGeometry(0.14, 0.07, 0.05), at(x, 0.12, 0.1), K.cream, { q, aoAmt: 0 });
    put(acc, new THREE.BoxGeometry(0.1, 0.1, 0.06), at(0.25, 0.3, 0.1), K.red, { q, ...lit });
    // on-call flag
    put(acc, cylB(0.06, 0.05, 1.5, 5), [0.78, 0, -0.2], K.woodDark, { aoAmt: 0.15 });
    put(acc, baseBox(0.5, 0.34, 0.07), [1.05, 1.1, -0.2], K.coral, { aoAmt: 0 });
    addGlyph(acc, 'bell', V(1.05, 1.27, -0.16), { size: 0.24, color: K.cream, depth: 0.03 });
    for (const [x, z, r] of [
      [-0.7, -0.45, 0.14],
      [0.2, 0.75, 0.12],
      [0.95, 0.35, 0.1],
    ] as const)
      put(acc, new THREE.DodecahedronGeometry(r, 0), [x, r * 0.9, z], K.basaltDark, { aoAmt: 0.2 });
  }
  const g = finish(acc, rng);
  tagScreens(g, 'led');
  return g;
}

/* ----------------------------------- onsenDeck ------------------------------- */

function onsenDeck({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const r = rng.fork('planks');
  bx(acc, 5.4, 0.18, 2.1, 0, 0, 0, K.basalt, { aoAmt: 0.3 });
  if (hi) {
    for (let i = 0; i < 13; i++) {
      const tone = col(K.woodLight).lerp(col(K.wood), r.range(0, 0.35));
      put(acc, baseBox(0.36, 0.12, 1.94), [-2.4 + i * 0.4, 0.18, 0], tone, { aoAmt: 0.05 });
    }
    for (const z of [-1.03, 1.03]) bx(acc, 5.4, 0.1, 0.12, 0, 0.18, z, K.woodDark, { aoAmt: 0 });
  } else bx(acc, 5.2, 0.12, 2.0, 0, 0.18, 0, K.woodLight);
  const top = 0.3;
  // towel rack with towels and a hanging hard hat (back left)
  for (const x of [-2.2, -1.2]) bx(acc, 0.13, 1.6, 0.13, x, top, -0.78, K.woodDark, { aoAmt: 0.2 });
  bx(acc, 1.24, 0.11, 0.12, -1.7, top + 1.5, -0.78, K.wood, { aoAmt: 0 });
  const towels: ReadonlyArray<readonly [number, string]> = [
    [-2.0, K.cream],
    [-1.7, K.teal],
    [-1.4, K.coral],
  ];
  for (const [x, c] of towels) {
    bx(acc, 0.27, 0.62, 0.14, x, top + 0.92, -0.78, c, { aoAmt: 0.05 });
    if (hi) bx(acc, 0.28, 0.06, 0.15, x, top + 1.0, -0.78, K.paper, { aoAmt: 0 });
  }
  if (hi) {
    // the crew's hard hat rests on a lower rail
    bx(acc, 1.0, 0.1, 0.12, -1.7, top + 0.5, -0.78, K.wood, { aoAmt: 0 });
    put(
      acc,
      new THREE.SphereGeometry(0.2, 8, 4, 0, TAU, 0, Math.PI / 2),
      [-1.7, top + 0.6, -0.78],
      K.hazard,
      { aoAmt: 0.1 },
    );
    put(acc, cylB(0.25, 0.25, 0.04, 8), [-1.7, top + 0.6, -0.78], K.hazard, { aoAmt: 0 });
  }
  // bench with a bucket and folded towels (back right)
  bx(acc, 1.5, 0.1, 0.44, 1.35, top + 0.4, -0.72, K.woodLight, { aoAmt: 0.1 });
  for (const x of [0.75, 1.95]) bx(acc, 0.1, 0.4, 0.36, x, top, -0.72, K.woodDark, { aoAmt: 0.15 });
  put(acc, cylB(0.17, 0.14, 0.26, hi ? 8 : 5), [1.0, top + 0.5, -0.72], K.wood, { aoAmt: 0.15 });
  bx(acc, 0.4, 0.08, 0.28, 1.7, top + 0.5, -0.72, K.cream, { aoAmt: 0 });
  if (hi) bx(acc, 0.4, 0.08, 0.28, 1.7, top + 0.58, -0.72, K.teal, { aoAmt: 0 });
  // lava lanterns on stone posts at the water-side corners
  for (const x of [-2.35, 2.35]) {
    put(acc, cylB(0.22, 0.18, 0.95, hi ? 6 : 4), [x, top, 0.82], K.basaltLight, { aoAmt: 0.2 });
    lavaLanternInto(acc, x, top + 0.95, 0.82, lod, 0.7);
  }
  if (hi) {
    // bath sign on a post: three steam wisps on a teal board
    bx(acc, 0.12, 1.0, 0.12, 2.25, top, -0.1, K.woodDark, { aoAmt: 0.2 });
    bx(acc, 0.72, 0.52, 0.1, 2.25, top + 0.85, -0.1, K.teal, { aoAmt: 0.05 });
    for (const [i, x] of [-0.2, 0, 0.2].entries())
      put(acc, baseBox(0.08, 0.32, 0.04), [2.25 + x, top + 0.95, -0.03], K.paper, {
        q: qEuler(0, 0, i % 2 ? 0.25 : -0.25),
        aoAmt: 0,
      });
    // rubber duck at the water edge and three stepping stones into the pool
    put(acc, new THREE.IcosahedronGeometry(0.17, 0), [0.8, top + 0.16, 0.86], K.flowers[1], {
      s: [1.15, 0.9, 1],
      aoAmt: 0.1,
    });
    put(acc, new THREE.IcosahedronGeometry(0.1, 0), [0.8, top + 0.34, 0.99], K.flowers[1], {
      aoAmt: 0,
    });
    bx(acc, 0.1, 0.05, 0.1, 0.8, top + 0.31, 1.1, K.orange, { aoAmt: 0 });
    for (const [x, z, rr] of [
      [-0.6, 1.3, 0.29],
      [0.1, 1.42, 0.26],
      [-0.2, 1.62, 0.22],
    ] as const)
      put(acc, cylB(rr, rr * 0.92, 0.2, 7), [x, 0, z], K.basaltLight, { aoAmt: 0.2 });
  }
  return finish(acc, rng);
}

/* ----------------------------------- onsenHouse ------------------------------ */

const HOUSE = { hx: 1.7, hz: 1.1, wall: 0.9, upper: 1.1, rise: 0.55, door: 0.5 } as const;

function onsenHouse({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const { hx, hz, wall, upper, rise, door } = HOUSE;
  const eave = wall + upper;
  // walls: stone base, cream plaster; the front is split around the door opening
  const front = (x0: number, x1: number): void => {
    bx(acc, x1 - x0, wall, 0.22, (x0 + x1) / 2, 0, hz - 0.11, K.basaltLight, { aoAmt: 0.25 });
    bx(acc, x1 - x0, upper, 0.2, (x0 + x1) / 2, wall, hz - 0.1, K.cream, { aoAmt: 0.1 });
  };
  front(-hx, -door);
  front(door, hx);
  bx(acc, 2 * door, eave - 1.6, 0.2, 0, 1.6, hz - 0.1, K.cream, { aoAmt: 0.05 });
  bx(acc, 2 * hx, wall, 2 * hz - 0.22, 0, 0, -0.11, K.basaltLight, { aoAmt: 0.25 });
  bx(acc, 2 * hx - 0.1, upper, 2 * hz - 0.24, 0, wall, -0.1, K.cream, { aoAmt: 0.1 });
  // glowing doorway (recessed warm panel) and step
  bx(acc, 2 * door, 1.6, 0.06, 0, 0.1, hz - 0.19, K.window, lit);
  bx(acc, 2 * door + 0.4, 0.1, 0.6, 0, 0, hz - 0.1, K.basaltLight, { aoAmt: 0.1 });
  // barrel-vault steel roof along x
  const a = hz + 0.2;
  const arc = (n: number, ox: number, oy: number): THREE.Vector2[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = Math.PI - (i / n) * Math.PI;
      return new THREE.Vector2(Math.cos(t) * (a - ox), Math.sin(t) * (rise - oy));
    });
  const n = hi ? 8 : 3;
  const profile = [...arc(n, 0, 0), ...arc(n, 0.14, 0.1).reverse()];
  put(acc, prism(profile, 2 * hx + 0.3).rotateY(Math.PI / 2), [0, eave, 0], K.basaltDark, {
    aoAmt: 0.05,
    double: hi,
  });
  const ribs = hi ? [-1.35, 0, 1.35] : [];
  for (const x of [-(hx + 0.12), hx + 0.12, ...ribs]) {
    const rib = [...arc(n, -0.03, -0.03), ...arc(n, 0.12, 0.1).reverse()];
    put(acc, prism(rib, 0.16).rotateY(Math.PI / 2), [x, eave, 0], K.orange, { aoAmt: 0 });
  }
  if (hi) {
    // rivet rows on the three ribs
    for (const x of ribs)
      for (let k = 1; k < 8; k++) {
        const t = Math.PI - (k / 8) * Math.PI;
        put(
          acc,
          new THREE.BoxGeometry(0.09, 0.09, 0.09),
          [x, eave + Math.sin(t) * (rise + 0.03), Math.cos(t) * (a + 0.02)],
          K.steelLight,
          {
            q: qEuler(0, 0, 0),
            aoAmt: 0,
          },
        );
      }
    // timber corner posts + door frame
    for (const sx of [-1, 1]) {
      bx(acc, 0.14, upper, 0.14, sx * (hx - 0.02), wall, hz - 0.02, K.woodDark, { aoAmt: 0 });
      bx(acc, 0.14, upper, 0.14, sx * (hx - 0.02), wall, -hz + 0.02, K.woodDark, { aoAmt: 0 });
      bx(acc, 0.13, 1.65, 0.14, sx * (door + 0.04), 0, hz + 0.0, K.woodDark, { aoAmt: 0.1 });
    }
    bx(acc, 2 * door + 0.3, 0.13, 0.14, 0, 1.65, hz, K.woodDark, { aoAmt: 0 });
    // noren curtain with the hammer emblem
    bx(acc, 1.0, 0.08, 0.08, 0, 1.55, hz + 0.1, K.iron, { aoAmt: 0 });
    for (const [i, x] of [-0.33, 0, 0.33].entries())
      bx(acc, 0.29, 0.7, 0.12, x, 0.85, hz + 0.12, i === 1 ? K.cream : K.orange, { aoAmt: 0.05 });
    addGlyph(acc, 'hammer', V(0, 1.2, hz + 0.18), { size: 0.22, color: K.iron, depth: 0.03 });
    // portholes on both ends
    for (const sx of [-1, 1]) {
      put(acc, cylB(0.34, 0.34, 0.07, 10), [sx * (hx + 0.0), 1.4, 0.15], K.brass, {
        q: qEuler(0, 0, (-sx * Math.PI) / 2),
        aoAmt: 0,
      });
      put(acc, cylB(0.26, 0.26, 0.04, 10), [sx * (hx + 0.06), 1.4, 0.15], K.window, {
        q: qEuler(0, 0, (-sx * Math.PI) / 2),
        ...lit,
      });
    }
    // copper vent chimney with a cowl, bench + bucket by the east wall
    put(acc, cylB(0.17, 0.15, 0.78, 8), [1.0, eave + rise - 0.55, -0.3], K.copper, { aoAmt: 0.1 });
    put(acc, new THREE.ConeGeometry(0.27, 0.2, 8), [1.0, eave + rise + 0.2, -0.3], K.iron, {
      aoAmt: 0,
    });
    bx(acc, 0.42, 0.1, 1.1, hx + 0.45, 0.4, 0.1, K.woodLight, { aoAmt: 0.1 });
    for (const z of [-0.35, 0.55])
      bx(acc, 0.36, 0.4, 0.1, hx + 0.45, 0, z, K.woodDark, { aoAmt: 0.15 });
    put(acc, cylB(0.17, 0.14, 0.26, 8), [hx + 0.45, 0.5, -0.1], K.wood, { aoAmt: 0.15 });
    bx(acc, 0.32, 0.08, 0.26, hx + 0.45, 0.5, 0.4, K.coral, { aoAmt: 0 });
  } else {
    bx(acc, 0.3, 0.9, 0.3, 1.0, eave + rise - 0.55, -0.3, K.copper, { aoAmt: 0.1 });
  }
  // lava lanterns flanking the door
  for (const sx of [-1, 1]) {
    put(acc, cylB(0.2, 0.17, 0.75, hi ? 6 : 4), [sx * 1.0, 0, hz + 0.1], K.basalt, { aoAmt: 0.2 });
    lavaLanternInto(acc, sx * 1.0, 0.75, hz + 0.1, lod, 0.6);
  }
  const g = finish(acc, rng);
  g.userData.hooks = { emitter: [1.0, eave + rise + 0.35, -0.3] };
  return g;
}

export const CULTURE_DEVOPS_GEO: readonly PropGeoDef[] = [
  { id: 'lavaLantern', variants: 1, build: lavaLantern, footprint: 0.5, height: 2.6, windy: false },
  { id: 'ingotStack', variants: 3, build: ingotStack, footprint: 1.0, height: 1.0, windy: false },
  {
    id: 'incidentSign',
    variants: 2,
    build: incidentSign,
    footprint: 1.3,
    height: 2.4,
    windy: false,
  },
  {
    id: 'pipeValveWheel',
    variants: 1,
    build: pipeValveWheel,
    footprint: 1.2,
    height: 2.4,
    windy: false,
  },
  { id: 'signalHorn', variants: 1, build: signalHorn, footprint: 1.0, height: 2.3, windy: false },
  {
    id: 'serverShrine',
    variants: 1,
    build: serverShrine,
    footprint: 1.0,
    height: 2.9,
    windy: false,
  },
  { id: 'onsenDeck', variants: 1, build: onsenDeck, footprint: 2.8, height: 2.0, windy: false },
  { id: 'anvil', variants: 1, build: anvil, footprint: 0.7, height: 1.5, windy: false },
  { id: 'pagerRock', variants: 1, build: pagerRock, footprint: 0.9, height: 1.5, windy: false },
  { id: 'onsenHouse', variants: 1, build: onsenHouse, footprint: 2.2, height: 2.9, windy: false },
];
