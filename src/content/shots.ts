/**
 * Capture presets (ART_BIBLE §11 + ARCHITECTURE §9). Pure data: the app resolves
 * `?shot=<id>` here, the shots harness picks sets from here. W-seeds pinned by TASK-113, re-themed
 * by TASK-380 (every seed rolls all seven departments, D-024): W5 DevOps forge (1001), W6 QA lagoon
 * (4004), W7 Coding turbines (1001), W10 Design Atelier Tree (6006); 2024 Beacon Rock (W4).
 */
import type { EditToolKind } from './edit-ui.ts';
import { FRAMING } from './camera.ts';

export type ShotSet = 'ci' | 'dev' | 'wow' | 'intro' | 'edit' | 'ladder';

export interface ShotPreset {
  id: string;
  title: string;
  seed: number;
  /** overview | island:<name> | village | dock | macro-beach | raw x,y,z,tx,ty,tz */
  cam: string;
  /** Game hour. */
  time: number;
  weather?: 'clear' | 'cloudy' | 'rain' | 'fog';
  /** Sim warm-up seconds. */
  simt?: number;
  quality?: 'low' | 'medium' | 'high';
  width?: number;
  height?: number;
  /** Capture a second frame this many seconds later for motion checks. */
  deltaT?: number;
  /** Also capture the semantic mask frame. */
  mask?: boolean;
  /** Before capture: dolly in from this distance over `dollySeconds` (hardPops must stay 0). */
  dollyFrom?: number;
  dollySeconds?: number;
  /** Show the HUD (the harness defaults to `hud=0`). */
  hud?: boolean;
  /** HUD panel open (`panel=`): photo bar, settings sheet or edit panel (`edit:<tool>`). */
  panel?: 'photo' | 'settings' | 'edit' | `edit:${EditToolKind}`;
  /** Phase 2 edit log (`edit=`, `encodeLog`), replayed before the first build. */
  edit?: string;
  /** Opening-sequence still at this time (s) (`introt=`). */
  introt?: number;
  /**
   * Zoom-ladder preset (M14b TASK-374, set 'ladder'): frames at fixed pitch / azimuth aimed at the
   * island hero target (`cam=ladder:<island>:<dist>`), one per distance (u, far → near); `pairs`:
   * tier-boundary distances b captured at 1.06 b and 0.94 b. Pitch in degrees.
   */
  ladder?: { island: string; dists: number[]; pitch: number; pairs: number[] };
  sets: ShotSet[];
}

/** Encoded edit logs (seed 1001) of the `edit` set; regenerate with `encodeLog` when the codec changes. */
export const EDIT_LOGS = {
  hill: 'AekHAAgA5HbsKoAFgA4AwAE_AAAAwAFAAAAA_wFAAAAAgAEfAAAAPz-_Av8FAwAggAL_BQQAH58CAQ',
  flood:
    'AekHABAB5H6sOcADgAwBgAKAAgAAAYABvwIAAAH_AYAFAAABwAP_AQAAAb8IwAcAAAHAAkAAAAHAAr8BAAABf_8IAAABgAKAAgAAAYABvwIAAAH_AYAFAAABwAP_AQAAAb8IwAcAAAHAAkAAAAHAAr8BAAA',
  meadow:
    'AekHBQRwaW5lC3JvY2tDbHVzdGVyBmZsb3dlcgRidXNoDWdpYW50TXVzaHJvb20VA_BupGmABLQCBAAAAAEEgAKgAb8BATUAAMUBlwGxEYoCATUCAL8BmQH1B_cBATUAAGxlkAKGAgE1AAClAo4D3g-eAgA1AAGOBLsD_RfpAQA1AAGZApQEiBztAQE1AAF88QPrDvwBATUAASuWA60Z3wEBNQACJN0B8ASMAgA1AAKGAQTGEIYCADUAAgc8zxr7AQA1AAIid-cX2gEBNQACUWLJEPQBATUAA1Nl3RX7AQE1AAPqAZABsRKKAgA1AAPFAUyJGJMCADUAA64B2wG9Bo8CATUABEfmAf4ajgIA',
  mixed:
    'AekHBQdjb3R0YWdlBHBhbG0EYnVzaAtyb2NrQ2x1c3RlcgdsaWx5UGFkEQDGO6Q0gAWADAAAAAAAAgAAvwKzBgIAAAAAAgAAAAADAADAAZcDBAAA3wEDBDIZfwEBpgWuAYABzA0BAAAAAAEAAAAANQAAjwZbiwmAAgA1AAHQAS6RD5kCADUAAbcCrQGFE5ACADUAAiIulQXvAQA1AAOMAh6ZBo4CADUABL0DxgHNAe8BAA',
} as const;

/** Department themes on seed 1001 (findIsland matches the theme id) with their display names. */
const CAMPUS_THEMES = [
  ['hq', 'HQ'],
  ['coding', 'Coding'],
  ['marketing', 'Marketing'],
  ['qa', 'QA'],
  ['design', 'Design'],
  ['devops', 'DevOps'],
  ['research', 'Research'],
] as const;

/** W5 / W7 cameras (raw, seed 1001 DevOps / Coding; TASK-380), re-pin when that layout changes. */
const W5_CAM = '-128,22,-104,-62,12,-76';
const W7_CAM = '45,20,20,95,13,40';

/** D-desk camera (raw `x,y,z,tx,ty,tz`), re-pin when the seed 1001 layout changes. */
const DESK_CAM = '95.8,8.1,17.3,91.5,6.5,20';

export const SHOT_PRESETS: readonly ShotPreset[] = [
  // ---- bible wow shots (1920×1080, medium quality)
  {
    id: 'W1',
    title: 'Postcard',
    seed: 1001,
    cam: 'overview',
    time: 15,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    mask: true,
    sets: ['wow'],
  },
  {
    id: 'W2',
    title: 'Golden Harbor',
    seed: 1001,
    cam: 'dock',
    time: 17.75,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    mask: true,
    sets: ['wow'],
  },
  {
    id: 'W3',
    title: 'Lantern Night',
    seed: 1001,
    cam: 'village',
    time: 22,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W4',
    title: 'Beacon',
    seed: 2024,
    cam: 'island:Beacon Rock',
    time: 21.5,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W5',
    title: 'Forge & Steam',
    // DevOps (TASK-380): a low look from the west shore — a steaming cooling tower in front, the
    // terraced data centers climbing the cone behind it, crater steam against the sky
    seed: 1001,
    cam: W5_CAM,
    time: 10,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W6',
    title: 'QA Lagoon',
    // QA (TASK-380): the bug wreck ringed by inspection buoys, labs on the ring, the stilt lab and
    // its boardwalk, the inspection tower
    seed: 4004,
    cam: 'village:qa',
    time: 12,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W7',
    title: 'Turbine Morning',
    // Coding (TASK-380): low over the tech park toward the wind turbines and solar rows, morning
    // haze behind; the blades turn between the two frames
    seed: 1001,
    cam: W7_CAM,
    time: 6.75,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    deltaT: 0.5,
    sets: ['wow'],
  },
  {
    id: 'W8',
    title: 'Macro Shore',
    seed: 1001,
    cam: 'macro-beach',
    time: 14,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    deltaT: 2,
    sets: ['wow'],
  },
  {
    id: 'W9',
    title: 'Lonely Palm',
    seed: 1001,
    cam: 'island:Lonely Palm',
    time: 18.75,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W10',
    title: 'Rainy Grove',
    // Design (TASK-380): the Atelier Tree over the atelier glade and sculpture garden, in the rain
    seed: 6006,
    cam: 'village:design',
    time: 13,
    weather: 'rain',
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },

  // ---- dev set (960×540) + ci subset (640×360)
  {
    id: 'D-overview',
    title: 'Overview 1001',
    seed: 1001,
    cam: 'overview',
    time: 15,
    simt: 2,
    sets: ['ci', 'dev'],
  },
  {
    id: 'D-overview2',
    title: 'Overview 42',
    seed: 42,
    cam: 'overview',
    time: 15,
    simt: 2,
    sets: ['dev'],
  },
  {
    id: 'D-island',
    title: 'Island',
    seed: 1001,
    cam: 'island:Hearthholm',
    time: 15,
    simt: 2,
    sets: ['ci', 'dev'],
  },
  {
    id: 'D-village',
    title: 'Village',
    seed: 1001,
    cam: 'village',
    time: 15,
    simt: 2,
    sets: ['dev'],
  },
  { id: 'D-dock', title: 'Dock', seed: 1001, cam: 'dock', time: 15, simt: 2, sets: ['dev'] },
  {
    id: 'D-shore',
    title: 'Shore',
    seed: 1001,
    cam: 'shore',
    time: 14,
    simt: 2,
    deltaT: 2,
    sets: ['ci', 'dev'],
  },
  {
    id: 'D-macro',
    title: 'Macro',
    seed: 1001,
    cam: 'macro-beach',
    time: 14,
    simt: 2,
    sets: ['dev'],
  },
  {
    id: 'D-golden',
    title: 'Golden hour',
    seed: 1001,
    cam: 'dock',
    time: 17.75,
    simt: 2,
    sets: ['dev'],
  },
  {
    id: 'D-night',
    title: 'Night',
    seed: 1001,
    cam: 'village',
    time: 22,
    simt: 2,
    sets: ['ci', 'dev'],
  },
  {
    id: 'D-rain',
    title: 'Rain',
    seed: 1001,
    cam: 'island:Hearthholm',
    time: 13,
    weather: 'rain',
    simt: 2,
    sets: ['dev'],
  },
  {
    id: 'D-fog',
    title: 'Fog',
    seed: 1001,
    cam: 'overview',
    time: 6.75,
    weather: 'fog',
    simt: 2,
    sets: ['dev'],
  },
  {
    id: 'D-sheep',
    title: 'Sheep at T2',
    seed: 1001,
    // sheep graze the Design meadows since TASK-379 (none on Coding)
    cam: 'village:design',
    time: 10,
    simt: 6,
    deltaT: 3,
    sets: ['dev'],
  },
  {
    id: 'D-mill',
    title: 'Millbrook',
    seed: 1001,
    cam: 'island:Millbrook',
    time: 10,
    simt: 2,
    sets: ['dev'],
  },
  {
    id: 'D-beacon',
    title: 'Beacon Rock',
    seed: 1001,
    cam: 'island:Beacon Rock',
    time: 16,
    simt: 2,
    sets: ['dev'],
  },
  {
    id: 'D-ember',
    title: 'Emberpeak',
    seed: 42,
    cam: 'island:Emberpeak',
    time: 11,
    simt: 4,
    sets: ['dev'],
  },
  {
    id: 'D-lagoon',
    title: 'Palmlagoon',
    seed: 1001,
    cam: 'island:Palmlagoon',
    time: 12,
    simt: 2,
    sets: ['dev'],
  },
  {
    id: 'D-grove',
    title: 'Mossgrove',
    seed: 1001,
    cam: 'island:Mossgrove',
    time: 13,
    simt: 2,
    sets: ['dev'],
  },
  {
    id: 'D-mobile',
    title: 'Mobile 390×844',
    seed: 1001,
    cam: 'overview',
    time: 15,
    simt: 2,
    width: 390,
    height: 844,
    sets: ['dev'],
  },
  // ---- Phase 3 campuses (TASK-309): one village framing per department (findIsland matches the
  // theme id), a T3 desk close-up over the Coding dev office (front opening, typing bots) and a
  // night campus (screens and rack LEDs glow).
  ...CAMPUS_THEMES.map(([theme, name]): ShotPreset => ({
    id: `D-campus-${theme}`,
    title: `Campus · ${name}`,
    seed: 1001,
    cam: `village:${theme}`,
    time: 14,
    simt: 2,
    sets: ['dev'],
  })),
  {
    id: 'D-desk',
    title: 'Desk · Coding',
    seed: 1001,
    // seed 1001 devPod (lot 12, door facing SE, seated workers on low and medium): from outside its front, ~6 u (T3)
    cam: DESK_CAM,
    time: 14,
    simt: 2,
    deltaT: 0.2,
    sets: ['dev'],
  },
  {
    id: 'D-campus-night',
    title: 'Campus night · Coding',
    seed: 1001,
    cam: 'village:coding',
    time: 22,
    simt: 2,
    sets: ['dev'],
  },
  // ---- HUD review (TASK-182): dock + dial, settings sheet, photo bar on desktop and phones
  {
    id: 'D-hud',
    title: 'HUD',
    seed: 1001,
    cam: 'overview',
    time: 15,
    simt: 2,
    hud: true,
    sets: ['dev'],
  },
  {
    id: 'D-photo',
    title: 'Photo mode',
    seed: 1001,
    cam: 'island:Hearthholm',
    time: 17.75,
    simt: 2,
    hud: true,
    panel: 'photo',
    sets: ['dev'],
  },
  {
    id: 'D-mobile-hud',
    title: 'Mobile HUD 390×844',
    seed: 1001,
    cam: 'overview',
    time: 21,
    simt: 2,
    width: 390,
    height: 844,
    hud: true,
    panel: 'settings',
    sets: ['dev'],
  },
  {
    id: 'D-land-hud',
    title: 'Landscape phone 844×390',
    seed: 1001,
    cam: 'overview',
    time: 15,
    simt: 2,
    width: 844,
    height: 390,
    hud: true,
    sets: ['dev'],
  },
  {
    id: 'D-land-photo',
    title: 'Landscape photo 844×390',
    seed: 1001,
    cam: 'island:Hearthholm',
    time: 15,
    simt: 2,
    width: 844,
    height: 390,
    hud: true,
    panel: 'photo',
    sets: ['dev'],
  },
  // ---- sandbox edits (TASK-221): `pnpm shots edit`. Logs on seed 1001 generated with
  // `encodeLog` (world/edit.ts); re-recorded for the Phase 3 layout (TASK-309: moved with their
  // island, rejected placements dropped) and the theme-first world (TASK-380: one pine that now
  // collides with a Coding fixture dropped) — hill: 6 raises + smooth + meadow top behind the HQ
  // village; flood: 16 lowers on the harbour bay's east shore and south arm; meadow: smooth + meadow paint + 19 props on the Coding island
  // (pines, rocks, flowers, bushes, a mushroom; macro view so the T3 flowers show); mixed: a
  // flattened islet in the Palmlagoon lagoon (sand + meadow, cottage, palms, bush, rock, lily pad)
  // and a channel lowered through the ring. The panel shots reuse them.
  {
    id: 'E-panel',
    title: 'Edit panel · place',
    seed: 1001,
    cam: '109.1,70,-86.6,95.1,6,-186.6',
    time: 15,
    simt: 2,
    width: 1280,
    height: 720,
    hud: true,
    panel: 'edit:prop',
    edit: EDIT_LOGS.hill,
    sets: ['edit'],
  },
  {
    id: 'E-hill',
    title: 'Hill behind the village',
    seed: 1001,
    cam: '109.1,70,-86.6,95.1,6,-186.6',
    time: 15,
    simt: 2,
    edit: EDIT_LOGS.hill,
    sets: ['edit'],
  },
  {
    id: 'E-flood',
    title: 'Flooded bay',
    seed: 1001,
    cam: 'island:Hearthholm',
    time: 15,
    simt: 2,
    edit: EDIT_LOGS.flood,
    sets: ['edit'],
  },
  {
    id: 'E-meadow',
    title: 'Meadow + 19 props',
    seed: 1001,
    cam: '71.5,23,69.1,59.5,6,37.1',
    time: 14,
    simt: 2,
    edit: EDIT_LOGS.meadow,
    sets: ['edit'],
  },
  {
    id: 'E-mixed',
    title: 'Lagoon islet + channel',
    seed: 1001,
    cam: 'island:Palmlagoon',
    time: 15,
    simt: 2,
    edit: EDIT_LOGS.mixed,
    sets: ['edit'],
  },
  {
    id: 'E-mobile-panel',
    title: 'Edit panel 390×844',
    seed: 1001,
    cam: 'overview',
    time: 15,
    simt: 2,
    width: 390,
    height: 844,
    hud: true,
    panel: 'edit',
    edit: EDIT_LOGS.flood,
    sets: ['edit'],
  },
  {
    id: 'E-land-panel',
    title: 'Edit panel 844×390 · paint',
    seed: 1001,
    cam: 'overview',
    time: 15,
    simt: 2,
    width: 844,
    height: 390,
    hud: true,
    panel: 'edit:paint',
    edit: EDIT_LOGS.mixed,
    sets: ['edit'],
  },
  // ---- opening sequence every 0.5 s (ART_BIBLE §8 timing review): `pnpm shots intro`
  ...Array.from({ length: 21 }, (_, i): ShotPreset => ({
    id: `I-${(i * 0.5).toFixed(1)}`,
    title: `Intro ${(i * 0.5).toFixed(1)} s`,
    seed: 1001,
    cam: 'overview',
    time: 15,
    hud: true,
    introt: i * 0.5,
    sets: ['intro'],
  })),
  // ---- zoom ladder (D-031, TASK-374): `pnpm shots ladder [--only=L-coding,L-pairs-coding]`.
  // L-<theme>: the far → near ladder; L-pairs-<theme>: each tier / LOD boundary at 1.06 b and 0.94 b.
  ...CAMPUS_THEMES.flatMap(([theme, name]): ShotPreset[] => {
    const l = FRAMING.ladder;
    const base = { seed: 1001, cam: `ladder:${theme}`, time: 14, simt: 2 };
    return [
      {
        ...base,
        id: `L-${theme}`,
        title: `Ladder · ${name}`,
        sets: ['ladder'],
        ladder: { island: theme, dists: [...l.dists], pitch: l.pitch, pairs: [] },
      },
      {
        ...base,
        id: `L-pairs-${theme}`,
        title: `Boundary pairs · ${name}`,
        sets: ['ladder'],
        ladder: { island: theme, dists: [], pitch: l.pitch, pairs: [...l.pairs] },
      },
    ];
  }),
];

export const SET_DEFAULTS: Record<
  ShotSet,
  { width: number; height: number; quality: 'low' | 'medium' | 'high' }
> = {
  ci: { width: 640, height: 360, quality: 'low' },
  dev: { width: 960, height: 540, quality: 'low' },
  wow: { width: 1920, height: 1080, quality: 'medium' },
  intro: { width: 640, height: 360, quality: 'low' },
  edit: { width: 960, height: 540, quality: 'low' },
  // zoom-ladder metric frames (TASK-374 adds the L-* presets)
  ladder: { width: 960, height: 540, quality: 'low' },
};

export function shotsForSet(set: ShotSet): ShotPreset[] {
  return SHOT_PRESETS.filter((s) => s.sets.includes(set));
}

export function findShot(id: string): ShotPreset | undefined {
  return SHOT_PRESETS.find((s) => s.id === id);
}
