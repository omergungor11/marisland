import type { Quality } from './params.ts';

/** Quality preset numbers (ARCHITECTURE §8). Content budgets live in content/budgets.ts. */
export interface QualityPreset {
  name: Quality;
  dprCap: number;
  shadows: boolean;
  shadowMapSize: number;
  composer: boolean;
  msaa: number;
  dof: boolean;
  groundCoverCap: number;
  instanceCap: number;
  agentCap: number;
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: {
    name: 'low',
    dprCap: 1,
    shadows: false,
    shadowMapSize: 0,
    composer: false,
    msaa: 0,
    dof: false,
    groundCoverCap: 3000,
    instanceCap: 6000,
    agentCap: 25,
  },
  medium: {
    name: 'medium',
    dprCap: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    composer: true,
    msaa: 0,
    dof: false,
    groundCoverCap: 12000,
    instanceCap: 15000,
    agentCap: 60,
  },
  high: {
    name: 'high',
    dprCap: 1.75,
    shadows: true,
    shadowMapSize: 2048,
    composer: true,
    msaa: 4,
    dof: true,
    groundCoverCap: 30000,
    instanceCap: 30000,
    agentCap: 110,
  },
};

export interface DeviceHints {
  rendererString: string;
  deviceMemory: number;
  cores: number;
  touch: boolean;
  screenWidth: number;
}

/** Initial pick from device hints (ARCHITECTURE §8 "Auto quality"). */
export function pickQuality(h: DeviceHints, override: Quality | ''): Quality {
  if (override) return override;
  const r = h.rendererString.toLowerCase();
  if (r.includes('swiftshader') || r.includes('llvmpipe') || r.includes('software')) return 'low';
  if (h.touch && h.screenWidth < 1100) return h.deviceMemory >= 6 ? 'medium' : 'low';
  if (h.deviceMemory >= 8 && h.cores >= 8) return 'high';
  if (h.deviceMemory >= 4 && h.cores >= 4) return 'medium';
  return 'low';
}

const STORAGE_KEY = 'marisland.quality';

export function loadStoredQuality(): Quality | '' {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    return v === 'low' || v === 'medium' || v === 'high' ? v : '';
  } catch {
    return '';
  }
}

export function storeQuality(q: Quality): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, q);
  } catch {
    /* private mode etc. */
  }
}
