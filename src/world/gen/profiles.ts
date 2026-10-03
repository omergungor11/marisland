import type { Noise } from '../../core/noise.ts';
import type { Rng } from '../../core/rng.ts';
import { clamp01, smax, smoothstep } from '../../core/math/index.ts';
import type { ArchetypeId, IslandData } from '../types.ts';
import { RAW_FLOOR } from './params.ts';

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

/** Placeholder for archetypes not yet shaped (TASK-112): warped dome. */
const dome: ProfileFactory = ({ island, noise, windDir }) => {
  const fr = frame(island, windDir);
  const q: [number, number] = [0, 0];
  const w: [number, number] = [0, 0];
  return {
    sample(x, z) {
      fr.toLocal(x, z, q);
      warpAt(noise, q[0], q[1], w);
      const d = Math.hypot(q[0] + w[0] * 0.25, q[1] + w[1] * 0.25);
      const e = 4 * (0.3 + 0.7 * elevation(noise, q[0], q[1])) * (1 - 0.5 * d * d);
      return Math.max(RAW_FLOOR, radialMask(d) * e - COAST_LEVEL);
    },
    anchors: {},
  };
};

/** Profile table keyed by archetype (complete so M2 only swaps entries). */
export const PROFILES: Readonly<Record<ArchetypeId, ProfileFactory>> = {
  hearthholm,
  beaconrock: dome,
  millbrook: dome,
  emberpeak: dome,
  palmlagoon: dome,
  mossgrove: dome,
  lonelypalm: dome,
};
