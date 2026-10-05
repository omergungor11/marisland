/**
 * Phase 3 office palette (TASK-303): per-theme wall / roof / trim sets (2 variants each) and the
 * shared interior + screen tints. Accents come from THEMES[theme].accent; nothing here is logic.
 * Neutral tones are ART_BIBLE §2 hexes (WALLS / ROCK / WOOD); screens stay cool-white so the night
 * grade (which spares by hue) keeps them readable.
 */
import type { ThemeId } from '../world/types.ts';

export interface OfficePal {
  wall: string;
  roof: string;
  trim: string;
}

/** Index = geometry variant. */
export const OFFICE_PAL: Readonly<Record<ThemeId, readonly [OfficePal, OfficePal]>> = {
  hq: [
    { wall: '#FFF4E0', roof: '#E8735A', trim: '#FAFAF5' },
    { wall: '#FAFAF5', roof: '#F09A7E', trim: '#E8735A' },
  ],
  coding: [
    { wall: '#EAF1FA', roof: '#4479C9', trim: '#5B9BE6' },
    { wall: '#FAFAF5', roof: '#5B9BE6', trim: '#4479C9' },
  ],
  marketing: [
    { wall: '#FFD9D2', roof: '#E35D6A', trim: '#FAFAF5' },
    { wall: '#FFF4E0', roof: '#C9465A', trim: '#FFD9D2' },
  ],
  qa: [
    { wall: '#FAFAF5', roof: '#3FBF8F', trim: '#2E9E74' },
    { wall: '#E6F7EE', roof: '#7FD8B3', trim: '#2E9E74' },
  ],
  design: [
    { wall: '#FFF0B8', roof: '#B07CE0', trim: '#9260C4' },
    { wall: '#FFD9D2', roof: '#C9A2EC', trim: '#9260C4' },
  ],
  devops: [
    { wall: '#B4B9C4', roof: '#E5822A', trim: '#FF9F43' },
    { wall: '#CFD3DB', roof: '#FFBC78', trim: '#E5822A' },
  ],
  research: [
    { wall: '#FFF4E0', roof: '#4FC3C9', trim: '#D2A679' },
    { wall: '#E6F7F7', roof: '#86D9DD', trim: '#A8754F' },
  ],
};

export const OFFICE_COLORS = {
  /** Interior wall faces. */
  inner: '#F3EBDD',
  /** Interior / plinth floor slab. */
  floor: '#CDAE86',
  plinth: '#A9AEB8',
  /** Desk, shelf, bench wood. */
  desk: '#D2A679',
  deskDark: '#A8754F',
  chair: '#6F7685',
  /** Screen faces (emissive 2): cool-white with a hint of the theme accent added in code. */
  screen: '#BFE6FF',
  screenWarm: '#FFE9B8',
  bezel: '#3A3F4D',
  steel: '#6F7685',
  steelLight: '#A9AEB8',
  dark: '#4F4A5E',
  glass: '#CFEFFF',
  led: ['#7CFFB0', '#FFC870', '#7CC4FF'],
  plant: '#5DBB63',
  plantDark: '#3E9A52',
  pot: '#E8735A',
  cone: '#FF8A3D',
  white: '#FAFAF5',
  red: '#E35D6A',
  gold: '#F5C84C',
  solar: '#335A9C',
  solarLine: '#6FA0E0',
  /** ON AIR lamp. */
  onAir: '#FF4A4A',
} as const;
