/**
 * M20 TASK-465 prop defs and dimensions: HQ "Seven Gates Crossroads" (cultureGate, goodsStall,
 * semaphoreTower, mailLine) and Design "Glass Conservatory" (conservatory, glasshouse, glassBridge,
 * prismArch, stainedWindmill). Geometry: geo/themes/culture-m20-hq.ts and culture-m20-design.ts;
 * ledgers: content/cultures/hq.ts and design.ts (new entries at the END, in this order).
 *
 * Appended at the very END of PROP_DEFS (content/props.ts), so no existing defId shifts (hash pins).
 * This file is pure data (no three import): worldgen and life read the numbers from here.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, windy } = PropFlag;

export const HQ_M20_PROP_DEFS: readonly PropDef[] = [
  // variant = THEME_IDS index (the gate wears that culture's accent, pennant cut and glyph)
  { id: 'cultureGate', geo: 'cultureGate', tier: 2, variants: 7, footprint: 2.3, flags: windy },
  // variant = THEME_IDS index (that culture's goods under an accent awning)
  {
    id: 'goodsStall',
    geo: 'goodsStall',
    tier: 2,
    variants: 7,
    footprint: 1.3,
    flags: grounded | windy,
  },
  {
    id: 'semaphoreTower',
    geo: 'semaphoreTower',
    tier: 2,
    variants: 1,
    footprint: 1.0,
    flags: grounded,
  },
  // variant 0 = high end (sorting yard), 1 = low end (pier)
  { id: 'mailLine', geo: 'mailLine', tier: 2, variants: 2, footprint: 0.9, flags: grounded },
];

export const DESIGN_M20_PROP_DEFS: readonly PropDef[] = [
  // the island's second tier-1 def (cultureCapOverride.design.tier1 = 2); effective tier 0 by size
  { id: 'conservatory', geo: 'conservatory', tier: 1, variants: 1, footprint: 8, flags: grounded },
  // variant = pane tint (CONSERVATORY_HUES order below)
  { id: 'glasshouse', geo: 'glasshouse', tier: 2, variants: 5, footprint: 2.4, flags: grounded },
  // spans a stream: no contact blob (the water is under it)
  { id: 'glassBridge', geo: 'glassBridge', tier: 2, variants: 1, footprint: 1.1, flags: 0 },
  { id: 'prismArch', geo: 'prismArch', tier: 2, variants: 1, footprint: 0.8, flags: grounded },
  {
    id: 'stainedWindmill',
    geo: 'stainedWindmill',
    tier: 2,
    variants: 1,
    footprint: 1.8,
    flags: grounded,
  },
];

/** The ids of this task (the gallery showcase `?gallery=1&ids=m20`, the geometry test). */
export const M20_PROP_IDS: readonly string[] = [
  ...HQ_M20_PROP_DEFS.map((d) => d.id),
  ...DESIGN_M20_PROP_DEFS.map((d) => d.id),
];

/* ----------------------------------------- HQ ----------------------------------------- */

/**
 * cultureGate frame: local x across the street, the passage runs along z (front = +z, the face
 * that looks down the street toward the compass plaza). Posts stand at x = ±postX.
 */
export const CULTURE_GATE = {
  /** Clear walking width between the posts (u). */
  clearWidth: 3.7,
  postX: 1.95,
  postR: 0.3,
  /** Clear height under the lintel and under the hanging lamp (u). */
  clearHeight: 2.2,
  lampClear: 1.75,
  height: 2.87,
} as const;

/** goodsStall: counter faces +z (the customers); plan 2.4 x 1.5, awning edge at +z. */
export const GOODS_STALL = { width: 2.4, depth: 1.5, height: 2.6 } as const;

/**
 * semaphoreTower: lattice tower, two signal arms on a cross bar at the top. The arms are NOT in the
 * tower mesh (TASK-469): the culture mover draws them (render/culture-movers.ts, `PART.arm`) from
 * `userData.hooks.arms[i] = { pivot, axis, restAngle, length }`. They rest at `restDeg` from +y and
 * turn about the z axis through `pivot` (the arm plane faces +z; a positive angle turns
 * counter-clockwise seen from +z, i.e. from +y toward -x).
 */
export const SEMAPHORE = {
  height: 8.8,
  armLength: 1.7,
  /** Pivot x offsets of the left / right arm, y of the cross bar (u). */
  pivotX: [-1.0, 1.0] as const,
  pivotY: 7.7,
  pivotZ: 0.42,
  /** Built angle of the [left, right] arm, degrees from +y (left +, right -: a "V"). */
  restDeg: [38, -38] as const,
} as const;

/**
 * mailLine pylon + cable. Worldgen: stand a pylon at each end (variant 0 high end, 1 low end) with
 * rotY so that its local +z faces the other pylon; the cable runs between the two `anchor` hooks
 * (`userData.hooks.cable.anchor`, local frame, scale 1): rotate it by rotY, add the pylon position.
 * Cable geometry: `buildMailCable(rng, a, b, lod)` (geo/themes/culture-m20-hq.ts); the sag and the
 * sack curve: `mailCableSag` / `mailCablePoint` below (sacks slide on that curve).
 */
export const MAIL_LINE = {
  /** Pylon height per variant. */
  height: [4.4, 3.6] as const,
  /** Local anchor of the cable per variant (on the front face, below the head). */
  anchor: [
    [0, 4.05, 0.62],
    [0, 3.25, 0.62],
  ] as const,
  cableRadius: 0.045,
  /** Sag = span * sagFrac, clamped to [sagMin, sagMax] (u). */
  sagFrac: 0.03,
  sagMin: 0.35,
  sagMax: 1.6,
  /** A coral flag hangs from the cable every this many u (LOD0). */
  flagEvery: 5,
} as const;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * World position of a mailLine pylon's cable anchor (`MAIL_LINE.anchor[variant]`) for a pylon at
 * `p` (ground pivot) with worldgen yaw `rotY`: local +z = (cos rotY, sin rotY), local +x =
 * (sin rotY, -cos rotY) (the fixture yaw convention of render/props/settlement-props.ts).
 */
export function mailAnchorWorld(variant: number, p: Vec3Like, rotY: number): Vec3Like {
  const [ax, ay, az] = MAIL_LINE.anchor[variant % 2];
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return { x: p.x + ax * s + az * c, y: p.y + ay, z: p.z - ax * c + az * s };
}

/** Sag (u) of a mail cable of horizontal-ish length `len`. */
export function mailCableSag(len: number): number {
  const M = MAIL_LINE;
  return Math.min(M.sagMax, Math.max(M.sagMin, len * M.sagFrac));
}

/** Point of the mail cable at t in [0, 1] from `a` to `b` (the same parabola the mesh uses). */
export function mailCablePoint(a: Vec3Like, b: Vec3Like, t: number): Vec3Like {
  const sag = mailCableSag(Math.hypot(b.x - a.x, b.z - a.z, b.y - a.y));
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t),
    z: a.z + (b.z - a.z) * t,
  };
}

/* ---------------------------------------- Design ---------------------------------------- */

/**
 * conservatory: octagonal drum (circumradius `radius`), 4 cardinal faces are open bays (doors, +z
 * is bay 0), the other 4 and the roof are glazed. Local origin = plan centre on the ground.
 */
export const CONSERVATORY = {
  radius: 7.6,
  plinthH: 0.45,
  wallH: 3.6,
  ringY: 5.7,
  ringR: 3.9,
  apexY: 8.9,
  height: 10.5,
  /** Cardinal bay faces: local angle of each (rad from +z, clockwise from above), width (u). */
  bayWidth: 3.2,
} as const;

/** glasshouse pane tints, variant order (keys of DESIGN_CULTURE_KIT.glass). */
export const GLASSHOUSE_HUES = ['sky', 'mint', 'pink', 'violet', 'amber'] as const;
/** glasshouse plan (u): ridge along z (length), the open gable end (the door) faces +z. */
export const GLASSHOUSE = { length: 4, width: 2.5, wallH: 1.45, height: 2.6 } as const;

/**
 * glassBridge: the deck runs along local x (ends at x = ±(length / 2)); width across z. `span` is
 * the clear opening between the two stone end pads, `endY` the deck-top height at the pad ends and
 * `midY` at mid-span (a slight arch). Worldgen: orient local +x ACROSS the stream (rotY), pivot on
 * the bank line mid-stream; the pads (`pad` u deep each) sit on the banks.
 */
export const GLASS_BRIDGE = {
  span: 7,
  width: 2.2,
  pad: 0.8,
  length: 8.6,
  endY: 0.42,
  midY: 0.95,
  railH: 0.95,
} as const;

/**
 * Deck-top height above the bridge pivot at local x along the deck (pads flat at `endY`, a parabolic
 * arch over the span up to `midY`). Shared by the geometry and by the walk graph (TASK-469: bots
 * cross on the deck, `hooks.walk`).
 */
export function glassBridgeDeckY(x: number): number {
  const t = Math.min(1, Math.abs(x) / (GLASS_BRIDGE.span / 2));
  return GLASS_BRIDGE.endY + (GLASS_BRIDGE.midY - GLASS_BRIDGE.endY) * (1 - t * t);
}

/**
 * prismArch: the path walks through along local z. The prism on the crown throws the coloured
 * light pool (TASK-468): `userData.hooks.pool` = { at, radius, source } in the local frame; `at` is
 * the pool centre on the ground, `source` the prism centre.
 */
export const PRISM_ARCH = {
  postX: 1.0,
  clearHeight: 1.1,
  crownY: 2.1,
  prismH: 0.66,
  height: 2.86,
  poolRadius: 1.5,
} as const;

/** stainedWindmill: tower, cap and the 4-sail stained-glass rotor (aSpin, hub + z axis). */
export const STAINED_WINDMILL = {
  towerH: 3.3,
  baseR: 1.05,
  topR: 0.7,
  hubY: 3.6,
  hubZ: 1.15,
  sailLength: 2.2,
  height: 5.8,
} as const;
