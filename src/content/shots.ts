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
  hq: '-76.26,14,-11.72,-56.26,1.4,-14.72',
  qa: '89.4,23,-169.44,101.1,9,-157.14',
  design: '-93.87,30,-177.26,-100.87,17,-159.26',
  coding: '-105.43,17,138.51,-116.43,11,148.51',
  // TASK-402b: over the glasshouse row and the base pods (bots at the terrariums, mast and pods)
  research: '141.71,15,122.1,127.71,8,112.1',
  devops: '174.38,7.5,22.53,184.38,2.6,10.53',
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
  ['signpostDebate', 'Signpost debate · HQ', '-59.72,8.5,-1.11,-56.92,2,-6.91', 14, 6],
  // TASK-497: re-aimed at the turbine-foot nap hammock (the chime turbine moved onto the Kite Hill)
  ['hammockNap', 'Hammock nap · Coding', '-130.97,12.41,160.88,-124.74,9.41,155.96', 14, 6],
  // TASK-507: re-aimed at the spot after the TASK-503 Emberpeak push
  ['containerNap', 'Container nap · DevOps', '173,10,3.3,178,7.3,2', 14, 6],
  ['lighthouseSelfie', 'Selfie · Marketing', '-189.14,28.37,-21.87,-184.03,25.67,-22.88', 14, 6],
  ['gafferTurn', 'Gaffer · Design', '-97.6,24.75,-175.95,-99.57,22.05,-171.13', 14, 6],
  ['teaTime', 'Tea time · Research', '111.45,11.18,94.4,111.05,8.48,99.58', 14, 6],
  ['onsenCapybara', 'Onsen · DevOps', '172.57,12.66,-32.01,169.59,9.96,-36.27', 14, 6],
] as const;

/**
 * D-critter-* cameras (raw `eye → target`, seed 1001; TASK-433): the animals of the story spots at T3
 * (life-spot-critters.ts SPOT_CRITTERS): [id, title, cam, game hour, warm-up s].
 */
const CRITTER_SHOTS: readonly (readonly [string, string, string, number, number])[] = [
  ['cat-timetable', 'Cat on the timetable · HQ', '-66.73,5.6,-5,-62.68,3.35,-7.87', 14, 6],
  [
    'capybara-onsen',
    'Capybara in the onsen · DevOps',
    // TASK-507: re-aimed (TASK-503 push), a step back from the deck
    '174.2,10.9,-40.4,170.6,9.3,-37.2',
    14,
    6,
  ],
  ['fox-orb', 'Fox and the glass orb · Design', '-105.87,23,-166.72,-109.87,21.5,-170.12', 14, 6],
  ['owl-night', 'Owl at the box · Research', '133.48,9.76,115.3,130.33,8.89,113.77', 22, 6],
  ['ladybugs-zoo', 'Ladybugs at the Bug Zoo · QA', '83.29,12.4,-159.49,80.1,9.01,-165.72', 14, 6],
  [
    'gull-bowl',
    'Gull in the seconds bowl · Design',
    '-94.91,24.57,-174.41,-98.41,22.65,-174.46',
    14,
    6,
  ],
  ['duck-crossing', 'Duck family crossing · Coding', '-113.9,13.9,145.3,-107.9,9.5,151', 14, 10],
] as const;

/** W7 camera (raw, seed 1001 Coding; TASK-380), re-pin when that layout changes. */
const W7_CAM = '-165.43,20,145.51,-115.43,13,165.51';

/** D-devops-* (raw, seed 1001 Ember Works; TASK-405), re-pin when that layout changes. */
const DEVOPS_CAM = '126.38,92,67.99,198.38,2,-20.01';
/** D-devops-terraces (raw, seed 1001): the data center terraces from the sea north-west of them. */
const DEVOPS_TERRACE_CAM = '132.38,30,-82.01,174.38,8,-54.01';
/** D-devops-harbour (raw, seed 1001): the container yard, CI/CD belt, pier and a cargo ship. */
const DEVOPS_HARBOUR_CAM = '200.38,20,35.99,174.38,2,5.99';
/** D-culture-devops (raw, seed 1001; TASK-422): the onsen, quay and gate from the lee sea. */
const DEVOPS_CULTURE_CAM = '126.38,36,-57.47,174.38,6,-23.47';
/** D-culture-devops-onsen (raw, seed 1001; TASK-422): the onsen deck and bath house close up. */
// TASK-507: re-aimed from the pool side (the old cam looked through a cooling tower)
const DEVOPS_ONSEN_CAM = '163.5,14,-27.5,168.5,9,-38.5';

/**
 * W9 Research hero (raw, seed 1001 Observatory University; TASK-402b), re-pin when the layout
 * changes. TASK-471 (hub layout): Research now sits NE of HQ, so the look comes from the
 * south-west (the channel off HQ) toward the open sea behind the summit; the old ENE look had
 * HQ's plateau in frame (841 k triangles > 800 k).
 */
const W9_CAM = '76,21,56,120,15,104';

/** W14 campus at golden hour (raw, seed 1001; TASK-402b, re-aimed from the SW in TASK-471): pier, quad, gardens and the summit observatory, open sea behind. */
const W14_CAM = '63,46,74,116,5,112';

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
const MACRO_CAM = '-48.98,7.4,-11.81,-58.48,2,-7.71';

/** D-culture-hq cameras (raw, seed 1001 Harbour Guild; TASK-420), re-pin when HQ's layout changes. */
const HQ_CULTURE_CAM = '-36.33,33,22.1,-54.83,1.2,-14.4';
const HQ_CULTURE_NIGHT_CAM = '-42.83,12,4.6,-53.83,1.2,-14.4';

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
/**
 * D-move-coding-hill / -tunnel / -tunnel-night (TASK-498 Wind Tunnel + Kite Day, seed 1001): Kite Day
 * 14:00 + 20 s (all hill kites up, one stuck low), the tunnel with its fan and gust-lifted socks by day
 * and its blue server light + warm lanterns at night. Raw cameras; re-pin when the layout moves.
 */
const TUNNEL_SHOTS: readonly ShotPreset[] = (
  [
    ['hill', 'Wind Gardens · 14:00 +20 s Kite Day over the hill', '-80,26,150,-106,13,183', 14, 20],
    [
      'tunnel',
      'Wind Gardens · wind tunnel, fan + windsocks (14:00)',
      '-112,9,166,-123.5,10.5,184.7',
      14,
      20,
    ],
    ['socks-a', 'Wind Gardens · tunnel windsocks, sim 4 s', '-122,15,176.5,-123.5,10.2,185', 14, 4],
    [
      'socks-b',
      'Wind Gardens · tunnel windsocks, sim 11 s',
      '-122,15,176.5,-123.5,10.2,185',
      14,
      11,
    ],
    [
      'socks-c',
      'Wind Gardens · tunnel windsocks, sim 19 s',
      '-122,15,176.5,-123.5,10.2,185',
      14,
      19,
    ],
    [
      'tunnel-night',
      'Wind Gardens · tunnel night: blue server light + warm park',
      '-112,9,166,-123.5,10.5,184.7',
      21,
      6,
    ],
  ] as const
).map(([id, title, cam, time, simt]) => ({
  id: `D-move-coding-${id}`,
  title,
  seed: 1001,
  cam,
  time,
  simt,
  deltaT: 0.7,
  quality: 'medium' as const,
  sets: ['dev' as const],
}));

const MOVE_SHOTS: readonly ShotPreset[] = (
  [
    ['hq', 'Harbour Guild · 06:00 bell fanfare', 1001, '-67.83,4.5,-18.18,-61.23,2.8,-14.78', 6],
    ['hq-crane', 'Harbour Guild · crane sack', 1001, '-65.62,5.5,-1.41,-58.62,2,-1.41', 9],
    // TASK-497: the Kite Day rack at the Kite Hill foot, up the hill to the chime turbine and its kites
    ['coding', 'Wind Gardens · 14:00 Kite Day', 1001, '-92,15,147,-97.5,11.5,172', 14],
    [
      'devops',
      'Ember Works · 21:00 Release Night lift + horn',
      1001,
      '161.78,8,23.83,173.38,4,7.53',
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

/**
 * TASK-505 Marina Dusk (raw, seed 1001, 19:45 +4 s, the lamp ramp just through): from the pier side over
 * the comb's masts (lamps lit) at the star fort on the horn, its windows and red light on, the flag
 * flying, the green light of the breakwater head beyond and the ferry buoys over open water.
 */
const MARINA_DUSK_CAM = '-34.62,9,-15.17,-62.62,4,10.83';

/** TASK-505 marina cams: [id, title, cam, game hour, warm-up s]; raw `eye → target`, seed 1001. */
const MARINA_CAMS: readonly (readonly [string, string, string, number, number])[] = [
  ['D-marina-top', 'Marina from above · HQ cove', '-49.95,95,44.27,-49.95,0,17.27', 14, 4],
  ['D-marina-t1', 'Marina from the sea · HQ cove (T1)', '-129.95,42,84.27,-49.95,0,19.27', 14, 4],
  ['D-marina-fort', 'Star fort at the cove mouth · HQ', '-96.37,16,70.2,-64.37,3,44.2', 14, 4],
  ['D-marina-dusk', 'Marina dusk · masts and the fort flag', MARINA_DUSK_CAM, 19.75, 4],
  ['D-marina-top-night', 'Marina from above at night', '-49.95,95,44.27,-49.95,0,17.27', 20.5, 4],
];
const MARINA_SHOTS: readonly ShotPreset[] = MARINA_CAMS.map(([id, title, cam, time, simt]) => ({
  id,
  title,
  seed: 1001,
  cam,
  time,
  simt,
  quality: 'medium' as const,
  sets: ['dev' as const],
}));

/**
 * TASK-507 wow cams (raw, seed 1001). Funicular Dawn (06:00 + 5 s: the shift siren rings the
 * summit bell, the lower car turns at its first switchback, its lantern flares): high from the
 * sea east of Emberpeak down on the whole line, foot to summit (a lower look toward the hub draws
 * every island behind the cone: 450 calls; TASK-511: 10° steeper, the grown HQ took it to 832k tris). Ember Lane Night (21:30): down the smiths' lane aisle toward the open sea, trip
 * hammers striking with sparks under the lit stalls.
 */
const FUNICULAR_DAWN_CAM = '254,67,0,221,17,-23';
// TASK-512: the first take (and D-devops-smiths-night) filled the frame with two striped roofs; now high
// over the lane's open end, looking down the aisle between the two stall rows so the lit stalls, hammers,
// sparks, lanterns and the funicular car all read (low cams from either aisle end hit the mine cart)
const EMBER_LANE_CAM = '233,19,3,242,6,-10';
/**
 * TASK-509c (D-093) Lava River Dusk (19:40): from the sea off the windward bluff, up the lava fall and
 * the carved river to the notch, the ember bridge glowing over it, steam rising off the delta.
 */
const LAVA_RIVER_DUSK_CAM = '238,38,-114,225,5,-79';

/**
 * TASK-512 wow cams (raw, seed 1001), re-pin when the layouts move. Kite Hill Afternoon (14:00 +20 s,
 * the Kite Day kites up round the hill foot) from D-move-coding-hill; Proving Grounds Noon (12:00 +3 s,
 * the siren test) from D-qa-proving-siren; Fairy Night (22:00) down a row of the Tech Park's
 * fairy-light grove (the wreathed quad-end trees, TASK-479 C13) with the fireflies about.
 */
const KITE_HILL_CAM = '-62,20,152,-100,17,177';
const PROVING_NOON_CAM = '124,16,-112,100,9.5,-137';
const FAIRY_NIGHT_CAM = '-140,4.5,144,-152,5,154';

/**
 * TASK-507 (D-089) DevOps M25 cams: [id, title, cam, game hour, warm-up s]; raw `eye → target`,
 * seed 1001 (Emberpeak's east flank: funicular, smiths' lane, ore cableway; the onsen town on the
 * west bank, the geyser field south). `pnpm shots dev --only=D-devops-m25-east,…`.
 */
const DEVOPS_M25_CAMS: readonly (readonly [string, string, string, number, number])[] = [
  [
    'D-devops-m25-east',
    'Emberpeak east flank · funicular, lane, cableway (T1)',
    '290,40,20,226,12,-16',
    14,
    8,
  ],
  ['D-devops-funicular', 'Funicular switchbacks · DevOps (T2)', '258,24,-2,229,15,-17', 14, 8],
  [
    'D-devops-smiths-night',
    "Smiths' lane at night · hammers + sparks",
    '252,13,-2,241,8,-10',
    21.5,
    4,
  ],
  ['D-devops-onsen-town', 'Onsen town · stilt houses + capybaras', '150,12,-8,168,3,-22', 14, 6],
  ['D-devops-geysers', 'Geyser field · 17:30 shift end eruption', '205,16,-98,186,8,-76', 17.5, 3],
  [
    'D-devops-smiths-close',
    "Smiths' lane · trip hammers (T3)",
    '246.5,10.6,-6.2,242,8.6,-11.6',
    21.5,
    4,
  ],
  [
    'D-devops-funicular-turn',
    'Funicular car turning at a switchback',
    '246,15,-4,235.6,9.5,-11.8',
    6,
    5,
  ],
  // TASK-509a (D-091): the lava river down the windward slope (notch 210,-46 → lip 232,-86) and the
  // lava fall + steam delta at the lip, day and night
  [
    'D-lava-channel',
    'Lava river · notch to the windward lip (T1)',
    '262,46,-118,218,12,-60',
    14,
    6,
  ],
  ['D-lava-channel-night', 'Lava river at night (T1)', '262,46,-118,218,12,-60', 21.5, 6],
  ['D-lava-fall', 'Lava fall + steam delta (T2)', '248,11,-106,230,3,-82', 14, 6],
  ['D-lava-fall-night', 'Lava fall + steam delta at night (T2)', '248,11,-106,230,3,-82', 21.5, 6],
  // TASK-509c (D-093): the M26 lava pack placed (seed 1001: bridge 228.6,-76.8 over the carved bed,
  // deck 211,-30.6 on the rim, kiln 250,-16 by the smiths' lane, obsidian beach 245,-76, tug leading
  // the cargo ship off the pier head 159,23)
  ['D-m26-bridge', 'Ember bridge over the lava bed (T3)', '238,12,-88,228.6,7.4,-76.8', 14, 6],
  ['D-m26-bridge-night', 'Ember bridge at night (T3)', '238,12,-88,228.6,7.4,-76.8', 21.5, 6],
  ['D-m26-deck', 'Crater deck + stargazer (T3)', '220,40,-24,209,33.5,-32', 14, 6],
  ['D-m26-kiln-night', 'Lava-glass kiln at night (T3)', '242,12.5,-9.5,250,7.8,-16', 21.5, 6],
  ['D-m26-obsidian', 'Obsidian beach · sea stacks + tide pool (T2)', '264,10,-93,246,2,-77', 14, 6],
  // TASK-513: the black-sand cove carved into the bluff there (floor origin 244.6,-76.2, out to sea
  // heading 5.48), three-quarter view from the shelf
  [
    'D-obsidian-cove',
    'Obsidian black-sand cove in the bluff (T2)',
    '257,13,-97.6,243,1.5,-75',
    16,
    6,
  ],
  ['D-m26-tug', 'Tug leading the cargo ship + smoke (T2)', '131,9,31,145,1.5,17', 14, 20],
];
/**
 * TASK-518 (D-097): the Beacon Rock M27 kit placed and moving, seed 2024 (summit terminal
 * 164,-106; stack pylons 139.4,-102 / 135.4,-127; far terminal 153.1,-150.8; dive tower
 * 136.8,-100.7 → pool 130,-97.5; transmitter 132.9,-125.7; sea billboard 151,4,-155.6; ON AIR
 * 157.1,17.7,-111.5 facing -x). `simt` picks the moment: gondola 0 on the first span at 10 s, the
 * diver in the air at ~29.5 s, all five letters lit 1.6-8.3 s into each 9 s spell-out.
 */
const MARKETING_M27_CAMS: readonly (readonly [string, string, string, number, number])[] = [
  ['D-m27-cable', 'Cable car line over the sea stacks (T1)', '92,34,-150,148,14,-122', 14, 12],
  [
    'D-m27-gondola',
    'Gondola on the first span, close (T3)',
    '141,22.5,-94,149.4,20,-102.6',
    14,
    10,
  ],
  ['D-m27-onair-night', 'ON AIR cliff neon at night (T2)', '128,20,-108,157,17.7,-111.5', 21.5, 6],
  [
    'D-m27-onair-seq',
    'ON AIR spelling out, 3 letters lit (T2)',
    '128,20,-108,157,17.7,-111.5',
    21.5,
    9.9,
  ],
  ['D-m27-dive', 'Dive tower: the diver in the air (T3)', '143,12,-79,133.4,10,-99.1', 15, 29],
  [
    'D-m27-dive-splash',
    'Dive tower: the splash in the pool (T3)',
    '143,12,-79,133.4,7,-99.1',
    15,
    30.9,
  ],
  ['D-m27-billboard', 'Sea billboard on the far stack (T2)', '139,8,-178,151,4,-155.6', 14, 6],
];
const MARKETING_M27_SHOTS: readonly ShotPreset[] = MARKETING_M27_CAMS.map(
  ([id, title, cam, time, simt]) => ({
    id,
    title,
    seed: 2024,
    cam,
    time,
    simt,
    quality: 'medium' as const,
    sets: ['dev' as const],
  }),
);
const DEVOPS_M25_SHOTS: readonly ShotPreset[] = DEVOPS_M25_CAMS.map(
  ([id, title, cam, time, simt]) => ({
    id,
    title,
    seed: 1001,
    cam,
    time,
    simt,
    quality: 'medium' as const,
    sets: ['dev' as const],
  }),
);

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
    // yard with sawtooth hangars, conveyor bridges and the loop track, the check tower. TASK-484:
    // from the east at 15:00 (raw), the sun behind the camera on the R3-14 white-mint-yellow hangar
    // walls; the slalom buoys, grandstand and rim hammock in frame (the noon village look was flat)
    seed: 4004,
    cam: '-112,50,-129,-172,7,-107',
    time: 15,
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
    // TASK-505 (D-085): the marina's masts crowded the lower frame; 8 u higher and 3 u further out
    cam: '-56.77,24,29.1,-43.77,6,-20.9',
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
    cam: '-45,82,-11.52,-44,1.4,-34.52',
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
    cam: '96,52,-118,128,16,-170',
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
    cam: '-40.33,55,25.04,-24.33,4,-24.96',
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
    title: 'Rim Walk Afternoon',
    // QA from the sunny south-east (15:00): the Q6 rim walkway (dark safety rubber, yellow-black
    // hazard posts, mint rails) round the plateau lip, the Q18 palm rim inland of it, the repainted
    // hangars and the check tower (≈ 220 calls; a lower look takes in the archipelago, 330–380)
    seed: 1001,
    cam: '178,55,-188,118,4,-160',
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
    // DevOps Release Night (21:00 +5 s) from the W5 side: the D12 switchback lantern roads up the
    // cone in warm pools, the D5 watch tower's red beacon at the summit, container LED strips and
    // the lit harbour sheds, the steam plume lit from the crater
    seed: 1001,
    cam: '167.63,52,22.9,193.63,19,-45.1',
    time: 21,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W25',
    title: 'Carpet Night',
    // Marketing at 20:00 (seed 2024): the M7 red-carpet boulevard with its gold trim across Beacon
    // Rock's top, seen across it from the north (TASK-485: from the bay side the giant screen at the
    // boulevard's lee end hid half the carpet), the lit giant screen end-on, billboards and bulb
    // strings, the lighthouse with its beam, a sea-stack transmitter, the fair's wheel and searchlights
    seed: 2024,
    cam: '170,64,-84,182,21,-115',
    time: 20,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W26',
    title: 'Test Firing Noon',
    // Research 12:00 +3 s: the R13 launch gantry on the headland during the test firing (trench
    // steam), the R12 hedge-maze parterres, the R17 belfry tower and the arboretum behind
    seed: 1001,
    cam: '84,12,139,101,7,125',
    time: 12,
    simt: 3,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W15b',
    title: 'Relay Wave',
    // TASK-490 (W:B1 + W:B6): the postcard at 21:00 +11 s, DevOps' step: the skerry beacons and the
    // Marketing lighthouse sweep one after another (1 s lag in route order), the signal lamps sit on
    // the island peaks and DevOps' lamp throws its first flash toward QA
    seed: 1001,
    cam: 'postcard',
    time: 21,
    simt: 11.2,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W15c',
    title: 'Harbour Fireworks',
    // TASK-490 (W:G7): 22:01 (the relay and the Comet Night are over) +14.9 s into the show, from the
    // sea south of the Harbour Guild: the finale shells over the bay (TASK-496: low and far enough that
    // their mirror image on the open water below shares the frame), the island's lit quay between (raw)
    seed: 1001,
    cam: '-32.01,2.2,274.81,-32.01,7,9.81',
    time: 21,
    simt: 99.9,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'D-fireworks-rain',
    title: 'Harbour Fireworks cancelled in rain (W15c clock)',
    // TASK-490: the show is cancelled in rain — the W15c frame under rain has no shells
    seed: 1001,
    cam: '-32.01,8,199.81,-32.01,38,9.81',
    time: 21,
    simt: 99.9,
    weather: 'rain',
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'W15d',
    title: 'Skerry Beacon',
    // TASK-490 (W:B1): a mini lighthouse on a south skerry at 23:00 (raw; TASK-511: the grown HQ moved
    // the islets, now the skerry at -110,-63), its beam sweeping the sea,
    // the island lights behind it
    seed: 1001,
    cam: '-136,34,-28.3,-108,8,-66.3',
    time: 23,
    simt: 4,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W15e',
    title: 'Signal Lamp',
    // TASK-490 (W:B6): the Wind Gardens' signal lamp on its peak at 21:00 +31 s (Coding's step, first
    // flash; TASK-496: seen from the side) — its beam's light front reaching across the sea to the next
    // island of the chain, Marketing's Beacon Rock (raw)
    seed: 1001,
    cam: '30,120,120,-150,15,85',
    time: 21,
    simt: 31.35,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W27',
    title: 'Constellation Night',
    // TASK-491 (W:G4): Comet Night (22:00 +30 s, lines lifted) from the sea between HQ and the
    // Star Academy, looking up over Research at its own constellation, the Telescope (the target sits
    // 300 u out so the view stays tier 1: a 100 u target put it at 850k tris)
    seed: 1001,
    cam: '50,18,45,256,60,259',
    time: 22,
    simt: 30,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W28',
    title: 'Whale Surfacing',
    // 17:45 +0.5 s: the whale's cape pass (TASK-489, D-070), 8.5 s into its surfacing, spout in the air.
    // TASK-494: the overview left the whale a few pixels at the corner, so this is a raw cam 34° down from the
    // north-east: the whale facing us in the open water with its spout, the Research cape beside it for scale
    seed: 1001,
    cam: '234,62,44,174,0,116',
    time: 17.75,
    simt: 0.5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W28b',
    title: 'Whale Blow',
    // TASK-489: the same cape pass close up (raw, looking down 32° from in front of the whale, TASK-494): its
    // round face, flippers, tail and the soft spout column
    seed: 1001,
    cam: '226,28,76,198,0,110',
    time: 17.75,
    simt: 0.5,
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
    cam: '-19.98,21,1.27,-54.58,1,1.27',
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
    // seed 1001 Millbrook (TASK-421): the Tech Park lawn (pergola desks, giant duck) and, since
    // TASK-497, the Kite Hill in front: the chime pagoda turbine on top, kites round its foot
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
    id: 'D-qa-proving-siren',
    title: 'Proving Grounds · 12:00 siren test +3 s (T2)',
    // seed 1001 Proving Grounds (TASK-501): the figure-8 crash track on the stunt yard, the empty-cradle
    // drop tower at its far end, the test fan and the obstacle course round it; the crate is on its way up, the fan spins up
    seed: 1001,
    cam: '124,16,-112,100,9.5,-137',
    time: 12,
    simt: 3,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-qa-proving-drop',
    title: 'Proving Grounds · mid-drop (T2)',
    // seed 1001 Proving Grounds (TASK-501): the figure-8 crash track on the stunt yard, the empty-cradle
    // drop tower at its far end, the test fan and the obstacle course round it; the crate in free fall, the cart at the ramp crest
    seed: 1001,
    cam: '124,16,-112,100,9.5,-137',
    time: 12,
    simt: 8.95,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-qa-proving-jump',
    title: 'Proving Grounds · cart in the air (T2)',
    // seed 1001 Proving Grounds (TASK-501): the figure-8 crash track on the stunt yard, the empty-cradle
    // drop tower at its far end, the test fan and the obstacle course round it; the cart over the crossing, the crate just landed (squash, dust, lit check lamp)
    seed: 1001,
    cam: '124,16,-112,100,9.5,-137',
    time: 12,
    simt: 9.7,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'W-customs-noon',
    title: 'Customs Noon',
    // seed 1001 Customs Port (TASK-508, D-087): noon, the cargo ship 3 s into its visit sails under the scanner
    // arch (scan strip and crown lamp lit) toward the quay; crane, check line and pontoons beyond
    cam: '35.0,21.6,-118.5,65.4,4.6,-122.1',
    seed: 1001,
    time: 12,
    simt: 3,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow', 'dev'],
  },
  {
    id: 'D-qa-customs-unload',
    title: 'Customs Port · mid-unload (T2)',
    // seed 1001 Customs Port (TASK-508): the ship alongside, the crane carrying a container to the check line
    seed: 1001,
    cam: '43.0,14.6,-137.5,68.6,5.6,-137.4',
    time: 12,
    simt: 14.6,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-qa-customs-lob',
    title: 'Customs Port · rejected crate in the air (T2)',
    // seed 1001 Customs Port (TASK-508): the second crate fails the check, the cross lamp is lit and the crate is
    // lobbed from the end of the line onto the quarantine pontoon
    seed: 1001,
    cam: '68.4,12.6,-111.7,72.8,4.6,-130.5',
    time: 12,
    simt: 23.7,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-qa-customs-spin',
    title: 'Customs Port · the ship turns on the spot (T2)',
    // seed 1001 Customs Port (TASK-508): unloaded, the ship slid out and spins to head back out under the arch
    seed: 1001,
    cam: '36.4,23.6,-129.7,59.8,3.6,-135.5',
    time: 12,
    simt: 25.2,
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
    cam: '118.71,22,124.1,109.71,8,101.1',
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
    cam: '99.71,24,93.1,122.71,9,102.1',
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
    cam: '-46.31,70,-7.37,-46.31,1.4,-27.37',
    time: 15,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-prism-golden',
    title: 'Prism pools · Design Prism Walk at golden hour (17:15)',
    seed: 6006,
    cam: '114,26,-184,124,18,-164',
    time: 17.25,
    simt: 4,
    quality: 'medium',
    sets: ['dev'],
  },
  {
    id: 'D-prism-night',
    title: 'Prism pools + conservatory glass · Design at night (21:30)',
    seed: 6006,
    cam: '114,26,-184,124,18,-164',
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
    cam: '-33.25,70,68.39,-47.25,6,-31.61',
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
    cam: '-33.25,70,68.39,-47.25,6,-31.61',
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
  ...TUNNEL_SHOTS,
  {
    id: 'W-marina-dusk',
    title: 'Marina Dusk',
    // TASK-505 (D-085): the HQ yacht marina at 19:45 (see MARINA_DUSK_CAM)
    seed: 1001,
    cam: MARINA_DUSK_CAM,
    time: 19.75,
    simt: 4,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  // ---- TASK-505 (D-085): the HQ yacht marina and the star fort (the "prop showcase" cams of the
  // marina: `pnpm shots dev --only=D-marina-t0,D-marina-t1,D-marina-fort,D-marina-night`; raw cams,
  // seed 1001, re-pin when HQ's layout changes)
  ...MARINA_SHOTS,
  // ---- TASK-507 (D-089): the DevOps M25 kit placed and moving
  {
    id: 'W-funicular-dawn',
    title: 'Funicular Dawn',
    // TASK-507: the lower car turning at a switchback at 06:00 + 5 s (see FUNICULAR_DAWN_CAM)
    seed: 1001,
    cam: FUNICULAR_DAWN_CAM,
    time: 6,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W-ember-lane-night',
    title: 'Ember Lane Night',
    // TASK-507: the smiths' trip hammers and sparks at 21:30 (see EMBER_LANE_CAM)
    seed: 1001,
    cam: EMBER_LANE_CAM,
    time: 21.5,
    simt: 4,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W-lava-river-dusk',
    title: 'Lava River Dusk',
    // TASK-509c: the lava fall, the river and the ember bridge at 19:40 (see LAVA_RIVER_DUSK_CAM)
    seed: 1001,
    cam: LAVA_RIVER_DUSK_CAM,
    time: 19.67,
    simt: 6,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W-cable-dusk',
    title: 'Cable Dusk',
    // TASK-518 (study W20): from the south-west sea at ~90 u, pitch ~18°, 19:15: the stacks, the
    // gondola line with a cabin between the summit and the first stack, ON AIR, the summit glow
    seed: 2024,
    cam: '78,42,-170,150,14,-118',
    time: 19.25,
    simt: 12,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W-on-air-rock',
    title: 'On-Air Rock',
    // TASK-518 (study W21): the W4 side but further west so the ON AIR face (normal -x) reads
    // (~45° instead of W4's ~65°), 22:00, two frames 0.6 s apart (the stack lamps blink)
    seed: 2024,
    cam: '96,52,-44,185,14,-108',
    time: 22,
    simt: 3,
    deltaT: 0.6,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  ...MARKETING_M27_SHOTS,
  ...DEVOPS_M25_SHOTS,
  // ---- TASK-512: the three wow presets TASK-502 specified (D-090)
  {
    id: 'W-kite-hill-afternoon',
    title: 'Kite Hill Afternoon',
    // 14:00 + 20 s Kite Day: the hill kites up round the knoll's foot (see KITE_HILL_CAM)
    seed: 1001,
    cam: KITE_HILL_CAM,
    time: 14,
    simt: 20,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W-proving-grounds-noon',
    title: 'Proving Grounds Noon',
    // 12:00 + 3 s siren test: crate on its way up the drop tower, the fan spinning up (see PROVING_NOON_CAM)
    seed: 1001,
    cam: PROVING_NOON_CAM,
    time: 12,
    simt: 3,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W-fairy-night',
    title: 'Fairy Night',
    // 22:00: the Tech Park's fairy-light grove, wreathed trees glowing, fireflies about (see FAIRY_NIGHT_CAM)
    seed: 1001,
    cam: FAIRY_NIGHT_CAM,
    time: 22,
    simt: 4,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
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
