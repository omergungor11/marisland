/**
 * Prop definitions (ART_BIBLE §5): what each prop *is* — geometry builder id,
 * first tier, variants, flags. Placement rules live with worldgen in
 * content/placement.ts (TASK-122). Index in PROP_DEFS = PropStore.defId.
 */
import { PropFlag } from '../world/prop-store.ts';
import { PROP_DEFS_BUILDINGS } from './props-buildings.ts';
import { HQ_PROP_DEFS, HQ_CULTURE_PROP_DEFS } from './props-themes/hq.ts';
import {
  CODING_CULTURE_PROP_DEFS,
  CODING_M22_PROP_DEFS,
  CODING_PROP_DEFS,
} from './props-themes/coding.ts';
import { MARKETING_CULTURE_PROP_DEFS, MARKETING_PROP_DEFS } from './props-themes/marketing.ts';
import { QA_CULTURE_PROP_DEFS, QA_PROP_DEFS } from './props-themes/qa.ts';
import { DESIGN_CULTURE_PROP_DEFS, DESIGN_PROP_DEFS } from './props-themes/design.ts';
import { DEVOPS_CULTURE_PROP_DEFS, DEVOPS_PROP_DEFS } from './props-themes/devops.ts';
import { RESEARCH_CULTURE_PROP_DEFS, RESEARCH_PROP_DEFS } from './props-themes/research.ts';
import { DESIGN_M20_PROP_DEFS, HQ_M20_PROP_DEFS } from './props-themes/m20.ts';
import { SIGNAGE_PROP_DEFS } from './props-themes/signage.ts';
import { RIM_PROP_DEFS } from './props-themes/rim.ts';
import { STAIR_PROP_DEFS } from './props-themes/stairs.ts';
import { BEACON_PROP_DEFS } from './props-themes/beacon.ts';
import { QA_PROVING_PROP_DEFS } from './props-themes/qa-proving.ts';
import { QA_CUSTOMS_PROP_DEFS } from './props-themes/qa-customs.ts';
import { HQ_MARINA_PROP_DEFS } from './props-themes/hq-marina.ts';
import { DEVOPS_M25_PROP_DEFS } from './props-themes/devops-m25.ts';
import { CODING_TUNNEL_PROP_DEFS } from './props-themes/coding-tunnel.ts';
import { DEVOPS_M26_PROP_DEFS } from './props-themes/devops-m26.ts';
import { MARKETING_M27_PROP_DEFS } from './props-themes/marketing-m27.ts';
import { RESEARCH_M28_PROP_DEFS } from './props-themes/research-m28.ts';
import { RESEARCH_M31_PROP_DEFS } from './props-themes/research-m31.ts';
import { CODING_M33_PROP_DEFS } from './props-themes/coding-m33.ts';
import { QA_COASTER_PROP_DEFS } from './props-themes/qa-coaster.ts';
import { MARKETING_MARINA_PROP_DEFS } from './props-themes/hq-horseshoe.ts';
import { MARKETING_LUNA_PROP_DEFS } from './props-themes/marketing-luna.ts';

export interface PropDef {
  id: string;
  /** Key in geo PROP_GEO. */
  geo: string;
  /** First tier at which it appears (0–3). */
  tier: 0 | 1 | 2 | 3;
  variants: number;
  /**
   * Random variant rolls (settlement decor, plaza seats) pick among the first `rollVariants` only;
   * later variants are culture pieces placed (pinned) on purpose. Default `variants`.
   */
  rollVariants?: number;
  /** Footprint radius in u (occupancy + contact blob). */
  footprint: number;
  flags: number;
  /** Distance fade (u) for the per-instance dither: [near, far]. Defaults by tier. */
  fade?: [number, number];
  /**
   * Shared LOD1 proxy: LOD1 instances group by this geometry key instead of the def's own (D-027).
   * `size`: the shell's bounds (w along local x, h, d along local z) — the batcher scales each
   * proxy instance from the proxy's own bounds to it, so far buildings keep their size.
   */
  lod1?: { geo: string; variant: number; size?: readonly [w: number, h: number, d: number] };
  /** Tier-2 office interior shell: never placeable or clusterable, shadows on high only. */
  interior?: true;
  /**
   * Drawn from T0 like a large structure (D-031) although one piece is below the size rule: a def
   * placed as a row / group that reads as one large element (TASK-493, the Design glasshouse row).
   */
  fromT0?: true;
}

const { grounded, windy, groundCover, clusterable } = PropFlag;

const VEGETATION_DEFS: readonly PropDef[] = [
  // vegetation
  {
    id: 'palm',
    geo: 'palm',
    tier: 1,
    variants: 3,
    footprint: 0.6,
    flags: grounded | windy | clusterable,
  },
  {
    id: 'roundTree',
    geo: 'roundTree',
    tier: 1,
    variants: 3,
    footprint: 0.7,
    flags: grounded | windy | clusterable,
  },
  {
    id: 'pine',
    geo: 'pine',
    tier: 1,
    variants: 3,
    footprint: 0.6,
    flags: grounded | windy | clusterable,
  },
  {
    id: 'giantMushroom',
    geo: 'giantMushroom',
    tier: 1,
    variants: 2,
    footprint: 0.8,
    flags: grounded,
  },
  { id: 'bush', geo: 'bush', tier: 2, variants: 2, footprint: 0.6, flags: grounded | windy },
  { id: 'cropRow', geo: 'cropRow', tier: 2, variants: 2, footprint: 1.0, flags: windy },
  { id: 'haybale', geo: 'haybale', tier: 2, variants: 2, footprint: 0.6, flags: grounded },
  { id: 'reeds', geo: 'reeds', tier: 3, variants: 2, footprint: 0.25, flags: windy | groundCover },
  { id: 'lilyPad', geo: 'lilyPad', tier: 3, variants: 2, footprint: 0.35, flags: groundCover },
  {
    id: 'grassTuft',
    geo: 'grassTuft',
    tier: 3,
    variants: 2,
    footprint: 0.15,
    flags: windy | groundCover,
  },
  {
    id: 'flower',
    geo: 'flower',
    tier: 3,
    variants: 2,
    footprint: 0.12,
    flags: windy | groundCover,
  },
  // coastal
  { id: 'rockCluster', geo: 'rockCluster', tier: 1, variants: 3, footprint: 1.2, flags: grounded },
  // T0 cluster proxy (not placed by rules; generated by the batcher from clusterable trees)
  { id: 'treeBlob', geo: 'treeBlob', tier: 0, variants: 3, footprint: 2, flags: 0 },
];

/**
 * Vegetation/rocks first (scatter indices stay stable), then buildings/landmarks/decor, then the
 * M14b theme structures (content/props-themes/<theme>.ts) in fixed theme order.
 */
const ALL_DEFS: readonly PropDef[] = [
  ...VEGETATION_DEFS,
  ...PROP_DEFS_BUILDINGS,
  ...HQ_PROP_DEFS,
  ...CODING_PROP_DEFS,
  ...MARKETING_PROP_DEFS,
  ...QA_PROP_DEFS,
  ...DESIGN_PROP_DEFS,
  ...DEVOPS_PROP_DEFS,
  ...RESEARCH_PROP_DEFS,
  ...SIGNAGE_PROP_DEFS,
  // M19 culture kits, appended after everything else so no existing defId shifts (hash pins)
  ...HQ_CULTURE_PROP_DEFS,
  ...CODING_CULTURE_PROP_DEFS,
  ...DEVOPS_CULTURE_PROP_DEFS,
  ...MARKETING_CULTURE_PROP_DEFS,
  ...QA_CULTURE_PROP_DEFS,
  ...DESIGN_CULTURE_PROP_DEFS,
  ...RESEARCH_CULTURE_PROP_DEFS,
  // M20 (D-057): HQ seven-gates and Design conservatory kits, again at the very end
  ...HQ_M20_PROP_DEFS,
  ...DESIGN_M20_PROP_DEFS,
  // M22 (TASK-480): the shared rim walkway post
  ...RIM_PROP_DEFS,
  // M22 (TASK-479): Coding windsock + fairy wreath
  ...CODING_M22_PROP_DEFS,
  // TASK-485: the stair flight on steep stair legs over spared faces
  ...STAIR_PROP_DEFS,
  // M23 (TASK-490): the skerry beacon
  ...BEACON_PROP_DEFS,
  // M24 (TASK-499): QA Proving Grounds drop tower, test fan, obstacle course
  ...QA_PROVING_PROP_DEFS,
  // === TASK-506 (M30): QA Customs Port scanner arch, customs yard, quarantine pontoon ===
  ...QA_CUSTOMS_PROP_DEFS,
  // M29 (TASK-505, D-085): HQ yacht marina pier + cove-mouth star fort (parallel branches append below)
  ...HQ_MARINA_PROP_DEFS,
  // ---- TASK-504 (M25 DevOps I, D-084): funicular rail + car, geyser cone, ore bucket ----
  ...DEVOPS_M25_PROP_DEFS,
  // ==== TASK-498 (M24 Coding C1, D-088): wind tunnel (tier 1) + tunnel fan ====
  ...CODING_TUNNEL_PROP_DEFS,
  // ---- TASK-509b (M26 DevOps II, D-092): ember bridge, crater deck, glass kiln, obsidian decor, breakwater ----
  ...DEVOPS_M26_PROP_DEFS,
  // ---- TASK-517 (M27 Marketing, D-096): the dive tower (the cable car, sea signs and the guyed mast are variants) ----
  ...MARKETING_M27_PROP_DEFS,
  // ---- TASK-525 (M28 Research, D-106): the sundial (the rim deck and the stair lantern are variants) ----
  ...RESEARCH_M28_PROP_DEFS,
  // ---- TASK-533 (M31 Research Tide-Lab, D-114): stilt lab (tier 1), tide gauge, sunken city kit ----
  ...RESEARCH_M31_PROP_DEFS,
  // ==== TASK-543 (M33 Coding, D-117): Bot Foundry, Drone Port, test track, Data Lake kit (self-contained block) ====
  ...CODING_M33_PROP_DEFS,
  // ==== TASK-540 (M34 QA Thrill Test Park, D-120): coaster track (tier 1) + station; the TESTED board and the cotton-candy cart are variants ====
  ...QA_COASTER_PROP_DEFS,
  // ==== TASK-660 (M52, D-170): Marketing Horseshoe Harbour kit (quayHouse, quayFurnish, quayBoat) ====
  ...MARKETING_MARINA_PROP_DEFS,
  // ==== TASK-670 (M53, D-172): Marketing sea-top fun park (lunaDeck, lunaRide, lunaCoaster, lunaGate, lunaStand, lunaDecor) ====
  ...MARKETING_LUNA_PROP_DEFS,
];

/**
 * Trees (clusterable) fade out far beyond the tier-1 range (TASK-464): the T0 species blobs take over
 * at the tier switch (380 u), so the far forests of T1 views stay visible instead of stippling out.
 */
/** T0 blob scale per canopy kind (TASK-464): a conifer blob must not out-cover the pines it stands for. */
export const BLOB_KIND_SCALE = { deciduous: 1, pine: 0.8, palm: 1, blossom: 1.5 } as const;

export const TREE_FADE: [number, number] = [500, 620];

export const PROP_DEFS: readonly PropDef[] = ALL_DEFS.map((d) =>
  (d.flags & clusterable) !== 0 && !d.fade ? { ...d, fade: TREE_FADE } : d,
);

export const PROP_DEF_INDEX: Record<string, number> = Object.fromEntries(
  PROP_DEFS.map((d, i) => [d.id, i]),
);

/**
 * Default per-tier fade distances (u) for dither fades: [near, far] — opaque inside `near`, gone
 * past `far`, a per-instance dither in between (camera → instance origin).
 * TASK-611 (D-161): the reveal comes earlier and is armed one orbit tier ahead (detail/reveal.ts),
 * so the dither band — not the tier switch — carries it. Tier 2 was 120–160 (detail only inside
 * an orbit of ~126 u), now 200–260: a T1 island view at ~230 u already shows half the village
 * detail and it is complete by 200 u. Tier 3 was 40–55, now 70–95 (ground cover keeps 40–55,
 * GROUND_COVER_FADE).
 */
export const TIER_FADE: Record<number, [number, number]> = {
  0: [0, 1e9],
  1: [320, 420],
  2: [200, 260],
  3: [70, 95],
};

/**
 * Ground cover (grass / flowers / reeds / lily pads, TASK-611): its own dither band, nearer than
 * the tier-3 props — the old T3 band. Its chunk groups (one per def × variant × chunk) are the
 * draw-call cost: at 70–95 the close wow shots went over the medium budget (W16 +9 calls). It is
 * still armed a tier ahead (T2), so it dithers in continuously instead of blooming in as a wave
 * at the T3 switch.
 */
export const GROUND_COVER_FADE: [number, number] = [40, 55];

/**
 * LOD1 → LOD0 hand-over (TASK-611, D-161) of every def that has a LOD1 view (tier 0–1): LOD0
 * dithers in over `band` (the tier-2 band, so the structures sharpen with the village detail)
 * while LOD1 stays opaque behind it — the LOD1 materials draw with a polygon offset of
 * `polygonOffset` ([factor, units]) so LOD0 wins every depth tie and the two read as one
 * complementary cross-fade (each pixel is LOD0 where its dither keeps it, LOD1 elsewhere: no
 * holes, no z-fight). Once LOD0 is opaque, LOD1 dithers out over the next `lod1Out` u inward —
 * except trees, whose LOD1 keeps TREE_FADE and stays hidden inside the LOD0 canopy close up.
 */
export const LOD_HANDOFF = {
  band: TIER_FADE[2],
  lod1Out: 25,
  polygonOffset: [1, 2] as const,
};
