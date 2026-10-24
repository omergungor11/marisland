/**
 * Rim walkway (WORLD_PLAN §3.5 shared primitive, TASK-480; QA Q6 first, Coding C18 / DevOps D12 /
 * HQ H16 / Design D10 / Research R2 later): a painted walk a few u inland of a bluff island's
 * plateau lip, with posts (and rails) between the walk and the drop. Island-agnostic: each island
 * passes its own `RimWalkwaySpec` (zone to paint = its material via the theme's `ground` table,
 * post def + variants = its post style). Engine: world/gen/rim-walkway.ts. Lengths in u.
 */
import type { ZoneId } from '../world/types.ts';

export interface RimPostStyle {
  /** Post def (PROP_DEFS id) and the variants: `variant` carries a rail to the next post, `end` closes a run. */
  def: string;
  variant: number;
  end: number;
  /** Arc length between posts (= the rail length of the `variant` geometry). */
  spacing: number;
  /** Post line this far inland of the lip (between the drop and the walk). */
  inset: number;
}

export interface RimWalkwaySpec {
  /** Zone painted under the walk; the island theme's `ground[zone]` is its material. */
  zone: ZoneId;
  /** Walk centreline this far inland of the lip; painted ± `halfWidth` around it. */
  inset: number;
  halfWidth: number;
  /**
   * Lip detection over shore-distance bands of `band` u (island land only, ≤ `maxSdf` inland): the
   * lip is the first band, walking inland, whose mean grid slope drops below `flat` after a band
   * steeper than `steep` (the bluff face). No steep band → no bluff → no walkway.
   */
  lip: { band: number; steep: number; flat: number; maxSdf: number };
  /**
   * A sample is on the rim only where the ground seaward at the bluff foot (shore distance ≈
   * `drop.shore`, straight down the normal) lies ≥ `drop.min` u lower (the cove / beaches fail).
   */
  drop: { shore: number; min: number };
  /** Walk and posts only on samples this flat (grid slope) and at least this high (u). */
  maxSlope: number;
  minY: number;
  /** Zones the paint may replace (never cliff / rock: the bluff faces stay Zone.cliff). */
  paintOver: readonly number[];
  /** Runs shorter than this (u) are dropped (no stray stubs). */
  minRun: number;
  /** Posts and seats keep this clear of obstacle shapes and of footpath samples (gaps at paths). */
  shapeGap: number;
  pathGap: number;
  posts: RimPostStyle | null;
}

/**
 * Rim post looks (geo/themes/rim.ts `rimPost`): style k = variants 2k (post + rails to the next
 * post, `rail` u along local +x) and 2k + 1 (end post, no rails). A new island style appends a row
 * (existing variant indices never shift). `lamp` = an emissive cap (in the island's lamp set).
 */
export interface RimPostLook {
  /** Post bands bottom → top (cycled), band height, post half-width, post height. */
  bands: readonly string[];
  band: number;
  half: number;
  height: number;
  /** Foot block, cap, lamp (null = none). */
  foot: string;
  cap: string;
  lamp: string | null;
  /** Rails: heights above the ground, colour, half-thickness, length (= the post spacing). */
  railY: readonly number[];
  rail: string;
  railR: number;
  railLen: number;
}

export const RIM_POST_LOOKS: readonly RimPostLook[] = [
  // 0 · QA hazard (Q6): yellow-black banded posts, a mint rail, green status lamp caps
  {
    bands: ['#F5C84C', '#4F4A5E'],
    band: 0.2,
    half: 0.09,
    height: 1.2,
    foot: '#A9AEB8',
    cap: '#FAFAF5',
    lamp: '#3FBF8F',
    railY: [1.0, 0.55],
    rail: '#7FD8B3',
    railR: 0.045,
    railLen: 3,
  },
  // 1 · Coding boardwalk (C18, TASK-484): plain timber posts, a darker cap, two rope rails, no lamp
  {
    bands: ['#B4885A', '#A97D50'],
    band: 0.35,
    half: 0.08,
    height: 1.0,
    foot: '#8E6A45',
    cap: '#7A5636',
    lamp: null,
    railY: [0.85, 0.45],
    rail: '#D9C29A',
    railR: 0.035,
    railLen: 3,
  },
];
