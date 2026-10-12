import type { ThemeId } from '../../world/types.ts';
import { HQ_CULTURE } from './hq.ts';
import { CODING_CULTURE } from './coding.ts';
import { MARKETING_CULTURE } from './marketing.ts';
import { QA_CULTURE } from './qa.ts';
import { DESIGN_CULTURE } from './design.ts';
import { DEVOPS_CULTURE } from './devops.ts';
import { RESEARCH_CULTURE } from './research.ts';
import type { CultureDef } from './types.ts';

export type * from './types.ts';

/** One culture per department theme (M19). */
export const CULTURES: Record<ThemeId, CultureDef> = {
  hq: HQ_CULTURE,
  coding: CODING_CULTURE,
  marketing: MARKETING_CULTURE,
  qa: QA_CULTURE,
  design: DESIGN_CULTURE,
  devops: DEVOPS_CULTURE,
  research: RESEARCH_CULTURE,
};
