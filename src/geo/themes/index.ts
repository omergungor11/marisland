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

export const THEME_GEO: readonly PropGeoDef[] = [
  ...HQ_GEO,
  ...CODING_GEO,
  ...MARKETING_GEO,
  ...QA_GEO,
  ...DESIGN_GEO,
  ...DEVOPS_GEO,
  ...RESEARCH_GEO,
];
