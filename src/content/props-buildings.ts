/**
 * Prop definitions for buildings, coastal, decor and landmarks (ART_BIBLE §5).
 * Merged with `PROP_DEFS` (props.ts) by the content index; same `PropDef` shape.
 * Geometry lives in src/geo (buildings/coastal/decor/landmarks.ts).
 */
import { PropFlag } from '../world/prop-store.ts';
import type { PropDef } from './props.ts';

const { grounded, windy, underwater } = PropFlag;

type T = PropDef['tier'];
const d = (
  id: string,
  tier: T,
  variants: number,
  footprint: number,
  flags: number,
  fade?: [number, number],
  extra: Pick<PropDef, 'lod1' | 'interior'> = {},
): PropDef => ({
  id,
  geo: id,
  tier,
  variants,
  footprint,
  flags,
  ...(fade ? { fade } : {}),
  ...extra,
});

/** Shared far proxy class (geo/offices.ts PROXY): 0 = S, 1 = M, 2 = L, 3 = tower. */
const proxy = (variant: number): Pick<PropDef, 'lod1'> => ({
  lod1: { geo: 'officeLod1', variant },
});

export const PROP_DEFS_BUILDINGS: PropDef[] = [
  // buildings
  d('cottage', 1, 3, 2.1, grounded),
  // stands in shallow water: pivot = water level, so no contact blob
  d('stiltHut', 1, 2, 2.2, 0),
  d('towerHouse', 1, 3, 1.8, grounded),
  // T0: part of the silhouette read at the far tier; blades rotate via wind=2 (not `windy`)
  d('windmill', 0, 2, 2.3, grounded),
  d('barn', 1, 2, 3.4, grounded),
  d('logCabin', 1, 2, 2.5, grounded),
  d('marketStall', 2, 3, 1.3, grounded),
  // coastal
  d('dock', 1, 2, 1.1, grounded),
  d('rowboat', 1, 2, 1.2, grounded),
  d('sailboat', 0, 2, 2.6, windy),
  d('seaStack', 0, 3, 2.6, 0),
  d('buoy', 2, 2, 0.35, 0),
  d('driftwood', 2, 2, 0.8, grounded),
  d('tidePool', 3, 2, 1.1, underwater),
  d('shell', 3, 3, 0.12, grounded),
  d('starfish', 3, 3, 0.12, grounded),
  d('messageBottle', 3, 1, 0.15, grounded),
  // decor
  d('fence', 2, 2, 0.8, grounded),
  d('lanternPost', 2, 3, 0.4, grounded),
  d('laundryLine', 2, 3, 2.0, grounded | windy),
  d('bunting', 2, 3, 3.0, grounded | windy),
  d('bench', 2, 2, 0.7, grounded),
  d('barrel', 2, 2, 0.3, grounded),
  d('crate', 2, 2, 0.4, grounded),
  d('well', 2, 2, 1.0, grounded),
  d('steppingStone', 3, 3, 0.28, grounded),
  // landmarks (T0 read as black shapes; LOD1 keeps the silhouette)
  // variant 2 = broadcast tower / orchestrator tower (themes.landmarkVariant)
  d('lighthouse', 0, 3, 2.4, grounded),
  d('clocktower', 0, 3, 1.9, grounded),
  // canopy carries wind weights (sway); trunk/house stay rigid
  d('giantTree', 0, 2, 3.2, grounded | windy),
  d('sunkenShip', 1, 2, 5.0, underwater),
  d('hotSpring', 1, 1, 3.4, grounded),
  d('volcanoCrater', 0, 1, 5.2, grounded),
  // phase-3 office shells (TASK-303): T1, shared far proxy unless the silhouette is not a box
  // (open pavilions, billboard, mast, stilt hut, kiosk keep their own cheap LOD1)
  d('hqOffice', 1, 2, 3.2, grounded, undefined, proxy(1)),
  d('hqAnnex', 1, 2, 1.8, grounded, undefined, proxy(3)),
  d('meetingPavilion', 1, 2, 2.6, grounded),
  d('coffeeKiosk', 1, 2, 1.3, grounded),
  d('devOffice', 1, 2, 3.6, grounded, undefined, proxy(2)),
  d('devPod', 1, 2, 2.1, grounded, undefined, proxy(0)),
  d('serverShed', 1, 2, 1.9, grounded, undefined, proxy(0)),
  d('broadcastStudio', 1, 2, 2.4, grounded, undefined, proxy(0)),
  d('billboard', 1, 2, 2.0, grounded),
  d('testLab', 1, 2, 2.9, grounded, undefined, proxy(1)),
  d('inspectionTower', 1, 2, 1.7, grounded, undefined, proxy(3)),
  // stands in shallow water like stiltHut: pivot = water level, no contact blob
  d('testLabStilt', 1, 2, 2.1, 0),
  d('atelier', 1, 2, 2.9, grounded, undefined, proxy(1)),
  d('galleryPavilion', 1, 2, 2.6, grounded),
  d('dataCenter', 1, 2, 3.6, grounded, undefined, proxy(2)),
  d('rackShed', 1, 2, 1.9, grounded, undefined, proxy(0)),
  d('antennaMast', 1, 2, 1.2, grounded),
  d('researchHut', 1, 2, 2.1, grounded, undefined, proxy(0)),
  // fixture: decor for the research island
  d('telescope', 2, 2, 0.4, grounded),
  // far proxy geometry (never placed) and the tier-2 interior (never placeable, fades like T2)
  d('officeLod1', 0, 4, 2.5, 0),
  d('officeInterior', 2, 10, 3.0, 0, [120, 160], { interior: true }),
];
