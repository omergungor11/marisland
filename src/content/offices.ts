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
import { COOLING_TOWER_HEIGHTS, DEVOPS_WORKS } from './props-themes/devops.ts';
import { QA_FACTORY } from './themes/qa.ts';

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
  // v2 arcade (cream, blue shutters), v3 bell niche + balcony (TASK-466, D-060)
  hqOffice: { theme: 'hq', kind: 'office', w: 6, d: 5, variants: 4 },
  // v2 = Harbour Guild hall (M19 TASK-420; the HQ plan pins it on the crown lot)
  hqAnnex: { theme: 'hq', kind: 'tower', w: 3, d: 3, variants: 3 },
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
  // v2 = glass-roof gallery (M19 TASK-425; the Design plan pins it on one lot)
  galleryPavilion: { theme: 'design', kind: 'pavilion', w: 4, d: 4, variants: 3 },
  dataCenter: { theme: 'devops', kind: 'office', w: 7, d: 4, variants: 2 },
  rackShed: { theme: 'devops', kind: 'shed', w: 3, d: 2.5, variants: 2 },
  // v2 = summit watch tower (M22 TASK-482; the DevOps plan pins it on the one rim lot)
  antennaMast: { theme: 'devops', kind: 'tower', w: 2, d: 2, variants: 3 },
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

export type WorkPose =
  | 'type'
  | 'stand'
  | 'paint'
  | 'inspect'
  | 'look'
  | 'rack'
  // M19 culture poses (TASK-432, content/life.ts POSES): arm / lean / lie animation per pose
  | 'hammer'
  | 'stamp'
  | 'selfie'
  | 'light'
  | 'gaze'
  | 'bell'
  | 'nap';

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

/**
 * Seated drop at a chair: the bot's hips (body bottom 0.22 × LAND.size 1.7 = 0.37 u above its feet)
 * rest on the seat top (geo/interiors chair: 0.33 above the floor), feet just inside the floor slab.
 */
const S = 0.06;
/** Legacy door-side bench spots (no chair geometry): sit low on the ground. */
const BENCH = 0.28;
const PI = Math.PI;

/**
 * Work spots per lot def. Themed defs keep every spot inside the footprint, ≥ 0.4 u from its
 * edges; at least one spot per building is visible from outside (open front / big opening).
 * Legacy defs get a door-side bench spot so life works on pre-Phase-3 lots.
 */
export const WORK_SPOTS: Readonly<Record<string, readonly WorkSpot[]>> = {
  // HQ
  hqOffice: [
    // M14c: front row turned half-back (screens angle out through the open front, the bot does not
    // hide its own screen), back row looks out
    { x: -1.6, z: 1.2, face: PI + 0.7, pose: 'type', sit: S },
    { x: 0, z: 1.2, face: PI - 0.7, pose: 'type', sit: S },
    { x: 1.6, z: 1.2, face: PI - 0.7, pose: 'type', sit: S },
    { x: -1.2, z: -0.9, face: 0.35, pose: 'type', sit: S },
    { x: 1.2, z: -0.9, face: -0.35, pose: 'type', sit: S },
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
    // M14c: front row turned half-back (screens angle out through the windows), back row looks out
    { x: -2.2, z: 0.9, face: PI + 0.9, pose: 'type', sit: S },
    { x: 0, z: 0.9, face: PI - 0.9, pose: 'type', sit: S },
    { x: 2.2, z: 0.9, face: PI + 0.9, pose: 'type', sit: S },
    { x: -2.2, z: -0.8, face: 0, pose: 'type', sit: S },
    { x: 0, z: -0.8, face: 0, pose: 'type', sit: S },
    { x: 2.2, z: -0.8, face: 0, pose: 'type', sit: S },
  ],
  devPod: [
    // M14c: turned half-back so each screen angles out through the open front
    { x: -0.95, z: 0.5, face: PI - 0.9, pose: 'type', sit: S },
    { x: 0.95, z: 0.5, face: PI + 0.9, pose: 'type', sit: S },
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
    { x: 0.4, z: 1.0, face: PI - 0.8, pose: 'type', sit: S },
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
    { x: -2.0, z: 1.3, face: PI - 0.8, pose: 'type', sit: S },
    { x: -0.5, z: 0, face: PI / 2, pose: 'rack', sit: 0 },
    { x: 1.5, z: 0, face: PI / 2, pose: 'rack', sit: 0 },
    { x: 2.2, z: 1.3, face: PI + 0.8, pose: 'type', sit: S },
  ],
  rackShed: [{ x: 0, z: 0.5, face: PI, pose: 'rack', sit: 0 }],
  antennaMast: [{ x: 0.5, z: 0.5, face: 0, pose: 'inspect', sit: 0 }],
  // Research
  researchHut: [
    { x: -0.5, z: 0.6, face: 0, pose: 'type', sit: S },
    { x: 0.6, z: 0.4, face: PI / 2, pose: 'inspect', sit: 0 },
  ],
  // Outdoor structures (M14b, TASK-379): free-standing props, not lots, so `seatsOf` never sees
  // them. Same frame as lots but STRUCTURE-local: origin = the instance pivot, +z = the structure's
  // front, +x = its right hand; a spot at (x, z) looking at the pivot has face = atan2(-x, -z).
  // A consumer (TASK-383) maps it with `lotLocalToWorld({ x, z, rotY }, spot.x, spot.z)` from the
  // prop instance, world heading = rotY - face. All stand (sit 0) on the terrain outside the
  // footprint, >= 0.6 u clear; sizes assume the M14b tables (easel ~1.2 u wide, cooling tower
  // base radius ~3 u, gate / checklist board ~2 u wide, solar row on a 2.4 u lattice).
  easel: [{ x: 0, z: 0.9, face: PI, pose: 'paint', sit: 0 }],
  checklistBoard: [{ x: 0, z: 0.8, face: PI, pose: 'inspect', sit: 0 }],
  solarRow: [
    { x: -1.2, z: 1.0, face: PI, pose: 'inspect', sit: 0 },
    { x: 1.2, z: 1.0, face: PI, pose: 'inspect', sit: 0 },
  ],
  windTurbine: [{ x: 0, z: 1.3, face: PI, pose: 'look', sit: 0 }],
  coolingTower: [
    { x: 0, z: 3.6, face: PI, pose: 'inspect', sit: 0 },
    { x: 2.6, z: 2.6, face: -(3 * PI) / 4, pose: 'inspect', sit: 0 },
  ],
  // TASK-383 decor spots (structure-local, same rules as above)
  rackRow: [
    { x: -0.4, z: 1.1, face: PI, pose: 'rack', sit: 0 },
    { x: 0.6, z: 1.1, face: PI, pose: 'rack', sit: 0 },
  ],
  observatory: [
    { x: 2.4, z: 5.2, face: -2.6, pose: 'look', sit: 0 },
    { x: -2.4, z: 5.2, face: 2.6, pose: 'look', sit: 0 },
  ],
  sculptureTorus: [{ x: 0, z: 2.4, face: PI, pose: 'look', sit: 0 }],
  sculptureArch: [{ x: 0, z: 2.8, face: PI, pose: 'look', sit: 0 }],
  sculptureStack: [{ x: 0, z: 2.2, face: PI, pose: 'look', sit: 0 }],
  stage: [
    { x: -1, z: 2.8, face: PI, pose: 'look', sit: 0 },
    { x: 1, z: 2.8, face: PI, pose: 'look', sit: 0 },
  ],
  weatherMast: [{ x: 0.7, z: 0.7, face: -(3 * PI) / 4, pose: 'inspect', sit: 0 }],
  // Marketing Media Rock (TASK-403): watch the giant screen, queue at the wheel and the booths,
  // peek into a tent, check the antenna hut and the office doors (outside FIXTURE_RADIUS)
  giantScreen: [
    { x: -1.4, z: 3.1, face: PI, pose: 'look', sit: 0 },
    { x: 1.4, z: 3.1, face: PI, pose: 'look', sit: 0 },
  ],
  ferrisWheel: [
    { x: -0.6, z: 3.7, face: PI, pose: 'look', sit: 0 },
    { x: 3.2, z: 2.1, face: PI, pose: 'stand', sit: 0 },
  ],
  fairBooth: [{ x: 0, z: 1.8, face: PI, pose: 'stand', sit: 0 }],
  fairTent: [{ x: 0.4, z: 3.0, face: PI, pose: 'look', sit: 0 }],
  antennaTower: [{ x: 0.9, z: 2.2, face: PI, pose: 'inspect', sit: 0 }],
  mediaOffice: [{ x: 0.75, z: 3.7, face: PI, pose: 'look', sit: 0 }],
  mediaShop: [{ x: -0.9, z: 2.6, face: PI, pose: 'look', sit: 0 }],
  // Research Biodome Lab (TASK-400): tend the glass beside the door porch (domes ≈ 3.2 / 1.8 u)
  biodomeHero: [
    { x: 2.2, z: 3.4, face: Math.atan2(-2.2, -3.4), pose: 'inspect', sit: 0 },
    { x: -2.2, z: 3.4, face: Math.atan2(2.2, -3.4), pose: 'look', sit: 0 },
  ],
  biodome: [{ x: 1.4, z: 2.2, face: Math.atan2(-1.4, -2.2), pose: 'inspect', sit: 0 }],
  // Observatory University (TASK-402b): tend the glasshouses at the door, check the lab pods at the
  // hatch, inspect the small dishes, clip the parterres, gaze at the sculptures
  terrarium: [{ x: 1.0, z: 3.2, face: Math.atan2(-1.0, -3.2), pose: 'inspect', sit: 0 }],
  labPod: [{ x: 0.9, z: 2.6, face: Math.atan2(-0.9, -2.6), pose: 'inspect', sit: 0 }],
  radioDish: [{ x: 1.6, z: -2.0, face: Math.atan2(-1.6, 2.0), pose: 'inspect', sit: 0 }],
  hedgeParterre: [{ x: 0, z: 2.5, face: PI, pose: 'inspect', sit: 0 }],
  atomSculpture: [{ x: 0, z: 2.0, face: PI, pose: 'look', sit: 0 }],
  armillarySphere: [{ x: 0, z: 2.2, face: PI, pose: 'look', sit: 0 }],
  barrierGate: [{ x: 0, z: 0.9, face: PI, pose: 'inspect', sit: 0 }],
  // M19 culture fixtures (TASK-432), same structure-local frame. A bot stands at z ≈ footprint + 0.8
  // in front of the prop (the own footprint is not blocked for its own spots), looking at the pivot.
  // HQ Harbour Guild: timetable, bell post, coffee cart (chat hub), notice board
  timetableBoard: [{ x: 0.2, z: 1.9, face: PI, pose: 'look', sit: 0 }],
  bellPost: [{ x: 0, z: 1.5, face: PI, pose: 'bell', sit: 0 }],
  coffeeCart: [
    { x: -0.8, z: 2.0, face: PI, pose: 'stand', sit: 0 },
    { x: 0.9, z: 2.0, face: PI, pose: 'stand', sit: 0 },
  ],
  guildNoticeBoard: [
    { x: -0.8, z: 2.2, face: PI, pose: 'look', sit: 0 },
    { x: 0.8, z: 2.2, face: PI, pose: 'look', sit: 0 },
  ],
  // Coding Wind Gardens: type outdoors at the pergola desk, nap in the hammock, read the board
  pergolaDesk: [
    { x: -0.7, z: 1.7, face: PI, pose: 'type', sit: 0 },
    { x: 0.7, z: 1.7, face: PI, pose: 'type', sit: 0 },
  ],
  hammock: [{ x: 0, z: 0, face: PI / 2, pose: 'nap', sit: 0 }],
  whiteboardA: [{ x: 0.7, z: 1.6, face: PI, pose: 'look', sit: 0 }],
  kiteRack: [{ x: 0, z: 2.6, face: PI, pose: 'gaze', sit: 0 }],
  // DevOps Ember Smiths: the anvil, the incident board, the siren, the pager
  anvil: [{ x: 0, z: 1.2, face: PI, pose: 'hammer', sit: 0 }],
  incidentSign: [
    { x: -0.7, z: 2.3, face: PI, pose: 'look', sit: 0 },
    { x: 0.8, z: 2.3, face: PI, pose: 'look', sit: 0 },
  ],
  signalHorn: [{ x: 0, z: 1.8, face: PI, pose: 'look', sit: 0 }],
  pagerRock: [{ x: 0, z: 1.6, face: PI, pose: 'inspect', sit: 0 }],
  // Marketing Carnival: selfie platform, megaphone, popcorn, prize booth, marquee, mascot
  selfieSpot: [{ x: 0, z: 2.3, face: PI, pose: 'selfie', sit: 0 }],
  megaphoneStand: [{ x: 0, z: 1.3, face: PI, pose: 'stand', sit: 0 }],
  popcornCart: [{ x: 0, z: 1.7, face: PI, pose: 'stand', sit: 0 }],
  prizeBooth: [{ x: 0, z: 2.1, face: PI, pose: 'stand', sit: 0 }],
  marqueeSign: [{ x: 0, z: 2.4, face: PI, pose: 'look', sit: 0 }],
  mascotStatue: [{ x: 0, z: 3.0, face: PI, pose: 'look', sit: 0 }],
  // QA Inspectors: stamp desk, clipboard wall, scoreboard, mannequin bench
  stampDesk: [{ x: 0, z: 1.5, face: PI, pose: 'stamp', sit: 0 }],
  clipboardWall: [
    { x: -0.6, z: 1.8, face: PI, pose: 'inspect', sit: 0 },
    { x: 0.6, z: 1.8, face: PI, pose: 'inspect', sit: 0 },
  ],
  scoreboard: [{ x: 0, z: 2.4, face: PI, pose: 'gaze', sit: 0 }],
  dummyBench: [{ x: 0, z: 1.9, face: PI, pose: 'look', sit: 0 }],
  // Design Glass & Light: hot shop, gather ring (chat hub), stained screen, shelf, orb
  hotShop: [{ x: 0, z: 2.4, face: PI, pose: 'light', sit: 0 }],
  gatherRing: [
    { x: 2.3, z: 0, face: -PI / 2, pose: 'light', sit: 0 },
    { x: -2.3, z: 0, face: PI / 2, pose: 'light', sit: 0 },
    { x: 0, z: 2.3, face: PI, pose: 'light', sit: 0 },
  ],
  stainedScreen: [{ x: 0, z: 1.9, face: PI, pose: 'light', sit: 0 }],
  blowpipeRack: [{ x: 0, z: 1.4, face: PI, pose: 'look', sit: 0 }],
  sampleShelf: [{ x: 0, z: 1.4, face: PI, pose: 'look', sit: 0 }],
  glassOrb: [{ x: 0, z: 1.4, face: PI, pose: 'look', sit: 0 }],
  // Glass bridge (TASK-469): a look at the creek from each bank beside the pads (deck axis = local
  // x, banks at ±(padX + padR + pin) = 6.2); the far bank is only reachable over the deck
  glassBridge: [
    { x: 6.6, z: 0, face: -PI / 2, pose: 'look', sit: 0 },
    { x: -6.6, z: 0, face: PI / 2, pose: 'look', sit: 0 },
  ],
  // Research Stargazer Academy: telescope, orrery, lecture steps (chat hub), board, tea, books
  tripodTelescope: [{ x: 0, z: 1.4, face: PI, pose: 'gaze', sit: 0 }],
  orrery: [{ x: 0, z: 2.1, face: PI, pose: 'gaze', sit: 0 }],
  lectureSteps: [
    { x: -1.1, z: 3.1, face: PI, pose: 'look', sit: 0 },
    { x: 1.1, z: 3.1, face: PI, pose: 'look', sit: 0 },
  ],
  chalkboard: [{ x: 0, z: 1.9, face: PI, pose: 'inspect', sit: 0 }],
  teaTrolley: [{ x: 0, z: 1.5, face: PI, pose: 'stand', sit: 0 }],
  bookCart: [{ x: 0, z: 1.5, face: PI, pose: 'look', sit: 0 }],
  // legacy: a bench spot just outside the door
  cottage: [{ x: 0.9, z: 2.0, face: 0, pose: 'look', sit: BENCH }],
  logCabin: [{ x: 1.0, z: 2.0, face: 0, pose: 'look', sit: BENCH }],
  stiltHut: [{ x: 0.9, z: 1.9, face: 0, pose: 'look', sit: BENCH }],
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
  /** 'spring': the hot-spring puff (bigger, slower) for tall stacks (cooling towers). */
  preset: 'chimney' | 'vent' | 'spring';
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
  // steam over the cup sign on the roof (geo/offices.ts coffeeKiosk)
  coffeeKiosk: [{ x: 0, y: 2.75, z: -0.2, preset: 'vent' }],
};

/**
 * Steam emitters of single props (settlement fixtures and scattered props), per variant, in the
 * prop's local frame (rotated by its yaw, scaled by its scale; y above the prop's pivot). Mirrors
 * the geometry hooks (`userData.hooks.emitter`, geo/themes/devops.ts).
 */
export const FIXTURE_EMITTERS: Readonly<Record<string, readonly (readonly EmitterSpot[])[]>> = {
  coolingTower: COOLING_TOWER_HEIGHTS.map((h) => [{ x: 0, y: h + 0.2, z: 0, preset: 'spring' }]),
  steamVent: [
    [{ x: 0, y: 0.8, z: 0, preset: 'vent' }],
    [{ x: -0.16, y: 0.75, z: 0.04, preset: 'vent' }],
  ],
  // DevOps "Ember Works" (TASK-405): foundry chimney tops, the smithy chimney
  foundry: [
    DEVOPS_WORKS.foundry.chimneys.map((c) => ({
      x: c.x,
      y: DEVOPS_WORKS.foundry.chimneyH + 0.35,
      z: c.z,
      preset: 'chimney' as const,
    })),
  ],
  smithy: [
    [
      {
        x: DEVOPS_WORKS.smithy.chimney.x,
        y: DEVOPS_WORKS.smithy.chimneyH + 0.3,
        z: DEVOPS_WORKS.smithy.chimney.z,
        preset: 'chimney',
      },
    ],
  ],
  // Ember Smiths bath house (TASK-422): steam from the copper vent chimney (geo hook
  // culture-devops.ts onsenHouse `userData.hooks.emitter`)
  onsenHouse: [[{ x: 1.0, y: 2.9, z: -0.3, preset: 'vent' }]],
  // Glass & Light hot shop (TASK-425): smoke off the copper stack top, every heat variant (geo
  // hook culture-design.ts hotShop `userData.hooks.emitter`)
  hotShop: [[{ x: -0.7, y: 2.68, z: -0.58, preset: 'chimney' }]],
  // Star Academy mini volcano terrariums (TASK-426): steam from the crater (geo hook
  // culture-research.ts miniVolcanoTerrarium `userData.hooks.emitter`, per variant)
  miniVolcanoTerrarium: [
    [{ x: 0, y: 0.84, z: 0, preset: 'vent' }],
    [{ x: -0.12, y: 0.65, z: 0, preset: 'vent' }],
  ],
  // QA test hangars (TASK-401): the short chimney tops (geo/themes/qa-factory.ts)
  testHangar: [
    QA_FACTORY.hangar.chimneys.map((c) => ({
      x: c.x,
      y: 0.25 + QA_FACTORY.hangar.h + QA_FACTORY.hangar.chimneyH + 0.25,
      z: c.z,
      preset: 'chimney' as const,
    })),
  ],
};
