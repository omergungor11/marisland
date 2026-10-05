/**
 * devops theme structures (M14b, TASK-376): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/devops.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import { OFFICE_PAL } from '../palette-offices.ts';
import { THEMES } from '../themes/index.ts';
import type { PropDef } from '../props.ts';

const { grounded } = PropFlag;

export const DEVOPS_COLORS = {
  /** Cooling tower concrete (OFFICE_PAL.devops wall family) + rim / band accent. */
  concrete: OFFICE_PAL.devops[1].wall,
  concreteDark: OFFICE_PAL.devops[0].wall,
  accent: THEMES.devops.accent,
  accentDeep: OFFICE_PAL.devops[0].roof,
  /** Pipe body steel, flange, support. */
  pipe: '#C4C9D3',
  flange: '#8A909C',
  support: '#6F7685',
  valve: '#E35D6A',
  basalt: '#4F4C57',
  basaltLight: '#6A6676',
  dark: '#3A3F4D',
  /** Safety yellow + black stripe (warning sign). */
  hazard: '#F5C84C',
  hazardBlack: '#3A3F4D',
  spoolWood: '#D2A679',
  spoolWoodDark: '#A8754F',
  cable: '#FF9F43',
  cableBlack: '#4F4A5E',
  rack: '#B4B9C4',
  rackDark: '#6F7685',
  led: ['#7CFFB0', '#FFC870', '#7CC4FF'],
  lamp: '#FF5A4A',
} as const;

/** Cooling tower nominal heights per variant (u). */
export const COOLING_TOWER_HEIGHTS = [8, 7] as const;

export const DEVOPS_PROP_DEFS: readonly PropDef[] = [
  // T0 geothermal plant landmark: hyperboloid tower, steam emitter above the lip
  {
    id: 'coolingTower',
    geo: 'coolingTower',
    tier: 0,
    variants: 2,
    footprint: 2.6,
    flags: grounded,
  },
  { id: 'pipe', geo: 'pipe', tier: 2, variants: 3, footprint: 1.0, flags: grounded },
  { id: 'cableSpool', geo: 'cableSpool', tier: 2, variants: 2, footprint: 0.7, flags: grounded },
  { id: 'steamVent', geo: 'steamVent', tier: 2, variants: 2, footprint: 0.5, flags: grounded },
  { id: 'warningSign', geo: 'warningSign', tier: 3, variants: 2, footprint: 0.4, flags: grounded },
  {
    id: 'basaltBoulder',
    geo: 'basaltBoulder',
    tier: 1,
    variants: 3,
    footprint: 1.2,
    flags: grounded,
  },
  { id: 'rackRow', geo: 'rackRow', tier: 2, variants: 2, footprint: 1.6, flags: grounded },
];
