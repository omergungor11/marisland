/**
 * Prop definitions for buildings, coastal, decor and landmarks (ART_BIBLE §5).
 * Merged with `PROP_DEFS` (props.ts) by the content index; same `PropDef` shape.
 * Geometry lives in src/geo (buildings/coastal/decor/landmarks.ts).
 */
import { PropFlag } from '../world/prop-store.ts';
import type { PropDef } from './props.ts';

const { grounded, windy, underwater, noShadow } = PropFlag;

type T = PropDef['tier'];
const d = (
  id: string,
  tier: T,
  variants: number,
  footprint: number,
  flags: number,
  fade?: [number, number],
  extra: Pick<PropDef, 'interior' | 'rollVariants'> = {},
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
  d('sailboat', 0, 5, 2.6, windy, undefined, { rollVariants: 2 }),
  // variant 3 = the arch (TASK-474 seamarks)
  d('seaStack', 0, 4, 2.6, 0, undefined, { rollVariants: 3 }),
  // T0: the channel buoys (variants 1 red / 2 green, TASK-474) read as night light lines from the
  // overview; `windy` = the gentle bob; rolls stay on the harbour buoy (variant 0)
  d('buoy', 0, 3, 0.35, windy | noShadow, undefined, { rollVariants: 1 }),
  d('driftwood', 2, 2, 0.8, grounded),
  d('tidePool', 3, 2, 1.1, underwater),
  d('shell', 3, 3, 0.12, grounded),
  d('starfish', 3, 3, 0.12, grounded),
  d('messageBottle', 3, 1, 0.15, grounded),
  // decor
  d('fence', 2, 2, 0.8, grounded),
  d('lanternPost', 2, 3, 0.4, grounded),
  d('laundryLine', 2, 3, 2.0, grounded | windy),
  // v3 = Design glass chime line (TASK-425): only where the Design plan pins it
  d('bunting', 2, 4, 3.0, grounded | windy, undefined, { rollVariants: 3 }),
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
  // v3 = canopy vitray (TASK-425): the Atelier Tree (THEMES.design.landmarkVariant)
  d('giantTree', 0, 4, 3.2, grounded | windy, undefined, { rollVariants: 3 }),
  d('sunkenShip', 1, 2, 5.0, underwater),
  d('hotSpring', 1, 1, 3.4, grounded),
  d('volcanoCrater', 0, 1, 5.2, grounded),
  // phase-3 office shells (TASK-303): tier 0 since M14b (TASK-378, D-031/D-032): every shell has its own
  // coloured LOD1 built from its LOD0 palette (geo/offices.ts), so no shared `lod1` proxy any more
  // v2 arcade, v3 bell niche + balcony (TASK-466): v3 far proxy = v1 (geo registry lod1Of)
  d('hqOffice', 0, 4, 3.2, grounded),
  // v2 = Harbour Guild hall (TASK-420): only where the HQ plan pins it
  d('hqAnnex', 0, 3, 1.8, grounded, undefined, { rollVariants: 2 }),
  d('meetingPavilion', 0, 2, 2.6, grounded),
  d('coffeeKiosk', 0, 2, 1.3, grounded),
  d('devOffice', 0, 2, 3.6, grounded),
  d('devPod', 0, 2, 2.1, grounded),
  d('serverShed', 0, 2, 1.9, grounded),
  d('broadcastStudio', 0, 2, 2.4, grounded),
  d('billboard', 0, 2, 2.0, grounded),
  d('testLab', 0, 2, 2.9, grounded),
  d('inspectionTower', 0, 2, 1.7, grounded),
  // stands in shallow water like stiltHut: pivot = water level, no contact blob
  d('testLabStilt', 0, 2, 2.1, 0),
  d('atelier', 0, 2, 2.9, grounded),
  // v2 = glass roof (TASK-425): only the gallery the Design plan pins
  d('galleryPavilion', 0, 3, 2.6, grounded, undefined, { rollVariants: 2 }),
  d('dataCenter', 0, 2, 3.6, grounded),
  d('rackShed', 0, 2, 1.9, grounded),
  d('antennaMast', 0, 2, 1.2, grounded),
  d('researchHut', 0, 2, 2.1, grounded),
  // fixture: decor for the research island
  d('telescope', 2, 2, 0.4, grounded),
  // officeLod1: retired shared proxy (D-032), geometry kept but unused; officeInterior: the tier-2 interior
  // (never placeable, fades like T2)
  d('officeLod1', 0, 4, 2.5, 0),
  d('officeInterior', 2, 10, 3.0, 0, [120, 160], { interior: true }),
];
