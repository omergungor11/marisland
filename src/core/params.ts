/**
 * URL parameters (ARCHITECTURE §9). Parsed once at boot; every system reads from
 * the resulting object, never from `location` directly.
 */
import { EDIT_TOOLS, type EditToolKind } from '../content/edit-ui.ts';

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
  /**
   * `regen`: 5 regen cycles, memory back to baseline; `ctxloss`: lose + restore the context;
   * `edit`: 50 brush edits + undo all, memory back to baseline (TASK-211).
   */
  selftest: 'regen' | 'rebuild' | 'ctxloss' | 'edit' | '';
  /** Phase 2 edit log (`encodeLog`, URL-safe), replayed before the first build; '' = none. */
  edit: string;
  intro: boolean;
  gallery: boolean;
  /** Reduced motion forced on. */
  rm: boolean;
  /**
   * HUD panel open at boot (capture review of the photo bar / settings / edit panel):
   * '' | photo | settings | edit. `panel=edit:<tool>` also selects the edit tool.
   */
  panel: HudPanel;
  /** Edit tool from `panel=edit:<tool>`; '' = the default. */
  panelTool: EditToolKind | '';
  /** Capture: freeze the opening sequence at this time (s); NaN = off. Needs `freeze=1`. */
  introt: number;
}

export type HudPanel = '' | 'photo' | 'settings' | 'edit';

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
  const [panel, panelToolRaw = ''] = (q.get('panel') ?? '').split(':');
  const panelTool = (EDIT_TOOLS as readonly string[]).includes(panelToolRaw)
    ? (panelToolRaw as EditToolKind)
    : '';
  const introtRaw = q.get('introt');
  const introt = introtRaw === null || introtRaw === '' ? NaN : Number(introtRaw);
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
    selftest: ['regen', 'rebuild', 'ctxloss', 'edit'].includes(selftest) ? selftest : '',
    edit: q.get('edit') ?? '',
    intro: parseBool(q.get('intro'), true),
    gallery: parseBool(q.get('gallery'), false),
    rm: parseBool(q.get('rm'), false),
    panel: panel === 'photo' || panel === 'settings' || panel === 'edit' ? panel : '',
    panelTool: panel === 'edit' ? panelTool : '',
    introt: Number.isFinite(introt) && introt >= 0 ? introt : NaN,
  };
}
