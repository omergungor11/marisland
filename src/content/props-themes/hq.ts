/**
 * hq theme structures (M14b): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/hq.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, windy, noShadow } = PropFlag;

export const HQ_PROP_DEFS: readonly PropDef[] = [
  // T0 like every structure >= 3 u (D-031): stands in shallow water at the pier, pivot = water level
  { id: 'ferryOffice', geo: 'ferryOffice', tier: 0, variants: 2, footprint: 2.2, flags: windy },
  { id: 'banner', geo: 'banner', tier: 1, variants: 2, footprint: 0.5, flags: grounded | windy },
  // also the Design island's decor bed (themes/design.ts decor list): v1 = wildflower mix
  {
    id: 'flowerBed',
    geo: 'flowerBed',
    tier: 2,
    variants: 3,
    footprint: 0.9,
    flags: grounded | windy,
  },
];

/**
 * M19 TASK-410 Harbour Guild kit (geo/themes/culture-hq.ts). Appended to PROP_DEFS AFTER the
 * signage kit (content/props.ts) so no existing defId shifts (world hashes stay put until wave 2
 * places them). All stay < 3 u tall (no T0 promotion by isLargeStructure); ledger and priority
 * order: content/cultures/hq.ts.
 */
export const HQ_CULTURE_PROP_DEFS: readonly PropDef[] = [
  {
    id: 'ferryAwning',
    geo: 'ferryAwning',
    tier: 2,
    variants: 2,
    footprint: 2.1,
    flags: grounded | windy,
  },
  {
    id: 'guildNoticeBoard',
    geo: 'guildNoticeBoard',
    tier: 2,
    variants: 2,
    footprint: 1.7,
    flags: grounded | windy,
  },
  {
    id: 'timetableBoard',
    geo: 'timetableBoard',
    tier: 2,
    variants: 2,
    footprint: 1.1,
    flags: grounded,
  },
  { id: 'bellPost', geo: 'bellPost', tier: 2, variants: 2, footprint: 0.9, flags: grounded },
  {
    id: 'harbourCrane',
    geo: 'harbourCrane',
    tier: 2,
    variants: 2,
    footprint: 1.5,
    flags: grounded,
  },
  { id: 'coffeeCart', geo: 'coffeeCart', tier: 2, variants: 2, footprint: 1.2, flags: grounded },
  // tier-3 micro props: no shadow pass (B4)
  {
    id: 'gullPerch',
    geo: 'gullPerch',
    tier: 3,
    variants: 2,
    footprint: 0.6,
    flags: grounded | noShadow,
  },
  {
    id: 'mailbag',
    geo: 'mailbag',
    tier: 3,
    variants: 2,
    footprint: 0.8,
    flags: grounded | noShadow,
  },
];
