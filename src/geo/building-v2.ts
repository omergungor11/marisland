/**
 * Styled building builders (TASK-598, D-160). Each public builder is the legacy one from
 * geo/buildings.ts for every index without a row in content/building-variants.ts, so existing
 * variants (pinned by culture plans) are byte-identical; appended indices get a style.
 * LOD1 of a styled row = the legacy LOD1 silhouette of the def in the row's wall / roof colours.
 */
import * as THREE from 'three';
import {
  BUILDING_K as K,
  buildingStyle,
  type BuildingStyle,
} from '../content/building-variants.ts';
import { EMISSIVE, ROCK, WOOD } from '../content/palette.ts';
import { col, frustum, qEuler } from './kit.ts';
import {
  barn as barnLegacy,
  cottage as cottageLegacy,
  gabledRoof,
  house,
  logCabin as logCabinLegacy,
  stiltHut as stiltHutLegacy,
  towerHouse as towerHouseLegacy,
} from './buildings.ts';
import {
  addAwning,
  addChimney,
  addDoor,
  addDormers,
  addHipRoof,
  addMansardRoof,
  hipGeo,
  eavePlate,
  styledHouse,
  windowRow,
  windowSize,
} from './building-kit.ts';
import {
  TAU,
  V,
  V2,
  baseBox,
  bevBox,
  cylB,
  gableRoof,
  jitterAcc,
  prism,
  put,
  windowAt,
} from './parts.ts';
import type { BuildOpts } from './types.ts';
import type { Acc } from './kit.ts';

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- cottage

export function cottage(o: BuildOpts): THREE.BufferGeometry {
  const st = buildingStyle('cottage', o.variant);
  if (!st) return cottageLegacy(o);
  const { rng, lod } = o;
  const acc = jitterAcc(rng);
  const dims = { w: 3, d: 3, y0: 0.25, wallH: 2.0, rise: 1.35 };
  if (lod === 1) {
    house(acc, {
      rng: rng.fork('cottage'),
      lod,
      ...dims,
      wall: st.wall,
      roof: st.roofCol,
      trim: st.trim,
      nWin: 2,
      chimney: false,
      foundation: true,
    });
    return acc.finish(rng, false, true);
  }
  styledHouse(acc, st, { lod, ...dims, foundation: true, step: true }, (top, X, rise) =>
    gabledRoof(acc, {
      top,
      halfW: X,
      wallHalfW: dims.w / 2,
      rise,
      length: dims.d + 0.5,
      wallLen: dims.d - 0.02,
      roof: st.roofCol,
      wall: st.wall,
      lod,
    }),
  );
  return acc.finish(rng, false, true);
}

// ---------------------------------------------------------------- stilt hut

export function stiltHut(o: BuildOpts): THREE.BufferGeometry {
  const st = buildingStyle('stiltHut', o.variant);
  if (!st) return stiltHutLegacy(o);
  const { rng, lod } = o;
  const r = rng.fork('stilt');
  const acc = jitterAcc(rng);
  const deckTop = 1.2;
  const px = st.sixPosts ? [-1.45, 0, 1.45] : [-1.45, 1.45];
  for (const x of px)
    for (const z of [-1.45, 1.45]) {
      const tilt = lod === 0 ? r.range(-0.03, 0.03) : 0;
      put(acc, cylB(0.17, 0.13, deckTop, lod === 0 ? 6 : 4, true), [x, 0, z], col(WOOD.logs), {
        q: qEuler(tilt, 0, tilt),
        aoAmt: 0.3,
      });
      if (lod === 0) put(acc, cylB(0.2, 0.2, 0.1, 6), [x, 0, z], col(WOOD.dark), { aoAmt: 0.3 });
    }
  const deckW = 3.5;
  if (lod === 0)
    put(acc, bevBox(deckW, 0.24, deckW + 0.4, 0.06), [0, deckTop - 0.1, 0.2], col(WOOD.planks), {
      aoAmt: 0.1,
    });
  else put(acc, baseBox(deckW, 0.24, deckW + 0.4), [0, deckTop - 0.22, 0.2], col(WOOD.planks));
  const dims = { w: 2.7, d: 2.5, y0: deckTop + 0.02, wallH: 2.0, rise: 1.25 };
  if (lod === 1) {
    house(acc, {
      rng: r,
      lod,
      ...dims,
      wall: st.wall,
      roof: st.roofCol,
      trim: st.trim,
      nWin: 3,
      chimney: false,
      foundation: false,
    });
    return acc.finish(rng, false, true);
  }
  styledHouse(acc, st, { lod, ...dims, foundation: false, step: false }, (top, X, rise) =>
    gabledRoof(acc, {
      top,
      halfW: X,
      wallHalfW: dims.w / 2,
      rise,
      length: dims.d + 0.5,
      wallLen: dims.d - 0.02,
      roof: st.roofCol,
      wall: st.wall,
      lod,
    }),
  );
  // ladder at the front-left of the deck
  const lx = -1.3;
  const top = V(lx, deckTop, 1.95);
  const bot = V(lx, 0, 2.55);
  for (const dx of [-0.2, 0.2]) {
    const s = frustum(top.clone().add(V(dx, 0.35, 0)), bot.clone().add(V(dx, 0, 0)), 0.05, 0.05, 4);
    acc.add(s.geo, { m: s.m, color: col(WOOD.dark), windMul: 0, aoAmt: 0.1 });
  }
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.6) / 5.4;
    const p = bot.clone().lerp(top, t);
    put(acc, new THREE.BoxGeometry(0.46, 0.06, 0.07), p, col(WOOD.planks), { aoAmt: 0 });
  }
  return acc.finish(rng, false, true);
}

// ---------------------------------------------------------------- tower house

export function towerHouse(o: BuildOpts): THREE.BufferGeometry {
  const st = buildingStyle('towerHouse', o.variant);
  if (!st) return towerHouseLegacy(o);
  const { rng, lod } = o;
  const acc = jitterAcc(rng);
  const H = 3.9;
  if (lod === 0) {
    if (st.plinth)
      put(acc, baseBox(2.62, K.plinth.h + 0.1, 2.62), [0, 0, 0], col(st.plinth), { aoAmt: 0.3 });
    else put(acc, baseBox(2.9, 0.3, 2.9), [0, 0, 0], col(ROCK[0]), { aoAmt: 0.25 });
    put(acc, bevBox(2.5, H - 0.2, 2.5, 0.12), [0, 0.3 + (H - 0.2) / 2, 0], st.wall, {
      ao: (p) => Math.min(1, 1 - 0.2 * (1 - smooth(0.3, 1.7, p.y)) - 0.1 * smooth(H - 0.5, H, p.y)),
    });
  } else {
    put(acc, baseBox(2.5, H, 2.5), [0, 0, 0], st.wall, { aoAmt: 0.2 });
  }
  // roof: the legacy cone (LOD1 always), or the styled one at LOD0
  let roofY: (x: number, z: number) => number = () => H;
  const coneRoof = (): void =>
    put(
      acc,
      new THREE.ConeGeometry(2.05, 2.3, lod === 0 ? 8 : 6),
      [0, H + 1.15, 0],
      (p) => col(st.roofCol).multiplyScalar(0.9 + 0.2 * Math.min(1, (p.y - H) / 2.3)),
      { aoAmt: 0.05, q: qEuler(0, TAU / 16, 0) },
    );
  if (lod === 1 || st.roof === 'cone') coneRoof();
  else if (st.roof === 'hip')
    roofY = addHipRoof(acc, { top: H, hx: 1.25, hz: 1.25, rise: 2.3, roof: st.roofCol, lod });
  else if (st.roof === 'mansard')
    roofY = addMansardRoof(acc, { top: H, hx: 1.25, hz: 1.25, rise: 2.3, roof: st.roofCol, lod });
  else {
    const X = 1.25 + K.overhang.hip;
    gabledRoof(acc, {
      top: H,
      halfW: X,
      wallHalfW: 1.25,
      rise: 1.9,
      length: 3.3,
      wallLen: 2.48,
      roof: st.roofCol,
      wall: st.wall,
      lod,
    });
    roofY = (x) => H + 1.9 * (1 - Math.min(1, Math.abs(x) / X));
  }
  // balcony ring (disc + railing posts + rail)
  const by = 2.05;
  put(acc, cylB(1.85, 1.85, 0.16, lod === 0 ? 10 : 6), [0, by, 0], col(WOOD.planks), {
    aoAmt: 0.1,
  });
  if (lod === 1) return acc.finish(rng, false, true);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    put(
      acc,
      cylB(0.05, 0.05, 0.55, 4, true),
      [Math.cos(a) * 1.78, by + 0.16, Math.sin(a) * 1.78],
      col(WOOD.logs),
      { aoAmt: 0.1 },
    );
  }
  put(acc, cylB(1.82, 1.82, 0.08, 10, true), [0, by + 0.68, 0], col(WOOD.dark), {
    double: true,
    aoAmt: 0,
  });
  addDoor(acc, st.door, V(0, 0.3, 1.25), 0, { door: st.doorCol, frame: st.trim });
  if (st.awning === undefined) {
    // (no awning on towers: the balcony disc sits right over the door)
  }
  const { w: ww, h: wh } = windowSize(st.windows);
  const upY = 3.2;
  const lowY = 1.15;
  const wide = st.windows === 2;
  // upper ring: front, +x, -x (and the back); lower: the two sides (not on pattern 2)
  windowRow(acc, {
    centre: V(0, 0, 1.25),
    yaw: 0,
    xs: [0],
    y: upY,
    w: ww,
    h: wh,
    trim: st.trim,
    ...(st.shutters ? { shutters: st.shutters } : {}),
    ...(st.flowerBox ? { flowerBox: true } : {}),
  });
  for (const sg of [1, -1])
    windowRow(acc, {
      centre: V(sg * 1.25, 0, 0),
      yaw: sg * (Math.PI / 2),
      xs: [0],
      y: upY,
      w: ww,
      h: wh,
      trim: st.trim,
    });
  windowRow(acc, {
    centre: V(0, 0, -1.25),
    yaw: Math.PI,
    xs: [0],
    y: upY,
    w: ww,
    h: wh,
    trim: st.trim,
  });
  if (!wide)
    for (const sg of [1, -1])
      windowRow(acc, {
        centre: V(sg * 1.25, 0, 0),
        yaw: sg * (Math.PI / 2),
        xs: [0],
        y: lowY,
        w: ww,
        h: st.windows === 1 ? 0.8 : wh,
        trim: st.trim,
      });
  addChimney(acc, st.chimney, { x: 0.55, z: -0.45, top: H - 0.3, roofY: roofY(0.55, -0.45) });
  return acc.finish(rng, false, true);
}

// ---------------------------------------------------------------- barn

/** Barn gable-end door (the +x wall), sized for the big openings. */
function barnDoor(acc: Acc, st: BuildingStyle, y0: number): void {
  const size =
    st.door === 'double'
      ? { w: 2.2, h: 2.0 }
      : st.door === 'arched'
        ? { w: 2.0, h: 2.2 }
        : { w: 1.4, h: 2.0 };
  addDoor(acc, st.door, V(3.0, y0, 0), Math.PI / 2, {
    door: st.doorCol,
    frame: st.trim,
    ...size,
  });
  if (st.door === 'double')
    for (const s of [-1, 1])
      put(acc, new THREE.BoxGeometry(0.08, 2.1, 0.14), [3.1, y0 + 1.05, s * 0.55], col(st.trim), {
        q: qEuler(s * 0.46, 0, 0),
        aoAmt: 0,
      });
  if (st.door === 'plain')
    put(acc, new THREE.BoxGeometry(0.08, 2.1, 0.14), [3.1, y0 + 1.05, 0], col(st.trim), {
      q: qEuler(0.52, 0, 0),
      aoAmt: 0,
    });
  if (st.awning)
    addAwning(acc, {
      at: V(3.0, y0, 0),
      yaw: Math.PI / 2,
      width: size.w + 0.4,
      y: y0 + size.h + 0.45,
      colours: st.awning,
    });
}

export function barn(o: BuildOpts): THREE.BufferGeometry {
  const st = buildingStyle('barn', o.variant);
  if (!st) return barnLegacy(o);
  const { rng, lod } = o;
  const acc = jitterAcc(rng);
  const y0 = 0.2;
  const wh = 2.4;
  const top = y0 + wh;
  if (lod === 0) {
    if (st.plinth) put(acc, baseBox(6.1, 0.8, 4.1), [0, 0, 0], col(st.plinth), { aoAmt: 0.3 });
    else put(acc, baseBox(6.2, 0.3, 4.2), [0, 0, 0], col(ROCK[0]), { aoAmt: 0.25 });
    put(acc, bevBox(6, wh, 4, 0.12), [0, y0 + wh / 2, 0], st.wall, {
      ao: (p) =>
        Math.min(1, 1 - 0.2 * (1 - smooth(y0, y0 + 1.1, p.y)) - 0.1 * smooth(top - 0.5, top, p.y)),
    });
  } else {
    put(acc, baseBox(6, wh + y0, 4), [0, 0, 0], st.wall, { aoAmt: 0.18 });
  }
  const shade =
    (rise: number) =>
    (p: THREE.Vector3): THREE.Color =>
      col(st.roofCol).multiplyScalar(0.92 + 0.14 * Math.min(1, Math.max(0, (p.y - top) / rise)));
  let roofY: (x: number, z: number) => number = () => top;
  let endWalls = true;
  const gambrel = (): void => {
    const hw = 2.3;
    const pts = [
      V2(-hw, -0.16),
      V2(hw, -0.16),
      V2(hw, 0.05),
      V2(1.5, 1.35),
      V2(0, 2.1),
      V2(-1.5, 1.35),
      V2(-hw, 0.05),
    ];
    put(acc, prism(pts, 6.7).rotateY(Math.PI / 2), [0, top, 0], shade(2.1), { aoAmt: 0.05 });
    if (lod === 0)
      put(
        acc,
        prism(
          [
            V2(-2, -0.2),
            V2(2, -0.2),
            V2(2, 0.1),
            V2(1.45, 1.2),
            V2(0, 1.95),
            V2(-1.45, 1.2),
            V2(-2, 0.1),
          ],
          5.98,
        ).rotateY(Math.PI / 2),
        [0, top, 0],
        st.wall,
        { aoAmt: 0.1 },
      );
    roofY = (_x, z) =>
      top +
      (Math.abs(z) > 1.5
        ? 1.35 * (1 - (Math.abs(z) - 1.5) / 0.8) + 0.05
        : 2.1 - (0.75 * Math.abs(z)) / 1.5);
  };
  if (lod === 1 || st.roof === 'gambrel' || st.roof === 'dormer') gambrel();
  else if (st.roof === 'gable') {
    const rise = 1.75;
    put(acc, gableRoof(2.3, rise, 6.7, 0.2).rotateY(Math.PI / 2), [0, top, 0], shade(rise), {
      aoAmt: 0.05,
    });
    put(
      acc,
      prism([V2(-2, -0.1), V2(2, -0.1), V2(0, rise - 0.3)], 5.98).rotateY(Math.PI / 2),
      [0, top, 0],
      st.wall,
      { aoAmt: 0.1 },
    );
    roofY = (_x, z) => top + rise * (1 - Math.min(1, Math.abs(z) / 2.3));
  } else {
    // hip: eave rect 6.8 x 4.8 with the ridge along x
    endWalls = false;
    const ex = 2.0 + K.overhang.hip;
    const ez = 3.0 + K.overhang.hip;
    const rise = 1.85;
    const rr = ez - ex;
    eavePlate(acc, { top, hx: ez, hz: ex, roof: st.roofCol });
    put(acc, hipGeo(ex, ez, rr, rise).rotateY(Math.PI / 2), [0, top + 0.04, 0], shade(rise), {
      aoAmt: 0.06,
    });
    roofY = (x, z) =>
      top +
      0.04 +
      rise *
        (1 - Math.min(1, Math.max(Math.abs(z) / ex, Math.max(0, Math.abs(x) - rr) / (ez - rr))));
  }
  if (lod === 1) return acc.finish(rng, false, true);
  // loft dormers on the +z slope (gambrel)
  if (st.roof === 'dormer')
    for (const x of [-1.3, 1.3]) {
      const zf = 1.95;
      const base = top + 0.35;
      put(acc, new THREE.BoxGeometry(0.9, 1.0, 0.8), [x, base + 0.5, zf - 0.4], st.wall, {
        aoAmt: 0.1,
      });
      put(
        acc,
        prism([V2(-0.55, 0), V2(0.55, 0), V2(0, 0.32)], 0.92).rotateY(0),
        [x, base + 1.0, zf - 0.34],
        st.roofCol,
        { aoAmt: 0.05 },
      );
      windowAt(acc, {
        at: V(x, base + 0.52, zf),
        yaw: 0,
        w: 0.5,
        h: 0.5,
        frame: st.trim,
        glow: col(EMISSIVE.window),
      });
    }
  barnDoor(acc, st, y0);
  const glow = col(EMISSIVE.window);
  const { w: ww, h: wh2 } = windowSize(st.windows);
  const xs = st.windows === 1 ? [-2.0, 0, 2.0] : st.windows === 2 ? [-1.6, 1.4] : [-1.4, 1.4];
  windowRow(acc, {
    centre: V(0, 0, 2.0),
    yaw: 0,
    xs,
    y: y0 + 1.4,
    w: ww,
    h: wh2,
    trim: st.trim,
    ...(st.shutters ? { shutters: st.shutters } : {}),
    ...(st.flowerBox ? { flowerBox: true } : {}),
  });
  if (endWalls)
    for (const sg of [1, -1])
      windowAt(acc, {
        at: V(sg * 3.0, top + 1.0, 0),
        yaw: sg * (Math.PI / 2),
        w: 0.6,
        h: 0.7,
        frame: st.trim,
        glow,
      });
  addChimney(acc, st.chimney, { x: -1.9, z: -0.7, top, roofY: roofY(-1.9, -0.7) });
  return acc.finish(rng, false, true);
}

// ---------------------------------------------------------------- log cabin

export function logCabin(o: BuildOpts): THREE.BufferGeometry {
  const st = buildingStyle('logCabin', o.variant);
  if (!st) return logCabinLegacy(o);
  const { rng, lod } = o;
  const r = rng.fork('cabin');
  const acc = jitterAcc(rng);
  const logs = st.wall === WOOD.logs ? [WOOD.logs, WOOD.dark] : [WOOD.dark, WOOD.logs];
  const n = 6;
  const pitch = 0.4;
  const rad = 0.22;
  const top = 0.22 + n * pitch;
  const gable = (): void =>
    gabledRoof(acc, {
      top,
      halfW: 1.95,
      wallHalfW: 1.5,
      rise: 1.25,
      length: 4.9,
      wallLen: 4.2,
      roof: st.roofCol,
      wall: logs[0],
      lod,
    });
  if (lod === 1) {
    put(acc, baseBox(4.2, n * pitch + 0.2, 3.4), [0, 0, 0], col(logs[0]), { aoAmt: 0.2 });
    gable();
    return acc.finish(rng, false, true);
  }
  for (let i = 0; i < n; i++) {
    const y = 0.22 + i * pitch;
    const c = col(logs[i % 2]);
    for (const s of [-1, 1]) {
      const jx = r.range(-0.05, 0.05);
      put(acc, new THREE.CylinderGeometry(rad, rad, 4.5, 5, 1, false), [jx, y, s * 1.5], c, {
        q: qEuler(0, 0, Math.PI / 2),
        aoAmt: 0.1,
        cullY: -1,
      });
      put(
        acc,
        new THREE.CylinderGeometry(rad, rad, 3.0, 5, 1, true),
        [s * 1.9, y + pitch / 2, 0],
        c,
        { q: qEuler(Math.PI / 2, 0, 0), aoAmt: 0.1 },
      );
    }
  }
  let roofY: (x: number, z: number) => number;
  if (st.roof === 'hip') {
    // eave rectangle over the 4.5 x 3.4 log box, ridge along x
    const ex = 1.7 + K.overhang.hip;
    const ez = 2.25 + K.overhang.hip;
    const rise = 1.2;
    const rr = ez - ex;
    eavePlate(acc, { top, hx: ez, hz: ex, roof: st.roofCol });
    put(
      acc,
      hipGeo(ex, ez, rr, rise).rotateY(Math.PI / 2),
      [0, top + 0.04, 0],
      (p) =>
        col(st.roofCol).multiplyScalar(0.92 + 0.14 * Math.min(1, Math.max(0, (p.y - top) / rise))),
      { aoAmt: 0.06 },
    );
    roofY = (x, z) =>
      top +
      0.04 +
      rise *
        (1 - Math.min(1, Math.max(Math.abs(z) / ex, Math.max(0, Math.abs(x) - rr) / (ez - rr))));
  } else {
    gable();
    roofY = (x) => top + 1.25 * (1 - Math.min(1, Math.abs(x) / 1.95));
    if (st.roof === 'dormer')
      addDormers(acc, {
        top,
        X: 1.95,
        rise: 1.25,
        z: 0.55,
        roof: st.roofCol,
        wall: logs[0],
        trim: st.trim,
        sides: [1, -1],
        lod,
      });
  }
  const glow = col(EMISSIVE.window);
  const doorX = -0.7;
  const dHalf = addDoor(acc, st.door, V(doorX, 0.2, 1.74), 0, {
    door: st.doorCol,
    frame: st.trim,
    step: WOOD.planks,
  });
  if (st.awning)
    addAwning(acc, {
      at: V(doorX, 0.2, 1.74),
      yaw: 0,
      width: dHalf * 2 + 0.3,
      y: 0.2 + 1.95,
      colours: st.awning,
    });
  const { w: ww, h: wh } = windowSize(st.windows);
  const front = st.windows === 1 ? [1.0, 1.9] : st.windows === 2 ? [1.45] : [1.1];
  const trims = {
    trim: st.trim,
    ...(st.shutters ? { shutters: st.shutters } : {}),
    ...(st.flowerBox ? { flowerBox: true } : {}),
  };
  windowRow(acc, {
    centre: V(0, 0, 1.76),
    yaw: 0,
    xs: front,
    y: 1.45,
    w: st.windows === 2 ? 1.0 : ww,
    h: st.windows === 2 ? 0.62 : wh,
    sill: true,
    ...trims,
  });
  windowRow(acc, {
    centre: V(0, 0, -1.76),
    yaw: Math.PI,
    xs: st.windows === 1 ? [-0.9, 0.9] : [0],
    y: 1.45,
    w: ww,
    h: wh,
    trim: st.trim,
  });
  if (st.windows === 1)
    for (const sg of [1, -1])
      windowRow(acc, {
        centre: V(sg * 2.12, 0, 0),
        yaw: sg * (Math.PI / 2),
        xs: [0],
        y: 1.45,
        w: ww,
        h: wh,
        trim: st.trim,
      });
  void glow;
  addChimney(acc, st.chimney, { x: 1.4, z: -0.5, top: top - 0.4, roofY: roofY(1.4, -0.5) });
  return acc.finish(rng, false, true);
}
