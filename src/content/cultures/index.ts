import type { ThemeId } from '../../world/types.ts';
import { HQ_CULTURE } from './hq.ts';
import { CODING_CULTURE } from './coding.ts';
import { MARKETING_CULTURE } from './marketing.ts';
import { QA_CULTURE } from './qa.ts';
import { DESIGN_CULTURE } from './design.ts';
import { DEVOPS_CULTURE } from './devops.ts';
import { RESEARCH_CULTURE } from './research.ts';
import { CULTURE_RHYTHM } from './rhythm.ts';
import type { CultureDef } from './types.ts';

export type * from './types.ts';

/** The theme's daily rhythm slots come from the culture clock table (rhythm.ts, TASK-430). */
const withRhythm = (c: CultureDef): CultureDef => ({
  ...c,
  rhythm: CULTURE_RHYTHM[c.theme].slots,
});

/** One culture per department theme (M19). */
export const CULTURES: Record<ThemeId, CultureDef> = {
  hq: withRhythm(HQ_CULTURE),
  coding: withRhythm(CODING_CULTURE),
  marketing: withRhythm(MARKETING_CULTURE),
  qa: withRhythm(QA_CULTURE),
  design: withRhythm(DESIGN_CULTURE),
  devops: withRhythm(DEVOPS_CULTURE),
  research: withRhythm(RESEARCH_CULTURE),
};
