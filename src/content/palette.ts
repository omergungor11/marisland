/**
 * ART_BIBLE §2 palette as data. Hex strings; the render layer converts to linear.
 * Nothing in here is logic.
 */
export const WATER = {
  deep: '#1E5FA8',
  mid: '#2A8FC9',
  shallow: '#4FD1D9',
  lagoon: '#8EEBE0',
  foam: '#F4FFFC',
} as const;

/** Water band distances from shore in u (ART_BIBLE §2). */
export const WATER_BANDS = {
  lagoonMax: 3,
  shallowMax: 12,
  midMax: 35,
  foamLine: [0.4, 0.8] as const,
  /** Shallow ring is 1.5× wider on the leeward side of the wind. */
  leewardRingScale: 1.5,
} as const;

export const SAND = { dry: '#F7E1AE', wet: '#E3BE84', black: '#5B5566' } as const;
export const GRASS = ['#C9E86F', '#A6DB5E', '#7BC950', '#5FAE45'] as const; // tips → shade
export const FLOWERS = ['#FF8FB1', '#FFE45C', '#FFFFFF', '#B39DFF', '#FF7A5C'] as const;
export const ROCK = ['#A9AEB8', '#8A909C', '#666C7A'] as const;
export const CLIFF_STRATA = ['#D9B48F', '#C29A74'] as const;
export const FOLIAGE = {
  deciduous: ['#8FD16A', '#5DBB63', '#3E9A52'],
  pine: ['#3C8F68', '#2F7D5B'],
  palm: ['#7FD34E', '#5DB33C'],
} as const;
export const WOOD = {
  planks: '#D2A679',
  logs: '#A8754F',
  dark: '#8A5A3B',
  dock: '#B59B7E',
} as const;
export const WALLS = ['#FFF4E0', '#FAFAF5', '#FFD9D2', '#FFF0B8'] as const;
export const ROOFS = [
  '#E8735A',
  '#E35D6A',
  '#3FB8AF',
  '#F5C84C',
  '#9C8CE0',
  '#5DA9E9',
  '#7FD8B3',
] as const;
export const EMISSIVE = {
  window: '#FFC870',
  lantern: '#FFB347',
  lava: '#FF6A3D',
  firefly: '#E8FF8A',
} as const;
export const HAY = '#F2C46B';
export const MUSHROOM_CAP = '#E35D6A';
export const HOT_SPRING = '#9FE6E0';
export const CLOUD = {
  top: '#FFFFFF',
  belly: '#DDE6F5',
  bellyNight: '#3A4577',
  intro: '#FFF3DA',
} as const;
export const SPARKLE = '#FFF6C2';

/** Time-of-day keys (ART_BIBLE §2). Hours are game hours. */
export interface EnvKey {
  hour: number;
  zenith: string;
  horizon: string;
  sun: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  fog: string;
  shadowTint: string;
  /** 0 = day, 1 = full night (emissives on, stars). */
  night: number;
}

export const ENV_KEYS: readonly EnvKey[] = [
  {
    hour: 5.5,
    zenith: '#7C8FD6',
    horizon: '#FFC2A8',
    sun: '#FFD2A1',
    sunIntensity: 1.6,
    hemiSky: '#B9C3F0',
    hemiGround: '#C9A98E',
    fog: '#F2C9C0',
    shadowTint: '#6B5BA8',
    night: 0.15,
  },
  {
    hour: 7.0,
    zenith: '#5CB8F2',
    horizon: '#CDEFFF',
    sun: '#FFF6E5',
    sunIntensity: 3.0,
    hemiSky: '#CFEAFF',
    hemiGround: '#B9D08A',
    fog: '#D6EEF7',
    shadowTint: '#5A6FB0',
    night: 0,
  },
  {
    hour: 16.5,
    zenith: '#5CB8F2',
    horizon: '#CDEFFF',
    sun: '#FFF6E5',
    sunIntensity: 3.0,
    hemiSky: '#CFEAFF',
    hemiGround: '#B9D08A',
    fog: '#D6EEF7',
    shadowTint: '#5A6FB0',
    night: 0,
  },
  {
    hour: 17.5,
    zenith: '#6FA6E0',
    horizon: '#FFD08A',
    sun: '#FFB866',
    sunIntensity: 2.4,
    hemiSky: '#C9D6F0',
    hemiGround: '#D9B27A',
    fog: '#F6DDB0',
    shadowTint: '#6A58A6',
    night: 0,
  },
  {
    hour: 19.25,
    zenith: '#3E4C9A',
    horizon: '#FF9A8B',
    sun: '#FF8A70',
    sunIntensity: 1.0,
    hemiSky: '#8E8FD0',
    hemiGround: '#A07A8A',
    fog: '#C792A8',
    shadowTint: '#4C3F8C',
    night: 0.5,
  },
  {
    hour: 20.5,
    zenith: '#141C3D',
    horizon: '#2E3A6E',
    sun: '#BFD4FF',
    sunIntensity: 0.6,
    hemiSky: '#4A5A9A',
    hemiGround: '#2E3350',
    fog: '#26305A',
    shadowTint: '#2A2A5E',
    night: 1,
  },
  {
    hour: 29.0,
    zenith: '#141C3D',
    horizon: '#2E3A6E',
    sun: '#BFD4FF',
    sunIntensity: 0.6,
    hemiSky: '#4A5A9A',
    hemiGround: '#2E3350',
    fog: '#26305A',
    shadowTint: '#2A2A5E',
    night: 1,
  }, // 05:00 next day
];

export const WEATHER_PRESETS = {
  clear: { saturation: 0, fogScale: 1, sky: '', cloudCover: 0.35, gust: 1 },
  cloudy: { saturation: -0.15, fogScale: 1.15, sky: '#A9C3D9', cloudCover: 0.75, gust: 1.2 },
  rain: {
    saturation: -0.2,
    fogScale: 1.8,
    sky: '#9FB4C7',
    cloudCover: 0.9,
    gust: 1.4,
    fog: '#9FB4C7',
  },
  fog: {
    saturation: -0.05,
    fogScale: 1.3,
    sky: '',
    cloudCover: 0.4,
    gust: 0.6,
    mist: { yMax: 6, color: '#F2EFEA' },
  },
} as const;

/** Lighting constants (ART_BIBLE §3). */
export const LIGHTING = {
  shadowPenumbra: 0.3,
  shadowDarken: 0.6,
  shadowTintMix: 0.35,
  minShadowL: 0.25,
  rim: 0.15,
  fogAt: [
    [200, 0.1],
    [700, 0.45],
    [1200, 0.75],
  ] as const,
  bloom: { threshold: 0.9, strength: 0.6, radius: 0.4 },
  vignette: { intensity: 0.22, softness: 0.6, color: '#2A2350' },
  grade: { saturation: 0.04, goldenWarm: 0.06 },
  tiltShift: [
    { band: 0, blur: 0 },
    { band: 0.15, blur: 2 },
    { band: 0.2, blur: 4 },
    { band: 0, blur: 6, dof: true },
  ] as const,
  /** Land never darker than this luminance (0–1). */
  minLandL: 0.12,
} as const;

export const UI = {
  surface: '#FFF8EC',
  ink: '#3B3A5A',
  primary: '#FF8A65',
  secondary: '#4FC3C9',
  muted: '#B8B3C9',
  loadingGradient: ['#BFE9F2', '#FFF3DA'],
} as const;
