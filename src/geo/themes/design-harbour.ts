/**
 * Design "Colour Wharf" kit geometry (M31 TASK-537, D-127). Numbers: content/themes/design-harbour.ts.
 * Variants appended to old defs, so every older variant keeps its builder and seeded bytes:
 *
 *   glasshouse   v5..v8  pastel boathouse: pivot on the waterline, stilts below it, door on +z
 *   conservatory v1      glass waiting pavilion: an octagon on a pile deck, the pier through its two
 *                        open bays (local ±z), violet frame; hooks prism { faces, apothem, y0, y1 }
 *   buoy         v3..v6  paint pot on a float, rim and drip in the paint colour; dark at night
 *                        (the ritual lights it), one LOD1 for all four (the batcher collapses them)
 */
import * as THREE from 'three';
import { DESIGN_CULTURE_KIT as KIT } from '../../content/props-themes/design.ts';
import {
  WHARF_GEO as F,
  WHARF_MOTION,
  WHARF_PASTELS,
  WHARF_VARIANTS as WV,
} from '../../content/themes/design-harbour.ts';
import { col, qEuler, type Acc } from '../kit.ts';
import { V, baseBox, cylB, gableRoof, put } from '../parts.ts';
import type { BuildOpts, PropBuilder, PropGeoDef } from '../types.ts';
import { cultureAcc } from './culture-devops.ts';
import { pane } from './culture-m20-design.ts';
import { addHook } from './hq.ts';
import { tagStained } from './surface-tags.ts';

const PI = Math.PI;
const G = KIT.glass;
const glow = { emissive: 0.75, ao: () => 1, aoAmt: 0, noJitter: true } as const;

/* ================================= boathouse ================================= */

function boathouse({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const B = F.boathouse;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const wall = WHARF_PASTELS[(variant - WV.boathouse) % WHARF_PASTELS.length];
  const hw = B.w / 2;
  const hd = B.d / 2;
  const fy = B.floorY;
  const eave = fy + B.wallH;
  // stilts + deck (LOD1: a solid skirt down to the water, the stilts are specks there)
  if (hi) {
    for (const sx of [-1, 1])
      for (const z of [-1, 1])
        put(
          acc,
          baseBox(0.17, B.stiltDown + fy, 0.17),
          [sx * (hw - 0.12), -B.stiltDown, z * (hd - 0.1)],
          B.pile,
          { aoAmt: 0.2 },
        );
    put(acc, baseBox(B.w + 0.1, 0.1, B.d + 0.5), [0, fy - 0.1, 0.2], B.deck, { aoAmt: 0.15 });
  } else {
    put(acc, baseBox(B.w + 0.1, fy, B.d + 0.1), [0, 0, 0], B.deck, { aoAmt: 0.15 });
  }
  // walls: painted; LOD0 the front is a frame round the door, LOD1 a box with a dark door
  if (hi) {
    put(acc, baseBox(0.12, B.wallH, B.d), [-hw + 0.06, fy, 0], wall, { aoAmt: 0.12 });
    put(acc, baseBox(0.12, B.wallH, B.d), [hw - 0.06, fy, 0], wall, { aoAmt: 0.12 });
    put(acc, baseBox(B.w, B.wallH, 0.12), [0, fy, -hd + 0.06], wall, { aoAmt: 0.12 });
    const jamb = (B.w - B.door.w) / 2;
    for (const s of [-1, 1])
      put(acc, baseBox(jamb, B.wallH, 0.12), [s * (B.door.w / 2 + jamb / 2), fy, hd - 0.06], wall, {
        aoAmt: 0.1,
      });
    put(acc, baseBox(B.door.w, B.wallH - B.door.h, 0.12), [0, fy + B.door.h, hd - 0.06], wall, {
      aoAmt: 0,
    });
    // plank seams on the side walls, door trim, dark inside, a hull in the slip
    for (const s of [-1, 1])
      for (const y of [0.7])
        put(acc, baseBox(0.02, 0.05, B.d - 0.1), [s * (hw + 0.005), fy + y, 0], B.trim, {
          aoAmt: 0,
        });
    for (const s of [-1, 1])
      put(acc, baseBox(0.12, B.door.h, 0.16), [s * (B.door.w / 2 + 0.03), fy, hd], B.trim, {
        aoAmt: 0,
      });
    put(acc, baseBox(B.door.w + 0.18, 0.12, 0.16), [0, fy + B.door.h, hd], B.trim, { aoAmt: 0 });
    put(acc, baseBox(B.w - 0.26, B.wallH, 0.04), [0, fy, -hd + 0.15], B.doorDark, { aoAmt: 0 });
    put(acc, baseBox(0.75, 0.32, 2.2).translate(0, 0, 0), [0, fy + 0.02, 0.15], B.hull, {
      aoAmt: 0.3,
    });
  } else {
    put(acc, baseBox(B.w, B.wallH, B.d), [0, fy, 0], wall, { aoAmt: 0.12 });
    put(acc, baseBox(B.door.w, B.door.h, 0.05), [0, fy, hd], B.doorDark, { aoAmt: 0 });
  }
  // gable roof (ridge along z), painted gable over the door + window glow
  const roof = `#${new THREE.Color(wall).multiplyScalar(B.roofShade).getHexString()}`;
  put(acc, gableRoof(hw + 0.18, B.roofRise, B.d + 0.42), [0, eave, 0], roof, { aoAmt: 0 });
  const tri = new THREE.Shape([
    new THREE.Vector2(-hw, 0),
    new THREE.Vector2(hw, 0),
    new THREE.Vector2(0, B.roofRise * 0.96),
  ]);
  put(acc, new THREE.ShapeGeometry(tri), [0, eave, hd + 0.01], wall, { aoAmt: 0 });
  if (hi)
    put(acc, new THREE.ShapeGeometry(tri), [0, eave, -hd - 0.01], wall, {
      q: qEuler(0, PI, 0),
      aoAmt: 0,
    });
  const W = B.window;
  put(acc, baseBox(W.w, W.h, 0.05), [0, W.y, hd + 0.03], B.glow, glow);
  if (hi)
    put(acc, baseBox(W.w + 0.14, 0.06, 0.08), [0, W.y - 0.05, hd + 0.03], B.trim, { aoAmt: 0 });
  const geo = acc.finish(rng, false, true);
  return addHook(geo, 'door', { at: [0, fy, hd], dir: [0, 0, 1] });
}

/* ================================== pavilion ================================= */

const SEG = PI / 4;
/** Octagon vertex k (face i, centred i × 45° from +z, joins k = i, i + 1). */
const vtx = (k: number, r: number, y: number): THREE.Vector3 => {
  const a = (k - 0.5) * SEG;
  return V(Math.sin(a) * r, y, Math.cos(a) * r);
};
const bar = (a: THREE.Vector3, b: THREE.Vector3, w: number): THREE.BufferGeometry => {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(w, w, d.length(), 3, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
};

function pavilionDeck(acc: Acc, hi: boolean): void {
  const P = F.pavilion;
  put(acc, cylB(P.deckR, P.deckR, 0.14, 8).rotateY(SEG / 2), [0, P.deckY - 0.14, 0], P.deck, {
    aoAmt: 0.2,
  });
  if (!hi) return;
  for (let k = 0; k < 8; k += 2) {
    const p = vtx(k, P.deckR - 0.15, 0);
    put(
      acc,
      cylB(0.09, 0.09, P.pileDown + P.deckY - 0.14, 4),
      [p.x, -P.pileDown, p.z],
      F.boathouse.pile,
      {
        aoAmt: 0.2,
      },
    );
  }
}

/** Glass waiting pavilion: panes emissive 1 (lamp class), like the big conservatory. */
function pavilion({ rng, lod }: BuildOpts): THREE.BufferGeometry {
  const P = F.pavilion;
  const hi = lod === 0;
  const acc = cultureAcc(rng, lod);
  const y0 = P.deckY;
  const y1 = y0 + P.wallH;
  const ring = y1 + P.ringH;
  const top = ring + P.domeH;
  pavilionDeck(acc, hi);
  const hue = (i: number): string => G[P.panes[i % P.panes.length]];
  const edge = 2 * P.r * Math.sin(SEG / 2);
  for (let i = 0; i < 8; i++) {
    const open = i === 0 || i === 4;
    const a = vtx(i, P.r, y0);
    const b = vtx(i + 1, P.r, y0);
    const at = (t: number, y: number): THREE.Vector3 => a.clone().lerp(b, t).setY(y);
    const yd = y0 + P.doorH;
    if (open) {
      // the pier runs through: a pane transom over the opening, glass shoulders beside it
      const u = (1 - P.bayW / edge) / 2;
      pane(acc, [at(u, yd), at(1 - u, yd), at(1 - u, y1), at(u, y1)], hue(i));
      if (hi)
        for (const [t0, t1] of [
          [0, u],
          [1 - u, 1],
        ] as const)
          pane(acc, [at(t0, y0 + 0.1), at(t1, y0 + 0.1), at(t1, y1), at(t0, y1)], hue(i + 1));
      if (hi)
        for (const t of [u, 1 - u])
          put(acc, bar(at(t, y0), at(t, yd), 0.06), [0, 0, 0], P.frame, { aoAmt: 0.05 });
    } else {
      const cols = hi ? 2 : 1;
      for (let c = 0; c < cols; c++)
        pane(
          acc,
          [
            at(c / cols, y0 + 0.1),
            at((c + 1) / cols, y0 + 0.1),
            at((c + 1) / cols, y1),
            at(c / cols, y1),
          ],
          hue(i + c),
        );
    }
    // corner mullion, eave (LOD1: the panes' own gap and the hue change draw the frame)
    if (hi) {
      put(acc, bar(a, a.clone().setY(y1), 0.09), [0, 0, 0], P.frameDeep, { aoAmt: 0.05 });
      put(acc, bar(a.clone().setY(y1), b.clone().setY(y1), 0.09), [0, 0, 0], P.frameDeep, {
        aoAmt: 0,
      });
    }
    // mansard panes + dome facets
    const r0 = vtx(i, P.ringR, ring);
    const r1 = vtx(i + 1, P.ringR, ring);
    pane(acc, [a.clone().setY(y1), b.clone().setY(y1), r1, r0], hue(i + 2), 0.05);
    const tip = V(0, top, 0);
    pane(acc, [r0, r1, tip], hue(i + 3), 0.05);
    if (hi) {
      put(acc, bar(a.clone().setY(y1), r0, 0.05), [0, 0, 0], P.frame, { aoAmt: 0 });
      put(acc, bar(r0, tip, 0.04), [0, 0, 0], P.frame, { aoAmt: 0 });
      put(acc, bar(r0, r1, 0.05), [0, 0, 0], P.frame, { aoAmt: 0 });
    }
  }
  // finial + two benches beside the walk
  put(acc, new THREE.IcosahedronGeometry(P.finial, 0), [0, top + 0.05, 0], P.lamp, {
    emissive: 1.3,
    ao: () => 1,
    aoAmt: 0,
  });
  if (hi)
    for (const s of [-1, 1])
      put(acc, baseBox(0.42, 0.42, 1.5), [s * (P.r - 0.72), y0, 0], P.bench, { aoAmt: 0.15 });
  const geo = acc.finish(rng, false, true);
  if (hi) tagStained(geo);
  const M = WHARF_MOTION.arrival.prism;
  return addHook(geo, 'prism', {
    faces: M.faces,
    apothem: P.r * Math.cos(SEG / 2),
    y0,
    y1,
  });
}

/* ================================== paint pot ================================ */

function paintPot({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const P = F.paintPot;
  const acc = cultureAcc(rng, lod);
  const bob = { windAbs: 0.5 };
  const top = P.y0 + P.h;
  if (lod === 1) {
    // one geometry for every paint: a pale pot with a rim of all four (D-032 collapse, one call)
    put(acc, cylB(P.r * 1.1, P.r * 1.1, top, 5), [0, 0, 0], P.can, {
      aoAmt: 0.15,
      noJitter: true,
      ...bob,
    });
    put(
      acc,
      cylB(P.r * 1.14, P.r * 1.14, 0.14, 5),
      [0, top - 0.14, 0],
      (p) => col(WHARF_PASTELS[Math.floor(((Math.atan2(p.z, p.x) + PI) / (2 * PI)) * 4) % 4]),
      { aoAmt: 0, noJitter: true, ...bob },
    );
    return acc.finish(rng, false, true);
  }
  const paint = WHARF_PASTELS[(variant - WV.paintPot) % 4];
  put(acc, cylB(P.float.r, P.float.r * 0.8, P.float.h, 6), [0, 0, 0], P.can, {
    aoAmt: 0.1,
    ...bob,
  });
  put(acc, cylB(P.r * 0.95, P.r * 1.05, P.h, 7), [0, P.y0, 0], P.can, { aoAmt: 0.18, ...bob });
  // the rim's paint, its surface and a drip down the side
  put(acc, cylB(P.r * 1.08, P.r * 1.08, 0.11, 7), [0, top - 0.11, 0], paint, { aoAmt: 0, ...bob });
  put(acc, cylB(P.r * 0.92, P.r * 0.92, 0.02, 7), [0, top + 0.005, 0], paint, { aoAmt: 0, ...bob });
  put(acc, baseBox(0.09, 0.26, 0.05), [0.12, top - 0.34, P.r * 1.02], paint, { aoAmt: 0, ...bob });
  // wire handle
  put(acc, new THREE.TorusGeometry(P.r * 0.95, 0.02, 3, 5, PI), [0, top, 0], P.handle, {
    aoAmt: 0,
    ...bob,
  });
  const geo = acc.finish(rng, false, true);
  return addHook(geo, 'lamp', { at: [0, top + 0.1, 0], r: P.r });
}

/* ================================ registry glue ============================== */

const WHARF: Record<
  string,
  { first: number; count: number; height: number; build: PropBuilder } | undefined
> = {
  glasshouse: {
    first: WV.boathouse,
    count: WHARF_PASTELS.length,
    height: F.boathouse.floorY + F.boathouse.wallH + F.boathouse.roofRise,
    build: boathouse,
  },
  conservatory: {
    first: WV.pavilion,
    count: 1,
    height: F.pavilion.heightNominal,
    build: pavilion,
  },
  buoy: { first: WV.paintPot, count: 4, height: F.paintPot.heightNominal, build: paintPot },
};

/** Append the wharf's variants to its three old defs; anything else passes through untouched. */
export function withWharfKit(def: PropGeoDef): PropGeoDef {
  const add = WHARF[def.id];
  if (!add) return def;
  if (def.variants !== add.first)
    throw new Error(`wharf kit: ${def.id} has ${def.variants} variants, want ${add.first}`);
  const own = def.heights ?? Array.from({ length: def.variants }, () => def.height);
  const build: PropBuilder = (o) => (o.variant >= add.first ? add.build(o) : def.build(o));
  return {
    ...def,
    variants: def.variants + add.count,
    heights: [...own, ...Array.from({ length: add.count }, () => add.height)],
    build,
  };
}
