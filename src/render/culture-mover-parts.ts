import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Part shapes of the culture movers (TASK-431): ONE merged geometry, drawn with the shared creature
 * material. Every vertex carries `limb = (kind, 0, 0, 6)` and every instance `aGait.y = kind`; the
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
} as const;
export type PartKind = (typeof PART)[keyof typeof PART];

const WHITE = new THREE.Color(1, 1, 1);

interface Piece {
  geo: THREE.BufferGeometry;
  kind: number;
  /** Vertex colour (null = white, takes the instance colour). */
  color: string | null;
  emissive: number;
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
  for (let i = 0; i < n; i++) {
    col.push(c.r, c.g, c.b);
    limb.push(p.kind, 0, 0, 6);
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
  // 6 patch: unit disc lying flat, a little emissive
  pieces.push({
    geo: new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2),
    kind: PART.patch,
    color: null,
    emissive: 0.3,
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
  const done = pieces.map((p) => finish(p));
  const geo = mergeGeometries(done, false);
  for (const d of done) d.dispose();
  return geo;
}
