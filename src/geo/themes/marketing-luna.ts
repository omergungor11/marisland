/**
 * Marketing "Deniz Üstü Lunapark" kit (M53 TASK-670, D-172): the sea-top fun park beside the Carnival
 * Pier. Defs with pinned variants (never rolled; placed by content/themes/marketing-luna.ts LUNA_KIT):
 *   lunaDeck     0-2 the ring platform on piles, three sizes      (geo/themes/marketing-luna-deck.ts)
 *   lunaRide     0 chain swing, 1 drop tower, 2 carousel (static bases)   (marketing-luna-rides.ts)
 *   lunaCoaster  0-2 the mini coaster loop, three lengths          (marketing-luna-coaster.ts)
 *   lunaGate     the neon sign gate                                 (marketing-luna-stands.ts)
 *   lunaStand    0 ticket booth, 1-3 food carts, 4 prize stall      (marketing-luna-stands.ts)
 *   lunaDecor    0 balloons, 1 bench, 2 queue rail, 3 bulb post     (marketing-luna-stands.ts)
 * Geo-only movers (no PropDef; the motion task poses them): lunaSwingTop, lunaDropCar,
 * lunaCarouselTop, lunaTrain, lunaBoat. The wheel is the land fair's `ferrisWheel`. `lunaPose` is a
 * gallery-only assembly of the above. Defs: content/props-themes/marketing-luna.ts.
 */
import type { PropGeoDef } from '../types.ts';
import { LUNA_COASTER_GEO } from './marketing-luna-coaster.ts';
import { LUNA_DECK_GEO } from './marketing-luna-deck.ts';
import { LUNA_POSE_GEO } from './marketing-luna-pose.ts';
import { LUNA_RIDES_GEO } from './marketing-luna-rides.ts';
import { LUNA_STANDS_GEO } from './marketing-luna-stands.ts';

export const MARKETING_LUNA_GEO: readonly PropGeoDef[] = [
  ...LUNA_DECK_GEO,
  ...LUNA_RIDES_GEO,
  ...LUNA_COASTER_GEO,
  ...LUNA_STANDS_GEO,
  ...LUNA_POSE_GEO,
];
