/**
 * qa theme structures (M14b): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/qa.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded } = PropFlag;

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
  { id: 'testHangar', geo: 'testHangar', tier: 0, variants: 1, footprint: 3.8, flags: grounded },
  // one 2 u bridge segment; a T1 detail (thin), crates ride it (render/movers.ts)
  { id: 'conveyor', geo: 'conveyor', tier: 1, variants: 1, footprint: 0.6, flags: grounded },
  { id: 'testTrack', geo: 'testTrack', tier: 0, variants: 1, footprint: 3.5, flags: grounded },
  // the QA tower: hero landmark (LANDMARK_RENDER.qaTower), ≈ 20 u, the island's one tall vertical
  { id: 'qaTower', geo: 'qaTower', tier: 0, variants: 1, footprint: 1.8, flags: grounded },
];
