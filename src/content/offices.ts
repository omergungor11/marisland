/**
 * Office lots (Phase 3): footprints, work spots, interiors and emitters. Single source of
 * truth shared by geo/ (desks are built exactly at the spots), worldgen (footprints) and
 * life/ (workers sit at the spots). Pure data, no three import.
 *
 * Lot-local frame (world/lot-frame.ts): +z = the lot's facing (door side, (cos rotY, sin rotY)
 * in world), +x = its right hand; origin = lot centre on the pad; footprint spans
 * x ∈ [−w/2, w/2], z ∈ [−d/2, d/2]. A spot's `face` is a lot-local heading: the worker looks
 * along (sin face, cos face), i.e. 0 = towards the door side.
 */
import type { LotKind, ThemeId } from '../world/types.ts';

export interface OfficeDef {
  theme: ThemeId;
  kind: LotKind;
  /** Footprint width (local x) and depth (local z), u. */
  w: number;
  d: number;
  /** Geometry variants (2 each; LOT_ROOFS mirrors the count). */
  variants: number;
}

/** Themed lot defs. Worldgen merges these into LOT_FOOTPRINT / LOT_KIND (TASK-302). */
export const OFFICE_DEFS: Readonly<Record<string, OfficeDef>> = {
  hqOffice: { theme: 'hq', kind: 'office', w: 6, d: 5, variants: 2 },
  hqAnnex: { theme: 'hq', kind: 'tower', w: 3, d: 3, variants: 2 },
  meetingPavilion: { theme: 'hq', kind: 'pavilion', w: 4, d: 4, variants: 2 },
  coffeeKiosk: { theme: 'hq', kind: 'kiosk', w: 2, d: 1.5, variants: 2 },
  devOffice: { theme: 'coding', kind: 'office', w: 7, d: 4, variants: 2 },
  devPod: { theme: 'coding', kind: 'office', w: 3, d: 3, variants: 2 },
  serverShed: { theme: 'coding', kind: 'shed', w: 3, d: 2.5, variants: 2 },
  broadcastStudio: { theme: 'marketing', kind: 'studio', w: 4, d: 3.5, variants: 2 },
  billboard: { theme: 'marketing', kind: 'kiosk', w: 4, d: 1.5, variants: 2 },
  testLab: { theme: 'qa', kind: 'lab', w: 5, d: 4, variants: 2 },
  inspectionTower: { theme: 'qa', kind: 'tower', w: 2.5, d: 2.5, variants: 2 },
  testLabStilt: { theme: 'qa', kind: 'hut', w: 3, d: 3, variants: 2 },
  atelier: { theme: 'design', kind: 'studio', w: 5, d: 4, variants: 2 },
  galleryPavilion: { theme: 'design', kind: 'pavilion', w: 4, d: 4, variants: 2 },
  dataCenter: { theme: 'devops', kind: 'office', w: 7, d: 4, variants: 2 },
  rackShed: { theme: 'devops', kind: 'shed', w: 3, d: 2.5, variants: 2 },
  antennaMast: { theme: 'devops', kind: 'tower', w: 2, d: 2, variants: 2 },
  researchHut: { theme: 'research', kind: 'outpost', w: 3, d: 3, variants: 2 },
};

/** Top of the thin floor slab inside every shell, above the lot pivot (u); interiors stand on it. */
export const FLOOR_Y = 0.08;
/** Shells whose floor line sits on a raised deck (u above the lot pivot); interior and workers lift by it. */
export const RAISED_FLOOR: Readonly<Record<string, number>> = {
  // deck top 1.2 + 0.02, like the legacy stiltHut
  testLabStilt: 1.22,
};
/** Floor a def's interior (and its seated workers) stands on, above the lot pivot (u). */
export const floorOf = (defId: string): number => (RAISED_FLOOR[defId] ?? 0) + FLOOR_Y;

export type WorkPose = 'type' | 'stand' | 'paint' | 'inspect' | 'look' | 'rack';

export interface WorkSpot {
  /** Lot-local position (u). */
  x: number;
  z: number;
  /** Lot-local heading (rad), see header. */
  face: number;
  pose: WorkPose;
  /** Sitting drop in u (0 = standing). */
  sit: number;
}

const S = 0.28; // seated drop
const PI = Math.PI;

/**
 * Work spots per lot def. Themed defs keep every spot inside the footprint, ≥ 0.4 u from its
 * edges; at least one spot per building is visible from outside (open front / big opening).
 * Legacy defs get a door-side bench spot so life works on pre-Phase-3 lots.
 */
export const WORK_SPOTS: Readonly<Record<string, readonly WorkSpot[]>> = {
  // HQ
  hqOffice: [
    { x: -1.6, z: 1.2, face: 0, pose: 'type', sit: S },
    { x: 0, z: 1.2, face: 0, pose: 'type', sit: S },
    { x: 1.6, z: 1.2, face: 0, pose: 'type', sit: S },
    { x: -1.2, z: -1.0, face: PI / 2, pose: 'type', sit: S },
    { x: 1.2, z: -1.0, face: -PI / 2, pose: 'type', sit: S },
  ],
  hqAnnex: [{ x: 0, z: 0.6, face: 0, pose: 'look', sit: 0 }],
  meetingPavilion: [
    { x: 0, z: 1.0, face: PI, pose: 'type', sit: S },
    { x: 1.0, z: 0, face: -PI / 2, pose: 'type', sit: S },
    { x: 0, z: -1.0, face: 0, pose: 'type', sit: S },
    { x: -1.0, z: 0, face: PI / 2, pose: 'type', sit: S },
  ],
  coffeeKiosk: [{ x: 0, z: -0.2, face: 0, pose: 'stand', sit: 0 }],
  // Coding
  devOffice: [
    { x: -2.2, z: 0.9, face: 0, pose: 'type', sit: S },
    { x: 0, z: 0.9, face: 0, pose: 'type', sit: S },
    { x: 2.2, z: 0.9, face: 0, pose: 'type', sit: S },
    { x: -2.2, z: -0.8, face: 0, pose: 'type', sit: S },
    { x: 0, z: -0.8, face: 0, pose: 'type', sit: S },
    { x: 2.2, z: -0.8, face: 0, pose: 'type', sit: S },
  ],
  devPod: [
    { x: -0.6, z: 0.5, face: 0, pose: 'type', sit: S },
    { x: 0.6, z: 0.5, face: 0, pose: 'type', sit: S },
  ],
  serverShed: [{ x: 0, z: 0.6, face: PI, pose: 'rack', sit: 0 }],
  // Marketing
  broadcastStudio: [
    { x: -0.9, z: 0.8, face: 0, pose: 'type', sit: S },
    { x: 0.9, z: 0.8, face: 0, pose: 'look', sit: 0 },
    { x: 0, z: -0.7, face: 0, pose: 'type', sit: S },
  ],
  billboard: [{ x: 0, z: 0.3, face: PI, pose: 'paint', sit: 0 }],
  // QA
  testLab: [
    { x: -1.4, z: 1.0, face: 0, pose: 'inspect', sit: 0 },
    { x: 0.4, z: 1.0, face: 0, pose: 'type', sit: S },
    { x: 1.5, z: -0.8, face: -PI / 2, pose: 'inspect', sit: 0 },
  ],
  inspectionTower: [{ x: 0, z: 0.5, face: 0, pose: 'look', sit: 0 }],
  testLabStilt: [
    { x: -0.5, z: 0.2, face: 0, pose: 'inspect', sit: 0 },
    { x: 0.6, z: 0.2, face: 0, pose: 'type', sit: S },
  ],
  // Design
  atelier: [
    { x: -1.5, z: 1.0, face: 0, pose: 'paint', sit: 0 },
    { x: 0.2, z: 1.0, face: 0, pose: 'paint', sit: 0 },
    { x: 1.4, z: -0.8, face: PI / 2, pose: 'type', sit: S },
  ],
  galleryPavilion: [
    { x: -0.9, z: 0.8, face: PI / 4, pose: 'look', sit: 0 },
    { x: 0.9, z: -0.6, face: -PI / 2, pose: 'paint', sit: 0 },
  ],
  // DevOps
  dataCenter: [
    { x: -2.0, z: 1.1, face: 0, pose: 'type', sit: S },
    { x: -0.5, z: 0, face: PI / 2, pose: 'rack', sit: 0 },
    { x: 1.5, z: 0, face: PI / 2, pose: 'rack', sit: 0 },
    { x: 2.2, z: 1.1, face: 0, pose: 'type', sit: S },
  ],
  rackShed: [{ x: 0, z: 0.5, face: PI, pose: 'rack', sit: 0 }],
  antennaMast: [{ x: 0.5, z: 0.5, face: 0, pose: 'inspect', sit: 0 }],
  // Research
  researchHut: [
    { x: -0.5, z: 0.6, face: 0, pose: 'type', sit: S },
    { x: 0.6, z: 0.4, face: PI / 2, pose: 'inspect', sit: 0 },
  ],
  // legacy: a bench spot just outside the door
  cottage: [{ x: 0.9, z: 2.0, face: 0, pose: 'look', sit: S }],
  logCabin: [{ x: 1.0, z: 2.0, face: 0, pose: 'look', sit: S }],
  stiltHut: [{ x: 0.9, z: 1.9, face: 0, pose: 'look', sit: S }],
};

/** Shells with a tier-2 interior; the index is the `officeInterior` variant. */
export const OFFICE_INTERIOR_SHELLS: readonly string[] = [
  'hqOffice',
  'meetingPavilion',
  'devOffice',
  'devPod',
  'broadcastStudio',
  'testLab',
  'testLabStilt',
  'atelier',
  'dataCenter',
  'researchHut',
];

/** Shell def → its interior instance. Furniture is built at WORK_SPOTS[shell]. */
export const INTERIOR_OF: Readonly<Record<string, { def: string; variant: number }>> =
  Object.fromEntries(
    OFFICE_INTERIOR_SHELLS.map((s, i) => [s, { def: 'officeInterior', variant: i }]),
  );

export interface EmitterSpot {
  /** Lot-local position; y above the ground at the lot centre (u). */
  x: number;
  y: number;
  z: number;
  preset: 'chimney' | 'vent';
}

/** Smoke / steam emitters per lot def (generalises the hard-coded chimneys). */
export const EMITTERS: Readonly<Record<string, readonly EmitterSpot[]>> = {
  cottage: [{ x: -0.9, y: 3.6, z: 0.4, preset: 'chimney' }],
  logCabin: [{ x: -0.9, y: 3.6, z: 0.4, preset: 'chimney' }],
  towerHouse: [{ x: -0.9, y: 6, z: 0.4, preset: 'chimney' }],
  serverShed: [{ x: 0.8, y: 3.05, z: -0.5, preset: 'vent' }],
  dataCenter: [
    { x: -2.2, y: 3.35, z: -1.0, preset: 'vent' },
    { x: 2.2, y: 3.35, z: -1.0, preset: 'vent' },
  ],
  rackShed: [{ x: 0.8, y: 3.05, z: -0.5, preset: 'vent' }],
};
