/**
 * Marketing "Deniz Üstü Lunapark" kit defs (M53 TASK-670, D-172; geometry geo/themes/marketing-luna*.ts,
 * numbers content/themes/marketing-luna-look.ts, contract content/themes/marketing-luna.ts). Appended at
 * the very end of PROP_DEFS so no existing defId shifts. Six defs, all planner-pinned fixtures (never
 * rolled): the variants are the pieces of LUNA_KIT. The moving parts (swing top, drop car, carousel
 * top, worm train, bumper boats) are geo-only mover meshes like the QA coaster car: no PropDef.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, noShadow } = PropFlag;

export const MARKETING_LUNA_PROP_DEFS: readonly PropDef[] = [
  // 0-2 the ring platform (30 x 22, 36 x 26, 42 x 30 u); a floating fixture (FLOATING_FIXTURES), pivot on the
  // water. Footprint 0.6, not its reach: life's solids and edit collisions read a disc round the pivot. No shadow
  // pass (it sits over the water; the draw budget).
  {
    id: 'lunaDeck',
    geo: 'lunaDeck',
    tier: 0,
    variants: 3,
    rollVariants: 1,
    footprint: 0.6,
    flags: noShadow,
  },
  // 0 chain swing, 1 drop tower, 2 carousel (static bases, pivot on the plank top); large by size, so from T0
  {
    id: 'lunaRide',
    geo: 'lunaRide',
    tier: 0,
    variants: 3,
    rollVariants: 1,
    footprint: 3.6,
    flags: 0,
  },
  // 0-2 the mini coaster loop (14 / 20 / 26 u), pivot on the plank top at the loop's centre; thin rails, no shadow pass
  {
    id: 'lunaCoaster',
    geo: 'lunaCoaster',
    tier: 0,
    variants: 3,
    rollVariants: 1,
    footprint: 0.6,
    flags: noShadow,
  },
  // the neon sign gate at the pier mouth
  {
    id: 'lunaGate',
    geo: 'lunaGate',
    tier: 0,
    variants: 1,
    rollVariants: 1,
    footprint: 1.2,
    flags: 0,
  },
  // 0 ticket booth, 1 cotton candy, 2 popcorn, 3 ice cream, 4 prize stall: tier 2, all under 3 u tall, no shadow pass (park draw budget)
  {
    id: 'lunaStand',
    geo: 'lunaStand',
    tier: 2,
    variants: 5,
    rollVariants: 1,
    footprint: 1.3,
    flags: grounded | noShadow,
  },
  // 0 balloon bunch, 1 bench, 2 queue rail, 3 string-bulb post: tier 2, micro (no shadow pass)
  {
    id: 'lunaDecor',
    geo: 'lunaDecor',
    tier: 2,
    variants: 4,
    rollVariants: 1,
    footprint: 0.7,
    flags: grounded | noShadow,
  },
];

/**
 * The fun park showcase (`?gallery=1&ids=luna`, scripts/gallery-shots.ts). The geo-only movers hang under
 * their axis pivot (the sand floor would hide them): `lunaPose` shows each with its base.
 */
export const LUNA_PROP_IDS: readonly string[] = [
  'lunaPose',
  'lunaDeck',
  'lunaRide',
  'lunaCoaster',
  'lunaTrain',
  'lunaBoat',
  'lunaGate',
  'lunaStand',
  'lunaDecor',
];
