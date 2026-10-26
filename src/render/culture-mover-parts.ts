import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEMAPHORE } from '../content/props-themes/m20.ts';
import { ROCK, WALLS } from '../content/palette.ts';
import { OFFICE_COLORS } from '../content/palette-offices.ts';
import { WORKER_COLORS as WC } from '../content/life.ts';
import { THEMES } from '../content/themes.ts';

/**
 * Part shapes of the culture movers (TASK-431): ONE merged geometry, drawn with the shared creature
 * material. Every vertex carries `limb = (kind, 0, cut, 6)` and every instance `aGait.y = kind`
 * (`cut` 0..1 = dither-out share, life-material mode 6: the light patch's soft rim); the
 * shader's click-burst branch (mode 6) collapses all kinds but the instance's own, so a handful of
 * shapes cost one draw call and no program. White vertices take the instance colour, the rest
 * keep their own.
 */
export const PART = {
  ring: 0,
  kite: 1,
  cable: 2,
  box: 3,
  flag: 4,
  ant: 5,
  patch: 6,
  blob: 7,
  quad: 8,
  beacon: 9,
  /** HQ semaphore signal arm: pivot at the origin, pointing +y, its plane facing +z (TASK-469). */
  arm: 10,
  /** Stall keeper bot: feet at the origin, facing +z, worker proportions (TASK-469). */
  keeper: 11,
  /** The keeper's arm: shoulder pivot at the origin, hanging down -y. */
  limb: 12,
  /** Tintable emissive ball (gate lamp halo, semaphore lamp flash), unit radius. */
  glow: 13,
  /** Campus bell (M22 R17): hinge at the origin, hanging down -y, unit radius and height, brass. */
  bell: 14,
  /** Graduation cap (M22 R16): a flat mortarboard on its skull cap, unit width, tassel on +x. */
  cap: 15,
} as const;
export type PartKind = (typeof PART)[keyof typeof PART];

const WHITE = new THREE.Color(1, 1, 1);

interface Piece {
  geo: THREE.BufferGeometry;
  kind: number;
  /** Vertex colour (null = white, takes the instance colour). */
  color: string | null;
  emissive: number;
  /** Dither-out share per vertex (limb.z; default 0 = solid). */
  cut?: (p: THREE.Vector3) => number;
}

/** Non-indexed copy with the attribute set every piece shares. */
function finish(p: Piece): THREE.BufferGeometry {
  const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
  p.geo.dispose();
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const n = g.getAttribute('position').count;
  const c = p.color ? new THREE.Color(p.color) : WHITE;
  const col: number[] = [];
  const limb: number[] = [];
  const em: number[] = [];
  const pos = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    col.push(c.r, c.g, c.b);
    limb.push(p.kind, 0, p.cut ? p.cut(v.fromBufferAttribute(pos, i)) : 0, 6);
    em.push(p.emissive);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.getAttribute('position'));
  out.setAttribute('normal', g.getAttribute('normal'));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('limb', new THREE.Float32BufferAttribute(limb, 4));
  out.setAttribute('emissive', new THREE.Float32BufferAttribute(em, 1));
  return out;
}

/** A flat polygon (counter-clockwise from +z), both faces. */
function sheet(
  pts: ReadonlyArray<readonly [number, number]>,
  tris: ReadonlyArray<readonly [number, number, number]>,
): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const [a, b, c] of tris) {
    for (const i of [a, b, c]) pos.push(pts[i][0], pts[i][1], 0);
    for (const i of [a, c, b]) pos.push(pts[i][0], pts[i][1], 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Normals of a double-sided sheet: front faces +z, back faces -z (computeVertexNormals per face). */
function sheetNormals(g: THREE.BufferGeometry): void {
  const n = g.getAttribute('position').count;
  const nrm: number[] = [];
  for (let i = 0; i < n; i += 6) {
    for (let k = 0; k < 3; k++) nrm.push(0, 0, 1);
    for (let k = 0; k < 3; k++) nrm.push(0, 0, -1);
  }
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
}

function doubleSided(
  g: THREE.BufferGeometry,
  kind: number,
  color: string | null,
  emissive = 0,
): Piece {
  sheetNormals(g);
  return { geo: g, kind, color, emissive };
}

export function buildPartsGeometry(): THREE.BufferGeometry {
  const pieces: Piece[] = [];
  // 0 ring: a unit horizontal torus (scaled to the ripple radius), pale and a little emissive
  pieces.push({
    geo: new THREE.TorusGeometry(1, 0.07, 4, 18).rotateX(Math.PI / 2),
    kind: PART.ring,
    color: '#FFF4E0',
    emissive: 0.5,
  });
  // 1 kite: two-tone diamond in the xy plane, top at +y (left half takes the tint)
  const kiteL = doubleSided(
    sheet(
      [
        [0, 0.65],
        [-0.45, 0.1],
        [0, -0.55],
        [0, 0.1],
      ],
      [
        [0, 1, 3],
        [1, 2, 3],
      ],
    ),
    PART.kite,
    null,
  );
  const kiteR = doubleSided(
    sheet(
      [
        [0, 0.65],
        [0.45, 0.1],
        [0, -0.55],
        [0, 0.1],
      ],
      [
        [0, 3, 1],
        [1, 3, 2],
      ],
    ),
    PART.kite,
    '#FFF4E0',
  );
  pieces.push(kiteL, kiteR);
  // 2 cable: unit-tall thin bar from the origin up +y
  pieces.push({
    geo: new THREE.BoxGeometry(0.05, 1, 0.05).translate(0, 0.5, 0),
    kind: PART.cable,
    color: '#FFF4E0',
    emissive: 0,
  });
  // 3 box: unit cube centred at the origin (tinted) with five pale ribs on top
  pieces.push({ geo: new THREE.BoxGeometry(1, 1, 1), kind: PART.box, color: null, emissive: 0 });
  for (let i = -2; i <= 2; i++)
    pieces.push({
      geo: new THREE.BoxGeometry(0.03, 1.02, 1.02).translate(i * 0.19, 0, 0),
      kind: PART.box,
      color: '#CBD5E1',
      emissive: 0,
    });
  // 4 flag: swallowtail pennant flying toward +x from the pole at the origin
  pieces.push(
    doubleSided(
      sheet(
        [
          [0, 0.5],
          [1, 0.5],
          [0.72, 0],
          [1, -0.5],
          [0, -0.5],
        ],
        [
          [0, 2, 1],
          [0, 4, 2],
          [4, 3, 2],
        ],
      ),
      PART.flag,
      null,
    ),
  );
  // 5 ant: body, head and abdomen blobs along +x
  for (const [x, r] of [
    [-0.7, 0.8],
    [0, 0.6],
    [0.75, 0.7],
  ] as const)
    pieces.push({
      geo: new THREE.IcosahedronGeometry(r, 0).scale(1, 0.7, 0.85).translate(x, 0.5, 0),
      kind: PART.ant,
      color: '#3A3F4D',
      emissive: 0,
    });
  // 6 patch: unit disc lying flat, a little emissive; dithered out toward the rim (a pool of
  // light, not a painted slab; TASK-453b)
  pieces.push({
    // rings at r 0 / 0.5 / 1: a near-solid core, the stipple only in the outer half
    geo: new THREE.RingGeometry(0, 1, 14, 2).rotateX(-Math.PI / 2),
    kind: PART.patch,
    color: null,
    emissive: 0.3,
    cut: (p) => {
      const t = Math.min(1, Math.max(0, (Math.hypot(p.x, p.z) - 0.3) / 0.7));
      return t * t * (3 - 2 * t);
    },
  });
  // 7 blob: unit ball (balloons, sacks)
  pieces.push({
    geo: new THREE.IcosahedronGeometry(1, 1),
    kind: PART.blob,
    color: null,
    emissive: 0,
  });
  // 8 quad: tiny two-sided card (confetti, kite bows)
  pieces.push(
    doubleSided(
      sheet(
        [
          [-0.5, -0.3],
          [0.5, -0.3],
          [0.5, 0.3],
          [-0.5, 0.3],
        ],
        [
          [0, 1, 2],
          [0, 2, 3],
        ],
      ),
      PART.quad,
      null,
    ),
  );
  // 9 beacon: unit lamp ball, fully emissive
  pieces.push({
    geo: new THREE.IcosahedronGeometry(1, 0),
    kind: PART.beacon,
    color: '#FFE9B0',
    emissive: 1,
  });
  // 10 arm: the semaphore signal arm (geo/themes/culture-m20-hq.ts armParts, hi LOD): white beam,
  // coral end panel with a cream bar, counterweight tail, brass pivot pin
  const L = SEMAPHORE.armLength;
  const box = (w: number, h: number, d: number, y: number): THREE.BufferGeometry =>
    new THREE.BoxGeometry(w, h, d).translate(0, y + h / 2, 0);
  for (const [geo, color] of [
    [box(0.15, L + 0.45, 0.1, -0.45), WALLS[1]],
    [box(0.42, 0.85, 0.09, L - 0.85), THEMES.hq.accent],
    [box(0.46, 0.14, 0.11, L - 0.5), WALLS[0]],
    [box(0.26, 0.26, 0.16, -0.62), ROCK[2]],
    [new THREE.CylinderGeometry(0.13, 0.13, 0.14, 8).rotateX(Math.PI / 2), OFFICE_COLORS.gold],
  ] as const)
    pieces.push({ geo, kind: PART.arm, color, emissive: 0 });
  // 11 keeper: worker bot (life/geo/workers.ts proportions, no bevels), body tinted, facing +z
  const bot = (
    w: number,
    h: number,
    d: number,
    at: readonly [number, number, number],
    color: string | null,
    emissive = 0,
  ): void => {
    pieces.push({
      geo: new THREE.BoxGeometry(w, h, d).translate(at[0], at[1], at[2]),
      kind: PART.keeper,
      color,
      emissive,
    });
  };
  for (const s of [-1, 1]) {
    bot(0.12, 0.2, 0.12, [0.1 * s, 0.12, 0], WC.metal);
    bot(0.15, 0.07, 0.2, [0.1 * s, 0.035, 0.04], WC.foot);
    bot(0.06, 0.15, 0.06, [0.285 * s, 0.78, 0], null); // ear pads
  }
  bot(0.38, 0.34, 0.3, [0, 0.39, 0], null); // body (tint)
  bot(0.2, 0.14, 0.012, [0, 0.38, 0.152], WC.plate);
  bot(0.5, 0.38, 0.34, [0, 0.78, 0], WC.shell); // head
  bot(0.4, 0.29, 0.02, [0, 0.775, 0.172], WC.screen);
  for (const s of [-1, 1]) bot(0.068, 0.1, 0.024, [0.085 * s, 0.805, 0.186], WC.eye, 1);
  bot(0.028, 0.15, 0.028, [0, 1.04, -0.03], WC.metal);
  pieces.push({
    geo: new THREE.IcosahedronGeometry(0.05, 0).translate(0, 1.17, -0.03),
    kind: PART.keeper,
    color: WC.antenna,
    emissive: 1,
  });
  // 12 limb: shoulder at the origin, tinted upper arm and a pale hand (worker arm)
  pieces.push({
    geo: new THREE.BoxGeometry(0.09, 0.26, 0.09).translate(0, -0.13, 0),
    kind: PART.limb,
    color: null,
    emissive: 0,
  });
  pieces.push({
    geo: new THREE.BoxGeometry(0.11, 0.09, 0.11).translate(0, -0.28, 0),
    kind: PART.limb,
    color: WC.hand,
    emissive: 0,
  });
  // 13 glow: unit lamp ball, white (takes the instance tint), fully emissive
  pieces.push({
    geo: new THREE.IcosahedronGeometry(1, 1),
    kind: PART.glow,
    color: null,
    emissive: 1,
  });
  // 14 bell: a lathe from the hinge (r 0.12) flaring to the lip (r 1) at y = -1, brass, with a clapper
  const bellProfile: [number, number][] = [
    [0.86, -1],
    [1, -1],
    [0.72, -0.78],
    [0.5, -0.4],
    [0.3, -0.12],
    [0.12, 0],
  ];
  pieces.push({
    geo: new THREE.LatheGeometry(
      bellProfile.map(([r, y]) => new THREE.Vector2(r, y)),
      8,
    ),
    kind: PART.bell,
    color: OFFICE_COLORS.gold,
    emissive: 0,
  });
  pieces.push({
    geo: new THREE.IcosahedronGeometry(0.16, 0).translate(0, -0.95, 0),
    kind: PART.bell,
    color: '#8E6236',
    emissive: 0,
  });
  // 15 cap: the board (takes the instance tint: black), a dark skull cap under it, a gold tassel
  pieces.push({
    geo: new THREE.BoxGeometry(1, 0.1, 1).translate(0, 0.2, 0),
    kind: PART.cap,
    color: null,
    emissive: 0,
  });
  pieces.push({
    geo: new THREE.CylinderGeometry(0.28, 0.32, 0.22, 6).translate(0, 0.05, 0),
    kind: PART.cap,
    color: '#2B2F3F',
    emissive: 0,
  });
  pieces.push({
    geo: new THREE.BoxGeometry(0.05, 0.05, 0.3).translate(0.4, 0.14, 0.1),
    kind: PART.cap,
    color: OFFICE_COLORS.gold,
    emissive: 0,
  });
  const done = pieces.map((p) => finish(p));
  const geo = mergeGeometries(done, false);
  for (const d of done) d.dispose();
  return geo;
}

/**
 * The parts geometry split per kind (index = `PartKind`; same vertices and attributes as
 * `buildPartsGeometry`). TASK-495: each kind draws as its own instanced mesh, so an instance costs
 * only its own shape. On the merged geometry every instance drew all 970 triangles (the shader
 * collapsed the other kinds), so each new kind added its triangles to every live instance.
 */
export function buildPartGeometries(): THREE.BufferGeometry[] {
  const all = buildPartsGeometry();
  const kind = all.getAttribute('limb');
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < Object.keys(PART).length; k++) {
    const verts: number[] = [];
    for (let i = 0; i < kind.count; i++) if (kind.getX(i) === k) verts.push(i);
    const g = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(all.attributes)) {
      const s = a.itemSize;
      const src = a.array as Float32Array;
      const arr = new Float32Array(verts.length * s);
      verts.forEach((v, j) => arr.set(src.subarray(v * s, v * s + s), j * s));
      g.setAttribute(name, new THREE.BufferAttribute(arr, s));
    }
    out.push(g);
  }
  all.dispose();
  return out;
}
