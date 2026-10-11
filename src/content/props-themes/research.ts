/**
 * research theme structures (M14b): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/research.ts (+ campus.ts,
 * science.ts, garden.ts). New defs are appended at the end so existing def indices stay stable.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded } = PropFlag;

export const RESEARCH_PROP_DEFS: readonly PropDef[] = [
  // anemometer rotor spins via aSpin (wind = 0 on all vertices, so not `windy`)
  { id: 'weatherMast', geo: 'weatherMast', tier: 1, variants: 2, footprint: 0.8, flags: grounded },
  // TASK-402a: the summit landmark of Observatory University (~11 u, T0; door + steps on +z)
  { id: 'observatory', geo: 'observatory', tier: 0, variants: 2, footprint: 4.0, flags: grounded },
  // floats: pivot = water level, no contact blob (like buoy)
  { id: 'instrumentBuoy', geo: 'instrumentBuoy', tier: 2, variants: 2, footprint: 0.4, flags: 0 },
  // TASK-400 Biodome Lab: the hero dome is the island's T0 landmark; the small domes read from
  // T0 too (D-031, >= 3 u wide); vent pinwheels spin via aSpin
  { id: 'biodomeHero', geo: 'biodomeHero', tier: 0, variants: 1, footprint: 3.2, flags: grounded },
  { id: 'biodome', geo: 'biodome', tier: 0, variants: 1, footprint: 1.8, flags: grounded },
  // rim outcrops (theme scatter), faintly glowing at night
  {
    id: 'crystalCluster',
    geo: 'crystalCluster',
    tier: 1,
    variants: 1,
    footprint: 0.7,
    flags: grounded,
  },
  // floats at the cove pier: pivot = water level, no contact blob (like instrumentBuoy)
  { id: 'researchVessel', geo: 'researchVessel', tier: 1, variants: 1, footprint: 1.3, flags: 0 },

  // TASK-402a campus buildings (>= 3 u wide read from T0, D-031); door on +z, pivot at the ground
  { id: 'facultyHall', geo: 'facultyHall', tier: 0, variants: 3, footprint: 3.2, flags: grounded },
  {
    id: 'libraryRotunda',
    geo: 'libraryRotunda',
    tier: 0,
    variants: 1,
    footprint: 3.6,
    flags: grounded,
  },
  // slender (2 u) but 9.5 u tall: a T1 silhouette that still reads in the postcard view
  { id: 'campusTower', geo: 'campusTower', tier: 1, variants: 3, footprint: 1.6, flags: grounded },
  { id: 'terrarium', geo: 'terrarium', tier: 0, variants: 2, footprint: 2.6, flags: grounded },
  // sculptures
  {
    id: 'atomSculpture',
    geo: 'atomSculpture',
    tier: 1,
    variants: 1,
    footprint: 1.3,
    flags: grounded,
  },
  { id: 'dnaHelix', geo: 'dnaHelix', tier: 1, variants: 1, footprint: 1.1, flags: grounded },
  {
    id: 'armillarySphere',
    geo: 'armillarySphere',
    tier: 1,
    variants: 1,
    footprint: 1.6,
    flags: grounded,
  },
  {
    id: 'scholarStatue',
    geo: 'scholarStatue',
    tier: 1,
    variants: 2,
    footprint: 1.1,
    flags: grounded,
  },
  {
    id: 'rocketMonument',
    geo: 'rocketMonument',
    tier: 0,
    variants: 1,
    footprint: 1.9,
    flags: grounded,
  },
  // outdoor science: radioDish v0 big (~7.4 u), v1 small (~3.6 u)
  { id: 'radioDish', geo: 'radioDish', tier: 0, variants: 2, footprint: 3.2, flags: grounded },
  { id: 'labPod', geo: 'labPod', tier: 1, variants: 2, footprint: 2.8, flags: grounded },
  // garden kit (flowerBed and bench already exist: HQ defs)
  { id: 'fountain', geo: 'fountain', tier: 1, variants: 1, footprint: 1.9, flags: grounded },
  {
    id: 'hedgeParterre',
    geo: 'hedgeParterre',
    tier: 2,
    variants: 2,
    footprint: 2.4,
    flags: grounded,
  },
  { id: 'topiary', geo: 'topiary', tier: 2, variants: 3, footprint: 0.5, flags: grounded },
  { id: 'pergola', geo: 'pergola', tier: 1, variants: 1, footprint: 2.0, flags: grounded },
];
