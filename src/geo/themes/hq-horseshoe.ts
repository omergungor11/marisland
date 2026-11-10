/**
 * Marketing "Horseshoe Harbour" kit (M52 TASK-660, D-170): three defs, each with pinned variants
 * (never rolled; the plan places them by content/themes/hq-horseshoe.ts MARINA_KIT):
 *   quayHouse    0-5 row houses, 6 the mole tower            (geo/themes/hq-horseshoe-quay.ts)
 *   quayFurnish  0-2 café terraces, 3-5 market stalls         (hq-horseshoe-furnish.ts)
 *   quayBoat     0-3 moored boats, 4 the finger pontoon      (hq-horseshoe-boats.ts)
 * Defs: content/props-themes/hq-horseshoe.ts. Numbers: content/themes/hq-horseshoe-look.ts.
 */
import type { PropGeoDef } from '../types.ts';
import { MARINA_BOATS_GEO } from './hq-horseshoe-boats.ts';
import { MARINA_FURNISH_GEO } from './hq-horseshoe-furnish.ts';
import { MARINA_QUAY_GEO } from './hq-horseshoe-quay.ts';

export const MARKETING_MARINA_GEO: readonly PropGeoDef[] = [
  ...MARINA_QUAY_GEO,
  ...MARINA_FURNISH_GEO,
  ...MARINA_BOATS_GEO,
];
