/**
 * Capture presets (ART_BIBLE §11 + ARCHITECTURE §9). Pure data: the app resolves
 * `?shot=<id>` here, the shots harness picks sets from here. W-seeds pinned by TASK-113, re-themed
 * by TASK-380 (every seed rolls all seven departments, D-024): W5 DevOps forge (1001), W6 QA lagoon
 * (4004), W7 Coding turbines (1001), W10 Design Atelier Tree (6006); 2024 Beacon Rock (W4).
 */
import type { EditToolKind } from './edit-ui.ts';
import { FRAMING } from './camera.ts';

export type ShotSet = 'ci' | 'dev' | 'wow' | 'intro' | 'edit' | 'ladder' | 'live';

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
  /**
   * Living close-up check (M14c, set 'live'): the `deltaT` pair's motion inside this crop
   * (normalised x0, y0, x1, y1 of the frame) is measured with `motionMetric` (scripts/ladder-metrics.ts).
   */
  live?: { crop: [number, number, number, number] };
  sets: ShotSet[];
}

/** Encoded edit logs (seed 1001) of the `edit` set; regenerate with `encodeLog` when the codec changes. */
export const EDIT_LOGS = {
  hill: 'AekHAAgA4lXAUYAFgA4AwAE_AAAAwAFAAAAA_wFAAAAAgAEfAAAAPz-_Av8FAwAggAL_BQQAH58CAQ',
  flood:
    'AekHABAB4l2AYMADgAwBgAKAAgAAAYABvwIAAAH_AYAFAAABwAP_AQAAAb8IwAcAAAHAAkAAAAHAAr8BAAABf_8IAAABgAKAAgAAAYABvwIAAAH_AYAFAAABwAP_AQAAAb8IwAcAAAHAAkAAAAHAAr8BAAA',
  meadow:
    'AekHBQRwaW5lC3JvY2tDbHVzdGVyBmZsb3dlcgRidXNoDWdpYW50TXVzaHJvb20VA6I61IgBgAS0AgQAAAABBIACoAG_AQE1AADFAZcBsRGKAgE1AgC_AZkB9Qf3AQE1AABsZZAChgIBNQAApQKOA94PngIANQABjgS7A_0X6QEANQABmQKUBIgc7QEBNQABfPED6w78AQE1AAErlgOtGd8BATUAAiTdAfAEjAIANQAChgEExhCGAgA1AAIHPM8a-wEANQACInfnF9oBATUAAlFiyRD0AQE1AANTZd0V-wEBNQAD6gGQAbESigIANQADxQFMiRiTAgA1AAOuAdsBvQaPAgE1AARH5gH-Go4CAA',
  mixed:
    'AekHBQdjb3R0YWdlBHBhbG0GZmxvd2VyC2xhbnRlcm5Qb3N0BWJlbmNoFgatzn8CpH76NKACgCACAAAAAAMAAGDLHQQAAJ8BAQLAAYACX8wTAmAAAP8JAgAAAAACYAAAmQcCAAAAAAJQAB_LAQIAAAAAA68BAGCZAQQgAD8DFQAA3wKvAocDgAIVAAHAAXDjDpoCFQABvwLPAewSjQIVAALgAfABxAGAAhUAAj8QzwaAAhUAAj8f2wuAAhUAA6ABTwCAAhUABM8BMIcDgAI',
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

/**
 * L-live-<theme> cameras (M14c, seed 1001, raw `eye → target`): T3 close-ups on each campus' busiest
 * spot (life agent's TASK-383 picks; Coding, DevOps, Design re-aimed at the bot clusters in the
 * M14c verification), clear of canopies. Re-pin when the layout changes. TASK-396 (the M17b bluffs
 * raised Coding ≈ 4 u): Coding looks over the dev office and the pod beside it (typing pair,
 * walking bots, code screens; the old eye saw a tree and aimed under the plateau, 2.8 %). TASK-405:
 * DevOps looks over the harbour quay — the build-hall rack sheds, crates on the CI/CD belt into the
 * container yard, yard bots (the old west-shore rack yard moved onto the harbour shelf).
 */
const LIVE_CAMS: Record<(typeof CAMPUS_THEMES)[number][0], string> = {
  hq: '-66.04,14,-13.36,-46.04,1.4,-16.36',
  qa: '89.4,23,-169.44,101.1,9,-157.14',
  design: '-93.87,30,-177.26,-100.87,17,-159.26',
  coding: '-105.43,17,138.51,-116.43,11,148.51',
  // TASK-402b: over the glasshouse row and the base pods (bots at the terrariums, mast and pods)
  research: '137.71,15,118.1,123.71,8,108.1',
  devops: '164.75,7.5,21.63,174.75,2.6,9.63',
  marketing: '-259.02,15,12.2,-235.02,6,4.2',
};

/** Warm-up per live campus (s; default 6): picked for the most bots in motion near the target. */
const LIVE_SIMT: Partial<Record<(typeof CAMPUS_THEMES)[number][0], number>> = { coding: 5, qa: 4 };

/** The campus crop of the live pairs: the target sits at the frame centre (normalised x0, y0, x1, y1). */
const LIVE_CROP: [number, number, number, number] = [0.15, 0.1, 0.85, 0.9];

/**
 * D-story-* cameras (raw `eye → target`, seed 1001; TASK-432): [id, title, cam, game hour, warm-up s].
 * Each looks at a story spot whose person is a tableau bot (content/life.ts TABLEAU).
 */
const STORY_SHOTS: readonly (readonly [string, string, string, number, number])[] = [
  ['signpostDebate', 'Signpost debate · HQ', '-51.04,8.5,-3.82,-48.24,2,-9.62', 14, 6],
  ['hammockNap', 'Hammock nap · Coding', '-106.45,13.3,181.31,-105.67,10.6,176.16', 14, 6],
  ['containerNap', 'Container nap · DevOps', '153.71,8.93,-11.08,158.75,6.23,-12.37', 14, 6],
  ['lighthouseSelfie', 'Selfie · Marketing', '-189.14,28.37,-21.87,-184.03,25.67,-22.88', 14, 6],
  ['gafferTurn', 'Gaffer · Design', '-97.6,24.75,-175.95,-99.57,22.05,-171.13', 14, 6],
  ['teaTime', 'Tea time · Research', '107.45,11.18,90.4,107.05,8.48,95.58', 14, 6],
  ['onsenCapybara', 'Onsen · DevOps', '164.62,11.23,-28.96,161.64,8.53,-33.22', 14, 6],
] as const;

/**
 * D-critter-* cameras (raw `eye → target`, seed 1001; TASK-433): the animals of the story spots at T3
 * (life-spot-critters.ts SPOT_CRITTERS): [id, title, cam, game hour, warm-up s].
 */
const CRITTER_SHOTS: readonly (readonly [string, string, string, number, number])[] = [
  ['cat-timetable', 'Cat on the timetable · HQ', '-58.05,5.6,-7.71,-54,3.35,-10.58', 14, 6],
  [
    'capybara-onsen',
    'Capybara in the onsen · DevOps',
    '164.29,8.77,-35.94,162.63,7.93,-34.2',
    14,
    6,
  ],
  ['fox-orb', 'Fox and the glass orb · Design', '-105.87,23,-166.72,-109.87,21.5,-170.12', 14, 6],
  ['owl-night', 'Owl at the box · Research', '129.48,9.76,111.3,126.33,8.89,109.77', 22, 6],
  ['ladybugs-zoo', 'Ladybugs at the Bug Zoo · QA', '83.29,12.4,-159.49,80.1,9.01,-165.72', 14, 6],
  [
    'gull-bowl',
    'Gull in the seconds bowl · Design',
    '-94.91,24.57,-174.41,-98.41,22.65,-174.46',
    14,
    6,
  ],
  [
    'duck-crossing',
    'Duck family crossing · Coding',
    '-102.76,13.99,161.27,-105.16,9.59,153.63',
    14,
    10,
  ],
] as const;

/** W7 camera (raw, seed 1001 Coding; TASK-380), re-pin when that layout changes. */
const W7_CAM = '-165.43,20,145.51,-115.43,13,165.51';

/** D-devops-* (raw, seed 1001 Ember Works; TASK-405), re-pin when that layout changes. */
const DEVOPS_CAM = '116.75,92,67.09,188.75,2,-20.91';
/** D-devops-terraces (raw, seed 1001): the data center terraces from the sea north-west of them. */
const DEVOPS_TERRACE_CAM = '122.75,30,-82.91,164.75,8,-54.91';
/** D-devops-harbour (raw, seed 1001): the container yard, CI/CD belt, pier and a cargo ship. */
const DEVOPS_HARBOUR_CAM = '190.75,20,35.09,164.75,2,5.09';
/** D-culture-devops (raw, seed 1001; TASK-422): the onsen, quay and gate from the lee sea. */
const DEVOPS_CULTURE_CAM = '116.75,36,-58.37,164.75,6,-24.37';
/** D-culture-devops-onsen (raw, seed 1001; TASK-422): the onsen deck and bath house close up. */
const DEVOPS_ONSEN_CAM = '143.75,13,-28.37,161.75,7.5,-35.37';

/**
 * W9 Research hero (raw, seed 1001 Observatory University; TASK-402b), re-pin when the layout
 * changes. TASK-471 (hub layout): Research now sits NE of HQ, so the look comes from the
 * south-west (the channel off HQ) toward the open sea behind the summit; the old ENE look had
 * HQ's plateau in frame (841 k triangles > 800 k).
 */
const W9_CAM = '72,21,52,116,15,100';

/** W14 campus at golden hour (raw, seed 1001; TASK-402b, re-aimed from the SW in TASK-471): pier, quad, gardens and the summit observatory, open sea behind. */
const W14_CAM = '59,46,70,112,5,108';

/**
 * D-desk camera (raw `x,y,z,tx,ty,tz`), re-pin when the seed 1001 layout changes (TASK-396: +4 u
 * for the raised Coding plateau, ground ≈ 9.5). TASK-403: swung 18° toward the open sea (same
 * devPod and desks) — the old look had the Media Rock's fair and trees at the frame's edge, and
 * every per-island LOD0 group whose bounds touch the frustum costs a call (202 > the low 170).
 */
const DESK_CAM = '-116.33,13,142.55,-118.93,10.2,145.51';

/**
 * Hearthholm beach macro (raw, seed 1001; D-macro and W8, TASK-396): the `macro-beach` orbit now
 * faces the clocktower's wall (TASK-393 height), so a fixed T3 look west from the HQ quad over the
 * coffee kiosk, flower bed and crab to the reeds, foam line and sea. Re-pin when the layout changes.
 */
const MACRO_CAM = '-40.24,7.4,-15.12,-49.74,2,-11.02';

/** D-culture-hq cameras (raw, seed 1001 Harbour Guild; TASK-420), re-pin when HQ's layout changes. */
const HQ_CULTURE_CAM = '-27.54,33,23.68,-46.04,1.2,-12.82';
const HQ_CULTURE_NIGHT_CAM = '-34.04,12,6.18,-45.04,1.2,-12.82';

/**
 * D-move-* (TASK-431 culture movers): close frames with a deltaT pair so the ambient motion (rings,
 * flutter, ants, confetti tumble) shows between the two frames; the ritual pose (kites, flag,
 * container, balloon) comes from the game hour. Raw cameras, seed 1001 (Research: 2024, the seed
 * 1001 academy has no cart). Re-pin when the layouts change.
 */
/** Seconds into the day-clock ritual of each frame (rhythm.ts: kiteDay 60 s, greenLight 30 s, …). */
const MOVE_SIMT: Record<string, number> = {
  hq: 4,
  coding: 22,
  devops: 8,
  marketing: 3,
  'marketing-night': 6,
  qa: 12,
  research: 12,
};
const MOVE_SHOTS: readonly ShotPreset[] = (
  [
    ['hq', 'Harbour Guild · 06:00 bell fanfare', 1001, '-59.04,4.5,-19.82,-52.44,2.8,-16.42', 6],
    ['hq-crane', 'Harbour Guild · crane sack', 1001, '-56.94,5.5,-4.12,-49.94,2,-4.12', 9],
    ['coding', 'Wind Gardens · 14:00 Kite Day', 1001, '-102.43,18,154.05,-104.43,17,179.05', 14],
    [
      'devops',
      'Ember Works · 21:00 Release Night lift + horn',
      1001,
      '152.15,8,22.93,163.75,4,6.63',
      21,
    ],
    ['marketing', 'Carnival · 17:30 confetti show', 1001, '-251.02,9,6.74,-239.02,6,-9.26', 17.5],
    [
      'marketing-night',
      'Carnival · 20:30 searchlights',
      1001,
      '-261.02,12,-27.26,-237.02,16,-9.26',
      20.5,
    ],
    ['qa', 'Inspectors · 16:00 green-light flag', 1001, '108.1,11.5,-157.3,115.1,9.5,-157.3', 16],
    ['qa-ants', 'Inspectors · ant trail', 1001, '86.6,10.2,-162.8,84.1,8,-165.3', 12],
    [
      'design-noon',
      'Glass & Light · 12:00 prism patches',
      1001,
      '-77.87,17,-178.92,-69.37,8.5,-178.92',
      12,
    ],
    [
      'design-golden',
      'Glass & Light · 17:30 prism patches',
      1001,
      '-77.87,17,-178.92,-69.37,8.5,-178.92',
      17.5,
    ],
    [
      'research',
      'Star Academy · 06:00 weather balloon',
      2024,
      '-138.85,14,-77.71,-152.55,12,-94.11',
      6,
    ],
  ] as const
).map(([id, title, seed, cam, time]) => ({
  id: `D-move-${id}`,
  title,
  seed,
  cam,
  time,
  simt: MOVE_SIMT[id] ?? 4,
  deltaT: id === 'marketing-night' ? 1 : 0.7,
  quality: 'medium' as const,
  sets: ['dev' as const],
}));

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
    // TASK-396: the ×1.7 lighthouse (TASK-393) left the `island:` fit (island sphere only), so a
    // raw T1 look from the north-west at 140 u: Beacon Rock in the left third, the whole lighthouse
    // against the night sky, two sea stacks and the lit landing; `simt` 3 puts the beam broadside
    seed: 2024,
    cam: '108.6,57.5,4.27,196.3,26,-100.23',
    time: 21.5,
    simt: 3,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W5',
    title: 'Forge & Steam',
    // DevOps (TASK-380): campus framing — steaming cooling towers, the terraced data centers on
    // the cone, crater steam, warm afternoon light. A low horizon look (raw cam over the west
    // shore) measured 281–373 calls on medium (other islands at T2 + shadows) > D-028 255.
    seed: 1001,
    cam: 'village:devops',
    time: 16.5,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W6',
    title: 'QA Test Factory',
    // QA (TASK-401, was the TASK-380 lagoon): the raised factory plateau on its earth walls, the
    // yard with sawtooth hangars, conveyor bridges and the loop track, the check tower
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
    cam: MACRO_CAM,
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
    title: 'Observatory University',
    // TASK-402b (was the Lonely Palm / Biodome hero): a low look from the east-north-east, the
    // summit observatory against the evening sky over the base pods, glasshouses and dishes
    seed: 1001,
    cam: W9_CAM,
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
  {
    id: 'W11',
    title: 'Concept',
    // M17b (TASK-390…392): the low 3/4 "concept art" look over the whole archipelago, where island
    // walls and landmarks overlap in depth: the fitted `postcard` pose the intro ends on (TASK-392).
    seed: 1001,
    cam: 'postcard',
    time: 15.5,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W13',
    title: 'Falls',
    // M17b (TASK-395): from the sea, a Mossgrove waterfall off the bluff lip into its foam disc
    // and mist (seed 1001, raw `eye → target`; re-pin when the layout changes); the flow scrolls
    // between the two frames
    seed: 1001,
    cam: '-32.07,13,-146.16,-63.87,4.1,-168.26',
    time: 10.5,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    deltaT: 0.5,
    sets: ['wow'],
  },
  {
    id: 'W14',
    title: 'Campus Golden Hour',
    // TASK-402b: Observatory University from the east at golden hour, over the base pods and the
    // glasshouses to the parterre garden, the quad and the summit observatory with its dishes;
    // open sea behind (no other campus in frame, D-028 calls)
    seed: 1001,
    cam: W14_CAM,
    time: 17.75,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W15',
    title: 'Relay Night',
    // TASK-450/453a: the Launch Day Relay from the W11 postcard pose at 21:00 (+105 s: the airship has left the top edge, the beam island and QA tick lit; was +45 s, airship 85% cropped; HQ, DevOps,
    // QA and Coding still glowing, Marketing's flash on top); same frame as W11
    seed: 1001,
    cam: 'postcard',
    time: 21,
    simt: 105,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W16',
    title: 'Harbour Guild Morning',
    // TASK-450: the Harbour Guild at 09:00 (the fog burns off after 08:30; earlier it greys the
    // frame), low over the bay (raw): the pier root with awning + timetable, crates, pennant
    // lines and banners as the subject, the whole clock tower behind it. TASK-478 re-frame (the
    // TASK-466 plaza moved the pier root out of the old look and parked a balloon on the tower
    // crown): from over the bay north-west of the pier, the ferry office / awning at the pier root
    // in front, gates and pennant lines on the plaza, the clock tower whole with sky above it
    seed: 1001,
    cam: '-45,16,25,-32,7,-21',
    time: 9,
    simt: 15,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W17',
    title: 'Jewel Tree Night',
    // TASK-450: Design at night, the Atelier Tree's canopy vitray lit from inside (D-stained-night pose)
    seed: 1001,
    cam: '-117.87,52,-144.72,-91.87,33,-154.72',
    time: 21,
    simt: 4,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W18',
    title: 'UV Bug Hunt',
    // QA at night (21:30): the loop track and yard rim lit violet by the UV lamp posts (UV pools,
    // TASK-440), the "BUGS: 0" scoreboard, dummy on its bench, stamp desk and clipboard wall at the
    // Hall of Checks with its lit tick badges. The 16:00 green-light framing never read as a postcard
    // (empty lawn, tiny flag), so the QA hero is the night hunt.
    seed: 1001,
    cam: '83.1,27,-153.6,97.1,7,-171.6',
    time: 21.5,
    simt: 4,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W19',
    title: 'Prism Hour',
    // TASK-450: Design at 17:30 (raw). TASK-470 re-frame: the TASK-467 Glass Conservatory took the
    // glade and the old north-east look had the Atelier Tree in front of it; now from the
    // north-north-west, sun on the right: the conservatory whole beside the tree, the glasshouse
    // row behind, the spray rainbow off the west bluff on the left, the balloon above the tree
    seed: 1001,
    cam: '-134,50,-94,-112,26,-160',
    time: 17.5,
    simt: 4,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  // ---- M20 wow shots (TASK-470): the HQ Seven Gates and the Design Glass Conservatory
  {
    id: 'W20',
    title: 'Compass Star',
    // The HQ compass mosaic (TASK-468 ground art) from above: the seven culture-coloured rays and
    // the gates at the street mouths, clock tower, stalls, bay sand on the left (refined
    // D-compass-top: centred on the plaza + gates, 82 u up)
    seed: 1001,
    cam: '-35,82,-8,-34,1.4,-31',
    time: 15.5,
    simt: 4,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W21',
    title: 'Conservatory Prism Hour',
    // Design's Glass Conservatory at golden hour (seed 6006: three prism arches on its Prism Walk,
    // 1001 has one) from behind the conservatory looking down the walk to the sea: the faceted
    // dome in front, the glasshouse rainbow row, two arches with their rainbow pools thrown away
    // from the sun, the Atelier Tree, two spray rainbows and open sea behind (≈ 160 calls)
    seed: 6006,
    cam: '94,52,-116,126,16,-168',
    time: 17.75,
    simt: 4,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W22',
    title: 'Seven Gates Night',
    // HQ at 21:00 +5 s, HQ's turn in the Launch Day Relay: the compass plaza lit warm, gate
    // lanterns at the street mouths, the clock tower and the post yard; the semaphore on the
    // summit sits off-frame (66 u from the plaza: a frame holding both reads as dark, empty land)
    seed: 1001,
    cam: '-36,55,25,-20,4,-25',
    time: 21,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  // ---- M22 wow shots (TASK-484): the five-island quick wins
  {
    id: 'W23',
    title: 'Slalom Afternoon',
    seed: 1001,
    cam: '175,22,-205,110,6,-160',
    time: 15,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W24',
    title: 'Lantern Zigzag',
    seed: 1001,
    cam: 'village:devops',
    time: 20,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W25',
    title: 'Carpet Night',
    seed: 2024,
    cam: '240,30,-80,180,12,-112',
    time: 20,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W26',
    title: 'Test Firing',
    seed: 1001,
    cam: '66,16,140,100,7,118',
    time: 12,
    simt: 1.5,
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
    // TASK-396: the `shore` orbit looks through the taller clocktower; a raw 40 u look west over
    // the kiosk sandbar, its foam bands and the ferry pier (tower just out of frame, right)
    cam: '-15.44,21,-0.36,-50.04,1,-0.36',
    time: 14,
    simt: 2,
    deltaT: 2,
    sets: ['ci', 'dev'],
  },
  {
    id: 'D-macro',
    title: 'Macro',
    seed: 1001,
    cam: MACRO_CAM,
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
    // TASK-402b: the Research campus is big enough for the village fit again (was a raw cam on
    // the TASK-400 crater)
    cam: `village:${theme}`,
    time: 14,
    simt: 2,
    sets: ['dev'],
  })),
  {
    id: 'D-desk',
    title: 'Desk · Coding',
    seed: 1001,
    // seed 1001 devPod at (91.1, 20.4) (door facing SE, seated workers on low and medium): from outside its front, ~6 u (T3)
    cam: DESK_CAM,
    time: 14,
    simt: 2,
    deltaT: 0.2,
    sets: ['dev'],
  },
  {
    id: 'D-pool-ducks',
    title: 'Pool · duck family (Coding)',
    seed: 1001,
    // seed 1001: the family paddles on the pool centred (110.4, 4.6), not its twin at (101.5, -4); steep T3 look down
    // (TASK-402b: the seed 1001 layout moved 16.54 u in −z)
    cam: '-100.03,15,151.01,-100.03,5.4,146.61',
    time: 11,
    simt: 3,
    // low has no ducks (LIFE_PLAN.low.ducks = 0), the dev set defaults to low
    quality: 'high',
    sets: ['dev'],
  },
  // Sky craft close looks (TASK-404). Raw cams aimed at the closed-form orbit position at simt 2
  // (seed 1001, medium): balloon 0 at (66.4, 60.6, -7.1), the airship at (-144.4, 96, 54.5) heading
  // ≈ +z, seen from its +x flank. Re-pin if `skyCraftPaths` or the seed layout changes.
  {
    id: 'D-sky-craft',
    title: 'Sky craft · steampunk balloon (day)',
    seed: 1001,
    cam: '-120.03,63,161.05,-144.03,58,134.95',
    time: 12,
    simt: 2,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-sky-basket',
    title: 'Sky craft · basket, burner and sandbags',
    seed: 1001,
    cam: '-124.43,67,158.05,-144.03,51.5,134.95',
    time: 12,
    simt: 2,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-sky-airship',
    title: 'Sky craft · steampunk airship (day)',
    seed: 1001,
    cam: '-111.47,88,-152.72,-95.87,94,-188.72',
    time: 15,
    simt: 2,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-sky-night',
    title: 'Sky craft · lit windows and burner flame (night)',
    seed: 1001,
    cam: '-111.47,88,-152.72,-95.87,94,-188.72',
    time: 22,
    simt: 2,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-sky-balloon-night',
    title: 'Sky craft · burner flame (night)',
    seed: 1001,
    cam: '-120.03,63,161.05,-144.03,58,134.95',
    time: 22,
    simt: 2,
    quality: 'medium',
    sets: ['dev'],
  },
  // TASK-441 sky culture: every balloon belongs to a culture (gores = its accent, basket flies its
  // pennant); cams are on the balloon's local +z flank (pennants face +-z) at 30 u, seed 1001 t = 2.
  // Re-pin if `skyCraftPaths` or the seed layout changes.
  {
    id: 'D-sky-hype',
    title: 'Hype Fleet · Star Academy balloon, star pennant',
    seed: 1001,
    cam: '-201.92,46.1,-1.26,-196.72,44,-37.76',
    time: 12,
    simt: 2,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-sky-hype-hq',
    title: 'Hype Fleet · Harbour Guild balloon, swallowtail pennant',
    seed: 1001,
    cam: '82.75,37,-71.37,113.25,35,-46.87',
    time: 12,
    simt: 2,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-sky-orchestrator',
    title: 'Orchestrator airship · seven-pennant tail string (day)',
    seed: 1001,
    cam: '-82.77,97.6,-224.12,-101.67,99.6,-210.32',
    time: 15,
    simt: 2,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-sky-fleet',
    title: 'Hype Fleet · four balloons over the archipelago',
    seed: 1001,
    cam: 'overview',
    time: 12,
    simt: 2,
    quality: 'medium',
    sets: ['dev'],
  },
  // Launch Show: 17:30 + 8 s the launch balloon inflates beside the Carnival mast; 24 s later it is
  // lifting off toward the fleet orbit (culture clock runs on sim time under freeze).
  {
    id: 'D-sky-launch',
    title: 'Launch Show · balloon inflating at the mast, then lifting off',
    seed: 1001,
    cam: '-229.02,5,37.74,-239.02,19,9.74',
    time: 17.5,
    simt: 8,
    deltaT: 24,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-qa-night',
    title: 'Test Factory night · QA',
    // TASK-401: hangar windows, sawtooth glazing and the check sign lit
    seed: 1001,
    cam: 'village:qa',
    time: 22,
    simt: 2,
    sets: ['dev'],
  },
  {
    id: 'D-devops-campus',
    title: 'Ember Works · DevOps',
    // TASK-405: high from the south-west so the three facilities share the frame: data center
    // terraces (left), the harbour quay (centre), the foundry step (right, past the cone)
    seed: 1001,
    cam: DEVOPS_CAM,
    time: 15,
    simt: 6,
    sets: ['dev'],
  },
  {
    id: 'D-devops-terraces',
    title: 'Data center terraces · DevOps',
    // density pass: the two data center levels, the cooling towers, lodges and sheds around them
    seed: 1001,
    cam: DEVOPS_TERRACE_CAM,
    time: 11,
    simt: 6,
    sets: ['dev'],
  },
  {
    id: 'D-devops-harbour',
    title: 'Deployment harbour · DevOps',
    // TASK-405: T2 over the quay: gantry crane, stacks, control tower, rack sheds + belt, ships
    seed: 1001,
    cam: DEVOPS_HARBOUR_CAM,
    time: 10,
    simt: 6,
    sets: ['dev'],
  },
  {
    id: 'D-devops-night',
    title: 'Ember Works night · DevOps',
    // TASK-405: furnace mouths, lava troughs, forge coals, tower cab and cottage windows lit
    seed: 1001,
    cam: DEVOPS_CAM,
    time: 22,
    simt: 6,
    sets: ['dev'],
  },
  {
    id: 'D-marketing-campus',
    title: 'Media Rock terraces · Marketing',
    // TASK-403: from the lee sea, the stack stepping down — summit boulevard and giant screen,
    // the campus ledges (antenna, offices, shops), the fair ground with the ferris wheel. Raw
    // cam on the seed 1001 layout; re-pin when it changes.
    seed: 1001,
    cam: '-269.02,46,22.2,-213.02,8,-3.8',
    time: 10.5,
    simt: 4,
    sets: ['dev'],
  },
  {
    id: 'D-marketing-night',
    title: 'Media Rock night · Marketing',
    // TASK-403: fair lights, the wheel's pods and rim bulbs, tent lanterns, the giant screen and
    // the antenna lamps on the window / emissive path
    seed: 1001,
    cam: '-257.02,24,18.2,-231.02,6,2.2',
    time: 21.5,
    simt: 4,
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
  {
    id: 'D-culture-devops',
    title: 'Kor Demircileri · DevOps',
    // TASK-422: T2 (~70 u) from the lee sea at shift's end: onsen deck + bath house on the pool
    // rim, lava lanterns down the quay, the harbour gate. Raw cam on the seed 1001 layout.
    seed: 1001,
    cam: DEVOPS_CULTURE_CAM,
    time: 17.75,
    simt: 6,
    sets: ['dev'],
  },
  {
    id: 'D-culture-devops-onsen',
    title: 'Onsen night · DevOps',
    // TASK-422: across the pool from the sea side: the onsen deck (capybara spot), the bath house,
    // lava lanterns lit at dusk
    seed: 1001,
    cam: DEVOPS_ONSEN_CAM,
    time: 20,
    simt: 6,
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
  // ---- M19 cultures (wave 2): one T2 look per island culture + a story / night close-up
  {
    id: 'D-culture-coding',
    title: 'Culture · Coding Wind Gardens (T2, 14:00)',
    // seed 1001 Millbrook (TASK-421): the Tech Park lawn (pergola desks, giant duck), the chime
    // pagoda turbine with its hammock and the kite field north of it, from the south-east
    seed: 1001,
    cam: '-60.43,46,172.05,-106.43,9.5,162.05',
    time: 14,
    simt: 3,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-culture-coding-desks',
    title: 'Culture · Coding pergola desks and the bug board (T3, 15:00)',
    // seed 1001: a lawn strip's pergola desks, mug crate and the bug whiteboard with its rubber
    // duck (story `bugDoodle`), seen from the paved spine over the pool with the rubber ducks
    seed: 1001,
    cam: '-97.43,20,136.05,-104.43,9.8,147.05',
    time: 15,
    simt: 3,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-culture-hq',
    title: 'Harbour Guild morning · HQ',
    // TASK-420: T2 from the bay over the ferry pier: awning + timetable at the pier root, crane,
    // seven-colour crates, signpost, pennant lines up the harbour lane
    seed: 1001,
    cam: HQ_CULTURE_CAM,
    time: 8,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-culture-marketing',
    title: 'Culture · Marketing Carnival Broadcasters (T2, 17:30)',
    // seed 1001 Media Rock (TASK-423): the fair at golden hour from the lee sea: popcorn carts,
    // confetti cannons and searchlights at the stage, prize booths and balloon masts by the wheel,
    // the SHOW sign at the pier side, the media campus ledges above
    seed: 1001,
    cam: '-283.02,32,18.74,-231.02,8,-7.26',
    time: 17.5,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-culture-hq-night',
    title: 'Harbour Guild evening · HQ',
    // TASK-420: closer over the pier root at 20:30 (lit timetable, awning lantern, the quad beyond)
    seed: 1001,
    cam: HQ_CULTURE_NIGHT_CAM,
    time: 20.5,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-culture-marketing-night',
    title: 'Culture · Marketing fair night (T3, 21:30)',
    // seed 1001: from the pier side, the lit SHOW marquee, the popcorn carts, the prize booth and
    // the searchlights behind the stage, the wheel's bulbs and the balloon bunch beyond
    seed: 1001,
    cam: '-261.02,18,-29.26,-237.02,5,-7.26',
    time: 21.5,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-culture-qa',
    title: 'Culture · QA Inspectors (T2, 12:00 siren test)',
    // seed 1001 Palmlagoon (TASK-424): over the factory yard to the Hall of Checks (tick badges,
    // stamp desk, clipboard wall), the dummy benches, the scoreboards and UV lamps round the loop
    // track, the cone pyramid; the check tower with its flag mast behind
    seed: 1001,
    cam: '67.1,38,-139.6,101.1,8,-167.6',
    time: 12,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-culture-qa-night',
    title: 'Culture · QA bug hunt night (UV lamps, 21:30)',
    // seed 1001: the loop track and the yard rim lit purple by the UV lamp posts, the "BUGS: 1"
    // scoreboard and its jar, the Bug Zoo beyond
    seed: 1001,
    cam: '83.1,27,-153.6,97.1,7,-171.6',
    time: 21.5,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-culture-research',
    title: 'Culture · Research Star Academy (T2, 17:45)',
    // seed 1001 Observatory University (TASK-426) at golden hour: the quad with the orrery, the
    // faculty pennants and the tea trolley at the library, the comet-night observatory with its
    // telescope terrace, the bell-cupola tower
    seed: 1001,
    cam: '114.71,22,120.1,105.71,8,97.1',
    time: 17.75,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-culture-research-comet',
    title: 'Culture · Research Comet Night (T3, 22:00)',
    // seed 1001: the observatory with its slit open, the telescope + book-pile stool and the
    // comet board on its terrace, the owl box behind the dome
    seed: 1001,
    cam: '95.71,24,89.1,118.71,9,98.1',
    time: 22,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-culture-design',
    title: 'Prism Hour · Design',
    // TASK-425: T2 (~60 u) from the north-east over the Atelier Glade at 17:30 golden hour: the
    // Atelier Tree's canopy vitray, the glass-roof gallery, the hot shop behind the quad, the
    // sculpture garden below and the spray rainbow off the west bluff; raw cam (seed 1001)
    seed: 1001,
    cam: '-61.87,46,-124.72,-99.87,19,-168.72',
    time: 17.5,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-culture-design-night',
    title: 'Jewel Tree · Design',
    // TASK-425: the Atelier Tree's canopy vitray lit from inside at night, the glade below
    seed: 1001,
    cam: '-59.87,40,-130.72,-92.87,30,-154.72',
    time: 21,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  // ---- culture tableaus (M19 wave 3, TASK-432): the story-spot bots (TABLEAU) at T3, seed 1001 raw
  // cams (re-pin when a layout changes). Medium quality: the campus wakes 4 tableau bots + walkers.
  ...STORY_SHOTS.map(([id, title, cam, time, simt]): ShotPreset => ({
    id: `D-story-${id}`,
    title: `Story · ${title}`,
    seed: 1001,
    cam,
    time,
    simt,
    quality: 'medium',
    sets: ['dev'],
  })),
  // ---- culture clock (TASK-430): the Launch Day Relay from the postcard pose (W15 candidate) —
  // frozen at 21:00 the relay runs on `simt`: 5 s = HQ's flash, 45 s = Marketing's (HQ, DevOps,
  // QA, Coding still glowing); and the time-gated rainbow, absent at noon (cf. D-culture-design)
  {
    id: 'D-relay-night',
    title: 'Launch Day Relay · 21:00:05 (HQ)',
    seed: 1001,
    cam: 'postcard',
    time: 21,
    simt: 5,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-relay-night-b',
    title: 'Launch Day Relay · 21:00:45 (Marketing)',
    seed: 1001,
    cam: 'postcard',
    time: 21,
    simt: 45,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-rainbow-noon',
    title: 'Design at noon · rainbow gated off',
    seed: 1001,
    cam: '-61.87,46,-124.72,-99.87,19,-168.72',
    time: 13,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  // ---- culture boats (M19 wave 3, TASK-434), seed 1001 raw cams (re-pin when routes / layout change):
  // the HQ ferry dwells ~8 s at the Marketing pier (sim 28–36 s) then pulls away (deltaT pair);
  // the Design lantern boat drifts off Mossgrove, its glass lanterns lit at night.
  {
    id: 'D-ferry-dock',
    title: 'Ferry at the pier (dwell, then departure)',
    seed: 1001,
    cam: '-271.02,10,-51.26,-261.02,1.5,-21.26',
    time: 10,
    simt: 30,
    quality: 'medium',
    deltaT: 14,
    sets: ['dev'],
  },
  {
    id: 'D-lantern-boat-night',
    title: 'Lantern boat · night',
    seed: 1001,
    cam: '-161.87,5.5,-103.72,-149.87,3,-106.22',
    time: 21,
    simt: 20,
    quality: 'medium',
    sets: ['dev'],
  },
  // ---- culture critters (M19 wave 3, TASK-433): the story-spot animals at T3, seed 1001 raw cams
  ...CRITTER_SHOTS.map(([id, title, cam, time, simt]): ShotPreset => ({
    id: `D-critter-${id}`,
    title: `Critter · ${title}`,
    seed: 1001,
    cam,
    time,
    simt,
    quality: 'medium',
    deltaT: 2,
    sets: ['dev'],
  })),
  // ---- culture ground + light (M19 wave 4, TASK-440), seed 1001 raw cams (re-pin when the layout
  // changes): Design glass-shard terrazzo, stained glass lit through by a low sun (dawn from the
  // west, golden hour from the east) and from inside at night, the Marketing marquee chase at the
  // Launch Show (0.4 s pair), the QA UV lamp pools at the night bug hunt
  {
    id: 'D-ground-terrazzo',
    title: 'Terrazzo · Design hot-shop yard (T3, 14:00)',
    seed: 1001,
    cam: '-101.87,33,-179.72,-97.27,21.5,-165.72',
    time: 14,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-stained-dawn',
    title: 'Stained glass · dawn through the canopy vitray (06:15)',
    seed: 1001,
    cam: '-65.87,40,-146.72,-91.87,36,-152.72',
    time: 6.25,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-stained-golden',
    title: 'Stained glass · Prism Hour from the east (17:45)',
    seed: 1001,
    cam: '-117.87,52,-144.72,-91.87,33,-154.72',
    time: 17.75,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-stained-night',
    title: 'Stained glass · Jewel Tree close (21:00)',
    seed: 1001,
    cam: '-117.87,52,-144.72,-91.87,33,-154.72',
    time: 21,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  // ---- ground art (TASK-468): the HQ compass mosaic from above, the Design prism pools at golden
  // hour and at night (seed 6006 has three arches on its Prism Walk), the conservatory glass
  {
    id: 'D-compass-top',
    title: 'Compass mosaic · HQ plaza from above (15:00)',
    seed: 1001,
    cam: '-36,70,-8,-36,1.4,-28',
    time: 15,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-prism-golden',
    title: 'Prism pools · Design Prism Walk at golden hour (17:15)',
    seed: 6006,
    cam: '112,26,-182,122,18,-162',
    time: 17.25,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-prism-night',
    title: 'Prism pools + conservatory glass · Design at night (21:30)',
    seed: 6006,
    cam: '112,26,-182,122,18,-162',
    time: 21.5,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-marquee-show',
    title: 'Marquee chase · SHOW sign at the Launch Show (17:30, 0.4 s pair)',
    seed: 1001,
    cam: '-244.62,6.2,-20.06,-238.42,5.3,-18.16',
    time: 17.5,
    simt: 4,
    deltaT: 0.4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-ground-uv-night',
    title: 'UV lamp pools · QA night bug hunt (21:30)',
    seed: 1001,
    cam: '86.6,17.8,-155.5,97.1,8,-171.6',
    time: 21.5,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  // ---- living close-up (M14c, TASK-383/384): `pnpm shots live [--assert]`. A 0.5 s `deltaT` pair per
  // campus at T3 on medium (16 workers + drones + animated surfaces); the harness measures the motion
  // inside LIVE_CROP over solid pixels (the mask frame drops water / sky: foam and swell are not campus
  // life) and asserts ≥ 3 % changed pixels and ≥ 5 moving clusters (LIVE_THRESHOLDS).
  // Own set (not 'dev'): seven medium-quality pairs would double the dev run under SwiftShader.
  ...CAMPUS_THEMES.map(([theme, name]): ShotPreset => ({
    id: `L-live-${theme}`,
    title: `Live · ${name}`,
    seed: 1001,
    cam: LIVE_CAMS[theme],
    time: 14,
    simt: LIVE_SIMT[theme] ?? 6,
    quality: 'medium',
    deltaT: 0.5,
    mask: true,
    live: { crop: LIVE_CROP },
    sets: ['live'],
  })),
  // ---- sandbox edits (TASK-221): `pnpm shots edit`. Logs on seed 1001 generated with
  // `encodeLog` (world/edit.ts); re-recorded for the Phase 3 layout (TASK-309: moved with their
  // island, rejected placements dropped) and the theme-first world (TASK-380: one pine that now
  // collides with a Coding fixture dropped) — hill: 6 raises + smooth + meadow top behind the HQ
  // village; flood: 16 lowers on the harbour bay's east shore and south arm; meadow: smooth + meadow paint + 19 props on the Coding island
  // (pines, rocks, flowers, bushes, a mushroom; macro view so the T3 flowers show); mixed (TASK-396,
  // was a lagoon islet before TASK-401 raised QA into a plateau): on the factory plateau's east end
  // two bushes and a palm removed, the ground flattened + meadow-painted for a cottage garden (palms,
  // flowers, lantern, bench), and a sand slipway cut down through the bluff wall to the sea (stepped
  // flattens + smooth). The panel shots reuse them.
  {
    id: 'E-panel',
    title: 'Edit panel · place',
    seed: 1001,
    cam: '-22.94,70,68.04,-36.94,6,-31.96',
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
    cam: '-22.94,70,68.04,-36.94,6,-31.96',
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
    cam: '-138.93,23,194.61,-150.93,6,162.61',
    time: 14,
    simt: 2,
    edit: EDIT_LOGS.meadow,
    sets: ['edit'],
  },
  {
    id: 'E-mixed',
    title: 'Plateau garden + slipway',
    seed: 1001,
    cam: '167,30,-174.34,126.1,6,-167.14',
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
  ...MOVE_SHOTS,
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
  // living close-up pairs (M14c): medium = 16 workers, drones, animated surfaces
  live: { width: 960, height: 540, quality: 'medium' },
};

export function shotsForSet(set: ShotSet): ShotPreset[] {
  return SHOT_PRESETS.filter((s) => s.sets.includes(set));
}

export function findShot(id: string): ShotPreset | undefined {
  return SHOT_PRESETS.find((s) => s.id === id);
}
