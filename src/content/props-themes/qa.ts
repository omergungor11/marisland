/**
 * qa theme structures (M14b): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/qa.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, windy, noShadow } = PropFlag;

export const QA_PROP_DEFS: readonly PropDef[] = [
  // checkpoint every ~25 u on the ring path: spans ~3 u, so T0 (reads as a red/white tick mark)
  { id: 'barrierGate', geo: 'barrierGate', tier: 0, variants: 2, footprint: 2.0, flags: grounded },
  { id: 'trafficCone', geo: 'trafficCone', tier: 3, variants: 2, footprint: 0.3, flags: grounded },
  {
    id: 'checklistBoard',
    geo: 'checklistBoard',
    tier: 1,
    variants: 2,
    footprint: 1.0,
    flags: grounded,
  },
  // floats: pivot = water level, no contact blob (like buoy)
  { id: 'inspectionBuoy', geo: 'inspectionBuoy', tier: 2, variants: 2, footprint: 0.45, flags: 0 },
  // M17b TASK-401 Test Factory: hangars (9 × 6.5 u, ≈ 7 u to the chimney tops) and the loop track read from T0
  // v1 = hallOfChecks (TASK-424): only where the QA plan pins it, random rolls keep v0
  {
    id: 'testHangar',
    geo: 'testHangar',
    tier: 0,
    variants: 2,
    rollVariants: 1,
    footprint: 3.8,
    flags: grounded,
  },
  // one 2 u bridge segment; a T1 detail (thin), crates ride it (render/movers.ts)
  { id: 'conveyor', geo: 'conveyor', tier: 1, variants: 1, footprint: 0.6, flags: grounded },
  { id: 'testTrack', geo: 'testTrack', tier: 0, variants: 1, footprint: 3.5, flags: grounded },
  // the QA tower: hero landmark (LANDMARK_RENDER.qaTower), ≈ 20 u, the island's one tall vertical
  { id: 'qaTower', geo: 'qaTower', tier: 0, variants: 1, footprint: 1.8, flags: grounded },
];

/**
 * M19 TASK-414 Inspectors' Island kit (geo/themes/culture-qa.ts). Appended to PROP_DEFS AFTER the
 * earlier culture kits (content/props.ts) so no existing defId shifts (world hashes stay put until
 * wave 2 places them). All stay < 3 u tall and < 3 u in one plan extent (no T0 promotion by
 * isLargeStructure); ledger and priority order: content/cultures/qa.ts. Variants of existing defs:
 * testHangar v1 hallOfChecks and terrarium v2 bugZoo are pinned by the QA plan (TASK-424, never
 * rolled); sailboat v3 (inspection boat) stays unplaced until wave 3.
 */
export const QA_CULTURE_PROP_DEFS: readonly PropDef[] = [
  { id: 'dummyBench', geo: 'dummyBench', tier: 2, variants: 1, footprint: 1.0, flags: grounded },
  {
    id: 'inspectionBooth',
    geo: 'inspectionBooth',
    tier: 2,
    variants: 1,
    footprint: 1.8,
    flags: grounded,
  },
  { id: 'uvLampPost', geo: 'uvLampPost', tier: 2, variants: 1, footprint: 0.5, flags: grounded },
  { id: 'scoreboard', geo: 'scoreboard', tier: 2, variants: 2, footprint: 1.3, flags: grounded },
  // tier-3 micro props: no shadow pass (B4)
  {
    id: 'bugJar',
    geo: 'bugJar',
    tier: 3,
    variants: 1,
    footprint: 0.7,
    flags: grounded | noShadow,
  },
  {
    id: 'conePyramid',
    geo: 'conePyramid',
    tier: 3,
    variants: 1,
    footprint: 0.9,
    flags: grounded | noShadow,
  },
  {
    id: 'flagMast',
    geo: 'flagMast',
    tier: 2,
    variants: 1,
    footprint: 0.9,
    flags: grounded | windy,
  },
  {
    id: 'stampDesk',
    geo: 'stampDesk',
    tier: 3,
    variants: 1,
    footprint: 0.9,
    flags: grounded | noShadow,
  },
  {
    id: 'clipboardWall',
    geo: 'clipboardWall',
    tier: 3,
    variants: 1,
    footprint: 1.5,
    flags: grounded | noShadow,
  },
];
