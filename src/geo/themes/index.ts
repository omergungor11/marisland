/**
 * Theme structure geometry (M14b): one module per theme, concatenated in fixed theme order
 * (THEME_IDS) and registered by geo/registry.ts after the built-in defs.
 */
import type { PropGeoDef } from '../types.ts';
import { HQ_GEO } from './hq.ts';
import { CODING_GEO } from './coding.ts';
import { CODING_M22_GEO } from './culture-coding-m22.ts';
import { MARKETING_GEO } from './marketing.ts';
import { QA_GEO } from './qa.ts';
import { DESIGN_GEO } from './design.ts';
import { DEVOPS_GEO } from './devops.ts';
import { RESEARCH_GEO } from './research.ts';
import { SIGNAGE_GEO } from './signage.ts';
import { CULTURE_HQ_GEO } from './culture-hq.ts';
import { MARKETING_CULTURE_GEO } from './culture-marketing.ts';
import { CULTURE_QA_GEO, withBugZoo } from './culture-qa.ts';
import { CULTURE_DESIGN_GEO } from './culture-design.ts';
import { RESEARCH_CULTURE_GEO } from './culture-research.ts';
import { M20_HQ_GEO } from './culture-m20-hq.ts';
import { M20_DESIGN_GEO } from './culture-m20-design.ts';
import { RIM_GEO } from './rim.ts';
import { STAIR_GEO } from './stairs.ts';
import { BEACON_GEO } from './beacon.ts';
import { QA_PROVING_GEO } from './qa-proving.ts';
import { QA_CUSTOMS_GEO } from './qa-customs.ts';
import { CODING_TUNNEL_GEO } from './coding-tunnel.ts';
import { HQ_MARINA_GEO } from './hq-marina.ts';
import { DEVOPS_M26_GEO } from './devops-m26.ts';
import { RESEARCH_M28_GEO, withRimDeck } from './research-m28.ts';
import { MARKETING_M27_GEO, withCableCar, withGuyedMast, withSeaSigns } from './marketing-m27.ts';
import { DEVOPS_M25_GEO, withOnsenStilts, withOrePylons, withSmithStall } from './devops-m25.ts';
import { THEME_IDS } from '../../world/types.ts';

/** M25 (TASK-504, D-084): extra variants of older defs (onsenHouse 1-2, goodsStall 7, mailLine 2-3). */
const m25Variants = (d: PropGeoDef): PropGeoDef =>
  d.id === 'onsenHouse'
    ? withOnsenStilts(d)
    : d.id === 'goodsStall'
      ? withSmithStall(d, THEME_IDS.indexOf('devops'))
      : d.id === 'mailLine'
        ? withCableCar(withOrePylons(d))
        : d.id === 'billboardV2'
          ? withSeaSigns(d)
          : d.id === 'antennaTower'
            ? withGuyedMast(d)
            : d;

const BASE_THEME_GEO: readonly PropGeoDef[] = [
  ...HQ_GEO,
  ...CODING_GEO,
  ...MARKETING_GEO,
  ...QA_GEO,
  ...DESIGN_GEO,
  ...DEVOPS_GEO,
  // M19 culture variants of existing defs wrap the def in place (terrarium v2 = Bug Zoo, TASK-414)
  ...RESEARCH_GEO.map((d) => (d.id === 'terrarium' ? withBugZoo(d) : d)),
  ...SIGNAGE_GEO,
  ...CULTURE_HQ_GEO,
  ...MARKETING_CULTURE_GEO,
  ...CULTURE_QA_GEO,
  ...CULTURE_DESIGN_GEO,
  ...RESEARCH_CULTURE_GEO.map((d) => (d.id === 'tripodTelescope' ? withRimDeck(d) : d)),
  // M20 (D-057) HQ and Design kits
  ...M20_HQ_GEO,
  ...M20_DESIGN_GEO,
  // M22 (TASK-480) shared rim walkway post
  ...RIM_GEO,
  // M22 Coding quick wins: windsock, fairyWreath
  ...CODING_M22_GEO,
  // TASK-485 stair flights
  ...STAIR_GEO,
  // M23 TASK-490 skerry beacon
  ...BEACON_GEO,
  // M24 TASK-499 QA Proving Grounds
  ...QA_PROVING_GEO,
  // M30 TASK-506 QA Customs Port
  ...QA_CUSTOMS_GEO,
  // M29 TASK-505 HQ yacht marina + star fort
  ...HQ_MARINA_GEO,
  // === TASK-498 (M24): Coding wind tunnel + tunnel fan ===
  ...CODING_TUNNEL_GEO,
];

export const THEME_GEO: readonly PropGeoDef[] = [
  ...BASE_THEME_GEO.map(m25Variants),
  // M25 TASK-504 DevOps funicular, geyser cone, ore bucket
  ...DEVOPS_M25_GEO,
  // M26 TASK-509b DevOps ember bridge, crater deck, glass kiln, obsidian decor, breakwater
  ...DEVOPS_M26_GEO,
  // M27 TASK-517 Marketing dive tower
  ...MARKETING_M27_GEO,
  // M28 TASK-525 Research sundial
  ...RESEARCH_M28_GEO,
];
