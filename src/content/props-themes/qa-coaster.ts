/**
 * QA Thrill Test Park coaster defs (TASK-540, D-120; D-115 plan; geometry geo/themes/qa-coaster.ts,
 * numbers content/themes/qa-coaster.ts). Appended after the M33 Coding block at the end of PROP_DEFS
 * (content/props.ts) so no existing defId shifts. Ledger entries 16-17 of the QA culture
 * (`cultureCapOverride.qa` = { 17, 2 } in budgets.ts): `coasterTrack` is QA's SECOND tier-1 def,
 * `coasterStation` is tier 2. Both are large structures (drawn from T0 by size, D-031).
 *
 * Not defs: the cars (`coasterCar`), riders (`coasterRider`) and bumper cars (`bumperCar`) are geo-only
 * mover meshes (`buildProp(id, seed, variant, lod)`), the TESTED board is `checklistBoard` v2 and the
 * cotton-candy cart `inspectionBooth` v1 (variants of old defs: `rollVariants` keeps their random
 * rolls on the old variants, so no world hash moves).
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded } = PropFlag;

export const QA_COASTER_PROP_DEFS: readonly PropDef[] = [
  // the fixture track (the real spline is built through buildCoasterTrack, render/coaster-track.ts); pivot =
  // site origin. Footprint 0.6, not its 45 u reach: life's solids and edit collisions read it as a disc round the pivot.
  { id: 'coasterTrack', geo: 'coasterTrack', tier: 1, variants: 1, footprint: 0.6, flags: 0 },
  {
    id: 'coasterStation',
    geo: 'coasterStation',
    tier: 2,
    variants: 1,
    footprint: 2.2,
    flags: grounded,
  },
];

/** The coaster showcase (`?gallery=1&ids=qa40`, scripts/gallery-shots.ts). */
export const QA_COASTER_PROP_IDS: readonly string[] = [
  'coasterTrack',
  'coasterStation',
  'coasterCar',
  'coasterRider',
  'bumperCar',
  'checklistBoard',
  'inspectionBooth',
];
