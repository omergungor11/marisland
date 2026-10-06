/**
 * Department themes (Phase 3, D-024; M14b D-029 theme-first): every island is one department of
 * the agent org. The archetype supplies only the shape; the theme owns ground, zone-rule
 * overrides, landmarks, districts, scatter, decor and creature weights.
 * Data only — worldgen (campus lots), render (decor, landmark variants), life (workers) and
 * the HUD (labels) read these tables. Def ids may name geometry that lands in a later task:
 * `appendSettlementProps.push` returns −1 for unknown defs.
 *
 * One file per theme (content/themes/<theme>.ts); this module assembles `THEMES`.
 */
import type { ArchetypeId, DistrictKind, ThemeId, ZoneId } from '../../world/types.ts';
import type { ZoneRuleParams } from '../islands.ts';
import type { PlacementRule } from '../placement.ts';
import type { GroundSpec } from '../ground.ts';
import { HQ_THEME } from './hq.ts';
import { CODING_THEME } from './coding.ts';
import { MARKETING_THEME } from './marketing.ts';
import { QA_THEME } from './qa.ts';
import { DESIGN_THEME } from './design.ts';
import { DEVOPS_THEME } from './devops.ts';
import { RESEARCH_THEME } from './research.ts';

/** Icon keys drawn by ui/theme-icons.ts (24-viewBox stroke icons). */
export type ThemeIconKey =
  'hub' | 'code' | 'megaphone' | 'magnifier' | 'palette' | 'gear' | 'flask';

/**
 * Patchwork handling (profile `Tag.field` cells):
 * - 'fields'    today's Millbrook farm patchwork: `field` zone + `fieldColor` hues, no districts;
 * - 'off'       no patchwork hues (`fieldColor` = 0 on the island);
 * - 'districts' patch rectangles become `world.districts` (e.g. Coding solar districts).
 */
export type ThemePatchwork = 'fields' | 'off' | 'districts';

/** A landmark the theme places on an archetype anchor (`IslandData.anchors` key). */
export interface ThemeLandmark {
  /** LandmarkData.kind (content/landmark-render.ts `LANDMARK_RENDER` key). */
  kind: string;
  /** Geometry variant. */
  variant: number;
}

/**
 * Creature allocation weights on this island. Unset = today's archetype / settlement-kind weight
 * (content/life.ts SHEEP / CRABS by archetype, CATS by settlement kind).
 */
export interface ThemeLifeWeights {
  sheep?: number;
  crabs?: number;
  cats?: number;
}

/** Canopy hexes used by scatter trees and their far blobs (same shape as palette FOLIAGE). */
export interface ThemeTreePalette {
  deciduous: readonly string[];
  pine: readonly string[];
  palm: readonly string[];
}

export interface ThemeDef {
  id: ThemeId;
  /** Label text, e.g. 'Coding'. */
  displayName: string;
  /** Short chip text. */
  short: string;
  icon: ThemeIconKey;
  /** Label dot / chip colour and worker body base. */
  accent: string;
  /** Worker body tints around the accent (team colours). */
  teamTints: readonly string[];
  /** Campus lane lots: [lot def id, weight]. */
  lotMix: readonly (readonly [string, number])[];
  /** Def for the highest lot of the campus (like the tower house today); null = none. */
  crown: string | null;
  /** Legacy archetype lot def → themed def (applied in tryLot). */
  defSwap: Readonly<Record<string, string>>;
  /** Landmark kind → geometry variant override (clocktower 2 = orchestrator, lighthouse 2 = broadcast). */
  landmarkVariant: Readonly<Record<string, number>>;
  /** Decor beside themed lots: [prop def id, weight]. */
  decor: readonly (readonly [string, number])[];
  /** Chance of a lantern post per path junction on this island. */
  pathLanterns: number;
  /**
   * Campus quad decor (render, settlement-props): `posts` at 3 points of the rim, `seats` between
   * them (70 %), `across` 2 items halfway in. Prop def ids; null = none (TASK-380: no cozy
   * bunting / wooden benches on tech campuses).
   */
  plazaDecor: Readonly<{ posts: string | null; seats: string | null; across: string | null }>;
  /** Worker allocation weight, cap per island, share seated at t = 0. */
  workers: { weight: number; cap: number; deskShare: number };
  /** Worker accessory index (creature shader mode 8), 0..DEPT_ACCESSORY_COUNT − 1. */
  accessory: number;

  // ---- M14b (TASK-360). Defaults reproduce the pre-M14b world exactly.
  /** Zone → ground material + base hex. Unlisted zones keep the global palette. */
  ground: Readonly<Partial<Record<ZoneId, GroundSpec>>>;
  /** Merged over the archetype's zone rules: `{ ...ARCHETYPES[a].zones, ...zoneRules }`. */
  zoneRules?: Readonly<Partial<ZoneRuleParams>>;
  patchwork: ThemePatchwork;
  /**
   * On a 'districts' patchwork theme: the kind every raw profile patch rectangle becomes in
   * `world.districts` (world/index.ts). Unset = the theme planner emits its own districts from the
   * patches (Coding trims them to clean ground around its campus).
   */
  patchDistrict?: DistrictKind;
  /** Anchor key → landmark. Empty = the archetype planner's landmarks (today). */
  landmarks: Readonly<Record<string, ThemeLandmark>>;
  /** Extra placement rules for this island only (`archetypes` is ignored: the theme is implied). */
  scatter: readonly PlacementRule[];
  /** Global PLACEMENT_RULES disabled on this island, by `PlacementRule.def` id (every rule of that def). */
  scatterOff: readonly string[];
  life: Readonly<ThemeLifeWeights>;
  treePalette: Readonly<ThemeTreePalette>;
}

export const THEMES: Readonly<Record<ThemeId, ThemeDef>> = {
  hq: HQ_THEME,
  coding: CODING_THEME,
  marketing: MARKETING_THEME,
  qa: QA_THEME,
  design: DESIGN_THEME,
  devops: DEVOPS_THEME,
  research: RESEARCH_THEME,
};

/** Archetype → department (D-024). Swapping two themes is a one-line change here. */
export const THEME_BY_ARCHETYPE: Readonly<Record<ArchetypeId, ThemeId>> = {
  hearthholm: 'hq',
  millbrook: 'coding',
  emberpeak: 'devops',
  beaconrock: 'marketing',
  palmlagoon: 'qa',
  mossgrove: 'design',
  lonelypalm: 'research',
};

/**
 * Worker accessory slots (creature shader mode 8, life/life-material.ts). A worker's instance
 * `aSeed` = accessory + 100 · (slot − 6) + phase01 (phase01 < 1; 100 = `ITEM_STRIDE`, 0 = nothing
 * carried). Mode 8 decodes `floor(aSeed)` in two slots: the department accessory (`acc`, variants
 * ≤ 6) and the carried item (`slot` = item code + 6, variants ≥ 7); accessory geometry whose `limb.x`
 * matches neither collapses to a point. A multiple of 100 leaves every `sin(aSeed · 2π)` /
 * `fract(aSeed · 7.31)` phase unchanged, so carrying does not shift the gait.
 *
 * Slots 0..6 are the department accessories (`ThemeDef.accessory`). Slots 7.. are the carried items
 * (M14c TASK-383): life/geo/workers.ts adds their geometry tagged `setLimb(slot, …, 8)` and
 * life/workers.ts adds `100 · (CARRIED_ITEM_SLOT[item] − 6)` to `aSeed` while a bot carries it — the
 * department accessory and the item show together.
 */
export const DEPT_ACCESSORY_COUNT = 7;
export const CARRIED_ITEM_SLOT = {
  laptop: 7,
  clipboard: 8,
  crate: 9,
  paintPot: 10,
} as const;
export type CarriedItem = keyof typeof CARRIED_ITEM_SLOT;
