/**
 * Theme structure geometry (M14b): one module per theme, concatenated in fixed theme order
 * (THEME_IDS) and registered by geo/registry.ts after the built-in defs.
 */
import type { PropGeoDef } from '../types.ts';
import { HQ_GEO } from './hq.ts';
import { CODING_GEO } from './coding.ts';
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

export const THEME_GEO: readonly PropGeoDef[] = [
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
  ...RESEARCH_CULTURE_GEO,
];
