/**
 * URL parameters (ARCHITECTURE §9). Parsed once at boot; every system reads from
 * the resulting object, never from `location` directly.
 */
export type Quality = 'low' | 'medium' | 'high';
export type DebugView =
  'none' | 'stats' | 'mask' | 'overdraw' | 'wire' | 'height' | 'zone' | 'slope' | 'coast';
export type WeatherName = 'clear' | 'cloudy' | 'rain' | 'fog';

export interface Params {
  seed: number;
  /** Bible W1–W10 or a dev D* preset id; '' when none. */
  shot: string;
  /** overview | island:<name> | village | dock | macro-beach | x,y,z,tx,ty,tz | '' */
  cam: string;
  /** Hours [0,24); NaN when unspecified. */
  time: number;
  weather: WeatherName | '';
  /** Sim warm-up seconds before the first frame. */
  simt: number;
  /** Capture mode: no intro, orbit or governor; RAF stops once ready. */
  freeze: boolean;
  quality: Quality | '';
  /** Device pixel ratio override; NaN when unspecified. */
  dpr: number;
  hud: boolean;
  debug: DebugView;
  perf: boolean;
  selftest: 'regen' | 'rebuild' | '';
  intro: boolean;
  gallery: boolean;
  /** Reduced motion forced on. */
  rm: boolean;
}

export const DEFAULT_SEED = 1001;

function parseTime(v: string | null): number {
  if (v === null || v === '') return NaN;
  if (v.includes(':')) {
    const [h, m] = v.split(':').map(Number);
    return ((h || 0) + (m || 0) / 60) % 24;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  // 0..1 → fraction of day, else hours.
  return n <= 1 ? n * 24 : n % 24;
}

function parseBool(v: string | null, def: boolean): boolean {
  if (v === null) return def;
  return !(v === '0' || v === 'false' || v === 'off');
}

export function parseParams(search: string): Params {
  const q = new URLSearchParams(search);
  const seedRaw = q.get('seed');
  const seedNum = seedRaw === null ? DEFAULT_SEED : Number(seedRaw);
  const weather = (q.get('weather') ?? '') as Params['weather'];
  const quality = (q.get('quality') ?? '') as Params['quality'];
  const debugRaw = q.get('debug') ?? 'none';
  const selftest = (q.get('selftest') ?? '') as Params['selftest'];
  return {
    seed: Number.isFinite(seedNum) ? seedNum >>> 0 : DEFAULT_SEED,
    shot: q.get('shot') ?? '',
    cam: q.get('cam') ?? '',
    time: parseTime(q.get('time')),
    weather: ['clear', 'cloudy', 'rain', 'fog'].includes(weather) ? weather : '',
    simt: Math.max(0, Number(q.get('simt') ?? 0) || 0),
    freeze: parseBool(q.get('freeze'), false),
    quality: ['low', 'medium', 'high'].includes(quality) ? quality : '',
    dpr: Number(q.get('dpr') ?? NaN),
    hud: parseBool(q.get('hud'), true),
    debug: ([
      'none',
      'stats',
      'mask',
      'overdraw',
      'wire',
      'height',
      'zone',
      'slope',
      'coast',
    ].includes(debugRaw)
      ? debugRaw
      : 'none') as DebugView,
    perf: parseBool(q.get('perf'), false),
    selftest: selftest === 'regen' || selftest === 'rebuild' ? selftest : '',
    intro: parseBool(q.get('intro'), true),
    gallery: parseBool(q.get('gallery'), false),
    rm: parseBool(q.get('rm'), false),
  };
}
