/** Theme → settlement planner (M14b). Dispatched by buildSettlements (TASK-361). */
import type { ThemeId } from '../../types.ts';
import type { ThemePlanner } from './types.ts';
import { planHq } from './hq.ts';
import { planCoding } from './coding.ts';
import { planMarketing } from './marketing.ts';
import { planQa } from './qa.ts';
import { planDesign } from './design.ts';
import { planDevops } from './devops.ts';
import { planResearch } from './research.ts';

export type { ThemePlanArgs, ThemePlanner } from './types.ts';

export const THEME_PLANNERS: Readonly<Record<ThemeId, ThemePlanner>> = {
  hq: planHq,
  coding: planCoding,
  marketing: planMarketing,
  qa: planQa,
  design: planDesign,
  devops: planDevops,
  research: planResearch,
};
