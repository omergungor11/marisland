/**
 * Marketing "Horseshoe Harbour" kit defs (M52 TASK-660, D-170; geometry geo/themes/hq-horseshoe*.ts,
 * numbers content/themes/hq-horseshoe-look.ts, contract content/themes/hq-horseshoe.ts).
 * Appended at the very end of PROP_DEFS so no existing defId shifts. Three defs, all planner-pinned
 * fixtures (never rolled): the variants are the pieces of MARINA_KIT.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, windy, noShadow } = PropFlag;

export const MARKETING_MARINA_PROP_DEFS: readonly PropDef[] = [
  // 0-5 row houses (restaurant, café, bakery, gelato, souvenirs, chandlery), 6 the mole tower; tier 0:
  // a quay of them is the town, it must read from the far tier (each is also > 3 u tall)
  {
    id: 'quayHouse',
    geo: 'quayHouse',
    tier: 0,
    variants: 7,
    rollVariants: 1,
    footprint: 2.6,
    flags: windy,
  },
  // 0-2 café terraces, 3-5 market stalls (fish, fruit, postcards)
  {
    id: 'quayFurnish',
    geo: 'quayFurnish',
    tier: 2,
    variants: 6,
    rollVariants: 1,
    footprint: 2.0,
    flags: grounded,
  },
  // floating fixtures (FLOATING_FIXTURES): 0 sailing yacht, 1 motor cruiser, 2 day boat, 3 caique,
  // 4 finger pontoon; tier 1 so the moored fleet reads from the town's far views
  {
    id: 'quayBoat',
    geo: 'quayBoat',
    tier: 1,
    variants: 5,
    rollVariants: 1,
    footprint: 2.2,
    flags: windy | noShadow,
  },
];

/** The quay showcase (`?gallery=1&ids=quay`, scripts/gallery-shots.ts). */
export const MARINA_QUAY_PROP_IDS: readonly string[] = ['quayHouse', 'quayFurnish', 'quayBoat'];
