/**
 * Boats and dock dressing v2 (TASK-601, D-175): `harbourBoat` (dinghy / cabin fishing boat / sloop in
 * the island's colour set), `dockDressing` (net, lobster pot, rope coil, ladder) and three buoy
 * variants appended to the old `buoy` def. Bow +z, pivot on the waterline (hull sunk by its draft,
 * like `quayBoat`); dressing pivots on the deck top. 1 u = 1 m.
 */
import * as THREE from 'three';
import { BUOY_V2, DOCK_DRESSING, HARBOUR_BOAT as HB, splitBoatVariant } from '../content/biomes.ts';
import { EMISSIVE, ROOFS, WALLS, WOOD } from '../content/palette.ts';
import { col, qEuler, type Acc } from './kit.ts';
import { gridSurface, hullShape } from './coastal.ts';
import { TINT, V, baseBox, cylB, jitterAcc, put, windowAt } from './parts.ts';
import type { BuildOpts, PropBuilder, PropGeoDef } from './types.ts';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const PI = Math.PI;
const TAU2 = PI * 2;
/** Normal mix toward +y for sail faces (kit `softNormal`): the shade side keeps sky light. */
const SAIL_SOFT = 0.65;
/**
 * Sail cloth (TASK-680): a light base (the set's sail colour pulled toward white) with a head panel in
 * the set's stripe colour. The panel and the lighter base keep a hue in the shade instead of the old flat grey / olive.
 */
const sailCloth = (
  base: string,
  panel: string,
  y0: number,
  y1: number,
  from = 0.72,
): ((p: THREE.Vector3) => THREE.Color) => {
  const b = col(base).lerp(new THREE.Color(1, 1, 1), 0.3);
  const c = col(panel).lerp(new THREE.Color(1, 1, 1), 0.1);
  return (p) => (p.y > y0 + (y1 - y0) * from ? c : b).clone();
};

/** Extruded hull plan from y0 up to y1 (shape y -> +z bow), optionally with an open well. */
function hullBand(L: number, W: number, y0: number, y1: number, well = 0): THREE.BufferGeometry {
  const s = hullShape(L, W);
  if (well > 0) s.holes.push(new THREE.Path(hullShape(L - well * 2, W - well * 2).getPoints()));
  return new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false })
    .rotateX(PI / 2)
    .translate(0, y1, 0);
}

interface HullSpec {
  L: number;
  W: number;
  draft: number;
  free: number;
  /** Open well (dinghy): rim thickness. */
  well?: number;
  plank: string;
}

/** Two-band hull (narrow keel, flared sheer) in the set's colours; LOD1 is one band. */
function hull(acc: Acc, lod: number, h: HullSpec, hullHex: string, stripeHex: string): void {
  const top = h.free;
  if (lod === 1) {
    put(
      acc,
      hullBand(h.L, h.W, -h.draft, top),
      [0, 0, 0],
      // same colours as LOD0: hull side, deck plank (stripe on the open dinghy rim)
      (p) => col(p.y > top - 0.01 ? (h.well ? stripeHex : h.plank) : hullHex),
      {
        aoAmt: 0.2,
      },
    );
    return;
  }
  const mid = top * 0.35;
  put(acc, hullBand(h.L, h.W, -h.draft, mid).scale(0.88, 1, 0.95), [0, 0, 0], hullHex, {
    aoAmt: 0.25,
  });
  if (h.well) {
    put(acc, hullBand(h.L, h.W, mid, top - 0.2).scale(1.02, 1, 0.99), [0, 0, 0], hullHex, {
      aoAmt: 0.1,
    });
    put(acc, hullBand(h.L, h.W, top - 0.2, top, h.well).scale(1.04, 1, 1), [0, 0, 0], stripeHex, {
      aoAmt: 0.1,
    });
    // the well floor
    put(
      acc,
      hullBand(h.L - h.well * 2, h.W - h.well * 2, top - 0.26, top - 0.2),
      [0, 0, 0],
      h.plank,
      { aoAmt: 0.2 },
    );
  } else {
    put(acc, hullBand(h.L, h.W, mid, top - 0.12).scale(1.04, 1, 1), [0, 0, 0], hullHex, {
      aoAmt: 0.1,
    });
    // sheer stripe + planked deck
    put(
      acc,
      hullBand(h.L, h.W, top - 0.12, top).scale(1.04, 1, 1),
      [0, 0, 0],
      (p) => col(p.y > top - 0.01 ? h.plank : stripeHex),
      { aoAmt: 0.1 },
    );
  }
}

// ---------------------------------------------------------------- dinghy

function dinghy(acc: Acc, lod: number, set: { hull: string; sail: string; stripe: string }): void {
  const spec: HullSpec = {
    L: HB.length[0],
    W: 1.45,
    draft: HB.draft[0],
    free: 0.6,
    well: 0.14,
    plank: WOOD.planks,
  };
  hull(acc, lod, spec, set.hull, set.stripe);
  const mastH = HB.height[0] - 0.3;
  if (lod === 1) {
    put(acc, cylB(0.05, 0.05, mastH, 4, true), [0, 0.3, 0.5], WOOD.dark, { aoAmt: 0 });
    return;
  }
  // thwarts, a mast with a lug sail, an outboard bracket
  for (const z of [-0.6, 0.35])
    put(acc, new THREE.BoxGeometry(1.1, 0.07, 0.26), [0, 0.44, z], WOOD.planks, { aoAmt: 0.1 });
  put(acc, cylB(0.05, 0.035, mastH, 5, true), [0, 0.34, 0.55], WOOD.dark, { aoAmt: 0.05 });
  const sail = gridSurface(2, 2, (u, v) =>
    V(
      0.16 * Math.sin(PI * u) * Math.sin(PI * v),
      0.75 + v * (mastH - 0.7) * (1 - 0.45 * u),
      0.55 - 0.06 - u * 1.2,
    ),
  );
  put(acc, sail, [0, 0, 0], sailCloth(set.sail, set.stripe, 0.75, mastH + 0.05), {
    double: true,
    softNormal: SAIL_SOFT,
    aoAmt: 0,
    noJitter: true,
    windAbs: (p) => clamp01((0.5 - p.z) / 1.2),
    ao: () => 1,
  });
}

// ---------------------------------------------------------------- cabin fishing boat

function fishingBoat(
  acc: Acc,
  lod: number,
  set: { hull: string; sail: string; stripe: string },
): void {
  const spec: HullSpec = {
    L: HB.length[1],
    W: 1.7,
    draft: HB.draft[1],
    free: 0.62,
    plank: WOOD.planks,
  };
  hull(acc, lod, spec, set.hull, set.stripe);
  const deck = spec.free;
  if (lod === 1) {
    put(acc, baseBox(1.1, 0.95, 1.3), [0, deck, -0.9], WALLS[1], { aoAmt: 0.1 });
    put(acc, baseBox(1.2, 0.1, 1.4), [0, deck + 0.95, -0.9], set.stripe, { aoAmt: 0.1 });
    put(acc, cylB(0.06, 0.04, 2.9, 4, true), [0, deck, 0.7], WOOD.dark, { aoAmt: 0 });
    return;
  }
  // aft wheelhouse: walls, glowing windows, roof with overhang, funnel pipe
  put(acc, baseBox(1.1, 0.95, 1.3), [0, deck, -0.9], WALLS[1], { aoAmt: 0.12 });
  put(acc, baseBox(1.3, 0.1, 1.5), [0, deck + 0.95, -0.9], set.stripe, { aoAmt: 0.1 });
  put(acc, cylB(0.09, 0.08, 0.45, 5, true), [0.3, deck + 1.05, -1.2], WOOD.dark, { aoAmt: 0.1 });
  for (const s of [-1, 1])
    windowAt(acc, {
      at: V(s * 0.56, deck + 0.55, -0.85),
      yaw: s * (PI / 2),
      w: 0.4,
      h: 0.32,
      frame: WOOD.dark,
      glow: EMISSIVE.window,
      emissive: 0.6,
    });
  windowAt(acc, {
    at: V(0, deck + 0.58, -0.24),
    yaw: 0,
    w: 0.6,
    h: 0.34,
    frame: WOOD.dark,
    glow: EMISSIVE.window,
    emissive: 0.6,
  });
  // foredeck: fish crates, a mast with a derrick boom and a net drum
  for (const [x, z] of [
    [-0.35, 0.75],
    [0.3, 0.55],
  ] as const)
    put(acc, baseBox(0.45, 0.28, 0.4), [x, deck, z], WOOD.planks, { aoAmt: 0.15 });
  put(acc, cylB(0.07, 0.05, 2.9, 5, true), [0, deck, 0.1], WOOD.dark, { aoAmt: 0.1 });
  put(acc, new THREE.BoxGeometry(0.06, 0.06, 1.4), [0, deck + 1.9, 0.62], WOOD.dark, {
    aoAmt: 0,
    q: qEuler(-0.35, 0, 0),
  });
  put(acc, cylB(0.22, 0.22, 0.34, 6, true), [0.55, deck, 1.05], TINT.rope, {
    aoAmt: 0.15,
    q: qEuler(0, 0, PI / 2),
  });
  // pennant in the set's stripe colour
  const flag = gridSurface(2, 1, (u, v) =>
    V(0, deck + 2.8 + v * 0.25 - u * 0.08 * v, 0.1 - u * 0.5),
  );
  put(acc, flag, [0, 0, 0], set.stripe, {
    double: true,
    aoAmt: 0,
    noJitter: true,
    windAbs: (p) => clamp01((0.1 - p.z) / 0.5),
    ao: () => 1,
  });
  // fenders
  for (const s of [-1, 1])
    put(acc, new THREE.IcosahedronGeometry(0.1, 0), [s * 0.82, deck - 0.2, 0.3], set.sail, {
      aoAmt: 0,
    });
}

// ---------------------------------------------------------------- sloop

function sloop(acc: Acc, lod: number, set: { hull: string; sail: string; stripe: string }): void {
  const spec: HullSpec = {
    L: HB.length[2],
    W: 1.75,
    draft: HB.draft[2],
    free: 0.55,
    plank: WOOD.planks,
  };
  hull(acc, lod, spec, set.hull, set.stripe);
  const deck = spec.free;
  const mastZ = 0.3;
  const mastH = HB.height[2] - deck;
  put(acc, cylB(0.08, 0.05, mastH, lod === 0 ? 5 : 4, true), [0, deck - 0.05, mastZ], WOOD.dark, {
    aoAmt: 0.1,
  });
  const y0 = deck + 0.6;
  const H = mastH - 1.2;
  const Ls = 2.1;
  const nu = lod === 0 ? 3 : 1;
  const nv = lod === 0 ? 4 : 1;
  const main = gridSurface(nu, nv, (u, v) =>
    V(
      0.36 * Math.sin(PI * u) * Math.sin(PI * v) + 0.04,
      y0 + v * H * (1 - 0.9 * u),
      mastZ - 0.06 - u * Ls,
    ),
  );
  put(acc, main, [0, 0, 0], sailCloth(set.sail, set.stripe, y0, y0 + H), {
    double: true,
    softNormal: SAIL_SOFT,
    aoAmt: 0,
    noJitter: true,
    windAbs: (p) => clamp01((mastZ - p.z) / Ls),
    ao: () => 1,
  });
  if (lod === 1) return;
  put(acc, new THREE.BoxGeometry(0.07, 0.07, 2.2), [0, y0 - 0.1, mastZ - 1.1], WOOD.dark, {
    aoAmt: 0,
  });
  // headsail in the stripe colour
  const jib = gridSurface(2, 3, (u, v) =>
    V(
      0.18 * Math.sin(PI * u) * Math.sin(PI * v),
      y0 + 0.1 + v * (H - 0.5) * (1 - u),
      mastZ + 0.1 + u * 1.7,
    ),
  );
  put(acc, jib, [0, 0, 0], sailCloth(set.stripe, set.stripe, y0, y0 + H), {
    double: true,
    softNormal: SAIL_SOFT,
    aoAmt: 0,
    noJitter: true,
    windAbs: (p) => clamp01((p.z - mastZ) / 1.7),
    ao: () => 1,
  });
  // cabin hatch with a window, cockpit coaming, pennant, bow lamp
  put(acc, baseBox(1.0, 0.32, 1.1), [0, deck, -0.55], WALLS[1], { aoAmt: 0.15 });
  windowAt(acc, {
    at: V(0, deck + 0.17, 0.01),
    yaw: 0,
    w: 0.5,
    h: 0.14,
    frame: WOOD.dark,
    glow: EMISSIVE.window,
    emissive: 0.6,
  });
  put(acc, new THREE.BoxGeometry(0.9, 0.12, 0.08), [0, deck + 0.06, -1.5], WOOD.planks, {
    aoAmt: 0.1,
  });
  const flag = gridSurface(2, 1, (u, v) =>
    V(0, deck + mastH - 0.35 + v * 0.3 - u * 0.1 * v, mastZ - u * 0.5),
  );
  put(acc, flag, [0, 0, 0], ROOFS[1], {
    double: true,
    aoAmt: 0,
    noJitter: true,
    windAbs: (p) => clamp01((mastZ - p.z) / 0.5),
    ao: () => 1,
  });
}

/** `harbourBoat`: variant = biomeIndex * 3 + hull (0 dinghy, 1 cabin fishing boat, 2 sloop). */
export function harbourBoat({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const { set, hull: kind } = splitBoatVariant(variant);
  const acc = jitterAcc(rng.fork('boat'), 0.02);
  acc.cls = 'wood';
  [dinghy, fishingBoat, sloop][kind](acc, lod, set);
  return acc.finish(rng, false, true);
}

// ---------------------------------------------------------------- dock dressing

/** `dockDressing`: 0 net on a drying rack, 1 lobster pot, 2 rope coil, 3 ladder down the quay face. */
export function dockDressing({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const r = rng.fork('dress');
  const acc = jitterAcc(rng.fork('dj'), 0.03);
  acc.cls = 'wood';
  const v = variant % 4;
  const lo = lod === 1;
  const rope = TINT.rope;
  if (v === 0) {
    // two posts, a crossbar and a sagging net with cork floats
    for (const x of [-0.55, 0.55])
      put(acc, cylB(0.06, 0.05, 0.95, lo ? 4 : 5, true), [x, 0, 0], WOOD.dark, { aoAmt: 0.2 });
    put(acc, new THREE.BoxGeometry(1.25, 0.06, 0.06), [0, 0.92, 0], WOOD.dark, { aoAmt: 0.1 });
    const net = gridSurface(lo ? 1 : 5, lo ? 1 : 3, (u, w) =>
      V(
        -0.55 + u * 1.1,
        0.9 - w * 0.62 - 0.1 * Math.sin(PI * u) * w,
        0.04 * Math.sin(PI * w) + 0.02,
      ),
    );
    put(acc, net, [0, 0, 0], rope, {
      double: true,
      aoAmt: 0.1,
      noJitter: true,
      cls: 'fabric',
      ao: () => 1,
    });
    if (!lo)
      for (let i = 0; i < 4; i++)
        put(
          acc,
          new THREE.IcosahedronGeometry(0.05, 0),
          [-0.4 + i * 0.27, 0.9 - 0.62 - 0.07 * Math.sin(PI * (0.18 + i * 0.22)), 0.05],
          r.chance(0.5) ? ROOFS[0] : TINT.cork,
          { aoAmt: 0 },
        );
  } else if (v === 1) {
    // lobster pot: a slatted dome on a base ring, a funnel mouth and a float on a line
    put(acc, cylB(0.34, 0.3, 0.12, lo ? 5 : 7), [0, 0, 0], WOOD.dark, { aoAmt: 0.25 });
    put(
      acc,
      new THREE.SphereGeometry(0.32, lo ? 5 : 8, lo ? 2 : 4, 0, TAU2, 0, PI / 2),
      [0, 0.1, 0],
      WOOD.planks,
      { aoAmt: 0.2, s: [1, 0.85, 1] },
    );
    if (!lo) {
      put(acc, new THREE.TorusGeometry(0.2, 0.025, 3, 8), [0, 0.2, 0], WOOD.dark, {
        aoAmt: 0.1,
        q: qEuler(PI / 2, 0, 0),
      });
      put(acc, new THREE.TorusGeometry(0.32, 0.025, 3, 8), [0, 0.12, 0], WOOD.dark, {
        aoAmt: 0.1,
        q: qEuler(PI / 2, 0, 0),
      });
      put(acc, new THREE.IcosahedronGeometry(0.1, 0), [0.4, 0.1, 0.15], ROOFS[1], { aoAmt: 0.1 });
    }
  } else if (v === 2) {
    // rope coil: three stacked rings, a loose end
    const rings = lo ? 1 : 3;
    for (let i = 0; i < rings; i++)
      put(
        acc,
        new THREE.TorusGeometry(0.3 - i * 0.03, lo ? 0.1 : 0.06, lo ? 3 : 4, lo ? 6 : 10),
        [0, lo ? 0.12 : 0.06 + i * 0.08, 0],
        rope,
        {
          aoAmt: 0.2,
          q: qEuler(PI / 2, 0, 0),
          noJitter: true,
        },
      );
    if (!lo)
      put(acc, cylB(0.04, 0.03, 0.4, 3, true), [0.32, 0.02, 0.1], rope, {
        aoAmt: 0.1,
        q: qEuler(0, 0, -1.3),
      });
  } else {
    // ladder: two rails and rungs from the deck edge down the face (pivot = deck top)
    const drop = DOCK_DRESSING.ladderDrop;
    for (const x of [-0.22, 0.22])
      put(
        acc,
        new THREE.BoxGeometry(0.07, drop + 0.35, 0.07),
        [x, (0.35 - drop) / 2, 0],
        WOOD.dark,
        { aoAmt: 0.15 },
      );
    const rungs = lo ? 1 : 5;
    for (let i = 0; i < rungs; i++)
      put(
        acc,
        new THREE.BoxGeometry(0.5, 0.05, 0.07),
        [0, 0.2 - (i * (drop + 0.1)) / rungs, 0],
        WOOD.planks,
        { aoAmt: 0.1 },
      );
    // handrail hoops
    if (!lo)
      for (const x of [-0.22, 0.22])
        put(acc, new THREE.TorusGeometry(0.1, 0.025, 3, 6, PI), [x, 0.35, 0], WOOD.dark, {
          aoAmt: 0,
          q: qEuler(0, PI / 2, 0),
        });
  }
  return acc.finish(rng, false, true);
}

// ---------------------------------------------------------------- buoy variants

/** Buoy v7 spar (striped pole with a topmark), v8 mooring ball, v9 pot floats. Appended after the wharf pots. */
function buoyV2({ rng, lod, variant }: BuildOpts): THREE.BufferGeometry {
  const acc = jitterAcc(rng, 0.02);
  const bob = { windAbs: 0.5 };
  const v = variant - BUOY_V2.first;
  acc.cls = 'metal';
  if (v === 0) {
    const lo = lod === 1;
    put(acc, cylB(0.17, 0.1, 0.45, lo ? 3 : 8), [0, 0, 0], ROOFS[1], { aoAmt: 0.2, ...bob });
    put(
      acc,
      cylB(0.07, 0.05, 1.0, lo ? 3 : 8, true),
      [0, 0.4, 0],
      (p) => col(Math.floor(p.y / 0.2) % 2 === 0 ? WALLS[1] : ROOFS[1]),
      { aoAmt: 0.1, ...bob },
    );
    if (!lo)
      put(acc, new THREE.ConeGeometry(0.14, 0.22, 8), [0, 1.4, 0], ROOFS[3], { aoAmt: 0, ...bob });
  } else if (v === 1) {
    put(
      acc,
      new THREE.SphereGeometry(0.3, lod === 0 ? 8 : 5, lod === 0 ? 5 : 3),
      [0, 0.27, 0],
      WALLS[1],
      { aoAmt: 0.15, ...bob },
    );
    if (lod === 0) {
      put(acc, new THREE.TorusGeometry(0.31, 0.04, 3, 8), [0, 0.33, 0], ROOFS[5], {
        aoAmt: 0,
        q: qEuler(PI / 2, 0, 0),
        ...bob,
      });
      put(acc, new THREE.TorusGeometry(0.07, 0.025, 3, 5), [0, 0.59, 0], WOOD.dark, {
        aoAmt: 0,
        ...bob,
      });
    }
  } else {
    // three small pot floats on a line
    for (const [x, z, c] of [
      [0, 0, ROOFS[0]],
      [0.22, 0.18, ROOFS[3]],
      [-0.2, 0.2, ROOFS[1]],
    ] as const)
      put(
        acc,
        new THREE.SphereGeometry(lod === 0 ? 0.1 : 0.14, lod === 0 ? 6 : 4, lod === 0 ? 4 : 2),
        [x, lod === 0 ? 0.08 : 0.1, z],
        c,
        { aoAmt: 0.1, ...bob },
      );
    if (lod === 0)
      put(acc, cylB(0.012, 0.012, 0.3, 3, true), [0, 0.1, 0], TINT.rope, { aoAmt: 0, ...bob });
  }
  return acc.finish(rng, false, true);
}

/** Append the three buoy variants to the old `buoy` def; every other def passes through. */
export function withBuoyV2(def: PropGeoDef): PropGeoDef {
  if (def.id !== 'buoy') return def;
  if (def.variants !== BUOY_V2.first)
    throw new Error(`buoy v2: buoy has ${def.variants} variants, want ${BUOY_V2.first}`);
  const own = def.heights ?? Array.from({ length: def.variants }, () => def.height);
  const build: PropBuilder = (o) => (o.variant >= BUOY_V2.first ? buoyV2(o) : def.build(o));
  return {
    ...def,
    variants: def.variants + BUOY_V2.names.length,
    heights: [...own, ...BUOY_V2.height],
    build,
  };
}
