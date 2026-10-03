/**
 * Capture presets (ART_BIBLE §11 + ARCHITECTURE §9). Pure data: the app resolves
 * `?shot=<id>` here, the shots harness picks sets from here. Seeds for W-shots
 * are placeholders until TASK-113 pins real ones.
 */
export type ShotSet = 'ci' | 'dev' | 'wow';

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
  sets: ShotSet[];
}

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
    title: 'Steam & Spring',
    seed: 3003,
    cam: 'island:Emberpeak',
    time: 10,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W6',
    title: 'Lagoon',
    seed: 4004,
    cam: 'island:Palmlagoon',
    time: 12,
    simt: 5,
    quality: 'medium',
    width: 1920,
    height: 1080,
    sets: ['wow'],
  },
  {
    id: 'W7',
    title: 'Mill Morning',
    seed: 5005,
    cam: 'island:Millbrook',
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
    seed: 6006,
    cam: 'island:Mossgrove',
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
];

export const SET_DEFAULTS: Record<
  ShotSet,
  { width: number; height: number; quality: 'low' | 'medium' | 'high' }
> = {
  ci: { width: 640, height: 360, quality: 'low' },
  dev: { width: 960, height: 540, quality: 'low' },
  wow: { width: 1920, height: 1080, quality: 'medium' },
};

export function shotsForSet(set: ShotSet): ShotPreset[] {
  return SHOT_PRESETS.filter((s) => s.sets.includes(set));
}

export function findShot(id: string): ShotPreset | undefined {
  return SHOT_PRESETS.find((s) => s.id === id);
}
