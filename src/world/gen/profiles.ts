import type { Noise } from '../../core/noise.ts';
import type { Rng } from '../../core/rng.ts';
import { hashInts } from '../../core/hash.ts';
import { clamp01, lerp, smax, smoothstep } from '../../core/math/index.ts';
import type { ArchetypeId, FieldPatchData, IslandData } from '../types.ts';
import {
  ARCHETYPES,
  PATCHWORK,
  RAW_FLOOR,
  WINDWARD_CLIFF,
  type CampusHillParams,
} from '../../content/islands.ts';

/**
 * Per-cell profile tags (bit flags, OR-combined into a Uint8 grid inside the
 * island's bounds). They carry archetype intent the zone/height passes can't
 * infer from height alone.
 */
export const Tag = {
  /** Inside the volcano crater → zone `crater`. */
  crater: 1,
  /** Forced cliff (Beacon Rock windward, Emberpeak rim + notch, sea stacks); no beach blend. */
  cliff: 2,
  /** Enclosed atoll lagoon water → zone `lagoon`, lagoon floor depth. */
  lagoon: 4,
  /** Coast cleanup must not fill this cell (lagoons, atoll channels, Beacon Rock). */
  noFill: 8,
  /** Millbrook patchwork cell → `field`. */
  field: 16,
  /** Millbrook pond dip (kept out of the beach rule). */
  pond: 32,
  /** Millbrook patchwork cell → `meadow`. */
  meadow: 64,
} as const;

/**
 * Archetype profile functions (ARCHITECTURE §2 step 2). A profile turns an
 * island's layout entry into a raw land field: > 0 is land, ≤ 0 is water
 * (clamped to RAW_FLOOR). Absolute height is normalised afterwards to the
 * archetype's peak range, so profiles only shape — they never pick units.
 * The shelf / seabed are NOT a profile concern: they are derived from the
 * exact shore distance in heightfield.ts so every coast gets one.
 */
export interface ProfileContext {
  island: IslandData;
  /** Island-private stream: rng.fork('island:shape', id). */
  rng: Rng;
  /** Island-private noise. */
  noise: Noise;
  windDir: number;
}

export interface IslandProfile {
  sample(x: number, z: number): number;
  /** Optional per-cell Tag bits (evaluated inside the island's bounds). */
  tag?(x: number, z: number): number;
  /** Optional polylines in world u (Mossgrove stream). */
  streams?: { x: number; z: number }[][];
  /** Optional crop-field rectangles (Millbrook patchwork; islandId filled by the caller). */
  fields?: Omit<FieldPatchData, 'islandId'>[];
  /** Optional field colour per point: 1 + index into palette FIELDS, 0 = none. */
  fieldColor?(x: number, z: number): number;
  /** Anchors in world u; rotY = facing angle in the xz plane (same convention as windDir). */
  anchors: IslandData['anchors'];
}

export type ProfileFactory = (ctx: ProfileContext) => IslandProfile;

/** Coast threshold: land where mask × elevation exceeds this. */
const COAST_LEVEL = 0.35;

interface Frame {
  /** World → island-local, normalised by radius; +x points leeward (downwind). */
  toLocal(x: number, z: number, out: [number, number]): void;
  toWorld(lx: number, lz: number): { x: number; z: number };
}

function frame(island: IslandData, windDir: number): Frame {
  const c = Math.cos(windDir);
  const s = Math.sin(windDir);
  const inv = 1 / island.radius;
  return {
    toLocal(x, z, out) {
      const dx = x - island.cx;
      const dz = z - island.cz;
      out[0] = (dx * c + dz * s) * inv;
      out[1] = (-dx * s + dz * c) * inv;
    },
    toWorld(lx, lz) {
      const r = island.radius;
      return { x: island.cx + (lx * c - lz * s) * r, z: island.cz + (lx * s + lz * c) * r };
    },
  };
}

/** Skill recipe: mask = 1 − smoothstep(0.55, 1, d). */
const radialMask = (d: number): number => 1 - smoothstep(0.55, 1, d);

/** Low-frequency domain warp in local (radius-normalised) space. */
function warpAt(noise: Noise, lx: number, lz: number, out: [number, number]): void {
  out[0] = noise.fbm(lx * 1.1 + 3.7, lz * 1.1 - 1.3, 2);
  out[1] = noise.fbm(lx * 1.1 - 6.1, lz * 1.1 + 2.9, 2);
}

/** Elevation noise term in [0, 1]: pow(fbm·0.5+0.5, 1.3), low base frequency. */
function elevation(noise: Noise, lx: number, lz: number): number {
  const f = noise.fbm(lx * 0.9 + 10.3, lz * 0.9 - 4.1, 4);
  return Math.pow(clamp01(f * 0.5 + 0.5), 1.3);
}

interface Lobe {
  x: number;
  z: number;
  r: number;
}

/**
 * Hearthholm: crescent around a harbour bay on the leeward side, a ~12 u hill
 * on the windward back, 1–2 small peninsulas.
 */
const hearthholm: ProfileFactory = ({ island, rng, noise, windDir }) => {
  const fr = frame(island, windDir);
  const bay = { x: rng.range(0.55, 0.68), z: rng.range(-0.1, 0.1), r: rng.range(0.42, 0.5) };
  const hill = { x: rng.range(-0.45, -0.25), z: rng.range(-0.2, 0.2), s: 0.38 };
  const lobes: Lobe[] = [];
  const nLobes = rng.int(1, 2);
  for (let i = 0; i < nLobes; i++) {
    const a = Math.PI + rng.range(-1.7, 1.7);
    const dist = rng.range(0.72, 0.9);
    lobes.push({ x: Math.cos(a) * dist, z: Math.sin(a) * dist, r: rng.range(0.22, 0.32) });
  }
  const q: [number, number] = [0, 0];
  const w: [number, number] = [0, 0];
  const sample = (x: number, z: number): number => {
    fr.toLocal(x, z, q);
    const lx = q[0];
    const lz = q[1];
    warpAt(noise, lx, lz, w);
    // main body, stretched across the wind so the crescent arms wrap the bay
    let mask = radialMask(0.93 * Math.hypot(lx + w[0] * 0.25, lz / 1.2 + w[1] * 0.25));
    for (const l of lobes) {
      const d = Math.hypot((lx - l.x) / l.r + w[0] * 0.25, (lz - l.z) / l.r + w[1] * 0.25);
      mask = smax(mask, radialMask(d), 0.15);
    }
    mask = clamp01(mask);
    // harbour bay carved out on the leeward side, opening to the sea
    const bd = Math.hypot((lx - bay.x) / bay.r + w[0] * 0.12, (lz - bay.z) / bay.r + w[1] * 0.12);
    mask *= smoothstep(0.8, 1.1, bd);
    const hx = lx - hill.x;
    const hz = lz - hill.z;
    const hillTerm = Math.exp(-(hx * hx + hz * hz) / (hill.s * hill.s));
    const e = 3.5 * (0.3 + 0.7 * elevation(noise, lx, lz)) + 9 * hillTerm;
    return Math.max(RAW_FLOOR, mask * e - COAST_LEVEL);
  };
  const bayW = fr.toWorld(bay.x, bay.z);
  const hillW = fr.toWorld(hill.x, hill.z);
  return {
    sample,
    anchors: {
      harbour: { x: bayW.x, z: bayW.z, rotY: windDir },
      hill: { x: hillW.x, z: hillW.z, rotY: windDir },
    },
  };
};

/** Angle of a local point; 0 = leeward (+x), π = windward. */
const angleOf = (lx: number, lz: number): number => Math.atan2(lz, lx);
/** Smallest absolute difference of two angles. */
const angDiff = (a: number, b: number): number => {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
};
const gauss2 = (dx: number, dz: number, s: number): number =>
  Math.exp(-(dx * dx + dz * dz) / (s * s));

/** Windward sector factor (0 outside, 1 inside ±halfAngle around upwind = −x). */
export function windwardSector(lx: number, lz: number, halfAngle: number, soft: number): number {
  const len = Math.hypot(lx, lz) || 1;
  const c = -lx / len; // cos of angle to upwind
  const ch = Math.cos(halfAngle);
  return smoothstep(ch - soft, ch + soft, c);
}

/**
 * Beacon Rock: a sheer 25 u stack with a slightly domed top (lighthouse) and 2–4 sea stacks
 * offshore to windward. The windward face is a forced cliff with no beach and (in the height
 * pass) no shelf. TASK-403 (Marketing "Media Rock"): to leeward the stack steps down in
 * nested terraces (TerraceParams) — upper ledge, middle ledge, fair ground at the waterline —
 * each rimmed by an earth wall, the last one ramping down to a beach in its landing cove.
 * Anchors: `lighthouse` (summit), `landing` (cove), `ledge0` / `ledge1` / `ledge2` (mid band of
 * each shelf on the terrace axis; rotY = the axis heading).
 */
const beaconrock: ProfileFactory = ({ island, rng, noise, windDir }) => {
  const fr = frame(island, windDir);
  const r = island.radius;
  const stacks: { x: number; z: number; s: number; h: number }[] = [];
  const nStacks = rng.int(2, 4);
  for (let tries = 0; stacks.length < nStacks && tries < 60; tries++) {
    const a = Math.PI + rng.range(-0.75, 0.75);
    const dist = rng.range(1.55, 2.05);
    const st = { x: Math.cos(a) * dist, z: Math.sin(a) * dist, s: rng.range(5, 8) / r, h: 0 };
    st.h = rng.range(6, 14);
    if (stacks.some((o) => Math.hypot(o.x - st.x, o.z - st.z) * r < (o.s + st.s) * r + 7)) continue;
    stacks.push(st);
  }
  const landing = { x: rng.range(1.0, 1.1), z: rng.range(-0.25, 0.25) };
  const top = { x: rng.range(-0.25, -0.1), z: rng.range(-0.1, 0.1) };
  // TASK-403 draws come after the stack / landing / summit rolls, so those keep their values
  const T = ARCHETYPES.beaconrock.terraces;
  const lean = T ? rng.range(-T.lean, T.lean) : 0;
  const side = T && rng.next() < 0.5 ? -1 : 1;
  const coveA = T ? (side * rng.range(T.cove.angleDeg[0], T.cove.angleDeg[1]) * Math.PI) / 180 : 0;
  const cl = Math.cos(lean);
  const sl = Math.sin(lean);
  const sx = T?.stack.shift ?? 0;
  const ss = T?.stack.scale ?? 1;
  // shelf ellipses (axis centre c, half-length r0, half-width r1, radius units) from the u bands
  const foot = T ? T.foot / ss - sx : 0;
  const bs = T ? Math.min(T.bandScale.max, Math.max(T.bandScale.min, r / T.bandScale.ref)) : 1;
  let rim = foot;
  const shelves = (T?.shelves ?? []).map((S) => {
    const inner = rim;
    rim += (S.band * bs) / r;
    const r0 = (rim - (T as NonNullable<typeof T>).inner) / 2;
    return { ...S, c: rim - r0, r: [r0, r0 * S.across] as const, mid: (inner + rim) / 2 };
  });
  const last = shelves.length - 1;
  const coveCos = T ? Math.cos((T.cove.halfDeg * Math.PI) / 180) : 1;
  const q: [number, number] = [0, 0];
  const w: [number, number] = [0, 0];
  const half = (WINDWARD_CLIFF.halfAngleDeg * Math.PI) / 180;
  /** Stack top (raw): the dome rim value the shelf levels are fractions of. */
  const TOP = 25;
  /** Shelf k at axis coords (u, v): its raw height and the wall parameter (0 = rim foot … 1 = shelf). */
  const shelf = (k: number, u: number, v: number, out: [number, number]): void => {
    const S = shelves[k];
    const eu = (u - S.c) / S.r[0];
    const ev = v / S.r[1];
    const d =
      Math.hypot(eu, ev) +
      (T as NonNullable<typeof T>).warp * noise.fbm(u * 2.3 + 5.1 * k, v * 2.3 - 3.3 * k, 2);
    const unitU = r * Math.min(S.r[0], S.r[1]);
    let run = S.wall / unitU;
    if (k === last && T) {
      const th = Math.atan2(ev, eu);
      const cov = smoothstep(coveCos - T.cove.soft, coveCos + T.cove.soft, Math.cos(th - coveA));
      run = lerp(run, T.cove.ramp / unitU, cov);
    }
    const step = 1 - smoothstep(1 - run, 1, d);
    const lvl =
      S.level * TOP + 1 + (T as NonNullable<typeof T>).ripple * noise.fbm(u * 4, v * 4, 2);
    out[0] = lvl * step - 1;
    out[1] = d < 1 - run ? 1 : d > 1 ? 0 : 1 - (d - (1 - run)) / run;
  };
  const sh: [number, number] = [0, 0];
  const stackAt = (lx: number, lz: number): number => {
    warpAt(noise, lx, lz, w);
    const d = ss * Math.hypot(lx + sx + w[0] * 0.1, lz / 1.12 + w[1] * 0.1);
    const body = smoothstep(1.0, 0.72, d);
    const dome = 1 + 0.07 * (1 - Math.min(1, d * d)) + 0.03 * noise.fbm(lx * 3, lz * 3, 2);
    return 26 * body * dome - 1;
  };
  const sample = (x: number, z: number): number => {
    fr.toLocal(x, z, q);
    const lx = q[0];
    const lz = q[1];
    let h = stackAt(lx, lz);
    if (T) {
      const u = lx * cl + lz * sl;
      const v = -lx * sl + lz * cl;
      for (let k = 0; k < shelves.length; k++) {
        shelf(k, u, v, sh);
        h = Math.max(h, sh[0]);
      }
    } else {
      // lee landing: a low lobe the stair path will come down to
      const dl = Math.hypot((lx - landing.x) / 0.5, (lz - landing.z) / 0.42);
      h = Math.max(h, 3.8 * smoothstep(1, 0.35, dl) - 0.6);
    }
    for (const st of stacks) {
      const ds = Math.hypot(lx - st.x + w[0] * 0.05, lz - st.z + w[1] * 0.05) / st.s;
      h = Math.max(h, st.h * smoothstep(1, 0.55, ds) - 1);
    }
    return Math.max(RAW_FLOOR, h);
  };
  const tag = (x: number, z: number): number => {
    fr.toLocal(x, z, q);
    let t: number = Tag.noFill;
    const lx = q[0];
    const lz = q[1];
    if (windwardSector(lx, lz, half, WINDWARD_CLIFF.soft) > 0.5 && Math.hypot(lx, lz) > 0.55)
      t |= Tag.cliff;
    for (const st of stacks) if (Math.hypot(lx - st.x, lz - st.z) < st.s * 1.3) t |= Tag.cliff;
    if (T) {
      // the rim wall of the shelf that wins the max is a forced cliff (no beach at its foot);
      // the cove ramp is not (its run is long, the wall parameter never reaches the band)
      const u = lx * cl + lz * sl;
      const v = -lx * sl + lz * cl;
      let best = stackAt(lx, lz);
      let wall = -1;
      for (let k = 0; k < shelves.length; k++) {
        shelf(k, u, v, sh);
        if (sh[0] > best) {
          best = sh[0];
          wall = sh[1];
        }
      }
      if (wall > 0 && wall < 0.97 && best > -0.5 && !inCove(u, v)) t |= Tag.cliff;
    }
    return t;
  };
  /** Inside the landing cove sector of the last shelf (wider than the ramp, so the beach stays clean). */
  const inCove = (u: number, v: number): boolean => {
    if (!T) return false;
    const S = shelves[last];
    const th = Math.atan2(v / S.r[1], (u - S.c) / S.r[0]);
    return Math.cos(th - coveA) > coveCos - T.cove.soft;
  };
  const anchors: IslandData['anchors'] = {};
  const topW = fr.toWorld(top.x, top.z);
  anchors.lighthouse = { x: topW.x, z: topW.z, rotY: windDir + Math.PI };
  const axisW = (u: number, v: number): { x: number; z: number } =>
    fr.toWorld(u * cl - v * sl, u * sl + v * cl);
  if (T) {
    const S = shelves[last];
    const lw = axisW(S.c + S.r[0] * 0.78 * Math.cos(coveA), S.r[1] * 0.78 * Math.sin(coveA));
    anchors.landing = { x: lw.x, z: lw.z, rotY: windDir + lean };
    shelves.forEach((S, k) => {
      const p = axisW(S.mid, 0);
      anchors[`ledge${k}`] = { x: p.x, z: p.z, rotY: windDir + lean };
    });
  } else {
    const lw = fr.toWorld(landing.x, landing.z);
    anchors.landing = { x: lw.x, z: lw.z, rotY: windDir };
  }
  stacks.forEach((st, k) => {
    const sw = fr.toWorld(st.x, st.z);
    anchors[`stack${k}`] = { x: sw.x, z: sw.z, rotY: 0 };
  });
  return { sample, tag, anchors };
};

/**
 * Millbrook: rolling 6–8 u plateau, 2–3 gentle knolls (windmills), a shallow
 * pond dip at +0.5 u, and a patchwork of rectangular field cells.
 */
const millbrook: ProfileFactory = ({ island, rng, noise, windDir }) => {
  const fr = frame(island, windDir);
  const r = island.radius;
  const knolls: { x: number; z: number }[] = [];
  const nKnolls = rng.int(2, 3);
  for (let tries = 0; knolls.length < nKnolls && tries < 80; tries++) {
    const a = rng.range(0, 2 * Math.PI);
    const dist = rng.range(0.2, 0.5);
    const k = { x: Math.cos(a) * dist, z: Math.sin(a) * dist };
    if (knolls.some((o) => Math.hypot(o.x - k.x, o.z - k.z) < 0.42)) continue;
    knolls.push(k);
  }
  let pond = { x: 0, z: 0 };
  for (let tries = 0; tries < 80; tries++) {
    const a = rng.range(0, 2 * Math.PI);
    const dist = rng.range(0.15, 0.45);
    pond = { x: Math.cos(a) * dist, z: Math.sin(a) * dist };
    if (knolls.every((o) => Math.hypot(o.x - pond.x, o.z - pond.z) > 0.32)) break;
  }
  const pondR = 6 / r;
  const fieldAngle = rng.range(0, Math.PI);
  const fieldSeed = rng.nextU32();
  const fc = Math.cos(fieldAngle);
  const fs = Math.sin(fieldAngle);
  const q: [number, number] = [0, 0];
  const w: [number, number] = [0, 0];
  const plateauMask = (lx: number, lz: number): number => {
    warpAt(noise, lx, lz, w);
    return radialMask(Math.hypot(lx / 1.08 + w[0] * 0.25, lz * 1.04 + w[1] * 0.25));
  };
  const sample = (x: number, z: number): number => {
    fr.toLocal(x, z, q);
    const lx = q[0];
    const lz = q[1];
    const mask = plateauMask(lx, lz);
    const roll = noise.fbm(lx * 1.6 + 7.1, lz * 1.6 - 2.3, 3);
    let h = (6 + 0.6 * roll) * smoothstep(0.03, 0.55, mask);
    for (const k of knolls) h += 1.9 * gauss2(lx - k.x, lz - k.z, 0.2) * smoothstep(0.3, 0.7, mask);
    const dp = Math.hypot(lx - pond.x, lz - pond.z) / pondR;
    h = lerp(h, 0.9, smoothstep(1.6, 0.9, dp));
    return Math.max(RAW_FLOOR, h - COAST_LEVEL);
  };
  const [cu, cv] = PATCHWORK.cell;
  const cellKind = (U: number, V: number): number => {
    const t = hashInts(fieldSeed, U, V) / 4294967296;
    return t < PATCHWORK.field
      ? Tag.field
      : t < PATCHWORK.field + PATCHWORK.meadow
        ? Tag.meadow
        : 0;
  };
  // Patch colours: row-major greedy over the cells covering the island bounds; a field
  // never shares a hue with its 8 neighbours already coloured (left, up row), the least
  // used hue on the plateau wins, the cell hash breaks ties.
  let U0 = Infinity;
  let U1 = -Infinity;
  let V0 = Infinity;
  let V1 = -Infinity;
  for (const [x, z] of [
    [island.minX, island.minZ],
    [island.maxX, island.minZ],
    [island.minX, island.maxZ],
    [island.maxX, island.maxZ],
  ]) {
    const u = (x * fc + z * fs) / cu;
    const v = (-x * fs + z * fc) / cv;
    U0 = Math.min(U0, Math.floor(u));
    U1 = Math.max(U1, Math.floor(u));
    V0 = Math.min(V0, Math.floor(v));
    V1 = Math.max(V1, Math.floor(v));
  }
  const nu = U1 - U0 + 1;
  const colorGrid = new Uint8Array(nu * (V1 - V0 + 1));
  const used = new Array<number>(PATCHWORK.colors).fill(0);
  const fields: Omit<FieldPatchData, 'islandId'>[] = [];
  for (let V = V0; V <= V1; V++)
    for (let U = U0; U <= U1; U++) {
      if (cellKind(U, V) !== Tag.field) continue;
      const taken = new Set<number>();
      for (const [du, dv] of [
        [-1, 0],
        [-1, -1],
        [0, -1],
        [1, -1],
      ]) {
        const a = U + du - U0;
        const b = V + dv - V0;
        if (a >= 0 && a < nu && b >= 0) taken.add(colorGrid[b * nu + a]);
      }
      let best = -1;
      for (let c = 0; c < PATCHWORK.colors; c++) {
        if (taken.has(c + 1)) continue;
        if (
          best < 0 ||
          used[c] < used[best] ||
          (used[c] === used[best] && hashInts(fieldSeed, U, V, c) < hashInts(fieldSeed, U, V, best))
        )
          best = c;
      }
      colorGrid[(V - V0) * nu + U - U0] = best + 1;
      const uc = (U + 0.5) * cu;
      const vc = (V + 0.5) * cv;
      const x = uc * fc - vc * fs;
      const z = uc * fs + vc * fc;
      fr.toLocal(x, z, q);
      if (plateauMask(q[0], q[1]) < PATCHWORK.plateauMask) continue;
      used[best]++;
      fields.push({ x, z, rotY: fieldAngle, w: cv, d: cu, color: best });
    }
  const tag = (x: number, z: number): number => {
    fr.toLocal(x, z, q);
    const lx = q[0];
    const lz = q[1];
    if (Math.hypot(lx - pond.x, lz - pond.z) / pondR < 1.3) return Tag.pond;
    if (plateauMask(lx, lz) < PATCHWORK.plateauMask) return 0;
    return cellKind(Math.floor((x * fc + z * fs) / cu), Math.floor((-x * fs + z * fc) / cv));
  };
  const fieldColor = (x: number, z: number): number => {
    const a = Math.floor((x * fc + z * fs) / cu) - U0;
    const b = Math.floor((-x * fs + z * fc) / cv) - V0;
    return a >= 0 && a < nu && b >= 0 && b <= V1 - V0 ? colorGrid[b * nu + a] : 0;
  };
  const anchors: IslandData['anchors'] = {};
  knolls.forEach((k, i) => {
    const kw = fr.toWorld(k.x, k.z);
    anchors[`knoll${i}`] = { x: kw.x, z: kw.z, rotY: windDir + Math.PI };
  });
  const pw = fr.toWorld(pond.x, pond.z);
  anchors.pond = { x: pw.x, z: pw.z, rotY: 0 };
  return { sample, tag, anchors, fields, fieldColor };
};

/**
 * Emberpeak: 35 u concave cone with an 8 u crater (floor ≈ 28 u), a notch
 * cut through the rim on one side, and a flat hot-spring terrace at ≈ 6 u
 * on the lee side. Only the crater rim and notch walls are cliff.
 */
const emberpeak: ProfileFactory = ({ island, rng, noise, windDir }) => {
  const fr = frame(island, windDir);
  const r = island.radius;
  const cr = 8 / r;
  const rimH = 36;
  const floorH = 28.5;
  const notchA = rng.range(-2.2, 2.2) + Math.PI; // never straight at the lee spring
  const spring = { x: rng.range(0.7, 0.78), z: rng.range(-0.25, 0.25) };
  const springR = 8 / r;
  const springH = 6.6;
  // TASK-405 shelves (drawn after the legacy rolls): on the side away from the spring
  const side = spring.z >= 0 ? -1 : 1;
  const shelves = (ARCHETYPES.emberpeak.shelves ?? []).flatMap((S) => {
    const a = side * rng.range(S.angle[0], S.angle[1]) * (Math.PI / 180);
    const base = { ...S, a, c: Math.cos(a), s: Math.sin(a) };
    return [base, ...(S.steps ?? []).map((t) => ({ ...base, ...t, warp: S.warp }))];
  });
  /** Raw shelf value (> 0 = land), level at `h` inside its rounded rectangle. */
  const shelfAt = (lx: number, lz: number): number => {
    let best = RAW_FLOOR;
    for (const S of shelves) {
      const u = (lx * S.c + lz * S.s - S.d) / S.radial;
      const v = (-lx * S.s + lz * S.c) / S.tangential;
      if (Math.abs(u) > 1.6 || Math.abs(v) > 1.6) continue;
      const e =
        Math.cbrt(Math.abs(u) ** 3 + Math.abs(v) ** 3) +
        S.warp * noise.fbm(lx * 4.1 + 13.7, lz * 4.1 - 8.9, 2);
      best = Math.max(best, smoothstep(1, 0.82, e) * (S.h + COAST_LEVEL + 0.8) - 0.8);
    }
    return best;
  };
  const q: [number, number] = [0, 0];
  const w: [number, number] = [0, 0];
  const sample = (x: number, z: number): number => {
    fr.toLocal(x, z, q);
    const lx = q[0];
    const lz = q[1];
    warpAt(noise, lx, lz, w);
    const wf = smoothstep(0.2, 0.7, Math.hypot(lx, lz)); // keep the summit round
    const d = Math.hypot(lx + w[0] * 0.2 * wf, lz + w[1] * 0.2 * wf);
    let h: number;
    if (d >= cr) {
      h = rimH * Math.pow(Math.max(0, (1 - d) / (1 - cr)), 1.35);
    } else {
      h = floorH + (rimH - floorH) * smoothstep(0.45, 1, d / cr);
    }
    // flank gullies + roughness
    const flank = smoothstep(1, 0.4, d) * smoothstep(cr, cr * 2.5, d);
    h +=
      (1.4 * noise.fbm(lx * 3.2, lz * 3.2, 3) - 0.9 * noise.ridged(lx * 2.1 + 4, lz * 2.1, 2)) *
      flank;
    // notch through the rim
    const da = angDiff(angleOf(lx, lz), notchA);
    h -= 10 * Math.exp(-(((da * d) / 0.07) ** 2)) * smoothstep(0.62, cr, d);
    // hot-spring terrace (lee)
    const ds = Math.hypot(lx - spring.x, lz - spring.z) / springR;
    h = lerp(h, springH, smoothstep(1.5, 0.8, ds) * smoothstep(0.5, 2, h));
    // foot shelves: level aprons where the cone is lower, a soft fillet where they meet
    if (shelves.length > 0) {
      const sv = shelfAt(lx, lz) + COAST_LEVEL;
      if (sv > 0) h = h > 0 ? smax(h, sv, 0.8) : Math.max(h, sv);
    }
    return Math.max(RAW_FLOOR, h - COAST_LEVEL);
  };
  const tag = (x: number, z: number): number => {
    fr.toLocal(x, z, q);
    const lx = q[0];
    const lz = q[1];
    const d = Math.hypot(lx, lz);
    let t = 0;
    if (d < cr * 0.85) t |= Tag.crater;
    if (d > cr * 0.6 && d < cr * 1.5) t |= Tag.cliff;
    const da = angDiff(angleOf(lx, lz), notchA) * d;
    if (d < 0.55 && d > cr && da > 0.03 && da < 0.12) t |= Tag.cliff;
    return t;
  };
  const anchors: IslandData['anchors'] = {};
  const cw = fr.toWorld(0, 0);
  anchors.crater = { x: cw.x, z: cw.z, rotY: 0 };
  const nw = fr.toWorld(Math.cos(notchA) * cr * 1.6, Math.sin(notchA) * cr * 1.6);
  anchors.notch = { x: nw.x, z: nw.z, rotY: windDir + notchA };
  const sw = fr.toWorld(spring.x, spring.z);
  anchors.hotspring = { x: sw.x, z: sw.z, rotY: windDir };
  for (const S of shelves) {
    const p = fr.toWorld(S.c * S.d, S.s * S.d);
    anchors[S.key] = { x: p.x, z: p.z, rotY: windDir + S.a };
  }
  return { sample, tag, anchors };
};

/**
 * Palmlagoon → the QA Test Factory (M17b TASK-401; was the atoll ring + lagoon): a chunky
 * rounded-square plateau (superellipse, mildly warped, turned off the wind axis) whose top is
 * nearly level for the factory yard, with a gentle knoll on the windward half for the QA tower.
 * The bluff pass (islands.ts `bluff`) lifts it on earth walls and keeps a leeward harbour cove.
 * Anchors: `yard` (factory yard centre), `tower` (knoll top), `harbour` (lee coast).
 */
const palmlagoon: ProfileFactory = ({ island, rng, noise, windDir }) => {
  const fr = frame(island, windDir);
  const rot = rng.range(-0.5, 0.5);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const yard = { x: rng.range(0.08, 0.22), z: rng.range(-0.15, 0.15) };
  const towerA = Math.PI + rng.range(-0.55, 0.55);
  const tower = { x: Math.cos(towerA) * 0.42, z: Math.sin(towerA) * 0.42 };
  const q: [number, number] = [0, 0];
  const w: [number, number] = [0, 0];
  const sample = (x: number, z: number): number => {
    fr.toLocal(x, z, q);
    const lx = q[0];
    const lz = q[1];
    warpAt(noise, lx, lz, w);
    const u = Math.abs(lx * c + lz * s + w[0] * 0.07);
    const v = Math.abs((-lx * s + lz * c + w[1] * 0.07) / 0.9);
    const d = Math.cbrt(u * u * u + v * v * v);
    const body = smoothstep(1.0, 0.8, d);
    const knoll = gauss2(lx - tower.x, lz - tower.z, 0.3);
    const e = 2.2 + 0.3 * noise.fbm(lx * 2.2 + 5.1, lz * 2.2 - 3.3, 2) + 1.3 * knoll;
    return Math.max(RAW_FLOOR, body * e - COAST_LEVEL);
  };
  const yw = fr.toWorld(yard.x, yard.z);
  const tw = fr.toWorld(tower.x, tower.z);
  const hw = fr.toWorld(0.9, 0);
  return {
    sample,
    anchors: {
      yard: { x: yw.x, z: yw.z, rotY: windDir },
      tower: { x: tw.x, z: tw.z, rotY: windDir + towerA },
      harbour: { x: hw.x, z: hw.z, rotY: windDir },
    },
  };
};

/**
 * Mossgrove: a 20 u green dome, a flat 18 u-wide shoulder near the top for
 * the giant tree, and a stream carved from the summit to a lee beach.
 */
const mossgrove: ProfileFactory = ({ island, rng, noise, windDir }) => {
  const fr = frame(island, windDir);
  const r = island.radius;
  const treeA = rng.range(0.6, 1.4) * (rng.chance(0.5) ? 1 : -1) + Math.PI;
  const tree = { x: Math.cos(treeA) * 0.28, z: Math.sin(treeA) * 0.28 };
  const treeR = 9 / r;
  const dome = (d: number): number => 20 * Math.max(0, 1 - d * d) ** 2;
  const treeH = dome(0.28) + 2;
  // stream polyline in local space: summit → lee coast, meandering
  const src = { x: rng.range(0.02, 0.1), z: -tree.z * 0.6 };
  const phase = rng.range(0, 2 * Math.PI);
  const amp = rng.range(0.06, 0.1);
  const bend = rng.range(-0.25, 0.25);
  const local: { x: number; z: number }[] = [];
  for (let k = 0; k <= 24; k++) {
    const t = k / 24;
    local.push({
      x: src.x + t * (1.05 - src.x),
      z: src.z + bend * t * t + amp * Math.sin(t * 7 + phase) * t,
    });
  }
  const streamW = 2.4 / r;
  const q: [number, number] = [0, 0];
  const w: [number, number] = [0, 0];
  const segDist = (lx: number, lz: number): number => {
    let best = Infinity;
    for (let k = 0; k < local.length - 1; k++) {
      const a = local[k];
      const b = local[k + 1];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const t = clamp01(((lx - a.x) * vx + (lz - a.z) * vz) / (vx * vx + vz * vz));
      best = Math.min(best, Math.hypot(lx - a.x - vx * t, lz - a.z - vz * t));
    }
    return best;
  };
  const sample = (x: number, z: number): number => {
    fr.toLocal(x, z, q);
    const lx = q[0];
    const lz = q[1];
    warpAt(noise, lx, lz, w);
    const d = Math.hypot(lx + w[0] * 0.22, lz + w[1] * 0.22);
    let h = dome(d) * (1 + 0.08 * noise.fbm(lx * 2.4, lz * 2.4, 3));
    // giant-tree shoulder: bump then flatten to a level 18 u-wide spot
    const dt = Math.hypot(lx - tree.x, lz - tree.z) / treeR;
    h = lerp(h, treeH, smoothstep(2.3, 0.9, dt));
    // stream carve (≈ 1 u deep, fades out on the beach)
    if (h > 0.5) {
      const sd = segDist(lx, lz) / streamW;
      if (sd < 3) h -= 1.1 * Math.exp(-sd * sd) * smoothstep(0.8, 3, h);
    }
    return Math.max(RAW_FLOOR, h - COAST_LEVEL);
  };
  const toW = (p: { x: number; z: number }): { x: number; z: number } => fr.toWorld(p.x, p.z);
  const tw = toW(tree);
  const sw = toW(local[0]);
  const mouth = toW(local[local.length - 1]);
  return {
    sample,
    streams: [local.map(toW)],
    anchors: {
      giantTree: { x: tw.x, z: tw.z, rotY: windDir },
      streamSource: { x: sw.x, z: sw.z, rotY: 0 },
      streamMouth: { x: mouth.x, z: mouth.z, rotY: windDir },
    },
  };
};

/**
 * Lonely Palm → Research "Observatory University" (TASK-402b; was the TASK-400 crater): a lawn
 * plateau on earth walls (the bluff pass) with a broad campus terrace and a summit plateau for
 * the observatory, joined by soft grassy risers, plus two promontories (the big radio dish's
 * spur behind the summit, the research base's headland). The layout is mirrored per island
 * (`m`) and turned a little, so seeds differ. Anchors (world u): `summit`, `quad` (terrace
 * centre), `garden`, `glasshouse`, `spur`, `headland`, `harbour` (lee coast).
 */
const lonelypalm: ProfileFactory = ({ island, rng, noise, windDir }) => {
  const C = ARCHETYPES.lonelypalm.campusHill as CampusHillParams;
  const fr = frame(island, windDir);
  const m = rng.chance(0.5) ? 1 : -1;
  const rot = rng.range(-C.turn, C.turn);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const jit = (): number => rng.range(-C.jitter, C.jitter);
  // a layout point (local, mirrored + turned) → island-local
  const lay = (x: number, z: number): { x: number; z: number } => ({
    x: x * c - z * m * s,
    z: x * s + z * m * c,
  });
  const T = { ...lay(C.terrace.x + jit(), C.terrace.z + jit()), r: C.terrace.r, h: C.terrace.h };
  const S = { ...lay(C.summit.x + jit(), C.summit.z + jit()), r: C.summit.r, h: C.summit.h };
  const DEG = Math.PI / 180;
  const spurA =
    Math.atan2(Math.sin(C.spur.angleDeg * DEG) * m, Math.cos(C.spur.angleDeg * DEG)) + rot;
  const headA =
    Math.atan2(Math.sin(C.headland.angleDeg * DEG) * m, Math.cos(C.headland.angleDeg * DEG)) + rot;
  const plateau = (dx: number, dz: number, r: number): number =>
    smoothstep(r + C.soft, r - C.soft, Math.hypot(dx, dz));
  const q: [number, number] = [0, 0];
  const sample = (x: number, z: number): number => {
    fr.toLocal(x, z, q);
    const lx = q[0];
    const lz = q[1];
    const a = angleOf(lx, lz);
    const ds = angDiff(a, spurA) / (C.spur.widthDeg * DEG);
    const dh = angDiff(a, headA) / (C.headland.widthDeg * DEG);
    const reach = C.coast + C.spur.len * Math.exp(-ds * ds) + C.headland.len * Math.exp(-dh * dh);
    const d = Math.hypot(lx, lz) + C.warp * noise.fbm(lx * 2.1 + 4.3, lz * 2.1 - 7.9, 2);
    const body = smoothstep(reach + C.coastSoft, reach - C.coastSoft, d);
    // the terraces fade out before the rim, so the bluff lip stays a level lawn edge
    const rim = smoothstep(reach - C.rimFade[0], reach - C.rimFade[1], d);
    const lift =
      rim *
      Math.max(T.h * plateau(lx - T.x, lz - T.z, T.r), S.h * plateau(lx - S.x, lz - S.z, S.r));
    const lawn = C.lawn * (1 + C.lawnNoise * noise.fbm(lx * 2.6 - 1.7, lz * 2.6 + 6.1, 3));
    return Math.max(RAW_FLOOR, body * (lawn + lift) - 0.5 * C.lawn);
  };
  const w = (p: { x: number; z: number }) => fr.toWorld(p.x, p.z);
  const at = (p: { x: number; z: number }, rotY = windDir) => ({ ...w(p), rotY });
  const tip = (a: number, r: number) => w({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  return {
    sample,
    anchors: {
      summit: at(S),
      quad: at(T),
      garden: at(lay(C.garden.x, C.garden.z)),
      glasshouse: at(lay(C.glasshouse.x, C.glasshouse.z)),
      spur: { ...tip(spurA, C.coast - 0.08), rotY: windDir + spurA },
      headland: { ...tip(headA, C.coast - 0.06), rotY: windDir + headA },
      harbour: at({ x: C.coast, z: 0 }),
    },
  };
};

/** Profile table keyed by archetype. */
export const PROFILES: Readonly<Record<ArchetypeId, ProfileFactory>> = {
  hearthholm,
  beaconrock,
  millbrook,
  emberpeak,
  palmlagoon,
  mossgrove,
  lonelypalm,
};
