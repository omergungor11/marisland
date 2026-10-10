import * as THREE from 'three';
import { createRng } from '../core/rng.ts';
import { BRIDGES as C } from '../content/bridges.ts';
import { Acc, col } from './kit.ts';
import { baseBox, cylB, put } from './parts.ts';

/**
 * One viaduct bay (TASK-394): a barrel-vaulted stone span between two half piers, deck, cornice,
 * parapets with caps and a lamp post on each side at the +z pier. Local space: z along the span
 * (bay centre at 0, ±bay/2 at the pier axes), x across, y up with the deck top at y = 0 and the
 * piers running down `pierDepth` below it (the feet end under the seabed, so nothing floats).
 * The renderer places one instance per span piece and scales z to fill the gap.
 */
export function buildBridgeGeometry(lod = 0): THREE.BufferGeometry {
  const M = C.model;
  const K = C.colors;
  const acc = new Acc();
  const W = M.deckW;
  const bay = M.bay;
  const hs = bay / 2 - M.pierW / 2;
  const crown = -M.deckT - M.archT;
  const ys = crown - M.archRise;
  const top = -0.04;
  const segs = lod > 0 ? M.lodArchSegs : M.archSegs;

  const stone = col(K.stone);
  const dark = col(K.stoneDark);
  const moss = col(K.moss);
  const path = col(K.path);
  const cap = col(K.cap);

  // body: deck slab + spandrels with the arch opening cut into one outline (piers are boxes below)
  const pts: THREE.Vector2[] = [new THREE.Vector2(-bay / 2, ys), new THREE.Vector2(-hs, ys)];
  for (let i = 0; i <= segs; i++) {
    const phi = -Math.PI / 2 + (i / segs) * Math.PI;
    pts.push(new THREE.Vector2(hs * Math.sin(phi), ys + M.archRise * Math.cos(phi)));
  }
  pts.push(
    new THREE.Vector2(bay / 2, ys),
    new THREE.Vector2(bay / 2, top),
    new THREE.Vector2(-bay / 2, top),
  );
  // extrude along the shape's z, then turn so shape-x runs along +z and the extrusion across x
  const slab = (shape: THREE.Shape, z0: number, depth: number): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 })
      .translate(0, 0, z0)
      .rotateY(-Math.PI / 2);
  put(acc, slab(new THREE.Shape(pts), -W / 2, W), [0, 0, 0], (p) => (p.y > -0.12 ? path : stone), {
    aoAmt: 0.1,
  });
  // piers (half a pier at each end of the bay), stacked boxes: stone, waterline stain, mossy foot
  const bands: Array<[number, number, THREE.Color]> = [
    [ys, M.stainY, stone],
    [M.stainY, M.stainY - 2.5, dark],
    [M.stainY - 2.5, -M.pierDepth, dark.clone().lerp(moss, 0.4)],
  ];
  for (const s of [-1, 1])
    for (const [y0, y1, c] of bands)
      put(acc, baseBox(W, y0 - y1, M.pierW / 2), [0, y1, s * (bay / 2 - M.pierW / 4)], c, {
        aoAmt: y1 === ys ? 0 : 0.05,
      });

  // voussoir ring on both faces: wedges around the opening, alternating tones
  const ringN = lod > 0 ? 6 : 10;
  const rw = 0.5;
  const ell = (a: number, b: number, phi: number): THREE.Vector2 =>
    new THREE.Vector2((hs + a) * Math.sin(phi), ys + (M.archRise + b) * Math.cos(phi));
  for (let i = 0; i < ringN; i++) {
    const p0 = -Math.PI / 2 + (i / ringN) * Math.PI;
    const p1 = -Math.PI / 2 + ((i + 1) / ringN) * Math.PI;
    const wedge = new THREE.Shape([
      ell(-0.02, -0.02, p0),
      ell(-0.02, -0.02, p1),
      ell(rw, rw, p1),
      ell(rw, rw, p0),
    ]);
    const tone = i % 2 ? cap : stone;
    // faces at x = ±W/2 (rotateY(-π/2): extrusion z ∈ [z0, z0+d] lands on x ∈ [−z0−d, −z0])
    for (const side of [1, -1]) {
      const z0 = side > 0 ? -W / 2 - 0.12 : W / 2 - 0.02;
      put(acc, slab(wedge, z0, 0.14), [0, 0, 0], tone, { aoAmt: 0 });
    }
  }

  // cornice, parapets, caps
  put(acc, baseBox(W + 0.24, 0.22, bay), [0, -0.22, 0], cap, { aoAmt: 0 });
  const px = W / 2 - M.parapetT / 2 + 0.02;
  for (const s of [-1, 1]) {
    put(acc, baseBox(M.parapetT, M.parapetH, bay), [s * px, 0, 0], stone, { aoAmt: 0.12 });
    put(acc, baseBox(M.parapetT + 0.16, M.capH, bay), [s * px, M.parapetH, 0], cap, { aoAmt: 0 });
  }

  // lamp post + lantern on each side at the +z pier
  for (const s of [-1, 1]) {
    const x = s * px;
    const z = bay / 2 - 0.5;
    const y0 = M.parapetH + M.capH;
    put(acc, cylB(M.lampR * 1.3, M.lampR, M.lampH, 5), [x, y0, z], K.lampPost, { aoAmt: 0 });
    put(acc, baseBox(0.36, 0.38, 0.36), [x, y0 + M.lampH, z], K.lampGlass, {
      emissive: 1,
      aoAmt: 0,
      ao: () => 1,
    });
    put(acc, new THREE.ConeGeometry(0.3, 0.26, 4), [x, y0 + M.lampH + 0.51, z], K.lampPost, {
      aoAmt: 0,
    });
  }
  return acc.finish(createRng(394).fork('bridge-faces'), false, true);
}
